/**
 * Comprehensive Audit Logging System for Security and Compliance
 * Tracks all critical operations with detailed audit trails
 */
const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class AuditLogger extends EventEmitter {
  constructor(options = {}) {
    super();

    // Configuration
    this.enableAuditLogging = options.enableAuditLogging !== false;
    this.logToFile = options.logToFile !== false;
    this.logToDatabase = options.logToDatabase || false;
    this.logRetentionDays = options.logRetentionDays || 365; // 1 year default
    this.enableIntegrityChecks = options.enableIntegrityChecks !== false;
    this.enableEncryption = options.enableEncryption || false;
    this.encryptionKey = options.encryptionKey || null;

    // File paths
    this.auditLogDir = options.auditLogDir || './logs/audit';
    this.currentLogFile = null;
    this.logFilePattern = 'audit-YYYY-MM-DD.log';
    this.integrityFile = path.join(this.auditLogDir, 'integrity.json');

    // In-memory buffer for batch writes
    this.logBuffer = [];
    this.bufferSize = options.bufferSize || 100;
    this.flushInterval = options.flushInterval || 5000; // 5 seconds
    this.maxBufferSize = options.maxBufferSize || 1000;

    // Statistics
    this.stats = {
      totalLogs: 0,
      logsByLevel: {},
      logsByCategory: {},
      logsByUser: {},
      failedWrites: 0,
      integrityViolations: 0,
      bufferFlushes: 0
    };

    // Log levels
    this.levels = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
      INFO: 4
    };

    // Categories
    this.categories = {
      AUTHENTICATION: 'authentication',
      AUTHORIZATION: 'authorization',
      USER_MANAGEMENT: 'user_management',
      CONFIGURATION: 'configuration',
      DATA_ACCESS: 'data_access',
      SYSTEM_OPERATION: 'system_operation',
      SECURITY_EVENT: 'security_event',
      BUSINESS_OPERATION: 'business_operation',
      ERROR_EVENT: 'error_event',
      COMPLIANCE: 'compliance'
    };

    // Start audit logging system
    if (this.enableAuditLogging) {
      this.start();
    }
  }

  /**
   * Start the audit logging system
   */
  async start() {
    try {
      // Create audit log directory
      await fs.mkdir(this.auditLogDir, { recursive: true });

      // Initialize current log file
      await this.initializeLogFile();

      // Load existing integrity data
      if (this.enableIntegrityChecks) {
        await this.loadIntegrityData();
      }

      // Start buffer flush timer
      this.startBufferFlush();

      // Setup log rotation
      this.setupLogRotation();

      console.log('Audit logging system started');
      this.emit('started');

    } catch (error) {
      console.error('Failed to start audit logging system:', error);
      this.emit('error', error);
    }
  }

  /**
   * Log an audit event
   */
  async log(level, category, action, details = {}, userId = null, sessionId = null) {
    if (!this.enableAuditLogging) return;

    const auditEvent = {
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      level,
      category,
      action,
      userId,
      sessionId,
      ipAddress: details.ipAddress || this.getClientIP(),
      userAgent: details.userAgent || null,
      details: this.sanitizeDetails(details),
      result: details.result || null,
      errorMessage: details.errorMessage || null,
      duration: details.duration || null,
      metadata: details.metadata || {}
    };

    // Add to buffer
    this.addToBuffer(auditEvent);

    // Update statistics
    this.updateStats(auditEvent);

    // Emit event for real-time monitoring
    this.emit('audit-event', auditEvent);

    // Critical events are written immediately
    if (level === this.levels.CRITICAL) {
      await this.flushBuffer();
    }
  }

  /**
   * Log authentication events
   */
  logAuthentication(action, details = {}) {
    this.log(this.levels.HIGH, this.categories.AUTHENTICATION, action, details, details.userId);
  }

  /**
   * Log authorization events
   */
  logAuthorization(action, details = {}) {
    this.log(this.levels.MEDIUM, this.categories.AUTHORIZATION, action, details, details.userId);
  }

  /**
   * Log user management events
   */
  logUserManagement(action, details = {}) {
    this.log(this.levels.HIGH, this.categories.USER_MANAGEMENT, action, details, details.userId);
  }

  /**
   * Log configuration changes
   */
  logConfiguration(action, details = {}) {
    this.log(this.levels.MEDIUM, this.categories.CONFIGURATION, action, details, details.userId);
  }

  /**
   * Log data access events
   */
  logDataAccess(action, details = {}) {
    this.log(this.levels.LOW, this.categories.DATA_ACCESS, action, details, details.userId);
  }

  /**
   * Log system operations
   */
  logSystemOperation(action, details = {}) {
    this.log(this.levels.INFO, this.categories.SYSTEM_OPERATION, action, details, details.userId);
  }

  /**
   * Log security events
   */
  logSecurityEvent(action, details = {}) {
    this.log(this.levels.CRITICAL, this.categories.SECURITY_EVENT, action, details, details.userId);
  }

  /**
   * Log business operations
   */
  logBusinessOperation(action, details = {}) {
    this.log(this.levels.MEDIUM, this.categories.BUSINESS_OPERATION, action, details, details.userId);
  }

  /**
   * Log error events
   */
  logErrorEvent(action, details = {}) {
    this.log(this.levels.HIGH, this.categories.ERROR_EVENT, action, details, details.userId);
  }

  /**
   * Log compliance events
   */
  logCompliance(action, details = {}) {
    this.log(this.levels.MEDIUM, this.categories.COMPLIANCE, action, details, details.userId);
  }

  /**
   * Search audit logs
   */
  async search(criteria) {
    const results = [];
    const {
      startDate,
      endDate,
      level,
      category,
      userId,
      action,
      limit = 100,
      offset = 0
    } = criteria;

    try {
      // Get list of log files in date range
      const logFiles = await this.getLogFilesInRange(startDate, endDate);

      for (const logFile of logFiles) {
        const content = await fs.readFile(logFile, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const event = JSON.parse(line);

            // Apply filters
            if (level && event.level !== level) continue;
            if (category && event.category !== category) continue;
            if (userId && event.userId !== userId) continue;
            if (action && !event.action.includes(action)) continue;

            results.push(event);

            // Apply limit
            if (results.length >= limit + offset) {
              break;
            }
          } catch (parseError) {
            console.warn(`Failed to parse audit log entry: ${parseError.message}`);
          }
        }

        if (results.length >= limit + offset) {
          break;
        }
      }

      return results.slice(offset, offset + limit);

    } catch (error) {
      console.error('Error searching audit logs:', error);
      throw error;
    }
  }

  /**
   * Get audit statistics
   */
  getStats() {
    return {
      ...this.stats,
      bufferSize: this.logBuffer.length,
      currentLogFile: this.currentLogFile,
      uptime: this.startTime ? Date.now() - this.startTime : 0
    };
  }

  /**
   * Verify log integrity
   */
  async verifyIntegrity() {
    if (!this.enableIntegrityChecks) {
      return { valid: true, message: 'Integrity checks disabled' };
    }

    try {
      const integrityData = await this.loadIntegrityData();
      const violations = [];

      for (const [logFile, expectedHash] of Object.entries(integrityData.files)) {
        try {
          const content = await fs.readFile(logFile, 'utf8');
          const actualHash = this.calculateHash(content);

          if (actualHash !== expectedHash) {
            violations.push({
              file: logFile,
              expectedHash,
              actualHash,
              type: 'hash_mismatch'
            });
          }
        } catch (error) {
          violations.push({
            file: logFile,
            error: error.message,
            type: 'file_error'
          });
        }
      }

      if (violations.length > 0) {
        this.stats.integrityViolations += violations.length;
        this.emit('integrity-violation', violations);
      }

      return {
        valid: violations.length === 0,
        violations,
        checkedFiles: Object.keys(integrityData.files).length
      };

    } catch (error) {
      console.error('Error verifying integrity:', error);
      return {
        valid: false,
        error: error.message,
        violations: []
      };
    }
  }

  /**
   * Generate audit report
   */
  async generateReport(criteria = {}) {
    const {
      startDate = new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      endDate = new Date(),
      groupBy = 'category'
    } = criteria;

    try {
      const events = await this.search({
        startDate,
        endDate,
        limit: 10000
      });

      const report = {
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        summary: {
          totalEvents: events.length,
          criticalEvents: events.filter(e => e.level === this.levels.CRITICAL).length,
          highEvents: events.filter(e => e.level === this.levels.HIGH).length,
          uniqueUsers: new Set(events.filter(e => e.userId).map(e => e.userId)).size,
          uniqueActions: new Set(events.map(e => e.action)).size
        },
        breakdown: {}
      };

      // Group events
      const grouped = {};
      for (const event of events) {
        const key = event[groupBy] || 'unknown';
        if (!grouped[key]) {
          grouped[key] = {
            total: 0,
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
            events: []
          };
        }

        grouped[key].total++;
        grouped[key][Object.keys(this.levels).find(k => this.levels[k] === event.level).toLowerCase()]++;
        grouped[key].events.push(event);
      }

      report.breakdown = grouped;

      return report;

    } catch (error) {
      console.error('Error generating audit report:', error);
      throw error;
    }
  }

  /**
   * Initialize current log file
   */
  async initializeLogFile() {
    const today = new Date().toISOString().split('T')[0];
    const fileName = this.logFilePattern.replace('YYYY-MM-DD', today);
    this.currentLogFile = path.join(this.auditLogDir, fileName);

    // Ensure file exists
    try {
      await fs.access(this.currentLogFile);
    } catch {
      await fs.writeFile(this.currentLogFile, '');
    }
  }

  /**
   * Add event to buffer
   */
  addToBuffer(event) {
    this.logBuffer.push(event);

    // Flush buffer if it's full
    if (this.logBuffer.length >= this.bufferSize) {
      setImmediate(() => this.flushBuffer());
    }
  }

  /**
   * Flush buffer to file
   */
  async flushBuffer() {
    if (this.logBuffer.length === 0) return;

    const eventsToWrite = [...this.logBuffer];
    this.logBuffer = [];

    try {
      const logLines = eventsToWrite.map(event => {
        const logEntry = this.enableEncryption ? this.encryptEvent(event) : event;
        return JSON.stringify(logEntry);
      }).join('\n') + '\n';

      await fs.appendFile(this.currentLogFile, logLines);

      // Update integrity if enabled
      if (this.enableIntegrityChecks) {
        await this.updateIntegrity();
      }

      this.stats.bufferFlushes++;
      this.emit('buffer-flushed', eventsToWrite.length);

    } catch (error) {
      console.error('Error flushing audit log buffer:', error);
      this.stats.failedWrites++;

      // Put events back in buffer if write failed
      this.logBuffer.unshift(...eventsToWrite);

      // Prevent buffer from growing too large
      if (this.logBuffer.length > this.maxBufferSize) {
        this.logBuffer = this.logBuffer.slice(0, this.maxBufferSize);
      }

      this.emit('write-error', error);
    }
  }

  /**
   * Start buffer flush timer
   */
  startBufferFlush() {
    this.flushTimer = setInterval(() => {
      this.flushBuffer();
    }, this.flushInterval);
  }

  /**
   * Setup log rotation
   */
  setupLogRotation() {
    // Run daily at midnight
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const msUntilMidnight = tomorrow - now;

    setTimeout(() => {
      this.rotateLogs();
      // Setup recurring rotation
      setInterval(() => this.rotateLogs(), 24 * 60 * 60 * 1000); // Daily
    }, msUntilMidnight);
  }

  /**
   * Rotate log files
   */
  async rotateLogs() {
    try {
      await this.initializeLogFile();
      this.emit('logs-rotated');
    } catch (error) {
      console.error('Error rotating logs:', error);
    }
  }

  /**
   * Clean up old log files
   */
  async cleanupOldLogs() {
    try {
      const files = await fs.readdir(this.auditLogDir);
      const cutoffTime = Date.now() - (this.logRetentionDays * 24 * 60 * 60 * 1000);

      for (const file of files) {
        if (file.startsWith('audit-') && file.endsWith('.log')) {
          const filePath = path.join(this.auditLogDir, file);
          const stats = await fs.stat(filePath);

          if (stats.mtime.getTime() < cutoffTime) {
            await fs.unlink(filePath);
            console.log(`Deleted old audit log: ${file}`);
          }
        }
      }
    } catch (error) {
      console.error('Error cleaning up old logs:', error);
    }
  }

  /**
   * Generate unique event ID
   */
  generateEventId() {
    return `audit_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Sanitize details for logging
   */
  sanitizeDetails(details) {
    const sanitized = { ...details };

    // Remove sensitive information
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'creditCard', 'ssn'];
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    // Remove large objects that could affect performance
    const maxObjectSize = 10000; // 10KB
    if (JSON.stringify(sanitized).length > maxObjectSize) {
      return { message: 'Details too large for audit log', size: JSON.stringify(sanitized).length };
    }

    return sanitized;
  }

  /**
   * Update statistics
   */
  updateStats(event) {
    this.stats.totalLogs++;

    const levelName = Object.keys(this.levels).find(k => this.levels[k] === event.level);
    this.stats.logsByLevel[levelName] = (this.stats.logsByLevel[levelName] || 0) + 1;

    this.stats.logsByCategory[event.category] = (this.stats.logsByCategory[event.category] || 0) + 1;

    if (event.userId) {
      this.stats.logsByUser[event.userId] = (this.stats.logsByUser[event.userId] || 0) + 1;
    }
  }

  /**
   * Get client IP address (simplified)
   */
  getClientIP() {
    return '127.0.0.1'; // Would be implemented based on request context
  }

  /**
   * Get log files in date range
   */
  async getLogFilesInRange(startDate, endDate) {
    const files = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const fileName = this.logFilePattern.replace('YYYY-MM-DD', dateStr);
      const filePath = path.join(this.auditLogDir, fileName);

      try {
        await fs.access(filePath);
        files.push(filePath);
      } catch {
        // File doesn't exist, skip
      }
    }

    return files;
  }

  /**
   * Calculate hash for integrity checking
   */
  calculateHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Load integrity data
   */
  async loadIntegrityData() {
    try {
      const content = await fs.readFile(this.integrityFile, 'utf8');
      return JSON.parse(content);
    } catch {
      return { files: {}, lastUpdated: Date.now() };
    }
  }

  /**
   * Update integrity data
   */
  async updateIntegrity() {
    if (!this.enableIntegrityChecks) return;

    try {
      const content = await fs.readFile(this.currentLogFile, 'utf8');
      const hash = this.calculateHash(content);

      let integrityData = await this.loadIntegrityData();
      integrityData.files[this.currentLogFile] = hash;
      integrityData.lastUpdated = Date.now();

      await fs.writeFile(this.integrityFile, JSON.stringify(integrityData, null, 2));
    } catch (error) {
      console.error('Error updating integrity data:', error);
    }
  }

  /**
   * Encrypt event (placeholder implementation)
   */
  encryptEvent(event) {
    // This would be implemented with proper encryption
    // For now, return the event as-is
    return event;
  }

  /**
   * Decrypt event (placeholder implementation)
   */
  decryptEvent(encryptedEvent) {
    // This would be implemented with proper decryption
    // For now, return the event as-is
    return encryptedEvent;
  }

  /**
   * Stop audit logging system
   */
  async stop() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Flush remaining buffer
    await this.flushBuffer();

    // Clean up old logs
    await this.cleanupOldLogs();

    console.log('Audit logging system stopped');
    this.emit('stopped');
  }

  /**
   * Get system status
   */
  getStatus() {
    return {
      enabled: this.enableAuditLogging,
      currentLogFile: this.currentLogFile,
      bufferSize: this.logBuffer.length,
      stats: this.getStats(),
      integrityChecksEnabled: this.enableIntegrityChecks,
      encryptionEnabled: this.enableEncryption,
      logRetentionDays: this.logRetentionDays
    };
  }
}

module.exports = AuditLogger;