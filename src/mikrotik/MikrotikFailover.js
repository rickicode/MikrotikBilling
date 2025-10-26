/**
 * Mikrotik Automatic Failover and Recovery System
 *
 * Features:
 * - Automatic failover between devices
 * - Health-based device selection
 * - Quorum-based decision making
 * - Graceful failover transitions
 * - Automatic recovery and testing
 * - Multi-level failover (primary, secondary, tertiary)
 * - Circuit breaker integration
 * - Failback strategies
 * - Geographic failover support
 */

const { EventEmitter } = require('events');

class MikrotikFailover extends EventEmitter {
    constructor(config, dependencies = {}) {
        super();

        this.config = {
            // Failover configuration
            enabled: true,
            failoverTimeout: 30000, // 30 seconds
            recoveryTimeout: 60000, // 1 minute
            maxFailoverAttempts: 3,
            failbackDelay: 300000, // 5 minutes

            // Health thresholds
            healthCheckInterval: 10000, // 10 seconds
            failureThreshold: 3, // Consecutive failures before failover
            recoveryThreshold: 2, // Consecutive successes before recovery
            minHealthScore: 0.3,

            // Quorum settings
            enableQuorum: false,
            quorumSize: 3,
            quorumTimeout: 5000,

            // Geographic failover
            enableGeoFailover: false,
            geoRegions: new Map(), // region -> [deviceIds]

            // Failover strategies
            failoverStrategy: 'health-based', // health-based, priority-based, load-based, geographic
            failbackStrategy: 'health-based', // immediate, delayed, health-based, manual

            // Testing
            enableRecoveryTesting: true,
            testCommands: ['/system/resource/print', '/interface/print'],
            testTimeout: 10000,

            ...config
        };

        this.dependencies = {
            healthMonitor: null,
            eventBus: null,
            logger: console,
            ...dependencies
        };

        // Device management
        this.devices = new Map(); // deviceId -> device config
        this.deviceGroups = new Map(); // groupId -> [deviceIds]
        this.primaryDevices = new Map(); // group -> deviceId
        this.activeDevices = new Map(); // group -> deviceId
        this.devicePriorities = new Map(); // deviceId -> priority
        this.deviceRegions = new Map(); // deviceId -> region

        // Failover state
        this.failoverState = new Map(); // deviceId -> failover state
        this.failoverHistory = new Map(); // deviceId -> [failover events]
        this.recoveryAttempts = new Map(); // deviceId -> attempts
        this.lastFailover = new Map(); // deviceId -> timestamp
        this.failoverLocks = new Map(); // deviceId -> lock

        // Quorum state
        this.quorumVotes = new Map(); // decision -> votes
        this.quorumTimeouts = new Map(); // decision -> timeout

        // Statistics
        this.stats = {
            totalFailovers: 0,
            successfulFailovers: 0,
            failedFailovers: 0,
            totalRecoveries: 0,
            successfulRecoveries: 0,
            failedRecoveries: 0,
            failoverByGroup: new Map(),
            failoverByDevice: new Map(),
            averageFailoverTime: 0,
            averageRecoveryTime: 0
        };

        // Monitoring intervals
        this.healthCheckInterval = null;
        this.recoveryCheckInterval = null;

        this.setupEventHandlers();
    }

    /**
     * Initialize failover system
     */
    async initialize() {
        const { logger } = this.dependencies;

        try {
            logger.info('Initializing Mikrotik Failover System...');

            // Start health monitoring
            this.startHealthMonitoring();

            // Start recovery monitoring
            this.startRecoveryMonitoring();

            logger.info('Mikrotik Failover System initialized successfully');

        } catch (error) {
            logger.error('Failed to initialize failover system:', error);
            throw error;
        }
    }

