const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const SecurityConfig = require('../config/security');

class AuthMiddleware {
  constructor(fastify) {
    this.fastify = fastify;
    this.securityConfig = new SecurityConfig();
    this.JWT_SECRET = this.securityConfig.JWT_SECRET;
    this.loginAttempts = new Map(); // Track login attempts per IP
  }

  // Check rate limiting for login attempts
  checkLoginRateLimit(ip) {
    const now = Date.now();
    const attempts = this.loginAttempts.get(ip) || { count: 0, resetTime: now + 15 * 60 * 1000 };

    if (now > attempts.resetTime) {
      // Reset attempts after 15 minutes
      attempts.count = 0;
      attempts.resetTime = now + 15 * 60 * 1000;
    }

    if (attempts.count >= 5) {
      return { allowed: false, resetTime: attempts.resetTime };
    }

    attempts.count++;
    this.loginAttempts.set(ip, attempts);
    return { allowed: true, remainingAttempts: 5 - attempts.count };
  }

  // Verify JWT token with enhanced security
  async verifyToken(request, reply) {
    try {
      const token = request.cookies.token || request.headers.authorization?.split(' ')[1];

      if (!token) {
        if (global.securityLogger) {
          global.securityLogger.logAuthentication('token_missing', {
            ip: request.ip,
            username: 'unknown',
            success: false,
            userAgent: request.headers['user-agent'],
            method: 'token',
            failureReason: 'no_token_provided'
          });
        }
        return reply.redirect('/login');
      }

      // Verify token with additional security checks
      const decoded = jwt.verify(token, this.JWT_SECRET, { algorithms: ['HS256'] });
      let admin = null;
      try {
        // Use improved queryOne method for better error handling
        admin = await this.fastify.db.queryOne('SELECT id, username, role FROM admin_users WHERE id = $1', [decoded.id]);
      } catch (dbError) {
        console.error('Database error in verifyToken:', dbError);

        // Check if it's a connection error
        if (this.isDatabaseConnectionError(dbError)) {
          console.warn('Database connection error during token verification, retrying...');
          try {
            // Retry once after potential reconnection
            await new Promise(resolve => setTimeout(resolve, 1000));
            admin = await this.fastify.db.queryOne('SELECT id, username, role FROM admin_users WHERE id = $1', [decoded.id]);
          } catch (retryError) {
            console.error('Database retry failed in verifyToken:', retryError);
            return reply.redirect('/login?error=db_connection');
          }
        } else {
          console.error('Database query error in verifyToken:', dbError);
          return reply.redirect('/login?error=database_error');
        }
      }

      if (!admin) {
        if (global.securityLogger) {
          global.securityLogger.logAuthentication('invalid_token', {
            ip: request.ip,
            username: decoded.username || 'unknown',
            success: false,
            userAgent: request.headers['user-agent'],
            method: 'token',
            failureReason: 'admin_not_found'
          });
        }
        return reply.redirect('/login');
      }

      request.admin = admin;
    } catch (error) {
      if (global.securityLogger) {
        global.securityLogger.logAuthentication('token_verification_failed', {
          ip: request.ip,
          username: 'unknown',
          success: false,
          userAgent: request.headers['user-agent'],
          method: 'token',
          failureReason: error.name
        });
      }
      return reply.redirect('/login');
    }
  }

