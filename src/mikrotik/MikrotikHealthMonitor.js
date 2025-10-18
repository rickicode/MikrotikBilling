/**
 * Mikrotik Health Monitoring and Diagnostics System
 *
 * Features:
 * - Real-time device health monitoring
 * - Performance metrics collection
 * - Resource utilization tracking
 * - Network connectivity testing
 * - Service availability monitoring
 * - Predictive health analysis
 * - Alert management
 * - Health score calculation
 * - Diagnostic data collection
 * - Historical health tracking
 */

const { EventEmitter } = require('events');
const { LRUCache } = require('../services/LRUCache');

class MikrotikHealthMonitor extends EventEmitter {
    constructor(config, dependencies = {}) {
        super();

        this.config = {
            // Monitoring intervals
            healthCheckInterval: 30000, // 30 seconds
            performanceCheckInterval: 60000, // 1 minute
            resourceCheckInterval: 120000, // 2 minutes
            diagnosticInterval: 300000, // 5 minutes

            // Health thresholds
            responseTimeThreshold: 5000, // 5 seconds
            cpuThreshold: 80, // 80%
            memoryThreshold: 85, // 85%
            diskThreshold: 90, // 90%
            connectionThreshold: 100, // 100 connections
            errorRateThreshold: 0.1, // 10%

            // Health score weights
            responseTimeWeight: 0.25,
            availabilityWeight: 0.30,
            resourceWeight: 0.25,
            errorRateWeight: 0.20,

            // Historical data
            historyRetention: 86400000, // 24 hours
            maxHistoryPoints: 1440, // One per minute for 24 hours

            // Predictive analysis
            enablePredictiveAnalysis: true,
            predictionWindow: 3600000, // 1 hour
            anomalyThreshold: 2.0, // Standard deviations

            // Alerting
            enableAlerting: true,
            alertCooldown: 300000, // 5 minutes
            criticalAlertThreshold: 0.3, // Health score below 30%
            warningAlertThreshold: 0.6, // Health score below 60%

            // Diagnostic tests
            enableDiagnostics: true,
            diagnosticTests: [
                'connectivity',
                'api_responsiveness',
                'resource_utilization',
                'service_availability',
                'network_performance'
            ],

            ...config
        };

        this.dependencies = {
            eventBus: null,
            logger: console,
            ...dependencies
        };

        // Device registry
        this.devices = new Map(); // deviceId -> device config
        this.deviceStatus = new Map(); // deviceId -> status info
        this.healthScores = new Map(); // deviceId -> health score
        this.lastHealthCheck = new Map(); // deviceId -> timestamp

        // Health metrics
        this.responseTimeHistory = new Map(); // deviceId -> [responseTimes]
        this.resourceMetrics = new Map(); // deviceId -> resource data
        this.errorCounts = new Map(); // deviceId -> error count
        this.availabilityHistory = new Map(); // deviceId -> [availability data]

        // Predictive analysis
        this.trendData = new Map(); // deviceId -> trend metrics
        this.anomalyDetection = new Map(); // deviceId -> anomaly data

        // Alert management
        this.alertHistory = new Map(); // deviceId -> [alerts]
        this.alertCooldowns = new Map(); // deviceId -> last alert timestamp
        this.activeAlerts = new Set(); // active alert IDs

        // Diagnostic data
        this.diagnosticResults = new Map(); // deviceId -> diagnostic data
        this.diagnosticCache = new LRUCache(100); // deviceId -> cached diagnostics

        // Monitoring intervals
        this.monitoringIntervals = new Map(); // deviceId -> interval IDs

        // Statistics
        this.stats = {
            totalHealthChecks: 0,
            totalDiagnostics: 0,
            totalAlerts: 0,
            averageHealthScore: 0,
            deviceUptime: new Map(), // deviceId -> uptime
            deviceDowntime: new Map(), // deviceId -> downtime
            healthCheckTimes: new Map() // deviceId -> [check times]
        };

        this.setupEventHandlers();
    }

    /**
     * Initialize health monitor
     */
    async initialize() {
        const { logger } = this.dependencies;

        try {
            logger.info('Initializing Mikrotik Health Monitor...');

            // Start monitoring for all registered devices
            await this.startAllDeviceMonitoring();

            // Start global monitoring tasks
            this.startGlobalMonitoring();

            logger.info('Mikrotik Health Monitor initialized successfully');

        } catch (error) {
            logger.error('Failed to initialize health monitor:', error);
            throw error;
        }
    }

