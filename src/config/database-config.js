const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Enhanced Database Configuration Manager
 * Provides comprehensive database configuration with:
 * - Environment-specific settings
 * - Dynamic configuration updates
 * - Connection string management
 * - Security and encryption
 * - Cluster configuration support
 */
class DatabaseConfig {
  constructor(options = {}) {
    this.options = {
      environment: process.env.NODE_ENV || 'development',
      configPath: options.configPath || './config/database-config.json',
      encryptionKey: options.encryptionKey || process.env.DB_CONFIG_ENCRYPTION_KEY,
      autoReload: options.autoReload !== false,
      reloadInterval: options.reloadInterval || 60000, // 1 minute
      ...options
    };
    
    this.config = this.loadConfiguration();
    this.watchers = new Map();
    this.lastConfigHash = this.calculateConfigHash();
    
    if (this.options.autoReload) {
      this.startConfigWatcher();
    }
  }
  
  /**
   * Load database configuration from multiple sources
   */
  loadConfiguration() {
    const baseConfig = this.getBaseConfiguration();
    const envConfig = this.getEnvironmentConfiguration();
    const fileConfig = this.getFileConfiguration();
    const clusterConfig = this.getClusterConfiguration();
    
    // Merge configurations in order of precedence
    const config = {
      ...baseConfig,
      ...fileConfig,
      ...envConfig,
      ...clusterConfig,
      
      // Enhanced defaults
      pooling: {
        min: 5,
        max: 50,
        acquireTimeoutMillis: 30000,
        createTimeoutMillis: 30000,
        destroyTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        reapIntervalMillis: 1000,
        createRetryIntervalMillis: 200,
        propagateCreateError: false,
        ...baseConfig.pooling,
        ...fileConfig.pooling,
        ...envConfig.pooling
      },
      
      monitoring: {
        enabled: true,
        slowQueryThreshold: 1000,
        healthCheckInterval: 30000,
        metricsRetentionDays: 7,
        enableQueryLogging: this.options.environment === 'development',
        ...baseConfig.monitoring,
        ...fileConfig.monitoring,
        ...envConfig.monitoring
      },
      
      security: {
        encryption: {
          enabled: this.options.environment === 'production',
          algorithm: 'aes-256-gcm',
          keyRotationDays: 90,
          ...baseConfig.security?.encryption,
          ...fileConfig.security?.encryption,
          ...envConfig.security?.encryption
        },
        
        access: {
          allowedIPs: [],
          maxConnections: 100,
          connectionTimeout: 30000,
          ...baseConfig.security?.access,
          ...fileConfig.security?.access,
          ...envConfig.security?.access
        },
        
        audit: {
          enabled: true,
          logLevel: 'info',
          retentionDays: 30,
          ...baseConfig.security?.audit,
          ...fileConfig.security?.audit,
          ...envConfig.security?.audit
        }
      },
      
      performance: {
        queryTimeout: 30000,
        statementTimeout: 30000,
        idleInTransactionSessionTimeout: 300000,
        lockTimeout: 10000,
        maxPreparedStatements: 1000,
        enableQueryPlanCache: true,
        enableResultCaching: true,
        cacheSize: 1000,
        cacheTTL: 300000, // 5 minutes
        ...baseConfig.performance,
        ...fileConfig.performance,
        ...envConfig.performance
      },
      
      replication: {
        enabled: false,
        readReplicas: [],
        failoverTimeout: 5000,
        healthCheckInterval: 10000,
        maxReplicationLag: 10000, // 10 seconds
        ...baseConfig.replication,
        ...fileConfig.replication,
        ...envConfig.replication
      },
      
      backup: {
        enabled: true,
        schedule: '0 2 * * *', // Daily at 2 AM
        retentionDays: 30,
        compressionEnabled: true,
        encryptionEnabled: this.options.environment === 'production',
        storage: {
          type: 'local', // local, s3, gcs, azure
          path: './backups',
          ...baseConfig.backup?.storage,
          ...fileConfig.backup?.storage,
          ...envConfig.backup?.storage
        },
        ...baseConfig.backup,
        ...fileConfig.backup,
        ...envConfig.backup
      }
    };
    
    // Validate configuration
    this.validateConfiguration(config);
    
    // Process and encrypt sensitive data
    return this.processConfiguration(config);
  }
  
  /**
   * Get base/default configuration
   */
  getBaseConfiguration() {
    return {
      host: 'localhost',
      port: 5432,
      database: 'mikrotik_billing',
      username: 'postgres',
      ssl: false,
      timezone: 'UTC',
      charset: 'utf8'
    };
  }
  
