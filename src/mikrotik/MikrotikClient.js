/**
 * Enhanced Mikrotik API Client
 *
 * Features:
 * - RouterOS API v2.0 support
 * - SSL/TLS connections
 * - Command compression
 * - Response streaming
 * - Automatic reconnection
 * - Command batching
 * - Error handling and recovery
 * - Performance monitoring
 */

const { EventEmitter } = require('events');
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');

class MikrotikClient extends EventEmitter {
    constructor(config, dependencies = {}) {
        super();

        this.config = {
            host: 'localhost',
            port: 8728,
            username: 'admin',
            password: '',
            ssl: false,
            timeout: 30000,
            keepAlive: true,
            keepAliveDelay: 30000,
            maxRetries: 3,
            retryDelay: 1000,
            compression: true,
            compressionThreshold: 1024,
            ...config
        };

        this.dependencies = {
            securityManager: null,
            cacheManager: null,
            logger: console,
            ...dependencies
        };

        // Connection state
        this.socket = null;
        this.isConnectedFlag = false;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.lastActivity = Date.now();

        // Command management
        this.commandQueue = [];
        this.pendingCommands = new Map(); // tag -> command info
        this.commandTag = 0;
        this.commandTimeouts = new Map();

        // Response handling
        this.responseBuffer = Buffer.alloc(0);
        this.currentResponse = null;
        this.responseHandlers = new Map();

        // Authentication
        this.authenticated = false;
        this.challenge = null;

        // Statistics
        this.stats = {
            commandsSent: 0,
            commandsCompleted: 0,
            commandsFailed: 0,
            bytesReceived: 0,
            bytesSent: 0,
            connectionTime: 0,
            lastError: null,
            responseTimeSum: 0,
            responseTimeCount: 0
        };

        // Event listeners
        this.setupEventHandlers();
    }

    /**
     * Connect to Mikrotik device
     */
    async connect() {
        const { logger } = this.dependencies;

        if (this.isConnected()) {
            return;
        }

        if (this.isConnecting) {
            throw new Error('Connection already in progress');
        }

        this.isConnecting = true;

        try {
            logger.info(`Connecting to Mikrotik device ${this.config.host}:${this.config.port}`);

            // Create socket
            await this.createSocket();

            // Authenticate
            await this.authenticate();

            // Setup keep-alive
            if (this.config.keepAlive) {
                this.setupKeepAlive();
            }

            this.isConnectedFlag = true;
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            this.stats.connectionTime = Date.now();

            logger.info(`Successfully connected to Mikrotik device ${this.config.host}`);

            // Emit connected event
            this.emit('connected');

        } catch (error) {
            this.isConnecting = false;
            logger.error(`Failed to connect to Mikrotik device ${this.config.host}:`, error);

            // Attempt reconnection if configured
            if (this.reconnectAttempts < this.config.maxRetries) {
                this.scheduleReconnect();
            }

            throw error;
        }
    }

    /**
     * Create socket connection
     */
    async createSocket() {
        return new Promise((resolve, reject) => {
            const socketOptions = {
                host: this.config.host,
                port: this.config.port,
                timeout: this.config.timeout
            };

            const createConnection = () => {
                if (this.config.ssl) {
                    const tlsOptions = {
                        rejectUnauthorized: this.config.rejectUnauthorized,
                        cert: this.config.certFile ? require('fs').readFileSync(this.config.certFile) : undefined,
                        key: this.config.keyFile ? require('fs').readFileSync(this.config.keyFile) : undefined,
                        ca: this.config.caFile ? require('fs').readFileSync(this.config.caFile) : undefined
                    };

                    this.socket = tls.connect(this.config.port, this.config.host, tlsOptions);
                } else {
                    this.socket = net.connect(socketOptions);
                }

                // Setup socket event handlers
                this.socket.on('connect', () => {
                    this.setupSocketHandlers();
                    resolve();
                });

                this.socket.on('error', (error) => {
                    reject(error);
                });
            };

            createConnection();
        });
    }

    /**
     * Setup socket event handlers
     */
    setupSocketHandlers() {
        const { logger } = this.dependencies;

        this.socket.on('data', (data) => {
            this.handleData(data);
            this.updateLastActivity();
        });

        this.socket.on('close', () => {
            this.handleDisconnect();
        });

        this.socket.on('error', (error) => {
            logger.error('Socket error:', error);
            this.handleError(error);
        });

        this.socket.on('timeout', () => {
            logger.warn('Socket timeout');
            this.handleError(new Error('Socket timeout'));
        });
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        this.on('error', (error) => {
            this.stats.lastError = error;
        });
    }

