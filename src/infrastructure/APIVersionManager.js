const { EventEmitter } = require('events');
const semver = require('semver');

/**
 * API Version Manager with Backward Compatibility
 * Provides comprehensive API versioning, deprecation management,
 * route mapping, and compatibility checking
 */
class APIVersionManager extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      // Version management
      defaultVersion: config.defaultVersion || 'v1',
      supportedVersions: config.supportedVersions || ['v1', 'v2'],
      deprecatedVersions: config.deprecatedVersions || [],
      sunsetVersions: config.sunsetVersions || [],

      // Versioning strategy
      versioningStrategy: config.versioningStrategy || 'url', // 'url', 'header', 'query'
      versionHeader: config.versionHeader || 'API-Version',
      versionQuery: config.versionQuery || 'version',

      // Compatibility
      enableBackwardCompatibility: config.enableBackwardCompatibility !== false,
      enableForwardCompatibility: config.enableForwardCompatibility || false,
      strictVersionChecking: config.strictVersionChecking || false,

      // Deprecation
      deprecationWarningPeriod: config.deprecationWarningPeriod || 90 * 24 * 60 * 60 * 1000, // 90 days
      sunsetPeriod: config.sunsetPeriod || 180 * 24 * 60 * 60 * 1000, // 180 days

      // Response headers
      includeVersionHeaders: config.includeVersionHeaders !== false,
      includeDeprecationHeaders: config.includeDeprecationHeaders !== false,

      // Migration
      enableAutoMigration: config.enableAutoMigration || false,
      migrationStrategies: config.migrationStrategies || {},

      ...config
    };

    // Version registries
    this.routes = new Map(); // version -> routes
    this.schemas = new Map(); // version -> schemas
    this.migrations = new Map(); // fromVersion -> toVersion -> migration
    this.deprecations = new Map(); // version -> deprecation info
    this.compatibilityMatrix = new Map(); // version -> compatible versions

    // Version lifecycle
    this.versionLifecycle = {
      experimental: new Set(),
      stable: new Set(),
      deprecated: new Set(),
      sunset: new Set()
    };

    this.setupEventHandlers();
    this.initializeDefaultCompatibility();
  }

  setupEventHandlers() {
    this.on('version-deprecated', this.handleVersionDeprecated.bind(this));
    this.on('version-sunset', this.handleVersionSunset.bind(this));
    this.on('route-added', this.handleRouteAdded.bind(this));
    this.on('route-migrated', this.handleRouteMigrated.bind(this));
  }

  /**
   * Register a route for a specific version
   */
  registerRoute(version, path, handler, options = {}) {
    if (!this.isValidVersion(version)) {
      throw new Error(`Invalid version: ${version}`);
    }

    const route = {
      version,
      path,
      handler,
      method: options.method || 'GET',
      middleware: options.middleware || [],
      schema: options.schema || null,
      deprecated: options.deprecated || false,
      migration: options.migration || null,
      compatibility: options.compatibility || {},
      metadata: {
        description: options.description || '',
        tags: options.tags || [],
        author: options.author || 'unknown',
        createdAt: new Date().toISOString(),
        ...options.metadata
      }
    };

    // Store route
    if (!this.routes.has(version)) {
      this.routes.set(version, new Map());
    }

    const routeKey = `${route.method}:${route.path}`;
    this.routes.get(version).set(routeKey, route);

    // Store schema if provided
    if (route.schema) {
      if (!this.schemas.has(version)) {
        this.schemas.set(version, new Map());
      }
      this.schemas.get(version).set(routeKey, route.schema);
    }

    this.emit('route-added', route);
    console.log(`🛣️  Registered route: ${version} ${route.method} ${route.path}`);

    return route;
  }

  /**
   * Register migration between versions
   */
  registerMigration(fromVersion, toVersion, migration) {
    if (!this.isValidVersion(fromVersion) || !this.isValidVersion(toVersion)) {
      throw new Error(`Invalid migration version: ${fromVersion} -> ${toVersion}`);
    }

    if (!semver.gt(this.extractVersionNumber(toVersion), this.extractVersionNumber(fromVersion))) {
      throw new Error(`Migration must be to a higher version: ${fromVersion} -> ${toVersion}`);
    }

    if (!this.migrations.has(fromVersion)) {
      this.migrations.set(fromVersion, new Map());
    }

    this.migrations.get(fromVersion).set(toVersion, {
      fromVersion,
      toVersion,
      migration,
      registeredAt: new Date().toISOString()
    });

    // Update compatibility matrix
    this.updateCompatibilityMatrix(fromVersion, toVersion);

    console.log(`🔄 Registered migration: ${fromVersion} -> ${toVersion}`);
  }

  /**
   * Deprecate a version
   */
  deprecateVersion(version, options = {}) {
    if (!this.isValidVersion(version)) {
      throw new Error(`Invalid version: ${version}`);
    }

    const deprecation = {
      version,
      deprecatedAt: new Date().toISOString(),
      sunsetAt: options.sunsetAt || this.calculateSunsetDate(),
      reason: options.reason || 'Newer version available',
      migrationGuide: options.migrationGuide || null,
      alternatives: options.alternatives || [],
      supportUntil: options.supportUntil || this.calculateSupportEndDate(),
      ...options
    };

    this.deprecations.set(version, deprecation);
    this.versionLifecycle.deprecated.add(version);
    this.versionLifecycle.stable.delete(version);
    this.versionLifecycle.experimental.delete(version);

    this.emit('version-deprecated', deprecation);
    console.warn(`⚠️  Version deprecated: ${version} - ${deprecation.reason}`);

    return deprecation;
  }

  /**
   * Sunset a version
   */
  sunsetVersion(version, options = {}) {
    if (!this.isValidVersion(version)) {
      throw new Error(`Invalid version: ${version}`);
    }

    const sunset = {
      version,
      sunsetAt: new Date().toISOString(),
      reason: options.reason || 'Version no longer supported',
      finalMigrationGuide: options.finalMigrationGuide || null,
      ...options
    };

    this.versionLifecycle.sunset.add(version);
    this.versionLifecycle.deprecated.delete(version);
    this.versionLifecycle.stable.delete(version);
    this.versionLifecycle.experimental.delete(version);

    this.emit('version-sunset', sunset);
    console.error(`🌅 Version sunset: ${version} - ${sunset.reason}`);

    return sunset;
  }

  /**
   * Get route for request with version resolution
   */
  async getRoute(request) {
    const version = this.resolveVersion(request);
    const method = request.method.toUpperCase();
    const path = this.normalizePath(request.url);

    // Try exact match first
    const routeKey = `${method}:${path}`;
    let route = this.routes.get(version)?.get(routeKey);

    // If not found and backward compatibility is enabled, try older versions
    if (!route && this.config.enableBackwardCompatibility) {
      route = await this.findCompatibleRoute(version, method, path, 'backward');
    }

    // If still not found and forward compatibility is enabled, try newer versions
    if (!route && this.config.enableForwardCompatibility) {
      route = await this.findCompatibleRoute(version, method, path, 'forward');
    }

    // If still not found, try auto-migration
    if (!route && this.config.enableAutoMigration) {
      route = await this.migrateRoute(version, method, path);
    }

    return route;
  }

  /**
   * Resolve version from request
   */
  resolveVersion(request) {
    let version = null;

    switch (this.config.versioningStrategy) {
      case 'url':
        version = this.extractVersionFromURL(request.url);
        break;
      case 'header':
        version = this.extractVersionFromHeader(request);
        break;
      case 'query':
        version = this.extractVersionFromQuery(request);
        break;
      default:
        version = this.extractVersionFromURL(request.url);
    }

    // Fall back to default version
    if (!version || !this.isValidVersion(version)) {
      version = this.config.defaultVersion;
    }

    // Check if version is supported
    if (this.versionLifecycle.sunset.has(version)) {
      throw new Error(`Version ${version} is no longer supported`);
    }

    return version;
  }

  /**
   * Extract version from URL path
   */
  extractVersionFromURL(url) {
    const match = url.match(/^\/(v\d+)(?:\/|$)/);
    return match ? match[1] : null;
  }

  /**
   * Extract version from header
   */
  extractVersionFromHeader(request) {
    return request.headers[this.config.versionHeader.toLowerCase()] || null;
  }

  /**
   * Extract version from query parameter
   */
  extractVersionFromQuery(request) {
    const query = this.parseQuery(request.url);
    return query[this.config.versionQuery] || null;
  }

  /**
   * Find compatible route in other versions
   */
  async findCompatibleRoute(version, method, path, direction) {
    const compatibleVersions = this.getCompatibleVersions(version, direction);

    for (const compatibleVersion of compatibleVersions) {
      const routeKey = `${method}:${path}`;
      const route = this.routes.get(compatibleVersion)?.get(routeKey);

      if (route) {
        // Check if route is compatible
        if (this.isRouteCompatible(route, version, direction)) {
          return await this.migrateRouteData(route, compatibleVersion, version);
        }
      }
    }

    return null;
  }

  /**
   * Migrate route between versions
   */
  async migrateRoute(fromVersion, method, path) {
    const migrationPath = this.findMigrationPath(fromVersion);

    if (!migrationPath) {
      return null;
    }

    let currentVersion = fromVersion;
    let route = this.routes.get(currentVersion)?.get(`${method}:${path}`);

    for (const toVersion of migrationPath) {
      const migration = this.migrations.get(currentVersion)?.get(toVersion);

      if (migration && route) {
        try {
          route = await migration.migration(route);
          currentVersion = toVersion;
        } catch (error) {
          console.error(`Migration failed: ${currentVersion} -> ${toVersion}`, error);
          return null;
        }
      }
    }

    return route;
  }

  /**
   * Migrate route data between versions
   */
  async migrateRouteData(route, fromVersion, toVersion) {
    const migration = this.migrations.get(fromVersion)?.get(toVersion);

    if (!migration) {
      return route;
    }

    try {
      return await migration.migration(route);
    } catch (error) {
      console.error(`Route data migration failed: ${fromVersion} -> ${toVersion}`, error);
      return route;
    }
  }

  /**
   * Add version headers to response
   */
  addVersionHeaders(response, version, route) {
    if (!this.config.includeVersionHeaders) return;

    // API version headers
    response.set('API-Version', version);
    response.set('API-Version-Supported', this.config.supportedVersions.join(', '));
    response.set('API-Version-Default', this.config.defaultVersion);

    // Route-specific headers
    if (route) {
      response.set('API-Route-Version', route.version);
      if (route.deprecated) {
        response.set('API-Route-Deprecated', 'true');
      }
    }

    // Deprecation headers
    if (this.config.includeDeprecationHeaders && this.versionLifecycle.deprecated.has(version)) {
      const deprecation = this.deprecations.get(version);
      response.set('Deprecation', 'true');
      response.set('Sunset', deprecation.sunsetAt);
      if (deprecation.migrationGuide) {
        response.set('Link', `<${deprecation.migrationGuide}>; rel="migration-guide"`);
      }
    }

    // Sunset headers
    if (this.versionLifecycle.sunset.has(version)) {
      response.set('Sunset', 'true');
    }
  }

  /**
   * Check if version is valid
   */
  isValidVersion(version) {
    return this.config.supportedVersions.includes(version) ||
           this.config.deprecatedVersions.includes(version) ||
           this.config.sunsetVersions.includes(version);
  }

  /**
   * Check if route is compatible with target version
   */
  isRouteCompatible(route, targetVersion, direction) {
    if (!route.compatibility) return true;

    const compatibility = route.compatibility[targetVersion];
    if (!compatibility) return true;

    return compatibility.supported !== false;
  }

  /**
   * Get compatible versions
   */
  getCompatibleVersions(version, direction = 'backward') {
    const compatible = this.compatibilityMatrix.get(version) || [];

    if (direction === 'backward') {
      return compatible.filter(v => semver.lte(this.extractVersionNumber(v), this.extractVersionNumber(version)));
    } else {
      return compatible.filter(v => semver.gte(this.extractVersionNumber(v), this.extractVersionNumber(version)));
    }
  }

  /**
   * Find migration path between versions
   */
  findMigrationPath(fromVersion) {
    const visited = new Set();
    const path = [];

    const dfs = (currentVersion) => {
      if (visited.has(currentVersion)) return null;
      visited.add(currentVersion);

      const migrations = this.migrations.get(currentVersion);
      if (!migrations) return null;

      for (const [toVersion] of migrations) {
        path.push(toVersion);

        if (this.config.supportedVersions.includes(toVersion)) {
          return [...path];
        }

        const result = dfs(toVersion);
        if (result) return result;

        path.pop();
      }

      return null;
    };

    return dfs(fromVersion);
  }

  /**
   * Update compatibility matrix
   */
  updateCompatibilityMatrix(fromVersion, toVersion) {
    // Add forward compatibility
    if (!this.compatibilityMatrix.has(fromVersion)) {
      this.compatibilityMatrix.set(fromVersion, []);
    }
    if (!this.compatibilityMatrix.get(fromVersion).includes(toVersion)) {
      this.compatibilityMatrix.get(fromVersion).push(toVersion);
    }

    // Add backward compatibility for existing versions
    for (const [version, compatible] of this.compatibilityMatrix) {
      if (compatible.includes(fromVersion) && !compatible.includes(toVersion)) {
        compatible.push(toVersion);
      }
    }
  }

  /**
   * Initialize default compatibility
   */
  initializeDefaultCompatibility() {
    // Add supported versions as stable
    this.config.supportedVersions.forEach(version => {
      this.versionLifecycle.stable.add(version);
    });

    // Add deprecated versions
    this.config.deprecatedVersions.forEach(version => {
      this.versionLifecycle.deprecated.add(version);
    });

    // Add sunset versions
    this.config.sunsetVersions.forEach(version => {
      this.versionLifecycle.sunset.add(version);
    });

    // Initialize basic compatibility matrix
    this.config.supportedVersions.forEach(version => {
      this.compatibilityMatrix.set(version, [...this.config.supportedVersions]);
    });
  }

  /**
   * Calculate sunset date
   */
  calculateSunsetDate() {
    return new Date(Date.now() + this.config.sunsetPeriod).toISOString();
  }

  /**
   * Calculate support end date
   */
  calculateSupportEndDate() {
    return new Date(Date.now() + this.config.deprecationWarningPeriod).toISOString();
  }

  /**
   * Extract version number from version string
   */
  extractVersionNumber(version) {
    const match = version.match(/v?(\d+(?:\.\d+)*)/);
    return match ? match[1] : '1.0.0';
  }

  /**
   * Normalize path
   */
  normalizePath(url) {
    const urlObj = new URL(url, 'http://localhost');
    return urlObj.pathname;
  }

  /**
   * Parse query parameters
   */
  parseQuery(url) {
    const urlObj = new URL(url, 'http://localhost');
    const query = {};
    urlObj.searchParams.forEach((value, key) => {
      query[key] = value;
    });
    return query;
  }

  /**
   * Get version information
   */
  getVersionInfo(version) {
    if (!this.isValidVersion(version)) {
      return null;
    }

    const info = {
      version,
      status: 'unknown',
      supported: this.config.supportedVersions.includes(version),
      deprecated: this.versionLifecycle.deprecated.has(version),
      sunset: this.versionLifecycle.sunset.has(version),
      routes: this.routes.get(version)?.size || 0,
      schemas: this.schemas.get(version)?.size || 0
    };

    if (info.deprecated) {
      info.deprecationInfo = this.deprecations.get(version);
    }

    if (info.supported) {
      info.status = 'stable';
    } else if (info.deprecated) {
      info.status = 'deprecated';
    } else if (info.sunset) {
      info.status = 'sunset';
    }

    return info;
  }

  /**
   * Get all version information
   */
  getAllVersions() {
    const allVersions = new Set([
      ...this.config.supportedVersions,
      ...this.config.deprecatedVersions,
      ...this.config.sunsetVersions
    ]);

    return Array.from(allVersions).map(version => this.getVersionInfo(version));
  }

  /**
   * Get routes for version
   */
  getRoutesForVersion(version) {
    const routes = this.routes.get(version);
    if (!routes) return [];

    return Array.from(routes.values()).map(route => ({
      method: route.method,
      path: route.path,
      version: route.version,
      deprecated: route.deprecated,
      metadata: route.metadata
    }));
  }

  /**
   * Get schema for version and route
   */
  getSchema(version, method, path) {
    const schemas = this.schemas.get(version);
    if (!schemas) return null;

    const routeKey = `${method}:${path}`;
    return schemas.get(routeKey) || null;
  }

  /**
   * Validate request against version schema
   */
  async validateRequest(version, method, path, data) {
    const schema = this.getSchema(version, method, path);
    if (!schema) return true;

    // This would use a proper validation library like Joi or Yup
    // For now, return true
    return true;
  }

  /**
   * Check if client needs to upgrade
   */
  needsUpgrade(clientVersion) {
    if (!this.isValidVersion(clientVersion)) return true;

    if (this.versionLifecycle.sunset.has(clientVersion)) return true;
    if (this.versionLifecycle.deprecated.has(clientVersion)) return true;

    const clientVersionNum = this.extractVersionNumber(clientVersion);
    const latestVersion = this.getLatestVersion();
    const latestVersionNum = this.extractVersionNumber(latestVersion);

    return semver.lt(clientVersionNum, latestVersionNum);
  }

  /**
   * Get latest supported version
   */
  getLatestVersion() {
    if (this.config.supportedVersions.length === 0) {
      return this.config.defaultVersion;
    }

    return this.config.supportedVersions
      .map(v => ({ version: v, number: this.extractVersionNumber(v) }))
      .sort((a, b) => semver.compare(b.number, a.number))[0].version;
  }

  /**
   * Get recommended version for client
   */
  getRecommendedVersion(clientVersion) {
    if (this.needsUpgrade(clientVersion)) {
      return this.getLatestVersion();
    }

    return clientVersion;
  }

  /**
   * Get migration guide for version
   */
  getMigrationGuide(fromVersion, toVersion) {
    const deprecation = this.deprecations.get(fromVersion);
    if (deprecation && deprecation.migrationGuide) {
      return deprecation.migrationGuide;
    }

    // Check for direct migration
    const migration = this.migrations.get(fromVersion)?.get(toVersion);
    if (migration && migration.migrationGuide) {
      return migration.migrationGuide;
    }

    return null;
  }

  /**
   * Generate version compatibility report
   */
  generateCompatibilityReport() {
    const report = {
      generatedAt: new Date().toISOString(),
      defaultVersion: this.config.defaultVersion,
      supportedVersions: this.config.supportedVersions,
      deprecatedVersions: this.config.deprecatedVersions,
      sunsetVersions: this.config.sunsetVersions,
      compatibilityMatrix: Object.fromEntries(this.compatibilityMatrix),
      migrationPaths: {},
      statistics: {
        totalVersions: this.config.supportedVersions.length + this.config.deprecatedVersions.length + this.config.sunsetVersions.length,
        supportedCount: this.config.supportedVersions.length,
        deprecatedCount: this.config.deprecatedVersions.length,
        sunsetCount: this.config.sunsetVersions.length,
        totalRoutes: Array.from(this.routes.values()).reduce((sum, routes) => sum + routes.size, 0),
        totalMigrations: Array.from(this.migrations.values()).reduce((sum, migrations) => sum + migrations.size, 0)
      }
    };

    // Generate migration paths
    for (const fromVersion of this.migrations.keys()) {
      report.migrationPaths[fromVersion] = this.findMigrationPath(fromVersion) || [];
    }

    return report;
  }

  // Event handlers
  handleVersionDeprecated(deprecation) {
    console.warn(`⚠️  Version deprecated: ${deprecation.version}`);
    console.warn(`   Sunset at: ${deprecation.sunsetAt}`);
    console.warn(`   Reason: ${deprecation.reason}`);
  }

  handleVersionSunset(sunset) {
    console.error(`🌅 Version sunset: ${sunset.version}`);
    console.error(`   Reason: ${sunset.reason}`);
  }

  handleRouteAdded(route) {
    console.log(`🛣️  Route added: ${route.version} ${route.method} ${route.path}`);
  }

  handleRouteMigrated(migration) {
    console.log(`🔄 Route migrated: ${migration.fromVersion} -> ${migration.toVersion}`);
  }

  /**
   * Health check
   */
  async healthCheck() {
    return {
      status: 'healthy',
      version: this.config.defaultVersion,
      supportedVersions: this.config.supportedVersions,
      totalRoutes: Array.from(this.routes.values()).reduce((sum, routes) => sum + routes.size, 0),
      totalMigrations: Array.from(this.migrations.values()).reduce((sum, migrations) => sum + migrations.size, 0)
    };
  }
}

module.exports = APIVersionManager;