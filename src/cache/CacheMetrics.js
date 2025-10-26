/**
 * Cache Performance Metrics and Monitoring System
 * Comprehensive metrics collection, analysis, and alerting for cache performance
 */

const EventEmitter = require('events');

class CacheMetrics extends EventEmitter {
  constructor(cacheManager, config = {}) {
    super();
    
    this.cacheManager = cacheManager;
    this.config = {
      // Metrics collection
      collection: {
        interval: config.collection?.interval || 60000, // 1 minute
        retention: {
          raw: config.collection?.retention?.raw || 3600000, // 1 hour
          aggregated: config.collection?.retention?.aggregated || 86400000 // 24 hours
        },
        batchSize: config.collection?.batchSize || 100
      },
      
      // Metrics to track
      tracked: {
        performance: config.tracked?.performance || [
          'hit_rate',
          'miss_rate', 
          'avg_response_time',
          'throughput',
          'error_rate'
        ],
        usage: config.tracked?.usage || [
          'memory_usage',
          'cache_size',
          'evictions',
          'expirations',
          'key_count'
        ],
        operations: config.tracked?.operations || [
          'get_operations',
          'set_operations',
          'delete_operations',
          'batch_operations'
        ]
      },
      
      // Alerting thresholds
      thresholds: config.thresholds || {
        hitRate: {
          warning: 70, // percentage
          critical: 50
        },
        responseTime: {
          warning: 100, // milliseconds
          critical: 500
        },
        memoryUsage: {
          warning: 80, // percentage
          critical: 95
        },
        errorRate: {
          warning: 1, // percentage
          critical: 5
        },
        evictionRate: {
          warning: 10, // evictions per minute
          critical: 50
        }
      },
      
      // Export formats
      export: {
        prometheus: config.export?.prometheus || false,
        json: config.export?.json !== false,
        csv: config.export?.csv || false,
        graphite: config.export?.graphite || false
      },
      
      // Monitoring
      debug: config.debug || false,
      healthCheckInterval: config.healthCheckInterval || 300000 // 5 minutes
    };

    // Metrics storage
    this.rawMetrics = [];
    this.aggregatedMetrics = new Map(); // timestamp -> aggregated data
    this.layerMetrics = new Map(); // layer name -> metrics
    this.alertHistory = [];
    
    // Performance tracking
    this.responseTimeHistory = [];
    this.operationHistory = [];
    this.errorHistory = [];
    
    // Alerting state
    this.activeAlerts = new Set();
    this.alertCooldowns = new Map(); // alert type -> last triggered time
    
    // Timers
    this.collectionTimer = null;
    this.healthCheckTimer = null;
    this.cleanupTimer = null;
    
    // Initialize metrics system
    this.initialize();
  }

  /**
   * Initialize the metrics system
   */
  initialize() {
    // Setup metrics collection
    this.setupMetricsCollection();
    
    // Setup health checking
    this.setupHealthChecking();
    
    // Setup cleanup
    this.setupCleanup();
    
    // Setup event listeners
    this.setupEventListeners();
    
    this.debugLog('Cache metrics initialized', {
      collectionInterval: this.config.collection.interval,
      trackedMetrics: Object.keys(this.config.tracked).length,
      thresholds: Object.keys(this.config.thresholds).length
    });
  }

  /**
   * Setup metrics collection
   */
  setupMetricsCollection() {
    this.collectionTimer = setInterval(async () => {
      await this.collectMetrics();
    }, this.config.collection.interval);
  }

