/**
 * Enterprise Mikrotik Connection Pool Manager
 *
 * Features:
 * - Dynamic connection pool sizing
 * - Connection lifecycle management
 * - Health checks and monitoring
 * - SSL/TLS support
 * - Load balancing
 * - Circuit breaker pattern
 * - Performance metrics
 */

const { EventEmitter } = require('events');
const { MikrotikClient } = require('./MikrotikClient');
const { CircuitBreaker } = require('../services/CircuitBreaker');
const { LRUCache } = require('../services/LRUCache');

class MikrotikConnectionPool extends EventEmitter {
    constructor(config, dependencies = {}) {
        super();

        this.config = {
            // Connection pool settings
            minConnections: 2,
            maxConnections: 10,
            acquireTimeout: 30000,
            idleTimeout: 300000, // 5 minutes
            maxLifetime: 3600000, // 1 hour

            // Health check settings
            healthCheckInterval: 30000, // 30 seconds
            healthCheckTimeout: 5000,
            maxRetries: 3,
            retryDelay: 1000,

            // Performance settings
            commandTimeout: 30000,
            batchSize: 10,
            compressionThreshold: 1024,

            // SSL/TLS settings
            ssl: false,
            rejectUnauthorized: true,
            certFile: null,
            keyFile: null,
            caFile: null,

            ...config
        };

        this.dependencies = {
            securityManager: null,
            loadBalancer: null,
            cacheManager: null,
            commandQueue: null,
            healthMonitor: null,
            eventBus: null,
            logger: console,
            ...dependencies
        };

        // Connection pool state
        this.pools = new Map(); // deviceId -> connection pool
        this.devices = new Map(); // deviceId -> device config
        this.circuitBreakers = new Map(); // deviceId -> circuit breaker
        this.stats = {
            totalConnections: 0,
            activeConnections: 0,
            idleConnections: 0,
            failedConnections: 0,
            totalCommands: 0,
            successfulCommands: 0,
            failedCommands: 0,
            averageResponseTime: 0
        };

        // Response time tracking
        this.responseTimes = [];
        this.maxResponseTimeHistory = 100;

        // Health check intervals
        this.healthCheckIntervals = new Map();

        // Connection metrics
        this.connectionMetrics = new LRUCache(1000);
    }

    /**
     * Initialize connection pool
     */
    async initialize() {
        const { logger } = this.dependencies;

        try {
            logger.info('Initializing Mikrotik Connection Pool...');

            // Initialize device pools
            await this.initializeDevicePools();

            // Start health monitoring
            this.startHealthMonitoring();

            // Setup event listeners
            this.setupEventListeners();

            logger.info(`Connection Pool initialized with ${this.pools.size} device pools`);

        } catch (error) {
            logger.error('Failed to initialize connection pool:', error);
            throw error;
        }
    }

    /**
     * Initialize connection pools for all devices
     */
    async initializeDevicePools() {
        const { loadBalancer, logger } = this.dependencies;

        // Get device configurations from load balancer
        const devices = await loadBalancer.getAllDevices();

        for (const device of devices) {
            await this.createDevicePool(device);
        }

        logger.info(`Created connection pools for ${devices.length} devices`);
    }

    /**
     * Create connection pool for a specific device
     */
    async createDevicePool(deviceConfig) {
        const { deviceId, host, port, username, password, ssl, priority } = deviceConfig;
        const { logger } = this.dependencies;

        try {
            logger.info(`Creating connection pool for device ${deviceId} (${host}:${port})`);

            // Store device configuration
            this.devices.set(deviceId, {
                ...deviceConfig,
                status: 'initializing',
                lastHealthCheck: null,
                connectionCount: 0
            });

            // Create connection pool
            const pool = {
                deviceId,
                connections: [],
                waiting: [], // Waiting requests
                config: deviceConfig,
                stats: {
                    created: Date.now(),
                    totalConnections: 0,
                    activeConnections: 0,
                    idleConnections: 0,
                    failedConnections: 0,
                    totalCommands: 0,
                    successfulCommands: 0,
                    failedCommands: 0
                }
            };

            this.pools.set(deviceId, pool);

            // Create circuit breaker
            const circuitBreaker = new CircuitBreaker({
                failureThreshold: 5,
                resetTimeout: 60000,
                monitoringPeriod: 300000
            });

            circuitBreaker.on('stateChange', (oldState, newState) => {
                logger.warn(`Circuit breaker for device ${deviceId} changed from ${oldState} to ${newState}`);
                this.emit('circuitBreakerStateChange', { deviceId, oldState, newState });
            });

            this.circuitBreakers.set(deviceId, circuitBreaker);

            // Create minimum connections
            await this.createConnections(deviceId, this.config.minConnections);

            // Start health monitoring for this device
            this.startDeviceHealthMonitoring(deviceId);

            // Update device status
            this.devices.get(deviceId).status = 'online';

            logger.info(`Connection pool for device ${deviceId} created successfully`);

        } catch (error) {
            logger.error(`Failed to create connection pool for device ${deviceId}:`, error);
            this.devices.get(deviceId).status = 'error';
            throw error;
        }
    }

