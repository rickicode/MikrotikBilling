# Performance & Monitoring v2.0 - Spesifikasi Lengkap

## 1. Overview

Sistem performance dan monitoring v2.0 memantau kesehatan sistem, performa aplikasi, dan penggunaan sumber daya secara real-time. Sistem menggunakan metrik collection, alerting, dan dashboard untuk memastikan sistem berjalan optimal.

## 2. Key Features

### 2.1 Core Features
- **Real-time Monitoring**: Monitor sistem secara real-time
- **Performance Metrics**: CPU, Memory, Database, API response times
- **Health Checks**: Automated health checks untuk semua komponen
- **Alert System**: Notifikasi otomatis untuk masalah kritis
- **Dashboard**: Visual dashboard untuk monitoring overview
- **Historical Data**: Penyimpanan data historis untuk analisis
- **Custom Metrics**: Support untuk custom business metrics
- **Integration**: Integrasi dengan external monitoring tools

### 2.2 Monitoring Scope
- **Application Metrics**: Response time, throughput, error rates
- **Database Metrics**: Query performance, connection pools, slow queries
- **Mikrotik Metrics**: API latency, connection status, sync health
- **WhatsApp Metrics**: Message queue, delivery rates, session status
- **System Metrics**: CPU, Memory, Disk, Network usage
- **Business Metrics**: Active users, revenue, conversion rates

## 3. Architecture

### 3.1 Components
```
src/services/PerformanceMonitor.js    # Core monitoring service
src/services/MetricsCollector.js      # Metrics collection
src/services/HealthChecker.js         # Health checks
src/services/AlertService.js          # Alert management
src/services/AnalyticsService.js      # Data analytics
routes/monitoring.js                  # Monitoring API endpoints
src/middleware/metrics.js             # Metrics middleware
views/monitoring/                      # Monitoring dashboard
  ├── index.ejs                       # Main dashboard
  ├── metrics.ejs                     # Metrics view
  └── alerts.ejs                      # Alert management
```

### 3.2 Metrics Categories
```javascript
// Metrics configuration
const METRICS_CATEGORIES = {
  // Application Performance
  application: {
    response_time: 'histogram',
    request_rate: 'counter',
    error_rate: 'gauge',
    active_connections: 'gauge'
  },

  // Database Performance
  database: {
    query_time: 'histogram',
    connection_pool: 'gauge',
    slow_queries: 'counter',
    deadlocks: 'counter'
  },

  // Mikrotik Integration
  mikrotik: {
    api_latency: 'histogram',
    connection_status: 'gauge',
    sync_errors: 'counter',
    active_users: 'gauge'
  },

  // WhatsApp Service
  whatsapp: {
    queue_size: 'gauge',
    messages_sent: 'counter',
    delivery_rate: 'gauge',
    session_status: 'gauge'
  },

  // System Resources
  system: {
    cpu_usage: 'gauge',
    memory_usage: 'gauge',
    disk_usage: 'gauge',
    network_io: 'counter'
  },

  // Business Metrics
  business: {
    active_subscriptions: 'gauge',
    daily_revenue: 'counter',
    conversion_rate: 'gauge',
    customer_growth: 'counter'
  }
};
```

### 3.3 Database Schema for Monitoring
```sql
-- Metrics storage
CREATE TABLE metrics (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(100) NOT NULL,
    metric_type VARCHAR(20) NOT NULL, -- gauge, counter, histogram
    value DECIMAL(15,5) NOT NULL,
    labels JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_metrics_name_time (metric_name, timestamp)
);

-- Performance snapshots
CREATE TABLE performance_snapshots (
    id SERIAL PRIMARY KEY,
    snapshot_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cpu_usage DECIMAL(5,2),
    memory_usage DECIMAL(5,2),
    memory_total BIGINT,
    memory_used BIGINT,
    disk_usage DECIMAL(5,2),
    disk_total BIGINT,
    disk_used BIGINT,
    network_rx BIGINT,
    network_tx BIGINT,
    load_average JSONB,
    uptime_seconds INTEGER,
    process_count INTEGER
);

-- API performance logs
CREATE TABLE api_performance_logs (
    id SERIAL PRIMARY KEY,
    method VARCHAR(10) NOT NULL,
    route VARCHAR(200) NOT NULL,
    status_code INTEGER NOT NULL,
    response_time_ms INTEGER NOT NULL,
    request_size INTEGER,
    response_size INTEGER,
    user_agent TEXT,
    ip_address INET,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_api_performance_route_time (route, timestamp)
);

-- Health check results
CREATE TABLE health_check_results (
    id SERIAL PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL, -- healthy, unhealthy, degraded
    response_time_ms INTEGER,
    details JSONB,
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Alert logs
CREATE TABLE alert_logs (
    id SERIAL PRIMARY KEY,
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL, -- info, warning, critical
    message TEXT NOT NULL,
    details JSONB,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 4. Metrics Collection

### 4.1 Metrics Collector Service
```javascript
// src/services/MetricsCollector.js
const prometheus = require('prom-client');
const { performance } = require('perf_hooks');

