const { db } = require('../database/DatabaseManager');

async function whatsappRoutes(fastify, options) {
  // Test route to verify registration
  fastify.get('/test', async (request, reply) => {
    return { success: true, message: 'WhatsApp routes are working!' };
  });

  // Debug test route to verify registration
  fastify.get('/debug', async (request, reply) => {
    return { success: true, message: 'Debug route is working!' };
  });

  // Queue status endpoint - simple way to view message queue
  fastify.get('/queue-status', async (request, reply) => {
    try {
      // Get pending messages from notification_queue table
      const pendingMessages = await db.query(`
        SELECT
          id,
          recipient,
          message,
          priority,
          status,
          created_at,
          scheduled_at
        FROM notification_queue
        WHERE status = 'pending'
        ORDER BY created_at DESC
        LIMIT 50
      `);

      // Get queue statistics
      const queueStats = await db.query(`
        SELECT
          status,
          COUNT(*) as count
        FROM notification_queue
        GROUP BY status
      `);

      const stats = {
        pending: queueStats.find(s => s.status === 'pending')?.count || 0,
        sent: queueStats.find(s => s.status === 'sent')?.count || 0,
        failed: queueStats.find(s => s.status === 'failed')?.count || 0,
        processing: queueStats.find(s => s.status === 'processing')?.count || 0
      };

      return reply.send({
        success: true,
        statistics: stats,
        pendingMessages: pendingMessages,
        totalPending: stats.pending
      });
    } catch (error) {
      fastify.log.error('Error getting queue status:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to get queue status',
        message: error.message
      });
    }
  });

  // Use existing services from server.js
  const whatsappService = fastify.whatsappService;
  const templateService = fastify.templateService;
  const queueService = fastify.queueService;
  const rateLimiterService = fastify.rateLimiterService;
  const mikrotikService = fastify.mikrotik;

  // Initialize database models - wrapped in try-catch to prevent route loading failures
  let models = {};
  try {
    models = {
      whatsappMessage: new (require('../models/WhatsAppMessage'))(fastify.db),
      whatsappTemplate: new (require('../models/WhatsAppTemplate'))(fastify.db),
      notificationQueue: new (require('../models/NotificationQueue'))(fastify.db),
      whatsappSession: new (require('../models/WhatsAppSession'))(fastify.db)
    };

    // Set up database models for services (if not already set up)
    if (whatsappService && !whatsappService.models) {
      whatsappService.setDatabaseModels(models);
    }
  } catch (error) {
    fastify.log.warn('Failed to initialize WhatsApp models:', error.message);
    // Continue without models - some routes might not work
  }
  if (templateService && !templateService.models) {
    templateService.setDatabaseModels(models);
  }
  if (queueService && !queueService.models) {
    queueService.setDatabaseModels(models);
    queueService.setWhatsAppService(whatsappService);
  }

  // Set up database event handlers for WhatsApp service (only if service exists)
  if (whatsappService) {
    setupDatabaseEventHandlers(whatsappService, fastify);
  }

  // Set up queue service event handlers (only if service exists)
  if (queueService) {
    setupQueueEventHandlers(queueService, fastify);
  }

  // Set up rate limiter event handlers (only if service exists)
  if (rateLimiterService) {
    setupRateLimiterEventHandlers(rateLimiterService, fastify);
  }

  // Test route after setup
  fastify.get('/test-after-setup', async (request, reply) => {
    return { success: true, message: 'Route after setup is working!' };
  });

  // Initialize WhatsApp Bot service
  let botService = null;
  console.log("Checking bot service initialization...");
  console.log('   - whatsappService available:', !!whatsappService);
  console.log('   - mikrotikService available:', !!mikrotikService);

  if (whatsappService && mikrotikService) {
    const WhatsAppBotService = require('../services/WhatsAppBotService');
    botService = new WhatsAppBotService(whatsappService, fastify.db, mikrotikService);
    whatsappService.setBotService(botService);
    console.log("WhatsApp Bot Service initialized successfully");
  } else {
    console.log("WhatsApp Bot Service initialization skipped - missing dependencies");
  }

  // Initialize WhatsApp service (non-blocking, only if service exists)
  if (whatsappService) {
    whatsappService.initialize().catch(error => {
      fastify.log.error('Error initializing WhatsApp service:', error);
    });
  }

  // ===== API ROUTES (use /api prefix) =====
  console.log('Defining API routes...');

  // Generate/Get QR Code (API)
  fastify.get('/api/qr-code', async (request, reply) => {
    try {
      const status = await whatsappService.getConnectionStatus();

      if (status.isConnected) {
        return reply.send({
          success: true,
          connected: true,
          phone: status.phoneNumber,
          message: 'WhatsApp is already connected'
        });
      }

      // Generate QR code if not connected
      const qrCode = await whatsappService.generateQRCode();

      return reply.send({
        success: true,
        connected: false,
        qrCode: qrCode,
        status: status.status,
        message: 'Scan QR code with WhatsApp'
      });

    } catch (error) {
      fastify.log.error('Error generating QR code:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Check QR scan status (API)
  fastify.get('/qr-status', async (request, reply) => {
    try {
      const status = await whatsappService.getConnectionStatus();

      return reply.send({
        success: true,
        status: status.status,
        connected: status.isConnected,
        phone: status.phoneNumber,
        qrCode: status.qrCode,
        lastActivity: status.lastActivity
      });

    } catch (error) {
      fastify.log.error('Error checking QR status:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Start QR scanning (API)
  fastify.post('/scan-start', async (request, reply) => {
    try {
      // Start initialization asynchronously
      whatsappService.initialize()
        .then(() => {
          console.log('WhatsApp initialization completed successfully');
        })
        .catch((error) => {
          console.error('WhatsApp initialization failed:', error);
        });

      return reply.send({
        success: true,
        message: 'QR scanning started. Please check status endpoint for QR code.'
      });

    } catch (error) {
      fastify.log.error('Error starting QR scan:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Refresh QR Code (API) - Force generate fresh QR code
  fastify.post('/refresh-qr', async (request, reply) => {
    try {
      console.log('Force refreshing QR code...');

      // Force refresh QR code
      const qrCode = await whatsappService.refreshQRCode();

      return reply.send({
        success: true,
        qrCode: qrCode,
        message: 'QR code refreshed successfully. New QR code is ready for scanning.'
      });

    } catch (error) {
      fastify.log.error('Error refreshing QR code:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Refresh QR Code (Public API) - Force generate fresh QR code
  fastify.post('/api/refresh-qr', async (request, reply) => {
    try {
      console.log('Force refreshing QR code (public API)...');

      // Force refresh QR code
      const qrCode = await whatsappService.refreshQRCode();

      return reply.send({
        success: true,
        qrCode: qrCode,
        message: 'QR code refreshed successfully. New QR code is ready for scanning.'
      });

    } catch (error) {
      fastify.log.error('Error refreshing QR code:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Force Restart Connection (API) - Complete connection restart
  fastify.post('/restart-connection', async (request, reply) => {
    try {
      console.log('Force restarting WhatsApp connection...');

      // Start restart asynchronously (it takes time)
      whatsappService.restartConnection()
        .then(() => {
          console.log('WhatsApp connection restarted successfully');
        })
        .catch((error) => {
          console.error('WhatsApp connection restart failed:', error);
        });

      return reply.send({
        success: true,
        message: 'Connection restart initiated. This may take up to 2 minutes. Please check status endpoint for updates.'
      });

    } catch (error) {
      fastify.log.error('Error restarting connection:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // ===== CONNECTION MANAGEMENT =====

  // Get connection status (API)
  fastify.get('/api/status', async (request, reply) => {
    try {
      const status = await whatsappService.getConnectionStatus();

      // Get message statistics
      const stats = getMessageStatistics(fastify.db);

      // Get session persistence info from session manager
      let sessionData = {};
      try {
        const sessions = await whatsappService.getSessions();
        const permanentSession = sessions.find(s => s.is_permanent && s.is_active);
        if (permanentSession) {
          sessionData = {
            permanent_session: true,
            session_name: permanentSession.session_name
          };
        }
      } catch (error) {
        // Ignore session data errors
      }

      return reply.send({
        success: true,
        connection: {
          ...status,
          isPermanent: sessionData.permanent_session || false,
          sessionHealth: status.isConnected ? 'healthy' : 'disconnected'
        },
        statistics: stats,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      fastify.log.error('Error getting WhatsApp status:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  
  // Get real-time QR scan status (API)
  fastify.get('/api/qr-status', async (request, reply) => {
    try {
      const status = await whatsappService.getConnectionStatus();

      // Add QR scan specific events
      let qrScanEvent = null;

      // Listen for QR scan events once
      const onQRScanned = (data) => {
        qrScanEvent = data;
      };

      const onConnectionReady = (data) => {
        qrScanEvent = data;
      };

      whatsappService.once('qr_scanned', onQRScanned);
      whatsappService.once('connection_ready', onConnectionReady);

      // Clean up listeners after 30 seconds
      setTimeout(() => {
        whatsappService.off('qr_scanned', onQRScanned);
        whatsappService.off('connection_ready', onConnectionReady);
      }, 30000);

      return reply.send({
        success: true,
        status: status.status,
        isConnected: status.isConnected,
        phoneNumber: status.phoneNumber,
        qrCode: status.qrCode,
        scanEvent: qrScanEvent,
        message: status.message,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      fastify.log.error('Error getting QR status:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Disconnect WhatsApp (API)
  fastify.post('/disconnect', async (request, reply) => {
    try {
      await whatsappService.disconnect();

      return reply.send({
        success: true,
        message: 'WhatsApp disconnected successfully'
      });

    } catch (error) {
      fastify.log.error('Error disconnecting WhatsApp:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Reconnect session (API)
  fastify.post('/reconnect', async (request, reply) => {
    try {
      await whatsappService.reconnect();

      return reply.send({
        success: true,
        message: 'WhatsApp reconnected successfully'
      });

    } catch (error) {
      fastify.log.error('Error reconnecting WhatsApp:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Auto-reconnect with session restoration (API)
  fastify.post('/auto-reconnect', async (request, reply) => {
    try {
      const sessionRestored = await whatsappService.autoReconnect();

      return reply.send({
        success: true,
        message: sessionRestored
          ? 'WhatsApp auto-reconnected successfully using permanent session'
          : 'No valid permanent session found, started fresh connection',
        sessionRestored: sessionRestored,
        connectionStatus: await whatsappService.getConnectionStatus()
      });

    } catch (error) {
      fastify.log.error('Error auto-reconnecting WhatsApp:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Validate and restore permanent session (API)
  fastify.post('/validate-session', async (request, reply) => {
    try {
      const isValid = await whatsappService.validateSession();
      const status = await whatsappService.getConnectionStatus();

      if (isValid) {
        // Mark current valid session as permanent
        await whatsappService.markSessionPermanent();
      }

      return reply.send({
        success: true,
        valid: isValid,
        connectionStatus: status,
        message: isValid
          ? 'Current session is valid and marked as permanent'
          : 'Current session is invalid or expired'
      });

    } catch (error) {
      fastify.log.error('Error validating WhatsApp session:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // ===== TEMPLATES API ENDPOINTS (for JavaScript) =====

  // Create template (API)
  fastify.post('/api/templates', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        oneOf: [
          {
            required: ['template_content'],
            properties: {
              name: { type: 'string' },
              category: { type: 'string' },
              template_content: { type: 'string' },
              variables: { type: 'string' }
            }
          },
          {
            required: ['message'],
            properties: {
              name: { type: 'string' },
              category: { type: 'string' },
              message: { type: 'string' },
              subject: { type: 'string' },
              is_default: { type: 'boolean' },
              variables: { type: 'string' }
            }
          }
        ]
      }
    }
  }, async (request, reply) => {
    try {
      const { name, category, template_content, message, variables, subject, is_default } = request.body;

      // Use message field if template_content is not provided (for JavaScript compatibility)
      const content = template_content || message;

      const templateId = await db.insert('whatsapp_templates', {
        name: name,
        category: category || 'general',
        template_content: content,
        variables: variables || null
      });

      return reply.send({
        success: true,
        templateId,
        message: 'Template created successfully'
      });

    } catch (error) {
      fastify.log.error('Error creating template:', error);

      // Handle duplicate template names gracefully
      if (error.message.includes('UNIQUE constraint failed')) {
        return reply.status(409).send({
          success: false,
          error: 'Template dengan nama ini sudah ada',
          duplicate: true
        });
      }

      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Get single template (API)
  fastify.get('/api/templates/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      const template = await db.getOne('whatsapp_templates', { id: id, is_active: true });

      if (!template) {
        return reply.status(404).send({
          success: false,
          error: 'Template not found'
        });
      }

      // Add compatibility field names for JavaScript
      const formattedTemplate = {
        ...template,
        // Add JavaScript-friendly field names
        message: template.template_content,
        subject: template.subject || null,
        is_default: template.is_default ? true : false,
        createdAt: template.created_at,
        updatedAt: template.updated_at
      };

      return reply.send({
        success: true,
        template: formattedTemplate
      });

    } catch (error) {
      fastify.log.error('Error getting template:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Update template (API)
  fastify.put('/api/templates/:id', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        oneOf: [
          {
            required: ['template_content'],
            properties: {
              name: { type: 'string' },
              category: { type: 'string' },
              template_content: { type: 'string' },
              variables: { type: 'string' }
            }
          },
          {
            required: ['message'],
            properties: {
              name: { type: 'string' },
              category: { type: 'string' },
              message: { type: 'string' },
              subject: { type: 'string' },
              is_default: { type: 'boolean' },
              variables: { type: 'string' }
            }
          }
        ]
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { name, category, template_content, message, variables, subject, is_default } = request.body;

      // Use message field if template_content is not provided (for JavaScript compatibility)
      const content = template_content || message;

      const result = await db.update('whatsapp_templates',
        {
          name: name,
          category: category || 'general',
          template_content: content,
          variables: variables || null,
          updated_at: 'CURRENT_TIMESTAMP'
        },
        { id: id }
      );

      if (result === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Template not found'
        });
      }

      return reply.send({
        success: true,
        message: 'Template updated successfully'
      });

    } catch (error) {
      fastify.log.error('Error updating template:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Delete template (API)
  fastify.delete('/api/templates/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      const result = await db.update('whatsapp_templates', { is_active: 0 }, { id: id });

      if (result === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Template not found'
        });
      }

      return reply.send({
        success: true,
        message: 'Template deleted successfully'
      });

    } catch (error) {
      fastify.log.error('Error deleting template:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Toggle default template (API)
  fastify.post('/api/templates/:id/toggle-default', async (request, reply) => {
    try {
      const { id } = request.params;

      // First, unset all default templates in the same category
      const template = await db.getOne('whatsapp_templates', { id: id });

      if (template) {
        await db.update('whatsapp_templates', { is_default: 0 }, { category: template.category });
      }

      // Set this template as default
      const result = await db.update('whatsapp_templates', { is_default: 1 }, { id: id });

      if (result === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Template not found'
        });
      }

      return reply.send({
        success: true,
        message: 'Template set as default successfully'
      });

    } catch (error) {
      fastify.log.error('Error toggling default template:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // ===== MESSAGE MANAGEMENT =====

  // Send message (Enhanced with queue and rate limiting) (API)
  fastify.post('/api/send', {
    schema: {
      body: {
        type: 'object',
        required: ['to', 'message'],
        properties: {
          to: { type: 'string' },
          message: { type: 'string' },
          priority: { type: 'string', enum: ['urgent', 'high', 'normal', 'low', 'bulk'] },
          relatedId: { type: 'number' },
          relatedType: { type: 'string' },
          templateId: { type: 'number' },
          templateData: { type: 'object' },
          scheduledAt: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const {
        to,
        message,
        priority = 'normal',
        relatedId,
        relatedType,
        templateId,
        templateData,
        scheduledAt
      } = request.body;

      // Check rate limiting first
      const rateLimitCheck = await rateLimiterService.checkLimit({ priority });
      if (!rateLimitCheck.allowed) {
        // If rate limited, queue the message
        const queueId = await queueService.addMessage({
          recipient: to,
          message: message,
          priority: priority,
          templateId: templateId,
          templateData: templateData,
          relatedId: relatedId,
          relatedType: relatedType,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date()
        });

        return reply.status(429).send({
          success: false,
          rateLimited: true,
          queued: true,
          queueId: queueId,
          retryAfter: rateLimitCheck.retryAfter,
          message: 'Message queued due to rate limiting'
        });
      }

      // Send message directly
      const result = await whatsappService.sendMessage(to, message, {
        priority: priority,
        relatedId: relatedId,
        relatedType: relatedType,
        templateId: templateId,
        templateData: templateData
      });

      // Record the message in rate limiter
      rateLimiterService.recordMessage();

      return reply.send({
        success: true,
        message: result,
        rateLimit: rateLimitCheck
      });

    } catch (error) {
      fastify.log.error('Error sending WhatsApp message:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // ===== QUEUE MANAGEMENT ENDPOINTS =====

  // Get queue statistics (API)
  fastify.get('/api/queue/stats', async (request, reply) => {
    try {
      const stats = await queueService.getQueueStats();
      const rateLimitStats = rateLimiterService.getStats();

      return reply.send({
        success: true,
        queue: stats,
        rateLimit: rateLimitStats
      });

    } catch (error) {
      fastify.log.error('Error getting queue stats:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Process queue manually (API)
  fastify.post('/api/queue/process', async (request, reply) => {
    try {
      const results = await queueService.processQueue();

      return reply.send({
        success: true,
        results: results
      });

    } catch (error) {
      fastify.log.error('Error processing queue:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Get pending messages (API)
  fastify.get('/api/queue/pending', async (request, reply) => {
    try {
      const { limit = 50, priority, status = 'pending' } = request.query;

      let whereClause = 'WHERE status = $1';
      let params = [status];

      if (priority) {
        whereClause += ` AND priority = $${params.length + 1}`;
        params.push(priority);
      }

      const messages = await db.query(`
        SELECT * FROM notification_queue
        ${whereClause}
        ORDER BY priority_weight ASC, created_at ASC
        LIMIT $${params.length + 1}
      `, [...params, parseInt(limit)]);

      return reply.send({
        success: true,
        messages: messages,
        count: messages.length
      });

    } catch (error) {
      fastify.log.error('Error getting pending messages:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Retry failed messages (API)
  fastify.post('/api/queue/retry', {
    schema: {
      body: {
        type: 'object',
        required: ['queueIds'],
        properties: {
          queueIds: { type: 'array', items: { type: 'number' } }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { queueIds } = request.body;

      const results = await queueService.retryFailedMessages(queueIds);

      return reply.send({
        success: true,
        results: results
      });

    } catch (error) {
      fastify.log.error('Error retrying failed messages:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Clear pending messages (API)
  fastify.post('/api/queue/clear', {
    schema: {
      body: {
        type: 'object',
        properties: {
          priority: { type: 'string' },
          olderThan: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { priority, olderThan } = request.body;

      const filters = {};
      if (priority) filters.priority = priority;
      if (olderThan) filters.olderThan = new Date(olderThan);

      const cleared = await queueService.clearPendingMessages(filters);

      return reply.send({
        success: true,
        cleared: cleared,
        message: `Cleared ${cleared} pending messages`
      });

    } catch (error) {
      fastify.log.error('Error clearing pending messages:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // ===== TEMPLATE PROCESSING ENDPOINTS =====

  // Send template message (API)
  fastify.post('/api/send-template', {
    schema: {
      body: {
        type: 'object',
        required: ['to', 'templateId'],
        properties: {
          to: { type: 'string' },
          templateId: { type: 'number' },
          variables: { type: 'object' },
          priority: { type: 'string', enum: ['urgent', 'high', 'normal', 'low', 'bulk'] },
          relatedId: { type: 'number' },
          relatedType: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const {
        to,
        templateId,
        variables = {},
        priority = 'normal',
        relatedId,
        relatedType
      } = request.body;

      // Process template first
      const templateResult = await templateService.processTemplate(templateId, variables);

      // Check rate limiting
      const rateLimitCheck = await rateLimiterService.checkLimit({ priority });
      if (!rateLimitCheck.allowed) {
        // Queue the processed template
        const queueId = await queueService.addMessage({
          recipient: to,
          message: templateResult.processedContent,
          priority: priority,
          templateId: templateId,
          templateData: variables,
          relatedId: relatedId,
          relatedType: relatedType
        });

        return reply.status(429).send({
          success: false,
          rateLimited: true,
          queued: true,
          queueId: queueId,
          retryAfter: rateLimitCheck.retryAfter,
          template: templateResult,
          message: 'Template message queued due to rate limiting'
        });
      }

      // Send processed template
      const result = await whatsappService.sendMessage(to, templateResult.processedContent, {
        priority: priority,
        relatedId: relatedId,
        relatedType: relatedType,
        templateId: templateId,
        templateData: variables
      });

      // Record the message in rate limiter
      rateLimiterService.recordMessage();

      return reply.send({
        success: true,
        message: result,
        template: templateResult,
        rateLimit: rateLimitCheck
      });

    } catch (error) {
      fastify.log.error('Error sending template message:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Process template preview (API)
  fastify.post('/message-templates/preview', {
    schema: {
      body: {
        type: 'object',
        required: ['templateId'],
        properties: {
          templateId: { type: 'number' },
          variables: { type: 'object' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { templateId, variables = {} } = request.body;

      const result = await templateService.processTemplate(templateId, variables);

      return reply.send({
        success: true,
        template: result
      });

    } catch (error) {
      fastify.log.error('Error previewing template:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // ===== RATE LIMITING ENDPOINTS =====

  // Get rate limiting status (API)
  fastify.get('/rate-limit/status', async (request, reply) => {
    try {
      const stats = rateLimiterService.getStats();
      const currentUsage = rateLimiterService.getCurrentUsage();

      return reply.send({
        success: true,
        stats: stats,
        current: currentUsage
      });

    } catch (error) {
      fastify.log.error('Error getting rate limit status:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Check rate limit for message (API)
  fastify.post('/rate-limit/check', {
    schema: {
      body: {
        type: 'object',
        properties: {
          priority: { type: 'string', enum: ['urgent', 'high', 'normal', 'low', 'bulk'] }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { priority = 'normal' } = request.body;

      const result = await rateLimiterService.checkLimit({ priority });

      return reply.send({
        success: true,
        check: result
      });

    } catch (error) {
      fastify.log.error('Error checking rate limit:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // ===== BULK OPERATIONS ENDPOINTS =====

  // Send bulk messages (API)
  fastify.post('/api/bulk/send', {
    schema: {
      body: {
        type: 'object',
        required: ['messages'],
        properties: {
          messages: {
            type: 'array',
            items: {
              type: 'object',
              required: ['to', 'message'],
              properties: {
                to: { type: 'string' },
                message: { type: 'string' },
                priority: { type: 'string', enum: ['urgent', 'high', 'normal', 'low', 'bulk'] },
                relatedId: { type: 'number' },
                relatedType: { type: 'string' }
              }
            }
          },
          priority: { type: 'string', enum: ['urgent', 'high', 'normal', 'low', 'bulk'] },
          delayBetween: { type: 'number' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { messages, priority = 'bulk', delayBetween = 2000 } = request.body;

      const results = {
        successful: [],
        failed: [],
        queued: [],
        rateLimited: []
      };

      // Process messages in batches with delays
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        const messagePriority = message.priority || priority;

        try {
          // Check rate limiting for each message
          const rateLimitCheck = await rateLimiterService.checkLimit({ priority: messagePriority });

          if (!rateLimitCheck.allowed) {
            // Queue rate limited messages
            const queueId = await queueService.addMessage({
              recipient: message.to,
              message: message.message,
              priority: messagePriority,
              relatedId: message.relatedId,
              relatedType: message.relatedType,
              scheduledAt: new Date(Date.now() + rateLimitCheck.retryAfter)
            });

            results.queued.push({
              index: i,
              to: message.to,
              queueId: queueId,
              retryAfter: rateLimitCheck.retryAfter
            });
            results.rateLimited.push(i);
          } else {
            // Send message directly
            const sendResult = await whatsappService.sendMessage(message.to, message.message, {
              priority: messagePriority,
              relatedId: message.relatedId,
              relatedType: message.relatedType
            });

            // Record in rate limiter
            rateLimiterService.recordMessage();

            results.successful.push({
              index: i,
              to: message.to,
              messageId: sendResult.id,
              status: sendResult.status
            });
          }

          // Add delay between messages (except for urgent priority)
          if (messagePriority !== 'urgent' && i < messages.length - 1 && delayBetween > 0) {
            await new Promise(resolve => setTimeout(resolve, delayBetween));
          }

        } catch (error) {
          results.failed.push({
            index: i,
            to: message.to,
            error: error.message
          });
        }
      }

      return reply.send({
        success: true,
        results: results,
        summary: {
          total: messages.length,
          successful: results.successful.length,
          failed: results.failed.length,
          queued: results.queued.length,
          rateLimited: results.rateLimited.length
        }
      });

    } catch (error) {
      fastify.log.error('Error sending bulk messages:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Send bulk template messages (API)
  fastify.post('/api/bulk/send-templates', {
    schema: {
      body: {
        type: 'object',
        required: ['recipients', 'templateId'],
        properties: {
          recipients: {
            type: 'array',
            items: {
              type: 'object',
              required: ['to'],
              properties: {
                to: { type: 'string' },
                variables: { type: 'object' },
                relatedId: { type: 'number' },
                relatedType: { type: 'string' }
              }
            }
          },
          templateId: { type: 'number' },
          priority: { type: 'string', enum: ['urgent', 'high', 'normal', 'low', 'bulk'] },
          delayBetween: { type: 'number' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { recipients, templateId, priority = 'bulk', delayBetween = 2000 } = request.body;

      // Process template first to get the template content
      const template = await db.getOne('whatsapp_templates', { id: templateId, is_active: true });
      if (!template) {
        return reply.status(404).send({
          success: false,
          error: 'Template not found'
        });
      }

      const results = {
        successful: [],
        failed: [],
        queued: [],
        rateLimited: []
      };

      // Process each recipient
      for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        const recipientPriority = recipient.priority || priority;

        try {
          // Process template with recipient variables
          const templateResult = await templateService.processTemplate(templateId, recipient.variables || {});

          // Check rate limiting
          const rateLimitCheck = await rateLimiterService.checkLimit({ priority: recipientPriority });

          if (!rateLimitCheck.allowed) {
            // Queue rate limited template
            const queueId = await queueService.addMessage({
              recipient: recipient.to,
              message: templateResult.processedContent,
              priority: recipientPriority,
              templateId: templateId,
              templateData: recipient.variables,
              relatedId: recipient.relatedId,
              relatedType: recipient.relatedType,
              scheduledAt: new Date(Date.now() + rateLimitCheck.retryAfter)
            });

            results.queued.push({
              index: i,
              to: recipient.to,
              queueId: queueId,
              template: templateResult,
              retryAfter: rateLimitCheck.retryAfter
            });
            results.rateLimited.push(i);
          } else {
            // Send template directly
            const sendResult = await whatsappService.sendMessage(recipient.to, templateResult.processedContent, {
              priority: recipientPriority,
              relatedId: recipient.relatedId,
              relatedType: recipient.relatedType,
              templateId: templateId,
              templateData: recipient.variables
            });

            // Record in rate limiter
            rateLimiterService.recordMessage();

            results.successful.push({
              index: i,
              to: recipient.to,
              messageId: sendResult.id,
              template: templateResult,
              status: sendResult.status
            });
          }

          // Add delay between messages (except for urgent priority)
          if (recipientPriority !== 'urgent' && i < recipients.length - 1 && delayBetween > 0) {
            await new Promise(resolve => setTimeout(resolve, delayBetween));
          }

        } catch (error) {
          results.failed.push({
            index: i,
            to: recipient.to,
            error: error.message
          });
        }
      }

      return reply.send({
        success: true,
        results: results,
        template: template,
        summary: {
          total: recipients.length,
          successful: results.successful.length,
          failed: results.failed.length,
          queued: results.queued.length,
          rateLimited: results.rateLimited.length
        }
      });

    } catch (error) {
      fastify.log.error('Error sending bulk template messages:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Bulk retry failed messages (API)
  fastify.post('/api/bulk/retry', {
    schema: {
      body: {
        type: 'object',
        required: ['queueIds'],
        properties: {
          queueIds: { type: 'array', items: { type: 'number' } },
          priority: { type: 'string', enum: ['urgent', 'high', 'normal', 'low', 'bulk'] }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { queueIds, priority = 'normal' } = request.body;

      // Limit bulk operations to prevent system overload
      const maxBulkSize = 100;
      if (queueIds.length > maxBulkSize) {
        return reply.status(400).send({
          success: false,
          error: `Bulk operations limited to ${maxBulkSize} items per request`
        });
      }

      const results = await queueService.retryFailedMessages(queueIds);

      return reply.send({
        success: true,
        results: results,
        summary: {
          total: queueIds.length,
          successful: results.success.length,
          failed: results.failed.length
        }
      });

    } catch (error) {
      fastify.log.error('Error bulk retrying messages:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Bulk delete pending messages (API)
  fastify.post('/api/bulk/delete', {
    schema: {
      body: {
        type: 'object',
        properties: {
          queueIds: { type: 'array', items: { type: 'number' } },
          filters: {
            type: 'object',
            properties: {
              priority: { type: 'string' },
              olderThan: { type: 'string' },
              status: { type: 'string' }
            }
          }
        },
        oneOf: [
          { required: ['queueIds'] },
          { required: ['filters'] }
        ]
      }
    }
  }, async (request, reply) => {
    try {
      const { queueIds, filters } = request.body;

      let deletedCount = 0;

      if (queueIds && queueIds.length > 0) {
        // Delete specific queue items
        const result = await db.query(
          'DELETE FROM notification_queue WHERE id = ANY($1)',
          [queueIds]
        );
        deletedCount = result;
      } else if (filters) {
        // Delete by filters
        let whereClause = 'WHERE 1=1';
        let params = [];
        let paramIndex = 1;

        if (filters.priority) {
          whereClause += ` AND priority = $${paramIndex++}`;
          params.push(filters.priority);
        }

        if (filters.status) {
          whereClause += ` AND status = $${paramIndex++}`;
          params.push(filters.status);
        }

        if (filters.olderThan) {
          whereClause += ` AND created_at < $${paramIndex++}`;
          params.push(filters.olderThan);
        }

        const result = await db.query(
          `DELETE FROM notification_queue ${whereClause}`,
          params
        );
        deletedCount = result;
      }

      return reply.send({
        success: true,
        deleted: deletedCount,
        message: `Successfully deleted ${deletedCount} messages`
      });

    } catch (error) {
      fastify.log.error('Error bulk deleting messages:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Bulk queue status check (API)
  fastify.post('/api/bulk/status', {
    schema: {
      body: {
        type: 'object',
        required: ['queueIds'],
        properties: {
          queueIds: { type: 'array', items: { type: 'number' } }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { queueIds } = request.body;

      // Limit bulk operations
      const maxBulkSize = 200;
      if (queueIds.length > maxBulkSize) {
        return reply.status(400).send({
          success: false,
          error: `Bulk operations limited to ${maxBulkSize} items per request`
        });
      }

      const messages = await db.query(`
        SELECT id, status, recipient, message, priority, created_at, updated_at,
               retry_count, max_retries, last_error, scheduled_at
        FROM notification_queue
        WHERE id = ANY($1)
        ORDER BY id
      `, [queueIds]);

      // Group by status
      const statusGroups = messages.reduce((groups, msg) => {
        if (!groups[msg.status]) {
          groups[msg.status] = [];
        }
        groups[msg.status].push(msg);
        return groups;
      }, {});

      return reply.send({
        success: true,
        messages: messages,
        statusGroups: statusGroups,
        summary: {
          total: messages.length,
          byStatus: Object.keys(statusGroups).reduce((summary, status) => {
            summary[status] = statusGroups[status].length;
            return summary;
          }, {})
        }
      });

    } catch (error) {
      fastify.log.error('Error checking bulk status:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Get message history (API)
  fastify.get('/api/messages', async (request, reply) => {
    try {
      const {
        page = 1,
        limit = 50,
        status,
        type,
        search,
        dateFrom,
        dateTo
      } = request.query;

      const offset = (page - 1) * limit;

      // Build query using Knex
      let query = db.table('whatsapp_messages');

      if (status) {
        query = query.where('status', status);
      }

      if (type) {
        query = query.where('message_type', type);
      }

      if (search) {
        query = query.where(function() {
          this.where('content', 'like', `%${search}%`)
            .orWhere('to_number', 'like', `%${search}%`)
            .orWhere('from_number', 'like', `%${search}%`);
        });
      }

      if (dateFrom) {
        query = query.where('created_at', '>=', dateFrom);
      }

      if (dateTo) {
        query = query.where('created_at', '<=', dateTo);
      }

      // Get total count
      const countResult = await query.clone().count('* as total').first();
      const total = countResult ? parseInt(countResult.total) : 0;

      // Get messages
      const messages = await query
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset);

      // Get statistics
      const statusStats = await db.table('whatsapp_messages')
        .select('status')
        .count('* as count')
        .groupBy('status');

      return reply.send({
        success: true,
        messages: messages,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        },
        statistics: {
          byStatus: statusStats
        }
      });

    } catch (error) {
      fastify.log.error('Error getting message history:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Get message detail (API)
  fastify.get('/api/messages/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      const result = await db.query(`
        SELECT * FROM whatsapp_messages
        WHERE message_id = $1 OR id = $2
      `, [id, id]);

      const message = result.rows[0];

      if (!message) {
        return reply.status(404).send({
          success: false,
          error: 'Message not found'
        });
      }

      return reply.send({
        success: true,
        message: message
      });

    } catch (error) {
      fastify.log.error('Error getting message detail:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Retry failed message (API)
  fastify.post('/api/retry/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      const result = await whatsappService.retryFailedMessage(id);

      return reply.send({
        success: true,
        message: result
      });

    } catch (error) {
      fastify.log.error('Error retrying message:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // ===== SETTINGS MANAGEMENT =====

  // Get WhatsApp settings (API)
  fastify.get('/api/settings', async (request, reply) => {
    try {
      // Get settings from database or use defaults
      const settings = await getWhatsAppSettings(fastify.db);

      return reply.send({
        success: true,
        settings: settings
      });

    } catch (error) {
      fastify.log.error('Error getting WhatsApp settings:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Save WhatsApp settings (API)
  fastify.post('/api/settings', {
    schema: {
      body: {
        type: 'object',
        properties: {
          auto_reply_enabled: { type: 'boolean' },
          message_delay: { type: 'number' },
          max_retries: { type: 'number' },
          session_timeout: { type: 'number' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const {
        auto_reply_enabled,
        message_delay,
        max_retries,
        session_timeout
      } = request.body;

      // Save settings to database
      saveWhatsAppSettings(fastify.db, {
        auto_reply_enabled: auto_reply_enabled || false,
        message_delay: message_delay || 1,
        max_retries: max_retries || 3,
        session_timeout: session_timeout || 24
      });

      return reply.send({
        success: true,
        message: 'Settings saved successfully'
      });

    } catch (error) {
      fastify.log.error('Error saving WhatsApp settings:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Get daily expiry settings (API)
  fastify.get('/api/daily-expiry-settings', async (request, reply) => {
    try {
      const settings = getDailyExpirySettings(fastify.db);

      return reply.send({
        success: true,
        settings: settings
      });

    } catch (error) {
      fastify.log.error('Error getting daily expiry settings:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Save daily expiry settings (API)
  fastify.post('/api/daily-expiry-settings', {
    schema: {
      body: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          days_before_expiry: { type: 'number' },
          reminder_time: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const {
        enabled,
        days_before_expiry,
        reminder_time
      } = request.body;

      saveDailyExpirySettings(fastify.db, {
        enabled: enabled || false,
        days_before_expiry: days_before_expiry || 7,
        reminder_time: reminder_time || '09:00'
      });

      return reply.send({
        success: true,
        message: 'Daily expiry settings saved successfully'
      });

    } catch (error) {
      fastify.log.error('Error saving daily expiry settings:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Get realtime expiry settings (API)
  fastify.get('/api/realtime-expiry-settings', async (request, reply) => {
    try {
      const settings = getRealtimeExpirySettings(fastify.db);

      return reply.send({
        success: true,
        settings: settings
      });

    } catch (error) {
      fastify.log.error('Error getting realtime expiry settings:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Save realtime expiry settings (API)
  fastify.post('/api/realtime-expiry-settings', {
    schema: {
      body: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          notification_delay_minutes: { type: 'number' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const {
        enabled,
        notification_delay_minutes
      } = request.body;

      saveRealtimeExpirySettings(fastify.db, {
        enabled: enabled || false,
        notification_delay_minutes: notification_delay_minutes || 5
      });

      return reply.send({
        success: true,
        message: 'Realtime expiry settings saved successfully'
      });

    } catch (error) {
      fastify.log.error('Error saving realtime expiry settings:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // ===== TEMPLATE MANAGEMENT =====

  // Get templates for API (used by JavaScript)
  fastify.get('/api/templates', async (request, reply) => {
    try {
      const { category } = request.query;

      let query = 'SELECT * FROM whatsapp_templates WHERE is_active = true';
      let params = [];

      if (category) {
        query += ` AND category = $${params.length + 1}`;
        params.push(category);
      }

      query += ' ORDER BY name';

      const templates = await db.query(query, params);

      // Add compatibility field names for JavaScript
      const formattedTemplates = (templates.rows || templates).map(template => ({
        ...template,
        // Add JavaScript-friendly field names
        message: template.template_content,
        subject: template.subject || null,
        is_default: template.is_default ? true : false,
        createdAt: template.created_at,
        updatedAt: template.updated_at
      }));

      return reply.send({
        success: true,
        templates: formattedTemplates
      });

    } catch (error) {
      fastify.log.error('Error getting templates:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // ===== MULTI-SESSION API ENDPOINTS =====

  // Get all sessions
  fastify.get('/api/sessions', async (request, reply) => {
    try {
      const sessions = await db.query(`
        SELECT * FROM whatsapp_sessions
        WHERE is_active = true
        ORDER BY priority DESC, session_name
      `);

      return reply.send({
        success: true,
        sessions: sessions.rows || []
      });
    } catch (error) {
      fastify.log.error('Error getting sessions:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Get single session details
  fastify.get('/api/sessions/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      const session = await db.getOne('whatsapp_sessions', { id: id, is_active: true });

      if (!session) {
        return reply.status(404).send({
          success: false,
          error: 'Session not found'
        });
      }

      return reply.send({
        success: true,
        session: session
      });
    } catch (error) {
      fastify.log.error('Error getting session details:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Create new session
  fastify.post('/api/sessions', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          phone_number: { type: 'string' },
          is_default: { type: 'boolean' },
          priority: { type: 'number' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name, type, phone_number, is_default, priority } = request.body;

      // Set default session if needed
      if (is_default) {
        await db.query(`
          UPDATE whatsapp_sessions
          SET is_default = false
          WHERE is_default = true
        `);
      }

      // Create session
      const sessionId = await db.insert('whatsapp_sessions', {
        session_name: name,
        type: type || 'personal',
        phone_number: phone_number,
        is_default: is_default || false,
        priority: priority || 1,
        status: 'disconnected',
        is_active: true,
        created_at: 'CURRENT_TIMESTAMP',
        updated_at: 'CURRENT_TIMESTAMP'
      });

      // Get created session
      const session = await db.getOne('whatsapp_sessions', { id: sessionId });

      if (!session) {
        return reply.status(500).send({
          success: false,
          error: 'Failed to create session'
        });
      }

      // If it's a business type session, create QR code immediately
      if (type === 'business') {
        try {
          const qrCode = await whatsappService.generateQRCode();
          // Store QR code in session
          await db.update('whatsapp_sessions', {
            qr_code: qrCode,
            status: 'connecting',
            last_activity: 'CURRENT_TIMESTAMP'
          }, { id: sessionId });
        } catch (qrError) {
          console.error('Error generating QR code for business session:', qrError);
        }
      }

      return reply.send({
        success: true,
        session: session,
        message: 'Session created successfully'
      });

    } catch (error) {
      fastify.log.error('Error creating session:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Update session
  fastify.put('/api/sessions/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          session_name: { type: 'string' },
          type: { type: 'string' },
          phone_number: { type: 'string' },
          is_active: { type: 'boolean' },
          priority: { type: 'number' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { session_name, type, phone_number, is_active, priority } = request.body;

      const result = await db.update('whatsapp_sessions',
        {
          session_name: session_name,
          type: type,
          phone_number: phone_number,
          is_active: is_active,
          priority: priority,
          updated_at: 'CURRENT_TIMESTAMP'
        },
        { id: id }
      );

      if (result === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Session not found'
        });
      }

      // Get updated session
      const session = await db.getOne('whatsapp_sessions', { id: id });

      return reply.send({
        success: true,
        session: session
      });

    } catch (error) {
      fastify.log.error('Error updating session:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Delete session
  fastify.delete('/api/sessions/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      // Soft delete session
      const result = await db.update('whatsapp_sessions',
        { is_active: 0 },
        { id: id }
      );

      if (result === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Session not found'
        });
      }

      return reply.send({
        success: true,
        message: 'Session deleted successfully'
      });

    } catch (error) {
      fastify.log.error('Error deleting session:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Connect session (generate QR code)
  fastify.post('/api/sessions/:id/connect', async (request, reply) => {
    try {
      const { id } = request.params;

      // Check if session exists and is disconnected
      const session = await db.getOne('whatsapp_sessions', { id: id, is_active: true });

      if (!session) {
        return reply.status(404).send({
          success: false,
          error: 'Session not found'
        });
      }

      if (session.status === 'connected') {
        return reply.send({
          success: true,
          connected: true,
          message: 'Session is already connected'
        });
      }

      // Generate QR code
      const qrCode = await whatsappService.generateQRCode();

      // Update session with QR code
      await db.update('whatsapp_sessions', {
        qr_code: qrCode,
        status: 'connecting',
        last_activity: 'CURRENT_TIMESTAMP'
      }, { id: id });

      return reply.send({
        success: true,
        qrCode: qrCode,
        message: 'QR code generated. Please scan with WhatsApp to connect.'
      });

    } catch (error) {
      fastify.log.error('Error connecting session:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Refresh QR code for session
  fastify.post('/api/sessions/:id/qr-code', async (request, reply) => {
    try {
      const { id } = request.params;

      // Check if session exists
      const session = await db.getOne('whatsapp_sessions', { id: id, is_active: true });

      if (!session) {
        return reply.status(404).send({
          success: false,
          error: 'Session not found'
        });
      }

      // Generate fresh QR code
      const qrCode = await whatsappService.refreshQRCode();

      // Update session with new QR code
      await db.update('whatsapp_sessions', {
        qr_code: qrCode,
        status: session.status === 'connected' ? 'connected' : 'connecting',
        last_activity: 'CURRENT_TIMESTAMP'
      }, { id: id });

      return reply.send({
        success: true,
        qrCode: qrCode,
        message: 'QR code refreshed successfully'
      });

    } catch (error) {
      fastify.log.error('Error refreshing QR code:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Disconnect session
  fastify.post('/api/sessions/:id/disconnect', async (request, reply) => {
    try {
      const { id } = request.params;

      // Check if session exists and is connected
      const session = await db.getOne('whatsapp_sessions', { id: id, is_active: true });

      if (!session) {
        return reply.status(404).send({
          success: false,
          error: 'Session not found'
        });
      }

      if (session.status !== 'connected') {
        return reply.send({
          success: true,
          message: 'Session is not connected'
        });
      }

      // Disconnect WhatsApp
      await whatsappService.disconnect();

      // Update session status
      await db.update('whatsapp_sessions', {
        status: 'disconnected',
        last_activity: 'CURRENT_TIMESTAMP',
        qr_code: null
      }, { id: id });

      return reply.send({
        success: true,
        message: 'Session disconnected successfully'
      });

    } catch (error) {
      fastify.log.error('Error disconnecting session:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Get messages for a specific session
  fastify.get('/api/sessions/:id/messages', async (request, reply) => {
    try {
      const { id } = request.params;
      const { limit = 50 } = request.query;

      // Get session details
      const session = await db.getOne('whatsapp_sessions', { id: id, is_active: true });

      if (!session) {
        return reply.status(404).send({
          success: false,
          error: 'Session not found'
        });
      }

      // Get messages from both whatsapp_messages and notification_queue
      const messages = await db.query(`
        SELECT
          wm.message_id, wm.to_number, wm.content, wm.status, wm.created_at, wm.message_type,
          wm.error_message, NULL as template_name, wm.related_type,
          'sent' as source_type, NULL as priority
        FROM whatsapp_messages wm
        WHERE wm.to_number = $1 OR wm.from_number = $2
        AND (wm.status = 'sent' OR wm.status = 'delivered')
        ORDER BY wm.created_at DESC
        LIMIT $1
      `, [session.phone_number, session.phone_number, limit]);

      // Also include queue messages for this session (if phone matches)
      const queueMessages = await db.query(`
        SELECT
          nq.id, nq.recipient as to_number, nq.message as content, nq.status,
          nq.created_at as timestamp, nq.priority
        FROM notification_queue nq
        WHERE nq.whatsapp_message_id IS NOT NULL
          AND nq.recipient = $1
        ORDER BY nq.priority ASC, nq.created_at ASC
        LIMIT 10
      `, [session.phone_number]);

      // Combine both message types
      const allMessages = [...messages, ...queueMessages];

      return reply.send({
        success: true,
        messages: allMessages,
        count: allMessages.length
      });

    } catch (error) {
      fastify.log.error('Error getting session messages:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Toggle session active status
  fastify.post('/api/sessions/:id/toggle', async (request, reply) => {
    try {
      const { id } = request.params;

      const session = await db.getOne('whatsapp_sessions', { id: id, is_active: true });

      if (!session) {
        return reply.status(404).send({
          success: false,
          error: 'Session not found'
        });
      }

      // Toggle active status
      const newStatus = !session.is_active;
      await db.update('whatsapp_sessions', { is_active: newStatus }, { id: id });

      return reply.send({
        success: true,
        isActive: newStatus
      });

    } catch (error) {
      fastify.log.error('Error toggling session status:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Check all sessions status
  fastify.get('/api/sessions/status', async (request, reply) => {
    try {
      const sessions = await db.query(`
        SELECT * FROM whatsapp_sessions
        WHERE is_active = true
        ORDER BY priority DESC, session_name
      `);

      // Update status for all sessions by checking WhatsApp connection status
      const statusUpdates = sessions.map(async (session) => {
        try {
          // Check if this session is connected via WhatsApp service
          const status = await whatsappService.getConnectionStatus();
          if (status.isConnected && status.phoneNumber === session.phone_number) {
            // Update session status to connected if connected to WhatsApp
            await db.update('whatsapp_sessions', {
              status: 'connected',
              phone_number: status.phoneNumber,
              last_activity: 'CURRENT_TIMESTAMP'
            }, { id: session.id });
            return { id: session.id, status: 'connected' };
          }
        } catch (error) {
          console.error(`Error checking session status for session ${session.id}:`, error);
          return { id: session.id, status: session.status || 'unknown' };
        }
      });

      // Wait for all status updates to complete
      const results = await Promise.all(statusUpdates);
      const updatedSessions = results.filter(r => r.status === 'connected');

      // Return all sessions with updated status
      const allSessions = sessions.map(session => {
        const result = results.find(r => r.id === session.id);
        if (result) {
          return { ...session, status: result.status };
        }
        return { ...session };
      });

      return reply.send({
        success: true,
        sessions: allSessions
      });

    } catch (error) {
      fastify.log.error('Error checking sessions status:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  
  // ===== MULTI-SESSION MANAGEMENT ENDPOINTS =====

  // Get templates for API (used by JavaScript)
  fastify.get('/message-templates', async (request, reply) => {
    try {
      const { category } = request.query;

      let query = 'SELECT * FROM whatsapp_templates WHERE is_active = true';
      let params = [];

      if (category) {
        query += ` AND category = $${params.length + 1}`;
        params.push(category);
      }

      query += ' ORDER BY name';

      const templates = await db.query(query, params);

      return reply.send({
        success: true,
        templates: templates.rows || []
      });

    } catch (error) {
      fastify.log.error('Error getting templates:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Create template (API)
  fastify.post('/message-templates', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'template_content'],
        properties: {
          name: { type: 'string' },
          category: { type: 'string' },
          template_content: { type: 'string' },
          variables: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name, category, template_content, variables } = request.body;

      const templateId = await db.insert('whatsapp_templates', {
        name: name,
        category: category || 'general',
        template_content: template_content,
        variables: variables || null
      });

      return reply.send({
        success: true,
        templateId,
        message: 'Template created successfully'
      });

    } catch (error) {
      fastify.log.error('Error creating template:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Update template (API)
  fastify.put('/message-templates/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          category: { type: 'string' },
          template_content: { type: 'string' },
          variables: { type: 'string' },
          is_active: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { name, category, template_content, variables, is_active } = request.body;

      const result = await db.update('whatsapp_templates',
        {
          name: name,
          category: category,
          template_content: template_content,
          variables: variables,
          is_active: is_active,
          updated_at: 'CURRENT_TIMESTAMP'
        },
        { id: id }
      );

      if (result === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Template not found'
        });
      }

      return reply.send({
        success: true,
        message: 'Template updated successfully'
      });

    } catch (error) {
      fastify.log.error('Error updating template:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Delete template (API)
  fastify.delete('/message-templates/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      const result = await db.update('whatsapp_templates', { is_active: 0 }, { id: id });

      if (result === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Template not found'
        });
      }

      return reply.send({
        success: true,
        message: 'Template deleted successfully'
      });

    } catch (error) {
      fastify.log.error('Error deleting template:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // ===== WEB INTERFACE ROUTES =====

  // QR Scanner page
  fastify.get('/scan', async (request, reply) => {
    return reply.view('whatsapp/scan', {
      title: 'WhatsApp Connection',
      activeMenu: 'whatsapp',
      admin: request.admin
    });
  });

  // Message history page
  fastify.get('/history', async (request, reply) => {
    return reply.view('whatsapp/history', {
      title: 'Message History',
      activeMenu: 'whatsapp',
      admin: request.admin
    });
  });

  // Get template by ID (API)
  fastify.get('/message-templates/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      const template = await db.getOne('whatsapp_templates', { id: id, is_active: true });

      if (!template) {
        return reply.status(404).send({
          success: false,
          error: 'Template not found'
        });
      }

      return reply.send({
        success: true,
        data: template
      });

    } catch (error) {
      fastify.log.error('Error getting template:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Templates management page
  fastify.get('/message-templates-page', async (request, reply) => {
    return reply.view('whatsapp/templates', {
      title: 'Message Templates',
      activeMenu: 'whatsapp',
      admin: request.admin
    });
  });

  // WhatsApp settings page
  fastify.get('/whatsapp-settings', async (request, reply) => {
    return reply.view('whatsapp/settings', {
      title: 'WhatsApp Settings',
      activeMenu: 'whatsapp',
      admin: request.admin
    });
  });

  // ===== WEB ROUTES (dashboard and pages) =====
  console.log("Defining web routes...");

  // Multi-Session Management page
  fastify.get('/multi-session', async (request, reply) => {
    return reply.view('whatsapp/index-new', {
      title: 'WhatsApp Multi-Session Management',
      activeMenu: 'whatsapp',
      admin: request.admin
    });
  });

  // Legacy WhatsApp management page (keep for backward compatibility)
  fastify.get('/management', async (request, reply) => {
    const stats = getMessageStatistics(fastify.db);
    const status = await whatsappService.getConnectionStatus();

    return reply.view('whatsapp/index', {
      title: 'WhatsApp Management',
      activeMenu: 'whatsapp',
      admin: request.admin,
      status: status,
      statistics: stats
    });
  });

  // ===== END WEB ROUTES =====
}

module.exports = whatsappRoutes;

// Helper functions
function setupQueueEventHandlers(queueService, fastify) {
  // Handle message processed events
  queueService.on('onMessageProcessed', (data) => {
    fastify.log.info(`Message processed successfully: ${data.queueId} -> ${data.messageId}`);
  });

  // Handle message failed events
  queueService.on('onMessageFailed', (data) => {
    fastify.log.warn(`Message processing failed: ${data.queueId}, will retry: ${data.willRetry}`, data.error);
  });

  // Handle queue empty events
  queueService.on('onQueueEmpty', () => {
    fastify.log.info('Message queue is empty');
  });

  // Handle general errors
  queueService.on('onError', (error) => {
    fastify.log.error('Queue service error:', error);
  });
}

function setupRateLimiterEventHandlers(rateLimiterService, fastify) {
  // Handle rate limit exceeded events
  rateLimiterService.on('onRateLimitExceeded', (result) => {
    fastify.log.warn(`'Rate limit exceeded:' ${result.reason}, retry after: ${result.retryAfter}ms`);
  });

  // Handle rate limit reset events
  rateLimiterService.on('onRateLimitReset', () => {
    fastify.log.info('Rate limit reset');
  });

  // Handle warning events
  rateLimiterService.on('onWarning', (message) => {
    fastify.log.warn('Rate limiter warning:', message);
  });
}

function setupDatabaseEventHandlers(whatsappService, fastify) {
  // Store message in database
  whatsappService.on('store_message', async (messageData) => {
    try {
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
    } catch (error) {
      fastify.log.error('Error storing message:', error);
    }
  });

  // Update message status
  whatsappService.on('update_message_status', async (data) => {
    try {
      await db.query(`
        UPDATE whatsapp_messages
        SET status = $1, error_message = $2, updated_at = CURRENT_TIMESTAMP
        WHERE message_id = $3
      `, [data.status, data.errorMessage, data.messageId]);

      // Also update notification queue if related
      if (data.errorMessage) {
        await db.query(`
          UPDATE notification_queue
          SET whatsapp_status = $1, error_message = $2
          WHERE whatsapp_message_id = $3
        `, [data.status, data.errorMessage, data.messageId]);
      }
    } catch (error) {
      fastify.log.error('Error updating message status:', error);
    }
  });

  // Update message ID
  whatsappService.on('update_message_id', async (data) => {
    try {
      await db.query(`
        UPDATE whatsapp_messages
        SET message_id = $1
        WHERE message_id = $2
      `, [data.actualId, data.tempId]);
    } catch (error) {
      fastify.log.error('Error updating message ID:', error);
    }
  });

  // Get message history
  whatsappService.on('get_message_history', async (filters) => {
    // This is handled by the API route
  });

  // Get message by ID
  whatsappService.on('get_message_by_id', async (messageId) => {
    try {
      return await db.getOne(`
        SELECT * FROM whatsapp_messages
        WHERE message_id = $1 OR id = $2
      `, [messageId, messageId]);
    } catch (error) {
      fastify.log.error('Error getting message by ID:', error);
      return null;
    }
  });

  // Update retry count
  whatsappService.on('update_retry_count', async (data) => {
    try {
      await db.query(`
        UPDATE whatsapp_messages
        SET retry_count = retry_count + 1, status = 'pending'
        WHERE message_id = $1
      `, [data.messageId]);
    } catch (error) {
      fastify.log.error('Error updating retry count:', error);
    }
  });

  // Process template
  whatsappService.on('process_template', async (data) => {
    try {
      const template = fastify.db.prepare(`
        SELECT * FROM whatsapp_templates
        WHERE name = $1 AND is_active = true
      `).get(data.templateName);

      if (template) {
        let content = template.template_content;
        const variables = JSON.parse(template.variables || '[]');

        // Replace variables
        variables.forEach(variable => {
          const regex = new RegExp(`{${variable}}`, 'g');
          content = content.replace(regex, data.variables[variable] || `{${variable}}`);
        });

        return content;
      }

      return null;
    } catch (error) {
      fastify.log.error('Error processing template:', error);
      return null;
    }
  });

  // Get templates
  whatsappService.on('get_templates', async (data) => {
    try {
      let query = 'SELECT * FROM whatsapp_templates WHERE is_active = true';
      let params = [];

      if (data.category) {
        query += ' AND category = $1';
        params.push(data.category);
      }

      query += ' ORDER BY name';

      return fastify.db.prepare(query).all(...params);
    } catch (error) {
      fastify.log.error('Error getting templates:', error);
      return [];
    }
  });
}

function getMessageStatistics(db) {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Messages today
    const todayCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM whatsapp_messages
      WHERE DATE(timestamp) = $1
    `).get(today);

    // Failed messages
    const failedCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM whatsapp_messages
      WHERE status = 'failed'
    `).get();

    // Total messages
    const totalCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM whatsapp_messages
    `).get();

    // Status breakdown
    const statusBreakdown = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM whatsapp_messages
      GROUP BY status
    `).all();

    return {
      today: todayCount.count,
      failed: failedCount.count,
      total: totalCount.count,
      byStatus: statusBreakdown
    };
  } catch (error) {
    return {
      today: 0,
      failed: 0,
      total: 0,
      byStatus: []
    };
  }
}

// Settings helper functions
async function getWhatsAppSettings(db) {
  try {
    const settings = await db.query(`
      SELECT key as setting_key, value as setting_value
      FROM settings
      WHERE key LIKE 'whatsapp_%'
    `);

    const result = {};
    settings.forEach(setting => {
      const key = setting.setting_key.replace('whatsapp_', '');
      if (key.includes('enabled') || key.includes('timeout')) {
        result[key] = parseInt(setting.setting_value);
      } else {
        result[key] = setting.setting_value;
      }
    });

    // Return defaults if no settings found
    return {
      auto_reply_enabled: result.auto_reply_enabled || false,
      message_delay: parseInt(result.message_delay) || 1,
      max_retries: parseInt(result.max_retries) || 3,
      session_timeout: parseInt(result.session_timeout) || 24
    };
  } catch (error) {
    return {
      auto_reply_enabled: false,
      message_delay: 1,
      max_retries: 3,
      session_timeout: 24
    };
  }
}

function saveWhatsAppSettings(db, settings) {
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO settings (setting_key, setting_value, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
    `);

    Object.entries(settings).forEach(([key, value]) => {
      stmt.run(`whatsapp_${key}`, value.toString());
    });
  } catch (error) {
    console.error('Error saving WhatsApp settings:');
  }
}

function getDailyExpirySettings(db) {
  try {
    const settings = db.prepare(`
      SELECT setting_key, setting_value
      FROM settings
      WHERE setting_key LIKE 'daily_expiry_''''%'
    `).all();

    const result = {};
    settings.forEach(setting => {
      const key = setting.setting_key.replace('daily_expiry_', '');
      if (key.includes('enabled')) {
        result[key] = setting.setting_value === true;
      } else if (key.includes('days')) {
        result[key] = parseInt(setting.setting_value);
      } else {
        result[key] = setting.setting_value;
      }
    });

    return {
      enabled: result.enabled !== undefined ? result.enabled : true,
      days_before_expiry: result.days_before_expiry || 7,
      reminder_time: result.reminder_time || '09:00'
    };
  } catch (error) {
    return {
      enabled: true,
      days_before_expiry: 7,
      reminder_time: '09:00'
    };
  }
}

function saveDailyExpirySettings(db, settings) {
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO settings (setting_key, setting_value, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
    `);

    Object.entries(settings).forEach(([key, value]) => {
      stmt.run(`daily_expiry_${key}`, value.toString());
    });
  } catch (error) {
    console.error('Error saving daily expiry settings:');
  }
}

function getRealtimeExpirySettings(db) {
  try {
    const settings = db.prepare(`
      SELECT setting_key, setting_value
      FROM settings
      WHERE setting_key LIKE 'realtime_expiry_''''%'
    `).all();

    const result = {};
    settings.forEach(setting => {
      const key = setting.setting_key.replace('realtime_expiry_', '');
      if (key.includes('enabled')) {
        result[key] = setting.setting_value === true;
      } else if (key.includes('minutes')) {
        result[key] = parseInt(setting.setting_value);
      } else {
        result[key] = setting.setting_value;
      }
    });

    return {
      enabled: result.enabled !== undefined ? result.enabled : true,
      notification_delay_minutes: result.notification_delay_minutes || 5
    };
  } catch (error) {
    return {
      enabled: true,
      notification_delay_minutes: 5
    };
  }
}

function saveRealtimeExpirySettings(db, settings) {
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO settings (setting_key, setting_value, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
    `);

    Object.entries(settings).forEach(([key, value]) => {
      stmt.run(`realtime_expiry_${key}`, value.toString());
    });
  } catch (error) {
    console.error('Error saving realtime expiry settings:');
  }

  // ===== BOT MANAGEMENT ROUTES =====

  // Get bot status
  fastify.get('/api/bot/status', async (request, reply) => {
    try {
      if (!botService) {
        return reply.status(503).send({
          success: false,
          error: 'Bot service not available'
        });
      }

      const status = botService.getStatus();

      return reply.send({
        success: true,
        data: status
      });
    } catch (error) {
      fastify.log.error('Error getting bot status:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to get bot status',
        message: error.message
      });
    }
  });

  // Enable/disable bot (simple toggle without requiring enabled parameter)
  fastify.post('/api/bot/toggle', async (request, reply) => {
    try {
      if (!botService) {
        return reply.status(503).send({
          success: false,
          error: 'Bot service not available'
        });
      }

      // Get current status and toggle it
      const currentStatus = botService.getStatus();
      const newEnabledState = !currentStatus.enabled;

      botService.setEnabled(newEnabledState);

      return reply.send({
        success: true,
        data: {
          enabled: newEnabledState,
          message: newEnabledState ? 'Bot enabled successfully' : 'Bot disabled successfully',
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      fastify.log.error('Error toggling bot:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to toggle bot',
        message: error.message
      });
    }
  });

  // Set bot command
  fastify.post('/api/bot/command', {
    schema: {
      body: {
        type: 'object',
        properties: {
          command: { type: 'string', minLength: 1 }
        },
        required: ['command']
      }
    }
  }, async (request, reply) => {
    try {
      const { command } = request.body;

      if (!botService) {
        return reply.status(503).send({
          success: false,
          error: 'Bot service not available'
        });
      }

      botService.setBotCommand(command);

      return reply.send({
        success: true,
        data: {
          command,
          message: 'Bot command updated successfully',
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      fastify.log.error('Error setting bot command:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to set bot command',
        message: error.message
      });
    }
  });

  // Test bot functionality
  fastify.post('/api/bot/test', {
    schema: {
      body: {
        type: 'object',
        properties: {
          phoneNumber: { type: 'string', minLength: 10 },
          message: { type: 'string', minLength: 1 }
        },
        required: ['phoneNumber', 'message']
      }
    }
  }, async (request, reply) => {
    try {
      const { phoneNumber, message } = request.body;

      if (!botService) {
        return reply.status(503).send({
          success: false,
          error: 'Bot service not available'
        });
      }

      // Send test message via WhatsApp service
      const result = await whatsappService.sendMessage(phoneNumber, message);

      return reply.send({
        success: true,
        data: {
          sent: true,
          to: phoneNumber,
          message: message,
          messageId: result.id,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      fastify.log.error('Error testing bot:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to send test message',
        message: error.message
      });
    }
  });

  // Debug route right after bot test to isolate registration issue
  fastify.get('/debug-after-bot-test', async (request, reply) => {
    return { success: true, message: 'Route after bot test is working!' };
  });

  // Debug route to test registration before messages
  fastify.get('/before-messages', async (request, reply) => {
    return { success: true, message: 'Route before messages is working!' };
  });

  // Get messages for notifications interface (compatible with notifications.js)
  fastify.get('/messages', async (request, reply) => {
    try {
      const {
        page = 1,
        limit = 10,
        status = '',
        type = 'whatsapp',
        date = ''
      } = request.query;

      // Build WHERE conditions for both tables
      const whereConditions = [];
      const params = [];

      if (status) {
        whereConditions.push('status = $1');
        params.push(status);
      }

      if (date) {
        whereConditions.push(`DATE(created_at) = $${params.length + 1}`);
        params.push(date);
      }

      const whereClause = whereConditions.length > 0 ?
        'WHERE ' + whereConditions.join(' AND ') : '';

      // Get combined messages from both whatsapp_messages and notification_queue
      const offset = (page - 1) * limit;

      // Union query to combine both sent messages and queue messages
      const messagesQuery = `
        SELECT
          id,
          related_id as customer_id,
          chat_id as to_number,
          content as message,
          status,
          created_at as timestamp,
          message_type,
          sent as source_type,
          error_message,
          NULL as template_name,
          related_type,
          normal as priority
        FROM whatsapp_messages
        ${whereClause}

        UNION ALL

        SELECT
          id,
          customer_id,
          recipient as to_number,
          message as content,
          status,
          created_at as timestamp,
          whatsapp as message_type,
          queue as source_type,
          error_message,
          NULL as template_name,
          related_type,
          priority
        FROM notification_queue
        ${whereClause}

        ORDER BY timestamp DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      const messages = fastify.db.prepare(messagesQuery).all(...params, parseInt(limit), offset);

      // Get total count for pagination
      const countQuery = `
        SELECT COUNT(*) as total FROM (
          SELECT id FROM whatsapp_messages ${whereClause}
          UNION ALL
          SELECT id FROM notification_queue ${whereClause}
        ) as combined
      `;
      const totalResult = fastify.db.prepare(countQuery).get(...params);
      const total = totalResult.total;

      // Get combined statistics
      const statsQuery = `
        SELECT
          status,
          source_type,
          COUNT(*) as count
        FROM (
          SELECT
            status,
            sent as source_type
          FROM whatsapp_messages
          ${whereClause}

          UNION ALL

          SELECT
            status,
            queue as source_type
          FROM notification_queue
          ${whereClause}
        ) as combined
        GROUP BY status, source_type
      `;
      const allStats = fastify.db.prepare(statsQuery).all(...params);

      // Calculate combined statistics
      const sentStats = allStats.filter(s => s.source_type === sent`);
      const queueStats = allStats.filter(s => s.source_type === queue`);

      const totalSent = sentStats.reduce((sum, stat) => sum + stat.count, 0);
      const totalQueued = queueStats.reduce((sum, stat) => sum + stat.count, 0);

      const totalCompleted = sentStats.find(s => s.status === 'sent')?.count || 0;
      const totalPending = (sentStats.find(s => s.status === 'pending')?.count || 0) +
                          (queueStats.find(s => s.status === 'pending')?.count || 0);
      const totalFailed = (sentStats.find(s => s.status === 'failed')?.count || 0) +
                         (queueStats.find(s => s.status === 'failed')?.count || 0);

      return reply.send({
        messages: messages,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        },
        queueStats: {
          total: total,
          sent: totalCompleted,
          pending: totalPending,
          failed: totalFailed,
          queued: totalQueued
        }
      });
    } catch (error) {
      fastify.log.error('Error getting messages:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to get messages',
        message: error.message
      });
    }
  });

  // Test route after messages to verify registration
  fastify.get('/after-messages', async (request, reply) => {
    return { success: true, message: 'Route after messages is working!' };
  });

  // Get statistics for notifications interface
  fastify.get('/statistics', async (request, reply) => {
    try {
      // Get queue statistics from notification_queue table
      const queueStats = fastify.db.prepare(`
        SELECT
          status,
          COUNT(*) as count
        FROM notification_queue
        GROUP BY status
      `).all();

      // Get WhatsApp message statistics
      const whatsappStats = fastify.db.prepare(`
        SELECT
          status,
          COUNT(*) as count
        FROM whatsapp_messages
        WHERE message_type = 'whatsapp'
        GROUP BY status
      `).all();

      // Calculate totals
      const totalQueued = queueStats.reduce((sum, stat) => sum + stat.count, 0);
      const totalWhatsapp = whatsappStats.reduce((sum, stat) => sum + stat.count, 0);

      const stats = {
        queueStats: {
          total: totalQueued,
          pending: queueStats.find(s => s.status === 'pending')?.count || 0,
          processing: queueStats.find(s => s.status === 'processing')?.count || 0,
          sent: queueStats.find(s => s.status === 'sent')?.count || 0,
          failed: queueStats.find(s => s.status === 'failed')?.count || 0,
          retrying: queueStats.find(s => s.status === 'retrying')?.count || 0
        },
        whatsappStats: {
          total: totalWhatsapp,
          sent: whatsappStats.find(s => s.status === 'sent')?.count || 0,
          pending: whatsappStats.find(s => s.status === 'pending')?.count || 0,
          failed: whatsappStats.find(s => s.status === 'failed')?.count || 0
        }
      };

      return reply.send(stats);
    } catch (error) {
      fastify.log.error('Error getting statistics:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to get statistics',
        message: error.message
      });
    }
  });
}