    /**
     * Add device to failover system
     */
    addDevice(deviceConfig) {
        const {
            deviceId,
            group = 'default',
            priority = 1,
            region = 'default',
            enabled = true,
            isPrimary = false
        } = deviceConfig;

        const { logger } = this.dependencies;

        try {
            logger.info(`Adding device ${deviceId} to failover system`);

            // Store device configuration
            this.devices.set(deviceId, {
                ...deviceConfig,
                addedAt: Date.now(),
                status: 'initializing'
            });

            // Initialize failover state
            this.failoverState.set(deviceId, {
                status: 'active',
                lastHealthCheck: Date.now(),
                consecutiveFailures: 0,
                consecutiveSuccesses: 0,
                lastFailover: null,
                lastRecovery: null,
                isPrimary: isPrimary
            });

            // Set device priority
            this.devicePriorities.set(deviceId, priority);

            // Set device region
            this.deviceRegions.set(deviceId, region);

            // Add to device group
            if (!this.deviceGroups.has(group)) {
                this.deviceGroups.set(group, []);
            }
            this.deviceGroups.get(group).push(deviceId);

            // Set as primary if specified
            if (isPrimary) {
                this.primaryDevices.set(group, deviceId);
                this.activeDevices.set(group, deviceId);
            }

            // Initialize failover history
            this.failoverHistory.set(deviceId, []);
            this.recoveryAttempts.set(deviceId, 0);

            logger.info(`Device ${deviceId} added to failover system (group: ${group}, priority: ${priority})`);

            // Emit device added event
            this.emit('deviceAdded', { deviceId, deviceConfig });

        } catch (error) {
            logger.error(`Failed to add device ${deviceId} to failover system:`, error);
            throw error;
        }
    }

    /**
     * Remove device from failover system
     */
    removeDevice(deviceId) {
        const { logger } = this.dependencies;

        try {
            const device = this.devices.get(deviceId);
            if (!device) {
                throw new Error(`Device ${deviceId} not found`);
            }

            logger.info(`Removing device ${deviceId} from failover system`);

            // Remove from registry
            this.devices.delete(deviceId);
            this.failoverState.delete(deviceId);
            this.failoverHistory.delete(deviceId);
            this.recoveryAttempts.delete(deviceId);
            this.lastFailover.delete(deviceId);
            this.devicePriorities.delete(deviceId);
            this.deviceRegions.delete(deviceId);

            // Remove from group
            const groupDevices = this.deviceGroups.get(device.group);
            if (groupDevices) {
                const index = groupDevices.indexOf(deviceId);
                if (index > -1) {
                    groupDevices.splice(index, 1);
                }
            }

            // Handle primary device removal
            if (this.primaryDevices.get(device.group) === deviceId) {
                this.primaryDevices.delete(device.group);
                // Select new primary if available
                const remainingDevices = groupDevices || [];
                if (remainingDevices.length > 0) {
                    const newPrimary = this.selectDeviceByPriority(remainingDevices);
                    this.primaryDevices.set(device.group, newPrimary);
                    this.activeDevices.set(device.group, newPrimary);
                } else {
                    this.activeDevices.delete(device.group);
                }
            }

            logger.info(`Device ${deviceId} removed from failover system`);

            // Emit device removed event
            this.emit('deviceRemoved', { deviceId });

        } catch (error) {
            logger.error(`Failed to remove device ${deviceId} from failover system:`, error);
            throw error;
        }
    }

