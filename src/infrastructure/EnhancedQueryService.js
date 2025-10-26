const crypto = require('crypto');
const EventEmitter = require('events');

/**
 * Enhanced Query Service with Advanced Caching and Optimization
 * Provides comprehensive database query management with multi-level caching,
 * query optimization, connection pooling, and performance monitoring
 */
class EnhancedQueryService extends EventEmitter {
  constructor(database, cacheService, config = {}) {
    super();

    this.db = database;
    this.cache = cacheService;

    this.config = {
      // Cache settings
      enableQueryCache: config.enableQueryCache !== false,
      defaultCacheTTL: config.defaultCacheTTL || 300, // 5 minutes
      maxCacheSize: config.maxCacheSize || 1000,
      enableCacheInvalidation: config.enableCacheInvalidation !== false,

      // Query optimization
      enableQueryOptimization: config.enableQueryOptimization !== false,
      enableSlowQueryLogging: config.enableSlowQueryLogging !== false,
      slowQueryThreshold: config.slowQueryThreshold || 1000, // 1 second
      enableReadReplicas: config.enableReadReplicas !== false,

      // Monitoring
      enableMetrics: config.enableMetrics !== false,
      enableQueryTracing: config.enableQueryTracing !== false,

      // Performance
      maxConcurrentQueries: config.maxConcurrentQueries || 100,
      queryTimeout: config.queryTimeout || 30000, // 30 seconds

      ...config
    };

    // In-memory cache for frequently accessed data
    this.memoryCache = new Map();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      invalidations: 0,
      evictions: 0
    };

    // Query tracking
    this.activeQueries = new Map();
    this.queryHistory = [];
    this.slowQueries = [];

    // Performance metrics
    this.metrics = {
      totalQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      slowQueries: 0,
      avgQueryTime: 0,
      errorCount: 0
    };

    // Query optimization
    this.queryPlans = new Map();
    this.indexSuggestions = new Map();
    this.tableStats = new Map();

