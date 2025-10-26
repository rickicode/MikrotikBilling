const fastify = require('fastify');
const path = require('path');
const fs = require('fs');
const SecurityConfig = require('./security');
const SecurityHeadersMiddleware = require('../middleware/securityHeaders');
const RateLimitMiddleware = require('../middleware/rateLimiter');
const ValidationMiddleware = require('../middleware/validation');

class ServerConfig {
  constructor() {
    this.securityConfig = new SecurityConfig();
    this.securityHeaders = new SecurityHeadersMiddleware();
    this.rateLimiter = new RateLimitMiddleware();
    this.validation = new ValidationMiddleware();
  }

  // Create Fastify instance with comprehensive configuration
  createInstance() {
    const instance = fastify({
      logger: {
        level: process.env.LOG_LEVEL || 'info',
        serializers: {
          req(request) {
            return {
              method: request.method,
              url: request.url,
              hostname: request.hostname,
              remoteAddress: request.ip,
              userAgent: request.headers['user-agent']
            };
          },
          res(reply) {
            return {
              statusCode: reply.statusCode,
              responseTime: reply.getResponseTime()
            };
          }
        }
      },
      trustProxy: process.env.TRUST_PROXY === 'true',
      bodyLimit: 10 * 1024 * 1024, // 10MB
      querystringParser: str => this.customQueryParser(str)
    });

    // Register security plugins first
    this.registerSecurityPlugins(instance);

    // Register core plugins
    this.registerCorePlugins(instance);

    // Register middleware
    this.registerMiddleware(instance);

    // Register routes
    this.registerRoutes(instance);

    // Add error handlers
    this.addErrorHandlers(instance);

    return instance;
  }