  /**
   * Get configuration from environment variables
   */
  getEnvironmentConfiguration() {
    const config = {};
    
    // Database connection
    if (process.env.DB_HOST) config.host = process.env.DB_HOST;
    if (process.env.DB_PORT) config.port = parseInt(process.env.DB_PORT);
    if (process.env.DB_NAME) config.database = process.env.DB_NAME;
    if (process.env.DB_USER) config.username = process.env.DB_USER;
    if (process.env.DB_PASSWORD) config.password = this.encryptValue(process.env.DB_PASSWORD);
    
    // SSL configuration
    if (process.env.DB_SSL) {
      config.ssl = process.env.DB_SSL === 'true';
      if (process.env.DB_CA_CERT) config.ssl = { ca: process.env.DB_CA_CERT };
    }
    
    // Pool configuration
    if (process.env.DB_POOL_MIN) config.pooling = { min: parseInt(process.env.DB_POOL_MIN) };
    if (process.env.DB_POOL_MAX) config.pooling = { ...config.pooling, max: parseInt(process.env.DB_POOL_MAX) };
    if (process.env.DB_CONNECTION_TIMEOUT) {
      config.pooling = { ...config.pooling, acquireTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) };
    }
    
    // Read replicas
    if (process.env.DB_READ_REPLICA_HOSTS) {
      const replicaHosts = process.env.DB_READ_REPLICA_HOSTS.split(',').map(host => host.trim());
      config.replication = {
        enabled: true,
        readReplicas: replicaHosts.map((host, index) => ({
          host,
          port: process.env[`DB_READ_REPLICA_${index}_PORT`] || 5432,
          database: process.env[`DB_READ_REPLICA_${index}_DB`] || config.database,
          username: process.env[`DB_READ_REPLICA_${index}_USER`] || config.username,
          password: process.env[`DB_READ_REPLICA_${index}_PASS`] 
            ? this.encryptValue(process.env[`DB_READ_REPLICA_${index}_PASS`])
            : config.password,
          weight: parseInt(process.env[`DB_READ_REPLICA_${index}_WEIGHT`] || 1)
        }))
      };
    }
    
