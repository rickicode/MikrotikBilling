const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs').promises;
const path = require('path');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database/DatabaseManager');

class WhatsAppSessionManager {
    constructor() {
        this.sessions = new Map(); // session_id -> session_data
        this.query = db; // Use the new database manager
        this.sessionsDir = path.join(__dirname, '../.whatsapp-sessions');
        this.isInitialized = false;
        this.messageQueue = [];
        this.maxSessions = 5; // Maximum concurrent sessions
        this.priorityQueue = {
            high: [],
            normal: [],
            low: [],
            bulk: []
        };
        this.currentSessionIndex = 0;
        this.sessionRotationInterval = 30000; // 30 seconds
        this.lastRotation = Date.now();
    }

    /**
     * Initialize the session manager
     */
    async initialize(dbPool = null) {
        try {
            console.log('🔌 Initializing WhatsApp Session Manager...');

            // Initialize query if database pool is provided
            if (dbPool && !this.query) {
                // PostgreSQL pool
                this.query = new Query(dbPool);
            }

            // Ensure sessions directory exists
            await fs.mkdir(this.sessionsDir, { recursive: true });

            // Load active sessions from database
            await this.loadActiveSessions();

            // Initialize each session
            for (const sessionData of this.sessions.values()) {
                if (sessionData.status === 'connected') {
                    await this.connectSession(sessionData.session_id);
                }
            }

            // Start session rotation
            this.startSessionRotation();

            // Start message queue processor
            this.startMessageProcessor();

            this.isInitialized = true;
            console.log(`✅ WhatsApp Session Manager initialized with ${this.sessions.size} sessions`);

        } catch (error) {
            console.error('❌ Failed to initialize WhatsApp Session Manager:', error);
            throw error;
        }
    }

    /**
     * Load active sessions from database
     */
    async loadActiveSessions() {
        try {
            // Use raw query to handle enum properly in PostgreSQL
            const result = await db.query(`
                SELECT * FROM whatsapp_sessions
                WHERE status IN ('connected', 'connecting', 'scanning')
                ORDER BY priority DESC, session_name ASC
            `);
            const sessions = result.rows || result;

            for (const session of sessions) {
                this.sessions.set(session.session_id, {
                    ...session,
                    socket: null,
                    lastActivity: new Date(session.last_activity || Date.now()),
                    messageCount: 0,
                    errorCount: 0
                });
            }

            console.log(`Loaded ${sessions.length} sessions from database`);
        } catch (error) {
            console.error('Failed to load sessions:', error);
        }
    }

    /**
     * Create new WhatsApp session
     */
    async createSession(sessionName, options = {}) {
        try {
            const sessionId = uuidv4();
            const sessionPath = path.join(this.sessionsDir, sessionId);

            // Create session directory
            await fs.mkdir(sessionPath, { recursive: true });

            // Save to database
            await QueryHelper.insert(`
                INSERT INTO whatsapp_sessions (
                    session_id, session_name, status, priority,
                    created_at, updated_at
                ) VALUES (
                    $1, $2, 'disconnected', $3,
                    NOW(), NOW()
                )
                RETURNING *
            `, [
                sessionId,
                sessionName,
                options.priority || 0
            ]);

            // Create session instance
            const sessionData = {
                session_id: sessionId,
                session_name: sessionName,
                status: 'disconnected',
                priority: options.priority || 0,
                is_default: options.isDefault || false,
                phone_number: null,
                socket: null,
                lastActivity: Date.now(),
                messageCount: 0,
                errorCount: 0,
                qrCode: null,
                authPath: sessionPath
            };

            this.sessions.set(sessionId, sessionData);

            // Connect the session
            await this.connectSession(sessionId);

            return {
                success: true,
                sessionId,
                sessionName,
                status: 'disconnected'
            };

        } catch (error) {
            console.error('Failed to create session:', error);
            throw error;
        }
    }