    /**
     * Add device to health monitoring
     */
    addDevice(deviceConfig) {
        const { deviceId, host, port, enabled = true } = deviceConfig;
        const { logger } = this.dependencies;

        try {
            logger.info(`Adding device ${deviceId} to health monitoring`);

            // Store device configuration
            this.devices.set(deviceId, {
                ...deviceConfig,
                addedAt: Date.now(),
                enabled
            });

            // Initialize device status
            this.deviceStatus.set(deviceId, {
                status: 'unknown',
                lastCheck: null,
                consecutiveFailures: 0,
                consecutiveSuccesses: 0,
                lastError: null
            });

            // Initialize health metrics
            this.healthScores.set(deviceId, 1.0);
            this.responseTimeHistory.set(deviceId, []);
            this.resourceMetrics.set(deviceId, {
                cpu: 0,
                memory: 0,
                disk: 0,
                uptime: 0,
                connections: 0
            });
            this.errorCounts.set(deviceId, 0);
            this.availabilityHistory.set(deviceId, []);
            this.alertHistory.set(deviceId, []);
            this.stats.deviceUptime.set(deviceId, 0);
            this.stats.deviceDowntime.set(deviceId, 0);
            this.stats.healthCheckTimes.set(deviceId, []);

            // Start monitoring if enabled
            if (enabled) {
                this.startDeviceMonitoring(deviceId);
            }

            logger.info(`Device ${deviceId} added to health monitoring`);

            // Emit device added event
            this.emit('deviceAdded', { deviceId, deviceConfig });

        } catch (error) {
            logger.error(`Failed to add device ${deviceId} to health monitoring:`, error);
            throw error;
        }
    }

    /**
     * Remove device from health monitoring
     */
    removeDevice(deviceId) {
        const { logger } = this.dependencies;

        try {
            logger.info(`Removing device ${deviceId} from health monitoring`);

            // Stop monitoring
            this.stopDeviceMonitoring(deviceId);

            // Remove from registry
            this.devices.delete(deviceId);
            this.deviceStatus.delete(deviceId);
            this.healthScores.delete(deviceId);
            this.lastHealthCheck.delete(deviceId);

            // Clean up metrics
            this.responseTimeHistory.delete(deviceId);
            this.resourceMetrics.delete(deviceId);
            this.errorCounts.delete(deviceId);
            this.availabilityHistory.delete(deviceId);
            this.trendData.delete(deviceId);
            this.anomalyDetection.delete(deviceId);
            this.alertHistory.delete(deviceId);
            this.alertCooldowns.delete(deviceId);
            this.diagnosticResults.delete(deviceId);

            // Clean up statistics
            this.stats.deviceUptime.delete(deviceId);
            this.stats.deviceDowntime.delete(deviceId);
            this.stats.healthCheckTimes.delete(deviceId);

            logger.info(`Device ${deviceId} removed from health monitoring`);

            // Emit device removed event
            this.emit('deviceRemoved', { deviceId });

        } catch (error) {
            logger.error(`Failed to remove device ${deviceId} from health monitoring:`, error);
            throw error;
        }
    }

    /**
     * Start monitoring for a device
     */
    startDeviceMonitoring(deviceId) {
        const { logger } = this.dependencies;

        // Stop existing monitoring
        this.stopDeviceMonitoring(deviceId);

        const intervals = [];

        // Health check interval
        const healthInterval = setInterval(() => {
            this.performHealthCheck(deviceId);
        }, this.config.healthCheckInterval);
        intervals.push(healthInterval);

        // Performance check interval
        const performanceInterval = setInterval(() => {
            this.performPerformanceCheck(deviceId);
        }, this.config.performanceCheckInterval);
        intervals.push(performanceInterval);

        // Resource check interval
        const resourceInterval = setInterval(() => {
            this.performResourceCheck(deviceId);
        }, this.config.resourceCheckInterval);
        intervals.push(resourceInterval);

        // Diagnostic interval
        if (this.config.enableDiagnostics) {
            const diagnosticInterval = setInterval(() => {
                this.performDiagnostics(deviceId);
            }, this.config.diagnosticInterval);
            intervals.push(diagnosticInterval);
        }

        this.monitoringIntervals.set(deviceId, intervals);

        // Perform initial health check
        this.performHealthCheck(deviceId);

        logger.debug(`Started monitoring for device ${deviceId}`);
    }

    /**
     * Stop monitoring for a device
     */
    stopDeviceMonitoring(deviceId) {
        const intervals = this.monitoringIntervals.get(deviceId);
        if (intervals) {
            intervals.forEach(interval => clearInterval(interval));
            this.monitoringIntervals.delete(deviceId);
        }
    }

    /**
     * Start monitoring for all devices
     */
    async startAllDeviceMonitoring() {
        for (const deviceId of this.devices.keys()) {
            const device = this.devices.get(deviceId);
            if (device.enabled) {
                this.startDeviceMonitoring(deviceId);
            }
        }
    }

    /**
     * Start global monitoring tasks
     */
    startGlobalMonitoring() {
        const { logger } = this.dependencies;

        // Cleanup old data periodically
        setInterval(() => {
            this.cleanupOldData();
        }, 3600000); // Every hour

        // Calculate global health score
        setInterval(() => {
            this.calculateGlobalHealthScore();
        }, 60000); // Every minute

        logger.debug('Started global monitoring tasks');
    }

