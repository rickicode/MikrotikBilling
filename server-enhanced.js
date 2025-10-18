#!/usr/bin/env node

/**
 * Enhanced Mikrotik Billing System Server
 * 
 * Main server entry point using the optimized Fastify plugin architecture
 * with proper dependency management, error handling, and monitoring.
 */

const EnhancedApplication = require('./src/app-enhanced');
const { routeRegistry } = require('./src/config/routes');
const LoggerService = require('./src/services/LoggerService');

const logger = new LoggerService('Server');

/**
 * Main server function
 */
async function main() {
  try {
    logger.info('🚀 Starting Enhanced Mikrotik Billing System...');
    
    // Create and initialize application
    const app = new EnhancedApplication();
    await app.initialize();

    const server = app.getServer();

    // Register routes
    const routeResults = await routeRegistry.registerRoutes(server);
    
    // Add route health check
    routeRegistry.addRouteHealthCheck(server);

    logger.info('🛣️  Routes registered successfully', {
      totalRoutes: routeResults.totalRoutes,
      loadTime: routeResults.loadTime,
      groups: Object.keys(routeResults.groups)
    });

    // Add custom API routes that don't fit in the auto-discovery system
    await registerCustomRoutes(server);

    // Start the server
    await app.start();

    // Log startup summary
    logger.info('📊 Startup Summary', {
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      startupTime: app.getMetrics().startupTime,
      pluginsLoaded: app.getMetrics().pluginsLoaded,
      routesRegistered: routeResults.totalRoutes,
      memoryUsage: process.memoryUsage()
    });

  } catch (error) {
    logger.error('💥 Server startup failed', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

/**
 * Register custom routes that need special handling
 */
async function registerCustomRoutes(server) {
  // Dashboard route (main entry point)
  server.get('/', async (request, reply) => {
    try {
      // Check if user is authenticated
      if (!request.session || !request.session.userId) {
        return reply.redirect('/login');
      }

      // Get dashboard data
      const dashboardData = await getDashboardData(server, request);
      
      return reply.view('dashboard', {
        title: 'Dashboard - Mikrotik Billing System',
        user: request.user,
        data: dashboardData,
        page: 'dashboard'
      });
    } catch (error) {
      logger.error('Dashboard route error', { error: error.message });
      return reply.code(500).view('error', {
        title: 'Error',
        error: 'Failed to load dashboard'
      });
    }
  });

  // Login route
  server.get('/login', async (request, reply) => {
    if (request.session && request.session.userId) {
      return reply.redirect('/');
    }
    
    return reply.view('login', {
      title: 'Login - Mikrotik Billing System',
      layout: false
    });
  });

  // Logout route
  server.post('/logout', async (request, reply) => {
    try {
      if (request.sessionManager && request.session) {
        await request.sessionManager.destroySession(request.session.sessionId);
      }
      
      // Log logout event
      if (server.auditLogger) {
        await server.auditLogger.log({
          action: 'user_logout',
          category: 'auth',
          severity: 'low',
          data: {
            userId: request.user?.id,
            ip: request.ip,
            userAgent: request.headers['user-agent']
          }
        });
      }

      return reply.redirect('/login');
    } catch (error) {
      logger.error('Logout error', { error: error.message });
      return reply.redirect('/login');
    }
  });

  // API documentation route
  server.get('/api/docs', {
    preHandler: [server.verifyJWT]
  }, async (request, reply) => {
    try {
      const routeInfo = routeRegistry.getRouteInfo();
      const pluginStatus = app.getPlugins().getPluginStatus();
      
      return {
        title: 'Mikrotik Billing System API',
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date().toISOString(),
        routes: routeInfo,
        plugins: pluginStatus,
        endpoints: {
          auth: {
            login: 'POST /api/auth/login',
            logout: 'POST /logout',
            refresh: 'POST /api/auth/refresh'
          },
          customers: {
            list: 'GET /api/customers',
            create: 'POST /api/customers',
            update: 'PUT /api/customers/:id',
            delete: 'DELETE /api/customers/:id'
          },
          vouchers: {
            list: 'GET /api/vouchers',
            generate: 'POST /api/vouchers/generate',
            activate: 'POST /api/vouchers/:id/activate'
          },
          payments: {
            create: 'POST /api/payments',
            status: 'GET /api/payments/:id/status',
            callback: 'POST /api/webhook/payment'
          }
        }
      };
    } catch (error) {
      logger.error('API docs error', { error: error.message });
      return reply.code(500).send({ error: 'Failed to generate API documentation' });
    }
  });

  // System info route
  server.get('/api/system/info', {
    preHandler: [server.verifyJWT, server.verifyRole(['super_admin', 'admin'])]
  }, async (request, reply) => {
    try {
      const systemInfo = {
        application: {
          name: 'Mikrotik Billing System',
          version: process.env.npm_package_version || '1.0.0',
          environment: process.env.NODE_ENV || 'development',
          uptime: process.uptime(),
          nodeVersion: process.version,
          platform: process.platform,
          architecture: process.arch
        },
        system: {
          memory: process.memoryUsage(),
          cpuUsage: process.cpuUsage(),
          resourceUsage: process.resourceUsage()
        },
        database: {
          host: process.env.DB_HOST || 'localhost',
          port: process.env.DB_PORT || 5432,
          database: process.env.DB_NAME || 'mikrotik_billing'
        },
        features: {
          cache: !!server.cache,
          mikrotik: !!server.mikrotik,
          whatsapp: !!server.whatsapp,
          payments: !!server.payments,
          scheduler: !!server.scheduler
        }
      };

      return systemInfo;
    } catch (error) {
      logger.error('System info error', { error: error.message });
      return reply.code(500).send({ error: 'Failed to get system information' });
    }
  });
}

/**
 * Get dashboard data
 */
async function getDashboardData(server, request) {
  try {
    const dashboardData = {
      summary: {
        totalCustomers: 0,
        activeVouchers: 0,
        totalRevenue: 0,
        activeUsers: 0
      },
      recentActivity: [],
      systemStatus: 'operational'
    };

    // Get customer count
    if (server.db) {
      try {
        const customerResult = await server.db.query('SELECT COUNT(*) as count FROM customers WHERE active = true');
        dashboardData.summary.totalCustomers = parseInt(customerResult.rows[0].count);

        // Get voucher count
        const voucherResult = await server.db.query(
          'SELECT COUNT(*) as count FROM vouchers WHERE status = \'active\''
        );
        dashboardData.summary.activeVouchers = parseInt(voucherResult.rows[0].count);

        // Get revenue
        const revenueResult = await server.db.query(
          'SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = \'completed\''
        );
        dashboardData.summary.totalRevenue = parseFloat(revenueResult.rows[0].total);
      } catch (dbError) {
        logger.warn('Dashboard database query failed', { error: dbError.message });
      }
    }

    // Get Mikrotik stats
    if (server.mikrotik) {
      try {
        const mikrotikStats = await server.mikrotik.healthCheck();
        dashboardData.mikrotik = mikrotikStats;
      } catch (mikrotikError) {
        logger.warn('Dashboard Mikrotik stats failed', { error: mikrotikError.message });
      }
    }

    // Get WhatsApp stats
    if (server.whatsapp) {
      try {
        const whatsappStats = await server.whatsapp.healthCheck();
        dashboardData.whatsapp = whatsappStats;
      } catch (whatsappError) {
        logger.warn('Dashboard WhatsApp stats failed', { error: whatsappError.message });
      }
    }

    return dashboardData;
  } catch (error) {
    logger.error('Failed to get dashboard data', { error: error.message });
    return {
      summary: { totalCustomers: 0, activeVouchers: 0, totalRevenue: 0, activeUsers: 0 },
      recentActivity: [],
      systemStatus: 'error'
    };
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', {
    promise: promise.toString(),
    reason: reason.toString(),
    stack: reason && reason.stack
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

// Start the server
if (require.main === module) {
  main().catch((error) => {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  });
}

module.exports = { main, registerCustomRoutes, getDashboardData };