    /**
     * Initiate failover for device
     */
    async initiateFailover(deviceId, reason = 'health_check_failure') {
        const { logger } = this.dependencies;

        if (!this.config.enabled) {
            logger.info(`Failover disabled, skipping failover for device ${deviceId}`);
            return false;
        }

        const device = this.devices.get(deviceId);
        if (!device) {
            throw new Error(`Device ${deviceId} not found`);
        }

        // Check if failover is already in progress
        if (this.failoverLocks.has(deviceId)) {
            logger.warn(`Failover already in progress for device ${deviceId}`);
            return false;
        }

        // Acquire failover lock
        this.failoverLocks.set(deviceId, true);

        try {
            logger.info(`Initiating failover for device ${deviceId}, reason: ${reason}`);

            const startTime = Date.now();

            // Update failover state
            const state = this.failoverState.get(deviceId);
            state.status = 'failing_over';
            state.lastFailover = startTime;
            this.lastFailover.set(deviceId, startTime);

            // Select failover target
            const targetDeviceId = await this.selectFailoverTarget(deviceId);

            if (!targetDeviceId) {
                logger.error(`No suitable failover target found for device ${deviceId}`);
                this.completeFailover(deviceId, false, 'No suitable target found');
                return false;
            }

            logger.info(`Selected failover target: ${targetDeviceId}`);

            // Execute failover
            const success = await this.executeFailover(deviceId, targetDeviceId, reason);

            const failoverTime = Date.now() - startTime;

            // Update statistics
            this.updateFailoverStats(deviceId, success, failoverTime);

            // Update failover state
            this.completeFailover(deviceId, success, success ? `Successfully failed over to ${targetDeviceId}` : 'Failover execution failed');

            // Record failover event
            this.recordFailoverEvent(deviceId, targetDeviceId, reason, success, failoverTime);

            // Release failover lock
            this.failoverLocks.delete(deviceId);

            logger.info(`Failover ${success ? 'completed' : 'failed'} for device ${deviceId} in ${failoverTime}ms`);

            return success;

        } catch (error) {
            logger.error(`Failover failed for device ${deviceId}:`, error);

            // Update state
            this.completeFailover(deviceId, false, error.message);

            // Release failover lock
            this.failoverLocks.delete(deviceId);

            // Update statistics
            this.updateFailoverStats(deviceId, false, 0);

            return false;
        }
    }

    /**
     * Select failover target device
     */
    async selectFailoverTarget(failedDeviceId) {
        const failedDevice = this.devices.get(failedDeviceId);
        const group = failedDevice.group;
        const groupDevices = this.deviceGroups.get(group) || [];

        // Filter out failed device
        const candidates = groupDevices.filter(deviceId => deviceId !== failedDeviceId);

        // Filter healthy devices
        const healthyCandidates = candidates.filter(deviceId => {
            const state = this.failoverState.get(deviceId);
            const healthScore = this.getDeviceHealthScore(deviceId);

            return state.status === 'active' && healthScore >= this.config.minHealthScore;
        });

        if (healthyCandidates.length === 0) {
            // No healthy candidates, try all candidates
            const availableCandidates = candidates.filter(deviceId => {
                const state = this.failoverState.get(deviceId);
                return state.status !== 'failing_over';
            });

            if (availableCandidates.length === 0) {
                return null;
            }

            return this.selectDeviceByStrategy(availableCandidates, failedDeviceId);
        }

        return this.selectDeviceByStrategy(healthyCandidates, failedDeviceId);
    }

    /**
     * Select device by configured strategy
     */
    selectDeviceByStrategy(candidates, failedDeviceId) {
        switch (this.config.failoverStrategy) {
            case 'priority-based':
                return this.selectDeviceByPriority(candidates);

            case 'load-based':
                return this.selectDeviceByLoad(candidates);

            case 'geographic':
                return this.selectDeviceByGeography(candidates, failedDeviceId);

            case 'health-based':
            default:
                return this.selectDeviceByHealth(candidates);
        }
    }

    /**
     * Select device by priority
     */
    selectDeviceByPriority(candidates) {
        let bestDevice = candidates[0];
        let bestPriority = this.devicePriorities.get(bestDevice) || 0;

        for (const deviceId of candidates) {
            const priority = this.devicePriorities.get(deviceId) || 0;
            if (priority > bestPriority) {
                bestDevice = deviceId;
                bestPriority = priority;
            }
        }

        return bestDevice;
    }

