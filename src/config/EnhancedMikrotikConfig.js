/**
 * Enhanced Mikrotik Configuration Manager
 * Manages configuration for all enhanced features
 */
const fs = require('fs').promises;
const path = require('path');

class EnhancedMikrotikConfig {
  constructor() {
    this.configPath = path.join(__dirname, '../config/enhanced-mikrotik.json');
    this.defaultConfig = {
      // Basic Mikrotik connection
      mikrotik: {
        host: process.env.MIKROTIK_HOST || '192.168.1.1',
        port: parseInt(process.env.MIKROTIK_PORT) || 8728,
        username: process.env.MIKROTIK_USERNAME || 'admin',
        password: process.env.MIKROTIK_PASSWORD || '',
        timeout: parseInt(process.env.MIKROTIK_TIMEOUT) || 30000
      },

      // Connection pooling
      connectionPool: {
        enabled: process.env.ENABLE_CONNECTION_POOLING !== 'false',
        maxConnections: parseInt(process.env.MAX_CONNECTIONS) || 5,
        minConnections: parseInt(process.env.MIN_CONNECTIONS) || 2,
        healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
        acquireTimeout: parseInt(process.env.ACQUIRE_TIMEOUT) || 10000,
        idleTimeout: parseInt(process.env.IDLE_TIMEOUT) || 300000
      },

      // Rate limiting
      rateLimiting: {
        enabled: process.env.ENABLE_RATE_LIMITING !== 'false',
        bucketSize: parseInt(process.env.RATE_LIMIT_BUCKET_SIZE) || 100,
        refillRate: parseInt(process.env.RATE_LIMIT_REFILL_RATE) || 10,
        refillInterval: parseInt(process.env.RATE_LIMIT_REFILL_INTERVAL) || 100,
        maxQueueSize: parseInt(process.env.MAX_RATE_LIMIT_QUEUE) || 1000,
        enablePrioritization: process.env.ENABLE_PRIORITY_QUEUE !== 'false'
      },

      // Circuit breaker
      circuitBreaker: {
        enabled: process.env.ENABLE_CIRCUIT_BREAKER !== 'false',
        failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD) || 5,
        resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT) || 60000,
        monitoringPeriod: parseInt(process.env.CIRCUIT_BREAKER_MONITORING) || 10000
      },

