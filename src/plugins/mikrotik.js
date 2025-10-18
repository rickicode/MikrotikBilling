/**
 * Fastify Mikrotik Plugin with Enterprise Connection Pooling
 *
 * Features:
 * - Dynamic connection pooling
 * - High availability and failover
 * - Performance monitoring
 * - Security management
 * - Command queuing
 * - Intelligent caching
 */

const fp = require('fastify-plugin');
const { MikrotikConnectionPool } = require('../mikrotik/MikrotikConnectionPool');
const { MikrotikLoadBalancer } = require('../mikrotik/MikrotikLoadBalancer');
const { MikrotikFailover } = require('../mikrotik/MikrotikFailover');
const { MikrotikHealthMonitor } = require('../mikrotik/MikrotikHealthMonitor');
const { MikrotikCommandQueue } = require('../mikrotik/MikrotikCommandQueue');
const { MikrotikCacheManager } = require('../mikrotik/MikrotikCacheManager');
const { MikrotikSecurityManager } = require('../mikrotik/MikrotikSecurityManager');
const { MikrotikService } = require('../services/MikrotikService');
const { mikrotikConfig } = require('../config/mikrotik-config');

/**
 * Fastify Mikrotik Plugin
 *
 * @param {FastifyInstance} fastify - Fastify instance
 * @param {Object} options - Plugin options
 */