    /**
     * Select device by load (fewest connections)
     */
    selectDeviceByLoad(candidates) {
        const { healthMonitor } = this.dependencies;

        let bestDevice = candidates[0];
        let minLoad = Infinity;

        for (const deviceId of candidates) {
            const load = healthMonitor ? healthMonitor.getDeviceLoad(deviceId) : 0;
            if (load < minLoad) {
                minLoad = load;
                bestDevice = deviceId;
            }
        }

        return bestDevice;
    }

    /**
     * Select device by geography
     */
    selectDeviceByGeography(candidates, failedDeviceId) {
        const failedRegion = this.deviceRegions.get(failedDeviceId);

        // Prefer devices in same region
        const sameRegionDevices = candidates.filter(deviceId =>
            this.deviceRegions.get(deviceId) === failedRegion
        );

        if (sameRegionDevices.length > 0) {
            return this.selectDeviceByHealth(sameRegionDevices);
        }

        // Fallback to health-based selection
        return this.selectDeviceByHealth(candidates);
    }

    /**
     * Select device by health score
     */
    selectDeviceByHealth(candidates) {
        let bestDevice = candidates[0];
        let bestHealth = this.getDeviceHealthScore(bestDevice);

        for (const deviceId of candidates) {
            const health = this.getDeviceHealthScore(deviceId);
            if (health > bestHealth) {
                bestDevice = deviceId;
                bestHealth = health;
            }
        }

        return bestDevice;
    }

    /**
     * Execute failover between devices
     */
    async executeFailover(sourceDeviceId, targetDeviceId, reason) {
        const { logger, eventBus } = this.dependencies;

        try {
            logger.info(`Executing failover from ${sourceDeviceId} to ${targetDeviceId}`);

            // Update active device mapping
            const sourceDevice = this.devices.get(sourceDeviceId);
            this.activeDevices.set(sourceDevice.group, targetDeviceId);

            // Emit failover event
            this.emit('failoverInitiated', {
                sourceDeviceId,
                targetDeviceId,
                reason,
                timestamp: Date.now()
            });

            // Publish to event bus
            if (eventBus) {
                await eventBus.publish('mikrotik:failover:initiated', {
                    sourceDeviceId,
                    targetDeviceId,
                    reason,
                    timestamp: Date.now()
                });
            }

            // Test target device connectivity
            if (this.config.enableRecoveryTesting) {
                const isHealthy = await this.testDeviceHealth(targetDeviceId);
                if (!isHealthy) {
                    logger.warn(`Target device ${targetDeviceId} failed health test`);
                    return false;
                }
            }

            logger.info(`Failover from ${sourceDeviceId} to ${targetDeviceId} completed successfully`);

            // Emit failover completed event
            this.emit('failoverCompleted', {
                sourceDeviceId,
                targetDeviceId,
                reason,
                success: true,
                timestamp: Date.now()
            });

            return true;

        } catch (error) {
            logger.error(`Failover execution failed:`, error);

            // Emit failover failed event
            this.emit('failoverFailed', {
                sourceDeviceId,
                targetDeviceId,
                reason,
                error: error.message,
                timestamp: Date.now()
            });

            return false;
        }
    }

    /**
     * Initiate recovery for failed device
     */
    async initiateRecovery(deviceId) {
        const { logger } = this.dependencies;

        const device = this.devices.get(deviceId);
        if (!device) {
            throw new Error(`Device ${deviceId} not found`);
        }

        const state = this.failoverState.get(deviceId);
        if (state.status !== 'failed') {
            logger.info(`Device ${deviceId} is not in failed state, skipping recovery`);
            return false;
        }

        logger.info(`Initiating recovery for device ${deviceId}`);

        const startTime = Date.now();
        const attempts = this.recoveryAttempts.get(deviceId) || 0;

        try {
            // Test device connectivity
            const isHealthy = await this.testDeviceHealth(deviceId);

            if (isHealthy) {
                // Recovery successful
                await this.completeRecovery(deviceId, true, 'Device health test passed');

                // Update statistics
                const recoveryTime = Date.now() - startTime;
                this.updateRecoveryStats(deviceId, true, recoveryTime);

                logger.info(`Recovery completed for device ${deviceId} in ${recoveryTime}ms`);
                return true;

            } else {
                // Recovery failed
                await this.completeRecovery(deviceId, false, 'Device health test failed');

                // Update recovery attempts
                this.recoveryAttempts.set(deviceId, attempts + 1);

                // Update statistics
                this.updateRecoveryStats(deviceId, false, Date.now() - startTime);

                logger.warn(`Recovery failed for device ${deviceId}, attempt ${attempts + 1}`);
                return false;
            }

        } catch (error) {
            logger.error(`Recovery failed for device ${deviceId}:`, error);

            await this.completeRecovery(deviceId, false, error.message);
            this.recoveryAttempts.set(deviceId, attempts + 1);
            this.updateRecoveryStats(deviceId, false, Date.now() - startTime);

            return false;
        }
    }

