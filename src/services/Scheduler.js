const cron = require('node-cron');
const UserMonitorService = require('./UserMonitorService');
const CarryOverService = require('./CarryOverService');
const PaymentFlowOrchestrator = require('./PaymentFlowOrchestrator');
const NotificationFlowService = require('./NotificationFlowService');
const MikrotikSyncService = require('./MikrotikSyncService');
const QueryHelper = require('../lib/QueryHelper');

module.exports = async function(fastify) {
  console.log('Starting background scheduler...');

  // Initialize User Monitor Service (replaces profile scripts)
  fastify.userMonitorService = new UserMonitorService(
    fastify.mikrotik,
    fastify.whatsappService,
    QueryHelper
  );

  // Initialize Carry Over Service
  fastify.carryOverService = new CarryOverService(QueryHelper);

  // Initialize Notification Flow Service
  fastify.notificationFlowService = new NotificationFlowService(
    QueryHelper,
    {
      whatsappService: fastify.whatsappService
    }
  );

  // Initialize Mikrotik Sync Service
  fastify.mikrotikSyncService = new MikrotikSyncService({
    syncInterval: 60000, // 1 minute
    batchSize: 50
  });

  // Initialize the MikrotikSyncService with database and config
  await fastify.mikrotikSyncService.initialize(QueryHelper, {
    host: process.env.MIKROTIK_HOST || '192.168.88.1',
    port: process.env.MIKROTIK_API_PORT || 8728,
    username: process.env.MIKROTIK_USER || 'admin',
    password: process.env.MIKROTIK_PASS || ''
  });

  // Initialize Payment Flow Orchestrator
  fastify.paymentFlowOrchestrator = new PaymentFlowOrchestrator(QueryHelper, {
    carryOverService: fastify.carryOverService,
    whatsappService: fastify.whatsappService,
    mikrotikClient: fastify.mikrotik,
    notificationService: fastify.notificationFlowService
  });

  // Start all services in proper order
  const startServices = async () => {
    try {
      // 1. Start Mikrotik Sync Service first
      await fastify.mikrotikSyncService.start();
      console.log('✅ Mikrotik Sync Service started');

      // 2. Start Notification Flow Service
      await fastify.notificationFlowService.start();
      console.log('✅ Notification Flow Service started');

      // 3. Start User Monitor Service
      await fastify.userMonitorService.start();
      console.log('✅ User Monitor Service (30-second polling) started');

      console.log('✅ All integration services started successfully');
    } catch (error) {
      console.error('❌ Failed to start services:', error);
    }
  };

  startServices();

  // Handle graceful shutdown
  const shutdownServices = async () => {
    console.log('🛑 Shutting down all services...');

    try {
      // Stop in reverse order
      if (fastify.userMonitorService) {
        await fastify.userMonitorService.stop();
        console.log('✅ User Monitor Service stopped');
      }

      if (fastify.notificationFlowService) {
        await fastify.notificationFlowService.stop();
        console.log('✅ Notification Flow Service stopped');
      }

      if (fastify.mikrotikSyncService) {
        await fastify.mikrotikSyncService.stop();
        console.log('✅ Mikrotik Sync Service stopped');
      }

      console.log('✅ All services stopped gracefully');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
  };

  process.on('SIGINT', async () => {
    await shutdownServices();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await shutdownServices();
    process.exit(0);
  });

  // Process notification queue every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      // Notification queue is now handled by NotificationFlowService
      if (fastify.notificationFlowService && fastify.notificationFlowService.isProcessing) {
        console.log('📱 Notification queue is already being processed by NotificationFlowService');
      } else {
        console.log('📱 Notification Flow Service not active, skipping queue processing');
      }
    } catch (error) {
      console.error('❌ Error checking notification queue status:', error);
    }
  });

  // Send expiry warnings daily at 9 AM
  cron.schedule('0 9 * * *', async () => {
    try {
      // Use global whatsappService instance for WhatsApp expiry warnings
      if (fastify.whatsappService) {
        await fastify.whatsappService.sendExpiryWarnings();
        console.log('📱 WhatsApp expiry warnings sent successfully');
      } else {
        console.warn('⚠️ WhatsApp service not available, skipping expiry warnings');
      }
    } catch (error) {
      console.error('❌ Error sending WhatsApp expiry warnings:', error);
    }
  });

  // Sync user data (expired, first login, and restore) every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      if (fastify.mikrotik && fastify.mikrotik.isConnected()) {
        const result = await fastify.mikrotik.syncUserData();
        if (result) {
          console.log(`User data sync completed: ${result.restoredVouchers} vouchers restored, ${result.restoredPPPoE} PPPoE restored, ${result.expiredVouchers} vouchers expired, ${result.expiredPPPoEUsers} PPPoE expired, ${result.firstLogins} first logins`);
        }
      } else {
        console.log('Mikrotik not connected, skipping user data sync');
      }
    } catch (error) {
      console.error('Error syncing user data:', error);
    }
  });

  // Clean up expired hotspot users every hour (legacy, will be replaced by syncUserData)
  cron.schedule('0 * * * *', async () => {
    try {
      await cleanupExpiredHotspotUsers(fastify);
      console.log('Hotspot user cleanup completed');
    } catch (error) {
      console.error('Error cleaning up hotspot users:', error);
    }
  });

  // Clean up expired PPPoE users every hour
  cron.schedule('0 * * * *', async () => {
    try {
      await cleanupExpiredPPPoEUsers(fastify);
      console.log('PPPoE user cleanup completed');
    } catch (error) {
      console.error('Error cleaning up PPPoE users:', error);
    }
  });

  // First login monitoring is now handled by UserMonitorService (30-second polling)
  console.log('First login monitoring moved to UserMonitorService (30-second polling)');

  // Sync Mikrotik profiles every 6 hours (without script injection)
  cron.schedule('0 */6 * * *', async () => {
    try {
      await syncMikrotikProfilesNoScripts(fastify);
      console.log('Mikrotik profiles synced (no scripts)');
    } catch (error) {
      console.error('Error syncing Mikrotik profiles:', error);
    }
  });

  // Cleanup old notification logs daily
  cron.schedule('0 2 * * *', async () => {
    try {
      await cleanupOldNotifications(fastify);
      console.log('Old notifications cleaned up');
    } catch (error) {
      console.error('Error cleaning up old notifications:', error);
    }
  });

  // Delete expired vouchers older than 1 day daily at 3 AM
  cron.schedule('0 3 * * *', async () => {
    try {
      await deleteOldExpiredVouchers(fastify);
      console.log('Old expired vouchers deleted');
    } catch (error) {
      console.error('Error deleting old expired vouchers:', error);
    }
  });

  // Monitor WhatsApp queue health every 2 minutes
  cron.schedule('*/2 * * * *', async () => {
    try {
      if (fastify.queueService && fastify.rateLimiterService) {
        const queueStats = await fastify.queueService.getQueueStats();
        const rateLimitStats = fastify.rateLimiterService.getStats();

        // Check for stuck messages
        const pendingMessages = queueStats.by_status?.pending || 0;
        const processing = queueStats.processing?.isProcessing ? 1 : 0;
        const stuckMessages = pendingMessages > 10 && pendingMessages === processing;
        if (stuckMessages) {
          console.warn(`⚠️ WhatsApp queue alert: ${pendingMessages} pending messages, ${processing} processing`);
        }

        // Check rate limiter health
        if (rateLimitStats.stats.blockedMessages > 5) {
          console.warn(`⚠️ WhatsApp rate limiter alert: ${rateLimitStats.stats.blockedMessages} blocked messages`);
        }

        // Log health status
        const pending = queueStats.by_status?.pending || 0;
        const sent = queueStats.by_status?.sent || 0;
        const failed = queueStats.by_status?.failed || 0;
        console.log(`📱 WhatsApp Queue Health: ${pending} pending, ${sent} sent, ${failed} failed`);
      }
    } catch (error) {
      console.error('❌ Error monitoring WhatsApp queue health:', error);
    }
  });

  // Clean up old WhatsApp messages and sessions daily at 4 AM
  cron.schedule('0 4 * * *', async () => {
    try {
      await cleanupWhatsAppData(fastify);
      console.log('WhatsApp data cleanup completed');
    } catch (error) {
      console.error('Error cleaning up WhatsApp data:', error);
    }
  });

  // Clean up expired carry over balances daily at 3:30 AM
  cron.schedule('30 3 * * *', async () => {
    try {
      if (fastify.carryOverService) {
        const cleanedCount = await fastify.carryOverService.cleanupExpiredBalances();
        console.log(`Carry over cleanup completed: ${cleanedCount} expired balances removed`);
      }
    } catch (error) {
      console.error('Error cleaning up carry over balances:', error);
    }
  });

  // Monitor WhatsApp connection status every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      if (fastify.whatsappService) {
        const connectionStatus = await fastify.whatsappService.getConnectionStatus();
        if (!connectionStatus.isConnected) {
          console.warn(`⚠️ WhatsApp connection issue: ${connectionStatus.status} - ${connectionStatus.message}`);

          // Log to database for monitoring
          await QueryHelper.query(`
            INSERT INTO system_logs (level, module, message, details)
            VALUES (?, ?, ?, ?)
          `, [
            'WARN',
            'whatsapp_connection',
            `WhatsApp connection status: ${connectionStatus.status}`,
            JSON.stringify({
              status: connectionStatus.status,
              message: connectionStatus.message,
              qr_code_available: connectionStatus.qrCodeAvailable,
              session_active: connectionStatus.sessionActive
            })
          ]);
        } else {
          console.log(`📱 WhatsApp connection healthy: ${connectionStatus.status}`);
        }
      }
    } catch (error) {
      console.error('❌ Error monitoring WhatsApp connection:', error);
    }
  });

  console.log('Background scheduler started successfully');
};

