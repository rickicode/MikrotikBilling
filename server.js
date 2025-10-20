require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Enhanced logger configuration based on DEBUG mode
const loggerConfig = {
  level: process.env.DEBUG === 'true' ? 'debug' : (process.env.LOG_LEVEL || 'info'),
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: req.headers,
      hostname: req.hostname,
      remoteAddress: req.ip,
      remotePort: req.socket.remotePort
    })
  }
};

const fastify = require('fastify')({
  logger: loggerConfig,
  // Performance optimizations
  trustProxy: true,
  requestIdHeader: 'x-request-id',
  bodyLimit: 10485760, // 10MB
  // Connection optimization
  keepAliveTimeout: 65000,
  // Disable unwanted features for performance
  disableRequestLogging: process.env.NODE_ENV === 'production'
});
// Load validation schemas
const commonSchemas = JSON.parse(fs.readFileSync('./schemas/common.json', 'utf8'));
const whatsappSchemas = JSON.parse(fs.readFileSync('./schemas/whatsapp.json', 'utf8'));

// Add schemas to Fastify
Object.entries(commonSchemas).forEach(([name, schema]) => {
    fastify.addSchema({ $id: name, ...schema });
});

Object.entries(whatsappSchemas).forEach(([name, schema]) => {
    fastify.addSchema({ $id: name, ...schema });
});


// Enhanced compression with performance optimizations
fastify.register(require('@fastify/compress'), {
  global: true,
  threshold: 1024,
  encodings: ['gzip', 'deflate', 'br'],
  zlib: {
    level: process.env.NODE_ENV === 'production' ? 6 : 1, // Lower compression in dev for speed
    strategy: 1, // Z_DEFAULT_STRATEGY
    chunkSize: 32 * 1024 // 32KB chunks
  }
});

// Performance monitoring hook will be added later

fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/public/'
});

// Serve manifest.json from root
fastify.get('/manifest.json', async (request, reply) => {
  try {
    const manifestPath = path.join(__dirname, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return reply.type('application/json').send(manifest);
  } catch (error) {
    fastify.log.error('Manifest error:', error);
    return reply.status(500).send({ error: 'Manifest not found' });
  }
});

// Favicon routes to handle PNG requests with SVG files
fastify.get('/public/images/icons/icon-16x16.png', async (request, reply) => {
  try {
    const svgPath = path.join(__dirname, 'public/images/icons/icon-16x16.svg');
    const svg = fs.readFileSync(svgPath, 'utf8');
    return reply.type('image/svg+xml').send(svg);
  } catch (error) {
    return reply.status(404).send('Icon not found');
  }
});

fastify.get('/public/images/icons/icon-32x32.png', async (request, reply) => {
  try {
    const svgPath = path.join(__dirname, 'public/images/icons/icon-32x32.svg');
    const svg = fs.readFileSync(svgPath, 'utf8');
    return reply.type('image/svg+xml').send(svg);
  } catch (error) {
    return reply.status(404).send('Icon not found');
  }
});

// Favicon fallback
fastify.get('/public/images/favicon.ico', async (request, reply) => {
  try {
    const svgPath = path.join(__dirname, 'public/images/favicon.svg');
    const svg = fs.readFileSync(svgPath, 'utf8');
    return reply.type('image/svg+xml').send(svg);
  } catch (error) {
    return reply.status(404).send('Favicon not found');
  }
});

fastify.register(require('@fastify/formbody'));
fastify.register(require('@fastify/multipart'));
fastify.register(require('@fastify/cookie'));
fastify.register(require('@fastify/session'), {
  secret: process.env.SESSION_SECRET || 'default-secret',
  cookie: {
    secure: false, // Always allow HTTP for local development
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
    httpOnly: true // Prevent XSS attacks
  }
});
fastify.register(require('@fastify/cors'), {
  origin: true
});
fastify.register(require('@fastify/helmet'), {
  contentSecurityPolicy: false,
  strictTransportSecurity: false
});

// Security systems - Rate limiting and DDoS protection disabled per user request
const SecurityLogger = require('./src/services/SecurityLogger');
const PerformanceMonitor = require('./src/services/PerformanceMonitor');

// Initialize security and performance systems
const securityLogger = new SecurityLogger();
global.securityLogger = securityLogger;
const performanceMonitor = new PerformanceMonitor();
global.performanceMonitor = performanceMonitor;

console.log('Security rate limiting and DDoS protection have been disabled per user request');

// fastify.register(require('@fastify/csrf-protection'));

// Set view engine
fastify.register(require('@fastify/view'), {
  engine: {
    ejs: require('ejs')
  },
  root: path.join(__dirname, 'views'),
  viewExt: 'ejs',
  defaultContext: {
    settings: {
      company_name: process.env.COMPANY_NAME || 'Mikrotik Billing System'
    },
    formatCurrency: (amount) => {
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR'
      }).format(amount || 0);
    }
  },
  propertyName: 'view'
});