  /**
   * Setup health checking
   */
  setupHealthChecking() {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  /**
   * Setup cleanup of old metrics
   */
  setupCleanup() {
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldMetrics();
    }, this.config.collection.retention.raw);
  }

  /**
   * Setup event listeners for cache events
   */
  setupEventListeners() {
    // Listen to cache manager events
    this.cacheManager.on('hit', (key, layer, responseTime) => {
      this.recordOperation('hit', { key, layer, responseTime });
    });

    this.cacheManager.on('miss', (key) => {
      this.recordOperation('miss', { key });
    });

    this.cacheManager.on('set', (key, successCount, results) => {
      this.recordOperation('set', { key, successCount, results });
    });

    this.cacheManager.on('delete', (key, successCount, results) => {
      this.recordOperation('delete', { key, successCount, results });
    });

    this.cacheManager.on('error', (error, key) => {
      this.recordError(error, key);
    });

    // Listen to layer events
    this.cacheManager.on('layer:hit', (layer, key, responseTime) => {
      this.recordLayerOperation(layer, 'hit', { key, responseTime });
    });

    this.cacheManager.on('layer:miss', (layer, key) => {
      this.recordLayerOperation(layer, 'miss', { key });
    });

    this.cacheManager.on('layer:error', (layer, error) => {
      this.recordLayerError(layer, error);
    });
  }

  /**
   * Collect comprehensive metrics
   */
  async collectMetrics() {
    try {
      const timestamp = Date.now();
      
      // Get cache manager stats
      const managerStats = this.cacheManager.getStats();
      
      // Get health status
      const healthStatus = await this.cacheManager.healthCheck();
      
      // Calculate performance metrics
      const performanceMetrics = this.calculatePerformanceMetrics(timestamp);
      
      // Calculate usage metrics
      const usageMetrics = this.calculateUsageMetrics(managerStats);
      
      // Calculate operation metrics
      const operationMetrics = this.calculateOperationMetrics();
      
      // Combine all metrics
      const metrics = {
        timestamp,
        performance: performanceMetrics,
        usage: usageMetrics,
        operations: operationMetrics,
        health: healthStatus,
        manager: managerStats
      };

      // Store raw metrics
      this.rawMetrics.push(metrics);
      
      // Update layer metrics
      this.updateLayerMetrics(managerStats);
      
      // Aggregate metrics
      this.aggregateMetrics(timestamp, metrics);
      
      // Check thresholds and trigger alerts
      this.checkThresholds(metrics);
      
      // Emit metrics event
      this.emit('metrics', metrics);
      
      this.debugLog('Metrics collected', {
        timestamp,
        hitRate: performanceMetrics.hitRate,
        responseTime: performanceMetrics.avgResponseTime
      });
    } catch (error) {
      this.debugLog('Error collecting metrics:', error);
      this.emit('error', error);
    }
  }

  /**
   * Calculate performance metrics
   */
  calculatePerformanceMetrics(timestamp) {
    const recentWindow = 5 * 60 * 1000; // 5 minutes
    const recentOperations = this.operationHistory.filter(
      op => timestamp - op.timestamp <= recentWindow
    );
    
    const hits = recentOperations.filter(op => op.type === 'hit').length;
    const misses = recentOperations.filter(op => op.type === 'miss').length;
    const total = hits + misses;
    
    const responseTimes = recentOperations
      .filter(op => op.responseTime)
      .map(op => op.responseTime);
    
    const errors = this.errorHistory.filter(
      error => timestamp - error.timestamp <= recentWindow
    ).length;
    
    return {
      hitRate: total > 0 ? (hits / total) * 100 : 0,
      missRate: total > 0 ? (misses / total) * 100 : 0,
      avgResponseTime: responseTimes.length > 0 ? 
        responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length : 0,
      p95ResponseTime: this.calculatePercentile(responseTimes, 0.95),
      p99ResponseTime: this.calculatePercentile(responseTimes, 0.99),
      throughput: recentOperations.length / (recentWindow / 1000), // operations per second
      errorRate: total > 0 ? (errors / total) * 100 : 0,
      totalOperations: total,
      cacheEfficiency: this.calculateCacheEfficiency(hits, misses, responseTimes)
    };
  }

  /**
   * Calculate usage metrics
   */
  calculateUsageMetrics(managerStats) {
    let totalMemoryUsage = 0;
    let totalCacheSize = 0;
    let totalEvictions = 0;
    let totalExpirations = 0;
    
    // Aggregate from all layers
    if (managerStats.layers) {
      for (const [layerName, layerStats] of Object.entries(managerStats.layers)) {
        totalMemoryUsage += layerStats.memoryUsage || 0;
        totalCacheSize += layerStats.cacheSize || layerStats.size || 0;
        totalEvictions += layerStats.evictions || 0;
        totalExpirations += layerStats.expirations || 0;
      }
    }
    
    return {
      memoryUsage: totalMemoryUsage,
      memoryUsageMB: totalMemoryUsage / (1024 * 1024),
      cacheSize: totalCacheSize,
      evictions: totalEvictions,
      expirations: totalExpirations,
      evictionRate: totalEvictions / (this.config.collection.interval / 1000), // per second
      memoryUtilization: this.calculateMemoryUtilization(totalMemoryUsage),
      cacheUtilization: this.calculateCacheUtilization(totalCacheSize)
    };
  }

  /**
   * Calculate operation metrics
   */
  calculateOperationMetrics() {
    const recentWindow = this.config.collection.interval;
    const recentOperations = this.operationHistory.filter(
      op => Date.now() - op.timestamp <= recentWindow
    );
    
    const gets = recentOperations.filter(op => op.type === 'hit' || op.type === 'miss').length;
    const sets = recentOperations.filter(op => op.type === 'set').length;
    const deletes = recentOperations.filter(op => op.type === 'delete').length;
    
    return {
      getOperations: gets,
      setOperations: sets,
      deleteOperations: deletes,
      batchOperations: recentOperations.filter(op => op.batch).length,
      totalOperations: recentOperations.length,
      operationRate: recentOperations.length / (recentWindow / 1000) // per second
    };
  }

  /**
   * Calculate percentile value
   */
  calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;
    
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[index] || 0;
  }

  /**
   * Calculate cache efficiency score
   */
  calculateCacheEfficiency(hits, misses, responseTimes) {
    if (hits + misses === 0) return 0;
    
    const hitRate = hits / (hits + misses);
    const avgResponseTime = responseTimes.length > 0 ? 
      responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length : 0;
    
    // Efficiency score: hit rate weighted by response time (lower is better)
    const responseTimeScore = Math.max(0, 1 - (avgResponseTime / 1000)); // Normalize to 0-1
    return hitRate * 0.7 + responseTimeScore * 0.3;
  }

  /**
   * Calculate memory utilization percentage
   */
  calculateMemoryUtilization(memoryUsage) {
    // Assume 1GB limit for now, this could be configurable
    const maxMemory = 1024 * 1024 * 1024; // 1GB
    return (memoryUsage / maxMemory) * 100;
  }

  /**
   * Calculate cache utilization percentage
   */
  calculateCacheUtilization(cacheSize) {
    // Assume 100,000 items limit for now
    const maxItems = 100000;
    return Math.min((cacheSize / maxItems) * 100, 100);
  }

  /**
   * Update layer-specific metrics
   */
  updateLayerMetrics(managerStats) {
    if (managerStats.layers) {
      for (const [layerName, layerStats] of Object.entries(managerStats.layers)) {
        if (!this.layerMetrics.has(layerName)) {
          this.layerMetrics.set(layerName, []);
        }
        
        const layerHistory = this.layerMetrics.get(layerName);
        layerHistory.push({
          timestamp: Date.now(),
          stats: layerStats
        });
        
        // Keep only recent history
        const maxHistory = 100;
        if (layerHistory.length > maxHistory) {
          layerHistory.splice(0, layerHistory.length - maxHistory);
        }
      }
    }
  }

  /**
   * Aggregate metrics over time windows
   */
  aggregateMetrics(timestamp, metrics) {
    const window = 5 * 60 * 1000; // 5 minutes
    const windowStart = Math.floor(timestamp / window) * window;
    
    if (!this.aggregatedMetrics.has(windowStart)) {
      this.aggregatedMetrics.set(windowStart, {
        timestamp: windowStart,
        samples: [],
        min: {},
        max: {},
        avg: {},
        sum: {}
      });
    }
    
    const aggregated = this.aggregatedMetrics.get(windowStart);
    aggregated.samples.push(metrics);
    
    // Update aggregates
    this.updateAggregates(aggregated, metrics);
  }

  /**
   * Update aggregate values
   */
  updateAggregates(aggregated, metrics) {
    const updateField = (field, value) => {
      if (typeof value === 'number') {
        aggregated.sum[field] = (aggregated.sum[field] || 0) + value;
        aggregated.min[field] = Math.min(aggregated.min[field] || value, value);
        aggregated.max[field] = Math.max(aggregated.max[field] || value, value);
        aggregated.avg[field] = aggregated.sum[field] / aggregated.samples.length;
      }
    };
    
    // Performance metrics
    updateField('hitRate', metrics.performance.hitRate);
    updateField('avgResponseTime', metrics.performance.avgResponseTime);
    updateField('throughput', metrics.performance.throughput);
    updateField('errorRate', metrics.performance.errorRate);
    
    // Usage metrics
    updateField('memoryUsage', metrics.usage.memoryUsage);
    updateField('cacheSize', metrics.usage.cacheSize);
    updateField('evictions', metrics.usage.evictions);
  }

  /**
   * Check thresholds and trigger alerts
   */
  checkThresholds(metrics) {
    const checks = [
      { metric: 'hitRate', value: metrics.performance.hitRate, type: 'performance' },
      { metric: 'responseTime', value: metrics.performance.avgResponseTime, type: 'performance' },
      { metric: 'memoryUsage', value: metrics.usage.memoryUtilization, type: 'usage' },
      { metric: 'errorRate', value: metrics.performance.errorRate, type: 'performance' },
      { metric: 'evictionRate', value: metrics.usage.evictionRate, type: 'usage' }
    ];
    
    for (const check of checks) {
      this.checkThreshold(check.metric, check.value, check.type, metrics);
    }
  }

  /**
   * Check individual threshold
   */
  checkThreshold(metric, value, type, metrics) {
    const threshold = this.config.thresholds[metric];
    if (!threshold) return;
    
    const alertKey = `${type}:${metric}`;
    const now = Date.now();
    
    // Check cooldown
    const lastTriggered = this.alertCooldowns.get(alertKey) || 0;
    if (now - lastTriggered < 60000) { // 1 minute cooldown
      return;
    }
    
    let alertLevel = null;
    let message = '';
    
    if (metric === 'hitRate') {
      if (value < threshold.critical) {
        alertLevel = 'critical';
        message = `Cache hit rate critically low: ${value.toFixed(2)}%`;
      } else if (value < threshold.warning) {
        alertLevel = 'warning';
        message = `Cache hit rate low: ${value.toFixed(2)}%`;
      }
    } else if (metric === 'responseTime') {
      if (value > threshold.critical) {
        alertLevel = 'critical';
        message = `Cache response time critically high: ${value.toFixed(2)}ms`;
      } else if (value > threshold.warning) {
        alertLevel = 'warning';
        message = `Cache response time high: ${value.toFixed(2)}ms`;
      }
    } else if (metric === 'memoryUsage') {
      if (value > threshold.critical) {
        alertLevel = 'critical';
        message = `Cache memory usage critically high: ${value.toFixed(2)}%`;
      } else if (value > threshold.warning) {
        alertLevel = 'warning';
        message = `Cache memory usage high: ${value.toFixed(2)}%`;
      }
    } else if (metric === 'errorRate') {
      if (value > threshold.critical) {
        alertLevel = 'critical';
        message = `Cache error rate critically high: ${value.toFixed(2)}%`;
      } else if (value > threshold.warning) {
        alertLevel = 'warning';
        message = `Cache error rate high: ${value.toFixed(2)}%`;
      }
    }
    
    if (alertLevel) {
      this.triggerAlert(alertKey, alertLevel, message, {
        metric,
        value,
        threshold: threshold[alertLevel],
        timestamp: now,
        metrics
      });
    } else if (this.activeAlerts.has(alertKey)) {
      // Clear alert if back to normal
      this.clearAlert(alertKey);
    }
  }

  /**
   * Trigger an alert
   */
  triggerAlert(alertKey, level, message, data) {
    const alert = {
      id: alertKey,
      level,
      message,
      data,
      timestamp: Date.now(),
      status: 'active'
    };
    
    this.activeAlerts.add(alertKey);
    this.alertCooldowns.set(alertKey, Date.now());
    this.alertHistory.push(alert);
    
    this.emit('alert', alert);
    this.debugLog(`Alert triggered: ${level.toUpperCase()} - ${message}`, data);
  }

  /**
   * Clear an alert
   */
  clearAlert(alertKey) {
    this.activeAlerts.delete(alertKey);
    
    const alert = {
      id: alertKey,
      level: 'info',
      message: `Alert cleared: ${alertKey}`,
      timestamp: Date.now(),
      status: 'cleared'
    };
    
    this.alertHistory.push(alert);
    this.emit('alert:cleared', alert);
    this.debugLog(`Alert cleared: ${alertKey}`);
  }

  /**
   * Record cache operation
   */
  recordOperation(type, data) {
    const operation = {
      type,
      timestamp: Date.now(),
      ...data
    };
    
    this.operationHistory.push(operation);
    
    // Keep only recent history
    const maxHistory = 10000;
    if (this.operationHistory.length > maxHistory) {
      this.operationHistory.splice(0, this.operationHistory.length - maxHistory);
    }
  }

  /**
   * Record layer operation
   */
  recordLayerOperation(layer, type, data) {
    // This could be stored separately if needed for layer-specific analysis
    this.recordOperation(type, { ...data, layer });
  }

  /**
   * Record error
   */
  recordError(error, key) {
    const errorRecord = {
      error: error.message || error,
      stack: error.stack,
      key,
      timestamp: Date.now()
    };
    
    this.errorHistory.push(errorRecord);
    
    // Keep only recent history
    const maxHistory = 1000;
    if (this.errorHistory.length > maxHistory) {
      this.errorHistory.splice(0, this.errorHistory.length - maxHistory);
    }
  }

  /**
   * Record layer error
   */
  recordLayerError(layer, error) {
    this.recordError(error, { layer });
  }

  /**
   * Perform health check
   */
  async performHealthCheck() {
    try {
      const health = await this.cacheManager.healthCheck();
      
      // Check if any layer is unhealthy
      const unhealthyLayers = Object.entries(health.layers || {})
        .filter(([_, layerHealth]) => layerHealth.status !== 'healthy');
      
      if (unhealthyLayers.length > 0) {
        this.triggerAlert('health:unhealthy', 'critical', 
          `Cache health check failed: ${unhealthyLayers.length} layers unhealthy`,
          { unhealthyLayers, health }
        );
      } else {
        this.clearAlert('health:unhealthy');
      }
      
      this.emit('health:check', health);
    } catch (error) {
      this.triggerAlert('health:error', 'critical', 
        `Cache health check failed: ${error.message}`,
        { error }
      );
    }
  }

  /**
   * Clean up old metrics
   */
  cleanupOldMetrics() {
    const now = Date.now();
    const rawRetention = this.config.collection.retention.raw;
    const aggregatedRetention = this.config.collection.retention.aggregated;
    
    // Clean raw metrics
    this.rawMetrics = this.rawMetrics.filter(
      metric => now - metric.timestamp <= rawRetention
    );
    
    // Clean aggregated metrics
    for (const [timestamp] of this.aggregatedMetrics.entries()) {
      if (now - timestamp > aggregatedRetention) {
        this.aggregatedMetrics.delete(timestamp);
      }
    }
    
    // Clean alert history
    const alertRetention = 7 * 24 * 60 * 60 * 1000; // 7 days
    this.alertHistory = this.alertHistory.filter(
      alert => now - alert.timestamp <= alertRetention
    );
    
    this.debugLog('Cleaned up old metrics', {
      rawMetrics: this.rawMetrics.length,
      aggregatedMetrics: this.aggregatedMetrics.size,
      alerts: this.alertHistory.length
    });
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics() {
    return this.rawMetrics.length > 0 ? 
      this.rawMetrics[this.rawMetrics.length - 1] : null;
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(duration = 3600000) { // Default 1 hour
    const since = Date.now() - duration;
    return this.rawMetrics.filter(metric => metric.timestamp >= since);
  }

  /**
   * Get aggregated metrics
   */
  getAggregatedMetrics(duration = 3600000) {
    const since = Date.now() - duration;
    const result = [];
    
    for (const [timestamp, aggregated] of this.aggregatedMetrics.entries()) {
      if (timestamp >= since) {
        result.push(aggregated);
      }
    }
    
    return result.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get layer metrics
   */
  getLayerMetrics(layerName, duration = 3600000) {
    const layerHistory = this.layerMetrics.get(layerName) || [];
    const since = Date.now() - duration;
    
    return layerHistory.filter(metric => metric.timestamp >= since);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts() {
    return Array.from(this.activeAlerts).map(alertKey => {
      const alert = this.alertHistory.find(a => a.id === alertKey);
      return alert || { id: alertKey, status: 'unknown' };
    });
  }

  /**
   * Get alert history
   */
  getAlertHistory(duration = 24 * 60 * 60 * 1000) { // Default 24 hours
    const since = Date.now() - duration;
    return this.alertHistory.filter(alert => alert.timestamp >= since);
  }

  /**
   * Export metrics in different formats
   */
  exportMetrics(format = 'json', options = {}) {
    const metrics = this.getCurrentMetrics();
    
    if (!metrics) {
      return null;
    }
    
    switch (format.toLowerCase()) {
      case 'prometheus':
        return this.exportPrometheus(metrics, options);
      case 'csv':
        return this.exportCSV(metrics, options);
      case 'graphite':
        return this.exportGraphite(metrics, options);
      default:
        return metrics;
    }
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheus(metrics, options = {}) {
    const prefix = options.prefix || 'cache_';
    const lines = [];
    
    // Performance metrics
    lines.push(`${prefix}hit_rate ${metrics.performance.hitRate}`);
    lines.push(`${prefix}avg_response_time_ms ${metrics.performance.avgResponseTime}`);
    lines.push(`${prefix}throughput_ops_per_sec ${metrics.performance.throughput}`);
    lines.push(`${prefix}error_rate ${metrics.performance.errorRate}`);
    
    // Usage metrics
    lines.push(`${prefix}memory_usage_bytes ${metrics.usage.memoryUsage}`);
    lines.push(`${prefix}cache_size ${metrics.usage.cacheSize}`);
    lines.push(`${prefix}evictions_total ${metrics.usage.evictions}`);
    
    // Operation metrics
    lines.push(`${prefix}get_operations_total ${metrics.operations.getOperations}`);
    lines.push(`${prefix}set_operations_total ${metrics.operations.setOperations}`);
    lines.push(`${prefix}delete_operations_total ${metrics.operations.deleteOperations}`);
    
    return lines.join('\n');
  }

  /**
   * Export metrics in CSV format
   */
  exportCSV(metrics, options = {}) {
    const headers = options.headers || [
      'timestamp', 'hit_rate', 'avg_response_time', 'throughput', 
      'memory_usage', 'cache_size', 'evictions'
    ];
    
    const values = [
      metrics.timestamp,
      metrics.performance.hitRate,
      metrics.performance.avgResponseTime,
      metrics.performance.throughput,
      metrics.usage.memoryUsage,
      metrics.usage.cacheSize,
      metrics.usage.evictions
    ];
    
    return headers.join(',') + '\n' + values.join(',');
  }

  /**
   * Export metrics in Graphite format
   */
  exportGraphite(metrics, options = {}) {
    const prefix = options.prefix || 'cache';
    const timestamp = Math.floor(metrics.timestamp / 1000);
    const lines = [];
    
    lines.push(`${prefix}.hit_rate ${metrics.performance.hitRate} ${timestamp}`);
    lines.push(`${prefix}.avg_response_time ${metrics.performance.avgResponseTime} ${timestamp}`);
    lines.push(`${prefix}.throughput ${metrics.performance.throughput} ${timestamp}`);
    lines.push(`${prefix}.memory_usage ${metrics.usage.memoryUsage} ${timestamp}`);
    
    return lines.join('\n');
  }

  /**
   * Get comprehensive statistics
   */
  getStats() {
    const currentMetrics = this.getCurrentMetrics();
    const activeAlerts = this.getActiveAlerts();
    
    return {
      collection: {
        rawMetricsCount: this.rawMetrics.length,
        aggregatedMetricsCount: this.aggregatedMetrics.size,
        layerMetricsCount: this.layerMetrics.size,
        alertsCount: this.alertHistory.length,
        activeAlertsCount: activeAlerts.length
      },
      current: currentMetrics,
      alerts: {
        active: activeAlerts,
        total: this.alertHistory.length
      },
      config: {
        collectionInterval: this.config.collection.interval,
        retention: this.config.collection.retention,
        trackedMetrics: this.config.tracked
      }
    };
  }

  /**
   * Debug logging
   */
  debugLog(message, data = null) {
    if (this.config.debug) {
      console.log(`[CacheMetrics] ${message}`, data || '');
    }
  }

  /**
   * Close and cleanup
   */
  async close() {
    // Clear timers
    if (this.collectionTimer) {
      clearInterval(this.collectionTimer);
    }
    
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    // Clear data
    this.rawMetrics = [];
    this.aggregatedMetrics.clear();
    this.layerMetrics.clear();
    this.alertHistory = [];
    this.activeAlerts.clear();
    this.alertCooldowns.clear();
    
    this.emit('close');
    this.debugLog('Cache metrics closed');
  }
}

module.exports = CacheMetrics;