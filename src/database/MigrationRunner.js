const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

/**
 * Enhanced Database Migration System
 * Provides enterprise-grade migration management with:
 * - Versioned migrations with rollback support
 * - Dependency management between migrations
 * - Migration validation and integrity checks
 * - Concurrent execution control
 * - Migration history and auditing
 * - Dry-run mode and preview capabilities
 */
class MigrationRunner extends EventEmitter {
  constructor(connectionPool, options = {}) {
    super();
    
    this.connectionPool = connectionPool;
    this.options = {
      migrationsPath: options.migrationsPath || './migrations',
      tableName: options.tableName || 'schema_migrations',
      autoRun: options.autoRun || false,
      lockTimeout: options.lockTimeout || 30000,
      enableChecksums: options.enableChecksums !== false,
      enableBackup: options.enableBackup !== false,
      concurrentMigrations: options.concurrentMigrations || false,
      rollbackOnFailure: options.rollbackOnFailure !== false,
      ...options
    };
    
    this.migrations = new Map();
    this.migrationHistory = [];
    this.isInitialized = false;
    this.isLocked = false;
  }
  
  /**
   * Initialize the migration runner
   */
  async initialize() {
    try {
      // Create migrations table if it doesn't exist
      await this.createMigrationsTable();
      
      // Load available migrations
      await this.loadMigrations();
      
      // Load migration history
      await this.loadMigrationHistory();
      
      // Auto-run migrations if enabled
      if (this.options.autoRun) {
        await this.runMigrations();
      }
      
      this.isInitialized = true;
      console.log('Migration runner initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize migration runner:', error);
      throw error;
    }
  }
  
