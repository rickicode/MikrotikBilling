/**
 * High-Level Mikrotik Service Layer
 *
 * This service provides a high-level interface for interacting with Mikrotik devices,
 * abstracting away the complexity of connection management, load balancing, failover,
 * caching, and other enterprise features.
 */

const { EventEmitter } = require('events');
const { CommandBuilder, DataParser, ValidationHelper, MikrotikUtils, MikrotikError } = require('../utils/mikrotik-helpers');

class MikrotikService extends EventEmitter {
    constructor(connectionPool, options = {}) {
        super();

        this.connectionPool = connectionPool;
        this.options = {
            enableCaching: true,
            enableMetrics: true,
            enableRetry: true,
            maxRetries: 3,
            retryDelay: 1000,
            timeout: 30000,
            enableLogging: true,
            logLevel: 'info',
            enableEvents: true,
            ...options
        };

        this.dependencies = {
            eventBus: options.eventBus,
            logger: options.logger || console,
            cache: options.cache,
            ...options
        };

        // Service state
        this.isInitialized = false;
        this.devices = new Map(); // deviceId -> device info
        this.deviceGroups = new Map(); // groupId -> [deviceIds]

        // Metrics
        this.metrics = {
            totalCommands: 0,
            successfulCommands: 0,
            failedCommands: 0,
            averageResponseTime: 0,
            responseTimes: [],
            commandCounts: new Map(),
            errorCounts: new Map(),
            lastCommandTime: null,
            uptime: Date.now()
        };

        // Cache for frequently accessed data
        this.cache = {
            interfaces: new Map(),
            users: new Map(),
            queues: new Map(),
            profiles: new Map(),
            lastUpdate: new Map()
        };

        // Event listeners
        this.setupEventListeners();
    }

    /**
     * Initialize the service
     */
    async initialize() {
        const { logger } = this.dependencies;

        try {
            logger.info('Initializing Mikrotik Service...');

            // Load device configurations
            await this.loadDevices();

            // Start background tasks
            this.startBackgroundTasks();

            this.isInitialized = true;

            logger.info('Mikrotik Service initialized successfully');

            // Emit initialization event
            this.emit('initialized', {
                timestamp: Date.now()
            });

        } catch (error) {
            logger.error('Failed to initialize Mikrotik Service:', error);
            throw error;
        }
    }

    /**
     * Execute a command on a device
     */
    async executeCommand(deviceId, command, options = {}) {
        const startTime = Date.now();
        const { logger } = this.dependencies;

        try {
            // Validate command
            const validation = ValidationHelper.validateCommand(command);
            if (!validation.isValid) {
                throw new MikrotikError(validation.error, 'INVALID_COMMAND');
            }

            // Check cache for read commands
            if (this.options.enableCaching && this.isCacheableCommand(command)) {
                const cached = await this.getCachedData(deviceId, command);
                if (cached) {
                    logger.debug(`Cache hit for command on device ${deviceId}`);
                    return cached;
                }
            }

            // Execute command through connection pool
            const result = await this.connectionPool.executeCommand(deviceId, command, {
                timeout: options.timeout || this.options.timeout,
                retry: options.retry !== false && this.options.enableRetry,
                cache: options.cache
            });

            // Parse response
            const parsed = this.parseResponse(command, result);

            // Update cache
            if (this.options.enableCaching && this.isCacheableCommand(command)) {
                await this.setCachedData(deviceId, command, parsed);
            }

            // Update metrics
            const responseTime = Date.now() - startTime;
            this.updateMetrics(command, true, responseTime);

            logger.debug(`Command executed successfully on device ${deviceId} in ${responseTime}ms`);

            // Emit success event
            this.emit('commandExecuted', {
                deviceId,
                command,
                result: parsed,
                responseTime,
                timestamp: Date.now()
            });

            return parsed;

        } catch (error) {
            const responseTime = Date.now() - startTime;
            this.updateMetrics(command, false, responseTime);

            logger.error(`Command failed on device ${deviceId}:`, error);

            // Emit error event
            this.emit('commandFailed', {
                deviceId,
                command,
                error: error.message,
                responseTime,
                timestamp: Date.now()
            });

            throw error;
        }
    }

