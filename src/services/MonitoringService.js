const prometheus = require('prom-client');
const logger = console;

/**
 * Production Monitoring and Metrics Collection
 * Implements Prometheus metrics collection and monitoring
 */
class MonitoringService {
  constructor() {
    this.initializeMetrics();
    this.initializeMiddleware();
  }

  /**
   * Initialize all Prometheus metrics
   */
  initializeMetrics() {
    // Create a Registry which registers the metrics
    this.register = new prometheus.Registry();

    // Enable the collection of default metrics
    prometheus.collectDefaultMetrics({ register: this.register });

    // Custom metrics for the application
    this.metrics = {
      // HTTP Request Metrics
      httpRequestDuration: new prometheus.Histogram({
        name: 'http_request_duration_seconds',
        help: 'Duration of HTTP requests in seconds',
        labelNames: ['method', 'route', 'status_code'],
        buckets: [0.1, 0.5, 1, 2, 5, 10],
        registers: [this.register]
      }),

      httpRequestTotal: new prometheus.Counter({
        name: 'http_requests_total',
        help: 'Total number of HTTP requests',
        labelNames: ['method', 'route', 'status_code'],
        registers: [this.register]
      }),

      httpRequestActive: new prometheus.Gauge({
        name: 'http_requests_active',
        help: 'Number of active HTTP requests',
        registers: [this.register]
      }),

      // Business Metrics
      mikrotikConnectionStatus: new prometheus.Gauge({
        name: 'mikrotik_connection_status',
        help: 'Mikrotik API connection status (1 = connected, 0 = disconnected)',
        labelNames: ['router_ip'],
        registers: [this.register]
      }),

      activeUsers: new prometheus.Gauge({
        name: 'active_users_total',
        help: 'Number of active users',
        labelNames: ['user_type'], // hotspot, pppoe
        registers: [this.register]
      }),

      totalVouchers: new prometheus.Gauge({
        name: 'vouchers_total',
        help: 'Total number of vouchers',
        labelNames: ['status'], // active, used, expired
        registers: [this.register]
      }),

      // Database Metrics
      databaseConnections: new prometheus.Gauge({
        name: 'database_connections_active',
        help: 'Number of active database connections',
        registers: [this.register]
      }),

      databaseQueryDuration: new prometheus.Histogram({
        name: 'database_query_duration_seconds',
        help: 'Duration of database queries in seconds',
        labelNames: ['query_type', 'table'],
        buckets: [0.001, 0.01, 0.1, 1, 5],
        registers: [this.register]
      }),

      // Payment Metrics
      paymentTransactions: new prometheus.Counter({
        name: 'payment_transactions_total',
        help: 'Total number of payment transactions',
        labelNames: ['payment_method', 'status'], // success, failed, pending
        registers: [this.register]
      }),

      paymentAmount: new prometheus.Histogram({
        name: 'payment_amount_rupiah',
        help: 'Payment transaction amounts in Rupiah',
        labelNames: ['payment_method'],
        buckets: [10000, 50000, 100000, 250000, 500000, 1000000, 2500000],
        registers: [this.register]
      }),

      // System Metrics
      systemMemoryUsage: new prometheus.Gauge({
        name: 'system_memory_usage_bytes',
        help: 'System memory usage in bytes',
        registers: [this.register]
      }),

      systemCpuUsage: new prometheus.Gauge({
        name: 'system_cpu_usage_percent',
        help: 'System CPU usage percentage',
        registers: [this.register]
      }),

      // Notification Metrics
      notificationDelivery: new prometheus.Counter({
        name: 'notification_deliveries_total',
        help: 'Total number of notification deliveries',
        labelNames: ['channel', 'status'], // whatsapp, email, success, failed
        registers: [this.register]
      }),

      // Backup Metrics
      backupOperations: new prometheus.Counter({
        name: 'backup_operations_total',
        help: 'Total number of backup operations',
        labelNames: ['operation', 'status'], // create, restore, success, failed
        registers: [this.register]
      }),

      backupSize: new prometheus.Gauge({
        name: 'backup_size_bytes',
        help: 'Size of backup files',
        labelNames: ['backup_type'],
        registers: [this.register]
      }),

      // Error Metrics
      errorTotal: new prometheus.Counter({
        name: 'errors_total',
        help: 'Total number of errors',
        labelNames: ['error_type', 'severity'],
        registers: [this.register]
      })
    };

    // Set default values
    this.metrics.httpRequestActive.set(0);
    this.metrics.databaseConnections.set(0);
    this.metrics.systemMemoryUsage.set(0);
    this.metrics.systemCpuUsage.set(0);
  }

