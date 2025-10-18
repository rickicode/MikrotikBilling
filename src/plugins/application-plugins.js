/**
 * Application-Specific Plugins
 * 
 * Custom plugins for Mikrotik Billing System including Mikrotik integration,
 * WhatsApp services, authentication, and business logic plugins.
 */

const fp = require('fastify-plugin');
const LoggerService = require('../services/LoggerService');

const logger = new LoggerService('ApplicationPlugins');

/**
 * Mikrotik Integration Plugin
 * Handles Mikrotik router communication and management
 */
const mikrotikPlugin = fp(async (server, options) => {
  const MikrotikClient = require('../services/MikrotikClient');
  
  try {
    // Create multiple client instances for different routers/locations
    const mikrotikClients = new Map();
    
    // Default Mikrotik client
    const defaultClient = new MikrotikClient({
      host: process.env.MIKROTIK_HOST,
      port: parseInt(process.env.MIKROTIK_PORT) || 8728,
      username: process.env.MIKROTIK_USERNAME,
      password: process.env.MIKROTIK_PASSWORD,
      timeout: parseInt(process.env.MIKROTIK_TIMEOUT) || 10000
    });

    await defaultClient.connect();
    mikrotikClients.set('default', defaultClient);

    // Create additional clients for multiple locations if configured
    const locations = process.env.MIKROTIK_LOCATIONS ? JSON.parse(process.env.MIKROTIK_LOCATIONS) : [];
    for (const location of locations) {
      const client = new MikrotikClient({
        host: location.host,
        port: location.port || 8728,
        username: location.username,
        password: location.password,
        timeout: location.timeout || 10000
      });

      await client.connect();
      mikrotikClients.set(location.id, client);
    }

    // Decorate server with Mikrotik services
    server.decorate('mikrotik', {
      getClient: (locationId = 'default') => mikrotikClients.get(locationId),
      getAllClients: () => Array.from(mikrotikClients.entries()),
      healthCheck: async () => {
        const results = {};
        for (const [id, client] of mikrotikClients) {
          try {
            const systemInfo = await client.getSystemInfo();
            results[id] = {
              status: 'connected',
              uptime: systemInfo.uptime,
              version: systemInfo.version
            };
          } catch (error) {
            results[id] = {
              status: 'disconnected',
              error: error.message
            };
          }
        }
        return results;
      },
      disconnect: async () => {
        for (const [id, client] of mikrotikClients) {
          try {
            await client.disconnect();
          } catch (error) {
            logger.error(`Failed to disconnect Mikrotik client ${id}`, {
              error: error.message
            });
          }
        }
      }
    });

    // Cleanup on server close
    server.addHook('onClose', async () => {
      await server.mikrotik.disconnect();
    });

    logger.info('Mikrotik plugin initialized', {
      totalClients: mikrotikClients.size,
      locations: Array.from(mikrotikClients.keys())
    });

  } catch (error) {
    logger.error('Mikrotik plugin initialization failed', { error: error.message });
    throw error;
  }
}, {
  name: 'mikrotik',
  dependencies: ['database', 'cache']
});

/**
 * WhatsApp Service Plugin
 * Handles WhatsApp Web JS integration and multi-session management
 */