      // Caching
      caching: {
        enabled: process.env.ENABLE_CACHING !== 'false',
        maxSize: parseInt(process.env.CACHE_MAX_SIZE) || 1000,
        defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL) || 300000,
        enableIntegrityChecks: process.env.ENABLE_CACHE_INTEGRITY !== 'false'
      },

      // Request queue
      requestQueue: {
        enabled: process.env.ENABLE_REQUEST_QUEUE !== 'false',
        maxSize: parseInt(process.env.REQUEST_QUEUE_MAX_SIZE) || 1000,
        maxConcurrency: parseInt(process.env.MAX_CONCURRENCY) || 1,
        enablePrioritization: process.env.ENABLE_QUEUE_PRIORITY !== 'false',
        enableBatching: process.env.ENABLE_BATCHING !== 'false',
        batchSize: parseInt(process.env.BATCH_SIZE) || 10
      },

      // Monitoring
      monitoring: {
        enabled: process.env.ENABLE_MONITORING !== 'false',
        healthCheckInterval: parseInt(process.env.MONITORING_HEALTH_CHECK) || 30000,
        metricsRetentionDays: parseInt(process.env.METRICS_RETENTION_DAYS) || 30,
        enablePerformanceTracking: process.env.ENABLE_PERFORMANCE_TRACKING !== 'false'
      },

      // Audit logging
      auditLogging: {
        enabled: process.env.ENABLE_AUDIT_LOGGING !== 'false',
        logToFile: process.env.AUDIT_LOG_TO_FILE !== 'false',
        logToDatabase: process.env.AUDIT_LOG_TO_DB === 'true',
        logRetentionDays: parseInt(process.env.AUDIT_LOG_RETENTION_DAYS) || 365,
        bufferSize: parseInt(process.env.AUDIT_BUFFER_SIZE) || 100,
        flushInterval: parseInt(process.env.AUDIT_FLUSH_INTERVAL) || 5000,
        enableIntegrityChecks: process.env.ENABLE_AUDIT_INTEGRITY !== 'false',
        enableEncryption: process.env.ENABLE_AUDIT_ENCRYPTION === 'true'
      },

      // Input validation
      validation: {
        enabled: process.env.ENABLE_VALIDATION !== 'false',
        strictMode: process.env.STRICT_VALIDATION === 'true',
        enableXSSProtection: process.env.ENABLE_XSS_PROTECTION !== 'false',
        enableSQLInjectionProtection: process.env.ENABLE_SQL_INJECTION_PROTECTION !== 'false',
        maxStringLength: parseInt(process.env.MAX_STRING_LENGTH) || 1000
      },

      // Error handling
      errorHandling: {
        enableDetailedLogging: process.env.ENABLE_DETAILED_ERROR_LOGGING !== 'false',
        enableContextCapture: process.env.ENABLE_ERROR_CONTEXT !== 'false',
        maxErrorHistory: parseInt(process.env.MAX_ERROR_HISTORY) || 1000
      },

      // Security
      security: {
        enableAttackDetection: process.env.ENABLE_ATTACK_DETECTION !== 'false',
        maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
        lockoutDuration: parseInt(process.env.LOCKOUT_DURATION) || 900000, // 15 minutes
        sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 1800000 // 30 minutes
      },

      // Performance tuning
      performance: {
        enableProfiling: process.env.ENABLE_PROFILING === 'true',
        slowQueryThreshold: parseInt(process.env.SLOW_QUERY_THRESHOLD) || 5000,
        enableQueryOptimization: process.env.ENABLE_QUERY_OPTIMIZATION !== 'false'
      }
    };

    this.config = { ...this.defaultConfig };
  }

  /**
   * Load configuration from file and environment
   */
  async loadConfig() {
    try {
      // Load from file if exists
      await this.loadFromFile();

      // Override with environment variables
      this.loadFromEnvironment();

      // Validate configuration
      this.validateConfig();

      return this.config;
    } catch (error) {
      console.error('Error loading enhanced Mikrotik config:', error);
      return this.defaultConfig;
    }
  }

  /**
   * Load configuration from file
   */
  async loadFromFile() {
    try {
      const fileContent = await fs.readFile(this.configPath, 'utf8');
      const fileConfig = JSON.parse(fileContent);

      // Deep merge with default config
      this.config = this.deepMerge(this.defaultConfig, fileConfig);
      console.log('Enhanced Mikrotik configuration loaded from file');
    } catch (error) {
      // File doesn't exist or is invalid, use defaults
      console.log('No valid configuration file found, using defaults');
    }
  }

  /**
   * Load configuration from environment variables
   */
  loadFromEnvironment() {
    // Environment variables are already loaded in constructor
    // This method can be used for runtime environment updates
    console.log('Environment variables loaded');
  }

  /**
   * Save configuration to file
   */
  async saveConfig() {
    try {
      await fs.mkdir(path.dirname(this.configPath), { recursive: true });
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
      console.log('Enhanced Mikrotik configuration saved to file');
    } catch (error) {
      console.error('Error saving configuration:', error);
      throw error;
    }
  }

  /**
   * Get configuration value by path
   */
  get(path) {
    return this.getNestedValue(this.config, path);
  }

  /**
   * Set configuration value by path
   */
  set(path, value) {
    this.setNestedValue(this.config, path, value);
  }

  /**
   * Get Mikrotik connection configuration
   */
  getMikrotikConfig() {
    return this.config.mikrotik;
  }

  /**
   * Get enhanced client options
   */
  getClientOptions() {
    return {
      maxConnections: this.config.connectionPool.maxConnections,
      minConnections: this.config.connectionPool.minConnections,
      healthCheckInterval: this.config.connectionPool.healthCheckInterval,
      enableConnectionPooling: this.config.connectionPool.enabled,
      enableRateLimiting: this.config.rateLimiting.enabled,
      rateLimitBucketSize: this.config.rateLimiting.bucketSize,
      rateLimitRefillRate: this.config.rateLimiting.refillRate,
      enableCircuitBreaker: this.config.circuitBreaker.enabled,
      circuitBreakerThreshold: this.config.circuitBreaker.failureThreshold,
      circuitBreakerTimeout: this.config.circuitBreaker.resetTimeout,
      enableCaching: this.config.caching.enabled,
      cacheSize: this.config.caching.maxSize,
      cacheTTL: this.config.caching.defaultTTL,
      enableMonitoring: this.config.monitoring.enabled,
      enableAuditLogging: this.config.auditLogging.enabled,
      enableValidation: this.config.validation.enabled,
      strictValidation: this.config.validation.strictMode,
      enableRequestQueue: this.config.requestQueue.enabled,
      maxQueueSize: this.config.requestQueue.maxSize,
      maxConcurrency: this.config.requestQueue.maxConcurrency
    };
  }

  /**
   * Update configuration section
   */
  updateSection(section, updates) {
    if (this.config[section]) {
      this.config[section] = { ...this.config[section], ...updates };
      console.log(`Updated ${section} configuration`);
    } else {
      console.warn(`Configuration section '${section}' not found`);
    }
  }

  /**
   * Get all configuration
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * Validate configuration values
   */
  validateConfig() {
    const errors = [];

    // Validate Mikrotik connection
    if (!this.config.mikrotik.host) {
      errors.push('Mikrotik host is required');
    }
    if (!this.config.mikrotik.username) {
      errors.push('Mikrotik username is required');
    }
    if (this.config.mikrotik.port < 1 || this.config.mikrotik.port > 65535) {
      errors.push('Mikrotik port must be between 1 and 65535');
    }

    // Validate connection pool
    if (this.config.connectionPool.minConnections > this.config.connectionPool.maxConnections) {
      errors.push('Minimum connections cannot exceed maximum connections');
    }

    // Validate rate limiting
    if (this.config.rateLimiting.bucketSize < 1) {
      errors.push('Rate limit bucket size must be greater than 0');
    }
    if (this.config.rateLimiting.refillRate < 1) {
      errors.push('Rate limit refill rate must be greater than 0');
    }

    // Validate circuit breaker
    if (this.config.circuitBreaker.failureThreshold < 1) {
      errors.push('Circuit breaker failure threshold must be greater than 0');
    }
    if (this.config.circuitBreaker.resetTimeout < 1000) {
      errors.push('Circuit breaker reset timeout must be at least 1000ms');
    }

    // Validate caching
    if (this.config.caching.maxSize < 1) {
      errors.push('Cache max size must be greater than 0');
    }
    if (this.config.caching.defaultTTL < 1000) {
      errors.push('Cache default TTL must be at least 1000ms');
    }

    // Validate request queue
    if (this.config.requestQueue.maxConcurrency < 1) {
      errors.push('Request queue max concurrency must be greater than 0');
    }

    // Validate audit logging
    if (this.config.auditLogging.logRetentionDays < 1) {
      errors.push('Audit log retention days must be greater than 0');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }

    console.log('Configuration validation passed');
  }

  /**
   * Reset configuration to defaults
   */
  resetToDefaults() {
    this.config = { ...this.defaultConfig };
    console.log('Configuration reset to defaults');
  }

  /**
   * Export configuration for backup
   */
  exportConfig() {
    return {
      config: this.config,
      exportedAt: new Date().toISOString(),
      version: '1.0.0'
    };
  }

  /**
   * Import configuration from backup
   */
  async importConfig(backupData) {
    try {
      if (!backupData.config) {
        throw new Error('Invalid backup data format');
      }

      this.config = backupData.config;
      await this.validateConfig();
      await this.saveConfig();

      console.log('Configuration imported successfully');
    } catch (error) {
      console.error('Error importing configuration:', error);
      throw error;
    }
  }

  /**
   * Get configuration summary
   */
  getSummary() {
    return {
      mikrotik: {
        host: this.config.mikrotik.host,
        port: this.config.mikrotik.port,
        configured: !!(this.config.mikrotik.host && this.config.mikrotik.username)
      },
      features: {
        connectionPooling: this.config.connectionPool.enabled,
        rateLimiting: this.config.rateLimiting.enabled,
        circuitBreaker: this.config.circuitBreaker.enabled,
        caching: this.config.caching.enabled,
        monitoring: this.config.monitoring.enabled,
        auditLogging: this.config.auditLogging.enabled,
        validation: this.config.validation.enabled,
        requestQueue: this.config.requestQueue.enabled
      },
      performance: {
        maxConnections: this.config.connectionPool.maxConnections,
        rateLimitRefillRate: this.config.rateLimiting.refillRate,
        cacheSize: this.config.caching.maxSize,
        maxConcurrency: this.config.requestQueue.maxConcurrency
      },
      security: {
        strictValidation: this.config.validation.strictMode,
        enableXSSProtection: this.config.validation.enableXSSProtection,
        enableAttackDetection: this.config.security.enableAttackDetection
      }
    };
  }

  // Helper methods

  deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current && current[key], obj);
  }

  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      return current[key];
    }, obj);
    target[lastKey] = value;
  }
}

module.exports = EnhancedMikrotikConfig;