const crypto = require('crypto');
const SecurityConfig = require('../config/security');

class RateLimitMiddleware {
  constructor() {
    this.securityConfig = new SecurityConfig();
    this.clients = new Map(); // Store rate limit data per client
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000); // Cleanup every minute
  }

  // Generic rate limiting middleware
  rateLimit(options = {}) {
    const {
      windowMs = 60 * 1000, // 1 minute default
      max = 100, // 100 requests per window default
      message = 'Too many requests, please try again later.',
      keyGenerator = (req) => req.ip,
      skipSuccessfulRequests = false,
      skipFailedRequests = false
    } = options;

    return async (request, reply) => {
      const key = keyGenerator(request);
      const now = Date.now();
      const windowStart = now - windowMs;

      // Get or create client data
      let clientData = this.clients.get(key);
      if (!clientData) {
        clientData = {
          requests: [],
          totalRequests: 0
        };
        this.clients.set(key, clientData);
      }

      // Clean old requests outside the window
      clientData.requests = clientData.requests.filter(timestamp => timestamp > windowStart);

      // Check if rate limit exceeded
      if (clientData.requests.length >= max) {
        const resetTime = Math.max(...clientData.requests) + windowMs;

        // Log rate limit violation if security logger is available
        if (global.securityLogger) {
          global.securityLogger.logRateLimit({
            ip: request.ip,
            endpoint: request.url,
            userAgent: request.headers['user-agent'],
            limit: max,
            windowMs,
            currentCount: clientData.requests.length,
            resetTime
          });
        }

        return reply.code(429).send({
          success: false,
          message,
          retryAfter: Math.ceil((resetTime - now) / 1000)
        });
      }

      // Add current request timestamp
      clientData.requests.push(now);
      clientData.totalRequests++;

      // Add rate limit headers
      reply.header('X-RateLimit-Limit', max);
      reply.header('X-RateLimit-Remaining', Math.max(0, max - clientData.requests.length));
      reply.header('X-RateLimit-Reset', Math.ceil((clientData.requests[0] + windowMs) / 1000));
    };
  }

  // Login-specific rate limiting with progressive delays
  loginRateLimit() {
    return async (request, reply) => {
      const ip = request.ip;
      const now = Date.now();
      const key = `login:${ip}`;

      let clientData = this.clients.get(key);
      if (!clientData) {
        clientData = {
          attempts: [],
          lockoutUntil: 0,
          progressiveDelay: 0
        };
        this.clients.set(key, clientData);
      }

      // Check if IP is locked out
      if (now < clientData.lockoutUntil) {
        const remainingTime = Math.ceil((clientData.lockoutUntil - now) / 1000);

        if (global.securityLogger) {
          global.securityLogger.logAuthentication('login_locked_out', {
            ip: request.ip,
            username: request.body?.username || 'unknown',
            success: false,
            userAgent: request.headers['user-agent'],
            method: 'password',
            failureReason: 'ip_locked_out',
            lockoutDuration: remainingTime
          });
        }

        return reply.code(429).send({
          success: false,
          message: `Account temporarily locked due to too many failed attempts. Try again in ${remainingTime} seconds.`
        });
      }

      // Clean old attempts (older than 15 minutes)
      const fifteenMinutesAgo = now - 15 * 60 * 1000;
      clientData.attempts = clientData.attempts.filter(timestamp => timestamp > fifteenMinutesAgo);

      // Progressive delays: 5 attempts -> 1 min, 10 attempts -> 5 min, 15+ attempts -> 15 min
      const attemptCount = clientData.attempts.length;
      let lockoutDuration = 0;

      if (attemptCount >= 15) {
        lockoutDuration = 15 * 60 * 1000; // 15 minutes
      } else if (attemptCount >= 10) {
        lockoutDuration = 5 * 60 * 1000; // 5 minutes
      } else if (attemptCount >= 5) {
        lockoutDuration = 1 * 60 * 1000; // 1 minute
      }

      if (lockoutDuration > 0) {
        clientData.lockoutUntil = now + lockoutDuration;

        if (global.securityLogger) {
          global.securityLogger.logAuthentication('login_progressive_lockout', {
            ip: request.ip,
            username: request.body?.username || 'unknown',
            success: false,
            userAgent: request.headers['user-agent'],
            method: 'password',
            failureReason: 'progressive_lockout',
            attemptCount,
            lockoutDuration: lockoutDuration / 1000
          });
        }

        return reply.code(429).send({
          success: false,
          message: `Too many failed login attempts. Account locked for ${lockoutDuration / 60 / 1000} minutes.`
        });
      }
    };
  }

  // API-specific rate limiting
  apiRateLimit() {
    return this.rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 100, // 100 requests per minute
      message: 'API rate limit exceeded',
      keyGenerator: (req) => {
        // Use API key if available, otherwise IP
        return req.headers['x-api-key'] || req.ip;
      }
    });
  }

  // Admin-specific rate limiting (more restrictive)
  adminRateLimit() {
    return this.rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 50, // 50 requests per minute
      message: 'Admin rate limit exceeded',
      keyGenerator: (req) => {
        // Use admin ID if authenticated, otherwise IP
        return req.admin ? `admin:${req.admin.id}` : req.ip;
      }
    });
  }

  // File upload rate limiting
  uploadRateLimit() {
    return this.rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 10, // 10 uploads per minute
      message: 'Upload rate limit exceeded'
    });
  }

  // Password reset rate limiting
  passwordResetRateLimit() {
    return this.rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 3, // 3 password reset requests per hour
      message: 'Password reset rate limit exceeded. Please try again later.',
      keyGenerator: (req) => req.body?.email || req.ip
    });
  }

  // Clean up old entries to prevent memory leaks
  cleanup() {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    for (const [key, data] of this.clients.entries()) {
      if (data.requests && data.requests.length > 0) {
        // Remove old requests
        data.requests = data.requests.filter(timestamp => timestamp > oneHourAgo);

        // Remove client data if no recent requests
        if (data.requests.length === 0 && (!data.lockoutUntil || data.lockoutUntil < now)) {
          this.clients.delete(key);
        }
      }
    }
  }

  // Get rate limit status for a client
  getRateLimitStatus(key, options = {}) {
    const { windowMs = 60 * 1000 } = options;
    const now = Date.now();
    const windowStart = now - windowMs;

    const clientData = this.clients.get(key);
    if (!clientData) {
      return {
        limit: options.max || 100,
        remaining: options.max || 100,
        reset: now + windowMs
      };
    }

    const recentRequests = clientData.requests.filter(timestamp => timestamp > windowStart);
    const limit = options.max || 100;
    const remaining = Math.max(0, limit - recentRequests.length);
    const reset = recentRequests.length > 0 ? Math.max(...recentRequests) + windowMs : now + windowMs;

    return {
      limit,
      remaining,
      reset
    };
  }

  // Clear rate limit data for a client (admin use)
  clearRateLimit(key) {
    this.clients.delete(key);
  }

  // Get statistics (admin use)
  getStatistics() {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    let totalClients = 0;
    let activeClients = 0;
    let totalRequests = 0;

    for (const [key, data] of this.clients.entries()) {
      totalClients++;
      totalRequests += data.totalRequests || 0;

      const recentRequests = data.requests ?
        data.requests.filter(timestamp => timestamp > oneHourAgo) : [];

      if (recentRequests.length > 0) {
        activeClients++;
      }
    }

    return {
      totalClients,
      activeClients,
      totalRequests,
      memoryUsage: process.memoryUsage()
    };
  }

  // Graceful shutdown
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

module.exports = RateLimitMiddleware;