const whatsappPlugin = fp(async (server, options) => {
  const WhatsAppService = require('../services/WhatsAppService');
  const WhatsAppSessionManager = require('../services/WhatsAppSessionManager');
  
  try {
    const whatsappService = new WhatsAppService();
    const sessionManager = new WhatsAppSessionManager({
      maxSessions: parseInt(process.env.WHATSAPP_MAX_SESSIONS) || 5,
      messageDelay: parseInt(process.env.WHATSAPP_MESSAGE_DELAY) || 1000,
      retryAttempts: parseInt(process.env.WHATSAPP_RETRY_ATTEMPTS) || 3
    });

    server.decorate('whatsapp', {
      service: whatsappService,
      sessionManager,
      sendMessage: async (to, message, options = {}) => {
        return await sessionManager.queueMessage(to, message, options);
      },
      createSession: async (sessionId) => {
        return await sessionManager.createSession(sessionId);
      },
      removeSession: async (sessionId) => {
        return await sessionManager.removeSession(sessionId);
      },
      getSessionStatus: async (sessionId) => {
        return await sessionManager.getSessionStatus(sessionId);
      },
      healthCheck: async () => {
        const sessions = await sessionManager.getAllSessions();
        const results = {
          totalSessions: sessions.length,
          activeSessions: sessions.filter(s => s.status === 'connected').length,
          sessions: sessions.map(s => ({
            id: s.id,
            status: s.status,
            qrCode: s.qrCode ? 'available' : 'none',
            lastActivity: s.lastActivity
          }))
        };
        return results;
      }
    });

    // Initialize WhatsApp service
    await whatsappService.initialize();

    // Cleanup on server close
    server.addHook('onClose', async () => {
      await sessionManager.shutdownAll();
      await whatsappService.shutdown();
    });

    logger.info('WhatsApp plugin initialized');
  } catch (error) {
    logger.error('WhatsApp plugin initialization failed', { error: error.message });
    // Don't throw error for optional WhatsApp service
    server.decorate('whatsapp', null);
  }
}, {
  name: 'whatsapp',
  dependencies: ['database', 'cache', 'monitoring']
});

/**
 * Authentication Plugin
 * Handles JWT authentication and role-based access control
 */
const authPlugin = fp(async (server, options) => {
  const jwt = require('jsonwebtoken');
  const bcrypt = require('bcrypt');

  // JWT verification decorator
  server.decorate('verifyJWT', async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({ error: 'Missing authentication token' });
      }

      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from database
      const result = await server.db.query(
        'SELECT id, username, role, active FROM admin_users WHERE id = $1 AND active = true',
        [decoded.userId]
      );

      if (result.rows.length === 0) {
        return reply.code(401).send({ error: 'Invalid token - user not found' });
      }

      request.user = result.rows[0];
      return;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return reply.code(401).send({ error: 'Token expired' });
      }
      return reply.code(401).send({ error: 'Invalid token' });
    }
  });

  // Role verification decorator
  server.decorate('verifyRole', (roles) => {
    return async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      if (!roles.includes(request.user.role)) {
        return reply.code(403).send({ 
          error: 'Insufficient permissions',
          required: roles,
          current: request.user.role
        });
      }
    };
  });

  // Generate JWT token
  server.decorate('generateToken', (user) => {
    return jwt.sign(
      { 
        userId: user.id, 
        username: user.username, 
        role: user.role 
      },
      process.env.JWT_SECRET,
      { 
        expiresIn: process.env.JWT_EXPIRE || '30d',
        issuer: 'mikrotik-billing',
        audience: 'mikrotik-billing-api'
      }
    );
  });

  // Hash password
  server.decorate('hashPassword', async (password) => {
    return await bcrypt.hash(password, 10);
  });

  // Verify password
  server.decorate('verifyPassword', async (password, hash) => {
    return await bcrypt.compare(password, hash);
  });

  // Authentication routes
  server.post('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 3 },
          password: { type: 'string', minLength: 6 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { username, password } = request.body;

      // Get user from database
      const result = await server.db.query(
        'SELECT id, username, password_hash, role, active FROM admin_users WHERE username = $1',
        [username]
      );

      if (result.rows.length === 0) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];

      if (!user.active) {
        return reply.code(401).send({ error: 'Account is disabled' });
      }

      // Verify password
      const isValidPassword = await server.verifyPassword(password, user.password_hash);
      if (!isValidPassword) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      // Generate token
      const token = server.generateToken(user);

      // Log successful login
      logger.info('User logged in', {
        userId: user.id,
        username: user.username,
        role: user.role,
        ip: request.ip,
        userAgent: request.headers['user-agent']
      });

      return {
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      };

    } catch (error) {
      logger.error('Login error', { error: error.message });
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  logger.info('Authentication plugin initialized');
}, {
  name: 'auth',
  dependencies: ['database', 'monitoring']
});

