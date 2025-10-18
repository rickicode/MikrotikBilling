const { Pool, Client } = require('pg');
const EventEmitter = require('events');
const CircuitBreaker = require('../services/CircuitBreaker');

/**
 * Advanced Connection Pool Manager
 * Provides enterprise-grade connection pooling with:
 * - Dynamic pool sizing based on load
 * - Connection lifecycle management
 * - Health checks and automatic recovery
 * - Load balancing for read replicas
 * - Circuit breaker pattern
 * - Comprehensive metrics and monitoring
 */
class ConnectionPool extends EventEmitter {
  constructor(databaseConfig, options = {}) {
    super();
    
    this.config = databaseConfig;
    this.options = {
      enableMonitoring: options.enableMonitoring !== false,
      enableCaching: options.enableCaching !== false,
      healthCheckInterval: options.healthCheckInterval || 30000,
      connectionTimeout: options.connectionTimeout || 30000,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      enableCircuitBreaker: options.enableCircuitBreaker !== false,
      circuitBreakerThreshold: options.circuitBreakerThreshold || 5,
      circuitBreakerTimeout: options.circuitBreakerTimeout || 60000,
      ...options
    };
    
    this.pools = new Map();
    this.replicaPools = new Map();
    this.circuitBreakers = new Map();
    this.healthStatus = new Map();
    this.metrics = {
      totalQueries: 0,
      totalConnections: 0,
      activeConnections: 0,
      failedConnections: 0,
      slowQueries: 0,
      averageQueryTime: 0,
      connectionErrors: 0,
      replicaFailovers: 0
    };
    
    this.queryTimes = [];
    this.maxQueryTimeSamples = 1000;
    this.isInitialized = false;
    this.healthCheckTimer = null;
  }
  
  /**
   * Initialize connection pools
   */
  async initialize() {
    try {
      // Create primary pool
      await this.createPool('primary', this.config.config);
      
      // Create read replica pools if configured
      if (this.config.config.replication?.enabled) {
        await this.createReplicaPools();
      }
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      // Setup event listeners
      this.setupEventListeners();
      
      this.isInitialized = true;
      this.emit('initialized', { pools: this.pools.size });
      
      console.log(`Connection pool initialized with ${this.pools.size} pools`);
    } catch (error) {
      console.error('Failed to initialize connection pool:', error);
      throw error;
    }
  }
  
  /**
   * Create a connection pool
   */
  async createPool(name, config) {
    const poolConfig = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: this.config.decryptValue(config.password),
      max: config.pooling?.max || 20,
      min: config.pooling?.min || 5,
      idleTimeoutMillis: config.pooling?.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: this.options.connectionTimeout,
      statement_timeout: config.performance?.statementTimeout || 30000,
      query_timeout: config.performance?.queryTimeout || 30000,
      application_name: `mikrotik_billing_${name}`,
      ...config.ssl
    };
    
    const pool = new Pool(poolConfig);
    
    // Setup pool event listeners
    pool.on('connect', (client) => {
      this.handleConnectionConnect(name, client);
    });
    
    pool.on('acquire', (client) => {
      this.handleConnectionAcquire(name, client);
    });
    
    pool.on('release', (err, client) => {
      this.handleConnectionRelease(name, err, client);
    });
    
    pool.on('remove', (client) => {
      this.handleConnectionRemove(name, client);
    });
    
    pool.on('error', (err, client) => {
      this.handleConnectionError(name, err, client);
    });
    
    // Create circuit breaker for this pool
    if (this.options.enableCircuitBreaker) {
      this.circuitBreakers.set(name, new CircuitBreaker({
        threshold: this.options.circuitBreakerThreshold,
        timeout: this.options.circuitBreakerTimeout,
        onOpen: () => this.handleCircuitBreakerOpen(name),
        onClose: () => this.handleCircuitBreakerClose(name)
      }));
    }
    
    // Test the pool
    await this.testPool(pool);
    
    this.pools.set(name, pool);
    this.healthStatus.set(name, { status: 'healthy', lastCheck: Date.now() });
    
