/**
 * Enhanced Connection Pool for Mikrotik RouterOS API
 *
 * Features:
 * - Connection pooling with multiple connections
 * - Circuit breaker pattern for fault tolerance
 * - Exponential backoff retry logic
 * - Connection health monitoring and proactive maintenance
 * - Load balancing across connections
 * - Queue management with priority handling
 * - Comprehensive metrics and monitoring
 * - Connection recovery and auto-healing
 */

const { RouterOSClient } = require('mikro-routeros');
const EventEmitter = require('events');

class ConnectionPool extends EventEmitter {
  constructor(config, options = {}) {
    super();

    // Enhanced configuration
    this.config = config;
    this.maxSize = options.maxSize || 5;
    this.minSize = options.minSize || 2;
    this.acquireTimeout = options.acquireTimeout || 10000;
    this.idleTimeout = options.idleTimeout || 300000; // 5 minutes
    this.healthCheckInterval = options.healthCheckInterval || 30000; // 30 seconds

    // Network stability improvements
    this.circuitBreakerThreshold = options.circuitBreakerThreshold || 5;
    this.circuitBreakerTimeout = options.circuitBreakerTimeout || 60000; // 1 minute
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.maxRetryDelay = options.maxRetryDelay || 10000;
    this.connectionTimeout = options.connectionTimeout || 15000;
    this.commandTimeout = options.commandTimeout || 30000;

    // Performance optimization
    this.enableBatching = options.enableBatching !== false;
    this.batchSize = options.batchSize || 10;
    this.batchTimeout = options.batchTimeout || 100;

    // Priority queue support
    this.priorities = {
      critical: 100,
      high: 75,
      normal: 50,
      low: 25
    };

    this.pool = [];
    this.waitingQueue = [];
    this.totalConnections = 0;
    this.activeConnections = 0;
    this.index = 0; // For round-robin selection

    // Circuit breaker state
    this.circuitBreakerState = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.circuitBreakerFailures = 0;
    this.circuitBreakerLastFailure = 0;

    // Performance tracking
    this.responseTimeHistory = [];
    this.maxResponseTimeHistory = 100;

    // Health check timer
    this.healthCheckTimer = null;

    // Batch processing
    this.batchQueue = [];
    this.batchTimer = null;

    // Enhanced statistics
    this.stats = {
      totalAcquires: 0,
      totalReleases: 0,
      totalCreated: 0,
      totalDestroyed: 0,
      totalTimeouts: 0,
      totalErrors: 0,
      totalRetries: 0,
      averageAcquireTime: 0,
      averageResponseTime: 0,
      peakActiveConnections: 0,
      circuitBreakerActivations: 0,
      connectionErrors: 0,
      successfulCommands: 0,
      failedCommands: 0,
      uptime: Date.now(),
      lastHealthCheck: null,
      connectionDrops: 0,
      autoReconnections: 0
    };

    // Request tracking for monitoring
    this.activeRequests = new Map();

    this.start();
  }

  /**
   * Initialize the connection pool
   */
  async start() {
    try {
      // Create minimum connections
      const promises = [];
      for (let i = 0; i < this.minSize; i++) {
        promises.push(this._createConnection());
      }

      await Promise.all(promises);

      // Start health check timer
      this.startHealthCheck();

      console.log(`ConnectionPool started with ${this.pool.length} connections`);
      this.emit('started', this.pool.length);
    } catch (error) {
      console.error('Failed to start ConnectionPool:', error);
      this.emit('error', error);
    }
  }

