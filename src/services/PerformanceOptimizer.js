/**
 * Performance Optimization Service
 * Implements various performance improvements for the Mikrotik Billing System
 */

class PerformanceOptimizer {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.connectionPool = new Map();
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      dbQueries: 0,
      apiCalls: 0,
      averageResponseTime: 0
    };
  }

  /**
   * Cache optimization with TTL
   */
  setCache(key, value, ttl = this.cacheTimeout) {
    const expiry = Date.now() + ttl;
    this.cache.set(key, { value, expiry });
  }

  getCache(key) {
    const item = this.cache.get(key);
    if (!item) {
      this.metrics.cacheMisses++;
      return null;
    }

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      this.metrics.cacheMisses++;
      return null;
    }

    this.metrics.cacheHits++;
    return item.value;
  }

  clearCache(pattern = null) {
    if (pattern) {
      const regex = new RegExp(pattern);
      for (const key of this.cache.keys()) {
        if (regex.test(key)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  /**
   * Database query optimization
   */
  async optimizedQuery(db, query, params = [], cacheKey = null, ttl = this.cacheTimeout) {
    this.metrics.dbQueries++;

    // Check cache first
    if (cacheKey) {
      const cached = this.getCache(cacheKey);
      if (cached) return cached;
    }

    try {
      const result = await db.query(query, params);

      // Cache the result
      if (cacheKey) {
        this.setCache(cacheKey, result, ttl);
      }

      return result;
    } catch (error) {
      console.error('Optimized query error:', error);
      throw error;
    }
  }

  /**
   * Batch operations for better performance
   */
  async batchOperation(operations, batchSize = 10) {
    const results = [];

    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);
      const batchPromises = batch.map(op =>
        typeof op === 'function' ? op() : op
      );

      try {
        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults);
      } catch (error) {
        console.error('Batch operation error:', error);
        results.push({ status: 'rejected', reason: error });
      }
    }

    return results;
  }

  /**
   * Rate limiting for API calls
   */
  createRateLimiter(maxRequests = 100, windowMs = 60000) {
    const requests = new Map();

    return (key = 'default') => {
      const now = Date.now();
      const windowStart = now - windowMs;

      if (!requests.has(key)) {
        requests.set(key, []);
      }

      const userRequests = requests.get(key);

      // Remove old requests outside the window
      const validRequests = userRequests.filter(time => time > windowStart);
      requests.set(key, validRequests);

      if (validRequests.length >= maxRequests) {
        return false;
      }

      validRequests.push(now);
      return true;
    };
  }

  /**
   * Connection pooling optimization
   */
  async getConnection(serviceType, config) {
    const poolKey = `${serviceType}_${JSON.stringify(config)}`;

    if (this.connectionPool.has(poolKey)) {
      const connection = this.connectionPool.get(poolKey);
      if (this.isConnectionValid(connection)) {
        return connection;
      } else {
        this.connectionPool.delete(poolKey);
      }
    }

    // Create new connection
    const connection = await this.createConnection(serviceType, config);
    this.connectionPool.set(poolKey, connection);

    return connection;
  }

  isConnectionValid(connection) {
    // Basic connection validation
    return connection && typeof connection === 'object' && !connection.destroyed;
  }

  async createConnection(serviceType, config) {
    // This would be implemented based on service type
    // For now, return a mock connection
    return {
      type: serviceType,
      config,
      created: Date.now(),
      destroyed: false
    };
  }

  /**
   * Memory optimization - cleanup expired cache
   */
  startCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, item] of this.cache.entries()) {
        if (now > item.expiry) {
          this.cache.delete(key);
        }
      }
    }, 60000); // Cleanup every minute
  }

  /**
   * Performance metrics
   */
  getMetrics() {
    const cacheTotal = this.metrics.cacheHits + this.metrics.cacheMisses;
    const cacheHitRate = cacheTotal > 0 ? (this.metrics.cacheHits / cacheTotal * 100).toFixed(2) : 0;

    return {
      ...this.metrics,
      cacheSize: this.cache.size,
      connectionPoolSize: this.connectionPool.size,
      cacheHitRate: `${cacheHitRate}%`,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };
  }

  /**
   * Optimize Mikrotik API calls
   */
  async optimizedMikrotikCall(mikrotik, command, params = {}, cacheKey = null, ttl = 30000) {
    this.metrics.apiCalls++;

    // Use cache for read operations
    if (cacheKey && ['GET'].includes(command)) {
      const cached = this.getCache(cacheKey);
      if (cached) return cached;
    }

    const startTime = Date.now();

    try {
      const result = await mikrotik.execute(command, params);

      // Cache read operations
      if (cacheKey && ['GET'].includes(command)) {
        this.setCache(cacheKey, result, ttl);
      }

      // Update average response time
      const responseTime = Date.now() - startTime;
      this.metrics.averageResponseTime =
        (this.metrics.averageResponseTime + responseTime) / 2;

      return result;
    } catch (error) {
      console.error(`Mikrotik API error (${command}):`, error);
      throw error;
    }
  }

  /**
   * Optimize database connections with connection pooling
   */
  async optimizedDBOperation(db, operation, ...args) {
    const startTime = Date.now();

    try {
      const result = await operation(db, ...args);

      // Log performance if operation is slow
      const duration = Date.now() - startTime;
      if (duration > 1000) {
        console.warn(`Slow DB operation detected: ${duration}ms`);
      }

      return result;
    } catch (error) {
      console.error('Optimized DB operation error:', error);
      throw error;
    }
  }

  /**
   * Compress responses for better network performance
   */
  compressResponse(data) {
    // This would integrate with Fastify's compression plugin
    // For now, just return the data
    return data;
  }

  /**
   * Lazy loading for modules
   */
  lazyLoad(modulePath) {
    let cachedModule = null;

    return async () => {
      if (cachedModule) return cachedModule;

      try {
        cachedModule = await import(modulePath);
        return cachedModule;
      } catch (error) {
        console.error(`Error lazy loading module ${modulePath}:`, error);
        throw error;
      }
    };
  }

  /**
   * Debounce function calls
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Throttle function calls
   */
  throttle(func, limit) {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * Queue management optimization
   */
  createOptimizedQueue(processor, options = {}) {
    const {
      concurrency = 5,
      maxSize = 1000,
      timeout = 30000,
      retryAttempts = 3
    } = options;

    const queue = [];
    let processing = 0;
    let failed = 0;

    const process = async (item) => {
      processing++;

      try {
        const result = await Promise.race([
          processor(item),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Processing timeout')), timeout)
          )
        ]);

        processing--;
        return { success: true, result };
      } catch (error) {
        processing--;
        failed++;

        if (item.retryCount < retryAttempts) {
          item.retryCount = (item.retryCount || 0) + 1;
          queue.push(item);
        }

        return { success: false, error: error.message };
      }
    };

    const add = (item) => {
      if (queue.length >= maxSize) {
        throw new Error('Queue is full');
      }

      queue.push(item);
      this.drainQueue();
    };

    const drainQueue = async () => {
      while (queue.length > 0 && processing < concurrency) {
        const item = queue.shift();
        process(item);
      }
    };

    return {
      add,
      getStats: () => ({
        queueLength: queue.length,
        processing,
        failed,
        maxSize
      })
    };
  }

  /**
   * Resource monitoring
   */
  monitorResources() {
    const usage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      memory: {
        rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100,
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100,
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100,
        external: Math.round(usage.external / 1024 / 1024 * 100) / 100,
        arrayBuffers: Math.round(usage.arrayBuffers / 1024 / 1024 * 100) / 100
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      uptime: process.uptime(),
      pid: process.pid
    };
  }
}

module.exports = PerformanceOptimizer;