const LoggerService = require('./LoggerService');
const MonitoringService = require('./MonitoringService');
const CacheService = require('./CacheService');
const SessionManager = require('./SessionManager');
const WorkerService = require('./WorkerService');
const QueueService = require('./QueueService');
const ReadReplicasManager = require('../config/readReplicas');
const SecurityLogger = require('./SecurityLogger');
const PerformanceMonitor = require('./PerformanceMonitor');

class ServiceContainer {
  constructor(config = {}) {
    this.config = {
      enableLogging: config.enableLogging !== false,
      enableMonitoring: config.enableMonitoring !== false,
      enableCaching: config.enableCaching !== false,
      enableWorkers: config.enableWorkers !== false,
      enableQueues: config.enableQueues !== false,
      enableReadReplicas: config.enableReadReplicas !== false,
      ...config
    };

    this.services = new Map();
    this.isInitialized = false;
    this.isShuttingDown = false;
  }

  async initialize() {
    if (this.isInitialized) {
      return;
    }

    console.log('🔧 Initializing service container...');

    try {
      // Initialize core services first
      await this.initializeCoreServices();

      // Initialize advanced services
      await this.initializeAdvancedServices();

      // Setup service integrations
      this.setupServiceIntegrations();

      // Start services
      await this.startServices();

      this.isInitialized = true;
      console.log('✅ Service container initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize service container:', error);
      throw error;
    }
  }

  async initializeCoreServices() {
    // Logger Service
    if (this.config.enableLogging) {
      const loggerService = new LoggerService(this.config.logging);
      this.services.set('logger', loggerService);
      console.log('✅ Logger service initialized');
    }

    // Security Logger
    const securityLogger = new SecurityLogger();
    this.services.set('securityLogger', securityLogger);
    global.securityLogger = securityLogger;

    // Performance Monitor
    const performanceMonitor = new PerformanceMonitor();
    this.services.set('performanceMonitor', performanceMonitor);
    global.performanceMonitor = performanceMonitor;

    // Monitoring Service
    if (this.config.enableMonitoring) {
      const monitoringService = new MonitoringService(this.config.monitoring);
      this.services.set('monitoring', monitoringService);
      console.log('✅ Monitoring service initialized');
    }
  }

  async initializeAdvancedServices() {
    // Cache Service
    if (this.config.enableCaching) {
      try {
        const cacheService = new CacheService(this.config.cache);
        await cacheService.getClient().connect(); // Test connection
        this.services.set('cache', cacheService);
        console.log('✅ Cache service initialized');
      } catch (error) {
        console.warn('⚠️  Cache service initialization failed:', error.message);
        this.config.enableCaching = false;
      }
    }

    // Session Manager
    if (this.services.has('database')) {
      const db = this.services.get('database');
      const sessionManager = new SessionManager(db, this.config.sessions);
      this.services.set('sessionManager', sessionManager);
      console.log('✅ Session manager initialized');
    }

    // Worker Service
    if (this.config.enableWorkers) {
      const workerService = new WorkerService(this.config.workers);
      this.services.set('workers', workerService);
      console.log('✅ Worker service initialized');
    }

    // Queue Service
    if (this.config.enableQueues) {
      try {
        const queueService = new QueueService(this.config.queues);
        await queueService.connect();
        this.services.set('queues', queueService);
        console.log('✅ Queue service initialized');
      } catch (error) {
        console.warn('⚠️  Queue service initialization failed:', error.message);
        this.config.enableQueues = false;
      }
    }

    // Read Replicas Manager
    if (this.config.enableReadReplicas && this.config.readReplicas?.replicas?.length > 0) {
      const primaryConfig = this.config.database || {};
      const replicaConfigs = this.config.readReplicas.replicas;
      const readReplicasManager = new ReadReplicasManager(primaryConfig, replicaConfigs);
      this.services.set('readReplicas', readReplicasManager);
      console.log('✅ Read replicas manager initialized');
    }
  }