    return config;
  }
  
  /**
   * Get configuration from file
   */
  getFileConfiguration() {
    try {
      const configPath = path.resolve(this.options.configPath);
      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(configData);
      }
    } catch (error) {
      console.warn('Failed to load database configuration from file:', error.message);
    }
    return {};
  }
  
  /**
   * Get cluster configuration
   */
  getClusterConfiguration() {
    // Support for database cluster configurations like PostgreSQL Patroni, etc.
    if (process.env.DB_CLUSTER_MODE === 'patroni') {
      return {
        cluster: {
          mode: 'patroni',
          endpoints: process.env.DB_CLUSTER_ENDPOINTS?.split(',') || [],
          checkInterval: parseInt(process.env.DB_CLUSTER_CHECK_INTERVAL) || 5000,
          failoverMode: process.env.DB_CLUSTER_FAILOVER_MODE || 'automatic'
        }
      };
    }
    return {};
  }
  
  /**
   * Validate configuration
   */
  validateConfiguration(config) {
    const required = ['host', 'port', 'database', 'username'];
    const missing = required.filter(key => !config[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required database configuration: ${missing.join(', ')}`);
    }
    
    // Validate port range
    if (config.port < 1 || config.port > 65535) {
      throw new Error('Database port must be between 1 and 65535');
    }
    
    // Validate pool configuration
    if (config.pooling.min < 0 || config.pooling.max < config.pooling.min) {
      throw new Error('Invalid pool configuration: min must be >= 0 and max must be >= min');
    }
    
    // Validate replication configuration
    if (config.replication.enabled && config.replication.readReplicas.length === 0) {
      throw new Error('Replication enabled but no read replicas configured');
    }
  }
  
  /**
   * Process and encrypt sensitive configuration data
   */
  processConfiguration(config) {
    const processed = { ...config };
    
    // Encrypt password if provided in plain text
    if (config.password && !config.password.encrypted) {
      processed.password = this.encryptValue(config.password);
    }
    
    // Encrypt replica passwords
    if (config.replication?.readReplicas) {
      processed.replication.readReplicas = config.replication.readReplicas.map(replica => ({
        ...replica,
        password: replica.password && !replica.password.encrypted 
          ? this.encryptValue(replica.password) 
          : replica.password
      }));
    }
    
    // Add metadata
    processed.metadata = {
      version: '1.0.0',
      environment: this.options.environment,
      lastUpdated: new Date().toISOString(),
      checksum: this.calculateConfigHash(config)
    };
    
    return processed;
  }
  
  /**
   * Encrypt sensitive values
   */
  encryptValue(value) {
    if (!this.options.encryptionKey) {
      return { value, encrypted: false };
    }
    
    try {
      const algorithm = 'aes-256-gcm';
      const key = crypto.scryptSync(this.options.encryptionKey, 'salt', 32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(algorithm, key, iv);
      
      let encrypted = cipher.update(value, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted: true,
        algorithm,
        value: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      };
    } catch (error) {
      console.warn('Failed to encrypt value, storing plain text:', error.message);
      return { value, encrypted: false };
    }
  }
  
  /**
   * Decrypt sensitive values
   */
  decryptValue(encryptedData) {
    if (!encryptedData.encrypted || !this.options.encryptionKey) {
      return encryptedData.value;
    }
    
    try {
      const key = crypto.scryptSync(this.options.encryptionKey, 'salt', 32);
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const authTag = Buffer.from(encryptedData.authTag, 'hex');
      const decipher = crypto.createDecipher(encryptedData.algorithm, key, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encryptedData.value, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Failed to decrypt value:', error.message);
      throw new Error('Decryption failed');
    }
  }
  
  /**
   * Get connection string for database
   */
  getConnectionString(type = 'primary') {
    const config = type === 'replica' ? this.getReplicaConfig() : this.config;
    
    if (!config) {
      throw new Error(`No configuration found for ${type} database`);
    }
    
    const password = config.password ? this.decryptValue(config.password) : '';
    
    let connectionString = `postgresql://${config.username}:${password}@${config.host}:${config.port}/${config.database}`;
    
    // Add SSL options
    if (config.ssl) {
      if (typeof config.ssl === 'object') {
        const sslParams = Object.entries(config.ssl)
          .map(([key, value]) => `${key}=${value}`)
          .join('&');
        connectionString += `?ssl=${sslParams}`;
      } else {
        connectionString += '?ssl=true';
      }
    }
    
    return connectionString;
  }
  
  /**
   * Get configuration for read replica (load balanced)
   */
  getReplicaConfig() {
    if (!this.config.replication.enabled || this.config.replication.readReplicas.length === 0) {
      return null;
    }
    
    // Simple round-robin selection for now
    const replicas = this.config.replication.readReplicas;
    const index = Math.floor(Math.random() * replicas.length);
    return replicas[index];
  }
  
  /**
   * Calculate configuration hash for change detection
   */
  calculateConfigHash(config = this.config) {
    const configString = JSON.stringify(config, Object.keys(config).sort());
    return crypto.createHash('sha256').update(configString).digest('hex');
  }
  
  /**
   * Start configuration file watcher
   */
  startConfigWatcher() {
    if (this.watchers.has('file')) {
      return; // Already watching
    }
    
    const watcher = setInterval(() => {
      try {
        const newConfig = this.loadConfiguration();
        const newHash = this.calculateConfigHash(newConfig);
        
        if (newHash !== this.lastConfigHash) {
          console.log('Database configuration changed, reloading...');
          this.config = newConfig;
          this.lastConfigHash = newHash;
          this.emit('configChanged', this.config);
        }
      } catch (error) {
        console.error('Failed to reload database configuration:', error.message);
      }
    }, this.options.reloadInterval);
    
    this.watchers.set('file', watcher);
  }
  
  /**
   * Stop configuration watching
   */
  stopConfigWatcher() {
    for (const [name, watcher] of this.watchers) {
      clearInterval(watcher);
    }
    this.watchers.clear();
  }
  
  /**
   * Get configuration for specific environment
   */
  getEnvironmentConfig(environment) {
    const envSpecificConfig = {
      development: {
        monitoring: {
          enableQueryLogging: true,
          slowQueryThreshold: 500
        },
        security: {
          encryption: { enabled: false }
        }
      },
      
      test: {
        pooling: {
          min: 1,
          max: 5
        },
        monitoring: {
          enableQueryLogging: false
        },
        security: {
          encryption: { enabled: false }
        }
      },
      
      staging: {
        monitoring: {
          enableQueryLogging: true,
          slowQueryThreshold: 2000
        },
        security: {
          encryption: { enabled: true }
        }
      },
      
      production: {
        pooling: {
          min: 10,
          max: 100,
          acquireTimeoutMillis: 60000
        },
        monitoring: {
          enableQueryLogging: false,
          slowQueryThreshold: 1000
        },
        security: {
          encryption: { enabled: true },
          audit: {
            enabled: true,
            logLevel: 'warn'
          }
        },
        performance: {
          queryTimeout: 60000,
          statementTimeout: 60000
        }
      }
    };
    
    return envSpecificConfig[environment] || {};
  }
  
  /**
   * Export configuration (with sensitive data masked)
   */
  exportConfig(includeSecrets = false) {
    const exported = JSON.parse(JSON.stringify(this.config));
    
    if (!includeSecrets) {
      // Mask sensitive information
      if (exported.password) {
        exported.password = '******';
      }
      
      if (exported.replication?.readReplicas) {
        exported.replication.readReplicas = exported.replication.readReplicas.map(replica => ({
          ...replica,
          password: replica.password ? '******' : undefined
        }));
      }
    }
    
    return exported;
  }
  
  /**
   * Event emitter functionality
   */
  emit(event, data) {
    if (this.listeners && this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in config event listener for ${event}:`, error.message);
        }
      });
    }
  }
  
  on(event, callback) {
    if (!this.listeners) {
      this.listeners = {};
    }
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }
  
  /**
   * Cleanup resources
   */
  destroy() {
    this.stopConfigWatcher();
    this.listeners = {};
  }
}

module.exports = DatabaseConfig;