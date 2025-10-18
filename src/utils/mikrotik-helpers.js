/**
 * Mikrotik Utility Functions and Helpers
 *
 * This module provides utility functions for working with Mikrotik devices,
 * including command builders, data parsers, validation helpers, and common operations.
 */

const crypto = require('crypto');
const { mikrotikConfig } = require('../config/mikrotik-config');

/**
 * Command Builder Utilities
 */
class CommandBuilder {
    /**
     * Build a Mikrotik command with parameters
     */
    static buildCommand(command, params = {}) {
        let cmd = command;

        // Add parameters
        for (const [key, value] of Object.entries(params)) {
            if (value !== null && value !== undefined) {
                if (typeof value === 'boolean') {
                    if (value) {
                        cmd += ` ${key}`;
                    }
                } else if (Array.isArray(value)) {
                    for (const item of value) {
                        cmd += ` ${key}=${item}`;
                    }
                } else {
                    cmd += ` ${key}=${value}`;
                }
            }
        }

        return cmd;
    }

    /**
     * Build a print command with filters
     */
    static buildPrintCommand(path, filters = {}) {
        let cmd = `${path}/print`;

        // Add where clauses for filtering
        const whereClauses = [];
        for (const [key, value] of Object.entries(filters)) {
            if (typeof value === 'string' && value.includes('*')) {
                whereClauses.push(`${key}~"${value}"`);
            } else {
                whereClauses.push(`${key}=${value}`);
            }
        }

        if (whereClauses.length > 0) {
            cmd += ` ?${whereClauses.join(' && ')}`;
        }

        return cmd;
    }

    /**
     * Build a command with query parameters
     */
    static buildQueryCommand(command, queryParams = {}) {
        let cmd = command;

        const queryParts = [];
        for (const [key, value] of Object.entries(queryParams)) {
            if (value !== null && value !== undefined) {
                queryParts.push(`${key}=${value}`);
            }
        }

        if (queryParts.length > 0) {
            cmd += ` ?${queryParts.join(' ')}`;
        }

        return cmd;
    }

    /**
     * Create user add command
     */
    static createUserCommand(userData) {
        const params = {
            name: userData.username,
            password: userData.password,
            group: userData.group || 'read'
        };

        if (userData.comment) {
            params.comment = userData.comment;
        }

        return this.buildCommand('/user/add', params);
    }

    /**
     * Create queue simple add command
     */
    static createQueueCommand(queueData) {
        const params = {
            name: queueData.name,
            target: queueData.target,
            'max-limit': queueData.maxLimit
        };

        if (queueData.comment) {
            params.comment = queueData.comment;
        }

        if (queueData.parent) {
            params.parent = queueData.parent;
        }

        if (queueData.priority) {
            params.priority = queueData.priority;
        }

        return this.buildCommand('/queue/simple/add', params);
    }

    /**
     * Create hotspot user add command
     */
    static createHotspotUserCommand(userData) {
        const params = {
            server: userData.server || 'hotspot1',
            name: userData.username,
            password: userData.password
        };

        if (userData.profile) {
            params.profile = userData.profile;
        }

        if (userData.comment) {
            params.comment = userData.comment;
        }

        if (userData.limitBytesIn) {
            params['limit-bytes-in'] = userData.limitBytesIn;
        }

        if (userData.limitBytesOut) {
            params['limit-bytes-out'] = userData.limitBytesOut;
        }

        return this.buildCommand('/ip/hotspot/user/add', params);
    }

    /**
     * Create PPPoE secret add command
     */
    static createPPPoESecretCommand(secretData) {
        const params = {
            name: secretData.username,
            password: secretData.password,
            service: 'pppoe'
        };

        if (secretData.profile) {
            params.profile = secretData.profile;
        }

        if (secretData.comment) {
            params.comment = secretData.comment;
        }

        if (secretData.localAddress) {
            params['local-address'] = secretData.localAddress;
        }

        if (secretData.remoteAddress) {
            params['remote-address'] = secretData.remoteAddress;
        }

        return this.buildCommand('/ppp/secret/add', params);
    }

