/**
 * Enhanced Mikrotik Client Integration Examples
 * Shows how to integrate with existing routes and services
 */

const EnhancedMikrotikService = require('../src/services/EnhancedMikrotikService');

// Example 1: Enhanced Voucher Creation
async function createEnhancedVoucher(voucherData) {
  const mikrotikService = global.mikrotikService; // Assume service is initialized globally

  try {
    // Validate input first
    const validation = mikrotikService.client.validator.validateBatch({
      username: { value: voucherData.code, type: 'username' },
      profile: { value: voucherData.profileId, type: 'text' },
      duration: { value: voucherData.durationHours, type: 'number' }
    });

    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Create voucher user with enhanced features
    const result = await mikrotikService.client.execute('/ip/hotspot/user/add', {
      name: voucherData.code,
      password: voucherData.password,
      profile: voucherData.profileId,
      comment: JSON.stringify({
        system: 'voucher',
        type: 'hotspot',
        price_sell: voucherData.priceSell,
        created_by: voucherData.createdBy,
        created_date: new Date().toISOString(),
        first_login_timestamp: '',
        valid_until_timestamp: voucherData.neverExpired ? '' :
          Math.floor(Date.now() / 1000 + voucherData.expiredHours * 3600).toString()
      }),
      'disabled': 'no'
    }, { priority: 'high' });

    // Update database record
    if (mikrotikService.db) {
      await mikrotikService.db.query(
        'INSERT INTO vouchers (code, password, profile_id, price_sell, expired_hours, never_expired, status, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [voucherData.code, voucherData.password, voucherData.profileId, voucherData.priceSell, voucherData.expiredHours, voucherData.neverExpired, 'active', voucherData.createdBy]
      );
    }

    // Log success
    mikrotikService.client.monitoring.recordBusinessEvent('voucher_generated');
    mikrotikService.client.auditLogger.logBusinessOperation('VOUCHER_CREATED', {
      voucherCode: voucherData.code,
      profile: voucherData.profileId,
      price: voucherData.priceSell
    });

    return {
      success: true,
      mikrotikId: result,
      voucherData
    };

  } catch (error) {
    // Enhanced error handling
    const enhancedError = mikrotikService.client.errorHandler.handleError(error, {
      component: 'voucher_creation',
      operation: 'create_voucher',
      voucherData: { code: voucherData.code, price: voucherData.priceSell }
    });

    // Log failure
    mikrotikService.client.auditLogger.logErrorEvent('VOUCHER_CREATION_FAILED', {
      error: error.message,
      voucherCode: voucherData.code
    });

    throw enhancedError;
  }
}

// Example 2: Enhanced PPPoE User Management
async function createEnhancedPPPoEUser(userData) {
  const mikrotikService = global.mikrotikService;

  try {
    // Validate input
    const validation = mikrotikService.client.validator.validateBatch({
      username: { value: userData.username, type: 'username', options: { userType: 'pppoe' } },
      password: { value: userData.password, type: 'password' },
      profile: { value: userData.profileId, type: 'text' }
    });

    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Create PPPoE secret with enhanced features
    const result = await mikrotikService.client.execute('/ppp/secret/add', {
      name: userData.username,
      password: userData.password,
      profile: userData.profileId,
      service: 'pppoe',
      comment: JSON.stringify({
        system: 'pppoe',
        customer_id: userData.customerId,
        created_by: userData.createdBy,
        created_date: new Date().toISOString(),
        expiry_date: userData.expiryDate
      }),
      'disabled': 'no'
    }, { priority: 'high' });

    // Update database
    if (mikrotikService.db) {
      await mikrotikService.db.query(
        'INSERT INTO pppoe_users (username, password, profile_id, customer_id, status, created_by, expiry_date) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [userData.username, userData.password, userData.profileId, userData.customerId, 'active', userData.createdBy, userData.expiryDate]
      );
    }

    // Log success
    mikrotikService.client.monitoring.recordBusinessEvent('user_created');
    mikrotikService.client.auditLogger.logUserManagement('PPPOE_USER_CREATED', {
      username: userData.username,
      profile: userData.profileId,
      customerId: userData.customerId
    });

    return {
      success: true,
      mikrotikId: result,
      userData
    };

  } catch (error) {
    const enhancedError = mikrotikService.client.errorHandler.handleError(error, {
      component: 'pppoe_user_management',
      operation: 'create_pppoe_user',
      userData: { username: userData.username }
    });

    mikrotikService.client.auditLogger.logErrorEvent('PPPOE_USER_CREATION_FAILED', {
      error: error.message,
      username: userData.username
    });

    throw enhancedError;
  }
}

