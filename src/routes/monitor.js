const AuthMiddleware = require('../middleware/auth');

async function monitorRoutes(fastify, options) {
  const auth = new AuthMiddleware(fastify);

  // Monitor page
  fastify.get('/', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      // Get statistics from Mikrotik
      const mikrotik = fastify.mikrotik;
      const stats = {
        totalHotspot: 0,
        hotspotOnline: 0,
        totalPPPoE: 0,
        pppoeOnline: 0,
        totalHotspotOnlineAll: 0,
        totalPPPoEOnlineAll: 0,
        activeHotspotUsers: 0,
        expiredHotspotUsers: 0,
        activePPPoEUsers: 0,
        disabledPPPoEUsers: 0,
        // Additional detailed stats
        hotspotOfflineUsers: 0,
        pppoeOfflineUsers: 0,
        hotspotSystemUsers: 0,
        pppoeSystemUsers: 0
      };

      // Get RouterOS identity
      let routerOSIdentity = 'Not Connected';
      let routerOSVersion = 'Not Connected';
      let routerOSUptime = 'Not Connected';

      // Get Mikrotik data if connected
      const connectionInfo = mikrotik ? mikrotik.getConnectionInfo() : { connected: false, status: 'not_configured' };
      const isConnected = connectionInfo.connected && connectionInfo.hasValidConfig;

      if (isConnected) {
        try {
          // Get RouterOS system information
          try {
            const identity = await mikrotik.executeCommand('/system/identity/print');
            if (identity && identity.length > 0) {
              routerOSIdentity = identity[0]?.name || identity[0]['identity-name'] || identity[0]?.identity || 'Unknown';
            }
          } catch (error) {
            console.warn('Error getting RouterOS identity:', error.message);
          }

          try {
            const resource = await mikrotik.executeCommand('/system/resource/print');
            if (resource && resource.length > 0) {
              routerOSVersion = resource[0]?.version || 'Unknown';
              routerOSUptime = resource[0]?.uptime || 'Unknown';
            }
          } catch (error) {
            console.warn('Error getting RouterOS resource info:', error.message);
          }

          // Get hotspot users
          const hotspotUsers = await mikrotik.getHotspotUsers();
          stats.totalHotspot = hotspotUsers.length;
          stats.hotspotOnline = hotspotUsers.filter(user => user.profile !== 'default').length;
          stats.hotspotOfflineUsers = hotspotUsers.filter(user => user.profile === 'default').length;

          // Get PPPoE secrets
          const pppoeSecrets = await mikrotik.getPPPoESecrets();
          stats.totalPPPoE = pppoeSecrets.length;
          stats.pppoeOnline = pppoeSecrets.filter(secret => !secret.disabled).length;
          stats.pppoeOfflineUsers = pppoeSecrets.filter(secret => secret.disabled).length;

          // Get total online counts from active sessions (all users, not just system-managed)
          try {
            const hotspotActiveSessions = await mikrotik.getHotspotActive();
            stats.totalHotspotOnlineAll = hotspotActiveSessions.length;
          } catch (error) {
            console.warn('Error getting total hotspot active sessions:', error.message);
            stats.totalHotspotOnlineAll = 0;
          }

          try {
            const pppoeActiveSessions = await mikrotik.getPPPoEActive();
            stats.totalPPPoEOnlineAll = pppoeActiveSessions.length;
          } catch (error) {
            console.warn('Error getting total PPPoE active sessions:', error.message);
            stats.totalPPPoEOnlineAll = 0;
          }

          // Count system-managed users
          stats.activeHotspotUsers = hotspotUsers.filter(user => {
            try {
              const comment = user.comment ? JSON.parse(user.comment) : null;
              return comment && comment.system === 'hotspot' && !user.disabled;
            } catch {
              return false;
            }
          }).length;

          stats.expiredHotspotUsers = hotspotUsers.filter(user => {
            try {
              const comment = user.comment ? JSON.parse(user.comment) : null;
              return comment && comment.system === 'hotspot' && user.disabled;
            } catch {
              return false;
            }
          }).length;

          stats.hotspotSystemUsers = hotspotUsers.filter(user => {
            try {
              const comment = user.comment ? JSON.parse(user.comment) : null;
              return comment && comment.system === 'hotspot';
            } catch {
              return false;
            }
          }).length;

          stats.activePPPoEUsers = pppoeSecrets.filter(secret => {
            try {
              const comment = secret.comment ? JSON.parse(secret.comment) : null;
              return comment && comment.system === 'pppoe' && !secret.disabled;
            } catch {
              return false;
            }
          }).length;

          stats.disabledPPPoEUsers = pppoeSecrets.filter(secret => {
            try {
              const comment = secret.comment ? JSON.parse(secret.comment) : null;
              return comment && comment.system === 'pppoe' && secret.disabled;
            } catch {
              return false;
            }
          }).length;

          stats.pppoeSystemUsers = pppoeSecrets.filter(secret => {
            try {
              const comment = secret.comment ? JSON.parse(secret.comment) : null;
              return comment && comment.system === 'pppoe';
            } catch {
              return false;
            }
          }).length;

        } catch (error) {
          fastify.log.warn('Error getting Mikrotik data:', error.message);
        }
      }

      return reply.view('monitor/index', {
        stats,
        routerOSIdentity,
        routerOSVersion,
        routerOSUptime,
        mikrotikConnected: isConnected,
        connectionStatus: connectionInfo.status || 'disconnected',
        admin: request.admin,
        settings: reply.locals.settings || {}
      });

    } catch (error) {
      fastify.log.error('Monitor page error:', error);
      reply.code(500).view('error', {
        error: 'Internal Server Error',
        admin: request.admin,
        settings: reply.locals.settings || {}
      });
    }
  });

  // Get hotspot sessions
  fastify.get('/hotspot-sessions', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const mikrotik = fastify.mikrotik;
      let sessions = [];

      if (mikrotik && mikrotik.isConnected()) {
        sessions = await mikrotik.getHotspotActive();
      }

      return reply.send({ success: true, data: sessions });

    } catch (error) {
      fastify.log.error('Error getting hotspot sessions:', error);
      throw error;
    }
  });

  // Get PPPoE sessions
  fastify.get('/pppoe-sessions', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const mikrotik = fastify.mikrotik;
      let sessions = [];

      if (mikrotik && mikrotik.isConnected()) {
        sessions = await mikrotik.getPPPoEActive();
      }

      return reply.send({ success: true, data: sessions });

    } catch (error) {
      fastify.log.error('Error getting PPPoE sessions:', error);
      throw error;
    }
  });

  // Cleanup expired users
  fastify.post('/cleanup-expired', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const mikrotik = fastify.mikrotik;
      let result = { cleanedHotspot: 0, disabledPPPoE: 0 };

      if (mikrotik && mikrotik.isConnected()) {
        // Find and cleanup expired users
        const expiredHotspot = await mikrotik.findExpiredUsers('hotspot');
        const expiredPPPoE = await mikrotik.findExpiredUsers('pppoe');

        // Delete expired hotspot users
        for (const user of expiredHotspot) {
          try {
            await mikrotik.deleteHotspotUser(user.name);
            result.cleanedHotspot++;
          } catch (error) {
            console.warn('Failed to delete hotspot user:', user.name, error.message);
          }
        }

        // Disable expired PPPoE users
        for (const user of expiredPPPoE) {
          try {
            await mikrotik.updatePPPoESecret(user.name, { disabled: 'yes' });
            result.disabledPPPoE++;
          } catch (error) {
            console.warn('Failed to disable PPPoE user:', user.name, error.message);
          }
        }
      }

      // Log admin activity
      if (fastify.logAdminActivity) {
        fastify.logAdminActivity(request.admin.id, 'cleanup_expired', {
          result
        });
      }

      return reply.send({
        success: true,
        message: 'Cleanup completed successfully',
        data: result
      });

    } catch (error) {
      fastify.log.error('Error during cleanup:', error);
      throw error;
    }
  });

  // Test connection
  fastify.post('/test-connection', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const mikrotik = fastify.mikrotik;
      let result = { connected: false, responseTime: 0 };

      if (mikrotik) {
        const start = Date.now();
        result.connected = await mikrotik.isConnected();
        result.responseTime = Date.now() - start;
      }

      return reply.send({ success: true, data: result });

    } catch (error) {
      fastify.log.error('Connection test error:', error);
      throw error;
    }
  });

  // Get monitor statistics (API endpoint for AJAX requests)
  fastify.get('/stats', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const mikrotik = fastify.mikrotik;
      const stats = {
        totalHotspot: 0,
        hotspotOnline: 0,
        totalPPPoE: 0,
        pppoeOnline: 0,
        totalHotspotOnlineAll: 0,
        totalPPPoEOnlineAll: 0,
        activeHotspotUsers: 0,
        expiredHotspotUsers: 0,
        activePPPoEUsers: 0,
        disabledPPPoEUsers: 0,
        // Additional detailed stats
        hotspotOfflineUsers: 0,
        pppoeOfflineUsers: 0,
        hotspotSystemUsers: 0,
        pppoeSystemUsers: 0
      };

      // Get Mikrotik data if connected
      const connectionInfo = mikrotik ? mikrotik.getConnectionInfo() : { connected: false, status: 'not_configured' };
      const isConnected = connectionInfo.connected && connectionInfo.hasValidConfig;

      if (isConnected) {
        try {
          // Get hotspot users
          const hotspotUsers = await mikrotik.getHotspotUsers();
          stats.totalHotspot = hotspotUsers.length;
          stats.hotspotOnline = hotspotUsers.filter(user => user.profile !== 'default').length;
          stats.hotspotOfflineUsers = hotspotUsers.filter(user => user.profile === 'default').length;

          // Get PPPoE secrets
          const pppoeSecrets = await mikrotik.getPPPoESecrets();
          stats.totalPPPoE = pppoeSecrets.length;
          stats.pppoeOnline = pppoeSecrets.filter(secret => !secret.disabled).length;
          stats.pppoeOfflineUsers = pppoeSecrets.filter(secret => secret.disabled).length;

          // Get total online counts from active sessions (all users, not just system-managed)
          try {
            const hotspotActiveSessions = await mikrotik.getHotspotActive();
            stats.totalHotspotOnlineAll = hotspotActiveSessions.length;
          } catch (error) {
            console.warn('Error getting total hotspot active sessions:', error.message);
            stats.totalHotspotOnlineAll = 0;
          }

          try {
            const pppoeActiveSessions = await mikrotik.getPPPoEActive();
            stats.totalPPPoEOnlineAll = pppoeActiveSessions.length;
          } catch (error) {
            console.warn('Error getting total PPPoE active sessions:', error.message);
            stats.totalPPPoEOnlineAll = 0;
          }

          // Count system-managed users
          stats.activeHotspotUsers = hotspotUsers.filter(user => {
            try {
              const comment = user.comment ? JSON.parse(user.comment) : null;
              return comment && comment.system === 'hotspot' && !user.disabled;
            } catch {
              return false;
            }
          }).length;

          stats.expiredHotspotUsers = hotspotUsers.filter(user => {
            try {
              const comment = user.comment ? JSON.parse(user.comment) : null;
              return comment && comment.system === 'hotspot' && user.disabled;
            } catch {
              return false;
            }
          }).length;

          stats.hotspotSystemUsers = hotspotUsers.filter(user => {
            try {
              const comment = user.comment ? JSON.parse(user.comment) : null;
              return comment && comment.system === 'hotspot';
            } catch {
              return false;
            }
          }).length;

          stats.activePPPoEUsers = pppoeSecrets.filter(secret => {
            try {
              const comment = secret.comment ? JSON.parse(secret.comment) : null;
              return comment && comment.system === 'pppoe' && !secret.disabled;
            } catch {
              return false;
            }
          }).length;

          stats.disabledPPPoEUsers = pppoeSecrets.filter(secret => {
            try {
              const comment = secret.comment ? JSON.parse(secret.comment) : null;
              return comment && comment.system === 'pppoe' && secret.disabled;
            } catch {
              return false;
            }
          }).length;

          stats.pppoeSystemUsers = pppoeSecrets.filter(secret => {
            try {
              const comment = secret.comment ? JSON.parse(secret.comment) : null;
              return comment && comment.system === 'pppoe';
            } catch {
              return false;
            }
          }).length;

        } catch (error) {
          fastify.log.warn('Error getting Mikrotik data:', error.message);
        }
      }

      return reply.send({
        success: true,
        data: {
          ...stats,
          mikrotikConnected: isConnected,
          connectionStatus: connectionInfo.status || 'disconnected'
        }
      });

    } catch (error) {
      fastify.log.error('Monitor stats error:', error);
      throw error;
    }
  });

  // Sync with Mikrotik (with offline handling)
  fastify.post('/sync-mikrotik', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      const mikrotik = fastify.mikrotik;
      const connectionInfo = mikrotik?.getConnectionInfo() || {};

      // Check if Mikrotik is offline
      if (connectionInfo.isOffline) {
        return reply.send({
          success: false,
          message: 'Mikrotik is offline. Please check the connection.',
          data: {
            offline: true,
            lastError: connectionInfo.lastError,
            status: 'offline'
          }
        });
      }

      let result = { profiles: 0, users: 0 };

      if (mikrotik && mikrotik.isConnected()) {
        // Use the ensureRouterOSIntegration method
        try {
          const success = await mikrotik.ensureRouterOSIntegration();
          result = { success: success, synced: true };
        } catch (error) {
          // Handle connection errors gracefully
          if (error.message.includes('timeout') ||
              error.message.includes('connection') ||
              error.message.includes('ECONNREFUSED')) {
            return reply.send({
              success: false,
              message: 'Connection to Mikrotik lost during sync',
              data: {
                offline: true,
                error: error.message,
                status: 'connection_lost'
              }
            });
          }
          throw error;
        }
      } else {
        return reply.send({
          success: false,
          message: 'Mikrotik is not connected',
          data: {
            connected: false,
            status: 'disconnected'
          }
        });
      }

      // Log admin activity
      if (fastify.logAdminActivity) {
        fastify.logAdminActivity(request.admin.id, 'sync_mikrotik', {
          result
        });
      }

      return reply.send({
        success: true,
        message: 'Sync completed successfully',
        data: result
      });

    } catch (error) {
      fastify.log.error('Sync error:', error);

      // Check if it's a connection error
      if (error.message.includes('timeout') ||
          error.message.includes('connection') ||
          error.message.includes('ECONNREFUSED')) {
        return reply.send({
          success: false,
          message: 'Failed to connect to Mikrotik',
          data: {
            offline: true,
            error: error.message,
            status: 'connection_failed'
          }
        });
      }

      throw error;
    }
  });
}

module.exports = monitorRoutes;