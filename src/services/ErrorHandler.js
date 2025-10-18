/**
 * Enhanced Error Handler for Mikrotik API
 * Provides detailed error context, classification, and recovery suggestions
 */
const EventEmitter = require('events');

class ErrorHandler extends EventEmitter {
  constructor(options = {}) {
    super();

    // Configuration
    this.enableDetailedLogging = options.enableDetailedLogging !== false;
    this.enableContextCapture = options.enableContextCapture !== false;
    this.enableRecoverySuggestions = options.enableRecoverySuggestions !== false;
    this.maxErrorHistory = options.maxErrorHistory || 1000;
    this.contextCaptureDepth = options.contextCaptureDepth || 5;

    // Error classification patterns
    this.errorPatterns = {
      // Connection errors
      connection: [
        /timeout/i,
        /connection/i,
        /ECONNREFUSED/i,
        /ETIMEDOUT/i,
        /ENOTFOUND/i,
        /EHOSTUNREACH/i,
        /socket hang up/i,
        /read ECONNRESET/i,
        /write ECONNRESET/i,
        /network/i
      ],

      // Authentication errors
      authentication: [
        /login failed/i,
        /authentication failed/i,
        /invalid credentials/i,
        /access denied/i,
        /permission denied/i,
        /unauthorized/i
      ],

      // Command errors
      command: [
        /invalid command/i,
        /syntax error/i,
        /unknown command/i,
        /parameter error/i,
        /bad parameter/i
      ],

      // System errors
      system: [
        /out of memory/i,
        /disk full/i,
        /resource unavailable/i,
        /system overload/i,
        /internal error/i
      ],

      // User errors
      user: [
        /user not found/i,
        /user exists/i,
        /invalid user/i,
        /user disabled/i
      ],

      // Profile errors
      profile: [
        /profile not found/i,
        /profile exists/i,
        /invalid profile/i,
        /profile in use/i
      ]
    };

    // Error history and statistics
    this.errorHistory = [];
    this.errorStats = {
      total: 0,
      byType: {},
      bySeverity: {},
      byComponent: {},
      recent: [],
      recoverySuggestions: {}
    };

    // Severity levels
    this.severityLevels = {
      critical: 5,
      high: 4,
      medium: 3,
      low: 2,
      info: 1
    };
  }

  /**
   * Handle an error with full context
   */
  handleError(error, context = {}) {
    const enhancedError = this._enhanceError(error, context);

    // Store in history
    this._storeError(enhancedError);

    // Update statistics
    this._updateStats(enhancedError);

    // Log error
    if (this.enableDetailedLogging) {
      this._logError(enhancedError);
    }

    // Emit error event
    this.emit('error', enhancedError);

    // Emit type-specific event
    this.emit(`error:${enhancedError.type}`, enhancedError);

    return enhancedError;
  }

  /**
   * Classify error type
   */
  classifyError(error) {
    const message = error.message || '';
    const stack = error.stack || '';

    for (const [type, patterns] of Object.entries(this.errorPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(message) || pattern.test(stack)) {
          return type;
        }
      }
    }