    /**
     * Connect a WhatsApp session
     */
    async connectSession(sessionId) {
        try {
            const sessionData = this.sessions.get(sessionId);
            if (!sessionData) {
                throw new Error('Session not found');
            }

            if (sessionData.socket) {
                console.log(`Session ${sessionId} already connected`);
                return;
            }

            const { state, saveCreds } = await useMultiFileAuthState(sessionData.authPath);

            // Create socket configuration
            const socketConfig = {
                auth: state,
                logger: pino({ level: 'silent' }), // Disable logging for production
                browser: ['Mikrotik Billing', 'Chrome', '120.0.0.0'],
                printQRInTerminal: false,
                connectTimeoutMs: 60000,
                retryRequestDelayMs: 5000,
                keepAliveIntervalMs: 30000,
                emitOwnEvents: false,
                ...sessionData.metadata?.socketConfig
            };

            // Create socket
            const socket = makeWASocket(socketConfig);

            // Store socket in session data
            sessionData.socket = socket;
            sessionData.status = 'connecting';

            // Handle connection events
            this.setupSocketHandlers(sessionId, socket, saveCreds);

            // Wait for connection
            await this.waitForConnection(sessionId, 30000);

            return true;

        } catch (error) {
            console.error(`Failed to connect session ${sessionId}:`, error);
            const sessionData = this.sessions.get(sessionId);
            if (sessionData) {
                sessionData.status = 'error';
                sessionData.errorCount++;
            }
            throw error;
        }
    }

    /**
     * Setup socket event handlers
     */
    setupSocketHandlers(sessionId, socket, saveCreds) {
        const sessionData = this.sessions.get(sessionId);

        // Connection update handler
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, isNewLogin, qr } = update;

            if (qr) {
                // Generate QR code
                const qrCodeData = await qrcode.toDataURL(qr);
                sessionData.qrCode = qrCodeData;
                sessionData.status = 'qr';

                // Save QR code to database
                await QueryHelper.query(`
                    UPDATE whatsapp_sessions
                    SET qr_code = $1, status = 'qr', updated_at = NOW()
                    WHERE session_id = $2
                `, [qrCodeData, sessionId]);

                // Emit QR code event
                this.emitEvent('qr', {
                    sessionId,
                    qrCode: qrCodeData,
                    isNewLogin
                });
            }

            if (connection) {
                const connectionStatus = connection;

                if (connectionStatus === 'open') {
                    sessionData.status = 'connected';
                    sessionData.qrCode = null;
                    sessionData.lastActivity = Date.now();
                    sessionData.phone_number = socket.user.id.split(':')[0];

                    // Update database
                    await QueryHelper.query(`
                        UPDATE whatsapp_sessions
                        SET status = 'connected', phone_number = $1,
                            qr_code = NULL, last_activity = NOW(),
                            updated_at = NOW()
                        WHERE session_id = $2
                    `, [sessionData.phone_number, sessionId]);

                    // Emit connected event
                    this.emitEvent('connected', {
                        sessionId,
                        phoneNumber: sessionData.phone_number
                    });

                    console.log(`WhatsApp session ${sessionId} connected successfully`);
                }

                if (connectionStatus === 'close') {
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

                    if (shouldReconnect) {
                        sessionData.status = 'reconnecting';
                        console.log(`Session ${sessionId} disconnected, reconnecting...`);

                        // Attempt to reconnect after delay
                        setTimeout(() => {
                            this.connectSession(sessionId);
                        }, 5000);
                    } else {
                        sessionData.status = 'logged_out';
                        console.log(`Session ${sessionId} logged out`);

                        // Update database
                        await QueryHelper.query(`
                            UPDATE whatsapp_sessions
                            SET status = 'logged_out',
                                updated_at = NOW()
                            WHERE session_id = $1
                        `, [sessionId]);
                    }
                }
            }

