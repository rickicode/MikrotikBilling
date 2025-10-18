/**
 * Shared Route Middleware Collection
 * Centralized middleware for route modules
 * @version 1.0.0
 */

const rateLimit = require('express-rate-limit');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');

class RouteMiddleware {
  constructor(fastify, options = {}) {
    this.fastify = fastify;
    this.options = {
      enableRateLimit: true,
      enableCompression: true,
      enableSecurity: true,
      enableCORS: true,
      defaultRateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
        message: 'Too many requests from this IP'
      },
      ...options
    };
  }

  /**
   * Authentication middleware factory
   */
  requireAuth(options = {}) {
    return async (request, reply) => {
      try {
        // Use existing auth middleware if available
        if (this.fastify.auth && this.fastify.auth.verifyToken) {
          await this.fastify.auth.verifyToken(request, reply);
        } else {
          // Fallback basic auth
          const token = request.headers.authorization?.replace('Bearer ', '');
          if (!token) {
            return reply.code(401).send({ error: 'Authentication required' });
          }
          // Additional validation logic here
        }
      } catch (error) {
        return reply.code(401).send({ error: 'Invalid authentication' });
      }
    };
  }

  /**
   * Role-based authorization middleware
   */
  requireRole(requiredRoles) {
    const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
    
    return async (request, reply) => {
      try {
        const user = request.user;
        if (!user) {
          return reply.code(401).send({ error: 'Authentication required' });
        }

        const userRole = user.role || user.user_type;
        if (!roles.includes(userRole)) {
          return reply.code(403).send({ 
            error: 'Insufficient permissions',
            required: roles,
            current: userRole
          });
        }
      } catch (error) {
        return reply.code(403).send({ error: 'Authorization failed' });
      }
    };
  }

  /**
   * Rate limiting middleware factory
   */
  rateLimit(options = {}) {
    if (!this.options.enableRateLimit) {
      return async (request, reply) => {}; // No-op
    }

    const config = {
      ...this.options.defaultRateLimit,
      ...options
    };

    return async (request, reply) => {
      // Fastify rate limiting implementation
      const key = request.ip;
      const now = Date.now();
      const windowStart = now - config.windowMs;

      // Simple in-memory rate limiting (use Redis in production)
      if (!this.fastify.rateLimitStore) {
        this.fastify.rateLimitStore = new Map();
      }

      const requests = this.fastify.rateLimitStore.get(key) || [];
      const validRequests = requests.filter(timestamp => timestamp > windowStart);

      if (validRequests.length >= config.max) {
        return reply.code(429).send({
          error: config.message,
          retryAfter: Math.ceil(config.windowMs / 1000)
        });
      }

      validRequests.push(now);
      this.fastify.rateLimitStore.set(key, validRequests);
    };
  }

  /**
   * Compression middleware
   */
  compression(options = {}) {
    return async (request, reply) => {
      if (!this.options.enableCompression) {
        return;
      }

      // Set compression headers
      const acceptEncoding = request.headers['accept-encoding'] || '';
      if (acceptEncoding.includes('gzip')) {
        reply.header('Content-Encoding', 'gzip');
      } else if (acceptEncoding.includes('deflate')) {
        reply.header('Content-Encoding', 'deflate');
      }
    };
  }

  /**
   * Security headers middleware
   */
  security(options = {}) {
    return async (request, reply) => {
      if (!this.options.enableSecurity) {
        return;
      }

      // Set security headers
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Frame-Options', 'DENY');
      reply.header('X-XSS-Protection', '1; mode=block');
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
      reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    };
  }

  /**
   * CORS middleware
   */
  cors(options = {}) {
    const defaultConfig = {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    };

    const config = { ...defaultConfig, ...options };

    return async (request, reply) => {
      if (!this.options.enableCORS) {
        return;
      }

      const origin = request.headers.origin;
      if (config.origin.includes('*') || config.origin.includes(origin)) {
        reply.header('Access-Control-Allow-Origin', origin || '*');
      }

      reply.header('Access-Control-Allow-Methods', config.methods.join(', '));
      reply.header('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
      reply.header('Access-Control-Allow-Credentials', config.credentials.toString());

      if (request.method === 'OPTIONS') {
        return reply.code(204).send();
      }
    };
  }

  /**
   * Request logging middleware
   */
  requestLogger(options = {}) {
    const { level = 'info', includeBody = false } = options;

    return async (request, reply) => {
      const startTime = Date.now();
      
      this.fastify.log[level]('Request started', {
        method: request.method,
        url: request.url,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        ...(includeBody && { body: request.body })
      });

      // Hook to log response
      reply.addHook('onSend', async () => {
        const duration = Date.now() - startTime;
        this.fastify.log[level]('Request completed', {
          method: request.method,
          url: request.url,
          statusCode: reply.statusCode,
          duration: `${duration}ms`,
          ip: request.ip
        });
      });
    };
  }

  /**
   * Input validation middleware
   */
  validateInput(schema, options = {}) {
    return async (request, reply) => {
      try {
        // Use Fastify's built-in schema validation if available
        if (this.fastify.validate && schema) {
          const { error } = this.fastify.validate(schema, request.body);
          if (error) {
            return reply.code(400).send({
              error: 'Validation failed',
              details: error.details
            });
          }
        }
      } catch (error) {
        return reply.code(400).send({
          error: 'Invalid input data',
          message: error.message
        });
      }
    };
  }

  /**
   * Cache middleware
   */
  cache(options = {}) {
    const { ttl = 300, keyGenerator = null } = options; // Default 5 minutes

    return async (request, reply) => {
      if (!this.fastify.cache) {
        return; // No cache service available
      }

      const cacheKey = keyGenerator 
        ? keyGenerator(request)
        : `${request.method}:${request.url}:${JSON.stringify(request.query)}`;

      try {
        // Try to get from cache
        const cached = await this.fastify.cache.get(cacheKey);
        if (cached) {
          reply.header('X-Cache', 'HIT');
          return reply.send(cached);
        }

        // Hook to cache response
        reply.addHook('onSend', async (request, reply, payload) => {
          await this.fastify.cache.set(cacheKey, payload, ttl);
          reply.header('X-Cache', 'MISS');
          return payload;
        });
      } catch (error) {
        this.fastify.log.warn('Cache middleware error', { error: error.message });
        // Continue without caching
      }
    };
  }

  /**
   * API versioning middleware
   */
  apiVersion(versions = ['v1']) {
    return async (request, reply) => {
      const requestedVersion = request.headers['api-version'] || 
                              request.query.version || 
                              'v1';

      if (!versions.includes(requestedVersion)) {
        return reply.code(400).send({
          error: 'Unsupported API version',
          supported: versions,
          requested: requestedVersion
        });
      }

      request.apiVersion = requestedVersion;
      reply.header('API-Version', requestedVersion);
    };
  }

  /**
   * Audit logging middleware
   */
  auditLogger(options = {}) {
    const { logLevel = 'info', includeSensitiveData = false } = options;

    return async (request, reply) => {
      // Only audit sensitive operations
      const sensitiveMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
      const sensitivePaths = ['/users', '/payments', '/admin', '/settings'];

      const isSensitive = sensitiveMethods.includes(request.method) ||
                         sensitivePaths.some(path => request.url.includes(path));

      if (!isSensitive) {
        return;
      }

      const auditData = {
        timestamp: new Date().toISOString(),
        method: request.method,
        url: request.url,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        userId: request.user?.id,
        ...(includeSensitiveData && { body: request.body })
      };

      this.fastify.log[logLevel]('Audit log', auditData);

      // Store in database if audit service is available
      if (this.fastify.auditLogger) {
        try {
          await this.fastify.auditLogger.log(auditData);
        } catch (error) {
          this.fastify.log.error('Failed to store audit log', { error: error.message });
        }
      }
    };
  }

  /**
   * Error handling middleware
   */
  errorHandler(options = {}) {
    const { includeStack = process.env.NODE_ENV !== 'production' } = options;

    return async (error, request, reply) => {
      this.fastify.log.error('Route error', {
        error: error.message,
        stack: error.stack,
        url: request.url,
        method: request.method,
        ip: request.ip
      });

      const response = {
        error: error.message || 'Internal server error',
        timestamp: new Date().toISOString(),
        path: request.url
      };

      if (includeStack) {
        response.stack = error.stack;
      }

      if (error.code) {
        response.code = error.code;
      }

      const statusCode = error.statusCode || error.status || 500;
      return reply.code(statusCode).send(response);
    };
  }

  /**
   * Middleware pipeline factory
   */
  pipeline(middlewares) {
    return async (request, reply) => {
      for (const middleware of middlewares) {
        const result = await middleware(request, reply);
        if (reply.sent) {
          return result;
        }
      }
    };
  }

  /**
   * Get common middleware combinations
   */
  getCommon() {
    return {
      // Standard API middleware
      api: this.pipeline([
        this.cors(),
        this.security(),
        this.compression(),
        this.requestLogger(),
        this.apiVersion()
      ]),

      // Authenticated API middleware
      authenticated: this.pipeline([
        this.cors(),
        this.security(),
        this.compression(),
        this.requireAuth(),
        this.requestLogger(),
        this.apiVersion()
      ]),

      // Admin middleware
      admin: this.pipeline([
        this.cors(),
        this.security(),
        this.compression(),
        this.requireAuth(),
        this.requireRole(['admin', 'super_admin']),
        this.auditLogger(),
        this.requestLogger(),
        this.apiVersion()
      ]),

      // Public but rate-limited middleware
      public: this.pipeline([
        this.cors(),
        this.security(),
        this.compression(),
        this.rateLimit({ max: 50 }), // Stricter rate limit for public
        this.requestLogger(),
        this.apiVersion()
      ]),

      // Cached GET middleware
      cached: (ttl = 300) => this.pipeline([
        this.cors(),
        this.security(),
        this.compression(),
        this.cache({ ttl }),
        this.requestLogger(),
        this.apiVersion()
      ])
    };
  }
}

module.exports = RouteMiddleware;