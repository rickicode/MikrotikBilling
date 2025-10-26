/**
 * Rate Limiter implementation using Token Bucket algorithm
 * Supports multiple rate limiting strategies and priority queues
 */
const EventEmitter = require('events');

class RateLimiter extends EventEmitter {
  constructor(options = {}) {
    super();

    // Token bucket configuration
    this.bucketSize = options.bucketSize || 100; // Maximum tokens
    this.refillRate = options.refillRate || 10; // Tokens per second
    this.refillInterval = options.refillInterval || 100; // Refill interval in ms

    // Request queue configuration
    this.maxQueueSize = options.maxQueueSize || 1000;
    this.enablePrioritization = options.enablePrioritization || false;
    this.defaultPriority = options.defaultPriority || 'normal'; // high, normal, low

    // Current state
    this.tokens = this.bucketSize;
    this.lastRefill = Date.now();

    // Request queue with priority support
    this.queues = {
      high: [],
      normal: [],
      low: []
    };

    // Processing state
    this.processing = false;
    this.paused = false;

    // Statistics
    this.stats = {
      totalRequests: 0,
      processedRequests: 0,
      rejectedRequests: 0,
      queuedRequests: 0,
      averageWaitTime: 0,
      totalWaitTime: 0,
      maxWaitTime: 0,
      minWaitTime: Infinity,
      tokensUsed: 0,
      tokensRefilled: 0,
      bucketOverflows: 0,
      queueOverflows: 0,
      priorityStats: {
        high: { processed: 0, rejected: 0, avgWaitTime: 0 },
        normal: { processed: 0, rejected: 0, avgWaitTime: 0 },
        low: { processed: 0, rejected: 0, avgWaitTime: 0 }
      }
    };

    // Start token refill timer
    this.startRefillTimer();

    // Start request processor
    this.startProcessor();
  }

  /**
   * Check if request can be processed immediately
   */
  canProcess() {
    return this.tokens >= 1;
  }

  /**
   * Get current token count
   */
  getAvailableTokens() {
    this._refillTokens();
    return this.tokens;
  }

  /**
   * Execute a function with rate limiting
   */
  async execute(fn, options = {}) {
    const startTime = Date.now();
    this.stats.totalRequests++;

    const priority = options.priority || this.defaultPriority;
    const timeout = options.timeout || 30000; // 30 seconds default timeout

    return new Promise((resolve, reject) => {
      const request = {
        fn: fn,
        resolve: resolve,
        reject: reject,
        timestamp: startTime,
        priority: priority,
        timeout: timeout,
        timeoutHandle: null
      };

      // Set timeout
      request.timeoutHandle = setTimeout(() => {
        this._removeFromQueue(request);
        this.stats.rejectedRequests++;
        this.stats.priorityStats[priority].rejected++;
        reject(new Error(`Request timed out after ${timeout}ms`));
        this.emit('timeout', { request, waitTime: Date.now() - startTime });
      }, timeout);

      // Add to appropriate queue
      if (this._addToQueue(request)) {
        this.stats.queuedRequests++;
        this.emit('queued', { request, queueSize: this._getTotalQueueSize() });
      } else {
        // Queue is full
        clearTimeout(request.timeoutHandle);
        this.stats.rejectedRequests++;
        this.stats.queueOverflows++;
        this.stats.priorityStats[priority].rejected++;
        reject(new Error('Rate limiter queue is full'));
        this.emit('rejected', { request, reason: 'queue full' });
      }

      // Try to process immediately if tokens are available
      this._processNextRequest();
    });
  }

