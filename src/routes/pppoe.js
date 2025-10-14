const { v4: uuidv4 } = require('uuid');
const AuthMiddleware = require('../middleware/auth');
const { db } = require('../database/DatabaseManager');

// Helper functions for detailed error handling
function logDetailedError(fastify, error, request, context = {}) {
  fastify.log.error(`${context.operation || 'PPPoE API Error'}:`, {
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

function sendDetailedError(reply, error, request, context = {}) {
  return reply.code(500).send({
    success: false,
    error: context.errorTitle || 'PPPoE Operation Failed',
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

async function pppoeRoutes(fastify, options) {
  const auth = new AuthMiddleware(fastify);

  // PPPoE users list
  fastify.get('/', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const page = parseInt(request.query.page) || 1;
      const limit = 20;
      const offset = (page - 1) * limit;
      const search = request.query.search || '';
      const status = request.query.status || '';
      const customerId = request.query.customer_id || '';

      let whereClause = 'WHERE 1=1';
      const params = [];
      let paramIndex = 0;

      if (search) {
        whereClause += ' AND (p.username LIKE $1 OR p.password LIKE $2 OR c.name LIKE $3)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        paramIndex = 3;
      }

      if (status === 'active') {
        whereClause += " AND p.status = 'active'";
      } else if (status === 'disabled') {
        whereClause += " AND p.status = 'disabled'";
      }

      if (customerId) {
        whereClause += ` AND p.customer_id = $${paramIndex + 1}`;
        params.push(customerId);
        paramIndex++;
      }

      const users = await db.query(`
        SELECT p.*, c.name as customer_name, c.phone as customer_phone,
               pr.name as profile_name, pr.duration_hours, pr.selling_price, pr.cost_price
        FROM pppoe_users p
        LEFT JOIN customers c ON p.customer_id = c.id
        LEFT JOIN profiles pr ON p.profile_id = pr.id
        ${whereClause}
        ORDER BY p.created_at DESC
        LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
      `, [...params, limit, offset]);

      const totalResult = await db.query(`
        SELECT COUNT(*) as count FROM pppoe_users p
        ${whereClause}
      `, params);
      const total = totalResult.rows && totalResult.rows.length > 0 ? totalResult.rows[0].count : 0;

      // Get real-time status from Mikrotik
      let mikrotikStatus = {};
      try {
        const mikrotikUsers = await fastify.mikrotik.getPPPoESecrets();
        const activeSessions = await fastify.mikrotik.getPPPoEActive();

        mikrotikUsers.forEach(user => {
          mikrotikStatus[user.name] = {
            disabled: user.disabled === true,
            uptime: user.uptime,
            bytesIn: user['bytes-in'],
            bytesOut: user['bytes-out'],
            activeSession: activeSessions.find(s => s.name === user.name)
          };
        });
      } catch (error) {
        console.error('Error getting Mikrotik status:', error);
      }

      // Get profiles for filter dropdown
      const profilesResult = await db.query(`
        SELECT id, name, selling_price, duration_hours
        FROM profiles
        WHERE profile_type = 'pppoe'
        ORDER BY name
      `);

      return reply.view('pppoe/index', {
        admin: request.admin,
        users: users.rows,
        mikrotikStatus,
        profiles: profilesResult.rows,
        pagination: {
          current: page,
          total: Math.ceil(total / limit),
          from: offset + 1,
          to: Math.min(offset + limit, total),
          total
        },
        search,
        status,
        customerId
      });
    } catch (error) {
      logDetailedError(fastify, error, request, { operation: 'PPPoE User List' });
      return sendDetailedError(reply, error, request, { errorTitle: 'Failed to load PPPoE users' });
    }
  });

  // Create PPPoE user form
  fastify.get('/create', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    try {
      // Get customers
      const customersResult = await db.query(
        'SELECT id, name, phone FROM customers WHERE is_active = true ORDER BY name'
      );

      // Get profiles from different sources with fallback
      let profiles = [];
      let localProfiles = [];

      try {
        // Try to get PPP profiles from Mikrotik first
        const mikrotikProfiles = await fastify.mikrotik.getPPPProfiles();
        console.log('Mikrotik PPP profiles:', mikrotikProfiles);

        // Filter profiles with system comment
        profiles = mikrotikProfiles.filter(p => p.comment && p.comment.includes('PPPOE_SYSTEM'));
        console.log('Filtered system profiles:', profiles);
      } catch (error) {
        console.warn('Error getting Mikrotik PPP profiles:', error.message);
      }

      // Fallback to local database profiles if no Mikrotik profiles found
      if (profiles.length === 0) {
        try {
          const localProfilesResult = await db.query(`
            SELECT * FROM profiles
            WHERE profile_type = 'pppoe'
            ORDER BY name
          `);
          console.log('Local database profiles:', localProfilesResult.rows);

          // Convert local profiles to match template expectations
          profiles = localProfilesResult.rows.map(p => ({
            name: p.name,
            id: p.id,
            price_sell: p.selling_price,
            price_cost: p.cost_price,
            duration_days: Math.floor((p.duration_hours || 720) / 24) || 30,
            comment: p.mikrotik_comment || `PPPOE_SYSTEM|${p.selling_price}|${p.cost_price}|${Math.floor((p.duration_hours || 720) / 24) || 30}`
          }));
        } catch (error) {
          console.warn('Error getting local profiles:', error.message);
        }
      }

      console.log('Final profiles for template:', profiles);

      return reply.view('pppoe/create', {
        admin: request.admin,
        customers: customersResult.rows,
        profiles,
        localProfiles,
        formatCurrency: (amount) => {
          return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
          }).format(amount || 0);
        }
      });
    } catch (error) {
      logDetailedError(fastify, error, request, { operation: 'Create PPPoE Form' });
      return reply.view('pppoe/create', {
        admin: request.admin,
        customers: [],
        profiles: [],
        localProfiles: [],
        formatCurrency: (amount) => {
          return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
          }).format(amount || 0);
        },
        error: 'Failed to load data'
      });
    }
  });

  // Create PPPoE user
  fastify.post('/', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {

    const { customer_id, profile_id, username, password, start_date, duration_days, custom_price_sell, custom_price_cost } = request.body;

    try {
      // Validate customer exists
      const customerResult = await db.query(
        'SELECT * FROM customers WHERE id = $1',
        [customer_id]
      );

      if (!customerResult.rows || customerResult.rows.length === 0) {
        return reply.view('pppoe/create', {
          admin: request.admin,
          customers: [],
          profiles: [],
          localProfiles: [],
          formatCurrency: (amount) => {
            return new Intl.NumberFormat('id-ID', {
              style: 'currency',
              currency: 'IDR',
              minimumFractionDigits: 0
            }).format(amount || 0);
          },
          error: 'Customer not found'
        });
      }
      const customer = customerResult.rows[0];

      // Get profile details
      const profileResult = await db.query(
        'SELECT * FROM profiles WHERE id = $1',
        [profile_id]
      );

      if (!profileResult.rows || profileResult.rows.length === 0) {
        return reply.view('pppoe/create', {
          admin: request.admin,
          customers: [],
          profiles: [],
          localProfiles: [],
          formatCurrency: (amount) => {
            return new Intl.NumberFormat('id-ID', {
              style: 'currency',
              currency: 'IDR',
              minimumFractionDigits: 0
            }).format(amount || 0);
          },
          error: 'Profile not found'
        });
      }
      const profile = profileResult.rows[0];

      // Generate username if not provided
      const finalUsername = username || generatePPPoEUsername(customer.name);
      const finalPassword = password || generatePPPoEPassword();

      // Calculate expiry date
      const startDate = start_date ? new Date(start_date) : new Date();
      const duration = duration_days || Math.floor((profile.duration_hours || 720) / 24) || 30;
      const expiryDate = new Date(startDate);
      expiryDate.setDate(expiryDate.getDate() + duration);

      // Calculate pricing
      const priceSell = custom_price_sell || profile.selling_price;
      const priceCost = custom_price_cost || profile.cost_price;

      // Create PPPoE user in database
      const insertResult = await db.query(`
        INSERT INTO pppoe_users (customer_id, profile_id, username, password, status, expires_at, mikrotik_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [
        customer_id,
        profile_id,
        finalUsername,
        finalPassword,
        'active',
        expiryDate.toISOString().split('T')[0],
        finalUsername
      ]);

      const userId = insertResult.rows && insertResult.rows.length > 0 ? insertResult.rows[0].id : null;

      // Create PPP secret in Mikrotik
      const commentData = {
        system: 'pppoe',
        customer_id: customer_id,
        price_sell: priceSell,
        price_cost: priceCost,
        expiry_date: expiryDate.toISOString().split('T')[0],
        subscription_type: 'subscription',
        created_by_system: true,
        created_by: request.admin.username,
        customer_name: customer.name,
        customer_phone: customer.phone
      };

      try {
        const mikrotikUser = await fastify.mikrotik.createPPPoESecret({
          username: finalUsername,
          password: finalPassword,
          profile: profile.mikrotik_name,
          comment: commentData
        });

        // Update with Mikrotik reference
        await db.query(
          'UPDATE pppoe_users SET mikrotik_name = $1 WHERE id = $2',
          [mikrotikUser?.ret || finalUsername, userId]
        );

      } catch (error) {
        console.error('Failed to create Mikrotik PPPoE user:', error);
      }

      // Log activity
      if (userId) {
        await auth.logActivity(
          request.admin.id,
          'create_pppoe_user',
          'pppoe_user',
          userId,
          {
            username: finalUsername,
            customer_id: customer_id,
            profile_id: profile_id,
            expiry_date: expiryDate.toISOString().split('T')[0]
          }, 'request');
      }

      // Send notification to customer
      if (customer.phone) {
        const whatsappService = fastify.whatsappService;
        await whatsappService.sendNotification(customer_id, 'pppoe_created', {
          customer_name: customer.name,
          username: finalUsername,
          password: finalPassword,
          expiry_date: expiryDate.toLocaleDateString('id-ID'),
          profile: profile.name
        });
      }

      // Log transaction
      try {
        await db.query(`
          INSERT INTO transaction_logs (customer_id, type, description, amount)
          VALUES ($1, $2, $3, $4)
        `, [
          customer_id,
          'pppoe_created',
          `PPPoE user created: ${finalUsername}`,
          priceSell
        ]);
      } catch (error) {
        console.error('Failed to log transaction:', error);
      }

      return reply.redirect('/pppoe?success=PPPoE user created successfully');
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Create PPPoE User',
        body: request.body
      });
      return reply.view('pppoe/create', {
        admin: request.admin,
        customers: [],
        profiles: [],
        localProfiles: [],
        formatCurrency: (amount) => {
          return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
          }).format(amount || 0);
        },
        error: 'Failed to create PPPoE user'
      });
    }
  });

  // Batch create PPPoE users
  fastify.post('/batch', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    const { customer_id, profile_id, quantity, prefix, start_date, duration_days } = request.body;

    try {
      // Validate customer exists
      const customerResult = await db.query(
        'SELECT * FROM customers WHERE id = $1',
        [customer_id]
      );

      if (!customerResult.rows || customerResult.rows.length === 0) {
        return reply.code(400).send('Customer not found');
      }
      const customer = customerResult.rows[0];

      // Get profile details
      const profileResult = await db.query(
        'SELECT * FROM profiles WHERE id = $1',
        [profile_id]
      );

      if (!profileResult.rows || profileResult.rows.length === 0) {
        return reply.code(400).send('Profile not found');
      }
      const profile = profileResult.rows[0];

      // Calculate dates
      const startDate = start_date ? new Date(start_date) : new Date();
      const duration = duration_days || Math.floor((profile.duration_hours || 720) / 24) || 30;
      const expiryDate = new Date(startDate);
      expiryDate.setDate(expiryDate.getDate() + duration);

      const createdUsers = [];

      for (let i = 0; i < quantity; i++) {
        const username = prefix ? `${prefix}${i + 1}` : generatePPPoEUsername(customer.name, i + 1);
        const password = generatePPPoEPassword();

        // Create in database
        const insertResult = await db.query(`
          INSERT INTO pppoe_users (customer_id, profile_id, username, password, status, expires_at, mikrotik_name)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `, [
          customer_id,
          profile_id,
          username,
          password,
          'active',
          expiryDate.toISOString().split('T')[0],
          username
        ]);
        const result = { id: insertResult.rows && insertResult.rows.length > 0 ? insertResult.rows[0].id : null };

        // Create in Mikrotik
        const commentData = {
          system: 'pppoe',
          customer_id: customer_id,
          price_sell: profile.selling_price,
          price_cost: profile.cost_price,
          expiry_date: expiryDate.toISOString().split('T')[0],
          subscription_type: 'subscription',
          created_by_system: true,
          created_by: request.admin.username,
          batch_index: i + 1
        };

        try {
          await fastify.mikrotik.createPPPoESecret({
            username: username,
            password: password,
            profile: profile.mikrotik_name,
            comment: commentData
          });
        } catch (error) {
          console.error(`Failed to create Mikrotik user ${username}:`, error);
        }

        createdUsers.push({
          username,
          password,
          expiry_date: expiryDate.toISOString().split('T')[0]
        });
      }

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'create_pppoe_batch',
        'pppoe_batch',
        null,
        {
          customer_id: customer_id,
          profile_id: profile_id,
          quantity,
          created_users: createdUsers.length
        }, 'request');

      return reply.send({
        success: true,
        created_users: createdUsers,
        total_cost: profile.cost_price * quantity,
        total_revenue: profile.selling_price * quantity
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send('Internal Server Error');
    }
  });

  // PPPoE user details
  fastify.get('/:id', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    try {
      const userResult = await db.query(`
        SELECT p.*, c.name as customer_name, c.phone as customer_phone,
               pr.name as profile_name, pr.duration_hours
        FROM pppoe_users p
        LEFT JOIN customers c ON p.customer_id = c.id
        LEFT JOIN profiles pr ON p.profile_id = pr.id
        WHERE p.id = $1
      `, [request.params.id]);

      if (!userResult.rows || userResult.rows.length === 0) {
        return reply.code(404).send('PPPoE user not found');
      }
      const user = userResult.rows[0];

      // Get Mikrotik user info
      let mikrotikUser = null;
      let activeSession = null;
      try {
        const mikrotikUsers = await fastify.mikrotik.getPPPoESecrets();
        mikrotikUser = mikrotikUsers.find(u => u.name === user.username);

        if (mikrotikUser) {
          const activeSessions = await fastify.mikrotik.getPPPoEActive();
          activeSession = activeSessions.find(s => s.name === user.username);
        }
      } catch (error) {
        console.error('Error getting Mikrotik user info:', error);
      }

      // Get usage statistics
      const totalSessionsResult = await db.query('SELECT COUNT(*) as count FROM pppoe_usage_logs WHERE pppoe_user_id = $1', [request.params.id]);
      const totalDataUsedResult = await db.query('SELECT COALESCE(SUM(bytes_in + bytes_out), 0) as total FROM pppoe_usage_logs WHERE pppoe_user_id = $1', [request.params.id]);
      const lastSessionResult = await db.query(`
        SELECT * FROM pppoe_usage_logs
        WHERE pppoe_user_id = $1
        ORDER BY session_end DESC
        LIMIT 1
      `, [request.params.id]);

      const stats = {
        totalSessions: totalSessionsResult.rows && totalSessionsResult.rows.length > 0 ? totalSessionsResult.rows[0].count : 0,
        totalDataUsed: totalDataUsedResult.rows && totalDataUsedResult.rows.length > 0 ? totalDataUsedResult.rows[0].total : 0,
        lastSession: lastSessionResult.rows && lastSessionResult.rows.length > 0 ? lastSessionResult.rows[0] : null
      };

      return reply.view('pppoe/show', {
        admin: request.admin,
        user,
        mikrotikUser,
        activeSession,
        stats
      });
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Get PPPoE User Details',
        userId: request.params.id
      });
      return sendDetailedError(reply, error, request, { errorTitle: 'Failed to load PPPoE user details' });
    }
  });

  // Update PPPoE user
  fastify.post('/:id', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    const { status, expiry_date, profile_id } = request.body;

    try {
      const userResult = await db.query(
        'SELECT * FROM pppoe_users WHERE id = $1',
        [request.params.id]
      );

      if (!userResult.rows || userResult.rows.length === 0) {
        return reply.code(404).send('PPPoE user not found');
      }
      const user = userResult.rows[0];

      // Update in database
      await db.query(
        'UPDATE pppoe_users SET status = $1 WHERE id = $2',
        [status, request.params.id]
      );

      // Update in Mikrotik
      try {
        const updates = {};
        if (status === 'disabled') {
          updates.disabled = 'yes';
        } else if (status === 'active') {
          updates.disabled = 'no';
        }

        if (profile_id && profile_id !== user.profile_id) {
          const newProfileResult = await db.query('SELECT mikrotik_name FROM profiles WHERE id = $1', [profile_id]);
          if (newProfileResult.rows && newProfileResult.rows.length > 0) {
            updates.profile = newProfileResult.rows[0].mikrotik_name;
          }
        }

        if (Object.keys(updates).length > 0) {
          await fastify.mikrotik.updatePPPoESecret(user.username, updates);
        }
      } catch (error) {
        console.error('Error updating Mikrotik user:', error);
      }

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'update_pppoe_user',
        'pppoe_user',
        request.params.id,
        { old_status: user.status, new_status: status, expiry_date }, request
      );

      return reply.redirect(`/pppoe/${request.params.id}?success=PPPoE user updated successfully`);
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Update PPPoE User',
        userId: request.params.id,
        body: request.body
      });
      return reply.redirect(`/pppoe/${request.params.id}?error=Failed to update PPPoE user`);
    }
  });

  // Renew PPPoE user
  fastify.post('/:id/renew', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    const { additional_days, method, amount } = request.body;

    try {
      const userResult = await db.query(`
        SELECT p.*, c.name as customer_name, c.phone
        FROM pppoe_users p
        JOIN customers c ON p.customer_id = c.id
        WHERE p.id = $1
      `, [request.params.id]);

      if (!userResult.rows || userResult.rows.length === 0) {
        return reply.code(404).send('PPPoE user not found');
      }
      const user = userResult.rows[0];

      // Calculate new expiry date
      const currentExpiry = new Date(user.expiry_date);
      const newExpiry = new Date(currentExpiry);
      newExpiry.setDate(newExpiry.getDate() + parseInt(additional_days));

      // Update in database
      await db.update('pppoe_users',
        {
          expiry_date: newExpiry.toISOString().split('T')[0],
          status: 'active',
          updated_at: new Date()
        },
        { id: request.params.id }
      );

      // Update in Mikrotik
      try {
        const mikrotikUsers = await fastify.mikrotik.getPPPoESecrets();
        const mikrotikUser = mikrotikUsers.find(u => u.name === user.username);

        if (mikrotikUser) {
          const commentData = fastify.mikrotik.parseComment(mikrotikUser.comment) || {};
          commentData.expiry_date = newExpiry.toISOString().split('T')[0];
          commentData.renewed_by = request.admin.username;
          commentData.renewed_date = new Date().toISOString().split('T')[0];

          await fastify.mikrotik.updatePPPoESecret(user.username, {
            comment: fastify.mikrotik.formatComment(commentData),
            disabled: 'no'
          });
        }
      } catch (error) {
        console.error('Error updating Mikrotik user:', error);
      }

      // Record payment
      if (amount && method) {
        await db.insert('payments', {
          customer_id: user.customer_id,
          amount,
          method,
          status: 'paid',
          description: `PPPoE renewal: ${user.username}`
        });

        // Log transaction
        await db.insert('transaction_logs', {
          customer_id: user.customer_id,
          type: 'payment',
          description: `PPPoE renewal payment: ${user.username}`,
          amount
        });
      }

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'renew_pppoe_user',
        'pppoe_user',
        request.params.id,
        {
          username: user.username,
          additional_days,
          new_expiry_date: newExpiry.toISOString().split('T')[0],
          method,
          amount
        }, 'request');

      // Send notification
      if (user.phone) {
        const whatsappService = fastify.whatsappService;
        await whatsappService.sendNotification(user.customer_id, 'pppoe_renewed', {
          customer_name: user.customer_name,
          username: user.username,
          new_expiry_date: newExpiry.toLocaleDateString('id-ID'),
          additional_days
        });
      }

      return reply.redirect(`/pppoe/${request.params.id}?success=PPPoE user renewed successfully`);
    } catch (error) {
      fastify.log.error(error);
      return reply.redirect(`/pppoe/${request.params.id}?error=Failed to renew PPPoE user`);
    }
  });

  // Reset PPPoE user password
  fastify.post('/:id/reset-password', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    try {
      const userResult = await db.query(`
        SELECT p.*, c.name as customer_name, c.phone
        FROM pppoe_users p
        JOIN customers c ON p.customer_id = c.id
        WHERE p.id = $1
      `, [request.params.id]);

      if (!userResult.rows || userResult.rows.length === 0) {
        return reply.code(404).send('PPPoE user not found');
      }
      const user = userResult.rows[0];

      const newPassword = generatePPPoEPassword();

      // Update in database
      await db.query('UPDATE pppoe_users SET password = $1 WHERE id = $2', [newPassword, request.params.id]);

      // Update in Mikrotik
      try {
        await fastify.mikrotik.updatePPPoESecret(user.username, {
          password: newPassword
        });
      } catch (error) {
        console.error('Error updating Mikrotik password:', error);
      }

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'reset_pppoe_password',
        'pppoe_user',
        request.params.id,
        { username: user.username }, request
      );

      // Send notification with new password
      if (user.phone) {
        const whatsappService = fastify.whatsappService;
        await whatsappService.sendNotification(user.customer_id, 'pppoe_password_reset', {
          customer_name: user.customer_name,
          username: user.username,
          new_password: newPassword
        });
      }

      return reply.redirect(`/pppoe/${request.params.id}?success=Password reset successfully`);
    } catch (error) {
      fastify.log.error(error);
      return reply.redirect(`/pppoe/${request.params.id}?error=Failed to reset password`);
    }
  });

  // Delete PPPoE user
  fastify.delete('/:id', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    try {
      const userResult = await db.query(
        'SELECT * FROM pppoe_users WHERE id = $1',
        [request.params.id]
      );

      if (!userResult.rows || userResult.rows.length === 0) {
        return reply.code(404).send('PPPoE user not found');
      }
      const user = userResult.rows[0];

      // Delete from Mikrotik
      try {
        await fastify.mikrotik.deletePPPoESecret(user.username);
      } catch (error) {
        console.error('Error deleting from Mikrotik:', error);
      }

      // Delete from database
      await db.query('DELETE FROM pppoe_users WHERE id = $1', [request.params.id]);

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'delete_pppoe_user',
        'pppoe_user',
        request.params.id,
        { username: user.username }, request
      );

      return reply.send({ success: true });
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Delete PPPoE User',
        userId: request.params.id
      });
      return reply.code(500).send({
        success: false,
        error: 'Failed to delete PPPoE user',
        details: {
          message: error.message,
          type: error.constructor.name
        }
      });
    }
  });

  // API endpoint for getting PPPoE users
  fastify.get('/api/pppoe', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    try {
      const page = parseInt(request.query.page) || 1;
      const limit = parseInt(request.query.page_size) || 20;
      const offset = (page - 1) * limit;
      const search = request.query.search || ''
      const status = request.query.status || ''
      const customerId = request.query.customer_id || ''
      const sync = request.query.sync === true;

      let whereClause = 'WHERE 1=1';
      const params = [];
      let paramIndex = 0;

      if (search) {
        whereClause += ' AND (p.username LIKE $1 OR p.password LIKE $2 OR c.name LIKE $3)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        paramIndex = 3;
      }

      if (status === 'active') {
        whereClause += " AND p.status = 'active'";
      } else if (status === 'disabled') {
        whereClause += " AND p.status = 'disabled'";
      } else if (status === 'expired') {
        whereClause += " AND p.status = 'expired'";
      }

      if (customerId) {
        whereClause += ` AND p.customer_id = $${paramIndex + 1}`;
        params.push(customerId);
        paramIndex++;
      }
      const users = await db.query(`
        SELECT p.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email,
               pr.name as profile_name, pr.duration_hours, pr.selling_price, pr.cost_price
        FROM pppoe_users p
        LEFT JOIN customers c ON p.customer_id = c.id
        LEFT JOIN profiles pr ON p.profile_id = pr.id
        ${whereClause}
        ORDER BY p.created_at DESC
        LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
      `, [...params, limit, offset]);

      const totalResult = await db.query(`
        SELECT COUNT(*) as count FROM pppoe_users p
        ${whereClause}
      `, params);
      const total = totalResult.rows && totalResult.rows.length > 0 ? totalResult.rows[0].count : 0;

      // Get real-time status from Mikrotik if sync is requested
      let mikrotikStatus = {};
      if (sync) {
        try {
          const mikrotikUsers = await fastify.mikrotik.getPPPoESecrets();
          const activeSessions = await fastify.mikrotik.getPPPoEActive();

          mikrotikUsers.forEach(user => {
            mikrotikStatus[user.name] = {
              disabled: user.disabled === true,
              uptime: user.uptime,
              bytesIn: user['bytes-in'],
              bytesOut: user['bytes-out'],
              activeSession: activeSessions.find(s => s.name === user.name)
            };
          });
        } catch (error) {
          console.error('Error getting Mikrotik status:', error);
        }
      }

      // Calculate statistics
      const statsResult = await db.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
          COUNT(CASE WHEN status = 'expired' THEN 1 END) as expired,
          COUNT(*) as synced
        FROM pppoe_users
      `);
      const stats = statsResult.rows && statsResult.rows.length > 0 ? statsResult.rows[0] : { total: 0, active: 0, expired: 0, synced: 0 };

      // Update sync status if Mikrotik status available
      if (sync && Object.keys(mikrotikStatus).length > 0) {
        for (const user of users) {
          const mikrotikInfo = mikrotikStatus[user.username];
          if (mikrotikInfo) {
            // Update sync status in database
            await db.query('UPDATE pppoe_users SET status = $1 WHERE id = $2', [mikrotikInfo.disabled === true ? 'disabled' : 'active', user.id]);

            user.is_online = !!mikrotikInfo.activeSession;
          } else {
            user.is_online = false;
          }
        }
      }

      const pppoe_users = users.rows.map(user => ({
        ...user,
        is_online: Boolean(user.is_online)
      }));

      // Get profiles for filter dropdown
      const profilesResult = await db.query(`
        SELECT id, name, selling_price, duration_hours
        FROM profiles
        WHERE profile_type = 'pppoe'
        ORDER BY name
      `);

      const pagination = {
        page,
        total_pages: Math.ceil(total / limit),
        from: offset + 1,
        to: Math.min(offset + limit, total),
        total
      };

      return reply.send({
        success: true,
        pppoe_users,
        pagination,
        statistics: {
          total: stats.total,
          active: stats.active,
          expired: stats.expired,
          online: pppoe_users.filter(u => u.is_online).length,
          synced: stats.synced
        },
        mikrotikStatus,
        profiles: profilesResult.rows
      });
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Get PPPoE Users API',
        query: request.query
      });
      return sendDetailedError(reply, error, request, { errorTitle: 'Failed to get PPPoE users' });
    }
  });

  // API endpoint for PPPoE statistics
  fastify.get('/api/statistics', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    try {
      const statsResult = await db.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
          COUNT(CASE WHEN status = 'expired' THEN 1 END) as expired
        FROM pppoe_users
      `);

      const stats = statsResult.rows && statsResult.rows.length > 0 ? statsResult.rows[0] : { total: 0, active: 0, expired: 0 };

      // Get online count from Mikrotik
      let online = 0;
      try {
        const activeSessions = await fastify.mikrotik.getPPPoEActive();
        online = activeSessions.length;
      } catch (error) {
        console.error('Error getting online count:', error);
      }

      return reply.send({
        total: stats.total,
        active: stats.active,
        expired: stats.expired,
        online: online
      });
    } catch (error) {
      fastify.log.error('Error getting PPPoE statistics:', error);
      return reply.code(500).send({
        error: 'Failed to get statistics'
      });
    }
  });

  // API endpoint for creating PPPoE users
  fastify.post('/api/pppoe', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    const { customer_id, profile_id, username, password, start_date, duration, price_sell, price_cost, notes } = request.body;

    try {
      // Validate required fields
      if (!customer_id || !profile_id || !username || !password) {
        return reply.code(400).send({
          error: 'Customer, profile, username, and password are required'
        });
      }

      // Validate customer exists
      const customerResult = await db.query(
        'SELECT * FROM customers WHERE id = $1',
        [customer_id]
      );
      if (!customerResult.rows || customerResult.rows.length === 0) {
        return reply.code(404).send({
          error: 'Customer not found'
        });
      }
      const customer = customerResult.rows[0];

      // Get profile details
      const profileResult = await db.query(
        'SELECT * FROM profiles WHERE id = $1',
        [profile_id]
      );
      if (!profileResult.rows || profileResult.rows.length === 0) {
        return reply.code(404).send({
          error: 'Profile not found'
        });
      }
      const profile = profileResult.rows[0];

      // Check if username already exists
      const existingUserResult = await db.query(
        'SELECT id FROM pppoe_users WHERE username = $1',
        [username]
      );
      if (existingUserResult.rows && existingUserResult.rows.length > 0) {
        return reply.code(400).send({
          error: 'Username already exists'
        });
      }

      // Calculate dates
      const startDate = start_date ? new Date(start_date) : new Date();
      const duration_days = duration || Math.floor((profile.duration_hours || 720) / 24) || 30;
      const expiryDate = new Date(startDate);
      expiryDate.setDate(expiryDate.getDate() + parseInt(duration_days));

      // Create in database
      const insertResult = await db.query(`
        INSERT INTO pppoe_users (customer_id, profile_id, username, password, status, expires_at, mikrotik_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [
        customer_id,
        profile_id,
        username,
        password,
        'active',
        expiryDate.toISOString().split('T')[0],
        username
      ]);

      const userId = insertResult.rows && insertResult.rows.length > 0 ? insertResult.rows[0].id : null;

      // Create in Mikrotik
      try {
        const mikrotikProfile = profile.mikrotik_name || profile.name;
        const commentData = {
          system: 'pppoe',
          customer_id: customer_id,
          customer_name: customer.name,
          price_sell: price_sell || profile.selling_price,
          price_cost: price_cost || profile.cost_price,
          expiry_date: expiryDate.toISOString().split('T')[0],
          created_by: request.admin.username,
          created_date: new Date().toISOString()
        };

        await fastify.mikrotik.createPPPoESecret({
          username: username,
          password: password,
          profile: mikrotikProfile,
          comment: commentData
        });
      } catch (error) {
        console.error('Error creating Mikrotik PPPoE secret:', error);
        // Continue even if Mikrotik creation fails
      }

      // Get created user
      const createdUserResult = await db.query(`
        SELECT p.*, c.name as customer_name
        FROM pppoe_users p
        JOIN customers c ON p.customer_id = c.id
        WHERE p.id = $1
      `, [userId]);

      const createdUser = createdUserResult.rows && createdUserResult.rows.length > 0 ? createdUserResult.rows[0] : null;

      // Log activity
      if (userId) {
        await auth.logActivity(
          request.admin.id,
          'create_pppoe_user',
          'pppoe_user',
          userId,
          {
            username,
            customer_id,
            profile_id,
            price_sell: price_sell || profile.selling_price,
            price_cost: price_cost || profile.cost_price
          }, 'request');
      }

      return reply.code(201).send({
        success: true,
        username: createdUser?.username || username,
        password: createdUser?.password || password,
        customer_name: createdUser?.customer_name || customer.name,
        expiry_date: createdUser?.expiry_date || expiryDate.toISOString().split('T')[0],
        message: 'PPPoE user created successfully'
      });

    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Create PPPoE User API',
        body: request.body
      });
      return reply.code(500).send({
        error: 'Failed to create PPPoE user',
        details: {
          message: error.message,
          type: error.constructor.name
        }
      });
    }
  });
}

// Helper functions
function generatePPPoEUsername(customerName, index = 1) {
  const cleanName = customerName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const timestamp = Date.now().toString().slice(-4);
  return `${cleanName}${timestamp}${index}`;
}

function generatePPPoEPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

module.exports = pppoeRoutes;