/**
 * Prometheus Metrics Exporter
 * Handles Prometheus metric exposition and configuration
 * @version 1.0.0
 * @author Mikrotik Billing System
 */

const promClient = require('prom-client');
const fs = require('fs').promises;
const path = require('path');

class PrometheusExporter {
  constructor(config = {}) {
    this.config = {
      port: config.port || 9090,
      endpoint: config.endpoint || '/metrics',
      prefix: config.prefix || 'mikrotik_billing_',
      labels: config.labels || {},
      buckets: {
        duration: config.buckets?.duration || [0.001, 0.005, 0.015, 0.05, 0.1, 0.5, 1, 5, 10],
        size: config.buckets?.size || [100, 1000, 10000, 100000, 1000000],
        database: config.buckets?.database || [0.001, 0.01, 0.05, 0.1, 0.5, 1, 5],
        mikrotik: config.buckets?.mikrotik || [0.1, 0.5, 1, 2, 5, 10, 30],
        cache: config.buckets?.cache || [0.0001, 0.001, 0.01, 0.1, 1]
      },
      collectDefaultMetrics: config.collectDefaultMetrics !== false,
      collectInterval: config.collectInterval || 15000,
      enableCompression: config.enableCompression !== false,
      maxMetricsSize: config.maxMetricsSize || 50 * 1024 * 1024, // 50MB
      ...config
    };

    // Create Prometheus registry
    this.registry = new promClient.Registry();

    // Set default labels
    this.setDefaultLabels();

    // Initialize metrics
    this.initializeMetrics();

    // Start collection if enabled
    if (this.config.collectDefaultMetrics) {
      this.startDefaultMetricsCollection();
    }

    // Metric cache for performance
    this.metricsCache = new Map();
    this.cacheExpiry = 5000; // 5 seconds
    this.lastCacheUpdate = 0;
  }

  /**
   * Set default labels for all metrics
   */
  setDefaultLabels() {
    const defaultLabels = {
      service: 'mikrotik-billing',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      instance: require('os').hostname(),
      ...this.config.labels
    };

    this.registry.setDefaultLabels(defaultLabels);
  }

