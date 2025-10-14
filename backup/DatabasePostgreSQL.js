const { Pool } = require('pg');
const DatabaseMigrator = require('./migrator');

/**
 * PostgreSQL Database Manager
 * Handles PostgreSQL database connections and operations
 */
class DatabasePostgreSQL {
    constructor() {
        // Use environment variables or default to PostgreSQL settings
        this.config = {
            connectionString: process.env.DATABASE_URL || `postgresql://${
                process.env.DB_USER || 'postgres'
            }:${
                process.env.DB_PASSWORD || ''
            }@${
                process.env.DB_HOST || 'localhost'
            }:${
                process.env.DB_PORT || '5432'
            }/${
                process.env.DB_NAME || 'mikrotik_billing'
            }`,
            max: 20, // Maximum number of clients in the pool
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        };

        this.pool = null;
        this.migrator = null;
    }

    /**
     * Initialize database connection
     */
    async initialize() {
        try {
            console.log('🔌 Connecting to PostgreSQL database...');

            // Create connection pool
            this.pool = new Pool(this.config);

            // Test connection
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();

            console.log('✅ Connected to PostgreSQL database');

            // Initialize migrator
            this.migrator = new DatabaseMigrator(this.config.connectionString);

            // Run migrations
            await this.migrator.runMigrations();

            // Initialize Query helper
            const Query = require('../lib/query');
            global.Query = Query;
            global.db = this;

            console.log('✅ Database initialization complete');
        } catch (error) {
            console.error('❌ Failed to initialize database:', error);
            throw error;
        }
    }

    /**
     * Execute a query
     */
    async query(sql, params = []) {
        const client = await this.pool.connect();
        try {
            // Ensure params is always an array
            const parameters = Array.isArray(params) ? params : [params];
            const result = await client.query(sql, parameters);
            return result.rows;
        } catch (error) {
            console.error('Database query error:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Execute a query and return first row
     */
    async queryOne(sql, params = []) {
        const rows = await this.query(sql, params);
        return rows.length > 0 ? rows[0] : null;
    }

    /**
     * Execute a query and return scalar value
     */
    async queryScalar(sql, params = []) {
        const row = await this.queryOne(sql, params);
        if (!row) return null;

        // Return first column value
        const keys = Object.keys(row);
        return row[keys[0]];
    }

    /**
     * Insert a record and return ID
     */
    async insert(table, data) {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

        const sql = `
            INSERT INTO ${table} (${keys.join(', ')})
            VALUES (${placeholders})
            RETURNING id
        `;

        const result = await this.queryOne(sql, values);
        return result.id;
    }

    /**
     * Update records
     */
    async update(table, data, where, whereParams = []) {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');

        const sql = `
            UPDATE ${table}
            SET ${setClause}, updated_at = CURRENT_TIMESTAMP
            ${where ? `WHERE ${where}` : ''}
        `;

        const allParams = [...values, ...whereParams];
        const result = await this.query(sql, allParams);
        return result.rowCount;
    }

    /**
     * Delete records
     */
    async delete(table, where, params = []) {
        const sql = `DELETE FROM ${table} WHERE ${where}`;
        const result = await this.query(sql, params);
        return result.rowCount;
    }

    /**
     * Begin transaction
     */
    async beginTransaction() {
        const client = await this.pool.connect();
        await client.query('BEGIN');
        return client;
    }

    /**
     * Commit transaction
     */
    async commitTransaction(client) {
        try {
            await client.query('COMMIT');
        } finally {
            client.release();
        }
    }

    /**
     * Rollback transaction
     */
    async rollbackTransaction(client) {
        try {
            await client.query('ROLLBACK');
        } finally {
            client.release();
        }
    }

    /**
     * Check if table exists
     */
    async tableExists(tableName) {
        const sql = `
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = $1
            )
        `;
        const result = await this.queryOne(sql, [tableName]);
        return result.exists;
    }

    /**
     * Get table schema
     */
    async getTableSchema(tableName) {
        const sql = `
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = $1
            ORDER BY ordinal_position
        `;
        return await this.query(sql, [tableName]);
    }

    /**
     * Get database statistics
     */
    async getStats() {
        const stats = {};

        // Get database size
        const dbSize = await this.queryOne(`
            SELECT pg_database_size(current_database()) as size
        `);
        stats.databaseSize = dbSize.size;

        // Get connection count
        const connections = await this.queryOne(`
            SELECT count(*) as count FROM pg_stat_activity
        `);
        stats.connections = connections.count;

        // Get table sizes
        const tables = await this.query(`
            SELECT
                schemaname,
                tablename,
                pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
                pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
            FROM pg_tables
            WHERE schemaname = 'public'
            ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        `);
        stats.tables = tables;

        return stats;
    }

    /**
     * Backup database
     */
    async backup(filePath) {
        const { exec } = require('child_process');
        const fs = require('fs');
        const path = require('path');

        return new Promise((resolve, reject) => {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Parse connection string
            const pg = require('pg');
            const poolConfig = new Pool(this.config).options;

            const cmd = `pg_dump -h ${poolConfig.host} -p ${poolConfig.port} -U ${poolConfig.user} -d ${poolConfig.database} -f "${filePath}" --verbose`;

            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    console.log('Database backup completed');
                    resolve(filePath);
                }
            });
        });
    }

    /**
     * Restore database
     */
    async restore(filePath) {
        const { exec } = require('child_process');

        return new Promise((resolve, reject) => {
            // Parse connection string
            const pg = require('pg');
            const poolConfig = new Pool(this.config).options;

            const cmd = `psql -h ${poolConfig.host} -p ${poolConfig.port} -U ${poolConfig.user} -d ${poolConfig.database} -f "${filePath}" --verbose`;

            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    console.log('Database restore completed');
                    resolve();
                }
            });
        });
    }

    /**
     * Close all connections
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            console.log('🔌 Database connections closed');
        }
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            const result = await this.queryOne('SELECT 1 as health');
            return {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                result: result.health
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }

    /**
     * Get migration status
     */
    async getMigrationStatus() {
        if (!this.migrator) {
            return null;
        }
        return await this.migrator.getMigrationStatus();
    }

    /**
     * Run migrations manually
     */
    async runMigrations() {
        if (!this.migrator) {
            throw new Error('Migrator not initialized');
        }
        return await this.migrator.runMigrations();
    }

    /**
     * Legacy compatibility methods
     */
    prepare(sql) {
        return {
            all: async (...params) => {
                // Handle both array and individual parameters
                const parameters = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
                return await this.query(sql, parameters);
            },
            get: async (...params) => {
                // Handle both array and individual parameters
                const parameters = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
                return await this.queryOne(sql, parameters);
            },
            run: async (...params) => {
                // Handle both array and individual parameters
                const parameters = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
                const result = await this.query(sql, parameters);
                return { changes: result.length, lastID: null };
            }
        };
    }

    // Export for global access
    getPool() {
        return this.pool;
    }
}

module.exports = DatabasePostgreSQL;