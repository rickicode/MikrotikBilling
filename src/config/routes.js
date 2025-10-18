/**
 * Route Registration System
 * 
 * Centralized route registration with proper plugin dependencies,
 * authentication middleware, and performance monitoring.
 */

const path = require('path');
const fs = require('fs');
const LoggerService = require('../services/LoggerService');

const logger = new LoggerService('RouteRegistry');

class RouteRegistry {
  constructor() {
    this.routes = new Map();
    this.plugins = new Map();
    this.routeGroups = {
      public: [],
      auth: [],
      admin: [],
      api: [],
      webhooks: []
    };
    this.metrics = {
      totalRoutes: 0,
      routesByGroup: {},
      loadTimes: new Map()
    };
  }

  /**
   * Register a route group with its configuration
   */
  registerRouteGroup(groupName, routes, options = {}) {
    if (!this.routeGroups[groupName]) {
      this.routeGroups[groupName] = [];
    }

    const routeConfig = {
      groupName,
      routes,
      options: {
        prefix: options.prefix || '/' + groupName,
        middleware: options.middleware || [],
        plugins: options.plugins || [],
        dependencies: options.dependencies || [],
        priority: options.priority || 0,
        ...options
      }
    };

    this.routeGroups[groupName].push(routeConfig);
    
    logger.debug(`Route group registered: ${groupName}`, {
      routeCount: routes.length,
      prefix: routeConfig.options.prefix,
      dependencies: routeConfig.options.dependencies
    });
  }

  /**
   * Auto-discover route files from directories
   */
  discoverRoutes(server) {
    const routesDir = path.join(__dirname, '../routes');
    
    if (!fs.existsSync(routesDir)) {
      logger.warn('Routes directory not found:', routesDir);
      return;
    }

    const routeFiles = fs.readdirSync(routesDir, { withFileTypes: true })
      .filter(dirent => dirent.isFile() && dirent.name.endsWith('.js'))
      .map(dirent => dirent.name);

    logger.debug(`Discovered ${routeFiles.length} route files`, { files: routeFiles });

    for (const routeFile of routeFiles) {
      try {
        const routePath = path.join(routesDir, routeFile);
        const routeModule = require(routePath);
        
        // Extract route group name from filename
        const groupName = path.basename(routeFile, '.js');
        
        if (typeof routeModule === 'function') {
          // Route module exports a function that takes server and options
          this.registerRouteGroup(groupName, [{
            module: routeModule,
            file: routeFile
          }], {
            prefix: this.getRoutePrefix(groupName),
            dependencies: this.getRouteDependencies(groupName)
          });
        } else if (routeModule.routes && Array.isArray(routeModule.routes)) {
          // Route module exports routes array
          this.registerRouteGroup(groupName, routeModule.routes, {
            prefix: routeModule.prefix || this.getRoutePrefix(groupName),
            middleware: routeModule.middleware || [],
            dependencies: routeModule.dependencies || this.getRouteDependencies(groupName),
            ...routeModule.options
          });
        }

      } catch (error) {
        logger.error(`Failed to load route file: ${routeFile}`, {
          error: error.message,
          stack: error.stack
        });
      }
    }
  }

  /**
   * Get route prefix based on group name
   */
  getRoutePrefix(groupName) {
    const prefixes = {
      auth: '/auth',
      admin: '/admin',
      api: '/api',
      customers: '/customers',
      payments: '/payments',
      vouchers: '/vouchers',
      pppoe: '/pppoe',
      whatsapp: '/whatsapp',
      subscriptions: '/subscriptions',
      plugins: '/plugins',
      webhook: '/webhook',
      settings: '/settings'
    };

    return prefixes[groupName] || '/' + groupName;
  }

  /**
   * Get route dependencies based on group name
   */
  getRouteDependencies(groupName) {
    const dependencies = {
      auth: ['database', 'session'],
      admin: ['auth', 'database', 'audit'],
      api: ['auth', 'database', 'monitoring'],
      customers: ['auth', 'database', 'audit'],
      payments: ['auth', 'database', 'payment', 'audit'],
      vouchers: ['auth', 'database', 'mikrotik', 'audit'],
      pppoe: ['auth', 'database', 'mikrotik', 'audit'],
      whatsapp: ['auth', 'database', 'whatsapp', 'audit'],
      subscriptions: ['auth', 'database', 'audit'],
      plugins: ['auth', 'database', 'audit'],
      webhook: ['database', 'payment'],
      settings: ['auth', 'database', 'audit']
    };

    return dependencies[groupName] || [];
  }

