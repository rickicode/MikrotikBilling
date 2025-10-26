const AuthMiddleware = require('../middleware/auth');
const { db } = require('../database/DatabaseManager');
const MikrotikClient = require('../services/MikrotikClient');

async function profileRoutes(fastify, options) {
  const auth = new AuthMiddleware(fastify);

  // Profile list
  fastify.get('/', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const type = request.query.type || '';

      let whereClause = '';
      const params = [];

      if (type) {
        whereClause = 'WHERE profile_type = $1';
        params.push(type);
      }

      const profiles = await db.query(`
        SELECT p.*,
               COUNT(DISTINCT v.id) as voucher_count,
               COUNT(DISTINCT pp.id) as pppoe_count
        FROM profiles p
        LEFT JOIN vouchers v ON p.id = v.profile_id
        LEFT JOIN pppoe_users pp ON p.id = pp.profile_id
        ${whereClause}
        GROUP BY p.id
        ORDER BY p.profile_type, p.name
      `, params);

    // Check sync status with Mikrotik for each profile
    const connectionInfo = fastify.mikrotik.getConnectionInfo();
    let mikrotikProfiles = [];

    if (connectionInfo.connected) {
      try {
        if (!type || type === 'hotspot') {
          const hotspotProfiles = await fastify.mikrotik.getHotspotProfiles();
          mikrotikProfiles = mikrotikProfiles.concat(hotspotProfiles);
        }
        if (!type || type === 'pppoe') {
          const pppoeProfiles = await fastify.mikrotik.getPPPoEProfiles();
          mikrotikProfiles = mikrotikProfiles.concat(pppoeProfiles);
        }
      } catch (error) {
        console.error('Error checking Mikrotik profiles:', error);
      }
    }

    // Add sync status to each profile
    const profilesWithSync = profiles.rows.map(profile => {
      const existsInMikrotik = mikrotikProfiles.some(mp => mp.name === profile.name);
      return {
        ...profile,
        is_synced: existsInMikrotik
      };
    });

      return reply.view('profiles/index', {
        admin: request.admin,
        profiles: profilesWithSync,
        type
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send('Internal Server Error');
    }
  });

  // Create profile form
  fastify.get('/create', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    return reply.view('profiles/create', {
      admin: request.admin,
      profile: {}
    });
  });

  // Create profile
  fastify.post('/', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    const { name, type, bandwidth_up, bandwidth_down, time_limit, price_sell, price_cost, managed_by } = request.body;

    try {
      // Check if profile name exists
      const existing = await db.query(`SELECT id FROM profiles WHERE name = $1`, [name]);

      if (existing.rows && existing.rows.length > 0) {
        return reply.view('profiles/create', {
          admin: request.admin,
          profile: { name, type, bandwidth_up, bandwidth_down, time_limit, price_sell, price_cost, managed_by },
          error: 'Profile name already exists'
        });
      }

      // Create profile in database first
      const result = await db.query(`
        INSERT INTO profiles (name, profile_type, cost_price, selling_price, speed_limit, data_limit, is_active, mikrotik_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [
        name,
        type,
        price_cost || 0,
        price_sell || 0,
        bandwidth_down ? `${bandwidth_up}/${bandwidth_down}` : null,
        time_limit,
        true,
        name
      ]);

      const profileId = result.rows && result.rows.length > 0 ? result.rows[0].id : null;

      // Check Mikrotik connection
      const connectionInfo = fastify.mikrotik.getConnectionInfo();
      if (connectionInfo.connected) {
        try {
          // Create profile in RouterOS with 'system' comment marker
          if (type === 'hotspot') {
            await fastify.mikrotik.createHotspotProfile(name, price_sell, price_cost);

            // Inject automatic scripts for 'system'-managed profiles
            try {
              await fastify.mikrotik.injectHotspotProfileScripts(name);
              console.log(`HIJINETWORK: Automatic scripts injected into hotspot profile: ${name}`);
            } catch (scriptError) {
              console.error('Error injecting automatic scripts:', scriptError);
              // Continue with profile creation even if script injection fails
            }
          } else if (type === 'pppoe') {
            await fastify.mikrotik.createPPPoEProfile(name, price_sell, price_cost);

            // Inject automatic scripts for 'system'-managed profiles
            try {
              await fastify.mikrotik.injectPPPoEProfileScripts(name);
              console.log(`HIJINETWORK: Automatic scripts injected into PPPoE profile: ${name}`);
            } catch (scriptError) {
              console.error('Error injecting automatic scripts:', scriptError);
              // Continue with profile creation even if script injection fails
            }
          }

          // Note: mikrotik_synced column doesn't exist in the new schema
          // await db.update('profiles', { mikrotik_synced: 1 }, { id: result.id });

          console.log(`HIJINETWORK: Profile ${name} created and synced to RouterOS successfully`);
        } catch (mikrotikError) {
          console.error('Error creating profile in RouterOS:', mikrotikError);
          // Profile created in database but not in RouterOS - user can sync later
        }
      }

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'create_profile',
        'profile',
        profileId,
        { name, type, price_sell, price_cost },
        request
      );

      return reply.redirect('/profiles?success=Profile created successfully');
    } catch (error) {
      console.error('Error creating profile:', error);
      return reply.view('profiles/create', {
        admin: request.admin,
        profile: { name, type, bandwidth_up, bandwidth_down, time_limit, price_sell, price_cost, managed_by },
        error: 'Failed to create profile: ' + error.message
      });
    }
  });

  // Update profile
  fastify.put('/:id', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    const { id } = request.params;
    const { name, type, bandwidth_up, bandwidth_down, time_limit, price_sell, price_cost, managed_by } = request.body;

    try {
      // Check if profile exists
      const existing = await db.query(`SELECT id FROM profiles WHERE id = $1`, [id]);
      if (!existing.rows || existing.rows.length === 0) {
        return reply.code(404).send({ success: false, message: 'Profile not found' });
      }

      // Check if new name conflicts with existing profiles (excluding current)
      const nameConflict = await db.query(`SELECT id FROM profiles WHERE name = $1 AND id != $2`, [name, id]);
      if (nameConflict.rows && nameConflict.rows.length > 0) {
        return reply.send({ success: false, message: 'Profile name already exists' });
      }

      // Update profile in database
      await db.query(`
        UPDATE profiles
        SET name = $1, profile_type = $2, cost_price = $3, selling_price = $4,
            speed_limit = $5, data_limit = $6, updated_at = CURRENT_TIMESTAMP,
            mikrotik_name = $7
        WHERE id = $8
      `, [
        name,
        type,
        price_cost || 0,
        price_sell || 0,
        bandwidth_down ? `${bandwidth_up}/${bandwidth_down}` : null,
        time_limit,
        name,
        id
      ]);

      // Check Mikrotik connection and update RouterOS
      const connectionInfo = fastify.mikrotik.getConnectionInfo();
      if (connectionInfo.connected) {
        try {
          // Update profile in RouterOS
          if (type === 'hotspot') {
            await fastify.mikrotik.updateHotspotProfile(name, price_sell, price_cost);
            // Re-inject scripts
            try {
              await fastify.mikrotik.injectHotspotProfileScripts(name);
              console.log(`HIJINETWORK: Scripts re-injected into hotspot profile: ${name}`);
            } catch (scriptError) {
              console.error('Error re-injecting scripts:', scriptError);
            }
          } else if (type === 'pppoe') {
            await fastify.mikrotik.updatePPPoEProfile(name, price_sell, price_cost);
            // Re-inject scripts
            try {
              await fastify.mikrotik.injectPPPoEProfileScripts(name);
              console.log(`HIJINETWORK: Scripts re-injected into PPPoE profile: ${name}`);
            } catch (scriptError) {
              console.error('Error re-injecting scripts:', scriptError);
            }
          }
          console.log(`HIJINETWORK: Profile ${name} updated and synced to RouterOS successfully`);
        } catch (mikrotikError) {
          console.error('Error updating profile in RouterOS:', mikrotikError);
          // Profile updated in database but not in RouterOS
        }
      }

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'update_profile',
        'profile',
        id,
        { name, type, price_sell, price_cost },
        request
      );

      return reply.send({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
  });

  // Delete profile
  fastify.delete('/:id', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      // Get profile info for deletion
      const profile = await db.query('SELECT * FROM profiles WHERE id = $1', [id]);
      if (!profile.rows || profile.rows.length === 0) {
        return reply.code(404).send({ success: false, message: 'Profile not found' });
      }

      // Check if profile has associated vouchers or PPPoE users
      const voucherCount = await db.query('SELECT COUNT(*) as count FROM vouchers WHERE profile_id = $1', [id]);
      const pppoeCount = await db.query('SELECT COUNT(*) as count FROM pppoe_users WHERE profile_id = $1', [id]);

      if (voucherCount.rows[0].count > 0 || pppoeCount.rows[0].count > 0) {
        return reply.send({
          success: false,
          message: 'Cannot delete profile with associated vouchers or PPPoE users'
        });
      }

      // Delete from Mikrotik if connected
      const connectionInfo = fastify.mikrotik.getConnectionInfo();
      if (connectionInfo.connected) {
        try {
          const profileData = profile.rows[0];
          if (profileData.profile_type === 'hotspot') {
            await fastify.mikrotik.deleteHotspotProfile(profileData.name);
          } else if (profileData.profile_type === 'pppoe') {
            await fastify.mikrotik.deletePPPoEProfile(profileData.name);
          }
        } catch (mikrotikError) {
          console.error('Error deleting profile from Mikrotik:', mikrotikError);
        }
      }

      // Delete from database
      await db.query('DELETE FROM profiles WHERE id = $1', [id]);

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'delete_profile',
        'profile',
        id,
        { name: profile.rows[0].name, type: profile.rows[0].profile_type },
        request
      );

      return reply.send({ success: true, message: 'Profile deleted successfully' });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, message: 'Internal Server Error' });
    }
  });
}

module.exports = profileRoutes;