    /**
     * Create firewall filter rule command
     */
    static createFirewallFilterCommand(ruleData) {
        const params = {
            chain: ruleData.chain || 'forward',
            action: ruleData.action || 'accept'
        };

        if (ruleData.comment) {
            params.comment = ruleData.comment;
        }

        if (ruleData.srcAddress) {
            params['src-address'] = ruleData.srcAddress;
        }

        if (ruleData.dstAddress) {
            params['dst-address'] = ruleData.dstAddress;
        }

        if (ruleData.srcPort) {
            params['src-port'] = ruleData.srcPort;
        }

        if (ruleData.dstPort) {
            params['dst-port'] = ruleData.dstPort;
        }

        if (ruleData.protocol) {
            params.protocol = ruleData.protocol;
        }

        return this.buildCommand('/ip/firewall/filter/add', params);
    }
}

/**
 * Data Parser Utilities
 */
class DataParser {
    /**
     * Parse Mikrotik API response
     */
    static parseResponse(response) {
        if (!Array.isArray(response)) {
            return [];
        }

        return response.map(item => {
            if (typeof item === 'object' && item !== null) {
                // Convert Mikrotik response format to regular object
                const parsed = {};
                for (const [key, value] of Object.entries(item)) {
                    // Remove leading dots from attribute names
                    const cleanKey = key.startsWith('.') ? key.substring(1) : key;
                    parsed[cleanKey] = value;
                }
                return parsed;
            }
            return item;
        });
    }

    /**
     * Parse system resource data
     */
    static parseSystemResource(data) {
        const parsed = this.parseResponse(data);
        if (parsed.length === 0) {
            return null;
        }

        const resource = parsed[0];
        return {
            version: resource.version,
            architecture: resource['architecture-name'],
            cpu: {
                frequency: resource['cpu-frequency'],
                count: resource['cpu-count'],
                load: parseFloat(resource['cpu-load']) || 0,
                type: resource['cpu-type']
            },
            memory: {
                total: parseInt(resource['total-memory']) || 0,
                free: parseInt(resource['free-memory']) || 0,
                used: (parseInt(resource['total-memory']) || 0) - (parseInt(resource['free-memory']) || 0)
            },
            storage: {
                total: parseInt(resource['total-hdd-space']) || 0,
                free: parseInt(resource['free-hdd-space']) || 0,
                used: (parseInt(resource['total-hdd-space']) || 0) - (parseInt(resource['free-hdd-space']) || 0)
            },
            uptime: parseInt(resource.uptime) || 0,
            uptimeText: this.formatUptime(resource.uptime),
            boardName: resource['board-name'],
            serialNumber: resource['serial-number']
        };
    }

    /**
     * Parse interface data
     */
    static parseInterfaces(data) {
        const interfaces = this.parseResponse(data);
        return interfaces.map(iface => ({
            id: iface['.id'],
            name: iface.name,
            type: iface.type,
            running: iface.running === 'true',
            disabled: iface.disabled === 'true',
            mtu: parseInt(iface.mtu) || 1500,
            macAddress: iface['mac-address'],
            actualMtu: parseInt(iface['actual-mtu']) || 1500,
            comment: iface.comment,
            traffic: {
                rxBytes: parseInt(iface['rx-byte']) || 0,
                txBytes: parseInt(iface['tx-byte']) || 0,
                rxPackets: parseInt(iface['rx-packet']) || 0,
                txPackets: parseInt(iface['tx-packet']) || 0,
                rxErrors: parseInt(iface['rx-error']) || 0,
                txErrors: parseInt(iface['tx-error']) || 0,
                rxDrops: parseInt(iface['rx-drop']) || 0,
                txDrops: parseInt(iface['tx-drop']) || 0
            }
        }));
    }

    /**
     * Parse user data
     */
    static parseUsers(data) {
        const users = this.parseResponse(data);
        return users.map(user => ({
            id: user['.id'],
            name: user.name,
            group: user.group,
            disabled: user.disabled === 'true',
            comment: user.comment,
            lastLogin: user['last-logged-in'] ? new Date(user['last-logged-in']) : null
        }));
    }

