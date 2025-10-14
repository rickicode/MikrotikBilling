const { v4: uuidv4 } = require('uuid');
const AuthMiddleware = require('../middleware/auth');
const { db } = require('../database/DatabaseManager');
const MikrotikClient = require('../services/MikrotikClient');

// Helper functions for detailed error handling
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

async function voucherRoutes(fastify, options) {
  const auth = new AuthMiddleware(fastify);

  // Voucher list
  fastify.get('/', {
    preHandler: [auth.requireRole(['admin', 'superadmin'])]
  }, async (request, reply) => {
    try {
      const page = parseInt(request.query.page) || 1;
      const limit = 20;
      const offset = (page - 1) * limit;
      const search = request.query.search || '';
      const status = request.query.status || '';
      const batchId = request.query.batch_id || '';
      const vendorId = request.query.vendor_id || '';

      let whereClause = 'WHERE 1=1';
      const params = [];

      if (search) {
        whereClause += ' AND (v.code LIKE $1 OR v.batch_id LIKE $2)';
        params.push(`%${search}%`, `%${search}%`);
      }

      if (status) {
        whereClause += ` AND v.status = $${params.length + 1}`;
        params.push(status);
      }

      if (batchId) {
        whereClause += ` AND v.batch_id = $${params.length + 1}`;
        params.push(batchId);
      }

      if (vendorId) {
        whereClause += ` AND v.vendor_id = $${params.length + 1}`;
        params.push(vendorId);
      }

      const vouchersResult = await db.query(`
        SELECT v.*, p.name as profile_name,
               NULL as batch_quantity, NULL as batch_created_at,
               NULL as created_by_username,
               vd.name as vendor_name
        FROM vouchers v
        JOIN profiles p ON v.profile_id = p.id
        LEFT JOIN vendors vd ON v.vendor_id = vd.id
        ${whereClause}
        ORDER BY v.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `, [...params, limit, offset]);
      const vouchers = vouchersResult.rows || [];

      const totalResult = await db.query(`
        SELECT COUNT(*) as count FROM vouchers v
        LEFT JOIN vendors vd ON v.vendor_id = vd.id
        ${whereClause}
      `, params);
      const total = totalResult.rows && totalResult.rows.length > 0 ? parseInt(totalResult.rows[0].count) : 0;

      // Get unique batches for filter - using voucher data directly since batch table doesn't exist
      const batchesResult = await db.query(`
        SELECT DISTINCT v.batch_id, MAX(v.created_at) as created_at, p.name as profile_name,
               COUNT(*) as quantity, NULL as created_by_username
        FROM vouchers v
        JOIN profiles p ON v.profile_id = p.id
        GROUP BY v.batch_id, p.name
        ORDER BY created_at DESC
        LIMIT 50
      `);
      const batches = batchesResult.rows || [];

      // Get profiles for filter dropdown
      const profilesResult = await db.query(`
        SELECT id, name, selling_price
        FROM profiles
        WHERE profile_type = 'hotspot'
        ORDER BY name
      `);
      const profiles = profilesResult.rows || [];

      // Get vendors for filter dropdown
      const vendorsResult = await db.query(`
        SELECT id, name, contact_person
        FROM vendors
        ORDER BY name
      `);
      const vendors = vendorsResult.rows || [];

      return reply.view('vouchers/index', {
        admin: request.admin,
        vouchers,
        batches,
        profiles,
        vendors,
        pagination: {
          current: page,
          total: Math.ceil(total / limit),
          from: offset + 1,
          to: Math.min(offset + limit, total),
          total
        },
        search,
        status,
        batchId,
        vendorId
      });
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Get Voucher List',
        errorTitle: 'Failed to Load Vouchers'
      });
      return sendDetailedError(reply, error, request, {
        errorTitle: 'Failed to Load Vouchers',
        details: {
          query_section: 'voucher_list_loading'
        }
      });
    }
  });

  // Create voucher form
  fastify.get('/create', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    try {
      // Get local hotspot profiles from database
      const profilesResult = await db.query(`
        SELECT id, name, profile_type, selling_price, cost_price, duration_hours, speed_limit, data_limit, is_active, mikrotik_name
        FROM profiles
        WHERE profile_type = 'hotspot'
        ORDER BY name
      `);
      const profiles = profilesResult.rows || [];

      // Get vendors from database
      const vendorsResult = await db.query(`
        SELECT id, name, contact_person, phone
        FROM vendors
        ORDER BY name
      `);
      const vendors = vendorsResult.rows || [];

      return reply.view('vouchers/create', {
        admin: request.admin,
        profiles: profiles,
        vendors: vendors,
        formatCurrency: (amount) => {
          return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
          }).format(amount || 0);
        }
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.view('vouchers/create', {
        admin: request.admin,
        profiles: [],
        vendors: [],
        formatCurrency: (amount) => 'Rp 0',
        error: 'Failed to load profiles'
      });
    }
  });

  // Generate vouchers
  fastify.post('/', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    const { profile_id, vendor_id, quantity, prefix, price_sell, price_cost, code_length, duration_days, duration_hours, duration_minutes } = request.body;

    try {
      // Get profile details
      const profileResult = await db.query(
'SELECT * FROM profiles WHERE id = $1',
        [profile_id]
);
      const profile = profileResult.rows && profileResult.rows.length > 0 ? profileResult.rows[0] : null;

      if (!profile) {
        return reply.view('vouchers/create', {
          admin: request.admin,
          error: 'Profile not found'
        });
      }

      // Generate batch ID
      const batchId = `VC-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

      // Calculate totals
      const priceSell = price_sell || profile.price_sell;
      const priceCost = price_cost || profile.price_cost;
      const totalCost = priceCost * quantity;
      const totalRevenue = priceSell * quantity;

      // Create batch record - using batchId directly since voucher_batches table doesn't exist
      const batchResult = batchId;

      // Generate voucher codes
      const vouchers = [];
      const finalDurationDays = duration_days; // Duration must come from form, NOT from profile
      const createdDate = new Date();

      for (let i = 0; i < quantity; i++) {
        const voucherCode = generateVoucherCode(prefix, i + 1, code_length, request.body.case_format);

        // Calculate expires_at based on duration
        let expiresAt = null;
        if (finalDurationDays && finalDurationDays > 0) {
          const expiryDate = new Date(createdDate);
          expiryDate.setDate(expiryDate.getDate() + parseInt(finalDurationDays));
          expiresAt = expiryDate.toISOString();
        }

        vouchers.push([
          batchId,
          voucherCode,
          profile_id,
          priceSell,
          priceCost,
          finalDurationDays * 24, // Convert days to hours for expired_hours
          expiresAt,
          vendor_id || null
        ]);
      }

      // Insert vouchers
      for (const voucher of vouchers) {
        await db.query(`
          INSERT INTO vouchers (batch_id, code, profile_id, price_sell, price_cost, duration_hours, expires_at, vendor_id, mikrotik_synced)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
        `, voucher);
      }

      // Create hotspot users in Mikrotik
      const mikrotikVouchers = [];
      for (const voucher of vouchers) {
        const commentData = {
          system: 'voucher',
          batch_id: batchId,
          price_sell: voucher[3],
          price_cost: voucher[4],
          expired_hours: voucher[5],
          vendor_id: voucher[6],
          created_date: new Date().toISOString().split('T')[0],
          type: 'onetime',
          created_by: request.admin.username
        };

        try {
          console.log(`Creating Mikrotik user for voucher ${voucher[1]} with profile ${profile.name}`);
          console.log(`Comment data:`, JSON.stringify(commentData, null, 2));

          const mikrotikUser = await fastify.mikrotik.createHotspotUser({
            username: voucher[1],
            password: voucher[1], // Same as username for simplicity
            profile: profile.name,
            comment: commentData
          });

          console.log(`Mikrotik user created successfully:`, JSON.stringify(mikrotikUser, null, 2));

          mikrotikVouchers.push({
            voucherCode: voucher[1],
            mikrotikUser: mikrotikUser
          });

          // Update voucher sync status - no need to store mikrotik_user separately
          console.log(`Marking voucher ${voucher[1]} as synced to Mikrotik`);

          const updateResult = await db.query(`
            UPDATE vouchers
            SET mikrotik_synced = true
            WHERE code = $1
          `, [voucher[1]]);

          console.log(`Database update result:`, updateResult);

        } catch (error) {
          console.error(`Failed to create Mikrotik user for voucher ${voucher[1]}:`, error);
          console.error(`Error stack:`, error.stack);
        }
      }

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'create_vouchers',
        'voucher_batch',
        batchResult,
        {
          batch_id: batchId,
          profile: profile.name,
          quantity,
          total_cost: totalCost,
          total_revenue: totalRevenue
        },
        request
      );

      // Redirect to print page
      return reply.redirect(`/vouchers/print/${batchId}`);
    } catch (error) {
      fastify.log.error(error);
      return reply.view('vouchers/create', {
        admin: request.admin,
        error: 'Failed to create vouchers'
      });
    }
  });

  // Print vouchers
  fastify.get('/print/:batchId', {
    preHandler: [auth.requireRole(['admin', 'superadmin'])]
  }, async (request, reply) => {
    try {
      const batchId = request.params.batchId;

      // Get batch info - using voucher data since batch table doesn't exist
      const batchResult = await db.query(
`
        SELECT
          v.batch_id,
          COUNT(*) as quantity,
          MAX(v.created_at) as created_at,
          p.name as profile_name,
          NULL as created_by_username,
          SUM(v.price_sell) as total_revenue,
          SUM(v.price_cost) as total_cost,
          SUM(v.price_sell - v.price_cost) as total_profit
        FROM vouchers v
        JOIN profiles p ON v.profile_id = p.id
        WHERE v.batch_id = $1
        GROUP BY v.batch_id, p.name
      `, [batchId]
);
      const batch = batchResult.rows && batchResult.rows.length > 0 ? batchResult.rows[0] : null;

      if (!batch) {
        return reply.code(404).send('Batch not found');
      }

      // Get vouchers
      const vouchersResult = await db.query(`
        SELECT v.*, p.name as profile_name
        FROM vouchers v
        JOIN profiles p ON v.profile_id = p.id
        WHERE v.batch_id = $1
        ORDER BY v.created_at
      `, [batchId]);
      const vouchers = vouchersResult.rows || [];

      // Get company settings
      const settings = {};
      const settingRowsResult = await db.query(`SELECT key, value FROM settings`);
      const settingRows = settingRowsResult.rows || [];
      if (Array.isArray(settingRows)) {
        settingRows.forEach(row => {
          settings[row.key] = row.value;
        });
      }

      // Get template settings from database
      const templateType = settings.template_type || 'a4';
      const templateContent = settings[`template_${templateType}`] || '';

      if (templateContent) {
        // Render database template with voucher data
        const renderedTemplate = templateContent
          .replace(/\{\{batch\.id\}\}/g, batch.batch_id)
          .replace(/\{\{batch\.created_at\}\}/g, new Date(batch.created_at).toLocaleDateString('id-ID'))
          .replace(/\{\{batch\.total_vouchers\}\}/g, batch.quantity)
          .replace(/\{\{batch\.total_profit\}\}/g, new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(batch.total_profit || 0))
          .replace(/\{\{settings\.company_name\}\}/g, settings.company_name || 'Mikrotik Billing')
          .replace(/\{\{settings\.company_address\}\}/g, settings.company_address || '')
          .replace(/\{\{settings\.company_phone\}\}/g, settings.company_phone || '')

        // Add voucher list rendering
        let voucherList = '';
        vouchers.forEach((voucher, index) => {
          const voucherHtml = templateContent.includes('{{#each vouchers}}') ? '' : `
            <div class="voucher-item">
              <div class="voucher-code">${voucher.code}</div>
              <div class="voucher-profile">${voucher.profile_name}</div>
              <div class="voucher-duration">${voucher.duration_hours ? Math.ceil(voucher.duration_hours / 24) : 0} hari</div>
              <div class="voucher-price">${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(voucher.price_sell)}</div>
            </div>
          `;
          voucherList += voucherHtml;
        });

        const finalTemplate = renderedTemplate.replace('{{voucherList}}', voucherList);
        return reply.type('text/html').send(finalTemplate);
      } else {
        // Fallback to print system
        return reply.redirect(`/print/batch/${batchId}`);
      }
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

  // Voucher details
  fastify.get('/:id', {
    preHandler: [auth.requireRole(['admin', 'superadmin'])]
  }, async (request, reply) => {
    try {
      const voucherResult = await db.query(
`
        SELECT v.*, p.name as profile_name,
               NULL as batch_quantity,
               NULL as created_by_username
        FROM vouchers v
        JOIN profiles p ON v.profile_id = p.id
        WHERE v.id = $1
      `, [request.params.id]
);
      const voucher = voucherResult.rows && voucherResult.rows.length > 0 ? voucherResult.rows[0] : null;

      if (!voucher) {
        return reply.code(404).send('Voucher not found');
      }

      // Get Mikrotik user info - find by voucher code
      let mikrotikUser = null;
      if (voucher.mikrotik_synced) {
        try {
          const hotspotUsers = await fastify.mikrotik.getHotspotUsers();
          mikrotikUser = hotspotUsers.find(u => u.name === voucher.code);
        } catch (error) {
          console.error('Error getting Mikrotik user info:', error);
        }
      }

      return reply.view('vouchers/show', {
        admin: request.admin,
        voucher,
        mikrotikUser
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

  // Check voucher status from Mikrotik
  fastify.get('/:id/check', {
    preHandler: [auth.requireRole(['admin', 'superadmin'])]
  }, async (request, reply) => {
    try {
      const voucherResult = await db.query('SELECT * FROM vouchers WHERE id = $1', [request.params.id]);
      const voucher = voucherResult.rows && voucherResult.rows.length > 0 ? voucherResult.rows[0] : null;

      if (!voucher) {
        return reply.code(404).send('Voucher not found');
      }

      // Get Mikrotik user info
      const hotspotUsers = await fastify.mikrotik.getHotspotUsers();
      const mikrotikUser = hotspotUsers.find(u => u.name === voucher.code);

      if (!mikrotikUser) {
        return reply.send({
          status: 'not_found',
          message: 'Voucher not found in Mikrotik'
        });
      }

      // Get active sessions
      const activeSessions = await fastify.mikrotik.getHotspotActive();
      const activeSession = activeSessions.find(s => s.user === voucher.code);

      // Parse comment data
      const commentData = MikrotikClient.parseComment(mikrotikUser.comment) || {};

      // Update local voucher status
      let newStatus = voucher.status;
      if (mikrotikUser.disabled === 'true') {
        newStatus = 'disabled';
      } else if (activeSession && !voucher.used_at) {
        // First login detected
        await db.update('vouchers', {status: 'used'}, {id: request.params.id});
        newStatus = 'used';
      }

      if (commentData.first_login && commentData.expired_hours) {
        const expiryDate = new Date(commentData.first_login);
        expiryDate.setHours(expiryDate.getHours() + parseInt(commentData.expired_hours));

        if (expiryDate < new Date()) {
          newStatus = 'expired';
        }
      }

      return reply.send({
        status: newStatus,
        mikrotikUser: {
          name: mikrotikUser.name,
          profile: mikrotikUser.profile,
          disabled: mikrotikUser.disabled,
          uptime: mikrotikUser.uptime,
          bytesIn: mikrotikUser['bytes-in'],
          bytesOut: mikrotikUser['bytes-out']
        },
        activeSession: activeSession ? {
          address: activeSession.address,
          uptime: activeSession.uptime,
          bytesIn: activeSession['bytes-in'],
          bytesOut: activeSession['bytes-out']
        } : null,
        commentData
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

  // Extend voucher expiry
  fastify.post('/:id/extend', {
    preHandler: [auth.requireRole(['admin', 'superadmin'])]
  }, async (request, reply) => {
    const { additional_days } = request.body;

    try {
      const voucherResult = await db.query('SELECT * FROM vouchers WHERE id = $1', [request.params.id]);
      const voucher = voucherResult.rows && voucherResult.rows.length > 0 ? voucherResult.rows[0] : null;

      if (!voucher) {
        return reply.code(404).send('Voucher not found');
      }

      // Update comment in Mikrotik
      try {
        const hotspotUsers = await fastify.mikrotik.getHotspotUsers();
        const mikrotikUser = hotspotUsers.find(u => u.name === voucher.code);

        if (mikrotikUser) {
          const commentData = MikrotikClient.parseComment(mikrotikUser.comment) || {};
          commentData.expired_hours = parseInt(commentData.expired_hours || 0) + (parseInt(additional_days) * 24);

          await fastify.mikrotik.updateHotspotUser(voucher.code, {
            comment: fastify.mikrotik.formatComment(commentData)
          });
        }
      } catch (error) {
        console.error('Error updating Mikrotik user:', error);
      }

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'extend_voucher',
        'voucher',
        request.params.id,
        { additional_days, voucher_code: voucher.code },
        request
      );

      return reply.redirect(`/vouchers/${request.params.id}?success=Voucher extended successfully`);
    } catch (error) {
      fastify.log.error(error);
      return reply.redirect(`/vouchers/${request.params.id}?error=Failed to extend voucher`);
    }
  });

  // Delete voucher
  fastify.delete('/:id', {
    preHandler: [auth.requireRole(['admin', 'superadmin'])]
  }, async (request, reply) => {
    try {
      const voucherResult = await db.query('SELECT * FROM vouchers WHERE id = $1', [request.params.id]);
      const voucher = voucherResult.rows && voucherResult.rows.length > 0 ? voucherResult.rows[0] : null;

      if (!voucher) {
        return reply.code(404).send('Voucher not found');
      }

      // Delete from Mikrotik
      try {
        await fastify.mikrotik.deleteHotspotUser(voucher.code);
      } catch (error) {
        console.error('Error deleting from Mikrotik:', error);
      }

      // Delete from database
      await db.query(`DELETE FROM vouchers WHERE id = $1`, [request.params.id]);

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'delete_voucher',
        'voucher',
        request.params.id,
        { voucher_code: voucher.code },
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

  // API Routes for dynamic content
  // API: Get vouchers with JSON response
  fastify.get('/api/vouchers', {}, async (request, reply) => {
    try {
      const page = parseInt(request.query.page) || 1;
      const pageSize = parseInt(request.query.page_size) || 10;
      const offset = (page - 1) * pageSize;
      const search = request.query.search || '';
      const profile = request.query.profile || '';
      const status = request.query.status || '';
      const dateRange = request.query.dateRange || '';
      const vendor = request.query.vendor || '';
      const batchId = request.query.batch_id || '';

      let whereClause = 'WHERE 1=1';
      const params = [];

      if (search) {
        whereClause += ' AND (v.code LIKE $1 OR v.batch_id LIKE $2)';
        params.push(`%${search}%`, `%${search}%`);
      }

      if (profile) {
        whereClause += ` AND p.name = $${params.length + 1}`;
        params.push(profile);
      }

      if (status) {
        whereClause += ` AND v.status = $${params.length + 1}`;
        params.push(status);
      }

      if (dateRange) {
        whereClause += ` AND DATE(v.created_at) = $${params.length + 1}`;
        params.push(dateRange);
      }

      if (vendor) {
        whereClause += ` AND v.vendor_id = $${params.length + 1}`;
        params.push(vendor);
      }

      if (batchId) {
        whereClause += ` AND v.batch_id = $${params.length + 1}`;
        params.push(batchId);
      }

      const vouchersResult = await db.query(`
        SELECT v.*, p.name as profileName,
               NULL as batchQuantity, NULL as batchCreatedAt,
               NULL as createdByUsername,
               vd.name as vendorName
        FROM vouchers v
        JOIN profiles p ON v.profile_id = p.id
        LEFT JOIN vendors vd ON v.vendor_id = vd.id
        ${whereClause}
        ORDER BY v.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `, [...params, pageSize, offset]);
      const vouchers = vouchersResult.rows || [];

      const totalResult = await db.query(`
        SELECT COUNT(*) as count FROM vouchers v JOIN profiles p ON v.profile_id = p.id
        LEFT JOIN vendors vd ON v.vendor_id = vd.id
        ${whereClause}
      `, params);
      const total = totalResult.rows && totalResult.rows.length > 0 ? parseInt(totalResult.rows[0].count) : 0;

      // Calculate statistics
      const statsResult = await db.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN v.status = 'available' THEN 1 ELSE 0 END) as available,
          SUM(CASE WHEN v.status = 'used' THEN 1 ELSE 0 END) as used,
          SUM(CASE WHEN v.status = 'expired' THEN 1 ELSE 0 END) as expired,
          SUM(CASE WHEN v.status = 'used' THEN v.price_sell ELSE 0 END) as revenue
        FROM vouchers v JOIN profiles p ON v.profile_id = p.id
        ${whereClause}
      `, params);
      const stats = statsResult.rows && statsResult.rows.length > 0 ? statsResult.rows[0] : {};

      return reply.send({
        vouchers: vouchers.map(v => ({
          id: v.id,
          code: v.code,
          profileName: v.profileName,
          vendorName: v.vendorName,
          priceSell: v.price_sell,
          priceCost: v.price_cost,
          expiredDays: v.duration_hours ? Math.ceil(v.duration_hours / 24) : 0,
          expiredHours: v.expired_hours || 0,
          expiredMinutes: v.expired_minutes || 0,
          status: v.status,
          createdAt: v.created_at,
          usedAt: v.used_at,
          expiresAt: v.expires_at,
          batchId: v.batch_id
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        },
        statistics: {
          total: stats.total || 0,
          available: stats.available || 0,
          used: stats.used || 0,
          expired: stats.expired || 0,
          revenue: stats.revenue || 0
        }
      });
    } catch (error) {
      fastify.log.error(error);
      throw error;
    }
  });

  // API: Export vouchers
  fastify.get('/api/vouchers/export', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    try {
      const search = request.query.search || '';
      const profile = request.query.profile || '';
      const status = request.query.status || '';
      const dateRange = request.query.dateRange || '';
      const vendor = request.query.vendor || '';

      let whereClause = 'WHERE 1=1';
      const params = [];

      if (search) {
        whereClause += ' AND (v.code LIKE $1 OR v.batch_id LIKE $2)';
        params.push(`%${search}%`, `%${search}%`);
      }

      if (profile) {
        whereClause += ` AND p.name = $${params.length + 1}`;
        params.push(profile);
      }

      if (status) {
        whereClause += ` AND v.status = $${params.length + 1}`;
        params.push(status);
      }

      if (dateRange) {
        whereClause += ` AND DATE(v.created_at) = $${params.length + 1}`;
        params.push(dateRange);
      }

      if (vendor) {
        whereClause += ` AND v.vendor_id = $${params.length + 1}`;
        params.push(vendor);
      }

      const vouchersResult = await db.query(`
        SELECT v.code, p.name as profile_name, v.price_sell, v.price_cost,
               v.status, v.created_at, v.used_at, v.expires_at
        FROM vouchers v JOIN profiles p ON v.profile_id = p.id
        ${whereClause}
        ORDER BY v.created_at DESC
      `, params);
      const vouchers = vouchersResult.rows || [];

      // Generate CSV
      const headers = ['Kode Voucher', 'Profile', 'Harga Jual', 'Harga Modal', 'Status', 'Dibuat', 'Digunakan', 'Kadaluarsa'];
      const csvContent = [
        headers.join(','),
        ...vouchers.map(v => [
          v.code,
          v.profile_name,
          v.price_sell,
          v.price_cost,
          v.status,
          v.created_at,
          v.used_at || '',
          v.expires_at || ''
        ].map(field => `"${field}"`).join(','))
      ].join('\n');

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="vouchers_${new Date().toISOString().split('T')[0]}.csv"`);
      return reply.send(csvContent);
    } catch (error) {
      fastify.log.error(error);
      throw error;
    }
  });

  // API: Get recent voucher activity
  fastify.get('/api/vouchers/recent-activity', {
    preHandler: [auth.requireRole(['admin', 'superadmin'])]
  }, async (request, reply) => {
    try {
      const limit = parseInt(request.query.limit) || 10;

      // Get recent batch activity from vouchers since batch table doesn't exist
      const activitiesResult = await db.query(`
        SELECT
          v.batch_id,
          COUNT(*) as quantity,
          MAX(v.created_at) as created_at,
          p.name as profile_name,
          SUM(v.price_sell) as total_revenue,
          SUM(v.price_cost) as total_cost,
          (SUM(v.price_sell) - SUM(v.price_cost)) as total_profit,
          NULL as created_by_username
        FROM vouchers v
        JOIN profiles p ON v.profile_id = p.id
        GROUP BY v.batch_id, p.name
        ORDER BY created_at DESC
        LIMIT $1
      `, [limit]);
      const activities = activitiesResult.rows || [];

      return reply.send(activities.map(activity => ({
        batch_id: activity.batch_id,
        quantity: activity.quantity,
        profile_name: activity.profile_name,
        total_revenue: activity.total_revenue,
        total_cost: activity.total_cost,
        total_profit: activity.total_profit,
        created_at: activity.created_at,
        created_by_username: activity.created_by_username
      })));
    } catch (error) {
      fastify.log.error(error);
      throw error;
    }
  });

  // API: Get single voucher details
  fastify.get('/api/vouchers/:id', {
    preHandler: [auth.requireRole(['admin', 'superadmin'])]
  }, async (request, reply) => {
    try {
      const voucherResult = await db.query(
`
        SELECT v.*, p.name as profileName,
               v.batch_id, NULL as batchQuantity,
               NULL as createdByUsername
        FROM vouchers v
        JOIN profiles p ON v.profile_id = p.id
        WHERE v.id = $1
      `, [request.params.id]
);
      const voucher = voucherResult.rows && voucherResult.rows.length > 0 ? voucherResult.rows[0] : null;

      if (!voucher) {
        return reply.code(404).send({ error: 'Voucher not found' });
      }

      return reply.send({
        id: voucher.id,
        code: voucher.code,
        profileName: voucher.profileName,
        priceSell: voucher.price_sell,
        priceCost: voucher.price_cost,
        expiredDays: voucher.duration_hours ? Math.ceil(voucher.duration_hours / 24) : 0,
        status: voucher.status,
        createdAt: voucher.created_at,
        usedAt: voucher.used_at,
        expiresAt: voucher.expires_at,
        batchId: voucher.batch_id,
        comment: voucher.comment
      });
    } catch (error) {
      fastify.log.error(error);
      throw error;
    }
  });

  // API: Print selected vouchers
  fastify.post('/api/vouchers/print', {
    preHandler: [auth.requireRole(['admin', 'superadmin'])]
  }, async (request, reply) => {
    try {
      const { voucher_ids } = request.body;

      if (!voucher_ids || !Array.isArray(voucher_ids) || voucher_ids.length === 0) {
        return reply.code(400).send({ error: 'No voucher IDs provided' });
      }

      const vouchersResult = await db.query(`
        SELECT v.*, p.name as profile_name
        FROM vouchers v
        JOIN profiles p ON v.profile_id = p.id
        WHERE v.id = ANY($1)
        ORDER BY v.created_at
      `, [voucher_ids]);
      const vouchers = vouchersResult.rows || [];

      // Get company settings
      const settings = {};
      const settingRowsResult = await db.query(`SELECT key, value FROM settings`);
      const settingRows = settingRowsResult.rows || [];
      if (Array.isArray(settingRows)) {
        settingRows.forEach(row => {
          settings[row.key] = row.value;
        });
      }

      // Generate print HTML
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Print Vouchers</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .voucher { border: 1px solid #ccc; margin: 10px 0; padding: 15px; }
            .header { text-align: center; font-weight: bold; }
            .code { font-family: monospace; font-size: 18px; background: #f0f0f0; padding: 5px; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="no-print">
            <button onclick="window.print()">Print</button>
            <button onclick="window.close()">Close</button>
          </div>
          ${vouchers.map(v => `
            <div class="voucher">
              <div class="header">${settings.company_name || 'WiFi Voucher'}</div>
              <div><strong>Kode:</strong> <span class="code">${v.code}</span></div>
              <div><strong>Profile:</strong> ${v.profile_name}</div>
              <div><strong>Durasi:</strong> ${v.duration_hours ? Math.ceil(v.duration_hours / 24) : 0} hari</div>
              <div><strong>Harga:</strong> Rp ${v.price_sell.toLocaleString('id-ID')}</div>
            </div>
          `).join('')}
          <script>window.onload = () => setTimeout(() => window.print(), 500);</script>
        </body>
        </html>
      `;

      reply.header('Content-Type', 'text/html');
      return reply.send(html);
    } catch (error) {
      fastify.log.error(error);
      throw error;
    }
  });

  // API: Print single voucher
  fastify.get('/api/vouchers/:id/print', {
    preHandler: [auth.verifyToken.bind(auth), auth.requireRole(['admin'])]
  }, async (request, reply) => {
    try {
      const voucherResult = await db.query(
`
        SELECT v.*, p.name as profile_name
        FROM vouchers v
        JOIN profiles p ON v.profile_id = p.id
        WHERE v.id = $1
      `, [request.params.id]
);
      const voucher = voucherResult.rows && voucherResult.rows.length > 0 ? voucherResult.rows[0] : null;

      if (!voucher) {
        return reply.code(404).send({ error: 'Voucher not found' });
      }

      // Get company settings
      const settings = {};
      const settingRowsResult = await db.query(`SELECT key, value FROM settings`);
      const settingRows = settingRowsResult.rows || [];
      if (Array.isArray(settingRows)) {
        settingRows.forEach(row => {
          settings[row.key] = row.value;
        });
      }

      // Get template settings from database
      const templateType = settings.template_type || 'a4';
      const templateContent = settings[`template_${templateType}`] || '';
      const templateName = settings.template_name || 'Default';

      // Calculate expiry date
      const createdDate = new Date(voucher.created_at);
      const expiryDate = new Date(createdDate);
      expiryDate.setHours(expiryDate.getHours() + (voucher.duration_hours || 0));

      if (templateContent) {
        // Use database template with variable substitution
        let renderedTemplate = templateContent;

        // Replace template variables with actual data
        renderedTemplate = renderedTemplate
          .replace(/\{KodeVoucher\}/g, voucher.code)
          .replace(/\{NamaPerusahaan\}/g, settings.company_name || 'WiFi Voucher')
          .replace(/\{DurasiHari\}/g, `${voucher.duration_hours ? Math.ceil(voucher.duration_hours / 24) : 0} hari`)
          .replace(/\{TanggalExpired\}/g, expiryDate.toLocaleDateString('id-ID'))
          .replace(/\{HargaJual\}/g, `Rp ${voucher.price_sell.toLocaleString('id-ID')}`)
          .replace(/\{Profile\}/g, voucher.profile_name)
          .replace(/\{Dibuat\}/g, createdDate.toLocaleDateString('id-ID'))
          .replace(/\{NoUrut\}/g, '1');

        // Add print controls and auto-print script
        const finalHtml = `
          ${renderedTemplate}
          <div class="no-print" style="position: fixed; top: 10px; right: 10px; z-index: 1000;">
            <button onclick="window.print()" style="margin-right: 10px; padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Print</button>
            <button onclick="window.close()" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>
          </div>
          <script>
            window.onload = () => {
              setTimeout(() => window.print(), 500);
            };
          </script>
          <style>
            .no-print { display: block; }
            @media print { .no-print { display: none !important; } }
          </style>
        `;

        reply.header('Content-Type', 'text/html');
        return reply.send(finalHtml);
      } else {
        // Fallback to simple template if no template is configured
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Print Voucher</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .voucher { border: 2px solid #333; margin: 10px 0; padding: 20px; text-align: center; }
              .header { font-size: 24px; font-weight: bold; margin-bottom: 20px; }
              .code { font-family: monospace; font-size: 32px; background: #f0f0f0; padding: 10px; margin: 15px 0; }
              .info { font-size: 16px; margin: 5px 0; }
              @media print { .no-print { display: none; } }
            </style>
          </head>
          <body>
            <div class="no-print">
              <button onclick="window.print()">Print</button>
              <button onclick="window.close()">Close</button>
            </div>
            <div class="voucher">
              <div class="header">${settings.company_name || 'WiFi Voucher'}</div>
              <div class="code">${voucher.code}</div>
              <div class="info"><strong>Profile:</strong> ${voucher.profile_name}</div>
              <div class="info"><strong>Durasi:</strong> ${voucher.duration_hours ? Math.ceil(voucher.duration_hours / 24) : 0} hari</div>
              <div class="info"><strong>Harga:</strong> Rp ${voucher.price_sell.toLocaleString('id-ID')}</div>
              <div class="info"><strong>Dibuat:</strong> ${new Date(voucher.created_at).toLocaleDateString('id-ID')}</div>
            </div>
            <script>window.onload = () => setTimeout(() => window.print(), 500);</script>
          </body>
          </html>
        `;

        reply.header('Content-Type', 'text/html');
        return reply.send(html);
      }
    } catch (error) {
      fastify.log.error(error);
      throw error;
    }
  });

  // API: Regenerate voucher
  fastify.post('/api/vouchers/:id/regenerate', {
    preHandler: [auth.requireRole(['admin', 'superadmin'])]
  }, async (request, reply) => {
    try {
      const oldVoucherResult = await db.query(
'SELECT * FROM vouchers WHERE id = $1',
        [request.params.id]
);
      const oldVoucher = oldVoucherResult.rows && oldVoucherResult.rows.length > 0 ? oldVoucherResult.rows[0] : null;

      if (!oldVoucher) {
        return reply.code(404).send({ error: 'Voucher not found' });
      }

      // Generate new voucher code
      const newVoucherCode = generateVoucherCode('VC', 1, 8, 'uppercase');

      // Calculate new expiry date
      const createdDate = new Date();
      let expiresAt = null;
      if (oldVoucher.duration_hours && oldVoucher.duration_hours > 0) {
        const expiryDate = new Date(createdDate);
        expiryDate.setHours(expiryDate.getHours() + parseInt(oldVoucher.duration_hours));
        expiresAt = expiryDate.toISOString();
      }

      // Create new voucher record
      const insertResult = await db.query(`
        INSERT INTO vouchers (batch_id, code, profile_id, price_sell, price_cost, duration_hours, expires_at, mikrotik_synced)
        VALUES ($1, $2, $3, $4, $5, $6, $7, false)
        RETURNING id
      `, [
        oldVoucher.batch_id,
        newVoucherCode,
        oldVoucher.profile_id,
        oldVoucher.price_sell,
        oldVoucher.price_cost,
        oldVoucher.duration_hours || 24,
        expiresAt
      ]);

      const newVoucherResult = insertResult.rows[0].id;

      // Delete old voucher from Mikrotik and database
      try {
        await fastify.mikrotik.deleteHotspotUser(oldVoucher.code);
      } catch (error) {
        console.error('Error deleting old Mikrotik user:', error);
      }
      await db.query(`DELETE FROM vouchers WHERE id = $1`, [request.params.id]);

      // Create new Mikrotik user
      try {
        const profileResult = await db.query('SELECT * FROM profiles WHERE id = $1', [oldVoucher.profile_id]);
      const profile = profileResult.rows && profileResult.rows.length > 0 ? profileResult.rows[0] : null;
        const commentData = {
          system: 'voucher',
          batch_id: oldVoucher.batch_id,
          price_sell: oldVoucher.price_sell,
          price_cost: oldVoucher.price_cost,
          expired_hours: oldVoucher.time_limit * 24,
          created_date: new Date().toISOString().split('T')[0],
          type: 'onetime',
          created_by: 'system'
        };

        const mikrotikUser = await fastify.mikrotik.createHotspotUser({
          username: newVoucherCode,
          password: newVoucherCode,
          profile: profile.name,
          comment: commentData
        });

        // Mark voucher as synced to Mikrotik
        await db.query(`
          UPDATE vouchers
          SET mikrotik_synced = true
          WHERE id = $1
        `, [newVoucherResult]);
      } catch (error) {
        console.error('Error creating new Mikrotik user:', error);
      }

      return reply.send({
        id: newVoucherResult,
        code: newVoucherCode
      });
    } catch (error) {
      fastify.log.error(error);
      throw error;
    }
  });

  // API: Preview vouchers before generation
  fastify.post('/api/vouchers/preview', {
    preHandler: [auth.requireRole(['admin', 'superadmin'])]
  }, async (request, reply) => {
    try {
      const { profile_id, quantity, prefix, price_sell, price_cost, code_length, duration_days, duration_hours, duration_minutes } = request.body;

      // Get profile details
      const profileResult = await db.query(
'SELECT * FROM profiles WHERE id = $1',
        [profile_id]
);
      const profile = profileResult.rows && profileResult.rows.length > 0 ? profileResult.rows[0] : null;

      if (!profile) {
        return reply.code(400).send({ error: 'Profile not found' });
      }

      // Calculate values
      const finalPriceSell = price_sell || profile.price_sell;
      const finalPriceCost = price_cost || profile.price_cost;
      const finalDurationDays = duration_days; // Duration must come from form, NOT from profile
      const totalRevenue = finalPriceSell * quantity;
      const totalCost = finalPriceCost * quantity;
      const totalProfit = totalRevenue - totalCost;

      // Generate sample voucher codes
      const sampleCodes = [];
      for (let i = 0; i < Math.min(5, quantity); i++) {
        const voucherCode = generateVoucherCode(prefix, i + 1, code_length, request.body.case_format);
        sampleCodes.push(voucherCode);
      }

      return reply.send({
        profile_name: profile.name,
        quantity: quantity,
        price_sell: finalPriceSell,
        price_cost: finalPriceCost,
        duration_days: finalDurationDays,
        total_revenue: totalRevenue,
        total_cost: totalCost,
        total_profit: totalProfit,
        sample_codes: sampleCodes
      });
    } catch (error) {
      fastify.log.error(error);
      throw error;
    }
  });

  // API: Generate vouchers
  fastify.post('/api/vouchers/generate', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    const { profile_id, vendor_id, quantity, prefix, price_sell, price_cost, code_length, duration_days, duration_hours, duration_minutes, expired_hours } = request.body;

    try {
      // Get profile details
      const profileResult = await db.query(
'SELECT * FROM profiles WHERE id = $1',
        [profile_id]
);
      const profile = profileResult.rows && profileResult.rows.length > 0 ? profileResult.rows[0] : null;

      if (!profile) {
        return reply.code(400).send({ error: 'Profile not found' });
      }

      // Generate batch ID
      const batchId = `VC-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

      // Calculate totals
      const finalPriceSell = price_sell || profile.price_sell;
      const finalPriceCost = price_cost || profile.price_cost;
      const finalDurationHours = duration_hours || 0; // Duration must come from form, NOT from profile
      const totalCost = finalPriceCost * quantity;
      const totalRevenue = finalPriceSell * quantity;

      // Create batch record - using batchId directly since voucher_batches table doesn't exist
      const batchResult = batchId;

      // Generate voucher codes
      const vouchers = [];
      const createdDate = new Date();

      for (let i = 0; i < quantity; i++) {
        const voucherCode = generateVoucherCode(prefix, i + 1, code_length, request.body.case_format);

        // Calculate expires_at based on duration hours
        let expiresAt = null;
        if (finalDurationHours && finalDurationHours > 0) {
          const expiryDate = new Date(createdDate);
          expiryDate.setHours(expiryDate.getHours() + parseInt(finalDurationHours));
          expiresAt = expiryDate.toISOString();
        }

        vouchers.push([
          batchId,
          voucherCode,
          profile_id,
          finalPriceSell,
          finalPriceCost,
          finalDurationHours,
          expired_hours || 0,
          expiresAt,
          vendor_id || 1
        ]);
      }

      // Insert vouchers
      for (const voucher of vouchers) {
        await db.query(`
          INSERT INTO vouchers (batch_id, code, profile_id, price_sell, price_cost, duration_hours, expired_hours, expires_at, vendor_id, mikrotik_synced)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
        `, voucher);
      }

      // Get created vouchers for response
      const createdVouchersResult = await db.query(`
        SELECT id, code, profile_id, price_sell, price_cost, expired_hours, created_at
        FROM vouchers
        WHERE batch_id = $1
        ORDER BY created_at
      `, [batchId]);
      const createdVouchers = createdVouchersResult.rows || [];

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'create_vouchers',
        'voucher_batch',
        batchResult,
        {
          batch_id: batchId,
          profile: profile.name,
          quantity,
          total_cost: totalCost,
          total_revenue: totalRevenue
        },
        request
      );

      return reply.send({
        success: true,
        batch_id: batchId,
        quantity: quantity,
        profile_name: profile.name,
        total_revenue: totalRevenue,
        total_cost: totalCost,
        total_profit: totalRevenue - totalCost,
        vouchers: createdVouchers
      });
    } catch (error) {
      fastify.log.error(error);
      throw error;
    }
  });

  // API: Sync vouchers with Mikrotik
  fastify.post('/api/vouchers/sync', {
    preHandler: [auth.requireRole(['admin', 'superadmin'])]
  }, async (request, reply) => {
    try {
      // Get all vouchers from database
      const dbVouchersResult = await db.query(`SELECT * FROM vouchers`);
      const dbVouchers = dbVouchersResult.rows || [];

      // Get all hotspot users from Mikrotik
      const mikrotikUsers = await fastify.mikrotik.getHotspotUsers();

      let synced = 0;
      let errors = 0;

      for (const voucher of dbVouchers) {
        try {
          const mikrotikUser = mikrotikUsers.find(u => u.name === voucher.code);

          if (!mikrotikUser) {
            // Create missing user in Mikrotik
            const profileResult = await db.query('SELECT * FROM profiles WHERE id = $1', [voucher.profile_id]);
      const profile = profileResult.rows && profileResult.rows.length > 0 ? profileResult.rows[0] : null;
            const commentData = {
              system: 'voucher',
              batch_id: voucher.batch_id,
              price_sell: voucher.price_sell,
              price_cost: voucher.price_cost,
              expired_hours: voucher.expired_hours,
              created_date: new Date().toISOString().split('T')[0],
              type: 'onetime'
            };

            // Use new VOUCHER_SYSTEM comment format
            const now = Math.floor(Date.now() / 1000);
            let validUntil = '';
            if (!voucher.never_expired && voucher.expired_hours > 0) {
              validUntil = (now + voucher.expired_hours * 3600).toString();
            }

            const voucherCommentData = {
              system: 'voucher',
              type: 'hotspot',
              price_sell: voucher.price_sell.toString(),
              first_login_timestamp: '', // Will be set on first login via on-login script
              valid_until_timestamp: validUntil
            };

            let mikrotikUser;
            console.log(`HIJINETWORK: DEBUG - About to create voucher user ${voucher.code} with profile ${profile.name}`);
            try {
              mikrotikUser = await fastify.mikrotik.createVoucherUser({
                username: voucher.code,
                password: voucher.code,
                profile: profile.name,
                price_sell: voucher.price_sell,
                price_cost: voucher.price_cost,
                duration_hours: voucher.duration_hours || 24,
                expired_hours: voucher.expired_hours || 0,
                never_expired: voucher.never_expired || 1,
                comment: voucherCommentData
              });
              console.log(`HIJINETWORK: DEBUG - createVoucherUser completed successfully for ${voucher.code}`);
            } catch (createError) {
              // Debug logging to understand the error
              console.log(`HIJINETWORK: DEBUG - Error for voucher ${voucher.code}:`, createError.message);
              console.log(`HIJINETWORK: DEBUG - Error contains profile mismatch:`, createError.message && createError.message.includes('input does not match any value of profile'));

              // Check if this is a profile mismatch error
              if (createError.message && createError.message.includes('input does not match any value of profile')) {
                console.log(`HIJINETWORK: Profile mismatch detected for profile "${profile.name}". Auto-fixing by creating profile in RouterOS...`);

                // Automatically create the missing profile
                const profileCreated = await fastify.mikrotik.createHotspotProfile(profile.name, profile.price_sell || 0, profile.price_cost || 0);

                if (profileCreated) {
                  console.log(`HIJINETWORK: ✅ Profile "${profile.name}" created successfully in RouterOS. Retrying voucher creation...`);

                  // Retry voucher creation after profile is fixed
                  mikrotikUser = await fastify.mikrotik.createVoucherUser({
                    username: voucher.code,
                    password: voucher.code,
                    profile: profile.name,
                    price_sell: voucher.price_sell,
                    price_cost: voucher.price_cost,
                    duration_hours: voucher.duration_hours || 24,
                    expired_hours: voucher.expired_hours || 0,
                    never_expired: voucher.never_expired || 1,
                    comment: voucherCommentData
                  });

                  console.log(`HIJINETWORK: ✅ Voucher "${voucher.code}" created successfully after automatic profile fix`);
                } else {
                  throw new Error(`Failed to create missing profile "${profile.name}" in RouterOS. Original error: ${createError.message}`);
                }
              } else if (createError.message && createError.message.includes('already have user with this name')) {
                console.log(`HIJINETWORK: User "${voucher.code}" already exists in RouterOS. Updating sync status...`);

                // User already exists - just update the sync status
                // This can happen when user was created manually or by another process
                mikrotikUser = { name: voucher.code }; // Create minimal user object for status update

                console.log(`HIJINETWORK: ✅ Voucher "${voucher.code}" sync status updated - user already exists in RouterOS`);
              } else {
                // Re-throw the original error if its not a profile mismatch or existing user
                throw createError;
              }
            }

            // Update voucher sync status - use synchronous operation to ensure it completes
            console.log(`HIJINETWORK: DEBUG - Updating database sync status for voucher ${voucher.code} (ID: ${voucher.id})`);

            // Update voucher sync status
            await db.query(`
              UPDATE vouchers
              SET mikrotik_synced = true
              WHERE id = $1
            `, [voucher.id]);
            console.log(`HIJINETWORK: SUCCESS - Database sync status updated for voucher ${voucher.code}`);

            synced++;
          } else {
            // Check if existing user in Mikrotik has old comment format
            const existingComment = mikrotikUser.comment || '';
            const needsUpdate = !existingComment.startsWith('VOUCHER_SYSTEM|');

            if (needsUpdate) {
              console.log(`Updating existing RouterOS user ${voucher.code} with new VOUCHER_SYSTEM format`);

              // Delete old user first
              try {
                await fastify.mikrotik.deleteHotspotUser(mikrotikUser['.id']);
                console.log(`Deleted old RouterOS user: ${voucher.code}`);
              } catch (deleteError) {
                console.error(`Failed to delete old RouterOS user ${voucher.code}:`, deleteError.message);
                errors++;
                continue; // Skip to next voucher
              }

              // Create new user with updated format
              const profileResult = await db.query('SELECT * FROM profiles WHERE id = $1', [voucher.profile_id]);
      const profile = profileResult.rows && profileResult.rows.length > 0 ? profileResult.rows[0] : null;

              // Use new VOUCHER_SYSTEM comment format
              const now = Math.floor(Date.now() / 1000);
              let validUntil = '';
              if (!voucher.never_expired && voucher.expired_hours > 0) {
                validUntil = (now + voucher.expired_hours * 3600).toString();
              }

              const voucherCommentData = {
                system: 'voucher',
                type: 'hotspot',
                price_sell: voucher.price_sell.toString(),
                first_login_timestamp: '', // Will be set on first login via on-login script
                valid_until_timestamp: validUntil
              };

              try {
                let newMikrotikUser;
                try {
                  newMikrotikUser = await fastify.mikrotik.createVoucherUser({
                    username: voucher.code,
                    password: voucher.code,
                    profile: profile.name,
                    price_sell: voucher.price_sell,
                    price_cost: voucher.price_cost,
                    duration_hours: voucher.duration_hours || 24,
                    expired_hours: voucher.expired_hours || 0,
                    never_expired: voucher.never_expired || 1,
                    comment: voucherCommentData
                  });
                } catch (createError) {
                  // Check if this is a profile mismatch error
                  if (createError.message && createError.message.includes('input does not match any value of profile')) {
                    console.log(`HIJINETWORK: Profile mismatch detected for profile "${profile.name}" during user recreation. Auto-fixing by creating profile in RouterOS...`);

                    // Automatically create the missing profile
                    const profileCreated = await fastify.mikrotik.createHotspotProfile(profile.name, profile.price_sell || 0, profile.price_cost || 0);

                    if (profileCreated) {
                      console.log(`HIJINETWORK: ✅ Profile "${profile.name}" created successfully in RouterOS. Retrying voucher recreation...`);

                      // Retry voucher creation after profile is fixed
                      newMikrotikUser = await fastify.mikrotik.createVoucherUser({
                        username: voucher.code,
                        password: voucher.code,
                        profile: profile.name,
                        price_sell: voucher.price_sell,
                        price_cost: voucher.price_cost,
                        duration_hours: voucher.duration_hours || 24,
                        expired_hours: voucher.expired_hours || 0,
                        never_expired: voucher.never_expired || 1,
                        comment: voucherCommentData
                      });

                      console.log(`HIJINETWORK: ✅ Voucher "${voucher.code}" recreated successfully after automatic profile fix`);
                    } else {
                      throw new Error(`Failed to create missing profile "${profile.name}" in RouterOS. Original error: ${createError.message}`);
                    }
                  } else {
                    // Re-throw the original error if its not a profile mismatch
                    throw createError;
                  }
                }

                console.log(`✅ Successfully recreated RouterOS user ${voucher.code} with new VOUCHER_SYSTEM format`);

                // Update voucher sync status
                await db.query(`
                  UPDATE vouchers
                  SET mikrotik_synced = true
                  WHERE id = $1
                `, [voucher.id]);

                synced++;
              } catch (createError) {
                console.error(`Failed to recreate RouterOS user ${voucher.code}:`, createError.message);
                errors++;
              }
            } else {
              // Update voucher status based on Mikrotik user and set sync status
              const commentData = MikrotikClient.parseVoucherComment(mikrotikUser.comment) || MikrotikClient.parseComment(mikrotikUser.comment) || {};

              if (mikrotikUser.disabled === true && voucher.status !== 'disabled') {
                await db.query('UPDATE vouchers SET status = $1, mikrotik_synced = true WHERE id = $2', ['disabled', voucher.id]);
              } else {
                // Set sync status to true even if voucher is not disabled
                await db.query(`UPDATE vouchers SET mikrotik_synced = true WHERE id = $1`, [voucher.id]);
              }
            }
          }
        } catch (error) {
          console.error(`Error syncing voucher ${voucher.code}:`, error);
          errors++;
        }
      }

      return reply.send({
        message: `Sync completed: ${synced} synced, ${errors} errors`,
        synced,
        errors
      });
    } catch (error) {
      fastify.log.error(error);
      throw error;
    }
  });

  // Batch actions
  fastify.post('/batch/:batchId', {
    preHandler: [auth.requireRole(['admin', 'superadmin'])]
  }, async (request, reply) => {
    const { action } = request.body;
    const batchId = request.params.batchId;

    try {
      switch (action) {
        case 'delete':
          // Get all vouchers in batch
          const vouchersResult = await db.query(
            'SELECT code FROM vouchers WHERE batch_id = $1',
            [batchId]
          );
          const vouchers = vouchersResult.rows || [];

          // Delete from Mikrotik
          for (const voucher of vouchers) {
            try {
              await fastify.mikrotik.deleteHotspotUser(voucher.code);
            } catch (error) {
              console.error(`Error deleting voucher ${voucher.code}:`, error);
            }
          }

          // Delete from database
          await db.query(`DELETE FROM vouchers WHERE batch_id = $1`, [batchId]);
          // voucher_batches table does not exist - skipping deletion

          // Log activity
          await auth.logActivity(
            request.admin.id,
            'delete_voucher_batch',
            'voucher_batch',
            null,
            { batch_id: batchId, voucher_count: vouchers.length },
            request
          );

          break;

        default:
          return reply.code(400).send({ error: 'Invalid action' });
      }

      return reply.redirect('/vouchers?success=Batch action completed successfully');
    } catch (error) {
      fastify.log.error(error);
      return reply.redirect('/vouchers?error=Failed to perform batch action');
    }
  });

  // Get voucher statistics
  fastify.get('/api/vouchers/statistics', {}, async (request, reply) => {
    try {
      // Get basic statistics
      const totalResult = await db.query('SELECT COUNT(*) as count FROM vouchers');
      const availableResult = await db.query('SELECT COUNT(*) as count FROM vouchers WHERE status = $1', ['available']);
      const usedResult = await db.query('SELECT COUNT(*) as count FROM vouchers WHERE status = $1', ['used']);
      const expiredResult = await db.query('SELECT COUNT(*) as count FROM vouchers WHERE status = $1', ['expired']);
      const generatedTodayResult = await db.query(`
        SELECT COUNT(*) as count
        FROM vouchers
        WHERE DATE(created_at) = CURRENT_DATE
      `);
      const revenueResult = await db.query(`
        SELECT COALESCE(SUM(price_sell), 0) as total
        FROM vouchers
        WHERE status = $1
      `, ['used']);

      const statistics = {
        total: totalResult.rows && totalResult.rows.length > 0 ? totalResult.rows[0].count : 0,
        available: availableResult.rows && availableResult.rows.length > 0 ? availableResult.rows[0].count : 0,
        used: usedResult.rows && usedResult.rows.length > 0 ? usedResult.rows[0].count : 0,
        expired: expiredResult.rows && expiredResult.rows.length > 0 ? expiredResult.rows[0].count : 0,
        generated_today: generatedTodayResult.rows && generatedTodayResult.rows.length > 0 ? generatedTodayResult.rows[0].count : 0,
        revenue: revenueResult.rows && revenueResult.rows.length > 0 ? revenueResult.rows[0].total : 0
      };

      // Get statistics by profile
      const byProfileResult = await db.query(`
        SELECT p.name as profile_name,
               COUNT(v.id) as count,
               COALESCE(SUM(v.price_sell), 0) as revenue
        FROM vouchers v
        LEFT JOIN profiles p ON v.profile_id = p.id
        GROUP BY p.id, p.name
        ORDER BY count DESC
      `);
      const byProfile = byProfileResult.rows || [];

      // Get recent activity (last 7 days)
      const recentActivityResult = await db.query(`
        SELECT
          DATE(created_at) as date,
          COUNT(*) as created,
          SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) as used
        FROM vouchers
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `);
      const recentActivity = recentActivityResult.rows || [];

      return reply.send({
        statistics,
        byProfile,
        recentActivity
      });
    } catch (error) {
      logDetailedError(fastify, error, request, {
        operation: 'Get Voucher Statistics',
        errorTitle: 'Database Query Failed'
      });
      return sendDetailedError(reply, error, request, {
        errorTitle: 'Failed to Load Voucher Statistics',
        details: {
          query_section: 'statistics_aggregation'
        }
      });
    }
  });
}

// Helper function to generate voucher codes
function generateVoucherCode(prefix, index, codeLength = 8, caseFormat = 'uppercase') {
  // Define character sets for different complexity levels
  const uppercaseChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercaseChars = 'abcdefghijklmnopqrstuvwxyz';
  const numberChars = '0123456789';
  const specialChars = '!@#$%^&*'; // Optional special chars for higher security

  // Use cryptographically secure random number generator if available
  
  // Function to generate secure random string
  function generateSecureRandom(length, charset) {
    if (typeof crypto !== 'undefined' && crypto.randomBytes) {
      // Use crypto for better randomness
      const randomBytes = crypto.randomBytes(length);
      let result = '';
      for (let i = 0; i < length; i++) {
        const randomIndex = randomBytes[i] % charset.length;
        result += charset[randomIndex];
      }
      return result;
    } else {
      // Fallback to Math.random (less secure but still random)
      let result = '';
      for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charset.length);
        result += charset[randomIndex];
      }
      return result;
    }
  }

  // Create a truly random voucher code
  const allChars = uppercaseChars + lowercaseChars + numberChars;

  // Ensure minimum code length for security
  const secureCodeLength = Math.max(codeLength, 6);

  // Generate random base code
  let randomCode = generateSecureRandom(secureCodeLength, allChars);

  // Add prefix if provided
  let finalCode = prefix ? prefix.toUpperCase() + '-' + randomCode : randomCode;

  // Ensure total length doesnt exceed reasonable limits
  if (finalCode.length > 20) {
    finalCode = finalCode.slice(0, 20);
  }

  // Apply case formatting
  switch (caseFormat) {
    case 'lowercase':
      finalCode = finalCode.toLowerCase();
      break;
    case 'mixed':
      // Keep the format as mixed case from generation
      break;
    case 'uppercase':
    default:
      finalCode = finalCode.toUpperCase();
      break;
  }

  // Remove special characters if they cause issues
  finalCode = finalCode.replace(/[!@#$%^&*]/g, '');

  // Ensure we have enough alphanumeric characters
  const alphanumericOnly = uppercaseChars + lowercaseChars + numberChars;
  while (finalCode.length < secureCodeLength) {
    finalCode += generateSecureRandom(1, alphanumericOnly);
  }

  return finalCode;
}

module.exports = voucherRoutes;