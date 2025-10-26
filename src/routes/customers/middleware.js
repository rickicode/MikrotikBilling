/**
 * Customer-specific Middleware
 * Custom middleware for customer route module
 * @version 1.0.0
 */

const RouteMiddleware = require('../../middleware/route-middleware');

class CustomerMiddleware {
  constructor() {
    this.registered = false;
  }

  /**
   * Register customer-specific middleware with Fastify
   */
  register(fastify) {
    if (this.registered) {
      return;
    }

    // Decorate Fastify instance with customer middleware
    fastify.decorate('customerMiddleware', this);
    this.registered = true;

    fastify.log.info('Customer middleware registered');
  }

  /**
   * Customer ownership validation
   */
  async validateCustomerOwnership(request, reply) {
    const { id } = request.params;
    const user = request.user;

    // Super admin can access any customer
    if (user.role === 'super_admin') {
      return;
    }

    // Check if user has access to this customer
    const result = await fastify.db.query(
      'SELECT id FROM customers WHERE id = $1 AND created_by = $2',
      [id, user.id]
    );

    if (result.rows.length === 0) {
      return reply.code(403).send({
        success: false,
        error: 'Access denied: You can only access customers you created',
        code: 'FORBIDDEN'
      });
    }
  }

  /**
   * Customer existence validation
   */
  async validateCustomerExists(request, reply) {
    const { id } = request.params;

    const result = await fastify.db.query(
      'SELECT id, is_active FROM customers WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({
        success: false,
        error: 'Customer not found',
        code: 'NOT_FOUND'
      });
    }

    // Store customer info for later use
    request.customer = result.rows[0];
  }

  /**
   * Active customer validation
   */
  async validateActiveCustomer(request, reply) {
    await this.validateCustomerExists(request, reply);

    if (!request.customer.is_active) {
      return reply.code(400).send({
        success: false,
        error: 'Customer is not active',
        code: 'INACTIVE_CUSTOMER'
      });
    }
  }

  /**
   * Customer rate limiting (per customer)
   */
  customerRateLimit(options = {}) {
    const { maxRequests = 50, windowMs = 60000 } = options; // 50 requests per minute

    return async (request, reply) => {
      const { id } = request.params;
      const key = `customer:${id}:${Math.floor(Date.now() / windowMs)}`;

      if (!fastify.rateLimitStore) {
        fastify.rateLimitStore = new Map();
      }

      const current = fastify.rateLimitStore.get(key) || 0;

      if (current >= maxRequests) {
        return reply.code(429).send({
          success: false,
          error: 'Too many requests for this customer',
          retryAfter: Math.ceil(windowMs / 1000)
        });
      }

      fastify.rateLimitStore.set(key, current + 1);
    };
  }

  /**
   * Customer business logic validation
   */
  async validateCustomerBusinessRules(request, reply) {
    const { id } = request.params;
    const method = request.method;

    if (method === 'DELETE') {
      // Check for active subscriptions
      const activeSubs = await fastify.db.query(
        'SELECT COUNT(*) as count FROM subscriptions WHERE customer_id = $1 AND status = $2',
        [id, 'active']
      );

      if (parseInt(activeSubs.rows[0].count) > 0) {
        return reply.code(400).send({
          success: false,
          error: 'Cannot delete customer with active subscriptions',
          code: 'ACTIVE_SUBSCRIPTIONS'
        });
      }

      // Check for outstanding balance
      const balance = await fastify.db.query(
        'SELECT balance, debt FROM customers WHERE id = $1',
        [id]
      );

      const customerBalance = parseFloat(balance.rows[0].balance) || 0;
      const customerDebt = parseFloat(balance.rows[0].debt) || 0;

      if (customerDebt > 0) {
        return reply.code(400).send({
          success: false,
          error: 'Cannot delete customer with outstanding debt',
          code: 'OUTSTANDING_DEBT'
        });
      }
    }

    if (method === 'PUT' && request.body.is_active === false) {
      // Similar checks for deactivating customer
      const activeSubs = await fastify.db.query(
        'SELECT COUNT(*) as count FROM subscriptions WHERE customer_id = $1 AND status = $2',
        [id, 'active']
      );

      if (parseInt(activeSubs.rows[0].count) > 0) {
        return reply.code(400).send({
          success: false,
          error: 'Cannot deactivate customer with active subscriptions',
          code: 'ACTIVE_SUBSCRIPTIONS'
        });
      }
    }
  }

  /**
   * Customer data sanitization
   */
  sanitizeCustomerData(request, reply, done) {
    if (request.body) {
      // Remove sensitive fields that shouldn't be updated directly
      const sensitiveFields = ['created_at', 'updated_at', 'id'];
      sensitiveFields.forEach(field => {
        delete request.body[field];
      });

      // Sanitize email
      if (request.body.email) {
        request.body.email = request.body.email.toLowerCase().trim();
      }

      // Sanitize phone
      if (request.body.phone) {
        request.body.phone = request.body.phone.replace(/\D/g, ''); // Keep only digits
      }

      // Sanitize name
      if (request.body.name) {
        request.body.name = request.body.name.trim();
        // Capitalize first letter of each word
        request.body.name = request.body.name.replace(/\b\w/g, l => l.toUpperCase());
      }
    }

    done();
  }

  /**
   * Customer audit logging
   */
  auditCustomerAction(action) {
    return async (request, reply) => {
      const { id } = request.params;
      const user = request.user;

      const auditData = {
        action: `customer.${action}`,
        resource_id: id,
        user_id: user.id,
        user_role: user.role,
        ip: request.ip,
        user_agent: request.headers['user-agent'],
        timestamp: new Date().toISOString(),
        changes: request.body,
        url: request.url,
        method: request.method
      };

      // Store audit log
      try {
        await fastify.db.query(`
          INSERT INTO audit_logs (action, resource_type, resource_id, user_id, details, created_at)
          VALUES ($1, $2, $3, $4, $5, NOW())
        `, [
          auditData.action,
          'customer',
          auditData.resource_id,
          auditData.user_id,
          JSON.stringify(auditData)
        ]);
      } catch (error) {
        fastify.log.error('Failed to create audit log', { error: error.message });
      }

      // Publish audit event
      if (fastify.eventBus) {
        try {
          await fastify.eventBus.publish('audit.action', auditData);
        } catch (error) {
          fastify.log.warn('Failed to publish audit event', { error: error.message });
        }
      }
    };
  }

  /**
   * Customer statistics middleware
   */
  async addCustomerStats(request, reply, done) {
    if (request.params.id) {
      try {
        const stats = await fastify.db.query(`
          SELECT 
            COUNT(DISTINCT s.id) as subscription_count,
            COUNT(DISTINCT p.id) as payment_count,
            COALESCE(SUM(p.amount), 0) as total_payments,
            MAX(s.created_at) as last_subscription_date,
            MAX(p.created_at) as last_payment_date
          FROM customers c
          LEFT JOIN subscriptions s ON c.id = s.customer_id
          LEFT JOIN payments p ON c.id = p.customer_id AND p.status = 'paid'
          WHERE c.id = $1
        `, [request.params.id]);

        request.customerStats = stats.rows[0];
      } catch (error) {
        fastify.log.warn('Failed to fetch customer stats', { error: error.message });
        request.customerStats = {};
      }
    }

    done();
  }

  /**
   * Customer search optimization
   */
  optimizeCustomerSearch(request, reply, done) {
    const { search } = request.query;

    if (search) {
      // Optimize search queries by adding indexes suggestions
      request.searchIndexes = [
        'idx_customers_name',
        'idx_customers_email', 
        'idx_customers_phone'
      ];

      // Log search for analytics
      fastify.log.debug('Customer search performed', {
        search,
        user_id: request.user?.id,
        ip: request.ip
      });
    }

    done();
  }

  /**
   * Customer response caching
   */
  customerCache(ttl = 300) {
    return async (request, reply) => {
      if (request.method !== 'GET') {
        return; // Only cache GET requests
      }

      const cacheKey = `customer:${request.params.id || 'list'}:${JSON.stringify(request.query)}`;

      try {
        // Try to get from cache
        const cached = await fastify.cache?.get(cacheKey);
        if (cached) {
          reply.header('X-Cache', 'HIT');
          return reply.send(cached);
        }

        // Hook to cache response
        reply.addHook('onSend', async (request, reply, payload) => {
          await fastify.cache?.set(cacheKey, payload, ttl);
          reply.header('X-Cache', 'MISS');
          return payload;
        });
      } catch (error) {
        fastify.log.warn('Customer cache error', { error: error.message });
      }
    };
  }

  /**
   * Middleware pipelines for common customer operations
   */
  getPipelines() {
    return {
      // View customer
      view: [
        this.validateCustomerExists,
        this.customerCache(600), // 10 minutes cache
        this.addCustomerStats
      ],

      // Edit customer
      edit: [
        this.validateCustomerExists,
        this.validateCustomerBusinessRules,
        this.sanitizeCustomerData,
        this.auditCustomerAction('updated')
      ],

      // Delete customer
      delete: [
        this.validateCustomerExists,
        this.validateCustomerBusinessRules,
        this.auditCustomerAction('deleted')
      ],

      // Create subscription for customer
      createSubscription: [
        this.validateActiveCustomer,
        this.customerRateLimit({ maxRequests: 10, windowMs: 60000 })
      ]
    };
  }
}

module.exports = new CustomerMiddleware();