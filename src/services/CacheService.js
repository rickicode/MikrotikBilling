const Redis = require('ioredis');
const crypto = require('crypto');

class CacheService {
  constructor(options = {}) {
    this.options = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      db: process.env.REDIS_DB || 0,
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'mikrotik_billing:',
      defaultTTL: 300, // 5 minutes default
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      lazyConnect: true,
      ...options
    };

    this.clients = new Map();
    this.setupRedisClients();
  }

  setupRedisClients() {
    // Primary Redis client
    const primaryClient = new Redis({
      host: this.options.host,
      port: this.options.port,
      password: this.options.password,
      db: this.options.db,
      keyPrefix: this.options.keyPrefix,
      maxRetriesPerRequest: this.options.maxRetriesPerRequest,
      retryDelayOnFailover: this.options.retryDelayOnFailover,
      lazyConnect: true,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxMemoryPolicy: 'allkeys-lru'
    });

    primaryClient.on('connect', () => {
      console.log('Redis primary client connected');
    });

    primaryClient.on('error', (err) => {
      console.error('Redis primary client error:', err);
    });

    primaryClient.on('ready', () => {
      console.log('Redis primary client ready');
    });

    this.clients.set('primary', primaryClient);

    // Redis cluster client if configured
    if (process.env.REDIS_CLUSTER === 'true') {
      this.setupClusterClient();
    }

    // Redis sentinel client if configured
    if (process.env.REDIS_SENTINEL === 'true') {
      this.setupSentinelClient();
    }
  }

  setupClusterClient() {
    const nodes = (process.env.REDIS_CLUSTER_NODES || '').split(',').map(node => {
      const [host, port] = node.split(':');
      return { host: host.trim(), port: parseInt(port) || 6379 };
    });

    if (nodes.length > 0) {
      const clusterClient = new Redis.Cluster(nodes, {
        redisOptions: {
          password: this.options.password,
          maxRetriesPerRequest: this.options.maxRetriesPerRequest,
          lazyConnect: true
        },
        keyPrefix: this.options.keyPrefix
      });

      clusterClient.on('connect', () => {
        console.log('Redis cluster client connected');
      });

      clusterClient.on('error', (err) => {
        console.error('Redis cluster client error:', err);
      });

      this.clients.set('cluster', clusterClient);
    }
  }

  setupSentinelClient() {
    const sentinels = (process.env.REDIS_SENTINELS || '').split(',').map(node => {
      const [host, port] = node.split(':');
      return { host: host.trim(), port: parseInt(port) || 26379 };
    });

    if (sentinels.length > 0) {
      const sentinelClient = new Redis({
        sentinels,
        name: process.env.REDIS_SENTINEL_NAME || 'mymaster',
        password: this.options.password,
        keyPrefix: this.options.keyPrefix,
        maxRetriesPerRequest: this.options.maxRetriesPerRequest,
        lazyConnect: true
      });

      sentinelClient.on('connect', () => {
        console.log('Redis sentinel client connected');
      });

      sentinelClient.on('error', (err) => {
        console.error('Redis sentinel client error:', err);
      });

      this.clients.set('sentinel', sentinelClient);
    }
  }

  // Get primary Redis client
  getClient() {
    return this.clients.get('cluster') || this.clients.get('sentinel') || this.clients.get('primary');
  }

  // Generic cache operations
  async get(key) {
    try {
      const client = this.getClient();
      if (!client) return null;

      const value = await client.get(key);
      if (value) {
        try {
          return JSON.parse(value);
        } catch {
          return value; // Return as-is if not JSON
        }
      }
      return null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async set(key, value, ttl = this.options.defaultTTL) {
    try {
      const client = this.getClient();
      if (!client) return false;

      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
      await client.set(key, serializedValue, 'EX', ttl);
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  async del(key) {
    try {
      const client = this.getClient();
      if (!client) return false;

      await client.del(key);
      return true;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  async exists(key) {
    try {
      const client = this.getClient();
      if (!client) return false;

      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  }

  async expire(key, ttl) {
    try {
      const client = this.getClient();
      if (!client) return false;

      await client.expire(key, ttl);
      return true;
    } catch (error) {
      console.error('Cache expire error:', error);
      return false;
    }
  }

  // Hash operations
  async hget(key, field) {
    try {
      const client = this.getClient();
      if (!client) return null;

      const value = await client.hget(key, field);
      if (value) {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return null;
    } catch (error) {
      console.error('Cache hget error:', error);
      return null;
    }
  }

  async hset(key, field, value, ttl = this.options.defaultTTL) {
    try {
      const client = this.getClient();
      if (!client) return false;

      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
      await client.hset(key, field, serializedValue);

      if (ttl > 0) {
        await client.expire(key, ttl);
      }

      return true;
    } catch (error) {
      console.error('Cache hset error:', error);
      return false;
    }
  }

  async hdel(key, field) {
    try {
      const client = this.getClient();
      if (!client) return false;

      await client.hdel(key, field);
      return true;
    } catch (error) {
      console.error('Cache hdel error:', error);
      return false;
    }
  }

  async hgetall(key) {
    try {
      const client = this.getClient();
      if (!client) return {};

      const hash = await client.hgetall(key);
      const parsed = {};

      for (const [field, value] of Object.entries(hash)) {
        try {
          parsed[field] = JSON.parse(value);
        } catch {
          parsed[field] = value;
        }
      }

      return parsed;
    } catch (error) {
      console.error('Cache hgetall error:', error);
      return {};
    }
  }

  // List operations
  async lpush(key, value) {
    try {
      const client = this.getClient();
      if (!client) return false;

      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
      await client.lpush(key, serializedValue);
      return true;
    } catch (error) {
      console.error('Cache lpush error:', error);
      return false;
    }
  }

  async rpop(key) {
    try {
      const client = this.getClient();
      if (!client) return null;

      const value = await client.rpop(key);
      if (value) {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return null;
    } catch (error) {
      console.error('Cache rpop error:', error);
      return null;
    }
  }

  // Set operations (for unique lists)
  async sadd(key, value) {
    try {
      const client = this.getClient();
      if (!client) return false;

      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
      await client.sadd(key, serializedValue);
      return true;
    } catch (error) {
      console.error('Cache sadd error:', error);
      return false;
    }
  }

  async smembers(key) {
    try {
      const client = this.getClient();
      if (!client) return [];

      const members = await client.smembers(key);
      return members.map(member => {
        try {
          return JSON.parse(member);
        } catch {
          return member;
        }
      });
    } catch (error) {
      console.error('Cache smembers error:', error);
      return [];
    }
  }

  // Atomic increment
  async incr(key, ttl = this.options.defaultTTL) {
    try {
      const client = this.getClient();
      if (!client) return null;

      const result = await client.incr(key);
      if (result === 1 && ttl > 0) {
        await client.expire(key, ttl);
      }
      return result;
    } catch (error) {
      console.error('Cache incr error:', error);
      return null;
    }
  }

  // Get and set atomically
  async getSet(key, value, ttl = this.options.defaultTTL) {
    try {
      const client = this.getClient();
      if (!client) return null;

      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
      const oldValue = await client.getset(key, serializedValue);

      if (ttl > 0) {
        await client.expire(key, ttl);
      }

      if (oldValue) {
        try {
          return JSON.parse(oldValue);
        } catch {
          return oldValue;
        }
      }
      return null;
    } catch (error) {
      console.error('Cache getset error:', error);
      return null;
    }
  }

  // Cache-aside pattern implementation
  async cacheAside(key, fetchFunction, ttl = this.options.defaultTTL) {
    try {
      // Try to get from cache first
      let value = await this.get(key);

      if (value !== null) {
        return value;
      }

      // Cache miss, fetch from source
      value = await fetchFunction();

      // Cache the result
      if (value !== null && value !== undefined) {
        await this.set(key, value, ttl);
      }

      return value;
    } catch (error) {
      console.error('Cache-aside error:', error);
      throw error;
    }
  }

  // Write-through cache pattern
  async writeThrough(key, value, ttl = this.options.defaultTTL, updateFunction) {
    try {
      // Update primary storage
      if (updateFunction) {
        await updateFunction(value);
      }

      // Update cache
      await this.set(key, value, ttl);

      return true;
    } catch (error) {
      console.error('Write-through cache error:', error);
      throw error;
    }
  }

  // Write-behind cache pattern (async)
  async writeBehind(key, value, ttl = this.options.defaultTTL, updateFunction) {
    try {
      // Update cache immediately
      await this.set(key, value, ttl);

      // Queue for async update
      setTimeout(async () => {
        try {
          if (updateFunction) {
            await updateFunction(value);
          }
        } catch (error) {
          console.error('Write-behind async update error:', error);
        }
      }, 0);

      return true;
    } catch (error) {
      console.error('Write-behind cache error:', error);
      throw error;
    }
  }

  // Cache warming
  async warmCache(data, defaultTTL = this.options.defaultTTL) {
    const promises = Object.entries(data).map(async ([key, value]) => {
      try {
        await this.set(key, value, defaultTTL);
        return true;
      } catch (error) {
        console.error(`Cache warming error for key ${key}:`, error);
        return false;
      }
    });

    await Promise.all(promises);
  }

  // Cache invalidation
  async invalidatePattern(pattern) {
    try {
      const client = this.getClient();
      if (!client) return false;

      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(...keys);
      }

      return keys.length;
    } catch (error) {
      console.error('Cache invalidation error:', error);
      return 0;
    }
  }

  // Health check
  async healthCheck() {
    try {
      const client = this.getClient();
      if (!client) {
        return { status: 'unhealthy', error: 'No Redis client available' };
      }

      const start = Date.now();
      await client.ping();
      const responseTime = Date.now() - start;

      const info = await client.info('memory');
      const memoryInfo = this.parseRedisInfo(info);

      return {
        status: 'healthy',
        responseTime,
        memory: {
          used: memoryInfo.used_memory_human,
          peak: memoryInfo.used_memory_peak_human,
          rss: memoryInfo.used_memory_rss_human
        },
        clients: {
          connected: memoryInfo.connected_clients
        }
      };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  // Parse Redis INFO response
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

  // Generate cache key with namespace
  generateKey(namespace, ...parts) {
    const namespaceKey = `${namespace}:${parts.join(':')}`;
    const hash = crypto.createHash('md5').update(namespaceKey).digest('hex').substring(0, 8);
    return `${namespaceKey}:${hash}`;
  }

  // Close all Redis connections
  async close() {
    const closePromises = Array.from(this.clients.entries()).map(async ([name, client]) => {
      try {
        await client.quit();
        console.log(`Redis ${name} client closed`);
      } catch (error) {
        console.error(`Error closing Redis ${name} client:`, error);
      }
    });

    await Promise.all(closePromises);
    this.clients.clear();
  }
}

module.exports = CacheService;