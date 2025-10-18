#!/usr/bin/env node

/**
 * Mikrotik Billing System - Main Entry Point
 *
 * This is the new modular server architecture that replaces the monolithic server.js
 *
 * Features:
 * - Enhanced security with comprehensive validation
 * - Rate limiting and DDoS protection
 * - Database connection pooling with read replicas
 * - Redis caching with multiple strategies
 * - Session management with security features
 * - Comprehensive error handling and logging
 * - Graceful shutdown handling
 * - Health checks and monitoring
 */

const Application = require('./src/app');

async function bootstrap() {
  const app = new Application();

  try {
    // Initialize application
    await app.initialize();

    // Run database migrations
    await app.runMigrations();

    // Seed initial data if needed
    if (process.env.SEED_DATA === 'true') {
      await app.seedData();
    }

    // Start the server
    await app.start();

  } catch (error) {
    console.error('💥 Bootstrap failed:', error);
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Mikrotik Billing System

Usage: node server-new.js [options]

Options:
  --help, -h          Show this help message
  --version, -v       Show version
  --migrate           Run migrations only
  --seed              Seed initial data only
  --health            Run health checks only

Environment Variables:
  NODE_ENV            Environment (development/production)
  PORT                Server port (default: 3000)
  HOST                Server host (default: 0.0.0.0)
  DB_HOST             Database host
  DB_PORT             Database port
  DB_NAME             Database name
  DB_USER             Database user
  DB_PASSWORD         Database password
  REDIS_HOST          Redis host
  REDIS_PORT          Redis port
  JWT_SECRET          JWT secret key (required)
  SESSION_SECRET      Session secret key

Examples:
  node server-new.js                    # Start server
  node server-new.js --migrate         # Run migrations
  node server-new.js --seed            # Seed data
  node server-new.js --health          # Health check
`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  try {
    const packageJson = require('./package.json');
    console.log(`Mikrotik Billing System v${packageJson.version}`);
  } catch {
    console.log('Mikrotik Billing System v1.0.0');
  }
  process.exit(0);
}

// Handle specific commands
if (args.includes('--migrate')) {
  const app = new Application();
  app.initialize()
    .then(() => app.runMigrations())
    .then(() => {
      console.log('✅ Migrations completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
  return;
}

if (args.includes('--seed')) {
  const app = new Application();
  app.initialize()
    .then(() => app.seedData())
    .then(() => {
      console.log('✅ Data seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Data seeding failed:', error);
      process.exit(1);
    });
  return;
}

if (args.includes('--health')) {
  const app = new Application();
  app.initialize()
    .then(() => app.performHealthChecks())
    .then(() => {
      console.log('✅ Health checks completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Health checks failed:', error);
      process.exit(1);
    });
  return;
}

// Start the application normally
bootstrap();