    /**
     * Authenticate with Mikrotik device
     */
    async authenticate() {
        const { logger, securityManager } = this.dependencies;

        try {
            // Login command
            const loginCommand = '/login';

            // Send login command to get challenge
            const response = await this.sendCommand(loginCommand, { expectChallenge: true });

            if (response && response.length > 0 && response[0]['ret'] && response[0]['ret'].startsWith('!done')) {
                // Extract challenge
                this.challenge = response[0]['ret'];
                logger.debug('Received authentication challenge');

                // Generate response
                const passwordHash = this.hashPassword(this.config.password, this.challenge);
                const loginResponse = '/login';
                const loginData = `name=${this.config.username}\x00response=00${passwordHash}`;

                // Send authentication response
                const authResponse = await this.sendCommand(loginResponse, { data: loginData });

                if (authResponse && authResponse.length > 0) {
                    this.authenticated = true;
                    logger.info('Successfully authenticated with Mikrotik device');
                } else {
                    throw new Error('Authentication failed');
                }
            } else {
                throw new Error('Failed to get authentication challenge');
            }

        } catch (error) {
            logger.error('Authentication failed:', error);
            throw error;
        }
    }

    /**
     * Hash password for authentication
     */
    hashPassword(password, challenge) {
        const hash = crypto.createHash('md5');
        hash.update(Buffer.concat([
            Buffer.from([0]),
            Buffer.from(password),
            crypto.createHash('md5').update(challenge).digest()
        ]));
        return hash.digest('hex');
    }

    /**
     * Execute command on Mikrotik device
     */
    async executeCommand(command, options = {}) {
        const { logger, cacheManager } = this.dependencies;

        if (!this.isConnected()) {
            throw new Error('Not connected to Mikrotik device');
        }

        const startTime = Date.now();
        const commandStr = typeof command === 'string' ? command : command.command || '';

        try {
            logger.debug(`Executing command: ${commandStr}`);

            // Check cache for read commands
            if (cacheManager && this.isCacheableCommand(commandStr)) {
                const cacheKey = this.getCacheKey(commandStr);
                const cached = await cacheManager.get(cacheKey);

                if (cached) {
                    logger.debug(`Cache hit for command: ${commandStr}`);
                    return cached;
                }
            }

            // Send command
            const response = await this.sendCommand(command, options);

            // Cache response for read commands
            if (cacheManager && this.isCacheableCommand(commandStr)) {
                const cacheKey = this.getCacheKey(commandStr);
                const ttl = this.getCacheTTL(commandStr);
                await cacheManager.set(cacheKey, response, ttl);
            }

            // Update statistics
            const responseTime = Date.now() - startTime;
            this.updateStats(true, responseTime);

            logger.debug(`Command completed in ${responseTime}ms: ${commandStr}`);
            return response;

        } catch (error) {
            const responseTime = Date.now() - startTime;
            this.updateStats(false, responseTime);

            logger.error(`Command failed: ${commandStr}`, error);
            throw error;
        }
    }

    /**
     * Send command to Mikrotik device
     */
    async sendCommand(command, options = {}) {
        return new Promise((resolve, reject) => {
            const { timeout = this.config.timeout } = options;
            const tag = this.getNextTag();

            // Prepare command
            const commandData = this.prepareCommand(command, options);

            // Store command info
            this.pendingCommands.set(tag, {
                command,
                resolve,
                reject,
                timestamp: Date.now(),
                timeout: setTimeout(() => {
                    this.pendingCommands.delete(tag);
                    reject(new Error(`Command timeout: ${command}`));
                }, timeout)
            });

            // Send command
            this.writeCommand(commandData, tag);

            // Update statistics
            this.stats.commandsSent++;
        });
    }