  /**
   * Acquire a connection from the pool with priority support
   */
  async acquire(priority = 'normal') {
    const startTime = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.stats.totalAcquires++;

    // Check circuit breaker
    if (this.circuitBreakerState === 'OPEN') {
      if (Date.now() - this.circuitBreakerLastFailure > this.circuitBreakerTimeout) {
        this.circuitBreakerState = 'HALF_OPEN';
        console.log('🔄 Circuit breaker transitioning to HALF_OPEN');
        this.emit('circuitBreakerHalfOpen');
      } else {
        const error = new Error(`Circuit breaker is OPEN - requests blocked for ${this.circuitBreakerTimeout - (Date.now() - this.circuitBreakerLastFailure)}ms`);
        this.stats.totalTimeouts++;
        this.emit('circuitBreakerOpen', error);
        throw error;
      }
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waitingQueue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.waitingQueue.splice(index, 1);
        }
        this.activeRequests.delete(requestId);
        this.stats.totalTimeouts++;
        reject(new Error(`Connection acquire timeout after ${this.acquireTimeout}ms`));
      }, this.acquireTimeout);

      const request = {
        id: requestId,
        priority: this.priorities[priority] || this.priorities.normal,
        resolve: (connection) => {
          clearTimeout(timeout);
          const acquireTime = Date.now() - startTime;
          this._updateAcquireTimeStats(acquireTime);
          this.activeRequests.set(requestId, {
            connectionId: connection.id,
            startTime: Date.now(),
            priority: priority
          });
          resolve(connection);
        },
        reject: (error) => {
          clearTimeout(timeout);
          this.activeRequests.delete(requestId);
          reject(error);
        },
        timestamp: Date.now()
      };

      // Track active request
      this.activeRequests.set(requestId, {
        startTime: Date.now(),
        priority: priority,
        state: 'queued'
      });

      // Try to get an available connection
      const connection = this._getAvailableConnection();
      if (connection) {
        request.resolve(connection);
      } else {
        // Add to waiting queue with priority
        this.waitingQueue.push(request);

        // Sort queue by priority (higher priority first)
        this.waitingQueue.sort((a, b) => b.priority - a.priority);

        // Try to create a new connection if we haven't reached max size
        if (this.totalConnections < this.maxSize) {
          this._createConnection().catch(error => {
            console.error('Failed to create new connection:', error);
            this.stats.totalErrors++;
          });
        }
      }
    });
  }

  /**
   * Release a connection back to the pool with enhanced error handling
   */
  release(connection, requestSuccess = true) {
    this.stats.totalReleases++;

    if (!connection || !connection.inPool) {
      return;
    }

    // Update connection statistics
    if (requestSuccess) {
      this.stats.successfulCommands++;
      // Reset circuit breaker on success in HALF_OPEN state
      if (this.circuitBreakerState === 'HALF_OPEN') {
        this.circuitBreakerState = 'CLOSED';
        this.circuitBreakerFailures = 0;
        console.log('✅ Circuit breaker reset to CLOSED after successful command');
        this.emit('circuitBreakerClosed');
      }
    } else {
      this.stats.failedCommands++;
      this.circuitBreakerFailures++;
      this._checkCircuitBreaker();
    }

    connection.inUse = false;
    connection.lastUsed = Date.now();
    this.activeConnections--;

    // Find and remove the request from active requests
    for (const [requestId, request] of this.activeRequests.entries()) {
      if (request.connectionId === connection.id) {
        this.activeRequests.delete(requestId);
        break;
      }
    }

    // Process waiting queue (priority-based)
    if (this.waitingQueue.length > 0) {
      const request = this.waitingQueue.shift();
      connection.inUse = true;
      this.activeConnections++;
      request.resolve(connection);
    }

    this.emit('released', connection.id, { requestSuccess });
  }

  /**
   * Execute a command with automatic retry logic
   */
  async executeCommand(command, params = {}, options = {}) {
    const startTime = Date.now();
    const priority = options.priority || 'normal';
    let lastError;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      let connection;
      try {
        // Acquire connection
        connection = await this.acquire(priority);

        // Execute command with timeout
        const timeout = options.timeout || this.commandTimeout;
        const commandPromise = connection.client.runQuery(command, params);

        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`Command timeout after ${timeout}ms`)), timeout);
        });

        const result = await Promise.race([commandPromise, timeoutPromise]);

        // Update response time tracking
        const responseTime = Date.now() - startTime;
        this.responseTimeHistory.push(responseTime);
        if (this.responseTimeHistory.length > this.maxResponseTimeHistory) {
          this.responseTimeHistory.shift();
        }
        this._updateResponseTimeStats(responseTime);

        // Release connection on success
        this.release(connection, true);

        this.emit('commandCompleted', {
          command,
          params,
          responseTime,
          attempt,
          success: true
        });

        return result;

      } catch (error) {
        lastError = error;

        // Release connection on failure
        if (connection) {
          this.release(connection, false);
        }

        this.stats.totalRetries++;
        this.emit('commandFailed', {
          command,
          params,
          error: error.message,
          attempt,
          willRetry: attempt < this.retryAttempts
        });

        // Check if we should retry
        if (attempt < this.retryAttempts && this._isRetryableError(error)) {
          const delay = Math.min(
            this.retryDelay * Math.pow(2, attempt - 1),
            this.maxRetryDelay
          );

          console.warn(`⚠️ Command failed (attempt ${attempt}/${this.retryAttempts}), retrying in ${delay}ms: ${command} - ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          break;
        }
      }
    }

    // All retries failed
    console.error(`❌ Command failed after ${this.retryAttempts} attempts: ${command} - ${lastError.message}`);
    throw lastError;
  }

  /**
   * Execute multiple commands in batch for better performance
   */
  async executeBatch(commands, options = {}) {
    if (!this.enableBatching) {
      // Execute commands sequentially if batching is disabled
      const results = [];
      for (const { command, params, priority } of commands) {
        try {
          const result = await this.executeCommand(command, params, { priority, ...options });
          results.push({ success: true, data: result });
        } catch (error) {
          results.push({ success: false, error: error.message });
        }
      }
      return results;
    }

    // Group commands by priority and execute in batches
    const batches = this._groupCommandsByPriority(commands);
    const allResults = [];

    for (const batch of batches) {
      const batchResults = await this._executeBatch(batch, options);
      allResults.push(...batchResults);
    }

    return allResults;
  }

  /**
   * Check if error is retryable
   */
  _isRetryableError(error) {
    const retryableErrors = [
      'timeout',
      'connection',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EHOSTUNREACH',
      'socket hang up',
      'read ECONNRESET',
      'write ECONNRESET',
      'Network is unreachable'
    ];

    return retryableErrors.some(err =>
      error.message.toLowerCase().includes(err.toLowerCase())
    );
  }

  /**
   * Check and update circuit breaker state
   */
  _checkCircuitBreaker() {
    if (this.circuitBreakerFailures >= this.circuitBreakerThreshold) {
      if (this.circuitBreakerState !== 'OPEN') {
        this.circuitBreakerState = 'OPEN';
        this.circuitBreakerLastFailure = Date.now();
        this.stats.circuitBreakerActivations++;
        console.log(`🚨 Circuit breaker OPENED due to ${this.circuitBreakerFailures} consecutive failures`);
        this.emit('circuitBreakerOpened', {
          failures: this.circuitBreakerFailures,
          threshold: this.circuitBreakerThreshold
        });
      }
    }
  }

  /**
   * Update response time statistics
   */
  _updateResponseTimeStats(responseTime) {
    const total = this.stats.successfulCommands + this.stats.failedCommands;
    if (total > 0) {
      const totalTime = this.stats.averageResponseTime * (total - 1) + responseTime;
      this.stats.averageResponseTime = totalTime / total;
    }
  }

  /**
   * Group commands by priority for batch execution
   */
  _groupCommandsByPriority(commands) {
    const groups = {};

    for (const cmd of commands) {
      const priority = cmd.priority || 'normal';
      if (!groups[priority]) {
        groups[priority] = [];
      }
      groups[priority].push(cmd);
    }

    // Sort groups by priority (high to low)
    const sortedPriorities = Object.keys(groups).sort((a, b) =>
      (this.priorities[b] || 0) - (this.priorities[a] || 0)
    );

    return sortedPriorities.map(priority => groups[priority]);
  }

  /**
   * Execute a batch of commands with the same priority
   */
  async _executeBatch(commands, options = {}) {
    const results = [];
    const batchSize = Math.min(commands.length, this.batchSize);

    // Process in smaller batches to avoid overwhelming connections
    for (let i = 0; i < commands.length; i += batchSize) {
      const batch = commands.slice(i, i + batchSize);
      const batchPromises = batch.map(({ command, params, priority }) =>
        this.executeCommand(command, params, { priority, ...options })
          .then(data => ({ success: true, data }))
          .catch(error => ({ success: false, error: error.message }))
      );

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(result =>
        result.status === 'fulfilled' ? result.value : { success: false, error: result.reason.message }
      ));

      // Small delay between batches to prevent overwhelming
      if (i + batchSize < commands.length) {
        await new Promise(resolve => setTimeout(resolve, this.batchTimeout));
      }
    }

    return results;
  }

  /**
   * Destroy a connection
   */
  async destroy(connection) {
    if (!connection || !connection.inPool) {
      return;
    }

    try {
      await connection.client.close();
    } catch (error) {
      console.warn(`Error closing connection ${connection.id}:`, error.message);
    }

    const index = this.pool.indexOf(connection);
    if (index !== -1) {
      this.pool.splice(index, 1);
      this.totalConnections--;
      this.stats.totalDestroyed++;
    }

    this.emit('destroyed', connection.id);
  }

  /**
   * Close all connections and stop the pool
   */
  async stop() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    const closePromises = this.pool.map(connection => this.destroy(connection));
    await Promise.all(closePromises);

    // Reject all waiting requests
    this.waitingQueue.forEach(request => {
      request.reject(new Error('Connection pool is shutting down'));
    });
    this.waitingQueue = [];

    console.log('ConnectionPool stopped');
    this.emit('stopped');
  }

  /**
   * Get comprehensive pool statistics and metrics
   */
  getStats() {
    const now = Date.now();
    const uptime = now - this.stats.uptime;

    // Connection statistics
    const healthyConnections = this.pool.filter(c => c.healthy).length;
    const availableConnections = this.pool.filter(c => !c.inUse && c.healthy).length;
    const poolUtilization = this.totalConnections > 0 ? (this.activeConnections / this.totalConnections) * 100 : 0;

    // Performance metrics
    const successRate = this.stats.successfulCommands + this.stats.failedCommands > 0 ?
      (this.stats.successfulCommands / (this.stats.successfulCommands + this.stats.failedCommands) * 100) : 0;

    const averageResponseTime = this.responseTimeHistory.length > 0 ?
      this.responseTimeHistory.reduce((sum, time) => sum + time, 0) / this.responseTimeHistory.length : 0;

    // Get percentiles for response times
    const sortedResponseTimes = [...this.responseTimeHistory].sort((a, b) => a - b);
    const p50 = this._getPercentile(sortedResponseTimes, 50);
    const p95 = this._getPercentile(sortedResponseTimes, 95);
    const p99 = this._getPercentile(sortedResponseTimes, 99);

    // Connection quality metrics
    const connectionQuality = this.totalConnections > 0 ? {
      healthy: (healthyConnections / this.totalConnections) * 100,
      averageAge: this.pool.reduce((sum, c) => sum + (now - c.created), 0) / this.totalConnections,
      averageRequests: this.pool.reduce((sum, c) => sum + c.totalRequests, 0) / this.totalConnections,
      averageErrors: this.pool.reduce((sum, c) => sum + c.errorCount, 0) / this.totalConnections
    } : null;

    // Active requests analysis
    const activeRequestsByPriority = {};
    for (const [id, request] of this.activeRequests.entries()) {
      const priority = request.priority || 'normal';
      activeRequestsByPriority[priority] = (activeRequestsByPriority[priority] || 0) + 1;
    }

    // Queue analysis
    const queueByPriority = {};
    for (const request of this.waitingQueue) {
      const priorityName = this._getPriorityName(request.priority);
      queueByPriority[priorityName] = (queueByPriority[priorityName] || 0) + 1;
    }

    return {
      // Basic statistics
      ...this.stats,
      uptime,
      successRate: successRate.toFixed(2),

      // Connection pool status
      connections: {
        total: this.totalConnections,
        min: this.minSize,
        max: this.maxSize,
        active: this.activeConnections,
        available: availableConnections,
        healthy: healthyConnections,
        utilization: poolUtilization.toFixed(2)
      },

      // Queue status
      queue: {
        length: this.waitingQueue.length,
        processing: this.processingQueue,
        byPriority: queueByPriority,
        longestWaitTime: this.waitingQueue.length > 0 ? now - Math.min(...this.waitingQueue.map(r => r.timestamp)) : 0
      },

      // Active requests
      activeRequests: {
        total: this.activeRequests.size,
        byPriority: activeRequestsByPriority
      },

      // Performance metrics
      performance: {
        averageResponseTime: averageResponseTime.toFixed(2),
        averageAcquireTime: this.stats.averageAcquireTime.toFixed(2),
        responseTimePercentiles: {
          p50: p50.toFixed(2),
          p95: p95.toFixed(2),
          p99: p99.toFixed(2)
        },
        totalCommands: this.stats.successfulCommands + this.stats.failedCommands,
        retries: this.stats.totalRetries,
        retryRate: this.stats.totalCommands > 0 ? ((this.stats.totalRetries / this.stats.totalCommands) * 100).toFixed(2) : 0
      },

      // Circuit breaker status
      circuitBreaker: {
        state: this.circuitBreakerState,
        failures: this.circuitBreakerFailures,
        threshold: this.circuitBreakerThreshold,
        timeoutRemaining: this.circuitBreakerState === 'OPEN' ?
          Math.max(0, this.circuitBreakerTimeout - (now - this.circuitBreakerLastFailure)) : 0,
        activations: this.stats.circuitBreakerActivations
      },

      // Connection quality
      connectionQuality,

      // Health check status
      healthCheck: {
        lastCheck: this.stats.lastHealthCheck,
        nextCheck: this.stats.lastHealthCheck ? this.stats.lastHealthCheck + this.healthCheckInterval : null,
        interval: this.healthCheckInterval,
        connectionDrops: this.stats.connectionDrops,
        autoReconnections: this.stats.autoReconnections
      },

      // Error analysis
      errors: {
        total: this.stats.totalErrors,
        connectionErrors: this.stats.connectionErrors,
        timeouts: this.stats.totalTimeouts,
        errorRate: this.stats.totalCommands > 0 ? ((this.stats.failedCommands / this.stats.totalCommands) * 100).toFixed(2) : 0
      }
    };
  }

  /**
   * Get detailed connection information for monitoring
   */
  getConnectionDetails() {
    const now = Date.now();

    return this.pool.map(connection => ({
      id: connection.id,
      state: connection.inUse ? 'busy' : (connection.healthy ? 'available' : 'unhealthy'),
      created: connection.created,
      age: now - connection.created,
      lastUsed: connection.lastUsed,
      idleTime: now - connection.lastUsed,
      lastHealthCheck: connection.lastHealthCheck,
      healthCheckAge: now - connection.lastHealthCheck,
      healthy: connection.healthy,
      errorCount: connection.errorCount,
      consecutiveErrors: connection.consecutiveErrors,
      lastError: connection.lastError,
      totalRequests: connection.totalRequests,
      totalResponseTime: connection.totalResponseTime,
      averageResponseTime: connection.averageResponseTime || 0,
      creationTime: connection.creationTime,
      testResponse: connection.testResponse
    }));
  }

  /**
   * Get real-time performance metrics
   */
  getPerformanceMetrics() {
    const now = Date.now();
    const recentResponseTimes = this.responseTimeHistory.slice(-20); // Last 20 requests

    return {
      timestamp: now,
      recent: {
        responseTimes: recentResponseTimes,
        averageResponseTime: recentResponseTimes.length > 0 ?
          recentResponseTimes.reduce((sum, time) => sum + time, 0) / recentResponseTimes.length : 0,
        requestRate: this._calculateRecentRequestRate()
      },
      current: {
        activeConnections: this.activeConnections,
        queuedRequests: this.waitingQueue.length,
        healthyConnections: this.pool.filter(c => c.healthy).length
      }
    };
  }

  /**
   * Get priority name from priority value
   */
  _getPriorityName(priority) {
    for (const [name, value] of Object.entries(this.priorities)) {
      if (value === priority) {
        return name;
      }
    }
    return 'normal';
  }

  /**
   * Calculate percentile from sorted array
   */
  _getPercentile(sortedArray, percentile) {
    if (sortedArray.length === 0) return 0;

    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  /**
   * Calculate recent request rate
   */
  _calculateRecentRequestRate() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    let recentRequests = 0;
    for (const connection of this.pool) {
      if (connection.lastUsed > oneMinuteAgo) {
        recentRequests++;
      }
    }

    return recentRequests; // Requests per minute
  }

  /**
   * Get an available connection from the pool
   */
  _getAvailableConnection() {
    // Find an available connection (round-robin for load balancing)
    let attempts = 0;
    while (attempts < this.pool.length) {
      const connection = this.pool[this.index];
      this.index = (this.index + 1) % this.pool.length;

      if (!connection.inUse && connection.healthy) {
        connection.inUse = true;
        connection.lastUsed = Date.now();
        this.activeConnections++;

        if (this.activeConnections > this.stats.peakActiveConnections) {
          this.stats.peakActiveConnections = this.activeConnections;
        }

        return connection;
      }
      attempts++;
    }

    return null;
  }

  /**
   * Create a new connection with enhanced error handling and validation
   */
  async _createConnection() {
    if (this.totalConnections >= this.maxSize) {
      return null;
    }

    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    try {
      console.log(`🔗 Creating new connection ${connectionId} to ${this.config.host}:${this.config.port}`);

      // Validate configuration before creating connection
      this._validateConnectionConfig();

      const client = new RouterOSClient(
        this.config.host,
        this.config.port,
        this.connectionTimeout
      );

      // Connect with timeout
      const connectPromise = client.connect();
      const connectTimeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), this.connectionTimeout);
      });

      await Promise.race([connectPromise, connectTimeoutPromise]);

      // Login with timeout
      const loginPromise = client.login(this.config.username, this.config.password);
      const loginTimeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Login timeout')), this.connectionTimeout);
      });

      await Promise.race([loginPromise, loginTimeoutPromise]);

      // Test connection with lightweight command
      const testPromise = client.runQuery('/system/identity/print');
      const testTimeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection test timeout')), this.connectionTimeout);
      });

      const testResult = await Promise.race([testPromise, testTimeoutPromise]);

      if (!testResult || testResult.length === 0) {
        throw new Error('Connection test failed - no response from RouterOS');
      }

      const connection = {
        id: connectionId,
        client: client,
        created: Date.now(),
        lastUsed: Date.now(),
        lastHealthCheck: Date.now(),
        inUse: false,
        healthy: true,
        inPool: true,
        errorCount: 0,
        consecutiveErrors: 0,
        lastError: null,
        creationTime: Date.now() - startTime,
        totalRequests: 0,
        totalResponseTime: 0,
        averageResponseTime: 0,
        testResponse: testResult[0]?.name || 'Unknown'
      };

      this.pool.push(connection);
      this.totalConnections++;
      this.stats.totalCreated++;

      console.log(`✅ Created new connection: ${connectionId} (${connection.creationTime}ms) - Router: ${connection.testResponse}`);
      this.emit('created', connectionId, connection);

      // Process waiting queue if any
      if (this.waitingQueue.length > 0) {
        const request = this.waitingQueue.shift();
        connection.inUse = true;
        this.activeConnections++;
        request.resolve(connection);
      }

      return connection;

    } catch (error) {
      console.error(`❌ Failed to create connection ${connectionId}:`, error.message);
      this.stats.totalErrors++;
      this.stats.connectionErrors++;
      this.circuitBreakerFailures++;
      this._checkCircuitBreaker();

      // Clean up any partial connection
      try {
        if (client) {
          await client.close();
        }
      } catch (cleanupError) {
        console.warn(`Error during connection cleanup: ${cleanupError.message}`);
      }

      this.emit('connectionCreationFailed', {
        connectionId,
        error: error.message,
        host: this.config.host,
        port: this.config.port,
        attemptTime: Date.now() - startTime
      });

      throw error;
    }
  }

  /**
   * Validate connection configuration
   */
  _validateConnectionConfig() {
    const required = ['host', 'port', 'username'];
    for (const field of required) {
      if (!this.config[field]) {
        throw new Error(`Missing required configuration: ${field}`);
      }
    }

    if (this.config.port < 1 || this.config.port > 65535) {
      throw new Error('Invalid port number');
    }

    if (this.config.connectionTimeout < 1000) {
      console.warn('Connection timeout is very low, may cause connection failures');
    }
  }

  /**
   * Start health check timer
   */
  startHealthCheck() {
    this.healthCheckTimer = setInterval(async () => {
      await this._performHealthCheck();
    }, this.healthCheckInterval);
  }

  /**
   * Perform comprehensive health check on all connections
   */
  async _performHealthCheck() {
    const now = Date.now();
    const healthCheckPromises = [];
    let idleConnectionsRemoved = 0;
    let unhealthyConnectionsReplaced = 0;

    this.stats.lastHealthCheck = now;

    // Update global health metrics
    for (const connection of this.pool) {
      // Skip connections that are currently in use (will be checked when released)
      if (connection.inUse) {
        continue;
      }

      // Check if connection is idle for too long and should be removed
      if (now - connection.lastUsed > this.idleTimeout && this.totalConnections > this.minSize) {
        console.log(`🧹 Removing idle connection: ${connection.id} (idle for ${now - connection.lastUsed}ms)`);
        healthCheckPromises.push(this.destroy(connection));
        idleConnectionsRemoved++;
        continue;
      }

      // Perform health check if enough time has passed
      const timeSinceLastCheck = now - connection.lastHealthCheck;
      if (timeSinceLastCheck >= this.healthCheckInterval) {
        healthCheckPromises.push(this._checkConnectionHealth(connection));
      }
    }

    // Execute all health checks in parallel
    const results = await Promise.allSettled(healthCheckPromises);

    // Process health check results
    for (const result of results) {
      if (result.status === 'rejected' && result.reason.connectionId) {
        console.warn(`Health check failed for connection ${result.reason.connectionId}: ${result.reason.error}`);
        unhealthyConnectionsReplaced++;
      }
    }

    // Maintain minimum connection pool size
    await this._maintainPoolSize();

    // Log health check summary
    if (idleConnectionsRemoved > 0 || unhealthyConnectionsReplaced > 0) {
      console.log(`🏥 Health check completed: ${idleConnectionsRemoved} idle removed, ${unhealthyConnectionsReplaced} unhealthy replaced`);
    }

    this.emit('healthCheckCompleted', {
      timestamp: now,
      idleConnectionsRemoved,
      unhealthyConnectionsReplaced,
      totalConnections: this.totalConnections,
      healthyConnections: this.pool.filter(c => c.healthy).length
    });
  }

  /**
   * Check health of a single connection with enhanced diagnostics
   */
  async _checkConnectionHealth(connection) {
    const startTime = Date.now();

    try {
      // Perform lightweight health check
      const healthCheckPromise = connection.client.runQuery('/system/identity/print');
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), this.connectionTimeout);
      });

      const result = await Promise.race([healthCheckPromise, timeoutPromise]);
      const responseTime = Date.now() - startTime;

      // Update connection health metrics
      connection.lastHealthCheck = Date.now();
      connection.healthy = true;
      connection.consecutiveErrors = 0;
      connection.lastError = null;
      connection.totalRequests++;
      connection.totalResponseTime += responseTime;
      connection.averageResponseTime = connection.totalResponseTime / connection.totalRequests;

      this.emit('healthCheckPassed', {
        connectionId: connection.id,
        responseTime,
        averageResponseTime: connection.averageResponseTime,
        totalRequests: connection.totalRequests
      });

      return { connectionId: connection.id, healthy: true, responseTime };

    } catch (error) {
      connection.errorCount++;
      connection.consecutiveErrors++;
      connection.lastError = error.message;
      connection.lastHealthCheck = Date.now();

      this.emit('healthCheckFailed', {
        connectionId: connection.id,
        error: error.message,
        consecutiveErrors: connection.consecutiveErrors,
        totalErrors: connection.errorCount
      });

      // Determine if connection should be replaced
      const shouldReplace = connection.consecutiveErrors >= 3 ||
                           this._isConnectionError(error);

      if (shouldReplace) {
        console.warn(`⚠️ Marking connection as unhealthy: ${connection.id} (${connection.consecutiveErrors} consecutive errors)`);
        connection.healthy = false;

        // Replace unhealthy connection
        if (this.totalConnections > this.minSize) {
          await this.destroy(connection);
          this.stats.connectionDrops++;
        } else {
          // Try to recreate the connection to maintain minimum pool size
          try {
            await this.destroy(connection);
            await this._createConnection();
            this.stats.autoReconnections++;
            console.log(`🔄 Auto-recreated connection: ${connection.id}`);
          } catch (recreateError) {
            console.error(`❌ Failed to recreate connection ${connection.id}:`, recreateError.message);
            this.stats.connectionErrors++;
          }
        }
      }

      throw { connectionId: connection.id, error: error.message };
    }
  }

  /**
   * Maintain minimum connection pool size
   */
  async _maintainPoolSize() {
    const currentHealthyConnections = this.pool.filter(c => c.healthy).length;
    const connectionsNeeded = this.minSize - currentHealthyConnections;

    if (connectionsNeeded > 0) {
      console.log(`🔧 Maintaining pool size: creating ${connectionsNeeded} new connections`);
      const createPromises = [];

      for (let i = 0; i < connectionsNeeded; i++) {
        if (this.totalConnections < this.maxSize) {
          createPromises.push(this._createConnection().catch(error => {
            console.warn(`Failed to create maintenance connection: ${error.message}`);
            return null;
          }));
        }
      }

      const results = await Promise.allSettled(createPromises);
      const successfulCreations = results.filter(r => r.status === 'fulfilled' && r.value).length;

      if (successfulCreations > 0) {
        console.log(`✅ Successfully created ${successfulCreations}/${connectionsNeeded} maintenance connections`);
      }
    }
  }

  /**
   * Check health of a single connection
   */
  async _checkConnectionHealth(connection) {
    try {
      const startTime = Date.now();
      await connection.client.runQuery('/system/identity/print');
      const responseTime = Date.now() - startTime;

      connection.lastHealthCheck = Date.now();
      connection.healthy = true;
      connection.errorCount = 0;

      this.emit('health-check-passed', {
        connectionId: connection.id,
        responseTime
      });
    } catch (error) {
      connection.errorCount++;
      console.warn(`Health check failed for connection ${connection.id}: ${error.message}`);

      if (connection.errorCount >= 3) {
        console.log(`Marking connection as unhealthy: ${connection.id}`);
        connection.healthy = false;

        // Replace unhealthy connection
        if (this.totalConnections > this.minSize) {
          await this.destroy(connection);
        } else {
          // Try to recreate the connection
          try {
            await this.destroy(connection);
            await this._createConnection();
          } catch (recreateError) {
            console.error(`Failed to recreate connection ${connection.id}:`, recreateError.message);
          }
        }
      }

      this.emit('health-check-failed', {
        connectionId: connection.id,
        error: error.message,
        errorCount: connection.errorCount
      });
    }
  }

  /**
   * Update acquire time statistics
   */
  _updateAcquireTimeStats(acquireTime) {
    const total = this.stats.totalAcquires;
    const current = this.stats.averageAcquireTime;
    this.stats.averageAcquireTime = ((current * (total - 1)) + acquireTime) / total;
  }
}

module.exports = ConnectionPool;