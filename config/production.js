/**
 * Production Configuration for Mikrotik Billing System
 *
 * This configuration is optimized for production deployment with
 * high performance, security, and reliability settings
 */

module.exports = {
  // Service identification
  serviceId: 'mikrotik-billing',
  version: '2.0.0',
  environment: 'production',

  // Service Container Configuration
  serviceContainer: {
    enableLogging: true,
    enableMonitoring: true,
    enableCaching: true,
    enableWorkers: true,
    enableQueues: true,
    enableReadReplicas: true,

    // Production-specific settings
    logging: {
      level: 'info',
      enableFileLogging: true,
      enableConsoleLogging: false,
      logRotation: true,
      maxFileSize: '100MB',
      maxFiles: 30
    },

    monitoring: {
      enableMetrics: true,
      enableAlerts: true,
      enableTracing: true,
      metricsInterval: 10000,
      alertThresholds: {
        errorRate: 0.01, // 1%
        responseTime: 1000, // 1 second
        memoryUsage: 0.85, // 85%
        cpuUsage: 0.80 // 80%
      }
    },

    caching: {
      defaultTTL: 600, // 10 minutes
      maxSize: 10000,
      enableCompression: true
    },

    workers: {
      minWorkers: 2,
      maxWorkers: 8,
      workerTimeout: 30000
    },

    queues: {
      concurrency: 10,
      enablePriority: true,
      enableBatching: true,
      batchSize: 50,
      batchTimeout: 1000
    },

    readReplicas: {
      replicas: [
        {
          host: process.env.DB_READ_REPLICA_1_HOST,
          port: process.env.DB_READ_REPLICA_1_PORT,
          database: process.env.DB_READ_REPLICA_1_NAME,
          username: process.env.DB_READ_REPLICA_1_USER,
          password: process.env.DB_READ_REPLICA_1_PASSWORD
        },
        {
          host: process.env.DB_READ_REPLICA_2_HOST,
          port: process.env.DB_READ_REPLICA_2_PORT,
          database: process.env.DB_READ_REPLICA_2_NAME,
          username: process.env.DB_READ_REPLICA_2_USER,
          password: process.env.DB_READ_REPLICA_2_PASSWORD
        }
      ]
    }
  },

  // Distributed Tracing Configuration
  tracing: {
    enableTracing: true,
    sampleRate: 0.1, // 10% sampling in production
    maxSpansPerTrace: 1000,
    enableBaggagePropagation: true,

    // Jaeger/Zipkin configuration
    jaeger: {
      endpoint: process.env.JAEGER_ENDPOINT,
      serviceName: 'mikrotik-billing',
      agentHost: process.env.JAEGER_AGENT_HOST || 'localhost',
      agentPort: process.env.JAEGER_AGENT_PORT || 6831
    }
  },

  // Circuit Breaker Configuration
  circuitBreaker: {
    defaultTimeout: 30000, // 30 seconds
    defaultErrorThresholdPercentage: 50,
    defaultResetTimeout: 60000, // 1 minute
    enableMetrics: true,
    enableAutoRecovery: true,
    healthCheckInterval: 30000, // 30 seconds

    // External service configurations
    services: {
      'mikrotik-api': {
        timeout: 5000,
        errorThresholdPercentage: 30,
        resetTimeout: 30000,
        maxRetries: 3,
        enableHealthCheck: true,
        healthCheckEndpoint: process.env.MIKROTIK_HEALTH_ENDPOINT,
        fallbackFunction: (error) => ({
          cached: true,
          data: { error: 'Mikrotik API unavailable', timestamp: new Date().toISOString() }
        })
      },

      'payment-gateway': {
        timeout: 15000,
        errorThresholdPercentage: 25,
        resetTimeout: 45000,
        maxRetries: 2,
        enableHealthCheck: true,
        healthCheckEndpoint: process.env.PAYMENT_HEALTH_ENDPOINT
      },

      'whatsapp-service': {
        timeout: 10000,
        errorThresholdPercentage: 40,
        resetTimeout: 60000,
        maxRetries: 5,
        enableHealthCheck: false // WhatsApp service has its own health checks
      },

      'database': {
        timeout: 20000,
        errorThresholdPercentage: 20,
        resetTimeout: 30000,
        maxRetries: 3,
        enableHealthCheck: true
      }
    }
  },

  // Queue Service Configuration
  queueService: {
    enableMetrics: true,
    enablePriority: true,
    enableBatching: true,
    enableDeduplication: true,
    enableScheduledJobs: true,

    // Redis configuration
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      db: process.env.REDIS_DB || 0,
      keyPrefix: 'mikrotik_billing:',
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      lazyConnect: true,
      enableOfflineQueue: false,

      // Production-specific settings
      family: 4,
      keepAlive: true,
      connectTimeout: 10000,
      commandTimeout: 5000,
      retryDelayOnClusterDown: 300
    },

    // Queue configurations
    queues: {
      'notifications': {
        concurrency: 10,
        enablePriority: true,
        enableDeduplication: true,
        deduplicationWindow: 300000, // 5 minutes
        maxRetries: 5,
        retryBackoff: 'exponential'
      },

      'payments': {
        concurrency: 5,
        enablePriority: true,
        enableDeduplication: true,
        deduplicationWindow: 600000, // 10 minutes
        maxRetries: 3,
        retryBackoff: 'exponential'
      },

      'reports': {
        concurrency: 2,
        enablePriority: true,
        enableBatching: true,
        batchSize: 20,
        batchTimeout: 5000,
        maxRetries: 2
      },

      'webhooks': {
        concurrency: 15,
        enableDeduplication: true,
        deduplicationWindow: 86400000, // 24 hours
        maxRetries: 7,
        retryBackoff: 'exponential'
      },

      'cleanup': {
        concurrency: 1,
        enablePriority: false,
        enableDeduplication: true,
        deduplicationWindow: 3600000, // 1 hour
        maxRetries: 1
      }
    }
  },

  // Event Bus Configuration
  eventBus: {
    busId: 'mikrotik-billing-events',
    enablePersistence: true,
    enableEventSourcing: true,
    enableRetry: true,
    enableMetrics: true,

    maxEventsInMemory: 10000,
    maxRetries: 5,
    retryDelay: 2000,
    retryBackoff: 'exponential',
    enableBatching: true,
    batchSize: 100,
    batchTimeout: 5000,

    // Event store configuration
    eventStore: {
      tableName: 'event_store',
      enableSnapshots: true,
      snapshotInterval: 1000,
      retentionDays: 90
    }
  },

  // API Gateway Configuration
  apiGateway: {
    gatewayId: 'mikrotik-billing-gateway',
    enableAuthentication: true,
    enableRateLimiting: true,
    enableInputValidation: true,
    enableCORS: true,
    enableRequestSigning: false,

    // Security settings
    securityHeaders: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    },

    // Rate limiting
    defaultRateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 1000,
      blockDuration: 15 * 60 * 1000 // 15 minutes
    },

    // Rate limiting per user type
    rateLimits: {
      'admin': {
        windowMs: 15 * 60 * 1000,
        maxRequests: 5000,
        blockDuration: 5 * 60 * 1000
      },
      'premium': {
        windowMs: 15 * 60 * 1000,
        maxRequests: 2000,
        blockDuration: 10 * 60 * 1000
      },
      'standard': {
        windowMs: 15 * 60 * 1000,
        maxRequests: 1000,
        blockDuration: 15 * 60 * 1000
      }
    },

    // CORS settings
    cors: {
      allowedOrigins: [
        'https://billing.example.com',
        'https://admin.example.com',
        'https://api.example.com'
      ],
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Version'],
      credentials: true,
      maxAge: 86400
    },

    // Caching
    enableCache: true,
    defaultCacheTTL: 300, // 5 minutes
    maxCacheSize: 50000,

    // Monitoring
    enableMetrics: true,
    enableRequestTracing: true,
    slowRequestThreshold: 2000, // 2 seconds
    enableSlowRequestAlerts: true
  },

  // Advanced Monitoring Configuration
  monitoring: {
    serviceId: 'mikrotik-billing-monitor',
    enablePrometheus: true,
    enableCustomMetrics: true,
    enablePerformanceMetrics: true,
    enableBusinessMetrics: true,

    // Prometheus settings
    prometheus: {
      port: 9090,
      path: '/metrics',
      defaultLabels: {
        service: 'mikrotik-billing',
        version: '2.0.0',
        environment: 'production'
      }
    },

    // Metrics collection intervals
    defaultInterval: 10000, // 10 seconds
    performanceInterval: 5000, // 5 seconds
    businessInterval: 60000, // 1 minute

    // Alerting
    enableAlerts: true,
    alertThresholds: {
      errorRate: 0.01, // 1%
      responseTime: 2000, // 2 seconds
      memoryUsage: 0.85, // 85%
      cpuUsage: 0.80, // 80%
      queueDepth: 1000,
      databaseConnections: 0.8
    },

    // Retention
    metricsRetention: 7 * 24 * 60 * 60 * 1000, // 7 days
    logsRetention: 30 * 24 * 60 * 60 * 1000, // 30 days

    // Export
    enableMetricsExport: true,
    metricsPort: 9090,
    metricsPath: '/metrics'
  },

  // Error Handling Configuration
  errorHandler: {
    serviceId: 'mikrotik-billing-error-handler',
    enableLogging: true,
    enableStructuredLogging: true,
    enableErrorTracking: true,
    enableErrorGrouping: true,
    enableStackTrace: true,

    // Log levels
    logLevel: 'warn',
    enableLogRotation: true,
    maxLogSize: 100 * 1024 * 1024, // 100MB
    logRetention: 30 * 24 * 60 * 60 * 1000, // 30 days

    // Error tracking
    enableErrorAlerts: true,
    criticalErrorThreshold: 5, // 5 errors per minute
    errorCooldown: 300000, // 5 minutes

    // Persistence
    enablePersistence: true,
    maxErrorsInMemory: 5000,

    // External integrations
    enableSentry: !!process.env.SENTRY_DSN,
    sentryDsn: process.env.SENTRY_DSN,
    sentryEnvironment: 'production',

    enableSlack: !!process.env.SLACK_WEBHOOK,
    slackWebhook: process.env.SLACK_WEBHOOK,

    enableEmail: !!process.env.EMAIL_CONFIG,
    emailConfig: {
      smtp: {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: true,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      },
      from: process.env.EMAIL_FROM,
      to: process.env.ALERT_EMAIL_TO?.split(',')
    },

    // Performance monitoring
    enablePerformanceMonitoring: true,
    slowOperationThreshold: 3000 // 3 seconds
  },

  // API Versioning Configuration
  versionManager: {
    defaultVersion: 'v1',
    supportedVersions: ['v1', 'v2'],
    deprecatedVersions: [],
    sunsetVersions: [],

    // Versioning strategy
    versioningStrategy: 'header', // 'url', 'header', 'query'
    versionHeader: 'API-Version',
    versionQuery: 'version',

    // Compatibility
    enableBackwardCompatibility: true,
    enableForwardCompatibility: false,
    strictVersionChecking: false,

    // Deprecation
    deprecationWarningPeriod: 90 * 24 * 60 * 60 * 1000, // 90 days
    sunsetPeriod: 180 * 24 * 60 * 60 * 1000, // 180 days

    // Response headers
    includeVersionHeaders: true,
    includeDeprecationHeaders: true,

    // Migration
    enableAutoMigration: false, // Disabled in production
    migrationStrategies: {}
  },

  // Testing Configuration (disabled in production)
  testing: {
    enableUnitTests: false,
    enableIntegrationTests: false,
    enableE2ETests: false,
    enablePerformanceTests: false,
    enableAPITests: false,

    testDirs: {
      unit: 'src/test/unit',
      integration: 'src/test/integration',
      e2e: 'src/test/e2e',
      performance: 'src/test/performance',
      api: 'src/test/api'
    },

    testPattern: '**/*.test.js',
    excludePattern: '**/*.skip.test.js',

    // Execution
    parallel: false,
    maxConcurrency: 2,
    timeout: 30000,
    retries: 0,
    bailOnFailure: true,

    // Reporting
    enableReporting: false,
    reportFormat: ['json'],
    outputDir: 'test-results',
    enableCoverage: false,
    coverageThreshold: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80
    }
  },

  // Database Configuration
  database: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,

    // Connection pool
    pool: {
      min: 5,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      reapIntervalMillis: 1000,
      createTimeoutMillis: 10000,
      destroyTimeoutMillis: 5000
    },

    // SSL
    ssl: process.env.DB_SSL === 'true',
    sslMode: process.env.DB_SSL_MODE || 'require',

    // Logging
    logging: false,
    timezone: 'UTC'
  },

  // Security Configuration
  security: {
    jwt: {
      secret: process.env.JWT_SECRET,
      expiresIn: '24h',
      algorithm: 'HS256',
      issuer: 'mikrotik-billing',
      audience: 'mikrotik-billing-users'
    },

    encryption: {
      algorithm: 'aes-256-gcm',
      key: process.env.ENCRYPTION_KEY,
      ivLength: 16,
      saltLength: 32,
      tagLength: 16
    },

    apiKeys: {
      length: 32,
      prefix: 'mb_',
      expiresIn: 365 * 24 * 60 * 60 * 1000 // 1 year
    },

    rateLimiting: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 100,
      skipSuccessfulRequests: false,
      skipFailedRequests: false
    }
  },

  // Mikrotik Integration Configuration
  mikrotik: {
    // Primary Mikrotik Router
    primary: {
      host: process.env.MIKROTIK_HOST,
      port: process.env.MIKROTIK_PORT || 8728,
      username: process.env.MIKROTIK_USER,
      password: process.env.MIKROTIK_PASSWORD,
      timeout: 10000,
      useSSL: process.env.MIKROTIK_SSL === 'true'
    },

    // Backup Router (for failover)
    backup: {
      host: process.env.MIKROTIK_BACKUP_HOST,
      port: process.env.MIKROTIK_BACKUP_PORT || 8728,
      username: process.env.MIKROTIK_BACKUP_USER,
      password: process.env.MIKROTIK_BACKUP_PASSWORD,
      timeout: 10000,
      useSSL: process.env.MIKROTIK_BACKUP_SSL === 'true'
    },

    // Connection settings
    connectionPool: {
      min: 2,
      max: 10,
      idleTimeoutMillis: 30000,
      acquireTimeoutMillis: 10000,
      createTimeoutMillis: 10000,
      destroyTimeoutMillis: 5000
    },

    // Failover settings
    failover: {
      enabled: true,
      maxRetries: 3,
      retryDelay: 1000,
      healthCheckInterval: 30000,
      healthCheckTimeout: 5000
    },

    // Hotspot settings
    hotspot: {
      defaultProfile: 'default',
      profileCommentMarker: 'VOUCHER_SYSTEM',
      syncInterval: 30000, // 30 seconds
      enableRealTimeSync: true
    },

    // PPPoE settings
    pppoe: {
      defaultProfile: 'default-pppoe',
      profileCommentMarker: 'PPPOE_SYSTEM',
      syncInterval: 30000,
      enableRealTimeSync: true
    }
  },

  // WhatsApp Integration Configuration
  whatsapp: {
    // WhatsApp Web JS settings
    webJS: {
      sessionTimeout: 86400000, // 24 hours
      qrTimeout: 60000, // 1 minute
      reconnectInterval: 10000,
      maxReconnectAttempts: 10
    },

    // Session management
    sessions: {
      storage: 'file', // 'file' or 'database'
      path: './src/.whatsapp-sessions',
      encryption: true,
      backupInterval: 3600000, // 1 hour
      maxSessions: 10
    },

    // Message settings
    messaging: {
      rateLimit: {
        messagesPerSecond: 1,
        messagesPerMinute: 30,
        messagesPerHour: 1000
      },

      queue: {
        enabled: true,
        priority: true,
        retryAttempts: 3,
        retryDelay: 5000
      },

      templates: {
        enableCustomTemplates: true,
        templatesPath: './templates/whatsapp',
        cacheTemplates: true,
        templateCacheSize: 100
      }
    },

    // Multi-session support
    multiSession: {
      enabled: true,
      maxSessions: 5,
      loadBalancing: 'round-robin',
      healthCheck: true,
      healthCheckInterval: 30000
    }
  },

  // Backup Configuration
  backup: {
    enabled: true,

    // Backup schedule
    schedule: {
      database: '0 2 * * *', // Daily at 2 AM
      files: '0 3 * * *', // Daily at 3 AM
      configurations: '0 4 * * 0' // Weekly on Sunday at 4 AM
    },

    // Storage settings
    storage: {
      type: 's3', // 'local', 's3', 'ftp'

      s3: {
        bucket: process.env.AWS_S3_BACKUP_BUCKET,
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        prefix: 'backups/mikrotik-billing'
      },

      local: {
        path: './backups',
        maxSize: '10GB',
        retentionDays: 30
      }
    },

    // Backup types
    types: {
      database: {
        enabled: true,
        compression: true,
        encryption: true,
        retentionDays: 30
      },

      files: {
        enabled: true,
        include: ['logs', 'uploads', 'sessions'],
        compression: true,
        encryption: true,
        retentionDays: 7
      },

      configurations: {
        enabled: true,
        include: ['.env', 'config/*.json'],
        encryption: true,
        retentionDays: 90
      }
    },

    // Verification
    verification: {
      enabled: true,
      testRestore: false, // Disabled in production
      checksum: true,
      integrityCheck: true
    }
  },

  // Logging Configuration
  logging: {
    level: 'info',

    // Loggers configuration
    loggers: {
      application: {
        level: 'info',
        transports: ['file', 'console'],
        format: 'json'
      },

      security: {
        level: 'warn',
        transports: ['file'],
        format: 'json'
      },

      performance: {
        level: 'info',
        transports: ['file'],
        format: 'json'
      },

      business: {
        level: 'info',
        transports: ['file'],
        format: 'json'
      },

      external: {
        level: 'warn',
        transports: ['file'],
        format: 'json'
      }
    },

    // File logging
    file: {
      directory: './logs',
      maxSize: '100MB',
      maxFiles: 30,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true
    },

    // Structured logging
    structured: {
      enabled: true,
      includeTimestamp: true,
      includeLevel: true,
      includeLogger: true,
      includeContext: true,
      includeTraceId: true
    }
  }
};