    /**
     * Parse active user sessions
     */
    static parseActiveUsers(data) {
        const users = this.parseResponse(data);
        return users.map(user => ({
            id: user['.id'],
            name: user.name || user.user,
            address: user.address || user['caller-id'],
            macAddress: user['mac-address'] || user['caller-id'],
            uptime: parseInt(user.uptime) || 0,
            uptimeText: this.formatUptime(user.uptime),
            bytesIn: parseInt(user['bytes-in']) || 0,
            bytesOut: parseInt(user['bytes-out']) || 0,
            packetsIn: parseInt(user['packets-in']) || 0,
            packetsOut: parseInt(user['packets-out']) || 0,
            loginBy: user['login-by'],
            radius: user.radius === 'true'
        }));
    }

    /**
     * Parse queue data
     */
    static parseQueues(data) {
        const queues = this.parseResponse(data);
        return queues.map(queue => ({
            id: queue['.id'],
            name: queue.name,
            target: queue.target,
            parent: queue.parent,
            packetMark: queue['packet-mark'],
            queue: queue.queue,
            priority: parseInt(queue.priority) || 8,
            limitAt: queue['limit-at'],
            maxLimit: queue['max-limit'],
            burstLimit: queue['burst-limit'],
            burstThreshold: queue['burst-threshold'],
            burstTime: queue['burst-time'],
            disabled: queue.disabled === 'true',
            comment: queue.comment,
            bytes: parseInt(queue.bytes) || 0,
            packets: parseInt(queue.packets) || 0
        }));
    }

    /**
     * Parse DHCP lease data
     */
    static parseDHCPLeases(data) {
        const leases = this.parseResponse(data);
        return leases.map(lease => ({
            id: lease['.id'],
            address: lease.address,
            macAddress: lease['mac-address'],
            addressLists: lease['address-lists'],
            clientHostname: lease['client-hostname'],
            server: lease.server,
            status: lease.status,
            expiresAfter: lease['expires-after'],
            lastSeen: lease['last-seen'],
            activeAddress: lease['active-address'],
            activeMacAddress: lease['active-mac-address'],
            activeClientHostname: lease['active-client-hostname'],
            activeServer: lease['active-server'],
            hostName: lease['host-name']
        }));
    }

    /**
     * Parse wireless registration table
     */
    static parseWirelessRegistrations(data) {
        const registrations = this.parseResponse(data);
        return registrations.map(reg => ({
            id: reg['.id'],
            interface: reg.interface,
            macAddress: reg['mac-address'],
            address: reg.address,
            uptime: parseInt(reg.uptime) || 0,
            uptimeText: this.formatUptime(reg.uptime),
            signalStrength: parseInt(reg['signal-strength']) || 0,
            signalToNoise: parseInt(reg['signal-to-noise']) || 0,
            txRate: reg['tx-rate'],
            rxRate: reg['rx-rate'],
            packets: parseInt(reg.packets) || 0,
            bytes: parseInt(reg.bytes) || 0,
            state: reg.state,
            lastIP: reg['last-ip']
        }));
    }

    /**
     * Format uptime seconds to human readable format
     */
    static formatUptime(seconds) {
        if (!seconds) return '0s';

        const totalSeconds = parseInt(seconds) || 0;
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;

        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

        return parts.join(' ');
    }

    /**
     * Parse comment data for vouchers/users
     */
    static parseComment(comment) {
        if (!comment) return null;

        // Parse voucher system comment: VOUCHER_SYSTEM|price_sell|first_login_timestamp|valid_until_timestamp
        if (comment.includes('VOUCHER_SYSTEM|')) {
            const parts = comment.split('|');
            if (parts.length >= 4) {
                return {
                    type: 'voucher',
                    priceSell: parseFloat(parts[1]) || 0,
                    firstLogin: parts[2] ? parseInt(parts[2]) : null,
                    validUntil: parts[3] ? parseInt(parts[3]) : null,
                    metadata: parts.slice(4)
                };
            }
        }

        // Parse PPPoE system comment: PPPOE_SYSTEM|customer_id|subscription_id|created_at
        if (comment.includes('PPPOE_SYSTEM|')) {
            const parts = comment.split('|');
            if (parts.length >= 4) {
                return {
                    type: 'pppoe',
                    customerId: parts[1],
                    subscriptionId: parts[2],
                    createdAt: parts[3] ? parseInt(parts[3]) : null,
                    metadata: parts.slice(4)
                };
            }
        }

        // Return raw comment if no special format
        return {
            type: 'raw',
            comment
        };
    }