    /**
     * Execute batch commands on a device
     */
    async executeBatch(deviceId, commands, options = {}) {
        const { logger } = this.dependencies;

        try {
            logger.debug(`Executing batch of ${commands.length} commands on device ${deviceId}`);

            const results = await this.connectionPool.executeBatch(deviceId, commands, {
                timeout: options.timeout || this.options.timeout,
                batchSize: options.batchSize
            });

            // Parse each result
            const parsedResults = results.map((result, index) => {
                try {
                    return this.parseResponse(commands[index], result);
                } catch (error) {
                    return { error: error.message, command: commands[index] };
                }
            });

            // Count successful/failed commands
            const successful = parsedResults.filter(r => !r.error).length;
            const failed = parsedResults.filter(r => r.error).length;

            logger.debug(`Batch execution completed: ${successful} successful, ${failed} failed`);

            // Emit batch completed event
            this.emit('batchCompleted', {
                deviceId,
                commandCount: commands.length,
                successful,
                failed,
                results: parsedResults,
                timestamp: Date.now()
            });

            return parsedResults;

        } catch (error) {
            logger.error(`Batch execution failed on device ${deviceId}:`, error);
            throw error;
        }
    }

    /**
     * Execute command on all devices
     */
    async executeOnAllDevices(command, options = {}) {
        const { logger } = this.dependencies;

        const deviceIds = Array.from(this.devices.keys());
        const results = new Map();

        logger.debug(`Executing command on all ${deviceIds.length} devices`);

        const promises = deviceIds.map(async (deviceId) => {
            try {
                const result = await this.executeCommand(deviceId, command, options);
                results.set(deviceId, { success: true, result });
            } catch (error) {
                results.set(deviceId, { success: false, error: error.message });
            }
        });

        await Promise.all(promises);

        const successful = Array.from(results.values()).filter(r => r.success).length;
        const failed = Array.from(results.values()).filter(r => !r.success).length;

        logger.debug(`Command executed on all devices: ${successful} successful, ${failed} failed`);

        return results;
    }

    /**
     * Get device status
     */
    async getDeviceStatus(deviceId) {
        const { logger } = this.dependencies;

        try {
            // Get basic device info
            const resourceData = await this.executeCommand(deviceId, {
                command: '/system/resource/print'
            });

            // Get interface status
            const interfaceData = await this.executeCommand(deviceId, {
                command: '/interface/print'
            });

            // Get active users
            const userData = await this.executeCommand(deviceId, {
                command: '/user/active/print'
            });

            const status = {
                deviceId,
                timestamp: Date.now(),
                resource: DataParser.parseSystemResource(resourceData),
                interfaces: DataParser.parseInterfaces(interfaceData),
                activeUsers: DataParser.parseActiveUsers(userData),
                connectionPool: await this.connectionPool.getConnectionStats(deviceId),
                health: await this.connectionPool.getHealthStatus(deviceId)
            };

            // Emit status retrieved event
            this.emit('deviceStatusRetrieved', {
                deviceId,
                status,
                timestamp: Date.now()
            });

            return status;

        } catch (error) {
            logger.error(`Failed to get device status for ${deviceId}:`, error);
            throw error;
        }
    }

    /**
     * Get all devices
     */
    async getAllDevices() {
        const devices = [];

        for (const [deviceId, deviceInfo] of this.devices) {
            try {
                const status = await this.getDeviceStatus(deviceId);
                devices.push({
                    ...deviceInfo,
                    status
                });
            } catch (error) {
                devices.push({
                    ...deviceInfo,
                    status: { error: error.message, online: false }
                });
            }
        }

        return devices;
    }

