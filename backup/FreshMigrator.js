const fs = require('fs');
const path = require('path');
const Query = require('../lib/query');

/**
 * Fresh Migrator - Allows fresh migration by dropping all tables first
 */
class FreshMigrator {
    constructor(dbPool) {
        this.query = new Query(dbPool);
        this.migrationsPath = path.join(__dirname, 'migrations');
    }

    /**
     * Perform fresh migration - drops all tables then recreates them
     */
    async fresh() {
        console.log('🧹 Starting fresh migration...');

        try {
            // Drop all tables in reverse order to handle dependencies
            await this.dropAllTables();
            console.log('✅ All tables dropped');

            // Run all migrations
            await this.migrate();
            console.log('✅ Fresh migration completed successfully');

        } catch (error) {
            console.error('❌ Fresh migration failed:', error);
            throw error;
        }
    }

    /**
     * Drop all tables except migration tracking tables
     */
    async dropAllTables() {
        // Get all tables
        const tables = await this.query.getMany(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `);

        // Tables to keep (migration tracking)
        const keepTables = ['schema_migrations', 'schema_migrations_lock', 'migrations'];

        // Drop all tables except migration tracking
        for (const table of tables) {
            const tableName = table.table_name;
            if (!keepTables.includes(tableName)) {
                await this.query.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
                console.log(`🗑️ Dropped table: ${tableName}`);
            }
        }

        // Drop custom types
        const types = await this.query.getMany(`
            SELECT t.typname as type_name
            FROM pg_type t
            JOIN pg_enum e ON t.oid = e.enumtypid
            GROUP BY t.typname
        `);

        for (const type of types) {
            await this.query.query(`DROP TYPE IF EXISTS "${type.type_name}" CASCADE`);
            console.log(`🗑️ Dropped type: ${type.type_name}`);
        }
    }

    /**
     * Run all migrations
     */
    async migrate() {
        const migrationFiles = fs.readdirSync(this.migrationsPath)
            .filter(file => file.endsWith('.sql'))
            .sort();

        console.log(`Found ${migrationFiles.length} migration files`);

        for (const file of migrationFiles) {
            await this.runMigration(file);
        }
    }

    /**
     * Run a single migration file
     */
    async runMigration(filename) {
        const filepath = path.join(this.migrationsPath, filename);
        const sql = fs.readFileSync(filepath, 'utf8');

        console.log(`📄 Running migration: ${filename}`);

        try {
            // Execute the entire migration as a single statement
            await this.query.query(sql);
            console.log(`✅ Migration completed: ${filename}`);
        } catch (error) {
            console.error(`❌ Migration failed: ${filename}`, error);
            throw error;
        }
    }

    /**
     * Reset database - drops all tables and migration tracking
     */
    async reset() {
        console.log('🔄 Resetting database...');

        try {
            // Get all tables including migration tracking
            const tables = await this.query.getMany(`
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_type = 'BASE TABLE'
                ORDER BY table_name
            `);

            // Drop all tables
            for (const table of tables) {
                await this.query.query(`DROP TABLE IF EXISTS "${table.table_name}" CASCADE`);
                console.log(`🗑️ Dropped table: ${table.table_name}`);
            }

            // Drop all custom types
            const types = await this.query.getMany(`
                SELECT t.typname as type_name
                FROM pg_type t
                JOIN pg_enum e ON t.oid = e.enumtypid
                GROUP BY t.typname
            `);

            for (const type of types) {
                await this.query.query(`DROP TYPE IF EXISTS "${type.type_name}" CASCADE`);
                console.log(`🗑️ Dropped type: ${type.type_name}`);
            }

            console.log('✅ Database reset completed');
        } catch (error) {
            console.error('❌ Database reset failed:', error);
            throw error;
        }
    }

    /**
     * Check database status
     */
    async status() {
        try {
            const tables = await this.query.getMany(`
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_type = 'BASE TABLE'
                ORDER BY table_name
            `);

            const types = await this.query.getMany(`
                SELECT t.typname as type_name
                FROM pg_type t
                JOIN pg_enum e ON t.oid = e.enumtypid
                GROUP BY t.typname
                ORDER BY t.typname
            `);

            console.log('📊 Database Status:');
            console.log(`Tables (${tables.length}):`, tables.map(t => t.table_name));
            console.log(`Types (${types.length}):`, types.map(t => t.type_name));

            return { tables, types };
        } catch (error) {
            console.error('❌ Failed to check status:', error);
            throw error;
        }
    }
}

module.exports = FreshMigrator;