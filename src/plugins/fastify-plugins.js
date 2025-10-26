/**
 * Core Fastify Plugins Configuration
 * 
 * Optimized Fastify plugin configurations with proper error handling,
 * performance monitoring, and environment-specific settings.
 */

const fp = require('fastify-plugin');
const LoggerService = require('../services/LoggerService');

const logger = new LoggerService('FastifyPlugins');

/**
 * Database Plugin
 * Handles database connection pooling and configuration
 */
const databasePlugin = fp(async (server, options) => {
  const DatabaseConfig = require('../config/database');
  const databaseConfig = new DatabaseConfig();

  try {
    // Test database connection
    await databaseConfig.query('SELECT 1 as test');
    
    server.decorate('db', databaseConfig);
    server.decorate('primaryDb', databaseConfig.getPrimaryPool());
    server.decorate('replicaDb', databaseConfig.getReplicaPool());

    // Add database health check
    server.addHook('onReady', async () => {
      const health = await databaseConfig.healthCheck();
      logger.info('Database plugin initialized', health);
    });

    logger.info('Database plugin loaded successfully');
  } catch (error) {
    logger.error('Database plugin initialization failed', { error: error.message });
    throw error;
  }
}, {
  name: 'database',
  dependencies: []
});

/**
 * Redis Cache Plugin
 * Handles Redis connection and caching operations
 */
const cachePlugin = fp(async (server, options) => {
  const CacheService = require('../services/CacheService');
  
  try {
    const cacheService = new CacheService();
    
    // Test cache connectivity
    const healthCheck = await cacheService.healthCheck();
    
    if (healthCheck.status !== 'healthy') {
      logger.warn('Redis cache not available, running without cache');
      server.decorate('cache', null);
      server.decorate('redis', null);
    } else {
      server.decorate('cache', cacheService);
      server.decorate('redis', cacheService.getClient());
      logger.info('Cache plugin initialized', healthCheck);
    }
  } catch (error) {
    logger.warn('Cache plugin initialization failed, continuing without cache', {
      error: error.message
    });
    server.decorate('cache', null);
    server.decorate('redis', null);
  }
}, {
  name: 'cache',
  dependencies: ['database']
});

/**
 * Security Plugin
 * Configures security headers, CORS, and other security features
 */
