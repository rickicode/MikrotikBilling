const { v4: uuidv4 } = require('uuid');
const LoggerService = require('../services/LoggerService');
const MonitoringService = require('../services/MonitoringService');
const CacheService = require('../services/CacheService');
const SessionManager = require('../services/SessionManager');
const WorkerService = require('../services/WorkerService');
const QueueService = require('../services/QueueService');
const ReadReplicasManager = require('../config/readReplicas');
const SecurityLogger = require('../services/SecurityLogger');
const PerformanceMonitor = require('../services/PerformanceMonitor');

/**
 * Enhanced Service Container with Factory Pattern and Circular Dependency Detection
 * Implements Domain-Driven Design principles with proper dependency injection
 */
class EnhancedServiceContainer {
  constructor(config = {}) {
    this.config = {
      enableLogging: config.enableLogging !== false,
      enableMonitoring: config.enableMonitoring !== false,
      enableCaching: config.enableCaching !== false,
      enableWorkers: config.enableWorkers !== false,
      enableQueues: config.enableQueues !== false,
      enableReadReplicas: config.enableReadReplicas !== false,
      enableFactories: config.enableFactories !== false,
      enableCircularDependencyDetection: config.enableCircularDependencyDetection !== false,
      ...config
    };

    this.services = new Map();
    this.factories = new Map();
    this.singletons = new Map();
    this.dependencies = new Map();
    this.isInitialized = false;
    this.isShuttingDown = false;
    this.initializationStack = [];
  }

  /**
   * Register a service factory function
   */
  registerFactory(name, factory, options = {}) {
    this.factories.set(name, {
      factory,
      singleton: options.singleton !== false,
      dependencies: options.dependencies || [],
      domain: options.domain || 'core',
      priority: options.priority || 0
    });
  }

  /**
   * Register a service instance directly
   */
  registerService(name, service, options = {}) {
    this.services.set(name, service);
    if (options.singleton) {
      this.singletons.set(name, service);
    }
  }

  /**
   * Create a service using factory pattern
   */
  async create(serviceName, options = {}) {
    // Check for circular dependencies
    if (this.config.enableCircularDependencyDetection) {
      if (this.initializationStack.includes(serviceName)) {
        const cycle = [...this.initializationStack.slice(this.initializationStack.indexOf(serviceName)), serviceName];
        throw new Error(`Circular dependency detected: ${cycle.join(' -> ')}`);
      }
    }

    // Return singleton if exists
    if (this.singletons.has(serviceName)) {
      return this.singletons.get(serviceName);
    }

    // Check if service is already created
    if (this.services.has(serviceName)) {
      return this.services.get(serviceName);
    }

    // Check factory registry
    const factoryConfig = this.factories.get(serviceName);
    if (factoryConfig) {
      return await this.createFromFactory(serviceName, factoryConfig, options);
    }

    // Fallback to legacy initialization
    return await this.createLegacy(serviceName);
  }

  /**
   * Create service from factory
   */
  async createFromFactory(serviceName, factoryConfig, options = {}) {
    this.initializationStack.push(serviceName);

    try {
      // Resolve dependencies first
      const dependencies = {};
      for (const depName of factoryConfig.dependencies) {
        dependencies[depName] = await this.create(depName, options);
      }

      // Create service instance
      const service = await factoryConfig.factory(this, dependencies, options);

      // Cache singleton if required
      if (factoryConfig.singleton) {
        this.singletons.set(serviceName, service);
      } else {
        this.services.set(serviceName, service);
      }

      // Track dependencies for analysis
      this.dependencies.set(serviceName, factoryConfig.dependencies);

      this.initializationStack.pop();
      return service;

    } catch (error) {
      this.initializationStack.pop();
      throw new Error(`Failed to create service '${serviceName}': ${error.message}`);
    }
  }

