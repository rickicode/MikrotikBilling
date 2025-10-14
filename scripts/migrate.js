#!/usr/bin/env node

/**
 * Database Migration Script
 * Usage: node scripts/migrate.js [command]
 * Commands:
 *   migrate   - Run pending migrations (default)
 *   fresh     - Drop all tables and re-run all migrations
 *   reset     - Drop everything including migrations
 *   status    - Show migration status
 */

require('dotenv').config();
const { Pool } = require('pg');
const Migrator = require('../src/database/Migrator');

// Create PostgreSQL pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres.hvylyfmdhrruzlyclkgw:p1kunPISAN@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres',
    max: 10,
    min: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

async function runMigration(command = 'migrate') {
    const migrator = new Migrator(pool);

    try {
        switch (command) {
            case 'migrate':
                await migrator.migrate();
                break;
            case 'fresh':
                console.log('⚠️  WARNING: This will delete ALL data!');
                if (process.env.NODE_ENV === 'production') {
                    const readline = require('readline');
                    const rl = readline.createInterface({
                        input: process.stdin,
                        output: process.stdout
                    });

                    const answer = await new Promise(resolve => {
                        rl.question('Are you sure? (yes/no): ', resolve);
                    });

                    if (answer.toLowerCase() !== 'yes') {
                        console.log('❌ Cancelled');
                        rl.close();
                        return;
                    }
                    rl.close();
                }
                await migrator.fresh();
                break;
            case 'reset':
                console.log('⚠️  WARNING: This will delete ALL data including migrations!');
                if (process.env.NODE_ENV === 'production') {
                    const readline = require('readline');
                    const rl = readline.createInterface({
                        input: process.stdin,
                        output: process.stdout
                    });

                    const answer = await new Promise(resolve => {
                        rl.question('Are you sure? (yes/no): ', resolve);
                    });

                    if (answer.toLowerCase() !== 'yes') {
                        console.log('❌ Cancelled');
                        rl.close();
                        return;
                    }
                    rl.close();
                }
                await migrator.reset();
                break;
            case 'status':
                await migrator.status();
                break;
            default:
                console.log(`Unknown command: ${command}`);
                console.log('Available commands: migrate, fresh, reset, status');
        }
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Get command from arguments
const command = process.argv[2] || 'migrate';

// Run migration
runMigration(command);