    /**
     * Get interfaces from device
     */
    async getInterfaces(deviceId, useCache = true) {
        const cacheKey = `${deviceId}:interfaces`;
        const now = Date.now();

        // Check cache
        if (useCache && this.cache.interfaces.has(cacheKey)) {
            const cached = this.cache.interfaces.get(cacheKey);
            if (now - cached.timestamp < 60000) { // 1 minute cache
                return cached.data;
            }
        }

        try {
            const data = await this.executeCommand(deviceId, {
                command: '/interface/print'
            });

            const interfaces = DataParser.parseInterfaces(data);

            // Update cache
            this.cache.interfaces.set(cacheKey, {
                data: interfaces,
                timestamp: now
            });

            return interfaces;

        } catch (error) {
            this.dependencies.logger.error(`Failed to get interfaces from device ${deviceId}:`, error);
            throw error;
        }
    }

    /**
     * Get active users from device
     */
    async getActiveUsers(deviceId, useCache = false) { // Don't cache by default due to frequent changes
        const cacheKey = `${deviceId}:activeUsers`;
        const now = Date.now();

        // Check cache (very short cache)
        if (useCache && this.cache.users.has(cacheKey)) {
            const cached = this.cache.users.get(cacheKey);
            if (now - cached.timestamp < 10000) { // 10 second cache
                return cached.data;
            }
        }

        try {
            const data = await this.executeCommand(deviceId, {
                command: '/user/active/print'
            });

            const users = DataParser.parseActiveUsers(data);

            // Update cache
            this.cache.users.set(cacheKey, {
                data: users,
                timestamp: now
            });

            return users;

        } catch (error) {
            this.dependencies.logger.error(`Failed to get active users from device ${deviceId}:`, error);
            throw error;
        }
    }

    /**
     * Get queues from device
     */
    async getQueues(deviceId, useCache = true) {
        const cacheKey = `${deviceId}:queues`;
        const now = Date.now();

        // Check cache
        if (useCache && this.cache.queues.has(cacheKey)) {
            const cached = this.cache.queues.get(cacheKey);
            if (now - cached.timestamp < 30000) { // 30 second cache
                return cached.data;
            }
        }

        try {
            const data = await this.executeCommand(deviceId, {
                command: '/queue/simple/print'
            });

            const queues = DataParser.parseQueues(data);

            // Update cache
            this.cache.queues.set(cacheKey, {
                data: queues,
                timestamp: now
            });

            return queues;

        } catch (error) {
            this.dependencies.logger.error(`Failed to get queues from device ${deviceId}:`, error);
            throw error;
        }
    }

    /**
     * Create voucher hotspot user
     */
    async createVoucher(voucherData, options = {}) {
        const {
            deviceId,
            username,
            password,
            profile,
            priceSell,
            validUntil,
            comment = null
        } = voucherData;

        const { logger } = this.dependencies;

        try {
            // Create comment with voucher metadata
            const voucherComment = comment || DataParser.createVoucherComment(
                priceSell,
                null, // first login timestamp
                validUntil
            );

            // Create hotspot user
            const command = CommandBuilder.createHotspotUserCommand({
                username,
                password,
                profile,
                comment: voucherComment
            });

            const result = await this.executeCommand(deviceId, command, {
                timeout: options.timeout || 15000
            });

            logger.info(`Created voucher user ${username} on device ${deviceId}`);

            // Emit voucher created event
            this.emit('voucherCreated', {
                deviceId,
                username,
                profile,
                priceSell,
                validUntil,
                timestamp: Date.now()
            });

            return {
                success: true,
                username,
                password,
                profile,
                validUntil,
                comment: voucherComment
            };

        } catch (error) {
            logger.error(`Failed to create voucher on device ${deviceId}:`, error);
            throw error;
        }
    }

