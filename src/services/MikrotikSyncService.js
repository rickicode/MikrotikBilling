const Query = require('../../lib/query');
const MikrotikClient = require('./MikrotikClient');
// Database pool will be passed as parameter
const EventEmitter = require('events');
const cron = require('node-cron');

/**
 * Mikrotik Sync Service - Manages synchronization with Mikrotik routers
 * Handles bidirectional sync between local database and RouterOS
 */
class MikrotikSyncService extends EventEmitter {
    constructor(mikrotikClient, dbPool = null, options = {}) {
        super();
        this.mikrotik = mikrotikClient;
        if (dbPool) {
            // PostgreSQL pool
            this.query = new Query(dbPool);
        }
        this.isRunning = false;
        this.syncInterval = options.syncInterval || 60000; // 1 minute
        this.batchSize = options.batchSize || 100;
        this.retryAttempts = options.retryAttempts || 3;
        this.syncStats = {
            lastSync: null,
            syncCount: 0,
            errorCount: 0,
            lastError: null
        };
    }

    /**
     * Initialize the sync service
     */
    async initialize(dbPool = null, config = {}) {
        try {
            if (dbPool) {
                // PostgreSQL pool
                this.query = new Query(dbPool);
            }

            // Initialize Mikrotik client
            if (config) {
                this.mikrotik = new MikrotikClient(config);
            }
        } catch (error) {
            console.error('Failed to initialize Mikrotik Sync Service:', error);
            throw error;
        }
    }