    /**
     * Create comment for voucher system
     */
    static createVoucherComment(priceSell, firstLogin = null, validUntil = null, metadata = []) {
        const parts = ['VOUCHER_SYSTEM', priceSell.toString()];

        if (firstLogin) parts.push(firstLogin.toString());
        else parts.push('0');

        if (validUntil) parts.push(validUntil.toString());
        else parts.push('0');

        if (metadata.length > 0) parts.push(...metadata);

        return parts.join('|');
    }

    /**
     * Create comment for PPPoE system
     */
    static createPPPoEComment(customerId, subscriptionId, createdAt = null, metadata = []) {
        const parts = ['PPPOE_SYSTEM', customerId, subscriptionId];

        if (createdAt) parts.push(createdAt.toString());
        else parts.push(Date.now().toString());

        if (metadata.length > 0) parts.push(...metadata);

        return parts.join('|');
    }
}

/**
 * Validation Utilities
 */
class ValidationHelper {
    /**
     * Validate IP address
     */
    static isValidIP(ip) {
        const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
        return ipv4Regex.test(ip) || ipv6Regex.test(ip);
    }

    /**
     * Validate MAC address
     */
    static isValidMAC(mac) {
        const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
        return macRegex.test(mac);
    }

    /**
     * Validate Mikrotik username
     */
    static isValidUsername(username) {
        // Mikrotik usernames: 1-63 characters, alphanumeric and some special chars
        const usernameRegex = /^[a-zA-Z0-9_\-\.]{1,63}$/;
        return usernameRegex.test(username);
    }