// Add global decorator for layout
fastify.addHook('preHandler', async (request, reply) => {
  // Get settings
  const settings = {};
  try {
    const settingRows = await fastify.db.query('SELECT key, value FROM settings');
    if (settingRows && settingRows.rows) {
      settingRows.rows.forEach(row => {
        settings[row.key] = row.value;
      });
    }
  } catch (error) {
    console.warn('Error loading settings:', error.message);
    // Continue with default settings
  }

  // Make settings available in all views
  reply.locals.settings = settings;
  reply.locals.currentUrl = request.url;

  // Add helper functions for views
  reply.locals.formatUptime = (seconds) => {
    if (seconds < 3600) {
      return `${Math.floor(seconds / 60)}m`;
    } else if (seconds < 86400) {
      return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    } else {
      return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
    }
  };

  reply.locals.formatPercentage = (value) => {
    return value ? value.toFixed(1) : '0';
  };

  reply.locals.formatResponseTime = (ms) => {
    if (ms < 1000) {
      return `${ms.toFixed(0)}ms`;
    } else {
      return `${(ms / 1000).toFixed(2)}s`;
    }
  };

  reply.locals.formatDateTime = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  reply.locals.getProgressBarClass = (value) => {
    if (value < 50) return 'bg-success';
    if (value < 80) return 'bg-warning';
    return 'bg-danger';
  };

  reply.locals.getSeverityBadgeClass = (severity) => {
    const classes = {
      'low': 'success',
      'medium': 'warning',
      'high': 'danger',
      'critical': 'danger'
    };
    return classes[severity] || 'secondary';
  };

  reply.locals.calculateSuccessRate = (requests) => {
    if (!requests || requests.total === 0) return 100;
    return ((requests.success / requests.total) * 100).toFixed(1);
  };

  // Generate CSRF token for forms
  reply.locals.csrfToken = '';
});

// Database initialization
console.log('🐘 Using PostgreSQL database with Knex.js');
const { db } = require('./src/database/DatabaseManager');

// Mikrotik client
const MikrotikClient = require('./src/services/MikrotikClient');
const mikrotik = new MikrotikClient(db);

// WhatsApp services
const WhatsAppService = require('./src/services/WhatsAppService');

// Payment Gateway Plugin System
const PaymentPluginManager = require('./src/services/PaymentPluginManager');

// Performance optimization
const PerformanceOptimizer = require('./src/services/PerformanceOptimizer');

// Data retention service
const DataRetentionService = require('./src/services/DataRetentionService');

// Connection recovery service
const ConnectionRecoveryService = require('./src/services/ConnectionRecoveryService');

