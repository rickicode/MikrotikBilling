/**
 * Comprehensive Mikrotik Configuration Management
 *
 * This module centralizes all Mikrotik-related configuration settings
 * and provides validation, defaults, and environment-specific overrides.
 */

const path = require('path');

// Base Mikrotik configuration
const baseConfig = {
    // Connection configuration
    connection: {
        // Default connection settings
        host: process.env.MIKROTIK_HOST || '192.168.1.1',
        port: parseInt(process.env.MIKROTIK_PORT) || 8728,
        username: process.env.MIKROTIK_USERNAME || 'admin',
        password: process.env.MIKROTIK_PASSWORD || '',
        ssl: process.env.MIKROTIK_SSL === 'true',
        timeout: parseInt(process.env.MIKROTIK_TIMEOUT) || 30000,
        keepAlive: process.env.MIKROTIK_KEEP_ALIVE !== 'false',
        keepAliveDelay: parseInt(process.env.MIKROTIK_KEEP_ALIVE_DELAY) || 30000,
        maxRetries: parseInt(process.env.MIKROTIK_MAX_RETRIES) || 3,
        retryDelay: parseInt(process.env.MIKROTIK_RETRY_DELAY) || 1000
    },

    // Connection pool settings
    connectionPool: {
        minConnections: parseInt(process.env.MIKROTIK_POOL_MIN) || 2,
        maxConnections: parseInt(process.env.MIKROTIK_POOL_MAX) || 10,
        acquireTimeout: parseInt(process.env.MIKROTIK_POOL_ACQUIRE_TIMEOUT) || 30000,
        idleTimeout: parseInt(process.env.MIKROTIK_POOL_IDLE_TIMEOUT) || 300000,
        maxLifetime: parseInt(process.env.MIKROTIK_POOL_MAX_LIFETIME) || 3600000,
        healthCheckInterval: parseInt(process.env.MIKROTIK_POOL_HEALTH_INTERVAL) || 30000,
        healthCheckTimeout: parseInt(process.env.MIKROTIK_POOL_HEALTH_TIMEOUT) || 5000,
        commandTimeout: parseInt(process.env.MIKROTIK_POOL_COMMAND_TIMEOUT) || 30000,
        batchSize: parseInt(process.env.MIKROTIK_POOL_BATCH_SIZE) || 10,
        compressionThreshold: parseInt(process.env.MIKROTIK_POOL_COMPRESSION_THRESHOLD) || 1024
    },

    // SSL/TLS configuration
    ssl: {
        enabled: process.env.MIKROTIK_SSL_ENABLED === 'true',
        rejectUnauthorized: process.env.MIKROTIK_SSL_REJECT_UNAUTHORIZED !== 'false',
        certFile: process.env.MIKROTIK_SSL_CERT_FILE,
        keyFile: process.env.MIKROTIK_SSL_KEY_FILE,
        caFile: process.env.MIKROTIK_SSL_CA_FILE,
        ciphers: process.env.MIKROTIK_SSL_CIPHERS?.split(',') || [
            'ECDHE-RSA-AES128-GCM-SHA256',
            'ECDHE-RSA-AES256-GCM-SHA384',
            'ECDHE-RSA-AES128-SHA256',
            'ECDHE-RSA-AES256-SHA384'
        ]
    },

    // Load balancer configuration
    loadBalancer: {
        algorithm: process.env.MIKROTIK_LB_ALGORITHM || 'round-robin',
        healthThreshold: parseFloat(process.env.MIKROTIK_LB_HEALTH_THRESHOLD) || 0.8,
        maxResponseTime: parseInt(process.env.MIKROTIK_LB_MAX_RESPONSE_TIME) || 5000,
        maxConnections: parseInt(process.env.MIKROTIK_LB_MAX_CONNECTIONS) || 100,
        enableGeoRouting: process.env.MIKROTIK_LB_GEO_ROUTING === 'true',
        defaultRegion: process.env.MIKROTIK_LB_DEFAULT_REGION || 'global',
        enableAffinity: process.env.MIKROTIK_LB_AFFINITY === 'true',
        affinityTimeout: parseInt(process.env.MIKROTIK_LB_AFFINITY_TIMEOUT) || 3600000,
        affinityKey: process.env.MIKROTIK_LB_AFFINITY_KEY || 'session',
        enablePerformanceRouting: process.env.MIKROTIK_LB_PERFORMANCE_ROUTING !== 'false',
        performanceWindow: parseInt(process.env.MIKROTIK_LB_PERFORMANCE_WINDOW) || 300000,
        weightDecayFactor: parseFloat(process.env.MIKROTIK_LB_WEIGHT_DECAY) || 0.1,
        enableCapacityManagement: process.env.MIKROTIK_LB_CAPACITY_MANAGEMENT !== 'false',
        capacityThreshold: parseFloat(process.env.MIKROTIK_LB_CAPACITY_THRESHOLD) || 0.8,
        enableAdaptiveRouting: process.env.MIKROTIK_LB_ADAPTIVE_ROUTING !== 'false',
        adaptationInterval: parseInt(process.env.MIKROTIK_LB_ADAPTATION_INTERVAL) || 60000
    },

    // Failover configuration
    failover: {
        enabled: process.env.MIKROTIK_FAILOVER_ENABLED !== 'false',
        failoverTimeout: parseInt(process.env.MIKROTIK_FAILOVER_TIMEOUT) || 30000,
        recoveryTimeout: parseInt(process.env.MIKROTIK_FAILOVER_RECOVERY_TIMEOUT) || 60000,
        maxFailoverAttempts: parseInt(process.env.MIKROTIK_FAILOVER_MAX_ATTEMPTS) || 3,
        failbackDelay: parseInt(process.env.MIKROTIK_FAILOVER_FAILBACK_DELAY) || 300000,
        healthCheckInterval: parseInt(process.env.MIKROTIK_FAILOVER_HEALTH_INTERVAL) || 10000,
        failureThreshold: parseInt(process.env.MIKROTIK_FAILOVER_FAILURE_THRESHOLD) || 3,
        recoveryThreshold: parseInt(process.env.MIKROTIK_FAILOVER_RECOVERY_THRESHOLD) || 2,
        minHealthScore: parseFloat(process.env.MIKROTIK_FAILOVER_MIN_HEALTH_SCORE) || 0.3,
        enableQuorum: process.env.MIKROTIK_FAILOVER_QUORUM === 'true',
        quorumSize: parseInt(process.env.MIKROTIK_FAILOVER_QUORUM_SIZE) || 3,
        quorumTimeout: parseInt(process.env.MIKROTIK_FAILOVER_QUORUM_TIMEOUT) || 5000,
        enableGeoFailover: process.env.MIKROTIK_FAILOVER_GEO === 'true',
        failoverStrategy: process.env.MIKROTIK_FAILOVER_STRATEGY || 'health-based',
        failbackStrategy: process.env.MIKROTIK_FAILOVER_FAILBACK_STRATEGY || 'health-based',
        enableRecoveryTesting: process.env.MIKROTIK_FAILOVER_RECOVERY_TESTING !== 'false',
        testCommands: (process.env.MIKROTIK_FAILOVER_TEST_COMMANDS || '/system/resource/print,/interface/print').split(','),
        testTimeout: parseInt(process.env.MIKROTIK_FAILOVER_TEST_TIMEOUT) || 10000
    },

    // Health monitor configuration
    healthMonitor: {
        healthCheckInterval: parseInt(process.env.MIKROTIK_HEALTH_INTERVAL) || 30000,
        performanceCheckInterval: parseInt(process.env.MIKROTIK_HEALTH_PERFORMANCE_INTERVAL) || 60000,
        resourceCheckInterval: parseInt(process.env.MIKROTIK_HEALTH_RESOURCE_INTERVAL) || 120000,
        diagnosticInterval: parseInt(process.env.MIKROTIK_HEALTH_DIAGNOSTIC_INTERVAL) || 300000,
        responseTimeThreshold: parseInt(process.env.MIKROTIK_HEALTH_RESPONSE_THRESHOLD) || 5000,
        cpuThreshold: parseInt(process.env.MIKROTIK_HEALTH_CPU_THRESHOLD) || 80,
        memoryThreshold: parseInt(process.env.MIKROTIK_HEALTH_MEMORY_THRESHOLD) || 85,
        diskThreshold: parseInt(process.env.MIKROTIK_HEALTH_DISK_THRESHOLD) || 90,
        connectionThreshold: parseInt(process.env.MIKROTIK_HEALTH_CONNECTION_THRESHOLD) || 100,
        errorRateThreshold: parseFloat(process.env.MIKROTIK_HEALTH_ERROR_RATE_THRESHOLD) || 0.1,
        responseTimeWeight: parseFloat(process.env.MIKROTIK_HEALTH_RESPONSE_WEIGHT) || 0.25,
        availabilityWeight: parseFloat(process.env.MIKROTIK_HEALTH_AVAILABILITY_WEIGHT) || 0.30,
        resourceWeight: parseFloat(process.env.MIKROTIK_HEALTH_RESOURCE_WEIGHT) || 0.25,
        errorRateWeight: parseFloat(process.env.MIKROTIK_HEALTH_ERROR_WEIGHT) || 0.20,
        historyRetention: parseInt(process.env.MIKROTIK_HEALTH_HISTORY_RETENTION) || 86400000,
        maxHistoryPoints: parseInt(process.env.MIKROTIK_HEALTH_MAX_HISTORY) || 1440,
        enablePredictiveAnalysis: process.env.MIKROTIK_HEALTH_PREDICTIVE !== 'false',
        predictionWindow: parseInt(process.env.MIKROTIK_HEALTH_PREDICTION_WINDOW) || 3600000,
        anomalyThreshold: parseFloat(process.env.MIKROTIK_HEALTH_ANOMALY_THRESHOLD) || 2.0,
        enableAlerting: process.env.MIKROTIK_HEALTH_ALERTING !== 'false',
        alertCooldown: parseInt(process.env.MIKROTIK_HEALTH_ALERT_COOLDOWN) || 300000,
        criticalAlertThreshold: parseFloat(process.env.MIKROTIK_HEALTH_CRITICAL_THRESHOLD) || 0.3,
        warningAlertThreshold: parseFloat(process.env.MIKROTIK_HEALTH_WARNING_THRESHOLD) || 0.6,
        enableDiagnostics: process.env.MIKROTIK_HEALTH_DIAGNOSTICS !== 'false',
        diagnosticTests: (process.env.MIKROTIK_HEALTH_DIAGNOSTIC_TESTS || 'connectivity,api_responsiveness,resource_utilization,service_availability,network_performance').split(',')
    },

    // Command queue configuration
    commandQueue: {
        maxQueueSize: parseInt(process.env.MIKROTIK_QUEUE_MAX_SIZE) || 10000,
        batchSize: parseInt(process.env.MIKROTIK_QUEUE_BATCH_SIZE) || 10,
        batchTimeout: parseInt(process.env.MIKROTIK_QUEUE_BATCH_TIMEOUT) || 1000,
        maxConcurrentBatches: parseInt(process.env.MIKROTIK_QUEUE_MAX_CONCURRENT) || 5,
        enableDeduplication: process.env.MIKROTIK_QUEUE_DEDUPLICATION !== 'false',
        deduplicationWindow: parseInt(process.env.MIKROTIK_QUEUE_DEDUPLICATION_WINDOW) || 30000,
        priorities: {
            critical: 0,
            high: 1,
            normal: 2,
            low: 3,
            background: 4
        },
        defaultPriority: process.env.MIKROTIK_QUEUE_DEFAULT_PRIORITY || 'normal',
        maxRetries: parseInt(process.env.MIKROTIK_QUEUE_MAX_RETRIES) || 3,
        retryDelay: parseInt(process.env.MIKROTIK_QUEUE_RETRY_DELAY) || 1000,
        retryBackoffMultiplier: parseFloat(process.env.MIKROTIK_QUEUE_RETRY_BACKOFF) || 2,
        maxRetryDelay: parseInt(process.env.MIKROTIK_QUEUE_MAX_RETRY_DELAY) || 30000,
        enableRateLimiting: process.env.MIKROTIK_QUEUE_RATE_LIMIT !== 'false',
        commandsPerSecond: parseInt(process.env.MIKROTIK_QUEUE_RATE_LIMIT) || 100,
        burstSize: parseInt(process.env.MIKROTIK_QUEUE_BURST_SIZE) || 200,
        rateLimitWindow: parseInt(process.env.MIKROTIK_QUEUE_RATE_WINDOW) || 1000,
        enableTransactions: process.env.MIKROTIK_QUEUE_TRANSACTIONS !== 'false',
        transactionTimeout: parseInt(process.env.MIKROTIK_QUEUE_TRANSACTION_TIMEOUT) || 30000,
        maxTransactionSize: parseInt(process.env.MIKROTIK_QUEUE_MAX_TRANSACTION) || 50,
        enableScheduling: process.env.MIKROTIK_QUEUE_SCHEDULING !== 'false',
        scheduleCheckInterval: parseInt(process.env.MIKROTIK_QUEUE_SCHEDULE_INTERVAL) || 1000,
        enableMetrics: process.env.MIKROTIK_QUEUE_METRICS !== 'false',
        metricsInterval: parseInt(process.env.MIKROTIK_QUEUE_METRICS_INTERVAL) || 60000
    },

    // Cache configuration
    cache: {
        enableMemoryCache: process.env.MIKROTIK_CACHE_MEMORY !== 'false',
        enableRedisCache: process.env.MIKROTIK_CACHE_REDIS === 'true',
        enableDatabaseCache: process.env.MIKROTIK_CACHE_DATABASE === 'true',
        memoryCacheSize: parseInt(process.env.MIKROTIK_CACHE_MEMORY_SIZE) || 1000,
        memoryCacheMaxAge: parseInt(process.env.MIKROTIK_CACHE_MEMORY_MAX_AGE) || 300000,
        memoryCacheCheckPeriod: parseInt(process.env.MIKROTIK_CACHE_MEMORY_CHECK) || 60000,
        redis: {
            host: process.env.MIKROTIK_CACHE_REDIS_HOST || 'localhost',
            port: parseInt(process.env.MIKROTIK_CACHE_REDIS_PORT) || 6379,
            password: process.env.MIKROTIK_CACHE_REDIS_PASSWORD,
            db: parseInt(process.env.MIKROTIK_CACHE_REDIS_DB) || 0,
            keyPrefix: process.env.MIKROTIK_CACHE_REDIS_PREFIX || 'mikrotik:',
            ttl: parseInt(process.env.MIKROTIK_CACHE_REDIS_TTL) || 3600
        },
        defaultTTL: parseInt(process.env.MIKROTIK_CACHE_DEFAULT_TTL) || 300000,
        ttlSettings: {
            'system:resource': parseInt(process.env.MIKROTIK_CACHE_TTL_SYSTEM) || 3600000,
            'system:identity': parseInt(process.env.MIKROTIK_CACHE_TTL_IDENTITY) || 3600000,
            'system:package': parseInt(process.env.MIKROTIK_CACHE_TTL_PACKAGE) || 1800000,
            'interface:print': parseInt(process.env.MIKROTIK_CACHE_TTL_INTERFACE) || 300000,
            'interface:traffic': parseInt(process.env.MIKROTIK_CACHE_TTL_INTERFACE_TRAFFIC) || 60000,
            'interface:stats': parseInt(process.env.MIKROTIK_CACHE_TTL_INTERFACE_STATS) || 30000,
            'user:active': parseInt(process.env.MIKROTIK_CACHE_TTL_USER_ACTIVE) || 10000,
            'user:print': parseInt(process.env.MIKROTIK_CACHE_TTL_USER_PRINT) || 30000,
            'user:profile': parseInt(process.env.MIKROTIK_CACHE_TTL_USER_PROFILE) || 300000,
            'queue:print': parseInt(process.env.MIKROTIK_CACHE_TTL_QUEUE) || 60000,
            'queue:stats': parseInt(process.env.MIKROTIK_CACHE_TTL_QUEUE_STATS) || 30000,
            'queue:tree': parseInt(process.env.MIKROTIK_CACHE_TTL_QUEUE_TREE) || 300000,
            'route:print': parseInt(process.env.MIKROTIK_CACHE_TTL_ROUTE) || 120000,
            'route:gateway': parseInt(process.env.MIKROTIK_CACHE_TTL_ROUTE_GATEWAY) || 300000,
            'filter:print': parseInt(process.env.MIKROTIK_CACHE_TTL_FILTER) || 600000,
            'nat:print': parseInt(process.env.MIKROTIK_CACHE_TTL_NAT) || 600000,
            'mangle:print': parseInt(process.env.MIKROTIK_CACHE_TTL_MANGLE) || 600000,
            'dhcp:lease': parseInt(process.env.MIKROTIK_CACHE_TTL_DHCP_LEASE) || 30000,
            'dhcp:server': parseInt(process.env.MIKROTIK_CACHE_TTL_DHCP_SERVER) || 300000,
            'wireless:registration': parseInt(process.env.MIKROTIK_CACHE_TTL_WIRELESS_REG) || 15000,
            'wireless:print': parseInt(process.env.MIKROTIK_CACHE_TTL_WIRELESS) || 120000
        },
        enableCacheWarming: process.env.MIKROTIK_CACHE_WARMING !== 'false',
        warmupCommands: (process.env.MIKROTIK_CACHE_WARMUP_COMMANDS || '/system/resource/print,/interface/print,/user/active/print,/queue/simple/print').split(','),
        warmupInterval: parseInt(process.env.MIKROTIK_CACHE_WARMUP_INTERVAL) || 300000,
        enablePredictiveCaching: process.env.MIKROTIK_CACHE_PREDICTIVE !== 'false',
        predictionWindow: parseInt(process.env.MIKROTIK_CACHE_PREDICTION_WINDOW) || 3600000,
        accessPatternTracking: process.env.MIKROTIK_CACHE_PATTERN_TRACKING !== 'false',
        patternAnalysisInterval: parseInt(process.env.MIKROTIK_CACHE_PATTERN_INTERVAL) || 600000,
        enableCompression: process.env.MIKROTIK_CACHE_COMPRESSION !== 'false',
        compressionThreshold: parseInt(process.env.MIKROTIK_CACHE_COMPRESSION_THRESHOLD) || 1024,
        enableEventInvalidation: process.env.MIKROTIK_CACHE_EVENT_INVALIDATION !== 'false',
        invalidationDelay: parseInt(process.env.MIKROTIK_CACHE_INVALIDATION_DELAY) || 1000,
        enableSynchronization: process.env.MIKROTIK_CACHE_SYNC === 'true',
        syncChannel: process.env.MIKROTIK_CACHE_SYNC_CHANNEL || 'mikrotik-cache-sync',
        syncInterval: parseInt(process.env.MIKROTIK_CACHE_SYNC_INTERVAL) || 30000,
        enableAnalytics: process.env.MIKROTIK_CACHE_ANALYTICS !== 'false',
        analyticsInterval: parseInt(process.env.MIKROTIK_CACHE_ANALYTICS_INTERVAL) || 300000
    },

    // Security configuration
    security: {
        defaultAuthMethod: process.env.MIKROTIK_AUTH_METHOD || 'password',
        enableSSHKeyAuth: process.env.MIKROTIK_AUTH_SSH !== 'false',
        enableAPIKeyAuth: process.env.MIKROTIK_AUTH_API_KEY !== 'false',
        enableMFA: process.env.MIKROTIK_AUTH_MFA === 'true',
        sessionTimeout: parseInt(process.env.MIKROTIK_SESSION_TIMEOUT) || 3600000,
        maxSessionDuration: parseInt(process.env.MIKROTIK_SESSION_MAX_DURATION) || 86400000,
        enableEncryption: process.env.MIKROTIK_SECURITY_ENCRYPTION !== 'false',
        encryptionAlgorithm: process.env.MIKROTIK_ENCRYPTION_ALGORITHM || 'aes-256-gcm',
        keyRotationInterval: parseInt(process.env.MIKROTIK_KEY_ROTATION_INTERVAL) || 86400000,
        certificateValidation: process.env.MIKROTIK_CERT_VALIDATION !== 'false',
        enableRateLimiting: process.env.MIKROTIK_SECURITY_RATE_LIMIT !== 'false',
        maxRequestsPerMinute: parseInt(process.env.MIKROTIK_SECURITY_RATE_LIMIT) || 60,
        maxConcurrentSessions: parseInt(process.env.MIKROTIK_SECURITY_MAX_SESSIONS) || 10,
        burstLimit: parseInt(process.env.MIKROTIK_SECURITY_BURST_LIMIT) || 100,
        rateLimitWindow: parseInt(process.env.MIKROTIK_SECURITY_RATE_WINDOW) || 60000,
        enableAccessControl: process.env.MIKROTIK_SECURITY_ACCESS_CONTROL !== 'false',
        defaultRole: process.env.MIKROTIK_DEFAULT_ROLE || 'operator',
        enableIPWhitelisting: process.env.MIKROTIK_IP_WHITELIST === 'true',
        allowedIPs: process.env.MIKROTIK_ALLOWED_IPS?.split(',') || [],
        trustedNetworks: (process.env.MIKROTIK_TRUSTED_NETWORKS || '127.0.0.1/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16').split(','),
        enableAuditLogging: process.env.MIKROTIK_AUDIT_LOGGING !== 'false',
        logLevel: process.env.MIKROTIK_LOG_LEVEL || 'info',
        auditLogRetention: parseInt(process.env.MIKROTIK_AUDIT_LOG_RETENTION) || 7776000000,
        logSensitiveData: process.env.MIKROTIK_LOG_SENSITIVE === 'true',
        enableSecurityMonitoring: process.env.MIKROTIK_SECURITY_MONITORING !== 'false',
        threatDetection: process.env.MIKROTIK_THREAT_DETECTION !== 'false',
        anomalyDetection: process.env.MIKROTIK_ANOMALY_DETECTION !== 'false',
        securityEventRetention: parseInt(process.env.MIKROTIK_SECURITY_EVENT_RETENTION) || 604800000,
        failedLoginThreshold: parseInt(process.env.MIKROTIK_FAILED_LOGIN_THRESHOLD) || 5,
        failedLoginWindow: parseInt(process.env.MIKROTIK_FAILED_LOGIN_WINDOW) || 300000,
        suspiciousActivityThreshold: parseInt(process.env.MIKROTIK_SUSPICIOUS_THRESHOLD) || 10,
        enableCredentialEncryption: process.env.MIKROTIK_CREDENTIAL_ENCRYPTION !== 'false',
        passwordMinLength: parseInt(process.env.MIKROTIK_PASSWORD_MIN_LENGTH) || 12,
        passwordComplexity: {
            requireUppercase: process.env.MIKROTIK_PASSWORD_UPPERCASE !== 'false',
            requireLowercase: process.env.MIKROTIK_PASSWORD_LOWERCASE !== 'false',
            requireNumbers: process.env.MIKROTIK_PASSWORD_NUMBERS !== 'false',
            requireSpecialChars: process.env.MIKROTIK_PASSWORD_SPECIAL !== 'false'
        },
        apiKeyLength: parseInt(process.env.MIKROTIK_API_KEY_LENGTH) || 32,
        apiKeyExpiration: parseInt(process.env.MIKROTIK_API_KEY_EXPIRATION) || 2592000000,
        apiKeyRotationEnabled: process.env.MIKROTIK_API_KEY_ROTATION !== 'false'
    },

    // Service configuration
    service: {
        enableMonitoring: process.env.MIKROTIK_SERVICE_MONITORING !== 'false',
        enableMetrics: process.env.MIKROTIK_SERVICE_METRICS !== 'false',
        enableEvents: process.env.MIKROTIK_SERVICE_EVENTS !== 'false',
        enableLogging: process.env.MIKROTIK_SERVICE_LOGGING !== 'false',
        logLevel: process.env.MIKROTIK_SERVICE_LOG_LEVEL || 'info',
        enableDebug: process.env.MIKROTIK_DEBUG === 'true',
        enableProfiling: process.env.MIKROTIK_PROFILING === 'true',
        maxConcurrentOperations: parseInt(process.env.MIKROTIK_MAX_CONCURRENT) || 100,
        operationTimeout: parseInt(process.env.MIKROTIK_OPERATION_TIMEOUT) || 60000,
        enableHealthChecks: process.env.MIKROTIK_HEALTH_CHECKS !== 'false',
        healthCheckInterval: parseInt(process.env.MIKROTIK_HEALTH_CHECK_INTERVAL) || 30000,
        enableGracefulShutdown: process.env.MIKROTIK_GRACEFUL_SHUTDOWN !== 'false',
        shutdownTimeout: parseInt(process.env.MIKROTIK_SHUTDOWN_TIMEOUT) || 30000
    },

    // Device configuration templates
    deviceTemplates: {
        // RouterOS device configuration
        router: {
            type: 'router',
            defaultPort: 8728,
            sslPort: 8729,
            requiredCommands: [
                '/system/resource/print',
                '/interface/print',
                '/user/active/print'
            ],
            optionalCommands: [
                '/queue/simple/print',
                '/ip/firewall/filter/print',
                '/ip/dhcp-server/lease/print'
            ],
            healthChecks: [
                '/system/resource/print',
                '/interface/print'
            ],
            defaultSettings: {
                enableSSH: true,
                enableAPI: true,
                defaultUser: 'admin'
            }
        },

        // Switch device configuration
        switch: {
            type: 'switch',
            defaultPort: 8728,
            sslPort: 8729,
            requiredCommands: [
                '/interface/ethernet/print',
                '/interface/vlan/print',
                '/system/resource/print'
            ],
            optionalCommands: [
                '/interface/bridge/port/print',
                '/interface/bridge/vlan/print'
            ],
            healthChecks: [
                '/interface/ethernet/print',
                '/system/resource/print'
            ],
            defaultSettings: {
                enableSSH: true,
                enableAPI: true,
                defaultUser: 'admin'
            }
        },

        // Wireless access point configuration
        wireless: {
            type: 'wireless',
            defaultPort: 8728,
            sslPort: 8729,
            requiredCommands: [
                '/interface/wireless/print',
                '/interface/wireless/registration-table/print',
                '/system/resource/print'
            ],
            optionalCommands: [
                '/interface/wireless/security-profiles/print',
                '/caps-man/access-point/print'
            ],
            healthChecks: [
                '/interface/wireless/print',
                '/interface/wireless/registration-table/print'
            ],
            defaultSettings: {
                enableSSH: true,
                enableAPI: true,
                defaultUser: 'admin',
                enableCAPsMAN: false
            }
        }
    },

    // Command configuration
    commands: {
        // System commands
        system: {
            resource: {
                command: '/system/resource/print',
                cacheTTL: 3600000, // 1 hour
                timeout: 10000,
                retry: true,
                critical: false
            },
            identity: {
                command: '/system/identity/print',
                cacheTTL: 3600000, // 1 hour
                timeout: 5000,
                retry: true,
                critical: false
            },
            package: {
                command: '/system/package/print',
                cacheTTL: 1800000, // 30 minutes
                timeout: 15000,
                retry: true,
                critical: false
            }
        },

        // Interface commands
        interface: {
            print: {
                command: '/interface/print',
                cacheTTL: 300000, // 5 minutes
                timeout: 10000,
                retry: true,
                critical: true
            },
            traffic: {
                command: '/interface/traffic/print',
                cacheTTL: 60000, // 1 minute
                timeout: 8000,
                retry: true,
                critical: false
            },
            monitor: {
                command: '/interface/monitor-traffic',
                cacheTTL: 10000, // 10 seconds
                timeout: 5000,
                retry: false,
                critical: false
            }
        },

        // User commands
        user: {
            active: {
                command: '/user/active/print',
                cacheTTL: 10000, // 10 seconds
                timeout: 5000,
                retry: true,
                critical: true
            },
            print: {
                command: '/user/print',
                cacheTTL: 30000, // 30 seconds
                timeout: 8000,
                retry: true,
                critical: false
            },
            add: {
                command: '/user/add',
                cacheTTL: 0, // No caching
                timeout: 10000,
                retry: true,
                critical: true
            },
            remove: {
                command: '/user/remove',
                cacheTTL: 0, // No caching
                timeout: 8000,
                retry: true,
                critical: true
            }
        },

        // Queue commands
        queue: {
            simple: {
                command: '/queue/simple/print',
                cacheTTL: 60000, // 1 minute
                timeout: 10000,
                retry: true,
                critical: false
            },
            tree: {
                command: '/queue/tree/print',
                cacheTTL: 300000, // 5 minutes
                timeout: 12000,
                retry: true,
                critical: false
            },
            add: {
                command: '/queue/simple/add',
                cacheTTL: 0, // No caching
                timeout: 8000,
                retry: true,
                critical: true
            }
        },

        // DHCP commands
        dhcp: {
            lease: {
                command: '/ip/dhcp-server/lease/print',
                cacheTTL: 30000, // 30 seconds
                timeout: 10000,
                retry: true,
                critical: false
            },
            server: {
                command: '/ip/dhcp-server/print',
                cacheTTL: 300000, // 5 minutes
                timeout: 8000,
                retry: true,
                critical: false
            }
        },

        // Firewall commands
        firewall: {
            filter: {
                command: '/ip/firewall/filter/print',
                cacheTTL: 600000, // 10 minutes
                timeout: 15000,
                retry: true,
                critical: false
            },
            nat: {
                command: '/ip/firewall/nat/print',
                cacheTTL: 600000, // 10 minutes
                timeout: 15000,
                retry: true,
                critical: false
            },
            mangle: {
                command: '/ip/firewall/mangle/print',
                cacheTTL: 600000, // 10 minutes
                timeout: 15000,
                retry: true,
                critical: false
            }
        },

        // Wireless commands
        wireless: {
            registration: {
                command: '/interface/wireless/registration-table/print',
                cacheTTL: 15000, // 15 seconds
                timeout: 8000,
                retry: true,
                critical: false
            },
            print: {
                command: '/interface/wireless/print',
                cacheTTL: 120000, // 2 minutes
                timeout: 10000,
                retry: true,
                critical: false
            }
        }
    },

    // Profile configuration for hotspot and PPPoE
    profiles: {
        hotspot: {
            commentMarker: 'VOUCHER_SYSTEM',
            defaultProfiles: [
                '1h-voucher',
                '3h-voucher',
                '1d-voucher',
                '1w-voucher'
            ],
            syncInterval: 30000, // 30 seconds
            enableRealtimeSync: true
        },
        pppoe: {
            commentMarker: 'PPPOE_SYSTEM',
            defaultProfiles: [
                '1mbps',
                '2mbps',
                '5mbps',
                '10mbps'
            ],
            syncInterval: 60000, // 1 minute
            enableRealtimeSync: true
        }
    }
};

