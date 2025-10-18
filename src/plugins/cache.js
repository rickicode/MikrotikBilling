/**
 * Fastify Cache Plugin
 * Multi-layer caching plugin with comprehensive caching capabilities
 */

const fp = require('fastify-plugin');
const CacheManager = require('../cache/CacheManager');
const CacheWarmer = require('../cache/CacheWarmer');
const CacheInvalidation = require('../cache/CacheInvalidation');
const CacheMetrics = require('../cache/CacheMetrics');
const CacheMiddleware = require('../middleware/cache-middleware');
const { config: cacheConfig } = require('../config/cache-config');

async function cachePlugin(fastify, options) {
  // Merge options with default config
  const config = {
    ...cacheConfig,
    ...options
  };

  // Initialize cache manager
  const cacheManager = new CacheManager(config);
  
  // Initialize cache warmer
  const cacheWarmer = new CacheWarmer(cacheManager, config.warming);
  
  // Initialize cache invalidation
  const cacheInvalidation = new CacheInvalidation(cacheManager, config.invalidation);
  
  // Initialize cache metrics
  const cacheMetrics = new CacheMetrics(cacheManager, config.monitoring);
  
  // Initialize HTTP cache middleware
  const httpCacheMiddleware = new CacheMiddleware(cacheManager, config.http);

  // Register cache manager as Fastify decorator
  fastify.decorate('cache', cacheManager);
  
  // Register cache utilities as decorators
  fastify.decorate('cacheWarmer', cacheWarmer);
  fastify.decorate('cacheInvalidation', cacheInvalidation);
  fastify.decorate('cacheMetrics', cacheMetrics);
  fastify.decorate('httpCache', httpCacheMiddleware);

  // Add cache control decorator
  fastify.decorate('cacheControl', (ttl, cacheOptions = {}) => {
    return async (request, reply) => {
      const cacheKey = `http:${request.method}:${request.url}`;
      
      // Try to get from cache first
      const cached = await cacheManager.get(cacheKey);
      if (cached) {
        reply.headers(cached.headers);
        reply.code(cached.statusCode);
        reply.send(cached.body);
        return reply;
      }

      // Set cache control headers for response
      reply.header('Cache-Control', `max-age=${ttl}`);
      if (cacheOptions.sharedMaxAge) {
        reply.header('Cache-Control', `max-age=${ttl}, s-maxage=${cacheOptions.sharedMaxAge}`);
      }
      if (cacheOptions.private) {
        reply.header('Cache-Control', `max-age=${ttl}, private`);
      }
      if (cacheOptions.noTransform) {
        reply.header('Cache-Control', `max-age=${ttl}, no-transform`);
      }
    };
  });

  // Add cache aside decorator
  fastify.decorate('cacheAside', async (key, fetchFunction, options = {}) => {
    return await cacheManager.cacheAside(key, fetchFunction, options);
  });

  // Add write-through cache decorator
  fastify.decorate('writeThroughCache', async (key, value, updateFunction, options = {}) => {
    return await cacheManager.writeThrough(key, value, updateFunction, options);
  });

  // Add write-behind cache decorator
  fastify.decorate('writeBehindCache', async (key, value, updateFunction, options = {}) => {
    return await cacheManager.writeBehind(key, value, updateFunction, options);
  });

  // Add cache invalidation decorator
  fastify.decorate('invalidateCache', async (type, target, options = {}) => {
    return await cacheInvalidation.forceInvalidation(type, target, options);
  });

  // Add cache warming decorator
  fastify.decorate('warmCache', async (dataSets = null) => {
    if (dataSets) {
      // Add custom data sets
      dataSets.forEach(dataSet => cacheWarmer.addDataSet(dataSet));
    }
    return await cacheWarmer.forceWarming(['startup', 'predictive']);
  });

  // Add cache statistics decorator
  fastify.decorate('getCacheStats', () => {
    return {
      manager: cacheManager.getStats(),
      warmer: cacheWarmer.getStats(),
      invalidation: cacheInvalidation.getStats(),
      metrics: cacheMetrics.getStats(),
      http: httpCacheMiddleware.getStats()
    };
  });

  // Add cache health check decorator
  fastify.decorate('checkCacheHealth', async () => {
    return await cacheManager.healthCheck();
  });

  // Register HTTP cache middleware hook
  fastify.addHook('preHandler', async (request, reply) => {
    // Skip caching for certain routes
    if (shouldSkipCaching(request)) {
      return;
    }

    // Apply HTTP caching middleware
    await new Promise((resolve) => {
      const middleware = httpCacheMiddleware.middleware();
      middleware(request, reply, resolve);
    });
  });

  // Register cache invalidation hook for responses
  fastify.addHook('onSend', async (request, reply, payload) => {
    // Trigger cache invalidation based on response
    if (shouldInvalidateCache(request, reply)) {
      const event = getInvalidationEvent(request, reply);
      if (event) {
        await cacheInvalidation.triggerInvalidation(event, getInvalidationData(request, reply));
      }
    }

    return payload;
  });

  // Register cache cleanup hook on close
  fastify.addHook('onClose', async (instance) => {
    await cacheManager.close();
    await cacheWarmer.close();
    await cacheInvalidation.close();
    await cacheMetrics.close();
  });

  // Add cache management routes
  fastify.register(async function (fastify) {
    // Cache statistics endpoint
    fastify.get('/admin/cache/stats', {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Get comprehensive cache statistics',
        tags: ['admin', 'cache'],
        response: {
          200: {
            type: 'object',
            properties: {
              manager: { type: 'object' },
              warmer: { type: 'object' },
              invalidation: { type: 'object' },
              metrics: { type: 'object' },
              http: { type: 'object' }
            }
          }
        }
      }
    }, async (request, reply) => {
      const stats = fastify.getCacheStats();
      return reply.send(stats);
    });

    // Cache health check endpoint
    fastify.get('/admin/cache/health', {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Check cache system health',
        tags: ['admin', 'cache'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              layers: { type: 'object' },
              manager: { type: 'object' }
            }
          }
        }
      }
    }, async (request, reply) => {
      const health = await fastify.checkCacheHealth();
      return reply.send(health);
    });

    // Cache warming endpoint
    fastify.post('/admin/cache/warm', {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Warm cache with specified data sets',
        tags: ['admin', 'cache'],
        body: {
          type: 'object',
          properties: {
            dataSets: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  query: { type: 'string' },
                  keyPrefix: { type: 'string' },
                  ttl: { type: 'number' },
                  tags: { type: 'array', items: { type: 'string' } }
                }
              }
            },
            types: {
              type: 'array',
              items: { type: 'string' },
              default: ['startup', 'predictive']
            }
          }
        }
      }
    }, async (request, reply) => {
      const { dataSets, types } = request.body;
      const results = await fastify.warmCache(dataSets);
      return reply.send(results);
    });

    // Cache invalidation endpoint
    fastify.post('/admin/cache/invalidate', {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Invalidate cache entries',
        tags: ['admin', 'cache'],
        body: {
          type: 'object',
          properties: {
            type: { 
              type: 'string', 
              enum: ['tag', 'pattern', 'keys'],
              default: 'pattern'
            },
            target: { type: 'string' },
            options: { type: 'object' }
          },
          required: ['target']
        }
      }
    }, async (request, reply) => {
      const { type, target, options } = request.body;
      const invalidated = await fastify.invalidateCache(type, target, options);
      return reply.send({ type, target, invalidated });
    });

    // Cache configuration endpoint
    fastify.get('/admin/cache/config', {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Get cache configuration',
        tags: ['admin', 'cache']
      }
    }, async (request, reply) => {
      return reply.send({
        config: {
          layers: config.layers,
          strategies: config.strategies,
          warming: config.warming?.strategies,
          invalidation: config.invalidation?.strategies,
          monitoring: config.monitoring
        }
      });
    });

    // Clear all cache endpoint
    fastify.delete('/admin/cache', {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Clear all cache entries',
        tags: ['admin', 'cache']
      }
    }, async (request, reply) => {
      const results = await cacheManager.clear();
      return reply.send({ success: results, timestamp: new Date().toISOString() });
    });

    // Cache metrics export endpoint
    fastify.get('/admin/cache/metrics/:format?', {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Export cache metrics in various formats',
        tags: ['admin', 'cache'],
        params: {
          format: {
            type: 'string',
            enum: ['json', 'prometheus', 'csv', 'graphite'],
            default: 'json'
          }
        }
      }
    }, async (request, reply) => {
      const { format } = request.params;
      const metrics = cacheMetrics.exportMetrics(format, {
        prefix: 'mikrotik_billing_cache'
      });

      if (format === 'prometheus') {
        reply.type('text/plain');
      } else if (format === 'csv') {
        reply.type('text/csv');
      } else {
        reply.type('application/json');
      }

      return reply.send(metrics);
    });

    // Cache alerts endpoint
    fastify.get('/admin/cache/alerts', {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Get active cache alerts',
        tags: ['admin', 'cache'],
        querystring: {
          duration: {
            type: 'number',
            default: 3600000, // 1 hour
            description: 'Time window in milliseconds'
          }
        }
      }
    }, async (request, reply) => {
      const { duration } = request.query;
      const alerts = cacheMetrics.getActiveAlerts();
      const history = cacheMetrics.getAlertHistory(duration);
      
      return reply.send({
        active: alerts,
        history,
        timestamp: new Date().toISOString()
      });
    });
  }, { prefix: '/api/v1' });

  // Setup event listeners for cache events
  setupEventListeners(fastify, cacheManager, cacheWarmer, cacheInvalidation, cacheMetrics);
}

