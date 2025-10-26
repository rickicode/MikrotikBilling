/**
 * Comprehensive Cache Configuration
 * Multi-layer caching system configuration with environment-specific settings
 */

const path = require('path');

const cacheConfig = {
  // Environment detection
  environment: process.env.NODE_ENV || 'development',
  
  // Global cache settings
  global: {
    enabled: process.env.CACHE_ENABLED !== 'false',
    debug: process.env.CACHE_DEBUG === 'true',
    namespace: process.env.CACHE_NAMESPACE || 'mikrotik_billing',
    version: process.env.CACHE_VERSION || 'v1',
    
    // Performance settings
    compression: {
      enabled: process.env.CACHE_COMPRESSION !== 'false',
      threshold: parseInt(process.env.CACHE_COMPRESSION_THRESHOLD) || 1024, // bytes
      algorithm: process.env.CACHE_COMPRESSION_ALGORITHM || 'gzip'
    },
    
    // Encryption settings
    encryption: {
      enabled: process.env.CACHE_ENCRYPTION === 'true',
      algorithm: process.env.CACHE_ENCRYPTION_ALGORITHM || 'aes-256-gcm',
      keyRotationInterval: parseInt(process.env.CACHE_KEY_ROTATION_INTERVAL) || 86400000 // 24 hours
    },
    
    // Monitoring settings
    monitoring: {
      enabled: process.env.CACHE_MONITORING !== 'false',
      metricsInterval: parseInt(process.env.CACHE_METRICS_INTERVAL) || 60000, // 1 minute
      alerting: {
        enabled: process.env.CACHE_ALERTING === 'true',
        thresholds: {
          hitRate: parseFloat(process.env.CACHE_HIT_RATE_THRESHOLD) || 70, // percentage
          memoryUsage: parseFloat(process.env.CACHE_MEMORY_THRESHOLD) || 80, // percentage
          errorRate: parseFloat(process.env.CACHE_ERROR_RATE_THRESHOLD) || 5 // percentage
        }
      }
    }
  },

  // L1 Memory Cache Configuration
  memory: {
    enabled: process.env.MEMORY_CACHE_ENABLED !== 'false',
    maxSize: parseInt(process.env.MEMORY_CACHE_MAX_SIZE) || (process.env.NODE_ENV === 'production' ? 10000 : 1000),
    defaultTTL: parseInt(process.env.MEMORY_CACHE_DEFAULT_TTL) || 300000, // 5 minutes
    cleanupInterval: parseInt(process.env.MEMORY_CACHE_CLEANUP_INTERVAL) || 60000, // 1 minute
    
    // LRU eviction settings
    eviction: {
      strategy: process.env.MEMORY_CACHE_EVICTION_STRATEGY || 'lru', // lru, lfu, fifo
      sampleSize: parseInt(process.env.MEMORY_CACHE_EVICTION_SAMPLE_SIZE) || 10
    },
    
    // Memory limits
    limits: {
      maxMemoryUsage: parseInt(process.env.MEMORY_CACHE_MAX_MEMORY) || 100 * 1024 * 1024, // 100MB
      maxItemSize: parseInt(process.env.MEMORY_CACHE_MAX_ITEM_SIZE) || 1024 * 1024 // 1MB
    },
    
    // Performance optimization
    optimization: {
      asyncCleanup: process.env.MEMORY_CACHE_ASYNC_CLEANUP !== 'false',
      batchOperations: process.env.MEMORY_CACHE_BATCH_OPERATIONS === 'true',
      prefetchEnabled: process.env.MEMORY_CACHE_PREFETCH === 'true',
      prefetchThreshold: parseFloat(process.env.MEMORY_CACHE_PREFETCH_THRESHOLD) || 0.8
    }
  },

  // L2 Redis Cache Configuration
  redis: {
    enabled: process.env.REDIS_ENABLED !== 'false',
    
    // Connection settings
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB) || 0,
      family: parseInt(process.env.REDIS_FAMILY) || 4, // IPv4
      
      // Connection pool settings
      pool: {
        min: parseInt(process.env.REDIS_POOL_MIN) || 5,
        max: parseInt(process.env.REDIS_POOL_MAX) || 20,
        acquireTimeoutMillis: parseInt(process.env.REDIS_ACQUIRE_TIMEOUT) || 30000,
        idleTimeoutMillis: parseInt(process.env.REDIS_IDLE_TIMEOUT) || 30000
      },
      
      // Retry settings
      retry: {
        maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES) || 3,
        retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY) || 100,
        enableOfflineQueue: process.env.REDIS_OFFLINE_QUEUE !== 'false'
      }
    },
    
    // Cluster settings
    cluster: {
      enabled: process.env.REDIS_CLUSTER === 'true',
      nodes: process.env.REDIS_CLUSTER_NODES ? 
        process.env.REDIS_CLUSTER_NODES.split(',').map(node => {
          const [host, port] = node.split(':');
          return { host: host.trim(), port: parseInt(port) || 6379 };
        }) : [],
      
      options: {
        redisOptions: {
          password: process.env.REDIS_PASSWORD,
          maxRetriesPerRequest: 3,
          lazyConnect: true
        },
        enableOfflineQueue: true,
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100
      }
    },
    
    // Sentinel settings
    sentinel: {
      enabled: process.env.REDIS_SENTINEL === 'true',
      sentinels: process.env.REDIS_SENTINELS ? 
        process.env.REDIS_SENTINELS.split(',').map(node => {
          const [host, port] = node.split(':');
          return { host: host.trim(), port: parseInt(port) || 26379 };
        }) : [],
      name: process.env.REDIS_SENTINEL_NAME || 'mymaster',
      password: process.env.REDIS_PASSWORD
    },
    
    // Performance settings
    performance: {
      defaultTTL: parseInt(process.env.REDIS_DEFAULT_TTL) || 1800, // 30 minutes
      maxMemoryPolicy: process.env.REDIS_MAX_MEMORY_POLICY || 'allkeys-lru',
      compression: process.env.REDIS_COMPRESSION === 'true',
      pipeline: {
        enabled: process.env.REDIS_PIPELINE === 'true',
        batchSize: parseInt(process.env.REDIS_PIPELINE_BATCH_SIZE) || 100
      }
    },
    
    // Persistence settings
    persistence: {
      snapshotting: {
        enabled: process.env.REDIS_SNAPSHOTTING !== 'false',
        saveInterval: parseInt(process.env.REDIS_SAVE_INTERVAL) || 900, // 15 minutes
        saveChanges: parseInt(process.env.REDIS_SAVE_CHANGES) || 1
      },
      appendOnlyFile: {
        enabled: process.env.REDIS_AOF === 'true',
        fsyncPolicy: process.env.REDIS_AOF_FSYNC_POLICY || 'everysec'
      }
    }
  },

  // L3 Database Cache Configuration
  database: {
    enabled: process.env.DATABASE_CACHE_ENABLED !== 'false',
    
    // Query result caching
    queryCache: {
      enabled: process.env.QUERY_CACHE_ENABLED !== 'false',
      defaultTTL: parseInt(process.env.QUERY_CACHE_DEFAULT_TTL) || 600, // 10 minutes
      maxResults: parseInt(process.env.QUERY_CACHE_MAX_RESULTS) || 1000,
      maxSize: parseInt(process.env.QUERY_CACHE_MAX_SIZE) || 10000,
      
      // Query patterns to cache
      patterns: process.env.QUERY_CACHE_PATTERNS ? 
        process.env.QUERY_CACHE_PATTERNS.split(',') : [
          'SELECT.*FROM.*customers.*WHERE.*id',
          'SELECT.*FROM.*subscriptions.*WHERE.*customer_id',
          'SELECT.*FROM.*payments.*WHERE.*created_at',
          'SELECT.*FROM.*vouchers.*WHERE.*status',
          'SELECT.*FROM.*pppoe_users.*WHERE.*active'
        ]
    },
    
    // Connection pooling for cache queries
    connectionPool: {
      min: parseInt(process.env.DB_CACHE_POOL_MIN) || 2,
      max: parseInt(process.env.DB_CACHE_POOL_MAX) || 10,
      idleTimeoutMillis: parseInt(process.env.DB_CACHE_IDLE_TIMEOUT) || 30000
    },
    
    // Invalidation strategies
    invalidation: {
      strategy: process.env.DB_CACHE_INVALIDATION_STRATEGY || 'tag-based', // tag-based, time-based, manual
      tags: {
        customers: ['customers:*', 'subscriptions:*'],
        payments: ['payments:*', 'transactions:*'],
        vouchers: ['vouchers:*', 'hotspot_users:*'],
        pppoe: ['pppoe_users:*', 'pppoe_profiles:*'],
        settings: ['settings:*', 'config:*']
      }
    }
  },

  // Cache Warming Configuration
  warming: {
    enabled: process.env.CACHE_WARMING_ENABLED !== 'false',
    
    // Warming strategies
    strategies: {
      onStartup: {
        enabled: process.env.CACHE_WARMING_ON_STARTUP !== 'false',
        delay: parseInt(process.env.CACHE_WARMING_STARTUP_DELAY) || 5000 // 5 seconds
      },
      
      scheduled: {
        enabled: process.env.CACHE_WARMING_SCHEDULED !== 'false',
        interval: process.env.CACHE_WARMING_SCHEDULE || '0 */6 * * *', // Every 6 hours
        timezone: process.env.CACHE_WARMING_TIMEZONE || 'UTC'
      },
      
      predictive: {
        enabled: process.env.CACHE_WARMING_PREDICTIVE === 'true',
        algorithm: process.env.CACHE_WARMING_ALGORITHM || 'frequency-recency',
        lookbackPeriod: parseInt(process.env.CACHE_WARMING_LOOKBACK) || 86400000 // 24 hours
      }
    },
    
    // Data sets to warm
    dataSets: [
      {
        name: 'customer_profiles',
        query: 'SELECT id, name, email, phone FROM customers WHERE active = true',
        keyPrefix: 'customer:profile:',
        ttl: 1800 // 30 minutes
      },
      {
        name: 'subscription_plans',
        query: 'SELECT * FROM subscription_plans WHERE active = true',
        keyPrefix: 'subscription:plan:',
        ttl: 3600 // 1 hour
      },
      {
        name: 'mikrotik_profiles',
        query: 'SELECT * FROM mikrotik_profiles WHERE enabled = true',
        keyPrefix: 'mikrotik:profile:',
        ttl: 600 // 10 minutes
      },
      {
        name: 'system_settings',
        query: 'SELECT * FROM settings WHERE cacheable = true',
        keyPrefix: 'setting:',
        ttl: 7200 // 2 hours
      }
    ],
    
    // Warming performance settings
    performance: {
      batchSize: parseInt(process.env.CACHE_WARMING_BATCH_SIZE) || 50,
      concurrency: parseInt(process.env.CACHE_WARMING_CONCURRENCY) || 3,
      timeout: parseInt(process.env.CACHE_WARMING_TIMEOUT) || 30000 // 30 seconds
    }
  },

  // Cache Invalidation Configuration
  invalidation: {
    enabled: process.env.CACHE_INVALIDATION_ENABLED !== 'false',
    
    // Invalidation strategies
    strategies: {
      immediate: {
        enabled: process.env.CACHE_INVALIDATION_IMMEDIATE !== 'false',
        events: [
          'customer:updated',
          'customer:deleted',
          'subscription:updated',
          'subscription:deleted',
          'payment:completed',
          'voucher:used',
          'pppoe_user:updated'
        ]
      },
      
      delayed: {
        enabled: process.env.CACHE_INVALIDATION_DELAYED === 'true',
        delay: parseInt(process.env.CACHE_INVALIDATION_DELAY) || 5000, // 5 seconds
        batchSize: parseInt(process.env.CACHE_INVALIDATION_BATCH_SIZE) || 10
      },
      
      scheduled: {
        enabled: process.env.CACHE_INVALIDATION_SCHEDULED !== 'false',
        schedule: process.env.CACHE_INVALIDATION_SCHEDULE || '0 2 * * *', // Daily at 2 AM
        patterns: [
          'expired:sessions:*',
          'stale:analytics:*',
          'temp:notifications:*'
        ]
      }
    },
    
    // Tag-based invalidation
    tags: {
      enabled: process.env.CACHE_TAG_INVALIDATION !== 'false',
      separator: process.env.CACHE_TAG_SEPARATOR || ':',
      
      // Tag mappings
      mappings: {
        'customer': ['customer:*', 'subscription:*:customer_*', 'payment:*:customer_*'],
        'subscription': ['subscription:*', 'customer:*:subscriptions'],
        'payment': ['payment:*', 'transaction:*', 'customer:*:payments'],
        'voucher': ['voucher:*', 'hotspot_user:*'],
        'pppoe': ['pppoe_user:*', 'pppoe_profile:*'],
        'settings': ['setting:*', 'config:*', 'system:*']
      }
    },
    
    // Pattern-based invalidation
    patterns: {
      enabled: process.env.CACHE_PATTERN_INVALIDATION !== 'false',
      
      // Common patterns
      commonPatterns: [
        'user:*:sessions',
        'analytics:*:daily',
        'reports:*:temp',
        'cache:*:stale'
      ]
    }
  },

  // Cache Metrics Configuration
  metrics: {
    enabled: process.env.CACHE_METRICS_ENABLED !== 'false',
    
    // Metrics collection
    collection: {
      interval: parseInt(process.env.CACHE_METRICS_INTERVAL) || 60000, // 1 minute
      retention: {
        raw: parseInt(process.env.CACHE_METRICS_RAW_RETENTION) || 3600000, // 1 hour
        aggregated: parseInt(process.env.CACHE_METRICS_AGGREGATED_RETENTION) || 86400000 // 24 hours
      }
    },
    
    // Metrics to track
    tracked: {
      performance: [
        'hit_rate',
        'miss_rate',
        'avg_response_time',
        'throughput',
        'error_rate'
      ],
      usage: [
        'memory_usage',
        'cache_size',
        'evictions',
        'expirations',
        'key_count'
      ],
      operations: [
        'get_operations',
        'set_operations',
        'delete_operations',
        'batch_operations'
      ]
    },
    
    // Alerting thresholds
    thresholds: {
      hitRate: {
        warning: parseFloat(process.env.CACHE_HIT_RATE_WARNING) || 70,
        critical: parseFloat(process.env.CACHE_HIT_RATE_CRITICAL) || 50
      },
      responseTime: {
        warning: parseInt(process.env.CACHE_RESPONSE_TIME_WARNING) || 100, // ms
        critical: parseInt(process.env.CACHE_RESPONSE_TIME_CRITICAL) || 500 // ms
      },
      memoryUsage: {
        warning: parseFloat(process.env.CACHE_MEMORY_WARNING) || 80, // percentage
        critical: parseFloat(process.env.CACHE_MEMORY_CRITICAL) || 95 // percentage
      },
      errorRate: {
        warning: parseFloat(process.env.CACHE_ERROR_RATE_WARNING) || 1, // percentage
        critical: parseFloat(process.env.CACHE_ERROR_RATE_CRITICAL) || 5 // percentage
      }
    },
    
    // Export formats
    export: {
      prometheus: process.env.CACHE_METRICS_PROMETHEUS === 'true',
      json: process.env.CACHE_METRICS_JSON !== 'false',
      csv: process.env.CACHE_METRICS_CSV === 'true'
    }
  },

  // Development and Testing Configuration
  development: {
    enabled: process.env.NODE_ENV !== 'production',
    
    // Development cache settings
    cache: {
      maxSize: 100,
      defaultTTL: 60000, // 1 minute
      debug: true,
      logging: true
    },
    
    // Testing utilities
    testing: {
      autoClear: process.env.CACHE_TEST_AUTO_CLEAR === 'true',
      mockData: process.env.CACHE_TEST_MOCK_DATA === 'true',
      fixtures: path.join(__dirname, '../test/cache-fixtures')
    },
    
    // Development tools
    tools: {
      dashboard: process.env.CACHE_DEV_DASHBOARD === 'true',
      api: process.env.CACHE_DEV_API === 'true',
      visualization: process.env.CACHE_DEV_VISUALIZATION === 'true'
    }
  },

  // Security Configuration
  security: {
    // Access control
    accessControl: {
      enabled: process.env.CACHE_ACCESS_CONTROL === 'true',
      roles: {
        admin: ['read', 'write', 'delete', 'clear', 'config'],
        user: ['read', 'write'],
        readonly: ['read']
      }
    },
    
    // Rate limiting for cache operations
    rateLimiting: {
      enabled: process.env.CACHE_RATE_LIMITING !== 'false',
      windowMs: parseInt(process.env.CACHE_RATE_WINDOW) || 60000, // 1 minute
      maxRequests: parseInt(process.env.CACHE_RATE_MAX_REQUESTS) || 1000
    },
    
    // Audit logging
    audit: {
      enabled: process.env.CACHE_AUDIT_ENABLED === 'true',
      logLevel: process.env.CACHE_AUDIT_LOG_LEVEL || 'info',
      events: [
        'cache:hit',
        'cache:miss',
        'cache:set',
        'cache:delete',
        'cache:clear',
        'cache:invalidation'
      ]
    }
  }
};

