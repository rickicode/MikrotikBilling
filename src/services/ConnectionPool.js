/**
 * Connection Pool for Mikrotik API connections
 * Manages multiple connections with load balancing and failover
 */
const { RouterOSClient } = require('mikro-routeros');
const EventEmitter = require('events');

class ConnectionPool extends EventEmitter {
  constructor(config, options = {}) {
    super();
    this.config = config;
    this.maxSize = options.maxSize || 5;
    this.minSize = options.minSize || 2;
    this.acquireTimeout = options.acquireTimeout || 10000;
    this.idleTimeout = options.idleTimeout || 300000; // 5 minutes
    this.healthCheckInterval = options.healthCheckInterval || 30000; // 30 seconds

    this.pool = [];
    this.waitingQueue = [];
    this.totalConnections = 0;
    this.activeConnections = 0;
    this.index = 0; // For round-robin selection

    // Health check timer
    this.healthCheckTimer = null;

    // Statistics
    this.stats = {
      totalAcquires: 0,
      totalReleases: 0,
      totalCreated: 0,
      totalDestroyed: 0,
      totalTimeouts: 0,
      totalErrors: 0,
      averageAcquireTime: 0,
      peakActiveConnections: 0
    };

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
   * Acquire a connection from the pool
   */
  async acquire() {
    const startTime = Date.now();
    this.stats.totalAcquires++;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waitingQueue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.waitingQueue.splice(index, 1);
        }
        this.stats.totalTimeouts++;
        reject(new Error(`Connection acquire timeout after ${this.acquireTimeout}ms`));
      }, this.acquireTimeout);

      const request = {
        resolve: (connection) => {
          clearTimeout(timeout);
          const acquireTime = Date.now() - startTime;
          this._updateAcquireTimeStats(acquireTime);
          resolve(connection);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      };

      // Try to get an available connection
      const connection = this._getAvailableConnection();
      if (connection) {
        request.resolve(connection);
      } else {
        // Add to waiting queue
        this.waitingQueue.push(request);

        // Try to create a new connection if we haven't reached max size
        if (this.totalConnections < this.maxSize) {
          this._createConnection().catch(error => {
            console.error('Failed to create new connection:', error);
          });
        }
      }
    });
  }

  /**
   * Release a connection back to the pool
   */
  release(connection) {
    this.stats.totalReleases++;

    if (!connection || !connection.inPool) {
      return;
    }

    connection.inUse = false;
    connection.lastUsed = Date.now();
    this.activeConnections--;

    // Process waiting queue
    if (this.waitingQueue.length > 0) {
      const request = this.waitingQueue.shift();
      connection.inUse = true;
      this.activeConnections++;
      request.resolve(connection);
    }

    this.emit('released', connection.id);
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
   * Get pool statistics
   */
  getStats() {
    return {
      ...this.stats,
      totalConnections: this.totalConnections,
      activeConnections: this.activeConnections,
      availableConnections: this.pool.filter(c => !c.inUse).length,
      waitingQueueLength: this.waitingQueue.length,
      poolUtilization: this.totalConnections > 0 ? (this.activeConnections / this.totalConnections) * 100 : 0
    };
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
   * Create a new connection
   */
  async _createConnection() {
    if (this.totalConnections >= this.maxSize) {
      return null;
    }

    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    try {
      const client = new RouterOSClient(
        this.config.host,
        this.config.port,
        this.config.timeout
      );

      // Configure TLS if enabled
      if (this.config.tls && this.config.tls.enable) {
        // Note: This requires the mikro-routeros library to support TLS
        // If not supported, we'll need to use a different approach
        console.warn('TLS support may require additional configuration');
      }

      await client.connect();
      await client.login(this.config.username, this.config.password);

      // Test connection
      await client.runQuery('/system/identity/print');

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
        creationTime: Date.now() - startTime
      };

      this.pool.push(connection);
      this.totalConnections++;
      this.stats.totalCreated++;

      // Process waiting queue if any
      if (this.waitingQueue.length > 0) {
        const request = this.waitingQueue.shift();
        connection.inUse = true;
        this.activeConnections++;
        request.resolve(connection);
      }

      console.log(`Created new connection: ${connectionId} (${connection.creationTime}ms)`);
      this.emit('created', connectionId);

      return connection;
    } catch (error) {
      console.error(`Failed to create connection ${connectionId}:`, error.message);
      this.stats.totalErrors++;
      this.emit('error', error);
      throw error;
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
   * Perform health check on all connections
   */
  async _performHealthCheck() {
    const now = Date.now();
    const healthCheckPromises = [];

    for (const connection of this.pool) {
      // Skip connections that are currently in use
      if (connection.inUse) {
        continue;
      }

      // Check if connection is idle for too long
      if (now - connection.lastUsed > this.idleTimeout && this.totalConnections > this.minSize) {
        console.log(`Removing idle connection: ${connection.id}`);
        healthCheckPromises.push(this.destroy(connection));
        continue;
      }

      // Perform health check
      if (now - connection.lastHealthCheck > this.healthCheckInterval) {
        healthCheckPromises.push(this._checkConnectionHealth(connection));
      }
    }

    await Promise.allSettled(healthCheckPromises);
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