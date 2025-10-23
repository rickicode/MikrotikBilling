const knex = require('knex');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

/**
 * Enhanced Database Manager with flexible SQLite/PostgreSQL support
 * Handles all database operations consistently with efficient query helpers
 */
class DatabaseManager {
  constructor() {
    this.knex = null;
    this.pool = null;
    this.dbType = this.detectDatabaseType();
    this.config = this.buildDatabaseConfig();

    this.isInitialized = false;
    this.connectionRetries = 0;
    this.maxConnectionRetries = 5;
    this.connectionRetryDelay = 2000;

    // Cache for query performance
    this.queryCache = new Map();
    this.tableSchemas = new Map();
  }

  /**
   * Auto-detect database type from environment variables
   */
  detectDatabaseType() {
    console.log('🔍 Detecting database type...');
    console.log('DB_TYPE:', process.env.DB_TYPE);
    console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
    console.log('DB_NAME:', process.env.DB_NAME);

    // Check DB_TYPE first - this should override everything
    if (process.env.DB_TYPE) {
      const dbType = process.env.DB_TYPE.toLowerCase();
      console.log('Using DB_TYPE:', dbType);
      if (['sqlite', 'sqlite3'].includes(dbType)) {
        console.log('✅ Detected SQLite');
        return 'sqlite3';
      } else if (['pg', 'postgres', 'postgresql'].includes(dbType)) {
        console.log('✅ Detected PostgreSQL');
        return 'pg';
      }
    }

    // Check DATABASE_URL - only if DB_TYPE is not set
    if (process.env.DATABASE_URL && !process.env.DB_TYPE) {
      if (process.env.DATABASE_URL.startsWith('sqlite:') ||
          process.env.DATABASE_URL.startsWith('./') ||
          process.env.DATABASE_URL.endsWith('.db') ||
          process.env.DATABASE_URL.includes('mikrotik_billing.db')) {
        console.log('✅ Detected SQLite from DATABASE_URL');
        return 'sqlite3';
      } else {
        console.log('✅ Detected PostgreSQL from DATABASE_URL');
        return 'pg';
      }
    }

    // Check DB_NAME - only if neither DB_TYPE nor DATABASE_URL is set
    if (process.env.DB_NAME && !process.env.DB_TYPE && !process.env.DATABASE_URL) {
      if (process.env.DB_NAME.endsWith('.db') || process.env.DB_NAME.includes('sqlite')) {
        console.log('✅ Detected SQLite from DB_NAME');
        return 'sqlite3';
      }
    }

    // Default to PostgreSQL
    console.log('⚠️  Using default PostgreSQL');
    return 'pg';
  }

  /**
   * Build database configuration based on detected type
   */
  buildDatabaseConfig() {
    if (this.dbType === 'sqlite3') {
      const dbPath = this.getSQLitePath();

      // Ensure data directory exists
      const dataDir = path.dirname(dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      return {
        filename: dbPath
      };
    } else {
      // PostgreSQL configuration
      if (process.env.DATABASE_URL) {
        const config = {
          connectionString: process.env.DATABASE_URL
        };

        // SSL configuration for Supabase and other cloud providers
        if (process.env.DATABASE_URL.includes('supabase') ||
            process.env.DATABASE_URL.includes('ssl') ||
            process.env.DB_SSL === 'true') {
          config.ssl = { rejectUnauthorized: false };
        }

        return config;
      } else {
        return {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT) || 5432,
          database: process.env.DB_NAME || 'mikrotik_billing',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres',
          ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
        };
      }
    }
  }

  /**
   * Get SQLite database path
   */
  getSQLitePath() {
    if (process.env.DATABASE_URL) {
      const url = process.env.DATABASE_URL.replace('sqlite:', '');
      return path.isAbsolute(url) ? url : path.resolve(process.cwd(), url);
    }

    if (process.env.DB_NAME) {
      return path.isAbsolute(process.env.DB_NAME)
        ? process.env.DB_NAME
        : path.resolve(process.cwd(), process.env.DB_NAME);
    }

    return path.resolve(process.cwd(), './data/mikrotik_billing.db');
  }

