/**
 * Circuit Breaker implementation for fault tolerance
 * Prevents cascading failures and provides automatic recovery
 */
const EventEmitter = require('events');

class CircuitBreaker extends EventEmitter {
  constructor(options = {}) {
    super();

    // Configuration
    this.failureThreshold = options.failureThreshold || 5; // Number of failures before opening
    this.resetTimeout = options.resetTimeout || 60000; // Time to wait before trying again (ms)
    this.monitoringPeriod = options.monitoringPeriod || 10000; // Time window for failure counting (ms)
    this.expectedRecoveryTime = options.expectedRecoveryTime || 30000; // Expected time for recovery

    // State
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    this.nextAttempt = null;

    // Statistics
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rejectedCalls: 0,
      timeouts: 0,
      circuitOpens: 0,
      circuitCloses: 0,
      halfOpenCalls: 0,
      averageResponseTime: 0,
      totalResponseTime: 0,
      uptime: 0,
      downtime: 0,
      lastStateChange: Date.now()
    };

    // Failure tracking for sliding window
    this.failures = []; // Array of {timestamp, error} objects

    // Start monitoring
    this.startMonitoring();
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute(fn, context = null) {
    const startTime = Date.now();
    this.stats.totalCalls++;

    // Check if circuit is open
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        this.stats.rejectedCalls++;
        this.emit('rejected', {
          reason: 'Circuit is OPEN',
          nextAttempt: this.nextAttempt,
          state: this.state
        });
        throw new Error('Circuit breaker is OPEN - rejecting request');
      } else {
        // Try to move to half-open
        this._setState('HALF_OPEN');
        this.stats.halfOpenCalls++;
      }
    }

    try {
      // Execute the function
      const result = await (context ? fn.call(context) : fn());

      // Success
      const responseTime = Date.now() - startTime;
      this._onSuccess(responseTime);

      this.emit('success', {
        responseTime,
        state: this.state,
        failureCount: this.failureCount
      });

      return result;

    } catch (error) {
      // Failure
      const responseTime = Date.now() - startTime;
      this._onFailure(error, responseTime);

      this.emit('failure', {
        error,
        responseTime,
        state: this.state,
        failureCount: this.failureCount
      });

      throw error;
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextAttempt: this.nextAttempt,
      failuresInWindow: this._getFailuresInWindow().length,
      uptime: this._calculateUptime(),
      downtime: this._calculateDowntime(),
      timeInCurrentState: Date.now() - this.stats.lastStateChange
    };
  }

  /**
   * Get detailed statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalCalls > 0 ? (this.stats.successfulCalls / this.stats.totalCalls) * 100 : 0,
      failureRate: this.stats.totalCalls > 0 ? (this.stats.failedCalls / this.stats.totalCalls) * 100 : 0,
      rejectionRate: this.stats.totalCalls > 0 ? (this.stats.rejectedCalls / this.stats.totalCalls) * 100 : 0,
      averageResponseTime: this.stats.totalCalls > 0 ? this.stats.totalResponseTime / this.stats.totalCalls : 0,
      currentState: this.state,
      timeInCurrentState: Date.now() - this.stats.lastStateChange,
      uptime: this._calculateUptime(),
      downtime: this._calculateDowntime(),
      health: this._calculateHealth()
    };
  }

  /**
   * Reset circuit breaker to closed state
   */
  reset() {
    this._setState('CLOSED');
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    this.failures = [];

    this.emit('reset');
  }

  /**
   * Force circuit to open state
   */
  forceOpen() {
    this._setState('OPEN');
    this.nextAttempt = Date.now() + this.resetTimeout;

    this.emit('force-open');
  }

  /**
   * Force circuit to closed state
   */
  forceClose() {
    this.reset();
  }

  /**
   * Handle successful call
   */
  _onSuccess(responseTime) {
    this.stats.successfulCalls++;
    this.stats.totalResponseTime += responseTime;
    this.lastSuccessTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      // Close the circuit on first success in half-open state
      this._setState('CLOSED');
      this.failureCount = 0;
      this.failures = [];
    }
  }

  /**
   * Handle failed call
   */
  _onFailure(error, responseTime) {
    this.stats.failedCalls++;
    this.stats.totalResponseTime += responseTime;
    this.lastFailureTime = Date.now();

    // Add to failure tracking
    this.failures.push({
      timestamp: Date.now(),
      error: error.message,
      responseTime
    });

    // Clean old failures outside monitoring period
    this._cleanOldFailures();

    if (this.state === 'HALF_OPEN') {
      // Open circuit again on failure in half-open state
      this._setState('OPEN');
      this.nextAttempt = Date.now() + this.resetTimeout;
    } else {
      // Check if we should open the circuit
      const failuresInWindow = this._getFailuresInWindow();
      if (failuresInWindow.length >= this.failureThreshold) {
        this._setState('OPEN');
        this.nextAttempt = Date.now() + this.resetTimeout;
        this.failureCount = failuresInWindow.length;
      }
    }
  }

  /**
   * Set circuit breaker state
   */
  _setState(newState) {
    const oldState = this.state;
    this.state = newState;
    this.stats.lastStateChange = Date.now();

    // Update uptime/downtime tracking
    if (newState === 'OPEN') {
      this.stats.circuitOpens++;
    } else if (oldState === 'OPEN') {
      this.stats.circuitCloses++;
    }

    this.emit('state-change', {
      from: oldState,
      to: newState,
      timestamp: Date.now()
    });
  }

  /**
   * Get failures within monitoring period
   */
  _getFailuresInWindow() {
    const now = Date.now();
    const windowStart = now - this.monitoringPeriod;

    return this.failures.filter(failure => failure.timestamp >= windowStart);
  }

  /**
   * Clean old failures outside monitoring period
   */
  _cleanOldFailures() {
    const now = Date.now();
    const windowStart = now - this.monitoringPeriod;

    this.failures = this.failures.filter(failure => failure.timestamp >= windowStart);
  }

  /**
   * Calculate uptime percentage
   */
  _calculateUptime() {
    const total = this.stats.uptime + this.stats.downtime;
    return total > 0 ? (this.stats.uptime / total) * 100 : 100;
  }

  /**
   * Calculate downtime percentage
   */
  _calculateDowntime() {
    const total = this.stats.uptime + this.stats.downtime;
    return total > 0 ? (this.stats.downtime / total) * 100 : 0;
  }

  /**
   * Calculate overall health score (0-100)
   */
  _calculateHealth() {
    const stats = this.getStats();

    // Factor in success rate, uptime, and current state
    let health = 0;

    if (this.state === 'CLOSED') {
      health += 50; // Base health for closed state
    } else if (this.state === 'HALF_OPEN') {
      health += 25; // Reduced health for half-open state
    }

    // Add success rate contribution
    health += (stats.successRate / 100) * 40;

    // Add uptime contribution
    health += (stats.uptime / 100) * 10;

    return Math.min(100, Math.max(0, health));
  }

  /**
   * Start monitoring uptime/downtime
   */
  startMonitoring() {
    this.monitoringInterval = setInterval(() => {
      const now = Date.now();

      if (this.state === 'OPEN') {
        this.stats.downtime += 1000; // 1 second
      } else {
        this.stats.uptime += 1000; // 1 second
      }
    }, 1000);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Get recent failures for debugging
   */
  getRecentFailures(limit = 10) {
    return this.failures
      .slice(-limit)
      .reverse()
      .map(failure => ({
        timestamp: failure.timestamp,
        timeAgo: Date.now() - failure.timestamp,
        error: failure.error,
        responseTime: failure.responseTime
      }));
  }

  /**
   * Configure circuit breaker parameters
   */
  configure(options) {
    if (options.failureThreshold !== undefined) {
      this.failureThreshold = options.failureThreshold;
    }
    if (options.resetTimeout !== undefined) {
      this.resetTimeout = options.resetTimeout;
    }
    if (options.monitoringPeriod !== undefined) {
      this.monitoringPeriod = options.monitoringPeriod;
    }

    this.emit('configured', options);
  }

  /**
   * Destroy circuit breaker
   */
  destroy() {
    this.stopMonitoring();
    this.removeAllListeners();
    this.failures = [];
  }
}

module.exports = CircuitBreaker;