class MetricsCollector {
  constructor() {
    // Create Prometheus metrics
    this.register = new prometheus.Registry();

    // Default metrics
    prometheus.collectDefaultMetrics({ register: this.register });

    // Custom metrics
    this.httpRequestDuration = new prometheus.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.register]
    });

    this.httpRequestTotal = new prometheus.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.register]
    });

    this.databaseQueryDuration = new prometheus.Histogram({
      name: 'database_query_duration_seconds',
      help: 'Duration of database queries in seconds',
      labelNames: ['query_type', 'table'],
      registers: [this.register]
    });

    this.mikrotikApiLatency = new prometheus.Histogram({
      name: 'mikrotik_api_latency_seconds',
      help: 'Mikrotik API latency in seconds',
      labelNames: ['method', 'endpoint'],
      registers: [this.register]
    });

    this.whatsappMessagesTotal = new prometheus.Counter({
      name: 'whatsapp_messages_total',
      help: 'Total number of WhatsApp messages sent',
      labelNames: ['type', 'status'],
      registers: [this.register]
    });

    this.activeUsersGauge = new prometheus.Gauge({
      name: 'active_users_total',
      help: 'Number of active users',
      labelNames: ['type'], // hotspot, pppoe
      registers: [this.register]
    });

    this.startCollection();
  }

  startCollection() {
    // Collect system metrics every 30 seconds
    setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);

    // Collect application metrics every minute
    setInterval(() => {
      this.collectApplicationMetrics();
    }, 60000);

    // Collect database metrics every 5 minutes
    setInterval(() => {
      this.collectDatabaseMetrics();
    }, 300000);
  }

  async collectSystemMetrics() {
    const os = require('os');
    const fs = require('fs');

    try {
      // CPU Usage
      const cpuUsage = process.cpuUsage();
      const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds

      // Memory Usage
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const memoryPercent = (usedMem / totalMem) * 100;

      // Disk Usage
      const stats = fs.statSync('.');
      const diskUsage = await this.getDiskUsage();

      // Update Prometheus gauges
      new prometheus.Gauge({
        name: 'system_cpu_usage_percent',
        help: 'System CPU usage percentage',
        registers: [this.register]
      }).set(cpuPercent);

      new prometheus.Gauge({
        name: 'system_memory_usage_percent',
        help: 'System memory usage percentage',
        registers: [this.register]
      }).set(memoryPercent);

      new prometheus.Gauge({
        name: 'system_disk_usage_percent',
        help: 'System disk usage percentage',
        registers: [this.register]
      }).set(diskUsage.usage);

      // Store in database
      await this.storePerformanceSnapshot({
        cpu_usage: cpuPercent,
        memory_usage: memoryPercent,
        memory_total: totalMem,
        memory_used: usedMem,
        disk_usage: diskUsage.usage,
        disk_total: diskUsage.total,
        disk_used: diskUsage.used,
        uptime_seconds: os.uptime(),
        load_average: os.loadavg()
      });

    } catch (error) {
      console.error('Error collecting system metrics:', error);
    }
  }

  async collectApplicationMetrics() {
    try {
      // Active users
      const activeHotspot = await db.query(
        'SELECT COUNT(*) as count FROM vouchers WHERE status = \'active\''
      );
      const activePPPoE = await db.query(
        'SELECT COUNT(*) as count FROM pppoe_users WHERE status = \'active\''
      );

      this.activeUsersGauge.set({ type: 'hotspot' }, activeHotspot.rows[0].count);
      this.activeUsersGauge.set({ type: 'pppoe' }, activePPPoE.rows[0].count);

      // Queue sizes
      const queueSize = await this.getWhatsAppQueueSize();
      new prometheus.Gauge({
        name: 'whatsapp_queue_size',
        help: 'WhatsApp message queue size',
        registers: [this.register]
      }).set(queueSize);

    } catch (error) {
      console.error('Error collecting application metrics:', error);
    }
  }

  async collectDatabaseMetrics() {
    try {
      // Connection pool status
      const poolStatus = await db.getPoolStatus();

      new prometheus.Gauge({
        name: 'database_connections_active',
        help: 'Number of active database connections',
        registers: [this.register]
      }).set(poolStatus.active);

      new prometheus.Gauge({
        name: 'database_connections_idle',
        help: 'Number of idle database connections',
        registers: [this.register]
      }).set(poolStatus.idle);

      // Database size
      const dbSize = await this.getDatabaseSize();
      new prometheus.Gauge({
        name: 'database_size_bytes',
        help: 'Database size in bytes',
        registers: [this.register]
      }).set(dbSize);

    } catch (error) {
      console.error('Error collecting database metrics:', error);
    }
  }

  recordHttpRequest(req, res, duration) {
    const labels = {
      method: req.method,
      route: req.route ? req.route.path : req.path,
      status_code: res.statusCode.toString()
    };

    this.httpRequestDuration.observe(labels, duration / 1000);
    this.httpRequestTotal.inc(labels);
  }

  recordDatabaseQuery(queryType, table, duration) {
    this.databaseQueryDuration.observe({
      query_type: queryType,
      table: table
    }, duration / 1000);
  }

  recordMikrotikApiCall(method, endpoint, duration) {
    this.mikrotikApiLatency.observe({
      method: method,
      endpoint: endpoint
    }, duration / 1000);
  }

  recordWhatsAppMessage(type, status) {
    this.whatsappMessagesTotal.inc({
      type: type,
      status: status
    });
  }

  getMetrics() {
    return this.register.metrics();
  }

  async storePerformanceSnapshot(data) {
    await db.query(`
      INSERT INTO performance_snapshots
      (cpu_usage, memory_usage, memory_total, memory_used,
       disk_usage, disk_total, disk_used, load_average,
       uptime_seconds, process_count)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      data.cpu_usage,
      data.memory_usage,
      data.memory_total,
      data.memory_used,
      data.disk_usage,
      data.disk_total,
      data.disk_used,
      JSON.stringify(data.load_average),
      data.uptime_seconds,
      data.process_count || 0
    ]);
  }

  async getDiskUsage() {
    const stats = await fs.promises.stat('.');
    // Simplified - in production use proper disk space checking
    return {
      total: 1000000000000, // 1TB
      used: 500000000000,   // 500GB
      usage: 50             // 50%
    };
  }
}
```

### 4.2 Middleware for Request Tracking
```javascript
// src/middleware/metrics.js
function metricsMiddleware(metricsCollector) {
  return async (request, reply) => {
    const start = performance.now();

    // Add hooks for response
    reply.addHook('onSend', async (request, reply, payload) => {
      const duration = performance.now() - start;

      // Record metrics
      metricsCollector.recordHttpRequest(request, reply, duration);

      // Log performance
      if (duration > 1000) { // Slow requests > 1s
        console.warn(`Slow request: ${request.method} ${request.url} took ${duration}ms`);
      }

      return payload;
    });

    // Continue with request
  };
}

// Database query wrapper
function instrumentedQuery(query, params, queryType, table) {
  const start = performance.now();

  return db.query(query, params)
    .then(result => {
      const duration = performance.now() - start;
      metricsCollector.recordDatabaseQuery(queryType, table, duration);

      // Log slow queries
      if (duration > 500) { // Slow queries > 500ms
        console.warn(`Slow query: ${queryType} on ${table} took ${duration}ms`);
      }

      return result;
    });
}
```

## 5. Health Check System

### 5.1 Health Checker Service
```javascript
// src/services/HealthChecker.js
class HealthChecker {
  constructor() {
    this.checks = new Map();
    this.setupDefaultChecks();
  }

  setupDefaultChecks() {
    // Database health check
    this.addCheck('database', async () => {
      try {
        const result = await db.query('SELECT 1');
        return {
          status: 'healthy',
          details: { connected: true },
          responseTime: 0
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          details: { error: error.message },
          responseTime: 0
        };
      }
    });

    // Mikrotik connection check
    this.addCheck('mikrotik', async () => {
      try {
        const start = Date.now();
        const result = await mikrotik.executeCommand('/system/resource/print');
        const responseTime = Date.now() - start;

        return {
          status: 'healthy',
          details: { connected: true, version: result[0].version },
          responseTime
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          details: { error: error.message },
          responseTime: 0
        };
      }
    });

    // WhatsApp service check
    this.addCheck('whatsapp', async () => {
      try {
        const status = await whatsappService.getStatus();
        return {
          status: status.connected ? 'healthy' : 'degraded',
          details: {
            connected: status.connected,
            sessions: status.sessions
          },
          responseTime: 0
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          details: { error: error.message },
          responseTime: 0
        };
      }
    });

    // Disk space check
    this.addCheck('disk_space', async () => {
      try {
        const usage = await this.getDiskUsage();
        const status = usage.percent > 90 ? 'unhealthy' :
                     usage.percent > 80 ? 'degraded' : 'healthy';

        return {
          status,
          details: usage,
          responseTime: 0
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          details: { error: error.message },
          responseTime: 0
        };
      }
    });

    // Memory check
    this.addCheck('memory', async () => {
      try {
        const usage = process.memoryUsage();
        const usedMB = usage.heapUsed / 1024 / 1024;
        const totalMB = usage.heapTotal / 1024 / 1024;
        const percent = (usedMB / totalMB) * 100;

        const status = percent > 90 ? 'unhealthy' :
                     percent > 80 ? 'degraded' : 'healthy';

        return {
          status,
          details: {
            used: `${Math.round(usedMB)}MB`,
            total: `${Math.round(totalMB)}MB`,
            percent: Math.round(percent)
          },
          responseTime: 0
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          details: { error: error.message },
          responseTime: 0
        };
      }
    });
  }

  addCheck(name, checkFunction) {
    this.checks.set(name, checkFunction);
  }

  async runAllChecks() {
    const results = new Map();
    const promises = [];

    for (const [name, checkFn] of this.checks) {
      promises.push(
        checkFn()
          .then(result => {
            results.set(name, result);
            this.logHealthCheck(name, result);
          })
          .catch(error => {
            results.set(name, {
              status: 'unhealthy',
              details: { error: error.message },
              responseTime: 0
            });
            this.logHealthCheck(name, results.get(name));
          })
      );
    }

    await Promise.all(promises);

    // Calculate overall status
    const overallStatus = this.calculateOverallStatus(results);

    return {
      status: overallStatus,
      checks: Object.fromEntries(results),
      timestamp: new Date().toISOString()
    };
  }

  calculateOverallStatus(results) {
    const statuses = Array.from(results.values()).map(r => r.status);

    if (statuses.some(s => s === 'unhealthy')) {
      return 'unhealthy';
    }
    if (statuses.some(s => s === 'degraded')) {
      return 'degraded';
    }
    return 'healthy';
  }

  async logHealthCheck(service, result) {
    try {
      await db.query(`
        INSERT INTO health_check_results
        (service_name, status, response_time_ms, details, checked_at)
        VALUES ($1, $2, $3, $4, NOW())
      `, [
        service,
        result.status,
        result.responseTime,
        JSON.stringify(result.details)
      ]);
    } catch (error) {
      console.error('Error logging health check:', error);
    }
  }

  async getHealthStatus(serviceName) {
    const check = this.checks.get(serviceName);
    if (!check) {
      throw new Error(`Health check not found: ${serviceName}`);
    }

    return await check();
  }
}
```

## 6. Alert System

### 6.1 Alert Service
```javascript
// src/services/AlertService.js
class AlertService {
  constructor() {
    this.rules = new Map();
    this.setupDefaultRules();
  }

  setupDefaultRules() {
    // High CPU usage alert
    this.addRule({
      name: 'high_cpu_usage',
      condition: 'cpu_usage > 80',
      severity: 'warning',
      message: 'CPU usage is above 80%',
      cooldown: 300000, // 5 minutes
      threshold: 80,
      metric: 'cpu_usage'
    });

    // Database connection alert
    this.addRule({
      name: 'database_connection_failed',
      condition: 'database.status == "unhealthy"',
      severity: 'critical',
      message: 'Database connection failed',
      cooldown: 60000, // 1 minute
      immediate: true
    });

    // Mikrotik API alert
    this.addRule({
      name: 'mikrotik_api_down',
      condition: 'mikrotik.status == "unhealthy"',
      severity: 'critical',
      message: 'Mikrotik API is unreachable',
      cooldown: 60000,
      immediate: true
    });

    // Disk space alert
    this.addRule({
      name: 'low_disk_space',
      condition: 'disk_usage > 90',
      severity: 'critical',
      message: 'Disk usage is above 90%',
      cooldown: 600000, // 10 minutes
      threshold: 90,
      metric: 'disk_usage'
    });

    // Slow API response alert
    this.addRule({
      name: 'slow_api_response',
      condition: 'avg_response_time > 2000',
      severity: 'warning',
      message: 'Average API response time is above 2 seconds',
      cooldown: 600000,
      threshold: 2000,
      metric: 'avg_response_time'
    });

    // WhatsApp queue size alert
    this.addRule({
      name: 'whatsapp_queue_full',
      condition: 'whatsapp_queue_size > 100',
      severity: 'warning',
      message: 'WhatsApp message queue is getting full',
      cooldown: 300000,
      threshold: 100,
      metric: 'whatsapp_queue_size'
    });
  }

  addRule(rule) {
    rule.lastTriggered = null;
    rule.active = true;
    this.rules.set(rule.name, rule);
  }

  async evaluateRules(metrics) {
    const triggeredAlerts = [];

    for (const [name, rule] of this.rules) {
      if (!rule.active) continue;

      try {
        if (this.evaluateCondition(rule.condition, metrics)) {
          // Check cooldown
          if (this.isInCooldown(rule)) {
            continue;
          }

          // Trigger alert
          const alert = await this.triggerAlert(rule, metrics);
          triggeredAlerts.push(alert);
          rule.lastTriggered = Date.now();
        }
      } catch (error) {
        console.error(`Error evaluating rule ${name}:`, error);
      }
    }

    return triggeredAlerts;
  }

  evaluateCondition(condition, metrics) {
    // Simple condition evaluator
    // In production, use a proper expression parser

    // Replace condition variables with actual values
    let expr = condition;

    // Handle metric conditions
    if (rule.metric && metrics[rule.metric]) {
      expr = expr.replace(rule.metric, metrics[rule.metric]);
    }

    // Handle health status conditions
    if (condition.includes('database.status')) {
      const dbHealth = metrics.health?.checks?.database?.status || 'unknown';
      expr = expr.replace('database.status', `"${dbHealth}"`);
    }

    // Evaluate the expression
    try {
      return Function('"use strict"; return (' + expr + ')')();
    } catch (error) {
      console.error('Error evaluating condition:', condition, error);
      return false;
    }
  }

  isInCooldown(rule) {
    if (!rule.lastTriggered) return false;

    const now = Date.now();
    return (now - rule.lastTriggered) < (rule.cooldown || 0);
  }

  async triggerAlert(rule, metrics) {
    const alert = {
      id: `alert-${Date.now()}`,
      name: rule.name,
      severity: rule.severity,
      message: rule.message,
      details: {
        rule: rule,
        metrics: metrics,
        timestamp: new Date().toISOString()
      },
      created_at: new Date()
    };

    // Log alert
    await this.logAlert(alert);

    // Send notifications
    await this.sendNotifications(alert);

    console.log(`ALERT [${rule.severity.toUpperCase()}]: ${rule.message}`);

    return alert;
  }

  async logAlert(alert) {
    try {
      await db.query(`
        INSERT INTO alert_logs
        (alert_type, severity, message, details, created_at)
        VALUES ($1, $2, $3, $4, NOW())
      `, [
        alert.name,
        alert.severity,
        alert.message,
        JSON.stringify(alert.details)
      ]);
    } catch (error) {
      console.error('Error logging alert:', error);
    }
  }

  async sendNotifications(alert) {
    // Send to admins based on severity
    if (alert.severity === 'critical') {
      await this.sendWhatsAppAlert(alert);
      await this.sendEmailAlert(alert);
    } else if (alert.severity === 'warning') {
      await this.sendWhatsAppAlert(alert);
    }

    // Also send to monitoring system
    await this.sendToMonitoringSystem(alert);
  }

  async sendWhatsAppAlert(alert) {
    try {
      const admins = await db.query(
        'SELECT whatsapp FROM admin_users WHERE role = $1 AND is_active = true',
        ['super_admin']
      );

      const message = `🚨 ${alert.severity.toUpperCase()} Alert\n\n${alert.message}\n\nTime: ${alert.created_at.toLocaleString()}`;

      for (const admin of admins.rows) {
        if (admin.whatsapp) {
          await whatsappService.sendMessage(admin.whatsapp, message);
        }
      }
    } catch (error) {
      console.error('Error sending WhatsApp alert:', error);
    }
  }

  async sendEmailAlert(alert) {
    // Implement email alert
    console.log('Email alert would be sent:', alert);
  }

  async sendToMonitoringSystem(alert) {
    // Send to external monitoring systems
    // e.g., DataDog, New Relic, etc.
    console.log('Alert sent to monitoring system:', alert);
  }

  async resolveAlert(alertId) {
    try {
      await db.query(
        'UPDATE alert_logs SET resolved_at = NOW() WHERE id = ?',
        [alertId]
      );

      console.log(`Alert resolved: ${alertId}`);

    } catch (error) {
      console.error('Error resolving alert:', error);
    }
  }
}
```

## 7. Monitoring Dashboard

### 7.1 Dashboard UI
```html
<!-- views/monitoring/index.ejs -->
<div class="container-fluid">
  <h4 class="mb-4">System Monitoring</h4>

  <!-- System Status Overview -->
  <div class="row mb-4">
    <div class="col-md-3">
      <div class="card" id="systemStatusCard">
        <div class="card-body text-center">
          <div class="system-status-indicator mb-2">
            <i class="fas fa-circle fa-2x" id="systemStatusIcon"></i>
          </div>
          <h5 class="card-title">System Status</h5>
          <p class="card-text" id="systemStatusText">Checking...</p>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card">
        <div class="card-body">
          <h6 class="card-subtitle mb-2 text-muted">CPU Usage</h6>
          <div class="d-flex align-items-center">
            <div class="me-3">
              <canvas id="cpuGauge" width="60" height="60"></canvas>
            </div>
            <div>
              <h3 class="mb-0" id="cpuUsage">-</h3>
              <small class="text-muted">%</small>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card">
        <div class="card-body">
          <h6 class="card-subtitle mb-2 text-muted">Memory Usage</h6>
          <div class="d-flex align-items-center">
            <div class="me-3">
              <canvas id="memoryGauge" width="60" height="60"></canvas>
            </div>
            <div>
              <h3 class="mb-0" id="memoryUsage">-</h3>
              <small class="text-muted">%</small>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card">
        <div class="card-body">
          <h6 class="card-subtitle mb-2 text-muted">Disk Usage</h6>
          <div class="d-flex align-items-center">
            <div class="me-3">
              <canvas id="diskGauge" width="60" height="60"></canvas>
            </div>
            <div>
              <h3 class="mb-0" id="diskUsage">-</h3>
              <small class="text-muted">%</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Service Health -->
  <div class="row mb-4">
    <div class="col-12">
      <div class="card">
        <div class="card-header">
          <h5 class="mb-0">Service Health</h5>
        </div>
        <div class="card-body">
          <div class="row" id="serviceHealthRow">
            <!-- Service health cards loaded dynamically -->
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Performance Metrics -->
  <div class="row mb-4">
    <div class="col-md-6">
      <div class="card">
        <div class="card-header">
          <h5 class="mb-0">API Response Time</h5>
        </div>
        <div class="card-body">
          <canvas id="responseTimeChart" height="100"></canvas>
        </div>
      </div>
    </div>
    <div class="col-md-6">
      <div class="card">
        <div class="card-header">
          <h5 class="mb-0">Request Rate</h5>
        </div>
        <div class="card-body">
          <canvas id="requestRateChart" height="100"></canvas>
        </div>
      </div>
    </div>
  </div>

  <!-- Active Users -->
  <div class="row mb-4">
    <div class="col-12">
      <div class="card">
        <div class="card-header">
          <h5 class="mb-0">Active Users</h5>
        </div>
        <div class="card-body">
          <div class="row text-center">
            <div class="col-md-4">
              <h2 class="text-primary" id="activeHotspot">-</h2>
              <p class="mb-0">Hotspot Users</p>
            </div>
            <div class="col-md-4">
              <h2 class="text-success" id="activePPPoE">-</h2>
              <p class="mb-0">PPPoE Users</p>
            </div>
            <div class="col-md-4">
              <h2 class="text-info" id="totalRevenue">-</h2>
              <p class="mb-0">Revenue Today</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Recent Alerts -->
  <div class="row">
    <div class="col-12">
      <div class="card">
        <div class="card-header d-flex justify-content-between">
          <h5 class="mb-0">Recent Alerts</h5>
          <button class="btn btn-sm btn-outline-primary" onclick="refreshAlerts()">
            <i class="fas fa-sync"></i>
          </button>
        </div>
        <div class="card-body">
          <div id="recentAlerts">
            <!-- Alerts loaded dynamically -->
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

### 7.2 Dashboard JavaScript
```javascript
// public/js/monitoring.js
class MonitoringDashboard {
  static charts = {};
  static updateInterval;

  static init() {
    this.loadSystemStatus();
    this.loadMetrics();
    this.loadServiceHealth();
    this.loadRecentAlerts();

    // Start auto-refresh
    this.startAutoRefresh();
  }

  static startAutoRefresh() {
    // Update every 30 seconds
    this.updateInterval = setInterval(() => {
      this.loadSystemStatus();
      this.loadMetrics();
      this.loadServiceHealth();
    }, 30000);
  }

  static async loadSystemStatus() {
    try {
      const response = await fetch('/api/monitoring/health');
      const health = await response.json();

      this.updateSystemStatus(health);

    } catch (error) {
      console.error('Error loading system status:', error);
      this.updateSystemStatus({ status: 'unhealthy' });
    }
  }

  static updateSystemStatus(health) {
    const statusIcon = document.getElementById('systemStatusIcon');
    const statusText = document.getElementById('systemStatusText');
    const statusCard = document.getElementById('systemStatusCard');

    // Update status indicator
    statusIcon.className = `fas fa-circle fa-2x text-${this.getStatusColor(health.status)}`;
    statusText.textContent = health.status.charAt(0).toUpperCase() + health.status.slice(1);

    // Update card border color
    statusCard.className = `card border-${this.getStatusColor(health.status)}`;
  }

  static async loadMetrics() {
    try {
      const response = await fetch('/api/monitoring/metrics');
      const metrics = await response.json();

      // Update gauges
      this.updateGauge('cpuGauge', 'cpuUsage', metrics.system?.cpu_usage || 0);
      this.updateGauge('memoryGauge', 'memoryUsage', metrics.system?.memory_usage || 0);
      this.updateGauge('diskGauge', 'diskUsage', metrics.system?.disk_usage || 0);

      // Update user counts
      document.getElementById('activeHotspot').textContent =
        metrics.active_users?.hotspot || 0;
      document.getElementById('activePPPoE').textContent =
        metrics.active_users?.pppoe || 0;
      document.getElementById('totalRevenue').textContent =
        this.formatCurrency(metrics.business?.daily_revenue || 0);

      // Update charts
      this.updateResponseTimeChart(metrics.performance?.response_times || []);
      this.updateRequestRateChart(metrics.performance?.request_rates || []);

    } catch (error) {
      console.error('Error loading metrics:', error);
    }
  }

  static updateGauge(canvasId, textId, value) {
    const canvas = document.getElementById(canvasId);
    const textElement = document.getElementById(textId);

    if (!canvas || !textElement) return;

    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 25;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = '#e9ecef';
    ctx.lineWidth = 8;
    ctx.stroke();

    // Draw value arc
    const angle = (value / 100) * 2 * Math.PI - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, -Math.PI / 2, angle);

    // Color based on value
    let color = '#28a745'; // Green
    if (value > 80) color = '#dc3545'; // Red
    else if (value > 60) color = '#ffc107'; // Yellow

    ctx.strokeStyle = color;
    ctx.lineWidth = 8;
    ctx.stroke();

    // Update text
    textElement.textContent = Math.round(value);
  }

  static async loadServiceHealth() {
    try {
      const response = await fetch('/api/monitoring/health');
      const health = await response.json();

      const container = document.getElementById('serviceHealthRow');
      container.innerHTML = '';

      for (const [service, status] of Object.entries(health.checks || {})) {
        const card = document.createElement('div');
        card.className = 'col-md-3 mb-3';
        card.innerHTML = `
          <div class="card border-${this.getStatusColor(status.status)}">
            <div class="card-body text-center">
              <h6 class="card-title">${this.formatServiceName(service)}</h6>
              <div class="mb-2">
                <i class="fas fa-circle text-${this.getStatusColor(status.status)}"></i>
                <span class="ms-2">${status.status}</span>
              </div>
              ${status.response_time ? `
                <small class="text-muted">${status.response_time}ms</small>
              ` : ''}
            </div>
          </div>
        `;
        container.appendChild(card);
      }

    } catch (error) {
      console.error('Error loading service health:', error);
    }
  }

  static async loadRecentAlerts() {
    try {
      const response = await fetch('/api/monitoring/alerts');
      const alerts = await response.json();

      const container = document.getElementById('recentAlerts');

      if (alerts.length === 0) {
        container.innerHTML = '<p class="text-muted">No recent alerts</p>';
        return;
      }

      container.innerHTML = alerts.slice(0, 5).map(alert => `
        <div class="alert alert-${alert.severity === 'critical' ? 'danger' : 'warning'} alert-dismissible fade show" role="alert">
          <strong>${alert.name}:</strong> ${alert.message}
          <small class="d-block mt-1">${this.formatDateTime(alert.created_at)}</small>
          <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
      `).join('');

    } catch (error) {
      console.error('Error loading alerts:', error);
    }
  }

  static updateResponseTimeChart(data) {
    const ctx = document.getElementById('responseTimeChart');
    if (!ctx) return;

    if (this.charts.responseTime) {
      this.charts.responseTime.destroy();
    }

    this.charts.responseTime = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(d => d.time),
        datasets: [{
          label: 'Response Time (ms)',
          data: data.map(d => d.value),
          borderColor: '#007bff',
          backgroundColor: 'rgba(0, 123, 255, 0.1)',
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }

  static updateRequestRateChart(data) {
    const ctx = document.getElementById('requestRateChart');
    if (!ctx) return;

    if (this.charts.requestRate) {
      this.charts.requestRate.destroy();
    }

    this.charts.requestRate = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => d.time),
        datasets: [{
          label: 'Requests/min',
          data: data.map(d => d.value),
          backgroundColor: 'rgba(40, 167, 69, 0.5)',
          borderColor: '#28a745',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }

  static getStatusColor(status) {
    switch (status) {
      case 'healthy': return 'success';
      case 'degraded': return 'warning';
      case 'unhealthy': return 'danger';
      default: return 'secondary';
    }
  }

  static formatServiceName(service) {
    return service.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  static formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR'
    }).format(amount);
  }

  static formatDateTime(dateString) {
    return new Date(dateString).toLocaleString('id-ID');
  }
}

// Global functions
function refreshAlerts() {
  MonitoringDashboard.loadRecentAlerts();
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Load Chart.js
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
  script.onload = () => MonitoringDashboard.init();
  document.head.appendChild(script);
});
```

## 8. API Endpoints

### 8.1 Monitoring API Endpoints
```javascript
// Health check endpoint
GET /api/monitoring/health
// Response: { status: 'healthy', checks: { ... } }

// Metrics endpoint
GET /api/monitoring/metrics
// Response: { system: {...}, application: {...}, business: {...} }

// Performance data endpoint
GET /api/monitoring/performance?period=1h&metric=response_time
// Response: { timestamps: [...], values: [...] }

// Alerts endpoint
GET /api/monitoring/alerts?status=active&severity=critical
// Response: [{ id, name, severity, message, created_at, ... }]

// Prometheus metrics endpoint
GET /metrics
// Response: Prometheus metrics format

// Custom metrics endpoint
POST /api/monitoring/metrics
{
  metric_name: 'custom_metric',
  value: 123,
  labels: { type: 'business' }
}

// Create alert rule
POST /api/monitoring/alerts/rules
{
  name: 'custom_alert',
  condition: 'custom_metric > 100',
  severity: 'warning',
  message: 'Custom metric threshold exceeded'
}
```

## 9. Best Practices

### 9.1 Performance Best Practices
1. **Monitor Everything**: Log everything that can affect performance
2. **Set Meaningful Alerts**: Avoid alert fatigue with relevant alerts
3. **Use Percentiles**: Track p95, p99 not just averages
4. **Baseline Metrics**: Establish performance baselines
5. **Regular Reviews**: Review and adjust monitoring rules
6. **Documentation**: Document what to monitor and why

### 9.2 Monitoring Guidelines
1. **SLA Monitoring**: Track against service level agreements
2. **Capacity Planning**: Monitor trends for capacity planning
3. **Anomaly Detection**: Set up anomaly detection for unusual patterns
4. **Historical Analysis**: Use historical data for optimization
5. **Real-time Alerts**: Critical issues need immediate alerts
6. **Dashboard Access**: Ensure relevant stakeholders have access

## 10. Integration with External Tools

### 10.1 Prometheus Integration
```javascript
// src/services/PrometheusExporter.js
class PrometheusExporter {
  constructor(metricsCollector) {
    this.metricsCollector = metricsCollector;
    this.server = null;
  }

  start(port = 9090) {
    const express = require('express');
    const app = express();

    app.get('/metrics', (req, res) => {
      res.set('Content-Type', this.metricsCollector.register.contentType);
      res.end(this.metricsCollector.register.metrics());
    });

    this.server = app.listen(port, () => {
      console.log(`Prometheus metrics server listening on port ${port}`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
  }
}
```

### 10.2 DataDog Integration
```javascript
// src/services/DataDogExporter.js
class DataDogExporter {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.host = process.env.DATADOG_HOST || 'api.datadoghq.com';
  }

  async sendMetric(name, value, tags = {}) {
    const body = {
      series: [{
        metric: name,
        points: [[Date.now() / 1000, value]],
        tags: Object.entries(tags).map(([k, v]) => `${k}:${v}`)
      }]
    };

    await fetch(`https://${this.host}/api/v1/series?api_key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  }

  async sendEvent(title, text, tags = {}) {
    const body = {
      title: title,
      text: text,
      tags: Object.entries(tags).map(([k, v]) => `${k}:${v}`),
      date_happened: Math.floor(Date.now() / 1000)
    };

    await fetch(`https://${this.host}/api/v1/events?api_key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  }
}
```

---

*Version: 2.0.0*
*Last Updated: 2025-01-09*
*Status: Ready for Implementation*