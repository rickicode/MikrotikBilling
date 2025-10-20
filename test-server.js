require('dotenv').config();
const fs = require('fs');
const path = require('path');
const fastify = require('fastify')({
  logger: true
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

// Register plugins
fastify.register(require('@fastify/compress'), {
  global: true,
  threshold: 1024,
  encodings: ['gzip', 'deflate', 'br'],
  zlib: {
    level: 6,
    strategy: 1 // Z_DEFAULT_STRATEGY
  }
});

fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/public/'
});

// Set up view engine
fastify.register(require('@fastify/view'), {
  engine: {
    ejs: require('ejs')
  },
  root: path.join(__dirname, 'views'),
  layout: 'layout'
});

// Database setup
const { KnexManager } = require('./src/lib/KnexManager');
const knexManager = new KnexManager();

// Initialize database
fastify.decorate('db', knexManager.getKnexInstance());

// Session management
const fastifySession = require('@fastify/session');
const fastifyCookie = require('@fastify/cookie');

fastify.register(fastifyCookie);
fastify.register(fastifySession, {
  secret: 'hijinetwork-secret-key-123',
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
});

// Auth middleware
const AuthMiddleware = require('./src/middleware/auth');

// Settings service
fastify.addHook('preHandler', async (request, reply) => {
  if (!request.locals) {
    request.locals = {};
  }

  try {
    const settingsResult = await fastify.db.query('SELECT key, value FROM settings');
    const settings = settingsResult.rows || settingsResult || [];
    const settingsMap = {};
    settings.forEach(setting => {
      settingsMap[setting.key] = setting.value;
    });
    reply.locals.settings = settingsMap;
  } catch (error) {
    reply.locals.settings = {};
    console.warn('Error loading settings:', error.message);
  }
});

// Admin routes
const adminRoutes = require('./src/routes/admin');
fastify.register(adminRoutes, { prefix: '/admin' });

// Basic routes for testing
fastify.get('/', async (request, reply) => {
  return reply.redirect('/admin/login');
});

// Start server
const start = async () => {
  try {
    const port = process.env.PORT || 3005;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Test server running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  fastify.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

start();