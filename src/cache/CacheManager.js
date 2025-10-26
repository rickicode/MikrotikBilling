/**
 * Central Cache Manager
 * Orchestrates multi-layer caching system with L1 Memory → L2 Redis → L3 Database
 * Provides unified interface and intelligent cache coordination
 */

const EventEmitter = require('events');
const MemoryCache = require('./MemoryCache');
const RedisCache = require('./RedisCache');
const DatabaseCache = require('./DatabaseCache');

class CacheManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Cache layer priorities
      layers: {
        memory: { enabled: true, priority: 1 },
        redis: { enabled: true, priority: 2 },
        database: { enabled: true, priority: 3 }
      },
      
      // Default TTL settings per layer
      defaultTTL: {
        memory: config.memory?.defaultTTL || 300000, // 5 minutes
        redis: config.redis?.defaultTTL || 1800, // 30 minutes
        database: config.database?.defaultTTL || 600 // 10 minutes
      },
      
      // Cache strategies
      strategy: config.strategy || 'cache-aside', // cache-aside, write-through, write-behind
      
      // Performance settings
      refreshAhead: {
        enabled: config.refreshAhead?.enabled || false,
        threshold: config.refreshAhead?.threshold || 0.8, // Refresh when 80% of TTL passed
        concurrency: config.refreshAhead?.concurrency || 3
      },
      
      // Monitoring
      debug: config.debug || false,
      metricsInterval: config.metricsInterval || 60000,
      
      ...config
    };

    // Initialize cache layers
    this.layers = new Map();
    this.initializeLayers();
    
    // Performance metrics
    this.metrics = {
      totalOperations: 0,
      totalHits: 0,
      totalMisses: 0,
      totalErrors: 0,
      layerHits: {
        memory: 0,
        redis: 0,
        database: 0
      },
      layerMisses: {
        memory: 0,
        redis: 0,
        database: 0
      },
      avgResponseTime: 0,
      hitRate: 0,
      refreshAheadHits: 0,
      backgroundRefreshes: 0
    };

    // Response time tracking
    this.responseTimes = [];
    this.maxResponseTimeHistory = 100;
    
    // Background operations
    this.backgroundOperations = new Map();
    this.refreshQueue = [];
    
    // Setup metrics collection
    if (this.config.metricsInterval > 0) {
      this.metricsTimer = setInterval(() => {
        this.collectMetrics();
      }, this.config.metricsInterval);
    }

    // Setup event listeners
    this.setupEventListeners();

    this.debugLog('Cache manager initialized', {
      strategy: this.config.strategy,
      layers: Array.from(this.layers.keys()),
      refreshAhead: this.config.refreshAhead.enabled
    });
  }

  /**
   * Initialize cache layers
   */
  initializeLayers() {
    // Initialize L1 Memory Cache
    if (this.config.layers.memory.enabled) {
      const memoryConfig = {
        ...this.config.memory,
        debug: this.config.debug,
        compressionEnabled: this.config.compression?.enabled || false,
        encryptionEnabled: this.config.encryption?.enabled || false
      };
      
      this.layers.set('memory', new MemoryCache(memoryConfig));
    }

    // Initialize L2 Redis Cache
    if (this.config.layers.redis.enabled) {
      const redisConfig = {
        ...this.config.redis,
        debug: this.config.debug,
        compressionEnabled: this.config.compression?.enabled || false,
        encryptionEnabled: this.config.encryption?.enabled || false
      };
      
      this.layers.set('redis', new RedisCache(redisConfig));
    }

    // Initialize L3 Database Cache
    if (this.config.layers.database.enabled) {
      const dbConfig = {
        ...this.config.database,
        debug: this.config.debug,
        compressionEnabled: this.config.compression?.enabled || false
      };
      
      this.layers.set('database', new DatabaseCache(dbConfig));
    }
  }

  /**
   * Setup event listeners for cache layers
   */
  setupEventListeners() {
    // Memory cache events
    const memoryCache = this.layers.get('memory');
    if (memoryCache) {
      memoryCache.on('hit', (key, responseTime) => {
        this.metrics.layerHits.memory++;
        this.emit('layer:hit', 'memory', key, responseTime);
      });

      memoryCache.on('miss', (key) => {
        this.metrics.layerMisses.memory++;
        this.emit('layer:miss', 'memory', key);
      });

      memoryCache.on('prefetch', (key) => {
        this.handlePrefetchRequest(key, 'memory');
      });
    }

    // Redis cache events
    const redisCache = this.layers.get('redis');
    if (redisCache) {
      redisCache.on('hit', (key, responseTime) => {
        this.metrics.layerHits.redis++;
        this.emit('layer:hit', 'redis', key, responseTime);
      });

      redisCache.on('miss', (key) => {
        this.metrics.layerMisses.redis++;
        this.emit('layer:miss', 'redis', key);
      });

      redisCache.on('client:error', (client, error) => {
        this.emit('layer:error', 'redis', error);
        this.metrics.totalErrors++;
      });
    }

    // Database cache events
    const dbCache = this.layers.get('database');
    if (dbCache) {
      dbCache.on('hit', (queryHash, sql, responseTime) => {
        this.metrics.layerHits.database++;
        this.emit('layer:hit', 'database', queryHash, responseTime);
      });

      dbCache.on('miss', (queryHash, sql) => {
        this.metrics.layerMisses.database++;
        this.emit('layer:miss', 'database', queryHash);
      });
    }
  }

  /**
   * Get value from cache (multi-layer)
   */
  async get(key, options = {}) {
    const startTime = Date.now();
    
    try {
      this.metrics.totalOperations++;
      
      const layers = this.getEnabledLayers();
      let value = null;
      let hitLayer = null;
      let responseTime = 0;

      // Try each cache layer in priority order
      for (const layerName of layers) {
        const layer = this.layers.get(layerName);
        if (!layer) continue;

        try {
          const layerStartTime = Date.now();
          value = await this.getFromLayer(layer, layerName, key, options);
          responseTime = Date.now() - layerStartTime;
          
          if (value !== null) {
            hitLayer = layerName;
            this.metrics.totalHits++;
            
            // Populate lower layers if hit in higher layer
            await this.populateLowerLayers(layerName, key, value, options);
            
            // Check for refresh ahead
            if (this.config.refreshAhead.enabled) {
              this.checkRefreshAhead(layerName, key, value, options);
            }
            
            break;
          }
        } catch (error) {
          this.debugLog(`Error accessing ${layerName} cache:`, error);
          this.emit('layer:error', layerName, error);
          continue;
        }
      }

      if (value === null) {
        this.metrics.totalMisses++;
        this.emit('miss', key);
      } else {
        this.emit('hit', key, hitLayer, responseTime);
      }

      const totalResponseTime = Date.now() - startTime;
      this.trackResponseTime(totalResponseTime);
      this.updateMetrics();
      
      this.debugLog(`Cache ${value !== null ? 'hit' : 'miss'} for key: ${key}, layer: ${hitLayer || 'none'}`);
      
      return value;
    } catch (error) {
      this.metrics.totalErrors++;
      this.updateMetrics();
      this.emit('error', error, key);
      this.debugLog(`Error getting cache value for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache (multi-layer)
   */
  async set(key, value, options = {}) {
    try {
      this.metrics.totalOperations++;
      
      const layers = this.getEnabledLayers();
      const results = [];
      
      // Set in all enabled layers
      for (const layerName of layers) {
        const layer = this.layers.get(layerName);
        if (!layer) continue;

        try {
          const layerOptions = {
            ...options,
            ttl: options.ttl || this.config.defaultTTL[layerName]
          };
          
          const result = await this.setInLayer(layer, layerName, key, value, layerOptions);
          results.push({ layer: layerName, result });
        } catch (error) {
          this.debugLog(`Error setting in ${layerName} cache:`, error);
          this.emit('layer:error', layerName, error);
          results.push({ layer: layerName, result: false, error });
        }
      }

      const successCount = results.filter(r => r.result).length;
      this.emit('set', key, successCount, results);
      
      this.debugLog(`Cache set for key: ${key}, success in ${successCount}/${layers.length} layers`);
      
      return successCount > 0;
    } catch (error) {
      this.metrics.totalErrors++;
      this.emit('error', error, key);
      this.debugLog(`Error setting cache value for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete key from cache (multi-layer)
   */
  async delete(key) {
    try {
      const layers = this.getEnabledLayers();
      const results = [];
      
      for (const layerName of layers) {
        const layer = this.layers.get(layerName);
        if (!layer) continue;

        try {
          const result = await this.deleteFromLayer(layer, layerName, key);
          results.push({ layer: layerName, result });
        } catch (error) {
          this.debugLog(`Error deleting from ${layerName} cache:`, error);
          this.emit('layer:error', layerName, error);
          results.push({ layer: layerName, result: false, error });
        }
      }

      const successCount = results.filter(r => r.result).length;
      this.emit('delete', key, successCount, results);
      
      this.debugLog(`Cache delete for key: ${key}, success in ${successCount}/${layers.length} layers`);
      
      return successCount > 0;
    } catch (error) {
      this.emit('error', error, key);
      this.debugLog(`Error deleting cache value for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Cache-aside pattern implementation
   */
  async cacheAside(key, fetchFunction, options = {}) {
    try {
      // Try to get from cache first
      let value = await this.get(key, options);
      
      if (value !== null) {
        return value;
      }

      // Cache miss, fetch from source
      value = await fetchFunction();
      
      // Cache the result
      if (value !== null && value !== undefined) {
        await this.set(key, value, options);
      }

      return value;
    } catch (error) {
      this.debugLog('Cache-aside pattern error:', error);
      throw error;
    }
  }

  /**
   * Write-through cache pattern
   */
  async writeThrough(key, value, updateFunction, options = {}) {
    try {
      // Update primary storage first
      if (updateFunction) {
        await updateFunction(value);
      }

      // Then update all cache layers
      await this.set(key, value, options);
      
      return true;
    } catch (error) {
      this.debugLog('Write-through cache error:', error);
      throw error;
    }
  }

  /**
   * Write-behind cache pattern
   */
  async writeBehind(key, value, updateFunction, options = {}) {
    try {
      // Update cache immediately
      await this.set(key, value, options);
      
      // Queue for async update
      setTimeout(async () => {
        try {
          if (updateFunction) {
            await updateFunction(value);
          }
        } catch (error) {
          this.debugLog('Write-behind async update error:', error);
          this.emit('write-behind:error', key, error);
        }
      }, 0);

      return true;
    } catch (error) {
      this.debugLog('Write-behind cache error:', error);
      throw error;
    }
  }

  /**
   * Invalidate by tag across all layers
   */
  async invalidateByTag(tag) {
    try {
      const results = [];
      
      for (const [layerName, layer] of this.layers.entries()) {
        if (typeof layer.invalidateByTag === 'function') {
          try {
            const result = await layer.invalidateByTag(tag);
            results.push({ layer: layerName, result });
          } catch (error) {
            results.push({ layer: layerName, result: 0, error });
          }
        }
      }

      const totalInvalidated = results.reduce((sum, r) => sum + (r.result || 0), 0);
      this.emit('invalidate:tag', tag, totalInvalidated, results);
      
      return totalInvalidated;
    } catch (error) {
      this.emit('error', error);
      return 0;
    }
  }

  /**
   * Invalidate by pattern across all layers
   */
  async invalidateByPattern(pattern) {
    try {
      const results = [];
      
      for (const [layerName, layer] of this.layers.entries()) {
        if (typeof layer.invalidateByPattern === 'function') {
          try {
            const result = await layer.invalidateByPattern(pattern);
            results.push({ layer: layerName, result });
          } catch (error) {
            results.push({ layer: layerName, result: 0, error });
          }
        }
      }

      const totalInvalidated = results.reduce((sum, r) => sum + (r.result || 0), 0);
      this.emit('invalidate:pattern', pattern, totalInvalidated, results);
      
      return totalInvalidated;
    } catch (error) {
      this.emit('error', error);
      return 0;
    }
  }

  /**
   * Get enabled cache layers in priority order
   */
  getEnabledLayers() {
    return Object.entries(this.config.layers)
      .filter(([_, config]) => config.enabled)
      .sort(([_, a], [__, b]) => a.priority - b.priority)
      .map(([name, _]) => name);
  }

  /**
   * Get value from specific layer
   */
  async getFromLayer(layer, layerName, key, options) {
    if (layerName === 'database') {
      // Database cache uses SQL queries, not simple keys
      return null;
    }
    
    return await layer.get(key);
  }

  /**
   * Set value in specific layer
   */
  async setInLayer(layer, layerName, key, value, options) {
    if (layerName === 'database') {
      // Database cache uses SQL queries
      return true;
    }
    
    return await layer.set(key, value, options);
  }

  /**
   * Delete from specific layer
   */
  async deleteFromLayer(layer, layerName, key) {
    if (layerName === 'database') {
      // Database cache doesn't support simple key deletion
      return true;
    }
    
    return await layer.delete(key);
  }

  /**
   * Populate lower layers when cache hit occurs
   */
  async populateLowerLayers(hitLayerName, key, value, options) {
    const layers = this.getEnabledLayers();
    const hitLayerIndex = layers.indexOf(hitLayerName);
    
    if (hitLayerIndex < 0) return;
    
    // Populate lower priority layers
    for (let i = hitLayerIndex + 1; i < layers.length; i++) {
      const layerName = layers[i];
      const layer = this.layers.get(layerName);
      
      if (layer) {
        try {
          const layerOptions = {
            ...options,
            ttl: options.ttl || this.config.defaultTTL[layerName]
          };
          
          await this.setInLayer(layer, layerName, key, value, layerOptions);
        } catch (error) {
          this.debugLog(`Error populating ${layerName} layer:`, error);
        }
      }
    }
  }

  /**
   * Check if refresh ahead is needed
   */
  checkRefreshAhead(layerName, key, value, options) {
    // This would need access to TTL information from each layer
    // For now, we'll implement a simple time-based check
    if (Math.random() < 0.1) { // 10% chance to refresh
      this.scheduleRefresh(key, options);
    }
  }

  /**
   * Schedule background refresh
   */
  scheduleRefresh(key, options) {
    if (this.backgroundOperations.has(key)) {
      return; // Already refreshing
    }
    
    this.backgroundOperations.set(key, true);
    
    setTimeout(async () => {
      try {
        // This would need the original fetch function
        // For now, we'll emit an event that can be handled by the application
        this.emit('refresh:scheduled', key, options);
        this.metrics.backgroundRefreshes++;
      } finally {
        this.backgroundOperations.delete(key);
      }
    }, 0);
  }

  /**
   * Handle prefetch requests
   */
  async handlePrefetchRequest(key, fromLayer) {
    // This would need access to the original fetch function
    this.emit('prefetch:request', key, fromLayer);
  }

  /**
   * Track response times
   */
  trackResponseTime(responseTime) {
    this.responseTimes.push(responseTime);
    
    if (this.responseTimes.length > this.maxResponseTimeHistory) {
      this.responseTimes.shift();
    }
    
    this.metrics.avgResponseTime = this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
  }

  /**
   * Update performance metrics
   */
  updateMetrics() {
    this.metrics.hitRate = this.metrics.totalOperations > 0 ? 
      (this.metrics.totalHits / this.metrics.totalOperations) * 100 : 0;
  }

  /**
   * Collect additional metrics
   */
  collectMetrics() {
    try {
      const layerStats = {};
      
      for (const [layerName, layer] of this.layers.entries()) {
        if (typeof layer.getStats === 'function') {
          layerStats[layerName] = layer.getStats();
        }
      }
      
      this.emit('metrics', {
        manager: this.metrics,
        layers: layerStats
      });
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Get comprehensive cache statistics
   */
  getStats() {
    const layerStats = {};
    
    for (const [layerName, layer] of this.layers.entries()) {
      if (typeof layer.getStats === 'function') {
        layerStats[layerName] = layer.getStats();
      }
    }
    
    return {
      manager: this.metrics,
      layers: layerStats,
      config: {
        strategy: this.config.strategy,
        enabledLayers: this.getEnabledLayers(),
        refreshAhead: this.config.refreshAhead.enabled
      }
    };
  }

  /**
   * Clear all cache layers
   */
  async clear() {
    const results = [];
    
    for (const [layerName, layer] of this.layers.entries()) {
      try {
        if (typeof layer.clear === 'function') {
          await layer.clear();
          results.push({ layer: layerName, result: true });
        }
      } catch (error) {
        results.push({ layer: layerName, result: false, error });
      }
    }
    
    // Reset manager metrics
    this.metrics.totalOperations = 0;
    this.metrics.totalHits = 0;
    this.metrics.totalMisses = 0;
    this.metrics.totalErrors = 0;
    this.updateMetrics();
    
    this.emit('clear', results);
    this.debugLog('All cache layers cleared');
    
    return results.every(r => r.result);
  }

  /**
   * Health check for all cache layers
   */
  async healthCheck() {
    const results = {};
    let overallStatus = 'healthy';
    
    for (const [layerName, layer] of this.layers.entries()) {
      try {
        if (typeof layer.healthCheck === 'function') {
          results[layerName] = await layer.healthCheck();
          
          if (results[layerName].status !== 'healthy') {
            overallStatus = 'degraded';
          }
        } else {
          results[layerName] = {
            status: 'unknown',
            message: 'Health check not available'
          };
        }
      } catch (error) {
        results[layerName] = {
          status: 'unhealthy',
          error: error.message
        };
        overallStatus = 'unhealthy';
      }
    }
    
    const health = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      layers: results,
      manager: {
        metrics: this.metrics,
        config: {
          strategy: this.config.strategy,
          enabledLayers: this.getEnabledLayers()
        }
      }
    };
    
    return health;
  }

  /**
   * Debug logging
   */
  debugLog(message, data = null) {
    if (this.config.debug) {
      console.log(`[CacheManager] ${message}`, data || '');
    }
  }

  /**
   * Close all cache layers
   */
  async close() {
    // Clear metrics timer
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }
    
    // Close all layers
    const closePromises = Array.from(this.layers.entries()).map(async ([name, layer]) => {
      try {
        if (typeof layer.close === 'function') {
          await layer.close();
        }
        this.debugLog(`${name} cache layer closed`);
      } catch (error) {
        this.debugLog(`Error closing ${name} cache layer:`, error);
      }
    });

    await Promise.all(closePromises);
    this.layers.clear();
    this.emit('close');
    this.debugLog('Cache manager closed');
  }
}

module.exports = CacheManager;