    /**
     * Perform health check for device
     */
    async performHealthCheck(deviceId) {
        const { logger } = this.dependencies;
        const startTime = Date.now();

        try {
            const device = this.devices.get(deviceId);
            if (!device || !device.enabled) {
                return;
            }

            logger.debug(`Performing health check for device ${deviceId}`);

            // Update last check time
            this.lastHealthCheck.set(deviceId, startTime);

            // Execute health check commands
            const healthData = await this.executeHealthCheck(deviceId);

            // Process health data
            const healthResult = this.processHealthCheck(deviceId, healthData);

            // Update device status
            this.updateDeviceStatus(deviceId, healthResult);

            // Calculate health score
            const healthScore = this.calculateHealthScore(deviceId);
            this.healthScores.set(deviceId, healthScore);

            // Check for alerts
            if (this.config.enableAlerting) {
                this.checkAlerts(deviceId, healthScore, healthResult);
            }

            // Perform predictive analysis
            if (this.config.enablePredictiveAnalysis) {
                this.performPredictiveAnalysis(deviceId, healthResult);
            }

            // Update statistics
            const checkTime = Date.now() - startTime;
            this.updateHealthCheckStats(deviceId, true, checkTime);

            logger.debug(`Health check completed for device ${deviceId} in ${checkTime}ms, score: ${healthScore.toFixed(2)}`);

            // Emit health check event
            this.emit('healthCheckCompleted', {
                deviceId,
                healthScore,
                healthResult,
                checkTime,
                timestamp: Date.now()
            });

            return healthResult;

        } catch (error) {
            logger.error(`Health check failed for device ${deviceId}:`, error);

            // Handle health check failure
            this.handleHealthCheckFailure(deviceId, error);

            // Update statistics
            const checkTime = Date.now() - startTime;
            this.updateHealthCheckStats(deviceId, false, checkTime);

            // Emit health check failed event
            this.emit('healthCheckFailed', {
                deviceId,
                error: error.message,
                checkTime,
                timestamp: Date.now()
            });

            throw error;
        }
    }

    /**
     * Execute health check commands
     */
    async executeHealthCheck(deviceId) {
        const device = this.devices.get(deviceId);

        // In a real implementation, this would use the connection pool
        // to execute actual Mikrotik commands. For now, we'll simulate.
        const commands = [
            { command: '/system/resource/print', name: 'system_resources' },
            { command: '/interface/print', name: 'interfaces' },
            { command: '/user/active/print', name: 'active_users' },
            { command: '/queue/simple/print', name: 'queues' }
        ];

        const results = {};

        for (const cmd of commands) {
            try {
                // Simulate command execution
                await new Promise(resolve => setTimeout(resolve, 100));

                // Mock response based on command
                switch (cmd.name) {
                    case 'system_resources':
                        results[cmd.name] = {
                            'cpu-load': Math.random() * 100,
                            'free-memory': Math.random() * 1000000,
                            'total-memory': 1000000,
                            'free-hdd-space': Math.random() * 1000000000,
                            'total-hdd-space': 1000000000,
                            uptime: Math.random() * 1000000
                        };
                        break;

                    case 'interfaces':
                        results[cmd.name] = [
                            {
                                name: 'ether1',
                                running: true,
                                'rx-byte': Math.random() * 1000000000,
                                'tx-byte': Math.random() * 1000000000
                            }
                        ];
                        break;

                    case 'active_users':
                        results[cmd.name] = Array.from({ length: Math.floor(Math.random() * 20) }, (_, i) => ({
                            '.id': `*${i}`,
                            user: `user${i}`,
                            address: `192.168.1.${i + 1}`,
                            uptime: Math.random() * 3600
                        }));
                        break;

                    case 'queues':
                        results[cmd.name] = [
                            {
                                name: 'default',
                                target: '192.168.1.0/24',
                                'max-limit': '10M/10M'
                            }
                        ];
                        break;
                }

            } catch (error) {
                results[cmd.name] = { error: error.message };
            }
        }

        return results;
    }

    /**
     * Process health check results
     */
    processHealthCheck(deviceId, healthData) {
        const { logger } = this.dependencies;

        const result = {
            deviceId,
            timestamp: Date.now(),
            status: 'healthy',
            metrics: {},
            issues: [],
            warnings: []
        };

        // Process system resources
        if (healthData.system_resources) {
            const resources = healthData.system_resources;
            result.metrics.cpu = parseFloat(resources['cpu-load']) || 0;
            result.metrics.memory = this.calculateMemoryUsage(resources);
            result.metrics.disk = this.calculateDiskUsage(resources);
            result.metrics.uptime = parseInt(resources.uptime) || 0;

            // Check thresholds
            if (result.metrics.cpu > this.config.cpuThreshold) {
                result.issues.push(`High CPU usage: ${result.metrics.cpu.toFixed(1)}%`);
            }

            if (result.metrics.memory > this.config.memoryThreshold) {
                result.issues.push(`High memory usage: ${result.metrics.memory.toFixed(1)}%`);
            }

            if (result.metrics.disk > this.config.diskThreshold) {
                result.issues.push(`High disk usage: ${result.metrics.disk.toFixed(1)}%`);
            }
        }

        // Process interfaces
        if (healthData.interfaces) {
            const interfaces = Array.isArray(healthData.interfaces) ? healthData.interfaces : [healthData.interfaces];
            const activeInterfaces = interfaces.filter(iface => iface.running);
            result.metrics.activeInterfaces = activeInterfaces.length;
            result.metrics.totalInterfaces = interfaces.length;

            if (activeInterfaces.length === 0) {
                result.issues.push('No active interfaces found');
            }
        }

        // Process active users
        if (healthData.active_users) {
            const users = Array.isArray(healthData.active_users) ? healthData.active_users : [];
            result.metrics.activeUsers = users.length;

            if (users.length > this.config.connectionThreshold) {
                result.warnings.push(`High connection count: ${users.length}`);
            }
        }

        // Determine overall status
        if (result.issues.length > 0) {
            result.status = 'unhealthy';
        } else if (result.warnings.length > 0) {
            result.status = 'degraded';
        }

        // Update resource metrics
        const resourceMetrics = this.resourceMetrics.get(deviceId) || {};
        Object.assign(resourceMetrics, result.metrics);
        this.resourceMetrics.set(deviceId, resourceMetrics);

        logger.debug(`Processed health check for device ${deviceId}: ${result.status}, ${result.issues.length} issues`);

        return result;
    }