    /**
     * Create PPPoE user
     */
    async createPPPoEUser(userData, options = {}) {
        const {
            deviceId,
            username,
            password,
            profile,
            customerId,
            subscriptionId,
            localAddress,
            remoteAddress,
            comment = null
        } = userData;

        const { logger } = this.dependencies;

        try {
            // Create comment with PPPoE metadata
            const pppoeComment = comment || DataParser.createPPPoEComment(
                customerId,
                subscriptionId
            );

            // Create PPPoE secret
            const command = CommandBuilder.createPPPoESecretCommand({
                username,
                password,
                profile,
                localAddress,
                remoteAddress,
                comment: pppoeComment
            });

            const result = await this.executeCommand(deviceId, command, {
                timeout: options.timeout || 15000
            });

            logger.info(`Created PPPoE user ${username} on device ${deviceId}`);

            // Emit PPPoE user created event
            this.emit('pppoeUserCreated', {
                deviceId,
                username,
                profile,
                customerId,
                subscriptionId,
                timestamp: Date.now()
            });

            return {
                success: true,
                username,
                password,
                profile,
                customerId,
                subscriptionId,
                comment: pppoeComment
            };

        } catch (error) {
            logger.error(`Failed to create PPPoE user on device ${deviceId}:`, error);
            throw error;
        }
    }

    /**
     * Create queue
     */
    async createQueue(queueData, options = {}) {
        const {
            deviceId,
            name,
            target,
            maxLimit,
            parent,
            priority,
            comment
        } = queueData;

        const { logger } = this.dependencies;

        try {
            const command = CommandBuilder.createQueueCommand({
                name,
                target,
                maxLimit,
                parent,
                priority,
                comment
            });

            const result = await this.executeCommand(deviceId, command, {
                timeout: options.timeout || 10000
            });

            // Invalidate cache
            this.cache.queues.delete(`${deviceId}:queues`);

            logger.info(`Created queue ${name} on device ${deviceId}`);

            // Emit queue created event
            this.emit('queueCreated', {
                deviceId,
                name,
                target,
                maxLimit,
                timestamp: Date.now()
            });

            return {
                success: true,
                name,
                target,
                maxLimit
            };

        } catch (error) {
            logger.error(`Failed to create queue on device ${deviceId}:`, error);
            throw error;
        }
    }

    /**
     * Disconnect user session
     */
    async disconnectUser(deviceId, userId) {
        const { logger } = this.dependencies;

        try {
            const command = CommandBuilder.buildCommand('/user/active/remove', {
                '.id': userId
            });

            await this.executeCommand(deviceId, command);

            // Invalidate cache
            this.cache.users.delete(`${deviceId}:activeUsers`);

            logger.info(`Disconnected user ${userId} on device ${deviceId}`);

            // Emit user disconnected event
            this.emit('userDisconnected', {
                deviceId,
                userId,
                timestamp: Date.now()
            });

            return { success: true };

        } catch (error) {
            logger.error(`Failed to disconnect user ${userId} on device ${deviceId}:`, error);
            throw error;
        }
    }

    /**
     * Get user sessions
     */
    async getUserSessions(deviceId, filters = {}) {
        const { logger } = this.dependencies;

        try {
            let command = '/user/active/print';

            // Add filters if provided
            if (Object.keys(filters).length > 0) {
                command = CommandBuilder.buildPrintCommand('/user/active', filters);
            }

            const data = await this.executeCommand(deviceId, { command });
            const sessions = DataParser.parseActiveUsers(data);

            return sessions;

        } catch (error) {
            logger.error(`Failed to get user sessions from device ${deviceId}:`, error);
            throw error;
        }
    }