// Environment-specific configurations
const environments = {
    development: {
        ...baseConfig,
        service: {
            ...baseConfig.service,
            enableDebug: true,
            enableProfiling: true,
            logLevel: 'debug'
        },
        connectionPool: {
            ...baseConfig.connectionPool,
            minConnections: 1,
            maxConnections: 3
        },
        healthMonitor: {
            ...baseConfig.healthMonitor,
            healthCheckInterval: 10000
        }
    },

    test: {
        ...baseConfig,
        service: {
            ...baseConfig.service,
            enableDebug: true,
            enableLogging: false
        },
        connectionPool: {
            ...baseConfig.connectionPool,
            minConnections: 1,
            maxConnections: 2
        },
        cache: {
            ...baseConfig.cache,
            enableMemoryCache: true,
            enableRedisCache: false,
            enableCacheWarming: false
        }
    },

    staging: {
        ...baseConfig,
        service: {
            ...baseConfig.service,
            enableDebug: false,
            logLevel: 'info'
        },
        connectionPool: {
            ...baseConfig.connectionPool,
            minConnections: 2,
            maxConnections: 5
        },
        healthMonitor: {
            ...baseConfig.healthMonitor,
            enableAlerting: true
        }
    },

    production: {
        ...baseConfig,
        service: {
            ...baseConfig.service,
            enableDebug: false,
            enableProfiling: false,
            logLevel: 'warn',
            enableGracefulShutdown: true,
            shutdownTimeout: 60000
        },
        connectionPool: {
            ...baseConfig.connectionPool,
            minConnections: 5,
            maxConnections: 20
        },
        cache: {
            ...baseConfig.cache,
            enableRedisCache: true,
            enableCacheWarming: true
        },
        security: {
            ...baseConfig.security,
            enableEncryption: true,
            enableAuditLogging: true,
            enableSecurityMonitoring: true,
            sessionTimeout: 1800000, // 30 minutes
            maxRequestsPerMinute: 30
        },
        healthMonitor: {
            ...baseConfig.healthMonitor,
            enableAlerting: true,
            enablePredictiveAnalysis: true
        }
    }
};