            saveCreds();
        });

        // Credentials update handler
        socket.ev.on('creds.update', saveCreds);

        // Message handler
        socket.ev.on('messages.upsert', async (m) => {
            const message = m.messages[0];
            if (!message.message) return;

            sessionData.lastActivity = Date.now();
            sessionData.messageCount++;

            // Save message to database
            await this.saveMessage(sessionId, message);

            // Emit message event
            this.emitEvent('message', {
                sessionId,
                message: this.formatMessage(message)
            });
        });

        // Contact updates
        socket.ev.on('contacts.update', (contacts) => {
            this.emitEvent('contacts-update', {
                sessionId,
                contacts
            });
        });
    }

    /**
     * Wait for connection with timeout
     */
    async waitForConnection(sessionId, timeout = 30000) {
        return new Promise((resolve, reject) => {
            const sessionData = this.sessions.get(sessionId);
            const startTime = Date.now();

            const checkStatus = () => {
                if (sessionData.status === 'connected') {
                    resolve(true);
                } else if (Date.now() - startTime > timeout) {
                    reject(new Error('Connection timeout'));
                } else if (sessionData.status === 'error') {
                    reject(new Error('Connection failed'));
                } else {
                    setTimeout(checkStatus, 1000);
                }
            };

            checkStatus();
        });
    }

    /**
     * Send message using available session
     */
    async sendMessage(phoneNumber, message, options = {}) {
        try {
            // Get active session based on priority and availability
            const session = this.getAvailableSession(options.priority || 'normal');

            if (!session) {
                throw new Error('No active sessions available');
            }

            const formattedPhone = this.formatPhoneNumber(phoneNumber);
            const messagePayload = this.createMessagePayload(message, options.type || 'text');

            // Send message
            const result = await session.socket.sendMessage(formattedPhone, messagePayload);

            // Update session stats
            session.lastActivity = Date.now();
            session.messageCount++;

            // Log to database
            await this.logOutboundMessage(session.session_id, formattedPhone, messagePayload);

            return {
                success: true,
                messageId: result.key.id,
                sessionId: session.session_id,
                status: 'sent'
            };

        } catch (error) {
            console.error('Failed to send message:', error);
            throw error;
        }
    }

    /**
     * Get available session based on priority
     */
    getAvailableSession(priority = 'normal') {
        const activeSessions = Array.from(this.sessions.values())
            .filter(s => s.status === 'connected')
            .sort((a, b) => b.priority - a.priority);

        // Find session with matching priority
        const prioritySession = activeSessions.find(s => s.priority >= this.getPriorityValue(priority));

        if (prioritySession) {
            return prioritySession;
        }

        // Return any connected session if priority not found
        return activeSessions[0] || null;
    }

    /**
     * Get numeric priority value
     */
    getPriorityValue(priority) {
        const values = {
            high: 100,
            normal: 50,
            low: 10,
            bulk: 0
        };
        return values[priority] || 50;
    }

    /**
     * Queue message for sending
     */
    queueMessage(phoneNumber, message, options = {}) {
        const priority = options.priority || 'normal';
        const messageData = {
            id: uuidv4(),
            phoneNumber,
            message,
            options,
            attempts: 0,
            maxAttempts: 3,
            createdAt: Date.now()
        };

        this.priorityQueue[priority].push(messageData);
        return messageData.id;
    }

    /**
     * Start message processor
     */
    startMessageProcessor() {
        setInterval(async () => {
            // Process high priority first
            await this.processQueue('high');
            await this.processQueue('normal');
            await this.processQueue('low');
            await this.processQueue('bulk');
        }, 1000);
    }

    /**
     * Process message queue
     */
    async processQueue(priority) {
        const queue = this.priorityQueue[priority];
        if (queue.length === 0) return;

        const message = queue.shift();

        try {
            await this.sendMessage(message.phoneNumber, message.message, message.options);
            this.emitEvent('message-sent', { messageId: message.id });
        } catch (error) {
            message.attempts++;

            if (message.attempts < message.maxAttempts) {
                // Re-queue with delay
                setTimeout(() => {
                    queue.push(message);
                }, 5000 * message.attempts);
            } else {
                this.emitEvent('message-failed', {
                    messageId: message.id,
                    error: error.message
                });
            }
        }
    }

    /**
     * Start session rotation for load balancing
     */
    startSessionRotation() {
        setInterval(() => {
            const connectedSessions = Array.from(this.sessions.values())
                .filter(s => s.status === 'connected');

            if (connectedSessions.length > 0) {
                this.currentSessionIndex = (this.currentSessionIndex + 1) % connectedSessions.length;
                this.lastRotation = Date.now();
            }
        }, this.sessionRotationInterval);
    }

    /**
     * Save message to database
     */
    async saveMessage(sessionId, message) {
        try {
            const formatted = this.formatMessage(message);

            await QueryHelper.insert(`
                INSERT INTO whatsapp_messages (
                    session_id, message_id, from_number, to_number,
                    message_type, content, is_incoming, created_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, NOW()
                )
            `, [
                sessionId,
                message.key.id,
                message.key.remoteJid,
                message.key.fromMe ? this.sessions.get(sessionId).phone_number : message.key.remoteJid,
                message.messageType || 'text',
                message.message?.conversation || message.message?.extendedTextMessage?.text || '',
                !message.key.fromMe
            ]);
        } catch (error) {
            console.error('Failed to save message:', error);
        }
    }

    /**
     * Log outbound message
     */
    async logOutboundMessage(sessionId, phoneNumber, message) {
        try {
            await QueryHelper.insert(`
                INSERT INTO notification_queue (
                    session_id, phone_number, message_type, content,
                    status, sent_at, created_at
                ) VALUES (
                    $1, $2, $3, $4, 'sent', NOW(), NOW()
                )
            `, [
                sessionId,
                phoneNumber,
                message.text ? 'text' : 'media',
                message.text || JSON.stringify(message)
            ]);
        } catch (error) {
            console.error('Failed to log outbound message:', error);
        }
    }

    /**
     * Format phone number
     */
    formatPhoneNumber(phoneNumber) {
        // Remove non-digit characters
        let formatted = phoneNumber.replace(/\D/g, '');

        // Add country code if missing (assuming Indonesia)
        if (formatted.length <= 12 && !formatted.startsWith('62')) {
            formatted = '62' + formatted;
        }

        // Remove leading zero if present
        if (formatted.startsWith('620')) {
            formatted = '62' + formatted.substring(3);
        }

        return formatted + '@s.whatsapp.net';
    }

    /**
     * Create message payload
     */
    createMessagePayload(message, type = 'text') {
        switch (type) {
            case 'text':
                return { text: message };
            case 'image':
                return {
                    image: {
                        url: message.url,
                        caption: message.caption
                    }
                };
            case 'document':
                return {
                    document: {
                        url: message.url,
                        fileName: message.fileName,
                        caption: message.caption
                    }
                };
            default:
                return { text: message };
        }
    }

    /**
     * Format message for output
     */
    formatMessage(message) {
        return {
            id: message.key.id,
            from: message.key.remoteJid,
            fromMe: message.key.fromMe,
            timestamp: message.messageTimestamp,
            type: message.messageType,
            content: message.message?.conversation ||
                     message.message?.extendedTextMessage?.text ||
                     JSON.stringify(message.message),
            pushName: message.pushName
        };
    }

    /**
     * Emit event to listeners
     */
    emitEvent(event, data) {
        // In a real implementation, this would emit to WebSocket clients
        console.log(`WhatsApp Event [${event}]:`, data);
    }

    /**
     * Disconnect session
     */
    async disconnectSession(sessionId) {
        try {
            const sessionData = this.sessions.get(sessionId);
            if (sessionData?.socket) {
                await sessionData.socket.logout();
                sessionData.socket = null;
                sessionData.status = 'disconnected';
            }
        } catch (error) {
            console.error(`Failed to disconnect session ${sessionId}:`, error);
        }
    }

    /**
     * Delete session
     */
    async deleteSession(sessionId) {
        try {
            // Disconnect first
            await this.disconnectSession(sessionId);

            // Delete from database
            await QueryHelper.query('DELETE FROM whatsapp_sessions WHERE session_id = $1', [sessionId]);

            // Remove from memory
            this.sessions.delete(sessionId);

            // Delete auth files
            const sessionPath = path.join(this.sessionsDir, sessionId);
            await fs.rm(sessionPath, { recursive: true, force: true });

            return true;
        } catch (error) {
            console.error(`Failed to delete session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Get session statistics
     */
    getStatistics() {
        const stats = {
            total: this.sessions.size,
            connected: 0,
            disconnected: 0,
            connecting: 0,
            qr: 0,
            error: 0,
            logged_out: 0
        };

        let totalMessages = 0;
        let totalErrors = 0;

        for (const session of this.sessions.values()) {
            stats[session.status.replace('-', '_')] = (stats[session.status.replace('-', '_')] || 0) + 1;
            totalMessages += session.messageCount || 0;
            totalErrors += session.errorCount || 0;
        }

        return {
            ...stats,
            totalMessages,
            totalErrors,
            queueLengths: {
                high: this.priorityQueue.high.length,
                normal: this.priorityQueue.normal.length,
                low: this.priorityQueue.low.length,
                bulk: this.priorityQueue.bulk.length
            }
        };
    }
}

module.exports = WhatsAppSessionManager;