    this.setupEventHandlers();
    this.startCacheCleanup();
  }

  setupEventHandlers() {
    // Cache events
    if (this.cache) {
      this.cache.on('error', (error) => {
        this.emit('error', new Error(`Cache error: ${error.message}`));
      });
    }

    // Database events
    if (this.db) {
      this.db.on('error', (error) => {
        this.emit('error', new Error(`Database error: ${error.message}`));
      });

      this.db.on('query', (query) => {
        this.handleDatabaseQuery(query);
      });
    }
  }

  /**
   * Execute query with caching and optimization
   */
  async query(sql, params = [], options = {}) {
    const queryId = this.generateQueryId(sql, params);
    const startTime = Date.now();

    try {
      // Check concurrency limits
      if (this.activeQueries.size >= this.config.maxConcurrentQueries) {
        throw new Error('Maximum concurrent queries exceeded');
      }

      // Track active query
      this.activeQueries.set(queryId, {
        sql,
        params,
        startTime,
        options
      });

      // Try cache first if enabled
      if (this.config.enableQueryCache && options.cache !== false) {
        const cachedResult = await this.getFromCache(queryId, options.cacheKey);
        if (cachedResult !== null) {
          this.metrics.cacheHits++;
          this.cacheStats.hits++;
          this.activeQueries.delete(queryId);

          this.emit('query-cached', { sql, params, duration: Date.now() - startTime });
          return cachedResult;
        }
      }

      this.metrics.cacheMisses++;
      this.cacheStats.misses++;

      // Optimize query if enabled
      let optimizedSQL = sql;
      if (this.config.enableQueryOptimization) {
        optimizedSQL = this.optimizeQuery(sql, params);
      }

      // Choose appropriate database connection
      const connection = this.selectConnection(options);

      // Execute query with timeout
      const result = await this.executeWithTimeout(
        connection,
        optimizedSQL,
        params,
        options.timeout || this.config.queryTimeout
      );

      const duration = Date.now() - startTime;

      // Cache result if successful
      if (this.config.enableQueryCache && options.cache !== false) {
        await this.setCache(queryId, result, options.cacheTTL || this.config.defaultCacheTTL);
      }

      // Update metrics
      this.updateMetrics(sql, duration, true);

      // Check for slow query
      if (this.config.enableSlowQueryLogging && duration > this.config.slowQueryThreshold) {
        this.handleSlowQuery(sql, params, duration);
      }

      this.activeQueries.delete(queryId);
      this.emit('query-executed', { sql, params, duration, rowCount: result.rowCount });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.activeQueries.delete(queryId);
      this.metrics.errorCount++;

      this.emit('query-error', { sql, params, error, duration });
      throw error;
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction(queries, options = {}) {
    const transactionId = this.generateTransactionId();
    const startTime = Date.now();

    try {
      const connection = await this.db.getConnection();
      await connection.beginTransaction();

      const results = [];

      for (const queryConfig of queries) {
        const { sql, params, queryOptions = {} } = queryConfig;

        const result = await this.executeWithTimeout(
          connection,
          sql,
          params,
          queryOptions.timeout || this.config.queryTimeout
        );

        results.push(result);
      }

      await connection.commit();
      connection.release();

      const duration = Date.now() - startTime;
      this.emit('transaction-completed', { transactionId, duration, queryCount: queries.length });

      return results;

    } catch (error) {
      if (connection) {
        await connection.rollback();
        connection.release();
      }

      const duration = Date.now() - startTime;
      this.emit('transaction-error', { transactionId, error, duration });

      throw error;
    }
  }

  /**
   * Batch execute multiple queries
   */
  async batch(queries, options = {}) {
    const batchId = this.generateBatchId();
    const startTime = Date.now();

    try {
      const promises = queries.map(async (queryConfig, index) => {
        const { sql, params, queryOptions = {} } = queryConfig;

        return await this.query(sql, params, {
          ...queryOptions,
          batchId,
          batchIndex: index
        });
      });

      const results = await Promise.allSettled(promises);
      const duration = Date.now() - startTime;

      this.emit('batch-completed', { batchId, duration, queryCount: queries.length });

      return results;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.emit('batch-error', { batchId, error, duration });
      throw error;
    }
  }

  /**
   * Get cached result
   */
  async getFromCache(queryId, customKey = null) {
    const cacheKey = customKey || `query:${queryId}`;

    try {
      // Check memory cache first
      if (this.memoryCache.has(cacheKey)) {
        const entry = this.memoryCache.get(cacheKey);
        if (Date.now() - entry.timestamp < entry.ttl * 1000) {
          return entry.data;
        } else {
          this.memoryCache.delete(cacheKey);
          this.cacheStats.evictions++;
        }
      }

      // Check Redis cache
      if (this.cache) {
        const cached = await this.cache.get(cacheKey);
        if (cached !== null) {
          // Store in memory cache for faster access
          this.setMemoryCache(cacheKey, cached, this.config.defaultCacheTTL);
          return cached;
        }
      }

      return null;

    } catch (error) {
      console.warn('Cache retrieval error:', error.message);
      return null;
    }
  }

  /**
   * Set cache result
   */
  async setCache(queryId, data, ttl = null) {
    const cacheKey = `query:${queryId}`;
    const cacheTTL = ttl || this.config.defaultCacheTTL;

    try {
      // Set memory cache
      this.setMemoryCache(cacheKey, data, cacheTTL);

      // Set Redis cache
      if (this.cache) {
        await this.cache.set(cacheKey, data, cacheTTL);
      }

    } catch (error) {
      console.warn('Cache storage error:', error.message);
    }
  }

  /**
   * Set memory cache with LRU eviction
   */
  setMemoryCache(key, data, ttl) {
    // Check if cache is full
    if (this.memoryCache.size >= this.config.maxCacheSize) {
      // Evict oldest entry
      const oldestKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(oldestKey);
      this.cacheStats.evictions++;
    }

    this.memoryCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Invalidate cache entries
   */
  async invalidateCache(pattern = null, table = null) {
    try {
      if (table) {
        // Invalidate cache for specific table
        const tablePattern = `query:*${table}*`;
        await this.invalidateCacheByPattern(tablePattern);
      } else if (pattern) {
        // Invalidate cache by pattern
        await this.invalidateCacheByPattern(pattern);
      } else {
        // Clear all cache
        this.memoryCache.clear();

        if (this.cache) {
          // Clear Redis cache - this would need implementation based on Redis client
          console.log('Clearing all cache entries');
        }
      }

      this.cacheStats.invalidations++;
      this.emit('cache-invalidated', { pattern, table });

    } catch (error) {
      console.warn('Cache invalidation error:', error.message);
    }
  }

  /**
   * Optimize query
   */
  optimizeQuery(sql, params) {
    let optimizedSQL = sql;

    // Add query hints for better performance
    if (sql.toUpperCase().includes('SELECT')) {
      // Add appropriate indexes suggestions based on WHERE clauses
      if (sql.toUpperCase().includes('WHERE')) {
        this.analyzeQueryForIndexes(sql);
      }

      // Optimize JOIN order if multiple tables
      if (sql.toUpperCase().includes('JOIN')) {
        optimizedSQL = this.optimizeJoins(optimizedSQL);
      }
    }

    return optimizedSQL;
  }

  /**
   * Select appropriate database connection
   */
  selectConnection(options) {
    // Use read replica for read operations if available
    if (this.config.enableReadReplicas && options.readOnly) {
      return this.db.readReplica || this.db;
    }

    return this.db;
  }

  /**
   * Execute query with timeout
   */
  async executeWithTimeout(connection, sql, params, timeout) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Query timeout after ${timeout}ms`));
      }, timeout);

      try {
        const result = await connection.query(sql, params);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Update performance metrics
   */
  updateMetrics(sql, duration, success) {
    this.metrics.totalQueries++;

    if (success) {
      // Update average query time
      const totalTime = this.metrics.avgQueryTime * (this.metrics.totalQueries - 1) + duration;
      this.metrics.avgQueryTime = totalTime / this.metrics.totalQueries;

      // Store in query history
      this.queryHistory.push({
        sql: sql.substring(0, 100), // Truncate for storage
        duration,
        timestamp: Date.now(),
        success
      });

      // Keep only last 1000 queries
      if (this.queryHistory.length > 1000) {
        this.queryHistory = this.queryHistory.slice(-1000);
      }
    }
  }

  /**
   * Handle slow query detection
   */
  handleSlowQuery(sql, params, duration) {
    this.metrics.slowQueries++;

    const slowQuery = {
      sql: sql.substring(0, 200),
      params: JSON.stringify(params).substring(0, 100),
      duration,
      timestamp: Date.now(),
      suggestions: this.generateOptimizationSuggestions(sql)
    };

    this.slowQueries.push(slowQuery);

    // Keep only last 100 slow queries
    if (this.slowQueries.length > 100) {
      this.slowQueries = this.slowQueries.slice(-100);
    }

    this.emit('slow-query', slowQuery);
    console.warn(`🐌 Slow query detected (${duration}ms):`, sql.substring(0, 100));
  }

  /**
   * Generate optimization suggestions
   */
  generateOptimizationSuggestions(sql) {
    const suggestions = [];

    // Check for missing indexes
    if (sql.toUpperCase().includes('WHERE') && !sql.toUpperCase().includes('INDEX')) {
      suggestions.push('Consider adding indexes on WHERE clause columns');
    }

    // Check for full table scans
    if (sql.toUpperCase().includes('SELECT *')) {
      suggestions.push('Avoid SELECT *, specify only needed columns');
    }

    // Check for missing LIMIT clauses
    if (sql.toUpperCase().includes('SELECT') && !sql.toUpperCase().includes('LIMIT')) {
      suggestions.push('Consider adding LIMIT clause for large result sets');
    }

    return suggestions;
  }

  /**
   * Analyze query for index suggestions
   */
  analyzeQueryForIndexes(sql) {
    // Extract WHERE columns for index suggestions
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+(?:GROUP|ORDER|LIMIT)|$)/i);
    if (whereMatch) {
      const whereClause = whereMatch[1];
      const columns = this.extractColumnsFromClause(whereClause);

      columns.forEach(column => {
        if (!this.indexSuggestions.has(column)) {
          this.indexSuggestions.set(column, {
            column,
            queryCount: 1,
            suggested: true
          });
        } else {
          const suggestion = this.indexSuggestions.get(column);
          suggestion.queryCount++;
        }
      });
    }
  }

  /**
   * Extract column names from SQL clause
   */
  extractColumnsFromClause(clause) {
    const columns = [];
    const columnMatches = clause.match(/(\w+)\s*(?:=|>|<|LIKE|IN)/gi);

    if (columnMatches) {
      columnMatches.forEach(match => {
        const column = match.split(/\s*[=<>]/)[0].trim();
        if (!columns.includes(column)) {
          columns.push(column);
        }
      });
    }

    return columns;
  }

  /**
   * Optimize JOIN operations
   */
  optimizeJoins(sql) {
    // Basic JOIN optimization - in production, use query analyzer
    let optimizedSQL = sql;

    // Ensure JOIN conditions use indexed columns
    if (sql.toUpperCase().includes('JOIN')) {
      // Add STRAIGHT_JOIN hint for MySQL optimization
      optimizedSQL = optimizedSQL.replace(/SELECT\s+/i, 'SELECT /*+ STRAIGHT_JOIN */ ');
    }

    return optimizedSQL;
  }

  /**
   * Get comprehensive performance statistics
   */
  getPerformanceStats() {
    const cacheHitRate = this.metrics.totalQueries > 0
      ? (this.metrics.cacheHits / this.metrics.totalQueries * 100).toFixed(2)
      : 0;

    return {
      queries: {
        total: this.metrics.totalQueries,
        averageTime: Math.round(this.metrics.avgQueryTime),
        errorCount: this.metrics.errorCount,
        slowQueries: this.metrics.slowQueries,
        activeQueries: this.activeQueries.size
      },
      cache: {
        hitRate: `${cacheHitRate}%`,
        hits: this.metrics.cacheHits,
        misses: this.metrics.cacheMisses,
        memoryCacheSize: this.memoryCache.size,
        invalidations: this.cacheStats.invalidations,
        evictions: this.cacheStats.evictions
      },
      performance: {
        cacheHitRate: parseFloat(cacheHitRate),
        avgQueryTime: this.metrics.avgQueryTime,
        slowQueryRate: this.metrics.totalQueries > 0
          ? (this.metrics.slowQueries / this.metrics.totalQueries * 100).toFixed(2)
          : 0
      },
      suggestions: {
        indexes: Array.from(this.indexSuggestions.values()),
        slowQueries: this.slowQueries.slice(0, 10), // Last 10 slow queries
        optimizationTips: this.generateGlobalOptimizationTips()
      }
    };
  }

  /**
   * Generate global optimization tips
   */
  generateGlobalOptimizationTips() {
    const tips = [];

    if (this.metrics.slowQueries > 0) {
      tips.push('Consider optimizing slow queries with proper indexing');
    }

    if (parseFloat(this.getPerformanceStats().cache.hitRate) < 50) {
      tips.push('Cache hit rate is low, consider caching frequently accessed data');
    }

    if (this.metrics.avgQueryTime > 500) {
      tips.push('Average query time is high, review query optimization');
    }

    if (this.memoryCache.size > this.config.maxCacheSize * 0.8) {
      tips.push('Memory cache is near capacity, consider increasing cache size');
    }

    return tips;
  }

  /**
   * Get slow queries
   */
  getSlowQueries(limit = 50) {
    return this.slowQueries
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Get index suggestions
   */
  getIndexSuggestions() {
    return Array.from(this.indexSuggestions.values())
      .sort((a, b) => b.queryCount - a.queryCount);
  }

  /**
   * Handle database query events
   */
  handleDatabaseQuery(query) {
    // This would be implemented based on the database library's event system
    // For monitoring actual database queries
  }

  /**
   * Start periodic cache cleanup
   */
  startCacheCleanup() {
    setInterval(() => {
      this.cleanupExpiredCache();
    }, 60000); // Cleanup every minute
  }

  /**
   * Cleanup expired cache entries
   */
  cleanupExpiredCache() {
    const now = Date.now();
    const expiredKeys = [];

    for (const [key, entry] of this.memoryCache) {
      if (now - entry.timestamp > entry.ttl * 1000) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => {
      this.memoryCache.delete(key);
      this.cacheStats.evictions++;
    });
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidateCacheByPattern(pattern) {
    // Simple pattern matching for memory cache
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    const keysToDelete = [];

    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.memoryCache.delete(key));

    // Redis pattern matching would be implemented based on Redis client
    if (this.cache && this.cache.keys) {
      try {
        const redisKeys = await this.cache.keys(pattern);
        if (redisKeys.length > 0) {
          await this.cache.del(...redisKeys);
        }
      } catch (error) {
        console.warn('Redis pattern deletion error:', error.message);
      }
    }
  }

  // Utility methods
  generateQueryId(sql, params) {
    const queryHash = crypto.createHash('md5');
    queryHash.update(sql + JSON.stringify(params));
    return queryHash.digest('hex');
  }

  generateTransactionId() {
    return `txn_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  generateBatchId() {
    return `batch_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      // Test database connection
      await this.db.query('SELECT 1');

      // Test cache connection
      if (this.cache) {
        const testKey = 'health_check';
        await this.cache.set(testKey, 'ok', 10);
        await this.cache.del(testKey);
      }

      return {
        status: 'healthy',
        database: 'connected',
        cache: this.cache ? 'connected' : 'disabled',
        activeQueries: this.activeQueries.size,
        memoryCacheSize: this.memoryCache.size
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

module.exports = EnhancedQueryService;