  /**
   * Legacy service creation for backward compatibility
   */
  async createLegacy(serviceName) {
    switch (serviceName) {
      case 'logger':
        if (this.config.enableLogging) {
          const loggerService = new LoggerService(this.config.logging);
          this.services.set('logger', loggerService);
          return loggerService;
        }
        break;

      case 'securityLogger':
        const securityLogger = new SecurityLogger();
        this.services.set('securityLogger', securityLogger);
        global.securityLogger = securityLogger;
        return securityLogger;

      case 'performanceMonitor':
        const performanceMonitor = new PerformanceMonitor();
        this.services.set('performanceMonitor', performanceMonitor);
        global.performanceMonitor = performanceMonitor;
        return performanceMonitor;

      case 'monitoring':
        if (this.config.enableMonitoring) {
          const monitoringService = new MonitoringService(this.config.monitoring);
          this.services.set('monitoring', monitoringService);
          return monitoringService;
        }
        break;

      case 'cache':
        if (this.config.enableCaching) {
          try {
            const cacheService = new CacheService(this.config.cache);
            await cacheService.getClient().connect();
            this.services.set('cache', cacheService);
            return cacheService;
          } catch (error) {
            console.warn(`Cache service initialization failed: ${error.message}`);
            this.config.enableCaching = false;
          }
        }
        break;

      case 'sessionManager':
        if (this.services.has('database')) {
          const db = this.services.get('database');
          const sessionManager = new SessionManager(db, this.config.sessions);
          this.services.set('sessionManager', sessionManager);
          return sessionManager;
        }
        break;

      case 'workers':
        if (this.config.enableWorkers) {
          const workerService = new WorkerService(this.config.workers);
          this.services.set('workers', workerService);
          return workerService;
        }
        break;

      case 'queues':
        if (this.config.enableQueues) {
          try {
            const queueService = new QueueService(this.config.queues);
            await queueService.connect();
            this.services.set('queues', queueService);
            return queueService;
          } catch (error) {
            console.warn(`Queue service initialization failed: ${error.message}`);
            this.config.enableQueues = false;
          }
        }
        break;

      case 'readReplicas':
        if (this.config.enableReadReplicas && this.config.readReplicas?.replicas?.length > 0) {
          const primaryConfig = this.config.database || {};
          const replicaConfigs = this.config.readReplicas.replicas;
          const readReplicasManager = new ReadReplicasManager(primaryConfig, replicaConfigs);
          this.services.set('readReplicas', readReplicasManager);
          return readReplicasManager;
        }
        break;

      default:
        throw new Error(`Unknown service: ${serviceName}`);
    }

    throw new Error(`Service '${serviceName}' could not be created`);
  }

