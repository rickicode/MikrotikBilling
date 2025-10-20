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
        const adminRows = await this.fastify.db.query('SELECT id, username, role FROM admin_users WHERE id = $1', [decoded.id]);
        admin = adminRows.rows && adminRows.rows.length > 0 ? adminRows.rows[0] : null;
      } catch (dbError) {
        console.error('Database error in verifyToken:', dbError);
        return reply.redirect('/login');
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
            const sessionRows = await this.fastify.db.query('SELECT * FROM user_sessions WHERE session_token = $1 AND expires_at > NOW()', [sessionId]);
            session = sessionRows.rows && sessionRows.rows.length > 0 ? sessionRows.rows[0] : null;
          } catch (dbError) {
            console.error('Database error in sessionId lookup:', dbError);
          }
          if (session) {
            // Get admin from session
            let admin = null;
            try {
              const adminRows = await this.fastify.db.query('SELECT id, username, role FROM admin_users WHERE id = $1', [session.user_id]);
              admin = adminRows.rows && adminRows.rows.length > 0 ? adminRows.rows[0] : null;
            } catch (dbError) {
              console.error('Database error getting admin from session:', dbError);
            }
            if (admin) {
              request.admin = admin;
              return;
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
        const adminRows = await this.fastify.db.query('SELECT id, username, role FROM admin_users WHERE id = $1', [decoded.id]);
        admin = adminRows.rows && adminRows.rows.length > 0 ? adminRows.rows[0] : null;
      } catch (dbError) {
        console.error('Database error in verifyToken:', dbError);
        return reply.redirect('/login');
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

  // Log admin activity
  async logActivity(adminId, action, targetType = null, targetId = null, details = null, request = null) {
    try {
      await this.fastify.db.query(`
        INSERT INTO activity_logs (user_id, action, details, ip_address)
        VALUES ($1, $2, $3, $4)
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

  // Verify password
  async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
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
        // Use parameterized query to prevent SQL injection
        const adminResult = await this.fastify.db.query(
          'SELECT * FROM admin_users WHERE username = $1 AND is_active = true',
          [sanitizedUsername]
        );
        admin = adminResult.rows && adminResult.rows.length > 0 ? adminResult.rows[0] : null;
      } catch (dbError) {
        console.error('Database error in login:', dbError);
        return reply.view('auth/login', {
          error: 'Database error. Please try again.',
          username: sanitizedUsername
        });
      }

      if (!admin || !await this.verifyPassword(password, admin.password_hash)) {
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

      // Update last login
      try {
        await this.fastify.db.query('UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [admin.id]);
      } catch (dbError) {
        console.error('Error updating last login:', dbError);
        // Continue anyway - login is more important
      }

      // Generate sessionId and store it
      const sessionId = this.generateSessionId();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now

      // Store session in database
      try {
        await this.fastify.db.query(`
          INSERT INTO user_sessions (user_id, session_token, ip_address, user_agent, expires_at)
          VALUES ($1, $2, $3, $4, $5)
        `, [admin.id, sessionId, request.ip, request.headers['user-agent'], expiresAt]);
      } catch (dbError) {
        console.error('Error storing session:', dbError);
        // Continue anyway - session storage is secondary to JWT
      }

      // Generate JWT token as backup
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

      // Log activity
      await this.logActivity(admin.id, 'login', null, null, null, request);

      return reply.redirect('/dashboard');
    } catch (error) {
      this.fastify.log.error(error);
      return reply.view('auth/login', {
        error: 'Login failed',
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