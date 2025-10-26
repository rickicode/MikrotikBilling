/**
 * Cache Utility Functions and Decorators
 * Helper functions for cache operations, decorators, and common patterns
 */

const crypto = require('crypto');

/**
 * Generate cache key from various parameters
 */
function generateCacheKey(prefix, ...params) {
  const keyParts = [prefix];
  
  for (const param of params) {
    if (param === null || param === undefined) {
      keyParts.push('null');
    } else if (typeof param === 'object') {
      keyParts.push(JSON.stringify(param));
    } else {
      keyParts.push(String(param));
    }
  }
  
  return keyParts.join(':');
}

/**
 * Generate hash-based cache key
 */
function generateHashCacheKey(prefix, ...params) {
  const keyString = generateCacheKey(prefix, ...params);
  const hash = crypto.createHash('md5').update(keyString).digest('hex');
  return `${prefix}:${hash}`;
}

/**
 * Cache decorator for functions
 */
function cacheFunction(cache, ttl = 300) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function(...args) {
      const cacheKey = generateHashCacheKey(
        `${target.constructor.name}:${propertyKey}`,
        ...args
      );
      
      // Try to get from cache
      const cached = await cache.get(cacheKey);
      if (cached !== null) {
        return cached;
      }
      
      // Execute original method
      const result = await originalMethod.apply(this, args);
      
      // Cache the result
      if (result !== null && result !== undefined) {
        await cache.set(cacheKey, result, { ttl });
      }
      
      return result;
    };
    
    return descriptor;
  };
}

/**
 * Cache decorator for methods with custom key generator
 */
function cacheFunctionWithOptions(cache, options = {}) {
  const {
    ttl = 300,
    keyGenerator = null,
    condition = () => true,
    tags = []
  } = options;
  
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function(...args) {
      // Check condition
      if (!condition.apply(this, args)) {
        return await originalMethod.apply(this, args);
      }
      
      // Generate cache key
      const cacheKey = keyGenerator 
        ? keyGenerator.apply(this, [propertyKey, ...args])
        : generateHashCacheKey(`${target.constructor.name}:${propertyKey}`, ...args);
      
      // Try to get from cache
      const cached = await cache.get(cacheKey);
      if (cached !== null) {
        return cached;
      }
      
      // Execute original method
      const result = await originalMethod.apply(this, args);
      
      // Cache the result
      if (result !== null && result !== undefined) {
        await cache.set(cacheKey, result, { ttl, tags });
      }
      
      return result;
    };
    
    return descriptor;
  };
}

/**
 * Cache invalidation decorator
 */
function invalidateCache(cache, patterns = []) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function(...args) {
      // Execute original method
      const result = await originalMethod.apply(this, args);
      
      // Invalidate cache patterns
      for (const pattern of patterns) {
        if (typeof pattern === 'string') {
          await cache.invalidateByPattern(pattern);
        } else if (typeof pattern === 'function') {
          const resolvedPattern = pattern.apply(this, args);
          if (resolvedPattern) {
            await cache.invalidateByPattern(resolvedPattern);
          }
        }
      }
      
      return result;
    };
    
    return descriptor;
  };
}

/**
 * Memoization helper
 */
function memoize(fn, options = {}) {
  const {
    ttl = 300,
    maxSize = 1000,
    keyGenerator = (...args) => JSON.stringify(args)
  } = options;
  
  const cache = new Map();
  
  return async function(...args) {
    const key = keyGenerator(...args);
    
    // Check cache
    if (cache.has(key)) {
      const { value, timestamp } = cache.get(key);
      
      // Check TTL
      if (Date.now() - timestamp < ttl * 1000) {
        return value;
      }
      
      cache.delete(key);
    }
    
    // Check size limit
    if (cache.size >= maxSize) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    
    // Execute function
    const result = await fn.apply(this, args);
    
    // Cache result
    cache.set(key, {
      value: result,
      timestamp: Date.now()
    });
    
    return result;
  };
}

/**
 * Cache TTL helper functions
 */
