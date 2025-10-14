const Query = require('../../lib/query');
// Database pool will be passed as parameter
const EventEmitter = require('events');

/**
 * Data Retention Service - Handles automatic cleanup of old data
 * Implements configurable retention policies for different data types
 */
class DataRetentionService extends EventEmitter {
    constructor(dbPool = null, options = {}) {
        super();
        if (dbPool) {
            // Check if it's SQLite (has query/get/run methods) or PostgreSQL (has query/connect methods)
            // Always use Query class for both SQLite and PostgreSQL
            this.query = new Query(dbPool);
        }
        this.retentionPolicies = {
            logs: 30,           // 30 days for system logs
            whatsapp: 15,       // 15 days for WhatsApp messages
            notifications: 30,  // 30 days for notifications
            payments: 365,      // 1 year for payment records
            backup_logs: 90,    // 90 days for backup logs
            audit_trail: 365,   // 1 year for audit trails
            error_logs: 30,     // 30 days for error logs
            temp_files: 7       // 7 days for temporary files
        };
        this.cleanupSchedule = '0 2 * * *'; // Run at 2 AM daily
        this.isRunning = false;
    }

    /**
     * Start the data retention service
     */
    async start() {
        if (this.isRunning) {
            console.log('Data Retention Service is already running');
            return;
        }

        this.isRunning = true;
        console.log('🧹 Starting Data Retention Service...');

        // Schedule daily cleanup
        this.scheduleCleanup();

        // Run initial cleanup after 1 minute
        setTimeout(() => this.performCleanup(), 60000);

        console.log('✅ Data Retention Service started');
        this.emit('started');
    }

    /**
     * Stop the data retention service
     */
    async stop() {
        this.isRunning = false;
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        console.log('🛑 Data Retention Service stopped');
        this.emit('stopped');
    }

    /**
     * Schedule automatic cleanup
     */
    scheduleCleanup() {
        // For now, run daily at midnight
        this.cleanupInterval = setInterval(async () => {
            await this.performCleanup();
        }, 24 * 60 * 60 * 1000); // 24 hours

        console.log(`Cleanup scheduled to run daily at ${this.cleanupSchedule}`);
    }

    /**
     * Perform cleanup of all data types
     */
    async performCleanup() {
        console.log('🧹 Starting data cleanup...');
        const startTime = Date.now();
        const results = {};

        try {
            // Clean up system logs (30 days)
            results.logs = await this.cleanupLogs();

            // Clean up WhatsApp messages (15 days)
            results.whatsapp = await this.cleanupWhatsAppData();

            // Clean up notifications (30 days)
            results.notifications = await this.cleanupNotifications();

            // Clean up old backup files (90 days)
            results.backups = await this.cleanupBackups();

            // Clean up error logs (30 days)
            results.errorLogs = await this.cleanupErrorLogs();

            // Clean up temporary files (7 days)
            results.tempFiles = await this.cleanupTempFiles();

            // Optimize database after cleanup
            await this.optimizeDatabase();

            const duration = Date.now() - startTime;
            console.log(`✅ Data cleanup completed in ${duration}ms:`, results);

            this.emit('cleanupCompleted', {
                timestamp: new Date().toISOString(),
                duration,
                results
            });

            return results;
        } catch (error) {
            console.error('❌ Error during data cleanup:', error);
            this.emit('cleanupError', error);
            throw error;
        }
    }

    /**
     * Clean up system logs (30 days retention)
     */
    async cleanupLogs() {
        try {
            // Calculate cutoff date
            const logCutoffDate = new Date(Date.now() - (this.retentionPolicies.logs * 24 * 60 * 60 * 1000));
            const cutoffDateStr = logCutoffDate.toISOString();

            // Clean up activity logs
            let activityLogsCount = 0;
            try {
                const activityLogsResult = await this.query.query(`
                    DELETE FROM activity_logs
                    WHERE created_at < $1
                    RETURNING id
                `, [cutoffDateStr]);
                activityLogsCount = activityLogsResult.rowCount || 0;
            } catch (error) {
                if (error.code === 'SQLITE_ERROR' || error.code === '42P01') {
                    console.log('📋 activity_logs table does not exist, skipping');
                } else {
                    console.error('Error cleaning activity_logs:', error.message);
                }
            }

            return {
                activityLogs: activityLogsCount
            };
        } catch (error) {
            console.error('Error cleaning up logs:', error);
            return { error: error.message };
        }
    }

