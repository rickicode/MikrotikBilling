// Global Error Handler Middleware
// Menangani semua error secara konsisten di seluruh aplikasi

class GlobalErrorHandler {
  constructor(fastify) {
    this.fastify = fastify;
    this.setupErrorHandler();
  }

  setupErrorHandler() {
    // Set global error handler untuk Fastify
    this.fastify.setErrorHandler((error, request, reply) => {
      return this.handleAllErrors(error, request, reply);
    });

    // Set custom handler untuk async errors
    this.fastify.addHook('onError', async (request, reply, error) => {
      return this.handleAllErrors(error, request, reply);
    });
  }

  handleAllErrors(error, request, reply) {
    // Generate unique error ID untuk tracking
    const errorId = `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // Log error detail ke system log
    this.logDetailedError(error, request, errorId);

    // Tentukan status code berdasarkan error type
    let statusCode = 500;
    let errorTitle = 'Internal Server Error';

    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      statusCode = 409;
      errorTitle = 'Data Conflict';
    } else if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      statusCode = 400;
      errorTitle = 'Invalid Reference';
    } else if (error.code === 'SQLITE_CONSTRAINT_NOTNULL') {
      statusCode = 400;
      errorTitle = 'Required Field Missing';
    } else if (error.message && error.message.includes('no such table')) {
      statusCode = 500;
      errorTitle = 'Database Schema Error';
    } else if (error.message && error.message.includes('no such column')) {
      statusCode = 500;
      errorTitle = 'Database Column Error';
    } else if (error.statusCode) {
      statusCode = error.statusCode;
      errorTitle = error.message || 'Request Error';
    } else if (error.validation) {
      statusCode = 400;
      errorTitle = 'Validation Error';
    }

    // Kirim response detail error
    const errorResponse = {
      success: false,
      error: errorTitle,
      errorId: errorId,
      timestamp: new Date().toISOString(),
      details: {
        message: error.message,
        type: error.constructor.name,
        statusCode: statusCode,
        url: request.url,
        method: request.method,
        ip: request.ip,
        userAgent: request.headers['user-agent']
      }
    };

    // tambahkan context info jika ada
    if (request.query && Object.keys(request.query).length > 0) {
      errorResponse.details.query = request.query;
    }

    if (request.params && Object.keys(request.params).length > 0) {
      errorResponse.details.params = request.params;
    }

    // Untuk development, tambahkan stack trace
    if (process.env.NODE_ENV !== 'production') {
      errorResponse.details.stack = error.stack;
      errorResponse.details.context = {
        headers: request.headers,
        body: request.body
      };
    }

    return reply.code(statusCode).send(errorResponse);
  }

  logDetailedError(error, request, errorId) {
    const logData = {
      errorId: errorId,
      message: error.message,
      type: error.constructor.name,
      stack: error.stack,
      url: request.url,
      method: request.method,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      timestamp: new Date().toISOString(),
      query: request.query,
      params: request.params,
      headers: request.headers,
      body: request.body
    };

    // Log ke Fastify logger
    this.fastify.log.error(`[${errorId}] ${error.constructor.name}: ${error.message}`, logData);

    // Jika critical error, bisa tambahkan external logging/alerting
    if (this.isCriticalError(error)) {
      this.fastify.log.error(`[CRITICAL] ${errorId}: Critical system error detected`, {
        errorId,
        type: 'CRITICAL_ERROR',
        ...logData
      });
    }
  }

  isCriticalError(error) {
    // Tentukan apakah error termasuk critical
    const criticalPatterns = [
      'database connection failed',
      'connection timeout',
      'out of memory',
      'disk full',
      'permission denied',
      'authentication failed'
    ];

    return criticalPatterns.some(pattern =>
      error.message.toLowerCase().includes(pattern)
    );
  }
}

// Helper function untuk route-level error handling (jika masih diperlukan)
function createDetailedError(reply, error, request, context = {}) {
  const errorId = `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  return reply.code(500).send({
    success: false,
    error: context.errorTitle || 'Operation Failed',
    errorId: errorId,
    timestamp: new Date().toISOString(),
    details: {
      message: error.message,
      type: error.constructor.name,
      url: request.url,
      method: request.method,
      context: context,
      ...context.details
    }
  });
}

module.exports = {
  GlobalErrorHandler,
  createDetailedError
};