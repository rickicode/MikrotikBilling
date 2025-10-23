const QueryHelper = require('../lib/QueryHelper');
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

/**
 * Notification Flow Service - Manages centralized notification processing
 * Handles various notification channels with priority queuing and templates
 */
class NotificationFlowService extends EventEmitter {
    constructor(dbPool = null, options = {}) {
        super();
        // Use global QueryHelper for database operations
        this.query = QueryHelper;

        if (!this.query) {
            console.error('Database query not available in NotificationFlowService');
        }
        this.whatsappService = options.whatsappService;
        this.emailService = options.emailService;
        this.smsService = options.smsService;
        this.isProcessing = false;
        this.batchSize = 50;
        this.retryAttempts = 3;
        this.retryDelay = 5000; // 5 seconds
        this.processingInterval = 10000; // 10 seconds
    }

    /**
     * Start the notification processing service
     */
    async start() {
        if (this.isProcessing) {
            console.log('Notification Flow Service is already running');
            return;
        }

        this.isProcessing = true;
        console.log('🔔 Starting Notification Flow Service...');

        // Process queue continuously
        this.processQueue();

        console.log('✅ Notification Flow Service started');
        this.emit('started');
    }

    /**
     * Stop the notification processing service
     */
    async stop() {
        this.isProcessing = false;
        console.log('🛑 Notification Flow Service stopped');
        this.emit('stopped');
    }

    /**
     * Process notification queue
     */
    async processQueue() {
        while (this.isProcessing) {
            try {
                // Check if query is available
                if (!this.query) {
                    console.error('Database query not available in NotificationFlowService');
                    await new Promise(resolve => setTimeout(resolve, this.processingInterval));
                    continue;
                }

                // Get pending notifications
                const selectedNotifications = await QueryHelper.getMany(
                    'SELECT id FROM notification_queue WHERE status = ? AND send_after <= datetime("now") ORDER BY priority DESC, created_at ASC LIMIT ?',
                    ['pending', this.batchSize]
                );

                if (selectedNotifications.length > 0) {
                    // Update selected notifications
                    const ids = selectedNotifications.map(n => n.id);
                    if (ids.length > 0) {
                        const placeholders = ids.map(() => '?').join(', ');

                        // Update selected notifications
                        await QueryHelper.execute(
                            'UPDATE notification_queue SET status = ?, processed_at = datetime("now") WHERE id IN (' + placeholders + ')',
                            ['processing', ...ids]
                        );

                        // Get the full notification details
                        const notifications = await QueryHelper.getMany(
                            'SELECT * FROM notification_queue WHERE id IN (' + placeholders + ')',
                            ids
                        );

                        if (notifications.length > 0) {
                        console.log(`📮 Processing ${notifications.length} notifications...`);

                        // Process notifications in parallel
                        const promises = notifications.map(notification =>
                            this.processNotification(notification)
                        );

                        await Promise.allSettled(promises);
                        console.log(`✅ Completed processing ${notifications.length} notifications`);
                        }
                    }
                } else {
                    // No notifications, wait before next check
                    await new Promise(resolve => setTimeout(resolve, this.processingInterval));
                }
            } catch (error) {
                console.error('Error processing notification queue:', error);
                await new Promise(resolve => setTimeout(resolve, this.processingInterval));
            }
        }
    }

    /**
     * Process individual notification
     * @param {Object} notification - Notification data
     */
    async processNotification(notification) {
        const startTime = Date.now();

        try {
            // Parse message data
            const messageData = typeof notification.message_data === 'string'
                ? JSON.parse(notification.message_data)
                : notification.message_data;

            // Choose appropriate channel
            switch (notification.channel) {
                case 'whatsapp':
                    await this.processWhatsAppNotification(notification, messageData);
                    break;
                case 'email':
                    await this.processEmailNotification(notification, messageData);
                    break;
                case 'sms':
                    await this.processSMSNotification(notification, messageData);
                    break;
                default:
                    throw new Error(`Unsupported notification channel: ${notification.channel}`);
            }

            // Mark as sent
            await QueryHelper.query(`
                UPDATE notification_queue
                SET status = 'sent',
                    sent_at = NOW(),
                    delivery_status = 'delivered',
                    error_message = NULL,
                    updated_at = NOW()
                WHERE id = $1
            `, [notification.id]);

            const duration = Date.now() - startTime;
            console.log(`✅ Notification sent: ${notification.id} (${duration}ms)`);

            this.emit('notificationSent', {
                notificationId: notification.id,
                channel: notification.channel,
                recipient: notification.recipient,
                duration
            });

        } catch (error) {
            console.error(`❌ Failed to send notification ${notification.id}:`, error);

            // Update error status
            const newAttemptCount = (notification.attempt_count || 0) + 1;

            if (newAttemptCount >= this.retryAttempts) {
                // Mark as failed
                await QueryHelper.query(`
                    UPDATE notification_queue
                    SET status = 'failed',
                        attempt_count = $1,
                        error_message = $2,
                        updated_at = NOW()
                    WHERE id = $3
                `, [newAttemptCount, error.message, notification.id]);

                this.emit('notificationFailed', {
                    notificationId: notification.id,
                    error: error.message,
                    attempts: newAttemptCount
                });
            } else {
                // Schedule retry
                const retryAt = new Date(Date.now() + this.retryDelay * newAttemptCount);

                await QueryHelper.query(`
                    UPDATE notification_queue
                    SET status = 'pending',
                        attempt_count = $1,
                        error_message = $2,
                        send_after = $3,
                        updated_at = NOW()
                    WHERE id = $4
                `, [newAttemptCount, error.message, retryAt, notification.id]);

                // Schedule retry
                setTimeout(() => {
                    this.processNotification(notification);
                }, this.retryDelay * newAttemptCount);
            }
        }
    }

