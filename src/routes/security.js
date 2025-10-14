const { db } = require('../database/DatabaseManager');

async function securityRoutes(fastify, options) {
  const AuthMiddleware = require('../middleware/auth');
  const auth = new AuthMiddleware(fastify);

  // Security dashboard - requires authentication
  fastify.get('/security', {
    preHandler: auth.verifyToken.bind(auth),
    schema: {
      description: 'Security dashboard',
      tags: ['security']
    }
  }, async (request, reply) => {
    try {
      // Get security metrics
      const securityMetrics = global.securityLogger ? {
        recentEvents: getRecentSecurityEvents(),
        blockedIPs: getBlockedIPs(),
        suspiciousActivity: getSuspiciousActivitySummary(),
        incidents: getRecentIncidents()
      } : {};

      // Get performance metrics
      const performanceMetrics = global.performanceMonitor ? {
        system: global.performanceMonitor.metrics.system,
        application: global.performanceMonitor.metrics.application,
        alerts: global.performanceMonitor.alerts.filter(a => !a.resolved)
      } : {};

      return reply.view('security/dashboard', {
        securityMetrics,
        performanceMetrics,
        currentUrl: request.url
      });
    } catch (error) {
      fastify.log.error('Error loading security dashboard:', error);
      throw error;
    }
  });

  // Security alerts API
  fastify.get('/api/security/alerts', {
    preHandler: auth.verifyTokenAPI.bind(auth),
    schema: {
      description: 'Get security alerts',
      tags: ['security']
    }
  }, async (request, reply) => {
    try {
      const alerts = global.securityLogger ? getRecentSecurityEvents() : [];
      return reply.send({ success: true, alerts });
    } catch (error) {
      fastify.log.error('Error getting security alerts:', error);
      throw error;
    }
  });

  // Performance metrics API
  fastify.get('/api/security/performance', {
    preHandler: auth.verifyTokenAPI.bind(auth),
    schema: {
      description: 'Get performance metrics',
      tags: ['security']
    }
  }, async (request, reply) => {
    try {
      const metrics = global.performanceMonitor ? global.performanceMonitor.getMetrics() : {};
      return reply.send({ success: true, metrics });
    } catch (error) {
      fastify.log.error('Error getting performance metrics:', error);
      throw error;
    }
  });

  // Security report generation
  fastify.get('/api/security/report', {
    preHandler: auth.verifyTokenAPI.bind(auth),
    schema: {
      description: 'Generate security report',
      querystring: {
        type: 'object',
        properties: {
          timeRange: { type: 'string', enum: ['1h', '24h', '7d'], default: '24h' },
          format: { type: 'string', enum: ['json', 'csv'], default: 'json' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { timeRange = '24h', format = 'json' } = request.query;

      const securityReport = global.securityLogger ?
        global.securityLogger.generateSecurityReport(timeRange) : {};

      const performanceReport = global.performanceMonitor ?
        global.performanceMonitor.generatePerformanceReport(timeRange) : {};

      const report = {
        generatedAt: new Date().toISOString(),
        timeRange,
        security: securityReport,
        performance: performanceReport
      };

      if (format === 'csv') {
        // Convert to CSV format
        const csv = convertReportToCSV(report);
        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', `attachment; filename="security-report-${Date.now()}.csv"`);
        return reply.send(csv);
      }

      return reply.send({ success: true, report });
    } catch (error) {
      fastify.log.error('Error generating security report:', error);
      throw error;
    }
  });

  // Alert management
  fastify.post('/api/security/alerts/:alertId/acknowledge', {
    preHandler: auth.verifyTokenAPI.bind(auth),
    schema: {
      description: 'Acknowledge security alert',
      params: {
        type: 'object',
        properties: {
          alertId: { type: 'string' }
        },
        required: ['alertId']
      }
    }
  }, async (request, reply) => {
    try {
      const { alertId } = request.params;

      if (global.securityLogger) {
        // This would need to be implemented in the security logger
        // For now, we'll log the action
        global.securityLogger.logSystemEvent('alert_acknowledged', {
          component: 'security_dashboard',
          action: 'acknowledge_alert',
          status: 'success',
          message: `Alert ${alertId} acknowledged`,
          metadata: { alertId, adminId: request.admin.id }
        });
      }

      return reply.send({ success: true, message: 'Alert acknowledged' });
    } catch (error) {
      fastify.log.error('Error acknowledging alert:', error);
      throw error;
    }
  });

  // System health check
  fastify.get('/api/security/health', {
    schema: {
      description: 'System health check',
      tags: ['security']
    }
  }, async (request, reply) => {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: process.uptime(),
        checks: {
          database: await checkDatabaseHealth(fastify),
          mikrotik: checkMikrotikHealth(fastify),
          system: checkSystemHealth(),
          security: checkSecurityHealth()
        }
      };

      // Determine overall health status
      const unhealthyChecks = Object.values(health.checks).filter(check => check.status !== 'healthy');
      if (unhealthyChecks.length > 0) {
        health.status = 'unhealthy';
        reply.code(503);
      }

      return reply.send(health);
    } catch (error) {
      fastify.log.error('Error performing health check:', error);
      return reply.code(500).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  });
}

// Helper functions
function getRecentSecurityEvents() {
  // This would read from security log files
  // For now, return mock data
  return [
    {
      timestamp: new Date().toISOString(),
      type: 'authentication',
      event: 'failed_login',
      severity: 'warning',
      details: 'Failed login attempt from 192.168.1.100'
    }
  ];
}

function getBlockedIPs() {
  // This would get blocked IPs from the DDoS protection system
  return [];
}

function getSuspiciousActivitySummary() {
  return {
    totalSuspiciousIPs: 0,
    highRiskActivities: 0,
    recentIncidents: 0
  };
}

function getRecentIncidents() {
  return [];
}

async function checkDatabaseHealth(fastify) {
  try {
    // Simple database health check
    await db.query(`SELECT 1 as test`);
    return { status: 'healthy', message: 'Database connection successful' };
  } catch (error) {
    return { status: 'unhealthy', message: error.message };
  }
}

function checkMikrotikHealth(fastify) {
  try {
    const mikrotik = fastify.mikrotik;
    if (mikrotik && mikrotik.isConnected()) {
      return { status: 'healthy', message: 'Mikrotik connection active' };
    } else {
      return { status: 'unhealthy', message: 'Mikrotik connection failed' };
    }
  } catch (error) {
    return { status: 'unhealthy', message: error.message };
  }
}

function checkSystemHealth() {
  const memUsage = process.memoryUsage();
  const memPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

  if (memPercent > 90) {
    return { status: 'unhealthy', message: `High memory usage: ${memPercent.toFixed(2)}%` };
  }

  return { status: 'healthy', message: `Memory usage: ${memPercent.toFixed(2)}%` };
}

function checkSecurityHealth() {
  // Check if security systems are running
  const securityLogger = global.securityLogger;
  const performanceMonitor = global.performanceMonitor;

  if (!securityLogger || !performanceMonitor) {
    return { status: 'unhealthy', message: 'Security monitoring systems not initialized' };
  }

  return { status: 'healthy', message: 'Security systems operational' };
}

function convertReportToCSV(report) {
  // Convert security report to CSV format
  const headers = ['Timestamp', 'Type', 'Severity', 'Message'];
  const rows = [];

  // Add security events
  if (report.security && report.security.summary) {
    rows.push([
      report.generatedAt,
      'Security Summary',
      'info',
      `Total Events: ${report.security.summary.totalEvents || 0}`
    ].join(','));
  }

  // Add performance metrics
  if (report.performance && report.performance.summary) {
    rows.push([
      report.generatedAt,
      'Performance Summary',
      'info',
      `Avg Response Time: ${report.performance.summary.averageResponseTime || 0}ms`
    ].join(','));
  }

  return [headers.join(','), ...rows].join('\n');
}

module.exports = securityRoutes;