  /**
   * Initialize all services with proper dependency ordering
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    console.log('🔧 Initializing enhanced service container...');

    try {
      // Register service factories
      this.registerServiceFactories();

      // Initialize services by priority order
      await this.initializeByPriority();

      // Setup service integrations
      this.setupServiceIntegrations();

      // Start services
      await this.startServices();

      this.isInitialized = true;
      console.log('✅ Enhanced service container initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize enhanced service container:', error);
      throw error;
    }
  }

  /**
   * Register all service factories
   */
  registerServiceFactories() {
    // Core infrastructure services
    this.registerFactory('logger', (container, deps) => {
      return new LoggerService(container.config.logging);
    }, {
      singleton: true,
      domain: 'infrastructure',
      priority: 100
    });

    this.registerFactory('cache', (container, deps) => {
      return new CacheService(container.config.cache);
    }, {
      singleton: true,
      domain: 'infrastructure',
      priority: 90,
      dependencies: ['logger']
    });

    this.registerFactory('monitoring', (container, deps) => {
      return new MonitoringService(container.config.monitoring);
    }, {
      singleton: true,
      domain: 'infrastructure',
      priority: 80,
      dependencies: ['logger']
    });

    this.registerFactory('queues', (container, deps) => {
      return new QueueService(container.config.queues);
    }, {
      singleton: true,
      domain: 'infrastructure',
      priority: 70,
      dependencies: ['logger', 'cache']
    });

    this.registerFactory('workers', (container, deps) => {
      return new WorkerService(container.config.workers);
    }, {
      singleton: true,
      domain: 'infrastructure',
      priority: 60,
      dependencies: ['logger', 'monitoring']
    });

    // Domain services
    this.registerFactory('billingService', (container, deps) => {
      const BillingService = require('../domains/billing/services/BillingService');
      return new BillingService(container.config.billing);
    }, {
      singleton: true,
      domain: 'billing',
      priority: 50,
      dependencies: ['logger', 'cache', 'monitoring']
    });

    this.registerFactory('customerService', (container, deps) => {
      const CustomerService = require('../domains/customers/services/CustomerService');
      return new CustomerService(container.config.customers);
    }, {
      singleton: true,
      domain: 'customers',
      priority: 50,
      dependencies: ['logger', 'cache', 'monitoring']
    });

    this.registerFactory('voucherService', (container, deps) => {
      const VoucherService = require('../domains/vouchers/services/VoucherService');
      return new VoucherService(container.config.vouchers);
    }, {
      singleton: true,
      domain: 'vouchers',
      priority: 50,
      dependencies: ['logger', 'cache', 'monitoring']
    });

    this.registerFactory('paymentService', (container, deps) => {
      const PaymentService = require('../domains/payments/services/PaymentService');
      return new PaymentService(container.config.payments);
    }, {
      singleton: true,
      domain: 'payments',
      priority: 50,
      dependencies: ['logger', 'cache', 'monitoring']
    });

    this.registerFactory('notificationService', (container, deps) => {
      const NotificationService = require('../domains/notifications/services/NotificationService');
      return new NotificationService(container.config.notifications);
    }, {
      singleton: true,
      domain: 'notifications',
      priority: 50,
      dependencies: ['logger', 'queues', 'monitoring']
    });
  }

  /**
   * Initialize services by priority order
   */
  async initializeByPriority() {
    // Sort factories by priority (higher priority first)
    const sortedFactories = Array.from(this.factories.entries())
      .sort(([,a], [,b]) => b.priority - a.priority);

    for (const [serviceName, factoryConfig] of sortedFactories) {
      try {
        await this.create(serviceName);
        console.log(`✅ ${serviceName} initialized`);
      } catch (error) {
        console.warn(`⚠️  ${serviceName} initialization failed:`, error.message);
      }
    }

    // Initialize legacy services
    const legacyServices = [
      'securityLogger',
      'performanceMonitor',
      'sessionManager',
      'readReplicas'
    ];

    for (const serviceName of legacyServices) {
      try {
        await this.create(serviceName);
        console.log(`✅ ${serviceName} initialized`);
      } catch (error) {
        console.warn(`⚠️  ${serviceName} initialization failed:`, error.message);
      }
    }
  }

  /**
   * Setup service integrations with enhanced patterns
   */
  setupServiceIntegrations() {
    // Integration between Logger and Monitoring
    if (this.services.has('logger') && this.services.has('monitoring')) {
      const logger = this.services.get('logger');
      const monitoring = this.services.get('monitoring');

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

    // Cross-domain service integrations
    this.setupDomainIntegrations();
  }

  /**
   * Setup domain-specific integrations
   */
  setupDomainIntegrations() {
    // Billing integration with Payment service
    if (this.services.has('billingService') && this.services.has('paymentService')) {
      const billing = this.services.get('billingService');
      const payments = this.services.get('paymentService');

      // Set up payment callbacks for billing
      billing.onPaymentCompleted = payments.handlePaymentCompleted.bind(payments);
    }

    // Customer integration with Notification service
    if (this.services.has('customerService') && this.services.has('notificationService')) {
      const customers = this.services.get('customerService');
      const notifications = this.services.get('notificationService');

      customers.onCustomerCreated = notifications.sendWelcomeMessage.bind(notifications);
      customers.onPaymentOverdue = notifications.sendPaymentReminder.bind(notifications);
    }

    // Voucher integration with Billing service
    if (this.services.has('voucherService') && this.services.has('billingService')) {
      const vouchers = this.services.get('voucherService');
      const billing = this.services.get('billingService');

      vouchers.onVoucherActivated = billing.recordVoucherActivation.bind(billing);
    }
  }

  /**
   * Start all services
   */
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

    // Start domain services
    await this.startDomainServices();

    // Setup graceful shutdown
    this.setupGracefulShutdown();
  }