// Example 3: Enhanced Profile Synchronization
async function syncProfilesEnhanced() {
  const mikrotikService = global.mikrotikService;

  try {
    console.log('🔄 Starting enhanced profile synchronization...');

    const startTime = Date.now();

    // Get Mikrotik profiles with caching
    const [hotspotProfiles, pppoeProfiles] = await Promise.all([
      mikrotikService.client.execute('/ip/hotspot/user/profile/print', {}, {
        priority: 'normal',
        useCache: false // Force fresh data for sync
      }),
      mikrotikService.client.execute('/ppp/profile/print', {}, {
        priority: 'normal',
        useCache: false
      })
    ]);

    // Filter system-managed profiles
    const systemHotspotProfiles = hotspotProfiles.filter(profile =>
      profile.comment && profile.comment.includes('HIJINETWORK')
    );
    const systemPPPoEProfiles = pppoeProfiles.filter(profile =>
      profile.comment && profile.comment.includes('HIJINETWORK')
    );

    let syncedProfiles = 0;
    let createdProfiles = 0;
    let updatedProfiles = 0;

    // Sync to database
    if (mikrotikService.db) {
      for (const profile of systemHotspotProfiles) {
        const existing = await mikrotikService.db.query(
          'SELECT id FROM profiles WHERE mikrotik_id = $1 AND type = $2',
          [profile['.id'], 'hotspot']
        );

        if (existing.rows.length === 0) {
          // Create new profile record
          await mikrotikService.db.query(
            'INSERT INTO profiles (mikrotik_id, name, type, price_sell, price_cost, mikrotik_data) VALUES ($1, $2, $3, $4, $5, $6)',
            [profile['.id'], profile.name, 'hotspot', 0, 0, JSON.stringify(profile)]
          );
          createdProfiles++;
        } else {
          // Update existing profile
          await mikrotikService.db.query(
            'UPDATE profiles SET mikrotik_data = $1 WHERE mikrotik_id = $2 AND type = $3',
            [JSON.stringify(profile), profile['.id'], 'hotspot']
          );
          updatedProfiles++;
        }
        syncedProfiles++;
      }

      for (const profile of systemPPPoEProfiles) {
        const existing = await mikrotikService.db.query(
          'SELECT id FROM profiles WHERE mikrotik_id = $1 AND type = $2',
          [profile['.id'], 'pppoe']
        );

        if (existing.rows.length === 0) {
          await mikrotikService.db.query(
            'INSERT INTO profiles (mikrotik_id, name, type, price_sell, price_cost, mikrotik_data) VALUES ($1, $2, $3, $4, $5, $6)',
            [profile['.id'], profile.name, 'pppoe', 0, 0, JSON.stringify(profile)]
          );
          createdProfiles++;
        } else {
          await mikrotikService.db.query(
            'UPDATE profiles SET mikrotik_data = $1 WHERE mikrotik_id = $2 AND type = $3',
            [JSON.stringify(profile), profile['.id'], 'pppoe']
          );
          updatedProfiles++;
        }
        syncedProfiles++;
      }
    }

    const duration = Date.now() - startTime;

    // Log business event
    mikrotikService.client.monitoring.recordBusinessEvent('profiles_synced', syncedProfiles);
    mikrotikService.client.auditLogger.logSystemOperation('PROFILE_SYNC_ENHANCED', {
      hotspotProfiles: systemHotspotProfiles.length,
      pppoeProfiles: systemPPPoEProfiles.length,
      syncedProfiles,
      createdProfiles,
      updatedProfiles,
      duration,
      result: 'success'
    });

    console.log(`✅ Profile sync completed: ${syncedProfiles} profiles in ${duration}ms`);
    console.log(`   Created: ${createdProfiles}, Updated: ${updatedProfiles}`);

    return {
      success: true,
      hotspotProfiles: systemHotspotProfiles.length,
      pppoeProfiles: systemPPPoEProfiles.length,
      syncedProfiles,
      createdProfiles,
      updatedProfiles,
      duration
    };

  } catch (error) {
    const enhancedError = mikrotikService.client.errorHandler.handleError(error, {
      component: 'profile_sync',
      operation: 'sync_profiles'
    });

    mikrotikService.client.auditLogger.logErrorEvent('PROFILE_SYNC_FAILED', {
      error: error.message
    });

    throw enhancedError;
  }
}

