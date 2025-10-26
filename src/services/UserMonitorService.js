const EventEmitter = require('events');
const QueryHelper = require('../lib/QueryHelper');

/**
 * User Monitor Service - Replaces profile scripts with 30-second polling
 * Monitors Mikrotik user lists for first login detection and expiry management
 */
class UserMonitorService extends EventEmitter {
    constructor(mikrotikClient, whatsappService, dbPool = null) {
        super();
        this.mikrotik = mikrotikClient;
        this.whatsapp = whatsappService;
        // Use QueryHelper for all database operations
        this.query = QueryHelper;
        this.isRunning = false;
        this.pollInterval = 60000; // Increased to 60 seconds to reduce connection frequency
        this.intervalId = null;
        this.lastPollTime = null;
        this.knownUsers = new Map(); // Cache of known users
        this.activeSessions = new Map(); // Track active sessions
    }

    /**
     * Start the monitoring service
     */
    async start() {
        if (this.isRunning) {
            console.log('User Monitor Service is already running');
            return;
        }

        try {
            console.log('🔍 Starting User Monitor Service (60-second polling)...');

            // Initialize known users cache
            await this.initializeKnownUsers();

            // Start polling
            this.isRunning = true;
            this.intervalId = setInterval(() => {
                this.pollUsers().catch(error => {
                    console.error('Error in user polling:', error);
                });
            }, this.pollInterval);

            // Run first poll immediately
            await this.pollUsers();

            console.log('✅ User Monitor Service started successfully');
            this.emit('started');

        } catch (error) {
            console.error('❌ Failed to start User Monitor Service:', error);
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Stop the monitoring service
     */
    async stop() {
        if (!this.isRunning) {
            console.log('User Monitor Service is not running');
            return;
        }

        console.log('🛑 Stopping User Monitor Service...');

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.isRunning = false;
        console.log('✅ User Monitor Service stopped');
        this.emit('stopped');
    }

    /**
     * Initialize known users cache
     */
    async initializeKnownUsers() {
        try {
            // Get all voucher users from database
            const vouchersResult = await QueryHelper.getMany(
                'SELECT * FROM vouchers WHERE status IN (?, ?, ?)',
                ['unused', 'used', 'expired']
            );

            const vouchers = vouchersResult.rows || vouchersResult || [];
            vouchers.forEach(voucher => {
                // Use username field instead of code
                const username = voucher.username || voucher.code;
                this.knownUsers.set(username, {
                    type: 'voucher',
                    status: voucher.status,
                    firstLogin: voucher.used_at,
                    expiresAt: voucher.expires_at
                });
            });

            // Get all PPPoE users from database
            const pppoeResult = await QueryHelper.getMany(
                'SELECT * FROM pppoe_users WHERE status IN (?, ?)',
                ['active', 'expired']
            );

            const pppoeUsers = pppoeResult.rows || pppoeResult || [];
            pppoeUsers.forEach(user => {
                this.knownUsers.set(user.username, {
                    type: 'pppoe',
                    status: user.status,
                    expiryDate: user.expires_at
                });
            });

            console.log(`📊 Initialized cache with ${this.knownUsers.size} known users`);

        } catch (error) {
            console.error('Error initializing known users:', error);
            throw error;
        }
    }

    /**
     * Main polling function with enhanced offline handling and exponential backoff
     */
    async pollUsers() {
        try {
            const startTime = Date.now();
            this.lastPollTime = new Date();

            // Enhanced connection check with health verification
            if (!this.mikrotik || !this.mikrotik.isConnected()) {
                console.log('⚠️ Mikrotik is not connected, attempting health check...');

                // Try to recover connection
                const healthResult = await this.mikrotik.healthCheck();
                if (!healthResult.healthy) {
                    console.log(`⚠️ Mikrotik is offline, skipping user poll: ${healthResult.message}`);

                    // Implement exponential backoff for failed connections
                    this.handleConnectionFailure();
                    return;
                } else {
                    console.log('✅ Mikrotik connection recovered via health check');
                    this.connectionFailureCount = 0; // Reset failure counter
                }
            }

            // Poll hotspot users
            await this.pollHotspotUsers();

            // Poll PPPoE users
            await this.pollPPPoEUsers();

            // Clean up expired users
            await this.cleanupExpiredUsers();

            const duration = Date.now() - startTime;
            console.log(`🔍 User poll completed in ${duration}ms`);

            // Reset connection failure count on successful poll
            this.connectionFailureCount = 0;

        } catch (error) {
            console.error('Error in pollUsers:', error);

            // Handle connection errors with exponential backoff
            if (this.isConnectionError(error)) {
                this.handleConnectionFailure();
                return;
            }

            // Only emit non-connection errors
            this.emit('error', error);
        }
    }

    /**
     * Handle connection failures with exponential backoff
     */
    handleConnectionFailure() {
        this.connectionFailureCount = (this.connectionFailureCount || 0) + 1;

        // Calculate backoff delay: 30s, 60s, 120s, 240s, max 300s (5 minutes)
        const backoffDelay = Math.min(
            this.pollInterval * Math.pow(2, this.connectionFailureCount - 1),
            300000 // 5 minutes maximum
        );

        console.log(`🔄 Connection failure #${this.connectionFailureCount}, next poll in ${backoffDelay/1000}s`);

        // Clear existing interval and set new one with backoff
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }

        // Schedule next poll with backoff delay
        setTimeout(() => {
            if (this.isRunning) {
                this.intervalId = setInterval(() => {
                    this.pollUsers().catch(error => {
                        console.error('Error in user polling:', error);
                    });
                }, this.pollInterval);

                // Run immediate poll after backoff
                this.pollUsers().catch(error => {
                    console.error('Error in backoff poll:', error);
                });
            }
        }, backoffDelay);
    }

    /**
     * Check if error is a connection-related error
     */
    isConnectionError(error) {
        const connectionErrors = [
            'timeout',
            'connection',
            'ECONNREFUSED',
            'ETIMEDOUT',
            'ENOTFOUND',
            'EHOSTUNREACH',
            'socket hang up',
            'read ECONNRESET',
            'write ECONNRESET'
        ];

        return connectionErrors.some(err =>
            error.message.toLowerCase().includes(err.toLowerCase())
        );
    }

    /**
     * Poll hotspot users for first login detection with offline handling
     */
    async pollHotspotUsers() {
        try {
            // Check if Mikrotik is connected
            if (!this.mikrotik.isConnected()) {
                return;
            }

            // Get active hotspot users
            const activeUsers = await this.mikrotik.getActiveHotspotUsers();
            const currentUsernames = new Set();

            for (const user of activeUsers) {
                currentUsernames.add(user.name);
                const knownUser = this.knownUsers.get(user.name);

                // Check if this is a voucher user
                if (user.comment && user.comment.includes('VOUCHER_SYSTEM')) {
                    const commentData = this.mikrotik.parseComment(user.comment);

                    // Check for first login
                    if (commentData && !commentData.first_login_timestamp && user.uptime !== '0s') {
                        console.log(`🎯 First login detected: ${user.name} from ${user.address}`);

                        await this.handleFirstLogin(user, 'hotspot');
                    }

                    // Update session tracking
                    this.activeSessions.set(user.name, {
                        type: 'hotspot',
                        loginTime: new Date(),
                        ip: user.address,
                        uptime: user.uptime,
                        mac: user.mac_address
                    });
                }
            }

            // Check for users who logged out
            for (const [username, session] of this.activeSessions) {
                if (session.type === 'hotspot' && !currentUsernames.has(username)) {
                    console.log(`📤 User logged out: ${username}`);
                    await this.handleLogout(username, session);
                    this.activeSessions.delete(username);
                }
            }

        } catch (error) {
            console.error('Error polling hotspot users:', error);
        }
    }

    /**
     * Poll PPPoE users for connection monitoring with offline handling
     */
    async pollPPPoEUsers() {
        try {
            // Check if Mikrotik is connected
            if (!this.mikrotik.isConnected()) {
                return;
            }

            // Get active PPPoE connections
            const activeConnections = await this.mikrotik.getActivePPPoEUsers();
            const currentUsers = new Set();

            for (const connection of activeConnections) {
                currentUsers.add(connection.name);

                // Track PPPoE sessions
                this.activeSessions.set(connection.name, {
                    type: 'pppoe',
                    connectTime: new Date(),
                    callerId: connection.callerId,
                    uptime: connection.uptime
                });
            }

            // Check for disconnected users
            for (const [username, session] of this.activeSessions) {
                if (session.type === 'pppoe' && !currentUsers.has(username)) {
                    console.log(`📤 PPPoE user disconnected: ${username}`);
                    await this.handlePPPoEDisconnect(username, session);
                    this.activeSessions.delete(username);
                }
            }

        } catch (error) {
            console.error('Error polling PPPoE users:', error);
        }
    }

    /**
     * Handle first login detection
     */
    async handleFirstLogin(user, userType) {
        try {
            const now = new Date();
            const timestamp = Math.floor(now.getTime() / 1000);

            if (userType === 'hotspot') {
                // Update voucher first login
                await QueryHelper.execute(`
                    UPDATE vouchers
                    SET used_at = NOW(), status = 'used'
                    WHERE username = ?
                `, [user.name]);

                // Update Mikrotik user comment
                const commentData = this.mikrotik.parseComment(user.comment) || {};
                await this.mikrotik.updateVoucherUserComment(
                    user.name,
                    timestamp.toString(),
                    commentData.valid_until_timestamp
                );

                // Get customer info for notification
                const voucher = await QueryHelper.getOne(
                    `SELECT v.*, c.id as customer_id, c.name, c.phone
                     FROM vouchers v
                     LEFT JOIN pppoe_users p ON v.username = p.username
                     LEFT JOIN customers c ON p.customer_id = c.id
                     WHERE v.username = ?`,
                    [user.name]
                );

                // Send WhatsApp notification
                if (voucher && voucher.customer_id && voucher.phone && this.whatsapp) {
                    try {
                        await this.whatsapp.sendNotification(voucher.customer_id, 'voucher_first_login', {
                            voucher_code: user.name,
                            ip: user.address,
                            customer_name: voucher.name
                        });
                        console.log(`📱 WhatsApp notification sent for first login: ${user.name}`);
                    } catch (notifError) {
                        console.error('Error sending WhatsApp notification:', notifError);
                    }
                }

                // Update known users cache
                this.knownUsers.set(user.name, {
                    type: 'voucher',
                    status: 'used',
                    firstLogin: now
                });

                // Emit event
                this.emit('firstLogin', {
                    username: user.name,
                    type: 'voucher',
                    ip: user.address,
                    timestamp: now
                });
            }

        } catch (error) {
            console.error(`Error handling first login for ${user.name}:`, error);
        }
    }

    /**
     * Handle user logout
     */
    async handleLogout(username, session) {
        try {
            // Log session data
            await QueryHelper.insert(`
                INSERT INTO activity_logs (username, session_type, login_time, logout_time, ip_address, duration)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                username,
                session.type,
                session.loginTime.toISOString(),
                new Date().toISOString(),
                session.ip,
                Math.floor((new Date() - session.loginTime) / 1000)
            ]);

            // Emit logout event
            this.emit('logout', {
                username,
                sessionType: session.type,
                duration: new Date() - session.loginTime
            });

        } catch (error) {
            console.error(`Error handling logout for ${username}:`, error);
        }
    }

    /**
     * Handle PPPoE disconnect
     */
    async handlePPPoEDisconnect(username, session) {
        try {
            // Log PPPoE session
            await QueryHelper.insert(`
                INSERT INTO activity_logs (username, session_type, connect_time, disconnect_time, caller_id, uptime)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                username,
                'pppoe',
                session.connectTime.toISOString(),
                new Date().toISOString(),
                session.callerId,
                session.uptime
            ]);

            // Emit PPPoE disconnect event
            this.emit('pppoeDisconnect', {
                username,
                callerId: session.callerId,
                uptime: session.uptime
            });

        } catch (error) {
            console.error(`Error handling PPPoE disconnect for ${username}:`, error);
        }
    }