    /**
     * Process WhatsApp notification
     * @param {Object} notification - Notification data
     * @param {Object} messageData - Message data
     */
    async processWhatsAppNotification(notification, messageData) {
        if (!this.whatsappService) {
            throw new Error('WhatsApp service not available');
        }

        const { templateName, variables, phoneNumber } = messageData;

        // Send through WhatsApp service
        const result = await this.whatsappService.sendNotification(
            phoneNumber,
            templateName,
            variables,
            {
                priority: notification.priority,
                sessionId: notification.session_id
            }
        );

        return result;
    }

    /**
     * Process email notification
     * @param {Object} notification - Notification data
     * @param {Object} messageData - Message data
     */
    async processEmailNotification(notification, messageData) {
        if (!this.emailService) {
            throw new Error('Email service not available');
        }

        const { to, subject, template, variables } = messageData;

        // Send through email service (implementation depends on email service)
        const result = await this.emailService.sendEmail({
            to,
            subject,
            template,
            variables
        });

        return result;
    }

    /**
     * Process SMS notification
     * @param {Object} notification - Notification data
     * @param {Object} messageData - Message data
     */
    async processSMSNotification(notification, messageData) {
        if (!this.smsService) {
            throw new Error('SMS service not available');
        }

        const { phoneNumber, message } = messageData;

        // Send through SMS service (implementation depends on SMS service)
        const result = await this.smsService.sendSMS({
            phoneNumber,
            message
        });

        return result;
    }

    /**
     * Queue notification
     * @param {Object} notificationData - Notification data
     * @returns {Object} Queued notification info
     */
    async queueNotification(notificationData) {
        const {
            channel,
            recipient,
            templateName,
            variables = {},
            priority = 'normal',
            scheduledAt = new Date(),
            customerId = null,
            subscriptionId = null,
            sessionId = null
        } = notificationData;

        // Create message data
        const messageData = {
            templateName,
            variables,
            phoneNumber: recipient
        };

        // Insert into queue
        const notificationId = await QueryHelper.insert(`
            INSERT INTO notification_queue
            (channel, recipient, message_data, priority, status, send_after, customer_id, subscription_id, session_id, created_at)
            VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, NOW())
            RETURNING id
        `, [
            channel,
            recipient,
            JSON.stringify(messageData),
            priority,
            scheduledAt,
            customerId,
            subscriptionId,
            sessionId
        ]);

        this.emit('notificationQueued', {
            notificationId,
            channel,
            recipient,
            templateName
        });

        return {
            success: true,
            notificationId,
            scheduledAt
        };
    }

    /**
     * Send immediate notification (high priority)
     * @param {Object} notificationData - Notification data
     * @returns {Object} Send result
     */
    async sendImmediate(notificationData) {
        // Set high priority and immediate scheduling
        const result = await this.queueNotification({
            ...notificationData,
            priority: 'high',
            scheduledAt: new Date()
        });

        // Trigger immediate processing
        setImmediate(() => this.processQueue());

        return result;
    }

    /**
     * Bulk send notifications
     * @param {Array} notifications - Array of notification data
     * @returns {Object} Bulk send result
     */
    async bulkSend(notifications) {
        const results = [];

        for (const notification of notifications) {
            try {
                const result = await this.queueNotification(notification);
                results.push({
                    success: true,
                    ...result,
                    recipient: notification.recipient
                });
            } catch (error) {
                results.push({
                    success: false,
                    error: error.message,
                    recipient: notification.recipient
                });
            }
        }

        // Trigger processing
        setImmediate(() => this.processQueue());

        return {
            total: notifications.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results
        };
    }

    /**
     * Schedule notification
     * @param {Object} notificationData - Notification data
     * @param {Date} scheduleAt - When to send
     * @returns {Object} Scheduled notification info
     */
    async scheduleNotification(notificationData, scheduleAt) {
        return await this.queueNotification({
            ...notificationData,
            scheduledAt: scheduleAt
        });
    }

