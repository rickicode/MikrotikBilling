const crypto = require('crypto');

class SecurityConfig {
  constructor() {
    this.initializeSecurityConfig();
  }

  initializeSecurityConfig() {
    // Strong JWT secret validation
    this.JWT_SECRET = this.validateAndGetSecret();

    // Rate limiting configuration
    this.RATE_LIMITS = {
      login: { max: 5, timeWindow: '15 minutes' },
      api: { max: 100, timeWindow: '1 minute' },
      upload: { max: 10, timeWindow: '1 minute' },
      passwordReset: { max: 3, timeWindow: '1 hour' }
    };

    // Password policies
    this.PASSWORD_POLICY = {
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      preventCommonPasswords: true,
      maxAge: 90 // days
    };

    // Session configuration
    this.SESSION_CONFIG = {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
      rolling: true,
      cookieName: 'mikrotik_billing_session'
    };

    // Security headers
    this.SECURITY_HEADERS = {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
          imgSrc: ["'self'", "data:", "https:"],
          fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
          connectSrc: ["'self'"],
          mediaSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameSrc: ["'none'"],
          workerSrc: ["'self'"],
          childSrc: ["'none'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          manifestSrc: ["'self'"]
        }
      },
      strictTransportSecurity: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false
    };
  }

  validateAndGetSecret() {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      console.error('CRITICAL: JWT_SECRET environment variable is not set!');
      process.exit(1);
    }

    if (secret.length < 32) {
      console.error('CRITICAL: JWT_SECRET must be at least 32 characters long!');
      process.exit(1);
    }

    if (secret === 'default-secret' || secret === 'your-secret-key-here') {
      console.error('CRITICAL: JWT_SECRET is using a default value. Please set a secure secret!');
      process.exit(1);
    }

    return secret;
  }

  // Generate secure random tokens
  generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  // Generate session ID
  generateSessionId() {
    return 'sess_' + Date.now() + '_' + crypto.randomBytes(16).toString('hex');
  }

  // Validate password strength
  validatePasswordStrength(password) {
    const issues = [];

    if (password.length < this.PASSWORD_POLICY.minLength) {
      issues.push(`Password must be at least ${this.PASSWORD_POLICY.minLength} characters long`);
    }

    if (this.PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) {
      issues.push('Password must contain at least one uppercase letter');
    }

    if (this.PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) {
      issues.push('Password must contain at least one lowercase letter');
    }

    if (this.PASSWORD_POLICY.requireNumbers && !/\d/.test(password)) {
      issues.push('Password must contain at least one number');
    }

    if (this.PASSWORD_POLICY.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      issues.push('Password must contain at least one special character');
    }

    // Check for common passwords
    const commonPasswords = [
      'password', '123456', 'qwerty', 'admin', 'letmein', 'welcome',
      'monkey', 'dragon', 'master', 'sunshine', 'princess', 'football'
    ];

    if (this.PASSWORD_POLICY.preventCommonPasswords &&
        commonPasswords.some(common => password.toLowerCase().includes(common))) {
      issues.push('Password contains common patterns');
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  // Sanitize input to prevent XSS
  sanitizeInput(input) {
    if (typeof input !== 'string') {
      return input;
    }

    // Remove potentially dangerous characters
    return input
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '')
      .replace(/expression\(/gi, '')
      .replace(/@import/gi, '')
      .replace(/vbscript:/gi, '')
      .trim();
  }

  // Validate email format
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Validate username format
  validateUsername(username) {
    // Username should be alphanumeric with underscores and hyphens, 3-30 characters
    const usernameRegex = /^[a-zA-Z0-9_-]{3,30}$/;
    return usernameRegex.test(username);
  }

  // Generate cryptographically secure random ID
  generateId() {
    return crypto.randomBytes(16).toString('hex');
  }

  // Hash data with HMAC
  hmacSha256(data, key = this.JWT_SECRET) {
    return crypto.createHmac('sha256', key).update(data).digest('hex');
  }

  // Get security headers configuration
  getSecurityHeaders() {
    return this.SECURITY_HEADERS;
  }

  // Get rate limit configuration
  getRateLimitConfig(type) {
    return this.RATE_LIMITS[type] || this.RATE_LIMITS.api;
  }

  // Get session configuration
  getSessionConfig() {
    return this.SESSION_CONFIG;
  }
}

module.exports = SecurityConfig;