  /**
   * Get rate limiter statistics
   */
  getStats() {
    const totalProcessed = this.stats.processedRequests;
    const avgWaitTime = totalProcessed > 0 ? this.stats.totalWaitTime / totalProcessed : 0;

    return {
      ...this.stats,
      averageWaitTime: avgWaitTime,
      currentTokens: this.tokens,
      bucketSize: this.bucketSize,
      bucketUtilization: ((this.bucketSize - this.tokens) / this.bucketSize) * 100,
      queueSize: this._getTotalQueueSize(),
      queueUtilization: (this._getTotalQueueSize() / this.maxQueueSize) * 100,
      processingRate: this.refillRate,
      tokensPerRequest: 1,
      isHealthy: this._isHealthy(),
      uptime: this._getUptime(),
      priorityDistribution: this._getPriorityDistribution()
    };
  }

  /**
   * Get queue status by priority
   */
  getQueueStatus() {
    return {
      high: {
        length: this.queues.high.length,
        oldestRequest: this.queues.high.length > 0 ? Date.now() - this.queues.high[0].timestamp : 0
      },
      normal: {
        length: this.queues.normal.length,
        oldestRequest: this.queues.normal.length > 0 ? Date.now() - this.queues.normal[0].timestamp : 0
      },
      low: {
        length: this.queues.low.length,
        oldestRequest: this.queues.low.length > 0 ? Date.now() - this.queues.low[0].timestamp : 0
      }
    };
  }

  /**
   * Pause rate limiting (stop processing requests)
   */
  pause() {
    this.paused = true;
    this.emit('paused');
  }

  /**
   * Resume rate limiting
   */
  resume() {
    this.paused = false;
    this._processNextRequest();
    this.emit('resumed');
  }

  /**
   * Reset rate limiter state
   */
  reset() {
    this.tokens = this.bucketSize;
    this.lastRefill = Date.now();

    // Clear all queues
    for (const priority of Object.keys(this.queues)) {
      this.queues[priority] = [];
    }

    // Reset statistics
    this.stats.totalRequests = 0;
    this.stats.processedRequests = 0;
    this.stats.rejectedRequests = 0;
    this.stats.queuedRequests = 0;
    this.stats.averageWaitTime = 0;
    this.stats.totalWaitTime = 0;
    this.stats.maxWaitTime = 0;
    this.stats.minWaitTime = Infinity;

    this.emit('reset');
  }

  /**
   * Update rate limiter configuration
   */
  updateConfig(options) {
    if (options.bucketSize !== undefined) {
      this.bucketSize = Math.max(options.bucketSize, 1);
    }
    if (options.refillRate !== undefined) {
      this.refillRate = Math.max(options.refillRate, 0.1);
    }
    if (options.refillInterval !== undefined) {
      this.refillInterval = Math.max(options.refillInterval, 10);
    }
    if (options.maxQueueSize !== undefined) {
      this.maxQueueSize = Math.max(options.maxQueueSize, 0);
    }

    this.emit('config-updated', options);
  }

  /**
   * Add request to appropriate priority queue
   */
  _addToQueue(request) {
    if (this._getTotalQueueSize() >= this.maxQueueSize) {
      return false;
    }

    this.queues[request.priority].push(request);
    return true;
  }

  /**
   * Remove request from queue
   */
  _removeFromQueue(targetRequest) {
    for (const priority of Object.keys(this.queues)) {
      const index = this.queues[priority].indexOf(targetRequest);
      if (index !== -1) {
        this.queues[priority].splice(index, 1);
        return true;
      }
    }
    return false;
  }

  /**
   * Get total queue size across all priorities
   */
  _getTotalQueueSize() {
    return this.queues.high.length + this.queues.normal.length + this.queues.low.length;
  }

  /**
   * Get next request to process (respecting priority)
   */
  _getNextRequest() {
    if (this.queues.high.length > 0) {
      return this.queues.high.shift();
    }
    if (this.queues.normal.length > 0) {
      return this.queues.normal.shift();
    }
    if (this.queues.low.length > 0) {
      return this.queues.low.shift();
    }
    return null;
  }