/**
 * Payment Plugin System
 * Handles payment gateway plugin management
 */
const paymentPlugin = fp(async (server, options) => {
  const PaymentPlugin = require('../lib/PaymentPlugin');
  
  try {
    const paymentPlugins = new Map();
    
    // Load available payment plugins
    const pluginDir = require('path').join(__dirname, '../plugins/payments');
    const fs = require('fs');

    if (fs.existsSync(pluginDir)) {
      const pluginFolders = fs.readdirSync(pluginDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const pluginFolder of pluginFolders) {
        try {
          const pluginPath = require('path').join(pluginDir, pluginFolder, 'index.js');
          const PluginClass = require(pluginPath);
          const plugin = new PluginClass();
          
          if (plugin instanceof PaymentPlugin) {
            await plugin.initialize({
              db: server.db,
              cache: server.cache,
              logger: logger
            });
            
            paymentPlugins.set(plugin.getName(), plugin);
            logger.info(`Payment plugin loaded: ${plugin.getName()}`);
          }
        } catch (error) {
          logger.error(`Failed to load payment plugin: ${pluginFolder}`, {
            error: error.message
          });
        }
      }
    }

    server.decorate('payments', {
      getPlugin: (name) => paymentPlugins.get(name),
      getAllPlugins: () => Array.from(paymentPlugins.values()),
      createPayment: async (pluginName, paymentData) => {
        const plugin = paymentPlugins.get(pluginName);
        if (!plugin) {
          throw new Error(`Payment plugin ${pluginName} not found`);
        }
        return await plugin.createPayment(paymentData);
      },
      checkStatus: async (pluginName, paymentId) => {
        const plugin = paymentPlugins.get(pluginName);
        if (!plugin) {
          throw new Error(`Payment plugin ${pluginName} not found`);
        }
        return await plugin.checkStatus(paymentId);
      },
      handleCallback: async (pluginName, callbackData) => {
        const plugin = paymentPlugins.get(pluginName);
        if (!plugin) {
          throw new Error(`Payment plugin ${pluginName} not found`);
        }
        return await plugin.handleCallback(callbackData);
      },
      healthCheck: async () => {
        const results = {};
        for (const [name, plugin] of paymentPlugins) {
          try {
            results[name] = await plugin.healthCheck();
          } catch (error) {
            results[name] = {
              status: 'unhealthy',
              error: error.message
            };
          }
        }
        return results;
      }
    });

    logger.info('Payment plugin system initialized', {
      totalPlugins: paymentPlugins.size,
      plugins: Array.from(paymentPlugins.keys())
    });

  } catch (error) {
    logger.error('Payment plugin system initialization failed', { error: error.message });
    throw error;
  }
}, {
  name: 'payment',
  dependencies: ['database', 'cache', 'monitoring']
});

/**
 * Scheduler Plugin
 * Handles background tasks and scheduled jobs
 */