    /**
     * Start the sync service
     */
    async start() {
        if (this.isRunning) {
            console.log('Mikrotik Sync Service is already running');
            return;
        }

        try {
            console.log('🔄 Starting Mikrotik Sync Service...');

            // Verify Mikrotik connection is available before starting
            if (!this.mikrotik || !this.mikrotik.isConnected()) {
                console.log('⚠️ Mikrotik not connected, starting sync service in offline mode');
                // Service will run but sync operations will be skipped
            }

            // Initial sync only if connected
            if (this.mikrotik && this.mikrotik.isConnected()) {
                await this.performFullSync();
            } else {
                console.log('⚠️ Skipping initial sync - Mikrotik not connected');
            }

            // Start continuous sync
            this.isRunning = true;
            this.syncIntervalId = setInterval(async () => {
                if (this.isRunning) {
                    await this.performIncrementalSync().catch(error => {
                        console.error('Error in incremental sync:', error);
                        this.syncStats.errorCount++;
                        this.syncStats.lastError = error.message;
                        this.emit('syncError', error);
                    });
                }
            }, this.syncInterval);

            // Schedule periodic full syncs
            cron.schedule('0 */6 * * *', async () => {
                if (this.isRunning) {
                    console.log('🔄 Performing scheduled full sync...');
                    await this.performFullSync();
                }
            });

            console.log('✅ Mikrotik Sync Service started');
            this.emit('started');

        } catch (error) {
            console.error('❌ Failed to start Mikrotik Sync Service:', error);
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Stop the sync service
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        console.log('🛑 Stopping Mikrotik Sync Service...');

        if (this.syncIntervalId) {
            clearInterval(this.syncIntervalId);
            this.syncIntervalId = null;
        }

        this.isRunning = false;
        console.log('✅ Mikrotik Sync Service stopped');
        this.emit('stopped');
    }

    /**
     * Perform full synchronization with offline handling
     */
    async performFullSync() {
        // Check if Mikrotik is offline
        const connectionInfo = this.mikrotik?.getConnectionInfo() || {};
        if (connectionInfo.isOffline) {
            console.log('⚠️ Mikrotik is offline, skipping full sync');
            this.syncStats.lastSync = new Date();
            this.syncStats.lastError = 'Mikrotik is offline';
            return {
                skipped: true,
                reason: 'Mikrotik is offline'
            };
        }

        const startTime = Date.now();

        try {
            console.log('🔄 Starting full synchronization with Mikrotik...');

            // Sync hotspot profiles
            await this.syncHotspotProfiles();

            // Sync PPPoE profiles
            await this.syncPPPoEProfiles();

            // Sync hotspot users
            await this.syncHotspotUsers();

            // Sync PPPoE secrets
            await this.syncPPPoESecrets();

            // Sync active sessions
            await this.syncActiveSessions();

            // Update sync statistics
            this.syncStats.lastSync = new Date();
            this.syncStats.syncCount++;
            this.syncStats.lastError = null;

            const duration = Date.now() - startTime;
            console.log(`✅ Full sync completed in ${duration}ms`);

            this.emit('fullSyncCompleted', {
                duration,
                timestamp: this.syncStats.lastSync
            });

        } catch (error) {
            console.error('Error in full sync:', error);
            this.syncStats.errorCount++;
            this.syncStats.lastError = error.message;
            this.emit('syncError', error);

            // Don't throw error if it's just a connection issue
            if (error.message.includes('timeout') ||
                error.message.includes('connection') ||
                error.message.includes('ECONNREFUSED')) {
                console.log('Connection lost during sync, will retry later');
                return {
                    error: error.message,
                    skipped: true
                };
            }

            throw error;
        }
    }

    /**
     * Perform incremental synchronization with offline handling
     */
    async performIncrementalSync() {
        // Check if Mikrotik is offline
        const connectionInfo = this.mikrotik?.getConnectionInfo() || {};
        if (connectionInfo.isOffline) {
            console.log('⚠️ Mikrotik is offline, skipping incremental sync');
            this.syncStats.lastError = 'Mikrotik is offline';
            return {
                skipped: true,
                reason: 'Mikrotik is offline'
            };
        }

        const startTime = Date.now();

        try {
            // Check for recent changes in database
            let recentChanges = [];
            try {
                recentChanges = await this.query.getMany(`
                    SELECT
                        'hotspot_user' as type,
                        v.code as name,
                        v.status,
                        v.created_at as created_at
                    FROM vouchers v
                    WHERE v.created_at > $1
                    UNION ALL
                    SELECT
                        'pppoe_secret' as type,
                        p.username as name,
                        p.status,
                        p.updated_at as created_at
                    FROM pppoe_users p
                    WHERE p.updated_at > $2
                    ORDER BY created_at ASC
                    LIMIT $3
                `, [
                    (this.syncStats.lastSync || new Date(Date.now() - this.syncInterval)).toISOString(),
                    (this.syncStats.lastSync || new Date(Date.now() - this.syncInterval)).toISOString(),
                    this.batchSize
                ]);
            } catch (error) {
                console.error('Database query failed, proceeding without incremental sync:', error.message);
                recentChanges = [];
            }

            // Ensure recentChanges is an array
            if (!Array.isArray(recentChanges)) {
                console.error('Expected array from getMany, received:', typeof recentChanges);
                recentChanges = [];
            }

            if (recentChanges.length > 0) {
                console.log(`🔄 Syncing ${recentChanges.length} recent changes...`);

                // Process each change
                for (const change of recentChanges) {
                    switch (change.type) {
                        case 'hotspot_user':
                            await this.syncHotspotUser(change.name, change.status);
                            break;
                        case 'pppoe_secret':
                            await this.syncPPPoESecret(change.name, change.status);
                            break;
                    }
                }
            }

            // Sync Mikrotik to local database
            await this.syncFromMikrotik();

            this.syncStats.lastSync = new Date();
            this.syncStats.syncCount++;
            this.syncStats.lastError = null;

            const duration = Date.now() - startTime;
            this.emit('incrementalSyncCompleted', {
                changesProcessed: recentChanges.length,
                duration
            });

        } catch (error) {
            console.error('Error in incremental sync:', error);
            this.syncStats.errorCount++;
            this.syncStats.lastError = error.message;

            // Don't throw error if it's just a connection issue
            if (error.message.includes('timeout') ||
                error.message.includes('connection') ||
                error.message.includes('ECONNREFUSED')) {
                console.log('Connection lost during sync, will retry later');
                return {
                    error: error.message,
                    skipped: true
                };
            }

            throw error;
        }
    }

    /**
     * Sync hotspot profiles from Mikrotik
     */
    async syncHotspotProfiles() {
        try {
            const mikrotikProfiles = await this.mikrotik.getHotspotProfiles();
            const systemProfiles = mikrotikProfiles.filter(p =>
                p.comment && p.comment.includes('VOUCHER_SYSTEM')
            );

            for (const profile of systemProfiles) {
                const existing = await this.query.getOne(`
                    SELECT id FROM profiles
                    WHERE mikrotik_name = $1 AND type = 'hotspot'
                `, [profile.name]);

                if (!existing) {
                    // Parse pricing from comment
                    const commentData = this.mikrotik.parseComment(profile.comment) || {};

                    await this.query.insert(`
                        INSERT INTO profiles
                        (name, type, mikrotik_name, price_sell, price_cost, mikrotik_synced, managed_by, created_at)
                        VALUES ($1, $2, $3, $4, $5, true, 'system', NOW())
                    `, [
                        profile.name,
                        'hotspot',
                        profile.name,
                        commentData.price_sell || 0,
                        commentData.price_cost || 0
                    ]);

                    console.log(`📥 Synced new hotspot profile: ${profile.name}`);
                } else {
                    // Update existing profile
                    await this.query.query(`
                        UPDATE profiles
                        SET mikrotik_synced = true,
                            updated_at = NOW()
                        WHERE id = $1
                    `, [existing.id]);
                }
            }
        } catch (error) {
            console.error('Error syncing hotspot profiles:', error);
            throw error;
        }
    }

    /**
     * Sync PPPoE profiles from Mikrotik
     */
    async syncPPPoEProfiles() {
        try {
            const mikrotikProfiles = await this.mikrotik.getPPPProfiles();
            const systemProfiles = mikrotikProfiles.filter(p =>
                p.comment && p.comment.includes('PPPOE_SYSTEM')
            );

            for (const profile of systemProfiles) {
                const existing = await this.query.getOne(`
                    SELECT id FROM profiles
                    WHERE mikrotik_name = $1 AND type = 'pppoe'
                `, [profile.name]);

                if (!existing) {
                    // Parse pricing from comment
                    const commentData = this.mikrotik.parseComment(profile.comment) || {};

                    await this.query.insert(`
                        INSERT INTO profiles
                        (name, type, mikrotik_name, price_sell, price_cost, mikrotik_synced, managed_by, created_at)
                        VALUES ($1, $2, $3, $4, $5, true, 'system', NOW())
                    `, [
                        profile.name,
                        'pppoe',
                        profile.name,
                        commentData.price_sell || 0,
                        commentData.price_cost || 0
                    ]);

                    console.log(`📥 Synced new PPPoE profile: ${profile.name}`);
                } else {
                    // Update existing profile
                    await this.query.query(`
                        UPDATE profiles
                        SET mikrotik_synced = true,
                            updated_at = NOW()
                        WHERE id = $1
                    `, [existing.id]);
                }
            }
        } catch (error) {
            console.error('Error syncing PPPoE profiles:', error);
            throw error;
        }
    }

    /**
     * Sync hotspot users
     */
    async syncHotspotUsers() {
        try {
            // Get users from Mikrotik
            const mikrotikUsers = await this.mikrotik.getHotspotUsers();
            const systemUsers = mikrotikUsers.filter(u =>
                u.comment && u.comment.includes('VOUCHER_SYSTEM')
            );

            for (const user of systemUsers) {
                const commentData = MikrotikClient.parseComment(user.comment) || {};

                // Check if exists in database
                const existing = await this.query.getOne(`
                    SELECT id, status FROM vouchers
                    WHERE code = $1
                `, [user.name]);

                if (!existing) {
                    // Create new voucher record
                    await this.query.insert(`
                        INSERT INTO vouchers
                        (code, status, price_sell, profile_id, mikrotik_synced, created_at)
                        VALUES ($1, $2, $3, $4, true, NOW())
                    `, [
                        user.name,
                        user.disabled === 'true' ? 'disabled' : 'active',
                        commentData.price_sell || 0,
                        this.getProfileIdByName(user.profile, 'hotspot')
                    ]);

                    console.log(`📥 Synced new hotspot user: ${user.name}`);
                } else {
                    // Update status
                    const newStatus = user.disabled === 'true' ? 'disabled' : 'active';
                    if (existing.status !== newStatus) {
                        await this.query.query(`
                            UPDATE vouchers
                            SET status = $1, mikrotik_synced = true, updated_at = NOW()
                            WHERE id = $2
                        `, [newStatus, existing.id]);

                        console.log(`🔄 Updated hotspot user status: ${user.name} -> ${newStatus}`);
                    }
                }
            }
        } catch (error) {
            console.error('Error syncing hotspot users:', error);
            throw error;
        }
    }

    /**
     * Sync PPPoE secrets
     */
    async syncPPPoESecrets() {
        try {
            // Get secrets from Mikrotik
            const mikrotikSecrets = await this.mikrotik.getPPPoESecrets();
            const systemSecrets = mikrotikSecrets.filter(s =>
                s.comment && s.comment.includes('PPPOE_SYSTEM')
            );

            for (const secret of systemSecrets) {
                const commentData = this.mikrotik.parseComment(secret.comment) || {};

                // Check if exists in database
                const existing = await this.query.getOne(`
                    SELECT id, status FROM pppoe_users
                    WHERE username = $1
                `, [secret.name]);

                if (!existing) {
                    // Create new PPPoE user record
                    await this.query.insert(`
                        INSERT INTO pppoe_users
                        (username, password, status, price_sell, profile_id, mikrotik_synced, created_at)
                        VALUES ($1, $2, $3, $4, $5, true, NOW())
                    `, [
                        secret.name,
                        secret.password,
                        secret.disabled === 'true' ? 'disabled' : 'active',
                        commentData.price_sell || 0,
                        this.getProfileIdByName(secret.profile, 'pppoe')
                    ]);

                    console.log(`📥 Synced new PPPoE user: ${secret.name}`);
                } else {
                    // Update status
                    const newStatus = secret.disabled === 'true' ? 'disabled' : 'active';
                    if (existing.status !== newStatus) {
                        await this.query.query(`
                            UPDATE pppoe_users
                            SET status = $1, mikrotik_synced = true, updated_at = NOW()
                            WHERE id = $2
                        `, [newStatus, existing.id]);

                        console.log(`🔄 Updated PPPoE user status: ${secret.name} -> ${newStatus}`);
                    }
                }
            }
        } catch (error) {
            console.error('Error syncing PPPoE secrets:', error);
            throw error;
        }
    }

    /**
     * Sync active sessions
     */
    async syncActiveSessions() {
        try {
            // Sync active hotspot users
            const activeHotspot = await this.mikrotik.getActiveHotspotUsers();
            for (const session of activeHotspot) {
                await this.query.query(`
                    INSERT INTO user_sessions
                    (username, session_type, ip_address, mac_address, uptime, start_time, last_seen)
                    VALUES ($1, 'hotspot', $2, $3, $4, NOW(), NOW())
                    ON CONFLICT (username, session_type) DO UPDATE
                    SET ip_address = EXCLUDED.ip_address,
                        mac_address = EXCLUDED.mac_address,
                        uptime = EXCLUDED.uptime,
                        last_seen = EXCLUDED.last_seen
                `, [session.user, session.address, session['mac-address'], session.uptime]);
            }

            // Sync active PPPoE users
            const activePPPoE = await this.mikrotik.getActivePPPoEUsers();
            for (const session of activePPPoE) {
                await this.query.query(`
                    INSERT INTO user_sessions
                    (username, session_type, caller_id, uptime, start_time, last_seen)
                    VALUES ($1, 'pppoe', $2, $3, NOW(), NOW())
                    ON CONFLICT (username, session_type) DO UPDATE
                    SET caller_id = EXCLUDED.caller_id,
                        uptime = EXCLUDED.uptime,
                        last_seen = EXCLUDED.last_seen
                `, [session.name, session.callerId, session.uptime]);
            }
        } catch (error) {
            console.error('Error syncing active sessions:', error);
            throw error;
        }
    }

    /**
     * Sync from Mikrotik to local database
     */
    async syncFromMikrotik() {
        try {
            // Find records in Mikrotik that don't exist locally
            await this.syncMissingHotspotUsers();
            await this.syncMissingPPPoEUsers();

            // Clean up stale sessions
            await this.cleanupStaleSessions();
        } catch (error) {
            console.error('Error syncing from Mikrotik:', error);
            throw error;
        }
    }

    /**
     * Sync missing hotspot users
     */
    async syncMissingHotspotUsers() {
        const mikrotikUsers = await this.mikrotik.getHotspotUsers();
        let localUsers = [];
        try {
            localUsers = await this.query.getMany(`
                SELECT code FROM vouchers
            `);
        } catch (error) {
            console.error('Database query failed, proceeding without database sync:', error.message);
            return;
        }

        // Ensure localUsers is an array
        if (!Array.isArray(localUsers)) {
            console.error('Expected array from getMany, received:', typeof localUsers);
            localUsers = [];
        }

        const localUsernames = new Set(localUsers.map(u => u.code));
        const missingUsers = mikrotikUsers.filter(u =>
            u.comment && u.comment.includes('VOUCHER_SYSTEM') && !localUsernames.has(u.name)
        );

        for (const user of missingUsers) {
            const commentData = this.mikrotik.parseComment(user.comment) || {};

            await this.query.insert(`
                INSERT INTO vouchers
                (code, status, price_sell, profile_id, mikrotik_synced, created_at)
                VALUES ($1, $2, $3, $4, true, NOW())
                ON CONFLICT DO NOTHING
            `, [
                user.name,
                user.disabled === 'true' ? 'disabled' : 'active',
                commentData.price_sell || 0,
                this.getProfileIdByName(user.profile, 'hotspot')
            ]);

            console.log(`📥 Synced missing hotspot user: ${user.name}`);
        }
    }

    /**
     * Sync missing PPPoE users
     */
    async syncMissingPPPoEUsers() {
        const mikrotikSecrets = await this.mikrotik.getPPPoESecrets();
        let localUsers = [];
        try {
            localUsers = await this.query.getMany(`
                SELECT username FROM pppoe_users
            `);
        } catch (error) {
            console.error('Database query failed, proceeding without database sync:', error.message);
            return;
        }

        // Ensure localUsers is an array
        if (!Array.isArray(localUsers)) {
            console.error('Expected array from getMany, received:', typeof localUsers);
            localUsers = [];
        }

        const localUsernames = new Set(localUsers.map(u => u.username));
        const missingUsers = mikrotikSecrets.filter(s =>
            s.comment && s.comment.includes('PPPOE_SYSTEM') && !localUsernames.has(s.name)
        );

        for (const secret of missingUsers) {
            const commentData = this.mikrotik.parseComment(secret.comment) || {};

            await this.query.insert(`
                INSERT INTO pppoe_users
                (username, password, status, price_sell, profile_id, mikrotik_synced, created_at)
                VALUES ($1, $2, $3, $4, $5, true, NOW())
                ON CONFLICT DO NOTHING
            `, [
                secret.name,
                secret.password,
                secret.disabled === 'true' ? 'disabled' : 'active',
                commentData.price_sell || 0,
                this.getProfileIdByName(secret.profile, 'pppoe')
            ]);

            console.log(`📥 Synced missing PPPoE user: ${secret.name}`);
        }
    }

    /**
     * Clean up stale sessions
     */
    async cleanupStaleSessions() {
        // Remove sessions not seen in last 10 minutes
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        await this.query.query(`
            DELETE FROM user_sessions
            WHERE last_seen < $1
        `, [tenMinutesAgo]);
    }

    /**
     * Get profile ID by name
     * @param {string} profileName - Profile name
     * @param {string} type - Profile type (hotspot/pppoe)
     * @returns {number|null} Profile ID
     */
    async getProfileIdByName(profileName, type) {
        const profile = await this.query.getOne(`
            SELECT id FROM profiles
            WHERE mikrotik_name = $1 AND type = $2
        `, [profileName, type]);

        return profile?.id || null;
    }

    /**
     * Sync hotspot user to Mikrotik
     * @param {string} username - Username
     * @param {string} status - Status
     */
    async syncHotspotUser(username, status) {
        try {
            if (status === 'disabled' || status === 'expired') {
                await this.mikrotik.disableHotspotUser(username);
            } else {
                await this.mikrotik.enableHotspotUser(username);
            }
        } catch (error) {
            console.error(`Error syncing hotspot user ${username}:`, error);
        }
    }

    /**
     * Sync PPPoE secret to Mikrotik
     * @param {string} username - Username
     * @param {string} status - Status
     */
    async syncPPPoESecret(username, status) {
        try {
            if (status === 'disabled' || status === 'expired') {
                await this.mikrotik.updatePPPoESecret(username, {
                    disabled: 'yes'
                });
            } else {
                await this.mikrotik.updatePPPoESecret(username, {
                    disabled: 'no'
                });
            }
        } catch (error) {
            console.error(`Error syncing PPPoE secret ${username}:`, error);
        }
    }

    /**
     * Force immediate sync
     * @param {string} type - Sync type (full/incremental)
     */
    async forceSync(type = 'incremental') {
        if (type === 'full') {
            return await this.performFullSync();
        } else {
            return await this.performIncrementalSync();
        }
    }

    /**
     * Get sync statistics
     * @returns {Object} Sync statistics
     */
    getStatistics() {
        return {
            ...this.syncStats,
            isRunning: this.isRunning,
            syncInterval: this.syncInterval,
            mikrotikConnected: this.mikrotik?.connected || false
        };
    }

    /**
     * Test Mikrotik connection
     * @returns {boolean} Connection status
     */
    async testConnection() {
        try {
            const resources = await this.mikrotik.getSystemResources();
            return !!resources;
        } catch (error) {
            console.error('Mikrotik connection test failed:', error);
            return false;
        }
    }
}

module.exports = MikrotikSyncService;