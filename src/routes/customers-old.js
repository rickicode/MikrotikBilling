const { v4: uuidv4 } = require('uuid');
const AuthMiddleware = require('../middleware/auth');
const { db } = require('../database/DatabaseManager');

async function customerRoutes(fastify, options) {
  const auth = new AuthMiddleware(fastify);

  // Helper function for detailed error logging
  function logDetailedError(fastify, error, request, context = {}) {
    fastify.log.error(`${context.operation || 'API Error'}:`, {
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
      ip: request.ip,
      query: request.query,
      params: request.params,
      body: context.body || {},
      ...context
    });
  }

  // Helper function for detailed error response
  function sendDetailedError(reply, error, request, context = {}) {
    return reply.code(500).send({
      success: false,
      error: context.errorTitle || 'Database Operation Failed',
      details: {
        message: error.message,
        type: error.constructor.name,
        url: request.url,
        method: request.method,
        timestamp: new Date().toISOString(),
        ...context.details
      }
    });
  }

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
        whereClause += ' AND (nama LIKE ? OR nomor_hp LIKE ? OR email LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%');
      }

      if (status === 'active') {
        whereClause += ' AND status_aktif = 1';
      } else if (status === 'inactive') {
        whereClause += ' AND status_aktif = 0';
      }

      const customers = await db.query(`
        SELECT c.*,
               COUNT(DISTINCT s.id) as subscription_count,
               COALESCE(SUM(p.amount), 0) as total_payments
        FROM customers c
        LEFT JOIN subscriptions s ON c.id = s.customer_id
        LEFT JOIN payments p ON c.id = p.customer_id AND p.payment_status = 'paid'
        ${whereClause}
        GROUP BY c.id
        ORDER BY c.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
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
      logDetailedError(fastify, error, request, {
        operation: 'Get Customers List',
        body: { search, status, page }
      });

      return sendDetailedError(reply, error, request, {
        errorTitle: 'Failed to Load Customers'
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
    const { nama, nomor_hp, email, status_aktif = 1 } = request.body;

    try {
      // Validate phone number format - more permissive for international formats
      if (!nomor_hp || !/^\+?[\d\s\-\(\)]{6,}$/.test(nomor_hp)) {
        return reply.view('customers/create', {
          admin: request.admin,
          customer: { nama, nomor_hp, email, status_aktif },
          error: 'Format nomor HP tidak valid'
        });
      }

      // Check if phone number already exists
      const existing = db.query(`SELECT id FROM customers WHERE nomor_hp = ?', [nomor_hp]);

      if (existing) {
        return reply.view('customers/create', {
          admin: request.admin,
          customer: { nama, nomor_hp, email, status_aktif },
          error: 'Phone number already registered'
        });
      }

      // Create customer
      const result = await db.insert('customers', {'nama':'nama','nomor_hp':'nomor_hp','email':'email','status_aktif':'status_aktif'});

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'create_customer',
        'customer',
        result.lastInsertRowid,
        { nama, nomor_hp, email },
        request
      );

      return reply.redirect('/customers?success=Customer created successfully');
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Create Customer',
        body: { nama, nomor_hp, email, status_aktif }
      });

      return reply.view('customers/create', {
        admin: request.admin,
        customer: { nama, nomor_hp, email, status_aktif },
        error: `Failed to create customer: ${error.message}`
      });
    }
  });

  // Edit customer form
  fastify.get('/:id/edit', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const customer = db.getOne('customers', {'id':'request.params.id'});

      if (!customer) {
        return reply.code(404).send('Customer not found');
      }

      return reply.view('customers/edit', {
        admin: request.admin,
        customer
      });
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Get Customer Edit Form',
        body: { customerId: request.params.id }
      });

      return sendDetailedError(reply, error, request, {
        errorTitle: 'Failed to Load Customer Edit Form'
      });
    }
  });

  // Update customer
  fastify.post('/:id', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    const { nama, nomor_hp, email, status_aktif } = request.body;
    const customerId = request.params.id;

    try {
      // Check if customer exists
      const existing = db.getOne('customers', {'id':'customerId'});

      if (!existing) {
        return reply.code(404).send('Customer not found');
      }

      // Check if phone number already exists (excluding current customer)
      const phoneExists = db.query(`SELECT id FROM customers WHERE nomor_hp = ? AND id != ?', [nomor_hp, customerId]);

      if (phoneExists) {
        return reply.view('customers/edit', {
          admin: request.admin,
          customer: { id: customerId, nama, nomor_hp, email, status_aktif },
          error: 'Phone number already registered'
        });
      }

      // Update customer
      await db.update('customers', {'nama':'nama','nomo':'nomor_hp'}, {});

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'update_customer',
        'customer',
        customerId,
        { old_data: existing, new_data: { nama, nomor_hp, email, status_aktif } },
        request
      );

      return reply.redirect('/customers?success=Customer updated successfully');
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Update Customer',
        body: { id: customerId, nama, nomor_hp, email, status_aktif }
      });

      return reply.view('customers/edit', {
        admin: request.admin,
        customer: { id: customerId, nama, nomor_hp, email, status_aktif },
        error: `Failed to update customer: ${error.message}`
      });
    }
  });

  // Customer details
  fastify.get('/:id', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const customer = db.getOne('customers', {'id':'request.params.id'});

      if (!customer) {
        return reply.code(404).send('Customer not found');
      }

      // Get subscriptions
      db.query(`
        SELECT s.*,
               (SELECT COUNT(*) FROM payments WHERE customer_id = ? AND payment_status = 'paid') as payment_count,
               (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE customer_id = ? AND payment_status = 'paid') as total_paid
        FROM subscriptions s
        WHERE s.customer_id = ?
        ORDER BY s.created_at DESC
      ', [request.params.id, request.params.id, request.params.id]);

      // Get payment history
      db.query(`
        SELECT p.*,
               (SELECT service_type FROM subscriptions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1) as service_type,
               (SELECT billing_cycle FROM subscriptions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1) as billing_cycle
        FROM payments p
        WHERE p.customer_id = ?
        ORDER BY p.created_at DESC
        LIMIT 20
      ', [request.params.id, request.params.id, request.params.id]);

      // Get transaction logs
      db.query(`
        SELECT * FROM transaction_logs
        WHERE customer_id = ?
        ORDER BY created_at DESC
        LIMIT 10
      ', [request.params.id]);

      return reply.view('customers/show', {
        admin: request.admin,
        customer,
        subscriptions,
        payments,
        transactions
      });
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Get Customer Details',
        body: { customerId: request.params.id }
      });

      return sendDetailedError(reply, error, request, {
        errorTitle: 'Failed to Load Customer Details'
      });
    }
  });

  // Service creation form
  fastify.get('/:id/services/create', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const customer = db.getOne('customers', {'id':'request.params.id'});

      if (!customer) {
        return reply.code(404).send('Customer not found');
      }

      // Get hotspot profiles
      db.query(`
        SELECT * FROM profiles
        WHERE type = \'hotspot\' AND mikrotik_synced = 1
        ORDER BY name
      ');

      // Get PPP profiles
      db.query(`
        SELECT * FROM profiles
        WHERE type = \'pppoe\' AND mikrotik_synced = 1
        ORDER BY name
      ');

      return reply.view('customers/service-create', {
        admin: request.admin,
        customer,
        profiles: profiles || [],
        pppProfiles: pppProfiles || []
      });
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Get Service Creation Form',
        body: { customerId: request.params.id }
      });

      return sendDetailedError(reply, error, request, {
        errorTitle: 'Failed to Load Service Creation Form'
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
      const customer = db.getOne('customers', {'id':'customerId'});

      if (!customer) {
        return reply.code(404).send({ success: false, message: 'Customer not found' });
      }

      // Get profile information
      const profile = db.getOne('profiles', {'name':'profile_name','type':'service_type'});

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
      const subscriptionResult = fastify.db.run(`
        INSERT INTO subscriptions (
          customer_id, service_type, profile_name, billing_cycle,
          auto_renew, price_sell, price_cost, status, expiry_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
      `, [
        customerId, service_type, profile_name, billing_cycle || 'onetime',
        auto_renew ? 1 : 0, price_sell, price_cost,
        expiryDate.toISOString().split('T')[0]
      ]);

      // Create user in Mikrotik based on service type
      if (service_type === 'hotspot') {
        // Create hotspot user
        const hotspotUsername = `HS${customerId}${Date.now().toString().slice(-4)}`;
        const hotspotPassword = Math.random().toString(36).substring(2, 10);

        // TODO: Implement Mikrotik API call to create hotspot user
        fastify.log.info(`Would create hotspot user: ${hotspotUsername}');
      } else if (service_type === 'pppoe') {
        // Create PPPoE secret
        // TODO: Implement Mikrotik API call to create PPPoE secret
        fastify.log.info(`Would create PPPoE user: ${username}/${password}');
      }

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'create_service',
        'subscription',
        subscriptionResult.lastInsertRowid,
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
      fastify.db.run(`
        INSERT INTO transaction_logs (customer_id, type, description, amount)
        VALUES (?, 'service_creation', ?, ?)
      `, [customerId, `${service_type.toUpperCase()} service created`, price_sell]);

      return reply.send({
        success: true,
        message: 'Layanan berhasil dibuat',
        subscription_id: subscriptionResult.lastInsertRowid
      });

    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Create Customer Service',
        body: { customerId, service_type, profile_name, billing_cycle }
      });

      return sendDetailedError(reply, error, request, {
        errorTitle: 'Failed to Create Service',
        details: { service_type, profile_name, billing_cycle }
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
      const customer = db.getOne('customers', {'id':'customerId'});

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
          await db.update('customers', {'c':'amount'}, {});
          break;
        case 'debit':
          if (customer.credit_balance < amount) {
            return reply.code(400).send({ success: false, message: 'Insufficient credit balance' });
          }
          await db.update('customers', {'c':'amount'}, {});
          break;
        case 'debt':
          await db.update('customers', {'d':'amount'}, {});
          break;
        case 'reduce_debt':
          if (customer.debt_balance < amount) {
            return reply.code(400).send({ success: false, message: 'Debt amount exceeds current debt' });
          }
          await db.update('customers', {'d':'amount'}, {});
          break;
      }

      // Log transaction
      fastify.db.run(`
        INSERT INTO transaction_logs (customer_id, type, description, amount)
        VALUES (?, 'balance_adjust', ?, ?)
      `, [customerId, `${adjust_type}: ${adjust_note || 'No note'}`, amount]);

      return reply.send({
        success: true,
        message: 'Balance adjusted successfully'
      });

    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Adjust Customer Balance',
        body: { customerId, adjust_type, adjust_amount }
      });

      return sendDetailedError(reply, error, request, {
        errorTitle: 'Failed to Adjust Balance',
        details: { adjust_type, adjust_amount }
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
      const customer = db.getOne('customers', {'id':'customerId'});

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
      const result = fastify.db.run(`
        INSERT INTO subscriptions (customer_id, service_type, billing_cycle, next_billing_date, auto_renew)
        VALUES (?, ?, ?, ?, ?)
      `, [customerId, service_type, billing_cycle, nextBillingDate.toISOString().split('T')[0], auto_renew]);

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'create_subscription',
        'subscription',
        result.lastInsertRowid,
        { customer_id: customerId, service_type, billing_cycle },
        request
      );

      // Send notification if customer has phone number
      if (customer.nomor_hp) {
        const whatsappService = fastify.whatsappService;
        await whatsappService.sendNotification(customer.id, 'subscription_created', {
          customer_name: customer.nama,
          service_type,
          billing_cycle
        });
      }

      return reply.redirect(`/customers/${customerId}?success=Subscription created successfully');
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Create Customer Subscription',
        body: { customerId, service_type, billing_cycle }
      });

      return reply.redirect(`/customers/${customerId}?error=Failed to create subscription: ${error.message}');
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
      const subscription = db.getOne('subscriptions', {'id':'subscriptionId'});

      if (!subscription) {
        return reply.code(404).send('Subscription not found');
      }

      // Update subscription status
      await db.update('subscriptions', {'status':'status','updat':'subscriptionId'}, {});

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'update_subscription_status',
        'subscription',
        subscriptionId,
        { old_status: subscription.status, new_status: status },
        request
      );

      return reply.redirect(`/customers/${subscription.customer_id}?success=Subscription status updated');
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Update Subscription Status',
        body: { subscriptionId, status }
      });

      return sendDetailedError(reply, error, request, {
        errorTitle: 'Failed to Update Subscription Status',
        details: { subscriptionId, status }
      });
    }
  });

  // Customer payments
  fastify.get('/:id/payments', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const customer = db.getOne('customers', {'id':'request.params.id'});

      if (!customer) {
        return reply.code(404).send('Customer not found');
      }

      db.query(`
        SELECT p.*, s.service_type, s.billing_cycle
        FROM payments p
        LEFT JOIN subscriptions s ON p.subscription_id = s.id
        WHERE p.customer_id = ?
        ORDER BY p.created_at DESC
      ', [request.params.id]);

      return reply.view('customers/payments', {
        admin: request.admin,
        customer,
        payments
      });
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Get Customer Payments',
        body: { customerId: request.params.id }
      });

      return sendDetailedError(reply, error, request, {
        errorTitle: 'Failed to Load Customer Payments'
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
      const customer = db.getOne('customers', {'id':'customerId'});

      if (!customer) {
        return reply.code(404).send('Customer not found');
      }

      // Create payment
      const result = await db.insert('payments', {'customer_id':'customerId','amount':'amount','payment_method':'payment_method','payment_status':'description','description':'null'});

      // Update customer balance
      if (payment_method === 'credit') {
        await db.update('customers', {'c':'amount'}, {});
      } else if (payment_method === 'cash' && customer.debt_balance > 0) {
        // Reduce debt if customer has debt
        const debtReduction = Math.min(amount, customer.debt_balance);
        await db.update('customers', {'d':'debtReduction'}, {});
      }

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'add_payment',
        'payment',
        result.lastInsertRowid,
        { customer_id: customerId, amount, payment_method },
        request
      );

      // Log transaction
      fastify.db.run(`
        INSERT INTO transaction_logs (customer_id, type, description, amount)
        VALUES (?, 'payment', ?, ?)
      `, [customerId, `Payment received - ${payment_method}`, amount]);

      return reply.redirect(`/customers/${customerId}?success=Payment added successfully');
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Add Customer Payment',
        body: { customerId, amount, payment_method }
      });

      return reply.redirect(`/customers/${customerId}?error=Failed to add payment: ${error.message}');
    }
  });

  // Delete customer
  fastify.delete('/:id', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const customerId = request.params.id;

      // Check if customer exists
      const customer = db.getOne('customers', {'id':'customerId'});

      if (!customer) {
        return reply.code(404).send('Customer not found');
      }

      // Check if customer has active subscriptions
      const activeSubscriptions = fastify.db.get(
        'SELECT COUNT(*) as count FROM subscriptions WHERE customer_id = ? AND status = \'active\'',
        [customerId]
      );

      if (activeSubscriptions.count > 0) {
        return reply.code(400).send('Cannot delete customer with active subscriptions');
      }

      // Delete customer (cascade will handle related records)
      await db.delete('customers', {'id':'customerId'});

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
      logDetailedError(fastify, error, request, {
        operation: 'Delete Customer',
        body: { customerId }
      });

      return sendDetailedError(reply, error, request, {
        errorTitle: 'Failed to Delete Customer'
      });
    }
  });

  // API Routes for customer management
  // Check duplicate customer API endpoint
  fastify.get('/api/customers/check-duplicate', {}, async (request, reply) => {
    try {
      const { phone, email } = request.query;

      if (!phone && !email) {
        return reply.code(400).send({
          success: false,
          message: 'Masukkan nomor HP atau email untuk mengecek duplikat'
        });
      }

      let duplicate = false;
      let field = '';
      let customer = null;

      if (phone) {
        const existingPhone = db.query(`SELECT id, nama FROM customers WHERE nomor_hp = ?', [phone]);
        if (existingPhone) {
          duplicate = true;
          field = 'nomor HP';
          customer = existingPhone;
        }
      }

      if (!duplicate && email) {
        const existingEmail = db.query(`SELECT id, nama FROM customers WHERE email = ?', [email]);
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
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Check Duplicate Customer',
        body: { phone, email }
      });

      return sendDetailedError(reply, error, request, {
        errorTitle: 'Duplicate Check Failed',
        details: { phone, email }
      });
    }
  });

  // Create customer via API
  fastify.post('/api/customers', {}, async (request, reply) => {
    console.log('DEBUG: Received customer creation request:', request.body);
    const { nama, nomor_hp, email, status_aktif = 1, credit_balance = 0, debt_balance = 0, alamat } = request.body;

    try {
      // Validate required fields
      if (!nama || !nomor_hp) {
        console.log('DEBUG: Missing required fields - nama:', nama, 'nomor_hp:', nomor_hp);
        return reply.code(400).send({
          success: false,
          message: 'Nama dan nomor HP wajib diisi'
        });
      }

      // Validate phone number format - more permissive for international formats
      if (!/^\+?[\d\s\-\(\)]{6,}$/.test(nomor_hp)) {
        console.log('DEBUG: Invalid phone format:', nomor_hp);
        return reply.code(400).send({
          success: false,
          message: 'Format nomor HP tidak valid'
        });
      }

      // Check if phone number already exists
      const existing = db.query(`SELECT id FROM customers WHERE nomor_hp = ?', [nomor_hp]);

      if (existing) {
        return reply.code(400).send({
          success: false,
          message: 'Nomor HP sudah terdaftar'
        });
      }

      // Create customer with all fields
      const result = await db.insert('customers', {'nama':'nama','nomor_hp':'nomor_hp','email':'email','status_aktif':'status_aktif','credit_balance':'credit_balance','debt_balance':'debt_balance'});

      const newCustomer = db.getOne('customers', {'id':'result.lastInsertRowid'});

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'create_customer',
        'customer',
        result.lastInsertRowid,
        { nama, nomor_hp, email, status_aktif },
        request
      );

      return reply.code(201).send({
        success: true,
        customer: newCustomer,
        message: 'Pelanggan berhasil ditambahkan'
      });
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Create Customer API',
        body: { nama, nomor_hp, email, status_aktif }
      });

      return sendDetailedError(reply, error, request, {
        errorTitle: 'Customer Creation Failed',
        details: { nama, nomor_hp, email, status_aktif }
      });
    }
  });

  // Get customers with pagination and filtering
  fastify.get('/api/customers', {}, async (request, reply) => {
    try {
      const page = parseInt(request.query.page) || 1;
      const pageSize = parseInt(request.query.page_size) || 10;
      const offset = (page - 1) * pageSize;
      const search = request.query.search || '';
      const status = request.query.status || '';
      const service = request.query.service || '';
      const sortBy = request.query.sort_by || 'created_at';
      const sortOrder = request.query.sort_order || 'desc';

      // Map column names to database column names
      const columnMapping = {
        'name': 'nama',
        'phone': 'nomor_hp',
        'email': 'email',
        'status': 'status_aktif',
        'created_at': 'created_at',
        'updated_at': 'updated_at',
        'credit_balance': 'credit_balance',
        'debt_balance': 'debt_balance'
      };

      const dbSortBy = columnMapping[sortBy] || sortBy;

      let whereClause = 'WHERE 1=1';
      const params = [];

      if (search) {
        whereClause += ' AND (c.nama LIKE ? OR c.nomor_hp LIKE ? OR c.email LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%');
      }

      if (status === 'active') {
        whereClause += ' AND c.status_aktif = 1';
      } else if (status === 'inactive') {
        whereClause += ' AND c.status_aktif = 0';
      } else if (status === 'suspended') {
        whereClause += ' AND c.status_aktif = 2';
      }

      // Build query based on service filter
      let serviceJoin = '';
      if (service) {
        if (service === 'hotspot') {
          serviceJoin = 'INNER JOIN subscriptions s ON c.id = s.customer_id AND s.service_type = \'hotspot\'';
        } else if (service === 'pppoe') {
          serviceJoin = 'INNER JOIN subscriptions s ON c.id = s.customer_id AND s.service_type = \'pppoe\'';
        } else if (service === 'both') {
          serviceJoin = 'INNER JOIN subscriptions s ON c.id = s.customer_id';
          whereClause += ' AND (SELECT COUNT(DISTINCT service_type) FROM subscriptions WHERE customer_id = c.id) = 2';
        }
      } else {
        serviceJoin = 'LEFT JOIN subscriptions s ON c.id = s.customer_id';
      }

      const customers = await db.query(`
        SELECT c.*,
               COUNT(DISTINCT s.id) as subscription_count,
               COALESCE(SUM(p.amount), 0) as total_payments,
               STRING_AGG(DISTINCT s.service_type, ',') as services
        FROM customers c
        ${serviceJoin}
        LEFT JOIN payments p ON c.id = p.customer_id AND p.payment_status = 'paid'
        ${whereClause}
        GROUP BY c.id
        ORDER BY c.${dbSortBy} ${sortOrder}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      ', [...params, pageSize, offset]);

      const totalResult = await db.getOne(`
        SELECT COUNT(DISTINCT c.id) as count
        FROM customers c
        ${serviceJoin}
        ${whereClause}
      `, params);
      const total = totalResult.count;

      // Calculate statistics
      const statistics = {
        total: total,
        active: (await db.getOne('SELECT COUNT(*) as count FROM customers WHERE status_aktif = 1')).count,
        hotspot: (await db.getOne(`
          SELECT COUNT(DISTINCT c.id) as count
          FROM customers c
          INNER JOIN subscriptions s ON c.id = s.customer_id AND s.service_type = \'hotspot\'
        `)).count,
        pppoe: (await db.getOne(`
          SELECT COUNT(DISTINCT c.id) as count
          FROM customers c
          INNER JOIN subscriptions s ON c.id = s.customer_id AND s.service_type = \'pppoe\'
        `)).count
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
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Get Customers API',
        body: { page, pageSize, search, status, service }
      });

      return sendDetailedError(reply, error, request, {
        errorTitle: 'Database Query Failed',
        details: { page, pageSize, search, status, service }
      });
    }
  });

  // Get customer statistics
  fastify.get('/api/customers/statistics', {}, async (request, reply) => {
    try {
      const [
        totalResult,
        activeResult,
        inactiveResult,
        suspendedResult,
        hotspotResult,
        pppoeResult,
        debtResult,
        creditResult
      ] = await Promise.all([
        db.getOne('SELECT COUNT(*) as count FROM customers'),
        db.getOne('SELECT COUNT(*) as count FROM customers WHERE status_aktif = 1'),
        db.getOne('SELECT COUNT(*) as count FROM customers WHERE status_aktif = 0'),
        db.getOne('SELECT COUNT(*) as count FROM customers WHERE status_aktif = 2'),
        db.getOne(`
          SELECT COUNT(DISTINCT c.id) as count
          FROM customers c
          INNER JOIN subscriptions s ON c.id = s.customer_id AND s.service_type = \'hotspot\'
        `),
        db.getOne(`
          SELECT COUNT(DISTINCT c.id) as count
          FROM customers c
          INNER JOIN subscriptions s ON c.id = s.customer_id AND s.service_type = \'pppoe\'
        `),
        db.getOne('SELECT COALESCE(SUM(debt_balance), 0) as total FROM customers'),
        db.getOne('SELECT COALESCE(SUM(credit_balance), 0) as total FROM customers')
      ]);

      const statistics = {
        total: totalResult.count,
        active: activeResult.count,
        inactive: inactiveResult.count,
        suspended: suspendedResult.count,
        hotspot: hotspotResult.count,
        pppoe: pppoeResult.count,
        total_revenue: 0, // TODO: Fix this query
        total_debt: debtResult.total,
        total_credit: creditResult.total
      };

      return reply.send(statistics);
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Get Customer Statistics API'
      });

      return sendDetailedError(reply, error, request, {
        errorTitle: 'Statistics Database Query Failed'
      });
    }
  });

  // Get single customer by ID
  fastify.get('/api/customers/:id', {}, async (request, reply) => {
    try {
      const customer = await db.getOne(
        'SELECT * FROM customers WHERE id = $1',
        [request.params.id]
      );

      if (!customer) {
        return reply.code(404).send({ error: 'Customer not found' });
      }

      // Get subscriptions
      const subscriptions = await db.query(`
        SELECT s.*,
               (SELECT COUNT(*) FROM payments WHERE customer_id = $1 AND payment_status = 'paid') as payment_count,
               (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE customer_id = $1 AND payment_status = 'paid') as total_paid
        FROM subscriptions s
        WHERE s.customer_id = $1
        ORDER BY s.created_at DESC
      ', [request.params.id]);

      // Get payment history
      const payments = await db.query(`
        SELECT p.*
        FROM payments p
        WHERE p.customer_id = $1
        ORDER BY p.created_at DESC
        LIMIT 20
      ', [request.params.id]);

      // Activities table doesn't exist in current schema
      const activities = [];

      return reply.send({
        ...customer,
        subscriptions,
        payments,
        activities,
        services: subscriptions.map(s => s.service_type)
      });
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Get Single Customer API',
        body: { customerId: request.params.id }
      });

      return sendDetailedError(reply, error, request, {
        errorTitle: 'Customer Data Retrieval Failed',
        details: { customerId: request.params.id }
      });
    }
  });

  // Export customers
  fastify.get('/api/customers/export', {}, async (request, reply) => {
    try {
      const search = request.query.search || '';
      const status = request.query.status || '';
      const service = request.query.service || '';

      let whereClause = 'WHERE 1=1';
      const params = [];

      if (search) {
        whereClause += ' AND (nama LIKE ? OR nomor_hp LIKE ? OR email LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%');
      }

      if (status) {
        whereClause += ` AND status_aktif = ${status === 'active' ? 1 : 0}`;
      }

      if (service) {
        whereClause += ` AND id IN (SELECT customer_id FROM subscriptions WHERE service_type = '${service}')`;
      }

      const customers = db.query(`
        SELECT
          id, nama, nomor_hp, email, status_aktif,
          credit_balance, debt_balance, created_at, updated_at
        FROM customers
        ${whereClause}
        ORDER BY created_at DESC
      `, params);

      // Generate CSV
      const headers = ['ID', 'Nama', 'Nomor HP', 'Email', 'Status', 'Saldo', 'Hutang', 'Terdaftar'];
      const csvContent = [
        headers.join(','),
        ...customers.map(c => [
          c.id,
          `"${c.nama || ''}"`,
          c.nomor_hp || '',
          `"${c.email || ''}"`,
          c.status_aktif === 1 ? 'Aktif' : c.status_aktif === 2 ? 'Ditangguhkan' : 'Tidak Aktif',
          c.credit_balance || 0,
          c.debt_balance || 0,
          c.created_at
        ].join(','))
      ].join('\n');

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename="customers.csv"');
      return reply.send(csvContent);
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Export Customers',
        body: { search, status, service }
      });

      return sendDetailedError(reply, error, request, {
        errorTitle: 'Export Failed',
        details: { search, status, service }
      });
    }
  });

  // ============ PAYMENT LINK FUNCTIONALITY ============

  // Create payment link for customer
  fastify.post('/:id/payment-link', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const customerId = parseInt(request.params.id);
      const { amount, description, expiry_hours, payment_method } = request.body;

      // Validate customer exists
      const customer = db.getOne('customers', {'id':'customerId'});

      if (!customer) {
        return reply.code(404).json({
          success: false,
          error: 'Customer not found',
          message: `Customer with ID ${customerId} does not exist`
        });
      }

      // Validate required fields
      if (!amount || amount <= 0) {
        return reply.code(400).json({
          success: false,
          error: 'Invalid amount',
          message: 'Amount must be greater than 0'
        });
      }

      // Create payment link using PaymentService
      const PaymentService = require('../services/PaymentService');
      const paymentService = new PaymentService(fastify.db);

      const result = await paymentService.createPaymentLink({
        customerId,
        amount,
        description: description || `Payment for ${customer.nama}`,
        expiryHours,
        paymentMethod: payment_method,
        metadata: {
          created_by: request.admin.id,
          created_by_name: request.admin.username,
          customer_name: customer.nama
        }
      });

      if (result.success) {
        // Log activity
        await auth.logActivity(
          request.admin.id,
          'create_payment_link',
          'payment_link',
          result.paymentLink.id,
          {
            customer_id: customerId,
            customer_name: customer.nama,
            amount: amount,
            invoice_number: result.paymentLink.invoice_number
          },
          request
        );

        return reply.code(201).json({
          success: true,
          data: {
            payment_link: result.paymentLink,
            duitku_reference: result.duitkuReference,
            payment_url: result.paymentUrl,
            expiry_date: result.expiryDate,
            customer_name: customer.nama
          },
          message: 'Payment link created successfully'
        });
      } else {
        return reply.code(500).json({
          success: false,
          error: result.error,
          message: 'Failed to create payment link'
        });
      }

    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Create Payment Link',
        body: { customerId, amount, description, expiry_hours }
      });

      return sendDetailedError(reply, error, request, {
        errorTitle: 'Failed to Create Payment Link',
        details: { customerId, amount, description, expiry_hours }
      });
    }
  });

  // Get customer payment links
  fastify.get('/:id/payment-links', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const customerId = parseInt(request.params.id);
      const { page = 1, limit = 20, status } = request.query;

      // Validate customer exists
      const customer = db.getOne('customers', {'id':'customerId'});

      if (!customer) {
        return reply.code(404).json({
          success: false,
          error: 'Customer not found',
          message: `Customer with ID ${customerId} does not exist`
        });
      }

      // Validate pagination
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      if (isNaN(pageNum) || pageNum < 1 || isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        return reply.code(400).json({
          success: false,
          error: 'Invalid pagination parameters',
          message: 'Page must be >=1 and limit must be between 1-100'
        });
      }

      // Get payment links
      const PaymentService = require('../services/PaymentService');
      const paymentService = new PaymentService(fastify.db);

      const paymentLinks = await paymentService.getCustomerPaymentLinks(customerId, {
        limit: limitNum,
        offset: (pageNum - 1) * limitNum,
        status
      });

      // Get total count
      let totalQuery = 'SELECT COUNT(*) as count FROM payment_links WHERE customer_id = ?';
      let totalParams = [customerId];

      if (status) {
        totalQuery += ' AND status = ?';
        totalParams.push(status);
      }

      const total = fastify.db.get(totalQuery, totalParams).count;

      return reply.code(200).json({
        success: true,
        data: {
          customer: {
            id: customer.id,
            nama: customer.nama,
            nomor_hp: customer.nomor_hp,
            email: customer.email
          },
          payment_links: paymentLinks,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: total,
            pages: Math.ceil(total / limitNum)
          }
        },
        message: 'Customer payment links retrieved successfully'
      });

    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Get Customer Payment Links',
        body: { customerId, page, limit, status }
      });

      return sendDetailedError(reply, error, request, {
        errorTitle: 'Failed to Get Payment Links',
        details: { customerId, page, limit, status }
      });
    }
  });

  // Quick payment link creation (AJAX endpoint for customer details page)
  fastify.post('/:id/quick-payment', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const customerId = parseInt(request.params.id);
      const { amount, description } = request.body;

      // Validate customer exists
      const customer = db.getOne('customers', {'id':'customerId'});

      if (!customer) {
        return reply.code(404).json({
          success: false,
          error: 'Customer not found'
        });
      }

      // Validate amount
      if (!amount || amount <= 0) {
        return reply.code(400).json({
          success: false,
          error: 'Invalid amount'
        });
      }

      // Create payment link
      const PaymentService = require('../services/PaymentService');
      const paymentService = new PaymentService(fastify.db);

      const result = await paymentService.createPaymentLink({
        customerId,
        amount,
        description: description || `Quick payment for ${customer.nama}`,
        metadata: {
          created_by: request.admin.id,
          quick_payment: true
        }
      });

      if (result.success) {
        // Log activity
        await auth.logActivity(
          request.admin.id,
          'create_quick_payment',
          'payment_link',
          result.paymentLink.id,
          {
            customer_id: customerId,
            customer_name: customer.nama,
            amount: amount,
            quick_payment: true
          },
          request
        );

        return reply.code(201).json({
          success: true,
          data: {
            payment_url: result.paymentUrl,
            invoice_number: result.paymentLink.invoice_number,
            expiry_date: result.expiryDate,
            amount: result.paymentLink.amount
          },
          message: 'Quick payment link created successfully'
        });
      } else {
        return reply.code(500).json({
          success: false,
          error: result.error,
          message: 'Failed to create quick payment link'
        });
      }

    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Create Quick Payment',
        body: { customerId, amount, description }
      });

      return sendDetailedError(reply, error, request, {
        errorTitle: 'Failed to Create Quick Payment',
        details: { customerId, amount, description }
      });
    }
  });

  // Get customer payment statistics
  fastify.get('/:id/payment-stats', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const customerId = parseInt(request.params.id);

      // Validate customer exists
      const customer = db.getOne('customers', {'id':'customerId'});

      if (!customer) {
        return reply.code(404).json({
          success: false,
          error: 'Customer not found'
        });
      }

      // Get payment statistics
      const PaymentService = require('../services/PaymentService');
      const paymentService = new PaymentService(fastify.db);

      const stats = await paymentService.getStatistics({
        paymentLinkId: null // This will need to be filtered by customer
      });

      // Get customer-specific stats
      const customerStats = fastify.db.get(`
        SELECT
          COUNT(*) as total_links,
          SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_links,
          SUM(CASE WHEN status = \'active\' THEN 1 ELSE 0 END) as active_links,
          SUM(CASE WHEN status = \'expired\' THEN 1 ELSE 0 END) as expired_links,
          COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as total_paid,
          COALESCE(SUM(amount), 0) as total_amount
        FROM payment_links
        WHERE customer_id = ?
      `, [customerId]);

      // Get recent payment links
      db.query(`
        SELECT * FROM payment_links
        WHERE customer_id = ?
        ORDER BY created_date DESC
        LIMIT 5
      ', [customerId]);

      return reply.code(200).json({
        success: true,
        data: {
          customer: {
            id: customer.id,
            nama: customer.nama,
            nomor_hp: customer.nomor_hp
          },
          statistics: customerStats || {
            total_links: 0,
            paid_links: 0,
            active_links: 0,
            expired_links: 0,
            total_paid: 0,
            total_amount: 0
          },
          recent_links: recentLinks || []
        },
        message: 'Customer payment statistics retrieved successfully'
      });

    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Get Customer Payment Statistics',
        body: { customerId }
      });

      return sendDetailedError(reply, error, request, {
        errorTitle: 'Failed to Get Payment Statistics',
        details: { customerId }
      });
    }
  });
}

module.exports = customerRoutes;