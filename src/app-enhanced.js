/**
 * Enhanced Fastify Application with Plugin Architecture
 * 
 * Modern Fastify application using the optimized plugin system
 * with proper dependency management, error handling, and monitoring.
 */

require('dotenv').config();

const fastify = require('fastify');
const { initializePlugins, pluginRegistry } = require('./config/plugin-config');
const LoggerService = require('./services/LoggerService');
const PerformanceMonitor = require('./services/PerformanceMonitor');

const logger = new LoggerService('Application');

class EnhancedApplication {
  constructor() {
    this.server = null;
    this.plugins = null;
    this.isShuttingDown = false;
    this.startTime = null;
    this.metrics = {
      startupTime: null,
      pluginLoadTime: null,
      routesRegistered: 0,
      memoryUsage: null
    };
  }

  /**
   * Initialize the Fastify server with plugins
   */
  async initialize() {
    try {
      this.startTime = Date.now();
      logger.info('🚀 Initializing Enhanced Mikrotik Billing System...');

      // Create Fastify instance with optimized configuration
      this.server = fastify({
        logger: false, // We use our own logger
        trustProxy: process.env.TRUST_PROXY === 'true',
        bodyLimit: parseInt(process.env.BODY_LIMIT) || 10485760, // 10MB
        keepAliveTimeout: parseInt(process.env.KEEP_ALIVE_TIMEOUT) || 72000,
        requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
        connectionTimeout: parseInt(process.env.CONNECTION_TIMEOUT) || 60000,
        maxParamLength: parseInt(process.env.MAX_PARAM_LENGTH) || 1000,
        querystringParser: (str) => {
          // Custom query string parser for enhanced security
          try {
            return require('querystring').parse(str);
          } catch (error) {
            logger.warn('Invalid query string', { query: str, error: error.message });
            return {};
          }
        }
      });

      // Initialize plugin system
      await this.initializePluginSystem();

      // Setup global error handlers
      this.setupErrorHandlers();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      // Add application lifecycle hooks
      this.setupLifecycleHooks();

      // Add basic health endpoint
      this.addHealthEndpoints();

      this.metrics.startupTime = Date.now() - this.startTime;
      logger.info('✅ Enhanced application initialized successfully', {
        startupTime: this.metrics.startupTime,
        pluginsLoaded: this.metrics.pluginsLoaded || 0
      });

      return this.server;

    } catch (error) {
      logger.error('❌ Enhanced application initialization failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Initialize the plugin system
   */
  async initializePluginSystem() {
    const pluginStartTime = Date.now();
    
    try {
      logger.info('🔌 Initializing plugin system...');

      // Initialize plugin registry
      this.plugins = initializePlugins();

      // Load all plugins
      const loadResults = await this.plugins.loadPlugins(this.server);
      
      this.metrics.pluginLoadTime = Date.now() - pluginStartTime;
      this.metrics.pluginsLoaded = loadResults.loaded;

      logger.info('✅ Plugin system initialized', {
        loadTime: this.metrics.pluginLoadTime,
        loaded: loadResults.loaded,
        failed: loadResults.failed,
        totalTime: loadResults.totalTime
      });

      // Log plugin status
      const pluginStatus = this.plugins.getPluginStatus();
      logger.info('Plugin status summary', pluginStatus);

    } catch (error) {
      logger.error('❌ Plugin system initialization failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Setup global error handlers
   */
  setupErrorHandlers() {
    // Handle 404 errors
    this.server.setNotFoundHandler(async (request, reply) => {
      logger.warn('Route not found', {
        method: request.method,
        url: request.url,
        ip: request.ip,
        userAgent: request.headers['user-agent']
      });

      return reply.code(404).send({
        error: 'Route not found',
        message: 'Cannot ' + request.method + ' ' + request.url,
        timestamp: new Date().toISOString()
      });
    });

    // Global error handler
    this.server.setErrorHandler(async (error, request, reply) => {
      const errorId = 'err_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      
      logger.error('Unhandled request error', {
        errorId,
        method: request.method,
        url: request.url,
        error: error.message,
        stack: error.stack,
        userId: request.user ? request.user.id : null,
        ip: request.ip,
        userAgent: request.headers['user-agent']
      });

      // Don't expose internal errors in production
      const isProduction = process.env.NODE_ENV === 'production';
      
      let statusCode = 500;
      let message = 'Internal server error';
      
      if (error.statusCode) {
        statusCode = error.statusCode;
        message = error.message;
      } else if (error.status) {
        statusCode = error.status;
        message = error.message;
      }

      // Handle specific error types
      if (error.name === 'ValidationError') {
        statusCode = 400;
        message = 'Validation failed';
      } else if (error.name === 'UnauthorizedError') {
        statusCode = 401;
        message = 'Unauthorized';
      } else if (error.name === 'ForbiddenError') {
        statusCode = 403;
        message = 'Forbidden';
      } else if (error.name === 'NotFoundError') {
        statusCode = 404;
        message = 'Resource not found';
      } else if (error.name === 'ConflictError') {
        statusCode = 409;
        message = 'Resource conflict';
      } else if (error.name === 'TooManyRequestsError') {
        statusCode = 429;
        message = 'Too many requests';
      }

      const errorResponse = {
        error: message,
        errorId: errorId,
        timestamp: new Date().toISOString()
      };

      // Include stack trace in development
      if (!isProduction) {
        errorResponse.stack = error.stack;
        errorResponse.details = {
          name: error.name,
          message: error.message,
          statusCode: error.statusCode || error.status
        };
      }

      return reply.code(statusCode).send(errorResponse);
    });

    logger.info('Error handlers configured');
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupGracefulShutdown() {
    const gracefulShutdown = async (signal) => {
      if (this.isShuttingDown) {
        logger.warn('Shutdown already in progress, ignoring signal');
        return;
      }

      this.isShuttingDown = true;
      logger.info('📡 Received ' + signal + ', starting graceful shutdown...');

      try {
        // Log shutdown event
        if (this.server && this.server.auditLogger) {
          await this.server.auditLogger.log({
            action: 'server_shutdown',
            category: 'system',
            severity: 'low',
            data: {
              signal: signal,
              uptime: process.uptime(),
              timestamp: new Date().toISOString()
            }
          });
        }

        // Stop accepting new connections
        if (this.server) {
          await this.server.close();
          logger.info('🔌 HTTP server closed');
        }

        // Shutdown plugins in reverse order
        if (this.plugins) {
          await this.plugins.shutdownPlugins(this.server);
          logger.info('🔌 All plugins shutdown');
        }

        // Final metrics
        this.metrics.memoryUsage = process.memoryUsage();
        logger.info('Final application metrics', this.metrics);

        logger.info('✅ Graceful shutdown completed');
        process.exit(0);

      } catch (error) {
        logger.error('❌ Error during graceful shutdown', {
          error: error.message,
          stack: error.stack
        });
        process.exit(1);
      }
    };

    // Register signal handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('💥 Uncaught Exception', {
        error: error.message,
        stack: error.stack
      });
      gracefulShutdown('uncaughtException');
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('💥 Unhandled Rejection', {
        reason: reason.toString(),
        promise: promise.toString(),
        stack: reason ? reason.stack : null
      });
      gracefulShutdown('unhandledRejection');
    });
  }

  /**
   * Setup application lifecycle hooks
   */
  setupLifecycleHooks() {
    // Application ready hook
    this.server.addHook('onReady', async () => {
      logger.info('🎉 Application is ready to accept requests');
      
      // Log successful startup
      if (this.server.auditLogger) {
        await this.server.auditLogger.log({
          action: 'server_started',
          category: 'system',
          severity: 'low',
          data: {
            host: process.env.HOST || '0.0.0.0',
            port: process.env.PORT || 3000,
            environment: process.env.NODE_ENV || 'development',
            version: process.env.npm_package_version || '1.0.0',
            startupTime: this.metrics.startupTime,
            pluginsLoaded: this.metrics.pluginsLoaded,
            timestamp: new Date().toISOString()
          }
        });
      }
    });

    // Application close hook
    this.server.addHook('onClose', async () => {
      logger.info('Application is closing...');
      
      // Final cleanup
      if (global.performanceMonitor) {
        const finalMetrics = global.performanceMonitor.getMetrics();
        logger.info('Final performance metrics', finalMetrics);
      }
    });

    // Request timeout hook
    this.server.addHook('preHandler', async (request, reply) => {
      const timeout = parseInt(process.env.REQUEST_TIMEOUT) || 30000;
      
      // Set timeout for each request
      const timeoutId = setTimeout(() => {
        if (!reply.sent) {
          reply.code(408).send({
            error: 'Request timeout',
            message: 'Request took too long to process',
            timeout: timeout
          });
        }
      }, timeout);

      // Clear timeout when response is sent
      reply.addHook('onSend', async () => {
        clearTimeout(timeoutId);
      });
    });

    logger.info('Application lifecycle hooks configured');
  }

  /**
   * Add health check endpoints
   */
  addHealthEndpoints() {
    // Basic health check
    this.server.get('/health', {
      schema: {
        description: 'Basic health check',
        tags: ['health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              uptime: { type: 'number' },
              version: { type: 'string' },
              memory: { type: 'object' }
            }
          }
        }
      }
    }, async (request, reply) => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        memory: process.memoryUsage()
      };
    });

