const rateLimit = require('@fastify/rate-limit');

/**
 * Rate limiting configuration for HIJINETWORK system
 * DISABLED - Rate limiting removed per user request
 */
class RateLimitConfig {
  constructor(fastify) {
    this.fastify = fastify;
    // Rate limiting has been disabled
  }

  setupRateLimiting() {
    // No rate limiting setup - disabled per user request
    console.log('Rate limiting has been disabled');
  }
}

/**
 * DDoS Protection Middleware
 * DISABLED - DDoS protection removed per user request
 */
class DDoSProtection {
  constructor() {
    // DDoS protection has been disabled
  }

  middleware() {
    // No DDoS protection - disabled per user request
    return async (request, reply) => {
      // Continue to next middleware
      return;
    };
  }

  /**
   * Clean up old data periodically
   */
  cleanup() {
    // No cleanup needed - protection disabled
  }
}

/**
 * Security Headers Middleware
 * Implements secure HTTP headers
 */
class SecurityHeaders {
  constructor() {
    this.cspDirectives = {
      'default-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdn.tailwindcss.com"],
      'script-src': ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdn.tailwindcss.com"],
      'img-src': ["'self'", "data:", "https:"],
      'font-src': ["'self'", "https://cdn.jsdelivr.net", "https://fonts.gstatic.com"],
      'connect-src': ["'self'", "ws:", "wss:"],
      'frame-src': ["'none'"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'none'"]
    };
  }

  /**
   * Security headers middleware function
   */
  middleware() {
    return async (request, reply) => {
      // Basic security headers
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Frame-Options', 'DENY');
      reply.header('X-XSS-Protection', '1; mode=block');
      reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
      reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

      // Remove server information
      reply.header('Server', 'HIJINETWORK');
      reply.removeHeader('X-Powered-By');

      // Content Security Policy
      const cspHeader = Object.entries(this.cspDirectives)
        .map(([key, values]) => `${key} ${values.join(' ')}`)
        .join('; ');
      reply.header('Content-Security-Policy', cspHeader);

      // HSTS in production
      if (process.env.NODE_ENV === 'production') {
        reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      }
    };
  }
}

module.exports = {
  RateLimitConfig,
  DDoSProtection,
  SecurityHeaders
};