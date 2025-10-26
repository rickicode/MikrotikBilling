/**
 * Enhanced Memory Cache (L1)
 * High-performance in-memory caching with advanced eviction strategies
 * compression, encryption, and intelligent prefetching
 */

const crypto = require('crypto');
const zlib = require('zlib');
const EventEmitter = require('events');
const LRUCache = require('../services/LRUCache');

class MemoryCache extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      maxSize: config.maxSize || 1000,
      defaultTTL: config.defaultTTL || 300000, // 5 minutes
      cleanupInterval: config.cleanupInterval || 60000, // 1 minute
      compressionThreshold: config.compressionThreshold || 1024, // 1KB
      compressionEnabled: config.compressionEnabled || false,
      encryptionEnabled: config.encryptionEnabled || false,
      encryptionKey: config.encryptionKey || null,
      evictionStrategy: config.evictionStrategy || 'lru', // lru, lfu, fifo
      prefetchEnabled: config.prefetchEnabled || false,
      prefetchThreshold: config.prefetchThreshold || 0.8,
      debug: config.debug || false,
      ...config
    };

    // Initialize cache storage
    this.cache = new LRUCache(this.config.maxSize, this.config.defaultTTL);
    
    // Additional metadata storage
    this.metadata = new Map(); // key -> { tags, version, accessFrequency, lastPrefetch }
    this.tags = new Map(); // tag -> Set(keys)
    
    // Access pattern tracking for prefetching
    this.accessPatterns = new Map(); // key -> { timestamps, frequency }
    
    // Performance metrics
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      expirations: 0,
      compressions: 0,
      encryptions: 0,
      prefetchHits: 0,
      totalOperations: 0,
      avgResponseTime: 0,
      memoryUsage: 0,
      hitRate: 0
    };

    // Initialize encryption key if needed
    if (this.config.encryptionEnabled) {
      this.encryptionKey = this.config.encryptionKey || this.generateEncryptionKey();
    }

    // Start cleanup interval
    if (this.config.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup();
      }, this.config.cleanupInterval);
    }

    // Prefetch timer
    if (this.config.prefetchEnabled) {
      this.prefetchTimer = setInterval(() => {
        this.runPrefetch();
      }, 300000); // Run every 5 minutes
    }

    this.debugLog('Memory cache initialized', {
      maxSize: this.config.maxSize,
      defaultTTL: this.config.defaultTTL,
      compressionEnabled: this.config.compressionEnabled,
      encryptionEnabled: this.config.encryptionEnabled
    });
  }

  /**
   * Get value from cache
   */
  async get(key) {
    const startTime = Date.now();
    
    try {
      // Track access pattern
      this.trackAccess(key);

      let value = this.cache.get(key);
      
      if (value === null) {
        this.metrics.misses++;
        this.updateMetrics();
        this.emit('miss', key);
        this.debugLog(`Cache miss for key: ${key}`);
        return null;
      }

      // Process the cached value
      value = await this.processValueOnGet(value);
      
      // Update metrics
      this.metrics.hits++;
      this.updateMetrics();
      
      const responseTime = Date.now() - startTime;
      this.emit('hit', key, responseTime);
      this.debugLog(`Cache hit for key: ${key}, response time: ${responseTime}ms`);
      
      return value;
    } catch (error) {
      this.metrics.misses++;
      this.updateMetrics();
      this.emit('error', error, key);
      this.debugLog(`Error getting key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(key, value, options = {}) {
    const startTime = Date.now();
    
    try {
      const ttl = options.ttl || this.config.defaultTTL;
      const tags = options.tags || [];
      const version = options.version || 1;
      
      // Validate key and value
      if (!key || value === undefined) {
        throw new Error('Key and value are required');
      }

      // Process the value before caching
      const processedValue = await this.processValueOnSet(value);
      
      // Store in cache
      this.cache.set(key, processedValue, ttl);
      
      // Update metadata
      this.updateMetadata(key, tags, version);
      
      // Update tags
      this.updateTags(key, tags);
      
      // Update metrics
      this.metrics.sets++;
      this.updateMetrics();
      
      const responseTime = Date.now() - startTime;
      this.emit('set', key, ttl, responseTime);
      this.debugLog(`Cache set for key: ${key}, TTL: ${ttl}, response time: ${responseTime}ms`);
      
      return true;
    } catch (error) {
      this.emit('error', error, key);
      this.debugLog(`Error setting key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete key from cache
   */
  async delete(key) {
    try {
      const deleted = this.cache.delete(key);
      
      if (deleted) {
        this.removeMetadata(key);
        this.removeTags(key);
        this.metrics.deletes++;
        this.updateMetrics();
        this.emit('delete', key);
        this.debugLog(`Cache delete for key: ${key}`);
      }
      
      return deleted;
    } catch (error) {
      this.emit('error', error, key);
      this.debugLog(`Error deleting key ${key}:`, error);
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async has(key) {
    try {
      return this.cache.has(key);
    } catch (error) {
      this.emit('error', error, key);
      return false;
    }
  }

  /**
   * Clear all cache entries
   */
  async clear() {
    try {
      this.cache.clear();
      this.metadata.clear();
      this.tags.clear();
      this.accessPatterns.clear();
      
      // Reset metrics
      this.metrics.hits = 0;
      this.metrics.misses = 0;
      this.metrics.sets = 0;
      this.metrics.deletes = 0;
      this.metrics.evictions = 0;
      this.metrics.expirations = 0;
      this.updateMetrics();
      
      this.emit('clear');
      this.debugLog('Cache cleared');
      return true;
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Get multiple keys (batch operation)
   */
  async mget(keys) {
    const results = new Map();
    const promises = keys.map(async (key) => {
      const value = await this.get(key);
      return { key, value };
    });

    const resolved = await Promise.all(promises);
    resolved.forEach(({ key, value }) => {
      if (value !== null) {
        results.set(key, value);
      }
    });

    return results;
  }

  /**
   * Set multiple keys (batch operation)
   */
  async mset(entries, defaultTTL = null) {
    const promises = entries.map(async ([key, value]) => {
      return await this.set(key, value, { ttl: defaultTTL });
    });

    const results = await Promise.all(promises);
    return results.every(result => result === true);
  }

  /**
   * Delete multiple keys (batch operation)
   */
  async mdel(keys) {
    const promises = keys.map(key => this.delete(key));
    const results = await Promise.all(promises);
    return results.filter(result => result === true).length;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const cacheStats = this.cache.getStats();
    
    return {
      ...this.metrics,
      cache: cacheStats,
      memoryUsage: this.getMemoryUsage(),
      tagCount: this.tags.size,
      accessPatterns: this.accessPatterns.size
    };
  }

  /**
   * Get keys by tag
   */
  getKeysByTag(tag) {
    const keys = this.tags.get(tag);
    return keys ? Array.from(keys) : [];
  }

  /**
   * Invalidate keys by tag
   */
  async invalidateByTag(tag) {
    const keys = this.getKeysByTag(tag);
    if (keys.length === 0) {
      return 0;
    }

    const deletedCount = await this.mdel(keys);
    this.emit('invalidate:tag', tag, deletedCount);
    this.debugLog(`Invalidated ${deletedCount} keys for tag: ${tag}`);
    
    return deletedCount;
  }

  /**
   * Invalidate keys by pattern
   */
  async invalidateByPattern(pattern) {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    const keys = this.cache.keys().filter(key => regex.test(key));
    
    if (keys.length === 0) {
      return 0;
    }

    const deletedCount = await this.mdel(keys);
    this.emit('invalidate:pattern', pattern, deletedCount);
    this.debugLog(`Invalidated ${deletedCount} keys for pattern: ${pattern}`);
    
    return deletedCount;
  }

  /**
   * Cleanup expired entries
   */
  cleanup() {
    try {
      const cleanedUp = this.cache.cleanup();
      if (cleanedUp > 0) {
        this.metrics.expirations += cleanedUp;
        this.updateMetrics();
        this.emit('cleanup', cleanedUp);
        this.debugLog(`Cleaned up ${cleanedUp} expired entries`);
      }
    } catch (error) {
      this.emit('error', error);
      this.debugLog('Error during cleanup:', error);
    }
  }

  /**
   * Track access patterns for intelligent prefetching
   */
  trackAccess(key) {
    if (!this.config.prefetchEnabled) {
      return;
    }

    const now = Date.now();
    const pattern = this.accessPatterns.get(key) || { timestamps: [], frequency: 0 };
    
    pattern.timestamps.push(now);
    pattern.frequency++;
    
    // Keep only recent access history (last 24 hours)
    const dayAgo = now - 86400000;
    pattern.timestamps = pattern.timestamps.filter(timestamp => timestamp > dayAgo);
    
    this.accessPatterns.set(key, pattern);
  }

  /**
   * Run intelligent prefetching
   */
  async runPrefetch() {
    if (!this.config.prefetchEnabled) {
      return;
    }

    try {
      const candidates = this.getPrefetchCandidates();
      const promises = candidates.map(candidate => this.prefetchKey(candidate));
      
      await Promise.all(promises);
      this.debugLog(`Prefetched ${candidates.length} keys`);
    } catch (error) {
      this.emit('error', error);
      this.debugLog('Error during prefetch:', error);
    }
  }

  /**
   * Get prefetch candidates based on access patterns
   */
  getPrefetchCandidates() {
    const candidates = [];
    const now = Date.now();
    const threshold = this.config.prefetchThreshold;
    
    for (const [key, pattern] of this.accessPatterns.entries()) {
      // Skip if already in cache
      if (this.cache.has(key)) {
        continue;
      }
      
      // Calculate access score
      const recentAccesses = pattern.timestamps.filter(timestamp => 
        now - timestamp < 3600000 // Last hour
      ).length;
      
      const totalAccesses = pattern.frequency;
      const ageOfLastAccess = now - Math.max(...pattern.timestamps);
      
      // Score calculation (can be enhanced with ML)
      const score = (recentAccesses * 0.5) + 
                   (totalAccesses * 0.3) - 
                   (ageOfLastAccess / 86400000) * 0.2;
      
      if (score > threshold) {
        candidates.push({ key, score });
      }
    }
    
    // Sort by score and return top candidates
    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(candidate => candidate.key);
  }

  /**
   * Prefetch a specific key (to be implemented by cache manager)
   */
  async prefetchKey(key) {
    // This will be implemented by the cache manager
    // which knows how to fetch the actual data
    this.emit('prefetch', key);
  }

  /**
   * Process value when getting from cache
   */
  async processValueOnGet(value) {
    let processedValue = value;
    
    // Decrypt if needed
    if (this.config.encryptionEnabled && value.encrypted) {
      processedValue = await this.decryptValue(value.data);
    } else if (this.config.encryptionEnabled) {
      processedValue = value.data;
    } else {
      processedValue = value;
    }
    
    // Decompress if needed
    if (this.config.compressionEnabled && value.compressed) {
      processedValue = await this.decompressValue(processedValue);
    }
    
    return processedValue;
  }

  /**
   * Process value when setting to cache
   */
  async processValueOnSet(value) {
    let processedValue = value;
    let metadata = {};
    
    // Compress if needed
    const valueSize = JSON.stringify(value).length;
    if (this.config.compressionEnabled && valueSize > this.config.compressionThreshold) {
      processedValue = await this.compressValue(processedValue);
      metadata.compressed = true;
      this.metrics.compressions++;
    }
    
    // Encrypt if needed
    if (this.config.encryptionEnabled) {
      processedValue = await this.encryptValue(processedValue);
      metadata.encrypted = true;
      this.metrics.encryptions++;
    }
    
    // Wrap value with metadata
    if (Object.keys(metadata).length > 0) {
      return { data: processedValue, ...metadata };
    }
    
    return processedValue;
  }

  /**
   * Compress value using gzip
   */
  async compressValue(value) {
    return new Promise((resolve, reject) => {
      const serialized = JSON.stringify(value);
      zlib.gzip(serialized, { level: 6 }, (err, compressed) => {
        if (err) reject(err);
        else resolve(compressed);
      });
    });
  }

  /**
   * Decompress value
   */
  async decompressValue(compressedValue) {
    return new Promise((resolve, reject) => {
      zlib.gunzip(compressedValue, (err, decompressed) => {
        if (err) reject(err);
        else resolve(JSON.parse(decompressed.toString()));
      });
    });
  }

  /**
   * Encrypt value
   */
  async encryptValue(value) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.config.encryptionAlgorithm || 'aes-256-gcm', this.encryptionKey);
    cipher.setAAD(Buffer.from('mikrotik_billing_cache'));
    
    let encrypted = cipher.update(JSON.stringify(value), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  /**
   * Decrypt value
   */
  async decryptValue(encryptedData) {
    const decipher = crypto.createDecipher(this.config.encryptionAlgorithm || 'aes-256-gcm', this.encryptionKey);
    decipher.setAAD(Buffer.from('mikrotik_billing_cache'));
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }

  /**
   * Generate encryption key
   */
  generateEncryptionKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Update metadata for a key
   */
  updateMetadata(key, tags, version) {
    const metadata = {
      tags: new Set(tags),
      version,
      createdAt: Date.now(),
      lastAccess: Date.now()
    };
    
    this.metadata.set(key, metadata);
  }

  /**
   * Remove metadata for a key
   */
  removeMetadata(key) {
    this.metadata.delete(key);
  }

  /**
   * Update tags for a key
   */
  updateTags(key, tags) {
    // Remove key from existing tags
    for (const [tag, keySet] of this.tags.entries()) {
      keySet.delete(key);
      if (keySet.size === 0) {
        this.tags.delete(tag);
      }
    }
    
    // Add key to new tags
    for (const tag of tags) {
      if (!this.tags.has(tag)) {
        this.tags.set(tag, new Set());
      }
      this.tags.get(tag).add(key);
    }
  }

  /**
   * Remove key from tags
   */
  removeTags(key) {
    for (const [tag, keySet] of this.tags.entries()) {
      keySet.delete(key);
      if (keySet.size === 0) {
        this.tags.delete(tag);
      }
    }
  }

  /**
   * Update performance metrics
   */
  updateMetrics() {
    this.metrics.totalOperations = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRate = this.metrics.totalOperations > 0 ? 
      (this.metrics.hits / this.metrics.totalOperations) * 100 : 0;
    this.metrics.memoryUsage = this.getMemoryUsage();
  }

  /**
   * Get memory usage estimate
   */
  getMemoryUsage() {
    let totalSize = 0;
    
    // Cache size
    totalSize += this.cache.getStats().memoryUsage || 0;
    
    // Metadata size
    for (const [key, metadata] of this.metadata.entries()) {
      totalSize += key.length * 2; // UTF-16
      totalSize += JSON.stringify(metadata).length * 2;
    }
    
    // Tags size
    for (const [tag, keySet] of this.tags.entries()) {
      totalSize += tag.length * 2;
      totalSize += Array.from(keySet).join('').length * 2;
    }
    
    // Access patterns size
    for (const [key, pattern] of this.accessPatterns.entries()) {
      totalSize += key.length * 2;
      totalSize += JSON.stringify(pattern).length * 2;
    }
    
    return totalSize;
  }

  /**
   * Debug logging
   */
  debugLog(message, data = null) {
    if (this.config.debug) {
      console.log(`[MemoryCache] ${message}`, data || '');
    }
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
    if (stats.hitRate < 50) {
      health.status = 'degraded';
      health.warnings = [`Low hit rate: ${stats.hitRate.toFixed(2)}%`];
    }
    
    if (stats.memoryUsage > 500 * 1024 * 1024) { // 500MB
      health.status = 'degraded';
      health.warnings = health.warnings || [];
      health.warnings.push(`High memory usage: ${(stats.memoryUsage / 1024 / 1024).toFixed(2)}MB`];
    }
    
    return health;
  }

  /**
   * Close and cleanup
   */
  async close() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    if (this.prefetchTimer) {
      clearInterval(this.prefetchTimer);
    }
    
    await this.clear();
    this.emit('close');
    this.debugLog('Memory cache closed');
  }
}

module.exports = MemoryCache;