    /**
     * Clean up WhatsApp data (15 days retention)
     */
    async cleanupWhatsAppData() {
        try {
            // Calculate cutoff date
            const whatsappCutoffDate = new Date(Date.now() - (this.retentionPolicies.whatsapp * 24 * 60 * 60 * 1000));
            const cutoffDateStr = whatsappCutoffDate.toISOString();

            // Clean up WhatsApp messages (simplified - only keep essential table)
            let messagesCount = 0;
            try {
                const messagesResult = await this.query.query(`
                    DELETE FROM whatsapp_messages
                    WHERE created_at < $1
                    RETURNING id
                `, [cutoffDateStr]);
                messagesCount = messagesResult.rowCount || 0;
            } catch (error) {
                if (error.code === 'SQLITE_ERROR' || error.code === '42P01') {
                    console.log('📋 whatsapp_messages table does not exist, skipping');
                } else {
                    console.error('Error cleaning whatsapp_messages:', error.message);
                }
            }

            // Clean up old WhatsApp sessions
            let sessionsCount = 0;
            try {
                const sessionsResult = await this.query.query(`
                    DELETE FROM whatsapp_sessions
                    WHERE last_activity < $1
                    AND status != 'connected'
                    RETURNING id
                `, [cutoffDateStr]);
                sessionsCount = sessionsResult.rowCount || 0;
            } catch (error) {
                if (error.code === 'SQLITE_ERROR' || error.code === '42P01') {
                    console.log('📋 whatsapp_sessions table does not exist, skipping');
                } else {
                    console.error('Error cleaning whatsapp_sessions:', error.message);
                }
            }

            return {
                messages: messagesCount,
                sessions: sessionsCount
            };
        } catch (error) {
            console.error('Error cleaning up WhatsApp data:', error);
            return { error: error.message };
        }
    }

    /**
     * Clean up notifications (30 days retention)
     */
    async cleanupNotifications() {
        try {
            // Calculate cutoff date
            const notificationCutoffDate = new Date(Date.now() - (this.retentionPolicies.notifications * 24 * 60 * 60 * 1000)).toISOString();

            // Clean up old notifications from queue (use send_after column instead of sent_at)
            let sentCount = 0;
            try {
                const sentResult = await this.query.query(`
                    DELETE FROM notification_queue
                    WHERE status = 'sent'
                    AND send_after < $1
                    RETURNING id
                `, [notificationCutoffDate]);
                sentCount = sentResult.rowCount || 0;
            } catch (error) {
                if (error.code === 'SQLITE_ERROR' || error.code === '42P01') {
                    console.log('📋 notification_queue table does not exist, skipping');
                } else {
                    console.error('Error cleaning notification_queue:', error.message);
                }
            }

            // Clean up failed notifications
            let failedCount = 0;
            try {
                const failedResult = await this.query.query(`
                    DELETE FROM notification_queue
                    WHERE status = 'failed'
                    AND created_at < $1
                    RETURNING id
                `, [notificationCutoffDate]);
                failedCount = failedResult.rowCount || 0;
            } catch (error) {
                if (error.code === 'SQLITE_ERROR' || error.code === '42P01') {
                    console.log('📋 notification_queue table does not exist, skipping');
                } else {
                    console.error('Error cleaning failed notifications:', error.message);
                }
            }

            return {
                sent: sentCount,
                failed: failedCount
            };
        } catch (error) {
            console.error('Error cleaning up notifications:', error);
            return { error: error.message };
        }
    }

    /**
     * Clean up old backup files (90 days retention) - simplified
     */
    async cleanupBackups() {
        try {
            const fs = require('fs');
            const path = require('path');
            const backupDir = path.join(__dirname, '../../backups');

            if (!fs.existsSync(backupDir)) {
                return { filesCleaned: 0, message: 'Backup directory not found' };
            }

            const cutoffDate = new Date(Date.now() - (this.retentionPolicies.backup_logs * 24 * 60 * 60 * 1000));
            let cleanedCount = 0;

            const files = fs.readdirSync(backupDir);
            for (const file of files) {
                const filePath = path.join(backupDir, file);
                const stats = fs.statSync(filePath);

                if (stats.isFile() && stats.mtime < cutoffDate) {
                    fs.unlinkSync(filePath);
                    cleanedCount++;
                    console.log(`Deleted old backup: ${file}`);
                }
            }

            return {
                filesCleaned: cleanedCount
            };
        } catch (error) {
            console.error('Error cleaning up backups:', error);
            return { error: error.message };
        }
    }

    /**
     * Clean up error logs (30 days retention)
     */
    async cleanupErrorLogs() {
        try {
            // Calculate cutoff date
            const errorCutoffDate = new Date(Date.now() - (this.retentionPolicies.error_logs * 24 * 60 * 60 * 1000)).toISOString();

            // Clean up application error logs (use created_at instead of timestamp)
            let errorLogsCount = 0;
            try {
                const errorLogsResult = await this.query.query(`
                    DELETE FROM error_logs
                    WHERE created_at < $1
                    RETURNING id
                `, [errorCutoffDate]);
                errorLogsCount = errorLogsResult.rowCount || 0;
            } catch (error) {
                if (error.code === 'SQLITE_ERROR' || error.code === '42P01') {
                    console.log('📋 error_logs table does not exist, skipping');
                } else {
                    console.error('Error cleaning error_logs:', error.message);
                }
            }

            return {
                errorLogs: errorLogsCount
            };
        } catch (error) {
            console.error('Error cleaning up error logs:', error);
            return { error: error.message };
        }
    }

