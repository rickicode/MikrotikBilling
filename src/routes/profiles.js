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

      return reply.view('profiles/index', {
        admin: request.admin,
        profiles,
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
      fastify.log.error(error);
      return reply.view('profiles/create', {
        admin: request.admin,
        profile: { name, type, bandwidth_up, bandwidth_down, time_limit, price_sell, price_cost, managed_by },
        error: 'Failed to create profile'
      });
    }
  });

  // Edit profile form
  fastify.get('/:id/edit', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    try {
      const profileResult = await db.query('SELECT * FROM profiles WHERE id = $1', [request.params.id]);

      if (!profileResult.rows || profileResult.rows.length === 0) {
        return reply.code(404).send('Profile not found');
      }

      const profile = profileResult.rows[0];

      return reply.view('profiles/edit', {
        admin: request.admin,
        profile
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send('Internal Server Error');
    }
  });

  // Update profile
  fastify.put('/:id', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    const { name, type, bandwidth_up, bandwidth_down, time_limit, price_sell, price_cost, managed_by } = request.body;

    try {
      // Check if profile name exists (excluding current)
      const existing = await db.query(`SELECT id FROM profiles WHERE name = $1 AND id != $2`, [name, request.params.id]);

      if (existing.rows && existing.rows.length > 0) {
        return reply.code(400).send({ error: 'Profile name already exists' });
      }

      // Update profile
      await db.query(`
        UPDATE profiles
        SET name = $1, profile_type = $2, cost_price = $3, selling_price = $4,
            speed_limit = $5, data_limit = $6, mikrotik_name = $7, updated_at = CURRENT_TIMESTAMP
        WHERE id = $8
      `, [
        name,
        type,
        price_cost || 0,
        price_sell || 0,
        bandwidth_down ? `${bandwidth_up}/${bandwidth_down}` : null,
        time_limit,
        name,
        request.params.id
      ]);

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'update_profile',
        'profile',
        request.params.id,
        { name, type, price_sell, price_cost },
        request
      );

      return reply.send({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
      fastify.log.error(error);
      throw error;
    }
  });

  // Update profile (POST for backward compatibility)
  fastify.post('/:id', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    const { name, type, bandwidth_up, bandwidth_down, time_limit, price_sell, price_cost, managed_by } = request.body;

    try {
      // Check if profile name exists (excluding current)
      const existing = await db.query(`SELECT id FROM profiles WHERE name = $1 AND id != $2`, [name, request.params.id]);

      if (existing.rows && existing.rows.length > 0) {
        return reply.view('profiles/edit', {
          admin: request.admin,
          profile: { id: request.params.id, name, type, bandwidth_up, bandwidth_down, time_limit, price_sell, price_cost, managed_by },
          error: 'Profile name already exists'
        });
      }

      // Update profile
      await db.query(`
        UPDATE profiles
        SET name = $1, profile_type = $2, cost_price = $3, selling_price = $4,
            speed_limit = $5, data_limit = $6, mikrotik_name = $7, updated_at = CURRENT_TIMESTAMP
        WHERE id = $8
      `, [
        name,
        type,
        price_cost || 0,
        price_sell || 0,
        bandwidth_down ? `${bandwidth_up}/${bandwidth_down}` : null,
        time_limit,
        name,
        request.params.id
      ]);

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'update_profile',
        'profile',
        request.params.id,
        { name, type, price_sell, price_cost },
        request
      );

      return reply.redirect('/profiles?success=Profile updated successfully');
    } catch (error) {
      fastify.log.error(error);
      return reply.view('profiles/edit', {
        admin: request.admin,
        profile: { id: request.params.id, name, type, bandwidth_up, bandwidth_down, time_limit, price_sell, price_cost, managed_by },
        error: 'Failed to update profile'
      });
    }
  });

  // Sync with Mikrotik
  fastify.post('/:id/sync', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    try {
      const profileResult = await db.query('SELECT * FROM profiles WHERE id = $1', [request.params.id]);

      if (!profileResult.rows || profileResult.rows.length === 0) {
        return reply.code(404).send('Profile not found');
      }

      const profile = profileResult.rows[0];

      // Check Mikrotik connection
      const connectionInfo = fastify.mikrotik.getConnectionInfo();
      if (!connectionInfo.connected) {
        fastify.log.error('Mikrotik connection not established:', connectionInfo);
        return reply.redirect('/profiles?error=Mikrotik connection not established. Check connection settings.');
      }

      // Use profile name directly as Mikrotik profile name
      if (!profile.name) {
        return reply.redirect('/profiles?error=Profile name is required');
      }

      // Sync profile with Mikrotik
      let mikrotikProfiles = [];
      try {
        if (profile.profile_type === 'hotspot') {
          mikrotikProfiles = await fastify.mikrotik.getHotspotProfiles();
          fastify.log.info(`Found ${mikrotikProfiles.length} hotspot profiles in Mikrotik`);
        } else if (profile.profile_type === 'pppoe') {
          mikrotikProfiles = await fastify.mikrotik.getPPPProfiles();
          fastify.log.info(`Found ${mikrotikProfiles.length} PPP profiles in Mikrotik`);
        }
      } catch (mikrotikError) {
        fastify.log.error('Error fetching profiles from Mikrotik:', mikrotikError);
        return reply.redirect('/profiles?error=Failed to fetch profiles from Mikrotik: ' + mikrotikError.message);
      }

      const mikrotikProfile = mikrotikProfiles.find(p => p.name === profile.name);

      if (mikrotikProfile) {
        // Profile already exists in RouterOS - confirm sync status
        fastify.log.info(`HIJINETWORK: Profile ${profile.name} found in RouterOS`);

        // For 'system'-managed profiles, inject automatic scripts
        if (profile.managed_by === 'system') {
          try {
            if (profile.profile_type === 'hotspot') {
              await fastify.mikrotik.injectHotspotProfileScripts(profile.name);
              fastify.log.info(`HIJINETWORK: Automatic scripts injected into hotspot profile: ${profile.name}`);
            } else if (profile.profile_type === 'pppoe') {
              await fastify.mikrotik.injectPPPoEProfileScripts(profile.name);
              fastify.log.info(`HIJINETWORK: Automatic scripts injected into PPPoE profile: ${profile.name}`);
            }
          } catch (scriptError) {
            fastify.log.error('Error injecting automatic scripts:', scriptError);
            // Continue with sync even if script injection fails
          }
        }

        // Note: mikrotik_synced column doesn't exist in the new schema
        // await db.update('profiles', { mikrotik_synced: 1 }, { id: request.params.id });

        // Log activity
        await auth.logActivity(
          request.admin.id,
          'sync_profile',
          'profile',
          request.params.id,
          { profile_name: profile.name, profile_type: profile.profile_type, managed_by: profile.managed_by },
          request
        );

        fastify.log.info(`Profile ${profile.name} synced successfully with Mikrotik profile ${profile.name}`);
        return reply.redirect('/profiles?success=Profile synced with Mikrotik successfully');
      } else {
        fastify.log.warn(`Profile ${profile.name} not found in Mikrotik. Available profiles:`, mikrotikProfiles.map(p => p.name));
        return reply.redirect(`/profiles?error=Profile "${profile.name}" not found in Mikrotik. Available profiles: ${mikrotikProfiles.map(p => p.name).join(", ")}`);
      }
    } catch (error) {
      fastify.log.error('Error syncing profile with Mikrotik:', error);
      return reply.redirect('/profiles?error=Failed to sync profile with Mikrotik: ' + error.message);
    }
  });

  // Delete profile
  fastify.delete('/:id', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    try {
      const profileResult = await db.query('SELECT * FROM profiles WHERE id = $1', [request.params.id]);

      if (!profileResult.rows || profileResult.rows.length === 0) {
        return reply.code(404).send('Profile not found');
      }

      const profile = profileResult.rows[0];

      // Check if profile is in use
      const inUseResult = await db.query(`
        SELECT
          (SELECT COUNT(*) FROM vouchers WHERE profile_id = $1) +
          (SELECT COUNT(*) FROM pppoe_users WHERE profile_id = $2) as total
      `, [request.params.id, request.params.id]);

      const inUse = inUseResult.rows[0]?.total || 0;

      if (inUse > 0) {
        return reply.code(400).send('Cannot delete profile that is in use');
      }

      // Delete profile
      await db.query('DELETE FROM profiles WHERE id = $1', [request.params.id]);

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'delete_profile',
        'profile',
        request.params.id,
        { profile_data: profile },
        request
      );

      return reply.send({ success: true });
    } catch (error) {
      fastify.log.error(error);
      throw error;
    }
  });

  // Sync all profiles from Mikrotik
  fastify.post('/sync-all', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    try {
      // Check Mikrotik connection
      const connectionInfo = fastify.mikrotik.getConnectionInfo();
      if (!connectionInfo.connected) {
        fastify.log.error('Mikrotik connection not established:', connectionInfo);
        return reply.redirect('/profiles?error=Mikrotik connection not established. Check connection settings.');
      }

      let syncedCount = 0;
      let hotspotCount = 0;
      let pppCount = 0;

      // Sync hotspot profiles
      try {
        const hotspotProfiles = await fastify.mikrotik.getHotspotProfiles();
        fastify.log.info(`Found ${hotspotProfiles.length} total hotspot profiles in Mikrotik`);

        // Get existing hotspot profiles from database
        const existingHotspotProfiles = await db.query(
          'SELECT name FROM profiles WHERE profile_type = $1', ['hotspot']
        );
        const existingNames = existingHotspotProfiles.rows.map(p => p.name);

        // Add profiles that exist in RouterOS but not in database
        for (const profile of hotspotProfiles) {
          if (!existingNames.includes(profile.name)) {
            await db.query(`
              INSERT INTO profiles (name, profile_type, cost_price, selling_price, managed_by)
              VALUES ($1, $2, $3, $4, $5)
            `, [
              profile.name,
              'hotspot',
              0, // Default cost
              0, // Default price
              'system'
            ]);

            // Inject automatic scripts for 'system'-managed profiles
            try {
              await fastify.mikrotik.injectHotspotProfileScripts(profile.name);
              fastify.log.info(`HIJINETWORK: Automatic scripts injected into hotspot profile: ${profile.name}`);
            } catch (scriptError) {
              fastify.log.error(`Error injecting scripts for hotspot profile ${profile.name}:`, scriptError);
            }

            syncedCount++;
            hotspotCount++;
            fastify.log.info(`Added hotspot profile: ${profile.name}`);
          }
        }
      } catch (hotspotError) {
        fastify.log.error('Error syncing hotspot profiles:', hotspotError);
        return reply.redirect('/profiles?error=Failed to sync hotspot profiles: ' + hotspotError.message);
      }

      // Sync PPP profiles
      try {
        const pppProfiles = await fastify.mikrotik.getPPPProfiles();
        fastify.log.info(`Found ${pppProfiles.length} total PPP profiles in Mikrotik`);

        // Get existing PPP profiles from database
        const existingPPPProfiles = await db.query(
          'SELECT name FROM profiles WHERE profile_type = $1',
          ['pppoe']
        );
        const existingPPNames = existingPPPProfiles.rows.map(p => p.name);

        // Add profiles that exist in RouterOS but not in database
        for (const profile of pppProfiles) {
          if (!existingPPNames.includes(profile.name)) {
            await db.query(`
              INSERT INTO profiles (name, profile_type, cost_price, selling_price, managed_by)
              VALUES ($1, $2, $3, $4, $5)
            `, [
              profile.name,
              'pppoe',
              0, // Default cost
              0, // Default price
              'system'
            ]);

            // Inject automatic scripts for 'system'-managed profiles
            try {
              await fastify.mikrotik.injectPPPoEProfileScripts(profile.name);
              fastify.log.info(`HIJINETWORK: Automatic scripts injected into PPPoE profile: ${profile.name}`);
            } catch (scriptError) {
              fastify.log.error(`Error injecting scripts for PPPoE profile ${profile.name}:`, scriptError);
            }

            syncedCount++;
            pppCount++;
            fastify.log.info(`Added PPP profile: ${profile.name}`);
          }
        }
      } catch (pppError) {
        fastify.log.error('Error syncing PPP profiles:', pppError);
        return reply.redirect('/profiles?error=Failed to sync PPP profiles: ' + pppError.message);
      }

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'sync_all_profiles',
        null,
        null,
        {
          total_synced: syncedCount,
          hotspot_profiles: hotspotCount,
          ppp_profiles: pppCount
        },
        request
      );

      fastify.log.info(`Sync completed: ${syncedCount} profiles added (${hotspotCount} 'hotspot', ${pppCount} PPP)`);

      // After sync, automatically inject scripts to all 'system'-managed profiles
      setTimeout(async () => {
        try {
          const systemProfiles = await db.query(`
            SELECT id, name, profile_type
            FROM profiles
            WHERE managed_by = 'system'
          `);

          fastify.log.info(`HIJINETWORK: Auto-injecting scripts to ${systemProfiles.length} system-managed profiles after sync...`);

          for (const profile of systemProfiles.rows) {
            try {
              if (profile.profile_type === 'hotspot') {
                await fastify.mikrotik.injectHotspotProfileScripts(profile.name);
                fastify.log.info(`HIJINETWORK: Auto-injected scripts into hotspot profile: ${profile.name}`);
              } else if (profile.profile_type === 'pppoe') {
                await fastify.mikrotik.injectPPPoEProfileScripts(profile.name);
                fastify.log.info(`HIJINETWORK: Auto-injected scripts into PPPoE profile: ${profile.name}`);
              }
            } catch (scriptError) {
              fastify.log.error(`HIJINETWORK: Error auto-injecting scripts for profile ${profile.name}:`, scriptError);
            }
          }

          fastify.log.info(`HIJINETWORK: Auto script injection after sync completed`);
        } catch (error) {
          fastify.log.error('HIJINETWORK: Error during auto script injection after sync:', error);
        }
      }, 1000);

      return reply.redirect(`/profiles?success=Sync completed successfully. Added ${syncedCount} new profiles (${hotspotCount} hotspot, ${pppCount} PPP)`);
    } catch (error) {
      fastify.log.error('Error syncing profiles:', error);
      return reply.redirect('/profiles?error=Failed to sync profiles: ' + error.message);
    }
  });

  // Inject scripts to all existing synced profiles
  fastify.post('/inject-scripts', {
    preHandler: [auth.requireRole(['admin'])]
  }, async (request, reply) => {
    try {
      let injectedCount = 0;
      let hotspotCount = 0;
      let pppoeCount = 0;

      // Get all system-managed profiles that are synced
      const systemProfiles = await db.query(`
        SELECT id, name, profile_type
        FROM profiles
        WHERE managed_by = 'system'
      `);

      fastify.log.info(`Found ${systemProfiles.rows.length} system-managed synced profiles to check for script injection`);

      for (const profile of systemProfiles.rows) {
        try {
          if (profile.profile_type === 'hotspot') {
            await fastify.mikrotik.injectHotspotProfileScripts(profile.name);
            fastify.log.info(`HIJINETWORK: Scripts injected into hotspot profile: ${profile.name}`);
            hotspotCount++;
          } else if (profile.profile_type === 'pppoe') {
            await fastify.mikrotik.injectPPPoEProfileScripts(profile.name);
            fastify.log.info(`HIJINETWORK: Scripts injected into PPPoE profile: ${profile.name}`);
            pppoeCount++;
          }
          injectedCount++;

          // Log script injection activity
          await auth.logActivity(
            request.admin.id,
            'script_injection',
            'profile',
            profile.id,
            {
              profile_name: profile.name,
              profile_type: profile.type,
              action: 'script_injection_existing'
            },
            request
          );

        } catch (scriptError) {
          fastify.log.error(`Error injecting scripts for profile ${profile.name}:`, scriptError);
          // Continue with other profiles even if one fails
        }
      }

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'bulk_script_injection',
        null,
        null,
        {
          total_profiles: systemProfiles.length,
          successfully_injected: injectedCount,
          hotspot_profiles: hotspotCount,
          pppoe_profiles: pppoeCount
        },
        request
      );

      fastify.log.info(`Script injection completed: ${injectedCount}/${systemProfiles.rows.length} profiles injected scripts (${hotspotCount} hotspot, ${pppCount} PPP)`);
      return reply.redirect(`/profiles?success=Script injection completed successfully. Injected scripts to ${injectedCount} profiles (${hotspotCount} hotspot, ${pppCount} PPP)`);
    } catch (error) {
      fastify.log.error('Error injecting scripts to profiles:', error);
      return reply.redirect('/profiles?error=Failed to inject scripts: ' + error.message);
    }
  });
}

module.exports = profileRoutes;