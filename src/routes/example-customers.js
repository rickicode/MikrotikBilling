/**
 * Example Customer Routes - Plugin Architecture Compatible
 * 
 * This file demonstrates how to structure routes to work with the
 * new Fastify plugin architecture with proper dependency management.
 */

const LoggerService = require('../services/LoggerService');

const logger = new LoggerService('CustomerRoutes');

/**
 * Customer routes module
 * 
 * @param {FastifyInstance} server - Fastify server instance
 * @param {Object} context - Route context with decorators and middleware
 */
async function customerRoutes(server, context) {
  const { requireAuth, requireRole, validateBody, logRequest } = context.decorators;

  // GET /api/customers - List all customers
  server.get('/api/customers', {
    preHandler: [requireAuth, requireRole(['admin', 'super_admin'])],
    schema: {
      description: 'Get all customers',
      tags: ['customers'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 25 },
          search: { type: 'string', minLength: 1 },
          status: { type: 'string', enum: ['active', 'inactive', 'all'], default: 'all' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  name: { type: 'string' },
                  email: { type: 'string' },
                  phone: { type: 'string' },
                  balance: { type: 'number' },
                  status: { type: 'string' },
                  created_at: { type: 'string' }
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'number' },
                limit: { type: 'number' },
                total: { type: 'number' },
                pages: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    await logRequest('customers.list', 'access')(request, reply);

    try {
      const { page = 1, limit = 25, search, status } = request.query;
      const offset = (page - 1) * limit;

      // Build query conditions
      let whereConditions = [];
      let queryParams = [];
      let paramIndex = 1;

      if (search) {
        whereConditions.push('(name ILIKE $' + paramIndex + ' OR email ILIKE $' + paramIndex + ' OR phone ILIKE $' + paramIndex + ')');
        queryParams.push('%' + search + '%');
        paramIndex++;
      }

      if (status !== 'all') {
        whereConditions.push('active = $' + paramIndex);
        queryParams.push(status === 'active');
        paramIndex++;
      }

      const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

      // Get total count
      const countQuery = 'SELECT COUNT(*) as total FROM customers ' + whereClause;
      const countResult = await server.db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].total);

      // Get customers with pagination
      const customersQuery = `
        SELECT id, name, email, phone, balance, active, created_at, updated_at
        FROM customers 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      queryParams.push(limit, offset);

      const customersResult = await server.db.query(customersQuery, queryParams);

      logger.info('Customers retrieved', {
        page,
        limit,
        total,
        search,
        status,
        userId: request.user ? request.user.id : null
      });

      return {
        success: true,
        data: customersResult.rows,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      logger.error('Failed to retrieve customers', {
        error: error.message,
        userId: request.user ? request.user.id : null
      });

      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve customers',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  });

  // POST /api/customers - Create new customer
  server.post('/api/customers', {
    preHandler: [requireAuth, requireRole(['admin', 'super_admin'])],
    schema: {
      description: 'Create a new customer',
      tags: ['customers'],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            minLength: 2,
            maxLength: 100,
            description: 'Customer full name'
          },
          email: {
            type: 'string',
            format: 'email',
            maxLength: 255,
            description: 'Customer email address (optional)'
          },
          phone: {
            type: 'string',
            minLength: 10,
            maxLength: 20,
            pattern: '^[+]?[0-9\\s\\-\\(\\)]+$',
            description: 'Customer phone number (optional)'
          },
          address: {
            type: 'string',
            maxLength: 500,
            description: 'Customer address (optional)'
          },
          initial_balance: {
            type: 'number',
            minimum: 0,
            default: 0,
            description: 'Initial account balance'
          },
          notes: {
            type: 'string',
            maxLength: 1000,
            description: 'Additional notes about the customer'
          }
        }
      }
    }
  }, async (request, reply) => {
    await logRequest('customers.create', 'customer')(request, reply);

    try {
      const { name, email, phone, address, initial_balance = 0, notes } = request.body;

      // Check for duplicate email
      if (email) {
        const existingEmail = await server.db.query(
          'SELECT id FROM customers WHERE email = $1',
          [email.toLowerCase()]
        );
        
        if (existingEmail.rows.length > 0) {
          return reply.code(409).send({
            success: false,
            error: 'Email already exists',
            message: 'A customer with this email address already exists'
          });
        }
      }

      // Check for duplicate phone
      if (phone) {
        const existingPhone = await server.db.query(
          'SELECT id FROM customers WHERE phone = $1',
          [phone]
        );
        
        if (existingPhone.rows.length > 0) {
          return reply.code(409).send({
            success: false,
            error: 'Phone number already exists',
            message: 'A customer with this phone number already exists'
          });
        }
      }

      // Create customer
      const insertQuery = `
        INSERT INTO customers (name, email, phone, address, balance, notes, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING id, name, email, phone, address, balance, active, created_at, updated_at
      `;

      const values = [
        name.trim(),
        email ? email.toLowerCase().trim() : null,
        phone ? phone.trim() : null,
        address ? address.trim() : null,
        initial_balance,
        notes ? notes.trim() : null
      ];

      const result = await server.db.query(insertQuery, values);
      const customer = result.rows[0];

      // Log successful creation
      logger.info('Customer created', {
        customerId: customer.id,
        name: customer.name,
        email: customer.email,
        initialBalance: initial_balance,
        createdBy: request.user ? request.user.id : null
      });

      // Send WhatsApp notification if configured
      if (server.whatsapp && phone) {
        try {
          const message = 'Hello ' + name + ', your account has been created successfully! Current balance: $' + initial_balance.toFixed(2);
          await server.whatsapp.sendMessage(phone, message);
          logger.info('Welcome message sent', { customerId: customer.id, phone });
        } catch (whatsappError) {
          logger.warn('Failed to send welcome message', {
            customerId: customer.id,
            error: whatsappError.message
          });
        }
      }

      return reply.code(201).send({
        success: true,
        data: customer,
        message: 'Customer created successfully'
      });

    } catch (error) {
      logger.error('Failed to create customer', {
        error: error.message,
        requestBody: request.body,
        userId: request.user ? request.user.id : null
      });

      return reply.code(500).send({
        success: false,
        error: 'Failed to create customer',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  });
}

module.exports = customerRoutes;
