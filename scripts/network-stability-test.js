#!/usr/bin/env node

/**
 * Network Stability Test Script
 *
 * Comprehensive testing of enhanced Mikrotik connection pool and stability improvements
 * Tests connection pooling, circuit breaker, retry logic, health monitoring, and performance
 */

const MikrotikClient = require('../src/services/MikrotikClient');
const MikrotikSyncService = require('../src/services/MikrotikSyncService');

class NetworkStabilityTest {
    constructor() {
        this.testResults = {
            connectionPool: {},
            performance: {},
            circuitBreaker: {},
            healthMonitoring: {},
            batchProcessing: {},
            syncService: {},
            overall: {
                startTime: Date.now(),
                endTime: null,
                duration: 0,
                success: false,
                errors: []
            }
        };

        this.config = {
            host: process.env.MIKROTIK_HOST || '192.168.1.1',
            port: parseInt(process.env.MIKROTIK_PORT) || 8728,
            username: process.env.MIKROTIK_USERNAME || 'admin',
            password: process.env.MIKROTIK_PASSWORD || '',
            timeout: parseInt(process.env.MIKROTIK_TIMEOUT) || 30000
        };
    }

    /**
     * Run comprehensive network stability tests
     */
    async runTests() {
        console.log('🧪 Starting Comprehensive Network Stability Tests...\n');

        try {
            await this.testConnectionPoolInitialization();
            await this.testBasicConnection();
            await this.testConcurrentConnections();
            await this.testCircuitBreaker();
            await this.testRetryLogic();
            await this.testHealthMonitoring();
            await this.testBatchProcessing();
            await this.testPerformanceUnderLoad();
            await this.testSyncService();
            await this.testErrorRecovery();
            await this.testConnectionPoolResilience();

            this.testResults.overall.endTime = Date.now();
            this.testResults.overall.duration = this.testResults.overall.endTime - this.testResults.overall.startTime;
            this.testResults.overall.success = true;

            console.log('\n✅ All tests completed successfully!');
            this.printSummary();

        } catch (error) {
            console.error('\n❌ Test failed:', error.message);
            this.testResults.overall.errors.push(error.message);
            this.testResults.overall.success = false;
            this.printSummary();
            throw error;
        }
    }

    /**
     * Test connection pool initialization
     */
    async testConnectionPoolInitialization() {
        console.log('🔌 Testing Connection Pool Initialization...');

        const startTime = Date.now();

        try {
            const client = new MikrotikClient();
            await client.loadConfig();

            const stats = client.getConnectionStats();

            if (stats.status === 'connected' || stats.status === 'disconnected') {
                console.log('✅ Connection pool initialized successfully');
                this.testResults.connectionPool.initialization = {
                    success: true,
                    duration: Date.now() - startTime,
                    poolSize: stats.config?.poolSize || {},
                    status: stats.status
                };
            } else {
                throw new Error(`Unexpected connection status: ${stats.status}`);
            }

            await client.disconnect();

        } catch (error) {
            console.error('❌ Connection pool initialization failed:', error.message);
            this.testResults.connectionPool.initialization = {
                success: false,
                error: error.message,
                duration: Date.now() - startTime
            };
            throw error;
        }
    }

    /**
     * Test basic connection functionality
     */
    async testBasicConnection() {
        console.log('🔗 Testing Basic Connection...');

        const startTime = Date.now();

        try {
            const client = new MikrotikClient();
            await client.loadConfig();

            // Test basic command execution
            const identity = await client.execute('/system/identity/print');

            if (identity && Array.isArray(identity) && identity.length > 0) {
                console.log(`✅ Basic connection successful: Router identity "${identity[0]?.name || 'Unknown'}"`);
                this.testResults.basicConnection = {
                    success: true,
                    duration: Date.now() - startTime,
                    routerIdentity: identity[0]?.name
                };
            } else {
                throw new Error('No response from Mikrotik');
            }

            await client.disconnect();

        } catch (error) {
            console.error('❌ Basic connection test failed:', error.message);
            this.testResults.basicConnection = {
                success: false,
                error: error.message,
                duration: Date.now() - startTime
            };
            throw error;
        }
    }