  /**
   * Initialize Express middleware for metrics collection
   */
  initializeMiddleware() {
    this.middleware = {
      /**
       * Metrics collection middleware
       */
      collectMetrics: (req, res, next) => {
        const start = Date.now();

        // Increment active requests
        this.metrics.httpRequestActive.inc();

        // Track response
        res.on('finish', () => {
          const duration = (Date.now() - start) / 1000;
          const route = req.route?.path || req.path || 'unknown';

          // Record metrics
          this.metrics.httpRequestDuration
            .labels(req.method, route, res.statusCode)
            .observe(duration);

          this.metrics.httpRequestTotal
            .labels(req.method, route, res.statusCode)
            .inc();

          // Decrement active requests
          this.metrics.httpRequestActive.dec();
        });

        next();
      },

      /**
       * Metrics endpoint middleware
       */
      metricsEndpoint: async (req, res) => {
        try {
          res.set('Content-Type', this.register.contentType);
          res.end(await this.register.metrics());
        } catch (error) {
          logger.error('Error serving metrics:', error);
          res.status(500).send('Error generating metrics');
        }
      },

      /**
       * Health check endpoint
       */
      healthCheck: async (req, res) => {
        const health = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          version: process.env.npm_package_version || '1.0.0',
          checks: {}
        };

        // Check database
        try {
          const db = require('../database/Database');
          await db.getPool().query('SELECT 1');
          health.checks.database = { status: 'healthy' };
        } catch (error) {
          health.checks.database = { status: 'unhealthy', error: error.message };
          health.status = 'degraded';
        }

        // Check Redis
        try {
          const redis = require('../config/redis');
          await redis.ping();
          health.checks.redis = { status: 'healthy' };
        } catch (error) {
          health.checks.redis = { status: 'unhealthy', error: error.message };
          health.status = 'degraded';
        }

        // Check Mikrotik connection
        try {
          const MikrotikClient = require('../services/MikrotikClient');
          const client = new MikrotikClient();
          await client.testConnection();
          health.checks.mikrotik = { status: 'healthy' };
        } catch (error) {
          health.checks.mikrotik = { status: 'unhealthy', error: error.message };
          health.status = 'degraded';
        }

        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
      },

      /**
       * Ready check endpoint (includes business logic checks)
       */
      readyCheck: async (req, res) => {
        const ready = {
          status: 'ready',
          timestamp: new Date().toISOString(),
          checks: {}
        };

        // Check if system is ready to serve traffic
        try {
          // Check database migrations
          const db = require('../database/Database');
          await db.getPool().query('SELECT 1 FROM settings LIMIT 1');
          ready.checks.database = { status: 'ready' };
        } catch (error) {
          ready.checks.database = { status: 'not_ready', error: error.message };
          ready.status = 'not_ready';
        }

        // Check required configurations
        try {
          const settings = require('../config/settings');
          if (settings.get('mikrotik.host') && settings.get('mikrotik.username')) {
            ready.checks.configuration = { status: 'ready' };
          } else {
            throw new Error('Missing required Mikrotik configuration');
          }
        } catch (error) {
          ready.checks.configuration = { status: 'not_ready', error: error.message };
          ready.status = 'not_ready';
        }

        // Check payment system
        try {
          const paymentConfig = require('../config/payment');
          if (paymentConfig.isConfigured()) {
            ready.checks.payment = { status: 'ready' };
          } else {
            ready.checks.payment = { status: 'degraded', message: 'Payment system not fully configured' };
          }
        } catch (error) {
          ready.checks.payment = { status: 'not_ready', error: error.message };
          ready.status = 'not_ready';
        }

        const statusCode = ready.status === 'ready' ? 200 : 503;
        res.status(statusCode).json(ready);
      },

      /**
       * Live check endpoint (lightweight check for load balancers)
       */
      liveCheck: (req, res) => {
        res.status(200).json({
          status: 'live',
          timestamp: new Date().toISOString()
        });
      }
    };
  }

  /**
   * Update Mikrotik connection status
   */
  updateMikrotikStatus(routerIp, isConnected) {
    this.metrics.mikrotikConnectionStatus
      .labels(routerIp)
      .set(isConnected ? 1 : 0);
  }

  /**
   * Update active users count
   */
  updateActiveUsers(userType, count) {
    this.metrics.activeUsers.labels(userType).set(count);
  }

  /**
   * Update voucher counts
   */
  updateVoucherCounts(status, count) {
    this.metrics.totalVouchers.labels(status).set(count);
  }

  /**
   * Record database query
   */
  recordDatabaseQuery(queryType, table, duration) {
    this.metrics.databaseQueryDuration
      .labels(queryType, table)
      .observe(duration);
  }

  /**
   * Record payment transaction
   */
  recordPaymentTransaction(paymentMethod, status, amount) {
    this.metrics.paymentTransactions
      .labels(paymentMethod, status)
      .inc();

    if (amount && status === 'success') {
      this.metrics.paymentAmount
        .labels(paymentMethod)
        .observe(amount);
    }
  }

  /**
   * Record notification delivery
   */
  recordNotificationDelivery(channel, status) {
    this.metrics.notificationDelivery
      .labels(channel, status)
      .inc();
  }

  /**
   * Record backup operation
   */
  recordBackupOperation(operation, status, size) {
    this.metrics.backupOperations
      .labels(operation, status)
      .inc();

    if (size) {
      this.metrics.backupSize
        .labels(operation)
        .set(size);
    }
  }

  /**
   * Record error
   */
  recordError(errorType, severity = 'medium') {
    this.metrics.errorTotal
      .labels(errorType, severity)
      .inc();
  }

  /**
   * Update system metrics
   */
  updateSystemMetrics() {
    const memoryUsage = process.memoryUsage();
    this.metrics.systemMemoryUsage.set(memoryUsage.heapUsed);

    // CPU usage would require additional monitoring
    // This is a simplified version
    const cpuUsage = process.cpuUsage();
    this.metrics.systemCpuUsage.set(cpuUsage.user / 1000000); // Convert to percentage
  }

  /**
   * Get metrics for dashboard
   */
  async getDashboardMetrics() {
    return {
      httpRequests: {
        total: await this.metrics.httpRequestTotal.get(),
        duration: await this.metrics.httpRequestDuration.get(),
        active: await this.metrics.httpRequestActive.get()
      },
      users: {
        active: await this.metrics.activeUsers.get(),
        vouchers: await this.metrics.totalVouchers.get()
      },
      payments: {
        transactions: await this.metrics.paymentTransactions.get(),
        amount: await this.metrics.paymentAmount.get()
      },
      system: {
        memory: await this.metrics.systemMemoryUsage.get(),
        cpu: await this.metrics.systemCpuUsage.get()
      },
      notifications: {
        deliveries: await this.metrics.notificationDelivery.get()
      },
      backups: {
        operations: await this.metrics.backupOperations.get(),
        size: await this.metrics.backupSize.get()
      },
      errors: {
        total: await this.metrics.errorTotal.get()
      }
    };
  }

  /**
   * Reset all metrics (useful for testing)
   */
  resetMetrics() {
    return this.register.resetMetrics();
  }

  /**
   * Get Prometheus registry
   */
  getRegistry() {
    return this.register;
  }

  /**
   * Get all metrics
   */
  getMetrics() {
    return this.metrics;
  }
}

module.exports = MonitoringService;