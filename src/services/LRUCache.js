/**
 * LRU (Least Recently Used) Cache implementation
 * Thread-safe cache with size limits and TTL support
 */
class LRUCache {
  constructor(maxSize = 1000, defaultTTL = 300000) { // 5 minutes default TTL
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;

    this.cache = new Map();
    this.accessOrder = new Map(); // Track access order
    this.timers = new Map(); // TTL cleanup timers

    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      expirations: 0,
      currentSize: 0,
      hitRate: 0
    };
  }

  /**
   * Get a value from cache
   */
  get(key) {
    const item = this.cache.get(key);

    if (item === undefined) {
      this.stats.misses++;
      this._updateHitRate();
      return null;
    }

    // Check if expired
    if (Date.now() > item.expiry) {
      this._deleteInternal(key);
      this.stats.expirations++;
      this.stats.misses++;
      this._updateHitRate();
      return null;
    }

    // Update access order (LRU)
    this.accessOrder.delete(key);
    this.accessOrder.set(key, Date.now());

    this.stats.hits++;
    this._updateHitRate();

    return item.value;
  }

  /**
   * Set a value in cache
   */
  set(key, value, ttl = this.defaultTTL) {
    const now = Date.now();
    const expiry = now + ttl;

    // If key already exists, update it
    if (this.cache.has(key)) {
      this._updateInternal(key, value, expiry);
      return;
    }

    // If cache is full, evict least recently used items
    while (this.cache.size >= this.maxSize) {
      const evictedKey = this._getLRUKey();
      this._deleteInternal(evictedKey);
      this.stats.evictions++;
    }

    // Add new item
    const item = {
      value: value,
      created: now,
      expiry: expiry,
      ttl: ttl,
      accessCount: 1,
      lastAccess: now
    };

    this.cache.set(key, item);
    this.accessOrder.set(key, now);
    this._setTTLTimer(key, ttl);

    this.stats.sets++;
    this.stats.currentSize = this.cache.size;
  }

  /**
   * Delete a key from cache
   */
  delete(key) {
    const deleted = this._deleteInternal(key);
    if (deleted) {
      this.stats.deletes++;
    }
    return deleted;
  }

  /**
   * Check if key exists in cache
   */
  has(key) {
    const item = this.cache.get(key);
    if (!item) {
      return false;
    }

    // Check if expired
    if (Date.now() > item.expiry) {
      this._deleteInternal(key);
      this.stats.expirations++;
      return false;
    }

    return true;
  }

  /**
   * Clear all items from cache
   */
  clear() {
    // Clear all TTL timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }

    this.cache.clear();
    this.accessOrder.clear();
    this.timers.clear();

    this.stats.currentSize = 0;
    this.stats.hitRate = 0;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      ...this.stats,
      memoryUsage: this._estimateMemoryUsage(),
      oldestItem: this._getOldestItemAge(),
      newestItem: this._getNewestItemAge(),
      averageTTL: this._getAverageTTL()
    };
  }

  /**
   * Get all keys in cache (for debugging)
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache size
   */
  size() {
    return this.cache.size;
  }

  /**
   * Update existing item
   */
  _updateInternal(key, value, expiry) {
    const item = this.cache.get(key);
    if (!item) {
      return;
    }

    // Clear old TTL timer
    const oldTimer = this.timers.get(key);
    if (oldTimer) {
      clearTimeout(oldTimer);
    }

    // Update item
    item.value = value;
    item.expiry = expiry;
    item.ttl = expiry - Date.now();
    item.accessCount++;
    item.lastAccess = Date.now();

    // Update access order
    this.accessOrder.delete(key);
    this.accessOrder.set(key, Date.now());

    // Set new TTL timer
    this._setTTLTimer(key, item.ttl);
  }

  /**
   * Delete item and cleanup
   */
  _deleteInternal(key) {
    const deleted = this.cache.delete(key);

    if (deleted) {
      this.accessOrder.delete(key);

      const timer = this.timers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(key);
      }

      this.stats.currentSize = this.cache.size;
    }

    return deleted;
  }

  /**
   * Get least recently used key
   */
  _getLRUKey() {
    let oldestKey = null;
    let oldestTime = Date.now();

    for (const [key, time] of this.accessOrder.entries()) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  /**
   * Set TTL timer for automatic expiration
   */
  _setTTLTimer(key, ttl) {
    if (ttl <= 0) {
      return; // No expiration
    }

    const timer = setTimeout(() => {
      this._deleteInternal(key);
      this.stats.expirations++;
    }, ttl);

    this.timers.set(key, timer);
  }

  /**
   * Update hit rate statistics
   */
  _updateHitRate() {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
  }

  /**
   * Estimate memory usage (rough approximation)
   */
  _estimateMemoryUsage() {
    let totalSize = 0;

    for (const [key, item] of this.cache.entries()) {
      // Rough estimation: key size + value size + metadata
      totalSize += key.length * 2; // UTF-16 characters
      totalSize += JSON.stringify(item.value).length * 2;
      totalSize += 200; // Approximate metadata size
    }

    return totalSize;
  }

  /**
   * Get age of oldest item in milliseconds
   */
  _getOldestItemAge() {
    if (this.cache.size === 0) {
      return 0;
    }

    let oldestTime = Date.now();
    for (const item of this.cache.values()) {
      if (item.created < oldestTime) {
        oldestTime = item.created;
      }
    }

    return Date.now() - oldestTime;
  }

  /**
   * Get age of newest item in milliseconds
   */
  _getNewestItemAge() {
    if (this.cache.size === 0) {
      return 0;
    }

    let newestTime = 0;
    for (const item of this.cache.values()) {
      if (item.created > newestTime) {
        newestTime = item.created;
      }
    }

    return Date.now() - newestTime;
  }

  /**
   * Get average TTL of cached items
   */
  _getAverageTTL() {
    if (this.cache.size === 0) {
      return 0;
    }

    let totalTTL = 0;
    for (const item of this.cache.values()) {
      totalTTL += item.ttl;
    }

    return totalTTL / this.cache.size;
  }

  /**
   * Get detailed information about a cache item (for debugging)
   */
  getItemInfo(key) {
    const item = this.cache.get(key);
    if (!item) {
      return null;
    }

    return {
      key: key,
      valueSize: JSON.stringify(item.value).length,
      created: item.created,
      expiry: item.expiry,
      ttl: item.ttl,
      accessCount: item.accessCount,
      lastAccess: item.lastAccess,
      age: Date.now() - item.created,
      timeToExpiry: item.expiry - Date.now(),
      isExpired: Date.now() > item.expiry
    };
  }

  /**
   * Cleanup expired items manually
   */
  cleanup() {
    const now = Date.now();
    const expiredKeys = [];

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this._deleteInternal(key);
      this.stats.expirations++;
    }

    return expiredKeys.length;
  }

  /**
   * Set maximum cache size (evicts items if necessary)
   */
  setMaxSize(newSize) {
    this.maxSize = newSize;

    // Evict items if necessary
    while (this.cache.size > this.maxSize) {
      const evictedKey = this._getLRUKey();
      this._deleteInternal(evictedKey);
      this.stats.evictions++;
    }
  }

  /**
   * Set default TTL for new items
   */
  setDefaultTTL(newTTL) {
    this.defaultTTL = newTTL;
  }
}

module.exports = LRUCache;