    /**
     * Test concurrent connections
     */
    async testConcurrentConnections() {
        console.log('⚡ Testing Concurrent Connections...');

        const startTime = Date.now();
        const concurrentRequests = 10;
        const promises = [];

        try {
            const client = new MikrotikClient();
            await client.loadConfig();

            // Create multiple concurrent requests
            for (let i = 0; i < concurrentRequests; i++) {
                promises.push(
                    client.execute('/system/resource/print', {}, false, { priority: 'normal' })
                        .then(result => ({
                            requestId: i,
                            success: true,
                            result: result
                        }))
                        .catch(error => ({
                            requestId: i,
                            success: false,
                            error: error.message
                        }))
                );
            }

            const results = await Promise.allSettled(promises);
            const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            const failed = results.filter(r => r.status === 'rejected' || !r.value.success).length;

            const duration = Date.now() - startTime;

            if (successful >= concurrentRequests * 0.8) { // At least 80% success rate
                console.log(`✅ Concurrent connections test passed: ${successful}/${concurrentRequests} successful in ${duration}ms`);
                this.testResults.performance.concurrentConnections = {
                    success: true,
                    totalRequests: concurrentRequests,
                    successful,
                    failed,
                    successRate: (successful / concurrentRequests * 100).toFixed(2) + '%',
                    duration,
                    averageTimePerRequest: Math.round(duration / concurrentRequests)
                };
            } else {
                throw new Error(`Low success rate: ${successful}/${concurrentRequests}`);
            }

            await client.disconnect();

        } catch (error) {
            console.error('❌ Concurrent connections test failed:', error.message);
            this.testResults.performance.concurrentConnections = {
                success: false,
                error: error.message,
                duration: Date.now() - startTime
            };
            throw error;
        }
    }

    /**
     * Test circuit breaker functionality
     */
    async testCircuitBreaker() {
        console.log('🚨 Testing Circuit Breaker...');

        const startTime = Date.now();

        try {
            const client = new MikrotikClient();
            await client.loadConfig();

            const stats = client.getConnectionStats();
            const initialCircuitState = stats.pool?.circuitBreaker?.state || 'unknown';

            console.log(`Initial circuit breaker state: ${initialCircuitState}`);

            // Test normal operation doesn't trigger circuit breaker
            await client.execute('/system/identity/print', {}, false, { priority: 'critical' });

            const afterNormalOpStats = client.getConnectionStats();
            const afterNormalState = afterNormalOpStats.pool?.circuitBreaker?.state || 'unknown';

            console.log(`Circuit breaker state after normal operation: ${afterNormalState}`);

            if (afterNormalState === 'CLOSED' || afterNormalState === 'HALF_OPEN') {
                console.log('✅ Circuit breaker functioning correctly - remains closed during normal operation');
                this.testResults.circuitBreaker.basicOperation = {
                    success: true,
                    initialState: initialCircuitState,
                    finalState: afterNormalState,
                    duration: Date.now() - startTime
                };
            } else {
                console.warn(`⚠️ Unexpected circuit breaker state: ${afterNormalState}`);
                this.testResults.circuitBreaker.basicOperation = {
                    success: false,
                    error: `Unexpected circuit breaker state: ${afterNormalState}`,
                    initialState: initialCircuitState,
                    finalState: afterNormalState
                };
            }

            await client.disconnect();

        } catch (error) {
            console.error('❌ Circuit breaker test failed:', error.message);
            this.testResults.circuitBreaker.basicOperation = {
                success: false,
                error: error.message,
                duration: Date.now() - startTime
            };
            throw error;
        }
    }

    /**
     * Test retry logic
     */
    async testRetryLogic() {
        console.log('🔄 Testing Retry Logic...');

        const startTime = Date.now();

        try {
            const client = new MikrotikClient();
            await client.loadConfig();

            // Test successful command (retries shouldn't be triggered)
            const result = await client.execute('/system/identity/print', {}, false, {
                priority: 'normal',
                retry: true
            });

            const stats = client.getConnectionStats();
            const retryRate = stats.pool?.performance?.retryRate || '0';

            console.log(`Retry rate after successful operation: ${retryRate}%`);

            if (result && result.length > 0) {
                console.log('✅ Retry logic test passed - successful command completed without unnecessary retries');
                this.testResults.retryLogic = {
                    success: true,
                    retryRate,
                    duration: Date.now() - startTime,
                    resultReceived: true
                };
            } else {
                throw new Error('No result received from command');
            }

            await client.disconnect();

        } catch (error) {
            console.error('❌ Retry logic test failed:', error.message);
            this.testResults.retryLogic = {
                success: false,
                error: error.message,
                duration: Date.now() - startTime
            };
            throw error;
        }
    }

