/**
 * Customer Route Definitions
 * Individual customer route handlers
 * @version 1.0.0
 */

const RouteMiddleware = require('../../middleware/route-middleware');

class CustomerRoutes {
  constructor() {
    this.routeInfo = [
      {
        method: 'GET',
        path: '/',
        summary: 'List customers',
        description: 'Get paginated list of customers with search and filtering',
        tags: ['customers'],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive'] } }
        ]
      },
      {
        method: 'POST',
        path: '/',
        summary: 'Create customer',
        description: 'Create a new customer',
        tags: ['customers']
      },
      {
        method: 'GET',
        path: '/:id',
        summary: 'Get customer',
        description: 'Get customer by ID',
        tags: ['customers']
      },
      {
        method: 'PUT',
        path: '/:id',
        summary: 'Update customer',
        description: 'Update customer information',
        tags: ['customers']
      },
      {
        method: 'DELETE',
        path: '/:id',
        summary: 'Delete customer',
        description: 'Delete customer (soft delete)',
        tags: ['customers']
      },
      {
        method: 'GET',
        path: '/:id/subscriptions',
        summary: 'Get customer subscriptions',
        description: 'Get all subscriptions for a customer',
        tags: ['customers', 'subscriptions']
      },
      {
        method: 'POST',
        path: '/:id/payments',
        summary: 'Create customer payment',
        description: 'Create a payment for a customer',
        tags: ['customers', 'payments']
      },
      {
        method: 'GET',
        path: '/:id/balance',
        summary: 'Get customer balance',
        description: 'Get customer balance and transaction history',
        tags: ['customers']
      },
      {
        method: 'POST',
        path: '/:id/balance/adjust',
        summary: 'Adjust customer balance',
        description: 'Adjust customer balance (admin only)',
        tags: ['customers']
      }
    ];
  }

  /**
   * Register all customer routes
   */
  register(fastify, options = {}) {
    const middleware = new RouteMiddleware(fastify);
    const { getCommon } = middleware;
    const helpers = fastify.routeHelpers || fastify;

    // GET /customers - List customers
    fastify.get('/', {
      preHandler: [getCommon.authenticated, middleware.rateLimit({ max: 100 })],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            search: { type: 'string', maxLength: 100 },
            status: { type: 'string', enum: ['active', 'inactive'] },
            sort: { type: 'string', enum: ['name', 'created_at', 'updated_at'], default: 'created_at' },
            order: { type: 'string', enum: ['ASC', 'DESC'], default: 'DESC' }
          }
        }
      }
    }, fastify.asyncHandler(async (request, reply) => {
      const { page, limit, offset } = helpers.getPaginationParams(request.query);
      const { search, searchClause, searchParams, filters } = helpers.getSearchParams(
        request.query, 
        ['c.name', 'c.email', 'c.phone', 'c.address']
      );
      const { sort, order } = helpers.getSortParams(
        request.query, 
        ['name', 'created_at', 'updated_at'], 
        'created_at'
      );

      const result = await helpers.query(`
        SELECT c.*,
               COUNT(DISTINCT s.id) as subscription_count,
               COALESCE(SUM(p.amount), 0) as total_payments,
               c.balance,
               c.debt
        FROM customers c
        LEFT JOIN subscriptions s ON c.id = s.customer_id
        LEFT JOIN payments p ON c.id = p.customer_id AND p.status = 'paid'
        WHERE 1=1
        ${searchClause}
        ${filters.status === 'active' ? 'AND c.is_active = true' : ''}
        ${filters.status === 'inactive' ? 'AND c.is_active = false' : ''}
        GROUP BY c.id
        ORDER BY c.${sort} ${order}
        LIMIT $${searchParams.length + 1} OFFSET $${searchParams.length + 2}
      `, [...searchParams, limit, offset]);

      const totalResult = await helpers.query(`
        SELECT COUNT(*) as count 
        FROM customers c 
        WHERE 1=1
        ${searchClause}
        ${filters.status === 'active' ? 'AND c.is_active = true' : ''}
        ${filters.status === 'inactive' ? 'AND c.is_active = false' : ''}
      `, searchParams);

      const total = parseInt(totalResult.rows[0].count);

      // Publish event for analytics
      await helpers.publishEvent('customers.listed', {
        count: result.rows.length,
        total,
        filters: { search, status: filters.status }
      });

      return reply.paginated(result.rows, total, page, limit, 'Customers retrieved successfully');
    }));

    // POST /customers - Create customer
    fastify.post('/', {
      preHandler: [getCommon.authenticated, middleware.requireRole(['admin', 'operator'])],
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            email: { type: 'string', format: 'email', maxLength: 255 },
            phone: { type: 'string', maxLength: 20 },
            address: { type: 'string', maxLength: 500 },
            notes: { type: 'string', maxLength: 1000 },
            is_active: { type: 'boolean', default: true }
          }
        }
      }
    }, fastify.asyncHandler(async (request, reply) => {
      const { name, email, phone, address, notes, is_active = true } = request.body;

      // Check for duplicate email or phone
      if (email) {
        const existingEmail = await helpers.query(
          'SELECT id FROM customers WHERE email = $1',
          [email]
        );
        if (existingEmail.rows.length > 0) {
          return reply.code(409).send(helpers.conflict('Email already exists'));
        }
      }

      if (phone) {
        const existingPhone = await helpers.query(
          'SELECT id FROM customers WHERE phone = $1',
          [phone]
        );
        if (existingPhone.rows.length > 0) {
          return reply.code(409).send(helpers.conflict('Phone number already exists'));
        }
      }

      const result = await helpers.query(`
        INSERT INTO customers (name, email, phone, address, notes, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING *
      `, [name, email, phone, address, notes, is_active]);

      const customer = result.rows[0];

      // Publish event
      await helpers.publishEvent('customers.created', {
        customerId: customer.id,
        customerName: customer.name,
        email: customer.email,
        phone: customer.phone
      });

      // Record metric
      await helpers.recordMetric('customers_created', 1, {
        method: 'api',
        created_by: request.user.id
      });

      return reply.code(201).send(helpers.success(customer, 'Customer created successfully'));
    }));

    // GET /customers/:id - Get customer
    fastify.get('/:id', {
      preHandler: [getCommon.authenticated],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' }
          }
        }
      }
    }, fastify.asyncHandler(async (request, reply) => {
      const { id } = request.params;

      const result = await helpers.query(`
        SELECT c.*,
               COUNT(DISTINCT s.id) as subscription_count,
               COALESCE(SUM(p.amount), 0) as total_payments,
               (SELECT json_agg(json_build_object(
                 'id', s.id,
                 'type', s.type,
                 'status', s.status,
                 'profile_name', pr.name,
                 'created_at', s.created_at,
                 'expires_at', s.expires_at
               )) FROM subscriptions s 
               LEFT JOIN profiles pr ON s.profile_id = pr.id 
               WHERE s.customer_id = c.id) as subscriptions
        FROM customers c
        WHERE c.id = $1
        GROUP BY c.id
      `, [id], { notFound: { resource: 'Customer' } });

      const customer = result.rows[0];

      return reply.send(helpers.success(customer, 'Customer retrieved successfully'));
    }));

    // PUT /customers/:id - Update customer
    fastify.put('/:id', {
      preHandler: [getCommon.authenticated, middleware.requireRole(['admin', 'operator'])],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' }
          }
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            email: { type: 'string', format: 'email', maxLength: 255 },
            phone: { type: 'string', maxLength: 20 },
            address: { type: 'string', maxLength: 500 },
            notes: { type: 'string', maxLength: 1000 },
            is_active: { type: 'boolean' }
          }
        }
      }
    }, fastify.asyncHandler(async (request, reply) => {
      const { id } = request.params;
      const updates = request.body;

      // Check if customer exists
      const existing = await helpers.query(
        'SELECT id FROM customers WHERE id = $1',
        [id],
        { notFound: { resource: 'Customer' } }
      );

      // Check for duplicate email/phone if updating
      if (updates.email) {
        const emailCheck = await helpers.query(
          'SELECT id FROM customers WHERE email = $1 AND id != $2',
          [updates.email, id]
        );
        if (emailCheck.rows.length > 0) {
          return reply.code(409).send(helpers.conflict('Email already exists'));
        }
      }

      if (updates.phone) {
        const phoneCheck = await helpers.query(
          'SELECT id FROM customers WHERE phone = $1 AND id != $2',
          [updates.phone, id]
        );
        if (phoneCheck.rows.length > 0) {
          return reply.code(409).send(helpers.conflict('Phone number already exists'));
        }
      }

      // Build dynamic update query
      const fields = Object.keys(updates);
      const values = Object.values(updates);
      const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');

      const result = await helpers.query(`
        UPDATE customers 
        SET ${setClause}, updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id, ...values]);

      const customer = result.rows[0];

      // Publish event
      await helpers.publishEvent('customers.updated', {
        customerId: customer.id,
        customerName: customer.name,
        updatedFields: Object.keys(updates),
        updated_by: request.user.id
      });

      return reply.send(helpers.success(customer, 'Customer updated successfully'));
    }));

    // DELETE /customers/:id - Delete customer (soft delete)
    fastify.delete('/:id', {
      preHandler: [getCommon.authenticated, middleware.requireRole(['admin'])],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' }
          }
        }
      }
    }, fastify.asyncHandler(async (request, reply) => {
      const { id } = request.params;

      // Check if customer has active subscriptions
      const activeSubs = await helpers.query(
        'SELECT COUNT(*) as count FROM subscriptions WHERE customer_id = $1 AND status = $2',
        [id, 'active']
      );

      if (parseInt(activeSubs.rows[0].count) > 0) {
        return reply.code(400).send(helpers.error('Cannot delete customer with active subscriptions'));
      }

      // Soft delete
      await helpers.query(
        'UPDATE customers SET is_active = false, updated_at = NOW() WHERE id = $1',
        [id],
        { notFound: { resource: 'Customer' } }
      );

      // Publish event
      await helpers.publishEvent('customers.deleted', {
        customerId: id,
        deleted_by: request.user.id
      });

      return reply.send(helpers.success(null, 'Customer deleted successfully'));
    }));

    // GET /customers/:id/subscriptions - Get customer subscriptions
    fastify.get('/:id/subscriptions', {
      preHandler: [getCommon.authenticated],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' }
          }
        }
      }
    }, fastify.asyncHandler(async (request, reply) => {
      const { id } = request.params;

      // Validate customer exists
      await helpers.query(
        'SELECT id FROM customers WHERE id = $1',
        [id],
        { notFound: { resource: 'Customer' } }
      );

      const result = await helpers.query(`
        SELECT s.*, p.name as profile_name, p.price as profile_price
        FROM subscriptions s
        LEFT JOIN profiles p ON s.profile_id = p.id
        WHERE s.customer_id = $1
        ORDER BY s.created_at DESC
      `, [id]);

      return reply.send(helpers.success(result.rows, 'Customer subscriptions retrieved successfully'));
    }));

    // GET /customers/:id/balance - Get customer balance
    fastify.get('/:id/balance', {
      preHandler: [getCommon.authenticated],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' }
          }
        }
      }
    }, fastify.asyncHandler(async (request, reply) => {
      const { id } = request.params;

      const result = await helpers.query(`
        SELECT c.id, c.name, c.balance, c.debt,
               (SELECT json_agg(json_build_object(
                 'id', p.id,
                 'amount', p.amount,
                 'status', p.status,
                 'payment_method', p.payment_method,
                 'created_at', p.created_at,
                 'description', p.description
               )) FROM payments p WHERE p.customer_id = c.id ORDER BY p.created_at DESC LIMIT 10) as recent_payments
        FROM customers c
        WHERE c.id = $1
      `, [id], { notFound: { resource: 'Customer' } });

      const balance = result.rows[0];

      return reply.send(helpers.success(balance, 'Customer balance retrieved successfully'));
    }));

    // POST /customers/:id/balance/adjust - Adjust customer balance
    fastify.post('/:id/balance/adjust', {
      preHandler: [getCommon.authenticated, middleware.requireRole(['admin'])],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' }
          }
        },
        body: {
          type: 'object',
          required: ['amount', 'type'],
          properties: {
            amount: { type: 'number', minimum: 0 },
            type: { type: 'string', enum: ['credit', 'debit'] },
            description: { type: 'string', maxLength: 500 }
          }
        }
      }
    }, fastify.asyncHandler(async (request, reply) => {
      const { id } = request.params;
      const { amount, type, description } = request.body;

      const result = await helpers.transaction(async (client) => {
        // Lock customer row
        const customer = await client.query(
          'SELECT balance, debt FROM customers WHERE id = $1 FOR UPDATE',
          [id]
        );

        if (customer.rows.length === 0) {
          const error = new Error('Customer not found');
          error.code = 'NOT_FOUND';
          error.resource = 'Customer';
          throw error;
        }

        const currentBalance = parseFloat(customer.rows[0].balance) || 0;
        const currentDebt = parseFloat(customer.rows[0].debt) || 0;

        let newBalance = currentBalance;
        let newDebt = currentDebt;

        if (type === 'credit') {
          newBalance = currentBalance + amount;
          // Reduce debt if there is any
          if (currentDebt > 0) {
            newDebt = Math.max(0, currentDebt - amount);
          }
        } else {
          if (amount > currentBalance) {
            // Create debt
            newBalance = 0;
            newDebt = currentDebt + (amount - currentBalance);
          } else {
            newBalance = currentBalance - amount;
          }
        }

        // Update customer balance
        await client.query(
          'UPDATE customers SET balance = $1, debt = $2, updated_at = NOW() WHERE id = $3',
          [newBalance, newDebt, id]
        );

        // Create payment record
        await client.query(`
          INSERT INTO payments (customer_id, amount, status, payment_method, description, created_at)
          VALUES ($1, $2, 'paid', 'balance_adjustment', $3, NOW())
        `, [id, type === 'credit' ? amount : -amount, description || `Balance ${type}`]);

        return { newBalance, newDebt };
      });

      // Publish event
      await helpers.publishEvent('customers.balance_adjusted', {
        customerId: id,
        amount,
        type,
        description,
        adjusted_by: request.user.id,
        newBalance: result.newBalance,
        newDebt: result.newDebt
      });

      return reply.send(helpers.success(result, 'Customer balance adjusted successfully'));
    }));

    fastify.log.info('Customer routes registered');
  }

  /**
   * Get route information for documentation
   */
  getRouteInfo() {
    return this.routeInfo;
  }
}

module.exports = new CustomerRoutes();