const securityPlugin = fp(async (server, options) => {
  // CORS configuration
  await server.register(require('@fastify/cors'), {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  });

  // Security headers
  await server.register(require('@fastify/helmet'), {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:"]
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  });

  // CSRF protection
  await server.register(require('@fastify/csrf-protection'), {
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    }
  });

  // Rate limiting
  await server.register(require('@fastify/rate-limit'), {
    global: true,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    timeWindow: '1 minute',
    skipOnError: false,
    keyGenerator: (request) => {
      return request.ip || request.headers['x-forwarded-for'] || 'unknown';
    },
    errorResponseBuilder: (request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded, retry in ${context.ttl} seconds`,
      expiresIn: context.ttl
    })
  });

  logger.info('Security plugin initialized');
}, {
  name: 'security',
  dependencies: []
});

/**
 * Session Management Plugin
 * Handles user sessions with Redis or memory storage
 */
const sessionPlugin = fp(async (server, options) => {
  const SessionManager = require('../services/SessionManager');
  
  try {
    const sessionManager = new SessionManager(
      server.db || server.primaryDb,
      {
        sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 30 * 24 * 60 * 60 * 1000,
        maxSessionsPerUser: parseInt(process.env.MAX_SESSIONS_PER_USER) || 5,
        cookieOptions: {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: parseInt(process.env.SESSION_TIMEOUT) || 30 * 24 * 60 * 60 * 1000
        }
      }
    );

    server.decorate('sessionManager', sessionManager);

    // Add session cleanup hook
    server.addHook('onClose', async () => {
      await sessionManager.shutdown();
    });

    logger.info('Session plugin initialized');
  } catch (error) {
    logger.error('Session plugin initialization failed', { error: error.message });
    throw error;
  }
}, {
  name: 'session',
  dependencies: ['database', 'cache']
});

/**
 * Compression Plugin
 * Handles response compression for better performance
 */
const compressionPlugin = fp(async (server, options) => {
  await server.register(require('@fastify/compress'), {
    global: true,
    encodings: ['gzip', 'deflate', 'br'],
    threshold: 1024, // Only compress responses larger than 1KB
    onUnsupportedEncoding: (encoding, request, reply) => {
      reply.code(415).send({ error: 'Unsupported encoding' });
    }
  });

  logger.info('Compression plugin initialized');
}, {
  name: 'compression',
  dependencies: []
});

/**
 * Static Files Plugin
 * Serves static assets with proper caching headers
 */
const staticPlugin = fp(async (server, options) => {
  await server.register(require('@fastify/static'), {
    root: require('path').join(__dirname, '../../public'),
    prefix: '/public/',
    constraints: {},
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0',
    immutable: process.env.NODE_ENV === 'production',
    decorateReply: true
  });

  logger.info('Static files plugin initialized');
}, {
  name: 'static',
  dependencies: []
});

/**
 * View Engine Plugin
 * Configures EJS templating engine
 */
const viewPlugin = fp(async (server, options) => {
  await server.register(require('@fastify/view'), {
    engine: {
      ejs: require('ejs')
    },
    root: require('path').join(__dirname, '../../views'),
    layout: 'layout',
    includeViewExtension: true,
    defaultContext: {
      development: process.env.NODE_ENV !== 'production',
      version: process.env.npm_package_version || '1.0.0'
    },
    options: {
      async: true,
      cache: process.env.NODE_ENV === 'production'
    }
  });

  // Add global view helpers
  server.addHook('preHandler', async (request, reply) => {
    reply.locals = {
      ...reply.locals,
      user: request.user || null,
      flash: request.flash || {},
      currentYear: new Date().getFullYear()
    };
  });

  logger.info('View engine plugin initialized');
}, {
  name: 'view',
  dependencies: []
});

/**
 * Form Data Plugin
 * Handles form data parsing including file uploads
 */
const formPlugin = fp(async (server, options) => {
  await server.register(require('@fastify/formbody'));
  
  await server.register(require('@fastify/multipart'), {
    limits: {
      fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
      files: parseInt(process.env.MAX_FILES) || 5
    },
    attachFieldsToBody: true,
    sharedSchemaId: 'MultipartFileType',
    onFile: (part) => {
      // Log file upload attempts
      logger.debug('File upload detected', {
        fieldname: part.fieldname,
        filename: part.filename,
        contentType: part.mimetype,
        size: part.file.byteLength
      });
    }
  });

  logger.info('Form data plugin initialized');
}, {
  name: 'form',
  dependencies: ['security']
});

/**
 * Cookie Plugin
 * Handles cookie parsing and management
 */
const cookiePlugin = fp(async (server, options) => {
  await server.register(require('@fastify/cookie'), {
    secret: process.env.COOKIE_SECRET || 'mikrotik-billing-secret',
    hook: 'onRequest',
    parseOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    }
  });

  logger.info('Cookie plugin initialized');
}, {
  name: 'cookie',
  dependencies: []
});

/**
 * Monitoring Plugin
 * Adds performance monitoring and metrics collection
 */
const monitoringPlugin = fp(async (server, options) => {
  const PerformanceMonitor = require('../services/PerformanceMonitor');
  const performanceMonitor = new PerformanceMonitor();
  
  server.decorate('performanceMonitor', performanceMonitor);
  global.performanceMonitor = performanceMonitor;

  // Add request timing hook
  server.addHook('onRequest', async (request, reply) => {
    request.startTime = Date.now();
    request.performanceId = performanceMonitor.startRequest(request);
  });

  server.addHook('onResponse', async (request, reply) => {
    const duration = Date.now() - request.startTime;
    
    if (request.performanceId) {
      performanceMonitor.endRequest(request.performanceId, {
        statusCode: reply.statusCode,
        duration,
        route: request.routeOptions?.url || request.url,
        method: request.method
      });
    }

    // Log slow requests
    if (duration > (parseInt(process.env.SLOW_REQUEST_THRESHOLD) || 1000)) {
      logger.warn('Slow request detected', {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        duration,
        userAgent: request.headers['user-agent']
      });
    }
  });

  // Health check endpoint
  server.get('/health/plugins', async (request, reply) => {
    const { pluginRegistry } = require('../config/plugins');
    const health = await pluginRegistry.performHealthChecks(server);
    
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      plugins: health,
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0'
    };
  });

  logger.info('Monitoring plugin initialized');
}, {
  name: 'monitoring',
  dependencies: []
});

module.exports = {
  databasePlugin,
  cachePlugin,
  securityPlugin,
  sessionPlugin,
  compressionPlugin,
  staticPlugin,
  viewPlugin,
  formPlugin,
  cookiePlugin,
  monitoringPlugin
};
