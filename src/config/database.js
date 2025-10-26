const { Pool } = require('pg');
const SecurityConfig = require('./security');

class DatabaseConfig {
  constructor() {
    this.securityConfig = new SecurityConfig();
    this.pools = new Map(); // Support multiple database pools
    this.setupPools();
  }

  setupPools() {
    // Use Supabase DATABASE_URL if available, otherwise fallback to local config
    const databaseUrl = process.env.DATABASE_URL;

    let poolConfig;
    if (databaseUrl) {
      // Parse DATABASE_URL for Supabase connection
      const url = new URL(databaseUrl);
      poolConfig = {
        host: url.hostname,
        port: url.port || 5432,
        database: url.pathname.substring(1),
        user: url.username,
        password: url.password,
        ssl: {
          rejectUnauthorized: false
        }
      };
    } else {
      // Fallback to local database config
      poolConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'mikrotik_billing',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        ssl: false
      };
    }

    // Primary database pool
    this.createPool('primary', {
      ...poolConfig,
      max: process.env.DB_POOL_MAX || 50, // Increased from 20
      min: process.env.DB_POOL_MIN || 5,
      idleTimeoutMillis: process.env.DB_IDLE_TIMEOUT || 30000,
      connectionTimeoutMillis: process.env.DB_CONNECTION_TIMEOUT || 10000,
      statement_timeout: process.env.DB_STATEMENT_TIMEOUT || 30000,
      query_timeout: process.env.DB_QUERY_TIMEOUT || 30000,
      application_name: 'mikrotik_billing_primary',
      // Enable SSL for production
      ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: true,
        ca: process.env.DB_CA_CERT
      } : false
    });

    // Read replica pool if configured
    if (process.env.DB_READ_REPLICA_HOST) {
      this.createPool('replica', {
        host: process.env.DB_READ_REPLICA_HOST,
        port: process.env.DB_READ_REPLICA_PORT || 5432,
        database: process.env.DB_READ_REPLICA_NAME || process.env.DB_NAME,
        user: process.env.DB_READ_REPLICA_USER || process.env.DB_USER,
        password: process.env.DB_READ_REPLICA_PASSWORD || process.env.DB_PASSWORD,
        max: process.env.DB_REPLICA_POOL_MAX || 30,
        min: process.env.DB_REPLICA_POOL_MIN || 3,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        application_name: 'mikrotik_billing_replica',
        ssl: process.env.NODE_ENV === 'production' ? {
          rejectUnauthorized: true,
          ca: process.env.DB_CA_CERT
        } : false,
        readOnly: true
      });
    }
  }

  createPool(name, config) {
    const pool = new Pool({
      ...config,
      // Add connection event listeners
      onConnect: (client) => {
        console.log(`Database connection established for pool: ${name}`);

        // Set session parameters
        client.query(`
          SET
            timezone = 'UTC',
            statement_timeout = '30s',
            idle_in_transaction_session_timeout = '5min',
            lock_timeout = '10s'
        `).catch(err => {
          console.error('Error setting session parameters:', err);
        });
      },
      onRelease: (err, client) => {
        if (err) {
          console.error(`Database connection error in pool ${name}:`, err);
        }
      },
      onRemove: (client) => {
        console.log(`Database connection removed from pool: ${name}`);
      }
    });

    // Add error handling
    pool.on('error', (err, client) => {
      console.error(`Database pool ${name} error:`, err);

      // Log security events if available
      if (global.securityLogger) {
        global.securityLogger.logSecurity('database_error', {
          pool: name,
          error: err.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Add connection monitoring
    pool.on('acquire', (client) => {
      if (client) {
        client.lastAcquired = Date.now();
      }
    });

    pool.on('release', (client) => {
      if (client && client.lastAcquired) {
        const duration = Date.now() - client.lastAcquired;
        if (duration > 5000) { // Log slow queries
          console.warn(`Slow database connection detected in pool ${name}: ${duration}ms`);
        }
      }
    });

    this.pools.set(name, pool);
    return pool;
  }

  // Get primary database pool
  getPrimaryPool() {
    return this.pools.get('primary');
  }

  // Get read replica pool if available
  getReadPool() {
    return this.pools.get('replica') || this.pools.get('primary');
  }

  // Get pool for specific operation
  getPool(operation = 'read') {
    if (operation === 'read' && this.pools.has('replica')) {
      return this.pools.get('replica');
    }
    return this.pools.get('primary');
  }

  // Execute query with automatic pool selection
  async query(sql, params = [], options = {}) {
    const {
      operation = 'read',
      timeout = 30000,
      retries = 2,
      useTransaction = false
    } = options;

    const pool = this.getPool(operation);
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (useTransaction) {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');

            // Set timeout for transaction
            if (timeout) {
              await client.query(`SET statement_timeout = ${timeout}`);
            }

            const result = await client.query(sql, params);
            await client.query('COMMIT');
            return result;
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          } finally {
            client.release();
          }
        } else {
          const result = await pool.query({
            text: sql,
            values: params,
            timeout
          });
          return result;
        }
      } catch (error) {
        lastError = error;

        // Log retry attempts
        if (attempt < retries) {
          console.warn(`Database query retry ${attempt + 1}/${retries}:`, error.message);
          await this.delay(100 * (attempt + 1)); // Exponential backoff
        }
      }
    }

    // Log final error
    console.error('Database query failed after retries:', lastError);
    throw lastError;
  }

  // Execute multiple queries in a transaction
  async transaction(queries) {
    const pool = this.getPrimaryPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const results = [];

      for (const { sql, params, timeout = 30000 } of queries) {
        if (timeout) {
          await client.query(`SET statement_timeout = ${timeout}`);
        }
        const result = await client.query(sql, params);
        results.push(result);
      }

      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Batch insert with optimized performance
  async batchInsert(table, data, options = {}) {
    const {
      batchSize = 1000,
      conflictAction = 'NOTHING', // or 'UPDATE'
      returning = '*'
    } = options;

    if (!data || data.length === 0) {
      return { rows: [], rowCount: 0 };
    }

    const columns = Object.keys(data[0]);
    const values = data.map(row => columns.map(col => row[col]));
    const placeholders = values.map((row, index) =>
      `(${row.map((_, colIndex) => `$${index * columns.length + colIndex + 1}`).join(', ')})`
    ).join(', ');

    const sql = `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES ${placeholders}
      ${conflictAction !== 'NOTHING' ? `ON CONFLICT ${conflictAction}` : ''}
      ${returning ? `RETURNING ${returning}` : ''}
    `;

    const flatValues = values.flat();

    return await this.query(sql, flatValues, { operation: 'write' });
  }

  // Execute query with prepared statement caching
  async preparedQuery(name, sql, params = [], options = {}) {
    const pool = this.getPool(options.operation || 'read');

    try {
      // Prepare statement if not already prepared
      if (!pool.preparedStatements || !pool.preparedStatements.has(name)) {
        await pool.query({ text: `PREPARE ${name} AS ${sql}`, name });

        if (!pool.preparedStatements) {
          pool.preparedStatements = new Map();
        }
        pool.preparedStatements.set(name, true);
      }

      // Execute prepared statement
      const result = await pool.query({
        text: `EXECUTE ${name}(${params.map((_, i) => `$${i + 1}`).join(', ')})`,
        values: params,
        ...options
      });

      return result;
    } catch (error) {
      console.error(`Prepared query error (${name}):`, error);
      throw error;
    }
  }

  // Health check for database connections
  async healthCheck() {
    const results = {};

    for (const [name, pool] of this.pools.entries()) {
      try {
        const start = Date.now();
        const result = await pool.query('SELECT 1 as health_check');
        const duration = Date.now() - start;

        results[name] = {
          status: 'healthy',
          responseTime: duration,
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount
        };
      } catch (error) {
        results[name] = {
          status: 'unhealthy',
          error: error.message,
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount
        };
      }
    }

    return results;
  }

  // Get database statistics
  async getStatistics() {
    const stats = {};

    for (const [name, pool] of this.pools.entries()) {
      stats[name] = {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount
      };
    }

    return stats;
  }

  // Utility function for delays
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Close all database pools
  async close() {
    const closePromises = Array.from(this.pools.entries()).map(async ([name, pool]) => {
      try {
        await pool.end();
        console.log(`Database pool ${name} closed successfully`);
      } catch (error) {
        console.error(`Error closing database pool ${name}:`, error);
      }
    });

    await Promise.all(closePromises);
    this.pools.clear();
  }

  // Migration helper
  async migrate(migrationDir = './migrations') {
    const pool = this.getPrimaryPool();

    try {
      // Create migrations table if not exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          checksum VARCHAR(64) NOT NULL
        )
      `);

      // Get migration files
      const fs = require('fs');
      const path = require('path');
      const migrationFiles = fs.readdirSync(migrationDir)
        .filter(file => file.endsWith('.sql'))
        .sort();

      // Execute pending migrations
      for (const file of migrationFiles) {
        const filePath = path.join(migrationDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const checksum = require('crypto').createHash('sha256').update(content).digest('hex');

        // Check if migration already executed
        const existing = await pool.query(
          'SELECT id FROM migrations WHERE filename = $1',
          [file]
        );

        if (existing.rows.length === 0) {
          console.log(`Executing migration: ${file}`);

          await pool.query('BEGIN');
          try {
            await pool.query(content);
            await pool.query(
              'INSERT INTO migrations (filename, checksum) VALUES ($1, $2)',
              [file, checksum]
            );
            await pool.query('COMMIT');

            console.log(`Migration ${file} executed successfully`);
          } catch (error) {
            await pool.query('ROLLBACK');
            console.error(`Migration ${file} failed:`, error);
            throw error;
          }
        }
      }
    } catch (error) {
      console.error('Migration error:', error);
      throw error;
    }
  }
}

module.exports = DatabaseConfig;