  /**
   * Register all routes with the server
   */
  async registerRoutes(server) {
    const startTime = Date.now();
    
    try {
      logger.info('🛣️  Registering application routes...');

      // Auto-discover routes from file system
      this.discoverRoutes(server);

      // Sort route groups by priority
      const sortedGroups = Object.entries(this.routeGroups)
        .filter(([_, groups]) => groups.length > 0)
        .sort(([_, groupA], [__, groupB]) => {
          const priorityA = Math.max(...groupA.map(g => g.options.priority));
          const priorityB = Math.max(...groupB.map(g => g.options.priority));
          return priorityB - priorityA;
        });

      let totalRoutesRegistered = 0;

      for (const [groupName, routeGroups] of sortedGroups) {
        for (const routeConfig of routeGroups) {
          const routesRegistered = await this.registerRouteGroupRoutes(server, routeConfig);
          totalRoutesRegistered += routesRegistered;
        }
      }

      const loadTime = Date.now() - startTime;
      this.metrics.totalRoutes = totalRoutesRegistered;
      this.metrics.routesByGroup = this.getRoutesByGroup();

      logger.info('✅ All routes registered successfully', {
        totalRoutes: totalRoutesRegistered,
        loadTime,
        groups: Object.keys(this.routeGroups).filter(g => this.routeGroups[g].length > 0)
      });

      return {
        totalRoutes: totalRoutesRegistered,
        loadTime,
        groups: this.metrics.routesByGroup
      };

    } catch (error) {
      logger.error('❌ Route registration failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Register routes for a specific group
   */
  async registerRouteGroupRoutes(server, routeConfig) {
    const { groupName, routes, options } = routeConfig;
    const startTime = Date.now();
    let routesRegistered = 0;

    try {
      logger.debug(`Registering route group: ${groupName}`, {
        routeCount: routes.length,
        prefix: options.prefix
      });

      // Check if dependencies are available
      for (const dependency of options.dependencies) {
        if (!server[dependency] && !server.hasDecorator(dependency)) {
          logger.warn(`Missing dependency for route group ${groupName}: ${dependency}`);
        }
      }

      // Create route context
      const routeContext = this.createRouteContext(server, options);

      // Register each route in the group
      for (const route of routes) {
        try {
          if (typeof route.module === 'function') {
            // Route is a function that takes server and context
            await route.module(server, routeContext);
            routesRegistered++;
          } else if (route.method && route.url) {
            // Route is a route configuration object
            server.route({
              method: route.method,
              url: this.buildRouteUrl(options.prefix, route.url),
              handler: route.handler,
              preHandler: this.combineMiddleware(options.middleware, route.preHandler),
              schema: route.schema,
              config: {
                ...route.config,
                group: groupName,
                dependencies: options.dependencies
              }
            });
            routesRegistered++;
          }
        } catch (error) {
          logger.error(`Failed to register route in group ${groupName}`, {
            route: route.url || route.file,
            error: error.message
          });
        }
      }

      const loadTime = Date.now() - startTime;
      this.metrics.loadTimes.set(groupName, loadTime);

      logger.debug(`Route group completed: ${groupName}`, {
        routesRegistered,
        loadTime
      });

      return routesRegistered;

    } catch (error) {
      logger.error(`Failed to register route group: ${groupName}`, {
        error: error.message,
        stack: error.stack
      });
      return 0;
    }
  }

  /**
   * Create route context with common decorators and middleware
   */
  createRouteContext(server, options) {
    return {
      logger: logger,
      prefix: options.prefix,
      dependencies: options.dependencies,
      decorators: {
        // Authentication decorators
        requireAuth: async (request, reply) => {
          if (server.verifyJWT) {
            return await server.verifyJWT(request, reply);
          }
        },
        requireRole: (roles) => async (request, reply) => {
          if (server.verifyRole) {
            return await server.verifyRole(roles)(request, reply);
          }
        },
        
        // Validation decorators
        validateBody: (schema) => async (request, reply) => {
          if (request.validation) {
            const result = request.validation(schema, request.body);
            if (!result.valid) {
              return reply.code(400).send({
                error: 'Validation failed',
                details: result.errors
              });
            }
          }
        },
        
        // Logging decorators
        logRequest: (action, category = 'access') => async (request, reply) => {
          if (server.auditLogger) {
            await server.auditLogger.log({
              action,
              category,
              severity: 'low',
              data: {
                method: request.method,
                url: request.url,
                userId: request.user?.id,
                ip: request.ip,
                userAgent: request.headers['user-agent']
              }
            });
          }
        }
      }
    };
  }

  /**
   * Build full route URL from prefix and path
   */
  buildRouteUrl(prefix, url) {
    if (url.startsWith('/')) {
      return prefix + url;
    } else {
      return prefix + '/' + url;
    }
  }

  /**
   * Combine multiple middleware functions
   */
  combineMiddleware(...middlewareArrays) {
    const allMiddleware = middlewareArrays.flat().filter(Boolean);
    
    if (allMiddleware.length === 0) {
      return undefined;
    }

    return async (request, reply) => {
      for (const middleware of allMiddleware) {
        await middleware(request, reply);
      }
    };
  }

  /**
   * Get route statistics by group
   */
  getRoutesByGroup() {
    const stats = {};
    
    for (const [groupName, routeGroups] of Object.entries(this.routeGroups)) {
      stats[groupName] = {
        routeGroups: routeGroups.length,
        totalRoutes: routeGroups.reduce((sum, group) => sum + group.routes.length, 0),
        loadTime: this.metrics.loadTimes.get(groupName) || 0
      };
    }

    return stats;
  }

  /**
   * Get all registered routes information
   */
  getRouteInfo() {
    return {
      totalRoutes: this.metrics.totalRoutes,
      routesByGroup: this.metrics.routesByGroup,
      loadTimes: Object.fromEntries(this.metrics.loadTimes)
    };
  }

  /**
   * Add health check for routes
   */
  addRouteHealthCheck(server) {
    server.get('/health/routes', {
      schema: {
        description: 'Route health check',
        tags: ['health']
      }
    }, async (request, reply) => {
      try {
        const routeInfo = this.getRouteInfo();
        
        return {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          routes: routeInfo
        };
      } catch (error) {
        return reply.code(500).send({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: error.message
        });
      }
    });
  }
}

// Create singleton instance
const routeRegistry = new RouteRegistry();

module.exports = {
  RouteRegistry,
  routeRegistry
};
