const os = require('os');
const fs = require('fs');
const path = require('path');

/**
 * Performance monitoring system for HIJINETWORK
 * Monitors system resources, application performance, and database efficiency
 */
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      system: {},
      application: {},
      database: {},
      network: {},
      mikrotik: {}
    };
    this.alerts = [];
    this.thresholds = {
      cpu: 80, // 80% CPU usage
      memory: 85, // 85% memory usage
      disk: 90, // 90% disk usage
      responseTime: 5000, // 5 seconds response time
      errorRate: 5, // 5% error rate
      concurrentConnections: 1000
    };
    this.initializeMonitoring();
  }

  initializeMonitoring() {
    // Start collecting system metrics
    this.startSystemMonitoring();

    // Start application monitoring
    this.startApplicationMonitoring();

    // Start database monitoring
    this.startDatabaseMonitoring();

    // Setup alert checking
    this.startAlertChecking();
  }

  /**
   * System monitoring
   */
  startSystemMonitoring() {
    setInterval(() => {
      this.collectSystemMetrics();
    }, 30000); // Every 30 seconds
  }

  collectSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    this.metrics.system = {
      timestamp: Date.now(),
      cpu: {
        usage: this.calculateCPUUsage(),
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        usage: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss
      },
      disk: this.getDiskUsage(),
      uptime: os.uptime(),
      loadAverage: os.loadavg()
    };

    // Check for system alerts
    this.checkSystemAlerts();
  }

  calculateCPUUsage() {
    // Simple CPU usage calculation
    const cpus = os.cpus();
    let totalTick = 0;
    let totalIdle = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - (100 * idle / total);

    return usage;
  }

  getDiskUsage() {
    const mainDrive = '/';
    try {
      const stats = fs.statSync(mainDrive);
      return {
        total: stats.size || 0,
        free: stats.size || 0, // This would need proper disk usage checking
        usage: 0 // Placeholder
      };
    } catch (error) {
      return { total: 0, free: 0, usage: 0 };
    }
  }

  /**
   * Application monitoring
   */
  startApplicationMonitoring() {
    this.metrics.application = {
      startTime: Date.now(),
      requests: {
        total: 0,
        success: 0,
        error: 0,
        responseTimes: [],
        errors: []
      },
      connections: {
        active: 0,
        total: 0,
        peak: 0
      },
      performance: {
        averageResponseTime: 0,
        throughput: 0
      }
    };
  }

  trackRequest(responseTime, success = true, error = null) {
    // Initialize application metrics if not exists
    if (!this.metrics.application) {
      this.metrics.application = {};
    }
    if (!this.metrics.application.requests) {
      this.metrics.application.requests = {
        total: 0,
        success: 0,
        error: 0,
        responseTimes: [],
        errors: []
      };
    }

    const metrics = this.metrics.application.requests;

    // Initialize arrays if they don't exist
    if (!metrics.errors) {
      metrics.errors = [];
    }
    if (!metrics.responseTimes) {
      metrics.responseTimes = [];
    }

    metrics.total++;

    if (success) {
      metrics.success++;
    } else {
      metrics.error++;
      if (error) {
        metrics.errors.push({
          timestamp: Date.now(),
          error: error.message,
          stack: error.stack
        });
      }
    }

    // Track response times
    metrics.responseTimes.push(responseTime);

    // Keep only last 1000 response times
    if (metrics.responseTimes.length > 1000) {
      metrics.responseTimes = metrics.responseTimes.slice(-1000);
    }

    // Update performance metrics
    this.updatePerformanceMetrics();
  }

  updatePerformanceMetrics() {
    const requests = this.metrics.application.requests;
    const responseTimes = requests.responseTimes;

    if (responseTimes.length > 0) {
      const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      this.metrics.application.performance.averageResponseTime = avgTime;
    }

    // Calculate throughput (requests per minute)
    const uptime = Date.now() - this.metrics.application.startTime;
    const uptimeMinutes = uptime / (1000 * 60);
    this.metrics.application.performance.throughput = requests.total / uptimeMinutes;
  }

  trackConnection(type = 'open') {
    // Initialize application metrics if not exists
    if (!this.metrics.application) {
      this.metrics.application = {};
    }
    if (!this.metrics.application.connections) {
      this.metrics.application.connections = {
        active: 0,
        total: 0,
        peak: 0
      };
    }

    const connections = this.metrics.application.connections;

    if (type === 'open') {
      connections.active++;
      connections.total++;
      connections.peak = Math.max(connections.peak, connections.active);
    } else if (type === 'close') {
      connections.active = Math.max(0, connections.active - 1);
    }
  }

  /**
   * Database monitoring
   */
  startDatabaseMonitoring() {
    setInterval(() => {
      this.collectDatabaseMetrics();
    }, 60000); // Every minute
  }

  collectDatabaseMetrics() {
    this.metrics.database = {
      timestamp: Date.now(),
      connections: this.getDatabaseConnections(),
      queries: this.getDatabaseQueries(),
      performance: this.getDatabasePerformance(),
      size: this.getDatabaseSize()
    };
  }

  getDatabaseConnections() {
    // This would query the database for connection information
    return {
      active: 0,
      idle: 0,
      total: 0,
      max: 100
    };
  }

  getDatabaseQueries() {
    // This would track query performance
    return {
      total: 0,
      slow: 0,
      averageTime: 0,
      errors: 0
    };
  }

  getDatabasePerformance() {
    // This would monitor database performance metrics
    return {
      responseTime: 0,
      throughput: 0,
      cacheHitRatio: 0
    };
  }

  getDatabaseSize() {
    try {
      const dbPath = path.join(process.cwd(), 'data', 'billing.db');
      if (fs.existsSync(dbPath)) {
        const stats = fs.statSync(dbPath);
        return {
          size: stats.size,
          lastModified: stats.mtime
        };
      }
    } catch (error) {
      console.error('Error getting database size:', error);
    }
    return { size: 0, lastModified: null };
  }

  /**
   * Mikrotik monitoring
   */
  trackMikrotikMetrics(metrics) {
    this.metrics.mikrotik = {
      timestamp: Date.now(),
      connection: metrics.connection || {},
      users: metrics.users || {},
      performance: metrics.performance || {},
      errors: metrics.errors || []
    };
  }

  /**
   * Client-side performance metrics recording
   */
  recordClientMetrics(metrics) {
    // Initialize client metrics if not exists
    if (!this.metrics.client) {
      this.metrics.client = {
        performance: {},
        navigation: {},
        resources: [],
        errors: [],
        timestamp: Date.now()
      };
    }

    // Record various client-side metrics
    if (metrics.performance) {
      this.metrics.client.performance = {
        ...this.metrics.client.performance,
        ...metrics.performance,
        timestamp: Date.now()
      };
    }

    if (metrics.navigation) {
      this.metrics.client.navigation = {
        ...this.metrics.client.navigation,
        ...metrics.navigation,
        timestamp: Date.now()
      };
    }

    if (metrics.resources) {
      this.metrics.client.resources.push({
        ...metrics.resources,
        timestamp: Date.now()
      });

      // Keep only last 100 resource entries
      if (this.metrics.client.resources.length > 100) {
        this.metrics.client.resources = this.metrics.client.resources.slice(-100);
      }
    }

    if (metrics.errors && metrics.errors.length > 0) {
      this.metrics.client.errors.push(...metrics.errors.map(error => ({
        ...error,
        timestamp: Date.now()
      })));

      // Keep only last 50 error entries
      if (this.metrics.client.errors.length > 50) {
        this.metrics.client.errors = this.metrics.client.errors.slice(-50);
      }
    }

    // Update overall timestamp
    this.metrics.client.timestamp = Date.now();

    // Check for client-side performance alerts
    this.checkClientPerformanceAlerts(metrics);
  }

  /**
   * Check client-side performance alerts
   */
  checkClientPerformanceAlerts(metrics) {
    // Check for slow page load
    if (metrics.performance && metrics.performance.loadTime > 3000) {
      this.createAlert('slow_page_load', 'warning', {
        message: `Slow page load detected: ${metrics.performance.loadTime}ms`,
        threshold: 3000,
        current: metrics.performance.loadTime
      });
    }

    // Check for JavaScript errors
    if (metrics.errors && metrics.errors.length > 0) {
      this.createAlert('client_js_errors', 'warning', {
        message: `Client JavaScript errors detected: ${metrics.errors.length} errors`,
        current: metrics.errors.length
      });
    }
  }

  /**
   * Alert checking and generation
   */
  startAlertChecking() {
    setInterval(() => {
      this.checkAllAlerts();
    }, 60000); // Every minute
  }

  checkAllAlerts() {
    this.checkSystemAlerts();
    this.checkApplicationAlerts();
    this.checkDatabaseAlerts();
  }

  checkSystemAlerts() {
    const system = this.metrics.system;

    // CPU usage alert
    if (system.cpu?.usage > this.thresholds.cpu) {
      this.createAlert('high_cpu_usage', 'warning', {
        message: `High CPU usage: ${system.cpu.usage.toFixed(2)}%`,
        threshold: this.thresholds.cpu,
        current: system.cpu.usage
      });
    }

    // Memory usage alert
    if (system.memory?.usage > this.thresholds.memory) {
      this.createAlert('high_memory_usage', 'warning', {
        message: `High memory usage: ${system.memory.usage.toFixed(2)}%`,
        threshold: this.thresholds.memory,
        current: system.memory.usage
      });
    }

    // Disk usage alert
    if (system.disk?.usage > this.thresholds.disk) {
      this.createAlert('high_disk_usage', 'critical', {
        message: `High disk usage: ${system.disk.usage.toFixed(2)}%`,
        threshold: this.thresholds.disk,
        current: system.disk.usage
      });
    }
  }

  checkApplicationAlerts() {
    const app = this.metrics.application;
    const requests = app.requests;

    // Error rate alert
    if (requests.total > 0) {
      const errorRate = (requests.error / requests.total) * 100;
      if (errorRate > this.thresholds.errorRate) {
        this.createAlert('high_error_rate', 'warning', {
          message: `High error rate: ${errorRate.toFixed(2)}%`,
          threshold: this.thresholds.errorRate,
          current: errorRate
        });
      }
    }

    // Response time alert
    if (app.performance.averageResponseTime > this.thresholds.responseTime) {
      this.createAlert('slow_response_time', 'warning', {
        message: `Slow response time: ${app.performance.averageResponseTime.toFixed(2)}ms`,
        threshold: this.thresholds.responseTime,
        current: app.performance.averageResponseTime
      });
    }

    // Connection count alert
    if (app.connections.active > this.thresholds.concurrentConnections) {
      this.createAlert('high_connections', 'warning', {
        message: `High concurrent connections: ${app.connections.active}`,
        threshold: this.thresholds.concurrentConnections,
        current: app.connections.active
      });
    }
  }

  checkDatabaseAlerts() {
    const db = this.metrics.database;

    // Database size alert (if > 1GB)
    if (db.size && db.size > 1024 * 1024 * 1024) {
      this.createAlert('large_database', 'info', {
        message: `Database size is large: ${(db.size / (1024 * 1024)).toFixed(2)}MB`,
        current: db.size
      });
    }
  }

  createAlert(type, severity, details) {
    const alert = {
      id: this.generateAlertId(),
      timestamp: Date.now(),
      type,
      severity,
      details,
      acknowledged: false,
      resolved: false
    };

    this.alerts.push(alert);

    // Keep only last 1000 alerts
    if (this.alerts.length > 1000) {
      this.alerts = this.alerts.slice(-1000);
    }

    // Log alert to security logger if available
    if (global.securityLogger) {
      global.securityLogger.logSystemEvent('performance_alert', {
        component: 'performance_monitor',
        action: 'alert_generated',
        status: severity,
        message: details.message,
        metadata: { alertId: alert.id, type, severity }
      });
    }

    // Send critical alerts immediately
    if (severity === 'critical') {
      this.sendAlertNotification(alert);
    }
  }

  generateAlertId() {
    return 'alert_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }

  sendAlertNotification(alert) {
    // Send alert notification via configured channels
    console.error('🚨 PERFORMANCE ALERT:', {
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      message: alert.details.message,
      timestamp: alert.timestamp
    });
  }

  /**
   * Performance reporting
   */
  generatePerformanceReport(timeRange = '1h') {
    const report = {
      generatedAt: new Date().toISOString(),
      timeRange,
      summary: {
        uptime: os.uptime(),
        totalRequests: this.metrics.application.requests.total,
        errorRate: this.calculateErrorRate(),
        averageResponseTime: this.metrics.application.performance.averageResponseTime,
        activeConnections: this.metrics.application.connections.active
      },
      system: this.metrics.system,
      application: this.metrics.application,
      database: this.metrics.database,
      alerts: this.getRecentAlerts(timeRange),
      recommendations: this.generateRecommendations()
    };

    return report;
  }

  calculateErrorRate() {
    const requests = this.metrics.application.requests;
    return requests.total > 0 ? (requests.error / requests.total) * 100 : 0;
  }

  getRecentAlerts(timeRange) {
    const now = Date.now();
    const rangeMs = this.parseTimeRange(timeRange);

    return this.alerts.filter(alert =>
      now - alert.timestamp <= rangeMs && !alert.resolved
    );
  }

  parseTimeRange(timeRange) {
    const ranges = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000
    };
    return ranges[timeRange] || ranges['1h'];
  }

  generateRecommendations() {
    const recommendations = [];
    const system = this.metrics.system;
    const app = this.metrics.application;

    // System recommendations
    if (system.cpu?.usage > 70) {
      recommendations.push('Consider upgrading CPU or optimizing application performance');
    }

    if (system.memory?.usage > 80) {
      recommendations.push('Consider adding more memory or optimizing memory usage');
    }

    // Application recommendations
    if (app.performance.averageResponseTime > 1000) {
      recommendations.push('Optimize slow database queries or implement caching');
    }

    if (this.calculateErrorRate() > 2) {
      recommendations.push('Investigate and fix application errors');
    }

    // Database recommendations
    if (app.requests.total > 10000 && !this.hasCaching()) {
      recommendations.push('Consider implementing response caching');
    }

    return recommendations;
  }

  hasCaching() {
    // Check if caching is enabled
    return process.env.CACHE_ENABLED === 'true';
  }

  /**
   * Utility methods
   */
  getMetrics() {
    return {
      ...this.metrics,
      alerts: this.alerts.filter(alert => !alert.resolved)
    };
  }

  acknowledgeAlert(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedAt = Date.now();
    }
  }

  resolveAlert(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
    }
  }

  cleanup() {
    // Clean up old alerts and metrics
    const cutoffDate = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago

    this.alerts = this.alerts.filter(alert =>
      alert.timestamp > cutoffDate || !alert.resolved
    );

    // Clean old response times
    if (this.metrics.application.requests.responseTimes.length > 1000) {
      this.metrics.application.requests.responseTimes =
        this.metrics.application.requests.responseTimes.slice(-500);
    }
  }
}

// Export singleton instance
module.exports = PerformanceMonitor;