    /**
     * Calculate memory usage percentage
     */
    calculateMemoryUsage(resources) {
        const freeMemory = parseFloat(resources['free-memory']) || 0;
        const totalMemory = parseFloat(resources['total-memory']) || 1;
        return ((totalMemory - freeMemory) / totalMemory) * 100;
    }

    /**
     * Calculate disk usage percentage
     */
    calculateDiskUsage(resources) {
        const freeSpace = parseFloat(resources['free-hdd-space']) || 0;
        const totalSpace = parseFloat(resources['total-hdd-space']) || 1;
        return ((totalSpace - freeSpace) / totalSpace) * 100;
    }

    /**
     * Calculate health score for device
     */
    calculateHealthScore(deviceId) {
        const deviceStatus = this.deviceStatus.get(deviceId);
        const resourceMetrics = this.resourceMetrics.get(deviceId) || {};
        const responseTimeHistory = this.responseTimeHistory.get(deviceId) || [];

        // Component scores (0-1)
        const availabilityScore = this.calculateAvailabilityScore(deviceId);
        const resourceScore = this.calculateResourceScore(resourceMetrics);
        const responseTimeScore = this.calculateResponseTimeScore(responseTimeHistory);
        const errorRateScore = this.calculateErrorRateScore(deviceId);

        // Weighted average
        const healthScore = (
            availabilityScore * this.config.availabilityWeight +
            resourceScore * this.config.resourceWeight +
            responseTimeScore * this.config.responseTimeWeight +
            errorRateScore * this.config.errorRateWeight
        );

        return Math.max(0, Math.min(1, healthScore));
    }

    /**
     * Calculate availability score
     */
    calculateAvailabilityScore(deviceId) {
        const deviceStatus = this.deviceStatus.get(deviceId);
        if (!deviceStatus) {
            return 0;
        }

        const totalChecks = deviceStatus.consecutiveSuccesses + deviceStatus.consecutiveFailures;
        if (totalChecks === 0) {
            return 1; // Assume healthy if no checks yet
        }

        return deviceStatus.consecutiveSuccesses / totalChecks;
    }

    /**
     * Calculate resource score
     */
    calculateResourceScore(resourceMetrics) {
        if (!resourceMetrics || Object.keys(resourceMetrics).length === 0) {
            return 1; // Assume healthy if no metrics
        }

        let totalScore = 0;
        let count = 0;

        // CPU score
        if (resourceMetrics.cpu !== undefined) {
            const cpuScore = Math.max(0, 1 - (resourceMetrics.cpu / 100));
            totalScore += cpuScore;
            count++;
        }

        // Memory score
        if (resourceMetrics.memory !== undefined) {
            const memoryScore = Math.max(0, 1 - (resourceMetrics.memory / 100));
            totalScore += memoryScore;
            count++;
        }

        // Disk score
        if (resourceMetrics.disk !== undefined) {
            const diskScore = Math.max(0, 1 - (resourceMetrics.disk / 100));
            totalScore += diskScore;
            count++;
        }

        return count > 0 ? totalScore / count : 1;
    }

    /**
     * Calculate response time score
     */
    calculateResponseTimeScore(responseTimeHistory) {
        if (responseTimeHistory.length === 0) {
            return 1; // Assume healthy if no response times
        }

        const avgResponseTime = responseTimeHistory.reduce((sum, time) => sum + time, 0) / responseTimeHistory.length;
        return Math.max(0, 1 - (avgResponseTime / this.config.responseTimeThreshold));
    }

    /**
     * Calculate error rate score
     */
    calculateErrorRateScore(deviceId) {
        const deviceStatus = this.deviceStatus.get(deviceId);
        if (!deviceStatus) {
            return 1;
        }

        const totalChecks = deviceStatus.consecutiveSuccesses + deviceStatus.consecutiveFailures;
        if (totalChecks === 0) {
            return 1;
        }

        const errorRate = deviceStatus.consecutiveFailures / totalChecks;
        return Math.max(0, 1 - errorRate);
    }