// Example 4: Enhanced User Cleanup
async function cleanupExpiredUsersEnhanced() {
  const mikrotikService = global.mikrotikService;

  try {
    console.log('🧹 Starting enhanced expired user cleanup...');

    const startTime = Date.now();
    let cleanedUsers = 0;
    let cleanedVouchers = 0;
    let cleanedPPPoE = 0;

    // Get expired voucher users
    const voucherUsers = await mikrotikService.client.execute('/ip/hotspot/user/print', {}, {
      priority: 'low',
      useCache: true
    });

    const now = Math.floor(Date.now() / 1000);

    for (const user of voucherUsers) {
      if (!user.comment) continue;

      try {
        const commentData = mikrotikService.client.parseComment(user.comment);

        if (commentData.system === 'voucher' && commentData.valid_until_timestamp) {
          const validUntil = parseInt(commentData.valid_until_timestamp);

          if (validUntil > 0 && now > validUntil) {
            // User is expired, disable it
            await mikrotikService.client.execute('/ip/hotspot/user/set', {
              '.id': user['.id'],
              'disabled': 'yes'
            });

            // Update database
            if (mikrotikService.db) {
              await mikrotikService.db.query(
                'UPDATE vouchers SET status = $1 WHERE code = $2',
                ['expired', user.name]
              );
            }

            cleanedVouchers++;
            cleanedUsers++;

            // Log cleanup
            mikrotikService.client.auditLogger.logUserManagement('VOUCHER_USER_EXPIRED', {
              username: user.name,
              validUntil: new Date(validUntil * 1000).toISOString(),
              action: 'disabled'
            });
          }
        }
      } catch (parseError) {
        console.warn(`Failed to parse comment for user ${user.name}:`, parseError.message);
      }
    }

    // Get expired PPPoE users
    const pppoeUsers = await mikrotikService.client.execute('/ppp/secret/print', {}, {
      priority: 'low',
      useCache: true
    });

    for (const user of pppoeUsers) {
      if (!user.comment) continue;

      try {
        const commentData = JSON.parse(user.comment);

        if (commentData.expiry_date) {
          const expiryDate = new Date(commentData.expiry_date);

          if (expiryDate < new Date()) {
            // User is expired, disable it
            await mikrotikService.client.execute('/ppp/secret/set', {
              '.id': user['.id'],
              'disabled': 'yes'
            });

            // Update database
            if (mikrotikService.db) {
              await mikrotikService.db.query(
                'UPDATE pppoe_users SET status = $1 WHERE username = $2',
                ['expired', user.name]
              );
            }

            cleanedPPoE++;
            cleanedUsers++;

            // Log cleanup
            mikrotikService.client.auditLogger.logUserManagement('PPPOE_USER_EXPIRED', {
              username: user.name,
              expiryDate: commentData.expiry_date,
              action: 'disabled'
            });
          }
        }
      } catch (parseError) {
        console.warn(`Failed to parse comment for PPPoE user ${user.name}:`, parseError.message);
      }
    }

    const duration = Date.now() - startTime;

    // Log business event
    mikrotikService.client.monitoring.recordBusinessEvent('users_cleaned', cleanedUsers);
    mikrotikService.client.auditLogger.logSystemOperation('USER_CLEANUP_ENHANCED', {
      totalUsers: cleanedUsers,
      voucherUsers: cleanedVouchers,
      pppoeUsers: cleanedPPoE,
      duration,
      result: 'success'
    });

    console.log(`✅ User cleanup completed: ${cleanedUsers} users in ${duration}ms`);
    console.log(`   Vouchers: ${cleanedVouchers}, PPPoE: ${cleanedPPoE}`);

    return {
      success: true,
      totalUsers: cleanedUsers,
      voucherUsers: cleanedVouchers,
      pppoeUsers: cleanedPPoE,
      duration
    };

  } catch (error) {
    const enhancedError = mikrotikService.client.errorHandler.handleError(error, {
      component: 'user_cleanup',
      operation: 'cleanup_expired_users'
    });

    mikrotikService.client.auditLogger.logErrorEvent('USER_CLEANUP_FAILED', {
      error: error.message
    });

    throw enhancedError;
  }
}

// Example 5: Real-time Session Monitoring
async function getActiveSessionsEnhanced() {
  const mikrotikService = global.mikrotikService;

  try {
    // Use parallel execution with different priorities
    const [hotspotActive, pppoeActive] = await Promise.all([
      mikrotikService.client.execute('/ip/hotspot/active/print', {}, {
        priority: 'low',
        useCache: true
      }),
      mikrotikService.client.execute('/ppp/active/print', {}, {
        priority: 'low',
        useCache: true
      })
    ]);

    // Enrich session data with user information
    const enrichedHotspotSessions = await Promise.all(
      hotspotActive.map(async (session) => {
        try {
          const user = await mikrotikService.client.execute('/ip/hotspot/user/print', {
            '.id': session.user
          }, { priority: 'low', useCache: true });

          return {
            ...session,
            userInfo: user[0] ? {
              username: user[0].name,
              profile: user[0].profile,
              comment: mikrotikService.client.parseComment(user[0].comment)
            } : null
          };
        } catch (error) {
          return {
            ...session,
            userInfo: null,
            error: error.message
          };
        }
      })
    );

    const enrichedPPPoESessions = await Promise.all(
      pppoeActive.map(async (session) => {
        try {
          const secret = await mikrotikService.client.execute('/ppp/secret/print', {
            '.id': session.name
          }, { priority: 'low', useCache: true });

          return {
            ...session,
            userInfo: secret[0] ? {
              username: secret[0].name,
              profile: secret[0].profile,
              comment: mikrotikService.client.parseComment(secret[0].comment)
            } : null
          };
        } catch (error) {
          return {
            ...session,
            userInfo: null,
            error: error.message
          };
        }
      })
    );

    const sessions = {
      hotspot: enrichedHotspotSessions,
      pppoe: enrichedPPPoESessions,
      total: enrichedHotspotSessions.length + enrichedPPPoESessions.length,
      timestamp: new Date().toISOString()
    };

    // Log monitoring event
    mikrotikService.client.monitoring.recordBusinessEvent('active_sessions_monitored', sessions.total);
    mikrotikService.client.auditLogger.logSystemOperation('ACTIVE_SESSIONS_QUERIED', {
      hotspotSessions: sessions.hotspot.length,
      pppoeSessions: sessions.pppoe.length,
      totalSessions: sessions.total
    });

    return sessions;

  } catch (error) {
    const enhancedError = mikrotikService.client.errorHandler.handleError(error, {
      component: 'session_monitoring',
      operation: 'get_active_sessions'
    });

    throw enhancedError;
  }
}

