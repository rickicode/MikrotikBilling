/**
 * HTTP-Level Caching Middleware
 * Provides HTTP caching capabilities including ETag, Last-Modified,
 * Cache-Control headers, and response caching
 */

class CacheMiddleware {
  constructor(cacheManager, config = {}) {
    this.cacheManager = cacheManager;
    this.config = {
      // HTTP caching settings
      enabled: config.enabled !== false,
      defaultTTL: config.defaultTTL || 300, // 5 minutes
      maxAge: config.maxAge || 3600, // 1 hour
      sharedMaxAge: config.sharedMaxAge || 86400, // 1 day
      
      // Cache key generation
      keyGenerator: config.keyGenerator || this.defaultKeyGenerator,
      
      // Cacheable response criteria
      cacheableMethods: config.cacheableMethods || ['GET'],
      cacheableStatusCodes: config.cacheableStatusCodes || [200, 301, 302, 404],
      maxResponseSize: config.maxResponseSize || 1024 * 1024, // 1MB
      
      // Skip caching patterns
      skipPatterns: config.skipPatterns || [
        /\/api\/v[0-9]+\/admin\//, // Admin endpoints
        /\/api\/v[0-9]+\/auth\//, // Auth endpoints
        /\/api\/v[0-9]+\/upload/, // Upload endpoints
        /\/api\/v[0-9]+\/stream/  // Streaming endpoints
      ],
      
      // Headers to vary by
      varyBy: config.varyBy || ['Accept', 'Accept-Encoding', 'Accept-Language'],
      
      // Compression
      compression: {
        enabled: config.compression?.enabled !== false,
        threshold: config.compression?.threshold || 1024
      },
      
      // Debug
      debug: config.debug || false,
      
      ...config
    };

    // Performance metrics
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheSkips: 0,
      cacheStores: 0,
      avgResponseTime: 0,
      cacheHitRate: 0,
      bytesSaved: 0
    };