    /**
     * Update device status
     */
    updateDeviceStatus(deviceId, healthResult) {
        const status = this.deviceStatus.get(deviceId);
        const oldStatus = status.status;

        status.lastCheck = Date.now();

        if (healthResult.status === 'healthy') {
            status.consecutiveSuccesses++;
            status.consecutiveFailures = 0;
            status.lastError = null;
        } else {
            status.consecutiveFailures++;
            status.consecutiveSuccesses = 0;
            status.lastError = healthResult.issues.join(', ');
        }

        status.status = healthResult.status;

        // Emit status change event
        if (oldStatus !== status.status) {
            this.emit('statusChange', {
                deviceId,
                oldStatus,
                newStatus: status.status,
                timestamp: Date.now()
            });

            // Emit specific events
            if (status.status === 'unhealthy' && oldStatus !== 'unhealthy') {
                this.emit('deviceUnhealthy', deviceId, status.lastError);
            } else if (status.status === 'healthy' && oldStatus !== 'healthy') {
                this.emit('deviceHealthy', deviceId);
            }
        }
    }

    /**
     * Handle health check failure
     */
    handleHealthCheckFailure(deviceId, error) {
        const status = this.deviceStatus.get(deviceId);
        if (status) {
            status.consecutiveFailures++;
            status.consecutiveSuccesses = 0;
            status.lastError = error.message;
            status.lastCheck = Date.now();
        }

        // Update error count
        const errorCount = this.errorCounts.get(deviceId) || 0;
        this.errorCounts.set(deviceId, errorCount + 1);
    }

    /**
     * Perform performance check
     */
    async performPerformanceCheck(deviceId) {
        const { logger } = this.dependencies;

        try {
            // Measure response time
            const startTime = Date.now();
            await this.executeHealthCheck(deviceId);
            const responseTime = Date.now() - startTime;

            // Update response time history
            const history = this.responseTimeHistory.get(deviceId) || [];
            history.push(responseTime);

            // Keep only recent history (last 100 measurements)
            if (history.length > 100) {
                history.splice(0, history.length - 100);
            }

            this.responseTimeHistory.set(deviceId, history);

            logger.debug(`Performance check for device ${deviceId}: ${responseTime}ms`);

        } catch (error) {
            logger.debug(`Performance check failed for device ${deviceId}:`, error.message);
        }
    }

    /**
     * Perform resource check
     */
    async performResourceCheck(deviceId) {
        const { logger } = this.dependencies;

        try {
            // Get current resource metrics
            const healthData = await this.executeHealthCheck(deviceId);
            const result = this.processHealthCheck(deviceId, healthData);

            // Update resource metrics (already done in processHealthCheck)
            logger.debug(`Resource check completed for device ${deviceId}`);

        } catch (error) {
            logger.debug(`Resource check failed for device ${deviceId}:`, error.message);
        }
    }

    /**
     * Perform diagnostics
     */
    async performDiagnostics(deviceId) {
        const { logger } = this.dependencies;

        if (!this.config.enableDiagnostics) {
            return;
        }

        try {
            logger.debug(`Performing diagnostics for device ${deviceId}`);

            const diagnosticData = {
                deviceId,
                timestamp: Date.now(),
                tests: {}
            };

            // Run diagnostic tests
            for (const testName of this.config.diagnosticTests) {
                try {
                    diagnosticData.tests[testName] = await this.runDiagnosticTest(deviceId, testName);
                } catch (error) {
                    diagnosticData.tests[testName] = {
                        status: 'failed',
                        error: error.message
                    };
                }
            }

            // Store diagnostic results
            this.diagnosticResults.set(deviceId, diagnosticData);
            this.diagnosticCache.set(deviceId, diagnosticData);

            // Update statistics
            this.stats.totalDiagnostics++;

            logger.debug(`Diagnostics completed for device ${deviceId}`);

            // Emit diagnostics completed event
            this.emit('diagnosticsCompleted', {
                deviceId,
                diagnosticData,
                timestamp: Date.now()
            });

        } catch (error) {
            logger.error(`Diagnostics failed for device ${deviceId}:`, error);
        }
    }

    /**
     * Run specific diagnostic test
     */
    async runDiagnosticTest(deviceId, testName) {
        const startTime = Date.now();

        switch (testName) {
            case 'connectivity':
                return await this.testConnectivity(deviceId);

            case 'api_responsiveness':
                return await this.testAPIResponsiveness(deviceId);

            case 'resource_utilization':
                return await this.testResourceUtilization(deviceId);

            case 'service_availability':
                return await this.testServiceAvailability(deviceId);

            case 'network_performance':
                return await this.testNetworkPerformance(deviceId);

            default:
                throw new Error(`Unknown diagnostic test: ${testName}`);
        }
    }

    /**
     * Test connectivity
     */
    async testConnectivity(deviceId) {
        const startTime = Date.now();

        try {
            // Simulate connectivity test
            await new Promise(resolve => setTimeout(resolve, 50));

            const responseTime = Date.now() - startTime;

            return {
                status: 'passed',
                responseTime,
                details: {
                    reachable: true,
                    latency: responseTime
                }
            };

        } catch (error) {
            return {
                status: 'failed',
                error: error.message,
                responseTime: Date.now() - startTime
            };
        }
    }