  setupServiceIntegrations() {
    // Integration between Logger and Monitoring
    if (this.services.has('logger') && this.services.has('monitoring')) {
      const logger = this.services.get('logger');
      const monitoring = this.services.get('monitoring');

      // Forward logs to monitoring service
      logger.loggers.application.on('log', (level, message, meta) => {
        if (level === 'error') {
          monitoring.recordError(new Error(message), meta);
        }
      });
    }

    // Integration between Cache and Monitoring
    if (this.services.has('cache') && this.services.has('monitoring')) {
      const cache = this.services.get('cache');
      const monitoring = this.services.get('monitoring');

      // Monitor cache operations
      const originalGet = cache.get.bind(cache);
      cache.get = async (key, ...args) => {
        const start = Date.now();
        const result = await originalGet(key, ...args);
        const duration = Date.now() - start;

        monitoring.recordCacheOperation('get', result !== null, duration);
        return result;
      };

      const originalSet = cache.set.bind(cache);
      cache.set = async (key, value, ttl, ...args) => {
        const start = Date.now();
        const result = await originalSet(key, value, ttl, ...args);
        const duration = Date.now() - start;

        monitoring.recordCacheOperation('set', true, duration);
        return result;
      };
    }

    // Integration between Workers and Monitoring
    if (this.services.has('workers') && this.services.has('monitoring')) {
      const workers = this.services.get('workers');
      const monitoring = this.services.get('monitoring');

      // Monitor worker performance
      workers.on('task-completed', (task) => {
        monitoring.recordPerformance('worker-task', task.duration, {
          taskType: task.type,
          workerId: task.workerId
        });
      });

      workers.on('task-failed', (task, error) => {
        monitoring.recordError(error, {
          taskId: task.id,
          taskType: task.type,
          workerId: task.workerId
        });
      });
    }

    // Integration between Queues and Monitoring
    if (this.services.has('queues') && this.services.has('monitoring')) {
      const queues = this.services.get('queues');
      const monitoring = this.services.get('monitoring');

      // Monitor queue performance
      queues.on('job-completed', (job) => {
        const duration = Date.now() - new Date(job.startedAt).getTime();
        monitoring.recordPerformance('queue-job', duration, {
          queueName: job.queueName,
          jobId: job.id
        });
      });

      queues.on('job-failed', (job, error) => {
        monitoring.recordError(new Error(error), {
          jobId: job.id,
          queueName: job.queueName,
          attempts: job.attempts
        });
      });

      queues.on('job-dead', (job) => {
        monitoring.recordError(new Error(`Job dead after ${job.attempts} attempts`), {
          jobId: job.id,
          queueName: job.queueName,
          finalError: job.error
        });
      });
    }

    // Integration between Read Replicas and Monitoring
    if (this.services.has('readReplicas') && this.services.has('monitoring')) {
      const readReplicas = this.services.get('readReplicas');
      const monitoring = this.services.get('monitoring');

      // Monitor replica performance
      readReplicas.on('query-executed', (event) => {
        monitoring.recordDatabaseQuery(event.duration, null, {
          replicaId: event.replicaId,
          operation: 'read'
        });
      });

      readReplicas.on('query-failed', (event) => {
        monitoring.recordDatabaseQuery(event.duration, new Error(event.error), {
          replicaId: event.replicaId,
          operation: 'read'
        });
      });

      readReplicas.on('replica-health', (event) => {
        monitoring.recordHealthCheck('replica', {
          replicaId: event.replicaId,
          status: event.status,
          responseTime: event.responseTime,
          replicationLag: event.replicationLag
        });
      });
    }

    // Integration between Session Manager and Cache
    if (this.services.has('sessionManager') && this.services.has('cache')) {
      const sessionManager = this.services.get('sessionManager');
      const cache = this.services.get('cache');

      // Cache sessions in Redis
      const originalValidateSession = sessionManager.validateSession.bind(sessionManager);
      sessionManager.validateSession = async (sessionId, request) => {
        // Try cache first
        const cacheKey = `session:${sessionId}`;
        let session = await cache.get(cacheKey);

        if (!session) {
          // Cache miss - validate from database
          session = await originalValidateSession(sessionId, request);

          if (session) {
            // Cache the session
            await cache.set(cacheKey, session, 300); // 5 minutes cache
          }
        }

        return session;
      };

      // Invalidate cache on session changes
      const originalInvalidateSession = sessionManager.invalidateSession.bind(sessionManager);
      sessionManager.invalidateSession = async (sessionId, reason) => {
        await originalInvalidateSession(sessionId, reason);
        await cache.del(`session:${sessionId}`);
      };
    }
  }

  async startServices() {
    // Start monitoring service
    if (this.services.has('monitoring')) {
      const monitoring = this.services.get('monitoring');
      monitoring.start();
    }

    // Setup default queue processors
    if (this.services.has('queues')) {
      this.setupDefaultQueueProcessors();
    }

    // Setup graceful shutdown
    this.setupGracefulShutdown();
  }

  setupDefaultQueueProcessors() {
    const queues = this.services.get('queues');
    const workers = this.services.get('workers');
    const logger = this.services.get('logger');

    // Email notification queue
    queues.createQueue('email-notifications', { concurrency: 5 });
    queues.process('email-notifications', async (job) => {
      const { to, subject, template, data } = job.data;

      // Simulate email sending
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

      if (logger) {
        logger.loggers.email.info('Email sent', {
          to,
          subject,
          template,
          jobId: job.id
        });
      }

      return { sent: true, to };
    });

    // WhatsApp notification queue
    queues.createQueue('whatsapp-notifications', { concurrency: 3 });
    queues.process('whatsapp-notifications', async (job) => {
      const { to, message, type } = job.data;

      // Simulate WhatsApp sending
      await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

      if (logger) {
        logger.loggers.whatsapp.info('WhatsApp message sent', {
          to: to.replace(/@.*/, '@***'), // Privacy
          type,
          jobId: job.id
        });
      }

      return { sent: true, to, type };
    });

    // Report generation queue
    queues.createQueue('report-generation', { concurrency: 2 });
    queues.process('report-generation', async (job) => {
      const { reportType, dateRange, format } = job.data;

      if (workers) {
        // Use worker for CPU-intensive report generation
        return await workers.generateReport({
          type: reportType,
          dateRange,
          format
        });
      } else {
        // Fallback to inline processing
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
        return {
          reportType,
          dateRange,
          format,
          generatedAt: new Date().toISOString(),
          size: Math.floor(Math.random() * 1000000)
        };
      }
    });

    // Database cleanup queue
    queues.createQueue('database-cleanup', { concurrency: 1 });
    queues.process('database-cleanup', async (job) => {
      const { operation, table, olderThan } = job.data;

      // Simulate cleanup operation
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

      if (logger) {
        logger.loggers.database.info('Database cleanup completed', {
          operation,
          table,
          olderThan,
          jobId: job.id
        });
      }

      return { cleaned: true, operation, table };
    });
  }