// Environment-specific configurations
const environments = {
  development: {
    global: {
      debug: true,
      monitoring: { enabled: false }
    },
    memory: {
      maxSize: 100,
      defaultTTL: 60000
    },
    redis: {
      enabled: false // Use memory cache only in development
    },
    database: {
      queryCache: { enabled: false }
    },
    warming: { enabled: false },
    metrics: { enabled: false }
  },
  
  test: {
    global: {
      debug: true,
      namespace: 'mikrotik_billing_test'
    },
    memory: {
      maxSize: 50,
      defaultTTL: 30000
    },
    redis: {
      enabled: false
    },
    database: {
      queryCache: { enabled: false }
    },
    warming: { enabled: false },
    metrics: { enabled: false }
  },
  
  staging: {
    global: {
      debug: false,
      monitoring: { enabled: true }
    },
    memory: {
      maxSize: 1000,
      defaultTTL: 300000
    },
    redis: {
      enabled: true,
      performance: {
        defaultTTL: 600 // 10 minutes
      }
    },
    database: {
      queryCache: {
        enabled: true,
        defaultTTL: 300 // 5 minutes
      }
    },
    warming: {
      enabled: true,
      strategies: {
        scheduled: { enabled: false }
      }
    }
  },
  
  production: {
    global: {
      debug: false,
      monitoring: { enabled: true },
      encryption: { enabled: true }
    },
    memory: {
      maxSize: 10000,
      defaultTTL: 300000,
      optimization: {
        asyncCleanup: true,
        batchOperations: true,
        prefetchEnabled: true
      }
    },
    redis: {
      enabled: true,
      performance: {
        compression: true,
        pipeline: { enabled: true }
      },
      persistence: {
        snapshotting: { enabled: true },
        appendOnlyFile: { enabled: true }
      }
    },
    database: {
      queryCache: {
        enabled: true,
        defaultTTL: 600
      }
    },
    warming: {
      enabled: true,
      strategies: {
        onStartup: { enabled: true },
        scheduled: { enabled: true },
        predictive: { enabled: true }
      }
    },
    security: {
      accessControl: { enabled: true },
      rateLimiting: { enabled: true },
      audit: { enabled: true }
    }
  }
};

