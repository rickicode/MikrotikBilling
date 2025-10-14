const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

/**
 * Database Migrator for PostgreSQL
 * Handles database schema migrations
 */
class DatabaseMigrator {
    constructor(connectionString) {
        this.pool = new Pool({
            connectionString: connectionString,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        this.migrationsPath = path.join(__dirname, 'migrations');
        this.lockTable = 'schema_migrations_lock';
        this.migrationsTable = 'schema_migrations';
    }

    /**
     * Initialize migrations table
     */
    async initializeMigrationsTable() {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Create migrations table if it doesn't exist
            await client.query(`
                CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (
                    id SERIAL PRIMARY KEY,
                    filename VARCHAR(255) UNIQUE NOT NULL,
                    checksum VARCHAR(64) NOT NULL,
                    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS ${this.lockTable} (
                    id SERIAL PRIMARY KEY,
                    locked BOOLEAN DEFAULT false,
                    locked_by VARCHAR(255),
                    locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await client.query('COMMIT');
            console.log('✅ Migration tables initialized');
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Failed to initialize migration tables:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Acquire migration lock
     */
    async acquireLock() {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
                UPDATE ${this.lockTable}
                SET locked = true, locked_by = $1, locked_at = CURRENT_TIMESTAMP
                WHERE id = 1 AND locked = false
                RETURNING locked
            `, [process.pid.toString()]);

            if (result.rows.length === 0) {
                // Insert first lock record
                await client.query(`
                    INSERT INTO ${this.lockTable} (id, locked, locked_by)
                    VALUES (1, true, $1)
                    ON CONFLICT (id) DO UPDATE SET locked = true, locked_by = $1
                `, [process.pid.toString()]);
            }

            console.log('🔒 Migration lock acquired');
            return true;
        } catch (error) {
            console.error('❌ Failed to acquire migration lock:', error);
            return false;
        } finally {
            client.release();
        }
    }

    /**
     * Release migration lock
     */
    async releaseLock() {
        const client = await this.pool.connect();
        try {
            await client.query(`
                UPDATE ${this.lockTable}
                SET locked = false, locked_by = NULL
                WHERE locked_by = $1
            `, [process.pid.toString()]);

            console.log('🔓 Migration lock released');
        } catch (error) {
            console.error('❌ Failed to release migration lock:', error);
        } finally {
            client.release();
        }
    }

    /**
     * Get migration files
     */
    getMigrationFiles() {
        if (!fs.existsSync(this.migrationsPath)) {
            return [];
        }

        const files = fs.readdirSync(this.migrationsPath)
            .filter(file => file.endsWith('.sql'))
            .sort();

        return files;
    }

    /**
     * Get executed migrations
     */
    async getExecutedMigrations() {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
                SELECT filename, checksum FROM ${this.migrationsTable}
                ORDER BY executed_at
            `);

            return result.rows.reduce((acc, row) => {
                acc[row.filename] = row.checksum;
                return acc;
            }, {});
        } catch (error) {
            console.error('❌ Failed to get executed migrations:', error);
            return {};
        } finally {
            client.release();
        }
    }

    /**
     * Calculate file checksum
     */
    calculateChecksum(content) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Execute migration file
     */
    async executeMigration(filename, content) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Execute the entire migration content as a single statement
            // This ensures all tables are created within the same transaction
            await client.query(content);

            // Record migration
            const checksum = this.calculateChecksum(content);
            await client.query(`
                INSERT INTO ${this.migrationsTable} (filename, checksum)
                VALUES ($1, $2)
            `, [filename, checksum]);

            await client.query('COMMIT');
            console.log(`✅ Migration ${filename} executed successfully`);
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`❌ Failed to execute migration ${filename}:`, error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Run migrations
     */
    async runMigrations() {
        console.log('🚀 Starting database migrations...');

        try {
            // Initialize migrations table
            await this.initializeMigrationsTable();

            // Acquire lock
            const lockAcquired = await this.acquireLock();
            if (!lockAcquired) {
                throw new Error('Could not acquire migration lock');
            }

            // Get migration files
            const migrationFiles = this.getMigrationFiles();
            if (migrationFiles.length === 0) {
                console.log('ℹ️ No migration files found');
                return;
            }

            // Get executed migrations
            const executedMigrations = await this.getExecutedMigrations();

            // Find pending migrations
            const pendingMigrations = migrationFiles.filter(file => {
                return !executedMigrations.hasOwnProperty(file);
            });

            if (pendingMigrations.length === 0) {
                console.log('✅ All migrations are up to date');
                return;
            }

            console.log(`📝 Found ${pendingMigrations.length} pending migrations`);

            // Execute pending migrations
            for (const file of pendingMigrations) {
                const filePath = path.join(this.migrationsPath, file);
                const content = fs.readFileSync(filePath, 'utf8');

                // Verify checksum for already executed migrations
                if (executedMigrations[file]) {
                    const currentChecksum = this.calculateChecksum(content);
                    if (currentChecksum !== executedMigrations[file]) {
                        throw new Error(`Migration ${file} has been modified after execution`);
                    }
                    continue;
                }

                await this.executeMigration(file, content);
            }

            console.log('✅ All migrations completed successfully');
        } catch (error) {
            console.error('❌ Migration failed:', error);
            throw error;
        } finally {
            await this.releaseLock();
        }
    }

    /**
     * Rollback last migration
     */
    async rollbackLastMigration() {
        console.log('⏪ Rolling back last migration...');

        const client = await this.pool.connect();
        try {
            const result = await client.query(`
                DELETE FROM ${this.migrationsTable}
                WHERE id = (SELECT MAX(id) FROM ${this.migrationsTable})
                RETURNING filename
            `);

            if (result.rows.length > 0) {
                const filename = result.rows[0].filename;
                console.log(`⏪ Migration ${filename} rolled back`);

                // Note: Actual rollback logic would require down migration files
                console.warn('⚠️ Rollback functionality requires down migration files');
            } else {
                console.log('ℹ️ No migrations to rollback');
            }
        } catch (error) {
            console.error('❌ Failed to rollback migration:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get migration status
     */
    async getMigrationStatus() {
        try {
            const migrationFiles = this.getMigrationFiles();
            const executedMigrations = await this.getExecutedMigrations();

            const status = {
                total: migrationFiles.length,
                executed: Object.keys(executedMigrations).length,
                pending: migrationFiles.length - Object.keys(executedMigrations).length,
                migrations: migrationFiles.map(file => ({
                    filename: file,
                    executed: executedMigrations.hasOwnProperty(file),
                    checksum: executedMigrations[file] || null
                }))
            };

            return status;
        } catch (error) {
            console.error('❌ Failed to get migration status:', error);
            return null;
        }
    }

    /**
     * Close connection pool
     */
    async close() {
        await this.pool.end();
        console.log('🔌 Migration pool closed');
    }
}

module.exports = DatabaseMigrator;