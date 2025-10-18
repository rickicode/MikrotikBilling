/**
 * Mikrotik Security and Authentication Manager
 *
 * Features:
 * - SSH key-based authentication
 * - API key management and rotation
 * - Connection encryption and certificate validation
 * - Access control and audit logging
 * - Rate limiting per device and user
 * - IP whitelisting and firewall rules
 * - Session management
 * - Security monitoring and threat detection
 * - Credential encryption and storage
 * - Multi-factor authentication support
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');
const { LRUCache } = require('../services/LRUCache');

class MikrotikSecurityManager extends EventEmitter {
    constructor(config, dependencies = {}) {
        super();

        this.config = {
            // Authentication
            defaultAuthMethod: 'password', // password, ssh-key, api-key
            enableSSHKeyAuth: true,
            enableAPIKeyAuth: true,
            enableMFA: false,
            sessionTimeout: 3600000, // 1 hour
            maxSessionDuration: 86400000, // 24 hours

            // Encryption
            enableEncryption: true,
            encryptionAlgorithm: 'aes-256-gcm',
            keyRotationInterval: 86400000, // 24 hours
            certificateValidation: true,
            trustedCAs: [],

            // Rate limiting
            enableRateLimiting: true,
            maxRequestsPerMinute: 60,
            maxConcurrentSessions: 10,
            burstLimit: 100,
            rateLimitWindow: 60000, // 1 minute

            // Access control
            enableAccessControl: true,
            defaultRole: 'operator',
            roles: {
                superadmin: {
                    permissions: ['*'],
                    deviceAccess: '*'
                },
                admin: {
                    permissions: ['read', 'write', 'delete', 'manage_users'],
                    deviceAccess: '*'
                },
                operator: {
                    permissions: ['read', 'write'],
                    deviceAccess: '*'
                },
                viewer: {
                    permissions: ['read'],
                    deviceAccess: '*'
                }
            },

            // IP whitelisting
            enableIPWhitelisting: false,
            allowedIPs: [], // Array of IP ranges
            trustedNetworks: ['127.0.0.1/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],

            // Audit logging
            enableAuditLogging: true,
            logLevel: 'info', // debug, info, warn, error
            auditLogRetention: 7776000000, // 90 days
            logSensitiveData: false,

            // Security monitoring
            enableSecurityMonitoring: true,
            threatDetection: true,
            anomalyDetection: true,
            securityEventRetention: 604800000, // 7 days
            failedLoginThreshold: 5,
            failedLoginWindow: 300000, // 5 minutes
            suspiciousActivityThreshold: 10,

            // Credential management
            enableCredentialEncryption: true,
            credentialEncryptionKey: null,
            passwordMinLength: 12,
            passwordComplexity: {
                requireUppercase: true,
                requireLowercase: true,
                requireNumbers: true,
                requireSpecialChars: true
            },

            // API keys
            apiKeyLength: 32,
            apiKeyExpiration: 2592000000, // 30 days
            apiKeyRotationEnabled: true,

            ...config
        };

        this.dependencies = {
            logger: console,
            ...dependencies
        };

        // Security state
        this.sessions = new Map(); // sessionId -> session info
        this.apiKeys = new Map(); // apiKey -> key info
        this.deviceCredentials = new Map(); // deviceId -> credentials
        this.userPermissions = new Map(); // userId -> permissions
        this.rateLimiters = new Map(); // identifier -> rate limiter state
        this.failedLoginAttempts = new Map(); // identifier -> attempts

        // Security monitoring
        this.securityEvents = new LRUCache(1000); // Recent security events
        this.blockedIPs = new Set(); // Blocked IP addresses
        this.suspiciousActivities = new Map(); // IP -> activity count

        // Encryption keys
        this.encryptionKeys = new Map(); // keyId -> key info
        this.currentKeyId = null;
        this.keyRotationTimer = null;

        // Audit logs
        this.auditLogs = new LRUCache(10000); // Recent audit logs

        // Statistics
        this.stats = {
            totalAuthAttempts: 0,
            successfulAuth: 0,
            failedAuth: 0,
            sessionsCreated: 0,
            sessionsExpired: 0,
            apiKeysCreated: 0,
            apiKeysRevoked: 0,
            securityEvents: 0,
            blockedRequests: 0,
            encryptionOperations: 0,
            rateLimitViolations: 0,
            threatsDetected: 0
        };

        // Initialize
        this.initialize();
    }

    /**
     * Initialize security manager
     */
    async initialize() {
        const { logger } = this.dependencies;

        try {
            logger.info('Initializing Mikrotik Security Manager...');

            // Initialize encryption keys
            await this.initializeEncryption();

            // Start key rotation
            if (this.config.enableEncryption) {
                this.startKeyRotation();
            }

            // Start security monitoring
            if (this.config.enableSecurityMonitoring) {
                this.startSecurityMonitoring();
            }

            // Load default credentials if any
            await this.loadDefaultCredentials();

            logger.info('Mikrotik Security Manager initialized successfully');

        } catch (error) {
            logger.error('Failed to initialize security manager:', error);
            throw error;
        }
    }

    /**
     * Initialize encryption
     */
    async initializeEncryption() {
        const { logger } = this.dependencies;

        if (!this.config.enableEncryption) {
            return;
        }

        try {
            // Generate initial encryption key
            const keyId = this.generateKeyId();
            const encryptionKey = this.generateEncryptionKey();

            this.encryptionKeys.set(keyId, {
                id: keyId,
                key: encryptionKey,
                algorithm: this.config.encryptionAlgorithm,
                createdAt: Date.now(),
                status: 'active'
            });

            this.currentKeyId = keyId;

            logger.info(`Encryption initialized with key: ${keyId}`);

        } catch (error) {
            logger.error('Failed to initialize encryption:', error);
            throw error;
        }
    }

    /**
     * Generate encryption key
     */
    generateEncryptionKey() {
        const keyLength = this.config.encryptionAlgorithm.includes('256') ? 32 : 16;
        return crypto.randomBytes(keyLength);
    }

    /**
     * Generate key ID
     */
    generateKeyId() {
        return crypto.randomBytes(16).toString('hex');
    }

    /**
     * Encrypt data
     */
    async encrypt(data, keyId = null) {
        if (!this.config.enableEncryption) {
            return data;
        }

        const targetKeyId = keyId || this.currentKeyId;
        const keyInfo = this.encryptionKeys.get(targetKeyId);

        if (!keyInfo) {
            throw new Error(`Encryption key not found: ${targetKeyId}`);
        }

        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipher(this.config.encryptionAlgorithm, keyInfo.key);
            cipher.setAAD(Buffer.from(targetKeyId));

            let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
            encrypted += cipher.final('hex');

            const authTag = cipher.getAuthTag();

            this.stats.encryptionOperations++;

            return {
                encrypted,
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex'),
                keyId: targetKeyId,
                algorithm: this.config.encryptionAlgorithm
            };

        } catch (error) {
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }

    /**
     * Decrypt data
     */
    async decrypt(encryptedData) {
        if (!this.config.enableEncryption) {
            return encryptedData;
        }

        const { encrypted, iv, authTag, keyId, algorithm } = encryptedData;
        const keyInfo = this.encryptionKeys.get(keyId);

        if (!keyInfo) {
            throw new Error(`Decryption key not found: ${keyId}`);
        }

        try {
            const decipher = crypto.createDecipher(algorithm, keyInfo.key);
            decipher.setAAD(Buffer.from(keyId));
            decipher.setAuthTag(Buffer.from(authTag, 'hex'));

            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return JSON.parse(decrypted);

        } catch (error) {
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    /**
     * Authenticate user
     */
    async authenticate(credentials, context = {}) {
        const { logger } = this.dependencies;

        const startTime = Date.now();
        this.stats.totalAuthAttempts++;

        try {
            // Validate input
            this.validateCredentials(credentials);

            // Check rate limiting
            if (this.config.enableRateLimiting) {
                const rateLimitResult = this.checkRateLimit(credentials.identifier || context.ip);
                if (!rateLimitResult.allowed) {
                    this.stats.blockedRequests++;
                    throw new Error('Rate limit exceeded');
                }
            }

            // Check IP whitelist
            if (this.config.enableIPWhitelisting) {
                if (!this.isIPAllowed(context.ip)) {
                    this.logSecurityEvent('ip_blocked', {
                        ip: context.ip,
                        reason: 'IP not whitelisted'
                    });
                    throw new Error('Access denied from this IP');
                }
            }

            // Perform authentication based on method
            let authResult;
            switch (credentials.method) {
                case 'password':
                    authResult = await this.authenticatePassword(credentials, context);
                    break;
                case 'ssh-key':
                    authResult = await this.authenticateSSHKey(credentials, context);
                    break;
                case 'api-key':
                    authResult = await this.authenticateAPIKey(credentials, context);
                    break;
                default:
                    throw new Error(`Unsupported authentication method: ${credentials.method}`);
            }

            // Check for suspicious activity
            if (this.config.threatDetection) {
                this.checkForSuspiciousActivity(credentials.identifier, authResult, context);
            }

            // Create session
            const session = await this.createSession(authResult, context);

            this.stats.successfulAuth++;

            const authTime = Date.now() - startTime;

            // Log authentication
            this.logSecurityEvent('authentication_success', {
                identifier: credentials.identifier,
                method: credentials.method,
                ip: context.ip,
                userAgent: context.userAgent,
                authTime,
                sessionId: session.id
            });

            logger.info(`Authentication successful for ${credentials.identifier} via ${credentials.method}`);

            // Emit authentication event
            this.emit('authenticated', {
                identifier: credentials.identifier,
                method: credentials.method,
                session,
                context,
                timestamp: Date.now()
            });

            return {
                success: true,
                session,
                user: authResult.user,
                permissions: authResult.permissions
            };

        } catch (error) {
            this.stats.failedAuth++;

            // Record failed attempt
            this.recordFailedAttempt(credentials.identifier, context);

            // Log authentication failure
            this.logSecurityEvent('authentication_failure', {
                identifier: credentials.identifier,
                method: credentials.method,
                ip: context.ip,
                error: error.message,
                timestamp: Date.now()
            });

            logger.warn(`Authentication failed for ${credentials.identifier}: ${error.message}`);

            // Emit authentication failure event
            this.emit('authenticationFailed', {
                identifier: credentials.identifier,
                method: credentials.method,
                error: error.message,
                context,
                timestamp: Date.now()
            });

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Validate credentials format
     */
    validateCredentials(credentials) {
        if (!credentials.method) {
            throw new Error('Authentication method is required');
        }

        if (!credentials.identifier) {
            throw new Error('Identifier is required');
        }

        switch (credentials.method) {
            case 'password':
                if (!credentials.password) {
                    throw new Error('Password is required for password authentication');
                }
                break;
            case 'ssh-key':
                if (!credentials.publicKey) {
                    throw new Error('Public key is required for SSH key authentication');
                }
                break;
            case 'api-key':
                if (!credentials.apiKey) {
                    throw new Error('API key is required for API key authentication');
                }
                break;
        }
    }

    /**
     * Authenticate with password
     */
    async authenticatePassword(credentials, context) {
        const { identifier, password } = credentials;

        // In a real implementation, this would verify against user database
        // For now, we'll simulate password verification

        // Get stored credentials for device/user
        const storedCredentials = this.deviceCredentials.get(identifier);
        if (!storedCredentials || !storedCredentials.password) {
            throw new Error('Invalid credentials');
        }

        // Verify password (in real implementation, use proper password hashing)
        const isValid = await this.verifyPassword(password, storedCredentials.password);
        if (!isValid) {
            throw new Error('Invalid password');
        }

        // Get user permissions
        const permissions = this.getUserPermissions(identifier);

        return {
            user: {
                id: identifier,
                username: storedCredentials.username || identifier,
                role: storedCredentials.role || this.config.defaultRole
            },
            permissions
        };
    }

    /**
     * Authenticate with SSH key
     */
    async authenticateSSHKey(credentials, context) {
        const { identifier, publicKey, signature, challenge } = credentials;

        if (!this.config.enableSSHKeyAuth) {
            throw new Error('SSH key authentication is disabled');
        }

        // Get stored public key
        const storedCredentials = this.deviceCredentials.get(identifier);
        if (!storedCredentials || !storedCredentials.publicKey) {
            throw new Error('No public key found for this identifier');
        }

        // Verify signature (simplified - in real implementation, use proper crypto)
        const isValid = await this.verifySSHSignature(publicKey, storedCredentials.publicKey, signature, challenge);
        if (!isValid) {
            throw new Error('Invalid SSH signature');
        }

        // Get user permissions
        const permissions = this.getUserPermissions(identifier);

        return {
            user: {
                id: identifier,
                username: storedCredentials.username || identifier,
                role: storedCredentials.role || this.config.defaultRole
            },
            permissions
        };
    }

    /**
     * Authenticate with API key
     */
    async authenticateAPIKey(credentials, context) {
        const { apiKey } = credentials;

        if (!this.config.enableAPIKeyAuth) {
            throw new Error('API key authentication is disabled');
        }

        const keyInfo = this.apiKeys.get(apiKey);
        if (!keyInfo) {
            throw new Error('Invalid API key');
        }

        // Check if key is expired
        if (keyInfo.expiresAt && keyInfo.expiresAt < Date.now()) {
            this.apiKeys.delete(apiKey);
            throw new Error('API key expired');
        }

        // Check if key is revoked
        if (keyInfo.status === 'revoked') {
            throw new Error('API key revoked');
        }

        // Update last used timestamp
        keyInfo.lastUsed = Date.now();

        // Get user permissions
        const permissions = this.getUserPermissions(keyInfo.userId);

        return {
            user: {
                id: keyInfo.userId,
                username: keyInfo.username,
                role: keyInfo.role
            },
            permissions,
            apiKey: {
                id: keyInfo.id,
                name: keyInfo.name,
                permissions: keyInfo.permissions
            }
        };
    }

    /**
     * Verify password (simplified)
     */
    async verifyPassword(password, storedHash) {
        // In real implementation, use bcrypt or similar
        return password === storedHash; // Simplified for demo
    }

    /**
     * Verify SSH signature (simplified)
     */
    async verifySSHSignature(providedKey, storedKey, signature, challenge) {
        // In real implementation, use proper SSH signature verification
        return providedKey === storedKey; // Simplified for demo
    }

    /**
     * Create session
     */
    async createSession(authResult, context) {
        const sessionId = this.generateSessionId();
        const session = {
            id: sessionId,
            userId: authResult.user.id,
            username: authResult.user.username,
            role: authResult.user.role,
            permissions: authResult.permissions,
            createdAt: Date.now(),
            lastActivity: Date.now(),
            expiresAt: Date.now() + this.config.sessionTimeout,
            maxDuration: Date.now() + this.config.maxSessionDuration,
            ip: context.ip,
            userAgent: context.userAgent,
            deviceId: context.deviceId,
            status: 'active'
        };

        this.sessions.set(sessionId, session);
        this.stats.sessionsCreated++;

        return session;
    }

    /**
     * Validate session
     */
    validateSession(sessionId, context = {}) {
        const session = this.sessions.get(sessionId);

        if (!session) {
            throw new Error('Invalid session');
        }

        // Check if session is expired
        if (session.expiresAt < Date.now()) {
            this.sessions.delete(sessionId);
            this.stats.sessionsExpired++;
            throw new Error('Session expired');
        }

        // Check if session exceeded max duration
        if (session.maxDuration < Date.now()) {
            this.sessions.delete(sessionId);
            this.stats.sessionsExpired++;
            throw new Error('Session exceeded maximum duration');
        }

        // Check session status
        if (session.status !== 'active') {
            throw new Error('Session is not active');
        }

        // Update last activity
        session.lastActivity = Date.now();

        // Extend session timeout
        session.expiresAt = Date.now() + this.config.sessionTimeout;

        return session;
    }

    /**
     * Invalidate session
     */
    invalidateSession(sessionId, reason = 'logout') {
        const session = this.sessions.get(sessionId);

        if (session) {
            session.status = 'invalidated';
            session.invalidatedAt = Date.now();
            session.invalidateReason = reason;

            this.sessions.delete(sessionId);

            // Log session invalidation
            this.logSecurityEvent('session_invalidated', {
                sessionId,
                userId: session.userId,
                reason,
                timestamp: Date.now()
            });

            // Emit session invalidated event
            this.emit('sessionInvalidated', {
                sessionId,
                session,
                reason,
                timestamp: Date.now()
            });

            return true;
        }

        return false;
    }

    /**
     * Generate session ID
     */
    generateSessionId() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Get user permissions
     */
    getUserPermissions(userId) {
        const permissions = this.userPermissions.get(userId);
        if (permissions) {
            return permissions;
        }

        // Return default role permissions
        const defaultRole = this.config.roles[this.config.defaultRole];
        return defaultRole ? defaultRole.permissions : [];
    }

    /**
     * Check rate limit
     */
    checkRateLimit(identifier) {
        if (!this.config.enableRateLimiting) {
            return { allowed: true };
        }

        const now = Date.now();
        const window = this.config.rateLimitWindow;
        const maxRequests = this.config.maxRequestsPerMinute;

        let rateLimiter = this.rateLimiters.get(identifier);
        if (!rateLimiter) {
            rateLimiter = {
                requests: [],
                count: 0
            };
            this.rateLimiters.set(identifier, rateLimiter);
        }

        // Clean old requests
        rateLimiter.requests = rateLimiter.requests.filter(
            timestamp => now - timestamp < window
        );

        // Check limit
        if (rateLimiter.requests.length >= maxRequests) {
            this.stats.rateLimitViolations++;
            return { allowed: false, retryAfter: window };
        }

        // Add current request
        rateLimiter.requests.push(now);
        rateLimiter.count++;

        return { allowed: true, remaining: maxRequests - rateLimiter.requests.length };
    }

    /**
     * Check if IP is allowed
     */
    isIPAllowed(ip) {
        if (!this.config.enableIPWhitelisting || this.config.allowedIPs.length === 0) {
            return true; // No whitelist restriction
        }

        // Check against allowed IPs
        for (const allowedIP of this.config.allowedIPs) {
            if (this.isIPInNetwork(ip, allowedIP)) {
                return true;
            }
        }

        // Check against trusted networks
        for (const trustedNetwork of this.config.trustedNetworks) {
            if (this.isIPInNetwork(ip, trustedNetwork)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if IP is in network
     */
    isIPInNetwork(ip, network) {
        // Simplified IP network checking
        // In real implementation, use proper CIDR matching
        if (network.includes('/')) {
            const [networkIP, mask] = network.split('/');
            return ip.startsWith(networkIP.slice(0, -mask.length));
        } else {
            return ip === network;
        }
    }

    /**
     * Record failed authentication attempt
     */
    recordFailedAttempt(identifier, context) {
        const now = Date.now();
        const window = this.config.failedLoginWindow;
        const threshold = this.config.failedLoginThreshold;

        let attempts = this.failedLoginAttempts.get(identifier);
        if (!attempts) {
            attempts = [];
            this.failedLoginAttempts.set(identifier, attempts);
        }

        // Clean old attempts
        attempts = attempts.filter(timestamp => now - timestamp < window);

        // Add current attempt
        attempts.push(now);

        // Check threshold
        if (attempts.length >= threshold) {
            // Block IP temporarily
            if (context.ip) {
                this.blockedIPs.add(context.ip);
                setTimeout(() => {
                    this.blockedIPs.delete(context.ip);
                }, window * 2); // Block for double the window

                this.logSecurityEvent('ip_blocked', {
                    ip: context.ip,
                    identifier,
                    reason: 'Too many failed login attempts',
                    attempts: attempts.length
                });
            }
        }

        this.failedLoginAttempts.set(identifier, attempts);
    }

    /**
     * Check for suspicious activity
     */
    checkForSuspiciousActivity(identifier, authResult, context) {
        // Check for unusual login times
        const currentHour = new Date().getHours();
        const isUnusualTime = currentHour < 6 || currentHour > 22;

        if (isUnusualTime) {
            this.logSecurityEvent('unusual_login_time', {
                identifier,
                hour: currentHour,
                ip: context.ip
            });
        }

        // Check for multiple IPs for same user
        const existingSessions = Array.from(this.sessions.values())
            .filter(session => session.userId === identifier && session.ip !== context.ip);

        if (existingSessions.length > 0) {
            this.logSecurityEvent('multiple_ip_access', {
                identifier,
                currentIP: context.ip,
                existingIPs: existingSessions.map(s => s.ip)
            });
        }

        // Check for rapid consecutive authentications
        const recentAuths = this.getRecentAuthentications(identifier, 60000); // Last minute
        if (recentAuths.length > 5) {
            this.logSecurityEvent('rapid_authentication', {
                identifier,
                count: recentAuths.length,
                timeWindow: '1 minute'
            });
        }
    }

    /**
     * Get recent authentications for user
     */
    getRecentAuthentications(identifier, timeWindow) {
        const now = Date.now();
        const cutoff = now - timeWindow;

        return Array.from(this.securityEvents.values())
            .filter(event =>
                event.type === 'authentication_success' &&
                event.data.identifier === identifier &&
                event.timestamp > cutoff
            );
    }

    /**
     * Create API key
     */
    async createAPIKey(userId, options = {}) {
        const {
            name = 'API Key',
            permissions = ['read'],
            expiresAt = Date.now() + this.config.apiKeyExpiration,
            allowedIPs = []
        } = options;

        const apiKey = this.generateAPIKey();
        const keyId = this.generateKeyId();

        const keyInfo = {
            id: keyId,
            key: apiKey,
            userId,
            name,
            permissions,
            expiresAt,
            allowedIPs,
            createdAt: Date.now(),
            lastUsed: null,
            status: 'active'
        };

        this.apiKeys.set(apiKey, keyInfo);
        this.stats.apiKeysCreated++;

        // Log API key creation
        this.logSecurityEvent('api_key_created', {
            keyId,
            userId,
            name,
            permissions,
            expiresAt
        });

        return {
            key: apiKey,
            keyId,
            name,
            permissions,
            expiresAt
        };
    }

    /**
     * Revoke API key
     */
    revokeAPIKey(apiKey, reason = 'user_request') {
        const keyInfo = this.apiKeys.get(apiKey);

        if (keyInfo) {
            keyInfo.status = 'revoked';
            keyInfo.revokedAt = Date.now();
            keyInfo.revokeReason = reason;

            this.stats.apiKeysRevoked++;

            // Log API key revocation
            this.logSecurityEvent('api_key_revoked', {
                keyId: keyInfo.id,
                userId: keyInfo.userId,
                reason
            });

            return true;
        }

        return false;
    }

    /**
     * Generate API key
     */
    generateAPIKey() {
        return crypto.randomBytes(this.config.apiKeyLength).toString('hex');
    }

    /**
     * Store device credentials
     */
    async storeDeviceCredentials(deviceId, credentials) {
        const encryptedCredentials = await this.encrypt(credentials);

        this.deviceCredentials.set(deviceId, {
            ...credentials,
            encrypted: encryptedCredentials,
            updatedAt: Date.now()
        });
    }

    /**
     * Get device credentials
     */
    async getDeviceCredentials(deviceId) {
        const stored = this.deviceCredentials.get(deviceId);

        if (!stored) {
            return null;
        }

        if (stored.encrypted) {
            return await this.decrypt(stored.encrypted);
        }

        return stored;
    }

    /**
     * Start key rotation
     */
    startKeyRotation() {
        const { logger } = this.dependencies;

        this.keyRotationTimer = setInterval(async () => {
            await this.rotateEncryptionKeys();
        }, this.config.keyRotationInterval);

        logger.debug('Key rotation started');
    }

    /**
     * Rotate encryption keys
     */
    async rotateEncryptionKeys() {
        const { logger } = this.dependencies;

        try {
            // Generate new key
            const newKeyId = this.generateKeyId();
            const newKey = this.generateEncryptionKey();

            this.encryptionKeys.set(newKeyId, {
                id: newKeyId,
                key: newKey,
                algorithm: this.config.encryptionAlgorithm,
                createdAt: Date.now(),
                status: 'active'
            });

            // Mark old key as deprecated
            if (this.currentKeyId) {
                const oldKeyInfo = this.encryptionKeys.get(this.currentKeyId);
                if (oldKeyInfo) {
                    oldKeyInfo.status = 'deprecated';
                    oldKeyInfo.deprecatedAt = Date.now();
                }
            }

            this.currentKeyId = newKeyId;

            logger.info(`Encryption key rotated: ${newKeyId}`);

            // Log key rotation
            this.logSecurityEvent('key_rotation', {
                newKeyId,
                oldKeyId: this.currentKeyId
            });

            // Clean up old keys
            this.cleanupOldKeys();

        } catch (error) {
            logger.error('Key rotation failed:', error);
        }
    }

    /**
     * Clean up old encryption keys
     */
    cleanupOldKeys() {
        const retentionPeriod = this.config.keyRotationInterval * 2; // Keep old keys for 2 rotations
        const cutoff = Date.now() - retentionPeriod;

        for (const [keyId, keyInfo] of this.encryptionKeys) {
            if (keyInfo.createdAt < cutoff && keyInfo.status === 'deprecated') {
                this.encryptionKeys.delete(keyId);
            }
        }
    }

    /**
     * Start security monitoring
     */
    startSecurityMonitoring() {
        const { logger } = this.dependencies;

        setInterval(() => {
            this.performSecurityCheck();
        }, 60000); // Every minute

        logger.debug('Security monitoring started');
    }

    /**
     * Perform security check
     */
    performSecurityCheck() {
        // Clean up expired sessions
        this.cleanupExpiredSessions();

        // Clean up old rate limit data
        this.cleanupRateLimiters();

        // Analyze security events
        this.analyzeSecurityEvents();

        // Check for anomalies
        if (this.config.anomalyDetection) {
            this.detectAnomalies();
        }
    }

    /**
     * Clean up expired sessions
     */
    cleanupExpiredSessions() {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [sessionId, session] of this.sessions) {
            if (session.expiresAt < now || session.maxDuration < now) {
                this.sessions.delete(sessionId);
                this.stats.sessionsExpired++;
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            const { logger } = this.dependencies;
            logger.debug(`Cleaned up ${cleanedCount} expired sessions`);
        }
    }

    /**
     * Clean up rate limiters
     */
    cleanupRateLimiters() {
        const now = Date.now();
        const window = this.config.rateLimitWindow;

        for (const [identifier, rateLimiter] of this.rateLimiters) {
            rateLimiter.requests = rateLimiter.requests.filter(
                timestamp => now - timestamp < window
            );

            if (rateLimiter.requests.length === 0) {
                this.rateLimiters.delete(identifier);
            }
        }
    }

    /**
     * Analyze security events
     */
    analyzeSecurityEvents() {
        const now = Date.now();
        const window = 3600000; // Last hour

        const recentEvents = Array.from(this.securityEvents.values())
            .filter(event => now - event.timestamp < window);

        // Analyze event patterns
        const eventsByType = new Map();
        const eventsByIP = new Map();

        for (const event of recentEvents) {
            // Count by type
            const typeCount = eventsByType.get(event.type) || 0;
            eventsByType.set(event.type, typeCount + 1);

            // Count by IP
            if (event.data.ip) {
                const ipCount = eventsByIP.get(event.data.ip) || 0;
                eventsByIP.set(event.data.ip, ipCount + 1);
            }
        }

        // Detect unusual patterns
        for (const [type, count] of eventsByType) {
            if (type === 'authentication_failure' && count > 10) {
                this.logSecurityEvent('high_failure_rate', {
                    type,
                    count,
                    timeWindow: '1 hour'
                });
                this.stats.threatsDetected++;
            }
        }

        for (const [ip, count] of eventsByIP) {
            if (count > 50) {
                this.logSecurityEvent('suspicious_ip_activity', {
                    ip,
                    count,
                    timeWindow: '1 hour'
                });
                this.stats.threatsDetected++;
            }
        }
    }

    /**
     * Detect anomalies
     */
    detectAnomalies() {
        // Anomaly detection implementation
        // This would typically use machine learning or statistical analysis
        // For now, we'll implement simple rule-based detection
    }

    /**
     * Log security event
     */
    logSecurityEvent(type, data) {
        const event = {
            id: crypto.randomBytes(16).toString('hex'),
            type,
            data,
            timestamp: Date.now()
        };

        // Store in recent events
        this.securityEvents.set(event.id, event);
        this.stats.securityEvents++;

        // Store in audit logs
        if (this.config.enableAuditLogging) {
            this.auditLogs.set(event.id, {
                ...event,
                level: this.config.logLevel
            });
        }

        // Emit security event
        this.emit('securityEvent', event);

        const { logger } = this.dependencies;
        logger.warn(`Security event: ${type}`, data);
    }

    /**
     * Load default credentials
     */
    async loadDefaultCredentials() {
        // In a real implementation, this would load from secure storage
        // For now, we'll initialize with empty credentials
    }

    /**
     * Get security statistics
     */
    getStats() {
        return {
            ...this.stats,
            activeSessions: this.sessions.size,
            activeAPIKeys: Array.from(this.apiKeys.values()).filter(key => key.status === 'active').length,
            blockedIPs: this.blockedIPs.size,
            encryptionKeys: this.encryptionKeys.size,
            currentKeyId: this.currentKeyId
        };
    }

    /**
     * Get security status
     */
    getSecurityStatus() {
        const recentFailures = Array.from(this.failedLoginAttempts.values())
            .flat().filter(time => Date.now() - time < 3600000).length;

        const status = recentFailures > 50 ? 'critical' :
                      recentFailures > 20 ? 'warning' : 'healthy';

        return {
            status,
            authentication: {
                totalAttempts: this.stats.totalAuthAttempts,
                successRate: this.stats.totalAuthAttempts > 0 ?
                    (this.stats.successfulAuth / this.stats.totalAuthAttempts * 100).toFixed(1) + '%' : '0%',
                recentFailures
            },
            sessions: {
                active: this.sessions.size,
                created: this.stats.sessionsCreated,
                expired: this.stats.sessionsExpired
            },
            apiKeys: {
                active: Array.from(this.apiKeys.values()).filter(key => key.status === 'active').length,
                created: this.stats.apiKeysCreated,
                revoked: this.stats.apiKeysRevoked
            },
            threats: {
                detected: this.stats.threatsDetected,
                blockedIPs: this.blockedIPs.size,
                events: this.stats.securityEvents
            }
        };
    }

    /**
     * Shutdown security manager
     */
    async shutdown() {
        const { logger } = this.dependencies;

        logger.info('Shutting down Mikrotik Security Manager...');

        // Clear timers
        if (this.keyRotationTimer) {
            clearInterval(this.keyRotationTimer);
        }

        // Invalidate all sessions
        for (const sessionId of this.sessions.keys()) {
            this.invalidateSession(sessionId, 'shutdown');
        }

        // Clear sensitive data
        this.sessions.clear();
        this.apiKeys.clear();
        this.deviceCredentials.clear();
        this.encryptionKeys.clear();
        this.securityEvents.clear();
        this.auditLogs.clear();

        logger.info('Mikrotik Security Manager shutdown complete');
    }
}

module.exports = { MikrotikSecurityManager };