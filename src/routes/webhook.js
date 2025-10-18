const webhookRoutes = (fastify, options, done) => {
  const PaymentService = require('../services/PaymentService');
  const PaymentTransaction = require('../models/PaymentTransaction');
  const { ApiErrorHandler } = require('../middleware/apiErrorHandler');

  // Initialize services
  const paymentService = new PaymentService(fastify.db);
  const transactionModel = new PaymentTransaction(fastify.db);

  // POST /api/webhook/duitku - DuitKu webhook handler
  fastify.post('/webhook/duitku', {
    config: {
      // Disable authentication for webhook endpoints (they will be authenticated via signature)
      skipAuth: true
    }
  }, ApiErrorHandler.asyncHandler(async (request, reply) => {
    const startTime = Date.now();
    let webhookTransaction = null;

    const callbackData = request.body;

    // Log incoming webhook
    fastify.log.info('DuitKu webhook received:', {
      headers: request.headers,
      body: callbackData,
      timestamp: new Date().toISOString()
    });

    // Basic validation of required fields
    const requiredFields = ['merchantCode', 'invoiceNumber', 'amount', 'signature', 'paymentStatus'];
    const missingFields = requiredFields.filter(field => !callbackData[field]);

    if (missingFields.length > 0) {
      fastify.log.warn('DuitKu webhook missing required fields:', missingFields);
      return reply.code(400).send({
        status: 'ERROR',
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Create webhook transaction record
    webhookTransaction = await transactionModel.logCallback(null, {
      type: 'duitku_webhook',
      callbackData,
      receivedAt: new Date().toISOString(),
      userAgent: request.headers['user-agent'],
      ip: request.ip
    });

    // Process the callback
    const result = await paymentService.processCallback(callbackData);

    // Update webhook transaction with result
    if (webhookTransaction) {
      await transactionModel.updateStatus(webhookTransaction.id, 'success');
      await transactionModel.updateStatus(webhookTransaction.id, 'success');
    }

    const processingTime = Date.now() - startTime;

    // Log successful processing
    fastify.log.info('DuitKu webhook processed successfully:', {
      invoiceNumber: callbackData.invoiceNumber,
      paymentStatus: callbackData.paymentStatus,
      processingTime: `${processingTime}ms`,
      result: result
    });

    // Return success response to DuitKu
    return reply.code(200).send({
      status: 'SUCCESS',
      message: 'Callback processed successfully',
      processingTime: `${processingTime}ms`
    });
  }));

  // GET /api/webhook/duitku/test - Test webhook endpoint
  fastify.get('/webhook/duitku/test', {
    preHandler: require('../middleware/auth').verifyToken
  }, ApiErrorHandler.asyncHandler(async (request, reply) => {
    const testPayload = {
      merchantCode: 'TEST',
      invoiceNumber: `TEST-${Date.now()}`,
      amount: '10000',
      signature: 'test-signature',
      paymentStatus: 'SUCCESS',
      paymentMethod: 'VA',
      reference: 'TEST-REF-123',
      vaNumber: '1234567890',
      createdAt: new Date().toISOString()
    };

    // Log test webhook
    fastify.log.info('Test DuitKu webhook triggered:', {
      testPayload,
      timestamp: new Date().toISOString()
    });

    return reply.code(200).send({
      success: true,
      data: {
        testPayload,
        webhookUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/api/webhook/duitku`,
        timestamp: new Date().toISOString()
      },
      message: 'Test webhook payload generated. Use POST to test actual processing.'
    });
  }));

  // POST /api/webhook/duitku/test - Test webhook processing
  fastify.post('/webhook/duitku/test', {
    preHandler: require('../middleware/auth').verifyToken
  }, ApiErrorHandler.asyncHandler(async (request, reply) => {
    const { testPayload } = request.body;

    if (!testPayload) {
      return ApiErrorHandler.validationError(reply, 'testPayload is required - Please provide testPayload in request body');
    }

    // Process test webhook
    const result = await paymentService.processCallback(testPayload);

    return reply.code(200).send({
      success: true,
      data: {
        testPayload,
        result,
        timestamp: new Date().toISOString()
      },
      message: 'Test webhook processed successfully'
    });
  }));

  // GET /api/webhook/duitku/logs - Get webhook processing logs
  fastify.get('/webhook/duitku/logs', {
    preHandler: require('../middleware/auth').verifyToken
  }, async (request, reply) => {
    try {
      const {
        page = 1,
        limit = 50,
        status,
        start_date,
        end_date
      } = request.query;

      // Validate pagination
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      if (isNaN(pageNum) || pageNum < 1 || isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid pagination parameters',
          message: 'Page must be >=1 and limit must be between 1-100'
        });
      }

      let whereClause = 'WHERE pt.transaction_type = "callback"';
      const params = [];

      if (status) {
        whereClause += ' AND pt.status = ?';
        params.push(status);
      }

      if (start_date) {
        whereClause += ' AND pt.created_date >= ?';
        params.push(start_date);
      }

      if (end_date) {
        whereClause += ' AND pt.created_date <= ?';
        params.push(end_date);
      }

      // Get webhook logs
      const logs = db.query(`
        SELECT pt.*, pl.invoice_number, c.nama as customer_name
        FROM payment_transactions pt
        LEFT JOIN payment_links pl ON pt.payment_link_id = pl.id
        LEFT JOIN customers c ON pl.customer_id = c.id
        ${whereClause}
        ORDER BY pt.created_date DESC
        LIMIT ? OFFSET ?
      `, [...params, limitNum, (pageNum - 1) * limitNum]);

      // Get total count
      const totalQuery = `
        SELECT COUNT(*) as count
        FROM payment_transactions pt
        ${whereClause}
      `;
      const totalResult = await db.getOne(totalQuery, params);
      const total = totalResult.count;

      // Parse transaction data for each log
      const parsedLogs = logs.map(log => {
        if (log.transaction_data) {
          try {
            log.transaction_data = JSON.parse(log.transaction_data);
          } catch (e) {
            // Keep as string if invalid JSON
          }
        }
        return log;
      });

      return reply.code(200).send({
        success: true,
        data: {
          logs: parsedLogs,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: total,
            pages: Math.ceil(total / limitNum)
          }
        },
        message: 'Webhook logs retrieved successfully'
      });

    } catch (error) {
      fastify.log.error('Error getting webhook logs:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
        message: 'Failed to retrieve webhook logs'
      });
    }
  });

  // POST /api/webhook/duitku/retry - Retry failed webhook processing
  fastify.post('/webhook/duitku/retry', {
    preHandler: require('../middleware/auth').verifyToken
  }, async (request, reply) => {
    try {
      const { transactionId } = request.body;

      if (!transactionId) {
        return reply.code(400).send({
          success: false,
          error: 'transactionId is required',
          message: 'Please provide transactionId to retry'
        });
      }

      // Get the failed transaction
      const transaction = await db.getOne(`
        SELECT * FROM payment_transactions
        WHERE id = $1 AND transaction_type = 'callback' AND status = 'failed'
      `, [transactionId]);

      if (!transaction) {
        return reply.code(404).send({
          success: false,
          error: 'Failed webhook transaction not found',
          message: 'No failed callback transaction found with this ID'
        });
      }

      // Parse original callback data
      let callbackData;
      try {
        callbackData = JSON.parse(transaction.transaction_data);
      } catch (e) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid callback data',
          message: 'Cannot parse original callback data'
        });
      }

      // Mark for retry
      await transactionModel.markForRetry(transactionId, 'Manual retry requested');

      // Process the callback again
      const result = await paymentService.processCallback(callbackData);

      // Update transaction with new result
      if (result.success) {
        await transactionModel.updateStatus(transactionId, 'success');
      } else {
        await transactionModel.markFailed(transactionId, result.error || 'Processing failed');
      }

      return reply.code(200).send({
        success: true,
        data: {
          transactionId,
          originalStatus: 'failed',
          newResult: result,
          retriedAt: new Date().toISOString()
        },
        message: result.success ? 'Webhook retry successful' : 'Webhook retry failed'
      });

    } catch (error) {
      fastify.log.error('Error retrying webhook:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
        message: 'Failed to retry webhook processing'
      });
    }
  });

  // GET /api/webhook/duitku/health - Webhook health check
  fastify.get('/webhook/duitku/health', {
    preHandler: require('../middleware/auth').verifyToken
  }, async (request, reply) => {
    try {
      // Get recent webhook statistics
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const stats = await db.getOne(`
        SELECT
          COUNT(*) as total_webhooks,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'retry' THEN 1 ELSE 0 END) as retrying
        FROM payment_transactions
        WHERE transaction_type = 'callback' AND created_date >= $1
      `, [last24Hours]);

      // Get DuitKu service status
      const duitkuStatus = await paymentService.getDuitKuStatus();

      // Get recent failed webhooks
      const recentFailures = db.query(`
        SELECT id, invoice_number, error_message, created_date
        FROM payment_transactions pt
        LEFT JOIN payment_links pl ON pt.payment_link_id = pl.id
        WHERE pt.transaction_type = 'callback'
          AND pt.status = 'failed'
          AND pt.created_date >= ?
        ORDER BY pt.created_date DESC
        LIMIT 5
      `, [last24Hours]);

      const healthData = {
        webhook_stats: stats || { total_webhooks: 0, successful: 0, failed: 0, retrying: 0 },
        duitku_configured: duitkuStatus.configured,
        duitku_environment: duitkuStatus.environment,
        recent_failures: recentFailures || [],
        uptime_percentage: stats && stats.total_webhooks > 0
          ? ((stats.successful / stats.total_webhooks) * 100).toFixed(2)
          : 100,
        last_check: new Date().toISOString()
      };

      // Determine health status
      let healthStatus = 'healthy';
      if (!duitkuStatus.configured) {
        healthStatus = 'unhealthy';
      } else if (stats && stats.failed > 0) {
        const failureRate = (stats.failed / stats.total_webhooks) * 100;
        if (failureRate > 10) {
          healthStatus = 'unhealthy';
        } else if (failureRate > 5) {
          healthStatus = 'degraded';
        }
      }

      return reply.code(200).send({
        success: true,
        data: {
          status: healthStatus,
          ...healthData
        },
        message: `Webhook health status: ${healthStatus}`
      });

    } catch (error) {
      fastify.log.error('Error checking webhook health:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
        message: 'Failed to check webhook health'
      });
    }
  });

  done();
};

module.exports = webhookRoutes;