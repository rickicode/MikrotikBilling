require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { db } = require('../src/database/DatabaseManager');

class MigrationRunner {
    constructor() {
        this.migrationsDir = __dirname;
    }

    async ensureMigrationTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS migrations (
                id SERIAL PRIMARY KEY,
                filename VARCHAR(255) NOT NULL,
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(filename)
            );
        `;
        await db.query(query);
    }

    async getExecutedMigrations() {
        const query = 'SELECT filename FROM migrations ORDER BY filename';
        const result = await db.query(query);
        return result.map(row => row.filename);
    }

    async getPendingMigrations() {
        const executed = await this.getExecutedMigrations();
        const files = await fs.readdir(this.migrationsDir);

        return files
            .filter(file =>
                file.endsWith('.sql') &&
                file !== 'migrate.js' &&
                !executed.includes(file)
            )
            .sort();
    }

    async executeMigration(filename) {
        const filePath = path.join(this.migrationsDir, filename);
        const migrationSQL = await fs.readFile(filePath, 'utf8');

        console.log(`\n📝 Executing migration: ${filename}`);

        try {
            // Initialize database if not already initialized
            if (!db.isInitialized) {
                await db.initialize();
            }

            // Split migration SQL by semicolon and execute each statement
            const statements = migrationSQL
                .split(';')
                .map(s => s.trim())
                .filter(s => s && !s.startsWith('--'));

            // Execute migration in transaction
            await db.transaction(async (trx) => {
                for (const statement of statements) {
                    if (statement.trim()) {
                        await trx.raw(statement);
                    }
                }

                // Record migration as executed
                await trx('migrations').insert({ filename });
            });

            console.log(`✅ Migration ${filename} executed successfully`);
        } catch (error) {
            console.error(`❌ Migration ${filename} failed:`, error.message);
            throw error;
        }
    }

    async rollbackMigration(filename) {
        // In a real implementation, you would store rollback SQL for each migration
        // For now, this is just a placeholder
        console.log(`⏪ Rolling back migration: ${filename}`);
        console.log('⚠️  Rollback not implemented yet. Manual intervention required.');
    }

    async migrate() {
        console.log('🚀 Starting database migration...');

        await this.ensureMigrationTable();
        const pending = await this.getPendingMigrations();

        if (pending.length === 0) {
            console.log('✨ No pending migrations. Database is up to date!');
            return;
        }

        console.log(`Found ${pending.length} pending migrations:`);
        pending.forEach(file => console.log(`  - ${file}`));

        for (const migration of pending) {
            await this.executeMigration(migration);
        }

        console.log('\n🎉 All migrations executed successfully!');
    }

    async rollback(steps = 1) {
        console.log(`⏪ Rolling back ${steps} migration(s)...`);

        const query = `
            SELECT filename
            FROM migrations
            ORDER BY executed_at DESC
            LIMIT $1
        `;
        const result = await db.query(query, [steps]);

        if (result.length === 0) {
            console.log('ℹ️  No migrations to rollback');
            return;
        }

        for (const row of result) {
            await this.rollbackMigration(row.filename);
        }
    }

    async status() {
        console.log('\n📊 Migration Status:');
        console.log('===================\n');

        const executed = await this.getExecutedMigrations();
        const files = await fs.readdir(this.migrationsDir);
        const migrations = files
            .filter(file =>
                file.endsWith('.sql') &&
                file !== 'migrate.js'
            )
            .sort();

        console.table(migrations.map(migration => ({
            Migration: migration,
            Status: executed.includes(migration) ? '✅ Executed' : '⏳ Pending'
        })));

        const pendingCount = migrations.length - executed.length;
        console.log(`\nTotal: ${migrations.length} | Executed: ${executed.length} | Pending: ${pendingCount}`);
    }

    async reset() {
        console.log('⚠️  WARNING: This will drop all tables and recreate them from scratch!');

        // In a production environment, you might want to add a confirmation prompt
        // For now, proceed with caution

        try {
            // Drop all tables in the correct order (handling dependencies)
            const dropTables = `
                DROP SCHEMA public CASCADE;
                CREATE SCHEMA public;
            `;

            await db.query(dropTables);
            console.log('✅ All tables dropped successfully');

            // Now run migrations
            await this.migrate();

        } catch (error) {
            console.error('❌ Reset failed:', error.message);
            throw error;
        }
    }
}

// CLI handler
async function main() {
    const command = process.argv[2];
    const steps = parseInt(process.argv[3]) || 1;

    // Initialize database connection
    await db.initialize();
    const runner = new MigrationRunner();

    try {
        switch (command) {
            case 'up':
            case 'migrate':
                await runner.migrate();
                break;
            case 'down':
            case 'rollback':
                await runner.rollback(steps);
                break;
            case 'status':
                await runner.status();
                break;
            case 'reset':
                await runner.reset();
                break;
            default:
                console.log('Usage:');
                console.log('  node migrate.js [command] [options]');
                console.log('');
                console.log('Commands:');
                console.log('  migrate, up     Run all pending migrations');
                console.log('  rollback, down  Rollback [n] migrations (default: 1)');
                console.log('  status          Show migration status');
                console.log('  reset           Drop all tables and run all migrations');
        }
    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        await db.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = MigrationRunner;