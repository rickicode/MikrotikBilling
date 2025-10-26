/**
 * Network Monitoring Dashboard
 *
 * Provides real-time monitoring of Mikrotik connection pool performance,
 * health metrics, and network statistics.
 */

const routes = async (fastify, options) => {

  // Network monitoring dashboard
  fastify.get('/network-monitor', async (request, reply) => {
    try {
      const mikrotikStats = fastify.mikrotik.getConnectionStats();
      const healthStatus = await fastify.mikrotik.getHealthStatus();

      return reply.view('network-monitor', {
        title: 'Network Connection Monitor',
        mikrotikStats,
        healthStatus,
        formatUptime: (ms) => {
          const seconds = Math.floor(ms / 1000);
          if (seconds < 3600) {
            return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
          } else if (seconds < 86400) {
            return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
          } else {
            return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
          }
        },
        formatDateTime: (timestamp) => {
          return timestamp ? new Date(timestamp).toLocaleString() : 'Never';
        },
        getProgressBarClass: (value) => {
          if (value < 50) return 'bg-success';
          if (value < 80) return 'bg-warning';
          return 'bg-danger';
        },
        getStatusBadgeClass: (status) => {
          const classes = {
            'healthy': 'success',
            'unhealthy': 'danger',
            'disconnected': 'warning',
            'connected': 'primary',
            'CLOSED': 'success',
            'OPEN': 'danger',
            'HALF_OPEN': 'warning'
          };
          return classes[status] || 'secondary';
        }
      });
    } catch (error) {
      fastify.log.error('Error loading network monitor:', error);
      return reply.view('error', { error: { message: 'Failed to load network monitor', stack: error.stack } });
    }
  });

  // API endpoint for real-time stats
  fastify.get('/api/network-stats', async (request, reply) => {
    try {
      const mikrotikStats = fastify.mikrotik.getConnectionStats();
      const healthStatus = await fastify.mikrotik.getHealthStatus();

      return {
        success: true,
        data: {
          mikrotikStats,
          healthStatus,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      fastify.log.error('Error getting network stats:', error);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // API endpoint for connection details
  fastify.get('/api/connection-details', async (request, reply) => {
    try {
      const stats = fastify.mikrotik.getConnectionStats();

      return {
        success: true,
        data: {
          connections: stats.connections,
          details: stats.connections,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      fastify.log.error('Error getting connection details:', error);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // API endpoint for performance metrics
  fastify.get('/api/performance-metrics', async (request, reply) => {
    try {
      const stats = fastify.mikrotik.getConnectionStats();

      return {
        success: true,
        data: {
          performance: stats.performance,
          client: stats.client,
          errors: stats.errors,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      fastify.log.error('Error getting performance metrics:', error);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Health check endpoint
  fastify.get('/api/network-health', async (request, reply) => {
    try {
      const healthStatus = await fastify.mikrotik.getHealthStatus();

      return {
        success: true,
        data: healthStatus,
        timestamp: Date.now()
      };
    } catch (error) {
      fastify.log.error('Error checking network health:', error);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Test connection endpoint
  fastify.post('/api/test-connection', async (request, reply) => {
    try {
      const startTime = Date.now();

      // Test with multiple commands to check performance
      const commands = [
        { command: '/system/identity/print', priority: 'high' },
        { command: '/system/resource/print', priority: 'normal' },
        { command: '/interface/print', priority: 'low' }
      ];

      const results = await fastify.mikrotik.executeBatch(commands, { priority: 'high' });
      const totalTime = Date.now() - startTime;

      const healthStatus = await fastify.mikrotik.getHealthStatus();

      return {
        success: true,
        data: {
          testResults: {
            commandsExecuted: results.length,
            successfulCommands: results.filter(r => r.success).length,
            totalTime,
            averageTimePerCommand: Math.round(totalTime / commands.length),
            results
          },
          healthStatus,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      fastify.log.error('Connection test failed:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
        timestamp: Date.now()
      });
    }
  });

  // Reset connection pool endpoint
  fastify.post('/api/reset-connection-pool', async (request, reply) => {
    try {
      console.log('🔄 Resetting Mikrotik connection pool...');

      // Disconnect and reconnect
      await fastify.mikrotik.disconnect();

      // Wait a moment before reconnecting
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Reload configuration to reinitialize
      await fastify.mikrotik.loadConfig();

      const stats = fastify.mikrotik.getConnectionStats();

      return {
        success: true,
        data: {
          message: 'Connection pool reset successfully',
          stats,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      fastify.log.error('Failed to reset connection pool:', error);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });
};

module.exports = routes;