    /**
     * Test API responsiveness
     */
    async testAPIResponsiveness(deviceId) {
        const startTime = Date.now();

        try {
            // Execute multiple API commands and measure response times
            const commands = [
                '/system/resource/print',
                '/interface/print'
            ];

            const results = [];
            for (const command of commands) {
                const cmdStart = Date.now();
                await new Promise(resolve => setTimeout(resolve, 100));
                results.push(Date.now() - cmdStart);
            }

            const avgResponseTime = results.reduce((sum, time) => sum + time, 0) / results.length;

            return {
                status: 'passed',
                averageResponseTime: avgResponseTime,
                results,
                details: {
                    commandsExecuted: commands.length,
                    successRate: 1.0
                }
            };

        } catch (error) {
            return {
                status: 'failed',
                error: error.message,
                responseTime: Date.now() - startTime
            };
        }
    }

    /**
     * Test resource utilization
     */
    async testResourceUtilization(deviceId) {
        try {
            const healthData = await this.executeHealthCheck(deviceId);
            const result = this.processHealthCheck(deviceId, healthData);

            return {
                status: 'passed',
                metrics: result.metrics,
                details: {
                    withinThresholds: result.issues.length === 0,
                    warnings: result.warnings.length
                }
            };

        } catch (error) {
            return {
                status: 'failed',
                error: error.message
            };
        }
    }

    /**
     * Test service availability
     */
    async testServiceAvailability(deviceId) {
        try {
            // Check critical services
            const services = ['www', 'api', 'ssh'];
            const availableServices = [];

            for (const service of services) {
                // Simulate service check
                await new Promise(resolve => setTimeout(resolve, 50));
                availableServices.push({
                    name: service,
                    available: Math.random() > 0.1 // 90% availability
                });
            }

            const availableCount = availableServices.filter(s => s.available).length;
            const totalServices = services.length;

            return {
                status: availableCount === totalServices ? 'passed' : 'warning',
                services: availableServices,
                availability: availableCount / totalServices
            };

        } catch (error) {
            return {
                status: 'failed',
                error: error.message
            };
        }
    }

    /**
     * Test network performance
     */
    async testNetworkPerformance(deviceId) {
        try {
            // Simulate network performance tests
            const tests = [
                { name: 'ping', result: { latency: Math.random() * 100 + 10 } },
                { name: 'bandwidth', result: { download: Math.random() * 1000000, upload: Math.random() * 1000000 } },
                { name: 'packet_loss', result: { loss: Math.random() * 5 } }
            ];

            return {
                status: 'passed',
                tests,
                details: {
                    averageLatency: tests[0].result.latency,
                    totalBandwidth: tests[1].result.download + tests[1].result.upload,
                    packetLoss: tests[2].result.loss
                }
            };

        } catch (error) {
            return {
                status: 'failed',
                error: error.message
            };
        }
    }

    /**
     * Check and trigger alerts
     */
    checkAlerts(deviceId, healthScore, healthResult) {
        const { logger } = this.dependencies;

        const lastAlert = this.alertCooldowns.get(deviceId);
        const now = Date.now();

        // Check cooldown
        if (lastAlert && (now - lastAlert) < this.config.alertCooldown) {
            return;
        }

        let alertLevel = null;
        let alertMessage = null;

        // Determine alert level
        if (healthScore < this.config.criticalAlertThreshold) {
            alertLevel = 'critical';
            alertMessage = `Device ${deviceId} health critically low: ${(healthScore * 100).toFixed(1)}%`;
        } else if (healthScore < this.config.warningAlertThreshold) {
            alertLevel = 'warning';
            alertMessage = `Device ${deviceId} health degraded: ${(healthScore * 100).toFixed(1)}%`;
        }

        if (alertLevel) {
            this.triggerAlert(deviceId, alertLevel, alertMessage, healthScore, healthResult);
        }
    }

    /**
     * Trigger alert
     */
    async triggerAlert(deviceId, level, message, healthScore, healthResult) {
        const { logger, eventBus } = this.dependencies;

        const alert = {
            id: `${deviceId}-${Date.now()}`,
            deviceId,
            level,
            message,
            healthScore,
            healthResult,
            timestamp: Date.now()
        };

        // Store alert
        const alertHistory = this.alertHistory.get(deviceId) || [];
        alertHistory.push(alert);
        this.alertHistory.set(deviceId, alertHistory);

        // Set cooldown
        this.alertCooldowns.set(deviceId, Date.now());

        // Add to active alerts
        this.activeAlerts.add(alert.id);

        // Update statistics
        this.stats.totalAlerts++;

        logger.warn(`Alert triggered: ${message}`);

        // Emit alert event
        this.emit('alert', alert);

        // Publish to event bus
        if (eventBus) {
            await eventBus.publish('mikrotik:alert', alert);
        }
    }

    /**
     * Perform predictive analysis
     */
    performPredictiveAnalysis(deviceId, healthResult) {
        const { logger } = this.dependencies;

        try {
            // Collect trend data
            this.collectTrendData(deviceId, healthResult);

            // Detect anomalies
            const anomalies = this.detectAnomalies(deviceId);

            if (anomalies.length > 0) {
                logger.warn(`Anomalies detected for device ${deviceId}:`, anomalies);

                // Emit anomaly detection event
                this.emit('anomaliesDetected', {
                    deviceId,
                    anomalies,
                    timestamp: Date.now()
                });
            }

        } catch (error) {
            logger.error(`Predictive analysis failed for device ${deviceId}:`, error);
        }
    }

