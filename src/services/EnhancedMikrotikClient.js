/**
 * Enhanced Mikrotik Client with enterprise-grade features
 * Integrates connection pooling, rate limiting, circuit breaker, monitoring, and audit logging
 */
const { RouterOSClient } = require('mikro-routeros');
const ConnectionPool = require('./ConnectionPool');
const LRUCache = require('./LRUCache');
const CircuitBreaker = require('./CircuitBreaker');
const RateLimiter = require('./RateLimiter');
const RequestQueue = require('./RequestQueue');
const ErrorHandler = require('./ErrorHandler');
const InputValidator = require('./InputValidator');
const MonitoringService = require('./MonitoringService');
const AuditLogger = require('./AuditLogger');
const EventEmitter = require('events');

class EnhancedMikrotikClient extends EventEmitter {
  constructor(config = {}, options = {}) {
    super();

    // Configuration
    this.config = {
      host: config.host || '192.168.1.1',
      port: config.port || 8728,
      username: config.username || 'admin',
      password: config.password || '',
      timeout: config.timeout || 30000,
      tls: false, // Mikrotik API doesn't support TLS
      ...config
    };

    // Enhanced features
    this.features = {
      connectionPooling: options.enableConnectionPooling !== false,
      rateLimiting: options.enableRateLimiting !== false,
      circuitBreaker: options.enableCircuitBreaker !== false,
      caching: options.enableCaching !== false,
      monitoring: options.enableMonitoring !== false,
      auditLogging: options.enableAuditLogging !== false,
      validation: options.enableValidation !== false,
      requestQueue: options.enableRequestQueue !== false
    };

    // Database reference (optional)
    this.db = options.database || null;

    // Initialize components
    this.initializeComponents();

    // State
    this.isInitialized = false;
    this.isDestroyed = false;
  }

  /**
   * Initialize all components
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Enhanced Mikrotik Client...');

      // Initialize monitoring first (to track initialization)
      if (this.features.monitoring) {
        this.monitoring = new MonitoringService({
          enableMetrics: true,
          enableHealthChecks: true
        });
      }

      // Initialize audit logging
      if (this.features.auditLogging) {
        this.auditLogger = new AuditLogger({
          enableAuditLogging: true,
          logToFile: true,
          logRetentionDays: 365
        });
      }

      // Initialize connection pool
      if (this.features.connectionPooling) {
        this.connectionPool = new ConnectionPool(this.config, {
          maxSize: options.maxConnections || 5,
          minSize: options.minConnections || 2,
          healthCheckInterval: 30000
        });

        this.connectionPool.on('created', (connectionId) => {
          this.monitorConnectionEvent('created', connectionId);
        });

        this.connectionPool.on('destroyed', (connectionId) => {
          this.monitorConnectionEvent('destroyed', connectionId);
        });
      }

      // Initialize circuit breaker
      if (this.features.circuitBreaker) {
        this.circuitBreaker = new CircuitBreaker({
          failureThreshold: options.circuitBreakerThreshold || 5,
          resetTimeout: options.circuitBreakerTimeout || 60000
        });

        this.circuitBreaker.on('state-change', (data) => {
          this.monitorCircuitBreakerEvent(data);
          this.logAuditEvent('CIRCUIT_BREAKER_STATE_CHANGE', {
            from: data.from,
            to: data.to
          });
        });
      }

      // Initialize rate limiter
      if (this.features.rateLimiting) {
        this.rateLimiter = new RateLimiter({
          bucketSize: options.rateLimitBucketSize || 100,
          refillRate: options.rateLimitRefillRate || 10,
          enablePrioritization: true
        });

        this.rateLimiter.on('rejected', (data) => {
          this.monitorRateLimitEvent('rejected', data);
          this.logAuditEvent('RATE_LIMIT_EXCEEDED', data);
        });
      }

      // Initialize request queue
      if (this.features.requestQueue) {
        this.requestQueue = new RequestQueue({
          maxSize: options.maxQueueSize || 1000,
          enablePrioritization: true,
          maxConcurrency: options.maxConcurrency || 1
        });
      }

      // Initialize cache
      if (this.features.caching) {
        this.cache = new LRUCache(options.cacheSize || 1000, options.cacheTTL || 300000);
      }

      // Initialize error handler
      this.errorHandler = new ErrorHandler({
        enableDetailedLogging: true,
        enableContextCapture: true
      });

      this.errorHandler.on('error', (error) => {
        this.monitorErrorEvent(error);
        this.logAuditEvent('ERROR_OCCURRED', {
          type: error.type,
          severity: error.severity,
          message: error.message
        });
      });

      // Initialize input validator
      if (this.features.validation) {
        this.validator = new InputValidator({
          enableStrictMode: options.strictValidation || false,
          enableXSSProtection: true
        });
      }

      // Test initial connection
      await this.testConnection();

      this.isInitialized = true;
      console.log('✅ Enhanced Mikrotik Client initialized successfully');
      this.logAuditEvent('CLIENT_INITIALIZED', { features: this.features });

      this.emit('initialized');

    } catch (error) {
      console.error('❌ Failed to initialize Enhanced Mikrotik Client:', error);
      this.logAuditEvent('CLIENT_INITIALIZATION_FAILED', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Execute a Mikrotik command with all enhanced features
   */
  async execute(command, params = {}, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Enhanced Mikrotik Client is not initialized');
    }