    console.log(`Created connection pool: ${name}`);
    return pool;
  }
  
  /**
   * Create read replica pools
   */
  async createReplicaPools() {
    const replicas = this.config.config.replication.readReplicas;
    
    for (let i = 0; i < replicas.length; i++) {
      const replica = replicas[i];
      const name = `replica_${i}`;
      
      try {
        await this.createPool(name, replica);
        this.replicaPools.set(name, {
          pool: this.pools.get(name),
          config: replica,
          weight: replica.weight || 1,
          healthy: true,
          lastUsed: Date.now()
        });
        
        console.log(`Created read replica pool: ${name} (${replica.host}:${replica.port})`);
      } catch (error) {
        console.error(`Failed to create replica pool ${name}:`, error.message);
        // Continue with other replicas
      }
    }
  }
  
  /**
   * Execute a query with automatic pool selection
   */
  async query(sql, params = [], options = {}) {
    const startTime = Date.now();
    const queryId = this.generateQueryId();
    
    try {
      const {
        operation = 'read',
        timeout = this.config.config.performance?.queryTimeout || 30000,
        retries = this.options.maxRetries,
        useReplica = true,
        requestId
      } = options;
      
      // Select appropriate pool
      const pool = await this.selectPool(operation, useReplica);
      
      // Check circuit breaker
      const circuitBreaker = this.circuitBreakers.get(pool.name);
      if (circuitBreaker && circuitBreaker.isOpen()) {
        throw new Error(`Circuit breaker is open for pool: ${pool.name}`);
      }
      
      // Execute query with retries
      const result = await this.executeWithRetry(pool, sql, params, {
        timeout,
        retries,
        queryId,
        requestId
      });
      
      // Record metrics
      const duration = Date.now() - startTime;
      this.recordQueryMetrics(pool.name, sql, duration, true, null);
      
      this.emit('queryExecuted', {
        queryId,
        pool: pool.name,
        sql: this.sanitizeSql(sql),
        duration,
        rowCount: result.rowCount,
        requestId
      });
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordQueryMetrics('unknown', sql, duration, false, error);
      
      this.emit('queryFailed', {
        queryId,
        sql: this.sanitizeSql(sql),
        duration,
        error: error.message,
        requestId: options.requestId
      });
      
      throw error;
    }
  }
  
  /**
   * Execute a query that returns a single row
   */
  async queryOne(sql, params = [], options = {}) {
    const result = await this.query(sql, params, options);
    return result.rows[0] || null;
  }
  
  /**
   * Execute a query that returns a stream
   */
  async queryStream(sql, params = [], options = {}) {
    const pool = await this.selectPool(options.operation || 'read', options.useReplica !== false);
    const client = await pool.connect();
    
    try {
      const query = client.query(new this.config.config.pg.Query(sql, params));
      
      return {
        stream: query,
        release: () => client.release()
      };
    } catch (error) {
      client.release();
      throw error;
    }
  }
  
  /**
   * Select appropriate pool for operation
   */
  async selectPool(operation, useReplica = true) {
    // Primary pool for write operations
    if (operation === 'write') {
      return { name: 'primary', pool: this.pools.get('primary') };
    }
    
    // Try read replicas for read operations
    if (operation === 'read' && useReplica && this.replicaPools.size > 0) {
      const healthyReplica = this.selectHealthyReplica();
      if (healthyReplica) {
        return { name: healthyReplica.name, pool: healthyReplica.pool };
      }
    }
    
    // Fallback to primary
    return { name: 'primary', pool: this.pools.get('primary') };
  }
  
  /**
   * Select healthy read replica using weighted round-robin
   */
  selectHealthyReplica() {
    const healthyReplicas = Array.from(this.replicaPools.values())
      .filter(replica => replica.healthy);
    
    if (healthyReplicas.length === 0) {
      return null;
    }
    
    // Weighted selection
    const totalWeight = healthyReplicas.reduce((sum, replica) => sum + replica.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const replica of healthyReplicas) {
      random -= replica.weight;
      if (random <= 0) {
        replica.lastUsed = Date.now();
        return replica;
      }
    }
    
    // Fallback to first healthy replica
    return healthyReplicas[0];
  }
  
  /**
   * Execute query with retry logic
   */
  async executeWithRetry(poolInfo, sql, params, options) {
    const { timeout, retries, queryId, requestId } = options;
    let lastError;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const pool = poolInfo.pool;
        
        // Add request context to query
        const contextSql = this.addQueryContext(sql, { queryId, requestId });
        
        const result = await pool.query({
          text: contextSql,
          values: params,
          timeout
        });
        
        // Reset circuit breaker on success
        const circuitBreaker = this.circuitBreakers.get(poolInfo.name);
        if (circuitBreaker) {
          circuitBreaker.recordSuccess();
        }
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        // Record circuit breaker failure
        const circuitBreaker = this.circuitBreakers.get(poolInfo.name);
        if (circuitBreaker) {
          circuitBreaker.recordFailure();
        }
        
        // Log retry attempt
        if (attempt < retries) {
          console.warn(`Query retry ${attempt + 1}/${retries} for pool ${poolInfo.name}:`, error.message);
          await this.delay(this.options.retryDelay * Math.pow(2, attempt)); // Exponential backoff
        }
      }
    }
    
    throw lastError;
  }
  
  /**
   * Test a pool connection
   */
  async testPool(pool) {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1 as health_check');
    } finally {
      client.release();
    }
  }
  
  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthChecks();
    }, this.options.healthCheckInterval);
  }
  
  /**
   * Perform health checks on all pools
   */
  async performHealthChecks() {
    const checkPromises = Array.from(this.pools.entries()).map(async ([name, pool]) => {
      try {
        const startTime = Date.now();
        const result = await pool.query('SELECT 1 as health_check, now() as timestamp');
        const responseTime = Date.now() - startTime;
        
        this.healthStatus.set(name, {
          status: 'healthy',
          lastCheck: Date.now(),
          responseTime,
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount
        });
        
        // Update replica health
        if (name.startsWith('replica_')) {
          const replica = this.replicaPools.get(name);
          if (replica) {
            replica.healthy = true;
          }
        }
        
        this.emit('poolHealthy', { name, responseTime });
        
      } catch (error) {
        this.healthStatus.set(name, {
          status: 'unhealthy',
          lastCheck: Date.now(),
          error: error.message
        });
        
        // Update replica health
        if (name.startsWith('replica_')) {
          const replica = this.replicaPools.get(name);
          if (replica) {
            replica.healthy = false;
          }
        }
        
        this.emit('poolUnhealthy', { name, error: error.message });
      }
    });
    
    await Promise.allSettled(checkPromises);
  }
  
  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Listen to config changes
    this.config.on('configChanged', (newConfig) => {
      this.handleConfigChange(newConfig);
    });
  }
  
  /**
   * Handle connection connect event
   */
  handleConnectionConnect(poolName, client) {
    // Set session parameters
    client.query(`
      SET
        timezone = 'UTC',
        statement_timeout = '${this.config.config.performance?.statementTimeout || 30000}ms',
        idle_in_transaction_session_timeout = '5min',
        lock_timeout = '10s'
    `).catch(err => {
      console.error('Error setting session parameters:', err);
    });
    
    this.metrics.totalConnections++;
    this.metrics.activeConnections++;
    
    this.emit('connectionCreated', { pool: poolName, clientId: client.processID });
  }
  
  /**
   * Handle connection acquire event
   */
  handleConnectionAcquire(poolName, client) {
    client.lastAcquired = Date.now();
    this.emit('connectionAcquired', { pool: poolName, clientId: client.processID });
  }
  
  /**
   * Handle connection release event
   */
  handleConnectionRelease(poolName, err, client) {
    this.metrics.activeConnections--;
    
    if (err) {
      this.metrics.connectionErrors++;
      console.error(`Connection error in pool ${poolName}:`, err);
    }
    
    // Check for long-running connections
    if (client.lastAcquired) {
      const duration = Date.now() - client.lastAcquired;
      if (duration > 30000) { // 30 seconds
        console.warn(`Long-running connection detected in pool ${poolName}: ${duration}ms`);
      }
    }
    
    this.emit('connectionReleased', { 
      pool: poolName, 
      clientId: client.processID, 
      duration: client.lastAcquired ? Date.now() - client.lastAcquired : null,
      error: err?.message
    });
  }
  
  /**
   * Handle connection remove event
   */
  handleConnectionRemove(poolName, client) {
    this.emit('connectionRemoved', { pool: poolName, clientId: client.processID });
  }
  
  /**
   * Handle connection error event
   */
  handleConnectionError(poolName, err, client) {
    this.metrics.failedConnections++;
    this.metrics.connectionErrors++;
    
    console.error(`Pool ${poolName} connection error:`, err);
    
    this.emit('connectionError', { 
      pool: poolName, 
      clientId: client.processID, 
      error: err.message 
    });
  }
  
  /**
   * Handle circuit breaker open event
   */
  handleCircuitBreakerOpen(poolName) {
    console.warn(`Circuit breaker opened for pool: ${poolName}`);
    this.emit('circuitBreakerOpen', { pool: poolName });
  }
  
  /**
   * Handle circuit breaker close event
   */
  handleCircuitBreakerClose(poolName) {
    console.log(`Circuit breaker closed for pool: ${poolName}`);
    this.emit('circuitBreakerClose', { pool: poolName });
  }
  
  /**
   * Handle configuration changes
   */
  async handleConfigChange(newConfig) {
    console.log('Database configuration changed, updating pools...');
    
    // Recreate pools with new configuration
    // This is a simplified implementation - in production, you'd want more graceful handling
    await this.shutdown();
    await this.initialize();
  }
  
  /**
   * Record query metrics
   */
  recordQueryMetrics(poolName, sql, duration, success, error) {
    this.metrics.totalQueries++;
    
    if (!success) {
      this.metrics.failedConnections++;
    }
    
    if (duration > (this.config.config.monitoring?.slowQueryThreshold || 1000)) {
      this.metrics.slowQueries++;
      console.warn(`Slow query detected: ${duration}ms - ${this.sanitizeSql(sql)}`);
    }
    
    // Update average query time
    this.queryTimes.push(duration);
    if (this.queryTimes.length > this.maxQueryTimeSamples) {
      this.queryTimes.shift();
    }
    this.metrics.averageQueryTime = this.queryTimes.reduce((a, b) => a + b, 0) / this.queryTimes.length;
    
    this.emit('metricsUpdated', this.metrics);
  }
  
  /**
   * Get pool statistics
   */
  getStatistics() {
    const poolStats = {};
    
    for (const [name, pool] of this.pools) {
      poolStats[name] = {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
        health: this.healthStatus.get(name),
        circuitBreakerState: this.circuitBreakers.get(name)?.getState()
      };
    }
    
    return {
      pools: poolStats,
      metrics: { ...this.metrics },
      uptime: this.isInitialized ? Date.now() - (this.initTime || Date.now()) : 0
    };
  }
  
  /**
   * Get health status
   */
  async getHealthStatus() {
    await this.performHealthChecks();
    
    const overallHealth = Array.from(this.healthStatus.values())
      .every(status => status.status === 'healthy');
    
    return {
      overall: {
        status: overallHealth ? 'healthy' : 'unhealthy',
        timestamp: Date.now()
      },
      pools: Object.fromEntries(this.healthStatus),
      metrics: this.metrics
    };
  }
  
  /**
   * Utility functions
   */
  generateQueryId() {
    return `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  sanitizeSql(sql) {
    // Remove sensitive data from SQL for logging
    return sql
      .replace(/\b(password\s*=\s*'[^']+')/gi, "password='***'")
      .replace(/\b(token\s*=\s*'[^']+')/gi, "token='***'")
      .replace(/\b(secret\s*=\s*'[^']+')/gi, "secret='***'")
      .substring(0, 200) + (sql.length > 200 ? '...' : '');
  }
  
  addQueryContext(sql, context) {
    // Add context as a comment for query tracking
    const contextStr = Object.entries(context)
      .filter(([key, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ');
    
    return contextStr ? `/* ${contextStr} */ ${sql}` : sql;
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('Shutting down connection pool...');
    
    // Stop health monitoring
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    // Close all pools
    const closePromises = Array.from(this.pools.entries()).map(async ([name, pool]) => {
      try {
        await pool.end();
        console.log(`Pool ${name} closed successfully`);
      } catch (error) {
        console.error(`Error closing pool ${name}:`, error);
      }
    });
    
    await Promise.all(closePromises);
    
    this.pools.clear();
    this.replicaPools.clear();
    this.circuitBreakers.clear();
    this.healthStatus.clear();
    
    this.isInitialized = false;
    this.emit('shutdown');
    
    console.log('Connection pool shutdown complete');
  }
}

module.exports = ConnectionPool;