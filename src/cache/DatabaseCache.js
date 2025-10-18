/**
 * Enhanced Database Cache (L3)
 * Query result caching with intelligent invalidation,
 * connection pooling, and performance optimization
 */

const crypto = require('crypto');
const EventEmitter = require('events');

class DatabaseCache extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      enabled: config.enabled !== false,
      defaultTTL: config.defaultTTL || 600, // 10 minutes
      maxResults: config.maxResults || 1000,
      maxSize: config.maxSize || 10000,
      maxQueryLength: config.maxQueryLength || 10000,
      
      // Query patterns to cache
      patterns: config.patterns || [
        'SELECT.*FROM.*customers.*WHERE.*id',
        'SELECT.*FROM.*subscriptions.*WHERE.*customer_id',
        'SELECT.*FROM.*payments.*WHERE.*created_at',
        'SELECT.*FROM.*vouchers.*WHERE.*status',
        'SELECT.*FROM.*pppoe_users.*WHERE.*active'
      ],
      
      // Invalidation settings
      invalidation: {
        strategy: config.invalidation?.strategy || 'tag-based',
        delay: config.invalidation?.delay || 5000, // 5 seconds
        batchSize: config.invalidation?.batchSize || 10
      },
      
      // Connection pooling
      connectionPool: {
        min: config.connectionPool?.min || 2,
        max: config.connectionPool?.max || 10,
        idleTimeoutMillis: config.connectionPool?.idleTimeoutMillis || 30000
      },
      
      // Performance
      compressionEnabled: config.compressionEnabled || false,
      compressionThreshold: config.compressionThreshold || 2048,
      
      // Monitoring
      debug: config.debug || false,
      metricsInterval: config.metricsInterval || 60000,
      
      ...config
    };

    // Initialize cache storage
    this.cache = new Map(); // queryHash -> { result, timestamp, ttl, tags, count }
    this.queryStats = new Map(); // queryHash -> { hits, misses, avgExecutionTime }
    this.tagMappings = new Map(); // tag -> Set(queryHash)
    this.invalidationQueue = [];
    
    // Performance metrics
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      invalidations: 0,
      compressions: 0,
      totalQueries: 0,
      avgCacheHitTime: 0,
      avgCacheMissTime: 0,
      cacheSize: 0,
      memoryUsage: 0,
      hitRate: 0
    };

    // Response time tracking
    this.cacheHitTimes = [];
    this.cacheMissTimes = [];
    this.maxTimeHistory = 100;

    // Setup cleanup interval
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.defaultTTL * 1000); // Clean up expired entries

    // Setup metrics collection
    if (this.config.metricsInterval > 0) {
      this.metricsTimer = setInterval(() => {
        this.collectMetrics();
      }, this.config.metricsInterval);
    }

    this.debugLog('Database cache initialized', {
      enabled: this.config.enabled,
      defaultTTL: this.config.defaultTTL,
      maxSize: this.config.maxSize,
      patterns: this.config.patterns.length
    });
  }

  /**
   * Generate hash for a query
   */
  generateQueryHash(sql, params = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    const paramString = params.length > 0 ? JSON.stringify(params) : '';
    const combined = normalized + '|' + paramString;
    return crypto.createHash('md5').update(combined).digest('hex');
  }

  /**
   * Check if a query should be cached
   */
  shouldCacheQuery(sql) {
    if (!this.config.enabled) {
      return false;
    }

    // Check query length
    if (sql.length > this.config.maxQueryLength) {
      return false;
    }

    // Check if it's a SELECT query
    if (!sql.trim().toUpperCase().startsWith('SELECT')) {
      return false;
    }

    // Check against patterns
    const normalized = sql.trim().toUpperCase();
    return this.config.patterns.some(pattern => {
      const regex = new RegExp(pattern, 'i');
      return regex.test(normalized);
    });
  }

  /**
   * Get cached query result
   */
  async get(sql, params = []) {
    const startTime = Date.now();
    
    try {
      const queryHash = this.generateQueryHash(sql, params);
      
      if (!this.shouldCacheQuery(sql)) {
        this.metrics.misses++;
        this.updateMetrics();
        return null;
      }

      const cached = this.cache.get(queryHash);
      
      if (!cached) {
        // Update miss stats
        this.updateQueryStats(queryHash, 'miss');
        this.metrics.misses++;
        this.updateMetrics();
        
        const responseTime = Date.now() - startTime;
        this.trackCacheMissTime(responseTime);
        
        this.emit('miss', queryHash, sql);
        this.debugLog(`Cache miss for query: ${sql.substring(0, 100)}...`);
        return null;
      }

      // Check if expired
      if (Date.now() > cached.timestamp + (cached.ttl * 1000)) {
        this.cache.delete(queryHash);
        this.updateQueryStats(queryHash, 'miss');
        this.metrics.misses++;
        this.updateMetrics();
        
        const responseTime = Date.now() - startTime;
        this.trackCacheMissTime(responseTime);
        
        this.emit('expire', queryHash, sql);
        return null;
      }

      // Decompress if needed
      let result = cached.result;
      if (cached.compressed) {
        result = await this.decompressResult(result);
      }

      // Update hit stats
      cached.count++;
      this.updateQueryStats(queryHash, 'hit');
      this.metrics.hits++;
      this.updateMetrics();
      
      const responseTime = Date.now() - startTime;
      this.trackCacheHitTime(responseTime);
      
      this.emit('hit', queryHash, sql, responseTime);
      this.debugLog(`Cache hit for query: ${sql.substring(0, 100)}..., response time: ${responseTime}ms`);
      
      return result;
    } catch (error) {
      this.metrics.misses++;
      this.updateMetrics();
      this.emit('error', error, sql);
      this.debugLog(`Error getting cached query result:`, error);
      return null;
    }
  }

  /**
   * Set query result in cache
   */
  async set(sql, params = [], result, options = {}) {
    try {
      const queryHash = this.generateQueryHash(sql, params);
      
      if (!this.shouldCacheQuery(sql)) {
        return false;
      }

      // Check result size
      const resultSize = JSON.stringify(result).length;
      if (resultSize > this.config.maxResults * 1000) { // Convert KB to bytes
        this.debugLog(`Query result too large for cache: ${resultSize} bytes`);
        return false;
      }

      const ttl = options.ttl || this.config.defaultTTL;
      const tags = options.tags || this.extractTagsFromQuery(sql);
      
      // Compress if needed
      let processedResult = result;
      let compressed = false;
      
      if (this.config.compressionEnabled && resultSize > this.config.compressionThreshold) {
        processedResult = await this.compressResult(result);
        compressed = true;
        this.metrics.compressions++;
      }

      // Check cache size limit
      if (this.cache.size >= this.config.maxSize) {
        this.evictLeastRecentlyUsed();
      }

      const cacheEntry = {
        result: processedResult,
        timestamp: Date.now(),
        ttl,
        tags: new Set(tags),
        count: 1,
        compressed,
        size: compressed ? processedResult.length : resultSize,
        executionTime: options.executionTime || 0
      };

      this.cache.set(queryHash, cacheEntry);
      this.updateTagMappings(queryHash, tags);
      
      this.metrics.sets++;
      this.updateMetrics();
      
      this.emit('set', queryHash, sql, ttl);
      this.debugLog(`Cached query result: ${sql.substring(0, 100)}..., TTL: ${ttl}s`);
      
      return true;
    } catch (error) {
      this.emit('error', error, sql);
      this.debugLog(`Error caching query result:`, error);
      return false;
    }
  }

  /**
   * Invalidate cached queries by tag
   */
  async invalidateByTag(tag) {
    try {
      const queryHashes = this.tagMappings.get(tag);
      if (!queryHashes || queryHashes.size === 0) {
        return 0;
      }

      const hashesToInvalidate = Array.from(queryHashes);
      const invalidatedCount = await this.invalidateQueries(hashesToInvalidate);
      
      this.emit('invalidate:tag', tag, invalidatedCount);
      this.debugLog(`Invalidated ${invalidatedCount} queries for tag: ${tag}`);
      
      return invalidatedCount;
    } catch (error) {
      this.emit('error', error);
      return 0;
    }
  }

  /**
   * Invalidate cached queries by pattern
   */
  async invalidateByPattern(pattern) {
    try {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
      const hashesToInvalidate = [];
      
      for (const [queryHash, entry] of this.cache.entries()) {
        // We would need to store the original SQL to match patterns
        // For now, invalidate by pattern will work on tags
        for (const tag of entry.tags) {
          if (regex.test(tag)) {
            hashesToInvalidate.push(queryHash);
            break;
          }
        }
      }
      
      const invalidatedCount = await this.invalidateQueries(hashesToInvalidate);
      
      this.emit('invalidate:pattern', pattern, invalidatedCount);
      this.debugLog(`Invalidated ${invalidatedCount} queries for pattern: ${pattern}`);
      
      return invalidatedCount;
    } catch (error) {
      this.emit('error', error);
      return 0;
    }
  }

  /**
   * Invalidate specific queries
   */
  async invalidateQueries(queryHashes) {
    let invalidatedCount = 0;
    
    for (const queryHash of queryHashes) {
      if (this.cache.has(queryHash)) {
        const entry = this.cache.get(queryHash);
        
        // Remove from tag mappings
        for (const tag of entry.tags) {
          const tagQueries = this.tagMappings.get(tag);
          if (tagQueries) {
            tagQueries.delete(queryHash);
            if (tagQueries.size === 0) {
              this.tagMappings.delete(tag);
            }
          }
        }
        
        // Remove from cache
        this.cache.delete(queryHash);
        invalidatedCount++;
      }
    }
    
    if (invalidatedCount > 0) {
      this.metrics.invalidations += invalidatedCount;
      this.updateMetrics();
    }
    
    return invalidatedCount;
  }

  /**
   * Extract cache tags from SQL query
   */
  extractTagsFromQuery(sql) {
    const tags = [];
    const normalized = sql.toLowerCase();
    
    // Table-based tags
    const tables = [
      'customers', 'subscriptions', 'payments', 'vouchers', 'pppoe_users',
      'pppoe_profiles', 'mikrotik_profiles', 'settings', 'notifications',
      'audit_logs', 'backup_logs', 'system_logs'
    ];
    
    for (const table of tables) {
      if (normalized.includes(table)) {
        tags.push(table);
      }
    }
    
    // Operation-based tags
    if (normalized.includes('where id =') || normalized.includes('where id=')) {
      tags.push('single_record');
    }
    
    if (normalized.includes('count(')) {
      tags.push('count_query');
    }
    
    if (normalized.includes('sum(') || normalized.includes('avg(') || normalized.includes('max(') || normalized.includes('min(')) {
      tags.push('aggregate_query');
    }
    
    if (normalized.includes('order by') && normalized.includes('limit')) {
      tags.push('paginated_query');
    }
    
    if (normalized.includes('created_at') || normalized.includes('updated_at')) {
      tags.push('time_based_query');
    }
    
    return tags.length > 0 ? tags : ['general'];
  }

  /**
   * Update tag mappings
   */
  updateTagMappings(queryHash, tags) {
    for (const tag of tags) {
      if (!this.tagMappings.has(tag)) {
        this.tagMappings.set(tag, new Set());
      }
      this.tagMappings.get(tag).add(queryHash);
    }
  }

  /**
   * Update query statistics
   */
  updateQueryStats(queryHash, type) {
    if (!this.queryStats.has(queryHash)) {
      this.queryStats.set(queryHash, {
        hits: 0,
        misses: 0,
        avgExecutionTime: 0,
        lastAccess: Date.now()
      });
    }
    
    const stats = this.queryStats.get(queryHash);
    stats[type === 'hit' ? 'hits' : 'misses']++;
    stats.lastAccess = Date.now();
  }

  /**
   * Evict least recently used cache entries
   */
  evictLeastRecentlyUsed() {
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    // Evict 10% of cache
    const evictCount = Math.ceil(this.config.maxSize * 0.1);
    const toEvict = entries.slice(0, evictCount);
    
    for (const [queryHash] of toEvict) {
      const entry = this.cache.get(queryHash);
      
      // Remove from tag mappings
      for (const tag of entry.tags) {
        const tagQueries = this.tagMappings.get(tag);
        if (tagQueries) {
          tagQueries.delete(queryHash);
          if (tagQueries.size === 0) {
            this.tagMappings.delete(tag);
          }
        }
      }
      
      this.cache.delete(queryHash);
    }
    
    this.debugLog(`Evicted ${toEvict.length} least recently used cache entries`);
  }

  /**
   * Compress query result
   */
  async compressResult(result) {
    const zlib = require('zlib');
    
    return new Promise((resolve, reject) => {
      const serialized = JSON.stringify(result);
      zlib.gzip(serialized, { level: 6 }, (err, compressed) => {
        if (err) reject(err);
        else resolve(compressed);
      });
    });
  }

  /**
   * Decompress query result
   */
  async decompressResult(compressedResult) {
    const zlib = require('zlib');
    
    return new Promise((resolve, reject) => {
      zlib.gunzip(compressedResult, (err, decompressed) => {
        if (err) reject(err);
        else resolve(JSON.parse(decompressed.toString()));
      });
    });
  }

  /**
   * Track cache hit response times
   */
  trackCacheHitTime(responseTime) {
    this.cacheHitTimes.push(responseTime);
    
    if (this.cacheHitTimes.length > this.maxTimeHistory) {
      this.cacheHitTimes.shift();
    }
    
    this.metrics.avgCacheHitTime = this.cacheHitTimes.reduce((sum, time) => sum + time, 0) / this.cacheHitTimes.length;
  }

  /**
   * Track cache miss response times
   */
  trackCacheMissTime(responseTime) {
    this.cacheMissTimes.push(responseTime);
    
    if (this.cacheMissTimes.length > this.maxTimeHistory) {
      this.cacheMissTimes.shift();
    }
    
    this.metrics.avgCacheMissTime = this.cacheMissTimes.reduce((sum, time) => sum + time, 0) / this.cacheMissTimes.length;
  }

  /**
   * Update performance metrics
   */
  updateMetrics() {
    this.metrics.totalQueries = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRate = this.metrics.totalQueries > 0 ? 
      (this.metrics.hits / this.metrics.totalQueries) * 100 : 0;
    this.metrics.cacheSize = this.cache.size;
    this.metrics.memoryUsage = this.calculateMemoryUsage();
  }

  /**
   * Calculate memory usage estimate
   */
  calculateMemoryUsage() {
    let totalSize = 0;
    
    for (const [queryHash, entry] of this.cache.entries()) {
      totalSize += queryHash.length * 2; // UTF-16
      totalSize += entry.size || 0;
      totalSize += JSON.stringify(entry.tags).length * 2;
      totalSize += 200; // Approximate metadata size
    }
    
    return totalSize;
  }

  /**
   * Cleanup expired entries
   */
  cleanup() {
    const now = Date.now();
    const expiredKeys = [];
    
    for (const [queryHash, entry] of this.cache.entries()) {
      if (now > entry.timestamp + (entry.ttl * 1000)) {
        expiredKeys.push(queryHash);
      }
    }
    
    if (expiredKeys.length > 0) {
      this.invalidateQueries(expiredKeys);
      this.debugLog(`Cleaned up ${expiredKeys.length} expired cache entries`);
    }
  }

  /**
   * Collect additional metrics
   */
  collectMetrics() {
    try {
      // Calculate average cache effectiveness
      let totalExecutionTime = 0;
      let totalCachedQueries = 0;
      
      for (const [queryHash, entry] of this.cache.entries()) {
        if (entry.executionTime > 0) {
          totalExecutionTime += entry.executionTime;
          totalCachedQueries++;
        }
      }
      
      const avgExecutionTime = totalCachedQueries > 0 ? totalExecutionTime / totalCachedQueries : 0;
      
      this.metrics.avgExecutionTime = avgExecutionTime;
      
      this.emit('metrics', this.metrics);
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const topQueries = Array.from(this.queryStats.entries())
      .sort((a, b) => (b[1].hits + b[1].misses) - (a[1].hits + a[1].misses))
      .slice(0, 10)
      .map(([hash, stats]) => ({
        hash: hash.substring(0, 8),
        hits: stats.hits,
        misses: stats.misses,
        hitRate: stats.hits / (stats.hits + stats.misses) * 100,
        lastAccess: stats.lastAccess
      }));
    
    const tagStats = Array.from(this.tagMappings.entries())
      .map(([tag, queries]) => ({
        tag,
        queryCount: queries.size
      }))
      .sort((a, b) => b.queryCount - a.queryCount);
    
    return {
      ...this.metrics,
      topQueries,
      tagStats,
      enabled: this.config.enabled,
      config: {
        defaultTTL: this.config.defaultTTL,
        maxSize: this.config.maxSize,
        patterns: this.config.patterns.length
      }
    };
  }

  /**
   * Clear all cached queries
   */
  async clear() {
    this.cache.clear();
    this.queryStats.clear();
    this.tagMappings.clear();
    
    // Reset metrics
    this.metrics.hits = 0;
    this.metrics.misses = 0;
    this.metrics.sets = 0;
    this.metrics.invalidations = 0;
    this.metrics.compressions = 0;
    this.updateMetrics();
    
    this.emit('clear');
    this.debugLog('Database cache cleared');
  }

  /**
   * Health check
   */
  async healthCheck() {
    const stats = this.getStats();
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metrics: stats
    };
    
    // Check health indicators
    if (stats.hitRate < 30) {
      health.status = 'degraded';
      health.warnings = [`Low hit rate: ${stats.hitRate.toFixed(2)}%`];
    }
    
    if (stats.memoryUsage > 100 * 1024 * 1024) { // 100MB
      health.status = 'degraded';
      health.warnings = health.warnings || [];
      health.warnings.push(`High memory usage: ${(stats.memoryUsage / 1024 / 1024).toFixed(2)}MB`];
    }
    
    if (stats.cacheSize > this.config.maxSize * 0.9) {
      health.status = 'degraded';
      health.warnings = health.warnings || [];
      health.warnings.push(`Cache nearly full: ${stats.cacheSize}/${this.config.maxSize}`);
    }
    
    return health;
  }

  /**
   * Debug logging
   */
  debugLog(message, data = null) {
    if (this.config.debug) {
      console.log(`[DatabaseCache] ${message}`, data || '');
    }
  }

  /**
   * Close and cleanup
   */
  async close() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }
    
    await this.clear();
    this.emit('close');
    this.debugLog('Database cache closed');
  }
}

module.exports = DatabaseCache;