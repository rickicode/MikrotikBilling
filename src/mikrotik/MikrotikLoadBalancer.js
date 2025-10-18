/**
 * Mikrotik Load Balancer
 *
 * Features:
 * - Multiple load balancing algorithms
 * - Weighted distribution
 * - Geographic routing
 * - Health-aware routing
 * - Performance-based routing
 * - Session affinity
 * - Capacity management
 * - Real-time adaptation
 */

const { EventEmitter } = require('events');
const { LRUCache } = require('../services/LRUCache');

class MikrotikLoadBalancer extends EventEmitter {
    constructor(config, dependencies = {}) {
        super();

        this.config = {
            // Load balancing algorithm
            algorithm: 'round-robin', // round-robin, weighted, least-connections, response-time, geographic, hash

            // Health and performance thresholds
            healthThreshold: 0.8, // Minimum health score
            maxResponseTime: 5000, // Maximum acceptable response time (ms)
            maxConnections: 100, // Maximum connections per device

            // Geographic routing
            enableGeoRouting: false,
            defaultRegion: 'global',
            regions: new Map(), // region -> [deviceIds]

            // Session affinity
            enableAffinity: false,
            affinityTimeout: 3600000, // 1 hour
            affinityKey: 'session', // session, user, ip, custom

            // Performance monitoring
            enablePerformanceRouting: true,
            performanceWindow: 300000, // 5 minutes
            weightDecayFactor: 0.1,

            // Capacity management
            enableCapacityManagement: true,
            capacityThreshold: 0.8, // 80% capacity triggers load shedding

            // Adaptation
            enableAdaptiveRouting: true,
            adaptationInterval: 60000, // 1 minute

            ...config
        };

        this.dependencies = {
            failover: null,
            healthMonitor: null,
            eventBus: null,
            logger: console,
            ...dependencies
        };

        // Device registry
        this.devices = new Map(); // deviceId -> device config
        this.deviceGroups = new Map(); // groupId -> [deviceIds]
        this.regionalDevices = new Map(); // region -> [deviceIds]

        // Load balancing state
        this.roundRobinIndex = 0;
        this.connectionCounts = new Map(); // deviceId -> connection count
        this.responseTimeHistory = new Map(); // deviceId -> [responseTimes]
        this.healthScores = new Map(); // deviceId -> health score (0-1)
        this.deviceWeights = new Map(); // deviceId -> weight

        // Session affinity
        this.affinityMap = new LRUCache(10000); // key -> deviceId
        this.affinityTimestamps = new Map(); // key -> timestamp

        // Performance metrics
        this.performanceMetrics = new Map(); // deviceId -> metrics
        this.lastAdaptation = Date.now();

        // Statistics
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            requestsByAlgorithm: new Map(),
            requestsByDevice: new Map(),
            requestsByRegion: new Map(),
            averageResponseTime: 0,
            adaptationCount: 0
        };

