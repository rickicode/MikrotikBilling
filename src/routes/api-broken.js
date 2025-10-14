async function apiRoutes(fastify, options) {
  const AuthMiddleware = require('../middleware/auth');
  const auth = new AuthMiddleware(fastify);
  const { db } = require('../database/DatabaseManager');

  // Profiles API endpoints
  // Get profiles list with pagination and filtering
  fastify.get('/profiles', async (request, reply) => {
    try {
      const page = parseInt(request.query.page) || 1;
      const limit = parseInt(request.query.limit) || 10;
      const offset = (page - 1) * limit;
      const search = request.query.search || '';
      const type = request.query.type || '';
      const sync = request.query.sync || '';
      const sort = request.query.sort || 'type';
      const order = request.query.order || 'asc';

      let whereClause = 'WHERE 1=1';
      const params = [];

      if (search) {
        whereClause += ' AND p.name LIKE ?';
        params.push(`%${search}%`);
      }

      if (type) {
        whereClause += ' AND p.type = ?';
        params.push(type);
      }

      if (sync !== '') {
        whereClause += ' AND p.true = ?';
        params.push(sync === '1' ? 1 : 0);
      }

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
        ORDER BY p.${sort} ${order.toUpperCase()}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `, [...params, limit, offset]);

      // Get total count
      const countResult = await db.query(`
        SELECT COUNT(*) as total
        FROM profiles p
        ${whereClause}
      `, params);

      const total = countResult.rows[0]?.rows[0]?.rows[0]?.total || 0 || 0 || 0;
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
    } catch (error) {
      throw error;
    }
  });

  // Get profile by ID
  fastify.get('/profiles/:id', {
    
  }, async (request, reply) => {
    try {
      const profile = db.query('SELECT * FROM profiles WHERE id = $1', [request.params.id]);

      if (!profile) {
        return reply.code(404).send({ success: false, message: 'Profile not found' });
      }

      return reply.send({ success: true, data: profile });
    } catch (error) {
      throw error;
    }
  });

  // Create profile
  fastify.post('/profiles', {
    
  }, async (request, reply) => {
    try {
      const { name, type, bandwidth_up, bandwidth_down, burst_up, burst_down, burst_threshold, burst_time, time_limit, selling_price, cost_price, expired_days } = request.body;

      // Validate required fields
      if (!name || !type || !selling_price || !cost_price) {
        return reply.code(400).send({ success: false, message: 'Required fields are missing' });
      }

      // Check if profile name exists
      const existing = await db.query('SELECT id FROM profiles WHERE name = $1', [name]);
      if (existing) {
        return reply.code(400).send({ success: false, message: 'Profile name already exists' });
      }

      // Create profile
      const result = db.query(`
        INSERT INTO profiles (name, type, bandwidth_up, bandwidth_down, burst_up, burst_down, burst_threshold, burst_time, time_limit, selling_price, cost_price, expired_days, mikrotik_name, true)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `, [name, type, bandwidth_up, bandwidth_down, burst_up, burst_down, burst_threshold, burst_time, time_limit, selling_price, cost_price, expired_days, name]);

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'create_profile',
        'profile',
        result.rows[0]?.id,
        { name, type, selling_price, cost_price },
        request
      );

      return reply.send({ success: true, message: 'Profile created successfully', id: result.rows[0]?.id });
    } catch (error) {
      throw error;
    }
  });

  // Update profile
  fastify.put('/profiles/:id', {
    
  }, async (request, reply) => {
    try {
      const { name, type, bandwidth_up, bandwidth_down, burst_up, burst_down, burst_threshold, burst_time, time_limit, selling_price, cost_price, expired_days } = request.body;

      // Validate required fields
      if (!name || !type || !selling_price || !cost_price) {
        return reply.code(400).send({ success: false, message: 'Required fields are missing' });
      }

      // Check if profile name exists (excluding current)
      const existing = db.query('SELECT id FROM profiles WHERE name = $3 AND id != $4', [name, request.params.id]);
      if (existing) {
        return reply.code(400).send({ success: false, message: 'Profile name already exists' });
      }

      // Update profile
      db.query(`
        UPDATE profiles
        SET name = ?, type = ?, bandwidth_up = ?, bandwidth_down = ?, burst_up = ?, burst_down = ?, burst_threshold = ?, burst_time = ?, time_limit = ?,
            selling_price = ?, cost_price = ?, expired_days = ?, mikrotik_name = ?,
            true = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
      `, [name, type, bandwidth_up, bandwidth_down, burst_up, burst_down, burst_threshold, burst_time, time_limit, selling_price, cost_price, expired_days, name, request.params.id]);

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'update_profile',
        'profile',
        request.params.id,
        { name, type, selling_price, cost_price },
        request
      );

      return reply.send({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
      throw error;
    }
  });

  // Sync single profile to RouterOS
  fastify.post('/profiles/:id/sync', {

  }, async (request, reply) => {
    try {
      const profileId = request.params.id;

      // Get profile from database
      const profile = db.query('SELECT * FROM profiles WHERE id = $6', [profileId]);
      if (!profile) {
        return reply.code(404).send({ success: false, message: 'Profile not found' });
      }

      // Get Mikrotik settings from individual rows
      const mikrotikHost = db.query('SELECT value FROM settings WHERE key = $7', ['mikrotik_host']);
      const mikrotikPort = db.query('SELECT value FROM settings WHERE key = $8', ['mikrotik_port']);
      const mikrotikUsername = db.query('SELECT value FROM settings WHERE key = $9', ['mikrotik_username']);
      const mikrotikPassword = db.query('SELECT value FROM settings WHERE key = $10', ['mikrotik_password']);

      if (!mikrotikHost || !mikrotikHost.value || !mikrotikUsername || !mikrotikUsername.value || !mikrotikPassword || !mikrotikPassword.value) {
        return reply.code(400).send({ success: false, message: 'Mikrotik configuration not found or incomplete' });
      }

      const { RouterOSClient } = require('mikro-routeros');
      const client = new RouterOSClient(mikrotikHost.value, parseInt(mikrotikPort.value) || 8728, 10000);

      try {
        // Connect to RouterOS
        await client.connect();
        await client.login(mikrotikUsername.value, mikrotikPassword.value);

        // Determine the path based on profile type
        const path = profile.type === 'hotspot' ? '/ip/hotspot/user/profile' : '/ppp/profile';

        // First, let's get all existing profiles to see their structure
        const allProfiles = await client.runQuery(`${path}/print`);
        console.log('Existing RouterOS profiles:', JSON.stringify(allProfiles, null, 2));

        // Check if profile already exists in RouterOS
        const existingProfiles = await client.runQuery(`${path}/print`, {
          '?name': profile.name
        });

        // Build profile parameters - use ONLY the name parameter for maximum compatibility
        const profileParams = {
          name: profile.name
        };

        console.log('Using minimal profile parameters for maximum compatibility');

        if (existingProfiles && existingProfiles.length > 0) {
          // Update existing profile
          const existingId = existingProfiles[0]['.id'];
          try {
            await client.runQuery(`${path}/set`, {
              '.id': existingId,
              ...profileParams
            });
          } catch (updateError) {
            console.error('Error updating existing profile:', updateError.message);
            console.error('Profile parameters:', JSON.stringify(profileParams, null, 2));
            throw new Error(`Failed to update profile: ${updateError.message}`);
          }
        } else {
          // Create new profile
          try {
            await client.runQuery(`${path}/add`, profileParams);
          } catch (createError) {
            console.error('Error creating new profile:', createError.message);
            console.error('Profile parameters:', JSON.stringify(profileParams, null, 2));
            throw new Error(`Failed to create profile: ${createError.message}`);
          }
        }

        // Update sync status in database
        db.query('UPDATE profiles SET true = 1, updated_at = CURRENT_TIMESTAMP WHERE id = $11', [profileId]);

        // Log activity
        await auth.logActivity(
          request.admin.id,
          'sync_profile',
          'profile',
          profileId,
          { name: profile.name, type: profile.type, action: existingProfiles.length > 0 ? 'updated' : 'created' },
          request
        );

        return reply.send({
          success: true,
          message: `Profile ${existingProfiles.length > 0 ? 'updated' : 'created'} successfully in RouterOS`,
          action: existingProfiles.length > 0 ? 'updated' : 'created'
        });

      } finally {
        if (client.connected) {
          await client.close();
        }
      }

    } catch (error) {
      throw error;
    }
  });

  // Sync all profiles to RouterOS
  fastify.post('/profiles/sync-all', {
    preHandler: [auth.verifyTokenAPI.bind(auth), auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      // Get all unsynced profiles
      const profiles = db.query('SELECT * FROM profiles WHERE true = 0 OR true IS NULL');

      if (profiles.rows.length === 0) {
        return reply.send({ success: true, message: 'All profiles are already synced' });
      }

      // Get Mikrotik settings from individual rows
      const mikrotikHost = db.query('SELECT value FROM settings WHERE key = $12', ['mikrotik_host']);
      const mikrotikPort = db.query('SELECT value FROM settings WHERE key = $13', ['mikrotik_port']);
      const mikrotikUsername = db.query('SELECT value FROM settings WHERE key = $14', ['mikrotik_username']);
      const mikrotikPassword = db.query('SELECT value FROM settings WHERE key = $15', ['mikrotik_password']);

      if (!mikrotikHost || !mikrotikHost.value || !mikrotikUsername || !mikrotikUsername.value || !mikrotikPassword || !mikrotikPassword.value) {
        return reply.code(400).send({ success: false, message: 'Mikrotik configuration not found or incomplete' });
      }

      const { RouterOSClient } = require('mikro-routeros');
      const client = new RouterOSClient(mikrotikHost.value, parseInt(mikrotikPort.value) || 8728, 10000);

      let successCount = 0;
      let errorCount = 0;
      const results = [];

      try {
        // Connect to RouterOS
        await client.connect();
        await client.login(mikrotikUsername.value, mikrotikPassword.value);

        for (const profile of profiles) {
          try {
            // Determine the path based on profile type
            const path = profile.type === 'hotspot' ? '/ip/hotspot/user/profile' : '/ppp/profile';

            // Check if profile already exists in RouterOS
            const existingProfiles = await client.runQuery(`${path}/print`, {
              '?name': profile.name
            });

            // Build profile parameters - use ONLY the name parameter for maximum compatibility
            const profileParams = {
              name: profile.name
            };

            console.log(`Using minimal profile parameters for ${profile.name}`);

            // Add rate limit for RouterOS (different parameter names for different profile types)
            // NOTE: Skip rate limiting for now to test basic profile creation
            // if (profile.bandwidth_up || profile.bandwidth_down) {
            //   if (profile.type === 'hotspot') {
            //     // For hotspot profiles, use rate-limit
            //     profileParams['rate-limit'] = `${profile.bandwidth_up || '0'}/${profile.bandwidth_down || '0'}`;
            //   } else {
            //     // For PPP profiles, use rate-limit (same parameter)
            //     profileParams['rate-limit'] = `${profile.bandwidth_up || '0'}/${profile.bandwidth_down || '0'}`;
            //   }
            // }

            // Add burst limit if configured
            // NOTE: Skip burst parameters for now to test basic profile creation
            // if (profile.burst_up && profile.burst_down) {
            //   if (profile.type === 'hotspot') {
            //     profileParams['burst-limit'] = profile.burst_down;
            //     profileParams['burst-threshold'] = profile.burst_threshold || '50';
            //     profileParams['burst-time'] = profile.burst_time || '30';
            //   } else {
            //     // PPP profiles might use different burst parameter names
            //     profileParams['burst-limit'] = profile.burst_down;
            //     profileParams['burst-threshold'] = profile.burst_threshold || '50';
            //     profileParams['burst-time'] = profile.burst_time || '30';
            //   }
            // }

            // Add time limit for hotspot profiles
            // NOTE: Skip time limit for now to test basic profile creation
            // if (profile.type === 'hotspot' && profile.time_limit) {
            //   profileParams['session-timeout'] = profile.time_limit;
            // }

            if (existingProfiles && existingProfiles.length > 0) {
              // Update existing profile
              const existingId = existingProfiles[0]['.id'];
              await client.runQuery(`${path}/set`, {
                '.id': existingId,
                ...profileParams
              });
            } else {
              // Create new profile
              await client.runQuery(`${path}/add`, profileParams);
            }

            // Update sync status in database
            db.query('UPDATE profiles SET true = 1, updated_at = CURRENT_TIMESTAMP WHERE id = $16', [profile.id]);

            successCount++;
            results.push({
              profileId: profile.id,
              name: profile.name,
              status: 'success',
              action: existingProfiles.length > 0 ? 'updated' : 'created'
            });

          } catch (profileError) {
            errorCount++;
            results.push({
              profileId: profile.id,
              name: profile.name,
              status: 'error',
              error: profileError.message
            });
            fastify.log.error(`Error syncing profile ${profile.name}:`, profileError);
          }
        }

        // Log activity
        await auth.logActivity(
          request.admin.id,
          'sync_all_profiles',
          'profile',
          null,
          { total: profiles.length, success: successCount, errors: errorCount },
          request
        );

        return reply.send({
          success: true,
          message: `Sync completed: ${successCount} successful, ${errorCount} failed`,
          results: results,
          summary: { total: profiles.length, success: successCount, errors: errorCount }
        });

      } finally {
        if (client.connected) {
          await client.close();
        }
      }

    } catch (error) {
      throw error;
    }
  });

  // Delete profile
  fastify.delete('/profiles/:id', {
    
  }, async (request, reply) => {
    try {
      const profile = db.query('SELECT * FROM profiles WHERE id = $17', [request.params.id]);

      if (!profile) {
        return reply.code(404).send({ success: false, message: 'Profile not found' });
      }

      // Check if profile is in use
      const inUse = db.query(`
        SELECT
          (SELECT COUNT(*) FROM vouchers WHERE profile_id = $18) +
          (SELECT COUNT(*) FROM pppoe_users WHERE profile_id = $19) as total
      `, [request.params.id, request.params.id]);

      if (inUse.rows[0]?.rows[0]?.total || 0 || 0 > 0) {
        return reply.code(400).send({ success: false, message: 'Cannot delete profile that is in use' });
      }

      // Delete profile
      db.query('DELETE FROM profiles WHERE id = $20', [request.params.id]);

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'delete_profile',
        'profile',
        request.params.id,
        { profile_data: profile },
        request
      );

      return reply.send({ success: true, message: 'Profile deleted successfully' });
    } catch (error) {
      throw error;
    }
  });

  // Get profiles statistics
  fastify.get('/profiles/stats', {
    
  }, async (request, reply) => {
    try {
      const stats = {
        total: 0,
        hotspot: 0,
        pppoe: 0,
        synced: 0,
        unsynced: 0
      };

      // Get total profiles
      const totalResult = db.query('SELECT COUNT(*) as total FROM profiles');
      stats.rows[0]?.rows[0]?.total || 0 || 0 = totalResult.rows[0]?.rows[0]?.total || 0 || 0;

      // Get by type
      const hotspotResult = db.query('SELECT COUNT(*) as count FROM profiles WHERE type = \'hotspot\'');
      stats.hotspot = hotspotResult.rows[0]?.rows[0]?.count || 0 || 0;

      const pppoeResult = db.query('SELECT COUNT(*) as count FROM profiles WHERE type = \'pppoe\'');
      stats.pppoe = pppoeResult.rows[0]?.rows[0]?.count || 0 || 0;

      // Get sync status
      const syncedResult = db.query('SELECT COUNT(*) as count FROM profiles WHERE true = 1');
      stats.synced = syncedResult.rows[0]?.rows[0]?.count || 0 || 0;

      stats.unsynced = stats.rows[0]?.rows[0]?.total || 0 || 0 - stats.synced;

      return reply.send({ success: true, data: stats });
    } catch (error) {
      throw error;
    }
  });

  // Dashboard statistics API
  fastify.get('/dashboard/stats', {
    
  }, async (request, reply) => {
    try {
      // Get real-time statistics from Mikrotik
      let hotspotStats = { active: 0, used: 0, expired: 0 };
      let pppoeStats = { active: 0, disabled: 0, online: 0 };

      try {
        // Get hotspot users
        const hotspotUsers = await fastify.mikrotik.findSystemUsers('hotspot');
        hotspotStats.rows[0]?.rows[0]?.total || 0 || 0 = hotspotUsers.length;
        hotspotStats.active = hotspotUsers.filter(u => !u.first_login).length;
        hotspotStats.used = hotspotUsers.filter(u => u.first_login).length;

        // Get PPPoE users
        const pppoeUsers = await fastify.mikrotik.findSystemUsers('pppoe');
        pppoeStats.rows[0]?.rows[0]?.total || 0 || 0 = pppoeUsers.length;
        pppoeStats.active = pppoeUsers.filter(u => u.disabled !== 'true').length;
        pppoeStats.disabled = pppoeUsers.filter(u => u.disabled === 'true').length;

        // Get active sessions
        const pppoeActive = await fastify.mikrotik.getPPPoEActive();
        pppoeStats.online = pppoeActive.length;

      } catch (error) {
        console.error('Error getting Mikrotik stats:', error);
      }

      // Get database statistics
      const dbStats = {
        totalCustomers: db.query('SELECT COUNT(*) as count FROM customers WHERE is_active = 1').rows[0]?.rows[0]?.count || 0 || 0,
        activeSubscriptions: db.query('SELECT COUNT(*) as count FROM subscriptions WHERE status = \'active\'').rows[0]?.rows[0]?.count || 0 || 0,
        todayRevenue: db.query(`
          SELECT COALESCE(SUM(amount), 0) as total
          FROM payments
          WHERE payment_status = \'paid\'
          AND DATE(created_at) = DATE('now')
        `).rows[0]?.rows[0]?.total || 0 || 0,
        totalProfit: db.query(`
          SELECT COALESCE(SUM(p.selling_price - p.cost_price), 0) as total
          FROM (
            SELECT selling_price, cost_price FROM vouchers
            UNION ALL
            SELECT selling_price, cost_price FROM pppoe_users
          ) p
        `).rows[0]?.rows[0]?.total || 0 || 0
      };

      // Get system health
      const systemHealth = {
        mikrotikConnected: fastify.mikrotik.isConnected(),
        lastCleanup: db.query(`
          SELECT MAX(created_at) as last_run
          FROM cleanup_logs
        `).last_run,
        pendingNotifications: db.query('SELECT COUNT(*) as count FROM notification_queue WHERE status = \'pending\'').rows[0]?.rows[0]?.count || 0 || 0
      };

      return reply.send({
        hotspot: hotspotStats,
        pppoe: pppoeStats,
        database: dbStats,
        system: systemHealth,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      throw error;
    }
  });

  // Hotspot users API
  fastify.get('/hotspot/users', {
    
  }, async (request, reply) => {
    try {
      const users = await fastify.mikrotik.findSystemUsers('hotspot');
      const activeSessions = await fastify.mikrotik.getHotspotActive();

      const enhancedUsers = users.map(user => {
        const activeSession = activeSessions.find(s => s.user === user.name);
        const commentData = fastify.mikrotik.parseComment(user.comment) || {};

        return {
          name: user.name,
          profile: user.profile,
          disabled: user.disabled === 'true',
          uptime: user.uptime,
          commentData,
          activeSession: activeSession ? {
            address: activeSession.address,
            uptime: activeSession.uptime,
            bytesIn: activeSession['bytes-in'],
            bytesOut: activeSession['bytes-out']
          } : null
        };
      });

      return reply.send({
        users: enhancedUsers,
        total: users.length,
        active: enhancedUsers.filter(u => u.activeSession).length
      });
    } catch (error) {
      throw error;
    }
  });

  // PPPoE users API (Mikrotik system users)
  fastify.get('/pppoe/users', {
    
  }, async (request, reply) => {
    try {
      const users = await fastify.mikrotik.findSystemUsers('pppoe');
      const activeSessions = await fastify.mikrotik.getPPPoEActive();

      const enhancedUsers = users.map(user => {
        const activeSession = activeSessions.find(s => s.name === user.name);
        const commentData = fastify.mikrotik.parseComment(user.comment) || {};

        return {
          name: user.name,
          profile: user.profile,
          disabled: user.disabled === 'true',
          uptime: user.uptime,
          commentData,
          activeSession: activeSession ? {
            address: activeSession.address,
            uptime: activeSession.uptime,
            bytesIn: activeSession['bytes-in'],
            bytesOut: activeSession['bytes-out']
          } : null
        };
      });

      return reply.send({
        users: enhancedUsers,
        total: users.length,
        active: enhancedUsers.filter(u => u.activeSession).length
      });
    } catch (error) {
      throw error;
    }
  });

  // PPPoE database users API (for web interface)
  fastify.get('/pppoe', {
    
  }, async (request, reply) => {
    try {
      const page = parseInt(request.query.page) || 1;
      const pageSize = parseInt(request.query.page_size) || 10;
      const offset = (page - 1) * pageSize;
      const search = request.query.search || '';
      const profile = request.query.profile || '';
      const status = request.query.status || '';
      const expiry = request.query.expiry || '';
      const sync = request.query.sync === 'true';

      let whereClause = 'WHERE 1=1';
      const params = [];

      if (search) {
        whereClause += ' AND (p.username LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      if (profile) {
        whereClause += ' AND p.profile_id = ?';
        params.push(profile);
      }

      if (status) {
        whereClause += ' AND p.status = ?';
        params.push(status);
      }

      if (expiry === 'today') {
        whereClause += ' AND DATE(p.expiry_date) = DATE("now")';
      } else if (expiry === 'week') {
        whereClause += ' AND DATE(p.expiry_date) >= DATE("now") AND DATE(p.expiry_date) <= DATE("now", "+7 days")';
      } else if (expiry === 'month') {
        whereClause += ' AND DATE(p.expiry_date) >= DATE("now") AND DATE(p.expiry_date) <= DATE("now", "+1 month")';
      } else if (expiry === 'expired') {
        whereClause += ' AND DATE(p.expiry_date) < DATE("now")';
      }

      // Get PPPoE users from database
      const users = db.query(`
        SELECT p.*, c.name as customer_nama, c.phone as customer_nomor_hp, c.email as customer_email,
               pr.name as profile_name, pr.expired_days
        FROM pppoe_users p
        LEFT JOIN customers c ON p.customer_id = c.id
        LEFT JOIN profiles pr ON p.profile_id = pr.id
        ${whereClause}
        ORDER BY p.created_at DESC
        LIMIT $1 OFFSET $2
      `, [...params, pageSize, offset]);

      // Get total count
      const countResult = db.query(`
        SELECT COUNT(*) as total
        FROM pppoe_users p
        LEFT JOIN customers c ON p.customer_id = c.id
        ${whereClause}
      `, params);

      const total = countResult.rows[0]?.total || 0;
      const totalPages = Math.ceil(total / pageSize);

      // Get real-time online status from Mikrotik if sync is enabled
      let onlineUsers = new Set();
      if (sync && fastify.mikrotik.connected) {
        try {
          const activeSessions = await fastify.mikrotik.getPPPoEActive();
          onlineUsers = new Set(activeSessions.map(s => s.name));
        } catch (error) {
          console.error('Error getting PPPoE active sessions:', error);
        }
      }

      // Enhance users with online status
      const enhancedUsers = users.map(user => ({
        ...user,
        is_online: onlineUsers.has(user.username)
      }));

      // Get statistics
      const statistics = {
        total: db.query('SELECT COUNT(*) as count FROM pppoe_users').rows[0]?.rows[0]?.count || 0 || 0,
        active: db.query('SELECT COUNT(*) as count FROM pppoe_users WHERE status = \'active\'').rows[0]?.rows[0]?.count || 0 || 0,
        expired: db.query('SELECT COUNT(*) as count FROM pppoe_users WHERE status = \'expired\'').rows[0]?.rows[0]?.count || 0 || 0,
        online: onlineUsers.size
      };

      return reply.send({
        success: true,
        pppoe_users: enhancedUsers,
        pagination: {
          page,
          total_pages: totalPages,
          from: offset + 1,
          to: Math.min(offset + pageSize, total),
          total
        },
        statistics
      });
    } catch (error) {
      throw error;
    }
  });

  // PPPoE statistics API
  fastify.get('/pppoe/statistics', {
    
  }, async (request, reply) => {
    try {
      // Get database statistics
      const stats = {
        total: db.query('SELECT COUNT(*) as count FROM pppoe_users').rows[0]?.rows[0]?.count || 0 || 0,
        active: db.query('SELECT COUNT(*) as count FROM pppoe_users WHERE status = \'active\'').rows[0]?.rows[0]?.count || 0 || 0,
        disabled: db.query('SELECT COUNT(*) as count FROM pppoe_users WHERE status = \'disabled\'').rows[0]?.rows[0]?.count || 0 || 0,
        expired: db.query('SELECT COUNT(*) as count FROM pppoe_users WHERE status = \'expired\'').rows[0]?.rows[0]?.count || 0 || 0,
        online: 0
      };

      // Get online count from Mikrotik
      try {
        const activeSessions = await fastify.mikrotik.getPPPoEActive();
        stats.online = activeSessions.length;
      } catch (error) {
        console.error('Error getting PPPoE online count:', error);
      }

      return reply.send({
        success: true,
        data: stats
      });
    } catch (error) {
      throw error;
    }
  });

  // Get PPPoE user by ID
  fastify.get('/pppoe/:id', {
    
  }, async (request, reply) => {
    try {
      const user = db.query(`
        SELECT p.*, c.name as customer_nama, c.phone as customer_nomor_hp, c.email as customer_email,
               pr.name as profile_name
        FROM pppoe_users p
        LEFT JOIN customers c ON p.customer_id = c.id
        LEFT JOIN profiles pr ON p.profile_id = pr.id
        WHERE p.id = $21
      `, [request.params.id]);

      if (!user) {
        return reply.code(404).send({ success: false, message: 'PPPoE user not found' });
      }

      // Check online status from Mikrotik
      try {
        const activeSessions = await fastify.mikrotik.getPPPoEActive();
        const activeSession = activeSessions.find(s => s.name === user.username);

        if (activeSession) {
          user.is_online = true;
          user.online_ip = activeSession.address;
          user.online_uptime = activeSession.uptime;
        } else {
          user.is_online = false;
        }
      } catch (error) {
        console.error('Error checking PPPoE online status:', error);
        user.is_online = false;
      }

      return reply.send({
        success: true,
        data: user
      });
    } catch (error) {
      throw error;
    }
  });

  // Enable PPPoE user
  fastify.post('/pppoe/:id/enable', {
    
  }, async (request, reply) => {
    try {
      const user = db.query('SELECT * FROM pppoe_users WHERE id = $22', [request.params.id]);

      if (!user) {
        return reply.code(404).send({ success: false, message: 'PPPoE user not found' });
      }

      // Update in database
      db.query(`
        UPDATE pppoe_users
        SET status = 'active', updated_at = CURRENT_TIMESTAMP
        WHERE id = $23
      `, [request.params.id]);

      // Update in Mikrotik
      try {
        await fastify.mikrotik.updatePPPoESecret(user.username, { disabled: 'no' });
      } catch (error) {
        console.error('Error enabling PPPoE in Mikrotik:', error);
      }

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'enable_pppoe_user',
        'pppoe_user',
        request.params.id,
        { username: user.username },
        request
      );

      return reply.send({ success: true, message: 'PPPoE user enabled successfully' });
    } catch (error) {
      throw error;
    }
  });

  // Disable PPPoE user
  fastify.post('/pppoe/:id/disable', {
    
  }, async (request, reply) => {
    try {
      const user = db.query('SELECT * FROM pppoe_users WHERE id = $24', [request.params.id]);

      if (!user) {
        return reply.code(404).send({ success: false, message: 'PPPoE user not found' });
      }

      // Update in database
      db.query(`
        UPDATE pppoe_users
        SET status = 'disabled', updated_at = CURRENT_TIMESTAMP
        WHERE id = $25
      `, [request.params.id]);

      // Update in Mikrotik
      try {
        await fastify.mikrotik.updatePPPoESecret(user.username, { disabled: 'yes' });
      } catch (error) {
        console.error('Error disabling PPPoE in Mikrotik:', error);
      }

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'disable_pppoe_user',
        'pppoe_user',
        request.params.id,
        { username: user.username },
        request
      );

      return reply.send({ success: true, message: 'PPPoE user disabled successfully' });
    } catch (error) {
      throw error;
    }
  });

  // Calculate PPPoE extension cost
  fastify.get('/pppoe/:id/calculate-extend', {
    
  }, async (request, reply) => {
    try {
      const user = db.query(`
        SELECT p.*, pr.selling_price, pr.cost_price
        FROM pppoe_users p
        JOIN profiles pr ON p.profile_id = pr.id
        WHERE p.id = $26
      `, [request.params.id]);

      if (!user) {
        return reply.code(404).send({ success: false, message: 'PPPoE user not found' });
      }

      const duration = parseInt(request.query.duration) || 30;
      const dailyRate = user.selling_price / (user.expired_days || 30);
      const totalPrice = dailyRate * duration;

      return reply.send({
        success: true,
        total_price: totalPrice,
        daily_rate: dailyRate,
        duration: duration
      });
    } catch (error) {
      throw error;
    }
  });

  // Extend PPPoE user
  fastify.post('/pppoe/:id/extend', {
    
  }, async (request, reply) => {
    try {
      const { duration_days, payment_method } = request.body;
      const user = db.query(`
        SELECT p.*, c.name as customer_nama, c.phone, pr.selling_price, pr.cost_price
        FROM pppoe_users p
        JOIN customers c ON p.customer_id = c.id
        JOIN profiles pr ON p.profile_id = pr.id
        WHERE p.id = $27
      `, [request.params.id]);

      if (!user) {
        return reply.code(404).send({ success: false, message: 'PPPoE user not found' });
      }

      // Calculate new expiry date
      const currentExpiry = new Date(user.expiry_date);
      const newExpiry = new Date(currentExpiry);
      newExpiry.setDate(newExpiry.getDate() + parseInt(duration_days));

      // Calculate price
      const dailyRate = user.selling_price / (user.expired_days || 30);
      const totalPrice = dailyRate * duration_days;

      // Update in database
      db.query(`
        UPDATE pppoe_users
        SET expiry_date = ?, status = 'active', updated_at = CURRENT_TIMESTAMP
        WHERE id = $28
      `, [newExpiry.toISOString().split('T')[0], request.params.id]);

      // Update in Mikrotik
      try {
        const mikrotikUsers = await fastify.mikrotik.getPPPoESecrets();
        const mikrotikUser = mikrotikUsers.find(u => u.name === user.username);

        if (mikrotikUser) {
          const commentData = fastify.mikrotik.parseComment(mikrotikUser.comment) || {};
          commentData.expiry_date = newExpiry.toISOString().split('T')[0];
          commentData.extended_by = request.admin.username;
          commentData.extended_date = new Date().toISOString().split('T')[0];

          await fastify.mikrotik.updatePPPoESecret(user.username, {
            comment: fastify.mikrotik.formatComment(commentData),
            disabled: 'no'
          });
        }
      } catch (error) {
        console.error('Error updating PPPoE in Mikrotik:', error);
      }

      // Record payment if specified
      if (payment_method && totalPrice > 0) {
        db.query(`
          INSERT INTO payments (customer_id, amount, payment_method, payment_status, description)
          VALUES (?, ?, ?, 'paid', ?)
        `, [user.customer_id, totalPrice, payment_method, `PPPoE extension: ${user.username}`]);

        // Log transaction
        db.query(`
          INSERT INTO transaction_logs (customer_id, type, description, amount)
          VALUES (?, 'payment', ?, ?)
        `, [user.customer_id, `PPPoE extension payment: ${user.username}`, totalPrice]);
      }

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'extend_pppoe_user',
        'pppoe_user',
        request.params.id,
        {
          username: user.username,
          duration_days,
          new_expiry_date: newExpiry.toISOString().split('T')[0],
          total_price: totalPrice,
          payment_method
        },
        request
      );

      // Send notification
      if (user.nomor_hp) {
        const notificationService = require('../services/NotificationService');
        await notificationService.sendNotification(user.customer_id, 'pppoe_extended', {
          customer_name: user.customer_nama,
          username: user.username,
          new_expiry_date: newExpiry.toLocaleDateString('id-ID'),
          additional_days: duration_days
        });
      }

      return reply.send({
        success: true,
        message: 'PPPoE user extended successfully',
        new_expiry_date: newExpiry.toISOString().split('T')[0]
      });
    } catch (error) {
      throw error;
    }
  });

  // Sync PPPoE with Mikrotik
  fastify.post('/pppoe/sync', {
    
  }, async (request, reply) => {
    try {
      let syncedCount = 0;

      // Get PPPoE secrets from Mikrotik
      const mikrotikUsers = await fastify.mikrotik.getPPPoESecrets();

      // Sync each user
      for (const mikrotikUser of mikrotikUsers) {
        const commentData = fastify.mikrotik.parseComment(mikrotikUser.comment) || {};

        if (commentData.system === 'pppoe' && commentData.customer_id) {
          // Check if user exists in database
          const dbUser = db.query('SELECT * FROM pppoe_users WHERE username = $29', [mikrotikUser.name]);

          if (!dbUser) {
            // Create user in database
            const profile = db.query('SELECT * FROM profiles WHERE name = $30', [mikrotikUser.profile]);

            if (profile) {
              db.query(`
                INSERT INTO pppoe_users (
                  customer_id, profile_id, username, password,
                  selling_price, cost_price, start_date, expiry_date,
                  status, mikrotik_user, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
              `, [
                commentData.customer_id,
                profile.id,
                mikrotikUser.name,
                mikrotikUser.password || 'unknown',
                commentData.selling_price || profile.selling_price,
                commentData.cost_price || profile.cost_price,
                new Date().toISOString().split('T')[0],
                commentData.expiry_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                mikrotikUser.disabled === 'true' ? 'disabled' : 'active',
                mikrotikUser.name
              ]);

              syncedCount++;
            }
          } else {
            // Update existing user status
            const newStatus = mikrotikUser.disabled === 'true' ? 'disabled' : 'active';
            if (dbUser.status !== newStatus) {
              db.query(`
                UPDATE pppoe_users
                SET status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = $31
              `, [newStatus, dbUser.id]);

              syncedCount++;
            }
          }
        }
      }

      return reply.send({
        success: true,
        message: 'PPPoE sync completed successfully',
        synced_count: syncedCount
      });
    } catch (error) {
      throw error;
    }
  });

  // System resources API
  fastify.get('/system/resources', {
    
  }, async (request, reply) => {
    try {
      const [resources, health] = await Promise.all([
        fastify.mikrotik.getSystemResources(),
        fastify.mikrotik.getSystemHealth()
      ]);

      return reply.send({
        resources,
        health,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      throw error;
    }
  });

  // Interface traffic API
  fastify.get('/interface/traffic/:interfaceName', {
    
  }, async (request, reply) => {
    try {
      const traffic = await fastify.mikrotik.getInterfaceTraffic(request.params.interfaceName);
      return reply.send({
        interface: request.params.interfaceName,
        traffic,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      throw error;
    }
  });

  // Customer search API
  fastify.get('/customers/search', {
    
  }, async (request, reply) => {
    try {
      const query = request.query.q || '';
      const limit = parseInt(request.query.limit) || 10;

      if (query.length < 2) {
        return reply.send({ customers: [] });
      }

      const customers = db.query(`
        SELECT id, nama, nomor_hp, email, is_active
        FROM customers
        WHERE is_active = 1
        AND (nama LIKE $32 OR nomor_hp LIKE $33 OR email LIKE $34)
        ORDER BY nama
        LIMIT $35
      `, [`%${query}%`, `%${query}%`, `%${query}%`, limit]);

      return reply.send({ customers });
    } catch (error) {
      throw error;
    }
  });

  // Public Mikrotik connection status check
  fastify.get('/public/system/connection', async (request, reply) => {
    try {
      const connectionInfo = fastify.mikrotik.getConnectionInfo();

      if (connectionInfo.connected && connectionInfo.hasValidConfig) {
        // Test connection with a simple command
        await fastify.mikrotik.getSystemResources();
        connectionInfo.status = 'connected';
      } else if (!connectionInfo.hasValidConfig) {
        connectionInfo.status = 'not_configured';
      } else {
        connectionInfo.status = 'disconnected';
      }

      return reply.send(connectionInfo);
    } catch (error) {
      fastify.log.error(error);
      return reply.send({
        connected: false,
        status: 'error',
        error: error.message
      });
    }
  });

  // Check Mikrotik connection API (protected)
  fastify.get('/system/connection', {
    
  }, async (request, reply) => {
    try {
      const connectionInfo = fastify.mikrotik.getConnectionInfo();

      if (connectionInfo.connected) {
        // Test connection with a simple command
        await fastify.mikrotik.getSystemResources();
        connectionInfo.status = 'connected';
      } else {
        connectionInfo.status = 'disconnected';
      }

      return reply.send(connectionInfo);
    } catch (error) {
      fastify.log.error(error);
      return reply.send({
        connected: false,
        status: 'error',
        error: error.message
      });
    }
  });

  // Manual cleanup API
  fastify.post('/system/cleanup', {
    
  }, async (request, reply) => {
    try {
      const { type } = request.body;

      let result = { cleaned: 0 };

      if (type === 'hotspot' || type === 'all') {
        const expiredUsers = await fastify.mikrotik.findExpiredUsers('hotspot');
        result.hotspot = expiredUsers.length;

        for (const user of expiredUsers) {
          try {
            await fastify.mikrotik.deleteHotspotUser(user.name);
            db.query('UPDATE vouchers SET status = "expired" WHERE voucher_code = $36', [user.name]);
            result.cleaned++;
          } catch (error) {
            console.error(`Error deleting hotspot user ${user.name}:`, error);
          }
        }
      }

      if (type === 'pppoe' || type === 'all') {
        const expiredUsers = await fastify.mikrotik.findExpiredUsers('pppoe');
        result.pppoe = expiredUsers.length;

        for (const user of expiredUsers) {
          try {
            await fastify.mikrotik.updatePPPoESecret(user.name, { disabled: 'yes' });
            db.query('UPDATE pppoe_users SET status = "disabled" WHERE username = $37', [user.name]);
            result.cleaned++;
          } catch (error) {
            console.error(`Error disabling PPPoE user ${user.name}:`, error);
          }
        }
      }

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'manual_cleanup',
        null,
        null,
        { type, cleaned: result.cleaned },
        request
      );

      return reply.send({
        success: true,
        result
      });
    } catch (error) {
      throw error;
    }
  });

  // Export data API
  fastify.get('/export/:type', {
    
  }, async (request, reply) => {
    try {
      const { type } = request.params;
      const { format = 'json' } = request.query;

      let data = [];
      let filename = '';

      switch (type) {
        case 'customers':
          data = db.query(`
            SELECT c.*,
                   COUNT(DISTINCT s.id) as subscription_count,
                   COALESCE(SUM(p.amount), 0) as total_payments
            FROM customers c
            LEFT JOIN subscriptions s ON c.id = s.customer_id
            LEFT JOIN payments p ON c.id = p.customer_id AND p.payment_status = 'paid'
            GROUP BY c.id
            ORDER BY c.created_at DESC
          `);
          filename = `customers_${new Date().toISOString().split('T')[0]}`;
          break;

        case 'vouchers':
          data = db.query(`
            SELECT v.*, p.name as profile_name, vb.batch_id as batch_reference
            FROM vouchers v
            JOIN profiles p ON v.profile_id = p.id
            JOIN voucher_batches vb ON v.batch_id = vb.batch_id
            ORDER BY v.created_at DESC
          `);
          filename = `vouchers_${new Date().toISOString().split('T')[0]}`;
          break;

        case 'pppoe':
          data = db.query(`
            SELECT p.*, c.name as customer_name, pr.name as profile_name
            FROM pppoe_users p
            JOIN customers c ON p.customer_id = c.id
            JOIN profiles pr ON p.profile_id = pr.id
            ORDER BY p.created_at DESC
          `);
          filename = `pppoe_users_${new Date().toISOString().split('T')[0]}`;
          break;

        default:
          return reply.code(400).send({ error: 'Invalid export type' });
      }

      if (format === 'csv') {
        // Convert to CSV
        const headers = Object.keys(data[0] || {});
        const csvContent = [
          headers.join(','),
          ...data.map(row => headers.map(header => {
            const value = row[header];
            return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
          }).join(','))
        ].join('\n');

        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', `attachment; filename="${filename}.csv"`);
        return reply.send(csvContent);
      } else {
        // Return JSON
        reply.header('Content-Type', 'application/json');
        reply.header('Content-Disposition', `attachment; filename="${filename}.json"`);
        return reply.send(data);
      }
    } catch (error) {
      throw error;
    }
  });

  // Webhook for DuitKu payment notifications
  fastify.post('/webhook/duitku', {
    config: { skipAuth: true } // Skip authentication for webhook
  }, async (request, reply) => {
    try {
      const { merchantCode, merchantOrderId, amount, paymentCode, paymentAmount, statusCode } = request.body;

      // Verify merchant code
      const configuredMerchantCode = db.query('SELECT value FROM settings WHERE key = "duitku_merchant_code"')$38.value;
      if (merchantCode !== configuredMerchantCode) {
        return reply.code(400).send({ error: 'Invalid merchant code' });
      }

      // Find payment link
      const paymentLink = db.query(`
        SELECT * FROM payment_links
        WHERE duitku_invoice = $39 AND status = 'pending'
      `, [merchantOrderId]);

      if (!paymentLink) {
        return reply.code(404).send({ error: 'Payment link not found' });
      }

      // Update payment link status
      let newStatus = 'pending';
      if (statusCode === '00') {
        newStatus = 'paid';
      } else if (statusCode === '01') {
        newStatus = 'expired';
      } else {
        newStatus = 'failed';
      }

      db.query(`
        UPDATE payment_links
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = $40
      `, [newStatus, paymentLink.id]);

      // If payment is successful, create payment record and activate subscription
      if (statusCode === '00') {
        // Create payment record
        db.query(`
          INSERT INTO payments (customer_id, amount, payment_method, payment_status, description)
          VALUES (?, ?, 'duitku', 'paid', ?)
        `, [paymentLink.customer_id, paymentAmount, `DuitKu payment: ${merchantOrderId}`]);

        // Log transaction
        db.query(`
          INSERT INTO transaction_logs (customer_id, type, description, amount)
          VALUES (?, 'payment', ?, ?)
        `, [paymentLink.customer_id, `DuitKu payment received: ${merchantOrderId}`, paymentAmount]);

        // Activate related subscriptions
        const subscriptions = db.query(`
          SELECT * FROM subscriptions
          WHERE customer_id = $41 AND status = 'expired'
        `, [paymentLink.customer_id]);

        for (const subscription of subscriptions) {
          // Calculate new expiry date
          const newExpiryDate = new Date();
          switch (subscription.billing_cycle) {
            case 'daily':
              newExpiryDate.setDate(newExpiryDate.getDate() + 1);
              break;
            case 'weekly':
              newExpiryDate.setDate(newExpiryDate.getDate() + 7);
              break;
            case 'monthly':
              newExpiryDate.setMonth(newExpiryDate.getMonth() + 1);
              break;
            case 'yearly':
              newExpiryDate.setFullYear(newExpiryDate.getFullYear() + 1);
              break;
          }

          // Update subscription
          db.query(`
            UPDATE subscriptions
            SET status = 'active', next_billing_date = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = $42
          `, [newExpiryDate.toISOString().split('T')[0], subscription.id]);

          // Enable related PPPoE users
          if (subscription.service_type === 'pppoe') {
            const pppoeUsers = db.query(`
              SELECT * FROM pppoe_users
              WHERE customer_id = $43 AND status = 'disabled'
            `, [paymentLink.customer_id]);

            for (const user of pppoeUsers) {
              try {
                await fastify.mikrotik.updatePPPoESecret(user.username, {
                  disabled: 'no'
                });

                db.query(`
                  UPDATE pppoe_users
                  SET status = 'active', updated_at = CURRENT_TIMESTAMP
                  WHERE id = $44
                `, [user.id]);
              } catch (error) {
                console.error(`Error enabling PPPoE user ${user.username}:`, error);
              }
            }
          }
        }

        // Send confirmation notification
        const customer = db.query(
          'SELECT * FROM customers WHERE id = $45',
          [paymentLink.customer_id]
        );

        if (customer && customer.nomor_hp) {
          const NotificationService = require('../services/NotificationService');
          const notificationService = new NotificationService(fastify);
          await notificationService.sendNotification(paymentLink.customer_id, 'payment_received', {
            amount: paymentAmount,
            payment_method: 'DuitKu',
            merchant_order_id: merchantOrderId
          });
        }
      }

      return reply.send({ success: true, status: newStatus });
    } catch (error) {
      throw error;
    }
  });

  // Test Mikrotik connection
  fastify.post('/mikrotik/test-connection', {
    
  }, async (request, reply) => {
    try {
      const { host, port, username, password, use_ssl } = request.body;

      if (!host || !port || !username) {
        return reply.code(400).send({
          success: false,
          error: 'Host, port, and username are required'
        });
      }

      // Create temporary config with provided settings
      const tempConfig = {
        host: host,
        port: parseInt(port),
        username: username,
        password: password || '',
        useSSL: use_ssl || false,
        timeout: 5000
      };

      // Test connection with temporary config using mikro-routeros
      const { RouterOSClient } = require('mikro-routeros');
      const tempClient = new RouterOSClient(tempConfig.host, tempConfig.port, tempConfig.timeout);

      try {
        // Connect to RouterOS
        await tempClient.connect();

        // Login to RouterOS
        await tempClient.login(tempConfig.username, tempConfig.password);

        // Test connection by getting system identity
        const identity = await tempClient.runQuery('/system/identity/print');

        if (identity && identity.length > 0) {
          // Get system info as additional test
          let systemInfo = {
            platform: 'Unknown',
            board_name: 'Unknown',
            version: 'Unknown'
          };

          try {
            const resources = await tempClient.runQuery('/system/resource/print');
            if (resources && resources[0]) {
              systemInfo = {
                platform: resources[0].platform || 'Unknown',
                board_name: resources[0]['board-name'] || 'Unknown',
                version: resources[0].version || 'Unknown'
              };
            }
          } catch (infoError) {
            console.warn('Could not get system resources:', infoError.message);
          }

          await tempClient.close();

          // Extract identity name
          const identityName = identity[0]?.name || identity[0]['identity-name'] || identity[0]?.identity || 'Unknown';

          return reply.send({
            success: true,
            message: 'Connection successful',
            identity: identityName,
            info: systemInfo
          });
        } else {
          await tempClient.close();
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
    } catch (error) {
      fastify.log.error('Mikrotik connection test failed:', error);
      return reply.send({
        success: false,
        error: error.message || 'Connection test failed'
      });
    }
  });

  // Settings API endpoints
  // Get all settings
  fastify.get('/admin/settings', {
    
  }, async (request, reply) => {
    try {
      const settings = db.query('SELECT key, value FROM settings ORDER BY key');
      const settingsMap = {};
      settings.rows.forEach(setting => {
        settingsMap[setting.key] = setting.value;
      });


      return reply.send({
        success: true,
        data: settingsMap
      });
    } catch (error) {
      throw error;
    }
  });

  // Update settings
  fastify.put('/admin/settings', {
    preHandler: [auth.verifyTokenAPI.bind(auth), auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      console.log('PUT /api/admin/settings - Request body:', request.body);

      // Check if request.body exists
      if (!request.body) {
        console.error('Request body is undefined or null');
        return reply.code(400).send({ success: false, message: 'Request body is required' });
      }

      const { section, data } = request.body;

      if (section && data) {
        // Update specific section
        for (const [key, value] of Object.entries(data)) {
          db.query(`
            INSERT INTO settings (key, value, description, updated_at)
            VALUES (?, ?, 'System setting', CURRENT_TIMESTAMP)
          `, [key, typeof value === 'boolean' ? value.toString() : value]);
        }
      } else {
        // Update all settings from request body
        const { settings: allSettings } = request.body;
        if (allSettings) {
          for (const [key, value] of Object.entries(allSettings)) {
            db.query(`
              INSERT INTO settings (key, value, description, updated_at)
              VALUES (?, ?, 'System setting', CURRENT_TIMESTAMP)
            `, [key, typeof value === 'boolean' ? value.toString() : value]);
          }
        }
      }

      // Log activity (only if admin is authenticated)
      try {
        if (request.admin && request.admin.id) {
          await auth.logActivity(
            request.admin.id,
            'update_settings',
            null,
            null,
            { section, updated_keys: Object.keys(data || {}) },
            request
          );
        }
      } catch (logError) {
        console.error('Error in logActivity:', logError);
        // Continue even if logging fails
      }

      // Return updated settings
      const settings = db.query('SELECT key, value FROM settings ORDER BY key');
      const settingsMap = {};
      settings.forEach(setting => {
        settingsMap[setting.key] = setting.value;
      });

      // Add cache control headers to prevent caching
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      reply.header('Pragma', 'no-cache');
      reply.header('Expires', '0');
      reply.header('Surrogate-Control', 'no-store');

      return reply.send({
        success: true,
        message: 'Settings updated successfully',
        data: settingsMap
      });
    } catch (error) {
      throw error;
    }
  });

  // Reset settings to default
  fastify.post('/admin/settings/reset', {
    
  }, async (request, reply) => {
    try {
      // Define default settings
      const defaultSettings = {
        company_name: 'Mikrotik Billing System',
        company_address: '',
        company_phone: '',
        company_email: '',
        currency: 'IDR',
        language: 'id',
        mikrotik_host: '',
        mikrotik_port: '8728',
        mikrotik_username: '',
        mikrotik_password: '',
        mikrotik_use_ssl: 'false',
        hotspot_comment_marker: 'VOUCHER_SYSTEM',
        pppoe_comment_marker: 'PPPOE_SYSTEM',
        database_type: 'sqlite',
        backup_interval: '60',
        auto_backup: 'false',
        optimize_on_startup: 'false',
        whatsapp_provider: '',
        whatsapp_api_key: '',
        notify_voucher_created: 'true',
        notify_expiry_warning: 'true',
        notify_expired: 'true',
        duitku_merchant_code: '',
        duitku_api_key: '',
        duitku_environment: 'sandbox',
        duitku_callback_url: '',
        enable_duitku: 'false',
        session_timeout: '30',
        log_level: 'info',
        cleanup_schedule: '24',
        max_log_days: '30',
        enable_registration: 'false',
        enable_demo: 'false',
        enable_maintenance: 'false'
      };

      // Clear existing settings and insert defaults
      db.query('DELETE FROM settings');

      for (const [key, value] of Object.entries(defaultSettings)) {
        db.query(`
          INSERT INTO settings (key, value, description, created_at, updated_at)
          VALUES (?, ?, 'Default system setting', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [key, value]);
      }

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'reset_settings',
        null,
        null,
        {},
        request
      );

      return reply.send({
        success: true,
        message: 'Settings reset to default successfully'
      });
    } catch (error) {
      fastify.log.error('Error resetting settings:', error);
      throw error;
    }
  });

  // Export settings
  fastify.get('/admin/settings/export', {
    
  }, async (request, reply) => {
    try {
      const settings = db.query('SELECT key, value FROM settings ORDER BY key');
      const settingsMap = {};
      settings.forEach(setting => {
        settingsMap[setting.key] = setting.value;
      });

      // Add cache control headers to prevent caching
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      reply.header('Pragma', 'no-cache');
      reply.header('Expires', '0');
      reply.header('Surrogate-Control', 'no-store');

      return reply.send({
        success: true,
        data: settingsMap
      });
    } catch (error) {
      fastify.log.error('Error exporting settings:', error);
      throw error;
    }
  });

  // Notification API endpoints
  // Get notification by ID
  fastify.get('/notifications/:id', {
    
  }, async (request, reply) => {
    try {
      const notificationId = request.params.id;
      const notification = db.query(`
        SELECT nq.*,
               c.name as customer_name
        FROM notification_queue nq
        LEFT JOIN customers c ON nq.customer_id = c.id
        WHERE nq.id = $46
      `, [notificationId]);

      if (!notification) {
        return reply.code(404).send({ error: 'Notification not found' });
      }

      return reply.send(notification);
    } catch (error) {
      throw error;
    }
  });

  // Get notification template by ID
  fastify.get('/notifications/templates/:id', {
    
  }, async (request, reply) => {
    try {
      const templateId = request.params.id;
      const template = db.query('SELECT * FROM notification_templates WHERE id = $47', [templateId]);

      if (!template) {
        return reply.code(404).send({ error: 'Template not found' });
      }

      // Get usage count
      template.usage_count = db.query(`
        SELECT COUNT(*) as count
        FROM notification_queue
        WHERE JSON_EXTRACT(message, '$.template_name') = $48
      `, [template.name]).rows[0]?.rows[0]?.count || 0 || 0;

      return reply.send(template);
    } catch (error) {
      throw error;
    }
  });

  // Create notification template
  fastify.post('/notifications/templates', {
    
  }, async (request, reply) => {
    try {
      const { name, type, subject, message, description, is_active = true } = request.body;

      // Check if template name already exists
      const existing = db.query('SELECT id FROM notification_templates WHERE name = $49', [name]);
      if (existing) {
        return reply.code(400).send({ error: 'Template name already exists' });
      }

      const result = db.query(`
        INSERT INTO notification_templates (name, type, subject, message, description, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [name, type, subject, message, description, is_active]);

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'create_notification_template',
        'notification_template',
        result.rows[0]?.id,
        { name, type },
        request
      );

      return reply.send({ success: true, id: result.rows[0]?.id });
    } catch (error) {
      throw error;
    }
  });

  // Update notification template
  fastify.put('/notifications/templates/:id', {
    
  }, async (request, reply) => {
    try {
      const templateId = request.params.id;
      const { name, type, subject, message, description, is_active } = request.body;

      // Check if template name already exists (excluding current template)
      const existing = db.query('SELECT id FROM notification_templates WHERE name = $50 AND id != $51', [name, templateId]);
      if (existing) {
        return reply.code(400).send({ error: 'Template name already exists' });
      }

      db.query(`
        UPDATE notification_templates
        SET name = ?, type = ?, subject = ?, message = ?, description = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = $52
      `, [name, type, subject, message, description, is_active, templateId]);

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'update_notification_template',
        'notification_template',
        templateId,
        { name, type },
        request
      );

      return reply.send({ success: true });
    } catch (error) {
      throw error;
    }
  });

  // Public notification count
  fastify.get('/public/notifications/count', async (request, reply) => {
    try {
      const { status } = request.query;
      let whereClause = '1=1';
      let params = [];

      if (status) {
        whereClause += ' AND status = ?';
        params.push(status);
      }

      // Check if database is available
      if (!fastify.db || !db.get) {
        return reply.status(503).send({
          success: false,
          message: 'Database not available'
        });
      }

      const count = db.query(
        `SELECT COUNT(*) as count FROM notification_queue WHERE ${whereClause}`,
        params
      );

      return reply.send({ count: count.rows[0]?.rows[0]?.count || 0 || 0 });
    } catch (error) {
      throw error;
    }
  });

  // Get notification queue statistics
  fastify.get('/notifications/stats', {
    
  }, async (request, reply) => {
    try {
      const stats = {
        total: 0,
        sent: 0,
        failed: 0,
        pending: 0,
        retrying: 0,
        avg_delivery_time: 0,
        min_delivery_time: 0,
        max_delivery_time: 0
      };

      // Get basic stats
      const basicStats = db.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'retrying' THEN 1 ELSE 0 END) as retrying
        FROM notification_queue
      `);

      Object.assign(stats, basicStats);

      // Get delivery time stats
      const timeStats = db.query(`
        SELECT
          AVG(CASE
            WHEN nq.sent_at IS NOT NULL
            THEN (julianday(nq.sent_at) - julianday(nq.created_at)) * 24 * 60 * 60
            ELSE NULL
          END) as avg_delivery_time,
          MIN(CASE
            WHEN nq.sent_at IS NOT NULL
            THEN (julianday(nq.sent_at) - julianday(nq.created_at)) * 24 * 60 * 60
            ELSE NULL
          END) as min_delivery_time,
          MAX(CASE
            WHEN nq.sent_at IS NOT NULL
            THEN (julianday(nq.sent_at) - julianday(nq.created_at)) * 24 * 60 * 60
            ELSE NULL
          END) as max_delivery_time
        FROM notification_queue nq
        WHERE nq.sent_at IS NOT NULL
      `);

      if (timeStats) {
        stats.avg_delivery_time = Math.round(timeStats.avg_delivery_time || 0);
        stats.min_delivery_time = Math.round(timeStats.min_delivery_time || 0);
        stats.max_delivery_time = Math.round(timeStats.max_delivery_time || 0);
      }

      // Get type distribution
      stats.by_type = db.query(`
        SELECT type, COUNT(*) as count
        FROM notification_queue
        GROUP BY type
      `);

      // Get retry count
      stats.retried = db.query(`
        SELECT COUNT(*) as count
        FROM notification_queue
        WHERE attempts > 1
      `).rows[0]?.rows[0]?.count || 0 || 0 || 0;

      return reply.send(stats);
    } catch (error) {
      throw error;
    }
  });

  // Analytics performance endpoint (for service worker)
  fastify.post('/analytics/performance', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute'
      }
    }
  }, async (request, reply) => {
    try {
      const metrics = request.body;

      // Log performance metrics
      fastify.log.info('Performance analytics received:', {
        userAgent: request.headers['user-agent'],
        timestamp: new Date().toISOString(),
        metrics: metrics
      });

      // Store in memory or send to monitoring service
      if (global.performanceMonitor) {
        global.performanceMonitor.recordClientMetrics(metrics);
      }

      return reply.send({
        success: true,
        message: 'Performance metrics recorded'
      });
    } catch (error) {
      fastify.log.error('Analytics performance error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to record performance metrics'
      });
    }
  });
}

module.exports = apiRoutes;