const crypto = require('crypto');
const SecurityConfig = require('../config/security');

class SessionManager {
  constructor(database, options = {}) {
    this.db = database;
    this.securityConfig = new SecurityConfig();
    this.options = {
      sessionTimeout: 30 * 24 * 60 * 60 * 1000, // 30 days default
      maxSessionsPerUser: 5, // Limit concurrent sessions per user
      cleanupInterval: 60 * 60 * 1000, // 1 hour cleanup interval
      ...options
    };

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanupExpiredSessions(), this.options.cleanupInterval);

    // Session cache for performance
    this.sessionCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache timeout
  }

  // Create new session with enhanced security
  async createSession(userId, request, additionalData = {}) {
    try {
      const sessionId = this.securityConfig.generateSessionId();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.options.sessionTimeout);

      // Get user IP and user agent
      const ipAddress = request.ip || request.connection.remoteAddress;
      const userAgent = request.headers['user-agent'] || 'Unknown';

      // Limit concurrent sessions per user
      await this.enforceSessionLimit(userId);

      // Create session record
      const sessionData = {
        session_token: sessionId,
        user_id: userId,
        ip_address: ipAddress,
        user_agent: userAgent,
        created_at: now,
        last_accessed: now,
        expires_at: expiresAt,
        is_active: true,
        data: JSON.stringify({
          ...additionalData,
          loginTime: now.toISOString(),
          deviceFingerprint: this.generateDeviceFingerprint(request)
        })
      };

      // Insert session into database
      const result = await this.db.query(`
        INSERT INTO user_sessions (session_token, user_id, ip_address, user_agent, created_at, last_accessed, expires_at, is_active, data)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, created_at, expires_at
      `, [
        sessionId,
        userId,
        ipAddress,
        userAgent,
        now,
        now,
        expiresAt,
        true,
        sessionData.data
      ]);

      // Cache session
      this.cacheSession(sessionId, sessionData);

      // Log session creation
      if (global.securityLogger) {
        global.securityLogger.logSession('created', {
          sessionId,
          userId,
          ipAddress,
          userAgent,
          expiresAt
        });
      }

      return {
        sessionId,
        expiresAt,
        createdAt: now
      };
    } catch (error) {
      console.error('Session creation error:', error);
      throw new Error('Failed to create session');
    }
  }

  // Validate and get session
  async validateSession(sessionId, request) {
    try {
      if (!sessionId) {
        return null;
      }

      // Check cache first
      const cachedSession = this.getCachedSession(sessionId);
      if (cachedSession && !this.isSessionExpired(cachedSession)) {
        await this.updateLastAccessed(sessionId);
        return cachedSession;
      }

      // Query database
      const result = await this.db.query(`
        SELECT s.*, u.username, u.role, u.active as user_active
        FROM user_sessions s
        JOIN admin_users u ON s.user_id = u.id
        WHERE s.session_token = $1 AND s.expires_at > NOW() AND s.is_active = true AND u.active = true
      `, [sessionId]);

      if (!result.rows || result.rows.length === 0) {
        return null;
      }

      const session = result.rows[0];

      // Additional security checks
      if (!this.validateSessionSecurity(session, request)) {
        await this.invalidateSession(sessionId, 'Security validation failed');
        return null;
      }

      // Parse session data
      if (session.data) {
        session.data = JSON.parse(session.data);
      }

      // Cache the session
      this.cacheSession(sessionId, session);

      // Update last accessed time
      await this.updateLastAccessed(sessionId);

      return session;
    } catch (error) {
      console.error('Session validation error:', error);
      return null;
    }
  }

  // Validate session security
  validateSessionSecurity(session, request) {
    const currentIP = request.ip;
    const currentUserAgent = request.headers['user-agent'];

    // IP address validation (allow some variations like mobile networks)
    if (session.ip_address && this.isSuspiciousIPChange(session.ip_address, currentIP)) {
      if (global.securityLogger) {
        global.securityLogger.logSecurity('suspicious_ip_change', {
          sessionId: session.session_token,
          userId: session.user_id,
          originalIP: session.ip_address,
          newIP: currentIP,
          userAgent: currentUserAgent
        });
      }
      return false;
    }

    // User Agent validation (major changes only)
    if (session.user_agent && this.isSuspiciousUserAgentChange(session.user_agent, currentUserAgent)) {
      if (global.securityLogger) {
        global.securityLogger.logSecurity('suspicious_ua_change', {
          sessionId: session.session_token,
          userId: session.user_id,
          originalUA: session.user_agent,
          newUA: currentUserAgent
        });
      }
      return false;
    }

    return true;
  }

  // Check for suspicious IP changes
  isSuspiciousIPChange(originalIP, newIP) {
    // Allow same IP
    if (originalIP === newIP) return false;

    // Allow localhost variations
    if ((originalIP.includes('127.0.0.1') || originalIP.includes('localhost')) &&
        (newIP.includes('127.0.0.1') || newIP.includes('localhost'))) {
      return false;
    }

    // Allow private network variations
    const isPrivateIP = (ip) => {
      return ip.startsWith('192.168.') || ip.startsWith('10.') ||
             ip.startsWith('172.') || ip.includes('localhost');
    };

    if (isPrivateIP(originalIP) && isPrivateIP(newIP)) {
      return false;
    }

    // Otherwise, consider it suspicious
    return true;
  }

  // Check for suspicious user agent changes
  isSuspiciousUserAgentChange(originalUA, newUA) {
    if (!originalUA || !newUA) return true;

    // Extract browser/engine information
    const getBrowserSignature = (ua) => {
      const match = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/);
      return match ? match[1] : 'Unknown';
    };

    const originalBrowser = getBrowserSignature(originalUA);
    const newBrowser = getBrowserSignature(newUA);

    return originalBrowser !== newBrowser && originalBrowser !== 'Unknown' && newBrowser !== 'Unknown';
  }

  // Update session last accessed time
  async updateLastAccessed(sessionId) {
    try {
      await this.db.query(`
        UPDATE user_sessions
        SET last_accessed = NOW()
        WHERE session_token = $1
      `, [sessionId]);

      // Update cache
      const cached = this.getCachedSession(sessionId);
      if (cached) {
        cached.last_accessed = new Date();
      }
    } catch (error) {
      console.error('Error updating last accessed:', error);
    }
  }

  // Invalidate session
  async invalidateSession(sessionId, reason = 'Logout') {
    try {
      await this.db.query(`
        UPDATE user_sessions
        SET is_active = false, data = data || $2
        WHERE session_token = $1
      `, [sessionId, JSON.stringify({ invalidatedAt: new Date(), reason })]);

      // Remove from cache
      this.removeCachedSession(sessionId);

      // Log session invalidation
      if (global.securityLogger) {
        global.securityLogger.logSession('invalidated', {
          sessionId,
          reason
        });
      }
    } catch (error) {
      console.error('Error invalidating session:', error);
    }
  }

  // Invalidate all sessions for a user
  async invalidateAllUserSessions(userId, exceptSessionId = null) {
    try {
      const query = exceptSessionId
        ? `UPDATE user_sessions SET is_active = false WHERE user_id = $1 AND session_token != $2`
        : `UPDATE user_sessions SET is_active = false WHERE user_id = $1`;

      const params = exceptSessionId ? [userId, exceptSessionId] : [userId];

      await this.db.query(query, params);

      // Clear cache for user sessions
      for (const [sessionId] of this.sessionCache.entries()) {
        const session = this.sessionCache.get(sessionId);
        if (session && session.user_id === userId) {
          this.removeCachedSession(sessionId);
        }
      }

      if (global.securityLogger) {
        global.securityLogger.logSession('all_invalidated', {
          userId,
          exceptSessionId
        });
      }
    } catch (error) {
      console.error('Error invalidating user sessions:', error);
    }
  }

  // Enforce session limit per user
  async enforceSessionLimit(userId) {
    try {
      const result = await this.db.query(`
        SELECT COUNT(*) as active_sessions
        FROM user_sessions
        WHERE user_id = $1 AND is_active = true AND expires_at > NOW()
      `, [userId]);

      const activeSessions = parseInt(result.rows[0].active_sessions);

      if (activeSessions >= this.options.maxSessionsPerUser) {
        // Invalidate oldest sessions
        await this.db.query(`
          UPDATE user_sessions
          SET is_active = false
          WHERE user_id = $1 AND is_active = true
          ORDER BY last_accessed ASC
          LIMIT $2
        `, [userId, activeSessions - this.options.maxSessionsPerUser + 1]);
      }
    } catch (error) {
      console.error('Error enforcing session limit:', error);
    }
  }

  // Generate device fingerprint
  generateDeviceFingerprint(request) {
    const userAgent = request.headers['user-agent'] || '';
    const acceptLanguage = request.headers['accept-language'] || '';
    const acceptEncoding = request.headers['accept-encoding'] || '';

    const fingerprint = crypto.createHash('sha256')
      .update(userAgent + acceptLanguage + acceptEncoding)
      .digest('hex')
      .substring(0, 16);

    return fingerprint;
  }

  // Cache operations
  cacheSession(sessionId, sessionData) {
    this.sessionCache.set(sessionId, {
      ...sessionData,
      cachedAt: Date.now()
    });
  }

  getCachedSession(sessionId) {
    const cached = this.sessionCache.get(sessionId);
    if (!cached) return null;

    // Check if cache is expired
    if (Date.now() - cached.cachedAt > this.cacheTimeout) {
      this.sessionCache.delete(sessionId);
      return null;
    }

    return cached;
  }

  removeCachedSession(sessionId) {
    this.sessionCache.delete(sessionId);
  }

  // Check if session is expired
  isSessionExpired(session) {
    return new Date() > new Date(session.expires_at);
  }

  // Cleanup expired sessions
  async cleanupExpiredSessions() {
    try {
      const result = await this.db.query(`
        DELETE FROM user_sessions
        WHERE expires_at < NOW() OR is_active = false
      `);

      if (result.rowCount > 0) {
        console.log(`Cleaned up ${result.rowCount} expired sessions`);
      }

      // Clean cache
      const now = Date.now();
      for (const [sessionId, cached] of this.sessionCache.entries()) {
        if (now - cached.cachedAt > this.cacheTimeout || this.isSessionExpired(cached)) {
          this.sessionCache.delete(sessionId);
        }
      }
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
    }
  }

  // Get active sessions for user
  async getUserSessions(userId) {
    try {
      const result = await this.db.query(`
        SELECT session_token, ip_address, user_agent, created_at, last_accessed, expires_at
        FROM user_sessions
        WHERE user_id = $1 AND is_active = true AND expires_at > NOW()
        ORDER BY last_accessed DESC
      `, [userId]);

      return result.rows || [];
    } catch (error) {
      console.error('Error getting user sessions:', error);
      return [];
    }
  }

  // Get session statistics
  async getSessionStatistics() {
    try {
      const result = await this.db.query(`
        SELECT
          COUNT(*) as total_sessions,
          COUNT(CASE WHEN is_active = true AND expires_at > NOW() THEN 1 END) as active_sessions,
          COUNT(DISTINCT user_id) as unique_users
        FROM user_sessions
      `);

      return result.rows[0] || {};
    } catch (error) {
      console.error('Error getting session statistics:', error);
      return {};
    }
  }

  // Graceful shutdown
  async shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.sessionCache.clear();
  }
}

module.exports = SessionManager;