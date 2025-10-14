const knex = require('knex');
const { Pool } = require('pg');

/**
 * Global Database Manager using Knex.js
 * Handles all database operations consistently
 */
class DatabaseManager {
  constructor() {
    this.knex = null;
    this.pool = null;
    this.dbType = process.env.DB_TYPE || 'pg';

    // Use DATABASE_URL if available, otherwise use individual settings
    if (process.env.DATABASE_URL) {
      // Check if it's SQLite
      if (process.env.DATABASE_URL.startsWith('sqlite:') ||
          process.env.DATABASE_URL.startsWith('./') ||
          process.env.DATABASE_URL.endsWith('.db')) {
        this.dbType = 'sqlite3';
        this.config = {
          filename: process.env.DATABASE_URL.replace('sqlite:', '') || './data/mikrotik_billing.db'
        };
      } else {
        this.config = {
          connectionString: process.env.DATABASE_URL,
          ssl: process.env.DATABASE_URL.includes('supabase') || process.env.DATABASE_URL.includes('ssl')
            ? { rejectUnauthorized: false }
            : false
        };
      }
    } else {
      if (this.dbType === 'sqlite3' || process.env.DB_NAME?.endsWith('.db')) {
        this.dbType = 'sqlite3';
        this.config = {
          filename: process.env.DB_NAME || './data/mikrotik_billing.db'
        };
      } else {
        this.config = {
          host: process.env.DB_HOST || 'localhost',
          port: process.env.DB_PORT || 5432,
          database: process.env.DB_NAME || 'mikrotik_billing',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres'
        };
      }
    }

    this.isInitialized = false;
  }

  async initialize() {
    try {
      // Initialize Knex based on database type
      const knexConfig = {
        client: this.dbType,
        connection: this.config,
        migrations: {
          directory: './src/database/migrations',
          tableName: 'knex_migrations'
        }
      };

      // Add pool configuration only for PostgreSQL
      if (this.dbType === 'pg') {
        knexConfig.pool = {
          min: 2,
          max: 10,
          acquireTimeoutMillis: 30000,
          createTimeoutMillis: 30000,
          destroyTimeoutMillis: 5000,
          idleTimeoutMillis: 30000,
          reapIntervalMillis: 1000,
          createRetryIntervalMillis: 100
        };
        knexConfig.searchPath = ['public'];

        // Create connection pool for PostgreSQL
        this.pool = new Pool(this.config);

        // For Supabase, add SSL to Knex config
        if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('supabase')) {
          knexConfig.connection.ssl = { rejectUnauthorized: false };
        }
      }

      this.knex = knex(knexConfig);

      // Test connection
      if (this.dbType === 'sqlite3') {
        await this.knex.raw('SELECT 1');
        console.log('✅ Database Manager initialized with SQLite');
      } else {
        await this.knex.raw('SELECT 1');
        console.log('✅ Database Manager initialized with PostgreSQL');
      }

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize database:', error);
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
   * Execute a query with automatic error handling
   */
  async query(sql, params = []) {
    try {
      if (this.dbType === 'sqlite3') {
        // For SQLite, use knex.raw
        const result = await this.knex.raw(sql, params);
        return result;
      } else {
        // For PostgreSQL, use pool client
        const client = await this.pool.connect();
        try {
          let result;
          if (params && params.length > 0) {
            result = await client.query(sql, params);
          } else {
            result = await client.query(sql);
          }
          // Return the full result object
          return result;
        } finally {
          client.release();
        }
      }
    } catch (error) {
      console.error('Query error:', { sql, params, error: error.message });
      throw error;
    }
  }

  /**
   * Execute a transaction
   */
  async transaction(callback) {
    return await this.knex.transaction(callback);
  }

  /**
   * Helper method for table operations
   */
  table(tableName) {
    return this.knex(tableName);
  }

  /**
   * Get single record
   */
  async getOne(tableName, where = {}) {
    const result = await this.knex(tableName).where(where).first();
    return result || null;
  }

  /**
   * Get multiple records
   */
  async getMany(tableName, where = {}, options = {}) {
    let query = this.knex(tableName).where(where);

    if (options.orderBy) {
      query = query.orderBy(options.orderBy);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.offset(options.offset);
    }

    return await query;
  }

  /**
   * Insert record(s)
   */
  async insert(tableName, data) {
    if (Array.isArray(data)) {
      return await this.knex(tableName).insert(data).returning('*');
    }
    return await this.knex(tableName).insert(data).returning('*');
  }

  /**
   * Update record(s)
   */
  async update(tableName, data, where) {
    return await this.knex(tableName)
      .where(where)
      .update(data)
      .returning('*');
  }

  /**
   * Delete record(s)
   */
  async delete(tableName, where) {
    return await this.knex(tableName).where(where).del();
  }

  /**
   * Check if record exists
   */
  async exists(tableName, where) {
    const result = await this.knex(tableName)
      .where(where)
      .count('* as count')
      .first();
    return result && result.count > 0;
  }

  /**
   * Count records
   */
  async count(tableName, where = {}) {
    const result = await this.knex(tableName)
      .where(where)
      .count('* as count')
      .first();
    return result ? parseInt(result.count) : 0;
  }

  /**
   * Upsert (update or insert)
   */
  async upsert(tableName, data, conflictColumns = ['id']) {
    return await this.knex(tableName)
      .insert(data)
      .onConflict(conflictColumns)
      .merge()
      .returning('*');
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