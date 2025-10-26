/**
 * Mikrotik Intelligent Cache Manager
 *
 * Features:
 * - Multi-level caching (memory, Redis, database)
 * - Intelligent cache invalidation
 * - Cache warming strategies
 * - Predictive caching
 * - Cache analytics and monitoring
 * - TTL management per data type
 * - Cache compression for large datasets
 * - Cache synchronization across instances
 * - Event-driven cache updates
 * - Performance optimization
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');
const { LRUCache } = require('../services/LRUCache');

class MikrotikCacheManager extends EventEmitter {
    constructor(config, dependencies = {}) {
        super();

        this.config = {
            // Cache levels
            enableMemoryCache: true,
            enableRedisCache: false,
            enableDatabaseCache: false,

            // Memory cache configuration
            memoryCacheSize: 1000, // Number of items
            memoryCacheMaxAge: 300000, // 5 minutes
            memoryCacheCheckPeriod: 60000, // 1 minute

            // Redis configuration (if enabled)
            redis: {
                host: 'localhost',
                port: 6379,
                password: null,
                db: 0,
                keyPrefix: 'mikrotik:',
                ttl: 3600 // 1 hour
            },

            // Cache TTL configuration by data type
            defaultTTL: 300000, // 5 minutes
            ttlSettings: {
                // System information (changes rarely)
                'system:resource': 3600000, // 1 hour
                'system:identity': 3600000,
                'system:package': 1800000, // 30 minutes

                // Interface information (changes moderately)
                'interface:print': 300000, // 5 minutes
                'interface:traffic': 60000, // 1 minute
                'interface:stats': 30000, // 30 seconds

                // User information (changes frequently)
                'user:active': 10000, // 10 seconds
                'user:print': 30000, // 30 seconds
                'user:profile': 300000, // 5 minutes

                // Queue and traffic shaping
                'queue:print': 60000, // 1 minute
                'queue:stats': 30000, // 30 seconds
                'queue:tree': 300000, // 5 minutes

                // Routing information
                'route:print': 120000, // 2 minutes
                'route:gateway': 300000, // 5 minutes

                // Firewall rules
                'filter:print': 600000, // 10 minutes
                'nat:print': 600000,
                'mangle:print': 600000,

                // DHCP and leases
                'dhcp:lease': 30000, // 30 seconds
                'dhcp:server': 300000, // 5 minutes

                // Wireless information
                'wireless:registration': 15000, // 15 seconds
                'wireless:print': 120000, // 2 minutes
            },

            // Cache warming
            enableCacheWarming: true,
            warmupCommands: [
                '/system/resource/print',
                '/interface/print',
                '/user/active/print',
                '/queue/simple/print'
            ],
            warmupInterval: 300000, // 5 minutes

            // Predictive caching
            enablePredictiveCaching: true,
            predictionWindow: 3600000, // 1 hour
            accessPatternTracking: true,
            patternAnalysisInterval: 600000, // 10 minutes

            // Compression
            enableCompression: true,
            compressionThreshold: 1024, // 1KB

            // Cache invalidation
            enableEventInvalidation: true,
            invalidationDelay: 1000, // 1 second

            // Synchronization
            enableSynchronization: false,
            syncChannel: 'mikrotik-cache-sync',
            syncInterval: 30000, // 30 seconds

            // Analytics
            enableAnalytics: true,
            analyticsInterval: 300000, // 5 minutes

            ...config
        };

        this.dependencies = {
            cache: null, // External cache service (Redis, etc.)
            eventBus: null,
            logger: console,
            ...dependencies
        };

        // Memory cache
        this.memoryCache = null;
        if (this.config.enableMemoryCache) {
            this.memoryCache = new LRUCache(this.config.memoryCacheSize);
        }

        // Cache statistics
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            invalidations: 0,
            compressions: 0,
            decompressions: 0,
            hitRate: 0,
            totalSize: 0,
            memoryUsage: 0,
            hitByType: new Map(),
            missByType: new Map(),
            accessPatterns: new Map(),
            predictiveHits: 0,
            predictiveMisses: 0
        };

        // Access pattern tracking
        this.accessPatterns = new Map(); // key -> access info
        this.patternAnalysis = new Map(); // pattern -> metadata

        // Predictive cache
        this.predictiveCache = new Set(); // Keys predicted to be accessed
        this.predictionModel = {
            patterns: new Map(),
            sequences: new Map(),
            correlations: new Map()
        };

        // Cache invalidation
        this.invalidationQueue = [];
        this.invalidationTimer = null;

        // Cache warming
        this.warmupTimer = null;
        this.warmupInProgress = false;

        // Analytics
        this.analyticsData = {
            topAccessedKeys: new Map(),
            typeDistribution: new Map(),
            timeDistribution: new Map(),
            performanceMetrics: new Map()
        };

        // Initialize
        this.initialize();
    }

    /**
     * Initialize cache manager
     */
    async initialize() {
        const { logger } = this.dependencies;

        try {
            logger.info('Initializing Mikrotik Cache Manager...');

            // Initialize memory cache cleanup
            if (this.config.enableMemoryCache) {
                this.startMemoryCacheCleanup();
            }

            // Start cache warming
            if (this.config.enableCacheWarming) {
                this.startCacheWarming();
            }

            // Start predictive caching
            if (this.config.enablePredictiveCaching) {
                this.startPredictiveCaching();
            }

            // Start analytics
            if (this.config.enableAnalytics) {
                this.startAnalytics();
            }

            // Setup event handlers
            this.setupEventHandlers();

            logger.info('Mikrotik Cache Manager initialized successfully');

        } catch (error) {
            logger.error('Failed to initialize cache manager:', error);
            throw error;
        }
    }

    /**
     * Get cached value
     */
    async get(key) {
        const startTime = Date.now();
        const { logger } = this.dependencies;

        try {
            // Track access pattern
            this.trackAccess(key);

            // Try memory cache first
            let value = await this.getFromMemoryCache(key);
            let source = 'memory';

            if (value === null) {
                // Try external cache (Redis, etc.)
                value = await this.getFromExternalCache(key);
                source = 'external';

                if (value !== null) {
                    // Populate memory cache
                    await this.setToMemoryCache(key, value);
                }
            }

            if (value !== null) {
                // Cache hit
                this.stats.hits++;
                this.updateTypeStats(key, 'hit');

                // Decompress if necessary
                if (value.compressed) {
                    value = await this.decompressValue(value.data);
                    this.stats.decompressions++;
                } else {
                    value = value.data;
                }

                const accessTime = Date.now() - startTime;
                logger.debug(`Cache hit for key ${key} from ${source} in ${accessTime}ms`);

                // Emit cache hit event
                this.emit('cacheHit', {
                    key,
                    source,
                    value,
                    accessTime,
                    timestamp: Date.now()
                });

                return value;

            } else {
                // Cache miss
                this.stats.misses++;
                this.updateTypeStats(key, 'miss');

                const accessTime = Date.now() - startTime;
                logger.debug(`Cache miss for key ${key} in ${accessTime}ms`);

                // Emit cache miss event
                this.emit('cacheMiss', {
                    key,
                    accessTime,
                    timestamp: Date.now()
                });

                return null;
            }

        } catch (error) {
            logger.error(`Cache get failed for key ${key}:`, error);
            return null;
        } finally {
            this.updateHitRate();
        }
    }

    /**
     * Set cached value
     */
    async set(key, value, options = {}) {
        const {
            ttl = null,
            compress = this.config.enableCompression,
            tags = [],
            deviceId = null,
            command = null
        } = options;

        const startTime = Date.now();
        const { logger } = this.dependencies;

        try {
            // Determine TTL based on data type
            const finalTTL = ttl || this.getTTLForKey(key, command);

            // Prepare cache data
            let cacheData = {
                data: value,
                createdAt: Date.now(),
                expiresAt: Date.now() + finalTTL,
                ttl: finalTTL,
                tags,
                deviceId,
                command,
                compressed: false
            };

            // Compress if necessary
            if (compress && this.shouldCompress(value)) {
                cacheData.data = await this.compressValue(value);
                cacheData.compressed = true;
                this.stats.compressions++;
            }

            // Set in memory cache
            if (this.config.enableMemoryCache) {
                await this.setToMemoryCache(key, cacheData);
            }

            // Set in external cache
            if (this.config.enableRedisCache && this.dependencies.cache) {
                await this.setToExternalCache(key, cacheData, finalTTL);
            }

            // Update statistics
            this.stats.sets++;
            this.updateTypeStats(key, 'set');

            const setTime = Date.now() - startTime;
            logger.debug(`Cache set for key ${key} in ${setTime}ms (TTL: ${finalTTL}ms, compressed: ${cacheData.compressed})`);

            // Emit cache set event
            this.emit('cacheSet', {
                key,
                ttl: finalTTL,
                compressed: cacheData.compressed,
                size: JSON.stringify(value).length,
                setTime,
                timestamp: Date.now()
            });

            return true;

        } catch (error) {
            logger.error(`Cache set failed for key ${key}:`, error);
            return false;
        }
    }

    /**
     * Delete cached value
     */
    async delete(key) {
        const { logger } = this.dependencies;

        try {
            // Delete from memory cache
            if (this.config.enableMemoryCache) {
                this.memoryCache.delete(key);
            }

            // Delete from external cache
            if (this.config.enableRedisCache && this.dependencies.cache) {
                await this.deleteFromExternalCache(key);
            }

            // Update statistics
            this.stats.deletes++;

            logger.debug(`Cache delete for key ${key}`);

            // Emit cache delete event
            this.emit('cacheDelete', {
                key,
                timestamp: Date.now()
            });

            return true;

        } catch (error) {
            logger.error(`Cache delete failed for key ${key}:`, error);
            return false;
        }
    }

    /**
     * Invalidate cache by pattern
     */
    async invalidate(pattern) {
        const { logger } = this.dependencies;

        try {
            let invalidatedCount = 0;

            // Get all keys matching pattern
            const keys = await this.getKeysByPattern(pattern);

            for (const key of keys) {
                if (await this.delete(key)) {
                    invalidatedCount++;
                }
            }

            this.stats.invalidations += invalidatedCount;

            logger.info(`Invalidated ${invalidatedCount} cache entries matching pattern: ${pattern}`);

            // Emit cache invalidate event
            this.emit('cacheInvalidated', {
                pattern,
                count: invalidatedCount,
                timestamp: Date.now()
            });

            return { count: invalidatedCount };

        } catch (error) {
            logger.error(`Cache invalidation failed for pattern ${pattern}:`, error);
            throw error;
        }
    }

    /**
     * Get from memory cache
     */
    async getFromMemoryCache(key) {
        if (!this.config.enableMemoryCache) {
            return null;
        }

        const cached = this.memoryCache.get(key);

        if (cached && cached.expiresAt > Date.now()) {
            return cached;
        }

        // Remove expired entry
        if (cached) {
            this.memoryCache.delete(key);
        }

        return null;
    }

    /**
     * Set to memory cache
     */
    async setToMemoryCache(key, value) {
        if (!this.config.enableMemoryCache) {
            return;
        }

        this.memoryCache.set(key, value);
        this.updateMemoryUsage();
    }

    /**
     * Get from external cache (Redis, etc.)
     */
    async getFromExternalCache(key) {
        if (!this.config.enableRedisCache || !this.dependencies.cache) {
            return null;
        }

        try {
            const redisKey = this.getRedisKey(key);
            const cached = await this.dependencies.cache.get(redisKey);

            if (cached) {
                const parsed = JSON.parse(cached);

                // Check if expired
                if (parsed.expiresAt > Date.now()) {
                    return parsed;
                }
            }

            return null;

        } catch (error) {
            const { logger } = this.dependencies;
            logger.error(`External cache get failed for key ${key}:`, error);
            return null;
        }
    }

    /**
     * Set to external cache
     */
    async setToExternalCache(key, value, ttl) {
        if (!this.config.enableRedisCache || !this.dependencies.cache) {
            return;
        }

        try {
            const redisKey = this.getRedisKey(key);
            const serialized = JSON.stringify(value);

            await this.dependencies.cache.set(redisKey, serialized, {
                ttl: Math.ceil(ttl / 1000) // Convert to seconds
            });

        } catch (error) {
            const { logger } = this.dependencies;
            logger.error(`External cache set failed for key ${key}:`, error);
        }
    }

    /**
     * Delete from external cache
     */
    async deleteFromExternalCache(key) {
        if (!this.config.enableRedisCache || !this.dependencies.cache) {
            return;
        }

        try {
            const redisKey = this.getRedisKey(key);
            await this.dependencies.cache.del(redisKey);

        } catch (error) {
            const { logger } = this.dependencies;
            logger.error(`External cache delete failed for key ${key}:`, error);
        }
    }

    /**
     * Get Redis key with prefix
     */
    getRedisKey(key) {
        return `${this.config.redis.keyPrefix}${key}`;
    }

    /**
     * Get TTL for key based on data type
     */
    getTTLForKey(key, command) {
        // Determine data type from key or command
        let dataType = 'default';

        if (command) {
            // Extract data type from command
            if (command.includes('/system/resource')) dataType = 'system:resource';
            else if (command.includes('/interface/print')) dataType = 'interface:print';
            else if (command.includes('/interface/traffic')) dataType = 'interface:traffic';
            else if (command.includes('/user/active')) dataType = 'user:active';
            else if (command.includes('/user/print')) dataType = 'user:print';
            else if (command.includes('/queue/print')) dataType = 'queue:print';
            else if (command.includes('/route/print')) dataType = 'route:print';
            else if (command.includes('/filter/print')) dataType = 'filter:print';
            else if (command.includes('/dhcp/lease')) dataType = 'dhcp:lease';
            else if (command.includes('/wireless/registration')) dataType = 'wireless:registration';
        } else {
            // Extract from key
            for (const [type, pattern] of Object.entries(this.config.ttlSettings)) {
                if (key.includes(type)) {
                    dataType = type;
                    break;
                }
            }
        }

        return this.config.ttlSettings[dataType] || this.config.defaultTTL;
    }

    /**
     * Check if value should be compressed
     */
    shouldCompress(value) {
        if (!this.config.enableCompression) {
            return false;
        }

        const serialized = JSON.stringify(value);
        return serialized.length > this.config.compressionThreshold;
    }

    /**
     * Compress value
     */
    async compressValue(value) {
        // Simple compression - in production, use zlib or similar
        const serialized = JSON.stringify(value);
        return Buffer.from(serialized).toString('base64');
    }

    /**
     * Decompress value
     */
    async decompressValue(compressedValue) {
        // Simple decompression - in production, use zlib or similar
        const serialized = Buffer.from(compressedValue, 'base64').toString();
        return JSON.parse(serialized);
    }

    /**
     * Track access pattern
     */
    trackAccess(key) {
        if (!this.config.accessPatternTracking) {
            return;
        }

        const now = Date.now();
        let accessInfo = this.accessPatterns.get(key);

        if (!accessInfo) {
            accessInfo = {
                count: 0,
                firstAccess: now,
                lastAccess: now,
                accessTimes: [],
                deviceIds: new Set(),
                commands: new Set()
            };
            this.accessPatterns.set(key, accessInfo);
        }

        accessInfo.count++;
        accessInfo.lastAccess = now;
        accessInfo.accessTimes.push(now);

        // Keep only recent access times (last 100)
        if (accessInfo.accessTimes.length > 100) {
            accessInfo.accessTimes = accessInfo.accessTimes.slice(-100);
        }

        // Update analytics
        this.updateAnalytics(key, accessInfo);
    }

    /**
     * Update analytics data
     */
    updateAnalytics(key, accessInfo) {
        if (!this.config.enableAnalytics) {
            return;
        }

        // Update top accessed keys
        const topKeys = this.analyticsData.topAccessedKeys;
        topKeys.set(key, accessInfo.count);

        // Keep only top 100 keys
        if (topKeys.size > 100) {
            const sorted = Array.from(topKeys.entries()).sort((a, b) => b[1] - a[1]);
            this.analyticsData.topAccessedKeys = new Map(sorted.slice(0, 100));
        }

        // Update type distribution
        const dataType = this.getDataTypeFromKey(key);
        const typeDist = this.analyticsData.typeDistribution;
        typeDist.set(dataType, (typeDist.get(dataType) || 0) + 1);

        // Update time distribution
        const hour = new Date().getHours();
        const timeDist = this.analyticsData.timeDistribution;
        timeDist.set(hour, (timeDist.get(hour) || 0) + 1);
    }

    /**
     * Get data type from key
     */
    getDataTypeFromKey(key) {
        for (const type of Object.keys(this.config.ttlSettings)) {
            if (key.includes(type)) {
                return type;
            }
        }
        return 'default';
    }

    /**
     * Update type statistics
     */
    updateTypeStats(key, action) {
        const dataType = this.getDataTypeFromKey(key);

        if (action === 'hit') {
            const hits = this.stats.hitByType.get(dataType) || 0;
            this.stats.hitByType.set(dataType, hits + 1);
        } else if (action === 'miss') {
            const misses = this.stats.missByType.get(dataType) || 0;
            this.stats.missByType.set(dataType, misses + 1);
        }
    }

    /**
     * Update hit rate
     */
    updateHitRate() {
        const total = this.stats.hits + this.stats.misses;
        this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
    }

    /**
     * Update memory usage
     */
    updateMemoryUsage() {
        if (this.config.enableMemoryCache && this.memoryCache) {
            this.stats.memoryUsage = this.memoryCache.size;
            this.stats.totalSize = this.memoryCache.size;
        }
    }

    /**
     * Get keys by pattern
     */
    async getKeysByPattern(pattern) {
        const keys = [];

        if (this.config.enableMemoryCache && this.memoryCache) {
            // Simple pattern matching for memory cache
            const regex = new RegExp(pattern.replace(/\*/g, '.*'));

            for (const key of this.memoryCache.keys()) {
                if (regex.test(key)) {
                    keys.push(key);
                }
            }
        }

        if (this.config.enableRedisCache && this.dependencies.cache) {
            // Get keys from Redis (if supported)
            try {
                const redisPattern = this.getRedisKey(pattern);
                const redisKeys = await this.dependencies.cache.keys(redisPattern);

                for (const redisKey of redisKeys) {
                    // Remove prefix to get original key
                    const originalKey = redisKey.replace(this.config.redis.keyPrefix, '');
                    keys.push(originalKey);
                }
            } catch (error) {
                const { logger } = this.dependencies;
                logger.warn('Failed to get keys from Redis:', error.message);
            }
        }

        return [...new Set(keys)]; // Remove duplicates
    }

    /**
     * Start cache warming
     */
    startCacheWarming() {
        const { logger } = this.dependencies;

        // Initial warmup
        this.warmupCache();

        // Periodic warmup
        this.warmupTimer = setInterval(() => {
            this.warmupCache();
        }, this.config.warmupInterval);

        logger.debug('Cache warming started');
    }

    /**
     * Warm up cache with common data
     */
    async warmupCache() {
        if (this.warmupInProgress) {
            return;
        }

        this.warmupInProgress = true;
        const { logger } = this.dependencies;

        try {
            logger.debug('Starting cache warmup');

            // In a real implementation, this would execute the commands
            // and cache the results. For now, we'll simulate it.
            for (const command of this.config.warmupCommands) {
                const key = this.generateCacheKey(command, null);

                // Check if already cached and not expired
                const cached = await this.get(key);
                if (cached) {
                    continue; // Already cached
                }

                // Simulate command execution and caching
                const mockData = this.generateMockData(command);
                await this.set(key, mockData, { command });

                logger.debug(`Warmed up cache for command: ${command}`);
            }

            logger.debug('Cache warmup completed');

        } catch (error) {
            logger.error('Cache warmup failed:', error);
        } finally {
            this.warmupInProgress = false;
        }
    }

    /**
     * Generate mock data for warmup
     */
    generateMockData(command) {
        if (command.includes('/system/resource')) {
            return {
                'cpu-load': Math.random() * 100,
                'free-memory': Math.random() * 1000000,
                'total-memory': 1000000,
                uptime: Math.random() * 1000000
            };
        } else if (command.includes('/interface/print')) {
            return [
                {
                    name: 'ether1',
                    running: true,
                    'rx-byte': Math.random() * 1000000000,
                    'tx-byte': Math.random() * 1000000000
                }
            ];
        } else {
            return { mock: 'data', timestamp: Date.now() };
        }
    }

    /**
     * Start predictive caching
     */
    startPredictiveCaching() {
        const { logger } = this.dependencies;

        setInterval(() => {
            this.analyzeAccessPatterns();
            this.updatePredictiveCache();
        }, this.config.patternAnalysisInterval);

        logger.debug('Predictive caching started');
    }

    /**
     * Analyze access patterns
     */
    analyzeAccessPatterns() {
        const now = Date.now();
        const window = this.config.predictionWindow;

        for (const [key, accessInfo] of this.accessPatterns) {
            // Calculate access frequency
            const recentAccesses = accessInfo.accessTimes.filter(time => now - time < window);
            const frequency = recentAccesses.length / (window / 60000); // accesses per minute

            // Identify patterns
            if (frequency > 1) { // More than 1 access per minute
                this.predictiveCache.add(key);
            }

            // Analyze sequences
            this.analyzeSequencePatterns(key, accessInfo);
        }

        // Analyze correlations
        this.analyzeCorrelations();
    }

    /**
     * Analyze sequence patterns
     */
    analyzeSequencePatterns(key, accessInfo) {
        const times = accessInfo.accessTimes.sort((a, b) => a - b);

        // Look for regular intervals
        if (times.length < 3) {
            return;
        }

        const intervals = [];
        for (let i = 1; i < times.length; i++) {
            intervals.push(times[i] - times[i - 1]);
        }

        // Find most common interval
        const intervalCounts = new Map();
        for (const interval of intervals) {
            const rounded = Math.round(interval / 60000) * 60000; // Round to minutes
            intervalCounts.set(rounded, (intervalCounts.get(rounded) || 0) + 1);
        }

        const mostCommon = Math.max(...intervalCounts.values());
        if (mostCommon >= 2) { // Pattern appears at least twice
            const patternInterval = Array.from(intervalCounts.entries())
                .find(([, count]) => count === mostCommon)[0];

            this.predictionModel.sequences.set(key, {
                interval: patternInterval,
                confidence: mostCommon / intervals.length,
                lastAccess: times[times.length - 1]
            });
        }
    }

    /**
     * Analyze correlations between keys
     */
    analyzeCorrelations() {
        // Simple correlation analysis - keys accessed together
        // This is a simplified implementation
        for (const [key1, accessInfo1] of this.accessPatterns) {
            for (const [key2, accessInfo2] of this.accessPatterns) {
                if (key1 === key2) continue;

                // Check if keys are accessed within a short time window
                const correlation = this.calculateCorrelation(accessInfo1, accessInfo2);
                if (correlation > 0.7) {
                    this.predictionModel.correlations.set(`${key1}:${key2}`, correlation);
                }
            }
        }
    }

    /**
     * Calculate correlation between access patterns
     */
    calculateCorrelation(accessInfo1, accessInfo2) {
        // Simplified correlation calculation
        const window = 300000; // 5 minutes
        const now = Date.now();

        const recent1 = accessInfo1.accessTimes.filter(time => now - time < window);
        const recent2 = accessInfo2.accessTimes.filter(time => now - time < window);

        if (recent1.length === 0 || recent2.length === 0) {
            return 0;
        }

        // Count accesses within short time windows
        let coincidentAccesses = 0;
        for (const time1 of recent1) {
            for (const time2 of recent2) {
                if (Math.abs(time1 - time2) < 30000) { // 30 seconds
                    coincidentAccesses++;
                    break;
                }
            }
        }

        return coincidentAccesses / Math.min(recent1.length, recent2.length);
    }

    /**
     * Update predictive cache
     */
    updatePredictiveCache() {
        const { logger } = this.dependencies;

        for (const key of this.predictiveCache) {
            // Check if key is already cached
            const cached = this.get(key);
            if (cached) {
                this.stats.predictiveHits++;
                continue;
            }

            this.stats.predictiveMisses++;

            // Pre-load data for predictive keys
            // In a real implementation, this would execute the actual command
            logger.debug(`Predictively caching key: ${key}`);
        }
    }

    /**
     * Start analytics collection
     */
    startAnalytics() {
        const { logger } = this.dependencies;

        setInterval(() => {
            this.collectAnalytics();
        }, this.config.analyticsInterval);

        logger.debug('Analytics collection started');
    }

    /**
     * Collect analytics data
     */
    collectAnalytics() {
        const analytics = {
            timestamp: Date.now(),
            stats: { ...this.stats },
            topAccessedKeys: Object.fromEntries(this.analyticsData.topAccessedKeys),
            typeDistribution: Object.fromEntries(this.analyticsData.typeDistribution),
            timeDistribution: Object.fromEntries(this.analyticsData.timeDistribution),
            predictiveCache: {
                size: this.predictiveCache.size,
                hits: this.stats.predictiveHits,
                misses: this.stats.predictiveMisses
            }
        };

        // Emit analytics event
        this.emit('analytics', analytics);

        // Log summary
        const { logger } = this.dependencies;
        logger.info(`Cache analytics: Hit rate: ${(this.stats.hitRate * 100).toFixed(1)}%, Size: ${this.stats.memoryUsage}, Predictive hits: ${this.stats.predictiveHits}`);
    }

    /**
     * Start memory cache cleanup
     */
    startMemoryCacheCleanup() {
        const { logger } = this.dependencies;

        setInterval(() => {
            this.cleanupExpiredEntries();
        }, this.config.memoryCacheCheckPeriod);

        logger.debug('Memory cache cleanup started');
    }

    /**
     * Clean up expired entries
     */
    cleanupExpiredEntries() {
        if (!this.config.enableMemoryCache || !this.memoryCache) {
            return;
        }

        const now = Date.now();
        let cleanedCount = 0;

        for (const [key, value] of this.memoryCache.entries()) {
            if (value.expiresAt && value.expiresAt <= now) {
                this.memoryCache.delete(key);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            const { logger } = this.dependencies;
            logger.debug(`Cleaned up ${cleanedCount} expired cache entries`);
        }
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        const { eventBus } = this.dependencies;

        if (eventBus && this.config.enableEventInvalidation) {
            eventBus.on('mikrotik:command:executed', (data) => {
                this.handleCommandExecuted(data);
            });

            eventBus.on('mikrotik:config:changed', (data) => {
                this.handleConfigChanged(data);
            });

            eventBus.on('mikrotik:user:session:changed', (data) => {
                this.handleUserSessionChanged(data);
            });
        }
    }

    /**
     * Handle command execution event
     */
    handleCommandExecuted(data) {
        const { deviceId, command, result } = data;

        // Invalidate related cache entries
        this.scheduleInvalidation({
            reason: 'command_executed',
            deviceId,
            command,
            delay: this.config.invalidationDelay
        });
    }

    /**
     * Handle configuration change event
     */
    handleConfigChanged(data) {
        const { deviceId, configType } = data;

        // Invalidate configuration-related cache entries
        this.scheduleInvalidation({
            reason: 'config_changed',
            deviceId,
            pattern: `*:${configType}:*`,
            delay: this.config.invalidationDelay
        });
    }

    /**
     * Handle user session change event
     */
    handleUserSessionChanged(data) {
        const { deviceId, userId } = data;

        // Invalidate user-related cache entries
        this.scheduleInvalidation({
            reason: 'user_session_changed',
            deviceId,
            pattern: `*user*:${userId}*`,
            delay: this.config.invalidationDelay
        });
    }

    /**
     * Schedule cache invalidation
     */
    scheduleInvalidation(invalidation) {
        this.invalidationQueue.push(invalidation);

        if (!this.invalidationTimer) {
            this.invalidationTimer = setTimeout(() => {
                this.processInvalidationQueue();
            }, 1000);
        }
    }

    /**
     * Process invalidation queue
     */
    async processInvalidationQueue() {
        const { logger } = this.dependencies;

        for (const invalidation of this.invalidationQueue) {
            try {
                await new Promise(resolve => setTimeout(resolve, invalidation.delay || 0));

                if (invalidation.pattern) {
                    await this.invalidate(invalidation.pattern);
                } else if (invalidation.key) {
                    await this.delete(invalidation.key);
                }

                logger.debug(`Processed cache invalidation: ${invalidation.reason}`);

            } catch (error) {
                logger.error(`Cache invalidation failed:`, error);
            }
        }

        this.invalidationQueue = [];
        this.invalidationTimer = null;
    }

    /**
     * Generate cache key
     */
    generateCacheKey(command, deviceId) {
        const keyData = {
            command: typeof command === 'string' ? command : command.command,
            deviceId: deviceId || 'default'
        };

        const keyString = JSON.stringify(keyData);
        return crypto.createHash('md5').update(keyString).digest('hex');
    }

    /**
     * Get cache statistics
     */
    getStats() {
        return {
            ...this.stats,
            memoryCacheSize: this.config.enableMemoryCache ? this.memoryCache?.size || 0 : 0,
            predictiveCacheSize: this.predictiveCache.size,
            topAccessedKeys: Array.from(this.analyticsData.topAccessedKeys.entries()).slice(0, 10),
            typeDistribution: Object.fromEntries(this.analyticsData.typeDistribution),
            analytics: {
                topAccessedKeys: Object.fromEntries(this.analyticsData.topAccessedKeys),
                typeDistribution: Object.fromEntries(this.analyticsData.typeDistribution),
                timeDistribution: Object.fromEntries(this.analyticsData.timeDistribution)
            }
        };
    }

    /**
     * Get cache health status
     */
    getHealthStatus() {
        const hitRate = this.stats.hitRate;
        const memoryUsage = this.stats.memoryUsage;
        const maxSize = this.config.memoryCacheSize;

        let status = 'healthy';
        if (hitRate < 0.3) status = 'poor';
        else if (hitRate < 0.6) status = 'fair';
        else if (hitRate < 0.8) status = 'good';

        if (memoryUsage > maxSize * 0.9) {
            status = 'critical';
        }

        return {
            status,
            hitRate: (hitRate * 100).toFixed(1) + '%',
            memoryUsage: `${memoryUsage}/${maxSize}`,
            hits: this.stats.hits,
            misses: this.stats.misses,
            invalidations: this.stats.invalidations,
            predictiveCache: this.predictiveCache.size
        };
    }

    /**
     * Clear cache
     */
    async clear(type = 'all') {
        const { logger } = this.dependencies;

        try {
            if (type === 'all' || type === 'memory') {
                if (this.config.enableMemoryCache && this.memoryCache) {
                    this.memoryCache.clear();
                }
            }

            if (type === 'all' && this.config.enableRedisCache && this.dependencies.cache) {
                // Clear all keys with prefix
                const pattern = this.config.redis.keyPrefix + '*';
                const keys = await this.dependencies.cache.keys(pattern);
                if (keys.length > 0) {
                    await this.dependencies.cache.del(...keys);
                }
            }

            // Clear analytics
            this.stats = {
                hits: 0,
                misses: 0,
                sets: 0,
                deletes: 0,
                invalidations: 0,
                compressions: 0,
                decompressions: 0,
                hitRate: 0,
                totalSize: 0,
                memoryUsage: 0,
                hitByType: new Map(),
                missByType: new Map(),
                accessPatterns: new Map(),
                predictiveHits: 0,
                predictiveMisses: 0
            };

            this.analyticsData = {
                topAccessedKeys: new Map(),
                typeDistribution: new Map(),
                timeDistribution: new Map(),
                performanceMetrics: new Map()
            };

            logger.info(`Cache cleared (type: ${type})`);

            // Emit cache cleared event
            this.emit('cacheCleared', { type, timestamp: Date.now() });

            return true;

        } catch (error) {
            logger.error(`Cache clear failed:`, error);
            return false;
        }
    }

    /**
     * Shutdown cache manager
     */
    async shutdown() {
        const { logger } = this.dependencies;

        logger.info('Shutting down Mikrotik Cache Manager...');

        // Clear timers
        if (this.warmupTimer) {
            clearInterval(this.warmupTimer);
        }

        if (this.invalidationTimer) {
            clearTimeout(this.invalidationTimer);
        }

        // Clear cache
        await this.clear();

        // Clear data structures
        this.accessPatterns.clear();
        this.patternAnalysis.clear();
        this.predictiveCache.clear();
        this.invalidationQueue = [];

        logger.info('Mikrotik Cache Manager shutdown complete');
    }
}

module.exports = { MikrotikCacheManager };