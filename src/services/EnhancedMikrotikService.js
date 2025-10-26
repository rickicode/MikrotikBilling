/**
 * Enhanced Mikrotik Service
 * Integrates Enhanced MikrotikClient with existing business logic
 */
const EnhancedMikrotikClient = require('./EnhancedMikrotikClient');
const EnhancedMikrotikConfig = require('../config/EnhancedMikrotikConfig');
const EventEmitter = require('events');

class EnhancedMikrotikService extends EventEmitter {
  constructor(database = null) {
    super();
    this.db = database;
    this.client = null;
    this.config = new EnhancedMikrotikConfig();
    this.isInitialized = false;
    this.startTime = Date.now();
  }

  /**
   * Initialize the enhanced Mikrotik service
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Enhanced Mikrotik Service...');

      // Load configuration
      await this.config.loadConfig();

      // Get Mikrotik configuration
      const mikrotikConfig = this.config.getMikrotikConfig();
      const clientOptions = this.config.getClientOptions();

      // Create enhanced client
      this.client = new EnhancedMikrotikClient(mikrotikConfig, {
        ...clientOptions,
        database: this.db
      });

      // Initialize client
      await this.client.initialize();

      // Setup event listeners
      this.setupEventListeners();

      this.isInitialized = true;
      console.log('✅ Enhanced Mikrotik Service initialized successfully');
      this.emit('initialized');

      // Log successful initialization
      if (this.client.auditLogger) {
        this.client.auditLogger.logSystemOperation('ENHANCED_SERVICE_INITIALIZED', {
          features: clientOptions,
          uptime: 0
        });
      }

    } catch (error) {
      console.error('❌ Failed to initialize Enhanced Mikrotik Service:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Setup event listeners for monitoring
   */
  setupEventListeners() {
    // Forward client events
    this.client.on('initialized', () => this.emit('client-initialized'));
    this.client.on('error', (error) => this.emit('client-error', error));

    // Monitor circuit breaker events
    if (this.client.circuitBreaker) {
      this.client.circuitBreaker.on('state-change', (data) => {
        this.emit('circuit-breaker-state-change', data);

        if (data.to === 'OPEN') {
          console.warn('⚠️ Circuit breaker OPEN - Mikrotik operations will be rejected');
          this.emit('mikrotik-unavailable', { reason: 'circuit-breaker-open' });
        } else if (data.to === 'CLOSED') {
          console.log('✅ Circuit breaker CLOSED - Mikrotik operations resumed');
          this.emit('mikrotik-available', { reason: 'circuit-breaker-closed' });
        }
      });
    }

    // Monitor rate limiting events
    if (this.client.rateLimiter) {
      this.client.rateLimiter.on('rejected', (data) => {
        this.emit('rate-limit-exceeded', data);
        console.warn('⚠️ Rate limit exceeded - request rejected');
      });
    }
  }

