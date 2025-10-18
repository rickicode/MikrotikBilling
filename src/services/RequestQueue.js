/**
 * Priority Request Queue for Mikrotik API requests
 * Supports different priority levels and intelligent request processing
 */
const EventEmitter = require('events');

class RequestQueue extends EventEmitter {
  constructor(options = {}) {
    super();

    // Configuration
    this.maxSize = options.maxSize || 1000;
    this.enablePrioritization = options.enablePrioritization || true;
    this.defaultPriority = options.defaultPriority || 'normal';
    this.maxConcurrency = options.maxConcurrency || 1;
    this.enableBatching = options.enableBatching || false;
    this.batchSize = options.batchSize || 10;
    this.batchTimeout = options.batchTimeout || 100;

    // Priority levels
    this.priorities = {
      critical: 0,
      high: 1,
      normal: 2,
      low: 3,
      background: 4
    };

    // Queue storage
    this.queues = {};
    for (const priority of Object.keys(this.priorities)) {
      this.queues[priority] = [];
    }

    // Processing state
    this.processing = new Set();
    this.paused = false;
    this.startTime = Date.now();

    // Batch processing
    this.batchQueue = [];
    this.batchTimer = null;

    // Statistics
    this.stats = {
      totalEnqueued: 0,
      totalProcessed: 0,
      totalRejected: 0,
      totalTimedOut: 0,
      concurrentProcessing: 0,
      maxConcurrentProcessing: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0,
      averageWaitTime: 0,
      totalWaitTime: 0,
      maxWaitTime: 0,
      minWaitTime: Infinity,
      priorityStats: {},
      batchStats: {
        batchesProcessed: 0,
        averageBatchSize: 0,
        totalBatchProcessingTime: 0
      }
    };

    // Initialize priority statistics
    for (const priority of Object.keys(this.priorities)) {
      this.stats.priorityStats[priority] = {
        enqueued: 0,
        processed: 0,
        rejected: 0,
        timedOut: 0,
        averageWaitTime: 0,
        averageProcessingTime: 0
      };
    }

    // Start processing
    this._startProcessing();
  }

  /**
   * Add a request to the queue
   */
  async enqueue(requestFn, options = {}) {
    const requestId = this._generateRequestId();
    const priority = this._validatePriority(options.priority || this.defaultPriority);
    const timeout = options.timeout || 30000; // 30 seconds default
    const metadata = options.metadata || {};

    const request = {
      id: requestId,
      fn: requestFn,
      priority: priority,
      timeout: timeout,
      metadata: metadata,
      createdAt: Date.now(),
      enqueuedAt: Date.now(),
      startedAt: null,
      completedAt: null,
      timeoutHandle: null,
      promise: null
    };

    // Check if queue is full
    if (this._getTotalSize() >= this.maxSize) {
      this._rejectRequest(request, new Error('Request queue is full'));
      this.stats.totalRejected++;
      this.stats.priorityStats[priority].rejected++;
      throw new Error('Request queue is full');
    }

    // Add to appropriate priority queue
    this.queues[priority].push(request);
    this.stats.totalEnqueued++;
    this.stats.priorityStats[priority].enqueued++;

    // Create promise for this request
    request.promise = new Promise((resolve, reject) => {
      request.resolve = resolve;
      request.reject = reject;
    });

    // Set timeout
    request.timeoutHandle = setTimeout(() => {
      this._timeoutRequest(request);
    }, timeout);

    // Emit enqueued event
    this.emit('enqueued', {
      requestId,
      priority,
      queueSize: this._getTotalSize(),
      position: this._getPosition(request)
    });

    // Try to process immediately
    this._processNext();

    return request.promise;
  }

