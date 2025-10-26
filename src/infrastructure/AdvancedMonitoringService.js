const { EventEmitter } = require('events');
const promClient = require('prom-client');

/**
 * Advanced Monitoring Service
 * Provides comprehensive metrics collection, performance monitoring,
  * health checks, and observability features
 */
class AdvancedMonitoringService extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      // Monitoring settings
      serviceId: config.serviceId || 'mikrotik-billing-monitor',
      version: config.version || '1.0.0',
      environment: config.environment || 'production',

      // Metrics collection
      enablePrometheus: config.enablePrometheus !== false,
      enableCustomMetrics: config.enableCustomMetrics !== false,
      enablePerformanceMetrics: config.enablePerformanceMetrics !== false,
      enableBusinessMetrics: config.enableBusinessMetrics !== false,

      // Collection intervals
      defaultInterval: config.defaultInterval || 10000, // 10 seconds
      performanceInterval: config.performanceInterval || 5000, // 5 seconds
      businessInterval: config.businessInterval || 60000, // 1 minute

      // Alerts
      enableAlerts: config.enableAlerts !== false,
      alertThresholds: config.alertThresholds || {
        errorRate: 0.05, // 5%
        responseTime: 2000, // 2 seconds
        memoryUsage: 0.8, // 80%
        cpuUsage: 0.8 // 80%
      },

      // Retention
      metricsRetention: config.metricsRetention || 3600000, // 1 hour
      logsRetention: config.logsRetention || 86400000, // 24 hours

      // Export
      enableMetricsExport: config.enableMetricsExport !== false,
      metricsPort: config.metricsPort || 9090,
      metricsPath: config.metricsPath || '/metrics',

      ...config
    };

    // Initialize Prometheus metrics
    this.prometheusRegistry = new promClient.Registry();
    this.initializePrometheusMetrics();

    // Custom metrics storage
    this.customMetrics = new Map();
    this.performanceMetrics = new Map();
    this.businessMetrics = new Map();

    // Time series data
    this.timeSeriesData = new Map();
    this.metricsHistory = [];

    // Alerts
    this.activeAlerts = new Map();
    this.alertRules = new Map();

    // Health checks
    this.healthChecks = new Map();
    this.dependencyHealth = new Map();

    // System metrics
    this.systemMetrics = {
      memory: { usage: 0, total: 0, free: 0 },
      cpu: { usage: 0, load: [] },
      disk: { usage: 0, free: 0, total: 0 },
      network: { bytesIn: 0, bytesOut: 0 }
    };

    this.setupEventHandlers();
    this.startMetricsCollection();
  }

  initializePrometheusMetrics() {
    if (!this.config.enablePrometheus) return;

    // Default Prometheus metrics
    this.prometheusMetrics = {
      // Counter metrics
      httpRequestsTotal: new promClient.Counter({
        name: 'http_requests_total',
        help: 'Total number of HTTP requests',
        labelNames: ['method', 'route', 'status_code']
      }),

      httpRequestDuration: new promClient.Histogram({
        name: 'http_request_duration_seconds',
        help: 'Duration of HTTP requests in seconds',
        labelNames: ['method', 'route'],
        buckets: [0.1, 0.5, 1, 2, 5, 10]
      }),

      // Gauge metrics
      activeConnections: new promClient.Gauge({
        name: 'active_connections',
        help: 'Number of active connections'
      }),

      queueSize: new promClient.Gauge({
        name: 'queue_size',
        help: 'Size of processing queues',
        labelNames: ['queue_name']
      }),

      cacheHitRate: new promClient.Gauge({
        name: 'cache_hit_rate',
        help: 'Cache hit rate percentage',
        labelNames: ['cache_name']
      }),

      // Business metrics
      revenue: new promClient.Counter({
        name: 'revenue_total',
        help: 'Total revenue generated',
        labelNames: ['currency', 'payment_method']
      }),

      activeUsers: new promClient.Gauge({
        name: 'active_users',
        help: 'Number of active users',
        labelNames: ['user_type']
      }),

      // System metrics
      memoryUsage: new promClient.Gauge({
        name: 'memory_usage_bytes',
        help: 'Memory usage in bytes'
      }),

      cpuUsage: new promClient.Gauge({
        name: 'cpu_usage_percent',
        help: 'CPU usage percentage'
      })
    };

    // Register all metrics
    Object.values(this.prometheusMetrics).forEach(metric => {
      this.prometheusRegistry.registerMetric(metric);
    });

    // Add default labels
    this.prometheusRegistry.setDefaultLabels({
      service: this.config.serviceId,
      version: this.config.version,
      environment: this.config.environment
    });
  }

  setupEventHandlers() {
    this.on('metric-recorded', this.handleMetricRecorded.bind(this));
    this.on('alert-triggered', this.handleAlertTriggered.bind(this));
    this.on('alert-resolved', this.handleAlertResolved.bind(this));
    this.on('health-check-failed', this.handleHealthCheckFailed.bind(this));
  }

  /**
   * Record HTTP request metric
   */
  recordHttpRequest(method, route, statusCode, duration) {
    if (this.config.enablePrometheus) {
      this.prometheusMetrics.httpRequestsTotal
        .labels(method, route, statusCode.toString())
        .inc();

      this.prometheusMetrics.httpRequestDuration
        .labels(method, route)
        .observe(duration / 1000); // Convert to seconds
    }

    // Custom metric
    this.recordCustomMetric('http_requests', {
      method,
      route,
      status_code: statusCode,
      duration
    });

    this.emit('http-request-recorded', { method, route, statusCode, duration });
  }

  /**
   * Record business metric
   */
  recordBusinessMetric(metricName, value, labels = {}) {
    if (this.config.enablePrometheus && this.prometheusMetrics[metricName]) {
      if (typeof value === 'number') {
        if (this.prometheusMetrics[metricName].inc) {
          this.prometheusMetrics[metricName].labels(labels).inc(value);
        } else if (this.prometheusMetrics[metricName].set) {
          this.prometheusMetrics[metricName].labels(labels).set(value);
        }
      }
    }

    // Store in business metrics
    if (!this.businessMetrics.has(metricName)) {
      this.businessMetrics.set(metricName, []);
    }

    this.businessMetrics.get(metricName).push({
      value,
      labels,
      timestamp: Date.now()
    });

    // Limit history size
    const history = this.businessMetrics.get(metricName);
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }

    this.emit('business-metric-recorded', { metricName, value, labels });
  }

  /**
   * Record custom metric
   */
  recordCustomMetric(name, data, labels = {}) {
    const metric = {
      name,
      data,
      labels,
      timestamp: Date.now()
    };

    if (!this.customMetrics.has(name)) {
      this.customMetrics.set(name, []);
    }

    this.customMetrics.get(name).push(metric);

    // Limit history size
    const history = this.customMetrics.get(name);
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }

    // Add to time series
    const timeSeriesKey = `${name}:${JSON.stringify(labels)}`;
    if (!this.timeSeriesData.has(timeSeriesKey)) {
      this.timeSeriesData.set(timeSeriesKey, []);
    }

    this.timeSeriesData.get(timeSeriesKey).push({
      timestamp: Date.now(),
      value: typeof data === 'object' ? data.value || 0 : data
    });

    this.emit('metric-recorded', metric);
  }

  /**
   * Record performance metric
   */
  recordPerformanceMetric(operation, duration, metadata = {}) {
    const metric = {
      operation,
      duration,
      metadata,
      timestamp: Date.now()
    };

    if (!this.performanceMetrics.has(operation)) {
      this.performanceMetrics.set(operation, []);
    }

    this.performanceMetrics.get(operation).push(metric);

    // Calculate statistics
    const history = this.performanceMetrics.get(operation);
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }

    this.emit('performance-metric-recorded', metric);
  }

  /**
   * Register health check
   */
  registerHealthCheck(name, checkFunction, options = {}) {
    const healthCheck = {
      name,
      check: checkFunction,
      interval: options.interval || 30000, // 30 seconds
      timeout: options.timeout || 5000, // 5 seconds
      critical: options.critical !== false,
      enabled: true,
      lastCheck: null,
      status: 'unknown',
      lastResult: null
    };

    this.healthChecks.set(name, healthCheck);

    // Start health check
    this.startHealthCheck(name);

    console.log(`🏥 Registered health check: ${name}`);
  }

  /**
   * Start health check
   */
  async startHealthCheck(name) {
    const healthCheck = this.healthChecks.get(name);
    if (!healthCheck) return;

    const runCheck = async () => {
      if (!healthCheck.enabled) return;

      try {
        const startTime = Date.now();
        const result = await this.executeWithTimeout(
          healthCheck.check,
          healthCheck.timeout
        );

        const duration = Date.now() - startTime;

        healthCheck.lastCheck = Date.now();
        healthCheck.status = 'healthy';
        healthCheck.lastResult = {
          status: 'healthy',
          duration,
          result,
          timestamp: new Date().toISOString()
        };

        this.emit('health-check-passed', name, healthCheck.lastResult);

      } catch (error) {
        healthCheck.lastCheck = Date.now();
        healthCheck.status = 'unhealthy';
        healthCheck.lastResult = {
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString()
        };

        this.emit('health-check-failed', name, error, healthCheck.lastResult);

        if (healthCheck.critical) {
          this.triggerAlert(`health_check_${name}`, {
            type: 'health_check_failed',
            severity: 'critical',
            message: `Health check ${name} failed: ${error.message}`,
            details: healthCheck.lastResult
          });
        }
      }
    };

    // Run immediately
    runCheck();

    // Schedule periodic checks
    setInterval(runCheck, healthCheck.interval);
  }

  /**
   * Register alert rule
   */
  registerAlertRule(name, condition, options = {}) {
    const alertRule = {
      name,
      condition,
      options: {
        severity: options.severity || 'warning',
        message: options.message || `Alert triggered: ${name}`,
        cooldown: options.cooldown || 300000, // 5 minutes
        enabled: true,
        ...options
      },
      lastTriggered: null,
      isActive: false
    };

    this.alertRules.set(name, alertRule);
    console.log(`🚨 Registered alert rule: ${name}`);
  }

  /**
   * Trigger alert
   */
  triggerAlert(name, details) {
    const alert = {
      id: this.generateAlertId(),
      name,
      details,
      triggeredAt: new Date().toISOString(),
      severity: details.severity || 'warning',
      status: 'active'
    };

    this.activeAlerts.set(name, alert);

    // Check cooldown
    const alertRule = this.alertRules.get(name);
    if (alertRule) {
      const now = Date.now();
      if (alertRule.lastTriggered && (now - alertRule.lastTriggered) < alertRule.options.cooldown) {
        return; // Still in cooldown period
      }
      alertRule.lastTriggered = now;
      alertRule.isActive = true;
    }

    this.emit('alert-triggered', alert);
    console.warn(`🚨 Alert triggered: ${name} - ${details.message}`);
  }

  /**
   * Resolve alert
   */
  resolveAlert(name) {
    const alert = this.activeAlerts.get(name);
    if (!alert) return false;

    alert.status = 'resolved';
    alert.resolvedAt = new Date().toISOString();

    this.activeAlerts.delete(name);

    const alertRule = this.alertRules.get(name);
    if (alertRule) {
      alertRule.isActive = false;
    }

    this.emit('alert-resolved', alert);
    console.log(`✅ Alert resolved: ${name}`);

    return true;
  }

  /**
   * Get metrics for time range
   */
  getMetrics(name, timeRange = null) {
    const now = Date.now();
    const since = timeRange ? now - timeRange : 0;

    const metrics = this.timeSeriesData.get(name);
    if (!metrics) return [];

    return metrics.filter(metric => metric.timestamp >= since);
  }

  /**
   * Get aggregated metrics
   */
  getAggregatedMetrics(name, timeRange = null, aggregation = 'avg') {
    const metrics = this.getMetrics(name, timeRange);
    if (metrics.length === 0) return null;

    const values = metrics.map(m => m.value);

    switch (aggregation) {
      case 'avg':
        return values.reduce((a, b) => a + b, 0) / values.length;
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
      case 'sum':
        return values.reduce((a, b) => a + b, 0);
      case 'count':
        return values.length;
      default:
        return values[values.length - 1]; // Latest value
    }
  }

  /**
   * Get Prometheus metrics
   */
  getPrometheusMetrics() {
    if (!this.config.enablePrometheus) return null;

    return this.prometheusRegistry.metrics();
  }

  /**
   * Get comprehensive monitoring dashboard data
   */
  getDashboardData() {
    return {
      overview: {
        service: this.config.serviceId,
        version: this.config.version,
        environment: this.config.environment,
        uptime: Date.now() - (this.startTime || Date.now()),
        timestamp: new Date().toISOString()
      },
      system: this.systemMetrics,
      alerts: {
        active: Array.from(this.activeAlerts.values()),
        rules: Array.from(this.alertRules.values()).map(rule => ({
          name: rule.name,
          severity: rule.options.severity,
          isActive: rule.isActive,
          lastTriggered: rule.lastTriggered
        }))
      },
      health: {
        checks: Array.from(this.healthChecks.values()).map(check => ({
          name: check.name,
          status: check.status,
          lastCheck: check.lastCheck,
          critical: check.critical,
          lastResult: check.lastResult
        })),
        overall: this.calculateOverallHealth()
      },
      metrics: {
        custom: Object.fromEntries(
          Array.from(this.customMetrics.entries()).map(([name, history]) => [
            name,
            history.slice(-10) // Last 10 entries
          ])
        ),
        performance: Object.fromEntries(
          Array.from(this.performanceMetrics.entries()).map(([name, history]) => [
            name,
            {
              count: history.length,
              avgDuration: history.reduce((sum, h) => sum + h.duration, 0) / history.length,
              minDuration: Math.min(...history.map(h => h.duration)),
              maxDuration: Math.max(...history.map(h => h.duration))
            }
          ])
        ),
        business: Object.fromEntries(
          Array.from(this.businessMetrics.entries()).map(([name, history]) => [
            name,
            history.slice(-10) // Last 10 entries
          ])
        )
      }
    };
  }

  /**
   * Calculate overall health status
   */
  calculateOverallHealth() {
    const healthChecks = Array.from(this.healthChecks.values());
    if (healthChecks.length === 0) return 'unknown';

    const criticalChecks = healthChecks.filter(check => check.critical);
    const unhealthyCritical = criticalChecks.filter(check => check.status !== 'healthy');

    if (unhealthyCritical.length > 0) {
      return 'unhealthy';
    }

    const unhealthyChecks = healthChecks.filter(check => check.status !== 'healthy');
    if (unhealthyChecks.length > 0) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Execute function with timeout
   */
  async executeWithTimeout(fn, timeout) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Health check timeout'));
      }, timeout);

      try {
        const result = await fn();
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Start system metrics collection
   */
  startSystemMetricsCollection() {
    setInterval(() => {
      this.collectSystemMetrics();
    }, this.config.defaultInterval);
  }

  /**
   * Collect system metrics
   */
  collectSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    this.systemMetrics.memory = {
      usage: memUsage.heapUsed,
      total: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss
    };

    this.systemMetrics.cpu = {
      usage: cpuUsage.user + cpuUsage.system,
      user: cpuUsage.user,
      system: cpuUsage.system
    };

    // Update Prometheus metrics
    if (this.config.enablePrometheus) {
      this.prometheusMetrics.memoryUsage.set(memUsage.heapUsed);
      this.prometheusMetrics.cpuUsage.set(
        ((cpuUsage.user + cpuUsage.system) / 1000000) * 100 // Convert to percentage
      );
    }
  }

  /**
   * Start metrics collection
   */
  startMetricsCollection() {
    this.startTime = Date.now();

    // Start system metrics collection
    this.startSystemMetricsCollection();

    // Start custom metrics cleanup
    setInterval(() => {
      this.cleanupOldMetrics();
    }, this.config.metricsRetention);

    console.log(`📊 Advanced Monitoring started: ${this.config.serviceId}`);
  }

  /**
   * Cleanup old metrics
   */
  cleanupOldMetrics() {
    const cutoff = Date.now() - this.config.metricsRetention;

    // Cleanup time series data
    for (const [key, series] of this.timeSeriesData) {
      const filtered = series.filter(metric => metric.timestamp >= cutoff);
      if (filtered.length === 0) {
        this.timeSeriesData.delete(key);
      } else {
        this.timeSeriesData.set(key, filtered);
      }
    }

    // Cleanup custom metrics
    for (const [name, history] of this.customMetrics) {
      const filtered = history.filter(metric => metric.timestamp >= cutoff);
      if (filtered.length === 0) {
        this.customMetrics.delete(name);
      } else {
        this.customMetrics.set(name, filtered);
      }
    }

    // Cleanup performance metrics
    for (const [name, history] of this.performanceMetrics) {
      const filtered = history.filter(metric => metric.timestamp >= cutoff);
      if (filtered.length === 0) {
        this.performanceMetrics.delete(name);
      } else {
        this.performanceMetrics.set(name, filtered);
      }
    }
  }

  /**
   * Health check for the monitoring service
   */
  async healthCheck() {
    return {
      status: 'healthy',
      service: this.config.serviceId,
      version: this.config.version,
      uptime: Date.now() - (this.startTime || Date.now()),
      metrics: {
        customMetricsCount: this.customMetrics.size,
        performanceMetricsCount: this.performanceMetrics.size,
        businessMetricsCount: this.businessMetrics.size,
        timeSeriesCount: this.timeSeriesData.size,
        activeAlertsCount: this.activeAlerts.size,
        healthChecksCount: this.healthChecks.size
      }
    };
  }

  /**
   * Generate alert ID
   */
  generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Event handlers
  handleMetricRecorded(metric) {
    // Could implement additional metric processing here
  }

  handleAlertTriggered(alert) {
    console.warn(`🚨 Alert triggered: ${alert.name} - ${alert.details.message}`);
  }

  handleAlertResolved(alert) {
    console.log(`✅ Alert resolved: ${alert.name}`);
  }

  handleHealthCheckFailed(name, error, result) {
    console.error(`❌ Health check failed: ${name} - ${error.message}`);
  }

  /**
   * Stop monitoring service
   */
  stop() {
    console.log(`📊 Advanced Monitoring stopped: ${this.config.serviceId}`);
    this.emit('stopped');
  }
}

module.exports = AdvancedMonitoringService;