    /**
     * Collect trend data
     */
    collectTrendData(deviceId, healthResult) {
        const trendData = this.trendData.get(deviceId) || {
            healthScores: [],
            responseTimes: [],
            cpuUsage: [],
            memoryUsage: [],
            timestamps: []
        };

        // Add current data
        trendData.healthScores.push(this.healthScores.get(deviceId) || 0);
        trendData.responseTimes.push(healthResult.responseTime || 0);
        trendData.cpuUsage.push(healthResult.metrics.cpu || 0);
        trendData.memoryUsage.push(healthResult.metrics.memory || 0);
        trendData.timestamps.push(Date.now());

        // Keep only recent data
        const maxPoints = 100;
        if (trendData.healthScores.length > maxPoints) {
            trendData.healthScores.splice(0, trendData.healthScores.length - maxPoints);
            trendData.responseTimes.splice(0, trendData.responseTimes.length - maxPoints);
            trendData.cpuUsage.splice(0, trendData.cpuUsage.length - maxPoints);
            trendData.memoryUsage.splice(0, trendData.memoryUsage.length - maxPoints);
            trendData.timestamps.splice(0, trendData.timestamps.length - maxPoints);
        }

        this.trendData.set(deviceId, trendData);
    }

    /**
     * Detect anomalies in metrics
     */
    detectAnomalies(deviceId) {
        const trendData = this.trendData.get(deviceId);
        if (!trendData || trendData.healthScores.length < 10) {
            return [];
        }

        const anomalies = [];

        // Check for unusual drops in health score
        const healthScores = trendData.healthScores;
        const recentScores = healthScores.slice(-5);
        const averageScore = healthScores.slice(0, -5).reduce((sum, score) => sum + score, 0) / (healthScores.length - 5);
        const recentAverage = recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length;

        if (recentAverage < averageScore - this.config.anomalyThreshold * this.calculateStandardDeviation(healthScores)) {
            anomalies.push({
                type: 'health_score_decline',
                severity: 'warning',
                message: `Unusual decline in health score detected`,
                data: {
                    current: recentAverage,
                    historical: averageScore,
                    deviation: this.calculateStandardDeviation(healthScores)
                }
            });
        }

        // Check for unusual resource usage spikes
        const cpuUsage = trendData.cpuUsage;
        if (cpuUsage.length > 0) {
            const recentCPU = cpuUsage.slice(-5);
            const averageCPU = cpuUsage.slice(0, -5).reduce((sum, cpu) => sum + cpu, 0) / (cpuUsage.length - 5);
            const recentCPUAverage = recentCPU.reduce((sum, cpu) => sum + cpu, 0) / recentCPU.length;

            if (recentCPUAverage > averageCPU + this.config.anomalyThreshold * this.calculateStandardDeviation(cpuUsage)) {
                anomalies.push({
                    type: 'cpu_spike',
                    severity: 'warning',
                    message: `Unusual CPU usage spike detected`,
                    data: {
                        current: recentCPUAverage,
                        historical: averageCPU,
                        deviation: this.calculateStandardDeviation(cpuUsage)
                    }
                });
            }
        }

        return anomalies;
    }

    /**
     * Calculate standard deviation
     */
    calculateStandardDeviation(values) {
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        const squaredDifferences = values.map(value => Math.pow(value - mean, 2));
        const variance = squaredDifferences.reduce((sum, diff) => sum + diff, 0) / values.length;
        return Math.sqrt(variance);
    }

    /**
     * Calculate global health score
     */
    calculateGlobalHealthScore() {
        if (this.healthScores.size === 0) {
            this.stats.averageHealthScore = 0;
            return;
        }

        const totalScore = Array.from(this.healthScores.values()).reduce((sum, score) => sum + score, 0);
        this.stats.averageHealthScore = totalScore / this.healthScores.size;
    }

    /**
     * Update health check statistics
     */
    updateHealthCheckStats(deviceId, success, checkTime) {
        this.stats.totalHealthChecks++;

        const checkTimes = this.stats.healthCheckTimes.get(deviceId) || [];
        checkTimes.push(checkTime);

        // Keep only recent times
        if (checkTimes.length > 100) {
            checkTimes.splice(0, checkTimes.length - 100);
        }

        this.stats.healthCheckTimes.set(deviceId, checkTimes);

        // Update uptime/downtime
        const deviceStatus = this.deviceStatus.get(deviceId);
        if (deviceStatus) {
            if (success) {
                const uptime = this.stats.deviceUptime.get(deviceId) || 0;
                this.stats.deviceUptime.set(deviceId, uptime + checkTime);
            } else {
                const downtime = this.stats.deviceDowntime.get(deviceId) || 0;
                this.stats.deviceDowntime.set(deviceId, downtime + checkTime);
            }
        }
    }