  /**
   * Get database information for debugging
   */
  getDatabaseInfo() {
    return {
      type: this.dbType,
      config: this.dbType === 'sqlite3'
        ? { filename: this.config.filename }
        : {
            host: this.config.host || this.config.connectionString?.split('@')[1]?.split(':')[0],
            database: this.config.database || this.config.connectionString?.split('/')[3],
            ssl: !!this.config.ssl
          },
      path: this.dbType === 'sqlite3' ? this.config.filename : this.config.connectionString,
      isInitialized: this.isInitialized
    };
  }

  async initialize() {
    try {
      // Log database configuration for debugging
      const dbInfo = this.getDatabaseInfo();
      console.log(`🗄️  Initializing database: ${dbInfo.type}`);
      console.log(`📍 Database path/config:`, dbInfo.path || dbInfo.config);

      // Close existing connections if any
      if (this.knex) {
        await this.knex.destroy();
      }
      if (this.pool) {
        await this.pool.end();
      }

      // Enhanced Knex configuration with database-specific optimizations
      const knexConfig = {
        client: this.dbType,
        connection: this.config,
        migrations: {
          directory: './src/database/migrations',
          tableName: 'knex_migrations'
        },
        seeds: {
          directory: './src/database/seeds'
        },
        // Enhanced pool configuration
        pool: {
          min: 1,
          max: this.dbType === 'sqlite3' ? 1 : 5, // SQLite doesn't benefit from pooling
          acquireTimeoutMillis: 30000,
          createTimeoutMillis: 30000,
          destroyTimeoutMillis: 5000,
          idleTimeoutMillis: 30000,
          propagateCreateError: false
        },
        // Better error handling
        debug: process.env.NODE_ENV === 'development',
        asyncStackTraces: process.env.NODE_ENV === 'development',
        // Post-processing hooks
        postProcessResponse: (result) => result,
        wrapIdentifier: (value) => value
      };

      // Database-specific configurations
      if (this.dbType === 'sqlite3') {
        // SQLite-specific settings
        knexConfig.useNullAsDefault = true;
        knexConfig.connection.foreignKeys = true;

        // Enable WAL mode for better concurrent access
        knexConfig.afterCreate = (conn, done) => {
          conn.run('PRAGMA foreign_keys = ON', (err) => {
            if (err) {
              console.warn('Failed to enable foreign keys in SQLite:', err.message);
            }
            conn.run('PRAGMA journal_mode = WAL', (err) => {
              if (err) {
                console.warn('Failed to enable WAL mode in SQLite:', err.message);
              }
              done(err, conn);
            });
          });
        };
      } else {
        // PostgreSQL-specific settings
        knexConfig.searchPath = ['public'];
        knexConfig.client = 'pg';

        // Create connection pool for PostgreSQL
        console.log('🐘 Creating PostgreSQL connection pool...');

        this.pool = new Pool({
          ...this.config,
          min: 1,
          max: 5,
          connectionTimeoutMillis: 30000,
          idleTimeoutMillis: 30000,
          query_timeout: 30000,
          allowExitOnIdle: false,
          maxUses: 7500, // Recreate connections after 7500 uses
          keepAlive: true,
          keepAliveInitialDelayMillis: 10000
        });

        // Pool event listeners
        this.pool.on('error', (err, client) => {
          console.error('PostgreSQL pool error:', err.message);
          console.error('Pool error details:', {
            totalCount: this.pool.totalCount,
            idleCount: this.pool.idleCount,
            waitingCount: this.pool.waitingCount
          });
        });

        this.pool.on('connect', (client) => {
          console.debug('New PostgreSQL client connected to pool');
        });

        this.pool.on('remove', (client) => {
          console.debug('PostgreSQL client removed from pool');
        });

        this.pool.on('acquire', (client) => {
          console.debug('PostgreSQL client acquired from pool');
        });
      }

      // Initialize Knex
      this.knex = knex(knexConfig);

      // Test database connection with health check
      await this.performHealthCheck();

      this.isInitialized = true;

      // Log successful initialization
      console.log(`✅ Database Manager initialized successfully with ${this.dbType === 'sqlite3' ? 'SQLite' : 'PostgreSQL'}`);

      // Log connection pool status for PostgreSQL
      if (this.dbType === 'pg' && this.pool) {
        console.log(`📊 Connection pool status: ${this.pool.totalCount} total, ${this.pool.idleCount} idle`);
      }

      return true;
    } catch (error) {
      console.error('❌ Failed to initialize database:', error);
      console.error('Database configuration:', {
        type: this.dbType,
        config: this.config,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Perform database health check
   */
  async performHealthCheck() {
    try {
      const result = await this.knex.raw('SELECT 1 as test');
      console.log('🔍 Database health check passed');

      // Additional database-specific checks
      if (this.dbType === 'sqlite3') {
        await this.knex.raw('PRAGMA table_info(knex_migrations)');
      } else {
        await this.knex.raw('SELECT version()');
      }

      return true;
    } catch (error) {
      console.error('❌ Database health check failed:', error);
      throw error;
    }
  }

  
  /**
   * Get the Knex instance
   */
  get instance() {
    if (!this.isInitialized) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.knex;
  }

  /**
   * Get the PostgreSQL pool
   */
  getPool() {
    return this.pool;
  }

  /**
   * Convert PostgreSQL parameter syntax to SQLite syntax
   */
  convertParametersForSQLite(sql, params) {
    if (this.dbType !== 'sqlite3') {
      return { sql, params };
    }

    // Convert $1, $2, etc to ? for SQLite
    let convertedSql = sql;
    let paramIndex = 1;

    // Replace $1, $2, $3, ... with ?
    convertedSql = convertedSql.replace(/\$\d+/g, '?');

    return { sql: convertedSql, params };
  }

  /**
   * Enhanced query execution with intelligent parameter handling and caching
   * Returns standardized format: { rows: [], rowCount: 0 }
   */
  async query(sql, params = []) {
    const startTime = Date.now();
    let retryCount = 0;
    const maxRetries = 3;

    // Ensure params is always an array
    const originalParams = Array.isArray(params) ? params : [];

    // Convert parameters for SQLite if needed
    const converted = this.convertParametersForSQLite(sql, originalParams);
    const querySql = converted.sql;
    const queryParams = converted.params;

    // Create cache key for SELECT queries
    const isSelectQuery = querySql.trim().toUpperCase().startsWith('SELECT');
    const cacheKey = isSelectQuery ? this.createCacheKey(querySql, queryParams) : null;

    // Check cache for SELECT queries
    if (cacheKey && this.queryCache.has(cacheKey)) {
      const cached = this.queryCache.get(cacheKey);
      if (Date.now() - cached.timestamp < 30000) { // 30 second cache
        console.debug(`Cache hit for query: ${querySql.substring(0, 50)}...`);
        return cached.result;
      } else {
        this.queryCache.delete(cacheKey);
      }
    }

    while (retryCount <= maxRetries) {
      try {
        let result;

        if (this.dbType === 'sqlite3') {
          result = await this.executeSQLiteQuery(querySql, queryParams);
        } else {
          result = await this.executePostgreSQLQuery(querySql, queryParams, retryCount, maxRetries);
        }

        // Cache successful SELECT results
        if (cacheKey && isSelectQuery) {
          this.queryCache.set(cacheKey, {
            result,
            timestamp: Date.now()
          });

          // Limit cache size
          if (this.queryCache.size > 100) {
            const firstKey = this.queryCache.keys().next().value;
            this.queryCache.delete(firstKey);
          }
        }

        // Log slow queries
        const duration = Date.now() - startTime;
        if (duration > 1000) {
          console.warn(`Slow query (${duration}ms): ${querySql.substring(0, 100)}...`);
        }

        return result;
      } catch (error) {
        if (retryCount >= maxRetries) {
          this.logQueryError(querySql, queryParams, error, retryCount);
          throw error;
        }

        retryCount++;
        await this.handleQueryRetry(error, retryCount, querySql, queryParams);
      }
    }
  }

  /**
   * Execute SQLite query with proper result formatting
   */
  async executeSQLiteQuery(sql, params) {
    let result = await this.knex.raw(sql, params);

    // Handle different SQLite result formats
    if (Array.isArray(result)) {
      return {
        rows: result,
        rowCount: result.length
      };
    } else if (result && typeof result === 'object') {
      // For SQLite, sometimes results are nested
      if (Array.isArray(result[0])) {
        return {
          rows: result[0],
          rowCount: result[0].length
        };
      } else {
        return {
          rows: [result],
          rowCount: 1
        };
      }
    }

    return {
      rows: [],
      rowCount: 0
    };
  }

  /**
   * Execute PostgreSQL query with connection pooling and error handling
   */
  async executePostgreSQLQuery(sql, params, retryCount, maxRetries) {
    try {
      const result = await this.knex.raw(sql, params);
      return {
        rows: result.rows || [],
        rowCount: result.rowCount || 0
      };
    } catch (knexError) {
      // Handle connection-specific errors
      if (this.isConnectionError(knexError)) {
        if (retryCount < maxRetries) {
          console.warn(`Database connection error (attempt ${retryCount + 1}/${maxRetries + 1}), retrying...`);

          // Wait with exponential backoff
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));

          // Try to reinitialize connection on first retry
          if (retryCount === 0) {
            try {
              await this.initialize();
            } catch (initError) {
              console.warn('Database reinitialization failed, continuing with retry...');
            }
          }
          throw knexError; // Re-throw to trigger retry
        } else {
          // Final retry attempt with direct pool
          console.warn('Knex connection failed, trying direct pool connection...');
          return await this.queryWithPool(sql, params);
        }
      } else {
        // Not a connection error, throw immediately
        throw knexError;
      }
    }
  }

  /**
   * Create cache key for query
   */
  createCacheKey(sql, params) {
    const normalizedSql = sql.replace(/\s+/g, ' ').trim();
    return `${normalizedSql}:${JSON.stringify(params)}`;
  }

  /**
   * Log detailed query error information
   */
  logQueryError(sql, params, error, retryCount) {
    console.error('Query failed after all retries:', {
      sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
      params: params ? params.map(p => typeof p === 'string' ? p.substring(0, 50) + (p.length > 50 ? '...' : '') : p) : [],
      error: error.message,
      code: error.code,
      severity: error.severity,
      detail: error.detail,
      hint: error.hint,
      retries: retryCount,
      database: this.dbType,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle query retry with exponential backoff
   */
  async handleQueryRetry(error, retryCount, sql, params) {
    console.warn(`Query retry ${retryCount}/3: ${error.message}`);

    // Exponential backoff with jitter
    const baseDelay = 1000;
    const exponentialDelay = baseDelay * Math.pow(2, retryCount - 1);
    const jitter = Math.random() * 500; // Add random jitter up to 500ms
    const delay = exponentialDelay + jitter;

    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Check if error is a connection-related error
   */
  isConnectionError(error) {
    const connectionErrorPatterns = [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'XX000',
      'connection terminated',
      'db_termination',
      'connection closed',
      'timeout',
      'pool is full',
      'acquire connection'
    ];

    return connectionErrorPatterns.some(pattern =>
      error.code === pattern ||
      error.message.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Execute query using direct PostgreSQL pool as fallback
   */
  async queryWithPool(sql, params = []) {
    if (!this.pool) {
      throw new Error('PostgreSQL pool not available');
    }

    let client;
    try {
      client = await this.pool.connect();
      let result;

      if (params && params.length > 0) {
        result = await client.query(sql, params);
      } else {
        result = await client.query(sql);
      }

      return {
        rows: result.rows || [],
        rowCount: result.rowCount || 0
      };
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Execute query and return first row (or null)
   */
  async queryOne(sql, params = []) {
    // For simple SELECT queries, use Knex query builder for better parameter handling
    if (typeof sql === 'string' && sql.trim().toUpperCase().startsWith('SELECT')) {
      try {
        // Try to use Knex query builder for SELECT queries
        const selectMatch = sql.match(/^SELECT\s+(.+?)\s+FROM\s+(\w+)/i);
        if (selectMatch) {
          const [, columns, table] = selectMatch;
          const whereMatch = sql.match(/WHERE\s+(.+)/i);

          if (whereMatch) {
            // Use Knex query builder with parameterized WHERE clause
            const whereClause = whereMatch[1];
            const paramMatches = whereClause.match(/\$\d+/g);
            const paramCount = paramMatches ? paramMatches.length : 0;

            if (paramCount === params.length) {
              // Build query using Knex
              let query = this.knex(table).select(columns === '*' ? '*' : columns.split(',').map(c => c.trim()));

              // Handle basic WHERE conditions with parameters
              if (whereClause.includes('username = $1')) {
                query = query.where('username', params[0]);
                if (whereClause.includes('AND is_active = true')) {
                  query = query.andWhere('is_active', true);
                }
              } else if (whereClause.includes('id = $1')) {
                query = query.where('id', params[0]);
              }

              const result = await query;
              return result.length > 0 ? result[0] : null;
            }
          }
        }
      } catch (builderError) {
        // Fall back to raw query if builder fails
        console.warn('Knex query builder failed, falling back to raw:', builderError.message);
      }
    }

    // Fall back to raw query
    const result = await this.query(sql, params);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Execute query and return scalar value
   */
  async queryScalar(sql, params = []) {
    const row = await this.queryOne(sql, params);
    if (!row) return null;

    const keys = Object.keys(row);
    return row[keys[0]];
  }

  /**
   * Execute query and return all rows
   */
  async queryAll(sql, params = []) {
    const result = await this.query(sql, params);
    return result.rows;
  }

  /**
   * Execute a transaction
   */
  async transaction(callback) {
    return await this.knex.transaction(callback);
  }

  /**
   * Enhanced helper methods for common database operations
   * These methods provide a unified interface for both SQLite and PostgreSQL
   */

  /**
   * Get Knex table instance with query builder
   */
  table(tableName) {
    return this.knex(tableName);
  }

  /**
   * Find single record by ID or conditions
   */
  async findOne(tableName, whereOrId, options = {}) {
    try {
      let query = this.knex(tableName);

      // Handle numeric ID or object conditions
      if (typeof whereOrId === 'number' || (typeof whereOrId === 'string' && !isNaN(whereOrId))) {
        query = query.where('id', whereOrId);
      } else {
        query = query.where(whereOrId);
      }

      // Add select options
      if (options.select) {
        query = query.select(options.select);
      }

      // Add joins if specified
      if (options.joins) {
        options.joins.forEach(join => {
          query = query.join(join.table, join.first, join.operator || '=', join.second);
        });
      }

      const result = await query.first();
      return result || null;
    } catch (error) {
      this.logOperationError('findOne', tableName, { whereOrId, options }, error);
      throw error;
    }
  }

  /**
   * Find multiple records with advanced filtering
   */
  async findMany(tableName, where = {}, options = {}) {
    try {
      let query = this.knex(tableName).where(where);

      // Select specific columns
      if (options.select) {
        query = query.select(options.select);
      }

      // Joins
      if (options.joins) {
        options.joins.forEach(join => {
          query = query.join(join.table, join.first, join.operator || '=', join.second);
        });
      }

      // Order by
      if (options.orderBy) {
        if (Array.isArray(options.orderBy)) {
          options.orderBy.forEach(order => {
            query = query.orderBy(order.column, order.direction || 'asc');
          });
        } else {
          query = query.orderBy(options.orderBy);
        }
      }

      // Limit and offset
      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.offset) {
        query = query.offset(options.offset);
      }

      // Group by
      if (options.groupBy) {
        query = query.groupBy(options.groupBy);
      }

      // Having
      if (options.having) {
        query = query.having(options.having);
      }

      return await query;
    } catch (error) {
      this.logOperationError('findMany', tableName, { where, options }, error);
      throw error;
    }
  }

  /**
   * Create single or multiple records
   */
  async create(tableName, data) {
    try {
      let result;

      if (Array.isArray(data)) {
        // Batch insert
        result = await this.knex(tableName).insert(data).returning('*');
      } else {
        // Single insert
        result = await this.knex(tableName).insert(data).returning('*');
      }

      // Handle different database return formats
      if (this.dbType === 'sqlite3') {
        // SQLite doesn't support returning, so we need to fetch the inserted record
        if (Array.isArray(data)) {
          // For batch inserts, return the original data
          return data;
        } else {
          // For single insert, fetch the record
          const lastId = await this.table(tableName).select('id').orderBy('id', 'desc').limit(1).first();
          return lastId;
        }
      }

      return result;
    } catch (error) {
      this.logOperationError('create', tableName, { data }, error);
      throw error;
    }
  }

  /**
   * Update records and return updated data
   */
  async update(tableName, data, where = {}) {
    try {
      let query = this.knex(tableName).where(where).update(data);

      // For PostgreSQL, use returning clause
      if (this.dbType === 'pg') {
        query = query.returning('*');
        return await query;
      } else {
        // For SQLite, update first then fetch the updated records
        await query;

        // Fetch updated records
        if (Object.keys(where).length > 0) {
          return await this.findMany(tableName, where);
        } else {
          // If no where clause, fetch all records (use with caution)
          return await this.findMany(tableName);
        }
      }
    } catch (error) {
      this.logOperationError('update', tableName, { data, where }, error);
      throw error;
    }
  }

  /**
   * Delete records and optionally return deleted data
   */
  async remove(tableName, where = {}, options = {}) {
    try {
      let deletedRecords = [];

      // Get records to be deleted if returnData is true
      if (options.returnData) {
        deletedRecords = await this.findMany(tableName, where);
      }

      // Perform deletion
      const result = await this.knex(tableName).where(where).del();

      // Return based on options
      if (options.returnData) {
        return {
          deletedCount: result,
          deletedRecords
        };
      }

      return result; // Number of deleted records
    } catch (error) {
      this.logOperationError('remove', tableName, { where, options }, error);
      throw error;
    }
  }

  /**
   * Check if record exists
   */
  async exists(tableName, where = {}) {
    try {
      const result = await this.knex(tableName)
        .where(where)
        .limit(1)
        .first();

      return !!result;
    } catch (error) {
      this.logOperationError('exists', tableName, { where }, error);
      throw error;
    }
  }

  /**
   * Count records with optional conditions
   */
  async count(tableName, where = {}, options = {}) {
    try {
      let query = this.knex(tableName);

      if (Object.keys(where).length > 0) {
        query = query.where(where);
      }

      if (options.column) {
        query = query.count(options.column + ' as count');
      } else {
        query = query.count('* as count');
      }

      const result = await query.first();
      return result ? parseInt(result.count) : 0;
    } catch (error) {
      this.logOperationError('count', tableName, { where, options }, error);
      throw error;
    }
  }

  /**
   * Upsert (update or insert) with flexible conflict handling
   */
  async upsert(tableName, data, conflictColumns = ['id'], options = {}) {
    try {
      if (this.dbType === 'pg') {
        let query = this.knex(tableName)
          .insert(data)
          .onConflict(conflictColumns);

        if (options.merge) {
          query = query.merge();
        } else if (options.ignore) {
          query = query.ignore();
        } else {
          query = query.merge(); // Default to merge
        }

        if (options.returning) {
          query = query.returning('*');
        }

        return await query;
      } else {
        // SQLite upsert simulation
        const existing = await this.findOne(tableName, data);
        if (existing) {
          return await this.update(tableName, data, { id: existing.id });
        } else {
          return await this.create(tableName, data);
        }
      }
    } catch (error) {
      this.logOperationError('upsert', tableName, { data, conflictColumns, options }, error);
      throw error;
    }
  }

  /**
   * Find or create record
   */
  async findOrCreate(tableName, where, defaults = {}) {
    try {
      const existing = await this.findOne(tableName, where);
      if (existing) {
        return existing;
      }

      const newData = { ...where, ...defaults };
      return await this.create(tableName, newData);
    } catch (error) {
      this.logOperationError('findOrCreate', tableName, { where, defaults }, error);
      throw error;
    }
  }

  /**
   * Increment column value
   */
  async increment(tableName, where, column, amount = 1) {
    try {
      return await this.knex(tableName)
        .where(where)
        .increment(column, amount);
    } catch (error) {
      this.logOperationError('increment', tableName, { where, column, amount }, error);
      throw error;
    }
  }

  /**
   * Decrement column value
   */
  async decrement(tableName, where, column, amount = 1) {
    try {
      return await this.knex(tableName)
        .where(where)
        .decrement(column, amount);
    } catch (error) {
      this.logOperationError('decrement', tableName, { where, column, amount }, error);
      throw error;
    }
  }

  /**
   * Log operation errors for debugging
   */
  logOperationError(operation, tableName, params, error) {
    console.error(`Database ${operation} operation failed:`, {
      table: tableName,
      operation,
      params,
      error: error.message,
      code: error.code,
      database: this.dbType,
      timestamp: new Date().toISOString()
    });
  }

  // Legacy methods for backward compatibility
  async getOne(tableName, where = {}) {
    return await this.findOne(tableName, where);
  }

  async getMany(tableName, where = {}, options = {}) {
    return await this.findMany(tableName, where, options);
  }

  async insert(tableName, data) {
    return await this.create(tableName, data);
  }

  async delete(tableName, where) {
    return await this.remove(tableName, where);
  }

  /**
   * Get table schema info
   */
  async getTableInfo(tableName) {
    const columns = await this.knex(tableName).columnInfo();
    const constraints = await this.knex.raw(`
      SELECT
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.table_name = ?
      ORDER BY tc.constraint_type
    `, [tableName]);

    return { columns, constraints };
  }

  /**
   * Close database connections
   */
  async close() {
    if (this.knex) {
      await this.knex.destroy();
    }
    if (this.pool && this.dbType === 'pg') {
      await this.pool.end();
    }
    console.log('Database connections closed');
  }
}

// Create singleton instance
const dbManager = new DatabaseManager();

// Add error handling for database disconnection
process.on('SIGINT', async () => {
  console.log('Received SIGINT, closing database connections...');
  await dbManager.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, closing database connections...');
  await dbManager.close();
  process.exit(0);
});

// Handle database errors
dbManager.pool?.on('error', (err) => {
  console.error('Database pool error:', err);
  // Attempt to reconnect
  setTimeout(async () => {
    try {
      console.log('Attempting to reconnect to database...');
      await dbManager.initialize();
      console.log('Database reconnected successfully');
    } catch (reconnectError) {
      console.error('Failed to reconnect to database:', reconnectError);
    }
  }, 5000);
});

// Export both class and instance
module.exports = { DatabaseManager, db: dbManager };