  /**
   * Start domain-specific services
   */
  async startDomainServices() {
    const domainServices = ['billingService', 'customerService', 'voucherService', 'paymentService', 'notificationService'];

    for (const serviceName of domainServices) {
      const service = this.services.get(serviceName);
      if (service && typeof service.start === 'function') {
        try {
          await service.start();
          console.log(`✅ ${serviceName} started`);
        } catch (error) {
          console.warn(`⚠️  Failed to start ${serviceName}:`, error.message);
        }
      }
    }
  }

  /**
   * Setup default queue processors with enhanced patterns
   */
  setupDefaultQueueProcessors() {
    const queues = this.services.get('queues');
    const logger = this.services.get('logger');

    // Email notification queue
    queues.createQueue('email-notifications', { concurrency: 5 });
    queues.process('email-notifications', async (job) => {
      const { to, subject, template, data } = job.data;

      // Use notification service if available
      if (this.services.has('notificationService')) {
        const notifications = this.services.get('notificationService');
        return await notifications.sendEmail(to, subject, template, data);
      }

      // Fallback to simulated email sending
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

      // Use notification service if available
      if (this.services.has('notificationService')) {
        const notifications = this.services.get('notificationService');
        return await notifications.sendWhatsApp(to, message, type);
      }

      // Fallback to simulated WhatsApp sending
      await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

      if (logger) {
        logger.loggers.whatsapp.info('WhatsApp message sent', {
          to: to.replace(/@.*/, '@***'),
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

      // Use worker service for CPU-intensive report generation
      if (this.services.has('workers')) {
        const workers = this.services.get('workers');
        return await workers.generateReport({
          type: reportType,
          dateRange,
          format
        });
      }

      // Fallback to inline processing
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
      return {
        reportType,
        dateRange,
        format,
        generatedAt: new Date().toISOString(),
        size: Math.floor(Math.random() * 1000000)
      };
    });

    // Database cleanup queue
    queues.createQueue('database-cleanup', { concurrency: 1 });
    queues.process('database-cleanup', async (job) => {
      const { operation, table, olderThan } = job.data;

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

  /**
   * Setup graceful shutdown with proper ordering
   */
  setupGracefulShutdown() {
    const gracefulShutdown = async (signal) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      console.log(`\n📡 Received ${signal}, shutting down enhanced services...`);

      const shutdownPromises = [];

      // Shutdown domain services first
      const domainServices = ['billingService', 'customerService', 'voucherService', 'paymentService', 'notificationService'];
      for (const serviceName of domainServices) {
        const service = this.services.get(serviceName);
        if (service && typeof service.shutdown === 'function') {
          shutdownPromises.push(
            service.shutdown().catch(error =>
              console.warn(`Failed to shutdown ${serviceName}:`, error.message)
            )
          );
        }
      }

      // Shutdown infrastructure services in reverse order
      const infrastructureServices = ['queues', 'workers', 'readReplicas', 'sessionManager', 'cache', 'monitoring'];
      for (const serviceName of infrastructureServices) {
        const service = this.services.get(serviceName);
        if (service) {
          shutdownPromises.push(
            this.shutdownService(serviceName, service).catch(console.error)
          );
        }
      }

      await Promise.all(shutdownPromises);
      console.log('✅ All enhanced services shut down gracefully');
      process.exit(0);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }

  /**
   * Shutdown individual service with error handling
   */
  async shutdownService(serviceName, service) {
    try {
      if (serviceName === 'queues') {
        await service.shutdown();
      } else if (serviceName === 'workers') {
        await service.shutdown();
      } else if (serviceName === 'readReplicas') {
        await service.shutdown();
      } else if (serviceName === 'sessionManager') {
        await service.shutdown();
      } else if (serviceName === 'cache') {
        await service.close();
      } else if (serviceName === 'monitoring') {
        return new Promise(resolve => {
          service.stop();
          resolve();
        });
      }
    } catch (error) {
      console.warn(`Failed to shutdown ${serviceName}:`, error.message);
    }
  }

  /**
   * Get service with automatic creation
   */
  get(serviceName) {
    return this.services.get(serviceName);
  }

  /**
   * Create or get service
   */
  async getOrCreate(serviceName) {
    return await this.create(serviceName);
  }

  /**
   * Check if service exists
   */
  has(serviceName) {
    return this.services.has(serviceName) || this.factories.has(serviceName);
  }

  /**
   * Get dependency graph for analysis
   */
  getDependencyGraph() {
    const graph = {};

    for (const [serviceName, dependencies] of this.dependencies) {
      graph[serviceName] = dependencies;
    }

    return graph;
  }

  /**
   * Get services by domain
   */
  getServicesByDomain(domain) {
    const domainServices = {};

    for (const [serviceName, factoryConfig] of this.factories) {
      if (factoryConfig.domain === domain) {
        domainServices[serviceName] = {
          priority: factoryConfig.priority,
          dependencies: factoryConfig.dependencies,
          singleton: factoryConfig.singleton
        };
      }
    }

    return domainServices;
  }

  /**
   * Legacy getter methods for backward compatibility
   */
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

  /**
   * Enhanced health check with domain-specific metrics
   */
  async getHealthStatus() {
    const health = {
      status: 'healthy',
      services: {},
      domains: {},
      dependencyGraph: this.getDependencyGraph(),
      timestamp: new Date().toISOString()
    };

    // Check all services
    for (const [name, service] of this.services) {
      try {
        const serviceHealth = await this.getServiceHealth(name, service);
        health.services[name] = serviceHealth;

        // Group by domain
        const factoryConfig = this.factories.get(name);
        if (factoryConfig) {
          if (!health.domains[factoryConfig.domain]) {
            health.domains[factoryConfig.domain] = { services: [], status: 'healthy' };
          }
          health.domains[factoryConfig.domain].services.push(name);

          if (serviceHealth.status !== 'healthy') {
            health.domains[factoryConfig.domain].status = 'degraded';
            health.status = 'degraded';
          }
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

  /**
   * Get health status for individual service
   */
  async getServiceHealth(name, service) {
    if (name === 'cache' && service) {
      return await service.healthCheck();
    } else if (name === 'monitoring' && service) {
      return {
        status: 'healthy',
        metrics: service.getAllMetrics()
      };
    } else if (name === 'workers' && service) {
      return {
        status: 'healthy',
        stats: service.getWorkerStatistics()
      };
    } else if (name === 'queues' && service) {
      const stats = await service.getStats();
      return {
        status: 'healthy',
        stats
      };
    } else if (name === 'readReplicas' && service) {
      const stats = service.getReplicationStats();
      return {
        status: stats.healthyReplicas > 0 ? 'healthy' : 'degraded',
        stats
      };
    } else if (service && typeof service.getHealthStatus === 'function') {
      return await service.getHealthStatus();
    } else {
      return { status: 'healthy' };
    }
  }

  /**
   * Get enhanced service statistics with domain grouping
   */
  async getServiceStatistics() {
    const stats = {
      services: {},
      domains: {},
      dependencies: this.getDependencyGraph(),
      timestamp: new Date().toISOString()
    };

    for (const [name, service] of this.services) {
      try {
        const serviceStats = await this.getServiceStatistics(name, service);
        stats.services[name] = serviceStats;

        // Group by domain
        const factoryConfig = this.factories.get(name);
        if (factoryConfig) {
          if (!stats.domains[factoryConfig.domain]) {
            stats.domains[factoryConfig.domain] = {};
          }
          stats.domains[factoryConfig.domain][name] = serviceStats;
        }
      } catch (error) {
        stats.services[name] = { error: error.message };
      }
    }

    return stats;
  }
}

module.exports = EnhancedServiceContainer;