const mikrotikPlugin = fp(async (fastify, options) => {
    const config = { ...mikrotikConfig, ...options };
    const { logger, eventBus, cache, serviceContainer } = fastify;

    logger.info('Initializing Mikrotik Plugin with enterprise features...');

    try {
        // Initialize Security Manager
        const securityManager = new MikrotikSecurityManager(config.security, logger);
        await securityManager.initialize();

        // Initialize Cache Manager
        const cacheManager = new MikrotikCacheManager({
            ...config.cache,
            cache: cache
        }, logger);

        // Initialize Command Queue
        const commandQueue = new MikrotikCommandQueue({
            ...config.commandQueue,
            eventBus: eventBus
        }, logger);

        // Initialize Health Monitor
        const healthMonitor = new MikrotikHealthMonitor({
            ...config.healthMonitor,
            eventBus: eventBus,
            logger: logger
        });

        // Initialize Failover Manager
        const failoverManager = new MikrotikFailover({
            ...config.failover,
            healthMonitor: healthMonitor,
            eventBus: eventBus
        }, logger);

        // Initialize Load Balancer
        const loadBalancer = new MikrotikLoadBalancer({
            ...config.loadBalancer,
            failover: failoverManager,
            healthMonitor: healthMonitor
        }, logger);

        // Initialize Connection Pool
        const connectionPool = new MikrotikConnectionPool({
            ...config.connectionPool,
            securityManager: securityManager,
            loadBalancer: loadBalancer,
            cacheManager: cacheManager,
            commandQueue: commandQueue,
            healthMonitor: healthMonitor,
            eventBus: eventBus,
            logger: logger
        });

        // Initialize Connection Pool
        await connectionPool.initialize();
        logger.info('Mikrotik Connection Pool initialized successfully');

        // Initialize Mikrotik Service
        const mikrotikService = new MikrotikService(connectionPool, {
            ...config.service,
            eventBus: eventBus,
            logger: logger
        });

        // Decorate Fastify instance
        fastify.decorate('mikrotik', {
            // Core components
            connectionPool,
            service: mikrotikService,

            // Managers
            securityManager,
            cacheManager,
            healthMonitor,

            // Load balancing and failover
            loadBalancer,
            failover: failoverManager,

            // Command processing
            commandQueue,

            // Configuration
            config,

            // Utility methods
            async executeCommand(deviceId, command, options = {}) {
                return mikrotikService.executeCommand(deviceId, command, options);
            },

            async executeBatch(deviceId, commands, options = {}) {
                return mikrotikService.executeBatch(deviceId, commands, options);
            },

            async getDeviceStatus(deviceId) {
                return mikrotikService.getDeviceStatus(deviceId);
            },

            async getAllDevices() {
                return mikrotikService.getAllDevices();
            },

            async getHealthMetrics() {
                return healthMonitor.getHealthMetrics();
            },

            async getConnectionStats() {
                return connectionPool.getStats();
            },

            async invalidateCache(pattern) {
                return cacheManager.invalidate(pattern);
            },

            // High-level business operations
            async createVoucher(voucherData, options = {}) {
                return mikrotikService.createVoucher(voucherData, options);
            },

            async createPPPoEUser(userData, options = {}) {
                return mikrotikService.createPPPoEUser(userData, options);
            },

            async getUserSessions(deviceId, filters = {}) {
                return mikrotikService.getUserSessions(deviceId, filters);
            },

            async disconnectUser(deviceId, userId) {
                return mikrotikService.disconnectUser(deviceId, userId);
            },

            async getUserStats(deviceId, timeRange = '1h') {
                return mikrotikService.getUserStats(deviceId, timeRange);
            }
        });

        // Health check endpoint
        fastify.get('/mikrotik/health', async (request, reply) => {
            try {
                const health = await connectionPool.getHealthStatus();
                const metrics = await healthMonitor.getHealthMetrics();

                return {
                    status: 'ok',
                    timestamp: new Date().toISOString(),
                    connections: health,
                    health: metrics,
                    uptime: process.uptime()
                };
            } catch (error) {
                logger.error('Health check failed:', error);
                reply.code(503);
                return {
                    status: 'error',
                    message: 'Mikrotik service unavailable',
                    error: error.message
                };
            }
        });

        // Metrics endpoint
        fastify.get('/mikrotik/metrics', async (request, reply) => {
            try {
                const [connectionStats, healthMetrics, cacheStats] = await Promise.all([
                    connectionPool.getStats(),
                    healthMonitor.getHealthMetrics(),
                    cacheManager.getStats()
                ]);

                return {
                    timestamp: new Date().toISOString(),
                    connections: connectionStats,
                    health: healthMetrics,
                    cache: cacheStats
                };
            } catch (error) {
                logger.error('Metrics collection failed:', error);
                reply.code(500);
                return {
                    status: 'error',
                    message: 'Failed to collect metrics',
                    error: error.message
                };
            }
        });

        // Device management endpoints
        fastify.get('/mikrotik/devices', async (request, reply) => {
            try {
                const devices = await mikrotikService.getAllDevices();
                return { devices };
            } catch (error) {
                logger.error('Failed to get devices:', error);
                reply.code(500);
                return {
                    status: 'error',
                    message: 'Failed to retrieve devices',
                    error: error.message
                };
            }
        });

        fastify.get('/mikrotik/devices/:deviceId/status', async (request, reply) => {
            try {
                const { deviceId } = request.params;
                const status = await mikrotikService.getDeviceStatus(deviceId);
                return status;
            } catch (error) {
                logger.error(`Failed to get device status:`, error);
                reply.code(500);
                return {
                    status: 'error',
                    message: 'Failed to retrieve device status',
                    error: error.message
                };
            }
        });

        // Cache management endpoints
        fastify.delete('/mikrotik/cache', async (request, reply) => {
            try {
                const { pattern } = request.query;
                const result = await cacheManager.invalidate(pattern || '*');
                return {
                    message: 'Cache invalidated successfully',
                    invalidated: result.count
                };
            } catch (error) {
                logger.error('Cache invalidation failed:', error);
                reply.code(500);
                return {
                    status: 'error',
                    message: 'Failed to invalidate cache',
                    error: error.message
                };
            }
        });

        // Graceful shutdown
        fastify.addHook('onClose', async (instance) => {
            logger.info('Shutting down Mikrotik Plugin...');
            await Promise.all([
                commandQueue.shutdown(),
                connectionPool.shutdown(),
                healthMonitor.shutdown(),
                cacheManager.shutdown()
            ]);
            logger.info('Mikrotik Plugin shutdown complete');
        });

        logger.info('Mikrotik Plugin initialized successfully');

    } catch (error) {
        logger.error('Failed to initialize Mikrotik Plugin:', error);
        throw error;
    }
}, {
    name: 'mikrotik',
    dependencies: ['logger', 'eventBus', 'cache', 'serviceContainer']
});

module.exports = { mikrotikPlugin };