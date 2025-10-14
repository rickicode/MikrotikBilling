const EventEmitter = require('events');
const Query = require('../lib/query');
// Database pool will be passed as parameter

/**
 * User Monitor Service - Replaces profile scripts with 30-second polling
 * Monitors Mikrotik user lists for first login detection and expiry management
 */
class UserMonitorService extends EventEmitter {
    constructor(mikrotikClient, whatsappService, dbPool = null) {
        super();
        this.mikrotik = mikrotikClient;
        this.whatsapp = whatsappService;
        if (dbPool) {
            // PostgreSQL pool
            this.query = new Query(dbPool);
        }
        this.isRunning = false;
        this.pollInterval = 30000; // 30 seconds
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
            console.log('🔍 Starting User Monitor Service (30-second polling)...');

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
            const vouchers = await this.query.getMany(`
                SELECT code, status, used_at, expires_at
                FROM vouchers
                WHERE status IN ('unused', 'used', 'expired')
            `);

            vouchers.forEach(voucher => {
                this.knownUsers.set(voucher.code, {
                    type: 'voucher',
                    status: voucher.status,
                    firstLogin: voucher.used_at,
                    expiresAt: voucher.expires_at
                });
            });

            // Get all PPPoE users from database
            const pppoeUsers = await this.query.getMany(`
                SELECT username, status, expires_at
                FROM pppoe_users
                WHERE status IN ('active', 'expired')
            `);

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
     * Main polling function with offline handling
     */
    async pollUsers() {
        try {
            const startTime = Date.now();
            this.lastPollTime = new Date();

            // Check if Mikrotik is offline
            const connectionInfo = this.mikrotik?.getConnectionInfo() || {};
            if (connectionInfo.isOffline) {
                console.log('⚠️ Mikrotik is offline, skipping user poll');
                return;
            }

            // Poll hotspot users
            await this.pollHotspotUsers();

            // Poll PPPoE users
            await this.pollPPPoEUsers();

            // Clean up expired users
            await this.cleanupExpiredUsers();

            const duration = Date.now() - startTime;
            console.log(`🔍 User poll completed in ${duration}ms`);

        } catch (error) {
            console.error('Error in pollUsers:', error);

            // Don't emit error for connection issues
            if (!error.message.includes('timeout') &&
                !error.message.includes('connection') &&
                !error.message.includes('ECONNREFUSED')) {
                this.emit('error', error);
            }
        }
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
                await this.query.query(`
                    UPDATE vouchers
                    SET used_at = $1, status = 'used'
                    WHERE code = $2
                `, [now.toISOString(), user.name]);

                // Update Mikrotik user comment
                const commentData = this.mikrotik.parseComment(user.comment) || {};
                await this.mikrotik.updateVoucherUserComment(
                    user.name,
                    timestamp.toString(),
                    commentData.valid_until_timestamp
                );

                // Get customer info for notification
                const voucher = await this.query.getOne(`
                    SELECT v.*, c.id as customer_id, c.name, c.phone
                    FROM vouchers v
                    LEFT JOIN pppoe_users p ON v.code = p.username
                    LEFT JOIN customers c ON p.customer_id = c.id
                    WHERE v.code = $1
                `, [user.name]);

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
            await this.query.insert(`
                INSERT INTO activity_logs (username, session_type, login_time, logout_time, ip_address, duration)
                VALUES ($1, $2, $3, $4, $5, $6)
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
            await this.query.insert(`
                INSERT INTO activity_logs (username, session_type, connect_time, disconnect_time, caller_id, uptime)
                VALUES ($1, $2, $3, $4, $5, $6)
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
            const expiredVouchers = await this.query.getMany(`
                SELECT code, expires_at
                FROM vouchers
                WHERE status = 'used' AND expires_at < NOW()
            `);

            for (const voucher of expiredVouchers) {
                try {
                    // Delete from Mikrotik
                    await this.mikrotik.deleteHotspotUser(voucher.code);

                    // Update database
                    await this.query.query(`
                        UPDATE vouchers
                        SET status = 'expired'
                        WHERE code = $1
                    `, [voucher.code]);

                    // Log cleanup
                    await this.query.insert(`
                        INSERT INTO activity_logs (action, user_type, username, details, created_at)
                        VALUES ($1, $2, $3, $4, NOW())
                    `, [
                        'delete_expired',
                        'voucher',
                        voucher.code,
                        JSON.stringify({
                            reason: 'expired',
                            expires_at: voucher.expires_at
                        })
                    ]);

                    // Remove from cache
                    this.knownUsers.delete(voucher.code);

                    console.log(`🗑️ Cleaned up expired voucher: ${voucher.code}`);

                } catch (error) {
                    console.error(`Error cleaning up voucher ${voucher.code}:`, error);
                }
            }

            // Clean up expired PPPoE users
            const expiredPPPoE = await this.query.getMany(`
                SELECT username, expires_at
                FROM pppoe_users
                WHERE status = 'active' AND expires_at < NOW()
            `);

            for (const user of expiredPPPoE) {
                try {
                    // Disable in Mikrotik
                    await this.mikrotik.updatePPPoESecret(user.username, {
                        disabled: 'yes'
                    });

                    // Update database
                    await this.query.query(`
                        UPDATE pppoe_users
                        SET status = 'disabled', updated_at = NOW()
                        WHERE username = $1
                    `, [user.username]);

                    // Log cleanup
                    await this.query.insert(`
                        INSERT INTO activity_logs (action, user_type, username, details, created_at)
                        VALUES ($1, $2, $3, $4, NOW())
                    `, [
                        'disable_expired',
                        'pppoe',
                        user.username,
                        JSON.stringify({
                            reason: 'expired',
                            expiry_date: user.expires_at
                        })
                    ]);

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