  // Verify JWT token for API endpoints (returns error instead of redirect)
  async verifyTokenAPI(request, reply) {
    try {
      // First try to get JWT token
      let token = request.cookies.token || request.headers.authorization?.split(' ')[1];

      // If no JWT token, try sessionId
      if (!token) {
        const sessionId = request.cookies.sessionId;
        if (sessionId) {
          // Look up session in database
          let session = null;
          try {
            session = await this.fastify.db.queryOne('SELECT * FROM user_sessions WHERE session_token = $1 AND expires_at > NOW()', [sessionId]);
          } catch (dbError) {
            console.error('Database error in sessionId lookup:', dbError);
            // Don't fail API request on session lookup error, continue to JWT check
          }

          if (session) {
            // Get admin from session
            try {
              const admin = await this.fastify.db.queryOne('SELECT id, username, role FROM admin_users WHERE id = $1', [session.user_id]);
              if (admin) {
                request.admin = admin;
                return;
              }
            } catch (dbError) {
              console.error('Database error getting admin from session:', dbError);
              // Continue to JWT authentication
            }
          }
        }

        // No valid authentication found
        if (global.securityLogger) {
          global.securityLogger.logAuthentication('api_token_missing', {
            ip: request.ip,
            username: 'unknown',
            success: false,
            userAgent: request.headers['user-agent'],
            method: 'api_token',
            failureReason: 'no_token_provided'
          });
        }
        return reply.code(401).send({ success: false, message: 'Authentication required' });
      }

      // JWT token authentication
      const decoded = jwt.verify(token, this.JWT_SECRET);
      let admin = null;
      try {
        admin = await this.fastify.db.queryOne('SELECT id, username, role FROM admin_users WHERE id = $1', [decoded.id]);
      } catch (dbError) {
        console.error('Database error in verifyTokenAPI:', dbError);

        // Check if it's a connection error and retry once
        if (this.isDatabaseConnectionError(dbError)) {
          try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            admin = await this.fastify.db.queryOne('SELECT id, username, role FROM admin_users WHERE id = $1', [decoded.id]);
          } catch (retryError) {
            console.error('Database retry failed in verifyTokenAPI:', retryError);
          }
        }

        if (!admin) {
          return reply.code(503).send({ success: false, message: 'Database connection error' });
        }
      }

      if (!admin) {
        if (global.securityLogger) {
          global.securityLogger.logAuthentication('api_invalid_token', {
            ip: request.ip,
            username: decoded.username || 'unknown',
            success: false,
            userAgent: request.headers['user-agent'],
            method: 'api_token',
            failureReason: 'admin_not_found'
          });
        }
        return reply.code(401).send({ success: false, message: 'Invalid authentication' });
      }

      request.admin = admin;
    } catch (error) {
      if (global.securityLogger) {
        global.securityLogger.logAuthentication('api_token_verification_failed', {
          ip: request.ip,
          username: 'unknown',
          success: false,
          userAgent: request.headers['user-agent'],
          method: 'api_token',
          failureReason: error.name
        });
      }
      return reply.code(401).send({ success: false, message: 'Invalid or expired token' });
    }
  }

  // Check admin role
  requireRole(role) {
    return async (request, reply) => {
      // First verify token
      if (!request.admin) {
        return reply.redirect('/login');
      }

      // Then check role
      if (role === 'super_admin' && request.admin.role !== 'super_admin') {
        return reply.code(403).send('Access denied');
      }

      if (role === 'admin' && !['super_admin', 'admin'].includes(request.admin.role)) {
        return reply.code(403).send('Access denied');
      }
    };
  }

  // Check admin role for API endpoints (returns JSON instead of redirect)
  requireRoleAPI(role) {
    return async (request, reply) => {
      // First verify token
      if (!request.admin) {
        return reply.code(401).send({ success: false, message: 'Authentication required' });
      }

      // Then check role
      if (role === 'super_admin' && request.admin.role !== 'super_admin') {
        return reply.code(403).send({ success: false, message: 'Access denied - Super admin required' });
      }

      if (role === 'admin' && !['super_admin', 'admin'].includes(request.admin.role)) {
        return reply.code(403).send({ success: false, message: 'Access denied - Admin role required' });
      }

      // If we get here, role check passed - return to continue to the handler
      return;
    };
  }

  // Check specific permission
  requirePermission(permission) {
    return async (request, reply) => {
      if (!request.admin) {
        return reply.redirect('/login');
      }

      if (request.admin.role === 'super_admin') {
        return;
      }

      const permissions = JSON.parse(request.admin.permissions || '{}');
      if (!permissions[permission] && !permissions.all) {
        return reply.code(403).send('Permission denied');
      }
    };
  }

  // Check if error is a database connection error
  isDatabaseConnectionError(error) {
    const connectionErrorPatterns = [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'XX000',
      'connection terminated',
      'db_termination',
      'connection closed',
      'timeout',
      'pool is full',
      'acquire connection',
      'KnexTimeoutError',
      'connection acquiring timeout'
    ];

    return connectionErrorPatterns.some(pattern =>
      error.code === pattern ||
      error.name === pattern ||
      error.message.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  // Log admin activity
  async logActivity(adminId, action, targetType = null, targetId = null, details = null, request = null) {
    try {
      await this.fastify.query(`
        INSERT INTO activity_logs (user_id, action, details, ip_address)
        VALUES (?, ?, ?, ?)
      `, [
        adminId,
        action,
        typeof details === 'object' ? JSON.stringify(details) : details,
        request?.ip
      ]);
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  }

  // Generate secure JWT token with additional security features
  generateToken(admin) {
    const payload = {
      id: admin.id,
      username: admin.username,
      role: admin.role,
      iat: Math.floor(Date.now() / 1000),
      jti: this.securityConfig.generateSecureToken(16) // JWT ID for token revocation
    };

    return jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: '30d',
      algorithm: 'HS256',
      issuer: 'mikrotik-billing',
      audience: 'mikrotik-billing-users'
    });
  }

  // Generate secure session ID
  generateSessionId() {
    return this.securityConfig.generateSessionId();
  }

  // Hash password
  async hashPassword(password) {
    return await bcrypt.hash(password, 10);
  }

  // Verify password - handles both hashed and plain text passwords
  async verifyPassword(password, hash) {
    try {
      // Try bcrypt comparison first (for hashed passwords)
      return await bcrypt.compare(password, hash);
    } catch (error) {
      // If bcrypt fails, try direct string comparison (for plain text passwords)
      console.warn('Password comparison failed, trying plain text comparison');
      return password === hash;
    }
  }

  // Enhanced login handler with rate limiting and security
  async login(request, reply) {
    const { username, password } = request.body;

    // Input validation and sanitization
    if (!username || !password) {
      return reply.view('auth/login', {
        error: 'Username and password are required',
        username: ''
      });
    }

    // Sanitize input
    const sanitizedUsername = this.securityConfig.sanitizeInput(username.trim());

    // Check rate limiting
    const rateLimitCheck = this.checkLoginRateLimit(request.ip);
    if (!rateLimitCheck.allowed) {
      const resetTime = new Date(rateLimitCheck.resetTime).toLocaleTimeString();
      return reply.view('auth/login', {
        error: `Too many login attempts. Please try again after ${resetTime}.`,
        username: sanitizedUsername
      });
    }

    try {
      let admin = null;
      try {
        // Use enhanced database helper for better error handling and compatibility
        const { AuthHelper, DatabaseErrorHelper } = require('../database/helpers');

        // Try to find admin using helper
        admin = await AuthHelper.findAdminByUsername(sanitizedUsername);

        // Check if admin is active
        if (admin && !admin.is_active) {
          admin = null;
        }

        // Log database activity for debugging
        if (process.env.DEBUG && process.env.LOG_LEVEL === 'debug') {
          console.debug('Login attempt:', {
            username: sanitizedUsername,
            adminFound: !!admin,
            isActive: admin?.is_active,
            databaseType: this.fastify.db.dbType
          });
        }
      } catch (dbError) {
        console.error('Database error in login:', dbError);

        // Use enhanced error handling
        const errorMessage = DatabaseErrorHelper.getErrorMessage(dbError);
        DatabaseErrorHelper.logError(dbError, {
          action: 'login',
          username: sanitizedUsername,
          ip: request.ip
        });

        return reply.view('auth/login', {
          error: errorMessage,
          username: sanitizedUsername
        });
      }

      // Use AuthHelper for password verification (more efficient with admin object)
      const { AuthHelper } = require('../database/helpers');

      if (!admin || !await AuthHelper.verifyAdminPasswordWithObject(admin, password)) {
        // Log failed authentication attempt
        if (global.securityLogger) {
          global.securityLogger.logAuthentication('failed_login', {
            ip: request.ip,
            username: username,
            success: false,
            userAgent: request.headers['user-agent'],
            method: 'password',
            failureReason: admin ? 'invalid_password' : 'user_not_found'
          });
        }

        return reply.view('auth/login', {
          error: 'Invalid username or password',
          username
        });
      }

      // Update last login with retry logic
      try {
        await this.fastify.db.query('UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [admin.id]);
      } catch (dbError) {
        console.error('Error updating last login:', dbError);
        // Continue anyway - login is more important than updating timestamp
      }

      // Generate sessionId and store it
      const sessionId = this.generateSessionId();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now

      // Store session in database with error handling
      try {
        await this.fastify.db.query(`
          INSERT INTO user_sessions (user_id, session_token, ip_address, user_agent, expires_at)
          VALUES ($1, $2, $3, $4, $5)
        `, [admin.id, sessionId, request.ip, request.headers['user-agent'], expiresAt]);
      } catch (dbError) {
        console.error('Error storing session:', dbError);
        // Continue anyway - JWT token is primary, session is secondary
      }

      // Generate JWT token
      const token = this.generateToken(admin);

      // Set both cookies
      reply.setCookie('sessionId', sessionId, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
        secure: process.env.NODE_ENV === 'production'
      });

      reply.setCookie('token', token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
        secure: process.env.NODE_ENV === 'production'
      });

      // Log successful authentication
      if (global.securityLogger) {
        global.securityLogger.logAuthentication('successful_login', {
          ip: request.ip,
          username: username,
          success: true,
          userAgent: request.headers['user-agent'],
          method: 'password',
          sessionId: sessionId
        });
      }

      // Log activity (non-critical, so don't fail on error)
      try {
        await this.logActivity(admin.id, 'login', null, null, null, request);
      } catch (activityError) {
        console.error('Error logging activity:', activityError);
        // Continue anyway - login is successful
      }

      return reply.redirect('/dashboard');
    } catch (error) {
      this.fastify.log.error('Login error:', error);

      // Check if it's a database-related error
      if (this.isDatabaseConnectionError(error)) {
        return reply.view('auth/login', {
          error: 'Database connection issue. Please try again.',
          username
        });
      }

      return reply.view('auth/login', {
        error: 'Login failed. Please try again.',
        username
      });
    }
  }

  // Logout handler
  async logout(request, reply) {
    if (request.admin) {
      // Log successful logout
      if (global.securityLogger) {
        global.securityLogger.logAuthentication('successful_logout', {
          ip: request.ip,
          username: request.admin.username,
          success: true,
          userAgent: request.headers['user-agent'],
          method: 'logout'
        });
      }

      await this.logActivity(request.admin.id, 'logout', null, null, null, request);
    }

    // Clear both cookies properly with Fastify
      reply.clearCookie('token', {
        path: '/',
        httpOnly: true,
        sameSite: 'lax'
      });
      reply.clearCookie('sessionId', {
        path: '/',
        httpOnly: true,
        sameSite: 'lax'
      });
    return reply.redirect('/login');
  }
}

module.exports = AuthMiddleware;