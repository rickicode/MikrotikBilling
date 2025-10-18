/**
 * Route Utility Functions and Decorators
 * Common helpers for route development
 * @version 1.0.0
 */

class RouteHelpers {
  constructor(fastify) {
    this.fastify = fastify;
  }

  /**
   * Success response formatter
   */
  success(data, message = 'Success', meta = {}) {
    return {
      success: true,
      data,
      message,
      timestamp: new Date().toISOString(),
      ...meta
    };
  }

  /**
   * Paginated response formatter
   */
  paginated(items, total, page, limit, message = 'Data retrieved successfully') {
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return this.success(items, message, {
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? page + 1 : null,
        prevPage: hasPrevPage ? page - 1 : null
      }
    });
  }

  /**
   * Error response formatter
   */
  error(message, code = 500, details = null) {
    return {
      success: false,
      error: message,
      code,
      timestamp: new Date().toISOString(),
      ...(details && { details })
    };
  }

  /**
   * Validation error formatter
   */
  validationError(errors) {
    return this.error('Validation failed', 400, {
      type: 'validation',
      errors: Array.isArray(errors) ? errors : [errors]
    });
  }

  /**
   * Not found error formatter
   */
  notFound(resource = 'Resource') {
    return this.error(`${resource} not found`, 404);
  }

  /**
   * Unauthorized error formatter
   */
  unauthorized(message = 'Unauthorized access') {
    return this.error(message, 401);
  }

  /**
   * Forbidden error formatter
   */
  forbidden(message = 'Access forbidden') {
    return this.error(message, 403);
  }

  /**
   * Conflict error formatter
   */
  conflict(message = 'Resource conflict') {
    return this.error(message, 409);
  }

  /**
   * Rate limit error formatter
   */
  rateLimit(retryAfter) {
    return this.error('Rate limit exceeded', 429, {
      retryAfter,
      type: 'rate_limit'
    });
  }

  /**
   * Async route handler wrapper
   */
  asyncHandler(fn) {
    return async (request, reply) => {
      try {
        return await fn(request, reply);
      } catch (error) {
        this.fastify.log.error('Route handler error', {
          error: error.message,
          stack: error.stack,
          url: request.url,
          method: request.method
        });

        // Handle specific error types
        if (error.name === 'ValidationError') {
          return reply.code(400).send(this.validationError(error.details));
        }

        if (error.code === 'NOT_FOUND') {
          return reply.code(404).send(this.notFound(error.resource));
        }

        if (error.code === 'UNAUTHORIZED') {
          return reply.code(401).send(this.unauthorized(error.message));
        }

        if (error.code === 'FORBIDDEN') {
          return reply.code(403).send(this.forbidden(error.message));
        }

        if (error.code === 'CONFLICT') {
          return reply.code(409).send(this.conflict(error.message));
        }

        // Default error response
        const statusCode = error.statusCode || error.status || 500;
        return reply.code(statusCode).send(this.error(
          process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : error.message,
          statusCode
        ));
      }
    };
  }

  /**
   * Database query helper with error handling
   */
  async query(sql, params = [], options = {}) {
    const { 
      notFound = null, 
      conflict = null, 
      transaction = null 
    } = options;

    try {
      const db = transaction || this.fastify.db;
      const result = await db.query(sql, params);

      // Handle not found cases
      if (notFound && (!result.rows || result.rows.length === 0)) {
        const error = new Error(notFound.message || 'Resource not found');
        error.code = 'NOT_FOUND';
        error.resource = notFound.resource || 'Resource';
        throw error;
      }

      // Handle conflict cases
      if (conflict && result.rows && result.rows.length > 0) {
        const error = new Error(conflict.message || 'Resource already exists');
        error.code = 'CONFLICT';
        throw error;
      }

      return result;
    } catch (error) {
      // Handle database-specific errors
      if (error.code === '23505') { // Unique constraint violation
        const conflictError = new Error('Resource already exists');
        conflictError.code = 'CONFLICT';
        throw conflictError;
      }

      if (error.code === '23503') { // Foreign key constraint violation
        const fkError = new Error('Referenced resource does not exist');
        fkError.code = 'FOREIGN_KEY_VIOLATION';
        throw fkError;
      }

      if (error.code === '23502') { // Not null constraint violation
        const nnError = new Error('Required field is missing');
        nnError.code = 'NOT_NULL_VIOLATION';
        throw nnError;
      }

      throw error;
    }
  }

  /**
   * Transaction helper
   */
  async transaction(callback) {
    const client = await this.fastify.db.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Cache helper
   */
  async cache(key, fetchFn, ttl = 300) {
    if (!this.fastify.cache) {
      return await fetchFn();
    }

    try {
      // Try to get from cache
      const cached = await this.fastify.cache.get(key);
      if (cached) {
        return cached;
      }

      // Fetch fresh data
      const data = await fetchFn();
      await this.fastify.cache.set(key, data, ttl);
      return data;
    } catch (error) {
      this.fastify.log.warn('Cache helper error', { error: error.message });
      return await fetchFn();
    }
  }

  /**
   * Pagination helper
   */
  getPaginationParams(query, defaultLimit = 20, maxLimit = 100) {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit) || defaultLimit));
    const offset = (page - 1) * limit;

    return { page, limit, offset };
  }

  /**
   * Search helper
   */
  getSearchParams(query, searchableFields = []) {
    const search = query.search || '';
    const filters = {};

    // Parse filter parameters
    Object.keys(query).forEach(key => {
      if (key !== 'search' && key !== 'page' && key !== 'limit' && key !== 'sort') {
        filters[key] = query[key];
      }
    });

    // Build search clause
    let searchClause = '';
    const searchParams = [];

    if (search && searchableFields.length > 0) {
      const searchConditions = searchableFields.map((field, index) => {
        searchParams.push(`%${search}%`);
        return `${field} ILIKE $${searchParams.length}`;
      });
      searchClause = `AND (${searchConditions.join(' OR ')})`;
    }

    return { search, searchClause, searchParams, filters };
  }

  /**
   * Sort helper
   */
  getSortParams(query, allowedFields = [], defaultField = 'created_at', defaultDirection = 'DESC') {
    const sort = query.sort || defaultField;
    const order = query.order || defaultDirection.toUpperCase();

    // Validate sort field
    const validSortField = allowedFields.includes(sort) ? sort : defaultField;
    const validOrder = ['ASC', 'DESC'].includes(order) ? order : defaultDirection;

    return { sort: validSortField, order: validOrder };
  }

  /**
   * File upload helper
   */
  async handleFileUpload(request, options = {}) {
    const {
      maxSize = 10 * 1024 * 1024, // 10MB
      allowedTypes = ['image/jpeg', 'image/png', 'image/gif'],
      destination = 'uploads/'
    } = options;

    if (!request.isMultipart()) {
      throw new Error('Request must be multipart');
    }

    const files = [];
    const file = await request.file({
      limits: { fileSize: maxSize }
    });

    if (!file) {
      throw new Error('No file uploaded');
    }

    // Validate file type
    if (!allowedTypes.includes(file.mimetype)) {
      throw new Error(`File type ${file.mimetype} not allowed`);
    }

    // Generate unique filename
    const ext = file.filename.split('.').pop();
    const uniqueFilename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${ext}`;
    const filepath = path.join(destination, uniqueFilename);

    // Save file
    await pump(file.file, fs.createWriteStream(filepath));

    files.push({
      originalname: file.filename,
      filename: uniqueFilename,
      mimetype: file.mimetype,
      size: file.file.bytesRead,
      path: filepath
    });

    return files;
  }

  /**
   * Event publishing helper
   */
  async publishEvent(eventType, data, options = {}) {
    if (!this.fastify.eventBus) {
      this.fastify.log.warn('Event bus not available, skipping event publishing');
      return;
    }

    try {
      const event = {
        type: eventType,
        data,
        timestamp: new Date().toISOString(),
        source: 'route',
        ...options
      };

      await this.fastify.eventBus.publish(eventType, event);
      this.fastify.log.debug('Event published', { eventType, eventId: event.id });
    } catch (error) {
      this.fastify.log.error('Failed to publish event', { 
        eventType, 
        error: error.message 
      });
    }
  }

  /**
   * Metrics collection helper
   */
  async recordMetric(name, value, tags = {}) {
    if (!this.fastify.metrics) {
      return;
    }

    try {
      await this.fastify.metrics.record(name, value, {
        route: true,
        ...tags
      });
    } catch (error) {
      this.fastify.log.warn('Failed to record metric', { 
        name, 
        error: error.message 
      });
    }
  }

  /**
   * Request context helper
   */
  getContext(request) {
    return {
      requestId: request.id || request.headers['x-request-id'],
      userId: request.user?.id,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      method: request.method,
      url: request.url,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Response time tracking
   */
  trackResponseTime(startTime, route, statusCode) {
    const duration = Date.now() - startTime;
    this.recordMetric('route_response_time', duration, {
      route,
      status_code: statusCode.toString()
    });
  }

  /**
   * API documentation helper
   */
  generateDocs(routes) {
    const docs = {
      openapi: '3.0.0',
      info: {
        title: 'Mikrotik Billing API',
        version: '1.0.0',
        description: 'API for Mikrotik Billing System'
      },
      paths: {}
    };

    routes.forEach(route => {
      const path = route.path;
      const method = route.method.toLowerCase();

      if (!docs.paths[path]) {
        docs.paths[path] = {};
      }

      docs.paths[path][method] = {
        summary: route.summary || `${method} ${path}`,
        description: route.description || '',
        tags: route.tags || [],
        parameters: route.parameters || [],
        responses: {
          200: { description: 'Success' },
          400: { description: 'Bad Request' },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden' },
          404: { description: 'Not Found' },
          500: { description: 'Internal Server Error' }
        }
      };

      if (route.requestBody) {
        docs.paths[path][method].requestBody = route.requestBody;
      }

      if (route.responses) {
        Object.assign(docs.paths[path][method].responses, route.responses);
      }
    });

    return docs;
  }
}

/**
 * Route decorator factory
 */
function routeDecorator(fastify) {
  const helpers = new RouteHelpers(fastify);

  fastify.decorateReply('success', function(data, message, meta) {
    return this.send(helpers.success(data, message, meta));
  });

  fastify.decorateReply('paginated', function(items, total, page, limit, message) {
    return this.send(helpers.paginated(items, total, page, limit, message));
  });

  fastify.decorateReply('error', function(message, code, details) {
    return this.code(code || 500).send(helpers.error(message, code, details));
  });

  fastify.decorate('asyncHandler', helpers.asyncHandler.bind(helpers));
  fastify.decorate('query', helpers.query.bind(helpers));
  fastify.decorate('transaction', helpers.transaction.bind(helpers));
  fastify.decorate('cache', helpers.cache.bind(helpers));
  fastify.decorate('publishEvent', helpers.publishEvent.bind(helpers));
  fastify.decorate('recordMetric', helpers.recordMetric.bind(helpers));
}

module.exports = {
  RouteHelpers,
  routeDecorator
};