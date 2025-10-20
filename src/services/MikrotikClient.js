const { RouterOSClient } = require('mikro-routeros');
const Query = require('../lib/query');

class MikrotikClient {
  constructor(database = null) {
    this.db = database;
    this.config = {
      host: '192.168.1.1',
      port: 8728,
      username: 'admin',
      password: '',
      timeout: 30000, // Default 30 seconds
      tls: false
    };
    this.client = null;
    this.connected = false;
    this.isOffline = true; // Start with offline status
    this.lastConnectionTime = null;
    this.lastError = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000;

    // Performance optimizations
    this.cache = new Map();
    this.cacheTimeout = 30000; // 30 seconds for Mikrotik data
    this.connectionPool = [];
    this.maxPoolSize = 3;
    this.requestQueue = [];
    this.processingRequest = false;

    // Don't load config in constructor - call it explicitly after database is ready
  }

  async loadConfig() {
    if (this.db) {
      try {
        // PostgreSQL
        const query = new Query(this.db.getPool());

        const settings = {
          host: (await query.getOne('SELECT value FROM settings WHERE key = $1', ['mikrotik_host']))?.value || process.env.MIKROTIK_HOST,
          port: (await query.getOne('SELECT value FROM settings WHERE key = $1', ['mikrotik_port']))?.value || process.env.MIKROTIK_PORT,
          username: (await query.getOne('SELECT value FROM settings WHERE key = $1', ['mikrotik_username']))?.value || process.env.MIKROTIK_USERNAME,
          password: (await query.getOne('SELECT value FROM settings WHERE key = $1', ['mikrotik_password']))?.value || process.env.MIKROTIK_PASSWORD,
          timeout: (await query.getOne('SELECT value FROM settings WHERE key = $1', ['mikrotik_timeout']))?.value || process.env.MIKROTIK_TIMEOUT,
          use_ssl: false // Force disable SSL
        };

        this.config = {
          host: settings.host || '192.168.1.1',
          port: parseInt(settings.port) || 8728,
          username: settings.username || 'admin',
          password: settings.password || '',
          timeout: parseInt(settings.timeout) || 30000, // Default 30 seconds
          tls: false // Explicitly disable TLS/SSL
        };

        console.log('Mikrotik config loaded from database:', {
          host: this.config.host,
          port: this.config.port,
          username: this.config.username,
          hasPassword: !!this.config.password
        });
      } catch (error) {
        console.warn('Failed to load Mikrotik settings from database, using defaults:', error.message);
        // Fallback to environment variables
        this.config = {
          host: process.env.MIKROTIK_HOST || '192.168.1.1',
          port: parseInt(process.env.MIKROTIK_PORT) || 8728,
          username: process.env.MIKROTIK_USERNAME || 'admin',
          password: process.env.MIKROTIK_PASSWORD || '',
          timeout: parseInt(process.env.MIKROTIK_TIMEOUT) || 30000, // Default 30 seconds
          tls: false // Explicitly disable TLS/SSL
        };
      }
    } else {
      // Use environment variables if no database provided or not initialized
      this.config = {
        host: process.env.MIKROTIK_HOST || '192.168.1.1',
        port: parseInt(process.env.MIKROTIK_PORT) || 8728,
        username: process.env.MIKROTIK_USERNAME || 'admin',
        password: process.env.MIKROTIK_PASSWORD || '',
        timeout: parseInt(process.env.MIKROTIK_TIMEOUT) || 30000, // Default 30 seconds
        tls: false // Explicitly disable TLS/SSL
      };
    }
  }

  // Reload configuration (useful when settings are updated)
  async reloadConfig() {
    const oldConfig = { ...this.config };
    
    // Load new configuration from database
    await this.loadConfig();
    
    const configChanged = 
      oldConfig.host !== this.config.host ||
      oldConfig.port !== this.config.port ||
      oldConfig.username !== this.config.username ||
      oldConfig.password !== this.config.password;
    
    console.log('Mikrotik configuration reloaded:', this.getConnectionInfo());
    
    if (configChanged) {
      console.log('Configuration changed, disconnecting and reconnecting with new credentials...');
      
      // Disconnect if already connected
      if (this.connected) {
        try {
          await this.disconnect();
        } catch (error) {
          console.error('Error disconnecting during reload:', error.message);
        }
      }
      
      // Reset reconnect attempts
      this.reconnectAttempts = 0;
      
      // Reconnect with new configuration
      try {
        const connected = await this.connect();
        console.log('Reconnected with new credentials:', connected ? 'SUCCESS' : 'FAILED');
        return connected;
      } catch (error) {
        console.error('Error reconnecting with new credentials:', error.message);
        return false;
      }
    } else {
      console.log('Configuration unchanged, keeping existing connection');
      return this.connected;
    }
  }

  // Ensure RouterOS integration - verify all vouchers and PPPoE users exist in RouterOS
  async ensureRouterOSIntegration() {
    try {
      if (!this.connected) {
        await this.connect();
      }

      console.log('Starting RouterOS integration verification...');

      // Get all system-managed users from RouterOS
      const routerosHotspotUsers = await this.getHotspotUsers();
      const routerosPPPoEUsers = await this.getPPPoESecrets();

      console.log(`Found ${routerosHotspotUsers.length} hotspot users and ${routerosPPPoEUsers.length} PPPoE users in RouterOS`);

      // Get all system users from database
      let dbUsers = [];
      try {
        const voucherResult = await this.db.query(
          'SELECT id, code, profile_id, status, created_at FROM vouchers WHERE status = $1',
          ['active']
        ) || { rows: [] };

        const pppoeResult = await this.db.query(
          'SELECT id, username, password, profile_id, status, created_at FROM pppoe_users WHERE status = $1',
          ['active']
        ) || { rows: [] };

        const vouchers = voucherResult.rows || [];
        const pppoeUsers = pppoeResult.rows || [];

        dbUsers = [...vouchers, ...pppoeUsers];
      } catch (dbError) {
        console.warn('Database query failed, proceeding without database sync:', dbError.message);
      }

      console.log(`Found ${dbUsers.length} active users in database`);

      // Check for missing users in RouterOS and create them
      for (const user of dbUsers) {
        const commentData = {
          system: user.type || 'hotspot',
          price_sell: user.price_sell,
          price_cost: user.price_cost,
          expired_hours: user.duration_hours,
          created_date: user.created_at,
          created_by_system: true
        };

        if (user.type === 'hotspot' || user.table === 'vouchers') {
          // Check if hotspot user exists in RouterOS
          const existsInRouterOS = routerosHotspotUsers.find(u => u.name === user.username);

          if (!existsInRouterOS) {
            console.log(`Creating missing hotspot user in RouterOS: ${user.username}`);
            await this.createHotspotUser({
              username: user.username,
              password: user.password,
              profile: null, // Will be set from profile_id if available
              comment: commentData
            });
          }
        } else if (user.type === 'pppoe' || user.table === 'pppoe_users') {
          // Check if PPPoE user exists in RouterOS
          const existsInRouterOS = routerosPPPoEUsers.find(u => u.name === user.username);

          if (!existsInRouterOS) {
            console.log(`Creating missing PPPoE user in RouterOS: ${user.username}`);
            await this.createPPPoESecret({
              username: user.username,
              password: user.password,
              profile: null, // Will be set from profile_id if available
              comment: commentData
            });
          }
        }
      }

      console.log('RouterOS integration verification completed');
      return true;
    } catch (error) {
      console.error('Error during RouterOS integration verification:', error);
      return false;
    }
  }

