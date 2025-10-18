async function apiRoutes(fastify, options) {
  const AuthMiddleware = require('../middleware/auth');
  const auth = new AuthMiddleware(fastify);
  const { db } = require('../database/DatabaseManager');
  const { ApiErrorHandler } = require('../middleware/apiErrorHandler');

  // Profiles API endpoints
  // Get profiles list with pagination and filtering
  fastify.get('/profiles', {
    preHandler: [auth.verifyTokenAPI.bind(auth), auth.requireRole('admin')]
  }, ApiErrorHandler.asyncHandler(async (request, reply) => {
    const page = parseInt(request.query.page) || 1;
    const limit = parseInt(request.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = request.query.search || '';
    const type = request.query.type || '';

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 0;

    if (search) {
      paramIndex++;
      whereClause += ` AND p.name LIKE $${paramIndex}`;
      params.push(`%${search}%`);
    }

    if (type) {
      paramIndex++;
      whereClause += ` AND p.profile_type = $${paramIndex}`;
      params.push(type);
    }

    paramIndex++;
    const limitParam = `$${paramIndex}`;
    paramIndex++;
    const offsetParam = `$${paramIndex}`;

    // Get profiles with counts
    const profilesResult = await db.query(`
      SELECT p.*,
             COUNT(DISTINCT v.id) as voucher_count,
             COUNT(DISTINCT pp.id) as pppoe_count
      FROM profiles p
      LEFT JOIN vouchers v ON p.id = v.profile_id
      LEFT JOIN pppoe_users pp ON p.id = pp.profile_id
      ${whereClause}
      GROUP BY p.id
      ORDER BY p.profile_type, p.name
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `, [...params, limit, offset]);

    // Get total count
    const countResult = await db.query(`
      SELECT COUNT(*) as total
      FROM profiles p
      ${whereClause}
    `, params);

    const total = countResult.rows[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);

    return reply.send({
      success: true,
      data: profilesResult.rows,
      pagination: {
        current: page,
        total: totalPages,
        from: offset + 1,
        to: Math.min(offset + limit, total),
        total
      }
    });
  }));

  // Get profile by ID
  fastify.get('/profiles/:id', {
    preHandler: [auth.verifyTokenAPI.bind(auth), auth.requireRole('admin')]
  }, ApiErrorHandler.asyncHandler(async (request, reply) => {
    const profileResult = await db.query('SELECT * FROM profiles WHERE id = $1', [request.params.id]);

    if (!profileResult.rows || profileResult.rows.length === 0) {
      return ApiErrorHandler.notFoundError(reply, 'Profile not found');
    }

    return reply.send({ success: true, data: profileResult.rows[0] });
  }));

  // Create profile
  fastify.post('/profiles', {
    preHandler: [auth.verifyTokenAPI.bind(auth), auth.requireRole('admin')]
  }, ApiErrorHandler.asyncHandler(async (request, reply) => {
    const { name, profile_type, cost_price, selling_price, speed_limit, data_limit, duration_hours } = request.body;

    // Validate required fields
    if (!name || !profile_type) {
      return ApiErrorHandler.validationError(reply, 'Name and type are required');
    }

    // Check if profile name exists
    const existing = await db.query('SELECT id FROM profiles WHERE name = $1', [name]);
    if (existing.rows && existing.rows.length > 0) {
      return ApiErrorHandler.validationError(reply, 'Profile name already exists');
    }

    // Create profile
    const result = await db.query(`
      INSERT INTO profiles (name, profile_type, cost_price, selling_price, speed_limit, data_limit, duration_hours, mikrotik_name)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [name, profile_type, cost_price || 0, selling_price || 0, speed_limit, data_limit, duration_hours || 0, name]);

    const profileId = result.rows[0]?.id;

    // Log activity
    await auth.logActivity(
      request.admin.id,
      'create_profile',
      'profile',
      profileId,
      { name, profile_type, selling_price, cost_price },
      request
    );

    return reply.send({
      success: true,
      message: 'Profile created successfully',
      id: profileId
    });
  }));

  // Update profile
  fastify.put('/profiles/:id', {
    preHandler: [auth.verifyTokenAPI.bind(auth), auth.requireRole('admin')]
  }, ApiErrorHandler.asyncHandler(async (request, reply) => {
    const { name, profile_type, cost_price, selling_price, speed_limit, data_limit } = request.body;
    const profileId = request.params.id;

    // Check if profile exists
    const profileResult = await db.query('SELECT * FROM profiles WHERE id = $1', [profileId]);
    if (!profileResult.rows || profileResult.rows.length === 0) {
      return ApiErrorHandler.notFoundError(reply, 'Profile not found');
    }

    // Check if profile name exists (excluding current)
    const existing = await db.query('SELECT id FROM profiles WHERE name = $1 AND id != $2', [name, profileId]);
    if (existing.rows && existing.rows.length > 0) {
      return ApiErrorHandler.validationError(reply, 'Profile name already exists');
    }

    // Update profile
    await db.query(`
      UPDATE profiles
      SET name = $1, profile_type = $2, cost_price = $3, selling_price = $4,
          speed_limit = $5, data_limit = $6, mikrotik_name = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
    `, [name, profile_type, cost_price, selling_price, speed_limit, data_limit, name, profileId]);

    // Log activity
    await auth.logActivity(
      request.admin.id,
      'update_profile',
      'profile',
      profileId,
      { name, profile_type, selling_price, cost_price },
      request
    );

    return reply.send({ success: true, message: 'Profile updated successfully' });
  }));

  // Delete profile
  fastify.delete('/profiles/:id', {
    preHandler: [auth.verifyTokenAPI.bind(auth), auth.requireRole('admin')]
  }, ApiErrorHandler.asyncHandler(async (request, reply) => {
    const profileId = request.params.id;

    // Check if profile exists
    const profileResult = await db.query('SELECT * FROM profiles WHERE id = $1', [profileId]);
    if (!profileResult.rows || profileResult.rows.length === 0) {
      return ApiErrorHandler.notFoundError(reply, 'Profile not found');
    }

    // Check if profile is in use
    const inUseResult = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM vouchers WHERE profile_id = $1) +
        (SELECT COUNT(*) FROM pppoe_users WHERE profile_id = $2) as total
    `, [profileId, profileId]);

    const inUse = inUseResult.rows[0]?.total || 0;
    if (inUse > 0) {
      return ApiErrorHandler.validationError(reply, 'Cannot delete profile that is in use');
    }

    // Delete profile
    await db.query('DELETE FROM profiles WHERE id = $1', [profileId]);

    // Log activity
    await auth.logActivity(
      request.admin.id,
      'delete_profile',
      'profile',
      profileId,
      { profile_data: profileResult.rows[0] },
      request
    );

    return reply.send({ success: true, message: 'Profile deleted successfully' });
  }));

  // Get profiles statistics
  fastify.get('/profiles/stats', {
    preHandler: [auth.verifyTokenAPI.bind(auth), auth.requireRole('admin')]
  }, ApiErrorHandler.asyncHandler(async (request, reply) => {
      const stats = {
        total: 0,
        hotspot: 0,
        pppoe: 0
      };

      // Get total profiles
      const totalResult = await db.query('SELECT COUNT(*) as total FROM profiles');
      stats.total = totalResult.rows[0]?.total || 0;

      // Get by type
      const hotspotResult = await db.query('SELECT COUNT(*) as count FROM profiles WHERE profile_type = \'hotspot\'');
      stats.hotspot = hotspotResult.rows[0]?.count || 0;

      const pppoeResult = await db.query('SELECT COUNT(*) as count FROM profiles WHERE profile_type = \'pppoe\'');
      stats.pppoe = pppoeResult.rows[0]?.count || 0;

      return reply.send({ success: true, data: stats });
  }));

  // Dashboard statistics API
  fastify.get('/dashboard/stats', {
    preHandler: [auth.verifyTokenAPI.bind(auth), auth.requireRole('admin')]
  }, ApiErrorHandler.asyncHandler(async (request, reply) => {
      // Get database statistics
      const dbStats = {
        totalCustomers: 0,
        activeSubscriptions: 0,
        todayRevenue: 0,
        totalProfiles: 0,
        totalVouchers: 0,
        totalPPPoE: 0
      };

      try {
        const customersResult = await db.query('SELECT COUNT(*) as count FROM customers WHERE is_active = true');
        dbStats.totalCustomers = customersResult.rows[0]?.count || 0;

        const subscriptionsResult = await db.query('SELECT COUNT(*) as count FROM subscriptions WHERE status = \'active\'');
        dbStats.activeSubscriptions = subscriptionsResult.rows[0]?.count || 0;

        const revenueResult = await db.query(`
          SELECT COALESCE(SUM(amount), 0) as total
          FROM payments
          WHERE status = 'paid'
          AND DATE(created_at) = CURRENT_DATE
        `);
        dbStats.todayRevenue = revenueResult.rows[0]?.total || 0;

        const profilesResult = await db.query('SELECT COUNT(*) as count FROM profiles');
        dbStats.totalProfiles = profilesResult.rows[0]?.count || 0;

        const vouchersResult = await db.query('SELECT COUNT(*) as count FROM vouchers');
        dbStats.totalVouchers = vouchersResult.rows[0]?.count || 0;

        const pppoeResult = await db.query('SELECT COUNT(*) as count FROM pppoe_users');
        dbStats.totalPPPoE = pppoeResult.rows[0]?.count || 0;

      } catch (dbError) {
        console.error('Error getting database stats:', dbError);
      }

      // Get Mikrotik statistics if connected
      let mikrotikStats = {
        connected: false,
        activeUsers: 0
      };

      try {
        if (fastify.mikrotik && fastify.mikrotik.isConnected()) {
          mikrotikStats.connected = true;
          // Try to get basic stats
          const hotspotUsers = await fastify.mikrotik.findSystemUsers('hotspot');
          const pppoeUsers = await fastify.mikrotik.findSystemUsers('pppoe');
          mikrotikStats.activeUsers = hotspotUsers.length + pppoeUsers.length;
        }
      } catch (mikrotikError) {
        console.error('Error getting Mikrotik stats:', mikrotikError);
      }

      return reply.send({
        success: true,
        data: {
          database: dbStats,
          mikrotik: mikrotikStats,
          timestamp: new Date().toISOString()
        }
      });

  }));

  // Customer search API
  fastify.get('/customers/search', {
    preHandler: [auth.verifyTokenAPI.bind(auth), auth.requireRole('admin')]
  }, ApiErrorHandler.asyncHandler(async (request, reply) => {
      const query = request.query.q || '';
      const limit = parseInt(request.query.limit) || 10;

      if (query.length < 2) {
        return reply.send({ customers: [] });
      }

      const customersResult = await db.query(`
        SELECT id, name, phone, email, is_active
        FROM customers
        WHERE is_active = true
        AND (name LIKE $1 OR phone LIKE $2 OR email LIKE $3)
        ORDER BY name
        LIMIT $4
      `, [`%${query}%`, `%${query}%`, `%${query}%`, limit]);

      return reply.send({ customers: customersResult.rows });

  }));

  // Test Mikrotik connection
  fastify.post('/mikrotik/test-connection', {
    preHandler: [auth.verifyTokenAPI.bind(auth), auth.requireRole('admin')]
  }, ApiErrorHandler.asyncHandler(async (request, reply) => {
      const { host, port, username, password } = request.body;

      if (!host || !port || !username) {
        return reply.code(400).send({
          success: false,
          error: 'Host, port, and username are required'
        });
      }

      // Test connection with provided settings
      const { RouterOSClient } = require('mikro-routeros');
      const tempClient = new RouterOSClient(host, parseInt(port), 5000);

      try {
        // Connect to RouterOS
        await tempClient.connect();
        // Login to RouterOS
        await tempClient.login(username, password || '');

        // Collect detailed system information
        const systemInfo = {};

        try {
          // Get system identity
          const identity = await tempClient.runQuery('/system/identity/print');
          if (identity && identity.length > 0) {
            systemInfo.identity = identity[0]?.name || 'Unknown';
          }
        } catch (e) {
          console.log('Could not get identity:', e.message);
        }

        try {
          // Get system resource info (version, architecture, etc.)
          const resource = await tempClient.runQuery('/system/resource/print');
          if (resource && resource.length > 0) {
            systemInfo.version = resource[0]?.version || 'Unknown';
            systemInfo.platform = resource[0]?.platform || 'Unknown';
            systemInfo.board = resource[0]?.board || 'Unknown';
            systemInfo.uptime = resource[0]?.uptime || 'Unknown';
            systemInfo.cpu = resource[0]?.cpu || 'Unknown';
            systemInfo.memory = resource[0]?.['total-memory'] || 'Unknown';
          }
        } catch (e) {
          console.log('Could not get resource info:', e.message);
        }

        try {
          // Get system routerboard info
          const routerboard = await tempClient.runQuery('/system/routerboard/print');
          if (routerboard && routerboard.length > 0) {
            systemInfo.routerboard = routerboard[0]?.model || 'Unknown';
            systemInfo.serial = routerboard[0]?.['serial-number'] || 'Unknown';
          }
        } catch (e) {
          console.log('Could not get routerboard info:', e.message);
        }

        await tempClient.close();

        if (systemInfo.identity) {
          return reply.send({
            success: true,
            message: 'Connection successful',
            info: systemInfo
          });
        } else {
          return reply.send({
            success: false,
            error: 'No response from Mikrotik'
          });
        }
      } catch (connectionError) {
        try {
          await tempClient.close();
        } catch (closeError) {
          // Ignore close errors
        }

        return reply.send({
          success: false,
          error: `Connection failed: ${connectionError.message}`
        });
      }

  }));

  // Refresh Mikrotik connection with current settings
  fastify.post('/admin/system/refresh-mikrotik-connection', {
    preHandler: [auth.verifyTokenAPI.bind(auth), auth.requireRole('admin')]
  }, ApiErrorHandler.asyncHandler(async (request, reply) => {
      try {
          // Get current Mikrotik settings from database
          const settingsResult = await db.query(`
              SELECT key, value FROM settings WHERE key LIKE 'mikrotik_%'
          `);

          const settings = {};
          settingsResult.rows.forEach(row => {
              settings[row.key] = row.value;
          });

          const requiredSettings = ['mikrotik_host', 'mikrotik_username', 'mikrotik_password'];
          const missingSettings = requiredSettings.filter(key => !settings[key]);

          if (missingSettings.length > 0) {
              return reply.code(400).send({
                  success: false,
                  message: `Missing required settings: ${missingSettings.join(', ')}`
              });
          }

          // Test connection with current settings
          const { RouterOSClient } = require('mikro-routeros');
          const tempClient = new RouterOSClient(
              settings.mikrotik_host,
              parseInt(settings.mikrotik_port) || 8728,
              parseInt(settings.mikrotik_timeout) || 10000
          );

          let connectionResult;
          try {
              await tempClient.connect();
              await tempClient.login(settings.mikrotik_username, settings.mikrotik_password || '');
              connectionResult = { success: true };
              await tempClient.close();
          } catch (testError) {
              try {
                  await tempClient.close();
              } catch (closeError) {
                  // Ignore close errors
              }
              connectionResult = { success: false, error: testError.message };
          }

          if (connectionResult.success) {
              // Update the main Mikrotik client connection
              if (fastify.mikrotik) {
                  try {
                      // Disconnect existing connection
                      if (fastify.mikrotik.isConnected && fastify.mikrotik.isConnected()) {
                          await fastify.mikrotik.disconnect();
                      }

                      // Reconnect with new settings
                      await fastify.mikrotik.connect({
                          host: settings.mikrotik_host,
                          username: settings.mikrotik_username,
                          password: settings.mikrotik_password,
                          port: parseInt(settings.mikrotik_port) || 8728,
                          timeout: parseInt(settings.mikrotik_timeout) || 10000
                      });

                      // Log the successful reconnection
                      fastify.log.info(`Main Mikrotik client reconnected to ${settings.mikrotik_host}:${settings.mikrotik_port || 8728}`);

                      return reply.send({
                          success: true,
                          message: 'Mikrotik connection refreshed successfully'
                      });

                  } catch (reconnectError) {
                      fastify.log.error('Failed to reconnect main Mikrotik client:', reconnectError);
                      return reply.code(500).send({
                          success: false,
                          message: 'Failed to refresh main Mikrotik connection: ' + reconnectError.message
                      });
                  }
              } else {
                  return reply.code(503).send({
                      success: false,
                      message: 'Mikrotik service not available'
                  });
              }
          } else {
              return reply.code(400).send({
                  success: false,
                  message: 'Connection test failed with current settings',
                  error: connectionResult.error
              });
          }

      } catch (error) {
          fastify.log.error('Error refreshing Mikrotik connection:', error);
          return reply.code(500).send({
              success: false,
              message: 'Internal server error: ' + error.message
          });
      }
  }));

  // Public Mikrotik connection status check
  fastify.get('/public/system/connection', async (request, reply) => {
    try {
      const connectionInfo = {
        connected: false,
        status: 'disconnected'
      };

      if (fastify.mikrotik && fastify.mikrotik.isConnected()) {
        connectionInfo.connected = true;
        connectionInfo.status = 'connected';
      }

      return reply.send(connectionInfo);
    } catch (error) {
      return reply.send({
        connected: false,
        status: 'error',
        error: error.message
      });
    }
  });

  // Get Mikrotik profiles
  fastify.get('/mikrotik/profiles', {
    preHandler: [auth.verifyTokenAPI.bind(auth), auth.requireRole('admin')]
  }, ApiErrorHandler.asyncHandler(async (request, reply) => {
      if (!fastify.mikrotik || !fastify.mikrotik.isConnected()) {
        return reply.code(503).send({
          success: false,
          error: 'Mikrotik not connected'
        });
      }

      const type = request.query.type || 'hotspot'; // hotspot or pppoe

      let profiles = [];
      if (type === 'hotspot') {
        profiles = await fastify.mikrotik.getHotspotProfiles();
      } else if (type === 'pppoe') {
        profiles = await fastify.mikrotik.getPPPProfiles();
      }

      return reply.send({
        success: true,
        data: profiles.map(p => ({
          name: p.name,
          'default-profile': p['default-profile'],
          'shared-users': p['shared-users'],
          'rate-limit': p['rate-limit'],
          'on-login': !!p['on-login'],
          'on-logout': !!p['on-logout']
        }))
      });

  }));

  // Sync profiles from Mikrotik to database
  fastify.post('/mikrotik/sync-profiles', {
    preHandler: [auth.verifyTokenAPI.bind(auth), auth.requireRole('admin')]
  }, ApiErrorHandler.asyncHandler(async (request, reply) => {
      if (!fastify.mikrotik || !fastify.mikrotik.isConnected()) {
        return reply.code(503).send({
          success: false,
          error: 'Mikrotik not connected'
        });
      }

      const type = request.query.type || 'hotspot'; // hotspot or pppoe

      let mikrotikProfiles = [];
      if (type === 'hotspot') {
        mikrotikProfiles = await fastify.mikrotik.getHotspotProfiles();
      } else if (type === 'pppoe') {
        mikrotikProfiles = await fastify.mikrotik.getPPPProfiles();
      }

      let synced = 0;
      let updated = 0;

      for (const profile of mikrotikProfiles) {
        try {
          // Check if profile exists in database
          const existing = await db.query(
            'SELECT id FROM profiles WHERE mikrotik_name = $1 AND profile_type = $2',
            [profile.name, type]
          );

          if (existing.rows && existing.rows.length > 0) {
            // Update existing profile
            await db.query(`
              UPDATE profiles
              SET mikrotik_name = $1, updated_at = CURRENT_TIMESTAMP
              WHERE id = $2
            `, [profile.name, existing.rows[0].id]);
            updated++;
          } else {
            // Create new profile
            await db.query(`
              INSERT INTO profiles (name, profile_type, mikrotik_name, selling_price, cost_price, is_active)
              VALUES ($1, $2, $3, 0, 0, true)
            `, [profile.name, type, profile.name]);
            synced++;
          }
        } catch (error) {
          console.error(`Error syncing profile ${profile.name}:`, error);
        }
      }

      return reply.send({
        success: true,
        message: `Profile sync completed`,
        synced,
        updated,
        total: mikrotikProfiles.length
      });

  }));

  // Analytics performance API endpoint
  fastify.get('/analytics/performance', {
    preHandler: [auth.verifyTokenAPI.bind(auth), auth.requireRole('admin')]
  }, ApiErrorHandler.asyncHandler(async (request, reply) => {
      const performance = {
        database: {
          connected: false,
          responseTime: 0
        },
        mikrotik: {
          connected: false,
          responseTime: 0
        },
        memory: {
          used: 0,
          total: 0,
          percentage: 0
        },
        uptime: process.uptime()
      };

      // Test database connection
      try {
        const start = Date.now();
        await db.query('SELECT 1');
        performance.database.connected = true;
        performance.database.responseTime = Date.now() - start;
      } catch (dbError) {
        performance.database.connected = false;
      }

      // Test Mikrotik connection
      try {
        if (fastify.mikrotik && fastify.mikrotik.isConnected()) {
          const start = Date.now();
          await fastify.mikrotik.ping();
          performance.mikrotik.connected = true;
          performance.mikrotik.responseTime = Date.now() - start;
        }
      } catch (mikrotikError) {
        performance.mikrotik.connected = false;
      }

      // Get memory usage
      const memUsage = process.memoryUsage();
      performance.memory.used = Math.round(memUsage.heapUsed / 1024 / 1024); // MB
      performance.memory.total = Math.round(memUsage.heapTotal / 1024 / 1024); // MB
      performance.memory.percentage = Math.round((performance.memory.used / performance.memory.total) * 100);

      return reply.send({ success: true, data: performance });

  }));

  // Settings API endpoints
  // Get all settings
  fastify.get('/settings', {
    preHandler: [auth.verifyTokenAPI.bind(auth), auth.requireRole('admin')]
  }, ApiErrorHandler.asyncHandler(async (request, reply) => {
      const settingsResult = await db.query('SELECT key, value, description FROM settings ORDER BY key');
      const settings = {};

      settingsResult.rows.forEach(setting => {
        settings[setting.key] = {
          value: setting.value,
          description: setting.description
        };
      });

      return reply.send({ success: true, data: settings });

  }));

  // Update settings
  fastify.put('/settings', {
    preHandler: [auth.verifyTokenAPI.bind(auth), auth.requireRole('admin')]
  }, ApiErrorHandler.asyncHandler(async (request, reply) => {
      const { settings } = request.body;

      if (!settings || typeof settings !== 'object') {
        return reply.code(400).send({ success: false, message: 'Invalid settings data' });
      }

      const updatedSettings = [];

      for (const [key, data] of Object.entries(settings)) {
        // Validate key exists
        const existingResult = await db.query('SELECT key FROM settings WHERE key = $1', [key]);

        // Handle both formats: { key: { value: "actual" } } and { key: "actual" }
        const value = (data && typeof data === 'object' && data.value) ? data.value : data;

        if (existingResult.rows.length > 0) {
          // Update existing setting
          await db.query('UPDATE settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2', [value, key]);
          updatedSettings.push(key);
        } else {
          // Insert new setting if it doesn't exist
          await db.query('INSERT INTO settings (key, value, description, type, category) VALUES ($1, $2, $3, $4, $5)',
            [key, value, '', 'string', 'general']);
          updatedSettings.push(key);
        }
      }

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'update_settings',
        'settings',
        null,
        { updated_settings: updatedSettings },
        request
      );

      return reply.send({
        success: true,
        message: 'Settings updated successfully',
        updated: updatedSettings.length
      });

  }));

  // Get settings by category
  fastify.get('/settings/:category', {
    preHandler: [auth.verifyTokenAPI.bind(auth), auth.requireRole('admin')]
  }, ApiErrorHandler.asyncHandler(async (request, reply) => {
      const { category } = request.params;

      let query = 'SELECT key, value, description FROM settings';
      let params = [];

      // Filter by category if provided
      if (category && category !== 'all') {
        query += ' WHERE key LIKE $1';
        params.push(`${category}%`);
      }

      query += ' ORDER BY key';

      const settingsResult = await db.query(query, params);
      const settings = {};

      settingsResult.rows.forEach(setting => {
        settings[setting.key] = {
          value: setting.value,
          description: setting.description
        };
      });

      return reply.send({ success: true, data: settings });

  }));

  // Manual Mikrotik connection recovery
  fastify.post('/mikrotik/recover-connection', {
    preHandler: [auth.verifyTokenAPI.bind(auth), auth.requireRole('admin')]
  }, ApiErrorHandler.asyncHandler(async (request, reply) => {
    try {
      // Check if connection recovery service is available
      if (!global.ConnectionRecoveryService) {
        return reply.code(503).send({
          success: false,
          message: 'Connection Recovery Service not available'
        });
      }

      console.log('🔄 Manual Mikrotik connection recovery triggered via API');

      const recovery = await global.ConnectionRecoveryService.forceRecovery();

      if (recovery.success) {
        // Log activity
        await auth.logActivity(
          request.admin.id,
          'mikrotik_connection_recovery',
          'system',
          null,
          {
            success: true,
            message: recovery.message,
            duration: recovery.duration,
            triggered_by: 'admin_api'
          },
          request
        );

        return reply.send({
          success: true,
          message: 'Mikrotik connection recovered successfully',
          details: recovery
        });
      } else {
        // Log failed recovery attempt
        await auth.logActivity(
          request.admin.id,
          'mikrotik_connection_recovery',
          'system',
          null,
          {
            success: false,
            error: recovery.error,
            triggered_by: 'admin_api'
          },
          request
        );

        return reply.code(500).send({
          success: false,
          message: 'Connection recovery failed',
          error: recovery.error
        });
      }

    } catch (error) {
      console.error('Error during manual connection recovery:', error);

      // Log error
      await auth.logActivity(
        request.admin.id,
        'mikrotik_connection_recovery',
        'system',
        null,
        {
          success: false,
          error: error.message,
          triggered_by: 'admin_api'
        },
        request
      );

      return reply.code(500).send({
        success: false,
        message: 'Internal server error during recovery',
        error: error.message
      });
    }
  }));

  // Get connection recovery service statistics
  fastify.get('/mikrotik/recovery-stats', {
    preHandler: [auth.verifyTokenAPI.bind(auth), auth.requireRole('admin')]
  }, ApiErrorHandler.asyncHandler(async (request, reply) => {
    try {
      if (!global.ConnectionRecoveryService) {
        return reply.send({
          success: true,
          data: {
            service_available: false,
            message: 'Connection Recovery Service not available'
          }
        });
      }

      const stats = global.ConnectionRecoveryService.getStatistics();

      return reply.send({
        success: true,
        data: {
          service_available: true,
          ...stats,
          connection_info: fastify.mikrotik ? fastify.mikrotik.getConnectionInfo() : null
        }
      });

    } catch (error) {
      console.error('Error getting recovery stats:', error);
      return reply.code(500).send({
        success: false,
        message: 'Failed to get recovery statistics',
        error: error.message
      });
    }
  }));

  // Reset settings to defaults
  fastify.post('/settings/reset', {
    preHandler: [auth.verifyTokenAPI.bind(auth), auth.requireRole('admin')]
  }, ApiErrorHandler.asyncHandler(async (request, reply) => {
      const { keys } = request.body;

      if (!keys || !Array.isArray(keys)) {
        return reply.code(400).send({ success: false, message: 'Invalid keys array' });
      }

      const resetKeys = [];

      for (const key of keys) {
        // Get default value based on key
        let defaultValue = '';

        switch (key) {
          case 'company_name':
            defaultValue = 'HIJINETWORK WiFi';
            break;
          case 'company_address':
            defaultValue = 'Indonesia';
            break;
          case 'company_phone':
            defaultValue = '+628123456789';
            break;
          case 'company_email':
            defaultValue = '';
            break;
          case 'currency':
            defaultValue = 'IDR';
            break;
          case 'language':
            defaultValue = 'id';
            break;
          case 'mikrotik_host':
            defaultValue = '192.168.88.1';
            break;
          case 'mikrotik_port':
            defaultValue = '8728';
            break;
          case 'mikrotik_username':
            defaultValue = 'admin';
            break;
          case 'mikrotik_timeout':
            defaultValue = '30000';
            break;
          case 'mikrotik_password':
            defaultValue = '';
            break;
          case 'backup_enabled':
            defaultValue = 'true';
            break;
          case 'backup_retention_days':
            defaultValue = '30';
            break;
          case 'cleanup_enabled':
            defaultValue = 'true';
            break;
          case 'cleanup_retention_days':
            defaultValue = '90';
            break;
          default:
            defaultValue = '';
        }

        await db.query('UPDATE settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2', [defaultValue, key]);
        resetKeys.push(key);
      }

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'reset_settings',
        'settings',
        null,
        { reset_keys: resetKeys },
        request
      );

      return reply.send({
        success: true,
        message: 'Settings reset to defaults successfully',
        reset: resetKeys.length
      });

  }));
}

module.exports = apiRoutes;