    return 'unknown';
  }

  /**
   * Determine error severity
   */
  determineSeverity(error, type) {
    const message = error.message || '';

    // Critical errors
    if (type === 'authentication' ||
        message.includes('fatal') ||
        message.includes('critical') ||
        message.includes('system panic')) {
      return 'critical';
    }

    // High severity
    if (type === 'connection' ||
        type === 'system' ||
        message.includes('failed') ||
        message.includes('error')) {
      return 'high';
    }

    // Medium severity
    if (type === 'command' ||
        type === 'profile' ||
        message.includes('warning')) {
      return 'medium';
    }

    // Low severity
    if (type === 'user' ||
        message.includes('not found') ||
        message.includes('invalid')) {
      return 'low';
    }

    return 'info';
  }

  /**
   * Get recovery suggestions for error
   */
  getRecoverySuggestions(error) {
    const type = error.type || this.classifyError(error);
    const message = error.message || '';

    const suggestions = {
      connection: [
        'Check network connectivity to Mikrotik device',
        'Verify Mikrotik device IP address and port',
        'Ensure Mikrotik API service is running',
        'Check firewall rules blocking connection',
        'Try reconnecting with exponential backoff',
        'Verify Mikrotik device is powered on'
      ],

      authentication: [
        'Verify username and password are correct',
        'Check if user account is enabled in Mikrotik',
        'Ensure user has API permissions',
        'Try creating a new API user in Mikrotik',
        'Check if password has expired',
        'Verify user group permissions'
      ],

      command: [
        'Check command syntax and parameters',
        'Verify Mikrotik RouterOS version compatibility',
        'Check if required features are enabled',
        'Verify target objects exist',
        'Check parameter values and formats',
        'Consult Mikrotik API documentation'
      ],

      system: [
        'Check Mikrotik device resources (CPU, memory)',
        'Verify available disk space',
        'Check system logs for detailed errors',
        'Restart Mikrotik services if needed',
        'Monitor system temperature and health',
        'Consider device reboot if problems persist'
      ],

      user: [
        'Verify user exists in system',
        'Check user status (enabled/disabled)',
        'Verify user profile assignment',
        'Check for duplicate usernames',
        'Validate user parameters',
        'Review user creation process'
      ],

      profile: [
        'Verify profile exists in Mikrotik',
        'Check profile configuration',
        'Ensure profile is not in use by active users',
        'Verify profile parameters',
        'Check profile permissions',
        'Review profile creation process'
      ]
    };

    return suggestions[type] || [
      'Check error message for specific details',
      'Review Mikrotik API documentation',
      'Verify system configuration',
      'Check network connectivity',
      'Contact system administrator'
    ];
  }

  /**
   * Get error statistics
   */
  getStats() {
    const now = Date.now();
    const recentErrors = this.errorHistory.filter(
      error => now - error.timestamp < 3600000 // Last hour
    );

    return {
      ...this.errorStats,
      recentErrors: recentErrors.length,
      errorsPerHour: recentErrors.length,
      topErrorTypes: this._getTopErrorTypes(),
      errorRate: this._calculateErrorRate(),
      averageRecoveryTime: this._calculateAverageRecoveryTime(),
      systemHealth: this._calculateSystemHealth()
    };
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit = 50, type = null) {
    let errors = [...this.errorHistory].reverse();

    if (type) {
      errors = errors.filter(error => error.type === type);
    }

    return errors.slice(0, limit);
  }

  /**
   * Get error trends
   */
  getErrorTrends(hours = 24) {
    const now = Date.now();
    const period = hours * 3600000; // Convert to milliseconds
    const startTime = now - period;

    const trends = {};
    const timeSlots = Math.min(hours, 24); // Max 24 slots for hourly data

    for (let i = 0; i < timeSlots; i++) {
      const slotStart = startTime + (i * period / timeSlots);
      const slotEnd = slotStart + (period / timeSlots);

      trends[i] = {
        startTime: slotStart,
        endTime: slotEnd,
        total: 0,
        byType: {}
      };
    }

    // Categorize errors into time slots
    this.errorHistory.forEach(error => {
      if (error.timestamp >= startTime && error.timestamp < now) {
        const slotIndex = Math.floor((error.timestamp - startTime) / (period / timeSlots));
        if (trends[slotIndex]) {
          trends[slotIndex].total++;
          trends[slotIndex].byType[error.type] = (trends[slotIndex].byType[error.type] || 0) + 1;
        }
      }
    });

    return trends;
  }

  /**
   * Clear error history
   */
  clearHistory() {
    this.errorHistory = [];
    this.errorStats = {
      total: 0,
      byType: {},
      bySeverity: {},
      byComponent: {},
      recent: [],
      recoverySuggestions: {}
    };

    this.emit('history-cleared');
  }

  /**
   * Enhance error with additional context
   */
  _enhanceError(error, context) {
    const timestamp = Date.now();
    const type = this.classifyError(error);
    const severity = this.determineSeverity(error, type);
    const recoverySuggestions = this.getRecoverySuggestions(error);

    const enhanced = {
      // Original error properties
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,

      // Enhanced properties
      id: this._generateErrorId(),
      timestamp,
      type,
      severity,
      recoverySuggestions,

      // Context
      context: this._captureContext(context),

      // Additional metadata
      component: context.component || 'unknown',
      operation: context.operation || 'unknown',
      retryCount: context.retryCount || 0,
      duration: context.duration || 0,

      // System state
      systemState: this._captureSystemState(context),

      // Classification details
      classification: {
        isRetryable: this._isRetryableError(error, type),
        isUserError: this._isUserError(type),
        isSystemError: this._isSystemError(type),
        requiresAttention: severity === 'critical' || severity === 'high'
      }
    };

    return enhanced;
  }

  /**
   * Store error in history
   */
  _storeError(error) {
    this.errorHistory.push(error);

    // Limit history size
    if (this.errorHistory.length > this.maxErrorHistory) {
      this.errorHistory.shift();
    }
  }

  /**
   * Update error statistics
   */
  _updateStats(error) {
    this.errorStats.total++;

    // By type
    this.errorStats.byType[error.type] = (this.errorStats.byType[error.type] || 0) + 1;

    // By severity
    this.errorStats.bySeverity[error.severity] = (this.errorStats.bySeverity[error.severity] || 0) + 1;

    // By component
    this.errorStats.byComponent[error.component] = (this.errorStats.byComponent[error.component] || 0) + 1;

    // Recent errors (last 10)
    this.errorStats.recent.unshift(error.id);
    if (this.errorStats.recent.length > 10) {
      this.errorStats.recent.pop();
    }
  }

  /**
   * Log enhanced error
   */
  _logError(error) {
    const logData = {
      id: error.id,
      timestamp: new Date(error.timestamp).toISOString(),
      severity: error.severity.toUpperCase(),
      type: error.type,
      message: error.message,
      component: error.component,
      operation: error.operation,
      context: error.context,
      recoverySuggestions: error.recoverySuggestions
    };

    switch (error.severity) {
      case 'critical':
        console.error('🔴 CRITICAL ERROR:', logData);
        break;
      case 'high':
        console.error('🟠 HIGH ERROR:', logData);
        break;
      case 'medium':
        console.warn('🟡 MEDIUM ERROR:', logData);
        break;
      case 'low':
        console.info('🟢 LOW ERROR:', logData);
        break;
      default:
        console.log('ℹ️ INFO ERROR:', logData);
    }
  }

  /**
   * Capture context information
   */
  _captureContext(context) {
    const captured = { ...context };

    if (this.enableContextCapture) {
      // Add call stack if available
      if (Error.stackTraceLimit && Error.captureStackTrace) {
        captured.callStack = new Error().stack;
      }

      // Add memory usage
      if (process.memoryUsage) {
        captured.memoryUsage = process.memoryUsage();
      }

      // Add system uptime
      captured.systemUptime = process.uptime();
    }

    return captured;
  }

  /**
   * Capture system state
   */
  _captureSystemState(context) {
    const state = {
      timestamp: Date.now(),
      processId: process.pid,
      platform: process.platform,
      nodeVersion: process.version
    };

    if (context.mikrotikState) {
      state.mikrotik = context.mikrotikState;
    }

    return state;
  }

  /**
   * Check if error is retryable
   */
  _isRetryableError(error, type) {
    const nonRetryablePatterns = [
      /authentication failed/i,
      /permission denied/i,
      /invalid command/i,
      /user not found/i,
      /profile not found/i
    ];

    return !nonRetryablePatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Check if error is user error
   */
  _isUserError(type) {
    return ['user', 'profile'].includes(type);
  }

  /**
   * Check if error is system error
   */
  _isSystemError(type) {
    return ['connection', 'authentication', 'system'].includes(type);
  }

  /**
   * Generate unique error ID
   */
  _generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get top error types
   */
  _getTopErrorTypes() {
    return Object.entries(this.errorStats.byType)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([type, count]) => ({ type, count }));
  }

  /**
   * Calculate error rate
   */
  _calculateErrorRate() {
    const now = Date.now();
    const hourAgo = now - 3600000;
    const recentErrors = this.errorHistory.filter(error => error.timestamp > hourAgo);
    return recentErrors.length;
  }

  /**
   * Calculate average recovery time
   */
  _calculateAverageRecoveryTime() {
    // This would need to be implemented based on actual recovery tracking
    // For now, return a placeholder
    return 0;
  }

  /**
   * Calculate system health score
   */
  _calculateSystemHealth() {
    const stats = this.getStats();
    let health = 100;

    // Deduct points for critical errors
    const criticalCount = this.errorStats.bySeverity.critical || 0;
    health -= Math.min(criticalCount * 10, 50);

    // Deduct points for high errors
    const highCount = this.errorStats.bySeverity.high || 0;
    health -= Math.min(highCount * 5, 30);

    // Deduct points for error rate
    const errorRate = stats.errorsPerHour;
    health -= Math.min(errorRate * 2, 20);

    return Math.max(0, health);
  }
}

module.exports = ErrorHandler;