    // Detailed health check with plugin status
    this.server.get('/health/detailed', {
      schema: {
        description: 'Detailed health check with plugin status',
        tags: ['health']
      }
    }, async (request, reply) => {
      try {
        const pluginHealth = await this.plugins.performHealthChecks(this.server);
        const pluginStatus = this.plugins.getPluginStatus();
        
        const allHealthy = Object.values(pluginHealth).every(result => 
          result.status === 'healthy' || result.status === 'disabled'
        );

        return reply.code(allHealthy ? 200 : 503).send({
          status: allHealthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          version: process.env.npm_package_version || '1.0.0',
          memory: process.memoryUsage(),
          metrics: this.metrics,
          plugins: {
            status: pluginStatus,
            health: pluginHealth
          }
        });
      } catch (error) {
        return reply.code(503).send({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: error.message
        });
      }
    });

    // Readiness probe
    this.server.get('/ready', async (request, reply) => {
      // Check critical dependencies
      const criticalChecks = [
        this.server.db ? 'healthy' : 'unhealthy',
        this.server.sessionManager ? 'healthy' : 'unhealthy'
      ];

      const allReady = criticalChecks.every(check => check === 'healthy');

      return reply.code(allReady ? 200 : 503).send({
        status: allReady ? 'ready' : 'not-ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: criticalChecks[0],
          session: criticalChecks[1]
        }
      });
    });

    // Liveness probe
    this.server.get('/live', async (request, reply) => {
      return reply.code(200).send({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    logger.info('Health check endpoints added');
  }

  /**
   * Start the server
   */
  async start() {
    try {
      const host = process.env.HOST || '0.0.0.0';
      const port = parseInt(process.env.PORT) || 3000;

      logger.info('🚀 Starting enhanced server on ' + host + ':' + port + '...');

      await this.server.listen({ host: host, port: port });

      const finalStartupTime = Date.now() - this.startTime;
      logger.info('🎉 Enhanced server started successfully!');
      logger.info('📍 Server URL: http://' + host + ':' + port);
      logger.info('🌍 Environment: ' + (process.env.NODE_ENV || 'development'));
      logger.info('📊 Total startup time: ' + finalStartupTime + 'ms');
      logger.info('🔌 Plugins loaded: ' + this.metrics.pluginsLoaded);
      logger.info('📊 Database: ' + (process.env.DB_HOST || 'localhost') + ':' + (process.env.DB_PORT || 5432));
      logger.info('💾 Cache: ' + (this.server.cache ? 'Enabled' : 'Disabled'));
      logger.info('🔐 Mikrotik: ' + (this.server.mikrotik ? 'Connected' : 'Disconnected'));
      logger.info('💬 WhatsApp: ' + (this.server.whatsapp ? 'Connected' : 'Disconnected'));

      // Log startup metrics
      if (this.server.performanceMonitor) {
        this.server.performanceMonitor.recordMetric('server.startup_time', finalStartupTime);
      }

    } catch (error) {
      logger.error('❌ Failed to start enhanced server', {
        error: error.message,
        stack: error.stack
      });
      process.exit(1);
    }
  }

  /**
   * Get server instance
   */
  getServer() {
    return this.server;
  }

  /**
   * Get plugin registry
   */
  getPlugins() {
    return this.plugins;
  }

  /**
   * Get application metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    };
  }
}

module.exports = EnhancedApplication;