    /**
     * Clean up expired users
     */
    async cleanupExpiredUsers() {
        try {
            // Clean up expired vouchers
            const expiredVouchers = await QueryHelper.getMany(
                'SELECT code, expires_at FROM vouchers WHERE status = ? AND expires_at < NOW()',
                ['used']
            );

            // Add null/undefined check to prevent "not iterable" error
            if (!expiredVouchers || !Array.isArray(expiredVouchers)) {
                console.warn('⚠️ No expired vouchers found or invalid response from database');
                return;
            }

            console.log(`🧹 Found ${expiredVouchers.length} expired vouchers to clean up`);

            for (const voucher of expiredVouchers) {
                try {
                    // Delete from Mikrotik
                    await this.mikrotik.deleteHotspotUser(voucher.code);

                    // Update database
                    await QueryHelper.raw(
                        'UPDATE vouchers SET status = ? WHERE code = ?',
                        ['expired', voucher.code]
                    );

                    // Log cleanup
                    await QueryHelper.raw(
                        'INSERT INTO activity_logs (action, user_type, username, details, created_at) VALUES (?, ?, ?, ?, NOW())',
                        [
                            'delete_expired',
                            'voucher',
                            voucher.code,
                            JSON.stringify({
                                reason: 'expired',
                                expires_at: voucher.expires_at
                            })
                        ]
                    );

                    // Remove from cache
                    this.knownUsers.delete(voucher.code);

                    console.log(`🗑️ Cleaned up expired voucher: ${voucher.code}`);

                } catch (error) {
                    console.error(`Error cleaning up voucher ${voucher.code}:`, error);
                }
            }

            // Clean up expired PPPoE users
            const expiredPPPoE = await QueryHelper.findMany(
                `SELECT username, expires_at
                 FROM pppoe_users
                 WHERE status = 'active' AND expires_at < NOW()`
            );

            // Add null/undefined check for PPPoE users
            if (!expiredPPPoE || !Array.isArray(expiredPPPoE)) {
                console.warn('⚠️ No expired PPPoE users found or invalid response from database');
            } else {
                console.log(`🧹 Found ${expiredPPPoE.length} expired PPPoE users to disable`);
            }

            for (const user of expiredPPPoE || []) {
                try {
                    // Disable in Mikrotik
                    await this.mikrotik.updatePPPoESecret(user.username, {
                        disabled: 'yes'
                    });

                    // Update database
                    await QueryHelper.execute(
                        `UPDATE pppoe_users
                         SET status = 'disabled', updated_at = NOW()
                         WHERE username = ?`,
                        [user.username]
                    );

                    // Log cleanup
                    await QueryHelper.insert(
                        `INSERT INTO activity_logs (action, user_type, username, details, created_at)
                         VALUES (?, ?, ?, ?, NOW())`,
                        [
                            'disable_expired',
                            'pppoe',
                            user.username,
                            JSON.stringify({
                                reason: 'expired',
                                expiry_date: user.expires_at
                            })
                        ]
                    );

                    // Update cache
                    const cachedUser = this.knownUsers.get(user.username);
                    if (cachedUser) {
                        cachedUser.status = 'disabled';
                    }

                    console.log(`🗑️ Disabled expired PPPoE user: ${user.username}`);

                } catch (error) {
                    console.error(`Error disabling PPPoE user ${user.username}:`, error);
                }
            }

        } catch (error) {
            console.error('Error in cleanupExpiredUsers:', error);
        }
    }

    /**
     * Get monitoring statistics
     */
    getStatistics() {
        return {
            isRunning: this.isRunning,
            lastPollTime: this.lastPollTime,
            pollInterval: this.pollInterval,
            knownUsersCount: this.knownUsers.size,
            activeSessionsCount: this.activeSessions.size,
            activeSessions: Array.from(this.activeSessions.entries()).map(([username, session]) => ({
                username,
                ...session
            }))
        };
    }

    /**
     * Force poll manually
     */
    async forcePoll() {
        await this.pollUsers();
    }
}

module.exports = UserMonitorService;