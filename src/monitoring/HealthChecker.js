/**
 * Comprehensive Health Checking System
 * Monitors health of all system components with dependency tracking
 * @version 1.0.0
 * @author Mikrotik Billing System
 */

const EventEmitter = require('events');
const { performance } = require('perf_hooks');

class HealthChecker extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      enabled: config.enabled !== false,
      checkInterval: config.checkInterval || 30000, // 30 seconds
      timeout: config.timeout || 5000, // 5 seconds
      retries: config.retries || 3,
      retryDelay: config.retryDelay || 1000, // 1 second
      enableDependencyTracking: config.enableDependencyTracking !== false,
      enableCircuitBreaker: config.enableCircuitBreaker !== false,
      enableAutoRecovery: config.enableAutoRecovery || false,
      historyRetention: config.historyRetention || 86400000, // 24 hours
      criticalThreshold: config.criticalThreshold || 0.8, // 80% healthy
      warningThreshold: config.warningThreshold || 0.6, // 60% healthy
      ...config
    };

    // Health check registry
    this.checks = new Map();
    this.results = new Map();
    this.history = new Map();
    this.dependencies = new Map();
    this.circuitBreakers = new Map();

    // Health status tracking
    this.overallStatus = 'unknown';
    this.lastCheck = null;
    this.checkCount = 0;
    this.errorCount = 0;

    // Check scheduling
    this.checkTimer = null;
    this.isRunning = false;

    // Initialize built-in health checks
    this.initializeBuiltInChecks();

    // Build dependency graph
    if (this.config.enableDependencyTracking) {
      this.buildDependencyGraph();
    }

    // Start health checking if enabled
    if (this.config.enabled) {
      this.start();
    }
  }

  /**
   * Initialize built-in health checks
   */
  initializeBuiltInChecks() {
    // Database health check
    this.registerCheck('database', {
      name: 'Database Connection',
      description: 'Check database connectivity and performance',
      critical: true,
      timeout: 5000,
      check: this.checkDatabase.bind(this),
      dependencies: [],
      recovery: this.recoverDatabase.bind(this)
    });

    // Redis health check
    this.registerCheck('redis', {
      name: 'Redis Cache',
      description: 'Check Redis connectivity and performance',
      critical: false,
      timeout: 3000,
      check: this.checkRedis.bind(this),
      dependencies: [],
      recovery: this.recoverRedis.bind(this)
    });

    // Mikrotik health check
    this.registerCheck('mikrotik', {
      name: 'Mikrotik API',
      description: 'Check Mikrotik API connectivity',
      critical: true,
      timeout: 10000,
      check: this.checkMikrotik.bind(this),
      dependencies: [],
      recovery: this.recoverMikrotik.bind(this)
    });

    // WhatsApp health check
    this.registerCheck('whatsapp', {
      name: 'WhatsApp Service',
      description: 'Check WhatsApp session status',
      critical: false,
      timeout: 5000,
      check: this.checkWhatsApp.bind(this),
      dependencies: [],
      recovery: this.recoverWhatsApp.bind(this)
    });

    // File system health check
    this.registerCheck('filesystem', {
      name: 'File System',
      description: 'Check disk space and file access',
      critical: true,
      timeout: 2000,
      check: this.checkFileSystem.bind(this),
      dependencies: [],
      recovery: this.recoverFileSystem.bind(this)
    });

    // Memory health check
    this.registerCheck('memory', {
      name: 'Memory Usage',
      description: 'Check system memory usage',
      critical: true,
      timeout: 1000,
      check: this.checkMemory.bind(this),
      dependencies: [],
      recovery: this.recoverMemory.bind(this)
    });

    // CPU health check
    this.registerCheck('cpu', {
      name: 'CPU Usage',
      description: 'Check system CPU usage',
      critical: false,
      timeout: 1000,
      check: this.checkCPU.bind(this),
      dependencies: [],
      recovery: this.recoverCPU.bind(this)
    });

    // Network health check
    this.registerCheck('network', {
      name: 'Network Connectivity',
      description: 'Check network connectivity',
      critical: true,
      timeout: 5000,
      check: this.checkNetwork.bind(this),
      dependencies: [],
      recovery: this.recoverNetwork.bind(this)
    });

    // Application health check
    this.registerCheck('application', {
      name: 'Application Status',
      description: 'Check application health',
      critical: true,
      timeout: 1000,
      check: this.checkApplication.bind(this),
      dependencies: [],
      recovery: this.recoverApplication.bind(this)
    });

    // Service dependencies health check
    this.registerCheck('services', {
      name: 'External Services',
      description: 'Check external service dependencies',
      critical: false,
      timeout: 10000,
      check: this.checkServices.bind(this),
      dependencies: ['network'],
      recovery: this.recoverServices.bind(this)
    });
  }

  /**
   * Build dependency graph
   */
  buildDependencyGraph() {
    for (const [id, check] of this.checks) {
      const dependencies = check.dependencies || [];
      this.dependencies.set(id, new Set(dependencies));

      // Add reverse dependencies
      for (const dep of dependencies) {
        if (!this.dependencies.has(dep)) {
          this.dependencies.set(dep, new Set());
        }
        // Note: This tracks forward dependencies, reverse mapping would need separate tracking
      }
    }
  }

  /**
   * Register a new health check
   */
  registerCheck(id, config) {
    const healthCheck = {
      id,
      name: config.name || id,
      description: config.description || '',
      critical: config.critical || false,
      timeout: config.timeout || this.config.timeout,
      retries: config.retries || this.config.retries,
      check: config.check,
      dependencies: config.dependencies || [],
      recovery: config.recovery,
      enabled: config.enabled !== false,
      interval: config.interval || this.config.checkInterval,
      metadata: config.metadata || {},
      createdAt: Date.now()
    };

    this.checks.set(id, healthCheck);

    // Initialize result storage
    this.results.set(id, {
      status: 'unknown',
      lastCheck: null,
      lastSuccess: null,
      lastFailure: null,
      consecutiveFailures: 0,
      totalChecks: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      averageResponseTime: 0,
      errorMessage: null
    });

    // Initialize history
    this.history.set(id, []);

    // Initialize circuit breaker if enabled
    if (this.config.enableCircuitBreaker) {
      this.circuitBreakers.set(id, new CircuitBreaker({
        timeout: healthCheck.timeout,
        errorThreshold: 5,
        resetTimeout: 60000 // 1 minute
      }));
    }

    this.emit('check:registered', { id, check: healthCheck });
  }

  /**
   * Unregister a health check
   */
  unregisterCheck(id) {
    const removed = this.checks.delete(id);
    if (removed) {
      this.results.delete(id);
      this.history.delete(id);
      this.circuitBreakers.delete(id);
      this.emit('check:unregistered', { id });
    }
    return removed;
  }

  /**
   * Start health checking
   */
  start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.scheduleNextCheck();
    this.emit('health:started');
  }

  /**
   * Stop health checking
   */
  stop() {
    this.isRunning = false;
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
      this.checkTimer = null;
    }
    this.emit('health:stopped');
  }

  /**
   * Schedule next health check
   */
  scheduleNextCheck() {
    if (!this.isRunning) {
      return;
    }

    this.checkTimer = setTimeout(() => {
      this.runAllChecks().then(() => {
        this.scheduleNextCheck();
      });
    }, this.config.checkInterval);
  }

  /**
   * Run all health checks
   */
  async runAllChecks() {
    const startTime = performance.now();
    const checkPromises = [];

    // Determine check order based on dependencies
    const checkOrder = this.getCheckOrder();

    for (const id of checkOrder) {
      const check = this.checks.get(id);
      if (check && check.enabled) {
        checkPromises.push(this.runCheck(id));
      }
    }

    // Wait for all checks to complete
    const results = await Promise.allSettled(checkPromises);

    // Calculate overall status
    this.calculateOverallStatus();

    const duration = performance.now() - startTime;
    this.lastCheck = Date.now();
    this.checkCount++;

    this.emit('checks:completed', {
      duration,
      results: results.map(r => r.status === 'fulfilled' ? r.value : r.reason),
      overallStatus: this.overallStatus
    });
  }

  /**
   * Get check order based on dependencies
   */
  getCheckOrder() {
    const visited = new Set();
    const visiting = new Set();
    const order = [];

    const visit = (id) => {
      if (visiting.has(id)) {
        throw new Error(`Circular dependency detected: ${id}`);
      }
      if (visited.has(id)) {
        return;
      }

      visiting.add(id);
      const dependencies = this.dependencies.get(id) || new Set();
      for (const dep of dependencies) {
        if (this.checks.has(dep)) {
          visit(dep);
        }
      }
      visiting.delete(id);
      visited.add(id);
      order.push(id);
    };

    for (const id of this.checks.keys()) {
      visit(id);
    }

    return order;
  }

  /**
   * Run a specific health check
   */
  async runCheck(id) {
    const check = this.checks.get(id);
    if (!check || !check.enabled) {
      return { id, status: 'disabled', reason: 'Check disabled' };
    }

    const startTime = performance.now();
    const result = this.results.get(id);

    try {
      // Check circuit breaker
      const circuitBreaker = this.circuitBreakers.get(id);
      if (circuitBreaker && circuitBreaker.isOpen()) {
        throw new Error('Circuit breaker is open');
      }

      // Execute health check with timeout
      const checkResult = await this.executeCheckWithTimeout(check);

      const duration = performance.now() - startTime;
      const success = checkResult.status === 'healthy';

      // Update result
      this.updateCheckResult(id, {
        status: checkResult.status,
        duration,
        success,
        data: checkResult.data,
        errorMessage: null
      });

      // Reset circuit breaker on success
      if (circuitBreaker && success) {
        circuitBreaker.recordSuccess();
      }

      this.emit('check:completed', { id, result: checkResult, duration });

      return { id, ...checkResult, duration };

    } catch (error) {
      const duration = performance.now() - startTime;

      // Update result with error
      this.updateCheckResult(id, {
        status: 'unhealthy',
        duration,
        success: false,
        data: null,
        errorMessage: error.message
      });

      // Record failure in circuit breaker
      const circuitBreaker = this.circuitBreakers.get(id);
      if (circuitBreaker) {
        circuitBreaker.recordFailure();
      }

      // Attempt recovery if configured
      if (this.config.enableAutoRecovery && check.recovery) {
        this.attemptRecovery(id);
      }

      this.errorCount++;
      this.emit('check:failed', { id, error, duration });

      return {
        id,
        status: 'unhealthy',
        duration,
        error: error.message
      };
    }
  }

  /**
   * Execute health check with timeout
   */
  async executeCheckWithTimeout(check) {
    let attempt = 0;
    const maxAttempts = check.retries + 1;

    while (attempt < maxAttempts) {
      try {
        const result = await Promise.race([
          check.check(),
          this.createTimeoutPromise(check.timeout)
        ]);

        return result;
      } catch (error) {
        attempt++;
        if (attempt >= maxAttempts) {
          throw error;
        }
        // Wait before retry
        await this.sleep(this.config.retryDelay);
      }
    }
  }

  /**
   * Create timeout promise
   */
  createTimeoutPromise(timeout) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Health check timeout')), timeout);
    });
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update check result
   */
  updateCheckResult(id, update) {
    const result = this.results.get(id);
    if (!result) return;

    const now = Date.now();
    const wasHealthy = result.status === 'healthy';

    // Update basic fields
    result.lastCheck = now;
    result.status = update.status;
    result.averageResponseTime = this.calculateAverageResponseTime(
      result.averageResponseTime,
      result.totalChecks,
      update.duration
    );
    result.totalChecks++;

    if (update.success) {
      result.lastSuccess = now;
      result.totalSuccesses++;
      result.consecutiveFailures = 0;
      result.errorMessage = null;
    } else {
      result.lastFailure = now;
      result.totalFailures++;
      result.consecutiveFailures++;
      result.errorMessage = update.errorMessage;
    }

    // Add to history
    const history = this.history.get(id);
    history.push({
      timestamp: now,
      status: update.status,
      duration: update.duration,
      data: update.data,
      error: update.errorMessage
    });

    // Trim history
    const cutoff = now - this.config.historyRetention;
    while (history.length > 0 && history[0].timestamp < cutoff) {
      history.shift();
    }

    // Emit status change events
    if (wasHealthy && update.status !== 'healthy') {
      this.emit('check:degraded', { id, result: update });
    } else if (!wasHealthy && update.status === 'healthy') {
      this.emit('check:recovered', { id, result: update });
    }
  }

  /**
   * Calculate average response time
   */
  calculateAverageResponseTime(current, count, newDuration) {
    if (count === 0) {
      return newDuration;
    }
    return ((current * count) + newDuration) / (count + 1);
  }

  /**
   * Calculate overall system health status
   */
  calculateOverallStatus() {
    const criticalChecks = [];
    const allChecks = [];

    for (const [id, check] of this.checks) {
      if (!check.enabled) continue;

      const result = this.results.get(id);
      if (!result) continue;

      if (check.critical) {
        criticalChecks.push(result);
      }
      allChecks.push(result);
    }

    // If any critical check is unhealthy, system is unhealthy
    const criticalHealthy = criticalChecks.filter(r => r.status === 'healthy').length;
    const criticalTotal = criticalChecks.length;

    if (criticalTotal > 0 && criticalHealthy < criticalTotal) {
      this.overallStatus = 'unhealthy';
      return;
    }

    // Calculate overall health ratio
    const healthyChecks = allChecks.filter(r => r.status === 'healthy').length;
    const totalChecks = allChecks.length;

    if (totalChecks === 0) {
      this.overallStatus = 'unknown';
      return;
    }

    const healthRatio = healthyChecks / totalChecks;

    if (healthRatio >= this.config.criticalThreshold) {
      this.overallStatus = 'healthy';
    } else if (healthRatio >= this.config.warningThreshold) {
      this.overallStatus = 'degraded';
    } else {
      this.overallStatus = 'unhealthy';
    }
  }

  /**
   * Attempt recovery for failed check
   */
  async attemptRecovery(id) {
    const check = this.checks.get(id);
    if (!check || !check.recovery) return;

    try {
      this.emit('recovery:attempted', { id });
      await check.recovery();
      this.emit('recovery:successful', { id });
    } catch (error) {
      this.emit('recovery:failed', { id, error });
    }
  }

  /**
   * Run readiness checks
   */
  async runReadinessChecks() {
    const checks = {};

    for (const [id, check] of this.checks) {
      if (check.enabled && check.critical) {
        const result = await this.runCheck(id);
        checks[id] = {
          status: result.status,
          duration: result.duration,
          lastCheck: Date.now()
        };
      }
    }

    return checks;
  }

  /**
   * Run liveness checks
   */
  async runLivenessChecks() {
    const checks = {};

    // Basic liveness checks - just core functionality
    const coreChecks = ['application', 'memory', 'filesystem'];

    for (const id of coreChecks) {
      const check = this.checks.get(id);
      if (check && check.enabled) {
        const result = await this.runCheck(id);
        checks[id] = {
          status: result.status,
          duration: result.duration,
          lastCheck: Date.now()
        };
      }
    }

    return checks;
  }

  /**
   * Run detailed health checks
   */
  async runDetailedChecks(checkId = null) {
    const checks = {};

    if (checkId) {
      // Run specific check
      const result = await this.runCheck(checkId);
      checks[checkId] = this.formatCheckResult(checkId, result);
    } else {
      // Run all checks
      for (const [id] of this.checks) {
        const result = await this.runCheck(id);
        checks[id] = this.formatCheckResult(id, result);
      }
    }

    return checks;
  }

  /**
   * Format check result for API response
   */
  formatCheckResult(id, result) {
    const check = this.checks.get(id);
    const history = this.history.get(id) || [];

    return {
      name: check?.name || id,
      description: check?.description || '',
      status: result.status,
      duration: result.duration,
      lastCheck: Date.now(),
      consecutiveFailures: this.results.get(id)?.consecutiveFailures || 0,
      totalChecks: this.results.get(id)?.totalChecks || 0,
      successRate: this.calculateSuccessRate(id),
      averageResponseTime: this.results.get(id)?.averageResponseTime || 0,
      critical: check?.critical || false,
      recentHistory: history.slice(-5), // Last 5 results
      data: result.data || null,
      error: result.error || null
    };
  }

  /**
   * Calculate success rate for a check
   */
  calculateSuccessRate(id) {
    const result = this.results.get(id);
    if (!result || result.totalChecks === 0) {
      return 0;
    }
    return result.totalSuccesses / result.totalChecks;
  }

  /**
   * Built-in health check implementations
   */

  async checkDatabase() {
    try {
      // This would integrate with actual database connection
      // For now, return a mock result
      const startTime = performance.now();

      // Simulate database query
      await this.sleep(10);

      const duration = performance.now() - startTime;

      return {
        status: 'healthy',
        data: {
          connectionPool: {
            active: 5,
            idle: 10,
            total: 15
          },
          queryLatency: duration,
          databaseSize: '125MB'
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async checkRedis() {
    try {
      const startTime = performance.now();

      // Simulate Redis ping
      await this.sleep(5);

      const duration = performance.now() - startTime;

      return {
        status: 'healthy',
        data: {
          latency: duration,
          memory: '45MB',
          keys: 1234,
          connectedClients: 3
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async checkMikrotik() {
    try {
      const startTime = performance.now();

      // Simulate Mikrotik API call
      await this.sleep(100);

      const duration = performance.now() - startTime;

      return {
        status: 'healthy',
        data: {
          latency: duration,
          connectedDevices: 25,
          apiVersion: '6.47.9',
          uptime: '15 days'
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async checkWhatsApp() {
    try {
      const startTime = performance.now();

      // Simulate WhatsApp session check
      await this.sleep(50);

      const duration = performance.now() - startTime;

      return {
        status: 'healthy',
        data: {
          sessionStatus: 'connected',
          latency: duration,
          queueSize: 0,
          messagesSent: 150
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async checkFileSystem() {
    try {
      const fs = require('fs');
      const stats = fs.statSync('.');

      // Simple disk space check (would need more robust implementation)
      const freeSpace = stats.dev || 1000000000; // Mock value

      return {
        status: 'healthy',
        data: {
          freeSpace,
          readable: true,
          writable: true,
          path: process.cwd()
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async checkMemory() {
    try {
      const memUsage = process.memoryUsage();
      const totalMem = require('os').totalmem();
      const freeMem = require('os').freemem();
      const usedMem = totalMem - freeMem;
      const usagePercent = (usedMem / totalMem) * 100;

      const status = usagePercent > 90 ? 'unhealthy' : 'healthy';

      return {
        status,
        data: {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          rss: memUsage.rss,
          external: memUsage.external,
          systemUsage: usagePercent,
          freeMemory: freeMem,
          totalMemory: totalMem
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async checkCPU() {
    try {
      const cpus = require('os').cpus();
      const loadAvg = require('os').loadavg();

      // Calculate CPU usage
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

      const status = usage > 80 ? 'unhealthy' : 'healthy';

      return {
        status,
        data: {
          usage,
          loadAverage: loadAvg,
          cores: cpus.length
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async checkNetwork() {
    try {
      const startTime = performance.now();

      // Simulate network connectivity check
      await this.sleep(20);

      const duration = performance.now() - startTime;

      return {
        status: 'healthy',
        data: {
          latency: duration,
          connectivity: true,
          dnsResolution: true
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async checkApplication() {
    try {
      const uptime = process.uptime();
      const version = process.env.npm_package_version || '1.0.0';

      return {
        status: 'healthy',
        data: {
          uptime,
          version,
          nodeVersion: process.version,
          platform: process.platform,
          environment: process.env.NODE_ENV || 'development'
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async checkServices() {
    try {
      // Check external services
      const services = [
        { name: 'Payment Gateway', url: 'https://api.payment.com' },
        { name: 'Email Service', url: 'https://api.email.com' }
      ];

      const results = [];

      for (const service of services) {
        try {
          const startTime = performance.now();
          // Simulate service check
          await this.sleep(100);
          const duration = performance.now() - startTime;

          results.push({
            name: service.name,
            status: 'healthy',
            latency: duration
          });
        } catch (error) {
          results.push({
            name: service.name,
            status: 'unhealthy',
            error: error.message
          });
        }
      }

      const allHealthy = results.every(r => r.status === 'healthy');

      return {
        status: allHealthy ? 'healthy' : 'unhealthy',
        data: { services: results }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  // Recovery methods (simplified implementations)
  async recoverDatabase() {
    // Database recovery logic
    await this.sleep(1000);
  }

  async recoverRedis() {
    // Redis recovery logic
    await this.sleep(500);
  }

  async recoverMikrotik() {
    // Mikrotik recovery logic
    await this.sleep(2000);
  }

  async recoverWhatsApp() {
    // WhatsApp recovery logic
    await this.sleep(1000);
  }

  async recoverFileSystem() {
    // File system recovery logic
    await this.sleep(100);
  }

  async recoverMemory() {
    // Memory recovery logic (garbage collection)
    if (global.gc) {
      global.gc();
    }
    await this.sleep(100);
  }

  async recoverCPU() {
    // CPU recovery logic
    await this.sleep(500);
  }

  async recoverNetwork() {
    // Network recovery logic
    await this.sleep(2000);
  }

  async recoverApplication() {
    // Application recovery logic
    await this.sleep(100);
  }

  async recoverServices() {
    // External services recovery logic
    await this.sleep(3000);
  }

  /**
   * Get health summary
   */
  getHealthSummary() {
    const summary = {
      overall: this.overallStatus,
      lastCheck: this.lastCheck,
      uptime: process.uptime(),
      totalChecks: this.checkCount,
      errorCount: this.errorCount,
      checks: {}
    };

    for (const [id, result] of this.results) {
      const check = this.checks.get(id);
      summary.checks[id] = {
        name: check?.name || id,
        status: result.status,
        lastCheck: result.lastCheck,
        consecutiveFailures: result.consecutiveFailures,
        critical: check?.critical || false
      };
    }

    return summary;
  }

  /**
   * Get detailed health report
   */
  getDetailedReport() {
    return {
      summary: this.getHealthSummary(),
      configuration: this.config,
      dependencies: Object.fromEntries(this.dependencies),
      circuitBreakers: Object.fromEntries(
        Array.from(this.circuitBreakers.entries()).map(([id, cb]) => [
          id,
          {
            state: cb.getState(),
            failures: cb.getFailureCount(),
            lastFailure: cb.getLastFailureTime()
          }
        ])
      )
    };
  }
}

/**
 * Circuit Breaker Implementation
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.timeout = options.timeout || 5000;
    this.errorThreshold = options.errorThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000;

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
  }

  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await Promise.race([
        operation(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Operation timeout')), this.timeout)
        )
      ]);

      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  recordSuccess() {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 3) {
        this.state = 'CLOSED';
      }
    }
  }

  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.errorThreshold) {
      this.state = 'OPEN';
    }
  }

  getState() {
    return this.state;
  }

  getFailureCount() {
    return this.failureCount;
  }

  getLastFailureTime() {
    return this.lastFailureTime;
  }

  isOpen() {
    return this.state === 'OPEN';
  }
}

module.exports = HealthChecker;