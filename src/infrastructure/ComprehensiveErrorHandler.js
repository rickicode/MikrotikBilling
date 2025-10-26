const { EventEmitter } = require('events');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

/**
 * Comprehensive Error Handling and Logging System
 * Provides centralized error management, structured logging, error tracking,
  * alerting, and comprehensive error analysis
 */
class ComprehensiveErrorHandler extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      // Error handling settings
      serviceId: config.serviceId || 'mikrotik-billing-error-handler',
      version: config.version || '1.0.0',
      environment: config.environment || 'production',

      // Logging
      enableLogging: config.enableLogging !== false,
      enableStructuredLogging: config.enableStructuredLogging !== false,
      logLevel: config.logLevel || 'info',
      enableLogRotation: config.enableLogRotation !== false,
      maxLogSize: config.maxLogSize || 100 * 1024 * 1024, // 100MB
      logRetention: config.logRetention || 30 * 24 * 60 * 60 * 1000, // 30 days

      // Error tracking
      enableErrorTracking: config.enableErrorTracking !== false,
      enableErrorGrouping: config.enableErrorGrouping !== false,
      enableStackTrace: config.enableStackTrace !== false,
      enableSourceMap: config.enableSourceMap || false,

      // Alerting
      enableErrorAlerts: config.enableErrorAlerts !== false,
      criticalErrorThreshold: config.criticalErrorThreshold || 10, // 10 errors per minute
      errorCooldown: config.errorCooldown || 300000, // 5 minutes

      // Persistence
      enablePersistence: config.enablePersistence !== false,
      maxErrorsInMemory: config.maxErrorsInMemory || 10000,

      // External integrations
      enableSentry: config.enableSentry || false,
      sentryDsn: config.sentryDsn,
      enableSlack: config.enableSlack || false,
      slackWebhook: config.slackWebhook,
      enableEmail: config.enableEmail || false,
      emailConfig: config.emailConfig,

      // Performance
      enablePerformanceMonitoring: config.enablePerformanceMonitoring !== false,
      slowOperationThreshold: config.slowOperationThreshold || 5000, // 5 seconds

      ...config
    };

    // Error storage
    this.errors = new Map();
    this.errorGroups = new Map();
    this.errorPatterns = new Map();
    this.errorHistory = [];

    // Alert management
    this.activeAlerts = new Map();
    this.errorCounts = new Map();
    this.alertCooldowns = new Map();

    // Logging
    this.loggers = new Map();
    this.logBuffer = [];
    this.logLevels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };

    // Performance monitoring
    this.slowOperations = new Map();
    this.operationMetrics = new Map();

    // Error classification
    this.errorCategories = {
      SYSTEM: 'system',
      BUSINESS: 'business',
      NETWORK: 'network',
      DATABASE: 'database',
      AUTHENTICATION: 'authentication',
      AUTHORIZATION: 'authorization',
      VALIDATION: 'validation',
      EXTERNAL: 'external',
      TIMEOUT: 'timeout',
      UNKNOWN: 'unknown'
    };

    this.setupEventHandlers();
    this.initializeLoggers();
    this.startBackgroundTasks();
  }

  setupEventHandlers() {
    this.on('error-occurred', this.handleErrorOccurred.bind(this));
    this.on('error-grouped', this.handleErrorGrouped.bind(this));
    this.on('alert-triggered', this.handleAlertTriggered.bind(this));
    this.on('slow-operation', this.handleSlowOperation.bind(this));

    // Process error handlers
    process.on('uncaughtException', (error) => {
      this.handleUncaughtException(error);
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.handleUnhandledRejection(reason, promise);
    });
  }

  initializeLoggers() {
    if (!this.config.enableLogging) return;

    // Initialize different loggers for different components
    this.loggers.set('application', new Logger('application', this.config));
    this.loggers.set('security', new Logger('security', this.config));
    this.loggers.set('performance', new Logger('performance', this.config));
    this.loggers.set('business', new Logger('business', this.config));
    this.loggers.set('external', new Logger('external', this.config));
  }

  /**
   * Handle error occurrence
   */
  handleError(error, context = {}) {
    const errorId = this.generateErrorId();
    const timestamp = new Date().toISOString();

    const errorRecord = {
      id: errorId,
      error: this.serializeError(error),
      context: this.enrichContext(context),
      category: this.categorizeError(error),
      severity: this.determineSeverity(error, context),
      timestamp,
      stackTrace: this.config.enableStackTrace ? error.stack : null,
      fingerprint: this.generateErrorFingerprint(error),
      count: 1,
      firstOccurrence: timestamp,
      lastOccurrence: timestamp,
      resolved: false,
      metadata: {
        service: this.config.serviceId,
        version: this.config.version,
        environment: this.config.environment,
        nodeId: process.env.NODE_ID || 'unknown',
        ...context.metadata
      }
    };

    // Store error
    this.storeError(errorRecord);

    // Group similar errors
    if (this.config.enableErrorGrouping) {
      this.groupError(errorRecord);
    }

    // Log error
    this.logError(errorRecord);

    // Check for alerting
    if (this.config.enableErrorAlerts) {
      this.checkErrorAlerts(errorRecord);
    }

    // Send to external services
    this.sendToExternalServices(errorRecord);

    // Update metrics
    this.updateErrorMetrics(errorRecord);

    this.emit('error-occurred', errorRecord);

    return errorId;
  }

  /**
   * Handle uncaught exception
   */
  handleUncaughtException(error) {
    const errorRecord = this.handleError(error, {
      type: 'uncaught_exception',
      fatal: true,
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        memory: process.memoryUsage()
      }
    });

    this.logger('application').error('Uncaught Exception', {
      errorId: errorRecord.id,
      error: error.message,
      stack: error.stack
    });

    // Give time for logging before exiting
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  }

  /**
   * Handle unhandled rejection
   */
  handleUnhandledRejection(reason, promise) {
    const error = reason instanceof Error ? reason : new Error(String(reason));

    const errorRecord = this.handleError(error, {
      type: 'unhandled_rejection',
      promise: {
        reason: String(reason),
        stack: promise.stack
      }
    });

    this.logger('application').error('Unhandled Rejection', {
      errorId: errorRecord.id,
      reason: String(reason)
    });
  }

  /**
   * Wrap function with error handling
   */
  wrap(fn, options = {}) {
    return async (...args) => {
      const operationId = this.generateOperationId();
      const startTime = Date.now();

      try {
        const result = await fn(...args);

        // Record successful operation
        this.recordOperation(operationId, fn.name || 'anonymous', true, Date.now() - startTime);

        return result;

      } catch (error) {
        // Record failed operation
        this.recordOperation(operationId, fn.name || 'anonymous', false, Date.now() - startTime);

        // Handle error
        this.handleError(error, {
          operation: {
            id: operationId,
            name: fn.name || 'anonymous',
            args: this.sanitizeArgs(args),
            duration: Date.now() - startTime
          },
          ...options.context
        });

        // Re-throw if configured
        if (options.rethrow !== false) {
          throw error;
        }
      }
    };
  }

  /**
   * Wrap function with performance monitoring
   */
  wrapWithMonitoring(fn, options = {}) {
    const operationName = options.name || fn.name || 'anonymous';
    const threshold = options.threshold || this.config.slowOperationThreshold;

    return async (...args) => {
      const startTime = Date.now();

      try {
        const result = await fn(...args);
        const duration = Date.now() - startTime;

        // Check for slow operation
        if (duration > threshold) {
          this.handleSlowOperation(operationName, duration, {
            args: this.sanitizeArgs(args),
            threshold
          });
        }

        return result;

      } catch (error) {
        const duration = Date.now() - startTime;

        this.handleError(error, {
          operation: {
            name: operationName,
            duration,
            slow: duration > threshold
          }
        });

        throw error;
      }
    };
  }

  /**
   * Create middleware for Express/Fastify
   */
  createMiddleware(options = {}) {
    return (request, reply, next) => {
      const requestId = this.generateRequestId();
      const startTime = Date.now();

      // Add request ID to request
      request.errorHandlerId = requestId;

      // Handle response
      const originalReply = reply.send || reply.raw?.send;
      if (originalReply) {
        reply.send = function(payload) {
          const duration = Date.now() - startTime;

          if (reply.statusCode >= 400) {
            const error = new Error(`HTTP ${reply.statusCode}: ${request.method} ${request.url}`);
            error.statusCode = reply.statusCode;

            this.handleError(error, {
              type: 'http_error',
              request: {
                id: requestId,
                method: request.method,
                url: request.url,
                headers: this.sanitizeHeaders(request.headers),
                query: request.query,
                body: this.sanitizeBody(request.body),
                statusCode: reply.statusCode,
                duration
              }
            });
          }

          return originalReply.call(this, payload);
        };
      }

      // Error handling middleware
      request.addHook?.('onError', async (request, reply, error) => {
        const duration = Date.now() - startTime;

        this.handleError(error, {
          type: 'request_error',
          request: {
            id: requestId,
            method: request.method,
            url: request.url,
            headers: this.sanitizeHeaders(request.headers),
            query: request.query,
            body: this.sanitizeBody(request.body),
            statusCode: error.statusCode || 500,
            duration
          }
        });
      });

      if (next) next();
    };
  }

  /**
   * Log message with structured logging
   */
  log(level, message, data = {}, loggerName = 'application') {
    if (!this.config.enableLogging) return;

    const logger = this.loggers.get(loggerName);
    if (!logger) return;

    const logEntry = {
      level,
      message,
      data: this.sanitizeData(data),
      timestamp: new Date().toISOString(),
      service: this.config.serviceId,
      version: this.config.version,
      environment: this.config.environment,
      id: this.generateLogId()
    };

    logger.log(level, message, logEntry);
  }

  /**
   * Get logger by name
   */
  logger(name = 'application') {
    return this.loggers.get(name) || this.loggers.get('application');
  }

  /**
   * Get error by ID
   */
  getError(errorId) {
    return this.errors.get(errorId);
  }

  /**
   * Get errors by category
   */
  getErrorsByCategory(category, options = {}) {
    const { limit = 100, offset = 0, unresolved = false } = options;

    let errors = Array.from(this.errors.values())
      .filter(error => error.category === category);

    if (unresolved) {
      errors = errors.filter(error => !error.resolved);
    }

    return errors
      .sort((a, b) => new Date(b.lastOccurrence) - new Date(a.lastOccurrence))
      .slice(offset, offset + limit);
  }

  /**
   * Get error statistics
   */
  getErrorStatistics(timeRange = 3600000) { // Default 1 hour
    const since = Date.now() - timeRange;
    const recentErrors = Array.from(this.errors.values())
      .filter(error => new Date(error.lastOccurrence).getTime() > since);

    const stats = {
      total: recentErrors.length,
      byCategory: {},
      bySeverity: {},
      unresolved: 0,
      averageResolutionTime: 0,
      topErrors: []
    };

    recentErrors.forEach(error => {
      // By category
      stats.byCategory[error.category] = (stats.byCategory[error.category] || 0) + 1;

      // By severity
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;

      // Unresolved count
      if (!error.resolved) {
        stats.unresolved++;
      }
    });

    // Top errors by frequency
    const errorCounts = {};
    recentErrors.forEach(error => {
      errorCounts[error.fingerprint] = (errorCounts[error.fingerprint] || 0) + error.count;
    });

    stats.topErrors = Object.entries(errorCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([fingerprint, count]) => {
        const error = Array.from(this.errors.values())
          .find(e => e.fingerprint === fingerprint);
        return {
          fingerprint,
          count,
          message: error.error.message,
          category: error.category,
          lastOccurrence: error.lastOccurrence
        };
      });

    return stats;
  }

  /**
   * Get error groups
   */
  getErrorGroups() {
    return Array.from(this.errorGroups.values()).map(group => ({
      id: group.id,
      fingerprint: group.fingerprint,
      message: group.message,
      category: group.category,
      count: group.errors.length,
      firstOccurrence: group.firstOccurrence,
      lastOccurrence: group.lastOccurrence,
      resolved: group.resolved,
      errors: group.errors.slice(0, 10) // Last 10 errors
    }));
  }

  /**
   * Resolve error
   */
  resolveError(errorId, resolution = {}) {
    const error = this.errors.get(errorId);
    if (!error) return false;

    error.resolved = true;
    error.resolvedAt = new Date().toISOString();
    error.resolution = {
      by: resolution.by || 'system',
      method: resolution.method || 'manual',
      comment: resolution.comment || '',
      ...resolution
    };

    // Resolve entire group if error grouping is enabled
    if (this.config.enableErrorGrouping && error.groupId) {
      const group = this.errorGroups.get(error.groupId);
      if (group) {
        group.resolved = true;
        group.resolvedAt = error.resolvedAt;
        group.resolution = error.resolution;

        group.errors.forEach(groupError => {
          groupError.resolved = true;
          groupError.resolvedAt = error.resolvedAt;
          groupError.resolution = error.resolution;
        });
      }
    }

    this.emit('error-resolved', error);
    return true;
  }

  // Private methods

  storeError(errorRecord) {
    // Check if similar error exists
    const existingError = Array.from(this.errors.values())
      .find(error => error.fingerprint === errorRecord.fingerprint);

    if (existingError) {
      // Update existing error
      existingError.count++;
      existingError.lastOccurrence = errorRecord.lastOccurrence;
      existingError.context = { ...existingError.context, ...errorRecord.context };

      return existingError.id;
    }

    // Store new error
    this.errors.set(errorRecord.id, errorRecord);

    // Add to history
    this.errorHistory.push(errorRecord.id);

    // Limit history size
    if (this.errorHistory.length > this.config.maxErrorsInMemory) {
      const oldestId = this.errorHistory.shift();
      this.errors.delete(oldestId);
    }

    return errorRecord.id;
  }

  groupError(errorRecord) {
    const groupKey = errorRecord.fingerprint;

    if (!this.errorGroups.has(groupKey)) {
      const group = {
        id: this.generateGroupId(),
        fingerprint: groupKey,
        message: errorRecord.error.message,
        category: errorRecord.category,
        severity: errorRecord.severity,
        errors: [],
        firstOccurrence: errorRecord.timestamp,
        lastOccurrence: errorRecord.timestamp,
        resolved: false
      };

      this.errorGroups.set(groupKey, group);
    }

    const group = this.errorGroups.get(groupKey);
    group.errors.push(errorRecord.id);
    group.lastOccurrence = errorRecord.lastOccurrence;
    errorRecord.groupId = group.id;

    this.emit('error-grouped', group);
  }

  categorizeError(error) {
    const message = error.message.toLowerCase();
    const name = error.constructor.name.toLowerCase();

    if (message.includes('database') || name.includes('database') || name.includes('query')) {
      return this.errorCategories.DATABASE;
    }

    if (message.includes('network') || message.includes('connection') || name.includes('network')) {
      return this.errorCategories.NETWORK;
    }

    if (message.includes('auth') || name.includes('auth') || name.includes('unauthorized')) {
      return this.errorCategories.AUTHENTICATION;
    }

    if (message.includes('forbidden') || name.includes('forbidden') || name.includes('permission')) {
      return this.errorCategories.AUTHORIZATION;
    }

    if (message.includes('validation') || name.includes('validation') || name.includes('schema')) {
      return this.errorCategories.VALIDATION;
    }

    if (message.includes('timeout') || name.includes('timeout') || name.includes('abort')) {
      return this.errorCategories.TIMEOUT;
    }

    if (message.includes('external') || name.includes('external') || name.includes('api')) {
      return this.errorCategories.EXTERNAL;
    }

    if (message.includes('business') || name.includes('business') || name.includes('domain')) {
      return this.errorCategories.BUSINESS;
    }

    return this.errorCategories.SYSTEM;
  }

  determineSeverity(error, context) {
    // Check context for severity hints
    if (context.fatal || context.critical) return 'critical';
    if (context.high) return 'high';

    // Check error types
    if (error.name === 'UncaughtExceptionError') return 'critical';
    if (error.name === 'TypeError' || error.name === 'ReferenceError') return 'high';

    // Check error messages
    const message = error.message.toLowerCase();
    if (message.includes('fatal') || message.includes('critical')) return 'critical';
    if (message.includes('timeout') || message.includes('connection')) return 'medium';

    // Default severity
    return 'low';
  }

  generateErrorFingerprint(error) {
    const fingerprintData = {
      name: error.constructor.name,
      message: error.message.substring(0, 200), // Limit message length
      stack: this.config.enableStackTrace ? error.stack?.split('\n')[1] : null
    };

    const fingerprintString = JSON.stringify(fingerprintData);
    return crypto.createHash('md5').update(fingerprintString).digest('hex');
  }

  serializeError(error) {
    return {
      name: error.constructor.name,
      message: error.message,
      stack: this.config.enableStackTrace ? error.stack : null,
      code: error.code,
      statusCode: error.statusCode,
      status: error.status
    };
  }

  enrichContext(context) {
    return {
      timestamp: new Date().toISOString(),
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        platform: process.platform,
        nodeVersion: process.version
      },
      ...context
    };
  }

  logError(errorRecord) {
    const logger = this.logger('application');
    logger.error('Error occurred', {
      errorId: errorRecord.id,
      message: errorRecord.error.message,
      category: errorRecord.category,
      severity: errorRecord.severity,
      fingerprint: errorRecord.fingerprint,
      context: errorRecord.context
    });
  }

  checkErrorAlerts(errorRecord) {
    const now = Date.now();
    const key = `${errorRecord.category}:${errorRecord.fingerprint}`;

    // Check cooldown
    if (this.alertCooldowns.has(key)) {
      const lastAlert = this.alertCooldowns.get(key);
      if (now - lastAlert < this.config.errorCooldown) {
        return;
      }
    }

    // Count errors in the last minute
    const oneMinuteAgo = now - 60000;
    const recentErrors = Array.from(this.errors.values())
      .filter(error =>
        error.fingerprint === errorRecord.fingerprint &&
        new Date(error.lastOccurrence).getTime() > oneMinuteAgo
      );

    if (recentErrors.length >= this.config.criticalErrorThreshold) {
      this.triggerErrorAlert(errorRecord, recentErrors.length);
      this.alertCooldowns.set(key, now);
    }
  }

  triggerErrorAlert(errorRecord, count) {
    const alert = {
      id: this.generateAlertId(),
      type: 'error_spike',
      errorId: errorRecord.id,
      fingerprint: errorRecord.fingerprint,
      message: errorRecord.error.message,
      category: errorRecord.category,
      count,
      severity: errorRecord.severity === 'critical' ? 'critical' : 'warning',
      triggeredAt: new Date().toISOString(),
      metadata: {
        service: this.config.serviceId,
        environment: this.config.environment
      }
    };

    this.activeAlerts.set(alert.id, alert);

    // Send to external services
    this.sendAlert(alert);

    this.emit('alert-triggered', alert);
  }

  sendAlert(alert) {
    // Send to Slack
    if (this.config.enableSlack && this.config.slackWebhook) {
      this.sendSlackAlert(alert);
    }

    // Send email
    if (this.config.enableEmail && this.config.emailConfig) {
      this.sendEmailAlert(alert);
    }

    // Send to Sentry
    if (this.config.enableSentry && this.config.sentryDsn) {
      this.sendSentryAlert(alert);
    }
  }

  sendSlackAlert(alert) {
    // Implementation would use actual Slack webhook
    console.log(`📱 Slack Alert: ${alert.message} (${alert.count} occurrences)`);
  }

  sendEmailAlert(alert) {
    // Implementation would use actual email service
    console.log(`📧 Email Alert: ${alert.message} (${alert.count} occurrences)`);
  }

  sendSentryAlert(alert) {
    // Implementation would use Sentry SDK
    console.log(`🛡️ Sentry Alert: ${alert.message} (${alert.count} occurrences)`);
  }

  sendToExternalServices(errorRecord) {
    // Send to Sentry
    if (this.config.enableSentry && this.config.sentryDsn) {
      // Implementation would use Sentry SDK
    }

    // Send to other external services
  }

  updateErrorMetrics(errorRecord) {
    // Update error counts
    const key = errorRecord.fingerprint;
    this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1);
  }

  recordOperation(operationId, name, success, duration) {
    if (!this.config.enablePerformanceMonitoring) return;

    const metric = {
      id: operationId,
      name,
      success,
      duration,
      timestamp: Date.now()
    };

    if (!this.operationMetrics.has(name)) {
      this.operationMetrics.set(name, []);
    }

    this.operationMetrics.get(name).push(metric);

    // Limit history size
    const history = this.operationMetrics.get(name);
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }
  }

  handleSlowOperation(operationName, duration, context) {
    const slowOp = {
      id: this.generateOperationId(),
      name: operationName,
      duration,
      context,
      timestamp: Date.now()
    };

    if (!this.slowOperations.has(operationName)) {
      this.slowOperations.set(operationName, []);
    }

    this.slowOperations.get(operationName).push(slowOp);

    // Log slow operation
    this.logger('performance').warn('Slow operation detected', {
      operation: operationName,
      duration,
      threshold: context.threshold
    });

    this.emit('slow-operation', slowOp);
  }

  sanitizeArgs(args) {
    // Remove sensitive data from arguments
    return args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        return this.sanitizeData(arg);
      }
      return arg;
    });
  }

  sanitizeData(data) {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'credential'];
    const sanitized = { ...data };

    Object.keys(sanitized).forEach(key => {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object') {
        sanitized[key] = this.sanitizeData(sanitized[key]);
      }
    });

    return sanitized;
  }

  sanitizeHeaders(headers) {
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
    const sanitized = { ...headers };

    Object.keys(sanitized).forEach(key => {
      if (sensitiveHeaders.some(sensitive => key.toLowerCase() === sensitive.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  sanitizeBody(body) {
    if (!body || typeof body !== 'object') return body;
    return this.sanitizeData(body);
  }

  // Utility methods
  generateErrorId() {
    return `err_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  generateGroupId() {
    return `grp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  generateOperationId() {
    return `op_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  generateRequestId() {
    return `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  generateLogId() {
    return `log_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  generateAlertId() {
    return `alert_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  // Event handlers
  handleErrorOccurred(errorRecord) {
    console.error(`❌ Error occurred: ${errorRecord.error.message} (${errorRecord.id})`);
  }

  handleErrorGrouped(group) {
    console.log(`🔗 Error grouped: ${group.message} (${group.errors.length} occurrences)`);
  }

  handleAlertTriggered(alert) {
    console.warn(`🚨 Alert triggered: ${alert.message}`);
  }

  handleSlowOperation(slowOp) {
    console.warn(`⏱️ Slow operation: ${slowOp.name} (${slowOp.duration}ms)`);
  }

  /**
   * Start background tasks
   */
  startBackgroundTasks() {
    // Cleanup old errors
    setInterval(() => {
      this.cleanupOldErrors();
    }, this.config.logRetention);

    // Update metrics
    setInterval(() => {
      this.updateSystemMetrics();
    }, 60000); // Every minute
  }

  cleanupOldErrors() {
    const cutoff = Date.now() - this.config.logRetention;

    for (const [errorId, error] of this.errors) {
      if (new Date(error.lastOccurrence).getTime() < cutoff) {
        this.errors.delete(errorId);
        this.errorHistory = this.errorHistory.filter(id => id !== errorId);
      }
    }
  }

  updateSystemMetrics() {
    // Update system-level metrics
    this.systemMetrics = {
      errorsTotal: this.errors.size,
      groupsTotal: this.errorGroups.size,
      activeAlerts: this.activeAlerts.size,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };
  }

  /**
   * Get comprehensive statistics
   */
  getStatistics() {
    return {
      service: {
        id: this.config.serviceId,
        version: this.config.version,
        environment: this.config.environment,
        uptime: process.uptime()
      },
      errors: this.getErrorStatistics(),
      groups: this.getErrorGroups(),
      alerts: {
        active: Array.from(this.activeAlerts.values()),
        total: this.activeAlerts.size
      },
      performance: {
        slowOperations: Array.from(this.slowOperations.entries()).map(([name, ops]) => ({
          name,
          count: ops.length,
          averageDuration: ops.reduce((sum, op) => sum + op.duration, 0) / ops.length
        }))
      },
      system: this.systemMetrics || {}
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    return {
      status: 'healthy',
      service: this.config.serviceId,
      version: this.config.version,
      uptime: process.uptime(),
      metrics: {
        errorsTotal: this.errors.size,
        groupsTotal: this.errorGroups.size,
        activeAlerts: this.activeAlerts.size,
        loggersCount: this.loggers.size
      }
    };
  }

  /**
   * Stop error handler
   */
  stop() {
    console.log(`🛑 Comprehensive Error Handler stopped: ${this.config.serviceId}`);
    this.emit('stopped');
  }
}

/**
 * Simple Logger implementation
 */
class Logger {
  constructor(name, config) {
    this.name = name;
    this.config = config;
  }

  log(level, message, data) {
    if (!this.shouldLog(level)) return;

    const logEntry = {
      level,
      logger: this.name,
      message,
      data,
      timestamp: new Date().toISOString()
    };

    // In production, this would write to file, send to logging service, etc.
    console.log(JSON.stringify(logEntry));
  }

  error(message, data) {
    this.log('error', message, data);
  }

  warn(message, data) {
    this.log('warn', message, data);
  }

  info(message, data) {
    this.log('info', message, data);
  }

  debug(message, data) {
    this.log('debug', message, data);
  }

  shouldLog(level) {
    const logLevels = { error: 0, warn: 1, info: 2, debug: 3 };
    const configLevel = logLevels[this.config.logLevel] || 2;
    const messageLevel = logLevels[level] || 2;
    return messageLevel <= configLevel;
  }
}

module.exports = ComprehensiveErrorHandler;