// Cleanup expired hotspot users
async function cleanupExpiredHotspotUsers(fastify) {
  try {
    const expiredUsers = await fastify.mikrotik.findExpiredUsers('hotspot');

    for (const user of expiredUsers) {
      try {
        // Delete from Mikrotik
        await fastify.mikrotik.deleteHotspotUser(user.name);

        // Update local database (PostgreSQL)
        if (fastify.query) {
          await fastify.query.query(`
            UPDATE vouchers
            SET status = 'expired'
            WHERE code = $1
          `, [user.name]);
        }

        // Log cleanup
        if (fastify.query) {
          await fastify.query.insert(`
            INSERT INTO activity_logs (user_id, action, details, ip_address)
            VALUES ($1, $2, $3, $4)
          `, ['delete_expired', 'hotspot', user.name, JSON.stringify({
            reason: 'expired',
            comment_data: fastify.mikrotik.parseComment(user.comment)
          })]);
        }

        console.log(`Deleted expired hotspot user: ${user.name}`);
      } catch (error) {
        console.error(`Error deleting hotspot user ${user.name}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in cleanupExpiredHotspotUsers:', error);
  }
}

// Cleanup expired PPPoE users
async function cleanupExpiredPPPoEUsers(fastify) {
  try {
    const expiredUsers = await fastify.mikrotik.findExpiredUsers('pppoe');

    for (const user of expiredUsers) {
      try {
        // Disable in Mikrotik
        await fastify.mikrotik.updatePPPoESecret(user.name, {
          disabled: 'yes'
        });

        // Update local database (PostgreSQL)
        if (fastify.query) {
          await fastify.query.query(`
            UPDATE pppoe_users
            SET status = 'disabled', updated_at = NOW()
            WHERE username = $1
          `, [user.name]);
        }

        // Log cleanup
        if (fastify.query) {
          await fastify.query.insert(`
            INSERT INTO activity_logs (user_id, action, details, ip_address)
            VALUES ($1, $2, $3, $4)
          `, ['disable_expired', 'pppoe', user.name, JSON.stringify({
            reason: 'expired',
            comment_data: fastify.mikrotik.parseComment(user.comment)
          })]);
        }

        console.log(`Disabled expired PPPoE user: ${user.name}`);
      } catch (error) {
        console.error(`Error disabling PPPoE user ${user.name}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in cleanupExpiredPPPoEUsers:', error);
  }
}

// monitorFirstLogin is now handled by UserMonitorService
// This function is kept for backward compatibility but is no longer used
async function monitorFirstLogin(fastify) {
  console.log('⚠️ monitorFirstLogin is deprecated - using UserMonitorService instead');
  return [];
}

// Sync Mikrotik profiles without script injection
async function syncMikrotikProfilesNoScripts(fastify) {
  try {
    // Sync hotspot profiles
    const hotspotProfiles = await fastify.mikrotik.getHotspotProfiles();
    const systemHotspotProfiles = hotspotProfiles.filter(p => p.comment && p.comment.includes('VOUCHER_SYSTEM'));

    for (const profile of systemHotspotProfiles) {
      const existing = await fastify.db.getOne(
        'SELECT id FROM profiles WHERE mikrotik_name = $1 AND type = $2',
        [profile.name, 'hotspot']
      );

      if (!existing) {
        // Extract pricing from comment
        const commentData = fastify.mikrotik.parseComment(profile.comment) || {};
        if (fastify.query) {
          await fastify.query.insert(`
            INSERT INTO profiles (name, type, mikrotik_name, price_sell, price_cost, mikrotik_synced, managed_by)
            VALUES ($1, $2, $3, $4, $5, 1, 'system')
          `, [
            profile.name,
            'hotspot',
            profile.name,
            commentData.price_sell || 0,
            commentData.price_cost || 0
          ]);
        }
      }
    }

    // Sync PPP profiles
    const pppProfiles = await fastify.mikrotik.getPPPProfiles();
    const systemPPPProfiles = pppProfiles.filter(p => p.comment && p.comment.includes('PPPOE_SYSTEM'));

    for (const profile of systemPPPProfiles) {
      const existing = await fastify.db.getOne(
        'SELECT id FROM profiles WHERE mikrotik_name = $1 AND type = $2',
        [profile.name, 'pppoe']
      );

      if (!existing) {
        // Extract pricing from comment
        const commentData = fastify.mikrotik.parseComment(profile.comment) || {};
        if (fastify.query) {
          await fastify.query.insert(`
            INSERT INTO profiles (name, type, mikrotik_name, price_sell, price_cost, mikrotik_synced, managed_by)
            VALUES ($1, $2, $3, $4, $5, 1, 'system')
          `, [
            profile.name,
            'pppoe',
            profile.name,
            commentData.price_sell || 0,
            commentData.price_cost || 0
          ]);
        }
      }
    }

    console.log('Mikrotik profiles synced successfully (polling mode)');
  } catch (error) {
    console.error('Error in syncMikrotikProfilesNoScripts:', error);
  }
}

// Original monitorFirstLogin (deprecated)
async function monitorFirstLoginOriginal(fastify) {
  try {
    const firstLogins = await fastify.mikrotik.monitorFirstLogin();

    for (const login of firstLogins) {
      try {
        // Update voucher with first login timestamp
        if (fastify.query) {
          await fastify.query.query(`
            UPDATE vouchers
            SET used_at = $1, status = 'used'
            WHERE code = $2
          `, [login.firstLogin, login.username]);
        }

        // Update Mikrotik user comment using VOUCHER_SYSTEM format
        const hotspotUsers = await fastify.mikrotik.getHotspotUsers();
        const mikrotikUser = hotspotUsers.find(u => u.name === login.username);

        if (mikrotikUser) {
          const commentData = fastify.mikrotik.parseComment(mikrotikUser.comment) || {};

          // Update first login timestamp in VOUCHER_SYSTEM format
          if (commentData.system === 'voucher') {
            const validUntil = commentData.valid_until_timestamp || null;
            await fastify.mikrotik.updateVoucherUserComment(
              login.username,
              Math.floor(new Date(login.firstLogin).getTime() / 1000).toString(),
              validUntil
            );
          }
        }

        // Send first login notification if customer exists
        let voucher = null;
        if (fastify.query) {
          voucher = await fastify.db.getOne(`
            SELECT v.*, c.id as customer_id, c.name, c.phone
            FROM vouchers v
            LEFT JOIN pppoe_users p ON v.code = p.username
            LEFT JOIN customers c ON p.customer_id = c.id
            WHERE v.code = $1
          `, [login.username]);
        }

        if (voucher && voucher.customer_id && voucher.phone) {
          // Use global whatsappService instance for WhatsApp notifications
          if (fastify.whatsappService) {
            try {
              await fastify.whatsappService.sendNotification(voucher.customer_id, 'voucher_first_login', {
                voucher_code: login.username,
                ip: login.ip,
                customer_name: voucher.name
              });
              console.log(`📱 WhatsApp first login notification sent for ${login.username}`);
            } catch (notifError) {
              console.error(`❌ Error sending WhatsApp first login notification:`, notifError);
            }
          } else {
            console.warn('⚠️ Notification service not available for first login notification');
          }
        }

        console.log(`First login detected: ${login.username} from ${login.ip}`);
      } catch (error) {
        console.error(`Error processing first login for ${login.username}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in monitorFirstLoginOriginal:', error);
  }
}

// Sync Mikrotik profiles
async function syncMikrotikProfiles(fastify) {
  try {
    // Sync hotspot profiles
    const hotspotProfiles = await fastify.mikrotik.getHotspotProfiles();
    const systemHotspotProfiles = hotspotProfiles.filter(p => p.comment && p.comment.includes('VOUCHER_SYSTEM'));

    for (const profile of systemHotspotProfiles) {
      const existing = await fastify.db.getOne(
        'SELECT id FROM profiles WHERE mikrotik_name = $1 AND type = $2',
        [profile.name, 'hotspot']
      );

      if (!existing) {
        // Extract pricing from comment
        const commentData = fastify.mikrotik.parseComment(profile.comment) || {};
        await fastify.db.query(`
          INSERT INTO profiles (name, type, mikrotik_name, price_sell, price_cost, mikrotik_synced, managed_by)
          VALUES ($1, $2, $3, $4, $5, 1, 'system')
        `, [
          profile.name,
          'hotspot',
          profile.name,
          commentData.price_sell || 0,
          commentData.price_cost || 0,
          1,
          'system'
        ]);
      }

      // No script injection - using polling instead
      console.log(`Profile ${profile.name} synced without scripts (using polling)`);
    }

    // Sync PPP profiles
    const pppProfiles = await fastify.mikrotik.getPPPProfiles();
    const systemPPPProfiles = pppProfiles.filter(p => p.comment && p.comment.includes('PPPOE_SYSTEM'));

    for (const profile of systemPPPProfiles) {
      const existing = await fastify.db.getOne(
        'SELECT id FROM profiles WHERE mikrotik_name = $1 AND type = $2',
        [profile.name, 'pppoe']
      );

      if (!existing) {
        // Extract pricing from comment
        const commentData = fastify.mikrotik.parseComment(profile.comment) || {};
        await fastify.db.query(`
          INSERT INTO profiles (name, type, mikrotik_name, price_sell, price_cost, mikrotik_synced, managed_by)
          VALUES ($1, $2, $3, $4, $5, 1, 'system')
        `, [
          profile.name,
          'pppoe',
          profile.name,
          commentData.price_sell || 0,
          commentData.price_cost || 0,
          1,
          'system'
        ]);
      }

      // No script injection - using polling instead
      console.log(`PPPoE profile ${profile.name} synced without scripts (using polling)`);
    }

    // No automatic scripts - using polling instead
    console.log('Mikrotik profiles synced successfully (polling mode)');
  } catch (error) {
    console.error('Error in syncMikrotikProfiles:', error);
  }
}

// Cleanup old notifications
async function cleanupOldNotifications(fastify) {
  try {
    // Delete notifications older than 30 days
    if (fastify.query) {
      const result = await fastify.query.query(`
        DELETE FROM notification_queue
        WHERE created_at < NOW() - INTERVAL '30 days'
      `);

      if (result.rowCount > 0) {
        console.log(`Cleaned up ${result.rowCount} old notification records`);
      }
    }
  } catch (error) {
    console.error('Error in cleanupOldNotifications:', error);
  }
}

// Delete expired vouchers older than 1 day
async function deleteOldExpiredVouchers(fastify) {
  try {
    // Find expired vouchers older than 1 day
    if (fastify.query) {
      const oldExpiredVouchers = await fastify.query.getMany(`
        SELECT id, code, expires_at, created_at
        FROM vouchers
        WHERE status = 'expired'
          AND expires_at < NOW() - INTERVAL '1 day'
        ORDER BY expires_at ASC
      `);

      if (oldExpiredVouchers.length === 0) {
        console.log('No expired vouchers older than 1 day found for deletion');
        return;
      }

      console.log(`Found ${oldExpiredVouchers.length} expired vouchers older than 1 day for deletion`);

      let deletedCount = 0;
      for (const voucher of oldExpiredVouchers) {
        try {
          // Try to delete from Mikrotik first if user exists
          try {
            await fastify.mikrotik.deleteHotspotUser(voucher.code);
            console.log(`Deleted expired voucher user from Mikrotik: ${voucher.code}`);
          } catch (mikrotikError) {
            console.log(`Mikrotik user not found for expired voucher: ${voucher.code}`);
          }

          // Delete from database
          const deleteResult = await fastify.query.query(`
            DELETE FROM vouchers WHERE id = $1
          `, [voucher.id]);

          if (deleteResult.rowCount > 0) {
            deletedCount++;

            // Log cleanup
            await fastify.query.insert(`
              INSERT INTO activity_logs (user_id, action, details, ip_address)
              VALUES ($1, $2, $3, $4)
            `, ['delete_old_expired', 'voucher', voucher.code, JSON.stringify({
              reason: 'expired_more_than_1_day',
              expires_at: voucher.expires_at,
              created_at: voucher.created_at
            })]);
          }

          console.log(`Deleted expired voucher from database: ${voucher.code}`);
        } catch (error) {
          console.error(`Error deleting expired voucher ${voucher.code}:`, error);
        }
      }

      console.log(`Successfully deleted ${deletedCount} old expired vouchers`);
    }
  } catch (error) {
    console.error('Error in deleteOldExpiredVouchers:', error);
  }
}

// Cleanup old WhatsApp data
async function cleanupWhatsAppData(fastify) {
  try {
    console.log('📱 Starting WhatsApp data cleanup...');

    if (fastify.query) {
      // Clean up old WhatsApp messages (older than 30 days)
      const messageResult = await fastify.query.query(`
        DELETE FROM whatsapp_messages
        WHERE created_at < NOW() - INTERVAL '30 days'
      `);

      if (messageResult.rowCount > 0) {
        console.log(`🗑️  Cleaned up ${messageResult.rowCount} old WhatsApp messages`);
      }

      // Clean up old failed notification queue entries (older than 7 days)
      const queueResult = await fastify.query.query(`
        DELETE FROM notification_queue
        WHERE status = 'failed' AND created_at < NOW() - INTERVAL '7 days'
      `);

      if (queueResult.rowCount > 0) {
        console.log(`🗑️  Cleaned up ${queueResult.rowCount} old failed queue entries`);
      }

      // Clean up old WhatsApp session logs (older than 7 days)
      const sessionLogResult = await fastify.query.query(`
        DELETE FROM whatsapp_session_logs
        WHERE timestamp < NOW() - INTERVAL '7 days'
      `);

      if (sessionLogResult.rowCount > 0) {
        console.log(`🗑️  Cleaned up ${sessionLogResult.rowCount} old WhatsApp session logs`);
      }
    }

    // Clean up invalid WhatsApp sessions (only if truly invalid)
    const invalidSessions = await cleanupInvalidWhatsAppSessions(fastify);
    if (invalidSessions > 0) {
      console.log(`🗑️  Cleaned up ${invalidSessions} invalid WhatsApp sessions`);
    }

    // No VACUUM for PostgreSQL (handled by autovacuum)
    console.log('✅ WhatsApp data cleanup completed successfully');
  } catch (error) {
    console.error('❌ Error in cleanupWhatsAppData:', error);
  }
}

// Clean up invalid WhatsApp sessions (only if truly invalid)
async function cleanupInvalidWhatsAppSessions(fastify) {
  let cleanedCount = 0;

  try {
    // Get all sessions to validate
    if (fastify.query) {
      const sessions = await fastify.query.getMany(`
        SELECT id, session_name, phone_number, status, last_activity, created_at
        FROM whatsapp_sessions
        WHERE status IN ('connected', 'authenticated', 'scanning')
      `);

      if (sessions.length === 0) {
        return 0;
      }

      console.log(`🔍 Validating ${sessions.length} WhatsApp sessions...`);

      for (const session of sessions) {
        let shouldDelete = false;
        let reason = '';

        // Check if session is too old (more than 30 days without activity)
        const lastActivity = new Date(session.last_activity);
        const daysSinceActivity = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSinceActivity > 30) {
          shouldDelete = true;
          reason = 'no_activity_for_30_days';
        }

        // Check if session has been in scanning/authenticated state too long (more than 24 hours)
        if ((session.status === 'scanning' || session.status === 'authenticated') && daysSinceActivity > 1) {
          shouldDelete = true;
          reason = 'stuck_in_auth_state_too_long';
        }

        // Validate session with WhatsApp service if it claims to be connected
        if (session.status === 'connected' && fastify.whatsappService) {
          try {
            // Try to validate the session through the service
            const isValid = await fastify.whatsappService.validateSession();
            if (!isValid) {
              shouldDelete = true;
              reason = 'session_validation_failed';
            }
          } catch (error) {
            console.log(`Session validation error for ${session.session_name}:`, error.message);
            // If we can't validate, check age
            if (daysSinceActivity > 7) {
              shouldDelete = true;
              reason = 'unvalidable_old_session';
            }
          }
        }

        // Delete invalid session
        if (shouldDelete) {
          try {
            await fastify.query.query(`
              DELETE FROM whatsapp_sessions WHERE id = $1
            `, [session.id]);

            cleanedCount++;

            // Log cleanup
            await fastify.query.insert(`
              INSERT INTO system_logs (level, module, message, details, user_id)
              VALUES ($1, $2, $3, $4, $5)
            `, [
              'INFO',
              'whatsapp_session_cleanup',
              `Invalid WhatsApp session cleaned up: ${session.session_name}`,
              JSON.stringify({
                session_id: session.id,
                session_name: session.session_name,
                phone_number: session.phone_number,
                status: session.status,
                last_activity: session.last_activity,
                reason: reason,
                days_since_activity: Math.round(daysSinceActivity)
              }),
              null // System action, no user
            ]);

            console.log(`🗑️  Cleaned up invalid WhatsApp session: ${session.session_name} (${reason})`);
          } catch (deleteError) {
            console.error(`Error deleting session ${session.session_name}:`, deleteError);
          }
        } else {
          console.log(`✅ Session ${session.session_name} is valid (last activity: ${Math.round(daysSinceActivity)} days ago)`);
        }
      }

      console.log(`📊 WhatsApp session validation completed: ${cleanedCount}/${sessions.length} sessions cleaned up`);
    }
    return cleanedCount;
  } catch (error) {
    console.error('❌ Error in cleanupInvalidWhatsAppSessions:', error);
    return cleanedCount;
  }
}