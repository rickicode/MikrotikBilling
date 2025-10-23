const WhatsAppSessionManager = require('./WhatsAppSessionManager');
const { db } = require('../database/DatabaseManager');
const EventEmitter = require('events');

class WhatsAppService extends EventEmitter {
    constructor() {
        super();
        this.sessionManager = new WhatsAppSessionManager();
        this.query = null; // Will be initialized when database is available
        this.templates = new Map();
        this.isInitialized = false;
        this.eventListeners = new Map();
        this.botService = null;
    }

    /**
     * Set bot service (for compatibility)
     */
    setBotService(botService) {
        this.botService = botService;
    }

    /**
     * Initialize WhatsApp service
     */
    async initialize(dbPool = null) {
        try {
            console.log('📱 Initializing WhatsApp Service...');

            // Initialize query if database pool is provided
            if (dbPool) {
                // PostgreSQL pool
                console.log('🐘 WhatsApp Service using PostgreSQL');
                this.query = new Query(dbPool);
                this.sessionManager.query = this.query;
            }

            // Initialize session manager
            await this.sessionManager.initialize(dbPool);

            // Load templates from database
            await this.loadTemplates();

            // Start monitoring
            this.startMonitoring();

            this.isInitialized = true;
            console.log('✅ WhatsApp Service initialized successfully');

        } catch (error) {
            console.error('❌ Failed to initialize WhatsApp Service:', error);
            throw error;
        }
    }

    /**
     * Load message templates
     */
    async loadTemplates() {
        try {
            const templates = await db.findMany('whatsapp_templates', { is_active: true });

            for (const template of templates) {
                this.templates.set(template.name, {
                    ...template,
                    variables: template.variables || []
                });
            }

            console.log(`Loaded ${templates.length} WhatsApp templates`);
        } catch (error) {
            console.error('Failed to load templates:', error);
        }
    }

    /**
     * Send notification
     */
    async sendNotification(phoneNumber, templateName, variables = {}, options = {}) {
        try {
            const template = this.templates.get(templateName);
            if (!template) {
                throw new Error(`Template not found: ${templateName}`);
            }

            // Parse variables
            const content = this.parseTemplate(template.content, variables);

            // Send message
            const result = await this.sessionManager.sendMessage(
                phoneNumber,
                content,
                {
                    ...options,
                    templateName,
                    variables
                }
            );

            // Log notification
            await this.logNotification(phoneNumber, templateName, variables, result);

            return {
                success: true,
                messageId: result.messageId,
                sessionId: result.sessionId,
                template: templateName
            };

        } catch (error) {
            console.error('Failed to send notification:', error);
            throw error;
        }
    }

    /**
     * Parse template with variables
     */
    parseTemplate(content, variables) {
        let parsed = content;

        // Replace {{variable}} patterns
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
            parsed = parsed.replace(regex, value);
        }