// Get current environment
const environment = process.env.NODE_ENV || 'development';

// Merge environment-specific config with base config
const mikrotikConfig = {
    ...baseConfig,
    ...environments[environment],
    environment,
    version: require('../../package.json').version,
    buildTime: new Date().toISOString()
};

// Configuration validation
function validateConfig(config) {
    const errors = [];

    // Validate connection settings
    if (!config.connection.host) {
        errors.push('Mikrotik host is required');
    }

    if (config.connection.port < 1 || config.connection.port > 65535) {
        errors.push('Mikrotik port must be between 1 and 65535');
    }

    // Validate pool settings
    if (config.connectionPool.minConnections > config.connectionPool.maxConnections) {
        errors.push('Minimum connections cannot be greater than maximum connections');
    }

    // Validate SSL settings
    if (config.ssl.enabled) {
        if (config.ssl.certFile && !path.isAbsolute(config.ssl.certFile)) {
            errors.push('SSL certificate file must be an absolute path');
        }
        if (config.ssl.keyFile && !path.isAbsolute(config.ssl.keyFile)) {
            errors.push('SSL key file must be an absolute path');
        }
    }

    // Validate cache settings
    if (config.cache.enableRedisCache && !config.cache.redis.host) {
        errors.push('Redis host is required when Redis cache is enabled');
    }

    // Validate security settings
    if (config.security.sessionTimeout < 60000) {
        errors.push('Session timeout must be at least 1 minute');
    }

    return errors;
}

// Validate the configuration
const validationErrors = validateConfig(mikrotikConfig);

if (validationErrors.length > 0) {
    throw new Error(`Mikrotik configuration validation failed:\n${validationErrors.join('\n')}`);
}

// Export the configuration
module.exports = {
    mikrotikConfig,
    validateConfig,
    environments,
    baseConfig
};