  setupGracefulShutdown() {
    const gracefulShutdown = async (signal) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      console.log(`\n📡 Received ${signal}, shutting down services...`);

      const shutdownPromises = [];

      // Shutdown services in reverse order
      if (this.services.has('queues')) {
        shutdownPromises.push(
          this.services.get('queues').shutdown().catch(console.error)
        );
      }

      if (this.services.has('workers')) {
        shutdownPromises.push(
          this.services.get('workers').shutdown().catch(console.error)
        );
      }

      if (this.services.has('readReplicas')) {
        shutdownPromises.push(
          this.services.get('readReplicas').shutdown().catch(console.error)
        );
      }

      if (this.services.has('sessionManager')) {
        shutdownPromises.push(
          this.services.get('sessionManager').shutdown().catch(console.error)
        );
      }

      if (this.services.has('cache')) {
        shutdownPromises.push(
          this.services.get('cache').close().catch(console.error)
        );
      }

      if (this.services.has('monitoring')) {
        shutdownPromises.push(
          new Promise(resolve => {
            this.services.get('monitoring').stop();
            resolve();
          })
        );
      }

      await Promise.all(shutdownPromises);
      console.log('✅ All services shut down gracefully');
      process.exit(0);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }

  // Service getter methods
  get(serviceName) {
    return this.services.get(serviceName);
  }

  getLogger(category = 'application') {
    const logger = this.services.get('logger');
    return logger ? logger.getLogger(category) : console;
  }

  getMonitoring() {
    return this.services.get('monitoring');
  }

  getCache() {
    return this.services.get('cache');
  }

  getSessionManager() {
    return this.services.get('sessionManager');
  }

  getWorkers() {
    return this.services.get('workers');
  }

  getQueues() {
    return this.services.get('queues');
  }

  getReadReplicas() {
    return this.services.get('readReplicas');
  }

  getSecurityLogger() {
    return this.services.get('securityLogger');
  }

  getPerformanceMonitor() {
    return this.services.get('performanceMonitor');
  }

  // Health check for all services
  async getHealthStatus() {
    const health = {
      status: 'healthy',
      services: {},
      timestamp: new Date().toISOString()
    };

    for (const [name, service] of this.services) {
      try {
        if (name === 'cache' && service) {
          const cacheHealth = await service.healthCheck();
          health.services[name] = {
            status: cacheHealth.status === 'healthy' ? 'healthy' : 'unhealthy',
            ...cacheHealth
          };
        } else if (name === 'monitoring' && service) {
          health.services[name] = {
            status: 'healthy',
            metrics: service.getAllMetrics()
          };
        } else if (name === 'workers' && service) {
          health.services[name] = {
            status: 'healthy',
            stats: service.getWorkerStatistics()
          };
        } else if (name === 'queues' && service) {
          const stats = await service.getStats();
          health.services[name] = {
            status: 'healthy',
            stats
          };
        } else if (name === 'readReplicas' && service) {
          const stats = service.getReplicationStats();
          health.services[name] = {
            status: stats.healthyReplicas > 0 ? 'healthy' : 'degraded',
            stats
          };
        } else {
          health.services[name] = {
            status: 'healthy'
          };
        }
      } catch (error) {
        health.services[name] = {
          status: 'unhealthy',
          error: error.message
        };
        health.status = 'degraded';
      }
    }

    return health;
  }

  // Get service statistics
  async getServiceStatistics() {
    const stats = {
      services: {},
      timestamp: new Date().toISOString()
    };

    for (const [name, service] of this.services) {
      try {
        if (name === 'logger' && service) {
          stats.services[name] = service.getLogStatistics();
        } else if (name === 'workers' && service) {
          stats.services[name] = service.getWorkerStatistics();
        } else if (name === 'queues' && service) {
          stats.services[name] = await service.getStats();
        } else if (name === 'readReplicas' && service) {
          stats.services[name] = service.getReplicationStats();
        } else {
          stats.services[name] = { status: 'active' };
        }
      } catch (error) {
        stats.services[name] = { error: error.message };
      }
    }

    return stats;
  }
}

module.exports = ServiceContainer;