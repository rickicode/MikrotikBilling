const { v4: uuidv4 } = require('uuid');
const AuthMiddleware = require('../middleware/auth');
const { ApiErrorHandler } = require('../middleware/apiErrorHandler');

async function customerRoutes(fastify, options) {
  const auth = new AuthMiddleware(fastify);
  const db = fastify.db;

  // Customer list
  fastify.get('/', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const page = parseInt(request.query.page) || 1;
      const limit = 20;
      const offset = (page - 1) * limit;
      const search = request.query.search || '';
      const status = request.query.status || '';

      let whereClause = 'WHERE 1=1';
      const params = [];

      if (search) {
        whereClause += ' AND (name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      if (status === 'active') {
        whereClause += ' AND is_active = true';
      } else if (status === 'inactive') {
        whereClause += ' AND is_active = false';
      }

      const customers = await db.query(`
        SELECT c.*,
               COUNT(DISTINCT s.id) as subscription_count,
               COALESCE(SUM(p.amount), 0) as total_payments
        FROM customers c
        LEFT JOIN subscriptions s ON c.id = s.customer_id
        LEFT JOIN payments p ON c.id = p.customer_id AND p.status = 'paid'
        ${whereClause}
        GROUP BY c.id
        ORDER BY c.created_at DESC
        LIMIT $1 OFFSET $2
      `, [...params, limit, offset]);

      const totalQuery = await db.query(`
        SELECT COUNT(*) as count FROM customers c
        ${whereClause}
      `, params);
      const total = parseInt(totalQuery.rows[0].count);

      return reply.view('customers/index', {
        admin: request.admin,
        customers,
        pagination: {
          current: page,
          total: Math.ceil(total / limit),
          from: offset + 1,
          to: Math.min(offset + limit, total),
          total
        },
        search,
        status
      });
    } catch (error) {
            fastify.log.error('Internal Server Error:', error);
            return reply.code(500).send({
                success: false,
                message: 'Internal Server Error',
                error: {
                    detail: error.message,
                    type: error.constructor.name,
                    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
                }
            });
    }
  });

  // Create customer form
  fastify.get('/create', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    return reply.view('customers/create', {
      admin: request.admin,
      customer: {}
    });
  });

  // Create customer
  fastify.post('/', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    const { name, phone, email, is_active = true } = request.body;

    try {
      // Validate phone number format - more permissive for international formats
      if (!phone || !/^\+?[\d\s\-\(\)]{6,}$/.test(phone)) {
        return reply.view('customers/create', {
          admin: request.admin,
          customer: { name, phone, email, is_active },
          error: 'Format nomor HP tidak valid'
        });
      }

      // Check if phone number already exists
      const existingResult = await db.query(
        'SELECT id FROM customers WHERE phone = $1',
        [phone]
      );

      if (existingResult.rows && existingResult.rows.length > 0) {
        return reply.view('customers/create', {
          admin: request.admin,
          customer: { name, phone, email, is_active },
          error: 'Phone number already registered'
        });
      }

      // Create customer
      const result = await db.query(
          'INSERT INTO customers (name, phone, email, is_active, balance, debt, address) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
          [name, phone, email, is_active, 0, 0, request.body.address || null]
        );

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'create_customer',
        'customer',
        result.rows[0].id,
        { name, phone, email },
        request
      );

      return reply.redirect('/customers?success=Customer created successfully');
    } catch (error) {
      fastify.log.error(error);
      return reply.view('customers/create', {
        admin: request.admin,
        customer: { name, phone, email, is_active },
        error: 'Failed to create customer'
      });
    }
  });

  // Edit customer form
  fastify.get('/:id/edit', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const customerResult = await db.query(
        'SELECT * FROM customers WHERE id = $1',
        [request.params.id]
      );
      const customer = customerResult.rows && customerResult.rows.length > 0 ? customerResult.rows[0] : null;

      if (!customer) {
        return reply.code(404).send('Customer not found');
      }

      return reply.view('customers/edit', {
        admin: request.admin,
        customer
      });
    } catch (error) {
            fastify.log.error('Internal Server Error:', error);
            return reply.code(500).send({
                success: false,
                message: 'Internal Server Error',
                error: {
                    detail: error.message,
                    type: error.constructor.name,
                    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
                }
            });
    }
  });

  // Update customer
  fastify.post('/:id', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    const { name, phone, email, is_active } = request.body;
    const customerId = request.params.id;

    try {
      // Check if customer exists
      const existingResult = await db.query(
        'SELECT * FROM customers WHERE id = $1',
        [customerId]
      );
      const existing = existingResult.rows && existingResult.rows.length > 0 ? existingResult.rows[0] : null;

      if (!existing) {
        return reply.code(404).send('Customer not found');
      }

      // Check if phone number already exists (excluding current customer)
      const phoneExistsResult = await db.query(
        'SELECT id FROM customers WHERE phone = $1 AND id != $2',
        [phone, customerId]
      );
      const phoneExists = phoneExistsResult.rows && phoneExistsResult.rows.length > 0 ? phoneExistsResult.rows[0] : null;

      if (phoneExists) {
        return reply.view('customers/edit', {
          admin: request.admin,
          customer: { id: customerId, name, phone, email, is_active },
          error: 'Phone number already registered'
        });
      }

      // Update customer
      await db.query(
        'UPDATE customers SET name = $1, phone = $2, email = $3, is_active = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5',
        [name, phone, email, is_active, customerId]
      );

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'update_customer',
        'customer',
        customerId,
        { old_data: existing, new_data: { name, phone, email, is_active } },
        request
      );

      return reply.redirect('/customers?success=Customer updated successfully');
    } catch (error) {
      fastify.log.error(error);
      return reply.view('customers/edit', {
        admin: request.admin,
        customer: { id: customerId, name, phone, email, is_active },
        error: 'Failed to update customer'
      });
    }
  });

  // Customer details
  fastify.get('/:id', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const customerResult = await db.query(
        'SELECT * FROM customers WHERE id = $1',
        [request.params.id]
      );
      const customer = customerResult.rows && customerResult.rows.length > 0 ? customerResult.rows[0] : null;

      if (!customer) {
        return reply.code(404).send('Customer not found');
      }

      // Get subscriptions
      const subscriptions = await db.query(`
        SELECT s.*,
               (SELECT COUNT(*) FROM payments WHERE customer_id = $1 AND status = 'paid') as payment_count,
               (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE customer_id = $1 AND status = 'paid') as total_paid
        FROM subscriptions s
        WHERE s.customer_id = $1
        ORDER BY s.created_at DESC
      `, [request.params.id]);

      // Get payment history
      const payments = await db.query(`
        SELECT p.*,
               (SELECT type FROM subscriptions WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 1) as type,
               (SELECT billing_cycle FROM subscriptions WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 1) as billing_cycle
        FROM payments p
        WHERE p.customer_id = $1
        ORDER BY p.created_at DESC
        LIMIT 20
      `, [request.params.id]);

      // Get transaction logs
      const transactions = await db.query(`
        SELECT * FROM transaction_logs
        WHERE customer_id = $1
        ORDER BY created_at DESC
        LIMIT 10
      `, [request.params.id]);

      return reply.view('customers/show', {
        admin: request.admin,
        customer,
        subscriptions,
        payments,
        transactions
      });
    } catch (error) {
            fastify.log.error('Internal Server Error:', error);
            return reply.code(500).send({
                success: false,
                message: 'Internal Server Error',
                error: {
                    detail: error.message,
                    type: error.constructor.name,
                    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
                }
            });
    }
  });

  // Service creation form
  fastify.get('/:id/services/create', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const customerResult = await db.query(
        'SELECT * FROM customers WHERE id = $1',
        [request.params.id]
      );
      const customer = customerResult.rows && customerResult.rows.length > 0 ? customerResult.rows[0] : null;

      if (!customer) {
        return reply.code(404).send('Customer not found');
      }

      // Get hotspot profiles
      const profiles = await db.query(`
        SELECT * FROM profiles
        WHERE profile_type = 'hotspot' AND is_active = true
        ORDER BY name
      `);

      // Get PPP profiles
      const pppProfiles = await db.query(`
        SELECT * FROM profiles
        WHERE profile_type = 'pppoe' AND is_active = true
        ORDER BY name
      `);

      return reply.view('customers/service-create', {
        admin: request.admin,
        customer,
        profiles: profiles || [],
        pppProfiles: pppProfiles || []
      });
    } catch (error) {
            fastify.log.error('Internal Server Error:', error);
            return reply.code(500).send({
                success: false,
                message: 'Internal Server Error',
                error: {
                    detail: error.message,
                    type: error.constructor.name,
                    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
                }
            });
    }
  });

  // Create service for customer
  fastify.post('/:id/services', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    const customerId = request.params.id;
    const { service_type, profile_name, username, password, billing_cycle, auto_renew, price_sell, price_cost } = request.body;

    try {
      // Check if customer exists
      const customerResult = await db.query(
        'SELECT * FROM customers WHERE id = $1',
        [customerId]
      );
      const customer = customerResult.rows && customerResult.rows.length > 0 ? customerResult.rows[0] : null;

      if (!customer) {
        return reply.code(404).send({ success: false, message: 'Customer not found' });
      }

      // Get profile information
      const profileResult = await db.query(
        'SELECT * FROM profiles WHERE name = $1 AND profile_type = $2',
        [profile_name, service_type]
      );
      const profile = profileResult.rows && profileResult.rows.length > 0 ? profileResult.rows[0] : null;

      if (!profile) {
        return reply.code(400).send({ success: false, message: 'Profile not found' });
      }

      // Calculate expiry date
      const expiryDate = new Date();
      if (service_type === 'hotspot') {
        const duration = parseInt(request.body.duration) || 30;
        expiryDate.setDate(expiryDate.getDate() + duration);
      } else {
        switch (billing_cycle) {
          case 'weekly':
            expiryDate.setDate(expiryDate.getDate() + 7);
            break;
          case 'monthly':
            expiryDate.setMonth(expiryDate.getMonth() + 1);
            break;
          case 'quarterly':
            expiryDate.setMonth(expiryDate.getMonth() + 3);
            break;
          case 'semiannual':
            expiryDate.setMonth(expiryDate.getMonth() + 6);
            break;
          case 'yearly':
            expiryDate.setFullYear(expiryDate.getFullYear() + 1);
            break;
          default:
            expiryDate.setMonth(expiryDate.getMonth() + 1);
        }
      }

      // Create subscription
      const subscriptionResult = await db.query(`
        INSERT INTO subscriptions (
          customer_id, profile_id, service_type, start_date, end_date,
          billing_cycle, auto_renew, status, price
        ) VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, 'active', $7)
      `, [
        customerId, profile.id, service_type,
        expiryDate.toISOString().split('T')[0],
        billing_cycle || 'onetime',
        auto_renew || false, price_sell
      ]);

      // Create user in Mikrotik based on service type
      if (service_type === 'hotspot') {
        // Create hotspot user
        const hotspotUsername = `HS${customerId}${Date.now().toString().slice(-4)}`;
        const hotspotPassword = Math.random().toString(36).substring(2, 10);

        // TODO: Implement Mikrotik API call to create hotspot user
        fastify.log.info(`Would create hotspot user: ${hotspotUsername}`);
      } else if (service_type === 'pppoe') {
        // Create PPPoE secret
        // TODO: Implement Mikrotik API call to create PPPoE secret
        fastify.log.info(`Would create PPPoE user: ${username}/${password}`);
      }

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'create_service',
        'subscription',
        subscriptionResult.rows[0].id,
        {
          customer_id: customerId,
          service_type,
          profile_name,
          price_sell,
          expiry_date: expiryDate.toISOString().split('T')[0]
        },
        request
      );

      // Log transaction
      await db.query(`
        INSERT INTO transaction_logs (customer_id, type, description, amount)
        VALUES ($1, 'service_creation', $2, $3)
      `, [customerId, `${service_type.toUpperCase()} service created`, price_sell]);

      return reply.send({
        success: true,
        message: 'Layanan berhasil dibuat',
        subscription_id: subscriptionResult.rows[0].id
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        message: 'Gagal membuat layanan'
      });
    }
  });

  // Adjust customer balance
  fastify.post('/:id/adjust-balance', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    const customerId = request.params.id;
    const { adjust_type, adjust_amount, adjust_note } = request.body;

    try {
      const customerResult = await db.query(
        'SELECT * FROM customers WHERE id = $1',
        [customerId]
      );
      const customer = customerResult.rows && customerResult.rows.length > 0 ? customerResult.rows[0] : null;

      if (!customer) {
        return reply.code(404).send({ success: false, message: 'Customer not found' });
      }

      const amount = parseFloat(adjust_amount);
      if (isNaN(amount) || amount <= 0) {
        return reply.code(400).send({ success: false, message: 'Invalid amount' });
      }

      // Update balance based on type
      switch (adjust_type) {
        case 'credit':
          await db.query(`
            UPDATE customers
            SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [amount, customerId]);
          break;
        case 'debit':
          if (customer.balance < amount) {
            return reply.code(400).send({ success: false, message: 'Insufficient credit balance' });
          }
          await db.query(`
            UPDATE customers
            SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [amount, customerId]);
          break;
        case 'debt':
          await db.query(`
            UPDATE customers
            SET debt = debt + $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [amount, customerId]);
          break;
        case 'reduce_debt':
          if (customer.debt < amount) {
            return reply.code(400).send({ success: false, message: 'Debt amount exceeds current debt' });
          }
          await db.query(`
            UPDATE customers
            SET debt = debt - $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [amount, customerId]);
          break;
      }

      // Log transaction
      await db.query(`
        INSERT INTO transaction_logs (customer_id, type, description, amount)
        VALUES ($1, 'balance_adjust', $2, $3)
      `, [customerId, `${adjust_type}: ${adjust_note || 'No note'}`, amount]);

      return reply.send({
        success: true,
        message: 'Balance adjusted successfully'
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        message: 'Failed to adjust balance'
      });
    }
  });

  // Create subscription for customer
  fastify.post('/:id/subscription', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    const customerId = request.params.id;
    const { service_type, billing_cycle, auto_renew = 0 } = request.body;

    try {
      // Check if customer exists
      const customerResult = await db.query(
        'SELECT * FROM customers WHERE id = $1',
        [customerId]
      );
      const customer = customerResult.rows && customerResult.rows.length > 0 ? customerResult.rows[0] : null;

      if (!customer) {
        return reply.code(404).send('Customer not found');
      }

      // Calculate next billing date
      const nextBillingDate = new Date();
      switch (billing_cycle) {
        case 'daily':
          nextBillingDate.setDate(nextBillingDate.getDate() + 1);
          break;
        case 'weekly':
          nextBillingDate.setDate(nextBillingDate.getDate() + 7);
          break;
        case 'monthly':
          nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
          break;
        case 'yearly':
          nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
          break;
      }

      // Create subscription
      const result = await db.query(`
        INSERT INTO subscriptions (customer_id, service_type, billing_cycle, next_billing_date, auto_renew)
        VALUES ($1, $2, $3, $4, $5)
      `, [customerId, service_type, billing_cycle, nextBillingDate.toISOString().split('T')[0], auto_renew]);

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'create_subscription',
        'subscription',
        result.rows[0].id,
        { customer_id: customerId, service_type, billing_cycle },
        request
      );

      // Send notification if customer has phone number
      if (customer.phone) {
        const notificationService = require('../services/NotificationService');
        await notificationService.sendNotification(customer.id, 'subscription_created', {
          customer_name: customer.name,
          service_type,
          billing_cycle
        });
      }

      return reply.redirect(`/customers/${customerId}?success=Subscription created successfully`);
    } catch (error) {
      fastify.log.error(error);
      return reply.redirect(`/customers/${customerId}?error=Failed to create subscription`);
    }
  });

  // Update subscription status
  fastify.post('/subscription/:id/status', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    const subscriptionId = request.params.id;
    const { status } = request.body;

    try {
      // Check if subscription exists
      const subscriptionResult = await db.query(
        'SELECT * FROM subscriptions WHERE id = $1',
        [subscriptionId]
      );
      const subscription = subscriptionResult.rows && subscriptionResult.rows.length > 0 ? subscriptionResult.rows[0] : null;

      if (!subscription) {
        return reply.code(404).send('Subscription not found');
      }

      // Update subscription status
      await db.query(`
        UPDATE subscriptions
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [status, subscriptionId]);

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'update_subscription_status',
        'subscription',
        subscriptionId,
        { old_status: subscription.status, new_status: status },
        request
      );

      return reply.redirect(`/customers/${subscription.customer_id}?success=Subscription status updated`);
    } catch (error) {
            fastify.log.error('Internal Server Error:', error);
            return reply.code(500).send({
                success: false,
                message: 'Internal Server Error',
                error: {
                    detail: error.message,
                    type: error.constructor.name,
                    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
                }
            });
    }
  });

  // Customer payments
  fastify.get('/:id/payments', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const customerResult = await db.query(
        'SELECT * FROM customers WHERE id = $1',
        [request.params.id]
      );
      const customer = customerResult.rows && customerResult.rows.length > 0 ? customerResult.rows[0] : null;

      if (!customer) {
        return reply.code(404).send('Customer not found');
      }

      const payments = await db.query(`
        SELECT p.*, s.type, s.billing_cycle
        FROM payments p
        LEFT JOIN subscriptions s ON p.subscription_id = s.id
        WHERE p.customer_id = $1
        ORDER BY p.created_at DESC
      `, [request.params.id]);

      return reply.view('customers/payments', {
        admin: request.admin,
        customer,
        payments
      });
    } catch (error) {
            fastify.log.error('Internal Server Error:', error);
            return reply.code(500).send({
                success: false,
                message: 'Internal Server Error',
                error: {
                    detail: error.message,
                    type: error.constructor.name,
                    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
                }
            });
    }
  });

  // Add payment
  fastify.post('/:id/payment', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    const customerId = request.params.id;
    const { amount, payment_method, description } = request.body;

    try {
      // Check if customer exists
      const customerResult = await db.query(
        'SELECT * FROM customers WHERE id = $1',
        [customerId]
      );
      const customer = customerResult.rows && customerResult.rows.length > 0 ? customerResult.rows[0] : null;

      if (!customer) {
        return reply.code(404).send('Customer not found');
      }

      // Create payment
      const result = await db.query(`
        INSERT INTO payments (customer_id, amount, method, status, notes)
        VALUES ($1, $2, $3, 'paid', $4)
      `, [customerId, amount, payment_method, description]);

      // Update customer balance
      if (payment_method === 'credit') {
        await db.query(`
          UPDATE customers
          SET balance = balance + $1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [amount, customerId]);
      } else if (payment_method === 'cash' && customer.debt > 0) {
        // Reduce debt if customer has debt
        const debtReduction = Math.min(amount, customer.debt);
        await db.query(`
          UPDATE customers
          SET debt = debt - $1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [debtReduction, customerId]);
      }

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'add_payment',
        'payment',
        result.rows[0].id,
        { customer_id: customerId, amount, payment_method },
        request
      );

      // Log transaction
      await db.query(`
        INSERT INTO transaction_logs (customer_id, type, description, amount)
        VALUES ($1, 'payment', $2, $3)
      `, [customerId, `Payment received - ${payment_method}`, amount]);

      return reply.redirect(`/customers/${customerId}?success=Payment added successfully`);
    } catch (error) {
      fastify.log.error(error);
      return reply.redirect(`/customers/${customerId}?error=Failed to add payment`);
    }
  });

  // Delete customer
  fastify.delete('/:id', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const customerId = request.params.id;

      // Check if customer exists
      const customerResult = await db.query(
        'SELECT * FROM customers WHERE id = $1',
        [customerId]
      );
      const customer = customerResult.rows && customerResult.rows.length > 0 ? customerResult.rows[0] : null;

      if (!customer) {
        return reply.code(404).send('Customer not found');
      }

      // Check if customer has active subscriptions
      const activeSubscriptionsResult = await db.query(
        'SELECT COUNT(*) as count FROM subscriptions WHERE customer_id = $1 AND status = $2',
        [customerId, 'active']
      );
      const activeSubscriptionsCount = activeSubscriptionsResult.rows && activeSubscriptionsResult.rows.length > 0 ? activeSubscriptionsResult.rows[0].count : 0;

      if (activeSubscriptionsCount > 0) {
        return reply.code(400).send('Cannot delete customer with active subscriptions');
      }

      // Delete customer (cascade will handle related records)
      await db.query('DELETE FROM customers WHERE id = $1', [customerId]);

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'delete_customer',
        'customer',
        customerId,
        { customer_data: customer },
        request
      );

      return reply.send({ success: true });
    } catch (error) {
            fastify.log.error('Internal Server Error:', error);
            return reply.code(500).send({
                success: false,
                message: 'Internal Server Error',
                error: {
                    detail: error.message,
                    type: error.constructor.name,
                    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
                }
            });
    }
  });

  // API Routes for customer management
  // Check duplicate customer API endpoint
  fastify.get('/api/customers/check-duplicate', {}, ApiErrorHandler.asyncHandler(async (request, reply) => {
    const { phone, email } = request.query;

    if (!phone && !email) {
      return ApiErrorHandler.validationError(reply, 'Masukkan nomor HP atau email untuk mengecek duplikat');
    }

    let duplicate = false;
    let field = '';
    let customer = null;

    if (phone) {
      const existingPhoneResult = await db.query(
        'SELECT id, name FROM customers WHERE phone = $1',
        [phone]
      );
      const existingPhone = existingPhoneResult.rows && existingPhoneResult.rows.length > 0 ? existingPhoneResult.rows[0] : null;
      if (existingPhone) {
        duplicate = true;
        field = 'nomor HP';
        customer = existingPhone;
      }
    }

    if (!duplicate && email) {
      const existingEmailResult = await db.query(
        'SELECT id, name FROM customers WHERE email = $1',
        [email]
      );
      const existingEmail = existingEmailResult.rows && existingEmailResult.rows.length > 0 ? existingEmailResult.rows[0] : null;
      if (existingEmail) {
        duplicate = true;
        field = 'email';
        customer = existingEmail;
      }
    }

    return reply.send({
      duplicate,
      field,
      customer
    });
  }));

  // Create customer via API
  fastify.post('/api/customers', {}, ApiErrorHandler.asyncHandler(async (request, reply) => {
    console.log('DEBUG: Received customer creation request:', request.body);
    const { name, phone, email, is_active = true, balance = 0, debt = 0, address } = request.body;

    // Validate required fields
    if (!name || !phone) {
      console.log('DEBUG: Missing required fields - name:', name, 'phone:', phone);
      return ApiErrorHandler.validationError(reply, 'Nama dan nomor HP wajib diisi');
    }

    // Validate phone number format - more permissive for international formats
    if (!/^\+?[\d\s\-\(\)]{6,}$/.test(phone)) {
      console.log('DEBUG: Invalid phone format:', phone);
      return ApiErrorHandler.validationError(reply, 'Format nomor HP tidak valid');
    }

    // Check if phone number already exists
    const existingResult = await db.query(
      'SELECT id FROM customers WHERE phone = $1',
      [phone]
    );

    if (existingResult.rows && existingResult.rows.length > 0) {
      return ApiErrorHandler.validationError(reply, 'Nomor HP sudah terdaftar');
    }

    // Create customer with all fields
    const result = await db.query(
        'INSERT INTO customers (name, phone, email, is_active, balance, debt, address) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [name, phone, email, is_active, balance || 0, debt || 0, address || null]
      );

    const newCustomerResult = await db.query(
      'SELECT * FROM customers WHERE id = $1',
      [result.rows[0].id]
    );
    const newCustomer = newCustomerResult.rows && newCustomerResult.rows.length > 0 ? newCustomerResult.rows[0] : null;

    // Log activity
    await auth.logActivity(
      request.admin.id,
      'create_customer',
      'customer',
      result.rows[0].id,
      { name, phone, email, is_active },
      request
    );

    return reply.code(201).send({
      success: true,
      customer: newCustomer,
      message: 'Pelanggan berhasil ditambahkan'
    });
  }));

  // Get customers with pagination and filtering
  fastify.get('/api/customers', {}, ApiErrorHandler.asyncHandler(async (request, reply) => {
    const page = parseInt(request.query.page) || 1;
    const pageSize = parseInt(request.query.page_size) || 10;
    const offset = (page - 1) * pageSize;
    const search = request.query.search || '';
    const status = request.query.status || '';
    const service = request.query.service || '';
    const sortBy = request.query.sort_by || 'created_at';
    const sortOrder = request.query.sort_order || 'desc';

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (search) {
      whereClause += ' AND (c.name ILIKE $1 OR c.phone ILIKE $1 OR c.email ILIKE $1)';
      params.push(`%${search}%`);
    }

    if (status === 'active') {
      whereClause += ' AND c.is_active = true';
    } else if (status === 'inactive') {
      whereClause += ' AND c.is_active = false';
    } else if (status === 'suspended') {
      whereClause += " AND c.status = 'suspended'";
    }

    // Build query based on service filter
    let serviceJoin = '';
    if (service) {
      if (service === 'hotspot') {
        serviceJoin = 'INNER JOIN subscriptions s ON c.id = s.customer_id AND s.type = \'hotspot\'';
      } else if (service === 'pppoe') {
        serviceJoin = 'INNER JOIN subscriptions s ON c.id = s.customer_id AND s.type = \'pppoe\'';
      } else if (service === 'both') {
        serviceJoin = 'INNER JOIN subscriptions s ON c.id = s.customer_id';
        whereClause += ' AND (SELECT COUNT(DISTINCT type) FROM subscriptions WHERE customer_id = c.id) = 2';
      }
    } else {
      serviceJoin = 'LEFT JOIN subscriptions s ON c.id = s.customer_id';
    }

    const customersResult = await db.query(`
      SELECT c.*,
             COUNT(DISTINCT s.id) as subscription_count,
             COALESCE(SUM(p.amount), 0) as total_payments,
             STRING_AGG(DISTINCT s.type::text, ',') as services
      FROM customers c
      ${serviceJoin}
      LEFT JOIN payments p ON c.id = p.customer_id AND p.status = 'paid'
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.${sortBy} ${sortOrder}
      LIMIT $1 OFFSET $2
    `, [...params, pageSize, offset]);

    const customers = customersResult.rows || [];

    const totalQuery = await db.query(`
      SELECT COUNT(DISTINCT c.id) as count
      FROM customers c
      ${serviceJoin}
      ${whereClause}
    `, params);
    const total = parseInt(totalQuery.rows[0].count);

    // Calculate statistics
    const statistics = {
      total: total,
      active: (await db.query('SELECT COUNT(*) as count FROM customers WHERE is_active = true')).rows[0].count,
      hotspot: (await db.query(`SELECT COUNT(DISTINCT c.id) as count FROM customers c INNER JOIN subscriptions s ON c.id = s.customer_id AND s.type = \'hotspot\'`)).rows[0].count,
      pppoe: (await db.query(`SELECT COUNT(DISTINCT c.id) as count FROM customers c INNER JOIN subscriptions s ON c.id = s.customer_id AND s.type = \'pppoe\'`)).rows[0].count
    };

    // Process services for each customer
    const processedCustomers = customers.map(customer => ({
      ...customer,
      services: customer.services ? customer.services.split(',') : []
    }));

    return reply.send({
      customers: processedCustomers,
      pagination: {
        page: page,
        page_size: pageSize,
        total: total,
        total_pages: Math.ceil(total / pageSize),
        from: offset + 1,
        to: Math.min(offset + pageSize, total)
      },
      statistics
    });
  }));

  // Get customer statistics
  fastify.get('/api/customers/statistics', {}, ApiErrorHandler.asyncHandler(async (request, reply) => {
    const statistics = {
      total: (await db.query('SELECT COUNT(*) as count FROM customers')).rows[0].count,
      active: (await db.query('SELECT COUNT(*) as count FROM customers WHERE is_active = true')).rows[0].count,
      inactive: (await db.query('SELECT COUNT(*) as count FROM customers WHERE is_active = false')).rows[0].count,
      suspended: (await db.query('SELECT COUNT(*) as count FROM customers WHERE status = \'suspended\'')).rows[0].count,
      hotspot: (await db.query(`SELECT COUNT(DISTINCT c.id) as count FROM customers c INNER JOIN subscriptions s ON c.id = s.customer_id AND s.type = \'hotspot\'`)).rows[0].count,
      pppoe: (await db.query(`SELECT COUNT(DISTINCT c.id) as count FROM customers c INNER JOIN subscriptions s ON c.id = s.customer_id AND s.type = \'pppoe\'`)).rows[0].count,
      total_revenue: 0, // TODO: Fix this query
      total_debt: (await db.query('SELECT COALESCE(SUM(debt), 0) as total FROM customers')).rows[0].total,
      total_credit: (await db.query('SELECT COALESCE(SUM(balance), 0) as total FROM customers')).rows[0].total
    };

    return reply.send(statistics);
  }));

  // Get single customer by ID
  fastify.get('/api/customers/:id', {}, ApiErrorHandler.asyncHandler(async (request, reply) => {
    const customerResult = await db.query(
      'SELECT * FROM customers WHERE id = $1',
      [request.params.id]
    );
    const customer = customerResult.rows && customerResult.rows.length > 0 ? customerResult.rows[0] : null;

    if (!customer) {
      return ApiErrorHandler.notFoundError(reply, 'Customer not found');
    }

    // Get subscriptions
    const subscriptions = await db.query(`
      SELECT s.*,
             (SELECT COUNT(*) FROM payments WHERE customer_id = $1 AND status = 'paid') as payment_count,
             (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE customer_id = $1 AND status = 'paid') as total_paid
      FROM subscriptions s
      WHERE s.customer_id = $1
      ORDER BY s.created_at DESC
    `, [request.params.id]);

    // Get payment history
    const payments = await db.query(`
      SELECT p.*
      FROM payments p
      WHERE p.customer_id = $1
      ORDER BY p.created_at DESC
      LIMIT 20
    `, [request.params.id]);

    // Activities table doesn't exist in current schema
    const activities = [];

    return reply.send({
      ...customer,
      subscriptions,
      payments,
      activities,
      services: subscriptions.map(s => s.type)
    });
  }));

  // Export customers
  fastify.get('/api/customers/export', {}, ApiErrorHandler.asyncHandler(async (request, reply) => {
    const search = request.query.search || '';
    const status = request.query.status || '';
    const service = request.query.service || '';

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (search) {
      whereClause += ' AND (name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1)';
      params.push(`%${search}%`);
    }

    if (status) {
      whereClause += ` AND is_active = ${status === 'active' ? 1 : 0}`;
    }

    if (service) {
      whereClause += ` AND id IN (SELECT customer_id FROM subscriptions WHERE type = '${service}')`;
    }

    const customersResult = await db.query(`
      SELECT
        id, name, phone, email, is_active,
        balance, debt, created_at, updated_at
      FROM customers
      ${whereClause}
      ORDER BY created_at DESC
    `, params);

    const customers = customersResult.rows || [];

    // Generate CSV
    const headers = ['ID', 'Nama', 'Nomor HP', 'Email', 'Status', 'Saldo', 'Hutang', 'Terdaftar'];
    const csvContent = [
      headers.join(','),
      ...customers.map(c => [
        c.id,
        `"${c.name || ''}"`,
        c.phone || '',
        `"${c.email || ''}"`,
        c.is_active ? 'Aktif' : c.status === 'suspended' ? 'Ditangguhkan' : 'Tidak Aktif',
        c.balance || 0,
        c.debt || 0,
        c.created_at
      ].join(','))
    ].join('\n');

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="customers.csv"');
    return reply.send(csvContent);
  }));
}

module.exports = customerRoutes;