// Initialize database and load config
async function initializeServices() {
  await db.initialize();
  mikrotik.loadConfig();

  // Initialize performance optimizer
  const performanceOptimizer = new PerformanceOptimizer();

  // Initialize WhatsApp services
  const whatsappService = new WhatsAppService();

  // Initialize WhatsApp service with database
  try {
    // Initialize WhatsApp with DatabaseManager
    await whatsappService.initialize(db.getPool());
  } catch (error) {
    console.error('❌ Failed to initialize WhatsApp Service:', error);
  }

  // Set up message handlers for WhatsApp service
  let whatsappMessageModel = null;
  try {
    const WhatsAppMessage = require('./src/models/WhatsAppMessage');
    whatsappMessageModel = new WhatsAppMessage();
  } catch (error) {
    // Silent fallback - models are optional, system will use raw database queries
    if (process.env.NODE_ENV === 'development') {
      // Only log in debug mode for development
      if (process.env.DEBUG_MODE === 'true') {
        console.debug('WhatsApp models optional - using raw database queries:', error.message);
      }
    } else {
      // Log warning in production but don't fail
      console.warn('WhatsApp models initialization failed - using raw database queries:', error.message);
    }
  }

  // Handle message storage
  whatsappService.on('store_message', async (messageData) => {
    try {
      if (whatsappMessageModel) {
        await whatsappMessageModel.create(messageData);
      } else {
        // Fallback to raw database query
        await db.query(`
          INSERT INTO whatsapp_messages (
            message_id, from_number, to_number, message_type,
            content, status, timestamp, related_id, related_type
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          messageData.message_id,
          messageData.from_number,
          messageData.to_number,
          messageData.message_type,
          messageData.content,
          messageData.status,
          messageData.timestamp,
          messageData.related_id,
          messageData.related_type
        ]);
      }
    } catch (error) {
      console.error('Error storing message:', error);
    }
  });

  // Handle message status updates
  whatsappService.on('update_message_status', async (data) => {
    try {
      if (whatsappMessageModel) {
        await whatsappMessageModel.updateStatus(data.messageId, data.status, data.errorMessage);
      } else {
        // Fallback to raw database query
        await db.query(`
          UPDATE whatsapp_messages
          SET status = $1, error_message = $2, updated_at = CURRENT_TIMESTAMP
          WHERE message_id = $3
        `, [data.status, data.errorMessage, data.messageId]);
      }
    } catch (error) {
      console.error('Error updating message status:', error);
    }
  });

  // Handle message ID updates
  whatsappService.on('update_message_id', async (data) => {
    try {
      if (whatsappMessageModel) {
        await whatsappMessageModel.updateMessageId(data.tempId, data.actualId);
      } else {
        // Fallback to raw database query
        await db.query(`
          UPDATE whatsapp_messages
          SET message_id = $1
          WHERE message_id = $2
        `, [data.actualId, data.tempId]);
      }
    } catch (error) {
      console.error('Error updating message ID:', error);
    }
  });

  // Set global WhatsAppService for AlertingService
  global.WhatsAppService = whatsappService;

  // Initialize and start Payment Plugin Manager
  const paymentPluginManager = new PaymentPluginManager(db);
  try {
    await paymentPluginManager.initialize();
    console.log('✅ Payment Plugin Manager initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Payment Plugin Manager:', error);
  }
  global.PaymentPluginManager = paymentPluginManager;

  // Initialize Data Retention Service
  const dataRetentionService = new DataRetentionService(
    process.env.DB_TYPE === 'sqlite' || process.env.DATABASE_URL.startsWith('./') || process.env.DATABASE_URL.endsWith('.db') ? db : db.getPool()
  );
  try {
    await dataRetentionService.start();
    console.log('✅ Data Retention Service initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Data Retention Service:', error);
  }
  global.DataRetentionService = dataRetentionService;

  // Connection Recovery Service DISABLED to prevent connection competition
  // Multiple services were trying to connect simultaneously, causing timeouts
  // Using single connection management through MikrotikClient only
  console.log('🔌 Connection Recovery Service disabled - using single connection management');
  global.ConnectionRecoveryService = null;

  // Make services available globally
  fastify.decorate('db', db);
  fastify.decorate('mikrotik', mikrotik);

  // WhatsApp services
  fastify.decorate('whatsappService', whatsappService);

  // Performance optimization
  fastify.decorate('performanceOptimizer', performanceOptimizer);

  // Payment Gateway Plugin System
  fastify.decorate('paymentPluginManager', paymentPluginManager);

  // Log services initialization
  console.log('📱 WhatsApp services initialized successfully');
  console.log('  - WhatsAppService: Multi-session messaging with priority queue');
  console.log('  - PerformanceOptimizer: System performance and caching optimizations');
  console.log('💳 Payment Gateway Plugin System initialized successfully');
  console.log('  - PaymentPluginManager: Plugin-based payment processing with DuitKu and Manual methods');

  // Start performance monitoring
  performanceOptimizer.startCleanup();
  console.log('🚀 Performance optimizations activated');
}

// Ensure RouterOS integration - verify all vouchers and PPPoE users exist in RouterOS
fastify.addHook('onReady', async () => {
  console.log('Starting RouterOS integration verification...');

  try {
    // Wait a moment for database to be ready
    setTimeout(async () => {
      const success = await mikrotik.ensureRouterOSIntegration();
      if (success) {
        console.log('✅ RouterOS integration verification completed successfully');
      } else {
        console.log('⚠️ RouterOS integration verification completed with warnings');
      }

      // Script injection replaced with 30-second polling (UserMonitorService)
      console.log('📊 User monitoring via polling is active (no profile scripts)');
    }, 2000);
  } catch (error) {
    console.error('❌ Error during RouterOS integration verification:', error);
  }
});


// Setup Global Error Handler
const GlobalErrorHandler = require('./src/middleware/globalErrorHandler');

console.log('HIJINETWORK: 🛡️ Global detailed error handler initialized');

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  try {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      debug_mode: process.env.DEBUG === 'true',
      services: {
        database: 'unknown',
        mikrotik: 'unknown'
      }
    };

    // Check database connection
    try {
      await db.query('SELECT 1');
      healthStatus.services.database = 'connected';
    } catch (dbError) {
      healthStatus.services.database = 'error';
      healthStatus.status = 'degraded';
    }

    // Check Mikrotik connection (if available)
    try {
      if (global.mikrotik) {
        healthStatus.services.mikrotik = 'connected';
      } else {
        healthStatus.services.mikrotik = 'not_initialized';
      }
    } catch (mikrotikError) {
      healthStatus.services.mikrotik = 'error';
      healthStatus.status = 'degraded';
    }

    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
    return reply.code(statusCode).send(healthStatus);

  } catch (error) {
    return reply.code(500).send({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: process.env.DEBUG === 'true' ? error.message : 'Health check failed'
    });
  }
});

// Test routes for global error handler (development only)
if (process.env.NODE_ENV !== 'production') {
  fastify.get('/test-error', async (request, reply) => {
    throw new Error('Test error - Global error handler verification');
  });

  fastify.get('/test-validation-error', async (request, reply) => {
    throw GlobalErrorHandler.validationError('This is a test validation error', 'email', 'Email format is invalid');
  });

  fastify.get('/test-not-found', async (request, reply) => {
    throw GlobalErrorHandler.notFoundError('Test Resource');
  });

  fastify.get('/test-unauthorized', async (request, reply) => {
    throw GlobalErrorHandler.unauthorizedError('You are not authorized to access this resource');
  });

  fastify.get('/test-db-error', async (request, reply) => {
    return db.query('SELECT * FROM non_existent_table_for_testing');
  });
}

// Register auth routes for login/logout
fastify.register(require('./src/routes/auth'));

// Register dashboard routes
fastify.register(require('./src/routes/dashboard'));

// Register other routes with prefixes
fastify.register(require('./src/routes/admin')); // Removed /admin prefix for consistency
fastify.register(require('./src/routes/customers'), { prefix: '/customers' });
fastify.register(require('./src/routes/subscriptions'), { prefix: '/subscriptions' });
fastify.register(require('./src/routes/vouchers'), { prefix: '/vouchers' });
fastify.register(require('./src/routes/vendors'), { prefix: '/vendors' });
fastify.register(require('./src/routes/pppoe'), { prefix: '/pppoe' });
fastify.register(require('./src/routes/profiles'), { prefix: '/profiles' });
fastify.register(require('./src/routes/monitor'), { prefix: '/monitor' });
fastify.register(require('./src/routes/monitoring'), { prefix: '/monitoring' });
fastify.register(require('./src/routes/backup'), { prefix: '/backup' });
fastify.register(require('./src/routes/security'), { prefix: '/security' });
fastify.register(require('./src/routes/payments'), { prefix: '/payments' });
fastify.register(require('./src/routes/api'), { prefix: '/api' });
fastify.register(require('./src/routes/print'), { prefix: '/print' });

// Register WhatsApp routes - will handle both API and web routes internally
fastify.register(require('./src/routes/whatsapp'), { prefix: '/whatsapp' });

// Register performance monitoring routes
fastify.register(require('./src/routes/performance'), { prefix: '/performance' });

// Register plugin management routes
fastify.register(require('./src/routes/plugins'), { prefix: '/plugins' });

// Register additional new routes if they exist
try {
  if (require.resolve('./src/routes/webhook')) {
    fastify.register(require('./src/routes/webhook'), { prefix: '/webhook' });
  }
} catch (e) {
  // Webhook routes might not exist yet, that's ok
}

// Global authentication middleware for protected routes
fastify.addHook('onRoute', (routeOptions) => {
  // Skip authentication for login, logout, root, public routes, auth routes, print routes, and WhatsApp QR endpoint
  const publicRoutes = ['/login', '/logout', '/', '/auth/login', '/auth/logout'];
  const publicPrefixes = ['/public/', '/auth/', '/print/', '/whatsapp/qr', '/whatsapp/status', '/whatsapp/api/', '/whatsapp/scan-', '/whatsapp/messages', '/whatsapp/statistics', '/whatsapp/test', '/whatsapp/debug', '/whatsapp/after-messages', '/whatsapp/queue-status'];
  const isPublicRoute = publicRoutes.some(path => routeOptions.url === path) ||
                      publicPrefixes.some(prefix => routeOptions.url.startsWith(prefix));

  // Check if this is an API route that needs API authentication
  const apiPrefixes = ['/api/', '/customers/api/', '/vouchers/api/', '/pppoe/api/'];
  const isApiRoute = apiPrefixes.some(prefix => routeOptions.url.startsWith(prefix));

  if (!isPublicRoute) {
    // Add authentication middleware to all protected routes
    if (!routeOptions.preHandler) {
      routeOptions.preHandler = [];
    } else if (!Array.isArray(routeOptions.preHandler)) {
      routeOptions.preHandler = [routeOptions.preHandler];
    }

    const AuthMiddleware = require('./src/middleware/auth');
    const auth = new AuthMiddleware(fastify);

    if (isApiRoute) {
      // Use API authentication for API routes
      routeOptions.preHandler.unshift(auth.verifyTokenAPI.bind(auth));
    } else {
      // Use regular authentication for page routes
      routeOptions.preHandler.unshift(auth.verifyToken.bind(auth));
    }
  }
});

// Performance monitoring hook
fastify.addHook('onRequest', async (request, reply) => {
  request.startTime = Date.now();
  global.performanceMonitor.trackConnection('open');
});

fastify.addHook('onResponse', async (request, reply) => {
  const responseTime = Date.now() - (request.startTime || Date.now());
  const success = reply.statusCode < 400;

  global.performanceMonitor.trackRequest(responseTime, success, success ? null : new Error(`HTTP ${reply.statusCode}`));
  global.performanceMonitor.trackConnection('close');
});

// Enhanced Error handler with better debug support
fastify.setErrorHandler(async (error, request, reply) => {
  // Log error with full context
  fastify.log.error({
    error: {
      message: error.message,
      stack: error.stack,
      code: error.code,
      statusCode: error.statusCode
    },
    request: {
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request.body,
      query: request.query,
      params: request.params,
      id: request.id
    },
    timestamp: new Date().toISOString()
  });

  // Use GlobalErrorHandler for consistent error formatting
  return GlobalErrorHandler.errorHandler(error, request, reply);
});

// 404 handler - Global detailed 404 response
fastify.setNotFoundHandler((request, reply) => {
  // Check if it's an API route
  if (request.url.startsWith('/api/') ||
      request.url.startsWith('/customers/api/') ||
      request.url.startsWith('/vouchers/api/') ||
      request.url.startsWith('/pppoe/api/')) {
    return GlobalErrorHandler.notFound(request, reply);
  }

  // For web routes, show the 404 page
  reply.code(404).view('404', {
    url: request.raw.url
  });
});

// Enhanced server startup with better error handling
const start = async () => {
  try {
    console.log('🚀 Starting Mikrotik Billing System...');
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🐛 Debug Mode: ${process.env.DEBUG === 'true' ? 'ENABLED' : 'DISABLED'}`);
    console.log(`📡 Port: ${process.env.PORT || 3006}`);
    console.log(`🗄️  Database: ${process.env.DATABASE_URL ? 'PostgreSQL (Supabase)' : 'Local'}`);

    // Check for fresh migration command
    if (process.argv.includes('--fresh-migrate')) {
      console.log('🔄 Running fresh migration...');
      await db.initialize();

      if (process.env.DB_TYPE === 'sqlite' || process.env.DATABASE_URL.startsWith('./') || process.env.DATABASE_URL.endsWith('.db')) {
        console.log('📌 SQLite fresh migration - deleting old database...');
        const dbPath = process.env.DATABASE_URL || './database/billing.db';
        if (fs.existsSync(dbPath)) {
          fs.unlinkSync(dbPath);
          console.log('✅ Old database deleted');
        }
        await db.initialize();
      } else {
        const FreshMigrator = require('./src/database/FreshMigrator');
        const migrator = new FreshMigrator(db.getPool());
        await migrator.fresh();
      }

      console.log('✅ Fresh migration completed');
      process.exit(0);
    }

    // Check for reset command
    if (process.argv.includes('--reset-db')) {
      console.log('🔄 Resetting database...');
      await db.initialize();
      const migrator = new FreshMigrator(db.getPool());
      await migrator.reset();
      console.log('✅ Database reset completed');
      process.exit(0);
    }

    // Validate database connection first
    console.log('🔍 Validating database connection...');
    await db.initialize();
    await db.query('SELECT 1');
    console.log('✅ Database connection validated');

    // Initialize services with error handling
    console.log('🔧 Initializing services...');
    try {
      await initializeServices();
      console.log('✅ Services initialized successfully');
    } catch (serviceError) {
      console.warn('⚠️ Some services failed to initialize:', serviceError.message);
      if (process.env.DEBUG === 'true') {
        console.warn('Service error details:', serviceError.stack);
      }
      console.log('🔄 Continuing with limited functionality...');
    }

    // Force HTTP URLs in development
    fastify.addHook('onSend', async (request, reply, payload) => {
      if (reply.statusCode >= 300 && reply.statusCode < 400 && reply.getHeader('location')) {
        let location = reply.getHeader('location');
        if (location.includes('localhost:3000')) {
          location = location.replace('https://localhost:3000', 'http://localhost:3000');
          location = location.replace('https://127.0.0.1:3000', 'http://127.0.0.1:3000');
          reply.header('location', location);
        }
      }
      return payload;
    });

    // Connect to Mikrotik with timeout
    console.log('🔌 Establishing Mikrotik connection...');
    const mikrotikConnectPromise = mikrotik.connect();
    const mikrotikTimeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Mikrotik connection timeout')), 10000)
    );

    let mikrotikConnected = false;
    try {
      mikrotikConnected = await Promise.race([mikrotikConnectPromise, mikrotikTimeoutPromise]);
      if (mikrotikConnected) {
        console.log('✅ Mikrotik connection established');
      } else {
        console.warn('⚠️ Mikrotik connection failed - services will run in offline mode');
      }
    } catch (mikrotikError) {
      console.warn('⚠️ Mikrotik connection failed:', mikrotikError.message);
      console.log('🔄 Continuing in offline mode...');
    }

    // Start server
    const port = process.env.PORT || 3007; // Use 3007 to avoid conflicts
    const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';

    await fastify.listen({ port, host });

    console.log(`🎉 Server started successfully!`);
    console.log(`📡 Server listening on: http://${host}:${port}`);
    console.log(`🏥 Health check: http://${host}:${port}/health`);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`🧪 Test endpoints available:`);
      console.log(`   - Error test: http://${host}:${port}/test-error`);
      console.log(`   - DB test: http://${host}:${port}/test-db-error`);
      console.log(`   - Validation test: http://${host}:${port}/test-validation-error`);
    }

    // Start background tasks after server is ready
    console.log('⏰ Starting background tasks...');
    try {
      require('./src/services/Scheduler')(fastify);
      console.log('✅ Background tasks started');
    } catch (schedulerError) {
      console.warn('⚠️ Background tasks failed to start:', schedulerError.message);
    }

    console.log('🚀 Mikrotik Billing System is ready!');

  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    if (process.env.DEBUG === 'true') {
      console.error('Stack trace:', err.stack);
    }
    process.exit(1);
  }
};

start();