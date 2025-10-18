const SecurityConfig = require('../config/security');

class SecurityHeadersMiddleware {
  constructor() {
    this.securityConfig = new SecurityConfig();
  }

  // Comprehensive security headers middleware
  securityHeaders() {
    return async (request, reply) => {
      const securityConfig = this.securityConfig.getSecurityHeaders();

      // Content Security Policy
      if (securityConfig.contentSecurityPolicy) {
        const csp = this.buildCSP(securityConfig.contentSecurityPolicy.directives);
        reply.header('Content-Security-Policy', csp);
      }

      // Strict Transport Security (HTTPS only)
      if (process.env.NODE_ENV === 'production' && securityConfig.strictTransportSecurity) {
        const sts = [
          `max-age=${securityConfig.strictTransportSecurity.maxAge}`,
          securityConfig.strictTransportSecurity.includeSubDomains ? 'includeSubDomains' : '',
          securityConfig.strictTransportSecurity.preload ? 'preload' : ''
        ].filter(Boolean).join('; ');
        reply.header('Strict-Transport-Security', sts);
      }

      // X-Frame-Options
      reply.header('X-Frame-Options', 'DENY');

      // X-Content-Type-Options
      reply.header('X-Content-Type-Options', 'nosniff');

      // X-XSS-Protection
      reply.header('X-XSS-Protection', '1; mode=block');

      // Referrer-Policy
      reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');

      // Permissions-Policy
      reply.header('Permissions-Policy', this.buildPermissionsPolicy());

      // X-Permitted-Cross-Domain-Policies
      reply.header('X-Permitted-Cross-Domain-Policies', 'none');

      // Cache-Control for sensitive pages
      if (this.isSensitivePath(request.url)) {
        reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        reply.header('Pragma', 'no-cache');
        reply.header('Expires', '0');
        reply.header('Surrogate-Control', 'no-store');
      }

      // Remove server header
      reply.removeHeader('Server');

      // Add security-related cookies attributes
      reply.header('Set-Cookie', this.buildCookieAttributes());

      // Content-Type for JSON responses
      if (request.url.startsWith('/api/') && !reply.getHeader('Content-Type')) {
        reply.type('application/json');
      }
    };
  }

  // Build Content Security Policy string
  buildCSP(directives) {
    const cspDirectives = [];

    for (const [directive, values] of Object.entries(directives)) {
      if (Array.isArray(values)) {
        cspDirectives.push(`${directive} ${values.join(' ')}`);
      } else if (typeof values === 'string') {
        cspDirectives.push(`${directive} ${values}`);
      }
    }

    return cspDirectives.join('; ');
  }

  // Build Permissions Policy string
  buildPermissionsPolicy() {
    const permissions = [
      'geolocation=()',
      'microphone=()',
      'camera=()',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'gyroscope=()',
      'accelerometer=()',
      'ambient-light-sensor=()',
      'autoplay=()',
      'encrypted-media=()',
      'fullscreen=()',
      'picture-in-picture=()',
      'publickey-credentials-get=()',
      'screen-wake-lock=()',
      'web-share=()',
      'xr-spatial-tracking=()'
    ];

    return permissions.join(', ');
  }

  // Check if path is sensitive and should not be cached
  isSensitivePath(url) {
    const sensitivePaths = [
      '/login',
      '/admin',
      '/dashboard',
      '/api/admin',
      '/settings',
      '/profile',
      '/logout'
    ];

    return sensitivePaths.some(path => url.startsWith(path));
  }

  // Build secure cookie attributes
  buildCookieAttributes() {
    const sessionConfig = this.securityConfig.getSessionConfig();
    const attributes = [
      sessionConfig.httpOnly ? 'HttpOnly' : '',
      sessionConfig.secure ? 'Secure' : '',
      `SameSite=${sessionConfig.sameSite}`,
      'Path=/'
    ].filter(Boolean).join('; ');

    return attributes;
  }