  /**
   * Initialize Prometheus metrics
   */
  initializeMetrics() {
    // HTTP Metrics
    this.httpRequestDuration = new promClient.Histogram({
      name: `${this.config.prefix}http_request_duration_seconds`,
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code', 'user_id', 'location_id', 'api_version'],
      buckets: this.config.buckets.duration,
      registers: [this.registry]
    });

    this.httpRequestTotal = new promClient.Counter({
      name: `${this.config.prefix}http_requests_total`,
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code', 'user_id', 'location_id', 'api_version'],
      registers: [this.registry]
    });

    this.httpRequestActive = new promClient.Gauge({
      name: `${this.config.prefix}http_requests_active`,
      help: 'Number of active HTTP requests',
      labelNames: ['method', 'route'],
      registers: [this.registry]
    });

    this.httpResponseSize = new promClient.Histogram({
      name: `${this.config.prefix}http_response_size_bytes`,
      help: 'Size of HTTP responses in bytes',
      labelNames: ['method', 'route', 'status_code'],
      buckets: this.config.buckets.size,
      registers: [this.registry]
    });

    // Business Metrics
    this.customersTotal = new promClient.Gauge({
      name: `${this.config.prefix}customers_total`,
      help: 'Total number of customers',
      labelNames: ['location_id', 'status', 'type'],
      registers: [this.registry]
    });

    this.vouchersTotal = new promClient.Gauge({
      name: `${this.config.prefix}vouchers_total`,
      help: 'Total number of vouchers',
      labelNames: ['location_id', 'status', 'type', 'profile'],
      registers: [this.registry]
    });

    this.revenueTotal = new promClient.Counter({
      name: `${this.config.prefix}revenue_total`,
      help: 'Total revenue in currency units',
      labelNames: ['location_id', 'payment_method', 'currency', 'period'],
      registers: [this.registry]
    });

    this.activeUsers = new promClient.Gauge({
      name: `${this.config.prefix}active_users`,
      help: 'Number of active users',
      labelNames: ['location_id', 'user_type', 'plan_type'],
      registers: [this.registry]
    });

    this.paymentsTotal = new promClient.Counter({
      name: `${this.config.prefix}payments_total`,
      help: 'Total number of payments',
      labelNames: ['location_id', 'status', 'method', 'currency'],
      registers: [this.registry]
    });

    this.paymentAmount = new promClient.Histogram({
      name: `${this.config.prefix}payment_amount`,
      help: 'Payment amounts in currency units',
      labelNames: ['location_id', 'method', 'currency'],
      buckets: [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000],
      registers: [this.registry]
    });

    // Database Metrics
    this.dbConnectionsActive = new promClient.Gauge({
      name: `${this.config.prefix}database_connections_active`,
      help: 'Number of active database connections',
      labelNames: ['pool', 'database', 'state'],
      registers: [this.registry]
    });

    this.dbQueryDuration = new promClient.Histogram({
      name: `${this.config.prefix}database_query_duration_seconds`,
      help: 'Duration of database queries in seconds',
      labelNames: ['operation', 'table', 'pool', 'query_type'],
      buckets: this.config.buckets.database,
      registers: [this.registry]
    });

    this.dbQueriesTotal = new promClient.Counter({
      name: `${this.config.prefix}database_queries_total`,
      help: 'Total number of database queries',
      labelNames: ['operation', 'table', 'pool', 'status', 'query_type'],
      registers: [this.registry]
    });

    this.dbTransactionsTotal = new promClient.Counter({
      name: `${this.config.prefix}database_transactions_total`,
      help: 'Total number of database transactions',
      labelNames: ['pool', 'status'],
      registers: [this.registry]
    });

    // Cache Metrics
    this.cacheHitRate = new promClient.Gauge({
      name: `${this.config.prefix}cache_hit_rate`,
      help: 'Cache hit rate percentage',
      labelNames: ['cache_type', 'cache_name', 'operation'],
      registers: [this.registry]
    });

    this.cacheOperations = new promClient.Counter({
      name: `${this.config.prefix}cache_operations_total`,
      help: 'Total number of cache operations',
      labelNames: ['cache_type', 'cache_name', 'operation', 'result'],
      registers: [this.registry]
    });

    this.cacheSize = new promClient.Gauge({
      name: `${this.config.prefix}cache_size_bytes`,
      help: 'Cache size in bytes',
      labelNames: ['cache_type', 'cache_name'],
      registers: [this.registry]
    });

    this.cacheEvictions = new promClient.Counter({
      name: `${this.config.prefix}cache_evictions_total`,
      help: 'Total number of cache evictions',
      labelNames: ['cache_type', 'cache_name', 'reason'],
      registers: [this.registry]
    });

    // Mikrotik Metrics
    this.mikrotikConnectionsActive = new promClient.Gauge({
      name: `${this.config.prefix}mikrotik_connections_active`,
      help: 'Number of active Mikrotik connections',
      labelNames: ['location_id', 'connection_type', 'status'],
      registers: [this.registry]
    });

    this.mikrotikApiDuration = new promClient.Histogram({
      name: `${this.config.prefix}mikrotik_api_duration_seconds`,
      help: 'Duration of Mikrotik API calls in seconds',
      labelNames: ['location_id', 'operation', 'command', 'success'],
      buckets: this.config.buckets.mikrotik,
      registers: [this.registry]
    });

    this.mikrotikApiErrors = new promClient.Counter({
      name: `${this.config.prefix}mikrotik_api_errors_total`,
      help: 'Total number of Mikrotik API errors',
      labelNames: ['location_id', 'operation', 'error_type', 'command'],
      registers: [this.registry]
    });

    this.mikrotikUsers = new promClient.Gauge({
      name: `${this.config.prefix}mikrotik_users`,
      help: 'Number of Mikrotik users',
      labelNames: ['location_id', 'user_type', 'status'],
      registers: [this.registry]
    });

    this.mikrotikBandwidth = new promClient.Gauge({
      name: `${this.config.prefix}mikrotik_bandwidth_bps`,
      help: 'Mikrotik bandwidth usage in bits per second',
      labelNames: ['location_id', 'interface', 'direction'],
      registers: [this.registry]
    });

    // System Metrics
    this.systemCpuUsage = new promClient.Gauge({
      name: `${this.config.prefix}system_cpu_usage_percent`,
      help: 'System CPU usage percentage',
      labelNames: ['core'],
      registers: [this.registry]
    });

    this.systemMemoryUsage = new promClient.Gauge({
      name: `${this.config.prefix}system_memory_usage_bytes`,
      help: 'System memory usage in bytes',
      labelNames: ['type'],
      registers: [this.registry]
    });

    this.systemDiskUsage = new promClient.Gauge({
      name: `${this.config.prefix}system_disk_usage_percent`,
      help: 'System disk usage percentage',
      labelNames: ['mount_point'],
      registers: [this.registry]
    });

    this.systemNetworkIO = new promClient.Counter({
      name: `${this.config.prefix}system_network_io_bytes_total`,
      help: 'System network I/O in bytes',
      labelNames: ['interface', 'direction'],
      registers: [this.registry]
    });

    // Application Metrics
    this.appUptime = new promClient.Gauge({
      name: `${this.config.prefix}app_uptime_seconds`,
      help: 'Application uptime in seconds',
      registers: [this.registry]
    });

    this.appMemoryUsage = new promClient.Gauge({
      name: `${this.config.prefix}app_memory_usage_bytes`,
      help: 'Application memory usage in bytes',
      labelNames: ['type'],
      registers: [this.registry]
    });

    this.appEventLoopLag = new promClient.Gauge({
      name: `${this.config.prefix}app_event_loop_lag_seconds`,
      help: 'Event loop lag in seconds',
      registers: [this.registry]
    });

    this.appActiveHandles = new promClient.Gauge({
      name: `${this.config.prefix}app_active_handles`,
      help: 'Number of active handles',
      registers: [this.registry]
    });

    // WhatsApp Metrics
    this.whatsappSessionsActive = new promClient.Gauge({
      name: `${this.config.prefix}whatsapp_sessions_active`,
      help: 'Number of active WhatsApp sessions',
      labelNames: ['location_id', 'status'],
      registers: [this.registry]
    });

    this.whatsappMessagesTotal = new promClient.Counter({
      name: `${this.config.prefix}whatsapp_messages_total`,
      help: 'Total number of WhatsApp messages',
      labelNames: ['location_id', 'direction', 'status', 'template'],
      registers: [this.registry]
    });

    this.whatsappQueueSize = new promClient.Gauge({
      name: `${this.config.prefix}whatsapp_queue_size`,
      help: 'WhatsApp message queue size',
      labelNames: ['location_id', 'priority'],
      registers: [this.registry]
    });

    // Security Metrics
    this.authAttempts = new promClient.Counter({
      name: `${this.config.prefix}auth_attempts_total`,
      help: 'Total authentication attempts',
      labelNames: ['user_type', 'status', 'method'],
      registers: [this.registry]
    });

    this.authFailures = new promClient.Counter({
      name: `${this.config.prefix}auth_failures_total`,
      help: 'Total authentication failures',
      labelNames: ['user_type', 'reason', 'ip_address'],
      registers: [this.registry]
    });

    this.securityEvents = new promClient.Counter({
      name: `${this.config.prefix}security_events_total`,
      help: 'Total security events',
      labelNames: ['event_type', 'severity', 'source'],
      registers: [this.registry]
    });

    // Error Metrics
    this.errorsTotal = new promClient.Counter({
      name: `${this.config.prefix}errors_total`,
      help: 'Total number of errors',
      labelNames: ['error_type', 'component', 'severity'],
      registers: [this.registry]
    });

    this.panicsTotal = new promClient.Counter({
      name: `${this.config.prefix}panics_total`,
      help: 'Total number of panics',
      labelNames: ['component', 'reason'],
      registers: [this.registry]
    });

    // Create metric map for easy access
    this.metrics = {
      http: {
        requestDuration: this.httpRequestDuration,
        requestTotal: this.httpRequestTotal,
        requestActive: this.httpRequestActive,
        responseSize: this.httpResponseSize
      },
      business: {
        customersTotal: this.customersTotal,
        vouchersTotal: this.vouchersTotal,
        revenueTotal: this.revenueTotal,
        activeUsers: this.activeUsers,
        paymentsTotal: this.paymentsTotal,
        paymentAmount: this.paymentAmount
      },
      database: {
        connectionsActive: this.dbConnectionsActive,
        queryDuration: this.dbQueryDuration,
        queriesTotal: this.dbQueriesTotal,
        transactionsTotal: this.dbTransactionsTotal
      },
      cache: {
        hitRate: this.cacheHitRate,
        operations: this.cacheOperations,
        size: this.cacheSize,
        evictions: this.cacheEvictions
      },
      mikrotik: {
        connectionsActive: this.mikrotikConnectionsActive,
        apiDuration: this.mikrotikApiDuration,
        apiErrors: this.mikrotikApiErrors,
        users: this.mikrotikUsers,
        bandwidth: this.mikrotikBandwidth
      },
      system: {
        cpuUsage: this.systemCpuUsage,
        memoryUsage: this.systemMemoryUsage,
        diskUsage: this.systemDiskUsage,
        networkIO: this.systemNetworkIO
      },
      application: {
        uptime: this.appUptime,
        memoryUsage: this.appMemoryUsage,
        eventLoopLag: this.appEventLoopLag,
        activeHandles: this.appActiveHandles
      },
      whatsapp: {
        sessionsActive: this.whatsappSessionsActive,
        messagesTotal: this.whatsappMessagesTotal,
        queueSize: this.whatsappQueueSize
      },
      security: {
        authAttempts: this.authAttempts,
        authFailures: this.authFailures,
        securityEvents: this.securityEvents
      },
      errors: {
        errorsTotal: this.errorsTotal,
        panicsTotal: this.panicsTotal
      }
    };
  }