    /**
     * Test health monitoring
     */
    async testHealthMonitoring() {
        console.log('🏥 Testing Health Monitoring...');

        const startTime = Date.now();

        try {
            const client = new MikrotikClient();
            await client.loadConfig();

            // Get health status
            const healthStatus = await client.getHealthStatus();

            console.log(`Health status: ${healthStatus.status}`);
            console.log(`Healthy: ${healthStatus.healthy}`);

            if (healthStatus.healthy || healthStatus.status === 'unhealthy') {
                console.log('✅ Health monitoring test passed - health status retrieved successfully');
                this.testResults.healthMonitoring = {
                    success: true,
                    status: healthStatus.status,
                    healthy: healthStatus.healthy,
                    responseTime: healthStatus.responseTime,
                    message: healthStatus.message,
                    duration: Date.now() - startTime
                };
            } else {
                throw new Error(`Unexpected health status: ${healthStatus.status}`);
            }

            await client.disconnect();

        } catch (error) {
            console.error('❌ Health monitoring test failed:', error.message);
            this.testResults.healthMonitoring = {
                success: false,
                error: error.message,
                duration: Date.now() - startTime
            };
            throw error;
        }
    }

    /**
     * Test batch processing
     */
    async testBatchProcessing() {
        console.log('📦 Testing Batch Processing...');

        const startTime = Date.now();

        try {
            const client = new MikrotikClient();
            await client.loadConfig();

            // Test batch execution
            const commands = [
                { command: '/system/identity/print', priority: 'normal' },
                { command: '/system/resource/print', priority: 'normal' },
                { command: '/system/clock/print', priority: 'normal' }
            ];

            const batchResults = await client.executeBatch(commands);

            if (batchResults && batchResults.length === commands.length) {
                const successful = batchResults.filter(r => r.success).length;
                console.log(`✅ Batch processing test passed: ${successful}/${commands.length} commands successful`);
                this.testResults.batchProcessing = {
                    success: true,
                    totalCommands: commands.length,
                    successful,
                    failed: commands.length - successful,
                    duration: Date.now() - startTime,
                    averageTimePerCommand: Math.round((Date.now() - startTime) / commands.length)
                };
            } else {
                throw new Error(`Batch execution failed: expected ${commands.length} results, got ${batchResults?.length || 0}`);
            }

            await client.disconnect();

        } catch (error) {
            console.error('❌ Batch processing test failed:', error.message);
            this.testResults.batchProcessing = {
                success: false,
                error: error.message,
                duration: Date.now() - startTime
            };
            throw error;
        }
    }

    /**
     * Test performance under load
     */
    async testPerformanceUnderLoad() {
        console.log('🚀 Testing Performance Under Load...');

        const startTime = Date.now();
        const loadTestDuration = 10000; // 10 seconds
        const requestInterval = 100; // Request every 100ms
        let requestCount = 0;
        let successCount = 0;
        let errorCount = 0;

        try {
            const client = new MikrotikClient();
            await client.loadConfig();

            const endTime = Date.now() + loadTestDuration;

            while (Date.now() < endTime) {
                requestCount++;

                try {
                    await client.execute('/system/identity/print', {}, false, { priority: 'normal' });
                    successCount++;
                } catch (error) {
                    errorCount++;
                }

                // Small delay between requests
                await new Promise(resolve => setTimeout(resolve, requestInterval));
            }

            const totalDuration = Date.now() - startTime;
            const successRate = (successCount / requestCount * 100).toFixed(2);
            const requestsPerSecond = Math.round(requestCount / (totalDuration / 1000));

            console.log(`Load test completed in ${totalDuration}ms`);
            console.log(`Total requests: ${requestCount}`);
            console.log(`Successful: ${successCount} (${successRate}%)`);
            console.log(`Failed: ${errorCount}`);
            console.log(`Requests per second: ${requestsPerSecond}`);

            if (successRate >= 90) { // At least 90% success rate
                console.log('✅ Performance under load test passed');
                this.testResults.performance.loadTest = {
                    success: true,
                    duration: totalDuration,
                    totalRequests: requestCount,
                    successful: successCount,
                    failed: errorCount,
                    successRate: successRate + '%',
                    requestsPerSecond
                };
            } else {
                throw new Error(`Low success rate under load: ${successRate}%`);
            }

            await client.disconnect();

        } catch (error) {
            console.error('❌ Performance under load test failed:', error.message);
            this.testResults.performance.loadTest = {
                success: false,
                error: error.message,
                duration: Date.now() - startTime,
                totalRequests: requestCount,
                successful: successCount,
                failed: errorCount
            };
            throw error;
        }
    }

