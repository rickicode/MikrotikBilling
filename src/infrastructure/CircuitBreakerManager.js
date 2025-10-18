const { EventEmitter } = require('events');

/**
 * Circuit Breaker State Enum
 */
const CircuitState = {
  CLOSED: 'closed',      // Normal operation, requests pass through
  OPEN: 'open',          // Circuit is open, requests fail fast
  HALF_OPEN: 'half_open' // Testing if service has recovered
};

/**
 * Global Circuit Breaker Manager
 * Provides centralized circuit breaker management for all external services
 * Implements resilience patterns with configurable thresholds and recovery strategies
 */
class CircuitBreakerManager extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      // Default circuit breaker settings
      defaultTimeout: config.defaultTimeout || 30000,           // 30 seconds
      defaultErrorThresholdPercentage: config.defaultErrorThresholdPercentage || 50, // 50%
      defaultResetTimeout: config.defaultResetTimeout || 60000, // 1 minute
      defaultMonitoringPeriod: config.defaultMonitoringPeriod || 10000, // 10 seconds
      defaultRequestVolumeThreshold: config.defaultRequestVolumeThreshold || 10, // Minimum requests before opening

      // Global settings
      maxConcurrentBreakers: config.maxConcurrentBreakers || 100,
      enableMetrics: config.enableMetrics !== false,
      enableAutoRecovery: config.enableAutoRecovery !== false,
      healthCheckInterval: config.healthCheckInterval || 30000, // 30 seconds
      ...config
    };

    this.circuitBreakers = new Map();
    this.globalMetrics = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      totalCircuitOpens: 0,
      totalCircuitCloses: 0,
      totalTimeouts: 0
    };

    this.healthCheckTimer = null;
    this.isRunning = false;
    this.serviceConfigs = new Map();
  }

  /**
   * Start the circuit breaker manager
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;

    // Start health check timer
    this.startHealthCheckTimer();

    console.log('🔌 Circuit Breaker Manager started');
    this.emit('started');
  }

  /**
   * Stop the circuit breaker manager
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Close all circuit breakers
    for (const [name, breaker] of this.circuitBreakers) {
      breaker.destroy();
    }

    console.log('🔌 Circuit Breaker Manager stopped');
    this.emit('stopped');
  }

  /**
   * Register a service with custom circuit breaker configuration
   */
  registerService(serviceName, config = {}) {
    const breakerConfig = {
      timeout: config.timeout || this.config.defaultTimeout,
      errorThresholdPercentage: config.errorThresholdPercentage || this.config.defaultErrorThresholdPercentage,
      resetTimeout: config.resetTimeout || this.config.defaultResetTimeout,
      monitoringPeriod: config.monitoringPeriod || this.config.defaultMonitoringPeriod,
      requestVolumeThreshold: config.requestVolumeThreshold || this.config.defaultRequestVolumeThreshold,

      // Service-specific settings
      healthCheckEndpoint: config.healthCheckEndpoint,
      fallbackFunction: config.fallbackFunction,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,

      // Advanced settings
      slidingWindowSize: config.slidingWindowSize || 100,
      minimumThroughput: config.minimumThroughput || 10,
      enableHealthCheck: config.enableHealthCheck !== false,

      ...config
    };

    // Check circuit breaker limit
    if (this.circuitBreakers.size >= this.config.maxConcurrentBreakers) {
      throw new Error(`Maximum circuit breakers (${this.config.maxConcurrentBreakers}) exceeded`);
    }

    // Create and store circuit breaker
    const breaker = new CircuitBreaker(serviceName, breakerConfig, this);
    this.circuitBreakers.set(serviceName, breaker);
    this.serviceConfigs.set(serviceName, breakerConfig);

    // Setup event listeners
    breaker.on('stateChange', (event) => {
      this.handleStateChange(serviceName, event);
    });

    breaker.on('metrics', (event) => {
      this.updateGlobalMetrics(event);
    });

    console.log(`🔌 Registered circuit breaker for service: ${serviceName}`);
    return breaker;
  }

  /**
   * Get circuit breaker for a service
   */
  getCircuitBreaker(serviceName) {
    return this.circuitBreakers.get(serviceName);
  }

  /**
   * Execute operation through circuit breaker
   */
  async execute(serviceName, operation, ...args) {
    let breaker = this.circuitBreakers.get(serviceName);

    // Auto-register if not exists
    if (!breaker) {
      breaker = this.registerService(serviceName);
    }

    return await breaker.execute(operation, ...args);
  }

  /**
   * Execute with custom circuit breaker config
   */
  async executeWithConfig(serviceName, config, operation, ...args) {
    const tempServiceName = `${serviceName}_temp_${Date.now()}`;
    const breaker = this.registerService(tempServiceName, config);

    try {
      const result = await breaker.execute(operation, ...args);
      return result;
    } finally {
      // Clean up temporary breaker
      breaker.destroy();
      this.circuitBreakers.delete(tempServiceName);
    }
  }

  /**
   * Force open a circuit breaker
   */
  forceOpen(serviceName, reason = 'Manual override') {
    const breaker = this.circuitBreakers.get(serviceName);
    if (breaker) {
      breaker.forceOpen(reason);
    }
  }

  /**
   * Force close a circuit breaker
   */
  forceClose(serviceName) {
    const breaker = this.circuitBreakers.get(serviceName);
    if (breaker) {
      breaker.forceClose();
    }
  }

  /**
   * Get all circuit breaker states
   */
  getAllStates() {
    const states = {};

    for (const [serviceName, breaker] of this.circuitBreakers) {
      states[serviceName] = breaker.getState();
    }

    return states;
  }

  /**
   * Get circuit breaker statistics
   */
  getStatistics() {
    const stats = {
      global: { ...this.globalMetrics },
      services: {},
      summary: {
        totalCircuitBreakers: this.circuitBreakers.size,
        openCircuits: 0,
        halfOpenCircuits: 0,
        closedCircuits: 0,
        degradedServices: 0
      }
    };

    for (const [serviceName, breaker] of this.circuitBreakers) {
      const breakerStats = breaker.getStatistics();
      stats.services[serviceName] = breakerStats;

      // Update summary
      switch (breakerStats.state) {
        case CircuitState.OPEN:
          stats.summary.openCircuits++;
          stats.summary.degradedServices++;
          break;
        case CircuitState.HALF_OPEN:
          stats.summary.halfOpenCircuits++;
          stats.summary.degradedServices++;
          break;
        case CircuitState.CLOSED:
          stats.summary.closedCircuits++;
          break;
      }
    }

    return stats;
  }

  /**
   * Get health status of all services
   */
  getHealthStatus() {
    const health = {
      status: 'healthy',
      services: {},
      timestamp: new Date().toISOString()
    };

    for (const [serviceName, breaker] of this.circuitBreakers) {
      const breakerHealth = breaker.getHealthStatus();
      health.services[serviceName] = breakerHealth;

      if (breakerHealth.status !== 'healthy') {
        health.status = 'degraded';
      }
    }

    return health;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll() {
    for (const [serviceName, breaker] of this.circuitBreakers) {
      breaker.reset();
    }

    console.log('🔌 All circuit breakers reset');
  }

  /**
   * Remove a circuit breaker
   */
  removeService(serviceName) {
    const breaker = this.circuitBreakers.get(serviceName);
    if (breaker) {
      breaker.destroy();
      this.circuitBreakers.delete(serviceName);
      this.serviceConfigs.delete(serviceName);
      console.log(`🔌 Removed circuit breaker for service: ${serviceName}`);
    }
  }

  // Private methods

  startHealthCheckTimer() {
    if (!this.config.enableAutoRecovery) return;

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  async performHealthChecks() {
    for (const [serviceName, breaker] of this.circuitBreakers) {
      if (breaker.getState().state === CircuitState.OPEN) {
        await breaker.checkServiceHealth();
      }
    }
  }

  handleStateChange(serviceName, event) {
    console.log(`🔌 Circuit breaker state change for ${serviceName}: ${event.fromState} -> ${event.toState}`);

    // Update global metrics
    if (event.toState === CircuitState.OPEN) {
      this.globalMetrics.totalCircuitOpens++;
    } else if (event.toState === CircuitState.CLOSED && event.fromState === CircuitState.OPEN) {
      this.globalMetrics.totalCircuitCloses++;
    }

    // Emit global event
    this.emit('circuitStateChange', {
      serviceName,
      ...event
    });
  }

  updateGlobalMetrics(event) {
    this.globalMetrics.totalRequests += event.requests || 0;
    this.globalMetrics.totalFailures += event.failures || 0;
    this.globalMetrics.totalSuccesses += event.successes || 0;
    this.globalMetrics.totalTimeouts += event.timeouts || 0;
  }
}

/**
 * Individual Circuit Breaker Implementation
 */
class CircuitBreaker extends EventEmitter {
  constructor(serviceName, config, manager) {
    super();
    this.serviceName = serviceName;
    this.config = config;
    this.manager = manager;

    this.state = CircuitState.CLOSED;
    this.stateChangedAt = Date.now();

    // Metrics
    this.requests = [];
    this.failures = [];
    this.successes = [];
    this.timeouts = [];

    // State tracking
    this.lastFailureTime = null;
    this.consecutiveFailures = 0;
    this.healthCheckInProgress = false;
  }

  /**
   * Execute operation through circuit breaker
   */
  async execute(operation, ...args) {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw new Error(`Circuit breaker OPEN for ${this.serviceName}`);
      }
    }

    const startTime = Date.now();
    let result;

    try {
      // Execute the operation with timeout
      result = await this.executeWithTimeout(operation, args);

      // Record success
      this.recordSuccess(startTime);

      // If in half-open state, consider closing
      if (this.state === CircuitState.HALF_OPEN) {
        this.transitionTo(CircuitState.CLOSED);
      }

      return result;

    } catch (error) {
      // Record failure
      this.recordFailure(startTime, error);

      // Check if we should open the circuit
      if (this.shouldOpenCircuit()) {
        this.transitionTo(CircuitState.OPEN);
      }

      // Try fallback function if available
      if (this.config.fallbackFunction) {
        try {
          return await this.config.fallbackFunction(error, ...args);
        } catch (fallbackError) {
          throw fallbackError;
        }
      }

      throw error;
    }
  }

  /**
   * Execute operation with timeout
   */
  async executeWithTimeout(operation, args) {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        this.recordTimeout();
        reject(new Error(`Operation timeout for ${this.serviceName}`));
      }, this.config.timeout);

      try {
        const result = await operation(...args);
        clearTimeout(timeout);
        resolve(result);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Record successful operation
   */
  recordSuccess(startTime) {
    const duration = Date.now() - startTime;

    this.requests.push({ timestamp: Date.now(), duration, success: true });
    this.successes.push({ timestamp: Date.now(), duration });

    this.consecutiveFailures = 0;
    this.trimMetrics();

    this.emit('metrics', {
      requests: 1,
      successes: 1,
      failures: 0,
      timeouts: 0,
      service: this.serviceName
    });
  }

  /**
   * Record failed operation
   */
  recordFailure(startTime, error) {
    const duration = Date.now() - startTime;

    this.requests.push({ timestamp: Date.now(), duration, success: false });
    this.failures.push({ timestamp: Date.now(), duration, error: error.message });

    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    this.trimMetrics();

    this.emit('metrics', {
      requests: 1,
      successes: 0,
      failures: 1,
      timeouts: 0,
      service: this.serviceName
    });
  }

  /**
   * Record timeout
   */
  recordTimeout() {
    this.timeouts.push({ timestamp: Date.now() });
    this.manager.globalMetrics.totalTimeouts++;

    this.emit('metrics', {
      requests: 1,
      successes: 0,
      failures: 0,
      timeouts: 1,
      service: this.serviceName
    });
  }

  /**
   * Check if circuit should open
   */
  shouldOpenCircuit() {
    if (this.state === CircuitState.OPEN) return false;

    const monitoringWindow = Date.now() - this.config.monitoringPeriod;
    const recentRequests = this.requests.filter(r => r.timestamp > monitoringWindow);

    // Check minimum request volume
    if (recentRequests.length < this.config.requestVolumeThreshold) {
      return false;
    }

    // Calculate error rate
    const errorCount = recentRequests.filter(r => !r.success).length;
    const errorRate = (errorCount / recentRequests.length) * 100;

    return errorRate >= this.config.errorThresholdPercentage;
  }

  /**
   * Check if we should attempt reset
   */
  shouldAttemptReset() {
    return Date.now() - this.stateChangedAt > this.config.resetTimeout;
  }

  /**
   * Transition to new state
   */
  transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    this.stateChangedAt = Date.now();

    const event = {
      serviceName: this.serviceName,
      fromState: oldState,
      toState: newState,
      timestamp: Date.now(),
      reason: this.getTransitionReason(oldState, newState)
    };

    this.emit('stateChange', event);
  }

  /**
   * Get transition reason
   */
  getTransitionReason(fromState, toState) {
    switch (toState) {
      case CircuitState.OPEN:
        return `Error threshold exceeded: ${this.consecutiveFailures} consecutive failures`;
      case CircuitState.HALF_OPEN:
        return 'Reset timeout elapsed, attempting recovery';
      case CircuitState.CLOSED:
        return 'Recovery successful, service restored';
      default:
        return 'State transition';
    }
  }

  /**
   * Perform health check
   */
  async checkServiceHealth() {
    if (!this.config.enableHealthCheck || this.healthCheckInProgress) {
      return;
    }

    this.healthCheckInProgress = true;

    try {
      if (this.config.healthCheckEndpoint) {
        // Perform HTTP health check
        const response = await fetch(this.config.healthCheckEndpoint, {
          method: 'GET',
          timeout: 5000
        });

        if (response.ok) {
          this.transitionTo(CircuitState.CLOSED);
        }
      } else {
        // Generic health check - just try a simple operation
        await this.execute(() => Promise.resolve('health_check'));
      }
    } catch (error) {
      // Health check failed, keep circuit open
    } finally {
      this.healthCheckInProgress = false;
    }
  }

  /**
   * Force circuit open
   */
  forceOpen(reason = 'Manual override') {
    this.transitionTo(CircuitState.OPEN);
  }

  /**
   * Force circuit closed
   */
  forceClose() {
    this.reset();
    this.transitionTo(CircuitState.CLOSED);
  }

  /**
   * Reset circuit breaker
   */
  reset() {
    this.state = CircuitState.CLOSED;
    this.stateChangedAt = Date.now();
    this.consecutiveFailures = 0;
    this.lastFailureTime = null;
    this.requests = [];
    this.failures = [];
    this.successes = [];
    this.timeouts = [];
  }

  /**
   * Get current state
   */
  getState() {
    const monitoringWindow = Date.now() - this.config.monitoringPeriod;
    const recentRequests = this.requests.filter(r => r.timestamp > monitoringWindow);

    return {
      state: this.state,
      stateChangedAt: this.stateChangedAt,
      consecutiveFailures: this.consecutiveFailures,
      lastFailureTime: this.lastFailureTime,
      recentRequests: recentRequests.length,
      errorRate: recentRequests.length > 0
        ? (recentRequests.filter(r => !r.success).length / recentRequests.length) * 100
        : 0,
      config: { ...this.config }
    };
  }

  /**
   * Get statistics
   */
  getStatistics() {
    const state = this.getState();
    const monitoringWindow = Date.now() - this.config.monitoringPeriod;

    return {
      serviceName: this.serviceName,
      ...state,
      metrics: {
        totalRequests: this.requests.length,
        totalSuccesses: this.successes.length,
        totalFailures: this.failures.length,
        totalTimeouts: this.timeouts.length,
        averageResponseTime: this.calculateAverageResponseTime(),
        recentRequests: this.requests.filter(r => r.timestamp > monitoringWindow).length
      },
      healthStatus: this.getHealthStatus()
    };
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    const state = this.getState();

    let status = 'healthy';
    if (state.state === CircuitState.OPEN) {
      status = 'unhealthy';
    } else if (state.state === CircuitState.HALF_OPEN) {
      status = 'degraded';
    } else if (state.errorRate > 10) {
      status = 'degraded';
    }

    return {
      status,
      state: state.state,
      errorRate: state.errorRate,
      lastFailure: state.lastFailureTime
    };
  }

  /**
   * Calculate average response time
   */
  calculateAverageResponseTime() {
    if (this.requests.length === 0) return 0;

    const totalDuration = this.requests.reduce((sum, r) => sum + r.duration, 0);
    return Math.round(totalDuration / this.requests.length);
  }

  /**
   * Trim old metrics
   */
  trimMetrics() {
    const cutoff = Date.now() - this.config.monitoringPeriod * 2;

    this.requests = this.requests.filter(r => r.timestamp > cutoff);
    this.successes = this.successes.filter(s => s.timestamp > cutoff);
    this.failures = this.failures.filter(f => f.timestamp > cutoff);
    this.timeouts = this.timeouts.filter(t => t.timestamp > cutoff);
  }

  /**
   * Destroy circuit breaker
   */
  destroy() {
    this.removeAllListeners();
    this.reset();
  }
}

module.exports = {
  CircuitBreakerManager,
  CircuitBreaker,
  CircuitState
};