    /**
     * Clean up temporary files (7 days retention)
     */
    async cleanupTempFiles() {
        try {
            const fs = require('fs');
            const path = require('path');
            const tempDir = path.join(__dirname, '../../temp');

            if (!fs.existsSync(tempDir)) {
                return { cleaned: 0, message: 'Temp directory not found' };
            }

            const cutoffDate = new Date(Date.now() - (this.retentionPolicies.temp_files * 24 * 60 * 60 * 1000));
            let cleanedCount = 0;

            const cleanDirectory = (dir) => {
                const items = fs.readdirSync(dir);
                for (const item of items) {
                    const itemPath = path.join(dir, item);
                    const stats = fs.statSync(itemPath);

                    if (stats.isFile() && stats.mtime < cutoffDate) {
                        fs.unlinkSync(itemPath);
                        cleanedCount++;
                        console.log(`Deleted temp file: ${item}`);
                    } else if (stats.isDirectory()) {
                        cleanDirectory(itemPath);
                        // Remove empty directory
                        if (fs.readdirSync(itemPath).length === 0) {
                            fs.rmdirSync(itemPath);
                        }
                    }
                }
            };

            cleanDirectory(tempDir);

            return { filesCleaned: cleanedCount };
        } catch (error) {
            console.error('Error cleaning up temp files:', error);
            return { error: error.message };
        }
    }

    /**
     * Optimize database after cleanup
     */
    async optimizeDatabase() {
        try {
            // Check if it's PostgreSQL or SQLite
            if (process.env.DB_TYPE === 'postgresql') {
                // PostgreSQL - run VACUUM ANALYZE
                await this.query.query('VACUUM ANALYZE');
            } else {
                // SQLite - run VACUUM and ANALYZE separately
                await this.query.query('VACUUM');
                await this.query.query('ANALYZE');
            }

            console.log('Database optimization completed');
        } catch (error) {
            console.error('Error optimizing database:', error);
        }
    }

    /**
     * Get data retention statistics
     */
    async getStatistics() {
        const stats = {};

        try {
            // Get table sizes
            const tables = [
                'mikrotik_logs',
                'whatsapp_messages',
                'notification_queue',
                'error_logs',
                'backup_records',
                'user_activity_logs'
            ];

            for (const table of tables) {
                try {
                    const count = await this.query.getOne(`
                        SELECT COUNT(*) as count FROM ${table}
                    `);
                    stats[table] = count.count || 0;
                } catch (error) {
                    stats[table] = 'N/A';
                }
            }

            // Get database size (SQLite specific)
            const fs = require('fs');
            const path = require('path');

            // Try to get database file size
            try {
                // Check if we have access to the database file
                if (this.query.db && typeof this.query.db === 'object') {
                    // SQLite - get file size
                    const dbPath = path.join(__dirname, '../../data/billing.db');
                    if (fs.existsSync(dbPath)) {
                        const dbStats = fs.statSync(dbPath);
                        stats.databaseSize = dbStats.size;
                        stats.dbFileSize = dbStats.size;
                    }
                } else {
                    // PostgreSQL - use pg_database_size
                    const dbSize = await this.query.getOne(`
                        SELECT pg_database_size(current_database()) as size
                    `);
                    stats.databaseSize = dbSize.size || 0;
                }
            } catch (error) {
                stats.databaseSize = 'N/A';
                stats.dbFileSize = 'N/A';
            }

            return stats;
        } catch (error) {
            console.error('Error getting retention statistics:', error);
            return { error: error.message };
        }
    }

    /**
     * Update retention policies
     */
    updateRetentionPolicies(newPolicies) {
        this.retentionPolicies = { ...this.retentionPolicies, ...newPolicies };
        console.log('Retention policies updated:', this.retentionPolicies);
        this.emit('policiesUpdated', this.retentionPolicies);
    }

    /**
     * Run cleanup manually for specific data type
     */
    async cleanupSpecific(dataType) {
        switch (dataType) {
            case 'logs':
                return await this.cleanupLogs();
            case 'whatsapp':
                return await this.cleanupWhatsAppData();
            case 'notifications':
                return await this.cleanupNotifications();
            case 'backups':
                return await this.cleanupBackups();
            case 'errors':
                return await this.cleanupErrorLogs();
            case 'temp':
                return await this.cleanupTempFiles();
            default:
                throw new Error(`Unknown data type: ${dataType}`);
        }
    }
}

module.exports = DataRetentionService;