  /**
   * Execute Mikrotik command with enhanced features
   */
  async execute(command, params = {}, options = {}) {
    this.ensureInitialized();

    try {
      const result = await this.client.execute(command, params, options);
      return result;
    } catch (error) {
      this.emit('command-failed', { command, params, error });
      throw error;
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus() {
    if (!this.client) {
      return {
        connected: false,
        initialized: false,
        error: 'Client not initialized'
      };
    }

    const status = this.client.getConnectionStatus();
    status.uptime = Date.now() - this.startTime;
    return status;
  }

  /**
   * Get comprehensive statistics
   */
  getStatistics() {
    if (!this.client) {
      return { error: 'Client not initialized' };
    }

    const stats = this.client.getStatistics();
    stats.service = {
      uptime: Date.now() - this.startTime,
      initialized: this.isInitialized,
      version: '1.0.0'
    };

    return stats;
  }

  /**
   * Perform health check
   */
  async performHealthCheck() {
    if (!this.client) {
      return {
        status: 'unhealthy',
        error: 'Client not initialized'
      };
    }

    try {
      const health = await this.client.performHealthCheck();
      health.service = {
        uptime: Date.now() - this.startTime,
        initialized: this.isInitialized
      };

      return health;
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  /**
   * Enhanced Hotspot User Management
   */
  async createHotspotUser(userData) {
    this.ensureInitialized();

    try {
      // Validate input
      const validation = this.client.validator.validateBatch({
        username: { value: userData.username, type: 'username', options: { userType: 'hotspot' } },
        password: { value: userData.password, type: 'password' },
        profile: { value: userData.profile, type: 'text' }
      });

      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Execute with high priority for user creation
      const result = await this.client.execute('/ip/hotspot/user/add', {
        name: userData.username,
        password: userData.password,
        profile: userData.profile,
        comment: userData.comment || '',
        'disabled': 'no'
      }, { priority: 'high' });

      // Log business event
      if (this.client.monitoring) {
        this.client.monitoring.recordBusinessEvent('user_created');
      }

      // Log audit event
      if (this.client.auditLogger) {
        this.client.auditLogger.logUserManagement('HOTSPOT_USER_CREATED', {
          username: userData.username,
          profile: userData.profile,
          result: 'success'
        });
      }

      this.emit('hotspot-user-created', { username: userData.username, result });
      return result;

    } catch (error) {
      if (this.client.auditLogger) {
        this.client.auditLogger.logUserManagement('HOTSPOT_USER_CREATE_FAILED', {
          username: userData.username,
          error: error.message,
          result: 'failed'
        });
      }

      this.emit('hotspot-user-create-failed', { username: userData.username, error });
      throw error;
    }
  }

  /**
   * Enhanced PPPoE User Management
   */
  async createPPPoESecret(secretData) {
    this.ensureInitialized();

    try {
      // Validate input
      const validation = this.client.validator.validateBatch({
        username: { value: secretData.username, type: 'username', options: { userType: 'pppoe' } },
        password: { value: secretData.password, type: 'password' },
        profile: { value: secretData.profile, type: 'text' }
      });

      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Execute with high priority
      const result = await this.client.execute('/ppp/secret/add', {
        name: secretData.username,
        password: secretData.password,
        profile: secretData.profile,
        service: 'pppoe',
        comment: secretData.comment || '',
        'disabled': 'no'
      }, { priority: 'high' });

      // Log business event
      if (this.client.monitoring) {
        this.client.monitoring.recordBusinessEvent('user_created');
      }

      // Log audit event
      if (this.client.auditLogger) {
        this.client.auditLogger.logUserManagement('PPPOE_SECRET_CREATED', {
          username: secretData.username,
          profile: secretData.profile,
          result: 'success'
        });
      }

      this.emit('pppoe-secret-created', { username: secretData.username, result });
      return result;

    } catch (error) {
      if (this.client.auditLogger) {
        this.client.auditLogger.logUserManagement('PPPOE_SECRET_CREATE_FAILED', {
          username: secretData.username,
          error: error.message,
          result: 'failed'
        });
      }

      this.emit('pppoe-secret-create-failed', { username: secretData.username, error });
      throw error;
    }
  }

  /**
   * Get system users with caching
   */
  async getHotspotUsers(useCache = true) {
    this.ensureInitialized();

    try {
      const result = await this.client.execute('/ip/hotspot/user/print', {}, {
        priority: 'normal',
        useCache
      });

      // Filter system-managed users
      const systemUsers = result.filter(user => {
        if (!user.comment) return false;
        try {
          const comment = this.parseComment(user.comment);
          return comment && (comment.system === 'hotspot' || comment.system === 'voucher' || comment.created_by_system);
        } catch {
          return false;
        }
      });

      return systemUsers;

    } catch (error) {
      this.emit('get-hotspot-users-failed', error);
      throw error;
    }
  }

  /**
   * Get PPPoE secrets with caching
   */
  async getPPPoESecrets(useCache = true) {
    this.ensureInitialized();

    try {
      const result = await this.client.execute('/ppp/secret/print', {}, {
        priority: 'normal',
        useCache
      });

      // Filter system-managed secrets
      const systemSecrets = result.filter(secret => {
        if (!secret.comment) return false;
        try {
          const comment = this.parseComment(secret.comment);
          return comment && comment.system === 'pppoe';
        } catch {
          return false;
        }
      });

      return systemSecrets;

    } catch (error) {
      this.emit('get-pppoe-secrets-failed', error);
      throw error;
    }
  }

  /**
   * Enhanced profile management
   */
  async syncProfiles() {
    this.ensureInitialized();

    try {
      console.log('🔄 Starting profile synchronization...');

      // Get hotspot profiles
      const hotspotProfiles = await this.client.execute('/ip/hotspot/user/profile/print', {}, {
        priority: 'normal',
        useCache: false
      });

      // Get PPPoE profiles
      const pppoeProfiles = await this.client.execute('/ppp/profile/print', {}, {
        priority: 'normal',
        useCache: false
      });

      const syncResult = {
        hotspotProfiles: hotspotProfiles.length,
        pppoeProfiles: pppoeProfiles.length,
        timestamp: new Date().toISOString()
      };

      // Log business event
      if (this.client.monitoring) {
        this.client.monitoring.recordBusinessEvent('profiles_synced', syncResult.hotspotProfiles + syncResult.pppoeProfiles);
      }

      // Log audit event
      if (this.client.auditLogger) {
        this.client.auditLogger.logSystemOperation('PROFILE_SYNC_COMPLETED', syncResult);
      }

      this.emit('profiles-synced', syncResult);
      return syncResult;

    } catch (error) {
      if (this.client.auditLogger) {
        this.client.auditLogger.logErrorEvent('PROFILE_SYNC_FAILED', {
          error: error.message
        });
      }

      this.emit('profile-sync-failed', error);
      throw error;
    }
  }

  /**
   * Get active sessions
   */
  async getActiveSessions() {
    this.ensureInitialized();

    try {
      const [hotspotActive, pppoeActive] = await Promise.all([
        this.client.execute('/ip/hotspot/active/print', {}, { priority: 'low', useCache: true }),
        this.client.execute('/ppp/active/print', {}, { priority: 'low', useCache: true })
      ]);

      return {
        hotspot: hotspotActive,
        pppoe: pppoeActive,
        total: hotspotActive.length + pppoeActive.length,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.emit('get-active-sessions-failed', error);
      throw error;
    }
  }

  /**
   * Update configuration
   */
  async updateConfig(section, updates) {
    try {
      this.config.updateSection(section, updates);
      await this.config.saveConfig();

      this.emit('config-updated', { section, updates });

      // Log audit event
      if (this.client.auditLogger) {
        this.client.auditLogger.logConfiguration('CONFIG_UPDATED', {
          section,
          updates: Object.keys(updates)
        });
      }

      return true;

    } catch (error) {
      this.emit('config-update-failed', { section, updates, error });
      throw error;
    }
  }

  /**
   * Get monitoring dashboard data
   */
  async getDashboardData() {
    if (!this.client || !this.client.monitoring) {
      return { error: 'Monitoring not available' };
    }

    try {
      const dashboard = this.client.monitoring.getDashboard();
      const status = this.getConnectionStatus();
      const health = await this.performHealthCheck();

      return {
        ...dashboard,
        connection: status,
        health: health,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.emit('dashboard-data-failed', error);
      throw error;
    }
  }

  /**
   * Search audit logs
   */
  async searchAuditLogs(criteria) {
    if (!this.client || !this.client.auditLogger) {
      return { error: 'Audit logging not available' };
    }

    try {
      return await this.client.auditLogger.search(criteria);
    } catch (error) {
      this.emit('audit-log-search-failed', error);
      throw error;
    }
  }

  /**
   * Generate audit report
   */
  async generateAuditReport(criteria) {
    if (!this.client || !this.client.auditLogger) {
      return { error: 'Audit logging not available' };
    }

    try {
      return await this.client.auditLogger.generateReport(criteria);
    } catch (error) {
      this.emit('audit-report-generation-failed', error);
      throw error;
    }
  }

  // Helper methods

  ensureInitialized() {
    if (!this.isInitialized) {
      throw new Error('Enhanced Mikrotik Service is not initialized');
    }
  }

  parseComment(comment) {
    // Support both new voucher pattern and legacy JSON
    if (!comment || typeof comment !== 'string') {
      return null;
    }

    try {
      // Check if it's using the new voucher pattern
      if (comment.startsWith('VOUCHER_SYSTEM|')) {
        const parts = comment.split('|');
        if (parts.length >= 4) {
          return {
            system: 'voucher',
            type: 'hotspot',
            price_sell: parseFloat(parts[1]) || 0,
            first_login_timestamp: parts[2] || null,
            valid_until_timestamp: parts[3] || null
          };
        }
      }

      // Try to parse as JSON (legacy support)
      return JSON.parse(comment);
    } catch {
      return {
        system: 'unknown',
        comment: comment
      };
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down Enhanced Mikrotik Service...');

    try {
      if (this.client) {
        await this.client.destroy();
      }

      this.isInitialized = false;
      console.log('✅ Enhanced Mikrotik Service shut down successfully');
      this.emit('shutdown');

    } catch (error) {
      console.error('Error during shutdown:', error);
      this.emit('shutdown-error', error);
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      uptime: this.isInitialized ? Date.now() - this.startTime : 0,
      clientAvailable: !!this.client,
      configSummary: this.config ? this.config.getSummary() : null,
      lastActivity: Date.now()
    };
  }
}

module.exports = EnhancedMikrotikService;