    // Response time tracking
    this.responseTimes = [];
    this.maxResponseTimeHistory = 100;
  }

  /**
   * Express/Connect middleware
   */
  middleware() {
    return (req, res, next) => {
      // Skip caching if disabled
      if (!this.config.enabled) {
        return next();
      }

      // Start timing
      const startTime = Date.now();
      this.metrics.totalRequests++;

      // Check if request should be cached
      if (!this.shouldCacheRequest(req, res)) {
        this.metrics.cacheSkips++;
        return this.addCacheHeaders(res, { cache: 'no-store' }, () => next());
      }

      // Generate cache key
      const cacheKey = this.generateCacheKey(req);

      // Try to get from cache
      this.cacheManager.get(cacheKey)
        .then(cachedResponse => {
          if (cachedResponse) {
            // Cache hit
            this.handleCacheHit(req, res, cachedResponse, startTime);
          } else {
            // Cache miss - proceed to handler and store response
            this.handleCacheMiss(req, res, cacheKey, startTime, next);
          }
        })
        .catch(error => {
          this.debugLog('Cache retrieval error:', error);
          this.metrics.cacheSkips++;
          next();
        });
    };
  }

  /**
   * Fastify plugin interface
   */
  fastifyPlugin(fastify, options, done) {
    const middleware = this.middleware();
    
    fastify.addHook('preHandler', (request, reply, next) => {
      // Adapt Fastify request/response to Express-like interface for middleware
      const req = this.adaptFastifyRequest(request);
      const res = this.adaptFastifyReply(reply);
      
      middleware(req, res, next);
    });

    // Add cache control utility
    fastify.decorate('cacheControl', (ttl, options = {}) => {
      return (request, reply, next) => {
        this.addCacheHeaders(reply, { 
          'max-age': ttl,
          ...options 
        }, next);
      };
    });

    // Add cache invalidation utility
    fastify.decorate('invalidateCache', (pattern) => {
      return this.cacheManager.invalidateByPattern(pattern);
    });

    done();
  }

  /**
   * Check if request should be cached
   */
  shouldCacheRequest(req, res) {
    // Check method
    if (!this.config.cacheableMethods.includes(req.method)) {
      return false;
    }

    // Check skip patterns
    for (const pattern of this.config.skipPatterns) {
      if (pattern.test(req.url)) {
        return false;
      }
    }

    // Check for cache-control headers
    const cacheControl = req.headers['cache-control'] || '';
    if (cacheControl.includes('no-store') || cacheControl.includes('no-cache')) {
      return false;
    }

    // Check for authorization headers (skip caching authenticated requests)
    if (req.headers.authorization || req.headers.cookie) {
      return false;
    }

    return true;
  }

  /**
   * Handle cache hit
   */
  handleCacheHit(req, res, cachedResponse, startTime) {
    const responseTime = Date.now() - startTime;
    this.metrics.cacheHits++;
    this.trackResponseTime(responseTime);
    this.metrics.bytesSaved += cachedResponse.body ? cachedResponse.body.length : 0;

    // Set cached headers
    if (cachedResponse.headers) {
      for (const [key, value] of Object.entries(cachedResponse.headers)) {
        res.setHeader(key, value);
      }
    }

    // Add cache hit headers
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('X-Cache-Age', Math.floor((Date.now() - cachedResponse.timestamp) / 1000));

    // Send cached response
    if (cachedResponse.statusCode) {
      res.statusCode = cachedResponse.statusCode;
    }

    if (cachedResponse.body) {
      res.end(cachedResponse.body);
    } else {
      res.end();
    }

    this.debugLog('Cache hit', {
      url: req.url,
      responseTime,
      cachedAt: cachedResponse.timestamp
    });
  }

  /**
   * Handle cache miss
   */
  handleCacheMiss(req, res, cacheKey, startTime, next) {
    const originalEnd = res.end;
    const originalWrite = res.write;
    let responseData = Buffer.alloc(0);
    let statusCode = 200;
    let headers = {};

    // Capture response data
    res.write = function(chunk) {
      if (chunk) {
        responseData = Buffer.concat([responseData, Buffer.from(chunk)]);
      }
      return originalWrite.call(this, chunk);
    };

    res.end = function(chunk) {
      if (chunk) {
        responseData = Buffer.concat([responseData, Buffer.from(chunk)]);
      }

      // Store response for caching
      if (this.shouldCacheResponse(res.statusCode, responseData)) {
        this.storeResponse(cacheKey, {
          statusCode: res.statusCode,
          headers: res.getHeaders(),
          body: responseData,
          timestamp: Date.now()
        }, req);
      }

      const responseTime = Date.now() - startTime;
      this.metrics.cacheMisses++;
      this.trackResponseTime(responseTime);

      // Add cache miss headers
      res.setHeader('X-Cache', 'MISS');

      // Send original response
      return originalEnd.call(this, chunk);
    }.bind(this);

    // Capture headers
    const originalSetHeader = res.setHeader;
    res.setHeader = function(name, value) {
      headers[name] = value;
      return originalSetHeader.call(this, name, value);
    };

    next();
  }

  /**
   * Check if response should be cached
   */
  shouldCacheResponse(statusCode, responseData) {
    // Check status code
    if (!this.config.cacheableStatusCodes.includes(statusCode)) {
      return false;
    }

    // Check response size
    if (responseData.length > this.config.maxResponseSize) {
      return false;
    }

    return true;
  }

  /**
   * Store response in cache
   */
  async storeResponse(cacheKey, response, req) {
    try {
      const ttl = this.calculateTTL(req, response);
      
      await this.cacheManager.set(cacheKey, response, {
        ttl,
        tags: this.generateTags(req, response)
      });

      this.metrics.cacheStores++;
      
      this.debugLog('Response cached', {
        url: req.url,
        ttl,
        size: response.body ? response.body.length : 0
      });
    } catch (error) {
      this.debugLog('Error storing response in cache:', error);
    }
  }

  /**
   * Calculate TTL for response
   */
  calculateTTL(req, response) {
    // Check for explicit cache-control headers
    const cacheControl = response.headers['cache-control'] || '';
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
    
    if (maxAgeMatch) {
      return parseInt(maxAgeMatch[1]);
    }

    // Check for expires header
    const expires = response.headers['expires'];
    if (expires) {
      const expiresTime = new Date(expires).getTime();
      const now = Date.now();
      if (expiresTime > now) {
        return Math.floor((expiresTime - now) / 1000);
      }
    }

    // Use default TTL based on content type
    const contentType = response.headers['content-type'] || '';
    
    if (contentType.includes('application/json')) {
      return this.config.defaultTTL;
    } else if (contentType.includes('text/html')) {
      return this.config.defaultTTL * 2; // HTML cached longer
    } else if (contentType.includes('image/')) {
      return this.config.maxAge; // Images cached longest
    }

    return this.config.defaultTTL;
  }

  /**
   * Generate cache key for request
   */
  generateCacheKey(req) {
    return this.config.keyGenerator(req);
  }

  /**
   * Default cache key generator
   */
  defaultKeyGenerator(req) {
    const parts = [
      req.method.toLowerCase(),
      req.url,
      this.serializeHeaders(req.headers, this.config.varyBy)
    ];
    
    return parts.join(':');
  }

  /**
   * Serialize relevant headers for cache key
   */
  serializeHeaders(headers, varyBy) {
    const parts = [];
    
    for (const headerName of varyBy) {
      const value = headers[headerName.toLowerCase()];
      if (value) {
        parts.push(`${headerName}:${value}`);
      }
    }
    
    return parts.join('|');
  }

  /**
   * Generate tags for cached response
   */
  generateTags(req, response) {
    const tags = [];
    
    // Add URL-based tags
    const urlParts = req.url.split('/').filter(part => part);
    if (urlParts.length > 0) {
      tags.push(`path:${urlParts[0]}`);
    }
    
    // Add content-type based tags
    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      tags.push('json');
    } else if (contentType.includes('text/html')) {
      tags.push('html');
    } else if (contentType.includes('image/')) {
      tags.push('image');
    }
    
    // Add method tag
    tags.push(req.method.toLowerCase());
    
    return tags;
  }

  /**
   * Add cache control headers
   */
  addCacheHeaders(res, directives, callback) {
    const existing = res.getHeader('cache-control') || '';
    const directivesArray = existing ? existing.split(', ') : [];
    
    // Add new directives
    for (const [key, value] of Object.entries(directives)) {
      directivesArray.push(`${key}=${value}`);
    }
    
    res.setHeader('cache-control', directivesArray.join(', '));
    
    if (callback) {
      callback();
    }
  }

  /**
   * Adapt Fastify request to Express-like interface
   */
  adaptFastifyRequest(request) {
    return {
      method: request.method,
      url: request.url,
      headers: request.headers,
      query: request.query,
      params: request.params
    };
  }

  /**
   * Adapt Fastify reply to Express-like interface
   */
  adaptFastifyReply(reply) {
    const res = {
      statusCode: 200,
      headers: {},
      
      setHeader: function(name, value) {
        this.headers[name] = value;
        reply.header(name, value);
        return this;
      },
      
      getHeaders: function() {
        return { ...this.headers };
      },
      
      end: function(chunk) {
        if (this.statusCode !== 200) {
          reply.code(this.statusCode);
        }
        
        // Set all headers
        for (const [name, value] of Object.entries(this.headers)) {
          reply.header(name, value);
        }
        
        if (chunk) {
          reply.send(chunk);
        } else {
          reply.send();
        }
      }
    };

    // Capture status code changes
    const originalCode = reply.code;
    reply.code = function(statusCode) {
      res.statusCode = statusCode;
      return originalCode.call(this, statusCode);
    };

    return res;
  }

  /**
   * Track response time
   */
  trackResponseTime(responseTime) {
    this.responseTimes.push(responseTime);
    
    if (this.responseTimes.length > this.maxResponseTimeHistory) {
      this.responseTimes.shift();
    }
    
    this.metrics.avgResponseTime = this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
  }

  /**
   * Get middleware statistics
   */
  getStats() {
    this.metrics.cacheHitRate = this.metrics.totalRequests > 0 ? 
      (this.metrics.cacheHits / this.metrics.totalRequests) * 100 : 0;
    
    return {
      ...this.metrics,
      cacheEfficiency: this.calculateCacheEfficiency()
    };
  }

  /**
   * Calculate cache efficiency score
   */
  calculateCacheEfficiency() {
    if (this.metrics.totalRequests === 0) return 0;
    
    const hitRate = this.metrics.cacheHits / this.metrics.totalRequests;
    const avgResponseTime = this.metrics.avgResponseTime;
    
    // Efficiency score: hit rate weighted by response time (lower is better)
    const responseTimeScore = Math.max(0, 1 - (avgResponseTime / 1000));
    return hitRate * 0.7 + responseTimeScore * 0.3;
  }

  /**
   * Clear cache by pattern
   */
  async clearCache(pattern) {
    try {
      const invalidated = await this.cacheManager.invalidateByPattern(pattern);
      this.debugLog('Cache cleared', { pattern, invalidated });
      return invalidated;
    } catch (error) {
      this.debugLog('Error clearing cache:', error);
      return 0;
    }
  }

  /**
   * Warm cache with common requests
   */
  async warmCache(requests) {
    const results = {
      total: requests.length,
      successful: 0,
      failed: 0
    };

    for (const request of requests) {
      try {
        const cacheKey = this.generateCacheKey(request);
        // This would typically fetch the actual response
        // For now, we'll just log the warmup request
        this.debugLog('Cache warmup request', { url: request.url, cacheKey });
        results.successful++;
      } catch (error) {
        results.failed++;
        this.debugLog('Cache warmup failed:', error);
      }
    }

    return results;
  }

  /**
   * Debug logging
   */
  debugLog(message, data = null) {
    if (this.config.debug) {
      console.log(`[CacheMiddleware] ${message}`, data || '');
    }
  }
}

module.exports = CacheMiddleware;