const TTL = {
  SECONDS: (seconds) => seconds,
  MINUTES: (minutes) => minutes * 60,
  HOURS: (hours) => hours * 60 * 60,
  DAYS: (days) => days * 24 * 60 * 60,
  
  // Common TTL values
  VERY_SHORT: 60,      // 1 minute
  SHORT: 300,          // 5 minutes
  MEDIUM: 1800,        // 30 minutes
  LONG: 3600,          // 1 hour
  VERY_LONG: 86400,    // 24 hours
  
  // Default TTLs for different content types
  API_RESPONSE: 300,
  HTML_CONTENT: 1800,
  JSON_DATA: 600,
  IMAGE_CONTENT: 86400,
  STATIC_ASSETS: 86400 * 7  // 1 week
};

/**
 * Cache key patterns
 */
const PATTERNS = {
  // User-related patterns
  USER_PROFILE: (userId) => `user:profile:${userId}`,
  USER_SETTINGS: (userId) => `user:settings:${userId}`,
  USER_PERMISSIONS: (userId) => `user:permissions:${userId}`,
  
  // Customer-related patterns
  CUSTOMER: (customerId) => `customer:${customerId}`,
  CUSTOMER_LIST: (page, limit) => `customers:list:${page}:${limit}`,
  CUSTOMER_SEARCH: (query, filters) => `customers:search:${JSON.stringify({query, filters})}`,
  
  // Subscription patterns
  SUBSCRIPTION: (subscriptionId) => `subscription:${subscriptionId}`,
  CUSTOMER_SUBSCRIPTIONS: (customerId) => `customer:${customerId}:subscriptions`,
  SUBSCRIPTION_PLANS: () => `subscription:plans`,
  
  // Payment patterns
  PAYMENT: (paymentId) => `payment:${paymentId}`,
  CUSTOMER_PAYMENTS: (customerId, page) => `customer:${customerId}:payments:${page}`,
  PAYMENT_METHODS: () => `payment:methods`,
  
  // Voucher patterns
  VOUCHER: (voucherId) => `voucher:${voucherId}`,
  VOUCHER_LIST: (page, status) => `vouchers:list:${page}:${status}`,
  ACTIVE_VOUCHERS: () => `vouchers:active`,
  
  // PPPoE patterns
  PPPOE_USER: (userId) => `pppoe:user:${userId}`,
  PPPOE_PROFILES: () => `pppoe:profiles`,
  ACTIVE_PPPOE_USERS: () => `pppoe:users:active`,
  
  // Mikrotik patterns
  MIKROTIK_PROFILES: (routerId) => `mikrotik:${routerId}:profiles`,
  MIKROTIK_USERS: (routerId) => `mikrotik:${routerId}:users`,
  MIKROTIK_STATS: (routerId) => `mikrotik:${routerId}:stats`,
  
  // System patterns
  SYSTEM_SETTINGS: () => `system:settings`,
  SYSTEM_STATS: () => `system:stats`,
  SYSTEM_HEALTH: () => `system:health`,
  
  // Report patterns
  REPORT_DAILY: (date) => `report:daily:${date}`,
  REPORT_MONTHLY: (year, month) => `report:monthly:${year}:${month}`,
  REPORT_FINANCIAL: (period) => `report:financial:${period}`,
  
  // API patterns
  API_RESPONSE: (endpoint, params) => `api:${endpoint}:${JSON.stringify(params)}`,
  API_LIST: (resource, page, filters) => `api:list:${resource}:${page}:${JSON.stringify(filters)}`,
  API_SEARCH: (resource, query) => `api:search:${resource}:${JSON.stringify(query)}`
};

/**
 * Cache invalidation patterns
 */