  // CORS configuration with security
  corsConfig() {
    return {
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) {
          return callback(null, true);
        }

        // List of allowed origins
        const allowedOrigins = [
          process.env.FRONTEND_URL || 'http://localhost:3000',
          'http://localhost:3000',
          'http://127.0.0.1:3000',
          ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
        ];

        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-API-Key',
        'X-Request-ID'
      ],
      exposedHeaders: ['X-Total-Count', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
      credentials: true,
      maxAge: 86400 // 24 hours
    };
  }

  // Anti-CSRF token middleware (additional protection)
  csrfProtection() {
    return async (request, reply) => {
      // Skip CSRF for GET, HEAD, OPTIONS requests
      if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        return;
      }

      // Skip for API endpoints that use JWT authentication
      if (request.url.startsWith('/api/')) {
        return;
      }

      const token = request.headers['x-csrf-token'] || request.body?.csrfToken;
      const sessionToken = request.session?.csrfToken;

      if (!token || !sessionToken || token !== sessionToken) {
        return reply.code(403).send({
          success: false,
          message: 'Invalid CSRF token'
        });
      }
    };
  }

  // Generate CSRF token
  generateCSRFToken() {
    return this.securityConfig.generateSecureToken(32);
  }

  // Request ID middleware for tracking
  requestId() {
    return async (request, reply) => {
      const requestId = request.headers['x-request-id'] ||
                       this.securityConfig.generateSecureToken(16);

      request.id = requestId;
      reply.header('X-Request-ID', requestId);
    };
  }

  // Content Security Policy report only (for development)
  cspReportOnly() {
    return async (request, reply) => {
      if (process.env.NODE_ENV !== 'production') {
        const securityConfig = this.securityConfig.getSecurityHeaders();
        if (securityConfig.contentSecurityPolicy) {
          const csp = this.buildCSP(securityConfig.contentSecurityPolicy.directives);
          reply.header('Content-Security-Policy-Report-Only', csp);
        }
      }
    };
  }

  // Security audit logging middleware
  auditLog() {
    return async (request, reply) => {
      const startTime = Date.now();

      // Log request details for security monitoring
      if (global.securityLogger) {
        global.securityLogger.logRequest({
          id: request.id,
          ip: request.ip,
          method: request.method,
          url: request.url,
          userAgent: request.headers['user-agent'],
          referer: request.headers.referer,
          timestamp: new Date().toISOString(),
          adminId: request.admin?.id,
          adminUsername: request.admin?.username
        });
      }

      // Hook into response to log completion
      reply.addHook('onSend', async (request, reply, payload) => {
        const duration = Date.now() - startTime;

        if (global.securityLogger) {
          global.securityLogger.logResponse({
            requestId: request.id,
            statusCode: reply.statusCode,
            duration,
            contentLength: reply.getHeader('content-length') || 0
          });
        }

        return payload;
      });
    };
  }

  // IP whitelisting middleware (optional)
  ipWhitelist(allowedIPs = []) {
    return async (request, reply) => {
      const clientIP = request.ip;

      if (allowedIPs.length > 0 && !allowedIPs.includes(clientIP)) {
        return reply.code(403).send({
          success: false,
          message: 'Access denied from this IP address'
        });
      }
    };
  }

  // User-Agent validation middleware
  validateUserAgent(blockedPatterns = []) {
    return async (request, reply) => {
      const userAgent = request.headers['user-agent'] || '';

      // Block empty user agents
      if (!userAgent) {
        return reply.code(400).send({
          success: false,
          message: 'User-Agent header is required'
        });
      }

      // Block known malicious patterns
      const isBlocked = blockedPatterns.some(pattern =>
        userAgent.toLowerCase().includes(pattern.toLowerCase())
      );

      if (isBlocked) {
        return reply.code(403).send({
          success: false,
          message: 'Access denied'
        });
      }
    };
  }
}

module.exports = SecurityHeadersMiddleware;