// Apply environment-specific configuration
const environmentConfig = environments[cacheConfig.environment] || {};
const mergedConfig = deepMerge(cacheConfig, environmentConfig);

// Deep merge utility function
function deepMerge(target, source) {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  
  return result;
}

// Configuration validation
function validateConfig(config) {
  const errors = [];
  
  // Validate Redis configuration
  if (config.redis.enabled) {
    if (!config.redis.connection.host) {
      errors.push('Redis host is required when Redis is enabled');
    }
    
    if (!config.redis.connection.port || config.redis.connection.port <= 0) {
      errors.push('Valid Redis port is required when Redis is enabled');
    }
  }
  
  // Validate memory cache configuration
  if (config.memory.maxSize <= 0) {
    errors.push('Memory cache max size must be greater than 0');
  }
  
  if (config.memory.defaultTTL <= 0) {
    errors.push('Memory cache default TTL must be greater than 0');
  }
  
  // Validate database cache configuration
  if (config.database.queryCache.enabled) {
    if (config.database.queryCache.maxSize <= 0) {
      errors.push('Database query cache max size must be greater than 0');
    }
  }
  
  return errors;
}

// Validate the merged configuration
const validationErrors = validateConfig(mergedConfig);
if (validationErrors.length > 0) {
  console.error('Cache configuration validation errors:', validationErrors);
  if (mergedConfig.environment === 'production') {
    throw new Error(`Invalid cache configuration: ${validationErrors.join(', ')}`);
  }
}

module.exports = {
  config: mergedConfig,
  validate: validateConfig,
  environments
};