const INVALIDATION = {
  // User invalidation
  USER_UPDATED: (userId) => [
    PATTERNS.USER_PROFILE(userId),
    PATTERNS.USER_SETTINGS(userId),
    PATTERNS.USER_PERMISSIONS(userId)
  ],
  
  // Customer invalidation
  CUSTOMER_UPDATED: (customerId) => [
    PATTERNS.CUSTOMER(customerId),
    PATTERNS.CUSTOMER_LIST('*'),
    PATTERNS.CUSTOMER_SEARCH('*'),
    PATTERNS.CUSTOMER_SUBSCRIPTIONS(customerId),
    PATTERNS.CUSTOMER_PAYMENTS(customerId, '*')
  ],
  
  // Subscription invalidation
  SUBSCRIPTION_UPDATED: (subscriptionId, customerId) => [
    PATTERNS.SUBSCRIPTION(subscriptionId),
    PATTERNS.CUSTOMER_SUBSCRIPTIONS(customerId),
    PATTERNS.SUBSCRIPTION_PLANS()
  ],
  
  // Payment invalidation
  PAYMENT_COMPLETED: (paymentId, customerId) => [
    PATTERNS.PAYMENT(paymentId),
    PATTERNS.CUSTOMER_PAYMENTS(customerId, '*'),
    PATTERNS.CUSTOMER(customerId)
  ],
  
  // Voucher invalidation
  VOUCHER_USED: (voucherId) => [
    PATTERNS.VOUCHER(voucherId),
    PATTERNS.VOUCHER_LIST('*'),
    PATTERNS.ACTIVE_VOUCHERS()
  ],
  
  // PPPoE invalidation
  PPPOE_USER_UPDATED: (userId, routerId) => [
    PATTERNS.PPPOE_USER(userId),
    PATTERNS.PPPOE_PROFILES(),
    PATTERNS.ACTIVE_PPPOE_USERS(),
    PATTERNS.MIKROTIK_USERS(routerId)
  ],
  
  // Settings invalidation
  SETTINGS_UPDATED: () => [
    PATTERNS.SYSTEM_SETTINGS(),
    PATTERNS.MIKROTIK_PROFILES('*'),
    PATTERNS.PPPOE_PROFILES(),
    PATTERNS.SUBSCRIPTION_PLANS(),
    PATTERNS.PAYMENT_METHODS()
  ],
  
  // Report invalidation
  REPORTS_INVALIDATED: () => [
    'report:*'
  ]
};

/**
 * Cache warming data sets
 */
const WARMING_DATA_SETS = [
  {
    name: 'customer_profiles',
    description: 'Active customer profiles',
    query: 'SELECT id, name, email, phone, status FROM customers WHERE status = $1',
    params: ['active'],
    keyPrefix: 'customer:profile:',
    ttl: TTL.MINUTES(30),
    tags: ['customer', 'profile']
  },
  {
    name: 'subscription_plans',
    description: 'Active subscription plans',
    query: 'SELECT * FROM subscription_plans WHERE active = true',
    keyPrefix: 'subscription:plan:',
    ttl: TTL.HOURS(2),
    tags: ['subscription', 'plans']
  },
  {
    name: 'mikrotik_profiles',
    description: 'Mikrotik profiles',
    query: 'SELECT * FROM mikrotik_profiles WHERE enabled = true',
    keyPrefix: 'mikrotik:profile:',
    ttl: TTL.MINUTES(15),
    tags: ['mikrotik', 'profiles']
  },
  {
    name: 'system_settings',
    description: 'System configuration settings',
    query: 'SELECT * FROM settings WHERE cacheable = true',
    keyPrefix: 'setting:',
    ttl: TTL.HOURS(4),
    tags: ['settings', 'config']
  },
  {
    name: 'active_vouchers',
    description: 'Active vouchers',
    query: 'SELECT id, code, price, status, expires_at FROM vouchers WHERE status = $1 AND expires_at > NOW()',
    params: ['active'],
    keyPrefix: 'voucher:active:',
    ttl: TTL.MINUTES(10),
    tags: ['voucher', 'active']
  },
  {
    name: 'pppoe_profiles',
    description: 'PPPoE profiles',
    query: 'SELECT * FROM pppoe_profiles WHERE enabled = true',
    keyPrefix: 'pppoe:profile:',
    ttl: TTL.MINUTES(30),
    tags: ['pppoe', 'profiles']
  }
];

/**
 * Cache tag groups
 */
const TAGS = {
  USER: ['user', 'profile', 'settings'],
  CUSTOMER: ['customer', 'subscriptions', 'payments'],
  SUBSCRIPTION: ['subscription', 'plans'],
  PAYMENT: ['payment', 'methods'],
  VOUCHER: ['voucher', 'hotspot'],
  PPPOE: ['pppoe', 'profiles'],
  MIKROTIK: ['mikrotik', 'profiles', 'users'],
  SYSTEM: ['settings', 'config', 'health'],
  REPORTS: ['report', 'analytics'],
  API: ['api', 'response', 'list', 'search']
};

/**
 * Rate limiting with cache
 */
class CacheRateLimiter {
  constructor(cache, options = {}) {
    this.cache = cache;
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.maxRequests = options.maxRequests || 100;
    this.keyGenerator = options.keyGenerator || this.defaultKeyGenerator;
  }