/**
 * Check if request should skip caching
 */
function shouldSkipCaching(request) {
  // Skip admin routes
  if (request.url.includes('/admin/')) {
    return true;
  }

  // Skip auth routes
  if (request.url.includes('/auth/')) {
    return true;
  }

  // Skip upload routes
  if (request.url.includes('/upload')) {
    return true;
  }

  // Skip streaming routes
  if (request.url.includes('/stream')) {
    return true;
  }

  // Skip POST, PUT, DELETE requests (except specific GET-like POST)
  if (!['GET', 'HEAD'].includes(request.method)) {
    return true;
  }

  // Skip requests with authorization headers
  if (request.headers.authorization || request.headers.cookie) {
    return true;
  }

  // Skip requests with no-cache headers
  const cacheControl = request.headers['cache-control'] || '';
  if (cacheControl.includes('no-store') || cacheControl.includes('no-cache')) {
    return true;
  }

  return false;
}

/**
 * Check if response should trigger cache invalidation
 */
function shouldInvalidateCache(request, reply) {
  // Invalidation only for modifying requests
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
    return false;
  }

  // Skip if response status indicates no changes
  if ([204, 304, 404, 500].includes(reply.statusCode)) {
    return false;
  }

  return true;
}

/**
 * Get invalidation event for request
 */