        return parsed;
    }

    /**
     * Send bulk notifications
     */
    async sendBulkNotifications(recipients, templateName, variables = {}, options = {}) {
        const results = [];

        for (const recipient of recipients) {
            try {
                const result = await this.sendNotification(
                    recipient.phoneNumber,
                    templateName,
                    { ...variables, ...recipient.variables },
                    { ...options, priority: 'bulk' }
                );
                results.push({ phoneNumber: recipient.phoneNumber, success: true, ...result });
            } catch (error) {
                results.push({ phoneNumber: recipient.phoneNumber, success: false, error: error.message });
            }

            // Add delay between bulk messages
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        return results;
    }

    /**
     * Queue notification for scheduled sending
     */
    async queueNotification(phoneNumber, templateName, variables = {}, sendAt = null, options = {}) {
        try {
            const notificationId = await this.sessionManager.queueMessage(
                phoneNumber,
                this.parseTemplate(this.templates.get(templateName)?.content || '', variables),
                {
                    ...options,
                    templateName,
                    variables,
                    scheduledAt: sendAt
                }
            );

            return {
                success: true,
                notificationId,
                scheduledAt: sendAt || new Date()
            };
        } catch (error) {
            console.error('Failed to queue notification:', error);
            throw error;
        }
    }

    /**
     * Create new session
     */
    async createSession(sessionName, options = {}) {
        return await this.sessionManager.createSession(sessionName, options);
    }

    /**
     * Get session QR code
     */
    async getSessionQR(sessionId) {
        try {
            const session = await QueryHelper.getOne(`
                SELECT session_id, session_name, status, qr_code, phone_number
                FROM whatsapp_sessions
                WHERE session_id = $1
            `, [sessionId]);

            if (!session) {
                throw new Error('Session not found');
            }

            return session;
        } catch (error) {
            console.error('Failed to get session QR:', error);
            throw error;
        }
    }

    /**
     * Get all sessions
     */
    async getSessions() {
        try {
            const sessions = await QueryHelper.getMany(`
                SELECT session_id, session_name, status, priority,
                       phone_number, last_activity, created_at
                FROM whatsapp_sessions
                ORDER BY priority DESC, session_name
            `);

            return sessions;
        } catch (error) {
            console.error('Failed to get sessions:', error);
            throw error;
        }
    }

    /**
     * Delete session
     */
    async deleteSession(sessionId) {
        return await this.sessionManager.deleteSession(sessionId);
    }

    /**
     * Send payment notification
     */
    async sendPaymentNotification(phoneNumber, invoiceData, type = 'payment_request') {
        const templates = {
            payment_request: 'payment_received',
            payment_success: 'payment_success',
            payment_failed: 'payment_failed',
            payment_reminder: 'payment_reminder'
        };

        const templateName = templates[type];
        if (!templateName) {
            throw new Error(`Invalid payment notification type: ${type}`);
        }

        return await this.sendNotification(phoneNumber, templateName, {
            customerName: invoiceData.customerName,
            invoiceNumber: invoiceData.invoiceNumber,
            amount: this.formatCurrency(invoiceData.amount),
            dueDate: invoiceData.dueDate,
            paymentUrl: invoiceData.paymentUrl,
            companyName: process.env.COMPANY_NAME || 'Mikrotik Billing'
        });
    }

    /**
     * Send subscription notification
     */
    async sendSubscriptionNotification(phoneNumber, subscriptionData, type = 'expiry_warning') {
        const templates = {
            new_subscription: 'subscription_activated',
            expiry_warning: 'subscription_expiry_warning',
            expired: 'subscription_expired',
            renewed: 'subscription_renewed'
        };

        const templateName = templates[type];
        if (!templateName) {
            throw new Error(`Invalid subscription notification type: ${type}`);
        }

        return await this.sendNotification(phoneNumber, templateName, {
            customerName: subscriptionData.customerName,
            serviceName: subscriptionData.serviceName,
            expiryDate: subscriptionData.expiryDate,
            daysLeft: subscriptionData.daysLeft,
            companyName: process.env.COMPANY_NAME || 'Mikrotik Billing'
        });
    }

    /**
     * Log notification
     */
    async logNotification(phoneNumber, templateName, variables, result) {
        try {
            await QueryHelper.insert(`
                INSERT INTO notification_queue (
                    session_id, phone_number, template_name, variables,
                    status, message_id, created_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, NOW()
                )
            `, [
                result.sessionId,
                phoneNumber,
                templateName,
                JSON.stringify(variables),
                'sent',
                result.messageId
            ]);
        } catch (error) {
            console.error('Failed to log notification:', error);
        }
    }

    /**
     * Get notification statistics
     */
    async getStatistics(startDate, endDate) {
        try {
            const stats = await QueryHelper.getOne(`
                SELECT
                    COUNT(*) as total_sent,
                    COUNT(CASE WHEN status = 'sent' THEN 1 END) as successful,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
                    COUNT(DISTINCT phone_number) as unique_recipients
                FROM notification_queue
                WHERE created_at BETWEEN $1 AND $2
            `, [startDate, endDate]);

            const templateStats = await QueryHelper.getMany(`
                SELECT template_name, COUNT(*) as sent_count
                FROM notification_queue
                WHERE created_at BETWEEN $1 AND $2
                GROUP BY template_name
                ORDER BY sent_count DESC
            `, [startDate, endDate]);

            return {
                ...stats,
                sessionStats: this.sessionManager.getStatistics(),
                templateStats
            };
        } catch (error) {
            console.error('Failed to get statistics:', error);
            throw error;
        }
    }

    /**
     * Format currency
     */
    formatCurrency(amount) {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR'
        }).format(amount);
    }

    /**
     * Start monitoring
     */
    startMonitoring() {
        // Clean up old messages
        setInterval(async () => {
            await this.cleanupOldMessages();
        }, 24 * 60 * 60 * 1000); // Daily

        // Update session statistics
        setInterval(async () => {
            await this.updateSessionStats();
        }, 5 * 60 * 1000); // Every 5 minutes
    }

    /**
     * Clean up old messages
     */
    async cleanupOldMessages() {
        try {
            const retentionDays = parseInt(process.env.WHATSAPP_MESSAGE_RETENTION_DAYS || '15');
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

            await QueryHelper.query(`
                DELETE FROM whatsapp_messages
                WHERE created_at < $1
            `, [cutoffDate]);

            await QueryHelper.query(`
                DELETE FROM notification_queue
                WHERE created_at < $1
            `, [cutoffDate]);

            console.log(`Cleaned up WhatsApp messages older than ${retentionDays} days`);
        } catch (error) {
            console.error('Failed to cleanup old messages:', error);
        }
    }

    /**
     * Update session statistics
     */
    async updateSessionStats() {
        try {
            const stats = this.sessionManager.getStatistics();

            for (const [sessionId, sessionData] of this.sessionManager.sessions) {
                await QueryHelper.query(`
                    UPDATE whatsapp_sessions
                    SET last_activity = $1, updated_at = NOW()
                    WHERE session_id = $2
                `, [
                    new Date(sessionData.lastActivity),
                    sessionId
                ]);
            }
        } catch (error) {
            console.error('Failed to update session stats:', error);
        }
    }

    /**
     * Register event listener
     */
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    /**
     * Emit event to listeners
     */
    emit(event, data) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.forEach(callback => callback(data));
        }
    }

    /**
     * Get connection status
     */
    async getConnectionStatus() {
        const stats = this.sessionManager.getStatistics();
        return {
            status: stats.connected > 0 ? 'connected' : 'disconnected',
            totalSessions: stats.total,
            connectedSessions: stats.connected,
            sessionDetails: Array.from(this.sessionManager.sessions.values()).map(s => ({
                sessionId: s.session_id,
                sessionName: s.session_name,
                status: s.status,
                phoneNumber: s.phone_number,
                lastActivity: s.lastActivity
            }))
        };
    }

    /**
     * Get available sessions for load balancing
     */
    getAvailableSessions() {
        return Array.from(this.sessionManager.sessions.values())
            .filter(s => s.status === 'connected')
            .sort((a, b) => b.priority - a.priority);
    }

    /**
     * Send message with session selection
     */
    async sendMessageWithSession(phoneNumber, message, options = {}) {
        try {
            const sessionId = options.sessionId;
            let session;

            if (sessionId) {
                session = this.sessionManager.sessions.get(sessionId);
                if (!session || session.status !== 'connected') {
                    throw new Error('Specified session is not available');
                }
            } else {
                // Auto-select available session
                session = this.sessionManager.getAvailableSession(options.priority || 'normal');
                if (!session) {
                    throw new Error('No available sessions');
                }
            }

            return await this.sessionManager.sendMessage(
                phoneNumber,
                message,
                { ...options, sessionId: session.session_id }
            );
        } catch (error) {
            console.error('Failed to send message with session:', error);
            throw error;
        }
    }

    /**
     * Broadcast message to multiple recipients
     */
    async broadcast(message, recipients, options = {}) {
        const results = [];
        const sessions = this.getAvailableSessions();

        if (sessions.length === 0) {
            throw new Error('No available sessions for broadcasting');
        }

        for (let i = 0; i < recipients.length; i++) {
            const recipient = recipients[i];
            const session = sessions[i % sessions.length]; // Round-robin session selection

            try {
                const result = await this.sessionManager.sendMessage(
                    recipient.phoneNumber,
                    typeof message === 'string' ? message : message.content,
                    {
                        sessionId: session.session_id,
                        ...options,
                        recipientId: recipient.id
                    }
                );
                results.push({ phoneNumber: recipient.phoneNumber, success: true, ...result });
            } catch (error) {
                results.push({ phoneNumber: recipient.phoneNumber, success: false, error: error.message });
            }

            // Small delay between messages
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        return results;
    }

    /**
     * Generate QR code for WhatsApp connection
     */
    async generateQRCode(sessionId = null) {
        try {
            // If no sessionId provided, try to get or create a default session
            if (!sessionId) {
                const sessions = await this.getSessions();
                // Since is_default column doesn't exist, use the first session or highest priority
                let defaultSession = sessions.length > 0 ? sessions[0] : null;

                if (!defaultSession) {
                    // Create a new session if none exist
                    const result = await this.createSession('Default Session', {
                        isDefault: true,
                        priority: 100
                    });
                    sessionId = result.sessionId;
                } else {
                    // Use the first session as default
                    defaultSession = sessions[0];
                    sessionId = defaultSession.session_id;
                }
            } else {
                sessionId = defaultSession.session_id;
            }

            // Connect the session to generate QR code
            await this.sessionManager.connectSession(sessionId);

            // Get the session data with QR code
            const sessionData = this.sessionManager.sessions.get(sessionId);
            if (sessionData && sessionData.qrCode) {
                return {
                    success: true,
                    qrCode: sessionData.qrCode,
                    sessionId: sessionId,
                    status: sessionData.status
                };
            } else {
                // If QR code not ready yet, return session status
                const session = await this.getSessionQR(sessionId);
                return {
                    success: true,
                    qrCode: session.qr_code,
                    sessionId: sessionId,
                    status: session.status
                };
            }
        } catch (error) {
            console.error('Failed to generate QR code:', error);
            throw error;
        }
    }

    /**
     * Refresh QR code for existing session
     */
    async refreshQRCode(sessionId) {
        try {
            const sessionData = this.sessionManager.sessions.get(sessionId);
            if (!sessionData) {
                throw new Error('Session not found');
            }

            // Disconnect and reconnect to generate new QR code
            if (sessionData.socket) {
                await this.sessionManager.disconnectSession(sessionId);
            }

            // Wait a moment before reconnecting
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Connect again to generate new QR code
            await this.sessionManager.connectSession(sessionId);

            // Get updated session data
            const updatedSession = this.sessionManager.sessions.get(sessionId);
            if (updatedSession && updatedSession.qrCode) {
                return {
                    success: true,
                    qrCode: updatedSession.qrCode,
                    sessionId: sessionId,
                    status: updatedSession.status
                };
            } else {
                return {
                    success: false,
                    error: 'QR code not ready yet, please try again in a moment'
                };
            }
        } catch (error) {
            console.error('Failed to refresh QR code:', error);
            throw error;
        }
    }

    /**
     * Get default session for QR generation
     */
    async getDefaultSession() {
        try {
            const sessions = await this.getSessions();
            // Since is_default column doesn't exist, use the first session or highest priority
            let defaultSession = sessions.length > 0 ? sessions[0] : null;

            if (!defaultSession) {
                // Create default session
                const result = await this.createSession('Default Session', {
                    isDefault: true,
                    priority: 100
                });
                return result.sessionId;
            } else {
                // Use first session as default
                return sessions[0].session_id;
            }

            return defaultSession.session_id;
        } catch (error) {
            console.error('Failed to get default session:', error);
            throw error;
        }
    }
}

module.exports = WhatsAppService;