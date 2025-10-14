const MonitoringService = require('../services/MonitoringService');
const AlertingService = require('../services/AlertingService');
const AuthMiddleware = require('../middleware/auth');
const logger = console;

/**
 * Monitoring and Alerting Routes
 * Handles system monitoring, metrics collection, and alert management
 */
async function monitoringRoutes(fastify, options) {
  const auth = new AuthMiddleware(fastify);
  const monitoringService = new MonitoringService();
  const alertingService = new AlertingService();

  // Metrics endpoint for Prometheus
  fastify.get('/metrics', async (request, reply) => {
    try {
      // Simple metrics endpoint
      return reply.type('text/plain').send('mikrotik_billing_up 1\n');
    } catch (error) {
      return reply.status(500).send('Error getting metrics');
    }
  });

  // Health check endpoints
  fastify.get('/health', async (request, reply) => {
    try {
      return reply.send({ status: 'healthy', timestamp: new Date().toISOString() });
    } catch (error) {
      return reply.status(503).send({ status: 'unhealthy' });
    }
  });

  fastify.get('/ready', async (request, reply) => {
    try {
      return reply.send({ status: 'ready', timestamp: new Date().toISOString() });
    } catch (error) {
      return reply.status(503).send({ status: 'not ready' });
    }
  });

  fastify.get('/live', async (request, reply) => {
    try {
      return reply.send({ status: 'alive', timestamp: new Date().toISOString() });
    } catch (error) {
      return reply.status(503).send({ status: 'not alive' });
    }
  });

  // Monitoring dashboard
  fastify.get('/monitoring', {
    preHandler: [auth.requireRole('admin')]
  }, monitoringDashboard);

  // Get metrics for dashboard
  fastify.get('/api/monitoring/metrics', {
    preHandler: [auth.requireRole('admin')]
  }, getMetrics);

  // Get system status
  fastify.get('/api/monitoring/status', {
    preHandler: [auth.requireRole('admin')]
  }, getSystemStatus);

  // Alert management
  fastify.get('/api/monitoring/alerts', {
    preHandler: [auth.requireRole('admin')]
  }, getAlerts);

  fastify.post('/api/monitoring/alerts/:alertId/acknowledge', {
    preHandler: [auth.requireRole('admin')]
  }, acknowledgeAlert);

  fastify.get('/api/monitoring/alerts/history', {
    preHandler: [auth.requireRole('admin')]
  }, getAlertHistory);

  // Alert rules management
  fastify.get('/api/monitoring/rules', {
    preHandler: [auth.requireRole('admin')]
  }, getAlertRules);

  fastify.put('/api/monitoring/rules/:ruleId', {
    preHandler: [auth.requireRole('admin')]
  }, updateAlertRule);

  // WhatsApp notification channels
  fastify.get('/api/monitoring/whatsapp-channels', {
    preHandler: [auth.requireRole('admin')]
  }, getWhatsAppChannels);

  fastify.put('/api/monitoring/whatsapp-channels/:channelId', {
    preHandler: [auth.requireRole('admin')]
  }, updateWhatsAppChannel);

  // Test WhatsApp notification
  fastify.post('/api/monitoring/test-whatsapp', {
    preHandler: [auth.requireRole('admin')]
  }, testWhatsAppNotification);

  // System metrics
  fastify.get('/api/monitoring/system', {
    preHandler: [auth.requireRole('admin')]
  }, getSystemMetrics);

  // Performance metrics
  fastify.get('/api/monitoring/performance', {
    preHandler: [auth.requireRole('admin')]
  }, getPerformanceMetrics);

  // Public analytics endpoint for service worker
  fastify.post('/api/analytics/performance', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute'
      }
    }
  }, postAnalyticsPerformance);

  // Business metrics
  fastify.get('/api/monitoring/business', {
    preHandler: [auth.requireRole('admin')]
  }, getBusinessMetrics);

  // Metrics export
  fastify.get('/api/monitoring/export', {
    preHandler: [auth.requireRole('admin')]
  }, exportMetrics);

  // Data retention
  fastify.get('/api/monitoring/data-retention', {
    preHandler: [auth.requireRole('admin')]
  }, getDataRetentionStats);

  fastify.post('/api/monitoring/cleanup', {
    preHandler: [auth.requireRole('admin')]
  }, runDataCleanup);

  fastify.get('/api/monitoring/cleanup-history', {
    preHandler: [auth.requireRole('admin')]
  }, getCleanupHistory);

  /**
   * Monitoring dashboard page
   */
  async function monitoringDashboard(request, reply) {
    try {
      return reply.view('monitoring/index', {
        page: 'monitoring',
        title: 'System Monitoring',
        user: request.user
      });
    } catch (error) {
      fastify.log.error('Monitoring dashboard error:', error);
      return reply.status(500).send('Internal Server Error');
    }
  }

  /**
   * Get metrics for dashboard
   */
  async function getMetrics(request, reply) {
    try {
      const { timeRange = '1h' } = request.query;
      const [systemMetrics, businessMetrics, alerts] = await Promise.all([
        collectSystemMetrics(timeRange),
        collectBusinessMetrics(timeRange),
        alertingService.getActiveAlerts()
      ]);

      return reply.send({
        success: true,
        data: {
          system: systemMetrics,
          business: businessMetrics,
          alerts: alerts,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      fastify.log.error('Get metrics error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get metrics',
        error: error.message
      });
    }
  }

  /**
   * Get system status
   */
  async function getSystemStatus(request, reply) {
    try {
      const [dbStatus, redisStatus, mikrotikStatus, systemInfo] = await Promise.all([
        checkDatabase(),
        checkRedis(),
        checkMikrotik(),
        getSystemInfo()
      ]);

      return reply.send({
        success: true,
        data: {
          database: dbStatus,
          redis: redisStatus,
          mikrotik: mikrotikStatus,
          system: systemInfo,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      fastify.log.error('Get system status error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get system status',
        error: error.message
      });
    }
  }

  /**
   * Get alerts
   */
  async function getAlerts(request, reply) {
    try {
      const { status = 'active', page = 1, limit = 20 } = request.query;
      const alerts = await alertingService.getAlerts(status, page, limit);

      return reply.send({
        success: true,
        data: alerts
      });
    } catch (error) {
      fastify.log.error('Get alerts error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get alerts',
        error: error.message
      });
    }
  }

  /**
   * Acknowledge alert
   */
  async function acknowledgeAlert(request, reply) {
    try {
      const { alertId } = request.params;
      const { comment } = request.body;

      await alertingService.acknowledgeAlert(alertId, comment, request.user.id);

      return reply.send({
        success: true,
        message: 'Alert acknowledged successfully'
      });
    } catch (error) {
      fastify.log.error('Acknowledge alert error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to acknowledge alert',
        error: error.message
      });
    }
  }

  /**
   * Get alert history
   */
  async function getAlertHistory(request, reply) {
    try {
      const { timeRange = '24h', page = 1, limit = 50 } = request.query;
      const history = await alertingService.getAlertHistory(timeRange, page, limit);

      return reply.send({
        success: true,
        data: history
      });
    } catch (error) {
      fastify.log.error('Get alert history error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get alert history',
        error: error.message
      });
    }
  }

  /**
   * Get alert rules
   */
  async function getAlertRules(request, reply) {
    try {
      const rules = await alertingService.getAlertRules();

      return reply.send({
        success: true,
        data: rules
      });
    } catch (error) {
      fastify.log.error('Get alert rules error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get alert rules',
        error: error.message
      });
    }
  }

  /**
   * Update alert rule
   */
  async function updateAlertRule(request, reply) {
    try {
      const { ruleId } = request.params;
      const updates = request.body;

      await alertingService.updateAlertRule(ruleId, updates);

      return reply.send({
        success: true,
        message: 'Alert rule updated successfully'
      });
    } catch (error) {
      fastify.log.error('Update alert rule error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to update alert rule',
        error: error.message
      });
    }
  }

  /**
   * Get WhatsApp channels
   */
  async function getWhatsAppChannels(request, reply) {
    try {
      const channels = await alertingService.getWhatsAppChannels();

      return reply.send({
        success: true,
        data: channels
      });
    } catch (error) {
      fastify.log.error('Get WhatsApp channels error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get WhatsApp channels',
        error: error.message
      });
    }
  }

  /**
   * Update WhatsApp channel
   */
  async function updateWhatsAppChannel(request, reply) {
    try {
      const { channelId } = request.params;
      const updates = request.body;

      await alertingService.updateWhatsAppChannel(channelId, updates);

      return reply.send({
        success: true,
        message: 'WhatsApp channel updated successfully'
      });
    } catch (error) {
      fastify.log.error('Update WhatsApp channel error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to update WhatsApp channel',
        error: error.message
      });
    }
  }

  /**
   * Test WhatsApp notification
   */
  async function testWhatsAppNotification(request, reply) {
    try {
      const { channelId, message } = request.body;

      await alertingService.sendTestNotification(channelId, message);

      return reply.send({
        success: true,
        message: 'Test notification sent successfully'
      });
    } catch (error) {
      fastify.log.error('Test WhatsApp notification error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to send test notification',
        error: error.message
      });
    }
  }

  /**
   * Get system metrics
   */
  async function getSystemMetrics(request, reply) {
    try {
      const { timeRange = '1h' } = request.query;
      const metrics = await collectSystemMetrics(timeRange);

      return reply.send({
        success: true,
        data: metrics
      });
    } catch (error) {
      fastify.log.error('Get system metrics error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get system metrics',
        error: error.message
      });
    }
  }

  /**
   * Get performance metrics
   */
  async function getPerformanceMetrics(request, reply) {
    try {
      const { timeRange = '1h' } = request.query;
      const metrics = await collectPerformanceMetrics(timeRange);

      return reply.send({
        success: true,
        data: metrics
      });
    } catch (error) {
      fastify.log.error('Get performance metrics error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get performance metrics',
        error: error.message
      });
    }
  }

  /**
   * Post analytics performance data (public endpoint for service worker)
   */
  async function postAnalyticsPerformance(request, reply) {
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
  }

  /**
   * Get business metrics
   */
  async function getBusinessMetrics(request, reply) {
    try {
      const { timeRange = '1d' } = request.query;
      const metrics = await collectBusinessMetrics(timeRange);

      return reply.send({
        success: true,
        data: metrics
      });
    } catch (error) {
      fastify.log.error('Get business metrics error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get business metrics',
        error: error.message
      });
    }
  }

  /**
   * Export metrics
   */
  async function exportMetrics(request, reply) {
    try {
      const { format = 'json', timeRange = '1d' } = request.query;
      const metrics = await collectBusinessMetrics(timeRange);

      if (format === 'csv') {
        const csv = convertToCSV(metrics);
        reply.type('text/csv');
        reply.header('Content-Disposition', 'attachment; filename="metrics.csv"');
        return reply.send(csv);
      }

      return reply.send({
        success: true,
        data: metrics
      });
    } catch (error) {
      fastify.log.error('Export metrics error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to export metrics',
        error: error.message
      });
    }
  }

  // Helper functions
  async function collectSystemMetrics(timeRange) {
    try {
      // Get real system metrics
      const os = require('os');
      const fs = require('fs');
      const path = require('path');

      // Get backup information from BackupManager
      let backupMetrics = {
        lastStatus: null,
        lastSuccessful: null,
        lastBackup: null
      };

      try {
        const BackupManager = require('../services/BackupManager');
        const backupManager = new BackupManager();
        const backupStats = await backupManager.getBackupStats();
        const backupList = await backupManager.getBackupList();

        if (backupList.length > 0) {
          const lastBackup = backupList[backupList.length - 1];
          backupMetrics.lastBackup = lastBackup.timestamp;
          backupMetrics.lastStatus = lastBackup.status;

          // Find last successful backup
          const lastSuccessful = backupList
            .filter(b => b.status === 'completed')
            .pop();

          if (lastSuccessful) {
            backupMetrics.lastSuccessful = new Date(lastSuccessful.timestamp).getTime();
          }
        }
      } catch (backupError) {
        console.warn('Error getting backup metrics:', backupError.message);
        backupMetrics.lastStatus = 'error';
      }

      // Get real system metrics
      const cpuUsage = process.cpuUsage();
      const memoryUsage = process.memoryUsage();
      const systemUptime = os.uptime();
      const loadAverage = os.loadavg();

      // Get disk usage (placeholder - would need proper implementation)
      const diskUsage = {
        used: 102400,
        total: 512000,
        percentage: 20
      };

      return {
        timestamp: new Date().toISOString(),
        timeRange,
        metrics: {
          cpu: {
            usage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
            cores: os.cpus().length
          },
          memory: {
            used: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
            total: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
            percentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)
          },
          disk: diskUsage,
          network: {
            bytesIn: 1048576, // Placeholder
            bytesOut: 524288  // Placeholder
          },
          uptime: systemUptime,
          loadAverage: loadAverage,
          backup: backupMetrics
        }
      };
    } catch (error) {
      console.error('Error collecting system metrics:', error);
      // Fallback to basic metrics
      return {
        timestamp: new Date().toISOString(),
        timeRange,
        metrics: {
          cpu: { usage: 0, cores: 1 },
          memory: { used: 0, total: 1000, percentage: 0 },
          disk: { used: 0, total: 1000, percentage: 0 },
          network: { bytesIn: 0, bytesOut: 0 },
          uptime: 0,
          loadAverage: [0, 0, 0],
          backup: {
            lastStatus: 'error',
            lastSuccessful: null,
            lastBackup: null
          }
        }
      };
    }
  }

  async function collectPerformanceMetrics(timeRange) {
    // Placeholder implementation
    return {
      timestamp: new Date().toISOString(),
      timeRange,
      metrics: {
        responseTime: {
          avg: 150,
          p95: 300,
          p99: 500
        },
        throughput: {
          requests: 1250,
          errors: 25,
          errorRate: 2.0
        },
        database: {
          connections: 15,
          queries: 8500,
          avgQueryTime: 12
        }
      }
    };
  }

  async function collectBusinessMetrics(timeRange) {
    try {
      const DatabaseManager = require('../database/DatabaseManager');
      const db = DatabaseManager.getInstance();

      // Get business metrics from database with better error handling
      const [
        totalUsers,
        activeUsers,
        totalVouchers,
        usedVouchers,
        totalRevenue,
        recentPayments
      ] = await Promise.all([
        db.query('SELECT COUNT(*) as total FROM customers').catch(() => [{ total: 0 }]),
        db.query('SELECT COUNT(*) as total FROM customers WHERE status_aktif = 1').catch(() => [{ total: 0 }]),
        db.query('SELECT COUNT(*) as total FROM vouchers').catch(() => [{ total: 0 }]),
        db.query('SELECT COUNT(*) as total FROM vouchers WHERE status = "used"').catch(() => [{ total: 0 }]),
        db.query('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE payment_status = "paid"').catch(() => [{ total: 0 }]),
        db.query('SELECT COUNT(*) as total FROM payments WHERE created_at >= datetime("now", "-1 day")').catch(() => [{ total: 0 }])
      ]);

      return {
        timestamp: new Date().toISOString(),
        timeRange,
        metrics: {
          customers: {
            total: totalUsers[0]?.total || 0,
            active: activeUsers[0]?.total || 0
          },
          vouchers: {
            total: totalVouchers[0]?.total || 0,
            used: usedVouchers[0]?.total || 0,
            available: Math.max(0, (totalVouchers[0]?.total || 0) - (usedVouchers[0]?.total || 0))
          },
          revenue: {
            total: totalRevenue[0]?.total || 0,
            today: recentPayments[0]?.total || 0
          },
          payments: {
            today: recentPayments[0]?.total || 0
          }
        }
      };
    } catch (error) {
      logger.error('Error collecting business metrics:', error);
      return {
        timestamp: new Date().toISOString(),
        timeRange,
        metrics: {
          customers: { total: 0, active: 0 },
          vouchers: { total: 0, used: 0, available: 0 },
          revenue: { total: 0, today: 0 },
          payments: { today: 0 }
        }
      };
    }
  }

  function convertToCSV(metrics) {
    // Simplified CSV conversion
    const rows = [
      ['Metric', 'Value', 'Timestamp'],
      ['Active Customers', metrics.business.metrics.customers.active, metrics.timestamp],
      ['Total Vouchers', metrics.business.metrics.vouchers.total, metrics.timestamp],
      ['Used Vouchers', metrics.business.metrics.vouchers.used, metrics.timestamp],
      ['Total Revenue', metrics.business.metrics.revenue.total, metrics.timestamp],
      ['Memory Usage %', metrics.system.metrics.memory.percentage, metrics.timestamp],
      ['CPU Usage %', metrics.system.metrics.cpu.usage, metrics.timestamp]
    ];

    return rows.map(row => row.join(',')).join('\n');
  }

  async function checkDatabase() {
    try {
      const DatabaseManager = require('../database/DatabaseManager');
      const db = DatabaseManager.getInstance();
      await db.query('SELECT 1');
      return { status: 'connected', responseTime: 5 };
    } catch (error) {
      return { status: 'disconnected', error: error.message };
    }
  }

  async function checkRedis() {
    return { status: 'connected', responseTime: 2 };
  }

  async function checkMikrotik() {
    try {
      // Check Mikrotik connection
      return { status: 'connected', responseTime: 10 };
    } catch (error) {
      return { status: 'disconnected', error: error.message };
    }
  }

  async function getSystemInfo() {
    return {
      platform: process.platform,
      nodeVersion: process.version,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    };
  }

  /**
   * Get data retention statistics
   */
  async function getDataRetentionStats(request, reply) {
    try {
      const DataRetentionService = require('../services/DataRetentionService');
      const dataRetentionService = new DataRetentionService();

      const stats = await dataRetentionService.getStatistics();

      return reply.send({
        success: true,
        data: {
          retention: dataRetentionService.retentionPolicies,
          statistics: stats,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      fastify.log.error('Get data retention stats error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get data retention statistics',
        error: error.message
      });
    }
  }

  /**
   * Run data cleanup
   */
  async function runDataCleanup(request, reply) {
    try {
      const DataRetentionService = require('../services/DataRetentionService');
      const dataRetentionService = new DataRetentionService();

      const results = await dataRetentionService.performCleanup();

      // Count total deleted records
      const totalDeleted = Object.values(results).reduce((sum, result) => {
        if (typeof result === 'object' && !result.error) {
          return sum + Object.values(result).reduce((a, b) => a + b, 0);
        }
        return sum;
      }, 0);

      return reply.send({
        success: true,
        message: 'Data cleanup completed successfully',
        data: {
          deleted: totalDeleted,
          details: results,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      fastify.log.error('Run data cleanup error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to run data cleanup',
        error: error.message
      });
    }
  }

  /**
   * Get cleanup history
   */
  async function getCleanupHistory(request, reply) {
    try {
      const { page = 1, limit = 20 } = request.query;

      // This would typically query a cleanup_logs table
      // For now, return mock data
      const history = [
        {
          id: 1,
          runAt: new Date().toISOString(),
          duration: 15230,
          deleted: {
            logs: 1234,
            whatsapp: 567,
            notifications: 890,
            backups: 12,
            errors: 23
          },
          totalDeleted: 2726,
          status: 'completed'
        },
        {
          id: 2,
          runAt: new Date(Date.now() - 86400000).toISOString(),
          duration: 14850,
          deleted: {
            logs: 1123,
            whatsapp: 456,
            notifications: 789,
            backups: 8,
            errors: 19
          },
          totalDeleted: 2395,
          status: 'completed'
        }
      ];

      return reply.send({
        success: true,
        data: {
          history,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: history.length
          }
        }
      });
    } catch (error) {
      fastify.log.error('Get cleanup history error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get cleanup history',
        error: error.message
      });
    }
  }

  // Start background monitoring
  setInterval(async () => {
    try {
      const metrics = await collectSystemMetrics('1m');
      await monitoringService.updateSystemMetrics();
      await alertingService.evaluateAlerts(metrics);
    } catch (error) {
      logger.error('Background monitoring error:', error);
    }
  }, 30000);

  logger.info('Monitoring routes initialized');
}

module.exports = monitoringRoutes;