    /**
     * Create connections for a device
     */
    async createConnections(deviceId, count) {
        const { pool } = { pool: this.pools.get(deviceId) };
        const { logger, securityManager } = this.dependencies;
        const deviceConfig = this.devices.get(deviceId);

        if (!pool || !deviceConfig) {
            throw new Error(`Device ${deviceId} not found`);
        }

        const connections = [];

        for (let i = 0; i < count; i++) {
            try {
                // Create Mikrotik client
                const client = new MikrotikClient({
                    host: deviceConfig.host,
                    port: deviceConfig.port || 8728,
                    username: deviceConfig.username,
                    password: deviceConfig.password,
                    ssl: deviceConfig.ssl || this.config.ssl,
                    timeout: this.config.commandTimeout,
                    rejectUnauthorized: this.config.rejectUnauthorized,
                    certFile: this.config.certFile,
                    keyFile: this.config.keyFile,
                    caFile: this.config.caFile
                }, {
                    securityManager,
                    cacheManager: this.dependencies.cacheManager,
                    logger
                });

                // Connect to device
                await client.connect();

                // Create connection wrapper
                const connection = {
                    id: `${deviceId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    client,
                    created: Date.now(),
                    lastUsed: Date.now(),
                    inUse: false,
                    requestCount: 0,
                    errorCount: 0,
                    pool: deviceId
                };

                pool.connections.push(connection);
                connections.push(connection);

                // Update stats
                this.updateConnectionStats(deviceId, 'created');

                logger.debug(`Created connection ${connection.id} for device ${deviceId}`);

            } catch (error) {
                logger.error(`Failed to create connection for device ${deviceId}:`, error);
                // Continue creating other connections
            }
        }

        logger.info(`Created ${connections.length}/${count} connections for device ${deviceId}`);
        return connections;
    }

    /**
     * Acquire connection from pool
     */
    async acquireConnection(deviceId, options = {}) {
        const { timeout = this.config.acquireTimeout } = options;
        const { logger } = this.dependencies;

        return new Promise((resolve, reject) => {
            const pool = this.pools.get(deviceId);
            const circuitBreaker = this.circuitBreakers.get(deviceId);

            if (!pool) {
                return reject(new Error(`Device ${deviceId} not found`));
            }

            // Check circuit breaker
            if (circuitBreaker && circuitBreaker.isOpen()) {
                return reject(new Error(`Circuit breaker is open for device ${deviceId}`));
            }

            // Find available connection
            const connection = this.findAvailableConnection(deviceId);

            if (connection) {
                // Mark connection as in use
                connection.inUse = true;
                connection.lastUsed = Date.now();
                connection.requestCount++;

                // Update stats
                this.updateConnectionStats(deviceId, 'acquired');

                logger.debug(`Acquired connection ${connection.id} for device ${deviceId}`);
                resolve(connection);

            } else {
                // No available connection, add to waiting queue
                const request = {
                    resolve,
                    reject,
                    timestamp: Date.now(),
                    timeout: setTimeout(() => {
                        const index = pool.waiting.indexOf(request);
                        if (index > -1) {
                            pool.waiting.splice(index, 1);
                            reject(new Error(`Connection acquire timeout for device ${deviceId}`));
                        }
                    }, timeout)
                };

                pool.waiting.push(request);

                // Try to create new connection if under max limit
                if (pool.connections.length < this.config.maxConnections) {
                    this.createConnections(deviceId, 1).catch(error => {
                        logger.error(`Failed to create additional connection for device ${deviceId}:`, error);
                    });
                }

                logger.debug(`No available connections for device ${deviceId}, added to waiting queue`);
            }
        });
    }

    /**
     * Find available connection in pool
     */
    findAvailableConnection(deviceId) {
        const pool = this.pools.get(deviceId);

        if (!pool) {
            return null;
        }

        // Find idle connection
        for (const connection of pool.connections) {
            if (!connection.inUse && this.isConnectionHealthy(connection)) {
                return connection;
            }
        }

        return null;
    }

    /**
     * Check if connection is healthy
     */
    isConnectionHealthy(connection) {
        const maxIdleTime = this.config.idleTimeout;
        const maxLifetime = this.config.maxLifetime;
        const maxErrors = 5;

        const now = Date.now();
        const idleTime = now - connection.lastUsed;
        const lifetime = now - connection.created;

        // Check if connection is too old
        if (lifetime > maxLifetime) {
            return false;
        }

        // Check if connection has too many errors
        if (connection.errorCount >= maxErrors) {
            return false;
        }

        // Check if client is still connected
        return connection.client.isConnected();
    }

    /**
     * Release connection back to pool
     */
    async releaseConnection(connection) {
        const { deviceId } = connection;
        const pool = this.pools.get(deviceId);
        const { logger } = this.dependencies;

        if (!pool) {
            logger.warn(`Attempted to release connection for unknown device ${deviceId}`);
            return;
        }

        // Mark connection as not in use
        connection.inUse = false;
        connection.lastUsed = Date.now();

        // Update stats
        this.updateConnectionStats(deviceId, 'released');

        // Process waiting queue
        if (pool.waiting.length > 0) {
            const request = pool.waiting.shift();
            clearTimeout(request.timeout);

            connection.inUse = true;
            connection.lastUsed = Date.now();
            connection.requestCount++;

            request.resolve(connection);
        }

        logger.debug(`Released connection ${connection.id} for device ${deviceId}`);
    }

    /**
     * Execute command using connection pool
     */
    async executeCommand(deviceId, command, options = {}) {
        const startTime = Date.now();
        const { logger, cacheManager, commandQueue } = this.dependencies;

        try {
            logger.debug(`Executing command on device ${deviceId}:`, command);

            // Check cache first (for read commands)
            if (cacheManager && this.isCacheableCommand(command)) {
                const cacheKey = this.getCacheKey(deviceId, command);
                const cached = await cacheManager.get(cacheKey);

                if (cached) {
                    logger.debug(`Cache hit for command on device ${deviceId}`);
                    return cached;
                }
            }

            // Get circuit breaker
            const circuitBreaker = this.circuitBreakers.get(deviceId);

            // Execute command through circuit breaker
            const result = await circuitBreaker.execute(async () => {
                // Acquire connection
                const connection = await this.acquireConnection(deviceId, options);

                try {
                    // Execute command
                    const response = await connection.client.executeCommand(command, options);

                    // Cache result (for read commands)
                    if (cacheManager && this.isCacheableCommand(command)) {
                        const cacheKey = this.getCacheKey(deviceId, command);
                        const ttl = this.getCacheTTL(command);
                        await cacheManager.set(cacheKey, response, ttl);
                    }

                    return response;

                } finally {
                    // Release connection
                    await this.releaseConnection(connection);
                }
            });

            // Update metrics
            const responseTime = Date.now() - startTime;
            this.updateCommandMetrics(deviceId, true, responseTime);

            logger.debug(`Command executed successfully on device ${deviceId} in ${responseTime}ms`);
            return result;

        } catch (error) {
            const responseTime = Date.now() - startTime;
            this.updateCommandMetrics(deviceId, false, responseTime);

            logger.error(`Command failed on device ${deviceId}:`, error);

            // Add to retry queue if configured
            if (options.retry !== false && this.shouldRetryCommand(error)) {
                return this.retryCommand(deviceId, command, options);
            }

            throw error;
        }
    }

    /**
     * Execute batch commands
     */
    async executeBatch(deviceId, commands, options = {}) {
        const { logger } = this.dependencies;

        try {
            logger.debug(`Executing batch of ${commands.length} commands on device ${deviceId}`);

            // Check if batch size exceeds limit
            if (commands.length > this.config.batchSize) {
                // Split into smaller batches
                const results = [];
                for (let i = 0; i < commands.length; i += this.config.batchSize) {
                    const batch = commands.slice(i, i + this.config.batchSize);
                    const batchResult = await this.executeBatch(deviceId, batch, options);
                    results.push(...batchResult);
                }
                return results;
            }

            // Acquire connection for batch execution
            const connection = await this.acquireConnection(deviceId, options);

            try {
                // Execute batch
                const results = await connection.client.executeBatch(commands, options);

                logger.debug(`Batch executed successfully on device ${deviceId}`);
                return results;

            } finally {
                // Release connection
                await this.releaseConnection(connection);
            }

        } catch (error) {
            logger.error(`Batch execution failed on device ${deviceId}:`, error);
            throw error;
        }
    }

    /**
     * Check if command should be cached
     */
    isCacheableCommand(command) {
        const cacheableCommands = ['/print', '/interface/print', '/user/print', '/queue/print'];
        const commandPath = command.command || command;

        return cacheableCommands.some(cacheable => commandPath.startsWith(cacheable));
    }

    /**
     * Generate cache key for command
     */
    getCacheKey(deviceId, command) {
        const commandStr = typeof command === 'string' ? command : JSON.stringify(command);
        return `mikrotik:${deviceId}:${Buffer.from(commandStr).toString('base64')}`;
    }

    /**
     * Get cache TTL for command
     */
    getCacheTTL(command) {
        // Different TTL for different command types
        if (command.includes('/interface/print')) return 300000; // 5 minutes
        if (command.includes('/user/print')) return 60000; // 1 minute
        if (command.includes('/queue/print')) return 30000; // 30 seconds

        return 60000; // Default 1 minute
    }

    /**
     * Check if command should be retried
     */
    shouldRetryCommand(error) {
        const retryableErrors = [
            'timeout',
            'connection refused',
            'connection reset',
            'network unreachable'
        ];

        const errorMessage = error.message.toLowerCase();
        return retryableErrors.some(retryable => errorMessage.includes(retryable));
    }

    /**
     * Retry command with exponential backoff
     */
    async retryCommand(deviceId, command, options) {
        const { logger } = this.dependencies;
        const maxRetries = options.maxRetries || this.config.maxRetries;
        const baseDelay = options.retryDelay || this.config.retryDelay;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const delay = baseDelay * Math.pow(2, attempt - 1);
                logger.debug(`Retrying command on device ${deviceId}, attempt ${attempt}/${maxRetries} after ${delay}ms`);

                await new Promise(resolve => setTimeout(resolve, delay));

                return await this.executeCommand(deviceId, command, {
                    ...options,
                    maxRetries: 0 // Prevent infinite retries
                });

            } catch (error) {
                if (attempt === maxRetries) {
                    logger.error(`All retry attempts failed for device ${deviceId}:`, error);
                    throw error;
                }
            }
        }
    }

    /**
     * Start health monitoring
     */
    startHealthMonitoring() {
        const { healthMonitor } = this.dependencies;

        if (healthMonitor) {
            healthMonitor.on('healthStatusChange', (deviceId, status) => {
                this.handleHealthStatusChange(deviceId, status);
            });

            healthMonitor.on('deviceOffline', (deviceId) => {
                this.handleDeviceOffline(deviceId);
            });

            healthMonitor.on('deviceOnline', (deviceId) => {
                this.handleDeviceOnline(deviceId);
            });
        }
    }

    /**
     * Start health monitoring for specific device
     */
    startDeviceHealthMonitoring(deviceId) {
        const { healthCheckInterval } = this.config;

        const interval = setInterval(async () => {
            await this.performHealthCheck(deviceId);
        }, healthCheckInterval);

        this.healthCheckIntervals.set(deviceId, interval);
    }

    /**
     * Perform health check on device
     */
    async performHealthCheck(deviceId) {
        const { logger } = this.dependencies;
        const device = this.devices.get(deviceId);

        if (!device) {
            return;
        }

        try {
            // Execute simple command to check connectivity
            await this.executeCommand(deviceId, { command: '/system/resource/print' }, {
                timeout: this.config.healthCheckTimeout,
                retry: false,
                cache: false
            });

            // Update device status
            device.lastHealthCheck = Date.now();
            device.status = 'online';

            logger.debug(`Health check passed for device ${deviceId}`);

            // Emit health status event
            this.emit('deviceHealthy', { deviceId, timestamp: Date.now() });

        } catch (error) {
            logger.warn(`Health check failed for device ${deviceId}:`, error.message);

            device.status = 'unhealthy';
            device.lastHealthCheck = Date.now();

            // Emit health status event
            this.emit('deviceUnhealthy', { deviceId, error: error.message, timestamp: Date.now() });
        }
    }

    /**
     * Handle health status change
     */
    handleHealthStatusChange(deviceId, status) {
        const { logger } = this.dependencies;

        logger.info(`Device ${deviceId} health status changed to: ${status}`);

        const device = this.devices.get(deviceId);
        if (device) {
            device.status = status;
        }

        // Update circuit breaker
        const circuitBreaker = this.circuitBreakers.get(deviceId);
        if (circuitBreaker) {
            if (status === 'healthy') {
                circuitBreaker.recordSuccess();
            } else {
                circuitBreaker.recordFailure();
            }
        }
    }

    /**
     * Handle device offline
     */
    handleDeviceOffline(deviceId) {
        const { logger } = this.dependencies;

        logger.warn(`Device ${deviceId} went offline`);

        // Close all connections for this device
        const pool = this.pools.get(deviceId);
        if (pool) {
            pool.connections.forEach(connection => {
                connection.client.disconnect();
            });
            pool.connections = [];
        }

        // Update device status
        const device = this.devices.get(deviceId);
        if (device) {
            device.status = 'offline';
        }
    }

    /**
     * Handle device online
     */
    async handleDeviceOnline(deviceId) {
        const { logger } = this.dependencies;

        logger.info(`Device ${deviceId} came back online`);

        // Recreate connection pool
        const deviceConfig = this.devices.get(deviceId);
        if (deviceConfig) {
            try {
                await this.createConnections(deviceId, this.config.minConnections);
                deviceConfig.status = 'online';
            } catch (error) {
                logger.error(`Failed to recreate connections for device ${deviceId}:`, error);
            }
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const { eventBus } = this.dependencies;

        if (eventBus) {
            eventBus.on('mikrotik:device:add', (deviceConfig) => {
                this.createDevicePool(deviceConfig);
            });

            eventBus.on('mikrotik:device:remove', (deviceId) => {
                this.removeDevicePool(deviceId);
            });

            eventBus.on('mikrotik:config:update', (config) => {
                this.updateConfiguration(config);
            });
        }
    }

    /**
     * Update connection statistics
     */
    updateConnectionStats(deviceId, action) {
        const pool = this.pools.get(deviceId);
        if (!pool) return;

        switch (action) {
            case 'created':
                pool.stats.totalConnections++;
                pool.stats.idleConnections++;
                this.stats.totalConnections++;
                this.stats.idleConnections++;
                break;

            case 'acquired':
                pool.stats.activeConnections++;
                pool.stats.idleConnections--;
                this.stats.activeConnections++;
                this.stats.idleConnections--;
                break;

            case 'released':
                pool.stats.activeConnections--;
                pool.stats.idleConnections++;
                this.stats.activeConnections--;
                this.stats.idleConnections++;
                break;

            case 'failed':
                pool.stats.failedConnections++;
                this.stats.failedConnections++;
                break;
        }
    }

    /**
     * Update command metrics
     */
    updateCommandMetrics(deviceId, success, responseTime) {
        const pool = this.pools.get(deviceId);
        if (pool) {
            if (success) {
                pool.stats.successfulCommands++;
            } else {
                pool.stats.failedCommands++;
            }
            pool.stats.totalCommands++;
        }

        // Update global stats
        if (success) {
            this.stats.successfulCommands++;
        } else {
            this.stats.failedCommands++;
        }
        this.stats.totalCommands++;

        // Track response time
        this.responseTimes.push(responseTime);
        if (this.responseTimes.length > this.maxResponseTimeHistory) {
            this.responseTimes.shift();
        }

        // Calculate average response time
        this.stats.averageResponseTime = this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
    }

    /**
     * Get connection pool statistics
     */
    getStats() {
        const poolStats = {};

        for (const [deviceId, pool] of this.pools) {
            poolStats[deviceId] = {
                ...pool.stats,
                connections: pool.connections.length,
                waiting: pool.waiting.length,
                healthyConnections: pool.connections.filter(conn => this.isConnectionHealthy(conn)).length
            };
        }

        return {
            global: this.stats,
            pools: poolStats,
            devices: Array.from(this.devices.entries()).map(([id, device]) => ({
                id,
                ...device
            }))
        };
    }

    /**
     * Get health status of all connections
     */
    async getHealthStatus() {
        const health = {};

        for (const [deviceId, pool] of this.pools) {
            const circuitBreaker = this.circuitBreakers.get(deviceId);
            const device = this.devices.get(deviceId);

            health[deviceId] = {
                status: device?.status || 'unknown',
                connections: {
                    total: pool.connections.length,
                    active: pool.connections.filter(conn => conn.inUse).length,
                    idle: pool.connections.filter(conn => !conn.inUse).length,
                    healthy: pool.connections.filter(conn => this.isConnectionHealthy(conn)).length
                },
                waiting: pool.waiting.length,
                circuitBreaker: circuitBreaker ? circuitBreaker.getState() : 'unknown',
                lastHealthCheck: device?.lastHealthCheck
            };
        }

        return health;
    }

    /**
     * Remove device pool
     */
    async removeDevicePool(deviceId) {
        const { logger } = this.dependencies;

        logger.info(`Removing connection pool for device ${deviceId}`);

        // Stop health monitoring
        const interval = this.healthCheckIntervals.get(deviceId);
        if (interval) {
            clearInterval(interval);
            this.healthCheckIntervals.delete(deviceId);
        }

        // Close all connections
        const pool = this.pools.get(deviceId);
        if (pool) {
            for (const connection of pool.connections) {
                connection.client.disconnect();
            }

            // Reject all waiting requests
            for (const request of pool.waiting) {
                clearTimeout(request.timeout);
                request.reject(new Error(`Device ${deviceId} removed`));
            }
        }

        // Remove from collections
        this.pools.delete(deviceId);
        this.devices.delete(deviceId);
        this.circuitBreakers.delete(deviceId);

        logger.info(`Connection pool for device ${deviceId} removed`);
    }

    /**
     * Update configuration
     */
    updateConfiguration(newConfig) {
        this.config = { ...this.config, ...newConfig };

        // Reconfigure existing pools if needed
        for (const [deviceId, pool] of this.pools) {
            // Adjust connection pool size
            const currentSize = pool.connections.length;
            const targetMinSize = this.config.minConnections;
            const targetMaxSize = this.config.maxConnections;

            if (currentSize < targetMinSize) {
                this.createConnections(deviceId, targetMinSize - currentSize);
            } else if (currentSize > targetMaxSize) {
                // Remove excess connections
                const excessConnections = pool.connections.filter(conn => !conn.inUse).slice(targetMaxSize);
                excessConnections.forEach(conn => conn.client.disconnect());
            }
        }
    }

    /**
     * Shutdown connection pool
     */
    async shutdown() {
        const { logger } = this.dependencies;

        logger.info('Shutting down Mikrotik Connection Pool...');

        // Stop all health monitoring
        for (const interval of this.healthCheckIntervals.values()) {
            clearInterval(interval);
        }
        this.healthCheckIntervals.clear();

        // Close all connections
        const shutdownPromises = [];

        for (const [deviceId, pool] of this.pools) {
            for (const connection of pool.connections) {
                shutdownPromises.push(
                    connection.client.disconnect().catch(error => {
                        logger.error(`Error closing connection ${connection.id}:`, error);
                    })
                );
            }

            // Reject all waiting requests
            for (const request of pool.waiting) {
                clearTimeout(request.timeout);
                request.reject(new Error('Connection pool shutting down'));
            }
        }

        await Promise.all(shutdownPromises);

        // Clear all collections
        this.pools.clear();
        this.devices.clear();
        this.circuitBreakers.clear();

        logger.info('Connection Pool shutdown complete');
    }
}

module.exports = { MikrotikConnectionPool };