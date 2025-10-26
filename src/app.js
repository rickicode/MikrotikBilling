require('dotenv').config();

const ServerConfig = require('./config/server');
const DatabaseConfig = require('./config/database');
const CacheService = require('./services/CacheService');
const SessionManager = require('./services/SessionManager');
const SecurityLogger = require('./services/SecurityLogger');
const PerformanceMonitor = require('./services/PerformanceMonitor');

class Application {
  constructor() {
    this.serverConfig = new ServerConfig();
    this.databaseConfig = new DatabaseConfig();
    this.cacheService = null;
    this.sessionManager = null;
    this.securityLogger = null;
    this.performanceMonitor = null;
    this.server = null;
  }

  async initialize() {
    try {
      console.log('🚀 Initializing Mikrotik Billing System...');

      // Initialize database
      await this.initializeDatabase();

      // Initialize cache service
      await this.initializeCache();

      // Initialize session manager
      await this.initializeSessionManager();

      // Initialize security services
      await this.initializeSecurityServices();

      // Create Fastify server
      await this.createServer();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      console.log('✅ Application initialized successfully');
    } catch (error) {
      console.error('❌ Application initialization failed:', error);
      process.exit(1);
    }
  }

  async initializeDatabase() {
    try {
      console.log('📊 Initializing database connections...');

      // Test primary database connection
      const primaryPool = this.databaseConfig.getPrimaryPool();
      if (!primaryPool) {
        throw new Error('Failed to create primary database pool');
      }

      // Test database connectivity
      const result = await this.databaseConfig.query('SELECT 1 as test');
      if (!result.rows || result.rows.length === 0) {
        throw new Error('Database connectivity test failed');
      }

      console.log('✅ Database connections established');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  async initializeCache() {
    try {
      console.log('💾 Initializing cache service...');

      this.cacheService = new CacheService();

      // Test cache connectivity
      const healthCheck = await this.cacheService.healthCheck();
      if (healthCheck.status !== 'healthy') {
        console.warn('⚠️  Redis cache not available, running without cache');
        this.cacheService = null;
      } else {
        console.log('✅ Cache service initialized');
      }
    } catch (error) {
      console.warn('⚠️  Cache initialization failed, continuing without cache:', error.message);
      this.cacheService = null;
    }
  }

  async initializeSessionManager() {
    try {
      console.log('🔐 Initializing session manager...');

      const db = this.databaseConfig.getPrimaryPool();
      this.sessionManager = new SessionManager(db, {
        sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 30 * 24 * 60 * 60 * 1000,
        maxSessionsPerUser: parseInt(process.env.MAX_SESSIONS_PER_USER) || 5
      });

      console.log('✅ Session manager initialized');
    } catch (error) {
      console.error('❌ Session manager initialization failed:', error);
      throw error;
    }
  }

  async initializeSecurityServices() {
    try {
      console.log('🛡️  Initializing security services...');

      // Initialize security logger
      this.securityLogger = new SecurityLogger();
      global.securityLogger = this.securityLogger;

      // Initialize performance monitor
      this.performanceMonitor = new PerformanceMonitor();
      global.performanceMonitor = this.performanceMonitor;

      console.log('✅ Security services initialized');
    } catch (error) {
      console.error('❌ Security services initialization failed:', error);
      throw error;
    }
  }

  async createServer() {
    try {
      console.log('🌐 Creating HTTP server...');

      this.server = this.serverConfig.createInstance();

      // Decorate server with services
      this.server.decorate('db', this.databaseConfig);
      this.server.decorate('cache', this.cacheService);
      this.server.decorate('sessionManager', this.sessionManager);
      this.server.decorate('securityLogger', this.securityLogger);
      this.server.decorate('performanceMonitor', this.performanceMonitor);

      // Setup database connection for requests
      this.server.addHook('preHandler', async (request, reply) => {
        request.db = this.databaseConfig;
        request.cache = this.cacheService;
        request.sessionManager = this.sessionManager;
        request.securityLogger = this.securityLogger;
        request.performanceMonitor = this.performanceMonitor;
      });

      console.log('✅ HTTP server created');
    } catch (error) {
      console.error('❌ Server creation failed:', error);
      throw error;
    }
  }

  async start() {
    try {
      const host = process.env.HOST || '0.0.0.0';
      const port = parseInt(process.env.PORT) || 3000;

      console.log(`🚀 Starting server on ${host}:${port}...`);

      await this.server.listen({ host, port });

      console.log(`🎉 Server started successfully!`);
      console.log(`📍 Server URL: http://${host}:${port}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📊 Database: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}`);
      console.log(`💾 Cache: ${this.cacheService ? 'Enabled' : 'Disabled'}`);
      console.log(`🔐 Security: ${this.securityLogger ? 'Enabled' : 'Disabled'}`);

      // Log startup event
      if (this.securityLogger) {
        this.securityLogger.logSystem('server_started', {
          host,
          port,
          environment: process.env.NODE_ENV || 'development',
          version: process.env.npm_package_version || '1.0.0'
        });
      }

      // Perform startup health checks
      await this.performHealthChecks();

    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }

  async performHealthChecks() {
    console.log('🏥 Performing startup health checks...');

    try {
      // Database health check
      const dbHealth = await this.databaseConfig.healthCheck();
      console.log(`📊 Database health:`, dbHealth);

      // Cache health check
      if (this.cacheService) {
        const cacheHealth = await this.cacheService.healthCheck();
        console.log(`💾 Cache health:`, cacheHealth);
      }

      // Session statistics
      if (this.sessionManager) {
        const sessionStats = await this.sessionManager.getSessionStatistics();
        console.log(`🔐 Session statistics:`, sessionStats);
      }

      console.log('✅ Health checks completed');
    } catch (error) {
      console.warn('⚠️  Health check warnings:', error.message);
    }
  }

  setupGracefulShutdown() {
    const gracefulShutdown = async (signal) => {
      console.log(`\n📡 Received ${signal}, starting graceful shutdown...`);

      try {
        // Log shutdown event
        if (this.securityLogger) {
          this.securityLogger.logSystem('server_shutdown', {
            signal,
            uptime: process.uptime()
          });
        }

        // Stop accepting new connections
        if (this.server) {
          await this.server.close();
          console.log('🔌 HTTP server closed');
        }

        // Close database connections
        if (this.databaseConfig) {
          await this.databaseConfig.close();
          console.log('📊 Database connections closed');
        }

        // Close cache connections
        if (this.cacheService) {
          await this.cacheService.close();
          console.log('💾 Cache connections closed');
        }

        // Close session manager
        if (this.sessionManager) {
          await this.sessionManager.shutdown();
          console.log('🔐 Session manager closed');
        }

        console.log('✅ Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    // Register signal handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('💥 Uncaught Exception:', error);
      gracefulShutdown('uncaughtException');
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('unhandledRejection');
    });
  }

  async runMigrations() {
    try {
      console.log('🔄 Running database migrations...');
      await this.databaseConfig.migrate();
      console.log('✅ Database migrations completed');
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  async seedData() {
    try {
      console.log('🌱 Seeding initial data...');

      // Check if default admin exists
      const result = await this.databaseConfig.query(
        'SELECT id FROM admin_users WHERE username = $1',
        ['admin']
      );

      if (result.rows.length === 0) {
        // Create default admin
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash('admin123', 10);

        await this.databaseConfig.query(`
          INSERT INTO admin_users (username, password_hash, role, active, created_at)
          VALUES ($1, $2, $3, $4, $5)
        `, ['admin', hashedPassword, 'super_admin', true, new Date()]);

        console.log('👤 Default admin user created (username: admin, password: admin123)');
        console.log('⚠️  Please change the default password after first login!');
      }

      console.log('✅ Initial data seeded');
    } catch (error) {
      console.error('❌ Data seeding failed:', error);
      throw error;
    }
  }

  getServer() {
    return this.server;
  }

  getDatabase() {
    return this.databaseConfig;
  }

  getCache() {
    return this.cacheService;
  }

  getSessionManager() {
    return this.sessionManager;
  }
}

module.exports = Application;