const EventEmitter = require('events');

/**
 * Connection Recovery Service
 * Periodically checks Mikrotik connection health and attempts recovery
 */
class ConnectionRecoveryService extends EventEmitter {
    constructor(mikrotikClient, checkInterval = 60000) { // 1 minute default
        super();
        this.mikrotik = mikrotikClient;
        this.checkInterval = checkInterval;
        this.isRunning = false;
        this.intervalId = null;
        this.lastCheckTime = null;
        this.consecutiveFailures = 0;
        this.maxConsecutiveFailures = 3;
        this.recoveryInProgress = false;
    }

    /**
     * Start the recovery service
     */
    start() {
        if (this.isRunning) {
            console.log('Connection Recovery Service is already running');
            return;
        }

        console.log(`🔄 Starting Connection Recovery Service (${this.checkInterval}ms interval)...`);
        this.isRunning = true;
        this.consecutiveFailures = 0;

        this.intervalId = setInterval(() => {
            this.performHealthCheck().catch(error => {
                console.error('Health check error:', error);
            });
        }, this.checkInterval);

        // Run first check immediately
        this.performHealthCheck();

        console.log('✅ Connection Recovery Service started');
        this.emit('started');
    }

    /**
     * Stop the recovery service
     */
    stop() {
        if (!this.isRunning) {
            console.log('Connection Recovery Service is not running');
            return;
        }

        console.log('🛑 Stopping Connection Recovery Service...');

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.isRunning = false;
        this.recoveryInProgress = false;
        console.log('✅ Connection Recovery Service stopped');
        this.emit('stopped');
    }

    /**
     * Perform health check and recovery if needed
     */
    async performHealthCheck() {
        if (this.recoveryInProgress) {
            console.log('⏳ Recovery already in progress, skipping health check');
            return;
        }

        try {
            this.lastCheckTime = new Date();
            const connectionInfo = this.mikrotik.getConnectionInfo();

            console.log(`🏥 Connection health check - Status: ${connectionInfo.status}, ` +
                       `Connected: ${connectionInfo.connected}, ` +
                       `Offline: ${connectionInfo.isOffline}`);

            // If connection appears healthy, just do a light check
            if (connectionInfo.connected && !connectionInfo.isOffline) {
                console.log('✅ Connection appears healthy');
                this.consecutiveFailures = 0;
                this.emit('healthy', connectionInfo);
                return;
            }

            // If offline, attempt recovery
            console.log('🔧 Connection unhealthy, attempting recovery...');
            this.recoveryInProgress = true;

            const recovery = await this.attemptRecovery();

            if (recovery.success) {
                console.log('✅ Connection recovery successful');
                this.consecutiveFailures = 0;
                this.emit('recovered', recovery);
            } else {
                this.consecutiveFailures++;
                console.error(`❌ Recovery attempt ${this.consecutiveFailures} failed: ${recovery.error}`);
                this.emit('recoveryFailed', recovery);

                // If too many consecutive failures, increase check interval
                if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
                    console.log(`⚠️ ${this.consecutiveFailures} consecutive failures, increasing check interval`);
                    this.adjustCheckInterval(true);
                }
            }

        } catch (error) {
            this.consecutiveFailures++;
            console.error(`❌ Health check failed: ${error.message}`);
            this.emit('error', error);
        } finally {
            this.recoveryInProgress = false;
        }
    }

    /**
     * Attempt to recover the connection
     */
    async attemptRecovery() {
        try {
            console.log('🔄 Starting connection recovery...');

            // Step 1: Force disconnect
            console.log('📌 Step 1: Forcing disconnect...');
            await this.mikrotik.disconnect();

            // Wait a moment before reconnecting
            await this.sleep(2000);

            // Step 2: Attempt to reconnect with fresh connection
            console.log('🔌 Step 2: Attempting fresh connection...');
            const connected = await this.mikrotik.connect();

            if (!connected) {
                throw new Error('Reconnection failed');
            }

            // Step 3: Test connection with a simple command
            console.log('🧪 Step 3: Testing connection...');
            const healthResult = await this.mikrotik.healthCheck();

            if (!healthResult.healthy) {
                throw new Error(healthResult.message);
            }

            console.log('✅ Connection recovery completed successfully');
            return {
                success: true,
                message: 'Connection recovered successfully',
                duration: healthResult.duration,
                timestamp: new Date()
            };

        } catch (error) {
            console.error(`❌ Recovery failed: ${error.message}`);
            return {
                success: false,
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    /**
     * Adjust check interval based on connection stability
     */
    adjustCheckInterval(increase = false) {
        if (increase) {
            // Increase interval for unstable connections
            this.checkInterval = Math.min(this.checkInterval * 2, 300000); // Max 5 minutes
            console.log(`⏰ Increased check interval to ${this.checkInterval}ms`);
        } else {
            // Decrease interval for stable connections
            this.checkInterval = Math.max(this.checkInterval / 2, 30000); // Min 30 seconds
            console.log(`⏰ Decreased check interval to ${this.checkInterval}ms`);
        }

        // Restart with new interval
        if (this.isRunning) {
            this.stop();
            this.start();
        }
    }

    /**
     * Force manual recovery
     */
    async forceRecovery() {
        console.log('🔄 Manual recovery triggered...');
        this.recoveryInProgress = true;

        try {
            const result = await this.attemptRecovery();

            if (result.success) {
                this.consecutiveFailures = 0;
                this.adjustCheckInterval(false); // Decrease interval on successful recovery
            }

            return result;
        } finally {
            this.recoveryInProgress = false;
        }
    }

    /**
     * Get recovery service statistics
     */
    getStatistics() {
        return {
            isRunning: this.isRunning,
            checkInterval: this.checkInterval,
            lastCheckTime: this.lastCheckTime,
            consecutiveFailures: this.consecutiveFailures,
            maxConsecutiveFailures: this.maxConsecutiveFailures,
            recoveryInProgress: this.recoveryInProgress,
            connectionInfo: this.mikrotik.getConnectionInfo()
        };
    }

    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = ConnectionRecoveryService;