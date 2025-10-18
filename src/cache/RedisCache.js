/**
 * Enhanced Redis Cache (L2)
 * Distributed caching with clustering, pipeline operations, 
 * compression, and advanced pub/sub capabilities
 */

const Redis = require('ioredis');
const EventEmitter = require('events');
const crypto = require('crypto');
const zlib = require('zlib');

class RedisCache extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Connection settings
      host: config.host || 'localhost',
      port: config.port || 6379,
      password: config.password,
      db: config.db || 0,
      family: config.family || 4,
      keyPrefix: config.keyPrefix || 'mikrotik_billing:',
      
      // Performance settings
      defaultTTL: config.defaultTTL || 1800, // 30 minutes
      compressionEnabled: config.compressionEnabled || false,
      compressionThreshold: config.compressionThreshold || 1024,
      pipelineEnabled: config.pipelineEnabled || false,
      pipelineBatchSize: config.pipelineBatchSize || 100,
      
      // Cluster settings
      cluster: config.cluster || {},
      sentinel: config.sentinel || {},
      
      // Retry and connection settings
      maxRetriesPerRequest: config.maxRetriesPerRequest || 3,
      retryDelayOnFailover: config.retryDelayOnFailover || 100,
      enableOfflineQueue: config.enableOfflineQueue !== false,
      lazyConnect: config.lazyConnect !== false,
      
      // Security
      encryptionEnabled: config.encryptionEnabled || false,
      encryptionKey: config.encryptionKey || null,
      
      // Monitoring
      debug: config.debug || false,
      metricsInterval: config.metricsInterval || 60000,
      
      ...config
    };

    // Initialize clients
    this.clients = new Map();
    this.setupClients();
    
    // Pipeline queue
    this.pipelineQueue = [];
    this.pipelineTimer = null;
    
    // Metrics
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      reconnects: 0,
      pipelineOperations: 0,
      compressions: 0,
      encryptions: 0,
      totalOperations: 0,
      avgResponseTime: 0,
      hitRate: 0
    };

    // Performance tracking
    this.responseTimes = [];
    this.maxResponseTimeHistory = 100;
    
    // Setup metrics collection
    if (this.config.metricsInterval > 0) {
      this.metricsTimer = setInterval(() => {
        this.collectMetrics();
      }, this.config.metricsInterval);
    }

    // Initialize encryption key if needed
    if (this.config.encryptionEnabled) {
      this.encryptionKey = this.config.encryptionKey || this.generateEncryptionKey();
    }

    this.debugLog('Redis cache initialized', {
      host: this.config.host,
      port: this.config.port,
      db: this.config.db,
      clusterEnabled: !!this.config.cluster.enabled,
      sentinelEnabled: !!this.config.sentinel.enabled
    });
  }

  /**
   * Setup Redis clients based on configuration
   */
  setupClients() {
    // Setup primary client
    this.setupPrimaryClient();
    
    // Setup cluster client if configured
    if (this.config.cluster.enabled) {
      this.setupClusterClient();
    }
    
    // Setup sentinel client if configured
    if (this.config.sentinel.enabled) {
      this.setupSentinelClient();
    }
  }

  /**
   * Setup primary Redis client
   */
  setupPrimaryClient() {
    const client = new Redis({
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      db: this.config.db,
      family: this.config.family,
      keyPrefix: this.config.keyPrefix,
      maxRetriesPerRequest: this.config.maxRetriesPerRequest,
      retryDelayOnFailover: this.config.retryDelayOnFailover,
      enableOfflineQueue: this.config.enableOfflineQueue,
      lazyConnect: this.config.lazyConnect,
      enableReadyCheck: true,
      maxMemoryPolicy: 'allkeys-lru'
    });

    this.setupClientEvents(client, 'primary');
    this.clients.set('primary', client);
  }

  /**
   * Setup Redis cluster client
   */
  setupClusterClient() {
    const nodes = this.config.cluster.nodes || [];
    
    if (nodes.length === 0) {
      this.debugLog('Cluster enabled but no nodes specified');
      return;
    }

    const client = new Redis.Cluster(nodes, {
      redisOptions: {
        password: this.config.password,
        maxRetriesPerRequest: this.config.maxRetriesPerRequest,
        lazyConnect: true
      },
      keyPrefix: this.config.keyPrefix,
      enableOfflineQueue: this.config.enableOfflineQueue,
      retryDelayOnFailover: this.config.retryDelayOnFailover
    });

    this.setupClientEvents(client, 'cluster');
    this.clients.set('cluster', client);
  }

  /**
   * Setup Redis sentinel client
   */
  setupSentinelClient() {
    const sentinels = this.config.sentinel.sentinels || [];
    
    if (sentinels.length === 0) {
      this.debugLog('Sentinel enabled but no sentinels specified');
      return;
    }

    const client = new Redis({
      sentinels,
      name: this.config.sentinel.name || 'mymaster',
      password: this.config.password,
      keyPrefix: this.config.keyPrefix,
      maxRetriesPerRequest: this.config.maxRetriesPerRequest,
      lazyConnect: true
    });

    this.setupClientEvents(client, 'sentinel');
    this.clients.set('sentinel', client);
  }

  /**
   * Setup client event handlers
   */
  setupClientEvents(client, name) {
    client.on('connect', () => {
      this.debugLog(`Redis ${name} client connected`);
      this.emit('client:connect', name);
    });

    client.on('ready', () => {
      this.debugLog(`Redis ${name} client ready`);
      this.emit('client:ready', name);
    });

    client.on('error', (error) => {
      this.metrics.errors++;
      this.debugLog(`Redis ${name} client error:`, error);
      this.emit('client:error', name, error);
    });

    client.on('close', () => {
      this.debugLog(`Redis ${name} client closed`);
      this.emit('client:close', name);
    });

    client.on('reconnecting', () => {
      this.metrics.reconnects++;
      this.debugLog(`Redis ${name} client reconnecting`);
      this.emit('client:reconnecting', name);
    });

    client.on('end', () => {
      this.debugLog(`Redis ${name} client ended`);
      this.emit('client:end', name);
    });
  }

  /**
   * Get the best available Redis client
   */
  getClient() {
    // Prefer cluster, then sentinel, then primary
    return this.clients.get('cluster') || 
           this.clients.get('sentinel') || 
           this.clients.get('primary');
  }

  /**
   * Get value from Redis
   */
  async get(key) {
    const startTime = Date.now();
    
    try {
      const client = this.getClient();
      if (!client) {
        throw new Error('No Redis client available');
      }

      let value = await client.get(key);
      
      if (value === null) {
        this.metrics.misses++;
        this.updateMetrics();
        this.emit('miss', key);
        return null;
      }

      // Process the cached value
      value = await this.processValueOnGet(value);
      
      this.metrics.hits++;
      this.updateMetrics();
      
      const responseTime = Date.now() - startTime;
      this.trackResponseTime(responseTime);
      this.emit('hit', key, responseTime);
      
      return value;
    } catch (error) {
      this.metrics.errors++;
      this.metrics.misses++;
      this.updateMetrics();
      this.emit('error', error, key);
      this.debugLog(`Error getting key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in Redis
   */
  async set(key, value, options = {}) {
    const startTime = Date.now();
    
    try {
      const client = this.getClient();
      if (!client) {
        throw new Error('No Redis client available');
      }

      const ttl = options.ttl || this.config.defaultTTL;
      
      // Process the value before caching
      const processedValue = await this.processValueOnSet(value);
      
      // Set in Redis
      const serializedValue = typeof processedValue === 'string' ? 
        processedValue : JSON.stringify(processedValue);
      
      await client.set(key, serializedValue, 'EX', ttl);
      
      this.metrics.sets++;
      this.updateMetrics();
      
      const responseTime = Date.now() - startTime;
      this.trackResponseTime(responseTime);
      this.emit('set', key, ttl, responseTime);
      
      return true;
    } catch (error) {
      this.metrics.errors++;
      this.updateMetrics();
      this.emit('error', error, key);
      this.debugLog(`Error setting key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete key from Redis
   */
  async delete(key) {
    try {
      const client = this.getClient();
      if (!client) {
        throw new Error('No Redis client available');
      }

      const result = await client.del(key);
      
      if (result > 0) {
        this.metrics.deletes++;
        this.updateMetrics();
        this.emit('delete', key);
      }
      
      return result > 0;
    } catch (error) {
      this.metrics.errors++;
      this.updateMetrics();
      this.emit('error', error, key);
      this.debugLog(`Error deleting key ${key}:`, error);
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    try {
      const client = this.getClient();
      if (!client) {
        return false;
      }

      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', error, key);
      return false;
    }
  }

  /**
   * Set TTL for existing key
   */
  async expire(key, ttl) {
    try {
      const client = this.getClient();
      if (!client) {
        return false;
      }

      const result = await client.expire(key, ttl);
      return result === 1;
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', error, key);
      return false;
    }
  }

  /**
   * Get TTL for key
   */
  async ttl(key) {
    try {
      const client = this.getClient();
      if (!client) {
        return -1;
      }

      return await client.ttl(key);
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', error, key);
      return -1;
    }
  }

  /**
   * Hash operations
   */
  async hget(key, field) {
    try {
      const client = this.getClient();
      if (!client) {
        return null;
      }

      let value = await client.hget(key, field);
      
      if (value === null) {
        return null;
      }

      // Process the cached value
      return await this.processValueOnGet(value);
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', error, `${key}:${field}`);
      return null;
    }
  }

  async hset(key, field, value, options = {}) {
    try {
      const client = this.getClient();
      if (!client) {
        return false;
      }

      const ttl = options.ttl || this.config.defaultTTL;
      
      // Process the value before caching
      const processedValue = await this.processValueOnSet(value);
      const serializedValue = typeof processedValue === 'string' ? 
        processedValue : JSON.stringify(processedValue);
      
      await client.hset(key, field, serializedValue);

      if (ttl > 0) {
        await client.expire(key, ttl);
      }

      this.metrics.sets++;
      this.updateMetrics();
      
      return true;
    } catch (error) {
      this.metrics.errors++;
      this.updateMetrics();
      this.emit('error', error, `${key}:${field}`);
      return false;
    }
  }

  async hgetall(key) {
    try {
      const client = this.getClient();
      if (!client) {
        return {};
      }

      const hash = await client.hgetall(key);
      const parsed = {};

      for (const [field, value] of Object.entries(hash)) {
        try {
          parsed[field] = await this.processValueOnGet(value);
        } catch {
          parsed[field] = value;
        }
      }

      return parsed;
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', error, key);
      return {};
    }
  }

  /**
   * List operations
   */
  async lpush(key, value) {
    try {
      const client = this.getClient();
      if (!client) {
        return false;
      }

      const processedValue = await this.processValueOnSet(value);
      const serializedValue = typeof processedValue === 'string' ? 
        processedValue : JSON.stringify(processedValue);
      
      await client.lpush(key, serializedValue);
      this.metrics.sets++;
      this.updateMetrics();
      
      return true;
    } catch (error) {
      this.metrics.errors++;
      this.updateMetrics();
      this.emit('error', error, key);
      return false;
    }
  }

  async rpop(key) {
    try {
      const client = this.getClient();
      if (!client) {
        return null;
      }

      let value = await client.rpop(key);
      
      if (value === null) {
        return null;
      }

      // Process the cached value
      return await this.processValueOnGet(value);
    } catch (error) {
      this.metrics.errors++;
      this.updateMetrics();
      this.emit('error', error, key);
      return null;
    }
  }

  /**
   * Set operations
   */
  async sadd(key, value) {
    try {
      const client = this.getClient();
      if (!client) {
        return false;
      }

      const processedValue = await this.processValueOnSet(value);
      const serializedValue = typeof processedValue === 'string' ? 
        processedValue : JSON.stringify(processedValue);
      
      await client.sadd(key, serializedValue);
      this.metrics.sets++;
      this.updateMetrics();
      
      return true;
    } catch (error) {
      this.metrics.errors++;
      this.updateMetrics();
      this.emit('error', error, key);
      return false;
    }
  }

  async smembers(key) {
    try {
      const client = this.getClient();
      if (!client) {
        return [];
      }

      const members = await client.smembers(key);
      const processed = [];

      for (const member of members) {
        try {
          processed.push(await this.processValueOnGet(member));
        } catch {
          processed.push(member);
        }
      }

      return processed;
    } catch (error) {
      this.metrics.errors++;
      this.updateMetrics();
      this.emit('error', error, key);
      return [];
    }
  }

  /**
   * Atomic operations
   */
  async incr(key, ttl = null) {
    try {
      const client = this.getClient();
      if (!client) {
        return null;
      }

      const result = await client.incr(key);
      
      if (result === 1 && ttl > 0) {
        await client.expire(key, ttl);
      }
      
      return result;
    } catch (error) {
      this.metrics.errors++;
      this.updateMetrics();
      this.emit('error', error, key);
      return null;
    }
  }

  /**
   * Batch operations
   */
  async mget(keys) {
    try {
      const client = this.getClient();
      if (!client) {
        return new Map();
      }

      const values = await client.mget(...keys);
      const results = new Map();

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        let value = values[i];
        
        if (value !== null) {
          value = await this.processValueOnGet(value);
          results.set(key, value);
          this.metrics.hits++;
        } else {
          this.metrics.misses++;
        }
      }

      this.updateMetrics();
      return results;
    } catch (error) {
      this.metrics.errors++;
      this.updateMetrics();
      this.emit('error', error);
      return new Map();
    }
  }

  async mset(entries, defaultTTL = null) {
    if (this.config.pipelineEnabled) {
      return this.msetPipeline(entries, defaultTTL);
    }

    try {
      const client = this.getClient();
      if (!client) {
        return false;
      }

      const pipeline = client.pipeline();
      
      for (const [key, value] of entries) {
        const processedValue = await this.processValueOnSet(value);
        const serializedValue = typeof processedValue === 'string' ? 
          processedValue : JSON.stringify(processedValue);
        pipeline.set(key, serializedValue);
        
        if (defaultTTL) {
          pipeline.expire(key, defaultTTL);
        }
      }

      const results = await pipeline.exec();
      const success = results.every(([err]) => !err);
      
      if (success) {
        this.metrics.sets += entries.length;
        this.metrics.pipelineOperations++;
        this.updateMetrics();
      }
      
      return success;
    } catch (error) {
      this.metrics.errors++;
      this.updateMetrics();
      this.emit('error', error);
      return false;
    }
  }

  async msetPipeline(entries, defaultTTL = null) {
    return new Promise((resolve) => {
      this.pipelineQueue.push({ entries, defaultTTL, resolve });
      
      if (this.pipelineQueue.length >= this.config.pipelineBatchSize) {
        this.flushPipeline();
      } else if (!this.pipelineTimer) {
        this.pipelineTimer = setTimeout(() => {
          this.flushPipeline();
        }, 10); // Flush after 10ms
      }
    });
  }

  async flushPipeline() {
    if (this.pipelineQueue.length === 0) {
      return;
    }

    const batch = this.pipelineQueue.splice(0);
    const allEntries = [];
    
    // Collect all entries
    for (const { entries } of batch) {
      allEntries.push(...entries);
    }

    try {
      const client = this.getClient();
      if (!client) {
        batch.forEach(({ resolve }) => resolve(false));
        return;
      }

      const pipeline = client.pipeline();
      
      for (const [key, value] of allEntries) {
        pipeline.set(key, JSON.stringify(value));
      }
      
      const results = await pipeline.exec();
      const success = results.every(([err]) => !err);
      
      if (success) {
        this.metrics.sets += allEntries.length;
        this.metrics.pipelineOperations++;
        this.updateMetrics();
      }
      
      // Resolve all promises
      batch.forEach(({ resolve }) => resolve(success));
    } catch (error) {
      this.metrics.errors++;
      this.updateMetrics();
      this.emit('error', error);
      batch.forEach(({ resolve }) => resolve(false));
    }

    this.pipelineTimer = null;
  }

  /**
   * Pattern-based operations
   */
  async keys(pattern) {
    try {
      const client = this.getClient();
      if (!client) {
        return [];
      }

      return await client.keys(pattern);
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', error);
      return [];
    }
  }

  async invalidatePattern(pattern) {
    try {
      const client = this.getClient();
      if (!client) {
        return 0;
      }

      const keys = await client.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      const result = await client.del(...keys);
      this.metrics.deletes += result;
      this.updateMetrics();
      this.emit('invalidate:pattern', pattern, result);
      
      return result;
    } catch (error) {
      this.metrics.errors++;
      this.updateMetrics();
      this.emit('error', error);
      return 0;
    }
  }

  /**
   * Pub/Sub operations
   */
  async publish(channel, message) {
    try {
      const client = this.getClient();
      if (!client) {
        return false;
      }

      const serializedMessage = JSON.stringify(message);
      const result = await client.publish(channel, serializedMessage);
      
      this.emit('publish', channel, result);
      return result;
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', error);
      return false;
    }
  }

  async subscribe(channel, callback) {
    try {
      const client = this.getClient();
      if (!client) {
        return false;
      }

      // Use a separate client for subscription
      const subscriber = new Redis(client.options);
      
      subscriber.subscribe(channel, (err, count) => {
        if (err) {
          this.emit('error', err);
          return;
        }
        
        this.debugLog(`Subscribed to ${count} channels`);
      });

      subscriber.on('message', (channel, message) => {
        try {
          const parsedMessage = JSON.parse(message);
          callback(channel, parsedMessage);
        } catch (error) {
          callback(channel, message);
        }
      });

      return true;
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Process value when getting from cache
   */
  async processValueOnGet(value) {
    let processedValue = value;
    
    // Parse JSON if needed
    if (typeof value === 'string') {
      try {
        processedValue = JSON.parse(value);
      } catch {
        processedValue = value;
      }
    }
    
    // Decrypt if needed
    if (this.config.encryptionEnabled && processedValue.encrypted) {
      processedValue = await this.decryptValue(processedValue.data);
    } else if (this.config.encryptionEnabled && processedValue.data) {
      processedValue = processedValue.data;
    }
    
    // Decompress if needed
    if (this.config.compressionEnabled && processedValue.compressed) {
      processedValue = await this.decompressValue(processedValue.data);
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
    cipher.setAAD(Buffer.from('mikrotik_billing_redis'));
    
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
    decipher.setAAD(Buffer.from('mikrotik_billing_redis'));
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
   * Track response times
   */
  trackResponseTime(responseTime) {
    this.responseTimes.push(responseTime);
    
    if (this.responseTimes.length > this.maxResponseTimeHistory) {
      this.responseTimes.shift();
    }
    
    // Update average response time
    this.metrics.avgResponseTime = this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
  }

  /**
   * Update performance metrics
   */
  updateMetrics() {
    this.metrics.totalOperations = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRate = this.metrics.totalOperations > 0 ? 
      (this.metrics.hits / this.metrics.totalOperations) * 100 : 0;
  }

  /**
   * Collect additional metrics
   */
  async collectMetrics() {
    try {
      const client = this.getClient();
      if (!client) {
        return;
      }

      const info = await client.info('memory');
      const memoryInfo = this.parseRedisInfo(info);
      
      this.metrics.memoryUsage = parseInt(memoryInfo.used_memory) || 0;
      this.metrics.peakMemoryUsage = parseInt(memoryInfo.used_memory_peak) || 0;
      this.metrics.connectedClients = parseInt(memoryInfo.connected_clients) || 0;
      
      this.emit('metrics', this.metrics);
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Parse Redis INFO response
   */
  parseRedisInfo(info) {
    const lines = info.split('\r\n');
    const parsed = {};

    for (const line of lines) {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          parsed[key] = value;
        }
      }
    }

    return parsed;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      ...this.metrics,
      clientCount: this.clients.size,
      pipelineQueueLength: this.pipelineQueue.length
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const client = this.getClient();
      if (!client) {
        return {
          status: 'unhealthy',
          error: 'No Redis client available',
          timestamp: new Date().toISOString()
        };
      }

      const start = Date.now();
      await client.ping();
      const responseTime = Date.now() - start;

      const info = await client.info('memory');
      const memoryInfo = this.parseRedisInfo(info);

      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        responseTime,
        memory: {
          used: memoryInfo.used_memory_human,
          peak: memoryInfo.used_memory_peak_human,
          rss: memoryInfo.used_memory_rss_human
        },
        clients: {
          connected: memoryInfo.connected_clients
        },
        metrics: this.getStats()
      };

      // Check health indicators
      if (responseTime > 1000) {
        health.status = 'degraded';
        health.warnings = [`High response time: ${responseTime}ms`];
      }

      if (this.metrics.hitRate < 50) {
        health.status = 'degraded';
        health.warnings = health.warnings || [];
        health.warnings.push(`Low hit rate: ${this.metrics.hitRate.toFixed(2)}%`);
      }

      return health;
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Debug logging
   */
  debugLog(message, data = null) {
    if (this.config.debug) {
      console.log(`[RedisCache] ${message}`, data || '');
    }
  }

  /**
   * Close all Redis connections
   */
  async close() {
    // Flush any pending pipeline operations
    if (this.pipelineQueue.length > 0) {
      await this.flushPipeline();
    }

    // Clear metrics timer
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }

    // Close all clients
    const closePromises = Array.from(this.clients.entries()).map(async ([name, client]) => {
      try {
        await client.quit();
        this.debugLog(`Redis ${name} client closed`);
      } catch (error) {
        this.debugLog(`Error closing Redis ${name} client:`, error);
      }
    });

    await Promise.all(closePromises);
    this.clients.clear();
    this.emit('close');
    this.debugLog('Redis cache closed');
  }
}

module.exports = RedisCache;