    /**
     * Cancel pending notification
     * @param {number} notificationId - Notification ID
     * @returns {boolean} Cancel result
     */
    async cancelNotification(notificationId) {
        const result = await QueryHelper.query(`
            UPDATE notification_queue
            SET status = 'cancelled',
                updated_at = NOW()
            WHERE id = $1 AND status = 'pending'
        `, [notificationId]);

        return result.rowCount > 0;
    }

    /**
     * Get notification status
     * @param {number} notificationId - Notification ID
     * @returns {Object} Notification status
     */
    async getNotificationStatus(notificationId) {
        return await QueryHelper.getOne(`
            SELECT
                id,
                channel,
                recipient,
                status,
                priority,
                created_at,
                send_after,
                processed_at,
                sent_at,
                attempt_count,
                error_message,
                delivery_status
            FROM notification_queue
            WHERE id = $1
        `, [notificationId]);
    }

    /**
     * Get notification statistics
     * @param {Object} filters - Filter options
     * @returns {Object} Statistics
     */
    async getStatistics(filters = {}) {
        const { startDate, endDate, customerId, channel } = filters;

        let whereClause = 'WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (startDate) {
            whereClause += ` AND DATE(created_at) >= $${paramIndex++}`;
            params.push(startDate);
        }

        if (endDate) {
            whereClause += ` AND DATE(created_at) <= $${paramIndex++}`;
            params.push(endDate);
        }

        if (customerId) {
            whereClause += ` AND customer_id = $${paramIndex++}`;
            params.push(customerId);
        }

        if (channel) {
            whereClause += ` AND channel = $${paramIndex++}`;
            params.push(channel);
        }

        const stats = await QueryHelper.getOne(`
            SELECT
                COUNT(*) as total_notifications,
                COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_notifications,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_notifications,
                COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_notifications,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_notifications,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_notifications,
                COUNT(CASE WHEN channel = 'whatsapp' THEN 1 END) as whatsapp_notifications,
                COUNT(CASE WHEN channel = 'email' THEN 1 END) as email_notifications,
                COUNT(CASE WHEN channel = 'sms' THEN 1 END) as sms_notifications,
                AVG(CASE WHEN status = 'sent' AND sent_at IS NOT NULL
                    THEN EXTRACT(EPOCH FROM (sent_at - created_at))
                END) as avg_delivery_time_seconds
            FROM notification_queue
            ${whereClause}
        `, params);

        // Get pending count by priority
        const pendingByPriority = await QueryHelper.getMany(`
            SELECT priority, COUNT(*) as count
            FROM notification_queue
            WHERE status = 'pending'
              AND send_after <= NOW()
            GROUP BY priority
            ORDER BY priority DESC
        `);

        return {
            ...stats,
            pendingByPriority,
            isProcessing: this.isProcessing
        };
    }

    /**
     * Cleanup old notifications
     * @param {number} daysToKeep - Days to keep notifications
     * @returns {number} Cleaned count
     */
    async cleanupOldNotifications(daysToKeep = 30) {
        const result = await QueryHelper.query(`
            DELETE FROM notification_queue
            WHERE created_at < NOW() - INTERVAL $1 days
            RETURNING id
        `, [daysToKeep]);

        console.log(`🗑️ Cleaned up ${result.rowCount} old notifications`);
        this.emit('cleanupCompleted', { count: result.rowCount });

        return result.rowCount;
    }

    /**
     * Create notification template
     * @param {Object} templateData - Template data
     * @returns {Object} Created template
     */
    async createTemplate(templateData) {
        const {
            name,
            channel,
            subject,
            content,
            variables = [],
            isActive = true
        } = templateData;

        const templateId = await QueryHelper.insert(`
            INSERT INTO notification_templates
            (name, channel, subject, content, variables, is_active, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
            RETURNING id
        `, [
            name,
            channel,
            subject,
            content,
            JSON.stringify(variables),
            isActive
        ]);

        return {
            success: true,
            templateId,
            name
        };
    }

    /**
     * Get notification template
     * @param {string} name - Template name
     * @param {string} channel - Channel type
     * @returns {Object} Template data
     */
    async getTemplate(name, channel) {
        return await QueryHelper.getOne(`
            SELECT * FROM notification_templates
            WHERE name = $1 AND channel = $2 AND is_active = true
        `, [name, channel]);
    }

    /**
     * Parse template with variables
     * @param {string} content - Template content
     * @param {Object} variables - Variables to substitute
     * @returns {string} Parsed content
     */
    parseTemplate(content, variables = {}) {
        let parsed = content;

        // Replace {{variable}} patterns
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
            parsed = parsed.replace(regex, value || '');
        }

        return parsed;
    }
}

module.exports = NotificationFlowService;