/**
 * Fastify Monitoring Plugin
 * Integrates comprehensive monitoring capabilities with Fastify
 * @version 1.0.0
 * @author Mikrotik Billing System
 */

const fp = require('fastify-plugin');
const promClient = require('prom-client');

/**
 * Fastify monitoring plugin with Prometheus integration
 * @param {Object} fastify - Fastify instance
 * @param {Object} options - Plugin options
 */
async function monitoringPlugin(fastify, options) {
  const { MetricsCollector, PrometheusExporter, HealthChecker, PerformanceProfiler } = require('../monitoring');
  const MonitoringConfig = require('../config/monitoring-config');

  // Initialize monitoring components
  const metricsCollector = new MetricsCollector(MonitoringConfig.metrics);
  const prometheusExporter = new PrometheusExporter(MonitoringConfig.prometheus);
  const healthChecker = new HealthChecker(MonitoringConfig.health);
  const performanceProfiler = new PerformanceProfiler(MonitoringConfig.performance);

  // Create Prometheus registry
  const register = new promClient.Registry();
  promClient.collectDefaultMetrics({ register });

  // Define custom metrics
  const httpRequestDuration = new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code', 'user_id', 'location_id'],
    buckets: MonitoringConfig.prometheus.buckets.duration,
    registers: [register]
  });

  const httpRequestTotal = new promClient.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code', 'user_id', 'location_id'],
    registers: [register]
  });

  const httpRequestActive = new promClient.Gauge({
    name: 'http_requests_active',
    help: 'Number of active HTTP requests',
    labelNames: ['method', 'route'],
    registers: [register]
  });

  const httpResponseSize = new promClient.Histogram({
    name: 'http_response_size_bytes',
    help: 'Size of HTTP responses in bytes',
    labelNames: ['method', 'route', 'status_code'],
    buckets: MonitoringConfig.prometheus.buckets.size,
    registers: [register]
  });

  const businessMetrics = {
    customersTotal: new promClient.Gauge({
      name: 'business_customers_total',
      help: 'Total number of customers',
      labelNames: ['location_id', 'status'],
      registers: [register]
    }),

    vouchersTotal: new promClient.Gauge({
      name: 'business_vouchers_total',
      help: 'Total number of vouchers',
      labelNames: ['location_id', 'status', 'type'],
      registers: [register]
    }),

    revenue: new promClient.Counter({
      name: 'business_revenue_total',
      help: 'Total revenue in currency units',
      labelNames: ['location_id', 'payment_method', 'currency'],
      registers: [register]
    }),

    activeUsers: new promClient.Gauge({
      name: 'business_active_users',
      help: 'Number of active users',
      labelNames: ['location_id', 'user_type'],
      registers: [register]
    })
  };

  const databaseMetrics = {
    connectionsActive: new promClient.Gauge({
      name: 'database_connections_active',
      help: 'Number of active database connections',
      labelNames: ['pool', 'database'],
      registers: [register]
    }),

    queryDuration: new promClient.Histogram({
      name: 'database_query_duration_seconds',
      help: 'Duration of database queries in seconds',
      labelNames: ['operation', 'table', 'pool'],
      buckets: MonitoringConfig.prometheus.buckets.database,
      registers: [register]
    }),

    queryTotal: new promClient.Counter({
      name: 'database_queries_total',
      help: 'Total number of database queries',
      labelNames: ['operation', 'table', 'pool', 'status'],
      registers: [register]
    })
  };

  const cacheMetrics = {
    hitRate: new promClient.Gauge({
      name: 'cache_hit_rate',
      help: 'Cache hit rate percentage',
      labelNames: ['cache_type', 'cache_name'],
      registers: [register]
    }),

    operations: new promClient.Counter({
      name: 'cache_operations_total',
      help: 'Total number of cache operations',
      labelNames: ['cache_type', 'cache_name', 'operation', 'result'],
      registers: [register]
    }),

    size: new promClient.Gauge({
      name: 'cache_size_bytes',
      help: 'Cache size in bytes',
      labelNames: ['cache_type', 'cache_name'],
      registers: [register]
    })
  };

  const mikrotikMetrics = {
    connectionsActive: new promClient.Gauge({
      name: 'mikrotik_connections_active',
      help: 'Number of active Mikrotik connections',
      labelNames: ['location_id', 'connection_type'],
      registers: [register]
    }),

    apiDuration: new promClient.Histogram({
      name: 'mikrotik_api_duration_seconds',
      help: 'Duration of Mikrotik API calls in seconds',
      labelNames: ['location_id', 'operation', 'command'],
      buckets: MonitoringConfig.prometheus.buckets.mikrotik,
      registers: [register]
    }),

    apiErrors: new promClient.Counter({
      name: 'mikrotik_api_errors_total',
      help: 'Total number of Mikrotik API errors',
      labelNames: ['location_id', 'operation', 'error_type'],
      registers: [register]
    })
  };

  // Add request hook for HTTP metrics
  fastify.addHook('onRequest', async (request, reply) => {
    request.startTime = process.hrtime.bigint();
    request.activeRequests = (request.activeRequests || 0) + 1;

    httpRequestActive
      .labels(request.method, request.routeOptions?.config?.url || 'unknown')
      .inc();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - request.startTime) / 1e9; // Convert to seconds

    const route = request.routeOptions?.config?.url || request.raw.url || 'unknown';
    const userId = request.user?.id || 'anonymous';
    const locationId = request.user?.locationId || 'unknown';

    // Record HTTP metrics
    httpRequestDuration
      .labels(request.method, route, reply.statusCode.toString(), userId, locationId)
      .observe(duration);

    httpRequestTotal
      .labels(request.method, route, reply.statusCode.toString(), userId, locationId)
      .inc();

    httpResponseSize
      .labels(request.method, route, reply.statusCode.toString())
      .observe(reply.raw.outputLength || 0);

    httpRequestActive
      .labels(request.method, route)
      .dec();

    request.activeRequests--;
  });

  // Add error hook for error tracking
  fastify.addHook('onError', async (request, reply, error) => {
    const route = request.routeOptions?.config?.url || request.raw.url || 'unknown';

    fastify.metrics.errorCounter.inc({
      error_type: error.constructor.name,
      route: route,
      method: request.method
    });
  });

  // Metrics endpoint
  fastify.get('/metrics', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute'
      }
    },
    schema: {
      description: 'Prometheus metrics endpoint',
      tags: ['monitoring'],
      response: {
        200: {
          type: 'string',
          description: 'Prometheus metrics in text format'
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Update business metrics
      await updateBusinessMetrics();

      // Update database metrics
      await updateDatabaseMetrics();

      // Update cache metrics
      await updateCacheMetrics();

      // Update Mikrotik metrics
      await updateMikrotikMetrics();

      // Return metrics
      const metrics = await register.metrics();
      reply.type('text/plain; version=0.0.4; charset=utf-8');
      return metrics;
    } catch (error) {
      fastify.log.error('Error generating metrics:', error);
      reply.code(500);
      return { error: 'Failed to generate metrics' };
    }
  });

  // Health check endpoints
  fastify.get('/health', {
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute'
      }
    },
    schema: {
      description: 'Basic health check',
      tags: ['monitoring'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' }
          }
        }
      }
    }
  }, async (request, reply) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
  });

  fastify.get('/health/ready', {
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute'
      }
    },
    schema: {
      description: 'Readiness probe',
      tags: ['monitoring'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            checks: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const checks = await healthChecker.runReadinessChecks();
    const allHealthy = Object.values(checks).every(check => check.status === 'healthy');

    reply.code(allHealthy ? 200 : 503);
    return {
      status: allHealthy ? 'ready' : 'not_ready',
      checks
    };
  });

  fastify.get('/health/live', {
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute'
      }
    },
    schema: {
      description: 'Liveness probe',
      tags: ['monitoring'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            checks: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const checks = await healthChecker.runLivenessChecks();
    const allHealthy = Object.values(checks).every(check => check.status === 'healthy');

    reply.code(allHealthy ? 200 : 503);
    return {
      status: allHealthy ? 'alive' : 'not_alive',
      checks
    };
  });

  fastify.get('/health/detailed', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute'
      }
    },
    schema: {
      description: 'Detailed health check',
      tags: ['monitoring'],
      querystring: {
        check: {
          type: 'string',
          enum: ['database', 'cache', 'mikrotik', 'whatsapp', 'disk', 'memory'],
          description: 'Specific health check to run'
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' },
            version: { type: 'string' },
            checks: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const checks = await healthChecker.runDetailedChecks(request.query.check);

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      checks
    };
  });

  // Performance profiling endpoints
  fastify.get('/monitoring/profile', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    },
    schema: {
      description: 'Get performance profile',
      tags: ['monitoring'],
      querystring: {
        duration: {
          type: 'number',
          default: 30000,
          description: 'Profiling duration in milliseconds'
        },
        type: {
          type: 'string',
          enum: ['cpu', 'memory', 'heap', 'function'],
          default: 'cpu',
          description: 'Type of profiling'
        }
      }
    }
  }, async (request, reply) => {
    try {
      const profile = await performanceProfiler.startProfiling(
        request.query.type,
        request.query.duration
      );

      return {
        type: request.query.type,
        duration: request.query.duration,
        timestamp: new Date().toISOString(),
        profile
      };
    } catch (error) {
      fastify.log.error('Error generating profile:', error);
      reply.code(500);
      return { error: 'Failed to generate profile' };
    }
  });

  // Metrics collection utilities
  async function updateBusinessMetrics() {
    try {
      const businessMetricsData = await metricsCollector.collectBusinessMetrics();

      // Update customer metrics
      if (businessMetricsData.customers) {
        Object.entries(businessMetricsData.customers.byLocation).forEach(([locationId, count]) => {
          businessMetrics.customersTotal
            .labels(locationId, 'total')
            .set(count);
        });
      }

      // Update voucher metrics
      if (businessMetricsData.vouchers) {
        Object.entries(businessMetricsData.vouchers.byLocation).forEach(([locationId, vouchers]) => {
          Object.entries(vouchers).forEach(([status, count]) => {
            businessMetrics.vouchersTotal
              .labels(locationId, status, 'hotspot')
              .set(count);
          });
        });
      }

      // Update active users metrics
      if (businessMetricsData.activeUsers) {
        Object.entries(businessMetricsData.activeUsers.byLocation).forEach(([locationId, users]) => {
          Object.entries(users).forEach(([userType, count]) => {
            businessMetrics.activeUsers
              .labels(locationId, userType)
              .set(count);
          });
        });
      }
    } catch (error) {
      fastify.log.error('Error updating business metrics:', error);
    }
  }

  async function updateDatabaseMetrics() {
    try {
      const dbMetrics = await metricsCollector.collectDatabaseMetrics();

      if (dbMetrics.connections) {
        Object.entries(dbMetrics.connections).forEach(([pool, connections]) => {
          databaseMetrics.connectionsActive
            .labels(pool, connections.database || 'main')
            .set(connections.active || 0);
        });
      }

      if (dbMetrics.queryStats) {
        Object.entries(dbMetrics.queryStats.byOperation).forEach(([operation, stats]) => {
          databaseMetrics.queryDuration
            .labels(operation, stats.table || 'unknown', stats.pool || 'main')
            .observe(stats.avgDuration || 0);

          databaseMetrics.queryTotal
            .labels(operation, stats.table || 'unknown', stats.pool || 'main', 'success')
            .inc(stats.count || 0);
        });
      }
    } catch (error) {
      fastify.log.error('Error updating database metrics:', error);
    }
  }

  async function updateCacheMetrics() {
    try {
      const cacheMetricsData = await metricsCollector.collectCacheMetrics();

      Object.entries(cacheMetricsData).forEach(([cacheName, metrics]) => {
        cacheMetrics.hitRate
          .labels(metrics.type || 'memory', cacheName)
          .set(metrics.hitRate || 0);

        cacheMetrics.size
          .labels(metrics.type || 'memory', cacheName)
          .set(metrics.size || 0);

        // Record operations
        if (metrics.operations) {
          Object.entries(metrics.operations).forEach(([operation, count]) => {
            cacheMetrics.operations
              .labels(metrics.type || 'memory', cacheName, operation, 'success')
              .inc(count);
          });
        }
      });
    } catch (error) {
      fastify.log.error('Error updating cache metrics:', error);
    }
  }

  async function updateMikrotikMetrics() {
    try {
      const mikrotikMetricsData = await metricsCollector.collectMikrotikMetrics();

      Object.entries(mikrotikMetricsData.connections || {}).forEach(([locationId, connections]) => {
        Object.entries(connections).forEach(([connectionType, count]) => {
          mikrotikMetrics.connectionsActive
            .labels(locationId, connectionType)
            .set(count);
        });
      });

      if (mikrotikMetricsData.apiStats) {
        Object.entries(mikrotikMetricsData.apiStats.byOperation).forEach(([operation, stats]) => {
          mikrotikMetrics.apiDuration
            .labels(stats.locationId || 'default', operation, stats.command || 'unknown')
            .observe(stats.avgDuration || 0);

          if (stats.errors > 0) {
            mikrotikMetrics.apiErrors
              .labels(stats.locationId || 'default', operation, 'timeout')
              .inc(stats.errors);
          }
        });
      }
    } catch (error) {
      fastify.log.error('Error updating Mikrotik metrics:', error);
    }
  }

  // Expose monitoring utilities
  fastify.decorate('metrics', {
    register,
    httpRequestDuration,
    httpRequestTotal,
    httpRequestActive,
    httpResponseSize,
    businessMetrics,
    databaseMetrics,
    cacheMetrics,
    mikrotikMetrics,

    // Convenience methods
    incrementCounter: (name, labels = {}, value = 1) => {
      const metric = register.getSingleMetric(name);
      if (metric) metric.labels(labels).inc(value);
    },

    recordDuration: (name, labels = {}, duration) => {
      const metric = register.getSingleMetric(name);
      if (metric) metric.labels(labels).observe(duration);
    },

    setGauge: (name, labels = {}, value) => {
      const metric = register.getSingleMetric(name);
      if (metric) metric.labels(labels).set(value);
    }
  });

  // Expose monitoring components
  fastify.decorate('monitoring', {
    metricsCollector,
    prometheusExporter,
    healthChecker,
    performanceProfiler
  });
}

// Export with fastify-plugin
module.exports = fp(monitoringPlugin, {
  name: 'monitoring',
  fastify: '4.x',
  dependencies: ['services']
});