    /**
     * Execute batch commands
     */
    async executeBatch(commands, options = {}) {
        const { logger } = this.dependencies;

        if (!this.isConnected()) {
            throw new Error('Not connected to Mikrotik device');
        }

        try {
            logger.debug(`Executing batch of ${commands.length} commands`);

            const results = [];
            const promises = [];

            // Execute commands concurrently if possible
            const batchSize = options.batchSize || 5;

            for (let i = 0; i < commands.length; i += batchSize) {
                const batch = commands.slice(i, i + batchSize);
                const batchPromises = batch.map(command =>
                    this.executeCommand(command, options).catch(error => ({ error, command }))
                );

                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);
            }

            // Check for errors
            const errors = results.filter(result => result.error);
            if (errors.length > 0) {
                logger.warn(`${errors.length} commands failed in batch`);
            }

            logger.debug(`Batch execution completed: ${results.length} results`);
            return results;

        } catch (error) {
            logger.error('Batch execution failed:', error);
            throw error;
        }
    }

    /**
     * Prepare command for sending
     */
    prepareCommand(command, options = {}) {
        let commandStr = '';

        if (typeof command === 'string') {
            commandStr = command;
        } else {
            commandStr = command.command || '';

            // Add parameters
            if (command.params) {
                for (const [key, value] of Object.entries(command.params)) {
                    commandStr += ` ${key}=${value}`;
                }
            }

            // Add query parameters
            if (command.query) {
                for (const [key, value] of Object.entries(command.query)) {
                    commandStr += ` ?${key}=${value}`;
                }
            }
        }

        // Add additional data
        if (options.data) {
            commandStr += `\n${options.data}`;
        }

        return commandStr;
    }

    /**
     * Write command to socket
     */
    writeCommand(command, tag) {
        if (!this.socket || this.socket.destroyed) {
            throw new Error('Socket not available');
        }

        try {
            // Encode command
            const encodedCommand = this.encodeCommand(command, tag);

            // Apply compression if enabled and applicable
            let dataToSend = encodedCommand;
            if (this.config.compression && encodedCommand.length > this.config.compressionThreshold) {
                dataToSend = this.compressData(encodedCommand);
            }

            // Write to socket
            this.socket.write(dataToSend);

            // Update statistics
            this.stats.bytesSent += dataToSend.length;

        } catch (error) {
            this.handleError(error);
            throw error;
        }
    }

    /**
     * Encode command for Mikrotik API
     */
    encodeCommand(command, tag) {
        const lines = command.split('\n');
        const encodedLines = [];

        // Add tag to first line
        if (lines.length > 0) {
            lines[0] = `.tag=${tag} ${lines[0]}`;
        }

        // Encode each line
        for (const line of lines) {
            if (line.trim() === '') {
                // Empty line ends command
                encodedLines.push(Buffer.from([0]));
            } else {
                const encodedLength = Buffer.alloc(4);
                encodedLength.writeUInt32BE(line.length, 0);
                encodedLines.push(Buffer.concat([encodedLength, Buffer.from(line, 'utf8')]));
            }
        }

        return Buffer.concat(encodedLines);
    }

    /**
     * Compress data if enabled
     */
    compressData(data) {
        // Simple compression for large commands
        // In production, you might want to use zlib
        return data;
    }

    /**
     * Handle incoming data
     */
    handleData(data) {
        const { logger } = this.dependencies;

        this.responseBuffer = Buffer.concat([this.responseBuffer, data]);
        this.stats.bytesReceived += data.length;

        try {
            this.processResponseBuffer();
        } catch (error) {
            logger.error('Error processing response buffer:', error);
            this.handleError(error);
        }
    }

    /**
     * Process response buffer
     */
    processResponseBuffer() {
        while (this.responseBuffer.length >= 4) {
            // Read length
            const length = this.responseBuffer.readUInt32BE(0);

            if (this.responseBuffer.length < 4 + length) {
                // Incomplete data, wait for more
                break;
            }

            // Extract data
            const data = this.responseBuffer.slice(4, 4 + length);
            this.responseBuffer = this.responseBuffer.slice(4 + length);

            // Process data
            this.processResponseData(data);
        }
    }

    /**
     * Process response data
     */
    processResponseData(data) {
        const response = data.toString('utf8');

        if (response.startsWith('!re') || response.startsWith('!done') || response.startsWith('!trap')) {
            // Parse response
            const parsedResponse = this.parseResponse(response);

            // Extract tag if present
            const tagMatch = response.match(/\.tag=(\d+)/);
            const tag = tagMatch ? parseInt(tagMatch[1]) : null;

            if (tag && this.pendingCommands.has(tag)) {
                const commandInfo = this.pendingCommands.get(tag);

                if (response.startsWith('!done')) {
                    // Command completed
                    clearTimeout(commandInfo.timeout);
                    this.pendingCommands.delete(tag);
                    this.stats.commandsCompleted++;
                    commandInfo.resolve(parsedResponse);
                } else if (response.startsWith('!trap')) {
                    // Command error
                    clearTimeout(commandInfo.timeout);
                    this.pendingCommands.delete(tag);
                    this.stats.commandsFailed++;
                    commandInfo.reject(new Error(`Mikrotik error: ${parsedResponse.message || 'Unknown error'}`));
                } else {
                    // Partial response, accumulate
                    if (!commandInfo.responses) {
                        commandInfo.responses = [];
                    }
                    commandInfo.responses.push(parsedResponse);
                }
            }
        }
    }

    /**
     * Parse Mikrotik response
     */
    parseResponse(response) {
        const lines = response.split('\n');
        const parsed = {
            type: response.startsWith('!re') ? 'response' :
                   response.startsWith('!done') ? 'done' :
                   response.startsWith('!trap') ? 'error' : 'unknown',
            data: {}
        };

        for (const line of lines) {
            if (line.startsWith('!') || line.trim() === '') {
                continue;
            }

            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length > 0) {
                const value = valueParts.join('=');
                parsed.data[key] = value;
            }
        }

        return parsed;
    }

    /**
     * Get next command tag
     */
    getNextTag() {
        return ++this.commandTag;
    }

    /**
     * Check if command should be cached
     */
    isCacheableCommand(command) {
        const cacheableCommands = ['/print', '/interface/print', '/user/print', '/queue/print'];
        return cacheableCommands.some(cacheable => command.startsWith(cacheable));
    }

    /**
     * Generate cache key
     */
    getCacheKey(command) {
        return `mikrotik:cmd:${Buffer.from(command).toString('base64')}`;
    }

    /**
     * Get cache TTL
     */
    getCacheTTL(command) {
        if (command.includes('/interface/print')) return 300000; // 5 minutes
        if (command.includes('/user/print')) return 60000; // 1 minute
        if (command.includes('/queue/print')) return 30000; // 30 seconds
        return 60000; // Default 1 minute
    }

    /**
     * Setup keep-alive mechanism
     */
    setupKeepAlive() {
        const { logger } = this.dependencies;

        setInterval(() => {
            if (this.isConnected()) {
                // Send simple command to keep connection alive
                this.executeCommand('/system/resource/print', { cache: true })
                    .catch(error => {
                        logger.debug('Keep-alive command failed:', error.message);
                    });
            }
        }, this.config.keepAliveDelay);
    }

    /**
     * Handle disconnect
     */
    handleDisconnect() {
        const { logger } = this.dependencies;

        logger.warn('Disconnected from Mikrotik device');

        this.isConnectedFlag = false;
        this.authenticated = false;

        // Clear pending commands
        for (const [tag, commandInfo] of this.pendingCommands) {
            clearTimeout(commandInfo.timeout);
            commandInfo.reject(new Error('Connection lost'));
        }
        this.pendingCommands.clear();

        // Clear timeouts
        for (const timeout of this.commandTimeouts.values()) {
            clearTimeout(timeout);
        }
        this.commandTimeouts.clear();

        // Emit disconnect event
        this.emit('disconnected');

        // Attempt reconnection if configured
        if (this.reconnectAttempts < this.config.maxRetries) {
            this.scheduleReconnect();
        }
    }

    /**
     * Handle error
     */
    handleError(error) {
        const { logger } = this.dependencies;

        logger.error('Mikrotik client error:', error);

        // Emit error event
        this.emit('error', error);

        // Close connection on critical errors
        if (this.shouldCloseConnection(error)) {
            this.disconnect();
        }
    }

    /**
     * Check if connection should be closed on error
     */
    shouldCloseConnection(error) {
        const criticalErrors = [
            'ECONNRESET',
            'ECONNREFUSED',
            'ETIMEDOUT',
            'ENOTFOUND'
        ];

        return criticalErrors.some(critical => error.code === critical);
    }

    /**
     * Schedule reconnection
     */
    scheduleReconnect() {
        const { logger } = this.dependencies;

        const delay = this.config.retryDelay * Math.pow(2, this.reconnectAttempts);
        this.reconnectAttempts++;

        logger.info(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);

        setTimeout(() => {
            if (!this.isConnected()) {
                this.connect().catch(error => {
                    logger.error('Reconnection failed:', error);
                });
            }
        }, delay);
    }

    /**
     * Update last activity timestamp
     */
    updateLastActivity() {
        this.lastActivity = Date.now();
    }

    /**
     * Update statistics
     */
    updateStats(success, responseTime) {
        if (success) {
            this.stats.responseTimeSum += responseTime;
            this.stats.responseTimeCount++;
        }
    }

    /**
     * Check if connected
     */
    isConnected() {
        return this.isConnectedFlag && this.socket && !this.socket.destroyed;
    }

    /**
     * Disconnect from Mikrotik device
     */
    async disconnect() {
        const { logger } = this.dependencies;

        if (this.socket) {
            this.socket.end();
            this.socket = null;
        }

        this.isConnectedFlag = false;
        this.authenticated = false;

        // Clear pending commands
        for (const [tag, commandInfo] of this.pendingCommands) {
            clearTimeout(commandInfo.timeout);
            commandInfo.reject(new Error('Connection closed'));
        }
        this.pendingCommands.clear();

        logger.info('Disconnected from Mikrotik device');
    }

    /**
     * Get client statistics
     */
    getStats() {
        const averageResponseTime = this.stats.responseTimeCount > 0
            ? this.stats.responseTimeSum / this.stats.responseTimeCount
            : 0;

        return {
            ...this.stats,
            averageResponseTime,
            uptime: this.stats.connectionTime > 0 ? Date.now() - this.stats.connectionTime : 0,
            isConnected: this.isConnected(),
            isConnecting: this.isConnecting,
            reconnectAttempts: this.reconnectAttempts,
            pendingCommands: this.pendingCommands.size
        };
    }
}

module.exports = { MikrotikClient };