    /**
     * Validate password strength
     */
    static validatePassword(password, requirements = {}) {
        const defaults = {
            minLength: 8,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecialChars: false
        };

        const reqs = { ...defaults, ...requirements };
        const errors = [];

        if (password.length < reqs.minLength) {
            errors.push(`Password must be at least ${reqs.minLength} characters`);
        }

        if (reqs.requireUppercase && !/[A-Z]/.test(password)) {
            errors.push('Password must contain at least one uppercase letter');
        }

        if (reqs.requireLowercase && !/[a-z]/.test(password)) {
            errors.push('Password must contain at least one lowercase letter');
        }

        if (reqs.requireNumbers && !/[0-9]/.test(password)) {
            errors.push('Password must contain at least one number');
        }

        if (reqs.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
            errors.push('Password must contain at least one special character');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate bandwidth specification
     */
    static validateBandwidth(bandwidth) {
        // Valid formats: 1000, 1M, 10M/10M, 1G/1G
        const bandwidthRegex = /^(\d+[KMGT]?)(\/(\d+[KMGT]?))?$/i;
        return bandwidthRegex.test(bandwidth);
    }

    /**
     * Validate interface name
     */
    static isValidInterfaceName(name) {
        // Mikrotik interface names: alphanumeric and some special chars, max 31 chars
        const interfaceRegex = /^[a-zA-Z0-9_\-\.]{1,31}$/;
        return interfaceRegex.test(name);
    }

    /**
     * Validate queue name
     */
    static isValidQueueName(name) {
        // Queue names: max 31 characters
        return name && name.length <= 31 && name.length > 0;
    }

    /**
     * Validate Mikrotik command
     */
    static validateCommand(command) {
        if (!command || typeof command !== 'string') {
            return { isValid: false, error: 'Command must be a non-empty string' };
        }

        // Check for dangerous commands
        const dangerousCommands = [
            '/system/reboot',
            '/system/shutdown',
            '/file/remove',
            '/system/reset-configuration'
        ];

        const normalizedCommand = command.toLowerCase().trim();
        for (const dangerous of dangerousCommands) {
            if (normalizedCommand.startsWith(dangerous.toLowerCase())) {
                return { isValid: false, error: `Dangerous command not allowed: ${dangerous}` };
            }
        }

        return { isValid: true };
    }

    /**
     * Validate configuration parameters
     */
    static validateConnectionConfig(config) {
        const errors = [];

        if (!config.host) {
            errors.push('Host is required');
        } else if (!this.isValidIP(config.host) && !this.isValidHostname(config.host)) {
            errors.push('Invalid host address');
        }

        if (config.port && (config.port < 1 || config.port > 65535)) {
            errors.push('Port must be between 1 and 65535');
        }

        if (!config.username) {
            errors.push('Username is required');
        } else if (!this.isValidUsername(config.username)) {
            errors.push('Invalid username format');
        }

        if (config.timeout && (config.timeout < 1000 || config.timeout > 300000)) {
            errors.push('Timeout must be between 1000 and 300000 milliseconds');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate hostname
     */
    static isValidHostname(hostname) {
        const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
        return hostnameRegex.test(hostname) && hostname.length <= 253;
    }
}

/**
 * Utility Functions
 */
class MikrotikUtils {
    /**
     * Generate random password
     */
    static generatePassword(length = 12, options = {}) {
        const defaults = {
            uppercase: true,
            lowercase: true,
            numbers: true,
            symbols: false
        };

        const opts = { ...defaults, ...options };
        let charset = '';

        if (opts.uppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if (opts.lowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
        if (opts.numbers) charset += '0123456789';
        if (opts.symbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

        if (charset === '') {
            throw new Error('At least one character type must be selected');
        }

        let password = '';
        for (let i = 0; i < length; i++) {
            password += charset.charAt(Math.floor(Math.random() * charset.length));
        }

        return password;
    }

    /**
     * Generate unique username
     */
    static generateUsername(prefix = 'user', length = 8) {
        const random = Math.random().toString(36).substring(2, 2 + length);
        return `${prefix}${random}`;
    }

    /**
     * Calculate bandwidth in different units
     */
    static calculateBandwidth(bps) {
        const kbps = bps / 1000;
        const mbps = kbps / 1000;
        const gbps = mbps / 1000;

        if (gbps >= 1) {
            return { value: gbps.toFixed(2), unit: 'Gbps', bps };
        } else if (mbps >= 1) {
            return { value: mbps.toFixed(2), unit: 'Mbps', bps };
        } else if (kbps >= 1) {
            return { value: kbps.toFixed(2), unit: 'Kbps', bps };
        } else {
            return { value: bps, unit: 'bps', bps };
        }
    }

    /**
     * Parse bandwidth string to bps
     */
    static parseBandwidth(bandwidth) {
        if (typeof bandwidth === 'number') {
            return bandwidth;
        }

        const match = bandwidth.match(/^(\d+(?:\.\d+)?)([KMGT]?)(?:\/(\d+(?:\.\d+)?)([KMGT]?))?$/i);
        if (!match) {
            throw new Error(`Invalid bandwidth format: ${bandwidth}`);
        }

        const [, value1, unit1, value2, unit2] = match;

        const toBps = (value, unit) => {
            const num = parseFloat(value);
            switch (unit.toUpperCase()) {
                case 'K': return num * 1000;
                case 'M': return num * 1000000;
                case 'G': return num * 1000000000;
                case 'T': return num * 1000000000000;
                default: return num;
            }
        };

        const rx = toBps(value1, unit1);
        const tx = value2 ? toBps(value2, unit2) : rx;

        return { rx, tx };
    }

    /**
     * Format bytes to human readable format
     */
    static formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    /**
     * Calculate time remaining until expiry
     */
    static getTimeRemaining(expiryTimestamp) {
        const now = Date.now();
        const remaining = expiryTimestamp - now;

        if (remaining <= 0) {
            return { expired: true, text: 'Expired' };
        }

        const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
        const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

        return {
            expired: false,
            text: parts.join(' '),
            days,
            hours,
            minutes,
            seconds,
            totalMs: remaining
        };
    }

    /**
     * Generate hash for caching or identification
     */
    static generateHash(data) {
        const crypto = require('crypto');
        const str = typeof data === 'string' ? data : JSON.stringify(data);
        return crypto.createHash('md5').update(str).digest('hex');
    }

    /**
     * Sanitize input for Mikrotik commands
     */
    static sanitizeInput(input) {
        if (typeof input !== 'string') {
            return input;
        }

        // Remove or escape dangerous characters
        return input
            .replace(/"/g, '\\"')
            .replace(/'/g, "\\'")
            .replace(/;/g, '')
            .replace(/&/g, '')
            .replace(/\|/g, '')
            .replace(/`/g, '')
            .replace(/\$/g, '')
            .replace(/</g, '')
            .replace(/>/g, '');
    }

    /**
     * Extract customer ID from comment
     */
    static extractCustomerId(comment) {
        const parsed = DataParser.parseComment(comment);
        if (parsed && (parsed.type === 'voucher' || parsed.type === 'pppoe')) {
            return parsed.customerId;
        }
        return null;
    }

    /**
     * Check if user is online
     */
    static isUserOnline(user, activeUsers) {
        return activeUsers.some(activeUser =>
            activeUser.name === user.name || activeUser.address === user.address
        );
    }

    /**
     * Get device info from connection string
     */
    static parseConnectionString(connectionString) {
        // Parse connection strings like:
        // 192.168.1.1:8728
        // admin:password@192.168.1.1:8728
        // https://192.168.1.1:8729

        const regex = /^(?:(https?):\/\/)?(?:(?:([^:@]+)(?::([^@]*))?@)?([^:\/]+))?(?::(\d+))?$/;
        const match = connectionString.match(regex);

        if (!match) {
            throw new Error(`Invalid connection string: ${connectionString}`);
        }

        const [, protocol, username, password, host, port] = match;

        return {
            protocol: protocol || (port === '8729' ? 'https' : 'http'),
            host: host || 'localhost',
            port: port ? parseInt(port) : (protocol === 'https' ? 8729 : 8728),
            username: username || 'admin',
            password: password || '',
            ssl: protocol === 'https' || port === '8729'
        };
    }

    /**
     * Create connection string from config
     */
    static createConnectionString(config) {
        const { host, port, username, password, ssl } = config;
        const protocol = ssl ? 'https' : 'http';

        if (password) {
            return `${protocol}://${username}:${password}@${host}:${port}`;
        } else {
            return `${protocol}://${username}@${host}:${port}`;
        }
    }

    /**
     * Sleep utility for delays
     */
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Retry function with exponential backoff
     */
    static async retry(fn, options = {}) {
        const {
            maxAttempts = 3,
            baseDelay = 1000,
            maxDelay = 30000,
            backoffMultiplier = 2,
            retryCondition = error => true
        } = options;

        let lastError;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;

                if (!retryCondition(error) || attempt === maxAttempts) {
                    throw error;
                }

                const delay = Math.min(
                    baseDelay * Math.pow(backoffMultiplier, attempt - 1),
                    maxDelay
                );

                await this.sleep(delay);
            }
        }

        throw lastError;
    }
}

/**
 * Error Classes
 */
class MikrotikError extends Error {
    constructor(message, code = 'MIKROTIK_ERROR', details = {}) {
        super(message);
        this.name = 'MikrotikError';
        this.code = code;
        this.details = details;
    }
}

class MikrotikConnectionError extends MikrotikError {
    constructor(message, deviceId, details = {}) {
        super(message, 'CONNECTION_ERROR', { deviceId, ...details });
        this.name = 'MikrotikConnectionError';
    }
}

class MikrotikAuthenticationError extends MikrotikError {
    constructor(message, deviceId, details = {}) {
        super(message, 'AUTHENTICATION_ERROR', { deviceId, ...details });
        this.name = 'MikrotikAuthenticationError';
    }
}

class MikrotikCommandError extends MikrotikError {
    constructor(message, command, deviceId, details = {}) {
        super(message, 'COMMAND_ERROR', { command, deviceId, ...details });
        this.name = 'MikrotikCommandError';
    }
}

class MikrotikValidationError extends MikrotikError {
    constructor(message, field, value, details = {}) {
        super(message, 'VALIDATION_ERROR', { field, value, ...details });
        this.name = 'MikrotikValidationError';
    }
}

module.exports = {
    CommandBuilder,
    DataParser,
    ValidationHelper,
    MikrotikUtils,
    MikrotikError,
    MikrotikConnectionError,
    MikrotikAuthenticationError,
    MikrotikCommandError,
    MikrotikValidationError,
    // Convenience exports
    mikrotikConfig
};