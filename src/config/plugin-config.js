/**
 * Plugin Configuration
 * 
 * Central plugin configuration with environment-specific settings,
 * dependency management, and loading order optimization.
 */

const { pluginRegistry } = require('./plugins');
const { 
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
} = require('../plugins/fastify-plugins');

const {
  mikrotikPlugin,
  whatsappPlugin,
  authPlugin,
  paymentPlugin,
  schedulerPlugin,
  auditPlugin
} = require('../plugins/application-plugins');

const logger = require('../services/LoggerService');

/**
 * Register all core Fastify plugins with their configurations
 */
function registerCorePlugins() {
  // Core infrastructure plugins (highest priority)
  pluginRegistry.register('database', databasePlugin, {
    priority: 1000,
    required: true,
    environment: 'all',
    dependencies: [],
    healthCheck: async (server) => {
      if (!server.db) return { status: 'error', message: 'Database not initialized' };
      
      try {
        const result = await server.db.query('SELECT 1 as test');
        return {
          status: 'healthy',
          message: 'Database connection successful',
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          message: error.message,
          timestamp: new Date().toISOString()
        };
      }
    },
    gracefulShutdown: async (server) => {
      if (server.db) {
        await server.db.close();
      }
    }
  });

  pluginRegistry.register('monitoring', monitoringPlugin, {
    priority: 950,
    required: true,
    environment: 'all',
    dependencies: [],
    healthCheck: async (server) => {
      if (!server.performanceMonitor) {
        return { status: 'error', message: 'Performance monitor not initialized' };
      }
      
      const metrics = server.performanceMonitor.getMetrics();
      return {
        status: 'healthy',
        metrics: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          requestCount: metrics.totalRequests || 0,
          averageResponseTime: metrics.averageResponseTime || 0
        },
        timestamp: new Date().toISOString()
      };
    }
  });

  pluginRegistry.register('cache', cachePlugin, {
    priority: 900,
    required: false, // Can run without cache
    environment: 'all',
    dependencies: ['database'],
    healthCheck: async (server) => {
      if (!server.cache) {
        return { status: 'disabled', message: 'Cache not available' };
      }
      
      try {
        const health = await server.cache.healthCheck();
        return {
          status: health.status === 'healthy' ? 'healthy' : 'unhealthy',
          message: health.message || 'Cache health check completed',
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          message: error.message,
          timestamp: new Date().toISOString()
        };
      }
    }
  });

  // Security plugins
  pluginRegistry.register('security', securityPlugin, {
    priority: 850,
    required: true,
    environment: 'all',
    dependencies: [],
    healthCheck: async (server) => {
      return {
        status: 'healthy',
        message: 'Security plugins loaded successfully',
        features: ['cors', 'helmet', 'csrf-protection', 'rate-limiting'],
        timestamp: new Date().toISOString()
      };
    }
  });

  pluginRegistry.register('cookie', cookiePlugin, {
    priority: 800,
    required: true,
    environment: 'all',
    dependencies: []
  });

  pluginRegistry.register('compression', compressionPlugin, {
    priority: 750,
    required: true,
    environment: 'all',
    dependencies: []
  });

  pluginRegistry.register('form', formPlugin, {
    priority: 700,
    required: true,
    environment: 'all',
    dependencies: ['security']
  });

  // Session and authentication
  pluginRegistry.register('session', sessionPlugin, {
    priority: 650,
    required: true,
    environment: 'all',
    dependencies: ['database', 'cache'],
    healthCheck: async (server) => {
      if (!server.sessionManager) {
        return { status: 'error', message: 'Session manager not initialized' };
      }
      
      try {
        const stats = await server.sessionManager.getSessionStatistics();
        return {
          status: 'healthy',
          message: 'Session manager operational',
          statistics: stats,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          message: error.message,
          timestamp: new Date().toISOString()
        };
      }
    },
    gracefulShutdown: async (server) => {
      if (server.sessionManager) {
        await server.sessionManager.shutdown();
      }
    }
  });

  pluginRegistry.register('auth', authPlugin, {
    priority: 600,
    required: true,
    environment: 'all',
    dependencies: ['database', 'monitoring'],
    healthCheck: async (server) => {
      return {
        status: 'healthy',
        message: 'Authentication system operational',
        features: ['jwt', 'rbac', 'password-hashing'],
        timestamp: new Date().toISOString()
      };
    }
  });

  // View and static files
  pluginRegistry.register('view', viewPlugin, {
    priority: 550,
    required: true,
    environment: 'all',
    dependencies: [],
    healthCheck: async (server) => {
      return {
        status: 'healthy',
        message: 'View engine initialized',
        engine: 'ejs',
        timestamp: new Date().toISOString()
      };
    }
  });

  pluginRegistry.register('static', staticPlugin, {
    priority: 500,
    required: true,
    environment: 'all',
    dependencies: [],
    healthCheck: async (server) => {
      return {
        status: 'healthy',
        message: 'Static file serving enabled',
        timestamp: new Date().toISOString()
      };
    }
  });

  pluginRegistry.register('audit', auditPlugin, {
    priority: 450,
    required: true,
    environment: 'all',
    dependencies: ['database', 'monitoring'],
    healthCheck: async (server) => {
      if (!server.auditLogger) {
        return { status: 'error', message: 'Audit logger not initialized' };
      }
      
      return {
        status: 'healthy',
        message: 'Audit logging operational',
        timestamp: new Date().toISOString()
      };
    }
  });
}