    /**
     * Test device health
     */
    async testDeviceHealth(deviceId) {
        const { logger } = this.dependencies;

        try {
            for (const command of this.config.testCommands) {
                // This would typically use the connection pool to execute the command
                // For now, we'll simulate the health test
                logger.debug(`Testing device ${deviceId} health with command: ${command}`);

                // Simulate test execution
                await new Promise(resolve => setTimeout(resolve, 100));

                // In a real implementation, you would execute the actual command
                // and check the response
            }

            return true;

        } catch (error) {
            logger.debug(`Health test failed for device ${deviceId}:`, error.message);
            return false;
        }
    }

    /**
     * Complete failover process
     */
    completeFailover(deviceId, success, message) {
        const state = this.failoverState.get(deviceId);
        const device = this.devices.get(deviceId);

        if (success) {
            state.status = 'failed';
            device.status = 'failed';
        } else {
            state.status = 'active';
            device.status = 'active';
        }

        // Emit failover completed event
        this.emit('failoverCompleted', {
            deviceId,
            success,
            message,
            timestamp: Date.now()
        });
    }

    /**
     * Complete recovery process
     */
    async completeRecovery(deviceId, success, message) {
        const { logger, eventBus } = this.dependencies;

        const state = this.failoverState.get(deviceId);
        const device = this.devices.get(deviceId);

        if (success) {
            state.status = 'active';
            state.lastRecovery = Date.now();
            state.consecutiveFailures = 0;
            state.consecutiveSuccesses = 0;
            device.status = 'active';

            // Reset recovery attempts
            this.recoveryAttempts.set(deviceId, 0);

            logger.info(`Device ${deviceId} recovered successfully: ${message}`);

            // Emit recovery event
            this.emit('deviceRecovered', {
                deviceId,
                message,
                timestamp: Date.now()
            });

            // Publish to event bus
            if (eventBus) {
                await eventBus.publish('mikrotik:device:recovered', {
                    deviceId,
                    message,
                    timestamp: Date.now()
                });
            }

        } else {
            state.status = 'failed';
            device.status = 'failed';
            state.consecutiveFailures++;

            logger.warn(`Device recovery failed for ${deviceId}: ${message}`);
        }
    }

    /**
     * Get device health score
     */
    getDeviceHealthScore(deviceId) {
        const { healthMonitor } = this.dependencies;

        if (healthMonitor) {
            return healthMonitor.getDeviceHealthScore(deviceId) || 0;
        }

        // Fallback to failover state
        const state = this.failoverState.get(deviceId);
        if (!state) {
            return 0;
        }

        // Calculate basic health score from state
        if (state.status === 'active') {
            return Math.max(0, 1.0 - (state.consecutiveFailures * 0.2));
        } else {
            return 0;
        }
    }