// Example 6: Health Check with Enhanced Monitoring
async function performEnhancedHealthCheck() {
  const mikrotikService = global.mikrotikService;

  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {}
  };

  try {
    // Check service initialization
    const serviceStatus = mikrotikService.getStatus();
    health.checks.service = {
      status: serviceStatus.initialized ? 'healthy' : 'unhealthy',
      initialized: serviceStatus.initialized,
      uptime: serviceStatus.uptime
    };

    if (!serviceStatus.initialized) {
      health.status = 'degraded';
    }

    // Check Mikrotik connection
    const connectionStatus = mikrotikService.getConnectionStatus();
    health.checks.connection = {
      status: connectionStatus.connected ? 'healthy' : 'unhealthy',
      host: connectionStatus.host,
      port: connectionStatus.port,
      uptime: connectionStatus.uptime || 0
    };

    if (!connectionStatus.connected) {
      health.status = 'degraded';
    }

    // Check circuit breaker
    if (mikrotikService.client.circuitBreaker) {
      const cbState = mikrotikService.client.circuitBreaker.getState();
      health.checks.circuitBreaker = {
        status: cbState.state === 'CLOSED' ? 'healthy' : 'degraded',
        state: cbState.state,
        score: cbState.score
      };

      if (cbState.state !== 'CLOSED') {
        health.status = 'degraded';
      }
    }

    // Check connection pool
    if (mikrotikService.client.connectionPool) {
      const poolStats = mikrotikService.client.connectionPool.getStats();
      health.checks.connectionPool = {
        status: poolStats.healthy ? 'healthy' : 'degraded',
        connections: poolStats.totalConnections,
        active: poolStats.activeConnections,
        utilization: poolStats.poolUtilization
      };

      if (!poolStats.healthy) {
        health.status = 'degraded';
      }
    }

    // Check cache
    if (mikrotikService.client.cache) {
      const cacheStats = mikrotikService.client.cache.getStats();
      health.checks.cache = {
        status: 'healthy',
        hitRate: cacheStats.hitRate,
        size: cacheStats.currentSize,
        memoryUsage: cacheStats.memoryUsage
      };
    }

    // Check rate limiter
    if (mikrotikService.client.rateLimiter) {
      const rateLimitStats = mikrotikService.client.rateLimiter.getStats();
      health.checks.rateLimiter = {
        status: rateLimitStats.successRate > 90 ? 'healthy' : 'degraded',
        successRate: rateLimitStats.successRate,
        bucketUtilization: rateLimitStats.bucketUtilization,
        queueSize: rateLimitStats.queueSize
      };

      if (rateLimitStats.successRate < 90) {
        health.status = 'degraded';
      }
    }

    // Log health check
    mikrotikService.client.auditLogger.logSystemOperation('HEALTH_CHECK_PERFORMED', {
      status: health.status,
      checks: Object.keys(health.checks).length,
      issues: health.status !== 'healthy' ? Object.values(health.checks).filter(c => c.status !== 'healthy').map(c => c.status) : []
    });

    return health;

  } catch (error) {
    health.status = 'unhealthy';
    health.checks.error = {
      status: 'unhealthy',
      error: error.message
    };

    mikrotikService.client.auditLogger.logErrorEvent('HEALTH_CHECK_FAILED', {
      error: error.message
    });

    return health;
  }
}

module.exports = {
  createEnhancedVoucher,
  createEnhancedPPPoEUser,
  syncProfilesEnhanced,
  cleanupExpiredUsersEnhanced,
  getActiveSessionsEnhanced,
  performEnhancedHealthCheck
};