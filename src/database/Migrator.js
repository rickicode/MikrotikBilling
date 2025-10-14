const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

/**
 * PostgreSQL Database Migrator
 * Handles database migrations using PostgreSQL
 */
class Migrator {
    constructor(pool) {
        this.pool = pool;
        this.migrationsPath = path.join(__dirname, 'migrations');
    }

    /**
     * Initialize migrations table
     */
    async init() {
        const client = await this.pool.connect();
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS migrations (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) UNIQUE NOT NULL,
                    executed_at TIMESTAMP DEFAULT NOW()
                )
            `);
            console.log('✅ Migrations table initialized');
        } finally {
            client.release();
        }
    }

    /**
     * Get all migration files
     */
    getMigrationFiles() {
        if (!fs.existsSync(this.migrationsPath)) {
            console.log('📁 Migrations directory not found');
            return [];
        }

        const files = fs.readdirSync(this.migrationsPath)
            .filter(file => file.endsWith('.sql'))
            .sort();

        return files;
    }

    /**
     * Get executed migrations from database
     */
    async getExecutedMigrations() {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                'SELECT name FROM migrations ORDER BY executed_at'
            );
            return result.rows.map(row => row.name);
        } catch (error) {
            // If migrations table doesn't exist or has no name column, return empty array
            return [];
        } finally {
            client.release();
        }
    }

    /**
     * Run a single migration
     */
    async runMigration(migrationFile) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Read migration file
            const migrationPath = path.join(this.migrationsPath, migrationFile);
            const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

            // Extract migration name from filename (without .sql extension)
            const migrationName = path.basename(migrationFile, '.sql');

            console.log(`⬆️  Running migration: ${migrationName}`);

            // Execute migration SQL
            await client.query(migrationSQL);

            // Record migration
            await client.query(
                'INSERT INTO migrations (name, executed_at) VALUES ($1, NOW())',
                [migrationName]
            );

            await client.query('COMMIT');
            console.log(`✅ Migration ${migrationName} completed`);
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`❌ Migration ${migrationFile} failed:`, error.message);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Run all pending migrations
     */
    async migrate() {
        console.log('🚀 Starting database migration...\n');

        // Initialize migrations table
        await this.init();

        // Get migration files
        const migrationFiles = this.getMigrationFiles();
        if (migrationFiles.length === 0) {
            console.log('📄 No migration files found');
            return;
        }

        // Get executed migrations
        const executedMigrations = await this.getExecutedMigrations();
        console.log(`📋 Found ${executedMigrations.length} executed migrations`);

        // Find pending migrations
        const pendingMigrations = migrationFiles.filter(file => {
            const migrationName = path.basename(file, '.sql');
            return !executedMigrations.includes(migrationName);
        });

        if (pendingMigrations.length === 0) {
            console.log('✅ Database is up to date');
            return;
        }

        console.log(`\n📝 Running ${pendingMigrations.length} pending migrations...\n`);

        // Run pending migrations
        for (const migration of pendingMigrations) {
            await this.runMigration(migration);
        }

        console.log('\n✅ All migrations completed successfully!');
    }

    /**
     * Fresh migration - drop all tables and re-run all migrations
     */
    async fresh() {
        console.log('🔄 Starting fresh migration...\n');

        const client = await this.pool.connect();
        try {
            // Get all table names
            const result = await client.query(`
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_type = 'BASE TABLE'
                AND table_name != 'migrations'
            `);

            const tables = result.rows.map(row => row.table_name);

            // Drop all tables except migrations
            if (tables.length > 0) {
                console.log(`🗑️  Dropping ${tables.length} tables...`);
                await client.query('DROP TABLE IF EXISTS ' + tables.join(', ') + ' CASCADE');
                console.log('✅ All tables dropped');
            }

            // Reset migrations
            await client.query('TRUNCATE TABLE migrations RESTART IDENTITY CASCADE');
            console.log('✅ Migrations reset');

            // Re-seed with UUID extension if needed
            await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

            console.log('\n📝 Re-running all migrations...\n');

            // Run all migrations
            const migrationFiles = this.getMigrationFiles();
            for (const migration of migrationFiles) {
                await this.runMigration(migration);
            }

            console.log('\n✅ Fresh migration completed!');
        } finally {
            client.release();
        }
    }

    /**
     * Reset database - drop everything including migrations
     */
    async reset() {
        console.log('🔄 Resetting database...\n');

        const client = await this.pool.connect();
        try {
            // Get all table names including migrations
            const result = await client.query(`
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_type = 'BASE TABLE'
            `);

            const tables = result.rows.map(row => row.table_name);

            // Drop all tables and types
            if (tables.length > 0) {
                console.log(`🗑️  Dropping all ${tables.length} tables...`);
                await client.query('DROP TABLE IF EXISTS ' + tables.join(', ') + ' CASCADE');
                console.log('✅ All tables dropped');
            }

            // Also drop custom types
            const types = await client.query(`
                SELECT typname
                FROM pg_type
                WHERE typtype = 'e'
                AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
            `);

            if (types.rows.length > 0) {
                console.log(`🗑️  Dropping ${types.rows.length} custom types...`);
                for (const type of types.rows) {
                    await client.query(`DROP TYPE IF EXISTS ${type.typname} CASCADE`);
                }
                console.log('✅ All custom types dropped');
            }

            // Drop migrations table if it exists to recreate it correctly
            await client.query('DROP TABLE IF EXISTS migrations CASCADE');

            // Create migrations table with correct structure
            await client.query(`
                CREATE TABLE migrations (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) UNIQUE NOT NULL,
                    executed_at TIMESTAMP DEFAULT NOW()
                )
            `);

            // Re-seed with UUID extension
            await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

            console.log('\n✅ Database reset completed!');
        } finally {
            client.release();
        }
    }

    /**
     * Get migration status
     */
    async status() {
        console.log('📊 Migration Status:\n');

        const migrationFiles = this.getMigrationFiles();
        const executedMigrations = await this.getExecutedMigrations();

        console.log(`Total migration files: ${migrationFiles.length}`);
        console.log(`Executed migrations: ${executedMigrations.length}\n`);

        console.log('Migration status:');
        for (const file of migrationFiles) {
            const migrationName = path.basename(file, '.sql');
            const status = executedMigrations.includes(migrationName) ? '✅' : '⏳';
            console.log(`  ${status} ${migrationName}`);
        }
    }
}

module.exports = Migrator;