  /**
   * Create the migrations tracking table
   */
  async createMigrationsTable() {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${this.options.tableName} (
        id SERIAL PRIMARY KEY,
        version VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        execution_time_ms INTEGER,
        success BOOLEAN NOT NULL DEFAULT TRUE,
        rollback_version VARCHAR(255),
        dependencies TEXT[], -- Array of dependency versions
        metadata JSONB
      );
      
      CREATE INDEX IF NOT EXISTS idx_${this.options.tableName}_version 
        ON ${this.options.tableName}(version);
      
      CREATE INDEX IF NOT EXISTS idx_${this.options.tableName}_executed_at 
        ON ${this.options.tableName}(executed_at);
    `;
    
    await this.connectionPool.query(createTableSQL);
  }
  
  /**
   * Load migration files from disk
   */
  async loadMigrations() {
    try {
      const migrationsPath = path.resolve(this.options.migrationsPath);
      
      if (!fs.existsSync(migrationsPath)) {
        console.warn(`Migrations directory not found: ${migrationsPath}`);
        return;
      }
      
      const files = fs.readdirSync(migrationsPath)
        .filter(file => file.endsWith('.js') || file.endsWith('.sql'))
        .sort();
      
      for (const file of files) {
        const migration = await this.loadMigration(file, migrationsPath);
        if (migration) {
          this.migrations.set(migration.version, migration);
        }
      }
      
      console.log(`Loaded ${this.migrations.size} migrations`);
      
    } catch (error) {
      console.error('Failed to load migrations:', error);
      throw error;
    }
  }
  
  /**
   * Load a single migration file
   */
  async loadMigration(filename, migrationsPath) {
    try {
      const filePath = path.join(migrationsPath, filename);
      const stat = fs.statSync(filePath);
      
      // Extract version from filename (e.g., 001_initial_schema.js)
      const versionMatch = filename.match(/^(\d+)_(.+)\.(js|sql)$/);
      if (!versionMatch) {
        console.warn(`Invalid migration filename format: ${filename}`);
        return null;
      }
      
      const [, version, name] = versionMatch;
      const extension = versionMatch[3];
      
      let migration;
      
      if (extension === 'js') {
        // Load JavaScript migration
        delete require.cache[require.resolve(filePath)];
        migration = require(filePath);
      } else {
        // Load SQL migration
        const content = fs.readFileSync(filePath, 'utf8');
        migration = {
          up: async (db) => await db.query(content),
          down: async (db) => {
            // For SQL migrations, try to find a corresponding rollback file
            const rollbackFile = filename.replace('.sql', '_rollback.sql');
            const rollbackPath = path.join(migrationsPath, rollbackFile);
            
            if (fs.existsSync(rollbackPath)) {
              const rollbackContent = fs.readFileSync(rollbackPath, 'utf8');
              await db.query(rollbackContent);
            } else {
              throw new Error(`No rollback file found for migration: ${filename}`);
            }
          }
        };
      }
      
      // Validate migration structure
      if (!migration.up || typeof migration.up !== 'function') {
        throw new Error(`Migration ${filename} must export an 'up' function`);
      }
      
      // Calculate checksum
      const content = fs.readFileSync(filePath, 'utf8');
      const checksum = crypto.createHash('sha256').update(content).digest('hex');
      
      return {
        version,
        name,
        filename,
        path: filePath,
        extension,
        migration,
        checksum,
        dependencies: migration.dependencies || [],
        metadata: migration.metadata || {},
        modified: stat.mtime
      };
      
    } catch (error) {
      console.error(`Failed to load migration ${filename}:`, error.message);
      return null;
    }
  }
  
  /**
   * Load migration history from database
   */
  async loadMigrationHistory() {
    try {
      const result = await this.connectionPool.query(`
        SELECT * FROM ${this.options.tableName}
        ORDER BY executed_at ASC
      `);
      
      this.migrationHistory = result.rows.map(row => ({
        version: row.version,
        name: row.name,
        checksum: row.checksum,
        executedAt: row.executed_at,
        executionTime: row.execution_time_ms,
        success: row.success,
        rollbackVersion: row.rollback_version,
        dependencies: row.dependencies,
        metadata: row.metadata
      }));
      
    } catch (error) {
      console.error('Failed to load migration history:', error.message);
      throw error;
    }
  }
  
  /**
   * Run all pending migrations
   */
  async runMigrations(options = {}) {
    if (this.isLocked) {
      throw new Error('Migrations are already running');
    }
    
    const startTime = Date.now();
    
    try {
      await this.acquireLock();
      
      const runOptions = {
        direction: 'up',
        toVersion: null,
        fake: false,
        force: false,
        dryRun: false,
        ...options
      };
      
      // Get pending migrations
      const pendingMigrations = await this.getPendingMigrations(runOptions);
      
      if (pendingMigrations.length === 0) {
        console.log('No pending migrations to run');
        return { executed: [], skipped: [] };
      }
      
      console.log(`Running ${pendingMigrations.length} pending migrations`);
      
      // Create backup if enabled
      if (this.options.enableBackup && !runOptions.dryRun) {
        await this.createBackup('pre-migration');
      }
      
      const executed = [];
      const skipped = [];
      
      // Execute migrations
      for (const migration of pendingMigrations) {
        try {
          const result = await this.executeMigration(migration, runOptions);
          
          if (result.executed) {
            executed.push(result);
          } else {
            skipped.push(migration);
          }
          
        } catch (error) {
          console.error(`Migration ${migration.version} failed:`, error.message);
          
          if (this.options.rollbackOnFailure && !runOptions.dryRun) {
            console.log('Rolling back migrations due to failure');
            await this.rollbackExecutedMigrations(executed);
          }
          
          throw error;
        }
      }
      
      const duration = Date.now() - startTime;
      
      this.emit('migrationsCompleted', {
        executed,
        skipped,
        duration,
        direction: runOptions.direction
      });
      
      console.log(`Migrations completed in ${duration}ms. Executed: ${executed.length}, Skipped: ${skipped.length}`);
      
      return { executed, skipped };
      
    } finally {
      await this.releaseLock();
    }
  }
  
  /**
   * Get pending migrations to be executed
   */
  async getPendingMigrations(options) {
    const { direction, toVersion } = options;
    
    // Get executed versions
    const executedVersions = new Set(this.migrationHistory.map(h => h.version));
    
    // Filter migrations based on direction
    let pending = Array.from(this.migrations.values());
    
    if (direction === 'down') {
      // For rollback, get executed migrations in reverse order
      pending = pending.filter(m => executedVersions.has(m.version))
        .reverse();
      
      if (toVersion) {
        const targetIndex = pending.findIndex(m => m.version === toVersion);
        if (targetIndex !== -1) {
          pending = pending.slice(0, targetIndex);
        }
      }
    } else {
      // For forward migrations, get non-executed migrations
      pending = pending.filter(m => !executedVersions.has(m.version));
      
      if (toVersion) {
        pending = pending.filter(m => m.version <= toVersion);
      }
    }
    
    // Check dependencies
    const resolvedMigrations = [];
    for (const migration of pending) {
      const dependenciesMet = await this.checkDependencies(migration, executedVersions);
      
      if (dependenciesMet) {
        resolvedMigrations.push(migration);
      } else {
        console.warn(`Skipping migration ${migration.version} due to unmet dependencies`);
      }
    }
    
    return resolvedMigrations;
  }
  
  /**
   * Check if migration dependencies are satisfied
   */
  async checkDependencies(migration, executedVersions) {
    if (!migration.dependencies || migration.dependencies.length === 0) {
      return true;
    }
    
    return migration.dependencies.every(dep => executedVersions.has(dep));
  }
  
  /**
   * Execute a single migration
   */
  async executeMigration(migration, options) {
    const { direction, fake, dryRun } = options;
    const startTime = Date.now();
    
    // Check if already executed (for up migrations)
    if (direction === 'up') {
      const executed = this.migrationHistory.find(h => h.version === migration.version);
      if (executed && executed.success) {
        // Check if checksum matches
        if (this.options.enableChecksums && executed.checksum !== migration.checksum) {
          if (!options.force) {
            throw new Error(`Migration ${migration.version} has been modified since execution. Use --force to override.`);
          }
          console.warn(`Migration ${migration.version} checksum differs, forcing execution`);
        } else {
          console.log(`Migration ${migration.version} already executed, skipping`);
          return { executed: false, migration };
        }
      }
    }
    
    console.log(`${dryRun ? 'DRY RUN: ' : ''}Executing migration ${migration.version}: ${migration.name}`);
    
    if (dryRun) {
      return { executed: true, migration, dryRun: true };
    }
    
    try {
      // Record migration start
      const migrationRecord = {
        version: migration.version,
        name: migration.name,
        checksum: migration.checksum,
        executed_at: new Date(),
        execution_time_ms: null,
        success: false,
        dependencies: migration.dependencies,
        metadata: migration.metadata
      };
      
      if (!fake) {
        // Execute the migration
        if (direction === 'up') {
          await migration.migration.up(this.connectionPool);
        } else {
          await migration.migration.down(this.connectionPool);
        }
      }
      
      // Update execution time
      migrationRecord.execution_time_ms = Date.now() - startTime;
      migrationRecord.success = true;
      
      // Record migration in database
      await this.recordMigration(migrationRecord, direction);
      
      // Update local history
      if (direction === 'up') {
        this.migrationHistory.push({
          version: migration.version,
          name: migration.name,
          checksum: migration.checksum,
          executedAt: migrationRecord.executed_at,
          executionTime: migrationRecord.execution_time_ms,
          success: true,
          dependencies: migration.dependencies,
          metadata: migration.metadata
        });
      }
      
      this.emit('migrationExecuted', {
        migration,
        direction,
        executionTime: migrationRecord.execution_time_ms,
        success: true
      });
      
      return { executed: true, migration, executionTime: migrationRecord.execution_time_ms };
      
    } catch (error) {
      // Record failed migration
      const failedRecord = {
        version: migration.version,
        name: migration.name,
        checksum: migration.checksum,
        executed_at: new Date(),
        execution_time_ms: Date.now() - startTime,
        success: false,
        error: error.message
      };
      
      await this.recordMigration(failedRecord, direction);
      
      this.emit('migrationFailed', {
        migration,
        direction,
        error: error.message,
        executionTime: failedRecord.execution_time_ms
      });
      
      throw error;
    }
  }
  
  /**
   * Record migration execution in database
   */
  async recordMigration(record, direction) {
    if (direction === 'up') {
      await this.connectionPool.query(`
        INSERT INTO ${this.options.tableName} (
          version, name, checksum, executed_at, execution_time_ms, 
          success, dependencies, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (version) DO UPDATE SET
          executed_at = EXCLUDED.executed_at,
          execution_time_ms = EXCLUDED.execution_time_ms,
          success = EXCLUDED.success,
          checksum = EXCLUDED.checksum,
          dependencies = EXCLUDED.dependencies,
          metadata = EXCLUDED.metadata
      `, [
        record.version,
        record.name,
        record.checksum,
        record.executed_at,
        record.execution_time_ms,
        record.success,
        record.dependencies,
        JSON.stringify(record.metadata)
      ]);
    } else {
      // For rollback, update the existing record
      await this.connectionPool.query(`
        UPDATE ${this.options.tableName}
        SET success = false,
            executed_at = $1,
            execution_time_ms = $2
        WHERE version = $3
      `, [record.executed_at, record.execution_time_ms, record.version]);
    }
  }
  
  /**
   * Rollback migrations
   */
  async rollback(toVersion = null, options = {}) {
    return await this.runMigrations({
      direction: 'down',
      toVersion,
      ...options
    });
  }
  
  /**
   * Create a database backup
   */
  async createBackup(name) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `${name}_${timestamp}`;
      
      console.log(`Creating database backup: ${backupName}`);
      
      // This is a simplified backup implementation
      // In practice, you'd use pg_dump or similar tools
      const backupResult = await this.connectionPool.query(`
        SELECT 
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
        FROM pg_tables
        WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      `);
      
      console.log(`Backup metadata created for ${backupResult.rows.length} tables`);
      
      return {
        name: backupName,
        timestamp: new Date(),
        tables: backupResult.rows
      };
      
    } catch (error) {
      console.error('Failed to create backup:', error.message);
      throw error;
    }
  }
  
  /**
   * Rollback executed migrations (for error recovery)
   */
  async rollbackExecutedMigrations(executedMigrations) {
    console.log(`Rolling back ${executedMigrations.length} migrations`);
    
    for (let i = executedMigrations.length - 1; i >= 0; i--) {
      const migration = executedMigrations[i].migration;
      
      try {
        console.log(`Rolling back migration ${migration.version}`);
        await migration.migration.down(this.connectionPool);
        
        // Remove from history
        this.migrationHistory = this.migrationHistory.filter(h => h.version !== migration.version);
        
        // Remove from database
        await this.connectionPool.query(`
          DELETE FROM ${this.options.tableName} WHERE version = $1
        `, [migration.version]);
        
      } catch (rollbackError) {
        console.error(`Failed to rollback migration ${migration.version}:`, rollbackError.message);
        // Continue with other rollbacks
      }
    }
  }
  
  /**
   * Acquire migration lock
   */
  async acquireLock() {
    if (this.isLocked) {
      throw new Error('Migration lock already acquired');
    }
    
    try {
      // Use advisory lock for PostgreSQL
      await this.connectionPool.query('SELECT pg_advisory_lock(12345)');
      this.isLocked = true;
      
    } catch (error) {
      throw new Error(`Failed to acquire migration lock: ${error.message}`);
    }
  }
  
  /**
   * Release migration lock
   */
  async releaseLock() {
    if (!this.isLocked) {
      return;
    }
    
    try {
      await this.connectionPool.query('SELECT pg_advisory_unlock(12345)');
      this.isLocked = false;
      
    } catch (error) {
      console.error('Failed to release migration lock:', error.message);
    }
  }
  
  /**
   * Get migration status
   */
  async getStatus() {
    const executedVersions = new Set(this.migrationHistory.map(h => h.version));
    const pending = Array.from(this.migrations.values())
      .filter(m => !executedVersions.has(m.version));
    
    return {
      total: this.migrations.size,
      executed: this.migrationHistory.length,
      pending: pending.length,
      current: this.migrationHistory.length > 0 
        ? this.migrationHistory[this.migrationHistory.length - 1].version 
        : null,
      locked: this.isLocked,
      migrations: {
        available: Array.from(this.migrations.values()).map(m => ({
          version: m.version,
          name: m.name,
          status: executedVersions.has(m.version) ? 'executed' : 'pending',
          executedAt: executedVersions.has(m.version) 
            ? this.migrationHistory.find(h => h.version === m.version)?.executedAt 
            : null
        })),
        history: this.migrationHistory
      }
    };
  }
  
  /**
   * Validate migration files
   */
  async validateMigrations() {
    const issues = [];
    
    for (const [version, migration] of this.migrations) {
      // Check for valid version format
      if (!/^\d+$/.test(version)) {
        issues.push(`Invalid version format: ${version}`);
      }
      
      // Check for duplicate names
      const duplicates = Array.from(this.migrations.values())
        .filter(m => m.name === migration.name && m.version !== version);
      
      if (duplicates.length > 0) {
        issues.push(`Duplicate migration name: ${migration.name}`);
      }
      
      // Check dependencies
      if (migration.dependencies) {
        for (const dep of migration.dependencies) {
          if (!this.migrations.has(dep)) {
            issues.push(`Migration ${version} depends on non-existent version: ${dep}`);
          }
        }
      }
      
      // Check for circular dependencies
      if (await this.hasCircularDependencies(migration)) {
        issues.push(`Circular dependency detected for migration: ${version}`);
      }
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }
  
  /**
   * Check for circular dependencies
   */
  async hasCircularDependencies(migration) {
    const visited = new Set();
    const recursionStack = new Set();
    
    const hasCycle = async (version) => {
      if (recursionStack.has(version)) {
        return true;
      }
      
      if (visited.has(version)) {
        return false;
      }
      
      visited.add(version);
      recursionStack.add(version);
      
      const m = this.migrations.get(version);
      if (m && m.dependencies) {
        for (const dep of m.dependencies) {
          if (await hasCycle(dep)) {
            return true;
          }
        }
      }
      
      recursionStack.delete(version);
      return false;
    };
    
    return await hasCycle(migration.version);
  }
  
  /**
   * Reset migration history (for development)
   */
  async reset() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Migration reset is not allowed in production');
    }
    
    await this.connectionPool.query(`DELETE FROM ${this.options.tableName}`);
    this.migrationHistory = [];
    
    console.log('Migration history reset');
  }
  
  /**
   * Shutdown the migration runner
   */
  async shutdown() {
    await this.releaseLock();
    
    this.emit('shutdown');
    console.log('Migration runner shutdown complete');
  }
}

module.exports = MigrationRunner;