        this.setupEventHandlers();
    }

    /**
     * Initialize load balancer
     */
    async initialize() {
        const { logger } = this.dependencies;

        try {
            logger.info('Initializing Mikrotik Load Balancer...');

            // Start adaptation loop
            if (this.config.enableAdaptiveRouting) {
                this.startAdaptationLoop();
            }

            // Setup affinity cleanup
            if (this.config.enableAffinity) {
                this.startAffinityCleanup();
            }

            logger.info('Mikrotik Load Balancer initialized successfully');

        } catch (error) {
            logger.error('Failed to initialize load balancer:', error);
            throw error;
        }
    }

    /**
     * Add device to load balancer
     */
    addDevice(deviceConfig) {
        const { deviceId, host, port, weight = 1, region = 'default', group = 'default', enabled = true } = deviceConfig;
        const { logger } = this.dependencies;

        try {
            logger.info(`Adding device ${deviceId} to load balancer`);

            // Store device configuration
            this.devices.set(deviceId, {
                ...deviceConfig,
                status: 'initializing',
                addedAt: Date.now(),
                lastUsed: Date.now()
            });

            // Initialize device metrics
            this.connectionCounts.set(deviceId, 0);
            this.responseTimeHistory.set(deviceId, []);
            this.healthScores.set(deviceId, 1.0);
            this.deviceWeights.set(deviceId, weight);
            this.performanceMetrics.set(deviceId, {
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,
                totalResponseTime: 0,
                averageResponseTime: 0,
                lastRequest: null,
                errors: []
            });

            // Add to device group
            if (!this.deviceGroups.has(group)) {
                this.deviceGroups.set(group, []);
            }
            this.deviceGroups.get(group).push(deviceId);

            // Add to regional mapping
            if (!this.regionalDevices.has(region)) {
                this.regionalDevices.set(region, []);
            }
            this.regionalDevices.get(region).push(deviceId);

            // Initialize request tracking
            this.stats.requestsByDevice.set(deviceId, 0);

            logger.info(`Device ${deviceId} added to load balancer (group: ${group}, region: ${region})`);

            // Emit device added event
            this.emit('deviceAdded', { deviceId, deviceConfig });

        } catch (error) {
            logger.error(`Failed to add device ${deviceId}:`, error);
            throw error;
        }
    }

    /**
     * Remove device from load balancer
     */
    removeDevice(deviceId) {
        const { logger } = this.dependencies;

        try {
            const device = this.devices.get(deviceId);
            if (!device) {
                throw new Error(`Device ${deviceId} not found`);
            }

            logger.info(`Removing device ${deviceId} from load balancer`);

            // Remove from registry
            this.devices.delete(deviceId);

            // Remove from group
            const groupDevices = this.deviceGroups.get(device.group);
            if (groupDevices) {
                const index = groupDevices.indexOf(deviceId);
                if (index > -1) {
                    groupDevices.splice(index, 1);
                }
            }

            // Remove from region
            const regionDevices = this.regionalDevices.get(device.region);
            if (regionDevices) {
                const index = regionDevices.indexOf(deviceId);
                if (index > -1) {
                    regionDevices.splice(index, 1);
                }
            }

            // Clean up metrics
            this.connectionCounts.delete(deviceId);
            this.responseTimeHistory.delete(deviceId);
            this.healthScores.delete(deviceId);
            this.deviceWeights.delete(deviceId);
            this.performanceMetrics.delete(deviceId);
            this.stats.requestsByDevice.delete(deviceId);

            // Clean up affinity mappings
            for (const [key, affinityDeviceId] of this.affinityMap.entries()) {
                if (affinityDeviceId === deviceId) {
                    this.affinityMap.delete(key);
                    this.affinityTimestamps.delete(key);
                }
            }

            logger.info(`Device ${deviceId} removed from load balancer`);

            // Emit device removed event
            this.emit('deviceRemoved', { deviceId });

        } catch (error) {
            logger.error(`Failed to remove device ${deviceId}:`, error);
            throw error;
        }
    }

    /**
     * Select device for request
     */
    selectDevice(options = {}) {
        const {
            algorithm = this.config.algorithm,
            region,
            group,
            affinityKey,
            sessionId,
            userId,
            clientIp,
            userAgent,
            excludeDevices = [],
            includeDevices = null
        } = options;

        const { logger } = this.dependencies;

        try {
            // Increment request counter
            this.stats.totalRequests++;

            // Check session affinity
            if (this.config.enableAffinity && affinityKey) {
                const affinityDeviceId = this.getAffinityDevice(affinityKey);
                if (affinityDeviceId && this.isDeviceAvailable(affinityDeviceId, excludeDevices)) {
                    this.updateDeviceMetrics(affinityDeviceId);
                    this.updateStats(algorithm, affinityDeviceId, region);
                    return affinityDeviceId;
                }
            }

            // Get candidate devices
            const candidates = this.getCandidateDevices(region, group, includeDevices, excludeDevices);

            if (candidates.length === 0) {
                throw new Error('No available devices');
            }

            // Select device using algorithm
            let selectedDeviceId;

            switch (algorithm) {
                case 'round-robin':
                    selectedDeviceId = this.selectRoundRobin(candidates);
                    break;

                case 'weighted':
                    selectedDeviceId = this.selectWeighted(candidates);
                    break;

                case 'least-connections':
                    selectedDeviceId = this.selectLeastConnections(candidates);
                    break;

                case 'response-time':
                    selectedDeviceId = this.selectByResponseTime(candidates);
                    break;

                case 'geographic':
                    selectedDeviceId = this.selectGeographic(candidates, region, clientIp);
                    break;

                case 'hash':
                    selectedDeviceId = this.selectByHash(candidates, affinityKey || sessionId || clientIp);
                    break;

                default:
                    selectedDeviceId = this.selectRoundRobin(candidates);
            }

            if (!selectedDeviceId) {
                throw new Error('Failed to select device');
            }

            // Update session affinity
            if (this.config.enableAffinity && affinityKey) {
                this.setAffinity(affinityKey, selectedDeviceId);
            }

            // Update metrics
            this.updateDeviceMetrics(selectedDeviceId);
            this.updateStats(algorithm, selectedDeviceId, region);

            logger.debug(`Selected device ${selectedDeviceId} using ${algorithm} algorithm`);

            return selectedDeviceId;

        } catch (error) {
            this.stats.failedRequests++;
            logger.error('Device selection failed:', error);
            throw error;
        }
    }

    /**
     * Get candidate devices
     */
    getCandidateDevices(region, group, includeDevices, excludeDevices) {
        let candidates = [];

        // Filter by include list if specified
        if (includeDevices) {
            candidates = includeDevices.filter(deviceId => this.devices.has(deviceId));
        } else {
            candidates = Array.from(this.devices.keys());
        }

        // Filter by group
        if (group) {
            const groupDevices = this.deviceGroups.get(group) || [];
            candidates = candidates.filter(deviceId => groupDevices.includes(deviceId));
        }

        // Filter by region
        if (region && this.config.enableGeoRouting) {
            const regionDevices = this.regionalDevices.get(region) || [];
            candidates = candidates.filter(deviceId => regionDevices.includes(deviceId));
        }

        // Filter by availability
        candidates = candidates.filter(deviceId => this.isDeviceAvailable(deviceId, excludeDevices));

        return candidates;
    }

    /**
     * Check if device is available
     */
    isDeviceAvailable(deviceId, excludeDevices = []) {
        const device = this.devices.get(deviceId);
        const healthScore = this.healthScores.get(deviceId);
        const connectionCount = this.connectionCounts.get(deviceId);

        if (!device || !device.enabled) {
            return false;
        }

        if (excludeDevices.includes(deviceId)) {
            return false;
        }

        if (healthScore < this.config.healthThreshold) {
            return false;
        }

        if (connectionCount >= this.config.maxConnections) {
            return false;
        }

        const metrics = this.performanceMetrics.get(deviceId);
        if (metrics && metrics.averageResponseTime > this.config.maxResponseTime) {
            return false;
        }

        return true;
    }

    /**
     * Round-robin selection
     */
    selectRoundRobin(candidates) {
        if (candidates.length === 0) {
            return null;
        }

        const device = candidates[this.roundRobinIndex % candidates.length];
        this.roundRobinIndex++;
        return device;
    }

    /**
     * Weighted selection
     */
    selectWeighted(candidates) {
        if (candidates.length === 0) {
            return null;
        }

        // Calculate total weight
        let totalWeight = 0;
        const weightedCandidates = [];

        for (const deviceId of candidates) {
            const baseWeight = this.deviceWeights.get(deviceId) || 1;
            const healthScore = this.healthScores.get(deviceId) || 1;
            const performanceWeight = this.getPerformanceWeight(deviceId);
            const finalWeight = baseWeight * healthScore * performanceWeight;

            totalWeight += finalWeight;
            weightedCandidates.push({ deviceId, weight: finalWeight });
        }

        if (totalWeight === 0) {
            return candidates[0];
        }

        // Random selection based on weights
        const random = Math.random() * totalWeight;
        let currentWeight = 0;

        for (const { deviceId, weight } of weightedCandidates) {
            currentWeight += weight;
            if (random <= currentWeight) {
                return deviceId;
            }
        }

        return candidates[candidates.length - 1];
    }

    /**
     * Least connections selection
     */
    selectLeastConnections(candidates) {
        if (candidates.length === 0) {
            return null;
        }

        let selectedDevice = candidates[0];
        let minConnections = this.connectionCounts.get(selectedDevice) || 0;

        for (const deviceId of candidates) {
            const connections = this.connectionCounts.get(deviceId) || 0;
            if (connections < minConnections) {
                minConnections = connections;
                selectedDevice = deviceId;
            }
        }

        return selectedDevice;
    }

    /**
     * Response time based selection
     */
    selectByResponseTime(candidates) {
        if (candidates.length === 0) {
            return null;
        }

        let selectedDevice = candidates[0];
        let minResponseTime = this.getAverageResponseTime(selectedDevice);

        for (const deviceId of candidates) {
            const responseTime = this.getAverageResponseTime(deviceId);
            if (responseTime < minResponseTime) {
                minResponseTime = responseTime;
                selectedDevice = deviceId;
            }
        }

        return selectedDevice;
    }

    /**
     * Geographic selection
     */
    selectGeographic(candidates, preferredRegion, clientIp) {
        if (candidates.length === 0) {
            return null;
        }

        // Try to find device in preferred region
        if (preferredRegion) {
            const regionDevices = this.regionalDevices.get(preferredRegion) || [];
            const availableRegionDevices = candidates.filter(deviceId =>
                regionDevices.includes(deviceId) && this.isDeviceAvailable(deviceId)
            );

            if (availableRegionDevices.length > 0) {
                return this.selectWeighted(availableRegionDevices);
            }
        }

        // Fallback to weighted selection
        return this.selectWeighted(candidates);
    }

    /**
     * Hash-based selection
     */
    selectByHash(candidates, hashKey) {
        if (candidates.length === 0 || !hashKey) {
            return this.selectRoundRobin(candidates);
        }

        // Create hash from key
        const hash = this.createHash(hashKey);
        const index = Math.abs(hash) % candidates.length;

        return candidates[index];
    }

    /**
     * Create hash for consistent selection
     */
    createHash(key) {
        let hash = 0;
        const str = String(key);

        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }

        return hash;
    }

    /**
     * Get performance weight for device
     */
    getPerformanceWeight(deviceId) {
        const metrics = this.performanceMetrics.get(deviceId);
        if (!metrics) {
            return 1.0;
        }

        // Calculate performance score based on success rate and response time
        const successRate = metrics.totalRequests > 0
            ? metrics.successfulRequests / metrics.totalRequests
            : 1.0;

        const responseTimeScore = metrics.averageResponseTime > 0
            ? Math.max(0.1, 1.0 - (metrics.averageResponseTime / this.config.maxResponseTime))
            : 1.0;

        return successRate * responseTimeScore;
    }

    /**
     * Get average response time for device
     */
    getAverageResponseTime(deviceId) {
        const metrics = this.performanceMetrics.get(deviceId);
        return metrics ? metrics.averageResponseTime : 0;
    }

    /**
     * Update device metrics
     */
    updateDeviceMetrics(deviceId) {
        const connectionCount = this.connectionCounts.get(deviceId) || 0;
        this.connectionCounts.set(deviceId, connectionCount + 1);

        const device = this.devices.get(deviceId);
        if (device) {
            device.lastUsed = Date.now();
        }

        const stats = this.stats.requestsByDevice.get(deviceId) || 0;
        this.stats.requestsByDevice.set(deviceId, stats + 1);
    }

    /**
     * Record request completion
     */
    recordRequestCompletion(deviceId, responseTime, success = true) {
        const { logger } = this.dependencies;

        try {
            // Decrease connection count
            const connectionCount = this.connectionCounts.get(deviceId) || 1;
            this.connectionCounts.set(deviceId, Math.max(0, connectionCount - 1));

            // Update response time history
            const history = this.responseTimeHistory.get(deviceId) || [];
            history.push(responseTime);

            // Keep only recent history (within performance window)
            const cutoff = Date.now() - this.config.performanceWindow;
            const filteredHistory = history.filter(time => time > cutoff);
            this.responseTimeHistory.set(deviceId, filteredHistory);

            // Update performance metrics
            const metrics = this.performanceMetrics.get(deviceId);
            if (metrics) {
                metrics.totalRequests++;
                metrics.lastRequest = Date.now();

                if (success) {
                    metrics.successfulRequests++;
                } else {
                    metrics.failedRequests++;
                    metrics.errors.push({
                        timestamp: Date.now(),
                        responseTime
                    });

                    // Keep only recent errors
                    metrics.errors = metrics.errors.slice(-10);
                }

                // Update average response time
                const totalResponseTime = metrics.totalResponseTime + responseTime;
                const totalCompleted = metrics.successfulRequests + metrics.failedRequests;
                metrics.averageResponseTime = totalResponseTime / totalCompleted;
                metrics.totalResponseTime = totalResponseTime;
            }

            // Update global stats
            if (success) {
                this.stats.successfulRequests++;
            } else {
                this.stats.failedRequests++;
            }

            // Update global average response time
            const globalTotalTime = this.stats.averageResponseTime * (this.stats.successfulRequests + this.stats.failedRequests - 1) + responseTime;
            const globalTotalRequests = this.stats.successfulRequests + this.stats.failedRequests;
            this.stats.averageResponseTime = globalTotalTime / globalTotalRequests;

            logger.debug(`Recorded request completion for device ${deviceId}: ${responseTime}ms, success: ${success}`);

        } catch (error) {
            logger.error(`Failed to record request completion for device ${deviceId}:`, error);
        }
    }

    /**
     * Update device health score
     */
    updateDeviceHealth(deviceId, healthScore) {
        const { logger } = this.dependencies;

        const oldScore = this.healthScores.get(deviceId) || 1.0;
        this.healthScores.set(deviceId, Math.max(0, Math.min(1, healthScore)));

        logger.debug(`Updated health score for device ${deviceId}: ${oldScore} -> ${healthScore}`);

        // Emit health update event
        this.emit('deviceHealthUpdate', { deviceId, oldScore, newScore: healthScore });
    }

    /**
     * Get affinity device
     */
    getAffinityDevice(key) {
        const timestamp = this.affinityTimestamps.get(key);
        if (!timestamp) {
            return null;
        }

        // Check if affinity has expired
        if (Date.now() - timestamp > this.config.affinityTimeout) {
            this.affinityMap.delete(key);
            this.affinityTimestamps.delete(key);
            return null;
        }

        return this.affinityMap.get(key);
    }

    /**
     * Set affinity
     */
    setAffinity(key, deviceId) {
        this.affinityMap.set(key, deviceId);
        this.affinityTimestamps.set(key, Date.now());
    }

    /**
     * Update statistics
     */
    updateStats(algorithm, deviceId, region) {
        // Update algorithm stats
        const algorithmStats = this.stats.requestsByAlgorithm.get(algorithm) || 0;
        this.stats.requestsByAlgorithm.set(algorithm, algorithmStats + 1);

        // Update region stats
        if (region) {
            const regionStats = this.stats.requestsByRegion.get(region) || 0;
            this.stats.requestsByRegion.set(region, regionStats + 1);
        }
    }

    /**
     * Start adaptation loop
     */
    startAdaptationLoop() {
        const { logger } = this.dependencies;

        setInterval(() => {
            this.performAdaptation();
        }, this.config.adaptationInterval);

        logger.debug('Started adaptation loop');
    }

    /**
     * Perform adaptive routing adjustments
     */
    performAdaptation() {
        const { logger } = this.dependencies;

        try {
            logger.debug('Performing load balancer adaptation');

            // Update device weights based on performance
            this.updateDeviceWeights();

            // Adjust health scores
            this.adjustHealthScores();

            // Clean up old metrics
            this.cleanupOldMetrics();

            this.stats.adaptationCount++;
            this.lastAdaptation = Date.now();

            logger.debug('Load balancer adaptation completed');

        } catch (error) {
            logger.error('Adaptation failed:', error);
        }
    }

    /**
     * Update device weights based on performance
     */
    updateDeviceWeights() {
        for (const deviceId of this.devices.keys()) {
            const performanceWeight = this.getPerformanceWeight(deviceId);
            const currentWeight = this.deviceWeights.get(deviceId) || 1;

            // Gradually adjust weight based on performance
            const newWeight = currentWeight * (1 - this.config.weightDecayFactor) +
                             performanceWeight * this.config.weightDecayFactor;

            this.deviceWeights.set(deviceId, Math.max(0.1, newWeight));
        }
    }

    /**
     * Adjust health scores based on recent performance
     */
    adjustHealthScores() {
        for (const deviceId of this.devices.keys()) {
            const metrics = this.performanceMetrics.get(deviceId);
            if (!metrics || metrics.totalRequests < 10) {
                continue; // Not enough data
            }

            const successRate = metrics.successfulRequests / metrics.totalRequests;
            const responseTimeScore = Math.max(0, 1.0 - (metrics.averageResponseTime / this.config.maxResponseTime));
            const errorRate = metrics.errors.length / metrics.totalRequests;

            // Calculate health score
            const healthScore = (successRate * 0.6) + (responseTimeScore * 0.3) + ((1 - errorRate) * 0.1);

            this.updateDeviceHealth(deviceId, healthScore);
        }
    }

    /**
     * Clean up old metrics
     */
    cleanupOldMetrics() {
        const cutoff = Date.now() - this.config.performanceWindow;

        for (const [deviceId, history] of this.responseTimeHistory) {
            const filteredHistory = history.filter(time => time > cutoff);
            this.responseTimeHistory.set(deviceId, filteredHistory);
        }

        for (const [deviceId, metrics] of this.performanceMetrics) {
            metrics.errors = metrics.errors.filter(error => error.timestamp > cutoff);
        }
    }

    /**
     * Start affinity cleanup
     */
    startAffinityCleanup() {
        const { logger } = this.dependencies;

        setInterval(() => {
            this.cleanupExpiredAffinity();
        }, this.config.affinityTimeout / 4);

        logger.debug('Started affinity cleanup');
    }

    /**
     * Clean up expired affinity mappings
     */
    cleanupExpiredAffinity() {
        const now = Date.now();
        const expiredKeys = [];

        for (const [key, timestamp] of this.affinityTimestamps) {
            if (now - timestamp > this.config.affinityTimeout) {
                expiredKeys.push(key);
            }
        }

        for (const key of expiredKeys) {
            this.affinityMap.delete(key);
            this.affinityTimestamps.delete(key);
        }
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        const { healthMonitor } = this.dependencies;

        if (healthMonitor) {
            healthMonitor.on('healthUpdate', (deviceId, healthData) => {
                this.updateDeviceHealth(deviceId, healthData.score);
            });

            healthMonitor.on('deviceOffline', (deviceId) => {
                this.updateDeviceHealth(deviceId, 0);
            });

            healthMonitor.on('deviceOnline', (deviceId) => {
                this.updateDeviceHealth(deviceId, 1.0);
            });
        }
    }

    /**
     * Get all devices
     */
    getAllDevices() {
        return Array.from(this.devices.values());
    }

    /**
     * Get devices by group
     */
    getDevicesByGroup(group) {
        const deviceIds = this.deviceGroups.get(group) || [];
        return deviceIds.map(deviceId => this.devices.get(deviceId)).filter(Boolean);
    }

    /**
     * Get devices by region
     */
    getDevicesByRegion(region) {
        const deviceIds = this.regionalDevices.get(region) || [];
        return deviceIds.map(deviceId => this.devices.get(deviceId)).filter(Boolean);
    }

    /**
     * Get load balancer statistics
     */
    getStats() {
        const deviceStats = {};

        for (const [deviceId, metrics] of this.performanceMetrics) {
            const device = this.devices.get(deviceId);
            deviceStats[deviceId] = {
                ...device,
                metrics,
                connections: this.connectionCounts.get(deviceId) || 0,
                healthScore: this.healthScores.get(deviceId) || 1.0,
                weight: this.deviceWeights.get(deviceId) || 1,
                averageResponseTime: this.getAverageResponseTime(deviceId),
                responseTimeHistory: this.responseTimeHistory.get(deviceId)?.length || 0
            };
        }

        return {
            global: this.stats,
            devices: deviceStats,
            groups: Object.fromEntries(this.deviceGroups),
            regions: Object.fromEntries(this.regionalDevices),
            affinityMappings: this.affinityMap.size,
            lastAdaptation: this.lastAdaptation
        };
    }

    /**
     * Get device health status
     */
    getDeviceHealth(deviceId) {
        return {
            deviceId,
            healthScore: this.healthScores.get(deviceId) || 0,
            connections: this.connectionCounts.get(deviceId) || 0,
            averageResponseTime: this.getAverageResponseTime(deviceId),
            lastUsed: this.devices.get(deviceId)?.lastUsed,
            errors: this.performanceMetrics.get(deviceId)?.errors || []
        };
    }

    /**
     * Shutdown load balancer
     */
    async shutdown() {
        const { logger } = this.dependencies;

        logger.info('Shutting down Mikrotik Load Balancer...');

        // Clear all data structures
        this.devices.clear();
        this.deviceGroups.clear();
        this.regionalDevices.clear();
        this.connectionCounts.clear();
        this.responseTimeHistory.clear();
        this.healthScores.clear();
        this.deviceWeights.clear();
        this.performanceMetrics.clear();
        this.affinityMap.clear();
        this.affinityTimestamps.clear();

        logger.info('Load Balancer shutdown complete');
    }
}

module.exports = { MikrotikLoadBalancer };