    /**
     * Get user statistics
     */
    async getUserStats(deviceId, timeRange = '1h') {
        const { logger } = this.dependencies;

        try {
            // Get active users
            const activeUsers = await this.getActiveUsers(deviceId, false);

            // Calculate statistics
            const totalUsers = activeUsers.length;
            const totalBytesIn = activeUsers.reduce((sum, user) => sum + user.bytesIn, 0);
            const totalBytesOut = activeUsers.reduce((sum, user) => sum + user.bytesOut, 0);
            const totalBytes = totalBytesIn + totalBytesOut;

            const stats = {
                deviceId,
                timestamp: Date.now(),
                timeRange,
                totalUsers,
                totalBytes,
                totalBytesIn,
                totalBytesOut,
                averageBytesPerUser: totalUsers > 0 ? Math.round(totalBytes / totalUsers) : 0,
                users: activeUsers.map(user => ({
                    name: user.name,
                    address: user.address,
                    bytesIn: user.bytesIn,
                    bytesOut: user.bytesOut,
                    uptime: user.uptime,
                    uptimeText: user.uptimeText
                }))
            };

            return stats;

        } catch (error) {
            logger.error(`Failed to get user stats from device ${deviceId}:`, error);
            throw error;
        }
    }

    /**
     * Sync profiles from device
     */
    async syncProfiles(deviceId, profileType = 'hotspot') {
        const { logger } = this.dependencies;

        try {
            let command;
            let parser;

            switch (profileType) {
                case 'hotspot':
                    command = '/ip/hotspot/user/profile/print';
                    parser = (data) => DataParser.parseResponse(data);
                    break;
                case 'pppoe':
                    command = '/ppp/profile/print';
                    parser = (data) => DataParser.parseResponse(data);
                    break;
                default:
                    throw new Error(`Unknown profile type: ${profileType}`);
            }

            const data = await this.executeCommand(deviceId, { command });
            const profiles = parser(data);

            // Filter profiles with system comments
            const systemProfiles = profiles.filter(profile => {
                return profile.comment && (
                    profile.comment.includes('VOUCHER_SYSTEM') ||
                    profile.comment.includes('PPPOE_SYSTEM')
                );
            });

            // Update cache
            this.cache.profiles.set(`${deviceId}:${profileType}`, {
                data: systemProfiles,
                timestamp: Date.now()
            });

            logger.info(`Synced ${systemProfiles.length} ${profileType} profiles from device ${deviceId}`);

            // Emit profiles synced event
            this.emit('profilesSynced', {
                deviceId,
                profileType,
                profiles: systemProfiles,
                timestamp: Date.now()
            });

            return systemProfiles;

        } catch (error) {
            logger.error(`Failed to sync profiles from device ${deviceId}:`, error);
            throw error;
        }
    }

    /**
     * Test connectivity to device
     */
    async testConnectivity(deviceId) {
        const { logger } = this.dependencies;

        try {
            const startTime = Date.now();

            // Simple command to test connectivity
            await this.executeCommand(deviceId, {
                command: '/system/resource/print'
            }, {
                timeout: 10000,
                retry: false,
                cache: false
            });

            const responseTime = Date.now() - startTime;

            logger.debug(`Connectivity test successful for device ${deviceId} (${responseTime}ms)`);

            return {
                success: true,
                deviceId,
                responseTime,
                timestamp: Date.now()
            };

        } catch (error) {
            logger.warn(`Connectivity test failed for device ${deviceId}: ${error.message}`);

            return {
                success: false,
                deviceId,
                error: error.message,
                timestamp: Date.now()
            };
        }
    }

    /**
     * Load device configurations
     */
    async loadDevices() {
        // In a real implementation, this would load from database or configuration
        // For now, we'll initialize with empty device list
        const { logger } = this.dependencies;

        logger.info('Loading device configurations...');

        // Devices would be loaded here
        // this.devices.set(deviceId, deviceConfig);

        logger.info(`Loaded ${this.devices.size} device configurations`);
    }

    /**
     * Add device to service
     */
    addDevice(deviceConfig) {
        const { deviceId, name, host, port, group = 'default' } = deviceConfig;

        this.devices.set(deviceId, {
            ...deviceConfig,
            addedAt: Date.now(),
            status: 'active'
        });

        // Add to group
        if (!this.deviceGroups.has(group)) {
            this.deviceGroups.set(group, []);
        }
        this.deviceGroups.get(group).push(deviceId);

        this.dependencies.logger.info(`Added device ${deviceId} (${name}) to service`);
    }