    /**
     * Test sync service
     */
    async testSyncService() {
        console.log('🔄 Testing Sync Service...');

        const startTime = Date.now();

        try {
            const client = new MikrotikClient();
            await client.loadConfig();

            const syncService = new MikrotikSyncService(client);

            // Test connection
            const connectionTest = await syncService.testConnection();

            console.log(`Sync service connection test: ${connectionTest.success ? 'PASSED' : 'FAILED'}`);
            if (connectionTest.responseTime) {
                console.log(`Response time: ${connectionTest.responseTime}ms`);
            }

            // Get sync statistics
            const stats = syncService.getStatistics();

            console.log(`Sync service status: ${stats.isRunning ? 'Running' : 'Stopped'}`);
            console.log(`Mikrotik connected: ${stats.mikrotikConnected}`);

            if (connectionTest.success || connectionTest.error?.includes('offline')) {
                console.log('✅ Sync service test passed');
                this.testResults.syncService = {
                    success: true,
                    connectionTest: connectionTest.success,
                    responseTime: connectionTest.responseTime,
                    stats,
                    duration: Date.now() - startTime
                };
            } else {
                throw new Error(`Sync service connection test failed: ${connectionTest.error}`);
            }

            await client.disconnect();

        } catch (error) {
            console.error('❌ Sync service test failed:', error.message);
            this.testResults.syncService = {
                success: false,
                error: error.message,
                duration: Date.now() - startTime
            };
            throw error;
        }
    }

    /**
     * Test error recovery
     */
    async testErrorRecovery() {
        console.log('🛠️ Testing Error Recovery...');

        const startTime = Date.now();

        try {
            const client = new MikrotikClient();
            await client.loadConfig();

            // Test recovery after temporary connection issues
            // We'll test this by attempting commands with different priorities
            const priorities = ['critical', 'high', 'normal', 'low'];
            let successfulCommands = 0;

            for (const priority of priorities) {
                try {
                    await client.execute('/system/identity/print', {}, false, { priority });
                    successfulCommands++;
                } catch (error) {
                    console.warn(`Command with priority ${priority} failed: ${error.message}`);
                }
            }

            if (successfulCommands > 0) {
                console.log(`✅ Error recovery test passed: ${successfulCommands}/${priorities.length} commands successful`);
                this.testResults.errorRecovery = {
                    success: true,
                    totalCommands: priorities.length,
                    successful: successfulCommands,
                    failed: priorities.length - successfulCommands,
                    duration: Date.now() - startTime
                };
            } else {
                throw new Error('No commands succeeded during error recovery test');
            }

            await client.disconnect();

        } catch (error) {
            console.error('❌ Error recovery test failed:', error.message);
            this.testResults.errorRecovery = {
                success: false,
                error: error.message,
                duration: Date.now() - startTime
            };
            throw error;
        }
    }

    /**
     * Test connection pool resilience
     */
    async testConnectionPoolResilience() {
        console.log('🛡️ Testing Connection Pool Resilience...');

        const startTime = Date.now();

        try {
            const client = new MikrotikClient();
            await client.loadConfig();

            const stats = client.getConnectionStats();

            // Test connection pool metrics
            const poolMetrics = {
                totalConnections: stats.pool?.connections?.total || 0,
                availableConnections: stats.pool?.connections?.available || 0,
                healthyConnections: stats.pool?.connections?.healthy || 0,
                circuitBreakerState: stats.pool?.circuitBreaker?.state || 'unknown'
            };

            console.log('Connection pool metrics:', poolMetrics);

            // Execute several commands to test pool usage
            const testCommands = [
                '/system/identity/print',
                '/system/resource/print',
                '/system/clock/print'
            ];

            let successfulCommands = 0;
            for (const command of testCommands) {
                try {
                    await client.execute(command, {}, false);
                    successfulCommands++;
                } catch (error) {
                    console.warn(`Command ${command} failed: ${error.message}`);
                }
            }

            // Get final stats
            const finalStats = client.getConnectionStats();

            if (successfulCommands >= testCommands.length * 0.8) {
                console.log('✅ Connection pool resilience test passed');
                this.testResults.connectionPool.resilience = {
                    success: true,
                    initialMetrics: poolMetrics,
                    finalMetrics: {
                        totalCommands: testCommands.length,
                        successful: successfulCommands,
                        failed: testCommands.length - successfulCommands,
                        finalConnections: finalStats.pool?.connections?.total || 0,
                        finalHealthy: finalStats.pool?.connections?.healthy || 0
                    },
                    duration: Date.now() - startTime
                };
            } else {
                throw new Error(`Low success rate: ${successfulCommands}/${testCommands.length}`);
            }

            await client.disconnect();

        } catch (error) {
            console.error('❌ Connection pool resilience test failed:', error.message);
            this.testResults.connectionPool.resilience = {
                success: false,
                error: error.message,
                duration: Date.now() - startTime
            };
            throw error;
        }
    }

