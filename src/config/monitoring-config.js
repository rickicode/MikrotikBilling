/**
 * Comprehensive Monitoring Configuration
 * Central configuration for all monitoring components
 * @version 1.0.0
 * @author Mikrotik Billing System
 */

const config = {
  // General monitoring settings
  enabled: process.env.MONITORING_ENABLED !== 'false',
  environment: process.env.NODE_ENV || 'development',
  debug: process.env.MONITORING_DEBUG === 'true',

  // Metrics Collection Configuration
  metrics: {
    enabled: true,
    collectionInterval: parseInt(process.env.METRICS_COLLECTION_INTERVAL) || 30000, // 30 seconds
    batchSize: parseInt(process.env.METRICS_BATCH_SIZE) || 1000,
    retentionPeriod: parseInt(process.env.METRICS_RETENTION_PERIOD) || 86400000, // 24 hours
    enableRealtime: true,
    enableWorkers: true,
    maxMemoryUsage: parseInt(process.env.METRICS_MAX_MEMORY) || 100 * 1024 * 1024, // 100MB
    exportInterval: parseInt(process.env.METRICS_EXPORT_INTERVAL) || 15000, // 15 seconds
    compressionEnabled: process.env.METRICS_COMPRESSION !== 'false'
  },

  // Prometheus Configuration
  prometheus: {
    enabled: process.env.PROMETHEUS_ENABLED !== 'false',
    port: parseInt(process.env.PROMETHEUS_PORT) || 9090,
    endpoint: process.env.PROMETHEUS_ENDPOINT || '/metrics',
    prefix: process.env.PROMETHEUS_PREFIX || 'mikrotik_billing_',
    collectDefaultMetrics: true,
    collectInterval: parseInt(process.env.PROMETHEUS_COLLECT_INTERVAL) || 15000,
    enableCompression: process.env.PROMETHEUS_COMPRESSION !== 'false',
    maxMetricsSize: parseInt(process.env.PROMETHEUS_MAX_SIZE) || 50 * 1024 * 1024, // 50MB

    // Default labels
    labels: {
      service: 'mikrotik-billing',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      instance: require('os').hostname(),
      region: process.env.AWS_REGION || 'local'
    },

    // Histogram buckets for different metrics
    buckets: {
      duration: [0.001, 0.005, 0.015, 0.05, 0.1, 0.5, 1, 5, 10],
      size: [100, 1000, 10000, 100000, 1000000],
      database: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 5],
      mikrotik: [0.1, 0.5, 1, 2, 5, 10, 30],
      cache: [0.0001, 0.001, 0.01, 0.1, 1],
      payment: [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000]
    }
  },

  // Alert Manager Configuration
  alerts: {
    enabled: process.env.ALERTS_ENABLED !== 'false',
    cooldownPeriod: parseInt(process.env.ALERTS_COOLDOWN) || 300000, // 5 minutes
    maxAlertsPerHour: parseInt(process.env.ALERTS_MAX_PER_HOUR) || 100,
    retentionPeriod: parseInt(process.env.ALERTS_RETENTION) || 86400000, // 24 hours
    aggregationWindow: parseInt(process.env.ALERTS_AGGREGATION_WINDOW) || 60000, // 1 minute
    escalationDelay: parseInt(process.env.ALERTS_ESCALATION_DELAY) || 600000, // 10 minutes
    maxEscalationLevel: parseInt(process.env.ALERTS_MAX_ESCALATION) || 3,
    enableDeduplication: true,
    enableCorrelation: true,
    enableMLDetection: process.env.ALERTS_ML_DETECTION === 'true',

    // Notification channels
    channels: {
      email: {
        enabled: process.env.ALERT_EMAIL_ENABLED === 'true',
        smtp: {
          host: process.env.SMTP_HOST || 'localhost',
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        },
        from: process.env.ALERT_EMAIL_FROM || 'alerts@mikrotik-billing.com',
        to: process.env.ALERT_EMAIL_TO ? process.env.ALERT_EMAIL_TO.split(',') : ['admin@mikrotik-billing.com'],
        templates: {
          subject: '[{{severity}}] {{name}} - Mikrotik Billing Alert',
          body: 'templates/alert-email.html'
        }
      },

      slack: {
        enabled: process.env.ALERT_SLACK_ENABLED === 'true',
        webhookUrl: process.env.SLACK_WEBHOOK_URL,
        channel: process.env.SLACK_CHANNEL || '#alerts',
        username: process.env.SLACK_USERNAME || 'Mikrotik Billing',
        iconEmoji: process.env.SLACK_ICON || ':warning:',
        mentionUsers: process.env.SLACK_MENTION ? process.env.SLACK_MENTION.split(',') : []
      },

      sms: {
        enabled: process.env.ALERT_SMS_ENABLED === 'true',
        provider: process.env.SMS_PROVIDER || 'twilio',
        apiKey: process.env.SMS_API_KEY,
        apiSecret: process.env.SMS_API_SECRET,
        from: process.env.SMS_FROM,
        to: process.env.SMS_TO ? process.env.SMS_TO.split(',') : []
      },

      webhook: {
        enabled: process.env.ALERT_WEBHOOK_ENABLED === 'true',
        url: process.env.ALERT_WEBHOOK_URL,
        method: process.env.ALERT_WEBHOOK_METHOD || 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': process.env.ALERT_WEBHOOK_AUTH || ''
        },
        timeout: parseInt(process.env.ALERT_WEBHOOK_TIMEOUT) || 10000
      },

      pagerduty: {
        enabled: process.env.ALERT_PAGERDUTY_ENABLED === 'true',
        integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY,
        severity: process.env.PAGERDUTY_SEVERITY || 'critical',
        escalationPolicy: process.env.PAGERDUTY_ESCALATION_POLICY
      },

      whatsapp: {
        enabled: process.env.ALERT_WHATSAPP_ENABLED === 'true',
        sessionId: process.env.ALERT_WHATSAPP_SESSION || 'alerts',
        to: process.env.ALERT_WHATSAPP_TO ? process.env.ALERT_WHATSAPP_TO.split(',') : []
      }
    },

    // Alert rules
    rules: [
      {
        name: 'High CPU Usage',
        condition: 'cpu_usage > 80',
        severity: 'warning',
        duration: 300000, // 5 minutes
        channels: ['email', 'slack']
      },
      {
        name: 'High Memory Usage',
        condition: 'memory_usage > 90',
        severity: 'critical',
        duration: 60000, // 1 minute
        channels: ['email', 'slack', 'sms']
      },
      {
        name: 'Database Connection Failed',
        condition: 'database_status != healthy',
        severity: 'critical',
        duration: 0, // Immediate
        channels: ['email', 'slack', 'pagerduty']
      },
      {
        name: 'Mikrotik API Down',
        condition: 'mikrotik_status != healthy',
        severity: 'critical',
        duration: 60000, // 1 minute
        channels: ['email', 'slack', 'pagerduty']
      },
      {
        name: 'WhatsApp Session Disconnected',
        condition: 'whatsapp_status != connected',
        severity: 'warning',
        duration: 300000, // 5 minutes
        channels: ['email', 'slack']
      },
      {
        name: 'Payment Processing Failed',
        condition: 'payment_error_rate > 10',
        severity: 'warning',
        duration: 600000, // 10 minutes
        channels: ['email', 'slack']
      },
      {
        name: 'High Error Rate',
        condition: 'error_rate > 5',
        severity: 'warning',
        duration: 300000, // 5 minutes
        channels: ['email', 'slack']
      },
      {
        name: 'Disk Space Low',
        condition: 'disk_usage > 85',
        severity: 'critical',
        duration: 0, // Immediate
        channels: ['email', 'slack', 'sms']
      }
    ],

    // Alert templates
    templates: {
      email: {
        subject: '[{{severity}}] {{name}} - Mikrotik Billing Alert',
        body: `
          <h2>Alert: {{name}}</h2>
          <p><strong>Severity:</strong> {{severity}}</p>
          <p><strong>Message:</strong> {{message}}</p>
          <p><strong>Time:</strong> {{timestamp}}</p>
          <p><strong>Component:</strong> {{component}}</p>
          {{#if runbook_url}}
          <p><a href="{{runbook_url}}">View Runbook</a></p>
          {{/if}}
          {{#if dashboard_url}}
          <p><a href="{{dashboard_url}}">View Dashboard</a></p>
          {{/if}}
        `
      },
      slack: {
        title: '{{severity}}: {{name}}',
        text: '{{message}}',
        color: '{{#if (eq severity "critical")}}danger{{else if (eq severity "warning")}}warning{{else}}good{{/if}}',
        fields: [
          { title: 'Component', value: '{{component}}', short: true },
          { title: 'Time', value: '{{timestamp}}', short: true },
          { title: 'Severity', value: '{{severity}}', short: true },
          { title: 'Environment', value: '{{environment}}', short: true }
        ],
        actions: [
          { type: 'button', text: 'View Dashboard', url: '{{dashboard_url}}' },
          { type: 'button', text: 'Runbook', url: '{{runbook_url}}' }
        ]
      }
    }
  },

  // Health Check Configuration
  health: {
    enabled: process.env.HEALTH_CHECKS_ENABLED !== 'false',
    checkInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000, // 30 seconds
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000, // 5 seconds
    retries: parseInt(process.env.HEALTH_CHECK_RETRIES) || 3,
    retryDelay: parseInt(process.env.HEALTH_CHECK_RETRY_DELAY) || 1000, // 1 second
    enableDependencyTracking: true,
    enableCircuitBreaker: true,
    enableAutoRecovery: process.env.HEALTH_AUTO_RECOVERY === 'true',
    historyRetention: parseInt(process.env.HEALTH_HISTORY_RETENTION) || 86400000, // 24 hours
    criticalThreshold: parseFloat(process.env.HEALTH_CRITICAL_THRESHOLD) || 0.8, // 80%
    warningThreshold: parseFloat(process.env.HEALTH_WARNING_THRESHOLD) || 0.6, // 60%

    // Custom health checks
    customChecks: [
      {
        id: 'payment-gateway',
        name: 'Payment Gateway Health',
        description: 'Check payment gateway connectivity',
        critical: true,
        timeout: 10000,
        interval: 60000,
        endpoint: process.env.PAYMENT_GATEWAY_HEALTH_URL,
        expectedStatus: 200
      },
      {
        id: 'mikrotik-devices',
        name: 'Mikrotik Devices',
        description: 'Check connectivity to all Mikrotik devices',
        critical: true,
        timeout: 15000,
        interval: 60000,
        devices: process.env.MIKROTIK_DEVICES ? process.env.MIKROTIK_DEVICES.split(',') : []
      }
    ]
  },

  // Dashboard Configuration
  dashboard: {
    enabled: process.env.DASHBOARD_ENABLED !== 'false',
    port: parseInt(process.env.DASHBOARD_PORT) || 3001,
    enableWebSocket: true,
    enableRealtime: true,
    updateInterval: parseInt(process.env.DASHBOARD_UPDATE_INTERVAL) || 5000, // 5 seconds
    cacheTimeout: parseInt(process.env.DASHBOARD_CACHE_TIMEOUT) || 10000, // 10 seconds
    maxConnections: parseInt(process.env.DASHBOARD_MAX_CONNECTIONS) || 100,
    enableCompression: process.env.DASHBOARD_COMPRESSION !== 'false',
    retentionPeriod: parseInt(process.env.DASHBOARD_RETENTION) || 3600000, // 1 hour

    // Aggregation windows
    aggregationWindows: {
      '1m': 60000,
      '5m': 300000,
      '15m': 900000,
      '1h': 3600000,
      '1d': 86400000
    },

    // Dashboard definitions
    dashboards: {
      'system-overview': {
        name: 'System Overview',
        description: 'Overall system health and performance',
        refreshInterval: 5000,
        panels: [
          { id: 'cpu-usage', type: 'gauge', title: 'CPU Usage' },
          { id: 'memory-usage', type: 'gauge', title: 'Memory Usage' },
          { id: 'active-users', type: 'stat', title: 'Active Users' },
          { id: 'request-rate', type: 'graph', title: 'Request Rate' }
        ]
      },
      'business-metrics': {
        name: 'Business Metrics',
        description: 'Business KPIs and revenue tracking',
        refreshInterval: 10000,
        panels: [
          { id: 'revenue', type: 'stat', title: 'Daily Revenue' },
          { id: 'customers', type: 'stat', title: 'Total Customers' },
          { id: 'vouchers-sold', type: 'stat', title: 'Vouchers Sold' },
          { id: 'payment-success-rate', type: 'gauge', title: 'Payment Success Rate' }
        ]
      },
      'application-performance': {
        name: 'Application Performance',
        description: 'Application performance metrics',
        refreshInterval: 5000,
        panels: [
          { id: 'response-time', type: 'graph', title: 'Response Time' },
          { id: 'error-rate', type: 'graph', title: 'Error Rate' },
          { id: 'throughput', type: 'graph', title: 'Throughput' },
          { id: 'database-queries', type: 'graph', title: 'Database Queries' }
        ]
      }
    }
  },

  // Performance Profiling Configuration
  performance: {
    enabled: process.env.PERFORMANCE_PROFILING_ENABLED === 'true',
    profilingInterval: parseInt(process.env.PROFILING_INTERVAL) || 60000, // 1 minute
    maxProfileDuration: parseInt(process.env.MAX_PROFILE_DURATION) || 300000, // 5 minutes
    enableCpuProfiling: process.env.ENABLE_CPU_PROFILING === 'true',
    enableMemoryProfiling: process.env.ENABLE_MEMORY_PROFILING === 'true',
    enableHeapProfiling: process.env.ENABLE_HEAP_PROFILING === 'true',
    profileStorage: process.env.PROFILE_STORAGE || './profiles',
    maxProfileSize: parseInt(process.env.MAX_PROFILE_SIZE) || 100 * 1024 * 1024, // 100MB

    // Profiling thresholds
    thresholds: {
      cpuUsage: parseFloat(process.env.CPU_THRESHOLD) || 80,
      memoryUsage: parseFloat(process.env.MEMORY_THRESHOLD) || 90,
      responseTime: parseFloat(process.env.RESPONSE_TIME_THRESHOLD) || 1000, // 1 second
      errorRate: parseFloat(process.env.ERROR_RATE_THRESHOLD) || 5 // 5%
    }
  },

  // Log Aggregation Configuration
  logging: {
    enabled: process.env.LOG_AGGREGATION_ENABLED !== 'false',
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    retention: parseInt(process.env.LOG_RETENTION) || 86400000, // 24 hours
    maxLogSize: parseInt(process.env.MAX_LOG_SIZE) || 100 * 1024 * 1024, // 100MB

    // Log aggregation
    aggregation: {
      enabled: process.env.LOG_AGGREGATION_ENABLED === 'true',
      interval: parseInt(process.env.LOG_AGGREGATION_INTERVAL) || 30000, // 30 seconds
      batchSize: parseInt(process.env.LOG_BATCH_SIZE) || 1000,
      enableCompression: process.env.LOG_COMPRESSION !== 'false'
    },

    // Log forwarding
    forwarding: {
      enabled: process.env.LOG_FORWARDING_ENABLED === 'true',
      endpoint: process.env.LOG_FORWARDING_ENDPOINT,
      apiKey: process.env.LOG_FORWARDING_API_KEY,
      batchSize: parseInt(process.env.LOG_FORWARDING_BATCH_SIZE) || 100,
      flushInterval: parseInt(process.env.LOG_FORWARDING_FLUSH_INTERVAL) || 10000 // 10 seconds
    },

    // Alerting on logs
    alerts: {
      enabled: process.env.LOG_ALERTS_ENABLED === 'true',
      patterns: [
        { pattern: /error/i, severity: 'warning', count: 5, window: 60000 },
        { pattern: /fatal|critical/i, severity: 'critical', count: 1, window: 0 },
        { pattern: /timeout/i, severity: 'warning', count: 10, window: 300000 }
      ]
    }
  },

  // Business Metrics Configuration
  businessMetrics: {
    enabled: process.env.BUSINESS_METRICS_ENABLED !== 'false',
    trackingInterval: parseInt(process.env.BUSINESS_METRICS_INTERVAL) || 60000, // 1 minute

    // Metrics to track
    metrics: {
      customers: {
        total: true,
        active: true,
        new: true,
        churned: true,
        byLocation: true,
        byType: true
      },
      vouchers: {
        total: true,
        active: true,
        expired: true,
        sold: true,
        revenue: true,
        byLocation: true,
        byType: true
      },
      payments: {
        total: true,
        successful: true,
        failed: true,
        pending: true,
        amount: true,
        byMethod: true,
        byLocation: true
      },
      subscriptions: {
        total: true,
        active: true,
        expired: true,
        recurring: true,
        byType: true,
        byLocation: true
      }
    }
  },

  // System Metrics Configuration
  systemMetrics: {
    enabled: process.env.SYSTEM_METRICS_ENABLED !== 'false',
    collectionInterval: parseInt(process.env.SYSTEM_METRICS_INTERVAL) || 30000, // 30 seconds

    // Metrics to collect
    metrics: {
      cpu: {
        usage: true,
        loadAverage: true,
        cores: true,
        processes: true
      },
      memory: {
        total: true,
        used: true,
        free: true,
        heapUsed: true,
        heapTotal: true,
        external: true,
        rss: true
      },
      disk: {
        total: true,
        used: true,
        free: true,
        usage: true,
        readSpeed: true,
        writeSpeed: true
      },
      network: {
        bytesReceived: true,
        bytesSent: true,
        packetsReceived: true,
        packetsSent: true,
        connections: true
      }
    }
  },

  // Integration Configuration
  integrations: {
    // External monitoring systems
    datadog: {
      enabled: process.env.DATADOG_ENABLED === 'true',
      apiKey: process.env.DATADOG_API_KEY,
      appKey: process.env.DATADOG_APP_KEY,
      site: process.env.DATADOG_SITE || 'datadoghq.com',
      hostname: process.env.DATADOG_HOSTNAME || require('os').hostname()
    },

    newrelic: {
      enabled: process.env.NEWRELIC_ENABLED === 'true',
      licenseKey: process.env.NEWRELIC_LICENSE_KEY,
      appName: process.env.NEWRELIC_APP_NAME || 'Mikrotik Billing',
      logLevel: process.env.NEWRELIC_LOG_LEVEL || 'info'
    },

    // Cloud provider integrations
    aws: {
      enabled: process.env.AWS_MONITORING_ENABLED === 'true',
      region: process.env.AWS_REGION || 'us-east-1',
      cloudWatch: {
        namespace: process.env.CLOUDWATCH_NAMESPACE || 'MikrotikBilling',
        dimensions: {
          Environment: process.env.NODE_ENV || 'development',
          InstanceId: process.env.AWS_INSTANCE_ID || 'local'
        }
      }
    },

    gcp: {
      enabled: process.env.GCP_MONITORING_ENABLED === 'true',
      projectId: process.env.GCP_PROJECT_ID,
      serviceAccount: process.env.GCP_SERVICE_ACCOUNT_KEY,
      metricTypes: [
        'custom.googleapis.com/mikrotik_billing/active_users',
        'custom.googleapis.com/mikrotik_billing/revenue'
      ]
    }
  }
};

module.exports = config;