    if (this.isDestroyed) {
      throw new Error('Enhanced Mikrotik Client has been destroyed');
    }

    const startTime = Date.now();
    const context = {
      command,
      params,
      options,
      startTime,
      requestId: this.generateRequestId()
    };

    try {
      // Validate input
      if (this.features.validation) {
        this.validateCommand(command, params, options);
      }

      // Apply rate limiting
      if (this.features.rateLimiting) {
        await this.applyRateLimit(command, options);
      }

      // Check circuit breaker
      if (this.features.circuitBreaker) {
        return await this.circuitBreaker.execute(
          () => this.executeCommand(command, params, options, context),
          this
        );
      } else {
        return await this.executeCommand(command, params, options, context);
      }

    } catch (error) {
      const enhancedError = this.errorHandler.handleError(error, {
        component: 'EnhancedMikrotikClient',
        operation: 'execute',
        command,
        params,
        requestId: context.requestId
      });

      this.monitorCommandEvent(command, false, Date.now() - startTime, options.priority, enhancedError);
      throw enhancedError;
    }
  }

  /**
   * Execute command with enhanced features
   */
  async executeCommand(command, params, options, context) {
    const startTime = Date.now();

    // Check cache for read operations
    const cacheKey = this.getCacheKey(command, params);
    if (this.features.caching && this.isReadOperation(command)) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.monitorCacheOperation('hit');
        this.logAuditEvent('CACHE_HIT', { command, cacheKey });
        return cached;
      }
      this.monitorCacheOperation('miss');
    }

    // Use request queue if enabled
    if (this.features.requestQueue) {
      return await this.requestQueue.enqueue(
        () => this.performCommand(command, params, context),
        { priority: options.priority || 'normal' }
      );
    } else {
      return await this.performCommand(command, params, context);
    }
  }

  /**
   * Perform the actual Mikrotik command
   */
  async performCommand(command, params, context) {
    let connection;
    const startTime = Date.now();

    try {
      // Acquire connection from pool
      if (this.features.connectionPooling) {
        connection = await this.connectionPool.acquire();
      } else {
        connection = await this.createDirectConnection();
      }

      // Execute command
      const result = await this.executeOnConnection(connection, command, params);

      // Return connection to pool
      if (this.features.connectionPooling) {
        this.connectionPool.release(connection);
      } else {
        await this.closeDirectConnection(connection);
      }

      // Cache result if applicable
      if (this.features.caching && this.isReadOperation(command)) {
        const cacheKey = this.getCacheKey(command, params);
        this.cache.set(cacheKey, result, this.getCacheTTL(command));
      }

      // Monitor success
      const duration = Date.now() - startTime;
      this.monitorCommandEvent(command, true, duration, context.options.priority);
      this.logAuditEvent('COMMAND_EXECUTED', {
        command,
        success: true,
        duration,
        resultCount: Array.isArray(result) ? result.length : 1
      });

      return result;

    } catch (error) {
      // Return connection to pool even on error
      if (this.features.connectionPooling && connection) {
        this.connectionPool.release(connection);
      } else if (connection) {
        try {
          await this.closeDirectConnection(connection);
        } catch (closeError) {
          console.warn('Error closing connection after failure:', closeError.message);
        }
      }

      // Monitor failure
      const duration = Date.now() - startTime;
      this.monitorCommandEvent(command, false, duration, context.options.priority, error);
      this.logAuditEvent('COMMAND_FAILED', {
        command,
        error: error.message,
        duration
      });

      throw error;
    }
  }

  /**
   * Execute command on specific connection
   */
  async executeOnConnection(connection, command, params) {
    // Build and execute command
    const fullCommand = this.buildCommand(command, params);
    const result = await connection.client.runQuery(fullCommand.command, fullCommand.params);

    return result;
  }

  /**
   * Build command with parameters
   */
  buildCommand(command, params) {
    // Validate and sanitize parameters
    const sanitizedParams = { ...params };

    // Remove undefined values
    Object.keys(sanitizedParams).forEach(key => {
      if (sanitizedParams[key] === undefined) {
        delete sanitizedParams[key];
      }
    });

    return {
      command,
      params: sanitizedParams
    };
  }

  /**
   * Test connection
   */
  async testConnection() {
    try {
      const result = await this.execute('/system/identity/print', {}, { priority: 'critical' });
      console.log('✅ Connection test successful');
      this.logAuditEvent('CONNECTION_TEST_SUCCESS');
      return result;
    } catch (error) {
      console.error('❌ Connection test failed:', error.message);
      this.logAuditEvent('CONNECTION_TEST_FAILED', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus() {
    const status = {
      connected: false,
      host: this.config.host,
      port: this.config.port,
      features: this.features,
      initialized: this.isInitialized
    };

    if (this.features.connectionPooling && this.connectionPool) {
      const poolStats = this.connectionPool.getStats();
      status.connected = poolStats.totalConnections > 0;
      status.pool = poolStats;
    }

    if (this.features.circuitBreaker && this.circuitBreaker) {
      status.circuitBreaker = this.circuitBreaker.getState();
    }

    if (this.features.monitoring && this.monitoring) {
      status.monitoring = this.monitoring.getHealth();
    }

    return status;
  }

  /**
   * Get detailed statistics
   */
  getStatistics() {
    const stats = {
      features: this.features,
      uptime: this.isInitialized ? Date.now() - this.startTime : 0
    };

    if (this.features.connectionPooling && this.connectionPool) {
      stats.connectionPool = this.connectionPool.getStats();
    }

    if (this.features.caching && this.cache) {
      stats.cache = this.cache.getStats();
    }

    if (this.features.circuitBreaker && this.circuitBreaker) {
      stats.circuitBreaker = this.circuitBreaker.getStats();
    }

    if (this.features.rateLimiting && this.rateLimiter) {
      stats.rateLimiter = this.rateLimiter.getStats();
    }

    if (this.features.requestQueue && this.requestQueue) {
      stats.requestQueue = this.requestQueue.getStatus();
    }

    if (this.features.monitoring && this.monitoring) {
      stats.monitoring = this.monitoring.getDashboard();
    }

    if (this.features.auditLogging && this.auditLogger) {
      stats.auditLogging = this.auditLogger.getStatus();
    }

    if (this.errorHandler) {
      stats.errorHandler = this.errorHandler.getStats();
    }

    if (this.features.validation && this.validator) {
      stats.validation = this.validator.getStats();
    }

    return stats;
  }

  /**
   * Perform health check
   */
  async performHealthCheck() {
    const health = {
      status: 'healthy',
      checks: {},
      timestamp: Date.now()
    };

    try {
      // Test connection
      await this.testConnection();
      health.checks.connection = { status: 'healthy' };
    } catch (error) {
      health.checks.connection = { status: 'unhealthy', error: error.message };
      health.status = 'degraded';
    }

    // Check circuit breaker
    if (this.features.circuitBreaker && this.circuitBreaker) {
      const cbState = this.circuitBreaker.getState();
      health.checks.circuitBreaker = {
        status: cbState.state === 'CLOSED' ? 'healthy' : 'degraded',
        state: cbState.state
      };
      if (cbState.state !== 'CLOSED') {
        health.status = 'degraded';
      }
    }

    // Check connection pool
    if (this.features.connectionPooling && this.connectionPool) {
      const poolStats = this.connectionPool.getStats();
      health.checks.connectionPool = {
        status: poolStats.healthy ? 'healthy' : 'degraded',
        connections: poolStats.totalConnections,
        active: poolStats.activeConnections
      };
      if (!poolStats.healthy) {
        health.status = 'degraded';
      }
    }

    // Check monitoring health
    if (this.features.monitoring && this.monitoring) {
      const monitoringHealth = this.monitoring.getHealth();
      health.checks.monitoring = {
        status: monitoringHealth.status,
        score: monitoringHealth.score
      };
      if (monitoringHealth.status !== 'healthy') {
        health.status = 'degraded';
      }
    }

    return health;
  }

  /**
   * Load configuration from database
   */
  async loadConfigFromDatabase() {
    if (!this.db) {
      console.warn('No database connection available for loading config');
      return;
    }

    try {
      // This would be implemented with your actual database query method
      // For now, using placeholder logic
      console.log('Loading configuration from database...');

      // Example query implementation would go here
      const settings = {
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        password: this.config.password
      };

      this.config = { ...this.config, ...settings };
      this.logAuditEvent('CONFIG_LOADED_FROM_DB');

    } catch (error) {
      console.error('Error loading config from database:', error);
      this.logAuditEvent('CONFIG_LOAD_FAILED', { error: error.message });
    }
  }

  // Private helper methods

  validateCommand(command, params, options) {
    const commandValidation = this.validator.validate(command, 'command');
    if (commandValidation.errors.length > 0) {
      throw new Error(`Invalid command: ${commandValidation.errors.join(', ')}`);
    }

    for (const [key, value] of Object.entries(params)) {
      const validation = this.validator.validate(value, 'parameter');
      if (validation.errors.length > 0) {
        throw new Error(`Invalid parameter ${key}: ${validation.errors.join(', ')}`);
      }
    }
  }

  async applyRateLimit(command, options) {
    const priority = options.priority || 'normal';
    await this.rateLimiter.execute(
      () => Promise.resolve(),
      { priority }
    );
  }

  isReadOperation(command) {
    return command.includes('/print') || command.includes('/get');
  }

  getCacheKey(command, params) {
    return `${command}:${JSON.stringify(params)}`;
  }

  getCacheTTL(command) {
    // Different TTL for different command types
    if (command.includes('/system/')) return 60000; // 1 minute
    if (command.includes('/user/')) return 30000; // 30 seconds
    return 10000; // 10 seconds default
  }

  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async createDirectConnection() {
    const client = new RouterOSClient(this.config.host, this.config.port, this.config.timeout);
    await client.connect();
    await client.login(this.config.username, this.config.password);
    return { client, type: 'direct' };
  }

  async closeDirectConnection(connection) {
    if (connection.client) {
      await connection.client.close();
    }
  }

  // Monitoring methods
  monitorConnectionEvent(event, connectionId) {
    if (this.monitoring) {
      this.monitoring.recordConnection(event === 'created', 0);
    }
  }

  monitorCircuitBreakerEvent(data) {
    if (this.monitoring) {
      this.monitoring.recordCircuitBreakerEvent('state-change', data.to);
    }
  }

  monitorRateLimitEvent(event, data) {
    if (this.monitoring) {
      this.monitoring.recordRateLimiterEvent(event);
    }
  }

  monitorCacheOperation(type) {
    if (this.monitoring) {
      this.monitoring.recordCacheOperation(type);
    }
  }

  monitorCommandEvent(command, success, duration, priority, error = null) {
    if (this.monitoring) {
      this.monitoring.recordCommand(command, success, duration, priority, error);
    }
  }

  monitorErrorEvent(error) {
    if (this.monitoring) {
      this.monitoring.recordError(error, 'mikrotik_client');
    }
  }

  logAuditEvent(action, details = {}) {
    if (this.auditLogger) {
      this.auditLogger.logSystemOperation(action, {
        ...details,
        component: 'EnhancedMikrotikClient',
        mikrotikHost: this.config.host
      });
    }
  }

  /**
   * Destroy the client and clean up resources
   */
  async destroy() {
    if (this.isDestroyed) return;

    console.log('🛑 Destroying Enhanced Mikrotik Client...');
    this.isDestroyed = true;

    try {
      // Destroy components in reverse order
      if (this.requestQueue) await this.requestQueue.destroy();
      if (this.connectionPool) await this.connectionPool.stop();
      if (this.circuitBreaker) this.circuitBreaker.destroy();
      if (this.rateLimiter) this.rateLimiter.destroy();
      if (this.cache) this.cache.clear();
      if (this.monitoring) this.monitoring.destroy();
      if (this.auditLogger) await this.auditLogger.stop();

      console.log('✅ Enhanced Mikrotik Client destroyed successfully');
      this.logAuditEvent('CLIENT_DESTROYED');

    } catch (error) {
      console.error('Error during client destruction:', error);
    }

    this.removeAllListeners();
  }
}

module.exports = EnhancedMikrotikClient;