  /**
   * Start default metrics collection
   */
  startDefaultMetricsCollection() {
    promClient.collectDefaultMetrics({
      register: this.registry,
      prefix: this.config.prefix,
      labels: this.config.labels
    });

    // Start custom collection interval
    this.collectionInterval = setInterval(() => {
      this.collectCustomMetrics();
    }, this.config.collectInterval);
  }

  /**
   * Collect custom application metrics
   */
  collectCustomMetrics() {
    try {
      // Update application metrics
      this.updateApplicationMetrics();

      // Update system metrics
      this.updateSystemMetrics();

      // Update other custom metrics
      this.updateCustomMetrics();
    } catch (error) {
      console.error('Error collecting custom metrics:', error);
    }
  }

  /**
   * Update application-specific metrics
   */
  updateApplicationMetrics() {
    const memUsage = process.memoryUsage();

    this.appMemoryUsage
      .labels('heap_used')
      .set(memUsage.heapUsed);

    this.appMemoryUsage
      .labels('heap_total')
      .set(memUsage.heapTotal);

    this.appMemoryUsage
      .labels('external')
      .set(memUsage.external);

    this.appMemoryUsage
      .labels('rss')
      .set(memUsage.rss);

    this.appUptime.set(process.uptime());
    this.appActiveHandles.set(process._getActiveHandles().length);

    // Measure event loop lag
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1e9;
      this.appEventLoopLag.set(lag);
    });
  }

  /**
   * Update system metrics
   */
  updateSystemMetrics() {
    const os = require('os');
    const cpus = os.cpus();

    // Update CPU metrics
    cpus.forEach((cpu, index) => {
      const total = Object.values(cpu.times).reduce((sum, time) => sum + time, 0);
      const idle = cpu.times.idle;
      const usage = ((total - idle) / total) * 100;

      this.systemCpuUsage.labels(`core_${index}`).set(usage);
    });

    // Update memory metrics
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    this.systemMemoryUsage.labels('total').set(totalMem);
    this.systemMemoryUsage.labels('used').set(usedMem);
    this.systemMemoryUsage.labels('free').set(freeMem);
  }

  /**
   * Update other custom metrics
   */
  updateCustomMetrics() {
    // This method would be extended to collect application-specific metrics
    // from various sources like databases, caches, external services, etc.
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics() {
    const now = Date.now();

    // Check cache
    if (this.lastCacheUpdate && (now - this.lastCacheUpdate) < this.cacheExpiry) {
      return this.metricsCache.get('prometheus');
    }

    try {
      // Generate metrics
      const metrics = await this.registry.metrics();

      // Check size limit
      if (metrics.length > this.config.maxMetricsSize) {
        throw new Error(`Metrics size exceeds limit: ${metrics.length} bytes`);
      }

      // Cache metrics
      this.metricsCache.set('prometheus', metrics);
      this.lastCacheUpdate = now;

      return metrics;
    } catch (error) {
      console.error('Error generating metrics:', error);
      return '# Error generating metrics\n';
    }
  }

  /**
   * Get metrics as JSON
   */
  async getMetricsJSON() {
    try {
      const metrics = await this.registry.getMetricsAsJSON();
      return {
        timestamp: Date.now(),
        metrics
      };
    } catch (error) {
      console.error('Error generating JSON metrics:', error);
      return {
        timestamp: Date.now(),
        error: error.message,
        metrics: []
      };
    }
  }

  /**
   * Get specific metric by name
   */
  getMetric(name) {
    return this.registry.getSingleMetric(name);
  }

  /**
   * Get all metrics metadata
   */
  getMetricsMetadata() {
    return this.registry.getMetricsAsJSON().map(metric => ({
      name: metric.name,
      help: metric.help,
      type: metric.type,
      labelNames: metric.labelNames
    }));
  }

  /**
   * Remove metric by name
   */
  removeMetric(name) {
    this.registry.removeSingleMetric(name);
  }

  /**
   * Clear all metrics
   */
  clearMetrics() {
    this.registry.clear();
    this.metricsCache.clear();
  }

  /**
   * Export metrics to file
   */
  async exportMetricsToFile(filePath) {
    try {
      const metrics = await this.getMetrics();
      await fs.writeFile(filePath, metrics);
      return true;
    } catch (error) {
      console.error('Error exporting metrics to file:', error);
      return false;
    }
  }

  /**
   * Import metrics from file
   */
  async importMetricsFromFile(filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      // This would need custom parsing logic to import metrics
      // For now, just return the data
      return data;
    } catch (error) {
      console.error('Error importing metrics from file:', error);
      return null;
    }
  }

  /**
   * Create a new metric
   */
  createMetric(type, name, help, options = {}) {
    const MetricClass = this.getMetricClass(type);
    if (!MetricClass) {
      throw new Error(`Invalid metric type: ${type}`);
    }

    const metricConfig = {
      name: `${this.config.prefix}${name}`,
      help,
      registers: [this.registry],
      ...options
    };

    return new MetricClass(metricConfig);
  }

  /**
   * Get metric class by type
   */
  getMetricClass(type) {
    switch (type) {
      case 'counter':
        return promClient.Counter;
      case 'gauge':
        return promClient.Gauge;
      case 'histogram':
        return promClient.Histogram;
      case 'summary':
        return promClient.Summary;
      default:
        return null;
    }
  }

  /**
   * Register metric with custom labels
   */
  registerMetricWithLabels(metric, labels) {
    if (metric && typeof metric.labels === 'function') {
      return metric.labels(labels);
    }
    return metric;
  }

  /**
   * Get registry for external use
   */
  getRegistry() {
    return this.registry;
  }

  /**
   * Get configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Get metric statistics
   */
  getMetricStats() {
    const metrics = this.registry.getMetricsAsJSON();

    return {
      totalMetrics: metrics.length,
      byType: metrics.reduce((acc, metric) => {
        acc[metric.type] = (acc[metric.type] || 0) + 1;
        return acc;
      }, {}),
      cacheHitRate: this.metricsCache.size > 0 ? 1 : 0,
      lastCacheUpdate: this.lastCacheUpdate,
      registrySize: this.registry.size
    };
  }

  /**
   * Cleanup and shutdown
   */
  shutdown() {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }

    this.clearMetrics();
    this.registry.clear();
  }
}

module.exports = PrometheusExporter;