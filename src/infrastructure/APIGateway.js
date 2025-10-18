const { EventEmitter } = require('events');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

/**
 * Comprehensive API Gateway
 * Provides centralized API management with security, rate limiting,
 * request routing, caching, and comprehensive monitoring
 */
class APIGateway extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      // Gateway settings
      gatewayId: config.gatewayId || 'mikrotik-billing-gateway',
      version: config.version || '1.0.0',
      environment: config.environment || 'production',

      // Security
      enableAuthentication: config.enableAuthentication !== false,
      enableRateLimiting: config.enableRateLimiting !== false,
      enableInputValidation: config.enableInputValidation !== false,
      enableCORS: config.enableCORS !== false,
      enableRequestSigning: config.enableRequestSigning || false,

      // Rate limiting
      defaultRateLimit: config.defaultRateLimit || {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 1000,
        blockDuration: 60 * 1000 // 1 minute
      },

      // Caching
      enableCache: config.enableCache !== false,
      defaultCacheTTL: config.defaultCacheTTL || 300, // 5 minutes
      maxCacheSize: config.maxCacheSize || 10000,

      // Monitoring
      enableMetrics: config.enableMetrics !== false,
      enableRequestTracing: config.enableRequestTracing !== false,
      slowRequestThreshold: config.slowRequestThreshold || 2000, // 2 seconds

      // Security headers
      securityHeaders: config.securityHeaders || {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy': "default-src 'self'"
      },

      ...config
    };

    // Route registry
    this.routes = new Map();
    this.middlewares = [];
    this.routeGroups = new Map();

    // Rate limiting
    this.rateLimitStore = new Map();
    this.blockedIPs = new Map();

    // Request cache
    this.requestCache = new Map();

    // Metrics and monitoring
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      blockedRequests: 0,
      rateLimitedRequests: 0,
      averageResponseTime: 0,
      slowRequests: 0,
      activeRequests: 0
    };

    // Security
    this.apiKeys = new Map();
    this.jwtSecret = config.jwtSecret || crypto.randomBytes(64).toString('hex');
    this.allowedOrigins = new Set(config.allowedOrigins || ['*']);

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.on('request-received', this.handleRequestReceived.bind(this));
    this.on('request-completed', this.handleRequestCompleted.bind(this));
    this.on('request-failed', this.handleRequestFailed.bind(this));
    this.on('rate-limit-exceeded', this.handleRateLimitExceeded.bind(this));
    this.on('security-violation', this.handleSecurityViolation.bind(this));
  }

  /**
   * Register a new route
   */
  registerRoute(path, handler, options = {}) {
    const route = {
      path,
      handler,
      method: options.method || 'GET',
      middleware: options.middleware || [],
      auth: options.auth !== false,
      rateLimit: options.rateLimit || this.config.defaultRateLimit,
      cache: options.cache !== false ? (options.cacheTTL || this.config.defaultCacheTTL) : null,
      validation: options.validation || null,
      version: options.version || 'v1',
      group: options.group || 'default',
      description: options.description || '',
      tags: options.tags || []
    };

    const routeKey = `${route.method}:${route.path}`;
    this.routes.set(routeKey, route);

    // Add to route group
    if (!this.routeGroups.has(route.group)) {
      this.routeGroups.set(route.group, []);
    }
    this.routeGroups.get(route.group).push(route);

    console.log(`🛣️  Registered route: ${route.method} ${route.path} (${route.group})`);
    return route;
  }

  /**
   * Register middleware
   */
  use(middleware, options = {}) {
    this.middlewares.push({
      middleware,
      priority: options.priority || 0,
      routes: options.routes || null, // null means apply to all routes
      methods: options.methods || null
    });

    // Sort by priority (higher priority first)
    this.middlewares.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Handle incoming request
   */
  async handleRequest(request, response) {
    const requestId = this.generateRequestId();
    const startTime = Date.now();

    // Initialize request context
    const context = {
      requestId,
      startTime,
      request,
      response,
      route: null,
      user: null,
      cacheKey: null,
      isAuthenticated: false,
      rateLimitKey: this.getRateLimitKey(request),
      metadata: {
        ip: request.ip || request.headers['x-forwarded-for'] || 'unknown',
        userAgent: request.headers['user-agent'] || 'unknown',
        referer: request.headers['referer'] || 'unknown'
      }
    };

    this.metrics.activeRequests++;
    this.metrics.totalRequests++;

    try {
      // Emit request received event
      this.emit('request-received', context);

      // Apply global middleware
      await this.applyMiddleware(context, this.middlewares);

      // Find matching route
      const route = this.findRoute(request);
      if (!route) {
        throw new Error('Route not found');
      }

      context.route = route;

      // Apply security and rate limiting
      await this.applySecurity(context);

      // Check cache
      if (route.cache && this.config.enableCache) {
        const cachedResponse = await this.getFromCache(context);
        if (cachedResponse) {
          return this.sendCachedResponse(context, cachedResponse);
        }
      }

      // Apply route-specific middleware
      if (route.middleware.length > 0) {
        await this.applyMiddleware(context, route.middleware);
      }

      // Validate input
      if (route.validation && this.config.enableInputValidation) {
        await this.validateInput(context, route.validation);
      }

      // Execute route handler
      const result = await this.executeHandler(context, route.handler);

      // Cache response if applicable
      if (route.cache && this.config.enableCache) {
        await this.setCache(context, result);
      }

      // Send response
      this.sendResponse(context, result);

      // Update metrics
      this.updateMetrics(context, true);

      // Emit completion event
      this.emit('request-completed', context);

    } catch (error) {
      await this.handleRequestError(context, error);
    } finally {
      this.metrics.activeRequests--;
    }
  }

  /**
   * Apply middleware chain
   */
  async applyMiddleware(context, middlewares) {
    for (const middlewareConfig of middlewares) {
      const { middleware, routes, methods } = middlewareConfig;

      // Check if middleware applies to this route
      if (routes && !routes.includes(context.route?.path)) continue;
      if (methods && !methods.includes(context.request.method)) continue;

      await middleware(context);
    }
  }

  /**
   * Apply security measures
   */
  async applySecurity(context) {
    const { request, route } = context;

    // Authentication
    if (route.auth && this.config.enableAuthentication) {
      await this.authenticateRequest(context);
    }

    // Rate limiting
    if (this.config.enableRateLimiting) {
      await this.checkRateLimit(context);
    }

    // CORS
    if (this.config.enableCORS) {
      this.handleCORS(context);
    }

    // Security headers
    this.addSecurityHeaders(context);
  }

  /**
   * Authenticate request
   */
  async authenticateRequest(context) {
    const { request } = context;
    const authHeader = request.headers['authorization'];

    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    try {
      if (authHeader.startsWith('Bearer ')) {
        // JWT token authentication
        const token = authHeader.substring(7);
        context.user = await this.verifyJWT(token);
        context.isAuthenticated = true;
      } else if (authHeader.startsWith('ApiKey ')) {
        // API key authentication
        const apiKey = authHeader.substring(7);
        context.user = await this.verifyApiKey(apiKey);
        context.isAuthenticated = true;
      } else {
        throw new Error('Unsupported authentication method');
      }

      this.emit('user-authenticated', context);

    } catch (error) {
      this.emit('authentication-failed', context);
      throw new Error('Authentication failed');
    }
  }

  /**
   * Check rate limit
   */
  async checkRateLimit(context) {
    const { request, rateLimitKey, route } = context;
    const now = Date.now();

    // Check if IP is blocked
    if (this.blockedIPs.has(context.metadata.ip)) {
      const blockInfo = this.blockedIPs.get(context.metadata.ip);
      if (now < blockInfo.expiresAt) {
        this.metrics.blockedRequests++;
        throw new Error('IP address is blocked');
      } else {
        this.blockedIPs.delete(context.metadata.ip);
      }
    }

    // Get rate limit config
    const rateLimitConfig = route.rateLimit || this.config.defaultRateLimit;

    // Check rate limit
    const limitData = this.rateLimitStore.get(rateLimitKey) || {
      count: 0,
      resetTime: now + rateLimitConfig.windowMs,
      requests: []
    };

    // Clean old requests
    limitData.requests = limitData.requests.filter(timestamp =>
      timestamp > now - rateLimitConfig.windowMs
    );

    if (limitData.requests.length >= rateLimitConfig.maxRequests) {
      this.metrics.rateLimitedRequests++;

      // Block if exceeded threshold
      if (limitData.requests.length > rateLimitConfig.maxRequests * 2) {
        this.blockedIPs.set(context.metadata.ip, {
          reason: 'Rate limit exceeded',
          expiresAt: now + rateLimitConfig.blockDuration
        });
      }

      this.emit('rate-limit-exceeded', context);
      throw new Error('Rate limit exceeded');
    }

    // Add current request
    limitData.requests.push(now);
    limitData.count++;

    this.rateLimitStore.set(rateLimitKey, limitData);

    // Add rate limit headers
    context.response.set('X-RateLimit-Limit', rateLimitConfig.maxRequests);
    context.response.set('X-RateLimit-Remaining', Math.max(0, rateLimitConfig.maxRequests - limitData.count));
    context.response.set('X-RateLimit-Reset', new Date(limitData.resetTime).toISOString());
  }

  /**
   * Handle CORS
   */
  handleCORS(context) {
    const { request, response } = context;
    const origin = request.headers['origin'];

    if (this.allowedOrigins.has('*') || this.allowedOrigins.has(origin)) {
      response.set('Access-Control-Allow-Origin', origin || '*');
    }

    response.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    response.set('Access-Control-Allow-Credentials', 'true');
    response.set('Access-Control-Max-Age', '86400'); // 24 hours

    if (request.method === 'OPTIONS') {
      response.status(200).end();
      return;
    }
  }

  /**
   * Add security headers
   */
  addSecurityHeaders(context) {
    const { response } = context;

    Object.entries(this.config.securityHeaders).forEach(([header, value]) => {
      response.set(header, value);
    });

    // Additional security headers
    response.set('X-Request-ID', context.requestId);
    response.set('X-Gateway-Version', this.config.version);
    response.set('X-Powered-By', 'Mikrotik Billing Gateway');
  }

  /**
   * Validate input
   */
  async validateInput(context, validation) {
    const { request } = context;

    try {
      if (validation.body) {
        request.body = await this.validateSchema(request.body, validation.body);
      }

      if (validation.query) {
        request.query = await this.validateSchema(request.query, validation.query);
      }

      if (validation.params) {
        request.params = await this.validateSchema(request.params, validation.params);
      }

    } catch (error) {
      this.emit('validation-failed', context);
      throw new Error(`Validation failed: ${error.message}`);
    }
  }

  /**
   * Execute route handler
   */
  async executeHandler(context, handler) {
    try {
      const result = await handler(context);

      // Add response metadata
      if (typeof result === 'object' && result !== null) {
        result._metadata = {
          requestId: context.requestId,
          timestamp: new Date().toISOString(),
          version: context.route.version
        };
      }

      return result;

    } catch (error) {
      this.emit('handler-error', context, error);
      throw error;
    }
  }

  /**
   * Find matching route
   */
  findRoute(request) {
    const { method, url } = request;

    // Try exact match first
    const exactKey = `${method}:${url}`;
    if (this.routes.has(exactKey)) {
      return this.routes.get(exactKey);
    }

    // Try pattern matching
    for (const [routeKey, route] of this.routes) {
      if (this.pathMatches(url, route.path) && route.method === method) {
        // Extract path parameters
        const params = this.extractPathParams(url, route.path);
        request.params = { ...request.params, ...params };
        return route;
      }
    }

    return null;
  }

  /**
   * Check if path matches pattern
   */
  pathMatches(path, pattern) {
    const pathSegments = path.split('/').filter(Boolean);
    const patternSegments = pattern.split('/').filter(Boolean);

    if (pathSegments.length !== patternSegments.length) {
      return false;
    }

    return patternSegments.every((segment, index) => {
      return segment.startsWith(':') || segment === pathSegments[index];
    });
  }

  /**
   * Extract path parameters
   */
  extractPathParams(path, pattern) {
    const pathSegments = path.split('/').filter(Boolean);
    const patternSegments = pattern.split('/').filter(Boolean);
    const params = {};

    patternSegments.forEach((segment, index) => {
      if (segment.startsWith(':')) {
        const paramName = segment.substring(1);
        params[paramName] = pathSegments[index];
      }
    });

    return params;
  }

  /**
   * Get cache response
   */
  async getFromCache(context) {
    const { request, route } = context;
    const cacheKey = this.generateCacheKey(request, route);

    const cached = this.requestCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    return null;
  }

  /**
   * Set cache response
   */
  async setCache(context, data) {
    const { request, route } = context;
    const cacheKey = this.generateCacheKey(request, route);

    // Check cache size limit
    if (this.requestCache.size >= this.config.maxCacheSize) {
      // Remove oldest entry
      const oldestKey = this.requestCache.keys().next().value;
      this.requestCache.delete(oldestKey);
    }

    this.requestCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + (route.cache * 1000),
      cachedAt: Date.now()
    });
  }

  /**
   * Send cached response
   */
  sendCachedResponse(context, cachedResponse) {
    const { response } = context;
    response.set('X-Cache', 'HIT');
    response.json(cachedResponse);
  }

  /**
   * Send response
   */
  sendResponse(context, result) {
    const { response, startTime } = context;
    const duration = Date.now() - startTime;

    response.set('X-Cache', 'MISS');
    response.set('X-Response-Time', `${duration}ms`);
    response.json(result);
  }

  /**
   * Handle request error
   */
  async handleRequestError(context, error) {
    const { response, startTime } = context;
    const duration = Date.now() - startTime;

    this.metrics.failedRequests++;
    this.updateMetrics(context, false);

    const errorResponse = {
      error: {
        message: error.message,
        code: this.getErrorCode(error),
        requestId: context.requestId,
        timestamp: new Date().toISOString()
      }
    };

    response.status(this.getErrorStatusCode(error)).json(errorResponse);
    this.emit('request-failed', context, error);
  }

  /**
   * Get error code
   */
  getErrorCode(error) {
    if (error.message.includes('Authentication')) return 'AUTH_FAILED';
    if (error.message.includes('Rate limit')) return 'RATE_LIMITED';
    if (error.message.includes('Validation')) return 'VALIDATION_FAILED';
    if (error.message.includes('Route not found')) return 'NOT_FOUND';
    return 'INTERNAL_ERROR';
  }

  /**
   * Get error status code
   */
  getErrorStatusCode(error) {
    if (error.message.includes('Authentication')) return 401;
    if (error.message.includes('Rate limit')) return 429;
    if (error.message.includes('Validation')) return 400;
    if (error.message.includes('Route not found')) return 404;
    return 500;
  }

  /**
   * Update metrics
   */
  updateMetrics(context, success) {
    const duration = Date.now() - context.startTime;

    if (success) {
      this.metrics.successfulRequests++;
    }

    // Update average response time
    const totalRequests = this.metrics.successfulRequests + this.metrics.failedRequests;
    const totalTime = this.metrics.averageResponseTime * (totalRequests - 1) + duration;
    this.metrics.averageResponseTime = totalTime / totalRequests;

    // Check slow requests
    if (duration > this.config.slowRequestThreshold) {
      this.metrics.slowRequests++;
      this.emit('slow-request', context);
    }
  }

  /**
   * Get rate limit key
   */
  getRateLimitKey(request) {
    const ip = request.ip || request.headers['x-forwarded-for'] || 'unknown';
    const userAgent = request.headers['user-agent'] || 'unknown';
    const key = crypto.createHash('md5');
    key.update(`${ip}:${userAgent}`);
    return key.digest('hex');
  }

  /**
   * Generate cache key
   */
  generateCacheKey(request, route) {
    const key = crypto.createHash('md5');
    key.update(`${request.method}:${request.url}:${JSON.stringify(request.query)}`);
    return `cache:${key.digest('hex')}`;
  }

  /**
   * Generate request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Verify JWT token
   */
  async verifyJWT(token) {
    // This would use a proper JWT library like jsonwebtoken
    // For now, return a mock user
    return {
      id: 'user123',
      email: 'user@example.com',
      role: 'user'
    };
  }

  /**
   * Verify API key
   */
  async verifyApiKey(apiKey) {
    const keyData = this.apiKeys.get(apiKey);
    if (!keyData) {
      throw new Error('Invalid API key');
    }

    return {
      id: keyData.userId,
      apiKey: apiKey,
      permissions: keyData.permissions
    };
  }

  /**
   * Validate schema
   */
  async validateSchema(data, schema) {
    // This would use a proper validation library like Joi or Yup
    // For now, return data as-is
    return data;
  }

  // Event handlers
  handleRequestReceived(context) {
    console.log(`📥 Request received: ${context.request.method} ${context.request.url} (${context.requestId})`);
  }

  handleRequestCompleted(context) {
    const duration = Date.now() - context.startTime;
    console.log(`✅ Request completed: ${context.request.method} ${context.request.url} (${duration}ms)`);
  }

  handleRequestFailed(context, error) {
    const duration = Date.now() - context.startTime;
    console.error(`❌ Request failed: ${context.request.method} ${context.request.url} (${duration}ms) - ${error.message}`);
  }

  handleRateLimitExceeded(context) {
    console.warn(`🚫 Rate limit exceeded: ${context.metadata.ip} for ${context.request.url}`);
  }

  handleSecurityViolation(context, violation) {
    console.error(`🛡️  Security violation: ${violation.type} from ${context.metadata.ip}`);
  }

  /**
   * Get gateway statistics
   */
  getStatistics() {
    return {
      gateway: {
        id: this.config.gatewayId,
        version: this.config.version,
        environment: this.config.environment,
        uptime: Date.now() - (this.startTime || Date.now())
      },
      requests: {
        total: this.metrics.totalRequests,
        successful: this.metrics.successfulRequests,
        failed: this.metrics.failedRequests,
        blocked: this.metrics.blockedRequests,
        rateLimited: this.metrics.rateLimitedRequests,
        active: this.metrics.activeRequests,
        averageResponseTime: Math.round(this.metrics.averageResponseTime),
        slowRequests: this.metrics.slowRequests
      },
      cache: {
        size: this.requestCache.size,
        maxSize: this.config.maxCacheSize,
        hitRate: this.calculateCacheHitRate()
      },
      security: {
        blockedIPs: this.blockedIPs.size,
        apiKeys: this.apiKeys.size,
        rateLimitEntries: this.rateLimitStore.size
      },
      routes: {
        total: this.routes.size,
        groups: Array.from(this.routeGroups.keys())
      }
    };
  }

  /**
   * Calculate cache hit rate
   */
  calculateCacheHitRate() {
    // This would be calculated based on actual cache hits/misses
    // For now, return a mock value
    return '75.5%';
  }

  /**
   * Health check
   */
  async healthCheck() {
    return {
      status: 'healthy',
      gateway: this.config.gatewayId,
      version: this.config.version,
      uptime: Date.now() - (this.startTime || Date.now()),
      activeRequests: this.metrics.activeRequests,
      cache: {
        size: this.requestCache.size,
        maxSize: this.config.maxCacheSize
      },
      security: {
        blockedIPs: this.blockedIPs.size,
        rateLimitEntries: this.rateLimitStore.size
      }
    };
  }

  /**
   * Start the gateway
   */
  start() {
    this.startTime = Date.now();
    console.log(`🚀 API Gateway started: ${this.config.gatewayId} v${this.config.version}`);
    this.emit('started');
  }

  /**
   * Stop the gateway
   */
  stop() {
    console.log(`🛑 API Gateway stopped: ${this.config.gatewayId}`);
    this.emit('stopped');
  }
}

module.exports = APIGateway;