/**
 * Register application-specific plugins
 */
function registerApplicationPlugins() {
  // Mikrotik integration (critical for billing system)
  pluginRegistry.register('mikrotik', mikrotikPlugin, {
    priority: 400,
    required: process.env.NODE_ENV === 'production' ? true : false,
    environment: 'all',
    dependencies: ['database', 'cache'],
    healthCheck: async (server) => {
      if (!server.mikrotik) {
        return { status: 'disabled', message: 'Mikrotik integration not available' };
      }
      
      try {
        const health = await server.mikrotik.healthCheck();
        return {
          status: 'healthy',
          message: 'Mikrotik connections operational',
          connections: health,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          message: error.message,
          timestamp: new Date().toISOString()
        };
      }
    },
    gracefulShutdown: async (server) => {
      if (server.mikrotik) {
        await server.mikrotik.disconnect();
      }
    }
  });

  // Payment system (critical for billing)
  pluginRegistry.register('payment', paymentPlugin, {
    priority: 350,
    required: true,
    environment: 'all',
    dependencies: ['database', 'cache', 'monitoring'],
    healthCheck: async (server) => {
      if (!server.payments) {
        return { status: 'error', message: 'Payment system not initialized' };
      }
      
      try {
        const health = await server.payments.healthCheck();
        return {
          status: 'healthy',
          message: 'Payment system operational',
          plugins: health,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          message: error.message,
          timestamp: new Date().toISOString()
        };
      }
    }
  });

  // WhatsApp notifications (optional but recommended)
  pluginRegistry.register('whatsapp', whatsappPlugin, {
    priority: 300,
    required: false, // Can run without WhatsApp
    environment: 'all',
    dependencies: ['database', 'cache', 'monitoring'],
    healthCheck: async (server) => {
      if (!server.whatsapp) {
        return { status: 'disabled', message: 'WhatsApp service not available' };
      }
      
      try {
        const health = await server.whatsapp.healthCheck();
        return {
          status: 'healthy',
          message: 'WhatsApp service operational',
          sessions: health,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          message: error.message,
          timestamp: new Date().toISOString()
        };
      }
    },
    gracefulShutdown: async (server) => {
      if (server.whatsapp) {
        await server.whatsapp.sessionManager.shutdownAll();
        await server.whatsapp.service.shutdown();
      }
    }
  });

  // Background scheduler
  pluginRegistry.register('scheduler', schedulerPlugin, {
    priority: 250,
    required: false,
    environment: 'all',
    dependencies: ['database', 'cache', 'session'],
    healthCheck: async (server) => {
      if (!server.scheduler) {
        return { status: 'error', message: 'Scheduler not initialized' };
      }
      
      const tasks = server.scheduler.getAllTasks();
      const taskStatuses = {};
      
      for (const taskName of tasks) {
        taskStatuses[taskName] = server.scheduler.getTaskStatus(taskName);
      }
      
      return {
        status: 'healthy',
        message: 'Scheduler operational',
        tasks: taskStatuses,
        timestamp: new Date().toISOString()
      };
    },
    gracefulShutdown: async (server) => {
      if (server.scheduler) {
        for (const taskName of server.scheduler.getAllTasks()) {
          server.scheduler.stopTask(taskName);
        }
        await server.scheduler.queueService.close();
      }
    }
  });
}