    /**
     * Remove device from service
     */
    removeDevice(deviceId) {
        const device = this.devices.get(deviceId);
        if (!device) {
            return false;
        }

        // Remove from group
        const group = this.deviceGroups.get(device.group);
        if (group) {
            const index = group.indexOf(deviceId);
            if (index > -1) {
                group.splice(index, 1);
            }
        }

        // Remove device
        this.devices.delete(deviceId);

        // Clear cache
        Object.keys(this.cache).forEach(cacheType => {
            const cacheKey = `${deviceId}:${cacheType}`;
            this.cache[cacheType].delete(cacheKey);
        });

        this.dependencies.logger.info(`Removed device ${deviceId} from service`);
        return true;
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const { eventBus } = this.dependencies;

        if (eventBus) {
            // Listen to connection pool events
            eventBus.on('mikrotik:connection:connected', (data) => {
                this.emit('deviceConnected', data);
            });

            eventBus.on('mikrotik:connection:disconnected', (data) => {
                this.emit('deviceDisconnected', data);
                // Clear cache for disconnected device
                this.clearDeviceCache(data.deviceId);
            });

            eventBus.on('mikrotik:health:deviceUnhealthy', (data) => {
                this.emit('deviceUnhealthy', data);
            });
        }
    }

    /**
     * Start background tasks
     */
    startBackgroundTasks() {
        // Start cache cleanup
        this.startCacheCleanup();

        // Start metrics collection
        if (this.options.enableMetrics) {
            this.startMetricsCollection();
        }
    }

    /**
     * Start cache cleanup
     */
    startCacheCleanup() {
        setInterval(() => {
            this.cleanupCache();
        }, 300000); // Every 5 minutes
    }

    /**
     * Start metrics collection
     */
    startMetricsCollection() {
        setInterval(() => {
            this.collectMetrics();
        }, 60000); // Every minute
    }

    /**
     * Check if command is cacheable
     */
    isCacheableCommand(command) {
        const cacheableCommands = ['/print'];
        const cmdStr = typeof command === 'string' ? command : command.command || '';
        return cacheableCommands.some(cacheable => cmdStr.includes(cacheable));
    }

    /**
     * Get cached data
     */
    async getCachedData(deviceId, command) {
        // Simple cache implementation
        // In a real implementation, use the cache service
        return null;
    }

    /**
     * Set cached data
     */
    async setCachedData(deviceId, command, data) {
        // Simple cache implementation
        // In a real implementation, use the cache service
    }

    /**
     * Parse response based on command
     */
    parseResponse(command, result) {
        const cmdStr = typeof command === 'string' ? command : command.command || '';

        if (cmdStr.includes('/system/resource/print')) {
            return DataParser.parseSystemResource(result);
        } else if (cmdStr.includes('/interface/print')) {
            return DataParser.parseInterfaces(result);
        } else if (cmdStr.includes('/user/active/print')) {
            return DataParser.parseActiveUsers(result);
        } else if (cmdStr.includes('/user/print')) {
            return DataParser.parseUsers(result);
        } else if (cmdStr.includes('/queue/simple/print')) {
            return DataParser.parseQueues(result);
        } else if (cmdStr.includes('/dhcp-server/lease/print')) {
            return DataParser.parseDHCPLeases(result);
        } else if (cmdStr.includes('/interface/wireless/registration-table/print')) {
            return DataParser.parseWirelessRegistrations(result);
        }

        return DataParser.parseResponse(result);
    }

