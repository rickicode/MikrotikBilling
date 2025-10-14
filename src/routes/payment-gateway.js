const paymentGatewayRoutes = (fastify, options, done) => {
  const AuthMiddleware = require('../middleware/auth');
  const auth = new AuthMiddleware(fastify);

  const PaymentService = require('../services/PaymentService');
  const PaymentUrlService = require('../services/PaymentUrlService');

  // Initialize services
  const paymentService = new PaymentService(fastify.db);
  const urlService = new PaymentUrlService(fastify.db);

  // Get payment plugin manager from fastify decorator
  const paymentPluginManager = fastify.paymentPluginManager;

  // ============ PAYMENT LINKS ENDPOINTS ============

  // POST /api/payment-links - Generate new payment link
  fastify.post('/payment-links', {
    preHandler: auth.verifyToken
  }, async (request, reply) => {
    try {
      const {
        customer_id,
        amount,
        description,
        expiry_hours,
        payment_method,
        metadata = {}
      } = request.body;

      // Validate required fields
      if (!customer_id || !amount) {
        return reply.code(400).send({
          success: false,
          error: 'customer_id and amount are required',
          message: 'Missing required fields'
        });
      }

      // Validate amount
      if (amount <= 0) {
        return reply.code(400).send({
          success: false,
          error: 'Amount must be greater than 0',
          message: 'Invalid amount'
        });
      }

      // Check if customer exists
      const customer = await db.getOne('SELECT id, nama FROM customers WHERE id = $1', [customer_id]);
      if (!customer) {
        return reply.code(404).send({
          success: false,
          error: 'Customer not found',
          message: `Customer with ID ${customer_id} does not exist`
        });
      }

      // Create payment link
      const result = await paymentService.createPaymentLink({
        customerId: customer_id,
        amount,
        description,
        expiryHours,
        paymentMethod: payment_method,
        metadata
      });

      if (result.success) {
        return reply.code(201).send({
          success: true,
          data: {
            payment_link: result.paymentLink,
            duitku_reference: result.duitkuReference,
            payment_url: result.paymentUrl,
            expiry_date: result.expiryDate
          },
          message: 'Payment link generated successfully'
        });
      } else {
        return reply.code(500).send({
          success: false,
          error: result.error,
          message: 'Failed to generate payment link'
        });
      }

    } catch (error) {
      fastify.log.error('Error creating payment link:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
        message: 'Internal server error'
      });
    }
  });

  // GET /api/payment-links - List payment links
  fastify.get('/payment-links', {
    preHandler: auth.verifyToken
  }, async (request, reply) => {
    try {
      const {
        customer_id,
        status,
        page = 1,
        limit = 20
      } = request.query;

      // Validate pagination parameters
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      if (isNaN(pageNum) || pageNum < 1) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid page parameter',
          message: 'Page must be a positive integer'
        });
      }

      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid limit parameter',
          message: 'Limit must be between 1 and 100'
        });
      }

      const options = {
        limit: limitNum,
        offset: (pageNum - 1) * limitNum
      };

      let paymentLinks;
      let total = 0;

      if (customer_id) {
        // Get customer-specific payment links
        paymentLinks = await paymentService.getCustomerPaymentLinks(parseInt(customer_id), {
          ...options,
          status
        });

        // Count total for customer
        if (status) {
          total = (await db.getOne(`
            SELECT COUNT(*) as count FROM payment_links
            WHERE customer_id = $1 AND status = $2
          `, [customer_id, status])).count;
        } else {
          total = (await db.getOne(`
            SELECT COUNT(*) as count FROM payment_links
            WHERE customer_id = $1
          `, [customer_id])).count;
        }
      } else if (status) {
        // Get payment links by status
        paymentLinks = await paymentService.getPaymentLinksByStatus(status, options);

        // Count total by status
        total = (await db.getOne(`
          SELECT COUNT(*) as count FROM payment_links
          WHERE status = $1
        `, [status])).count;
      } else {
        // Get all payment links with pagination
        paymentLinks = db.query(`
          SELECT pl.*, c.nama as customer_name, c.nomor_hp as customer_phone
          FROM payment_links pl
          LEFT JOIN customers c ON pl.customer_id = c.id
          ORDER BY pl.created_date DESC
          LIMIT ? OFFSET ?
        `, [limitNum, options.offset]);

        // Count total
        total = (await db.getOne('SELECT COUNT(*) as count FROM payment_links')).count;
      }

      return reply.code(200).send({
        success: true,
        data: {
          payment_links: paymentLinks,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: total,
            pages: Math.ceil(total / limitNum)
          }
        },
        message: 'Payment links retrieved successfully'
      });

    } catch (error) {
      fastify.log.error('Error listing payment links:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
        message: 'Internal server error'
      });
    }
  });

  // GET /api/payment-links/{linkId} - Get payment link details
  fastify.get('/payment-links/:linkId', {
    preHandler: auth.verifyToken
  }, async (request, reply) => {
    try {
      const { linkId } = request.params;
      const linkIdNum = parseInt(linkId);

      if (isNaN(linkIdNum)) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid payment link ID',
          message: 'Payment link ID must be a number'
        });
      }

      const paymentLink = await paymentService.getPaymentLink(linkIdNum);

      if (!paymentLink) {
        return reply.code(404).send({
          success: false,
          error: 'Payment link not found',
          message: `Payment link with ID ${linkId} does not exist`
        });
      }

      return reply.code(200).send({
        success: true,
        data: paymentLink,
        message: 'Payment link retrieved successfully'
      });

    } catch (error) {
      fastify.log.error('Error getting payment link:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
        message: 'Internal server error'
      });
    }
  });

  // PUT /api/payment-links/{linkId} - Update payment link
  fastify.put('/payment-links/:linkId', {
    preHandler: auth.verifyToken
  }, async (request, reply) => {
    try {
      const { linkId } = request.params;
      const { status } = request.body;

      const linkIdNum = parseInt(linkId);

      if (isNaN(linkIdNum)) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid payment link ID',
          message: 'Payment link ID must be a number'
        });
      }

      if (!status || !['active', 'expired', 'paid', 'cancelled'].includes(status)) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid status',
          message: 'Status must be one of: active, expired, paid, cancelled'
        });
      }

      const PaymentLink = require('../models/PaymentLink');
      const paymentLinkModel = new PaymentLink(fastify.db);

      const updated = await paymentLinkModel.updateStatus(linkIdNum, status);

      if (updated) {
        const paymentLink = await paymentService.getPaymentLink(linkIdNum);
        return reply.code(200).send({
          success: true,
          data: paymentLink,
          message: 'Payment link updated successfully'
        });
      } else {
        return reply.code(404).send({
          success: false,
          error: 'Payment link not found',
          message: `Payment link with ID ${linkId} does not exist`
        });
      }

    } catch (error) {
      fastify.log.error('Error updating payment link:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
        message: 'Internal server error'
      });
    }
  });

  // DELETE /api/payment-links/{linkId} - Cancel payment link
  fastify.delete('/payment-links/:linkId', {
    preHandler: auth.verifyToken
  }, async (request, reply) => {
    try {
      const { linkId } = request.params;
      const linkIdNum = parseInt(linkId);

      if (isNaN(linkIdNum)) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid payment link ID',
          message: 'Payment link ID must be a number'
        });
      }

      const PaymentLink = require('../models/PaymentLink');
      const paymentLinkModel = new PaymentLink(fastify.db);

      const deleted = await paymentLinkModel.delete(linkIdNum);

      if (deleted) {
        return reply.code(200).send({
          success: true,
          message: 'Payment link cancelled successfully'
        });
      } else {
        return reply.code(404).send({
          success: false,
          error: 'Payment link not found',
          message: `Payment link with ID ${linkId} does not exist`
        });
      }

    } catch (error) {
      fastify.log.error('Error cancelling payment link:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
        message: 'Internal server error'
      });
    }
  });

  // POST /api/payment-links/{linkId}/regenerate - Regenerate expired URL
  fastify.post('/payment-links/:linkId/regenerate', {
    preHandler: auth.verifyToken
  }, async (request, reply) => {
    try {
      const { linkId } = request.params;
      const linkIdNum = parseInt(linkId);

      if (isNaN(linkIdNum)) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid payment link ID',
          message: 'Payment link ID must be a number'
        });
      }

      const result = await urlService.regeneratePaymentLink(linkIdNum);

      if (result.success) {
        return reply.code(200).send({
          success: true,
          data: {
            payment_link: result.paymentLink,
            original_link: result.originalLink,
            duitku_reference: result.duitkuReference,
            payment_url: result.paymentUrl,
            expiry_date: result.expiryDate
          },
          message: 'Payment link regenerated successfully'
        });
      } else {
        return reply.code(400).send({
          success: false,
          error: result.error,
          message: 'Failed to regenerate payment link'
        });
      }

    } catch (error) {
      fastify.log.error('Error regenerating payment link:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
        message: 'Internal server error'
      });
    }
  });

  // GET /api/payment-links/{linkId}/validate - Validate payment URL
  fastify.get('/payment-links/:linkId/validate', {
    preHandler: auth.verifyToken
  }, async (request, reply) => {
    try {
      const { linkId } = request.params;
      const linkIdNum = parseInt(linkId);

      if (isNaN(linkIdNum)) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid payment link ID',
          message: 'Payment link ID must be a number'
        });
      }

      const validation = await urlService.validatePaymentUrl(linkIdNum);

      return reply.code(200).send({
        success: true,
        data: validation,
        message: validation.valid ? 'Payment URL is valid' : 'Payment URL is invalid'
      });

    } catch (error) {
      fastify.log.error('Error validating payment URL:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
        message: 'Internal server error'
      });
    }
  });

  // ============ PAYMENT PLUGIN SYSTEM ENDPOINTS ============

  // GET /api/payment-plugins/methods - Get available payment methods from all plugins
  fastify.get('/payment-plugins/methods', {
    preHandler: auth.verifyToken
  }, async (request, reply) => {
    try {
      const paymentMethods = await paymentPluginManager.getAvailablePaymentMethods();

      return reply.code(200).send({
        success: true,
        data: {
          payment_methods: paymentMethods,
          plugins: paymentPluginManager.getMetrics()
        },
        message: 'Payment methods retrieved successfully'
      });

    } catch (error) {
      fastify.log.error('Error getting payment methods:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
        message: 'Internal server error'
      });
    }
  });

  // POST /api/payment-plugins/create - Create payment using plugin system
  fastify.post('/payment-plugins/create', {
    preHandler: auth.verifyToken
  }, async (request, reply) => {
    try {
      const {
        plugin_name,
        customer_id,
        amount,
        currency = 'IDR',
        customer_name,
        customer_email,
        customer_phone,
        description,
        payment_method,
        callback_url,
        return_url,
        metadata = {}
      } = request.body;

      // Validate required fields
      if (!plugin_name || !customer_id || !amount) {
        return reply.code(400).send({
          success: false,
          error: 'plugin_name, customer_id, and amount are required',
          message: 'Missing required fields'
        });
      }

      // Validate amount
      if (amount <= 0) {
        return reply.code(400).send({
          success: false,
          error: 'Amount must be greater than 0',
          message: 'Invalid amount'
        });
      }

      // Check if customer exists
      const customer = await db.getOne('SELECT id, nama FROM customers WHERE id = $1', [customer_id]);
      if (!customer) {
        return reply.code(404).send({
          success: false,
          error: 'Customer not found',
          message: `Customer with ID ${customer_id} does not exist`
        });
      }

      // Prepare payment data for plugin
      const paymentData = {
        amount,
        currency,
        customer_id: parseInt(customer_id),
        customer_name: customer_name || customer.nama,
        customer_email,
        customer_phone,
        description: description || `Payment for ${customer.nama}`,
        payment_method,
        callback_url,
        return_url,
        metadata
      };

      // Create payment using plugin
      const result = await paymentPluginManager.createPayment(plugin_name, paymentData);

      if (result.success) {
        // Store payment record in database
        const paymentRecord = {
          transaction_id: result.reference,
          plugin_name,
          method_code: payment_method,
          customer_id: parseInt(customer_id),
          amount: parseFloat(amount),
          currency,
          fee_amount: result.fee || 0,
          total_amount: result.total_amount || amount,
          status: 'PENDING',
          description,
          reference: result.reference,
          redirect_url: result.redirect_url,
          qr_code: result.qr_code,
          callback_url,
          return_url,
          expires_at: result.expires_at,
          payment_metadata: JSON.stringify(result.metadata)
        };

        await db.query(`
          INSERT INTO payment_transactions (
            transaction_id, plugin_name, method_code, customer_id, amount, currency,
            fee_amount, total_amount, status, description, reference, redirect_url,
            qr_code, callback_url, return_url, expires_at, payment_metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        `, [
          paymentRecord.transaction_id,
          paymentRecord.plugin_name,
          paymentRecord.method_code,
          paymentRecord.customer_id,
          paymentRecord.amount,
          paymentRecord.currency,
          paymentRecord.fee_amount,
          paymentRecord.total_amount,
          paymentRecord.status,
          paymentRecord.description,
          paymentRecord.reference,
          paymentRecord.redirect_url,
          paymentRecord.qr_code,
          paymentRecord.callback_url,
          paymentRecord.return_url,
          paymentRecord.expires_at,
          paymentRecord.payment_metadata
        ]);

        return reply.code(201).send({
          success: true,
          data: {
            transaction_id: result.reference,
            plugin_name,
            amount,
            currency,
            fee: result.fee || 0,
            total_amount: result.total_amount || amount,
            status: result.status,
            redirect_url: result.redirect_url,
            qr_code: result.qr_code,
            expires_at: result.expires_at,
            instructions: result.instructions,
            payment_details: result.payment_details
          },
          message: 'Payment created successfully'
        });
      } else {
        return reply.code(500).send({
          success: false,
          error: result.error || 'Failed to create payment',
          message: 'Payment creation failed'
        });
      }

    } catch (error) {
      fastify.log.error('Error creating payment:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
        message: 'Internal server error'
      });
    }
  });

  // POST /api/payment-plugins/check-status - Check payment status using plugin
  fastify.post('/payment-plugins/check-status', {
    preHandler: auth.verifyToken
  }, async (request, reply) => {
    try {
      const {
        plugin_name,
        transaction_id
      } = request.body;

      // Validate required fields
      if (!plugin_name || !transaction_id) {
        return reply.code(400).send({
          success: false,
          error: 'plugin_name and transaction_id are required',
          message: 'Missing required fields'
        });
      }

      // Check payment status using plugin
      const result = await paymentPluginManager.checkPaymentStatus(plugin_name, transaction_id);

      if (result.success) {
        // Update payment record in database
        await db.query(`
          UPDATE payment_transactions
          SET status = $1, paid_at = $2, payment_metadata = $3
          WHERE transaction_id = $4 AND plugin_name = $5
        `, [
          result.status,
          result.paid_at,
          JSON.stringify(result.metadata),
          transaction_id,
          plugin_name
        ]);

        return reply.code(200).send({
          success: true,
          data: {
            transaction_id,
            plugin_name,
            status: result.status,
            amount: result.amount,
            paid_amount: result.paid_amount,
            paid_at: result.paid_at,
            payment_method: result.payment_method,
            metadata: result.metadata
          },
          message: 'Payment status retrieved successfully'
        });
      } else {
        return reply.code(500).send({
          success: false,
          error: result.error || 'Failed to check payment status',
          message: 'Payment status check failed'
        });
      }

    } catch (error) {
      fastify.log.error('Error checking payment status:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
        message: 'Internal server error'
      });
    }
  });

  // POST /api/payment-plugins/callback - Handle payment callback from gateway
  fastify.post('/payment-plugins/callback/:pluginName', {
    preHandler: auth.verifyTokenAPI
  }, async (request, reply) => {
    try {
      const { pluginName } = request.params;
      const callbackData = request.body;

      // Handle callback using plugin
      const result = await paymentPluginManager.handleCallback(pluginName, callbackData);

      if (result.success) {
        // Update payment record in database
        await db.query(`
          UPDATE payment_transactions
          SET status = $1, paid_at = $2, payment_metadata = $3
          WHERE transaction_id = $4 AND plugin_name = $5
        `, [
          result.status,
          result.paid_at,
          JSON.stringify(result.metadata),
          result.reference,
          pluginName
        ]);

        return reply.code(200).send({
          success: true,
          message: 'Callback processed successfully'
        });
      } else {
        return reply.code(500).send({
          success: false,
          error: result.error || 'Failed to process callback',
          message: 'Callback processing failed'
        });
      }

    } catch (error) {
      fastify.log.error('Error processing payment callback:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
        message: 'Internal server error'
      });
    }
  });

  // GET /api/payment-plugins/plugins - Get plugin status and metrics
  fastify.get('/payment-plugins/plugins', {
    preHandler: auth.verifyToken
  }, async (request, reply) => {
    try {
      const metrics = paymentPluginManager.getMetrics();
      const activePlugins = paymentPluginManager.getActivePlugins();

      return reply.code(200).send({
        success: true,
        data: {
          metrics,
          active_plugins: activePlugins.map(p => ({
            name: p.name,
            version: p.plugin.version,
            enabled: p.plugin.enabled,
            initialized: p.plugin.isInitialized,
            features: p.plugin.getFeatures(),
            supported_currencies: p.plugin.getSupportedCurrencies()
          }))
        },
        message: 'Plugin status retrieved successfully'
      });

    } catch (error) {
      fastify.log.error('Error getting plugin status:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
        message: 'Internal server error'
      });
    }
  });

  // ============ LEGACY DUITKU ENDPOINTS (FOR BACKWARD COMPATIBILITY) ============

  // GET /api/duitku/status - Get DuitKu configuration status
  fastify.get('/duitku/status', {
    preHandler: auth.verifyToken
  }, async (request, reply) => {
    try {
      const duitkuPlugin = paymentPluginManager.getPlugin('DuitKu');
      const status = {
        configured: !!duitkuPlugin,
        enabled: duitkuPlugin?.enabled || false,
        initialized: duitkuPlugin?.isInitialized || false,
        version: duitkuPlugin?.version || '1.0.0'
      };

      return reply.code(200).send({
        success: true,
        data: status,
        message: 'DuitKu status retrieved successfully'
      });

    } catch (error) {
      fastify.log.error('Error getting DuitKu status:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
        message: 'Internal server error'
      });
    }
  });

  // POST /api/duitku/test - Test DuitKu connectivity
  fastify.post('/duitku/test', {
    preHandler: auth.verifyToken
  }, async (request, reply) => {
    try {
      const duitkuPlugin = paymentPluginManager.getPlugin('DuitKu');

      if (!duitkuPlugin || !duitkuPlugin.enabled || !duitkuPlugin.isInitialized) {
        return reply.code(400).send({
          success: false,
          error: 'DuitKu plugin is not available',
          message: 'DuitKu plugin is not configured or enabled'
        });
      }

      return reply.code(200).send({
        success: true,
        data: {
          configured: true,
          enabled: duitkuPlugin.enabled,
          initialized: duitkuPlugin.isInitialized,
          version: duitkuPlugin.version
        },
        message: 'DuitKu connectivity test successful'
      });

    } catch (error) {
      fastify.log.error('Error testing DuitKu connectivity:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
        message: 'Internal server error'
      });
    }
  });

  // GET /api/duitku/payment-methods - Get available DuitKu payment methods
  fastify.get('/duitku/payment-methods', {
    preHandler: auth.verifyToken
  }, async (request, reply) => {
    try {
      const paymentMethods = await paymentPluginManager.getAvailablePaymentMethods();
      const duitkuMethods = paymentMethods.filter(method => method.plugin_name === 'DuitKu');

      return reply.code(200).send({
        success: true,
        data: {
          payment_methods: duitkuMethods
        },
        message: 'DuitKu payment methods retrieved successfully'
      });

    } catch (error) {
      fastify.log.error('Error getting DuitKu payment methods:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
        message: 'Internal server error'
      });
    }
  });

  // ============ STATISTICS ENDPOINTS ============

  // GET /api/payment-links/stats - Get payment link statistics
  fastify.get('/payment-links/stats', {
    preHandler: auth.verifyToken
  }, async (request, reply) => {
    try {
      const { start_date, end_date } = request.query;

      const filters = {};
      if (start_date) {
        filters.startDate = new Date(start_date);
      }
      if (end_date) {
        filters.endDate = new Date(end_date);
      }

      const stats = await paymentService.getStatistics(filters);
      const healthMetrics = await urlService.getHealthMetrics();

      return reply.code(200).send({
        success: true,
        data: {
          statistics: stats,
          health: healthMetrics
        },
        message: 'Payment link statistics retrieved successfully'
      });

    } catch (error) {
      fastify.log.error('Error getting payment statistics:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
        message: 'Internal server error'
      });
    }
  });

  // GET /api/payment-links/expiring - Get payment links expiring soon
  fastify.get('/payment-links/expiring', {
    preHandler: auth.verifyToken
  }, async (request, reply) => {
    try {
      const { hours = 24 } = request.query;
      const hoursNum = parseInt(hours);

      if (isNaN(hoursNum) || hoursNum < 1 || hoursNum > 168) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid hours parameter',
          message: 'Hours must be between 1 and 168'
        });
      }

      const expiringLinks = await paymentService.getExpiringPaymentLinks(hoursNum);

      return reply.code(200).send({
        success: true,
        data: {
          payment_links: expiringLinks,
          count: expiringLinks.length,
          hours: hoursNum
        },
        message: 'Expiring payment links retrieved successfully'
      });

    } catch (error) {
      fastify.log.error('Error getting expiring payment links:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
        message: 'Internal server error'
      });
    }
  });

  done();
};

module.exports = paymentGatewayRoutes;