/**
 * Central Route Registry
 * Auto-discovers and registers all route modules
 * @version 1.0.0
 */

const fs = require('fs').promises;
const path = require('path');

class RouteRegistry {
  constructor(fastify, options = {}) {
    this.fastify = fastify;
    this.options = {
      autoDiscover: true,
      routesPath: __dirname,
      prefix: '/api',
      version: 'v1',
      ...options
    };
    this.registeredRoutes = new Map();
    this.routeModules = new Map();
  }

  /**
   * Auto-discover and register all route modules
   */
  async registerAllRoutes() {
    if (!this.options.autoDiscover) {
      return;
    }

    try {
      const routeDirs = await this.getRouteDirectories();
      
      for (const dir of routeDirs) {
        await this.registerRouteModule(dir);
      }

      this.fastify.log.info('All route modules registered successfully', {
        totalModules: this.routeModules.size,
        registeredRoutes: Array.from(this.registeredRoutes.keys())
      });
    } catch (error) {
      this.fastify.log.error('Failed to register route modules', { error: error.message });
      throw error;
    }
  }

  /**
   * Get all route directories
   */
  async getRouteDirectories() {
    const entries = await fs.readdir(this.options.routesPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .filter(name => !name.startsWith('.') && name !== 'shared'); // Exclude hidden and shared dirs
  }

  /**
   * Register a single route module
   */
  async registerRouteModule(moduleName) {
    try {
      const modulePath = path.join(this.options.routesPath, moduleName);
      const indexPath = path.join(modulePath, 'index.js');

      // Check if index.js exists
      try {
        await fs.access(indexPath);
      } catch (error) {
        this.fastify.log.warn(`Route module ${moduleName} does not have index.js, skipping`);
        return;
      }

      // Clear require cache for hot reload support
      delete require.cache[require.resolve(indexPath)];

      // Import route module
      const routeModule = require(indexPath);

      if (typeof routeModule.register !== 'function') {
        this.fastify.log.warn(`Route module ${moduleName} does not export register function`);
        return;
      }

      // Register routes with fastify
      const prefix = `${this.options.prefix}/${this.options.version}/${moduleName}`;
      await this.fastify.register(routeModule.register, { prefix });

      // Store module info
      this.routeModules.set(moduleName, {
        path: modulePath,
        prefix,
        routes: routeModule.routes || [],
        metadata: routeModule.metadata || {}
      });

      this.fastify.log.info(`Route module registered: ${moduleName}`, { prefix });
    } catch (error) {
      this.fastify.log.error(`Failed to register route module ${moduleName}`, { 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Register a specific route module manually
   */
  async registerModule(moduleName, routeModule) {
    try {
      const prefix = `${this.options.prefix}/${this.options.version}/${moduleName}`;
      await this.fastify.register(routeModule.register, { prefix });

      this.routeModules.set(moduleName, {
        prefix,
        routes: routeModule.routes || [],
        metadata: routeModule.metadata || {},
        manuallyRegistered: true
      });

      this.fastify.log.info(`Manual route module registered: ${moduleName}`, { prefix });
    } catch (error) {
      this.fastify.log.error(`Failed to manually register route module ${moduleName}`, { 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get registered routes info
   */
  getRoutesInfo() {
    return {
      totalModules: this.routeModules.size,
      modules: Array.from(this.routeModules.entries()).map(([name, info]) => ({
        name,
        prefix: info.prefix,
        routesCount: info.routes.length,
        metadata: info.metadata
      }))
    };
  }

  /**
   * Health check for all route modules
   */
  async healthCheck() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      modules: {},
      totalModules: this.routeModules.size
    };

    for (const [moduleName, moduleInfo] of this.routeModules) {
      try {
        // Check if module has health check method
        if (moduleInfo.metadata && typeof moduleInfo.metadata.healthCheck === 'function') {
          const moduleHealth = await moduleInfo.metadata.healthCheck();
          health.modules[moduleName] = {
            status: moduleHealth.status || 'unknown',
            lastCheck: new Date().toISOString(),
            ...moduleHealth
          };
        } else {
          health.modules[moduleName] = {
            status: 'healthy',
            lastCheck: new Date().toISOString(),
            message: 'No health check available'
          };
        }
      } catch (error) {
        health.modules[moduleName] = {
          status: 'unhealthy',
          lastCheck: new Date().toISOString(),
          error: error.message
        };
        health.status = 'degraded';
      }
    }

    return health;
  }
}

/**
 * Plugin factory for Fastify
 */
async function routeRegistryPlugin(fastify, options) {
  const registry = new RouteRegistry(fastify, options);
  
  // Register the registry instance
  fastify.decorate('routeRegistry', registry);
  
  // Register all routes
  await registry.registerAllRoutes();

  // Add health check endpoint
  fastify.get('/routes/health', async (request, reply) => {
    const health = await registry.healthCheck();
    return reply.code(health.status === 'healthy' ? 200 : 503).send(health);
  });

  // Add routes info endpoint
  fastify.get('/routes/info', {
    preHandler: fastify.auth ? [fastify.auth.requireRole('admin')] : []
  }, async (request, reply) => {
    const info = registry.getRoutesInfo();
    return reply.send(info);
  });

  // Hook for route lifecycle events
  fastify.addHook('onRoute', (routeOptions) => {
    registry.registeredRoutes.set(routeOptions.url, {
      method: routeOptions.method,
      config: routeOptions.config,
      schema: routeOptions.schema
    });
  });
}

module.exports = {
  RouteRegistry,
  routeRegistryPlugin
};