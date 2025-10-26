/**
 * Example Fastify App Integration with Modular Routes
 * Shows how to integrate the new modular route system
 * @version 1.0.0
 */

const fastify = require('fastify')({ 
  logger: true,
  trustProxy: true 
});

// Import route registry plugin
const { routeRegistryPlugin } = require('./routes/index');
const { routeDecorator } = require('./utils/route-helpers');

// Import middleware
const RouteMiddleware = require('./middleware/route-middleware');

// Example: Register core decorators and plugins
async function setupApp() {
  // Register route helpers
  fastify.register(routeDecorator);

  // Mock services (replace with actual implementations)
  fastify.decorate('db', {
    query: async (sql, params) => {
      // Mock database implementation
      console.log('DB Query:', sql, params);
      return { rows: [] };
    },
    connect: async () => ({ query: async () => ({}), release: () => {} })
  });

  fastify.decorate('cache', {
    get: async (key) => null,
    set: async (key, value, ttl) => {},
    del: async (key) => {}
  });

  fastify.decorate('eventBus', {
    publish: async (event, data) => {
      console.log('Event published:', event, data);
    }
  });

  fastify.decorate('metrics', {
    record: async (name, value, tags) => {
      console.log('Metric recorded:', name, value, tags);
    }
  });

  fastify.decorate('mikrotikService', {
    createHotspotUsers: async (users) => {
      console.log('Creating Mikrotik users:', users.length);
    },
    deleteHotspotUser: async (username) => {
      console.log('Deleting Mikrotik user:', username);
    }
  });

  // Mock authentication
  fastify.decorate('auth', {
    verifyToken: async (request, reply) => {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return reply.code(401).send({ error: 'Authentication required' });
      }
      
      // Mock user
      request.user = {
        id: 'user-123',
        email: 'admin@example.com',
        role: 'admin'
      };
    },
    requireRole: (roles) => async (request, reply) => {
      const user = request.user;
      if (!user || !roles.includes(user.role)) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }
    }
  });

  // Register route registry with auto-discovery
  await fastify.register(routeRegistryPlugin, {
    autoDiscover: true,
    prefix: '/api',
    version: 'v1'
  });

  // Add global error handler
  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error);
    
    return reply.code(error.statusCode || 500).send({
      success: false,
      error: error.message || 'Internal server error',
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
    });
  });

  // Add health check endpoint
  fastify.get('/health', async (request, reply) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      routes: fastify.routeRegistry.getRoutesInfo()
    };
  });

  // Add API documentation endpoint
  fastify.get('/docs', {
    preHandler: fastify.auth.requireRole(['admin'])
  }, async (request, reply) => {
    const routesInfo = fastify.routeRegistry.getRoutesInfo();
    const allRoutes = [];

    for (const module of routesInfo.modules) {
      allRoutes.push(...module.routes);
    }

    const docs = fastify.routeHelpers?.generateDocs?.(allRoutes) || {
      openapi: '3.0.0',
      info: { title: 'Mikrotik Billing API', version: '1.0.0' },
      paths: {}
    };

    return docs;
  });

  // Enable CORS
  await fastify.register(require('@fastify/cors'), {
    origin: true,
    credentials: true
  });

  // Enable compression
  await fastify.register(require('@fastify/compress'));

  // Rate limiting
  await fastify.register(require('@fastify/rate-limit'), {
    global: true,
    max: 1000,
    timeWindow: '1 minute'
  });
}

// Start the server
async function start() {
  try {
    await setupApp();

    const port = process.env.PORT || 3000;
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });

    console.log(`🚀 Server listening on http://${host}:${port}`);
    console.log(`📚 API Documentation: http://${host}:${port}/docs`);
    console.log(`🏥 Health Check: http://${host}:${port}/health`);
    console.log(`🛣️  Routes Info: http://${host}:${port}/routes/info`);
    
    // Log registered routes
    const routesInfo = fastify.routeRegistry.getRoutesInfo();
    console.log(`✅ Registered ${routesInfo.totalModules} route modules:`);
    routesInfo.modules.forEach(module => {
      console.log(`   - ${module.name}: ${module.routesCount} routes`);
    });

  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await fastify.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await fastify.close();
  process.exit(0);
});

// Start server if this file is run directly
if (require.main === module) {
  start();
}

module.exports = { fastify, setupApp, start };