  /**
   * Get queue status and statistics
   */
  getStatus() {
    const totalSize = this._getTotalSize();
    const now = Date.now();

    return {
      queues: Object.keys(this.priorities).reduce((acc, priority) => {
        const queue = this.queues[priority];
        acc[priority] = {
          length: queue.length,
          oldestRequest: queue.length > 0 ? now - queue[0].createdAt : 0,
          averageWaitTime: this.stats.priorityStats[priority].averageWaitTime
        };
        return acc;
      }, {}),
      totalSize,
      maxSize: this.maxSize,
      utilization: (totalSize / this.maxSize) * 100,
      processing: this.processing.size,
      maxConcurrency: this.maxConcurrency,
      concurrencyUtilization: (this.processing.size / this.maxConcurrency) * 100,
      paused: this.paused,
      uptime: now - this.startTime,
      stats: this.getStats()
    };
  }

  /**
   * Get detailed statistics
   */
  getStats() {
    const avgProcessingTime = this.stats.totalProcessed > 0
      ? this.stats.totalProcessingTime / this.stats.totalProcessed
      : 0;
    const avgWaitTime = this.stats.totalProcessed > 0
      ? this.stats.totalWaitTime / this.stats.totalProcessed
      : 0;

    return {
      ...this.stats,
      averageProcessingTime: avgProcessingTime,
      averageWaitTime: avgWaitTime,
      successRate: this.stats.totalProcessed > 0
        ? ((this.stats.totalProcessed - this.stats.totalTimedOut) / this.stats.totalProcessed) * 100
        : 0,
      throughput: this.stats.totalProcessed / ((Date.now() - this.startTime) / 1000), // requests per second
      queueEfficiency: this.stats.totalEnqueued > 0
        ? (this.stats.totalProcessed / this.stats.totalEnqueued) * 100
        : 0
    };
  }

  /**
   * Pause processing
   */
  pause() {
    this.paused = true;
    this.emit('paused');
  }

  /**
   * Resume processing
   */
  resume() {
    this.paused = false;
    this._processNext();
    this.emit('resumed');
  }

  /**
   * Clear all queues
   */
  clear() {
    // Clear all queues and reject pending requests
    for (const priority of Object.keys(this.queues)) {
      for (const request of this.queues[priority]) {
        this._rejectRequest(request, new Error('Queue cleared'));
      }
      this.queues[priority] = [];
    }

    // Clear batch queue
    this.batchQueue = [];
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    this.emit('cleared');
  }

  /**
   * Get next request to process (respecting priority)
   */
  _getNextRequest() {
    for (const priority of Object.keys(this.priorities)) {
      const queue = this.queues[priority];
      if (queue.length > 0) {
        return queue.shift();
      }
    }
    return null;
  }

  /**
   * Process next request(s)
   */
  _processNext() {
    if (this.paused || this.processing.size >= this.maxConcurrency) {
      return;
    }

    if (this.enableBatching && this._canProcessBatch()) {
      this._processBatch();
    } else {
      this._processSingle();
    }
  }

  /**
   * Process a single request
   */
  async _processSingle() {
    const request = this._getNextRequest();
    if (!request) {
      return;
    }

    this.processing.add(request);
    this.stats.concurrentProcessing++;
    this.stats.maxConcurrentProcessing = Math.max(
      this.stats.maxConcurrentProcessing,
      this.processing.size
    );

    const now = Date.now();
    request.startedAt = now;
    const waitTime = now - request.enqueuedAt;

    // Update wait time statistics
    this.stats.totalWaitTime += waitTime;
    this.stats.maxWaitTime = Math.max(this.stats.maxWaitTime, waitTime);
    this.stats.minWaitTime = Math.min(this.stats.minWaitTime, waitTime);

    // Update priority wait time statistics
    const priorityStats = this.stats.priorityStats[request.priority];
    const totalProcessed = priorityStats.processed + 1;
    priorityStats.averageWaitTime = (
      (priorityStats.averageWaitTime * priorityStats.processed) + waitTime
    ) / totalProcessed;

    // Clear timeout
    if (request.timeoutHandle) {
      clearTimeout(request.timeoutHandle);
      request.timeoutHandle = null;
    }

    this.emit('processing', {
      requestId: request.id,
      priority: request.priority,
      waitTime,
      concurrent: this.processing.size
    });

    try {
      const startTime = Date.now();
      const result = await request.fn();
      const processingTime = Date.now() - startTime;

      request.completedAt = Date.now();
      request.resolve(result);

      // Update processing statistics
      this.stats.totalProcessed++;
      this.stats.totalProcessingTime += processingTime;
      this.stats.priorityStats[request.priority].processed++;
      this.stats.priorityStats[request.priority].averageProcessingTime = (
        (this.stats.priorityStats[request.priority].averageProcessingTime *
         (this.stats.priorityStats[request.priority].processed - 1)) + processingTime
      ) / this.stats.priorityStats[request.priority].processed;

      this.emit('completed', {
        requestId: request.id,
        priority: request.priority,
        waitTime,
        processingTime,
        totalTime: waitTime + processingTime,
        result: 'success'
      });

    } catch (error) {
      request.completedAt = Date.now();
      request.reject(error);

      this.stats.totalProcessed++;
      this.stats.priorityStats[request.priority].processed++;

      this.emit('completed', {
        requestId: request.id,
        priority: request.priority,
        waitTime,
        processingTime: Date.now() - request.startedAt,
        totalTime: (request.completedAt - request.enqueuedAt),
        result: 'error',
        error: error.message
      });

    } finally {
      this.processing.delete(request);
      this.stats.concurrentProcessing--;

      // Process next request
      this._processNext();
    }
  }