    /**
     * Clean up old data
     */
    cleanupOldData() {
        const cutoff = Date.now() - this.config.historyRetention;

        // Clean up response time history
        for (const [deviceId, history] of this.responseTimeHistory) {
            // Keep only recent data points
            if (history.length > this.config.maxHistoryPoints) {
                history.splice(0, history.length - this.config.maxHistoryPoints);
            }
        }

        // Clean up alert history
        for (const [deviceId, alerts] of this.alertHistory) {
            const recentAlerts = alerts.filter(alert => alert.timestamp > cutoff);
            this.alertHistory.set(deviceId, recentAlerts);
        }

        // Clean up trend data
        for (const [deviceId, trendData] of this.trendData) {
            if (trendData.timestamps.length > this.config.maxHistoryPoints) {
                const excess = trendData.timestamps.length - this.config.maxHistoryPoints;
                trendData.healthScores.splice(0, excess);
                trendData.responseTimes.splice(0, excess);
                trendData.cpuUsage.splice(0, excess);
                trendData.memoryUsage.splice(0, excess);
                trendData.timestamps.splice(0, excess);
            }
        }
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        // Event handlers would be set up here
    }

    /**
     * Get device health score
     */
    getDeviceHealthScore(deviceId) {
        return this.healthScores.get(deviceId) || 0;
    }

    /**
     * Get device load (connection count)
     */
    getDeviceLoad(deviceId) {
        const resourceMetrics = this.resourceMetrics.get(deviceId);
        return resourceMetrics ? resourceMetrics.activeUsers || 0 : 0;
    }

    /**
     * Get health metrics
     */
    async getHealthMetrics() {
        const metrics = {};

        for (const deviceId of this.devices.keys()) {
            metrics[deviceId] = {
                healthScore: this.healthScores.get(deviceId) || 0,
                status: this.deviceStatus.get(deviceId)?.status || 'unknown',
                lastCheck: this.lastHealthCheck.get(deviceId),
                resourceMetrics: this.resourceMetrics.get(deviceId) || {},
                responseTime: this.getAverageResponseTime(deviceId),
                errorCount: this.errorCounts.get(deviceId) || 0,
                activeAlerts: this.alertHistory.get(deviceId)?.filter(alert =>
                    Date.now() - alert.timestamp < 3600000 // Last hour
                ) || []
            };
        }

        return {
            devices: metrics,
            global: this.stats
        };
    }

    /**
     * Get average response time for device
     */
    getAverageResponseTime(deviceId) {
        const history = this.responseTimeHistory.get(deviceId) || [];
        if (history.length === 0) {
            return 0;
        }

        return history.reduce((sum, time) => sum + time, 0) / history.length;
    }

    /**
     * Get monitoring statistics
     */
    getStats() {
        return {
            ...this.stats,
            devicesCount: this.devices.size,
            activeDevices: Array.from(this.devices.values()).filter(device => device.enabled).length,
            averageHealthScore: this.stats.averageHealthScore,
            activeAlerts: this.activeAlerts.size
        };
    }

    /**
     * Get device diagnostics
     */
    getDeviceDiagnostics(deviceId) {
        return this.diagnosticResults.get(deviceId) || this.diagnosticCache.get(deviceId);
    }

    /**
     * Get device health status
     */
    getDeviceHealthStatus(deviceId) {
        const device = this.devices.get(deviceId);
        const status = this.deviceStatus.get(deviceId);
        const healthScore = this.healthScores.get(deviceId);
        const resourceMetrics = this.resourceMetrics.get(deviceId);

        if (!device) {
            return null;
        }

        return {
            deviceId,
            enabled: device.enabled,
            status: status?.status || 'unknown',
            healthScore: healthScore || 0,
            lastCheck: status?.lastCheck,
            consecutiveFailures: status?.consecutiveFailures || 0,
            consecutiveSuccesses: status?.consecutiveSuccesses || 0,
            lastError: status?.lastError,
            resourceMetrics: resourceMetrics || {},
            averageResponseTime: this.getAverageResponseTime(deviceId),
            errorCount: this.errorCounts.get(deviceId) || 0,
            recentAlerts: this.alertHistory.get(deviceId)?.slice(-5) || []
        };
    }

    /**
     * Shutdown health monitor
     */
    async shutdown() {
        const { logger } = this.dependencies;

        logger.info('Shutting down Mikrotik Health Monitor...');

        // Stop all monitoring intervals
        for (const [deviceId, intervals] of this.monitoringIntervals) {
            intervals.forEach(interval => clearInterval(interval));
        }
        this.monitoringIntervals.clear();

        // Clear all data structures
        this.devices.clear();
        this.deviceStatus.clear();
        this.healthScores.clear();
        this.lastHealthCheck.clear();
        this.responseTimeHistory.clear();
        this.resourceMetrics.clear();
        this.errorCounts.clear();
        this.availabilityHistory.clear();
        this.trendData.clear();
        this.anomalyDetection.clear();
        this.alertHistory.clear();
        this.alertCooldowns.clear();
        this.diagnosticResults.clear();
        this.diagnosticCache.clear();
        this.activeAlerts.clear();

        logger.info('Mikrotik Health Monitor shutdown complete');
    }
}

module.exports = { MikrotikHealthMonitor };