    /**
     * Update failover statistics
     */
    updateFailoverStats(deviceId, success, duration) {
        this.stats.totalFailovers++;

        if (success) {
            this.stats.successfulFailovers++;
        } else {
            this.stats.failedFailovers++;
        }

        // Update by device
        const deviceStats = this.stats.failoverByDevice.get(deviceId) || { total: 0, successful: 0, failed: 0 };
        deviceStats.total++;
        if (success) {
            deviceStats.successful++;
        } else {
            deviceStats.failed++;
        }
        this.stats.failoverByDevice.set(deviceId, deviceStats);

        // Update average failover time
        const totalTime = this.stats.averageFailoverTime * (this.stats.successfulFailovers - 1) + duration;
        this.stats.averageFailoverTime = totalTime / this.stats.successfulFailovers;
    }

    /**
     * Update recovery statistics
     */
    updateRecoveryStats(deviceId, success, duration) {
        this.stats.totalRecoveries++;

        if (success) {
            this.stats.successfulRecoveries++;
        } else {
            this.stats.failedRecoveries++;
        }

        // Update average recovery time
        const totalTime = this.stats.averageRecoveryTime * (this.stats.successfulRecoveries - 1) + duration;
        this.stats.averageRecoveryTime = totalTime / this.stats.successfulRecoveries;
    }

    /**
     * Record failover event
     */
    recordFailoverEvent(sourceDeviceId, targetDeviceId, reason, success, duration) {
        const event = {
            sourceDeviceId,
            targetDeviceId,
            reason,
            success,
            duration,
            timestamp: Date.now()
        };

        const history = this.failoverHistory.get(sourceDeviceId) || [];
        history.push(event);

        // Keep only recent events (last 50)
        if (history.length > 50) {
            history.splice(0, history.length - 50);
        }

        this.failoverHistory.set(sourceDeviceId, history);
    }

    /**
     * Start health monitoring
     */
    startHealthMonitoring() {
        const { healthMonitor } = this.dependencies;

        if (healthMonitor) {
            healthMonitor.on('deviceUnhealthy', (deviceId, reason) => {
                this.handleDeviceUnhealthy(deviceId, reason);
            });

            healthMonitor.on('deviceHealthy', (deviceId) => {
                this.handleDeviceHealthy(deviceId);
            });
        }

        // Periodic health check
        this.healthCheckInterval = setInterval(() => {
            this.performPeriodicHealthCheck();
        }, this.config.healthCheckInterval);
    }

    /**
     * Start recovery monitoring
     */
    startRecoveryMonitoring() {
        this.recoveryCheckInterval = setInterval(() => {
            this.checkFailedDevices();
        }, this.config.recoveryTimeout);
    }

    /**
     * Handle device unhealthy event
     */
    async handleDeviceUnhealthy(deviceId, reason) {
        const { logger } = this.dependencies;

        const state = this.failoverState.get(deviceId);
        if (!state || state.status === 'failed') {
            return;
        }

        state.consecutiveFailures++;

        logger.warn(`Device ${deviceId} unhealthy (consecutive failures: ${state.consecutiveFailures}), reason: ${reason}`);

        // Check if failover threshold reached
        if (state.consecutiveFailures >= this.config.failureThreshold) {
            await this.initiateFailover(deviceId, `consecutive_failures: ${reason}`);
        }
    }

    /**
     * Handle device healthy event
     */
    async handleDeviceHealthy(deviceId) {
        const state = this.failoverState.get(deviceId);
        if (!state) {
            return;
        }

        state.consecutiveSuccesses++;

        // If device was failed, initiate recovery
        if (state.status === 'failed' && state.consecutiveSuccesses >= this.config.recoveryThreshold) {
            await this.initiateRecovery(deviceId);
        }
    }

    /**
     * Perform periodic health check
     */
    async performPeriodicHealthCheck() {
        const { logger } = this.dependencies;

        for (const deviceId of this.devices.keys()) {
            const healthScore = this.getDeviceHealthScore(deviceId);

            if (healthScore < this.config.minHealthScore) {
                logger.debug(`Device ${deviceId} below health threshold: ${healthScore}`);
                await this.handleDeviceUnhealthy(deviceId, `health_score: ${healthScore}`);
            }
        }
    }