  /**
   * Process batch of requests
   */
  async _processBatch() {
    const batch = this._createBatch();
    if (batch.length === 0) {
      return;
    }

    // Mark all requests as processing
    for (const request of batch) {
      this.processing.add(request);
      request.startedAt = Date.now();
    }

    this.stats.concurrentProcessing += batch.length;
    this.stats.maxConcurrentProcessing = Math.max(
      this.stats.maxConcurrentProcessing,
      this.processing.size
    );

    this.emit('batch-processing', {
      batchId: this._generateBatchId(),
      size: batch.length,
      priorities: batch.map(r => r.priority)
    });

    try {
      const startTime = Date.now();
      const results = await Promise.allSettled(
        batch.map(request => this._executeRequest(request))
      );
      const processingTime = Date.now() - startTime;

      // Update batch statistics
      this.stats.batchStats.batchesProcessed++;
      this.stats.batchStats.totalBatchProcessingTime += processingTime;
      this.stats.batchStats.averageBatchSize = (
        (this.stats.batchStats.averageBatchSize * (this.stats.batchStats.batchesProcessed - 1)) + batch.length
      ) / this.stats.batchStats.batchesProcessed;

      // Handle results
      for (let i = 0; i < batch.length; i++) {
        const request = batch[i];
        const result = results[i];

        request.completedAt = Date.now();

        if (result.status === 'fulfilled') {
          request.resolve(result.value);
        } else {
          request.reject(result.reason);
        }

        this.processing.delete(request);
        this.stats.concurrentProcessing--;
        this.stats.totalProcessed++;
        this.stats.priorityStats[request.priority].processed++;
      }

      this.emit('batch-completed', {
        batchId: this._generateBatchId(),
        size: batch.length,
        processingTime,
        successCount: results.filter(r => r.status === 'fulfilled').length,
        errorCount: results.filter(r => r.status === 'rejected').length
      });

    } catch (error) {
      // Reject all requests in batch
      for (const request of batch) {
        request.completedAt = Date.now();
        request.reject(error);
        this.processing.delete(request);
        this.stats.concurrentProcessing--;
        this.stats.totalProcessed++;
        this.stats.priorityStats[request.priority].processed++;
      }

      this.emit('batch-error', {
        batchId: this._generateBatchId(),
        size: batch.length,
        error: error.message
      });
    }

    // Process next batch
    this._processNext();
  }

  /**
   * Execute a single request
   */
  async _executeRequest(request) {
    const waitTime = request.startedAt - request.enqueuedAt;
    this.stats.totalWaitTime += waitTime;

    const startTime = Date.now();
    const result = await request.fn();
    const processingTime = Date.now() - startTime;

    this.stats.totalProcessingTime += processingTime;

    return result;
  }

