const fp = require('fastify-plugin');
const DatabaseConfig = require('../config/database-config');
const ConnectionPool = require('../database/ConnectionPool');
const QueryOptimizer = require('../database/QueryOptimizer');
const TransactionManager = require('../database/TransactionManager');
const HealthMonitor = require('../database/HealthMonitor');
const MigrationRunner = require('../database/MigrationRunner');
const BackupManager = require('../database/BackupManager');

/**
 * Enhanced Database Plugin for Fastify
 * Provides enterprise-grade database connection pooling with:
 * - Dynamic pool sizing
 * - Connection lifecycle management
 * - Query optimization and caching
 * - Transaction management
 * - Health monitoring
 * - Automatic backup and recovery
 */
async function databasePlugin(fastify, options) {
  const { config: dbConfig = {}, enableMonitoring = true, enableCaching = true } = options;
  
  // Initialize database configuration
  const databaseConfig = new DatabaseConfig(dbConfig);
  
  // Initialize connection pool manager
  const connectionPool = new ConnectionPool(databaseConfig, {
    enableMonitoring,
    enableCaching,
    ...options.poolOptions
  });
  
  // Initialize query optimizer
  const queryOptimizer = new QueryOptimizer(connectionPool, {
    enableCaching,
    cacheSize: options.queryCacheSize || 1000,
    slowQueryThreshold: options.slowQueryThreshold || 1000
  });
  
  // Initialize transaction manager
  const transactionManager = new TransactionManager(connectionPool, {
    timeout: options.transactionTimeout || 30000,
    enableDeadlockDetection: true
  });
  
  // Initialize health monitor
  const healthMonitor = new HealthMonitor(connectionPool, {
    interval: options.healthCheckInterval || 30000,
    enableAlerts: enableMonitoring
  });
  
  // Initialize migration runner
  const migrationRunner = new MigrationRunner(connectionPool, {
    migrationsPath: options.migrationsPath || './migrations',
    autoRun: options.autoRunMigrations || false
  });
  
  // Initialize backup manager
  const backupManager = new BackupManager(connectionPool, {
    backupPath: options.backupPath || './backups',
    schedule: options.backupSchedule || '0 2 * * *', // Daily at 2 AM
    retentionDays: options.backupRetentionDays || 30
  });
  
  // Initialize all components
  await connectionPool.initialize();
  await queryOptimizer.initialize();
  await transactionManager.initialize();
  await healthMonitor.initialize();
  await migrationRunner.initialize();
  await backupManager.initialize();
  
  // Decorate Fastify instance with database services
  fastify.decorate('db', {
    // Core connection methods
    query: connectionPool.query.bind(connectionPool),
    queryOne: connectionPool.queryOne.bind(connectionPool),
    queryStream: connectionPool.queryStream.bind(connectionPool),
    
    // Transaction methods
    transaction: transactionManager.transaction.bind(transactionManager),
    savepoint: transactionManager.savepoint.bind(transactionManager),
    
    // Optimized query methods
    optimizedQuery: queryOptimizer.query.bind(queryOptimizer),
    preparedQuery: queryOptimizer.preparedQuery.bind(queryOptimizer),
    batchQuery: queryOptimizer.batchQuery.bind(queryOptimizer),
    
    // Management methods
    getPoolStats: connectionPool.getStatistics.bind(connectionPool),
    getQueryStats: queryOptimizer.getStatistics.bind(queryOptimizer),
    getTransactionStats: transactionManager.getStatistics.bind(transactionManager),
    healthCheck: healthMonitor.getHealthStatus.bind(healthMonitor),
    
    // Migration and backup
    migrate: migrationRunner.runMigrations.bind(migrationRunner),
    rollback: migrationRunner.rollback.bind(migrationRunner),
    backup: backupManager.createBackup.bind(backupManager),
    restore: backupManager.restore.bind(backupManager),
    
    // Direct access to components
    pool: connectionPool,
    optimizer: queryOptimizer,
    transactionManager,
    healthMonitor,
    migrationRunner,
    backupManager,
    config: databaseConfig
  });
  
  // Add database-specific hooks
  fastify.addHook('onRequest', async (request, reply) => {
    // Add request ID to database operations for tracing
    request.dbRequestId = request.id;
    
    // Track database operations for this request
    request.dbOperations = [];
    request.dbStartTime = Date.now();
  });
  
  fastify.addHook('onResponse', async (request, reply) => {
    // Log database operation statistics
    if (request.dbOperations && request.dbOperations.length > 0) {
      const totalTime = Date.now() - request.dbStartTime;
      const dbTime = request.dbOperations.reduce((sum, op) => sum + op.duration, 0);
      
      if (fastify.monitoring) {
        fastify.monitoring.recordPerformance('database_request', dbTime, {
          requestId: request.id,
          operationCount: request.dbOperations.length,
          totalRequestTime: totalTime,
          path: request.url,
          method: request.method
        });
      }
    }
  });
  
  // Graceful shutdown
  fastify.addHook('onClose', async (instance) => {
    await healthMonitor.shutdown();
    await backupManager.shutdown();
    await transactionManager.shutdown();
    await queryOptimizer.shutdown();
    await connectionPool.shutdown();
  });
  
  // Health check endpoint integration
  if (fastify.healthCheck) {
    fastify.healthCheck.addCheck('database', async () => {
      const health = await healthMonitor.getHealthStatus();
      return {
        status: health.overall.status === 'healthy' ? 'healthy' : 'unhealthy',
        details: health
      };
    });
  }
  
  fastify.log.info('Enhanced database plugin initialized successfully');
}

module.exports = fp(databasePlugin, {
  name: 'database',
  fastify: '4.x',
  dependencies: ['logger', 'monitoring']
});