  defaultKeyGenerator(request) {
    const ip = request.ip || request.headers['x-forwarded-for'] || 'unknown';
    return `ratelimit:${ip}`;
  }

  async isAllowed(request) {
    const key = this.keyGenerator(request);
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get current requests
    const requests = await this.cache.get(key) || [];
    
    // Filter old requests
    const recentRequests = requests.filter(timestamp => timestamp > windowStart);
    
    // Check if over limit
    if (recentRequests.length >= this.maxRequests) {
      return false;
    }

    // Add current request
    recentRequests.push(now);
    
    // Update cache
    await this.cache.set(key, recentRequests, {
      ttl: Math.ceil(this.windowMs / 1000)
    });

    return true;
  }

  async getRemainingRequests(request) {
    const key = this.keyGenerator(request);
    const now = Date.now();
    const windowStart = now - this.windowMs;

    const requests = await this.cache.get(key) || [];
    const recentRequests = requests.filter(timestamp => timestamp > windowStart);

    return Math.max(0, this.maxRequests - recentRequests.length);
  }

  async resetLimit(request) {
    const key = this.keyGenerator(request);
    await this.cache.delete(key);
  }
}

/**
 * Cache warming helper
 */
class CacheWarmerHelper {
  constructor(cache, db) {
    this.cache = cache;
    this.db = db;
  }

  async warmDataSet(dataSet) {
    try {
      const { query, params = [], keyPrefix, ttl, tags } = dataSet;
      
      // Execute query
      const result = await this.db.query(query, params);
      const records = result.rows || result;
      
      // Cache each record
      for (const record of records) {
        const key = `${keyPrefix}${record.id || record.id}`;
        await this.cache.set(key, record, { ttl, tags });
      }
      
      return records.length;
    } catch (error) {
      console.error(`Error warming data set ${dataSet.name}:`, error);
      return 0;
    }
  }

  async warmMultipleDataSets(dataSets) {
    const results = {
      total: dataSets.length,
      successful: 0,
      failed: 0,
      recordsWarmed: 0
    };

    for (const dataSet of dataSets) {
      try {
        const recordsWarmed = await this.warmDataSet(dataSet);
        results.successful++;
        results.recordsWarmed += recordsWarmed;
      } catch (error) {
        results.failed++;
        console.error(`Failed to warm data set ${dataSet.name}:`, error);
      }
    }

    return results;
  }
}

/**
 * Cache health checker
 */
class CacheHealthChecker {
  constructor(cacheManager) {
    this.cacheManager = cacheManager;
  }

  async performHealthCheck() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {},
      overall: {}
    };

    try {
      // Test cache get/set
      const testKey = `health:check:${Date.now()}`;
      const testValue = { test: true, timestamp: Date.now() };
      
      await this.cacheManager.set(testKey, testValue, { ttl: 60 });
      const retrieved = await this.cacheManager.get(testKey);
      
      health.checks.basic = {
        status: retrieved && retrieved.test === true ? 'pass' : 'fail',
        responseTime: Date.now() - testValue.timestamp
      };
      
      // Clean up test key
      await this.cacheManager.delete(testKey);

      // Get cache statistics
      const stats = this.cacheManager.getStats();
      health.overall = {
        hitRate: stats.manager?.hitRate || 0,
        totalOperations: stats.manager?.totalOperations || 0,
        avgResponseTime: stats.manager?.avgResponseTime || 0
      };

      // Determine overall status
      const failedChecks = Object.values(health.checks).filter(check => check.status === 'fail');
      if (failedChecks.length > 0) {
        health.status = 'degraded';
      }

      if (health.overall.hitRate < 30 || health.overall.avgResponseTime > 500) {
        health.status = 'degraded';
      }

      if (health.overall.hitRate < 10 || health.overall.avgResponseTime > 1000) {
        health.status = 'unhealthy';
      }

    } catch (error) {
      health.status = 'unhealthy';
      health.error = error.message;
    }

    return health;
  }
}

module.exports = {
  // Key generation
  generateCacheKey,
  generateHashCacheKey,
  
  // Decorators
  cacheFunction,
  cacheFunctionWithOptions,
  invalidateCache,
  memoize,
  
  // Constants
  TTL,
  PATTERNS,
  INVALIDATION,
  TAGS,
  WARMING_DATA_SETS,
  
  // Helpers
  CacheRateLimiter,
  CacheWarmerHelper,
  CacheHealthChecker
};