    /**
     * Update metrics
     */
    updateMetrics(command, success, responseTime) {
        if (!this.options.enableMetrics) {
            return;
        }

        this.metrics.totalCommands++;

        if (success) {
            this.metrics.successfulCommands++;
        } else {
            this.metrics.failedCommands++;
        }

        // Update response times
        this.metrics.responseTimes.push(responseTime);
        if (this.metrics.responseTimes.length > 1000) {
            this.metrics.responseTimes = this.metrics.responseTimes.slice(-1000);
        }

        // Calculate average response time
        const totalTime = this.metrics.responseTimes.reduce((sum, time) => sum + time, 0);
        this.metrics.averageResponseTime = totalTime / this.metrics.responseTimes.length;

        // Update command counts
        const cmdType = typeof command === 'string' ? command.split('/')[1] : 'unknown';
        const count = this.metrics.commandCounts.get(cmdType) || 0;
        this.metrics.commandCounts.set(cmdType, count + 1);

        this.metrics.lastCommandTime = Date.now();
    }

    /**
     * Cleanup cache
     */
    cleanupCache() {
        const now = Date.now();
        const maxAge = 300000; // 5 minutes

        Object.keys(this.cache).forEach(cacheType => {
            const cache = this.cache[cacheType];
            for (const [key, value] of cache.entries()) {
                if (now - value.timestamp > maxAge) {
                    cache.delete(key);
                }
            }
        });
    }

    /**
     * Clear device cache
     */
    clearDeviceCache(deviceId) {
        Object.keys(this.cache).forEach(cacheType => {
            const cache = this.cache[cacheType];
            for (const [key] of cache.entries()) {
                if (key.startsWith(`${deviceId}:`)) {
                    cache.delete(key);
                }
            }
        });
    }

    /**
     * Collect metrics
     */
    collectMetrics() {
        const metrics = {
            ...this.metrics,
            uptime: Date.now() - this.metrics.uptime,
            deviceCount: this.devices.size,
            cacheSize: Object.values(this.cache).reduce((sum, cache) => sum + cache.size, 0)
        };

        // Emit metrics event
        this.emit('metrics', {
            metrics,
            timestamp: Date.now()
        });

        // Log metrics summary
        const { logger } = this.dependencies;
        logger.info(`Mikrotik Service metrics: ${this.metrics.totalCommands} commands, ${this.metrics.averageResponseTime.toFixed(2)}ms avg response time`);
    }

    /**
     * Get service statistics
     */
    getStats() {
        return {
            ...this.metrics,
            uptime: Date.now() - this.metrics.uptime,
            deviceCount: this.devices.size,
            deviceGroups: Object.fromEntries(this.deviceGroups),
            cacheSize: Object.values(this.cache).reduce((sum, cache) => sum + cache.size, 0),
            connectionPoolStats: this.connectionPool.getStats()
        };
    }

    /**
     * Get service health status
     */
    async getHealthStatus() {
        const deviceHealth = new Map();

        for (const deviceId of this.devices.keys()) {
            try {
                const connectivity = await this.testConnectivity(deviceId);
                deviceHealth.set(deviceId, connectivity);
            } catch (error) {
                deviceHealth.set(deviceId, {
                    success: false,
                    error: error.message
                });
            }
        }

        const onlineDevices = Array.from(deviceHealth.values()).filter(d => d.success).length;
        const totalDevices = deviceHealth.size;

        const status = onlineDevices === totalDevices ? 'healthy' :
                      onlineDevices > 0 ? 'degraded' : 'unhealthy';

        return {
            status,
            timestamp: Date.now(),
            devices: {
                total: totalDevices,
                online: onlineDevices,
                offline: totalDevices - onlineDevices
            },
            metrics: this.getStats(),
            deviceHealth: Object.fromEntries(deviceHealth)
        };
    }

    /**
     * Shutdown service
     */
    async shutdown() {
        const { logger } = this.dependencies;

        logger.info('Shutting down Mikrotik Service...');

        // Clear cache
        Object.values(this.cache).forEach(cache => cache.clear());

        // Clear metrics
        this.metrics.responseTimes = [];
        this.metrics.commandCounts.clear();
        this.metrics.errorCounts.clear();

        this.isInitialized = false;

        logger.info('Mikrotik Service shutdown complete');
    }
}

module.exports = { MikrotikService };