  registerSecurityPlugins(instance) {
    // Security headers
    instance.register(require('@fastify/helmet'), {
      contentSecurityPolicy: this.securityConfig.getSecurityHeaders().contentSecurityPolicy,
      strictTransportSecurity: process.env.NODE_ENV === 'production',
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false
    });

    // Rate limiting (global)
    instance.register(require('@fastify/rate-limit'), {
      max: 1000, // Global limit
      timeWindow: '1 minute',
      keyGenerator: (req) => req.ip,
      skipOnError: false,
      errorResponseBuilder: (request, context) => ({
        code: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded, retry in ${Math.ceil(context.after / 1000)} seconds`,
        expiresIn: context.after,
        retryAfter: context.ttl
      })
    });

    // CORS
    instance.register(require('@fastify/cors'), this.securityHeaders.corsConfig());

    // CSRF protection
    if (process.env.NODE_ENV === 'production') {
      instance.register(require('@fastify/csrf-protection'), {
        cookieOpts: {
          signed: process.env.COOKIE_SIGNED === 'true',
          secure: process.env.NODE_ENV === 'production',
          httpOnly: true,
          sameSite: 'strict'
        }
      });
    }
  }

  registerCorePlugins(instance) {
    // Compression
    instance.register(require('@fastify/compress'), {
      global: true,
      threshold: 1024,
      encodings: ['gzip', 'deflate', 'br'],
      zlib: {
        level: parseInt(process.env.COMPRESSION_LEVEL) || 6,
        strategy: 1 // Z_DEFAULT_STRATEGY
      }
    });

    // Static files
    instance.register(require('@fastify/static'), {
      root: path.join(__dirname, '../../public'),
      prefix: '/public/',
      setHeaders: (res, path) => {
        // Cache static assets
        if (path.includes('/css/') || path.includes('/js/') || path.includes('/images/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
        }
      }
    });

    // Form body parsing
    instance.register(require('@fastify/formbody'));

    // Multipart for file uploads
    instance.register(require('@fastify/multipart'), {
      limits: {
        fieldNameSize: 100,
        fieldSize: 100 * 1024 * 1024, // 100MB
        fields: 20,
        fileSize: 10 * 1024 * 1024, // 10MB per file
        files: 5,
        headerPairs: 2000
      },
      attachFieldsToBody: true
    });

    // Cookie support
    instance.register(require('@fastify/cookie'));

    // Session support
    instance.register(require('@fastify/session'), {
      secret: this.securityConfig.JWT_SECRET,
      cookie: this.securityConfig.getSessionConfig(),
      store: new Map() // Replace with Redis store in production
    });

    // View engine
    instance.register(require('@fastify/view'), {
      engine: {
        ejs: require('ejs')
      },
      root: path.join(__dirname, '../../views'),
      viewExt: 'ejs',
      defaultContext: this.getViewDefaultContext(),
      propertyName: 'view',
      includeViewExtension: true
    });

    // Load validation schemas
    this.loadValidationSchemas(instance);
  }

  registerMiddleware(instance) {
    // Request ID middleware
    instance.addHook('preHandler', this.securityHeaders.requestId());

    // Security headers middleware
    instance.addHook('preHandler', this.securityHeaders.securityHeaders());

    // Audit logging middleware
    instance.addHook('preHandler', this.securityHeaders.auditLog());

    // Global validation schemas middleware
    instance.addHook('preHandler', async (request, reply) => {
      // Add validation schemas to request
      request.validationSchemas = ValidationMiddleware.schemas;
    });

    // Content-Type validation
    instance.addHook('preHandler', async (request, reply) => {
      if (request.body && typeof request.body === 'object') {
        // Prevent prototype pollution
        if (request.body.__proto__ !== Object.prototype) {
          return reply.code(400).send({
            success: false,
            message: 'Invalid request payload'
          });
        }
      }
    });
  }

  registerRoutes(instance) {
    // Register API routes
    this.registerAPIRoutes(instance);

    // Register web routes
    this.registerWebRoutes(instance);

    // Register admin routes
    this.registerAdminRoutes(instance);

    // Register utility routes
    this.registerUtilityRoutes(instance);
  }

  registerAPIRoutes(instance) {
    const apiRoutes = [
      // API authentication
      { prefix: '/api/auth', module: require('../../routes/api-auth') },
      // API customers
      { prefix: '/api/customers', module: require('../../routes/customers') },
      // API vouchers
      { prefix: '/api/vouchers', module: require('../../routes/vouchers') },
      // API PPPoE
      { prefix: '/api/pppoe', module: require('../../routes/pppoe') },
      // API payments
      { prefix: '/api/payments', module: require('../../routes/payments') },
      // API subscriptions
      { prefix: '/api/subscriptions', module: require('../../routes/subscriptions') },
      // API notifications
      { prefix: '/api/notifications', module: require('../../routes/notifications') },
      // API monitoring
      { prefix: '/api/monitoring', module: require('../../routes/monitor') },
      // API settings
      { prefix: '/api/settings', module: require('../../routes/api-settings') }
    ];

    apiRoutes.forEach(route => {
      try {
        instance.register(route.module, { prefix: route.prefix });
      } catch (error) {
        console.error(`Error registering API route ${route.prefix}:`, error);
      }
    });
  }

  registerWebRoutes(instance) {
    const webRoutes = [
      // Authentication routes
      { prefix: '/auth', module: require('../../routes/auth') },
      // Dashboard routes
      { prefix: '/dashboard', module: require('../../routes/dashboard') },
      // Customer management
      { prefix: '/customers', module: require('../../routes/customers') },
      // Voucher management
      { prefix: '/vouchers', module: require('../../routes/vouchers') },
      // PPPoE management
      { prefix: '/pppoe', module: require('../../routes/pppoe') },
      // Payment management
      { prefix: '/payments', module: require('../../routes/payments') },
      // Subscription management
      { prefix: '/subscriptions', module: require('../../routes/subscriptions') },
      // WhatsApp management
      { prefix: '/whatsapp', module: require('../../routes/whatsapp') },
      // Settings management
      { prefix: '/settings', module: require('../../routes/settings') },
      // Reports and analytics
      { prefix: '/reports', module: require('../../routes/reports') },
      // Plugin management
      { prefix: '/plugins', module: require('../../routes/plugins') }
    ];

    webRoutes.forEach(route => {
      try {
        instance.register(route.module, { prefix: route.prefix });
      } catch (error) {
        console.error(`Error registering web route ${route.prefix}:`, error);
      }
    });
  }

  registerAdminRoutes(instance) {
    const adminRoutes = [
      // Admin panel
      { prefix: '/admin', module: require('../../routes/admin') },
      // System monitoring
      { prefix: '/system', module: require('../../routes/system') },
      // Backup management
      { prefix: '/backup', module: require('../../routes/backup') },
      // Migration management
      { prefix: '/migrate', module: require('../../routes/migrate') }
    ];

    adminRoutes.forEach(route => {
      try {
        instance.register(route.module, { prefix: route.prefix });
      } catch (error) {
        console.error(`Error registering admin route ${route.prefix}:`, error);
      }
    });
  }

  registerUtilityRoutes(instance) {
    // Health check endpoint
    instance.get('/health', async (request, reply) => {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0'
      };

      // Check database health
      try {
        if (request.db) {
          const dbHealth = await request.db.query('SELECT 1 as health');
          health.database = dbHealth.rows[0] ? 'healthy' : 'unhealthy';
        }
      } catch (error) {
        health.database = 'unhealthy';
        health.databaseError = error.message;
      }

      // Check Redis health
      try {
        if (request.cache) {
          const cacheHealth = await request.cache.healthCheck();
          health.cache = cacheHealth;
        }
      } catch (error) {
        health.cache = 'unhealthy';
        health.cacheError = error.message;
      }

      reply.code(health.database === 'healthy' ? 200 : 503);
      return health;
    });

    // Serve manifest.json
    instance.get('/manifest.json', async (request, reply) => {
      try {
        const manifestPath = path.join(__dirname, '../../manifest.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        return reply.type('application/json').send(manifest);
      } catch (error) {
        return reply.code(404).send({ error: 'Manifest not found' });
      }
    });

    // Favicon routes
    this.registerFaviconRoutes(instance);
  }

  registerFaviconRoutes(instance) {
    const iconSizes = [16, 32, 192, 512];

    iconSizes.forEach(size => {
      instance.get(`/public/images/icons/icon-${size}x${size}.png`, async (request, reply) => {
        try {
          const svgPath = path.join(__dirname, `../../public/images/icons/icon-${size}x${size}.svg`);
          const svg = fs.readFileSync(svgPath, 'utf8');
          return reply.type('image/svg+xml').send(svg);
        } catch (error) {
          return reply.code(404).send('Icon not found');
        }
      });
    });

    // Favicon fallback
    instance.get('/public/images/favicon.ico', async (request, reply) => {
      try {
        const svgPath = path.join(__dirname, '../../public/images/favicon.svg');
        const svg = fs.readFileSync(svgPath, 'utf8');
        return reply.type('image/svg+xml').send(svg);
      } catch (error) {
        return reply.code(404).send('Favicon not found');
      }
    });
  }

  loadValidationSchemas(instance) {
    try {
      // Load common schemas
      const commonSchemasPath = path.join(__dirname, '../../schemas/common.json');
      if (fs.existsSync(commonSchemasPath)) {
        const commonSchemas = JSON.parse(fs.readFileSync(commonSchemasPath, 'utf8'));
        Object.entries(commonSchemas).forEach(([name, schema]) => {
          instance.addSchema({ $id: name, ...schema });
        });
      }

      // Load WhatsApp schemas
      const whatsappSchemasPath = path.join(__dirname, '../../schemas/whatsapp.json');
      if (fs.existsSync(whatsappSchemasPath)) {
        const whatsappSchemas = JSON.parse(fs.readFileSync(whatsappSchemasPath, 'utf8'));
        Object.entries(whatsappSchemas).forEach(([name, schema]) => {
          instance.addSchema({ $id: name, ...schema });
        });
      }

      // Load payment schemas
      const paymentSchemasPath = path.join(__dirname, '../../schemas/payments.json');
      if (fs.existsSync(paymentSchemasPath)) {
        const paymentSchemas = JSON.parse(fs.readFileSync(paymentSchemasPath, 'utf8'));
        Object.entries(paymentSchemas).forEach(([name, schema]) => {
          instance.addSchema({ $id: name, ...schema });
        });
      }
    } catch (error) {
      console.error('Error loading validation schemas:', error);
    }
  }

  getViewDefaultContext() {
    return {
      settings: {
        company_name: process.env.COMPANY_NAME || 'Mikrotik Billing System'
      },
      formatCurrency: (amount) => {
        return new Intl.NumberFormat('id-ID', {
          style: 'currency',
          currency: 'IDR'
        }).format(amount || 0);
      },
      formatDate: (date) => {
        return new Date(date).toLocaleDateString('id-ID');
      },
      formatDateTime: (timestamp) => {
        return new Date(timestamp).toLocaleString('id-ID');
      }
    };
  }

  addErrorHandlers(instance) {
    // Global error handler
    instance.setErrorHandler(async (error, request, reply) => {
      // Log error
      request.log.error({
        error: error.message,
        stack: error.stack,
        requestId: request.id,
        url: request.url,
        method: request.method,
        ip: request.ip
      });

      // Security events logging
      if (error.statusCode >= 400 && global.securityLogger) {
        global.securityLogger.logSecurity('request_error', {
          requestId: request.id,
          ip: request.ip,
          url: request.url,
          method: request.method,
          statusCode: error.statusCode,
          error: error.message
        });
      }

      // Handle specific error types
      if (error.validation) {
        return reply.code(400).send({
          success: false,
          message: 'Validation failed',
          errors: error.validation
        });
      }

      if (error.statusCode === 429) {
        return reply.code(429).send({
          success: false,
          message: 'Rate limit exceeded',
          retryAfter: error.headers?.['retry-after']
        });
      }

      // Generic error response
      const statusCode = error.statusCode || 500;
      const message = process.env.NODE_ENV === 'production'
        ? statusCode === 500 ? 'Internal server error' : error.message
        : error.message;

      return reply.code(statusCode).send({
        success: false,
        message,
        ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
      });
    });

    // Handle 404 errors
    instance.setNotFoundHandler(async (request, reply) => {
      request.log.warn({
        message: 'Route not found',
        url: request.url,
        method: request.method,
        ip: request.ip
      });

      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({
          success: false,
          message: 'API endpoint not found'
        });
      }

      // Return 404 page for web routes
      return reply.code(404).view('errors/404', {
        url: request.url,
        method: request.method
      });
    });
  }

  customQueryParser(str) {
    // Custom query string parser with XSS prevention
    if (!str) return {};

    try {
      const query = require('querystring').parse(str);
      const sanitized = {};

      for (const [key, value] of Object.entries(query)) {
        if (typeof key === 'string') {
          const sanitizedKey = this.securityConfig.sanitizeInput(key);
          const sanitizedValue = typeof value === 'string'
            ? this.securityConfig.sanitizeInput(value)
            : value;
          sanitized[sanitizedKey] = sanitizedValue;
        }
      }

      return sanitized;
    } catch (error) {
      console.error('Query parsing error:', error);
      return {};
    }
  }
}

module.exports = ServerConfig;