/**
 * Central Metrics Collection System
 * Collects and aggregates metrics from all system components
 * @version 1.0.0
 * @author Mikrotik Billing System
 */

const EventEmitter = require('events');
const { Worker } = require('worker_threads');

class MetricsCollector extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      collectionInterval: config.collectionInterval || 30000, // 30 seconds
      batchSize: config.batchSize || 1000,
      retentionPeriod: config.retentionPeriod || 86400000, // 24 hours
      enableRealtime: config.enableRealtime !== false,
      enableWorkers: config.enableWorkers !== false,
      maxMemoryUsage: config.maxMemoryUsage || 100 * 1024 * 1024, // 100MB
      ...config
    };

    this.metrics = new Map();
    this.timers = new Map();
    this.workers = [];
    this.isCollecting = false;
    this.lastCollection = null;
    this.collectionErrors = [];

    // Initialize metric collectors
    this.collectors = {
      business: new Map(),
      system: new Map(),
      application: new Map(),
      database: new Map(),
      cache: new Map(),
      mikrotik: new Map(),
      network: new Map()
    };

    // Initialize metrics storage
    this.initializeMetrics();

    // Start collection if enabled
    if (this.config.enableRealtime) {
      this.startCollection();
    }
  }

  /**
   * Initialize metrics storage with default metrics
   */
  initializeMetrics() {
    // Business metrics
    this.collectors.business.set('customers', {
      total: 0,
      active: 0,
      new: 0,
      churned: 0,
      byLocation: {},
      byType: {},
      lastUpdated: null
    });

    this.collectors.business.set('vouchers', {
      total: 0,
      active: 0,
      expired: 0,
      sold: 0,
      byLocation: {},
      byType: {},
      revenue: 0,
      lastUpdated: null
    });

    this.collectors.business.set('payments', {
      total: 0,
      successful: 0,
      failed: 0,
      pending: 0,
      amount: 0,
      byMethod: {},
      byLocation: {},
      lastUpdated: null
    });

    this.collectors.business.set('subscriptions', {
      total: 0,
      active: 0,
      expired: 0,
      recurring: 0,
      byType: {},
      byLocation: {},
      lastUpdated: null
    });

    // System metrics
    this.collectors.system.set('cpu', {
      usage: 0,
      loadAverage: [],
      cores: 0,
      processes: 0,
      lastUpdated: null
    });

    this.collectors.system.set('memory', {
      total: 0,
      used: 0,
      free: 0,
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      rss: 0,
      lastUpdated: null
    });

    this.collectors.system.set('disk', {
      total: 0,
      used: 0,
      free: 0,
      usage: 0,
      readSpeed: 0,
      writeSpeed: 0,
      lastUpdated: null
    });

    this.collectors.system.set('network', {
      bytesReceived: 0,
      bytesSent: 0,
      packetsReceived: 0,
      packetsSent: 0,
      connections: 0,
      lastUpdated: null
    });

    // Application metrics
    this.collectors.application.set('http', {
      requests: 0,
      activeRequests: 0,
      errors: 0,
      responseTime: [],
      statusCodes: {},
      routes: {},
      lastUpdated: null
    });

    this.collectors.application.set('events', {
      emitted: 0,
      processed: 0,
      failed: 0,
      queueSize: 0,
      processingTime: [],
      lastUpdated: null
    });

    this.collectors.application.set('sessions', {
      active: 0,
      total: 0,
      expired: 0,
      byUserType: {},
      lastUpdated: null
    });

    // Database metrics
    this.collectors.database.set('connections', {
      active: 0,
      idle: 0,
      total: 0,
      byPool: {},
      lastUpdated: null
    });

    this.collectors.database.set('queries', {
      total: 0,
      successful: 0,
      failed: 0,
      avgDuration: 0,
      byTable: {},
      byOperation: {},
      slowQueries: [],
      lastUpdated: null
    });

    this.collectors.database.set('transactions', {
      total: 0,
      committed: 0,
      rolledBack: 0,
      avgDuration: 0,
      lastUpdated: null
    });

    // Cache metrics
    this.collectors.cache.set('redis', {
      hitRate: 0,
      missRate: 0,
      hits: 0,
      misses: 0,
      operations: 0,
      memoryUsage: 0,
      keyCount: 0,
      lastUpdated: null
    });

    this.collectors.cache.set('lru', {
      hitRate: 0,
      size: 0,
      maxSize: 0,
      evictions: 0,
      operations: 0,
      lastUpdated: null
    });

    // Mikrotik metrics
    this.collectors.mikrotik.set('connections', {
      active: 0,
      total: 0,
      failed: 0,
      byLocation: {},
      byType: {},
      lastUpdated: null
    });

    this.collectors.mikrotik.set('api', {
      requests: 0,
      successful: 0,
      failed: 0,
      avgDuration: 0,
      byCommand: {},
      byLocation: {},
      errors: [],
      lastUpdated: null
    });

    this.collectors.mikrotik.set('users', {
      hotspot: 0,
      pppoe: 0,
      total: 0,
      byLocation: {},
      byStatus: {},
      lastUpdated: null
    });

    // Network metrics
    this.collectors.network.set('bandwidth', {
      inbound: 0,
      outbound: 0,
      total: 0,
      byInterface: {},
      byLocation: {},
      lastUpdated: null
    });

    this.collectors.network.set('latency', {
      avg: 0,
      min: 0,
      max: 0,
      byTarget: {},
      lastUpdated: null
    });
  }

  /**
   * Start metrics collection
   */
  startCollection() {
    if (this.isCollecting) {
      return;
    }

    this.isCollecting = true;
    this.lastCollection = Date.now();

    // Setup collection intervals
    this.setupCollectionIntervals();

    // Initialize workers if enabled
    if (this.config.enableWorkers) {
      this.initializeWorkers();
    }

    this.emit('collection:started');
  }

  /**
   * Stop metrics collection
   */
  stopCollection() {
    this.isCollecting = false;

    // Clear all intervals
    this.timers.forEach(timer => clearInterval(timer));
    this.timers.clear();

    // Terminate workers
    this.workers.forEach(worker => worker.terminate());
    this.workers = [];

    this.emit('collection:stopped');
  }

  /**
   * Setup collection intervals for different metric types
   */
  setupCollectionIntervals() {
    // High-frequency metrics (every 10 seconds)
    this.timers.set('highFreq', setInterval(() => {
      this.collectSystemMetrics();
      this.collectApplicationMetrics();
    }, 10000));

    // Medium-frequency metrics (every 30 seconds)
    this.timers.set('mediumFreq', setInterval(() => {
      this.collectDatabaseMetrics();
      this.collectCacheMetrics();
      this.collectMikrotikMetrics();
    }, 30000));

    // Low-frequency metrics (every minute)
    this.timers.set('lowFreq', setInterval(() => {
      this.collectBusinessMetrics();
      this.collectNetworkMetrics();
    }, 60000));

    // Cleanup old metrics (every 5 minutes)
    this.timers.set('cleanup', setInterval(() => {
      this.cleanupOldMetrics();
    }, 300000));
  }

  /**
   * Initialize worker threads for heavy processing
   */
  initializeWorkers() {
    const workerCount = Math.min(4, require('os').cpus().length);

    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(require.resolve('./metricsWorker.js'), {
        workerData: {
          workerId: i,
          config: this.config
        }
      });

      worker.on('message', (result) => {
        this.handleWorkerMessage(result);
      });

      worker.on('error', (error) => {
        this.emit('worker:error', { workerId: i, error });
      });

      this.workers.push(worker);
    }
  }

  /**
   * Handle worker messages
   */
  handleWorkerMessage(result) {
    const { type, data, workerId } = result;

    switch (type) {
      case 'metrics:collected':
        this.updateMetrics(data);
        break;
      case 'error':
        this.collectionErrors.push({
          timestamp: Date.now(),
          workerId,
          error: data
        });
        break;
    }
  }

  /**
   * Collect system metrics
   */
  async collectSystemMetrics() {
    try {
      const metrics = {
        timestamp: Date.now(),
        cpu: this.collectCPUMetrics(),
        memory: this.collectMemoryMetrics(),
        disk: this.collectDiskMetrics(),
        network: this.collectNetworkInterfaceMetrics()
      };

      this.updateMetrics({ system: metrics });
      this.emit('metrics:collected', { type: 'system', metrics });

    } catch (error) {
      this.emit('collection:error', { type: 'system', error });
    }
  }

  /**
   * Collect CPU metrics
   */
  collectCPUMetrics() {
    const cpus = require('os').cpus();
    const loadAvg = require('os').loadavg();

    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - (idle / total) * 100;

    return {
      usage: usage,
      loadAverage: loadAvg,
      cores: cpus.length,
      processes: require('child_process').execSync('ps -e | wc -lt').toString().trim().split(' ')[0],
      timestamp: Date.now()
    };
  }

  /**
   * Collect memory metrics
   */
  collectMemoryMetrics() {
    const memUsage = process.memoryUsage();
    const totalMem = require('os').totalmem();
    const freeMem = require('os').freemem();

    return {
      total: totalMem,
      used: totalMem - freeMem,
      free: freeMem,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      timestamp: Date.now()
    };
  }

  /**
   * Collect disk metrics
   */
  collectDiskMetrics() {
    try {
      const fs = require('fs');
      const stats = fs.statSync('.');

      // Simple disk metrics (could be enhanced with df command or filesystem module)
      return {
        total: 0, // Would need external library or command
        used: 0,
        free: 0,
        usage: 0,
        readSpeed: 0,
        writeSpeed: 0,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        total: 0,
        used: 0,
        free: 0,
        usage: 0,
        readSpeed: 0,
        writeSpeed: 0,
        timestamp: Date.now(),
        error: error.message
      };
    }
  }

  /**
   * Collect network interface metrics
   */
  collectNetworkInterfaceMetrics() {
    const os = require('os');
    const interfaces = os.networkInterfaces();

    let bytesReceived = 0;
    let bytesSent = 0;
    let packetsReceived = 0;
    let packetsSent = 0;

    Object.values(interfaces).forEach(iface => {
      iface.forEach(details => {
        if (details.family === 'IPv4' && !details.internal) {
          // Basic interface info - could be enhanced with system calls for detailed stats
          bytesReceived += 0;
          bytesSent += 0;
          packetsReceived += 0;
          packetsSent += 0;
        }
      });
    });

    return {
      bytesReceived,
      bytesSent,
      packetsReceived,
      packetsSent,
      connections: 0, // Would need system call to get actual connection count
      timestamp: Date.now()
    };
  }

  /**
   * Collect application metrics
   */
  async collectApplicationMetrics() {
    try {
      const metrics = {
        timestamp: Date.now(),
        http: this.collectHTTPMetrics(),
        events: this.collectEventMetrics(),
        sessions: this.collectSessionMetrics()
      };

      this.updateMetrics({ application: metrics });
      this.emit('metrics:collected', { type: 'application', metrics });

    } catch (error) {
      this.emit('collection:error', { type: 'application', error });
    }
  }

  /**
   * Collect HTTP metrics (would be populated by Fastify plugin)
   */
  collectHTTPMetrics() {
    return {
      requests: 0,
      activeRequests: 0,
      errors: 0,
      responseTime: [],
      statusCodes: {},
      routes: {},
      timestamp: Date.now()
    };
  }

  /**
   * Collect event metrics
   */
  collectEventMetrics() {
    return {
      emitted: this.listenerCount ? this.listenerCount() : 0,
      processed: 0,
      failed: 0,
      queueSize: 0,
      processingTime: [],
      timestamp: Date.now()
    };
  }

  /**
   * Collect session metrics
   */
  collectSessionMetrics() {
    return {
      active: 0,
      total: 0,
      expired: 0,
      byUserType: {},
      timestamp: Date.now()
    };
  }

  /**
   * Collect database metrics
   */
  async collectDatabaseMetrics() {
    try {
      // This would integrate with the actual database connection pools
      const metrics = {
        timestamp: Date.now(),
        connections: await this.collectDatabaseConnections(),
        queries: await this.collectDatabaseQueries(),
        transactions: await this.collectDatabaseTransactions()
      };

      this.updateMetrics({ database: metrics });
      this.emit('metrics:collected', { type: 'database', metrics });

    } catch (error) {
      this.emit('collection:error', { type: 'database', error });
    }
  }

  /**
   * Collect database connection metrics
   */
  async collectDatabaseConnections() {
    return {
      active: 0,
      idle: 0,
      total: 0,
      byPool: {},
      timestamp: Date.now()
    };
  }

  /**
   * Collect database query metrics
   */
  async collectDatabaseQueries() {
    return {
      total: 0,
      successful: 0,
      failed: 0,
      avgDuration: 0,
      byTable: {},
      byOperation: {},
      slowQueries: [],
      timestamp: Date.now()
    };
  }

  /**
   * Collect database transaction metrics
   */
  async collectDatabaseTransactions() {
    return {
      total: 0,
      committed: 0,
      rolledBack: 0,
      avgDuration: 0,
      timestamp: Date.now()
    };
  }

  /**
   * Collect cache metrics
   */
  async collectCacheMetrics() {
    try {
      const metrics = {
        timestamp: Date.now(),
        redis: await this.collectRedisMetrics(),
        lru: this.collectLRUMetrics()
      };

      this.updateMetrics({ cache: metrics });
      this.emit('metrics:collected', { type: 'cache', metrics });

    } catch (error) {
      this.emit('collection:error', { type: 'cache', error });
    }
  }

  /**
   * Collect Redis metrics
   */
  async collectRedisMetrics() {
    // This would integrate with actual Redis client
    return {
      hitRate: 0,
      missRate: 0,
      hits: 0,
      misses: 0,
      operations: 0,
      memoryUsage: 0,
      keyCount: 0,
      timestamp: Date.now()
    };
  }

  /**
   * Collect LRU cache metrics
   */
  collectLRUMetrics() {
    // This would integrate with actual LRU cache instances
    return {
      hitRate: 0,
      size: 0,
      maxSize: 0,
      evictions: 0,
      operations: 0,
      timestamp: Date.now()
    };
  }

  /**
   * Collect Mikrotik metrics
   */
  async collectMikrotikMetrics() {
    try {
      const metrics = {
        timestamp: Date.now(),
        connections: await this.collectMikrotikConnections(),
        api: await this.collectMikrotikApiMetrics(),
        users: await this.collectMikrotikUserMetrics()
      };

      this.updateMetrics({ mikrotik: metrics });
      this.emit('metrics:collected', { type: 'mikrotik', metrics });

    } catch (error) {
      this.emit('collection:error', { type: 'mikrotik', error });
    }
  }

  /**
   * Collect Mikrotik connection metrics
   */
  async collectMikrotikConnections() {
    return {
      active: 0,
      total: 0,
      failed: 0,
      byLocation: {},
      byType: {},
      timestamp: Date.now()
    };
  }

  /**
   * Collect Mikrotik API metrics
   */
  async collectMikrotikApiMetrics() {
    return {
      requests: 0,
      successful: 0,
      failed: 0,
      avgDuration: 0,
      byCommand: {},
      byLocation: {},
      errors: [],
      timestamp: Date.now()
    };
  }

  /**
   * Collect Mikrotik user metrics
   */
  async collectMikrotikUserMetrics() {
    return {
      hotspot: 0,
      pppoe: 0,
      total: 0,
      byLocation: {},
      byStatus: {},
      timestamp: Date.now()
    };
  }

  /**
   * Collect business metrics
   */
  async collectBusinessMetrics() {
    try {
      const metrics = {
        timestamp: Date.now(),
        customers: await this.collectCustomerMetrics(),
        vouchers: await this.collectVoucherMetrics(),
        payments: await this.collectPaymentMetrics(),
        subscriptions: await this.collectSubscriptionMetrics()
      };

      this.updateMetrics({ business: metrics });
      this.emit('metrics:collected', { type: 'business', metrics });

    } catch (error) {
      this.emit('collection:error', { type: 'business', error });
    }
  }

  /**
   * Collect customer metrics
   */
  async collectCustomerMetrics() {
    // This would query the actual database
    return {
      total: 0,
      active: 0,
      new: 0,
      churned: 0,
      byLocation: {},
      byType: {},
      lastUpdated: Date.now()
    };
  }

  /**
   * Collect voucher metrics
   */
  async collectVoucherMetrics() {
    // This would query the actual database
    return {
      total: 0,
      active: 0,
      expired: 0,
      sold: 0,
      byLocation: {},
      byType: {},
      revenue: 0,
      lastUpdated: Date.now()
    };
  }

  /**
   * Collect payment metrics
   */
  async collectPaymentMetrics() {
    // This would query the actual database
    return {
      total: 0,
      successful: 0,
      failed: 0,
      pending: 0,
      amount: 0,
      byMethod: {},
      byLocation: {},
      lastUpdated: Date.now()
    };
  }

  /**
   * Collect subscription metrics
   */
  async collectSubscriptionMetrics() {
    // This would query the actual database
    return {
      total: 0,
      active: 0,
      expired: 0,
      recurring: 0,
      byType: {},
      byLocation: {},
      lastUpdated: Date.now()
    };
  }

  /**
   * Collect network metrics
   */
  async collectNetworkMetrics() {
    try {
      const metrics = {
        timestamp: Date.now(),
        bandwidth: this.collectBandwidthMetrics(),
        latency: this.collectLatencyMetrics()
      };

      this.updateMetrics({ network: metrics });
      this.emit('metrics:collected', { type: 'network', metrics });

    } catch (error) {
      this.emit('collection:error', { type: 'network', error });
    }
  }

  /**
   * Collect bandwidth metrics
   */
  collectBandwidthMetrics() {
    return {
      inbound: 0,
      outbound: 0,
      total: 0,
      byInterface: {},
      byLocation: {},
      timestamp: Date.now()
    };
  }

  /**
   * Collect latency metrics
   */
  collectLatencyMetrics() {
    return {
      avg: 0,
      min: 0,
      max: 0,
      byTarget: {},
      timestamp: Date.now()
    };
  }

  /**
   * Update metrics in storage
   */
  updateMetrics(data) {
    Object.entries(data).forEach(([category, metrics]) => {
      if (this.collectors[category]) {
        Object.entries(metrics).forEach(([metric, value]) => {
          this.collectors[category].set(metric, value);
        });
      }
    });

    this.lastCollection = Date.now();
  }

  /**
   * Get metrics by category and metric name
   */
  getMetrics(category, metric) {
    if (category && metric) {
      return this.collectors[category]?.get(metric);
    } else if (category) {
      return Object.fromEntries(this.collectors[category]);
    } else {
      return Object.fromEntries(
        Object.entries(this.collectors).map(([cat, metrics]) => [
          cat,
          Object.fromEntries(metrics)
        ])
      );
    }
  }

  /**
   * Get real-time metrics snapshot
   */
  getRealTimeMetrics() {
    return {
      timestamp: Date.now(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      isCollecting: this.isCollecting,
      lastCollection: this.lastCollection,
      collectionErrors: this.collectionErrors.slice(-10), // Last 10 errors
      workerCount: this.workers.length
    };
  }

  /**
   * Get aggregated metrics for a time range
   */
  async getAggregatedMetrics(startTime, endTime, groupBy = 'minute') {
    // This would query historical metrics storage
    return {
      startTime,
      endTime,
      groupBy,
      metrics: {}
    };
  }

  /**
   * Cleanup old metrics to prevent memory leaks
   */
  cleanupOldMetrics() {
    const now = Date.now();
    const cutoff = now - this.config.retentionPeriod;

    // Clean up old metrics data
    this.collectors.forEach((categoryMetrics, category) => {
      categoryMetrics.forEach((metric, name) => {
        if (metric.timestamp && metric.timestamp < cutoff) {
          // Remove old metric data
          categoryMetrics.delete(name);
        }
      });
    });

    // Clean up old errors
    this.collectionErrors = this.collectionErrors.filter(
      error => error.timestamp > cutoff
    );

    // Check memory usage
    const memUsage = process.memoryUsage();
    if (memUsage.heapUsed > this.config.maxMemoryUsage) {
      this.emit('memory:warning', { usage: memUsage.heapUsed, limit: this.config.maxMemoryUsage });
    }
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics() {
    const metrics = [];

    this.collectors.forEach((categoryMetrics, category) => {
      categoryMetrics.forEach((metric, name) => {
        const metricName = `mikrotik_billing_${category}_${name}`;

        if (typeof metric === 'object' && metric !== null) {
          Object.entries(metric).forEach(([key, value]) => {
            if (typeof value === 'number') {
              metrics.push(`${metricName}_${key} ${value}`);
            }
          });
        } else if (typeof metric === 'number') {
          metrics.push(`${metricName} ${metric}`);
        }
      });
    });

    return metrics.join('\n');
  }

  /**
   * Get collection status
   */
  getCollectionStatus() {
    return {
      isCollecting: this.isCollecting,
      lastCollection: this.lastCollection,
      collectionInterval: this.config.collectionInterval,
      activeTimers: this.timers.size,
      activeWorkers: this.workers.length,
      errorCount: this.collectionErrors.length,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.stopCollection();

    // Wait for all workers to terminate
    await Promise.all(
      this.workers.map(worker => {
        worker.terminate();
        return new Promise(resolve => worker.on('exit', resolve));
      })
    );

    this.emit('shutdown');
  }
}

module.exports = MetricsCollector;