/**
 * Register development-specific plugins
 */
function registerDevelopmentPlugins() {
  if (process.env.NODE_ENV === 'development') {
    // Development tools and debugging plugins
    pluginRegistry.register('dev-tools', async (server, options) => {
      // Add development-specific middleware
      server.addHook('preHandler', async (request, reply) => {
        // Add development headers
        reply.header('X-Development-Mode', 'true');
        reply.header('X-Debug-Timestamp', new Date().toISOString());
      });

      // Development routes
      server.get('/dev/plugins', async (request, reply) => {
        const status = pluginRegistry.getPluginStatus();
        return status;
      });

      server.get('/dev/config', async (request, reply) => {
        return {
          environment: process.env.NODE_ENV,
          nodeVersion: process.version,
          platform: process.platform,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: process.env.npm_package_version || '1.0.0'
        };
      });

    }, {
      priority: 100,
      required: false,
      environment: 'development',
      dependencies: ['monitoring']
    });
  }
}

/**
 * Register production-specific plugins
 */
function registerProductionPlugins() {
  if (process.env.NODE_ENV === 'production') {
    // Production-specific optimizations
    pluginRegistry.register('production', async (server, options) => {
      // Add production-specific middleware
      server.addHook('preHandler', async (request, reply) => {
        // Add security headers for production
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('X-Frame-Options', 'DENY');
        reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      });

      // Production health check
      server.get('/health/production', async (request, reply) => {
        const healthResults = await pluginRegistry.performHealthChecks(server);
        
        const allHealthy = Object.values(healthResults).every(result => 
          result.status === 'healthy' || result.status === 'disabled'
        );

        return reply.code(allHealthy ? 200 : 503).send({
          status: allHealthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          version: process.env.npm_package_version || '1.0.0',
          plugins: healthResults
        });
      });

    }, {
      priority: 50,
      required: true,
      environment: 'production',
      dependencies: ['security', 'monitoring']
    });
  }
}

/**
 * Initialize all plugin registrations
 */
function initializePlugins() {
  try {
    logger.info('Initializing plugin registrations...');

    registerCorePlugins();
    registerApplicationPlugins();
    registerDevelopmentPlugins();
    registerProductionPlugins();

    const totalPlugins = pluginRegistry.getPluginStatus().total;
    logger.info(`Plugin registration completed: ${totalPlugins} plugins registered`);

    return pluginRegistry;
  } catch (error) {
    logger.error('Plugin registration failed', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Get plugin configuration for specific environment
 */
function getPluginConfig(environment = process.env.NODE_ENV || 'development') {
  const pluginStatus = pluginRegistry.getPluginStatus();
  const environmentPlugins = {};

  for (const pluginName of pluginStatus.loadedPlugins) {
    const plugin = pluginRegistry.plugins.get(pluginName);
    if (plugin && (plugin.environment === 'all' || plugin.environment === environment)) {
      environmentPlugins[pluginName] = {
        name: plugin.name,
        priority: plugin.priority,
        required: plugin.required,
        dependencies: plugin.dependencies,
        loadTime: pluginStatus.loadTimes[pluginName]
      };
    }
  }

  return {
    environment,
    totalPlugins: Object.keys(environmentPlugins).length,
    plugins: environmentPlugins
  };
}

module.exports = {
  initializePlugins,
  getPluginConfig,
  pluginRegistry
};
