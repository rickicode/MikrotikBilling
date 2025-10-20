/**
 * Performance Monitoring Routes
 * Provides endpoints to monitor system performance and optimization metrics
 */

const { db } = require('../database/DatabaseManager');

const performanceRoutes = async (fastify, options) => {
  // Get performance metrics
  fastify.get('/api/performance/metrics', {
    schema: {
      tags: ['Performance'],
      description: 'Get system performance metrics',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                cacheHitRate: { type: 'string' },
                cacheSize: { type: 'number' },
                dbQueries: { type: 'number' },
                apiCalls: { type: 'number' },
                averageResponseTime: { type: 'number' },
                memoryUsage: { type: 'object' },
                uptime: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const metrics = fastify.performanceOptimizer.getMetrics();
      const resources = fastify.performanceOptimizer.monitorResources();

      return reply.send({
        success: true,
        data: {
          ...metrics,
          resources,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      fastify.log.error('Error getting performance metrics:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get performance metrics'
      });
    }
  });

  // Clear cache
  fastify.post('/api/performance/clear-cache', {
    schema: {
      tags: ['Performance'],
      description: 'Clear system cache',
      body: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Cache pattern to clear (optional)' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { pattern } = request.body;
      fastify.performanceOptimizer.clearCache(pattern);

      return reply.send({
        success: true,
        message: pattern ? `Cache cleared for pattern: ${pattern}` : 'All cache cleared'
      });
    } catch (error) {
      fastify.log.error('Error clearing cache:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to clear cache'
      });
    }
  });

  // Optimize database
  fastify.post('/api/performance/optimize-db', {
    schema: {
      tags: ['Performance'],
      description: 'Optimize database performance'
    }
  }, async (request, reply) => {
    try {
      // Run VACUUM to optimize database
      await db.query('VACUUM');

      // Analyze tables for better query planning
      const tables = ['customers', 'vouchers', 'pppoe_users', 'profiles', 'payments'];
      for (const table of tables) {
        try {
          await db.query('ANALYZE ' + table);
        } catch (error) {
          fastify.log.warn(`Could not analyze table ${table}:`, error.message);
        }
      }

      return reply.send({
        success: true,
        message: 'Database optimization completed'
      });
    } catch (error) {
      fastify.log.error('Error optimizing database:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to optimize database'
      });
    }
  });

  // Refresh Mikrotik status endpoint
  fastify.post('/refresh-mikrotik-status', {
    schema: {
      tags: ['Performance'],
      description: 'Refresh Mikrotik connection status',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            details: {
              type: 'object',
              properties: {
                connected: { type: 'boolean' },
                status: { type: 'string' },
                responseTime: { type: 'string' },
                identity: { type: 'string' },
                error: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const startTime = Date.now();
      let mikrotikStatus = 'disconnected';
      let mikrotikDetails = {
        connected: false,
        status: 'disconnected',
        responseTime: '0ms',
        identity: '',
        error: null
      };

      try {
        // Test Mikrotik connection
        const mikrotikStart = Date.now();
        const result = await fastify.mikrotik.execute('/system/identity/print');
        const responseTime = Date.now() - mikrotikStart;

        if (result && result.length > 0) {
          mikrotikStatus = 'connected';
          mikrotikDetails = {
            connected: true,
            status: 'connected',
            responseTime: `${responseTime}ms`,
            identity: result[0]?.name || 'Unknown',
            error: null
          };
        }

        fastify.log.info('Mikrotik status refreshed successfully');
      } catch (error) {
        mikrotikStatus = 'error';
        mikrotikDetails = {
          connected: false,
          status: 'error',
          responseTime: '0ms',
          identity: '',
          error: error.message
        };
        fastify.log.error('Mikrotik status refresh failed:', error);
      }

      const totalTime = Date.now() - startTime;

      return reply.send({
        success: mikrotikStatus !== 'error',
        details: mikrotikDetails,
        timestamp: new Date().toISOString(),
        processingTime: `${totalTime}ms`
      });
    } catch (error) {
      fastify.log.error('Error in Mikrotik status refresh:', error);
      return reply.status(500).send({
        success: false,
        details: {
          connected: false,
          status: 'error',
          responseTime: '0ms',
          identity: '',
          error: 'Status refresh failed'
        }
      });
    }
  });

  // System health check
  fastify.get('/api/performance/health', {
    schema: {
      tags: ['Performance'],
      description: 'Comprehensive system health check',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                timestamp: { type: 'string' },
                uptime: { type: 'number' },
                memory: { type: 'object' },
                cpu: { type: 'object' },
                cache: { type: 'object' },
                database: { type: 'object' },
                whatsapp: { type: 'object' },
                mikrotik: { type: 'object' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const startTime = Date.now();

      // Get resource usage
      const resources = fastify.performanceOptimizer.monitorResources();

      // Get performance metrics
      const metrics = fastify.performanceOptimizer.getMetrics();

      // Check database connectivity
      let dbStatus = 'connected';
      let dbResponseTime = 0;
      try {
        const dbStart = Date.now();
        await db.query('SELECT 1');
        dbResponseTime = Date.now() - dbStart;
      } catch (error) {
        dbStatus = 'error';
        fastify.log.error('Database health check failed:', error);
      }

      // Check WhatsApp status
      let whatsappStatus = 'disconnected';
      try {
        const status = await fastify.whatsappService.getConnectionStatus();
        whatsappStatus = status.status;
      } catch (error) {
        whatsappStatus = 'error';
        fastify.log.error('WhatsApp health check failed:', error);
      }

      // Check Mikrotik connectivity
      let mikrotikStatus = 'disconnected';
      try {
        const mikrotikStart = Date.now();
        await fastify.mikrotik.execute('/interface/print', { '?name': 'ether1' });
        mikrotikStatus = 'connected';
        fastify.log.info('Mikrotik health check passed');
      } catch (error) {
        mikrotikStatus = 'error';
        fastify.log.error('Mikrotik health check failed:', error);
      }

      const responseTime = Date.now() - startTime;

      // Determine overall health status
      const checks = [dbStatus, whatsappStatus, mikrotikStatus];
      const overallStatus = checks.includes('error') ? 'unhealthy' :
                           checks.includes('disconnected') ? 'degraded' : 'healthy';

      return reply.send({
        success: true,
        data: {
          status: overallStatus,
          timestamp: new Date().toISOString(),
          responseTime: `${responseTime}ms`,
          uptime: resources.uptime,
          memory: resources.memory,
          cpu: resources.cpu,
          cache: {
            size: metrics.cacheSize,
            hitRate: metrics.cacheHitRate
          },
          database: {
            status: dbStatus,
            responseTime: `${dbResponseTime}ms`,
            queries: metrics.dbQueries
          },
          whatsapp: {
            status: whatsappStatus
          },
          mikrotik: {
            status: mikrotikStatus
          }
        }
      });
    } catch (error) {
      fastify.log.error('Error in health check:', error);
      return reply.status(500).send({
        success: false,
        error: 'Health check failed'
      });
    }
  });

  // Performance recommendations
  fastify.get('/api/performance/recommendations', {
    schema: {
      tags: ['Performance'],
      description: 'Get performance optimization recommendations'
    }
  }, async (request, reply) => {
    try {
      const metrics = fastify.performanceOptimizer.getMetrics();
      const resources = fastify.performanceOptimizer.monitorResources();
      const recommendations = [];

      // Memory usage recommendations
      const memoryUsagePercent = (resources.memory.heapUsed / resources.memory.heapTotal) * 100;
      if (memoryUsagePercent > 80) {
        recommendations.push({
          category: 'memory',
          priority: 'high',
          issue: 'High memory usage detected',
          suggestion: 'Consider implementing memory cleanup or increasing available memory'
        });
      }

      // Cache hit rate recommendations
      const cacheHitRateNum = parseFloat(metrics.cacheHitRate);
      if (cacheHitRateNum < 50) {
        recommendations.push({
          category: 'cache',
          priority: 'medium',
          issue: 'Low cache hit rate',
          suggestion: 'Consider increasing cache TTL or optimizing cache keys'
        });
      }

      // Response time recommendations
      if (metrics.averageResponseTime > 1000) {
        recommendations.push({
          category: 'response_time',
          priority: 'high',
          issue: 'Slow average response time',
          suggestion: 'Consider optimizing database queries or implementing connection pooling'
        });
      }

      // Database query recommendations
      if (metrics.dbQueries > 1000) {
        recommendations.push({
          category: 'database',
          priority: 'medium',
          issue: 'High number of database queries',
          suggestion: 'Consider implementing query optimization or better caching strategies'
        });
      }

      // Add positive feedback if everything looks good
      if (recommendations.length === 0) {
        recommendations.push({
          category: 'general',
          priority: 'info',
          issue: 'System performing well',
          suggestion: 'All performance metrics are within acceptable ranges'
        });
      }

      return reply.send({
        success: true,
        data: {
          recommendations,
          metrics: {
            cacheHitRate: metrics.cacheHitRate,
            averageResponseTime: metrics.averageResponseTime,
            dbQueries: metrics.dbQueries,
            memoryUsagePercent: `${memoryUsagePercent.toFixed(2)}%`
          }
        }
      });
    } catch (error) {
      fastify.log.error('Error getting recommendations:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get recommendations'
      });
    }
  });
};

module.exports = performanceRoutes;