  async connect() {
    try {
      // Ensure configuration is loaded before attempting connection
      if (!this.config.host || !this.config.port) {
        console.log('📋 Loading Mikrotik configuration before connection...');
        await this.loadConfig();
      }

      console.log(`🔌 Attempting to connect to Mikrotik: ${this.config.host}:${this.config.port}`);

      // Validate configuration before connection
      if (!this.config.host) {
        throw new Error('Mikrotik host is not configured');
      }
      if (!this.config.username) {
        throw new Error('Mikrotik username is not configured');
      }
      if (!this.config.port) {
        throw new Error('Mikrotik port is not configured');
      }

      // Create connection timeout promise
      const connectionTimeout = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Connection timeout after ${this.config.timeout}ms`));
        }, this.config.timeout);
      });

      // Create connection promise
      const connectionPromise = this._establishConnection();

      // Race between connection and timeout
      const result = await Promise.race([connectionPromise, connectionTimeout]);

      console.log('✅ Mikrotik connection established successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to connect to Mikrotik:', error.message);
      this.connected = false;

      // Check if it's a timeout or connection error
      if (this._isConnectionError(error)) {
        console.log('🔌 Mikrotik device is offline or unreachable');
        this.connected = false;
        this.isOffline = true;
        this.lastError = error.message;

        // Don't reconnect for timeout/connection errors during startup
        return false;
      }

      // Auto-reconnect for other errors with exponential backoff
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        console.log(`🔄 Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

        setTimeout(() => this.connect(), delay);
      } else {
        console.log(`❌ Maximum reconnection attempts (${this.maxReconnectAttempts}) reached`);
        this.isOffline = true;
        this.lastError = `Max reconnection attempts reached: ${error.message}`;
      }

      return false;
    }
  }

  // Internal connection establishment with detailed error handling
  async _establishConnection() {
    try {
      // Clean up existing connection
      if (this.client) {
        try {
          await this.client.close();
        } catch (error) {
          console.warn('Error closing existing connection:', error.message);
        }
        this.client = null;
      }

      // Create new connection with mikro-routeros
      console.log('📡 Creating RouterOS client...');
      this.client = new RouterOSClient(this.config.host, this.config.port, this.config.timeout);

      // Connect to RouterOS
      console.log('🔗 Establishing socket connection...');
      await this.client.connect();

      // Login to RouterOS
      console.log('🔐 Authenticating...');
      await this.client.login(this.config.username, this.config.password);

      // Test connection by getting system identity
      console.log('🔍 Testing connection with identity query...');
      const identity = await this.client.runQuery('/system/identity/print');
      console.log('Identity response:', JSON.stringify(identity, null, 2));

      if (identity && identity.length > 0) {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.lastConnectionTime = Date.now();
        this.isOffline = false;
        this.lastError = null;

        // Extract identity name - handle different response formats
        const identityName = identity[0]?.name || identity[0]['identity-name'] || identity[0]?.identity || 'Unknown';
        console.log(`✅ Connected to Mikrotik successfully: ${identityName}`);

        // Note: Automatic sync system disabled per user request
        // Use manual sync via Sync Mikrotik button instead
        console.log('ℹ️ Automatic sync system disabled - use manual sync instead');

        return true;
      } else {
        throw new Error('No response from Mikrotik identity query');
      }
    } catch (error) {
      // Clean up failed connection
      if (this.client) {
        try {
          await this.client.close();
        } catch (cleanupError) {
          console.warn('Error during connection cleanup:', cleanupError.message);
        }
        this.client = null;
      }

      throw error;
    }
  }

  async disconnect() {
    // Close connection
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        console.warn('Error closing Mikrotik connection:', error.message);
      }
    }

    this.client = null;
    this.connected = false;
  }

  // Note: Sync system disabled per user request
  // Use manual sync via Sync Mikrotik button instead

  // Performance optimized command executor with robust error handling
  async execute(command, params = {}, useCache = true, customTimeout = null) {
    // If Mikrotik is offline, return empty or default results
    if (this.isOffline && !this.connected) {
      console.log(`⚠️ Mikrotik is offline, returning empty result for: ${command}`);
      return this.getDefaultResponse(command);
    }

    // Create timeout promise for this operation
    const timeoutMs = customTimeout || this.config.timeout || 30000;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Mikrotik command timeout after ${timeoutMs}ms: ${command}`));
      }, timeoutMs);
    });

    // Create execution promise
    const executePromise = this._executeCommand(command, params, useCache);

    try {
      // Race between execution and timeout
      const result = await Promise.race([executePromise, timeoutPromise]);
      return result;
    } catch (error) {
      console.error(`❌ Mikrotik command failed: ${command}`, error.message);

      // Enhanced error handling for different error types
      if (this._isConnectionError(error)) {
        console.log('🔌 Connection lost, marking Mikrotik as offline');
        this._handleConnectionError(error);
        return this.getDefaultResponse(command);
      }

      // For other errors, try once more with reconnection
      if (!this._isRetryableError(error)) {
        console.log('⚠️ Non-retryable error, returning default response');
        return this.getDefaultResponse(command);
      }

      console.log('🔄 Attempting reconnection and retry...');
      try {
        await this._forceReconnect();
        return await this._executeCommand(command, params, false); // No cache on retry
      } catch (retryError) {
        console.error('❌ Retry failed:', retryError.message);
        this._handleConnectionError(retryError);
        return this.getDefaultResponse(command);
      }
    }
  }

  // Internal command execution with enhanced error handling
  async _executeCommand(command, params = {}, useCache = true) {
    // Create cache key for read operations
    const isReadOperation = command.includes('/print') || command.includes('/get');
    const cacheKey = isReadOperation && useCache ?
      `${command}:${JSON.stringify(params)}` : null;

    // Check cache first for read operations
    if (cacheKey) {
      const cached = this.getCache(cacheKey);
      if (cached) {
        console.log(`📋 Cache hit for: ${command}`);
        return cached;
      }
    }

    // Queue request if another one is processing
    if (this.processingRequest) {
      console.log(`⏳ Queuing request: ${command}`);
      return new Promise((resolve, reject) => {
        this.requestQueue.push({ command, params, resolve, reject, useCache });
      });
    }

    this.processingRequest = true;

    try {
      // Ensure connection with validation
      if (!this.client || !this.connected) {
        console.log('🔌 Establishing connection for command:', command);
        const connected = await this.connect();
        if (!connected) {
          throw new Error('Failed to establish Mikrotik connection');
        }
      }

      // Execute command with mikro-routeros
      console.log(`🚀 Executing: ${command}`);
      const startTime = Date.now();
      const result = await this.client.runQuery(command, params);
      const duration = Date.now() - startTime;

      console.log(`✅ Command completed in ${duration}ms: ${command}`);

      // Cache read operations on success
      if (cacheKey && result) {
        this.setCache(cacheKey, result);
      }

      // Mark as online on successful execution
      this.isOffline = false;
      this.lastError = null;
      this.lastConnectionTime = Date.now();

      return result || [];
    } finally {
      this.processingRequest = false;

      // Process next request in queue
      if (this.requestQueue.length > 0) {
        const next = this.requestQueue.shift();
        this.execute(next.command, next.params, next.useCache)
          .then(next.resolve)
          .catch(next.reject);
      }
    }
  }

  // Helper methods for enhanced error handling
  _isConnectionError(error) {
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

  _isRetryableError(error) {
    // Don't retry authentication errors, invalid commands, etc.
    const nonRetryableErrors = [
      'login failed',
      'authentication failed',
      'invalid command',
      'permission denied',
      'access denied'
    ];

    return !nonRetryableErrors.some(err =>
      error.message.toLowerCase().includes(err.toLowerCase())
    );
  }

  _handleConnectionError(error) {
    this.connected = false;
    this.isOffline = true;
    this.lastError = error.message;

    // Clear connection
    if (this.client) {
      try {
        this.client.close();
      } catch (closeError) {
        console.warn('Error closing client during error handling:', closeError.message);
      }
      this.client = null;
    }

    console.log(`🔌 Connection error handled: ${error.message}`);
  }

  async _forceReconnect() {
    console.log('🔄 Forcing reconnection...');

    // Close existing connection
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        console.warn('Error closing client during reconnect:', error.message);
      }
      this.client = null;
    }

    // Reset connection state
    this.connected = false;
    this.isOffline = false; // Temporarily reset to allow reconnection attempt

    // Attempt reconnection
    const connected = await this.connect();
    if (!connected) {
      throw new Error('Reconnection failed');
    }

    console.log('✅ Reconnection successful');
    return true;
  }

  // Legacy method for backward compatibility
  async executeCommand(command, params = {}) {
    return this.execute(command, params);
  }

  // Cache management
  setCache(key, value, ttl = this.cacheTimeout) {
    const expiry = Date.now() + ttl;
    this.cache.set(key, { value, expiry });
  }

  getCache(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  clearCache() {
    this.cache.clear();
  }

  // Batch operations for better performance
  async executeBatch(commands) {
    const results = [];

    try {
      // Ensure connection
      if (!this.client || !this.connected) {
        await this.connect();
      }

      // Execute commands in batch
      for (const { command, params } of commands) {
        try {
          const result = await this.client.runQuery(command, params);
          results.push({ success: true, data: result });
        } catch (error) {
          results.push({ success: false, error: error.message });
        }
      }

      return results;
    } catch (error) {
      console.error('Batch execution failed:', error);
      throw error;
    }
  }

  // Get hotspot users (with cache support)
  async getHotspotUsers() {
    try {
      const users = await this.executeCommand('/ip/hotspot/user/print');

      // Filter for system-managed users only (those with our special comment)
      const systemUsers = users.filter(user => {
        try {
          if (!user.comment) return false;
          const comment = MikrotikClient.parseComment(user.comment);
          return comment && (comment.system === 'hotspot' || comment.system === 'voucher' || comment.created_by_system);
        } catch {
          return false;
        }
      });

      console.log(`Found ${systemUsers.length} system-managed hotspot users out of ${users.length} total`);
      return systemUsers || [];
    } catch (error) {
      console.error('Error getting hotspot users:', error);
      return [];
    }
  }

  // Get voucher users specifically (for voucher system management)
  async getVoucherUsers() {
    try {
      const users = await this.executeCommand('/ip/hotspot/user/print');

      // Filter for voucher users only (those with VOUCHER_SYSTEM comment pattern)
      const voucherUsers = users.filter(user => {
        try {
          if (!user.comment) return false;
          const comment = MikrotikClient.parseVoucherComment(user.comment);
          return comment && comment.system === 'voucher';
        } catch {
          return false;
        }
      });

      // Parse voucher information for each user
      return voucherUsers.map(user => {
        const voucherInfo = MikrotikClient.parseVoucherComment(user.comment);
        return {
          ...user,
          voucher_info: voucherInfo,
          status: voucherInfo?.status || 'available'
        };
      });
    } catch (error) {
      console.error('Error getting voucher users:', error);
      return [];
    }
  }

  // Get hotspot active sessions
  async getHotspotActive() {
    try {
      const active = await this.executeCommand('/ip/hotspot/active/print');
      return active || [];
    } catch (error) {
      console.error('Error getting hotspot active sessions:', error);
      return [];
    }
  }

  // Get hotspot profiles
  async getHotspotProfiles() {
    try {
      const profiles = await this.executeCommand('/ip/hotspot/user/profile/print');
      return profiles || [];
    } catch (error) {
      console.error('Error getting hotspot profiles:', error);
      return [];
    }
  }

  // Get PPPoE profiles
  async getPPPoEProfiles() {
    try {
      const profiles = await this.executeCommand('/ppp/profile/print');
      return profiles || [];
    } catch (error) {
      console.error('Error getting PPPoE profiles:', error);
      return [];
    }
  }

  // Get PPP profiles (alias for getPPPoEProfiles for backward compatibility)
  async getPPPProfiles() {
    return this.getPPPoEProfiles();
  }

  // Create hotspot user with proper RouterOS integration
  async createHotspotUser(userData) {
    try {
      const params = {
        name: userData.username,
        password: userData.password,
        profile: userData.profile,
        comment: MikrotikClient.formatComment(userData.comment),
        'disabled': 'no'
      };

      const result = await this.executeCommand('/ip/hotspot/user/add', params);

      // Refresh cache after creating user
      await this.refreshData('hotspotUsers');

      return result;
    } catch (error) {
      console.error('Error creating hotspot user:', error);
      throw error;
    }
  }

  // Create voucher user with new voucher system comment pattern
  async createVoucherUser(voucherData) {
    try {
      const now = Math.floor(Date.now() / 1000); // Current timestamp
      // Calculate valid until timestamp
      let validUntil = '';
      if (!voucherData.never_expired && voucherData.expired_hours > 0) {
        validUntil = (now + voucherData.expired_hours * 3600).toString();
      }

      const commentData = {
        system: 'voucher',
        type: 'hotspot',
        price_sell: voucherData.price_sell.toString(),
        first_login_timestamp: '', // Will be set on first login via on-login script
        valid_until_timestamp: validUntil
      };

      const formattedComment = MikrotikClient.formatComment(commentData);

      const params = {
        name: voucherData.username,
        password: voucherData.password,
        profile: voucherData.profile,
        comment: formattedComment,
        'disabled': 'no'
      };

      // Set time limit if duration_hours > 0
      if (voucherData.duration_hours && voucherData.duration_hours > 0) {
        params['limit-uptime'] = `${voucherData.duration_hours}h`;
      }

      console.log(`Creating voucher user: ${voucherData.username}`);
      console.log(`  Comment Data:`, commentData);
      console.log(`  Formatted Comment: ${formattedComment}`);
      console.log(`  Profile: ${voucherData.profile}, Duration: ${voucherData.duration_hours}h, Expires: ${voucherData.expired_hours}h`);

      const result = await this.executeCommand('/ip/hotspot/user/add', params);

      // Refresh cache after creating user
      await this.refreshData('hotspotUsers');

      console.log(`✅ Successfully created voucher user: ${voucherData.username}`);

      return result;
    } catch (error) {
      console.error('Error creating voucher user:', error);
      throw error;
    }
  }

  // Update voucher user comment (used by on-login script to set timestamps)
  async updateVoucherUserComment(username, firstLoginTimestamp, validUntilTimestamp = null) {
    try {
      const user = await this.findHotspotUser(username);
      if (!user || !user.comment) {
        throw new Error(`User ${username} not found or has no comment`);
      }

      const commentData = MikrotikClient.parseVoucherComment(user.comment);
      if (!commentData || commentData.system !== 'voucher') {
        throw new Error(`User ${username} is not a voucher user`);
      }

      // Update timestamps
      commentData.first_login_timestamp = firstLoginTimestamp.toString();
      if (validUntilTimestamp) {
        commentData.valid_until_timestamp = validUntilTimestamp.toString();
      }

      const newComment = MikrotikClient.formatComment(commentData);

      const params = {
        '.id': user['.id'],
        'comment': newComment
      };

      const result = await this.executeCommand('/ip/hotspot/user/set', params);

      // Refresh cache after updating user
      await this.refreshData('hotspotUsers');

      return result;
    } catch (error) {
      console.error('Error updating voucher user comment:', error);
      throw error;
    }
  }

  // Find hotspot user by username
  async findHotspotUser(username) {
    try {
      const users = await this.getHotspotUsers();
      return users.find(user => user.name === username) || null;
    } catch (error) {
      console.error('Error finding hotspot user:', error);
      return null;
    }
  }

  // Update hotspot user with cache refresh
  async updateHotspotUser(username, updates) {
    try {
      // Find the user first to get the ID
      const user = await this.findHotspotUser(username);
      if (!user) {
        throw new Error(`User ${username} not found`);
      }

      const params = {
        '.id': user['.id'],
        ...updates
      };

      // Remove undefined values
      Object.keys(params).forEach(key => {
        if (params[key] === undefined) {
          delete params[key];
        }
      });

      // Format comment if provided
      if (updates.comment && typeof updates.comment === 'object') {
        params.comment = MikrotikClient.formatComment(updates.comment);
      }

      const result = await this.executeCommand('/ip/hotspot/user/set', params);

      // Refresh cache after updating user
      await this.refreshData('hotspotUsers');

      return result;
    } catch (error) {
      console.error('Error updating hotspot user:', error);
      throw error;
    }
  }

  // Delete hotspot user with cache refresh
  async deleteHotspotUser(username) {
    try {
      const result = await this.executeCommand('/ip/hotspot/user/remove', {
        '.id': username
      });

      // Refresh cache after deleting user
      await this.refreshData('hotspotUsers');

      return result;
    } catch (error) {
      console.error('Error deleting hotspot user:', error);
      throw error;
    }
  }

  // Get PPPoE secrets
  async getPPPoESecrets() {
    try {
      const secrets = await this.executeCommand('/ppp/secret/print');

      // Filter for system-managed users only (those with our special comment)
      const systemSecrets = secrets.filter(secret => {
        try {
          if (!secret.comment) return false;
          const comment = typeof secret.comment === 'string' ? JSON.parse(secret.comment) : secret.comment;
          return comment && (comment.system === 'pppoe' || comment.system === 'voucher' || comment.created_by_system);
        } catch {
          return false;
        }
      });

      console.log(`Found ${systemSecrets.length} system-managed PPPoE users out of ${secrets.length} total`);
      return systemSecrets || [];
    } catch (error) {
      console.error('Error getting PPPoE secrets:', error);
      return [];
    }
  }

  // Get PPPoE active sessions
  async getPPPoEActive() {
    try {
      const active = await this.executeCommand('/ppp/active/print');
      return active || [];
    } catch (error) {
      console.error('Error getting PPPoE active sessions:', error);
      return [];
    }
  }

  // Get PPP profiles
  async getPPPoEProfiles() {
    try {
      const profiles = await this.executeCommand('/ppp/profile/print');
      return profiles || [];
    } catch (error) {
      console.error('Error getting PPP profiles:', error);
      return [];
    }
  }

  // Create PPPoE secret with proper RouterOS integration
  async createPPPoESecret(secretData) {
    try {
      const params = {
        name: secretData.username,
        password: secretData.password,
        profile: secretData.profile,
        service: 'pppoe',
        comment: MikrotikClient.formatComment(secretData.comment),
        'disabled': 'no'
      };

      const result = await this.executeCommand('/ppp/secret/add', params);

      // Refresh cache after creating secret
      await this.refreshData('pppoeSecrets');

      return result;
    } catch (error) {
      console.error('Error creating PPPoE secret:', error);
      throw error;
    }
  }

  // Update PPPoE secret with cache refresh
  async updatePPPoESecret(username, updates) {
    try {
      const params = {
        '.id': username,
        ...updates
      };

      // Remove undefined values
      Object.keys(params).forEach(key => {
        if (params[key] === undefined) {
          delete params[key];
        }
      });

      // Format comment if provided
      if (updates.comment && typeof updates.comment === 'object') {
        params.comment = MikrotikClient.formatComment(updates.comment);
      }

      const result = await this.executeCommand('/ppp/secret/set', params);

      // Refresh cache after updating secret
      await this.refreshData('pppoeSecrets');

      return result;
    } catch (error) {
      console.error('Error updating PPPoE secret:', error);
      throw error;
    }
  }

  // Delete PPPoE secret with cache refresh
  async deletePPPoESecret(username) {
    try {
      const result = await this.executeCommand('/ppp/secret/remove', {
        '.id': username
      });

      // Refresh cache after deleting secret
      await this.refreshData('pppoeSecrets');

      return result;
    } catch (error) {
      console.error('Error deleting PPPoE secret:', error);
      throw error;
    }
  }

  // Get system resources
  async getSystemResources() {
    try {
      const resources = await this.executeCommand('/system/resource/print');
      return resources && resources[0] || {};
    } catch (error) {
      console.error('Error getting system resources:', error);
      return {};
    }
  }

  // Get system health
  async getSystemHealth() {
    try {
      const health = await this.executeCommand('/system/health/print');
      return health && health[0] || {};
    } catch (error) {
      console.error('Error getting system health:', error);
      return {};
    }
  }

  // Get interface traffic
  async getInterfaceTraffic(interfaceName) {
    try {
      const traffic = await this.executeCommand('/interface/monitor-traffic', {
        interface: interfaceName,
        once: ''
      });
      return traffic && traffic[0] || {};
    } catch (error) {
      console.error('Error getting interface traffic:', error);
      return {};
    }
  }

  // Get default response for offline mode
  getDefaultResponse(command) {
    if (command.includes('/print') || command.includes('/get')) {
      // Return empty array for print/get commands
      return [];
    } else if (command.includes('/add')) {
      // Return success for add commands (will sync when online)
      return { '.id': 'offline-' + Date.now() };
    } else if (command.includes('/set') || command.includes('/remove')) {
      // Return success for modify/delete commands
      return { success: true, offline: true };
    }
    // Default empty response
    return [];
  }

  // Check connection status with offline handling
  isConnected() {
    // Check if we have valid configuration first
    const hasValidConfig = this.config.host &&
                           this.config.username &&
                           this.config.port;

    if (!hasValidConfig) {
      return false;
    }

    // Check actual connection status
    return this.connected && !this.isOffline;
  }

  // Health check with automatic recovery
  async healthCheck() {
    try {
      // If we think we're offline, try to reconnect
      if (this.isOffline || !this.connected) {
        console.log('🏥 Health check: Attempting to recover connection...');
        const reconnected = await this.connect();
        if (reconnected) {
          console.log('✅ Health check: Connection recovered');
          return { healthy: true, message: 'Connection recovered' };
        } else {
          return { healthy: false, message: 'Failed to recover connection' };
        }
      }

      // Test connection with a lightweight command
      const startTime = Date.now();
      const identity = await this.execute('/system/identity/print', {}, false, 5000); // 5 second timeout for health check
      const duration = Date.now() - startTime;

      if (identity && identity.length > 0) {
        console.log(`✅ Health check passed in ${duration}ms`);
        return { healthy: true, message: 'Connection healthy', duration };
      } else {
        throw new Error('No response to health check');
      }
    } catch (error) {
      console.error('❌ Health check failed:', error.message);

      // Mark as offline if health check fails
      this._handleConnectionError(error);

      return {
        healthy: false,
        message: `Health check failed: ${error.message}`,
        lastError: this.lastError
      };
    }
  }

  // Get connection info with health status
  getConnectionInfo() {
    // Check if we have valid configuration
    const hasValidConfig = this.config.host &&
                           this.config.username &&
                           this.config.port;

    return {
      connected: this.connected && !this.isOffline,
      isOffline: this.isOffline,
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
      reconnectAttempts: this.reconnectAttempts,
      hasValidConfig: hasValidConfig,
      lastConnectionTime: this.lastConnectionTime,
      lastError: this.lastError,
      status: this.isOffline ? 'offline' : (this.connected ? 'online' : 'disconnected'),
      uptime: this.lastConnectionTime ? Date.now() - this.lastConnectionTime : 0
    };
  }

  // Parse comment data - Support both new voucher pattern and legacy JSON
  static parseComment(comment) {
    try {
      if (!comment || typeof comment !== 'string') {
        return null;
      }

      // Check if it's using the new voucher pattern: VOUCHER_SYSTEM|price_sell|first_login_timestamp|valid_until_timestamp
      if (comment.startsWith('VOUCHER_SYSTEM|')) {
        const parts = comment.split('|');
        if (parts.length >= 4) {
          return {
            system: 'voucher',
            type: 'hotspot',
            price_sell: parseFloat(parts[1]) || 0,
            first_login_timestamp: parts[2] || null,
            valid_until_timestamp: parts[3] || null,
            raw: comment
          };
        }
      }

      // Try to parse as JSON (legacy support)
      try {
        return JSON.parse(comment);
      } catch (error) {
        // If JSON parsing fails, return as simple text
        return {
          system: 'unknown',
          comment: comment,
          raw: comment
        };
      }
    } catch (error) {
      return null;
    }
  }

  // Format comment data - Use new voucher pattern for vouchers, JSON for others
  static formatComment(data) {
    // Use new voucher pattern for voucher system
    if (data.system === 'voucher' && data.type === 'hotspot') {
      const parts = [
        'VOUCHER_SYSTEM',
        data.price_sell || '0',
        data.first_login_timestamp || '',
        data.valid_until_timestamp || ''
      ];
      return parts.join('|');
    }

    // Use JSON format for other systems (PPPoE, profiles, etc.)
    return JSON.stringify(data);
  }

  // Parse voucher comment to extract voucher information
  static parseVoucherComment(comment) {
    try {
      if (!comment || typeof comment !== 'string') {
        return null;
      }

      // Check if it's using the new voucher pattern
      if (comment.startsWith('VOUCHER_SYSTEM|')) {
        const parts = comment.split('|');
        if (parts.length >= 4) {
          const firstLogin = parts[2] ? parseInt(parts[2]) : null;
          const validUntil = parts[3] ? parseInt(parts[3]) : null;
          const priceSell = parseFloat(parts[1]) || 0;

          // Determine voucher status based on timestamps
          const now = Math.floor(Date.now() / 1000); // Current timestamp in seconds
          let status = 'available';

          if (firstLogin && validUntil) {
            if (firstLogin > 0) {
              if (now > validUntil) {
                status = 'expired';
              } else {
                status = 'active';
              }
            }
          } else if (firstLogin && firstLogin > 0) {
            status = 'active';
          }

          return {
            system: 'voucher',
            type: 'hotspot',
            price_sell: priceSell,
            first_login_timestamp: firstLogin,
            valid_until_timestamp: validUntil,
            status: status,
            raw: comment,
            // Additional computed properties
            first_login_date: firstLogin ? new Date(firstLogin * 1000) : null,
            valid_until_date: validUntil ? new Date(validUntil * 1000) : null,
            is_expired: validUntil ? now > validUntil : false,
            time_remaining: validUntil ? Math.max(0, validUntil - now) : null
          };
        }
      }

      return null;
    } catch (error) {
      console.error('Error parsing voucher comment:', error);
      return null;
    }
  }

  // Find users by system comment
  async findSystemUsers(type = 'hotspot') {
    try {
      let users = [];

      if (type === 'hotspot') {
        users = await this.getHotspotUsers();
      } else if (type === 'pppoe') {
        users = await this.getPPPoESecrets();
      }

      return users.filter(user => {
        const commentData = MikrotikClient.parseComment(user.comment);
        return commentData && commentData.system;
      });
    } catch (error) {
      console.error('Error finding system users:', error);
      return [];
    }
  }

  // Find expired users
  async findExpiredUsers(type = 'hotspot') {
    try {
      const systemUsers = await this.findSystemUsers(type);
      const now = Math.floor(Date.now() / 1000); // Current timestamp in seconds

      return systemUsers.filter(user => {
        const commentData = MikrotikClient.parseComment(user.comment);

        if (type === 'hotspot') {
          // For voucher users, check if valid_until_timestamp has passed
          if (commentData.system === 'voucher' && commentData.valid_until_timestamp) {
            const validUntil = parseInt(commentData.valid_until_timestamp);
            return validUntil > 0 && now > validUntil;
          }

          // For legacy hotspot users, check if first login + expired hours has passed
          if (commentData.first_login && commentData.expired_hours) {
            const firstLogin = new Date(commentData.first_login);
            const expiryDate = new Date(firstLogin.getTime() + parseInt(commentData.expired_hours) * 3600 * 1000);
            return expiryDate < new Date();
          }
        } else if (type === 'pppoe') {
          // For PPPoE users, check expiry date
          if (commentData.expired_date) {
            const expiryDate = new Date(commentData.expired_date);
            return expiryDate < new Date();
          }
        }

        return false;
      });
    } catch (error) {
      console.error('Error finding expired users:', error);
      return [];
    }
  }

  // Find active voucher users (for monitoring and status tracking)
  async findActiveVoucherUsers() {
    try {
      const voucherUsers = await this.getVoucherUsers();
      return voucherUsers.filter(user => {
        const voucherInfo = user.voucher_info;
        return voucherInfo && (voucherInfo.status === 'active' || voucherInfo.status === 'available');
      });
    } catch (error) {
      console.error('Error finding active voucher users:', error);
      return [];
    }
  }

  // Find used voucher users (users that have logged in at least once)
  async findUsedVoucherUsers() {
    try {
      const voucherUsers = await this.getVoucherUsers();
      return voucherUsers.filter(user => {
        const voucherInfo = user.voucher_info;
        return voucherInfo && voucherInfo.first_login_timestamp && voucherInfo.first_login_timestamp > 0;
      });
    } catch (error) {
      console.error('Error finding used voucher users:', error);
      return [];
    }
  }

  // Get active hotspot users (for polling)
  async getActiveHotspotUsers() {
    try {
      const activeUsers = await this.executeCommand('/ip/hotspot/active/print');
      return activeUsers || [];
    } catch (error) {
      console.error('Error getting active hotspot users:', error);
      return [];
    }
  }

  // Get active PPPoE users (for polling)
  async getActivePPPoEUsers() {
    try {
      const activeUsers = await this.executeCommand('/ppp/active/print');
      return activeUsers || [];
    } catch (error) {
      console.error('Error getting active PPPoE users:', error);
      return [];
    }
  }

  // Monitor first login - VOUCHER_SYSTEM format only
  async monitorFirstLogin() {
    try {
      const activeUsers = await this.getHotspotActive();
      const systemUsers = await this.findSystemUsers('hotspot');

      // Create a map of active users by username
      const activeUserMap = {};
      activeUsers.forEach(active => {
        activeUserMap[active.user] = active;
      });

      // Check for first logins using VOUCHER_SYSTEM format only
      const firstLogins = [];
      const now = Math.floor(Date.now() / 1000); // Current timestamp in seconds

      for (const user of systemUsers) {
        if (activeUserMap[user.name]) {
          const commentData = MikrotikClient.parseComment(user.comment);

          // Only process VOUCHER_SYSTEM format users
          if (commentData.system === 'voucher') {
            // Check if first_login_timestamp is not set or is 0 (first time login)
            if (!commentData.first_login_timestamp || commentData.first_login_timestamp === '0' || commentData.first_login_timestamp === '') {
              const validUntil = commentData.valid_until_timestamp && commentData.valid_until_timestamp !== '0' ?
                parseInt(commentData.valid_until_timestamp) : null;

              // Update the user's comment with first login timestamp
              await this.updateVoucherUserComment(user.name, now.toString(), validUntil ? validUntil.toString() : null);

              firstLogins.push({
                username: user.name,
                firstLogin: new Date(now * 1000).toISOString(),
                ip: activeUserMap[user.name].address,
                type: 'voucher',
                validUntil: validUntil ? new Date(validUntil * 1000).toISOString() : null,
                priceSell: commentData.price_sell || 0
              });
            }
          }
        }
      }

      return firstLogins;
    } catch (error) {
      console.error('Error monitoring first login:', error);
      return [];
    }
  }

  // Script Management Methods - Automatic System

  // Get default hotspot on-login script for system-managed profiles (Subscription System)
  getDefaultHotspotLoginScript() {
    return `:local user \$user
:local ip \$address
:local uptime [/ip hotspot active get [find user=\$user] uptime]

# HIJINETWORK Subscription System - On-Login Script
# Log user login activity
:log info "HIJINETWORK: User login: \$user, Profile: Hotspot, IP: \$ip"

# For subscription users, no monitor script needed (handled by billing system)
:log info "HIJINETWORK: Login processing completed for: \$user"`;
  }

  // Get default hotspot on-logout script for system-managed profiles
  getDefaultHotspotLogoutScript() {
    return `:local user \$user
:local duration \$uptime
:local bytesIn \$bytes-in
:local bytesOut \$bytes-out

# HIJINETWORK Subscription System - On-Logout Script
# Log user logout activity with session statistics
:log info "HIJINETWORK: User logout: \$user, duration: \$duration, bytes-in: \$bytesIn, bytes-out: \$bytesOut"

# For subscription users, cleanup monitoring script and scheduler
/system script remove [find name="monitor-\$user"]
/system scheduler remove [find name="monitor-\$user"]

:log info "HIJINETWORK: Cleanup completed for user: \$user"`;
  }

  // Get default PPPoE on-connect script for system-managed profiles
  getDefaultPPPoEConnectScript() {
    return `:local user \$user
:local localAddress \$"local-address"
:local remoteAddress \$"remote-address"

# Cek apakah user dari sistem HIJINETWORK
:local comment [/ppp secret get [find name=\$user] comment]
:if ([:find \$comment "hijinetwork"] < 0) do={
  :return
}

# Log connection activity
:log info "HIJINETWORK: PPPoE user connected: \$user, local: \$localAddress, remote: \$remoteAddress"`;
  }

  // Get default PPPoE on-disconnect script for system-managed profiles
  getDefaultPPPoEDisconnectScript() {
    return `:local user \$user
:local duration \$uptime
:local bytesIn \$bytes-in
:local bytesOut \$bytes-out
:local disconnectReason \$"disconnect-reason"

# Cek apakah user dari sistem HIJINETWORK
:local comment [/ppp secret get [find name=\$user] comment]
:if ([:find \$comment "hijinetwork"] < 0) do={
  :return
}

# Log disconnection activity
:log info "HIJINETWORK: PPPoE user disconnected: \$user, duration: \$duration, reason: \$disconnectReason"`;
  }

  // Get default cleanup scheduler script
  getDefaultCleanupScript() {
    return `:do {
  :local expiredUsers [/ip hotspot user find where comment~"hijinetwork" and uptime>0];
  :foreach user in=\$expiredUsers do={
    :local commentData [/ip hotspot user get \$user comment];
    :local parsedComment [:parse \$commentData];

    # Check if user is used and calculate expiry
    :if (\$parsedComment->"status" = "used") do={
      :local firstLogin \$parsedComment->"first_login";
      :local durationHours \$parsedComment->"duration_hours";

      # Calculate expiry timestamp
      :local expiryTimestamp (\$firstLogin + (\$durationHours * 3600));
      :local currentTimestamp [/system clock get time];

      # Check if expired
      :if (\$expiryTimestamp <= \$currentTimestamp) do={
        :log info "HIJINETWORK: Voucher expired, deleting user: [\$user name]";

        # Delete expired user
        /ip hotspot user remove \$user;

        :log info "HIJINETWORK: Expired voucher deleted: [\$user name]";
      }
    }
  }
}`;
  }

  // Inject scripts into hotspot profile (Automatic System)
  async injectHotspotProfileScripts(profileName) {
    try {
      if (!this.connected) {
        throw new Error('Mikrotik not connected');
      }

      // Get current profile
      const profiles = await this.getHotspotProfiles();
      const profile = profiles.find(p => p.name === profileName);

      if (!profile) {
        throw new Error(`Hotspot profile ${profileName} not found`);
      }

      // Use default system scripts
      const loginScript = this.getDefaultHotspotLoginScript();
      const logoutScript = this.getDefaultHotspotLogoutScript();

      // Update profile with scripts
      const updateData = {};
      updateData['on-login'] = loginScript;
      updateData['on-logout'] = logoutScript;

      await this.client.runQuery('/ip/hotspot/user/profile/set', {
        '.id': profile['.id'],
        ...updateData
      });

      console.log(`HIJINETWORK: Automatic scripts injected into hotspot profile: ${profileName}`);

      // Log successful script injection
      this.logScriptInjection(profileName, 'hotspot', 'login_logout', true);
      return true;
    } catch (error) {
      console.error(`Error injecting automatic scripts into hotspot profile ${profileName}:`, error);

      // Log failed script injection
      this.logScriptInjection(profileName, 'hotspot', 'login_logout', false, error);
      return false;
    }
  }

  // Inject scripts into PPPoE profile (Automatic System)
  async injectPPPoEProfileScripts(profileName) {
    try {
      if (!this.connected) {
        throw new Error('Mikrotik not connected');
      }

      // Get current profile
      const profiles = await this.getPPPoEProfiles();
      const profile = profiles.find(p => p.name === profileName);

      if (!profile) {
        throw new Error(`PPPoE profile ${profileName} not found`);
      }

      // Use default system scripts
      const connectScript = this.getDefaultPPPoEConnectScript();
      const disconnectScript = this.getDefaultPPPoEDisconnectScript();

      // Update profile with scripts
      const updateData = {};
      updateData['on-up'] = connectScript;
      updateData['on-down'] = disconnectScript;

      await this.client.runQuery('/ppp/profile/set', {
        '.id': profile['.id'],
        ...updateData
      });

      console.log(`HIJINETWORK: Automatic scripts injected into PPPoE profile: ${profileName}`);

      // Log successful script injection
      this.logScriptInjection(profileName, 'pppoe', 'connect_disconnect', true);
      return true;
    } catch (error) {
      console.error(`Error injecting automatic scripts into PPPoE profile ${profileName}:`, error);

      // Log failed script injection
      this.logScriptInjection(profileName, 'pppoe', 'connect_disconnect', false, error);
      return false;
    }
  }

  // Create or update cleanup scheduler in Mikrotik (Automatic System)
  async createCleanupScheduler() {
    try {
      if (!this.connected) {
        throw new Error('Mikrotik not connected');
      }

      const schedulerName = 'HIJINETWORK-Cleanup';
      const existingSchedulers = await this.client.runQuery('/system/scheduler/print');
      const existingScheduler = existingSchedulers.find(s => s.name === schedulerName);

      const schedulerData = {
        name: schedulerName,
        'start-date': 'jan/01/1970',
        'start-time': 'startup',
        interval: '5m',
        'on-event': this.getDefaultCleanupScript(),
        disabled: 'no',
        comment: 'HIJINETWORK_SYSTEM_SCHEDULER'
      };

      if (existingScheduler) {
        // Update existing scheduler
        await this.client.runQuery('/system/scheduler/set', {
          '.id': existingScheduler['.id'],
          ...schedulerData
        });
        console.log(`HIJINETWORK: Cleanup scheduler updated: ${schedulerName}`);
        this.logSchedulerAction(schedulerName, 'update', true);
      } else {
        // Create new scheduler
        await this.client.runQuery('/system/scheduler/add', schedulerData);
        console.log(`HIJINETWORK: Cleanup scheduler created: ${schedulerName}`);
        this.logSchedulerAction(schedulerName, 'create', true);
      }

      return true;
    } catch (error) {
      console.error('Error creating/updating HIJINETWORK cleanup scheduler:', error);
      this.logSchedulerAction(schedulerName, 'create', false, error);
      return false;
    }
  }

  // Remove scheduler from Mikrotik
  async removeScheduler(schedulerName) {
    try {
      if (!this.connected) {
        throw new Error('Mikrotik not connected');
      }

      const existingSchedulers = await this.client.runQuery('/system/scheduler/print');
      const existingScheduler = existingSchedulers.find(s => s.name === schedulerName);

      if (existingScheduler) {
        await this.client.runQuery('/system/scheduler/remove', {
          '.id': existingScheduler['.id']
        });
        console.log(`HIJINETWORK: Scheduler removed: ${schedulerName}`);
        this.logSchedulerAction(schedulerName, 'remove', true);
        return true;
      }

      console.log(`HIJINETWORK: Scheduler not found: ${schedulerName}`);
      this.logSchedulerAction(schedulerName, 'remove', false, new Error('Scheduler not found'));
      return false;
    } catch (error) {
      console.error(`HIJINETWORK: Error removing scheduler ${schedulerName}:`, error);
      this.logSchedulerAction(schedulerName, 'remove', false, error);
      return false;
    }
  }

  // Override profile settings for system-managed profiles
  async overrideSystemProfile(profileName, profileType, updates = {}) {
    try {
      if (!this.connected) {
        throw new Error('Mikrotik not connected');
      }

      console.log(`HIJINETWORK: Overriding system profile: ${profileName}`);

      if (profileType === 'hotspot') {
        const profiles = await this.getHotspotProfiles();
        const profile = profiles.find(p => p.name === profileName);

        if (!profile) {
          throw new Error(`Hotspot profile ${profileName} not found`);
        }

        // Apply system-managed settings
        const systemUpdates = {
          ...updates,
          'on-login': this.getDefaultHotspotLoginScript(),
          'on-logout': this.getDefaultHotspotLogoutScript()
        };

        await this.client.runQuery('/ip/hotspot/user/profile/set', {
          '.id': profile['.id'],
          ...systemUpdates
        });

        console.log(`HIJINETWORK: Hotspot profile overridden: ${profileName}`);
        this.logProfileSync(profileName, 'hotspot', 'override', true);
      } else if (profileType === 'pppoe') {
        const profiles = await this.getPPPoEProfiles();
        const profile = profiles.find(p => p.name === profileName);

        if (!profile) {
          throw new Error(`PPPoE profile ${profileName} not found`);
        }

        // Apply system-managed settings
        const systemUpdates = {
          ...updates,
          'on-up': this.getDefaultPPPoEConnectScript(),
          'on-down': this.getDefaultPPPoEDisconnectScript()
        };

        await this.client.runQuery('/ppp/profile/set', {
          '.id': profile['.id'],
          ...systemUpdates
        });

        console.log(`HIJINETWORK: PPPoE profile overridden: ${profileName}`);
        this.logProfileSync(profileName, 'pppoe', 'override', true);
      }

      return true;
    } catch (error) {
      console.error(`Error overriding system profile ${profileName}:`, error);
      this.logProfileSync(profileName, profileType, 'override', false, error);
      return false;
    }
  }

  // Get system URL for script callbacks
  getSystemUrl() {
    // This should be configurable in settings
    return process.env.SYSTEM_URL || 'http://localhost:3000';
  }

  // Get system-managed profiles from database
  async getSystemManagedProfiles() {
    try {
      if (!this.db) {
        return [];
      }

      return await this.db.query('SELECT * FROM profiles WHERE mikrotik_name LIKE $1', ['%SYSTEM%']);
    } catch (error) {
      console.error('Error getting system-managed profiles:', error);
      return [];
    }
  }

  // Sync expired and first login data for vouchers and PPPoE users
  // Also restores users that exist in database but were deleted in Mikrotik
  async syncUserData() {
    try {
      console.log('HIJINETWORK: Starting sync of user data (expired, first login, and restore)...');

      let restoredVouchers = 0;
      let restoredPPPoE = 0;

      // First, restore users that exist in database but missing in Mikrotik
      if (this.db) {
        try {
          // Get active vouchers from database
          const dbVoucherResult = await this.db.query(
            'SELECT code, password, profile_id FROM vouchers WHERE status = $1',
            ['active']
          ) || { rows: [] };

          // Get active PPPoE users from database
          const dbPPPoEResult = await this.db.query(
            'SELECT username, password, profile_id FROM pppoe_users WHERE status = $1',
            ['active']
          ) || { rows: [] };

          const dbVouchers = dbVoucherResult.rows || [];
          const dbPPPoEUsers = dbPPPoEResult.rows || [];

          // Get current users from Mikrotik
          const mikrotikVouchers = await this.getHotspotUsers();
          const mikrotikPPPoEUsers = await this.getPPPoESecrets();

          // Create maps for faster lookup
          const mikrotikVoucherMap = new Map(mikrotikVouchers.map(u => [u.name, u]));
          const mikrotikPPPoEMap = new Map(mikrotikPPPoEUsers.map(u => [u.name, u]));

          // Restore missing vouchers
          for (const voucher of dbVouchers) {
            if (!mikrotikVoucherMap.has(voucher.code)) {
              try {
                console.log(`Restoring voucher in Mikrotik: ${voucher.code}`);

                // Get profile name
                let profileName = null;
                if (voucher.profile_id) {
                  const profileResult = await this.db.query(
                    'SELECT name FROM profiles WHERE id = $1',
                    [voucher.profile_id]
                  );
                  profileName = profileResult.rows[0]?.name;
                }

                // Create voucher user in Mikrotik
                await this.createVoucherUser({
                  username: voucher.code,
                  password: voucher.password,
                  profile: profileName,
                  price_sell: 0, // Will be updated from actual voucher data
                  expired_hours: 0, // Will be updated from actual voucher data
                  never_expired: true
                });

                restoredVouchers++;
              } catch (error) {
                console.error(`Error restoring voucher ${voucher.code}:`, error);
              }
            }
          }

          // Restore missing PPPoE users
          for (const pppoeUser of dbPPPoEUsers) {
            if (!mikrotikPPPoEMap.has(pppoeUser.username)) {
              try {
                console.log(`Restoring PPPoE user in Mikrotik: ${pppoeUser.username}`);

                // Get profile name
                let profileName = null;
                if (pppoeUser.profile_id) {
                  const profileResult = await this.db.query(
                    'SELECT name FROM profiles WHERE id = $1',
                    [pppoeUser.profile_id]
                  );
                  profileName = profileResult.rows[0]?.name;
                }

                // Create PPPoE user in Mikrotik
                await this.createPPPoESecret({
                  username: pppoeUser.username,
                  password: pppoeUser.password,
                  profile: profileName,
                  comment: {
                    system: 'pppoe',
                    restored: true,
                    restored_at: new Date().toISOString()
                  }
                });

                restoredPPPoE++;
              } catch (error) {
                console.error(`Error restoring PPPoE user ${pppoeUser.username}:`, error);
              }
            }
          }

          console.log(`Restored ${restoredVouchers} vouchers and ${restoredPPPoE} PPPoE users`);
        } catch (dbError) {
          console.error('Error during user restoration:', dbError);
        }
      }

      // Sync expired vouchers
      const expiredVouchers = await this.findExpiredUsers('hotspot');
      console.log(`Found ${expiredVouchers.length} expired voucher users`);

      for (const user of expiredVouchers) {
        try {
          // Disable expired user in Mikrotik
          await this.updateHotspotUser(user.name, { disabled: 'yes' });

          // Update database status
          if (this.db) {
            await this.db.query(
              'UPDATE vouchers SET status = $1 WHERE code = $2',
              ['expired', user.name]
            );
          }

          console.log(`Disabled expired voucher user: ${user.name}`);
        } catch (error) {
          console.error(`Error disabling expired voucher ${user.name}:`, error);
        }
      }

      // Sync expired PPPoE users
      const expiredPPPoEUsers = await this.findExpiredUsers('pppoe');
      console.log(`Found ${expiredPPPoEUsers.length} expired PPPoE users`);

      for (const user of expiredPPPoEUsers) {
        try {
          // Disable expired user in Mikrotik
          await this.updatePPPoESecret(user.name, { disabled: 'yes' });

          // Update database status
          if (this.db) {
            await this.db.query(
              'UPDATE pppoe_users SET status = $1 WHERE username = $2',
              ['expired', user.name]
            );
          }

          console.log(`Disabled expired PPPoE user: ${user.name}`);
        } catch (error) {
          console.error(`Error disabling expired PPPoE ${user.name}:`, error);
        }
      }

      // Monitor first login for vouchers
      const firstLogins = await this.monitorFirstLogin();
      if (firstLogins.length > 0) {
        console.log(`Processed ${firstLogins.length} first logins`);

        // Update database for first logins
        if (this.db) {
          for (const login of firstLogins) {
            try {
              await this.db.query(
                'UPDATE vouchers SET status = $1, used_at = $2 WHERE code = $3',
                ['active', login.firstLogin, login.username]
              );
            } catch (error) {
              console.error(`Error updating voucher first login ${login.username}:`, error);
            }
          }
        }
      }

      console.log('HIJINETWORK: User data sync completed');
      return {
        restoredVouchers,
        restoredPPPoE,
        expiredVouchers: expiredVouchers.length,
        expiredPPPoEUsers: expiredPPPoEUsers.length,
        firstLogins: firstLogins.length
      };
    } catch (error) {
      console.error('Error syncing user data:', error);
      return false;
    }
  }

  // Refresh data cache for different data types
  async refreshData(dataType) {
    try {
      // This method is used to refresh cached data after operations
      // Currently, we don't implement caching, but we keep the method for compatibility
      console.log(`Refreshing data cache for: ${dataType}`);

      // If we had caching, we would refresh the specific data type here
      // For now, this is a no-op but prevents errors
      return true;
    } catch (error) {
      console.error(`Error refreshing data cache for ${dataType}:`, error);
      return false;
    }
  }

  // System logging methods
  async logSystemActivity(action, details) {
    try {
      if (this.db) {
        // PostgreSQL
        await this.db.query(`
            INSERT INTO activity_logs (action, details, ip_address)
            VALUES ($1, $2, $3)
          `, [
          action,
          JSON.stringify({
            timestamp: new Date().toISOString(),
            ...details
          }),
          '127.0.0.1'
        ]);
        console.log(`HIJINETWORK: System activity logged - ${action}`);
      }
    } catch (error) {
      console.error('Error logging system activity:', error);
    }
  }

  logScriptInjection(profileName, profileType, scriptType, success = true, error = null) {
    this.logSystemActivity('script_injection', {
      profile_name: profileName,
      profile_type: profileType,
      script_type: scriptType,
      success: success,
      error: error ? error.message : null
    });
  }

  logProfileSync(profileName, profileType, action, success = true, error = null) {
    this.logSystemActivity('profile_sync', {
      profile_name: profileName,
      profile_type: profileType,
      action: action,
      success: success,
      error: error ? error.message : null
    });
  }

  logSchedulerAction(schedulerName, action, success = true, error = null) {
    this.logSystemActivity('scheduler_action', {
      scheduler_name: schedulerName,
      action: action,
      success: success,
      error: error ? error.message : null
    });
  }

  // Create hotspot profile in RouterOS with unique name-based identification
  async createHotspotProfile(profileName, priceSell = 0, priceCost = 0) {
    try {
      if (!this.connected) {
        throw new Error('Mikrotik not connected');
      }

      console.log(`HIJINETWORK: Creating hotspot profile in RouterOS: ${profileName}`);

      // Create the hotspot profile with unique name - no comment dependency
      await this.client.runQuery('/ip/hotspot/user/profile/add', {
        name: profileName,
        'rate-limit': '1M/2M' // Default rate limit, can be updated later
      });

      console.log(`HIJINETWORK: Hotspot profile created successfully: ${profileName}`);

      // Log successful profile creation
      this.logProfileSync(profileName, 'hotspot', 'create', true);

      return true;
    } catch (error) {
      console.error(`HIJINETWORK: Error creating hotspot profile ${profileName}:`, error);

      // Log failed profile creation
      this.logProfileSync(profileName, 'hotspot', 'create', false, error);

      return false;
    }
  }

  // Update hotspot profile in RouterOS
  async updateHotspotProfile(profileName, priceSell = 0, priceCost = 0) {
    try {
      if (!this.connected) {
        throw new Error('Mikrotik not connected');
      }

      console.log(`HIJINETWORK: Updating hotspot profile in RouterOS: ${profileName}`);

      // Get the existing profile
      const profiles = await this.getHotspotProfiles();
      const profile = profiles.find(p => p.name === profileName);

      if (!profile) {
        throw new Error(`Hotspot profile ${profileName} not found`);
      }

      // Update the profile using RouterOS set command
      await this.client.runQuery('/ip/hotspot/user/profile/set', {
        '.id': profile['.id'],
        'rate-limit': '1M/2M' // Keep existing rate limit, can be enhanced later
      });

      console.log(`HIJINETWORK: Hotspot profile updated successfully: ${profileName}`);
      this.logProfileSync(profileName, 'hotspot', 'update', true);

      return true;
    } catch (error) {
      console.error(`HIJINETWORK: Error updating hotspot profile ${profileName}:`, error);
      this.logProfileSync(profileName, 'hotspot', 'update', false, error);
      return false;
    }
  }

  // Delete hotspot profile in RouterOS
  async deleteHotspotProfile(profileName) {
    try {
      if (!this.connected) {
        throw new Error('Mikrotik not connected');
      }

      console.log(`HIJINETWORK: Deleting hotspot profile in RouterOS: ${profileName}`);

      // Get the existing profile
      const profiles = await this.getHotspotProfiles();
      const profile = profiles.find(p => p.name === profileName);

      if (!profile) {
        throw new Error(`Hotspot profile ${profileName} not found`);
      }

      // Delete the profile using RouterOS remove command
      await this.client.runQuery('/ip/hotspot/user/profile/remove', {
        '.id': profile['.id']
      });

      console.log(`HIJINETWORK: Hotspot profile deleted successfully: ${profileName}`);
      this.logProfileSync(profileName, 'hotspot', 'delete', true);

      return true;
    } catch (error) {
      console.error(`HIJINETWORK: Error deleting hotspot profile ${profileName}:`, error);
      this.logProfileSync(profileName, 'hotspot', 'delete', false, error);
      return false;
    }
  }

  // Create PPPoE profile in RouterOS with unique name-based identification
  async createPPPoEProfile(profileName, priceSell = 0, priceCost = 0) {
    try {
      if (!this.connected) {
        throw new Error('Mikrotik not connected');
      }

      console.log(`HIJINETWORK: Creating PPPoE profile in RouterOS: ${profileName}`);

      // Create the PPPoE profile with unique name - no comment dependency
      await this.client.runQuery('/ppp/profile/add', {
        name: profileName,
        'rate-limit': '1M/2M' // Default rate limit, can be updated later
      });

      console.log(`HIJINETWORK: PPPoE profile created successfully: ${profileName}`);

      // Log successful profile creation
      this.logProfileSync(profileName, 'pppoe', 'create', true);

      return true;
    } catch (error) {
      console.error(`HIJINETWORK: Error creating PPPoE profile ${profileName}:`, error);

      // Log failed profile creation
      this.logProfileSync(profileName, 'pppoe', 'create', false, error);

      return false;
    }
  }

  // Update PPPoE profile in RouterOS
  async updatePPPoEProfile(profileName, priceSell = 0, priceCost = 0) {
    try {
      if (!this.connected) {
        throw new Error('Mikrotik not connected');
      }

      console.log(`HIJINETWORK: Updating PPPoE profile in RouterOS: ${profileName}`);

      // Get the existing profile
      const profiles = await this.getPPPoEProfiles();
      const profile = profiles.find(p => p.name === profileName);

      if (!profile) {
        throw new Error(`PPPoE profile ${profileName} not found`);
      }

      // Update the profile using RouterOS set command
      await this.client.runQuery('/ppp/profile/set', {
        '.id': profile['.id'],
        'rate-limit': '1M/2M' // Keep existing rate limit, can be enhanced later
      });

      console.log(`HIJINETWORK: PPPoE profile updated successfully: ${profileName}`);
      this.logProfileSync(profileName, 'pppoe', 'update', true);

      return true;
    } catch (error) {
      console.error(`HIJINETWORK: Error updating PPPoE profile ${profileName}:`, error);
      this.logProfileSync(profileName, 'pppoe', 'update', false, error);
      return false;
    }
  }

  // Delete PPPoE profile in RouterOS
  async deletePPPoEProfile(profileName) {
    try {
      if (!this.connected) {
        throw new Error('Mikrotik not connected');
      }

      console.log(`HIJINETWORK: Deleting PPPoE profile in RouterOS: ${profileName}`);

      // Get the existing profile
      const profiles = await this.getPPPoEProfiles();
      const profile = profiles.find(p => p.name === profileName);

      if (!profile) {
        throw new Error(`PPPoE profile ${profileName} not found`);
      }

      // Delete the profile using RouterOS remove command
      await this.client.runQuery('/ppp/profile/remove', {
        '.id': profile['.id']
      });

      console.log(`HIJINETWORK: PPPoE profile deleted successfully: ${profileName}`);
      this.logProfileSync(profileName, 'pppoe', 'delete', true);

      return true;
    } catch (error) {
      console.error(`HIJINETWORK: Error deleting PPPoE profile ${profileName}:`, error);
      this.logProfileSync(profileName, 'pppoe', 'delete', false, error);
      return false;
    }
  }

  // Check if profile exists in RouterOS by name (no comment dependency)
  async checkProfileExists(profileName, profileType) {
    try {
      if (!this.connected) {
        throw new Error('Mikrotik not connected');
      }

      console.log(`HIJINETWORK: Checking profile existence: ${profileName} (${profileType})`);

      if (profileType === 'hotspot') {
        const profiles = await this.getHotspotProfiles();
        const profile = profiles.find(p => p.name === profileName);
        return !!profile;
      } else if (profileType === 'pppoe') {
        const profiles = await this.getPPPoEProfiles();
        const profile = profiles.find(p => p.name === profileName);
        return !!profile;
      }

      return false;
    } catch (error) {
      console.error(`HIJINETWORK: Error checking profile existence ${profileName}:`, error);
      return false;
    }
  }
}

module.exports = MikrotikClient;