  /**
   * Create a batch of requests
   */
  _createBatch() {
    const batch = [];
    const maxBatchSize = Math.min(this.batchSize, this.maxConcurrency - this.processing.size);

    while (batch.length < maxBatchSize) {
      const request = this._getNextRequest();
      if (!request) {
        break;
      }

      // Clear timeout for batched requests
      if (request.timeoutHandle) {
        clearTimeout(request.timeoutHandle);
        request.timeoutHandle = null;
      }

      batch.push(request);
    }

    return batch;
  }

  /**
   * Check if batch processing is possible
   */
  _canProcessBatch() {
    if (!this.enableBatching) {
      return false;
    }

    // Add to batch queue
    const request = this._getNextRequest();
    if (!request) {
      return false;
    }

    this.batchQueue.push(request);

    // Clear timeout for batched request
    if (request.timeoutHandle) {
      clearTimeout(request.timeoutHandle);
      request.timeoutHandle = null;
    }

    // Check if we should process the batch
    if (this.batchQueue.length >= this.batchSize) {
      return true;
    }

    // Set timer to process batch with timeout
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this._processBatch();
        this.batchTimer = null;
        this.batchQueue = [];
      }, this.batchTimeout);
    }

    return false;
  }

  /**
   * Handle request timeout
   */
  _timeoutRequest(request) {
    // Remove from queue if still there
    this._removeFromQueue(request);

    // Remove from processing if currently being processed
    if (this.processing.has(request)) {
      this.processing.delete(request);
      this.stats.concurrentProcessing--;
    }

    request.completedAt = Date.now();
    request.reject(new Error(`Request timed out after ${request.timeout}ms`));

    this.stats.totalTimedOut++;
    this.stats.priorityStats[request.priority].timedOut++;

    this.emit('timeout', {
      requestId: request.id,
      priority: request.priority,
      waitTime: request.startedAt ? request.startedAt - request.enqueuedAt : Date.now() - request.enqueuedAt
    });
  }

  /**
   * Reject a request
   */
  _rejectRequest(request, error) {
    if (request.timeoutHandle) {
      clearTimeout(request.timeoutHandle);
    }

    request.completedAt = Date.now();
    request.reject(error);
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
   * Get total queue size
   */
  _getTotalSize() {
    return Object.values(this.queues).reduce((total, queue) => total + queue.length, 0);
  }

  /**
   * Get position of request in queue
   */
  _getPosition(request) {
    let position = 0;
    for (const priority of Object.keys(this.priorities)) {
      if (this.priorities[priority] > this.priorities[request.priority]) {
        continue;
      }

      if (priority === request.priority) {
        const index = this.queues[priority].indexOf(request);
        if (index !== -1) {
          position += index;
        }
        break;
      }

      position += this.queues[priority].length;
    }
    return position;
  }

  /**
   * Validate and normalize priority
   */
  _validatePriority(priority) {
    if (typeof priority === 'string' && this.priorities.hasOwnProperty(priority)) {
      return priority;
    }

    if (typeof priority === 'number') {
      for (const [name, value] of Object.entries(this.priorities)) {
        if (value === priority) {
          return name;
        }
      }
    }

    return this.defaultPriority;
  }

  /**
   * Generate unique request ID
   */
  _generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique batch ID
   */
  _generateBatchId() {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start processing loop
   */
  _startProcessing() {
    // Processing is event-driven, but we ensure it continues
    setInterval(() => {
      this._processNext();
    }, 10);
  }

  /**
   * Update configuration
   */
  updateConfig(options) {
    if (options.maxSize !== undefined) {
      this.maxSize = Math.max(options.maxSize, 1);
    }
    if (options.maxConcurrency !== undefined) {
      this.maxConcurrency = Math.max(options.maxConcurrency, 1);
    }
    if (options.enableBatching !== undefined) {
      this.enableBatching = options.enableBatching;
    }
    if (options.batchSize !== undefined) {
      this.batchSize = Math.max(options.batchSize, 1);
    }
    if (options.defaultPriority !== undefined) {
      this.defaultPriority = this._validatePriority(options.defaultPriority);
    }

    this.emit('config-updated', options);
  }

  /**
   * Destroy the request queue
   */
  destroy() {
    this.clear();

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    this.removeAllListeners();
  }
}

module.exports = RequestQueue;