function getInvalidationEvent(request, reply) {
  const url = request.url;
  const method = request.method;

  // Customer-related events
  if (url.includes('/customers')) {
    if (method === 'POST') return 'customer:created';
    if (method === 'PUT') return 'customer:updated';
    if (method === 'DELETE') return 'customer:deleted';
  }

  // Subscription-related events
  if (url.includes('/subscriptions')) {
    if (method === 'POST') return 'subscription:created';
    if (method === 'PUT') return 'subscription:updated';
    if (method === 'DELETE') return 'subscription:deleted';
  }

  // Payment-related events
  if (url.includes('/payments')) {
    if (method === 'POST') return 'payment:completed';
    if (method === 'PUT') return 'payment:updated';
  }

  // Voucher-related events
  if (url.includes('/vouchers')) {
    if (method === 'POST') return 'voucher:created';
    if (method === 'PUT') return 'voucher:updated';
    if (method === 'DELETE') return 'voucher:deleted';
  }

  // PPPoE-related events
  if (url.includes('/pppoe')) {
    if (method === 'POST') return 'pppoe_user:created';
    if (method === 'PUT') return 'pppoe_user:updated';
    if (method === 'DELETE') return 'pppoe_user:deleted';
  }

  // Settings-related events
  if (url.includes('/settings')) {
    return 'settings:updated';
  }

  return null;
}

/**
 * Get invalidation data for request
 */
function getInvalidationData(request, reply) {
  const url = request.url;
  
  // Extract ID from URL if present
  const idMatch = url.match(/\/([0-9a-f-]{8,})/);
  const id = idMatch ? idMatch[1] : null;

  // Extract customer_id from URL if present
  const customerIdMatch = url.match(/\/customers\/([0-9]+)/);
  const customerId = customerIdMatch ? customerIdMatch[1] : null;

  return {
    id,
    customer_id: customerId,
    method: request.method,
    url: request.url,
    statusCode: reply.statusCode
  };
}

/**
 * Setup event listeners for cache system
 */
function setupEventListeners(fastify, cacheManager, cacheWarmer, cacheInvalidation, cacheMetrics) {
  // Listen to cache manager events
  cacheManager.on('hit', (key, layer, responseTime) => {
    fastify.log.debug({ key, layer, responseTime }, 'Cache hit');
  });

  cacheManager.on('miss', (key) => {
    fastify.log.debug({ key }, 'Cache miss');
  });

  cacheManager.on('error', (error, key) => {
    fastify.log.error({ error, key }, 'Cache error');
  });

  // Listen to cache warmer events
  cacheWarmer.on('warming:dataset', (dataSet, callback) => {
    // Handle data set warming requests
    // This would typically execute the query and return data
    fastify.log.debug({ dataSet }, 'Cache warming dataset request');
    callback([]); // Return empty array for now
  });

  cacheWarmer.on('warming:candidate', (key, candidate, callback) => {
    // Handle candidate warming requests
    fastify.log.debug({ key, candidate }, 'Cache warming candidate request');
    callback(false); // Return false for now
  });

  // Listen to cache invalidation events
  cacheInvalidation.on('alert', (alert) => {
    fastify.log.warn(alert, 'Cache alert triggered');
  });

  cacheInvalidation.on('invalidation:immediate', (event, data) => {
    fastify.log.info({ event, data }, 'Cache invalidation triggered');
  });

  // Listen to cache metrics events
  cacheMetrics.on('alert', (alert) => {
    fastify.log.warn(alert, 'Cache metrics alert');
  });

  cacheMetrics.on('metrics', (metrics) => {
    fastify.log.debug(metrics, 'Cache metrics collected');
  });

  cacheMetrics.on('health:check', (health) => {
    if (health.status !== 'healthy') {
      fastify.log.warn(health, 'Cache health check failed');
    }
  });
}

// Export as Fastify plugin
module.exports = fp(cachePlugin, {
  name: 'cache',
  fastify: '4.x',
  dependencies: ['authenticate']
});