  /**
   * Process next request in queue
   */
  async _processNextRequest() {
    if (this.processing || this.paused || this.tokens < 1) {
      return;
    }

    const request = this._getNextRequest();
    if (!request) {
      return;
    }

    this.processing = true;
    this.tokens--;
    this.stats.tokensUsed++;

    const waitTime = Date.now() - request.timestamp;
    this.stats.totalWaitTime += waitTime;
    this.stats.maxWaitTime = Math.max(this.stats.maxWaitTime, waitTime);
    this.stats.minWaitTime = Math.min(this.stats.minWaitTime, waitTime);

    // Update priority statistics
    const priorityStats = this.stats.priorityStats[request.priority];
    priorityStats.processed++;
    const totalProcessed = priorityStats.processed;
    priorityStats.avgWaitTime = ((priorityStats.avgWaitTime * (totalProcessed - 1)) + waitTime) / totalProcessed;

    // Clear timeout
    if (request.timeoutHandle) {
      clearTimeout(request.timeoutHandle);
    }

    try {
      const result = await request.fn();
      this.stats.processedRequests++;
      this.emit('processed', {
        request,
        waitTime,
        result: 'success',
        remainingTokens: this.tokens
      });
      request.resolve(result);
    } catch (error) {
      this.stats.processedRequests++;
      this.emit('processed', {
        request,
        waitTime,
        result: 'error',
        error: error.message,
        remainingTokens: this.tokens
      });
      request.reject(error);
    } finally {
      this.processing = false;

      // Process next request
      setImmediate(() => this._processNextRequest());
    }
  }

  /**
   * Refill tokens based on elapsed time
   */
  _refillTokens() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor((elapsed / this.refillInterval) * this.refillRate);

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.bucketSize, this.tokens + tokensToAdd);
      this.lastRefill = now;
      this.stats.tokensRefilled += tokensToAdd;

      if (this.tokens > this.bucketSize) {
        this.stats.bucketOverflows++;
      }

      this.emit('tokens-refilled', {
        tokensAdded,
        currentTokens: this.tokens,
        bucketSize: this.bucketSize
      });

      // Process next request if tokens are available
      this._processNextRequest();
    }
  }

  /**
   * Start token refill timer
   */
  startRefillTimer() {
    this.refillTimer = setInterval(() => {
      this._refillTokens();
    }, this.refillInterval);
  }

  /**
   * Start request processor
   */
  startProcessor() {
    // Processing is event-driven, but we'll ensure tokens are refilled regularly
    setInterval(() => {
      this._refillTokens();
    }, 100);
  }

  /**
   * Check if rate limiter is healthy
   */
  _isHealthy() {
    const stats = this.getStats();
    return (
      stats.queueUtilization < 90 && // Queue not overloaded
      stats.bucketUtilization < 95 && // Bucket not exhausted
      stats.rejectionRate < 10 // Rejection rate acceptable
    );
  }

  /**
   * Get uptime (simplified - returns time since creation)
   */
  _getUptime() {
    return Date.now() - (this.startTime || Date.now());
  }

  /**
   * Get priority distribution statistics
   */
  _getPriorityDistribution() {
    const total = this.stats.totalRequests;
    if (total === 0) {
      return { high: 0, normal: 0, low: 0 };
    }

    return {
      high: (this.stats.priorityStats.high.processed + this.stats.priorityStats.high.rejected) / total * 100,
      normal: (this.stats.priorityStats.normal.processed + this.stats.priorityStats.normal.rejected) / total * 100,
      low: (this.stats.priorityStats.low.processed + this.stats.priorityStats.low.rejected) / total * 100
    };
  }

  /**
   * Destroy rate limiter
   */
  destroy() {
    if (this.refillTimer) {
      clearInterval(this.refillTimer);
      this.refillTimer = null;
    }

    // Clear all requests and timeouts
    for (const priority of Object.keys(this.queues)) {
      for (const request of this.queues[priority]) {
        if (request.timeoutHandle) {
          clearTimeout(request.timeoutHandle);
        }
        request.reject(new Error('Rate limiter is shutting down'));
      }
      this.queues[priority] = [];
    }

    this.removeAllListeners();
  }
}

module.exports = RateLimiter;