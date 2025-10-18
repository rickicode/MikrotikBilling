const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class LoggerService {
  constructor(options = {}) {
    this.options = {
      logLevel: process.env.LOG_LEVEL || 'info',
      logDirectory: process.env.LOG_DIRECTORY || './logs',
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      enableConsole: true,
      enableFile: true,
      enableStructured: process.env.NODE_ENV === 'production',
      ...options
    };

    this.logLevels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4
    };

    this.currentLogLevel = this.logLevels[this.options.logLevel] || 2;

    // Ensure log directory exists
    if (this.options.enableFile) {
      this.ensureLogDirectory();
    }

    // Initialize loggers
    this.initializeLoggers();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.options.logDirectory)) {
      fs.mkdirSync(this.options.logDirectory, { recursive: true });
    }
  }

  initializeLoggers() {
    this.loggers = {
      application: this.createLogger('application'),
      security: this.createLogger('security'),
      performance: this.createLogger('performance'),
      database: this.createLogger('database'),
      cache: this.createLogger('cache'),
      mikrotik: this.createLogger('mikrotik'),
      whatsapp: this.createLogger('whatsapp'),
      payments: this.createLogger('payments'),
      api: this.createLogger('api'),
      auth: this.createLogger('auth')
    };
  }

  createLogger(category) {
    const logFile = path.join(this.options.logDirectory, `${category}.log`);

    return {
      log: (level, message, meta = {}) => {
        if (this.logLevels[level] <= this.currentLogLevel) {
          const logEntry = this.formatLogEntry(level, message, meta, category);

          // Console output
          if (this.options.enableConsole) {
            this.consoleLog(level, logEntry, category);
          }

          // File output
          if (this.options.enableFile) {
            this.fileLog(logFile, logEntry);
          }
        }
      },

      error: (message, meta = {}) => this.loggers[category]?.log('error', message, meta),
      warn: (message, meta = {}) => this.loggers[category]?.log('warn', message, meta),
      info: (message, meta = {}) => this.loggers[category]?.log('info', message, meta),
      debug: (message, meta = {}) => this.loggers[category]?.log('debug', message, meta),
      trace: (message, meta = {}) => this.loggers[category]?.log('trace', message, meta)
    };
  }

  formatLogEntry(level, message, meta, category) {
    const timestamp = new Date().toISOString();
    const requestId = meta.requestId || this.generateRequestId();

    if (this.options.enableStructured) {
      // JSON structured logging
      return JSON.stringify({
        timestamp,
        level: level.toUpperCase(),
        category,
        message,
        requestId,
        ...meta
      });
    } else {
      // Human-readable format
      const metaString = Object.keys(meta).length > 0
        ? ' | ' + Object.entries(meta)
            .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
            .join(' ')
        : '';

      return `[${timestamp}] [${level.toUpperCase()}] [${category}] ${message}${metaString}`;
    }
  }

  consoleLog(level, logEntry, category) {
    const colors = {
      error: '\x1b[31m',   // Red
      warn: '\x1b[33m',    // Yellow
      info: '\x1b[36m',    // Cyan
      debug: '\x1b[35m',   // Magenta
      trace: '\x1b[37m'    // White
    };

    const reset = '\x1b[0m';
    const color = colors[level] || '';

    console.log(`${color}${logEntry}${reset}`);
  }

  fileLog(logFile, logEntry) {
    try {
      // Rotate log if file is too large
      if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);
        if (stats.size > this.options.maxFileSize) {
          this.rotateLogFile(logFile);
        }
      }

      // Append to log file
      fs.appendFileSync(logFile, logEntry + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  rotateLogFile(logFile) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedFile = logFile.replace('.log', `-${timestamp}.log`);

      fs.renameSync(logFile, rotatedFile);

      // Clean up old log files
      this.cleanupOldLogFiles(logFile);
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }

  cleanupOldLogFiles(logFile) {
    try {
      const logDir = path.dirname(logFile);
      const logBase = path.basename(logFile, '.log');
      const files = fs.readdirSync(logDir)
        .filter(file => file.startsWith(logBase) && file.includes('-'))
        .map(file => ({
          name: file,
          path: path.join(logDir, file),
          time: fs.statSync(path.join(logDir, file)).mtime
        }))
        .sort((a, b) => b.time - a.time);

      // Keep only the most recent files
      if (files.length > this.options.maxFiles) {
        const filesToDelete = files.slice(this.options.maxFiles);
        filesToDelete.forEach(file => {
          try {
            fs.unlinkSync(file.path);
          } catch (error) {
            console.error('Failed to delete old log file:', error);
          }
        });
      }
    } catch (error) {
      console.error('Failed to cleanup old log files:', error);
    }
  }

  generateRequestId() {
    return crypto.randomBytes(16).toString('hex');
  }

  // Specialized logging methods
  logRequest(request, responseTime = null) {
    const meta = {
      requestId: request.id,
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      adminId: request.admin?.id,
      adminUsername: request.admin?.username
    };

    if (responseTime !== null) {
      meta.responseTime = responseTime;
    }

    this.loggers.api.info('HTTP Request', meta);
  }

  logResponse(request, statusCode, responseTime) {
    const meta = {
      requestId: request.id,
      statusCode,
      responseTime,
      contentLength: responseTime > 1000 ? 'slow_response' : 'normal'
    };

    const level = statusCode >= 400 ? 'error' : 'info';
    this.loggers.api[level]('HTTP Response', meta);
  }

  logSecurity(event, details) {
    const meta = {
      timestamp: new Date().toISOString(),
      eventId: this.generateRequestId(),
      ...details
    };

    const level = event.includes('failed') || event.includes('error') ? 'error' : 'warn';
    this.loggers.security[level](`Security Event: ${event}`, meta);
  }

  logPerformance(operation, duration, details = {}) {
    const meta = {
      operation,
      duration,
      timestamp: new Date().toISOString(),
      ...details
    };

    const level = duration > 5000 ? 'warn' : duration > 1000 ? 'info' : 'debug';
    this.loggers.performance[level](`Performance: ${operation}`, meta);
  }

  logDatabase(query, duration, error = null) {
    const meta = {
      query: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
      duration,
      timestamp: new Date().toISOString()
    };

    if (error) {
      meta.error = error.message;
      this.loggers.database.error('Database Query Failed', meta);
    } else {
      const level = duration > 1000 ? 'warn' : 'debug';
      this.loggers.database[level]('Database Query', meta);
    }
  }

  logCache(operation, key, hit = null, duration = null) {
    const meta = {
      operation,
      key: key.substring(0, 100),
      hit,
      duration,
      timestamp: new Date().toISOString()
    };

    const level = hit === false ? 'debug' : 'trace';
    this.loggers.cache[level](`Cache ${operation}`, meta);
  }

  logMikrotik(operation, device, duration, error = null) {
    const meta = {
      operation,
      device,
      duration,
      timestamp: new Date().toISOString()
    };

    if (error) {
      meta.error = error.message;
      this.loggers.mikrotik.error('Mikrotik Operation Failed', meta);
    } else {
      const level = duration > 5000 ? 'warn' : 'info';
      this.loggers.mikrotik[level]('Mikrotik Operation', meta);
    }
  }

  logWhatsApp(operation, recipient, status, error = null) {
    const meta = {
      operation,
      recipient: recipient.replace(/@.*/, '@***'), // Privacy
      status,
      timestamp: new Date().toISOString()
    };

    if (error) {
      meta.error = error.message;
      this.loggers.whatsapp.error('WhatsApp Operation Failed', meta);
    } else {
      this.loggers.whatsapp.info('WhatsApp Operation', meta);
    }
  }

  logPayment(operation, amount, method, status, error = null) {
    const meta = {
      operation,
      amount,
      method,
      status,
      timestamp: new Date().toISOString()
    };

    if (error) {
      meta.error = error.message;
      this.loggers.payments.error('Payment Operation Failed', meta);
    } else {
      const level = status === 'success' ? 'info' : 'warn';
      this.loggers.payments[level]('Payment Operation', meta);
    }
  }

  logAuthentication(event, details) {
    const meta = {
      timestamp: new Date().toISOString(),
      eventId: this.generateRequestId(),
      ...details
    };

    const level = event.includes('failed') || event.includes('error') ? 'error' : 'info';
    this.loggers.auth[level](`Authentication: ${event}`, meta);
  }

  // System event logging
  logSystem(event, details = {}) {
    const meta = {
      timestamp: new Date().toISOString(),
      hostname: require('os').hostname(),
      pid: process.pid,
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      ...details
    };

    this.loggers.application.info(`System: ${event}`, meta);
  }

  // Error logging with stack trace
  logError(error, context = {}) {
    const meta = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
      timestamp: new Date().toISOString(),
      ...context
    };

    this.loggers.application.error('Application Error', meta);
  }

  // Get log statistics
  getLogStatistics() {
    const stats = {};

    if (!this.options.enableFile) {
      return { error: 'File logging not enabled' };
    }

    try {
      for (const category of Object.keys(this.loggers)) {
        const logFile = path.join(this.options.logDirectory, `${category}.log`);

        if (fs.existsSync(logFile)) {
          const stats = fs.statSync(logFile);
          stats[category] = {
            size: stats.size,
            modified: stats.mtime,
            exists: true
          };
        } else {
          stats[category] = {
            exists: false
          };
        }
      }

      return stats;
    } catch (error) {
      return { error: error.message };
    }
  }

  // Cleanup old logs
  cleanupLogs() {
    if (!this.options.enableFile) return;

    try {
      const files = fs.readdirSync(this.options.logDirectory);
      const now = Date.now();
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

      files.forEach(file => {
        const filePath = path.join(this.options.logDirectory, file);
        const stats = fs.statSync(filePath);

        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
          console.log(`Deleted old log file: ${file}`);
        }
      });
    } catch (error) {
      console.error('Failed to cleanup logs:', error);
    }
  }

  // Get logger instance for specific category
  getLogger(category) {
    return this.loggers[category] || this.loggers.application;
  }
}

module.exports = LoggerService;