const schedulerPlugin = fp(async (server, options) => {
  const cron = require('node-cron');
  const QueueService = require('../services/QueueService');
  
  try {
    const queueService = new QueueService({
      redis: server.redis,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    });

    const scheduledTasks = new Map();

    // Add scheduled jobs
    if (process.env.ENABLE_VOUCHER_CLEANUP === 'true') {
      const cleanupTask = cron.schedule('0 2 * * *', async () => {
        logger.info('Running voucher cleanup task');
        try {
          // Cleanup expired vouchers
          await server.db.query(`
            UPDATE vouchers 
            SET status = 'expired' 
            WHERE status = 'active' AND valid_until < NOW()
          `);
          logger.info('Voucher cleanup completed');
        } catch (error) {
          logger.error('Voucher cleanup failed', { error: error.message });
        }
      }, { scheduled: false });
      
      scheduledTasks.set('voucher-cleanup', cleanupTask);
    }

    // Session cleanup task
    if (server.sessionManager) {
      const sessionCleanupTask = cron.schedule('*/30 * * * *', async () => {
        logger.debug('Running session cleanup task');
        try {
          await server.sessionManager.cleanupExpiredSessions();
        } catch (error) {
          logger.error('Session cleanup failed', { error: error.message });
        }
      }, { scheduled: false });
      
      scheduledTasks.set('session-cleanup', sessionCleanupTask);
    }

    server.decorate('scheduler', {
      startTask: (taskName) => {
        const task = scheduledTasks.get(taskName);
        if (task) {
          task.start();
          logger.info(`Scheduler task started: ${taskName}`);
        }
      },
      stopTask: (taskName) => {
        const task = scheduledTasks.get(taskName);
        if (task) {
          task.stop();
          logger.info(`Scheduler task stopped: ${taskName}`);
        }
      },
      getTaskStatus: (taskName) => {
        const task = scheduledTasks.get(taskName);
        return task ? task.running : false;
      },
      getAllTasks: () => Array.from(scheduledTasks.keys()),
      queueService
    });

    // Start all scheduled tasks
    for (const [taskName, task] of scheduledTasks) {
      task.start();
      logger.info(`Scheduler task started: ${taskName}`);
    }

    // Cleanup on server close
    server.addHook('onClose', async () => {
      for (const [taskName, task] of scheduledTasks) {
        task.stop();
      }
      await queueService.close();
    });

    logger.info('Scheduler plugin initialized', {
      scheduledTasks: scheduledTasks.size,
      tasks: Array.from(scheduledTasks.keys())
    });

  } catch (error) {
    logger.error('Scheduler plugin initialization failed', { error: error.message });
    throw error;
  }
}, {
  name: 'scheduler',
  dependencies: ['database', 'cache', 'session']
});

/**
 * Audit Logging Plugin
 * Handles comprehensive audit logging for security and compliance
 */
const auditPlugin = fp(async (server, options) => {
  const AuditLogger = require('../services/AuditLogger');
  
  try {
    const auditLogger = new AuditLogger({
      db: server.db,
      logLevel: process.env.AUDIT_LOG_LEVEL || 'info',
      enableConsole: process.env.NODE_ENV !== 'production'
    });

    // Add audit logging hooks
    server.addHook('preHandler', async (request, reply) => {
      request.auditData = {
        method: request.method,
        url: request.url,
        userAgent: request.headers['user-agent'],
        ip: request.ip,
        userId: request.user?.id,
        timestamp: new Date().toISOString()
      };
    });

    server.addHook('onResponse', async (request, reply) => {
      const auditData = {
        ...request.auditData,
        statusCode: reply.statusCode,
        responseTime: reply.getResponseTime(),
        requestId: request.id
      };

      // Log sensitive operations
      const sensitiveRoutes = ['/api/auth', '/api/admin', '/api/payments'];
      const isSensitive = sensitiveRoutes.some(route => request.url.startsWith(route));

      if (isSensitive || reply.statusCode >= 400) {
        await auditLogger.log({
          action: `${request.method} ${request.url}`,
          category: reply.statusCode >= 400 ? 'error' : 'access',
          severity: reply.statusCode >= 500 ? 'high' : 'low',
          data: auditData
        });
      }
    });

    server.decorate('auditLogger', auditLogger);

    logger.info('Audit logging plugin initialized');
  } catch (error) {
    logger.error('Audit logging plugin initialization failed', { error: error.message });
    throw error;
  }
}, {
  name: 'audit',
  dependencies: ['database', 'monitoring']
});

module.exports = {
  mikrotikPlugin,
  whatsappPlugin,
  authPlugin,
  paymentPlugin,
  schedulerPlugin,
  auditPlugin
};