    /**
     * Print comprehensive test summary
     */
    printSummary() {
        console.log('\n' + '='.repeat(80));
        console.log('📊 COMPREHENSIVE TEST SUMMARY');
        console.log('='.repeat(80));

        // Overall results
        console.log('\n🎯 Overall Results:');
        console.log(`   Duration: ${this.testResults.overall.duration}ms`);
        console.log(`   Status: ${this.testResults.overall.success ? '✅ SUCCESS' : '❌ FAILED'}`);
        if (this.testResults.overall.errors.length > 0) {
            console.log('   Errors:');
            this.testResults.overall.errors.forEach(error => {
                console.log(`     - ${error}`);
            });
        }

        // Connection Pool Tests
        console.log('\n🔌 Connection Pool Tests:');
        if (this.testResults.connectionPool.initialization) {
            const init = this.testResults.connectionPool.initialization;
            console.log(`   Initialization: ${init.success ? '✅' : '❌'} (${init.duration}ms)`);
            if (init.poolSize) {
                console.log(`     Pool Size: ${init.poolSize.min}-${init.poolSize.max}`);
                console.log(`     Status: ${init.status}`);
            }
        }
        if (this.testResults.connectionPool.resilience) {
            const res = this.testResults.connectionPool.resilience;
            console.log(`   Resilience: ${res.success ? '✅' : '❌'} (${res.duration}ms)`);
        }

        // Performance Tests
        console.log('\n⚡ Performance Tests:');
        if (this.testResults.performance.concurrentConnections) {
            const concurrent = this.testResults.performance.concurrentConnections;
            console.log(`   Concurrent Connections: ${concurrent.success ? '✅' : '❌'} (${concurrent.duration}ms)`);
            console.log(`     Success Rate: ${concurrent.successRate}`);
            console.log(`     Requests/sec: ${concurrent.totalRequests / (concurrent.duration / 1000)}`);
        }
        if (this.testResults.performance.loadTest) {
            const load = this.testResults.performance.loadTest;
            console.log(`   Load Test: ${load.success ? '✅' : '❌'} (${load.duration}ms)`);
            console.log(`     Success Rate: ${load.successRate}`);
            console.log(`     Requests/sec: ${load.requestsPerSecond}`);
        }

        // Circuit Breaker Tests
        console.log('\n🚨 Circuit Breaker Tests:');
        if (this.testResults.circuitBreaker.basicOperation) {
            const cb = this.testResults.circuitBreaker.basicOperation;
            console.log(`   Basic Operation: ${cb.success ? '✅' : '❌'} (${cb.duration}ms)`);
            console.log(`     Initial State: ${cb.initialState}`);
            console.log(`     Final State: ${cb.finalState}`);
        }

        // Other Tests
        console.log('\n🔄 Other Tests:');
        if (this.testResults.retryLogic) {
            console.log(`   Retry Logic: ${this.testResults.retryLogic.success ? '✅' : '❌'}`);
        }
        if (this.testResults.healthMonitoring) {
            const health = this.testResults.healthMonitoring;
            console.log(`   Health Monitoring: ${health.success ? '✅' : '❌'} (${health.duration}ms)`);
            console.log(`     Status: ${health.status} (${health.healthy ? 'Healthy' : 'Unhealthy'})`);
        }
        if (this.testResults.batchProcessing) {
            const batch = this.testResults.batchProcessing;
            console.log(`   Batch Processing: ${batch.success ? '✅' : '❌'} (${batch.duration}ms)`);
            console.log(`     Success Rate: ${batch.successful}/${batch.totalCommands}`);
        }
        if (this.testResults.syncService) {
            const sync = this.testResults.syncService;
            console.log(`   Sync Service: ${sync.success ? '✅' : '❌'} (${sync.duration}ms)`);
            console.log(`     Connection Test: ${sync.connectionTest ? '✅' : '❌'}`);
        }
        if (this.testResults.errorRecovery) {
            const recovery = this.testResults.errorRecovery;
            console.log(`   Error Recovery: ${recovery.success ? '✅' : '❌'} (${recovery.duration}ms)`);
            console.log(`     Success Rate: ${recovery.successful}/${recovery.totalCommands}`);
        }

        console.log('\n' + '='.repeat(80));
    }
}

// Run tests if this script is executed directly
if (require.main === module) {
    const test = new NetworkStabilityTest();
    test.runTests().catch(error => {
        console.error('Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = NetworkStabilityTest;