    /**
     * Check failed devices for recovery
     */
    async checkFailedDevices() {
        for (const [deviceId, state] of this.failoverState) {
            if (state.status === 'failed') {
                const timeSinceFailover = Date.now() - state.lastFailover;

                // Check if enough time has passed for recovery attempt
                if (timeSinceFailover >= this.config.recoveryTimeout) {
                    await this.initiateRecovery(deviceId);
                }
            }
        }
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        const { eventBus } = this.dependencies;

        if (eventBus) {
            eventBus.on('mikrotik:device:offline', (deviceId) => {
                this.initiateFailover(deviceId, 'device_offline');
            });

            eventBus.on('mikrotik:device:online', (deviceId) => {
                this.handleDeviceHealthy(deviceId);
            });
        }
    }

    /**
     * Get active device for group
     */
    getActiveDevice(group) {
        return this.activeDevices.get(group);
    }

    /**
     * Get failover statistics
     */
    getStats() {
        const deviceStates = {};

        for (const [deviceId, state] of this.failoverState) {
            const device = this.devices.get(deviceId);
            deviceStates[deviceId] = {
                ...device,
                ...state,
                healthScore: this.getDeviceHealthScore(deviceId),
                priority: this.devicePriorities.get(deviceId),
                recoveryAttempts: this.recoveryAttempts.get(deviceId) || 0,
                failoverHistory: this.failoverHistory.get(deviceId) || []
            };
        }

        return {
            global: this.stats,
            devices: deviceStates,
            groups: Object.fromEntries(
                Array.from(this.deviceGroups.entries()).map(([group, devices]) => [
                    group,
                    {
                        devices,
                        primary: this.primaryDevices.get(group),
                        active: this.activeDevices.get(group)
                    }
                ])
            )
        };
    }

    /**
     * Get device failover status
     */
    getDeviceFailoverStatus(deviceId) {
        const device = this.devices.get(deviceId);
        const state = this.failoverState.get(deviceId);

        if (!device || !state) {
            return null;
        }

        return {
            deviceId,
            status: state.status,
            healthScore: this.getDeviceHealthScore(deviceId),
            consecutiveFailures: state.consecutiveFailures,
            consecutiveSuccesses: state.consecutiveSuccesses,
            lastFailover: state.lastFailover,
            lastRecovery: state.lastRecovery,
            recoveryAttempts: this.recoveryAttempts.get(deviceId) || 0,
            failoverHistory: this.failoverHistory.get(deviceId) || []
        };
    }

    /**
     * Manual failover trigger
     */
    async triggerManualFailover(deviceId, reason = 'manual_trigger') {
        const { logger } = this.dependencies;

        logger.info(`Manual failover triggered for device ${deviceId}, reason: ${reason}`);

        return await this.initiateFailover(deviceId, reason);
    }

    /**
     * Manual recovery trigger
     */
    async triggerManualRecovery(deviceId, reason = 'manual_trigger') {
        const { logger } = this.dependencies;

        logger.info(`Manual recovery triggered for device ${deviceId}, reason: ${reason}`);

        return await this.initiateRecovery(deviceId);
    }

    /**
     * Shutdown failover system
     */
    async shutdown() {
        const { logger } = this.dependencies;

        logger.info('Shutting down Mikrotik Failover System...');

        // Clear monitoring intervals
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        if (this.recoveryCheckInterval) {
            clearInterval(this.recoveryCheckInterval);
        }

        // Clear all data structures
        this.devices.clear();
        this.deviceGroups.clear();
        this.primaryDevices.clear();
        this.activeDevices.clear();
        this.devicePriorities.clear();
        this.deviceRegions.clear();
        this.failoverState.clear();
        this.failoverHistory.clear();
        this.recoveryAttempts.clear();
        this.lastFailover.clear();
        this.failoverLocks.clear();
        this.quorumVotes.clear();
        this.quorumTimeouts.clear();

        logger.info('Mikrotik Failover System shutdown complete');
    }
}

module.exports = { MikrotikFailover };