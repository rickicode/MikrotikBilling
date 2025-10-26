const EventEmitter = require('events');

/**
 * Database Health Monitoring and Diagnostics System
 * Provides comprehensive health monitoring with:
 * - Real-time health checks
 * - Performance metrics tracking
 * - Database diagnostics and analysis
 * - Alert management and notifications
 * - Historical health data
 * - Automated recovery suggestions
 */
class HealthMonitor extends EventEmitter {
  constructor(connectionPool, options = {}) {
    super();
    
    this.connectionPool = connectionPool;
    this.options = {
      interval: options.interval || 30000, // 30 seconds
      enableAlerts: options.enableAlerts !== false,
      alertThresholds: {
        connectionUsage: options.alertThresholds?.connectionUsage || 80, // percentage
        responseTime: options.alertThresholds?.responseTime || 5000, // milliseconds
        errorRate: options.alertThresholds?.errorRate || 5, // percentage
        queueLength: options.alertThresholds?.queueLength || 10,
        replicationLag: options.alertThresholds?.replicationLag || 30000, // milliseconds
        diskUsage: options.alertThresholds?.diskUsage || 85, // percentage
        memoryUsage: options.alertThresholds?.memoryUsage || 85, // percentage
        ...options.alertThresholds
      },
      enableDiagnostics: options.enableDiagnostics !== false,
      enableMetrics: options.enableMetrics !== false,
      metricsRetentionDays: options.metricsRetentionDays || 7,
      enableAutoRecovery: options.enableAutoRecovery || false,
      recoveryActions: options.recoveryActions || {},
      ...options
    };
    
    // Health status tracking
    this.currentHealthStatus = {
      overall: 'unknown',
      pools: new Map(),
      database: {
        connected: false,
        version: null,
        size: null,
        uptime: null,
        connections: {
          active: 0,
          idle: 0,
          total: 0,
          max: 0
        }
      },
      performance: {
        averageResponseTime: 0,
        queriesPerSecond: 0,
        errorRate: 0,
        slowQueries: 0
      },
      resources: {
        disk: { used: 0, total: 0, percentage: 0 },
        memory: { used: 0, total: 0, percentage: 0 },
        cpu: { usage: 0 }
      },
      replication: {
        enabled: false,
        lag: 0,
        status: 'unknown'
      },
      lastCheck: null,
      uptime: 0
    };
    
    // Historical metrics
    this.metricsHistory = [];
    this.maxHistorySize = Math.ceil((this.options.metricsRetentionDays * 24 * 60 * 60 * 1000) / this.options.interval);
    
    // Alert management
    this.activeAlerts = new Map();
    this.alertHistory = [];
    this.alertCooldowns = new Map();
    
    // Diagnostics cache
    this.diagnosticsCache = new Map();
    this.lastDiagnosticsRun = null;
    
    // Performance tracking
    this.performanceMetrics = {
      queryTimes: [],
      errorCounts: [],
      queryCounts: [],
      lastReset: Date.now()
    };
    
    this.isInitialized = false;
    this.monitoringTimer = null;
    this.startTime = Date.now();
  }
  
  /**
   * Initialize the health monitor
   */
  async initialize() {
    try {
      // Perform initial health check
      await this.performHealthCheck();
      
      // Start continuous monitoring
      this.startMonitoring();
      
      // Setup event listeners
      this.setupEventListeners();
      
      this.isInitialized = true;
      console.log('Database health monitor initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize health monitor:', error);
      throw error;
    }
  }
  
  /**
   * Start continuous health monitoring
   */
  startMonitoring() {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }
    
    this.monitoringTimer = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        console.error('Health check failed:', error.message);
        this.emit('healthCheckError', error);
      }
    }, this.options.interval);
  }
  
  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    const checkStartTime = Date.now();
    
    try {
      // Check connection pool health
      const poolHealth = await this.checkPoolHealth();
      
      // Check database health
      const dbHealth = await this.checkDatabaseHealth();
      
      // Check performance metrics
      const performanceHealth = await this.checkPerformanceHealth();
      
      // Check resource usage
      const resourceHealth = await this.checkResourceHealth();
      
      // Check replication health
      const replicationHealth = await this.checkReplicationHealth();
      
      // Update overall health status
      this.updateOverallHealth({
        pools: poolHealth,
        database: dbHealth,
        performance: performanceHealth,
        resources: resourceHealth,
        replication: replicationHealth
      });
      
      // Store metrics
      this.storeMetrics();
      
      // Check for alerts
      if (this.options.enableAlerts) {
        await this.checkAlerts();
      }
      
      // Run diagnostics if needed
      if (this.options.enableDiagnostics && this.shouldRunDiagnostics()) {
        await this.runDiagnostics();
      }
      
      this.currentHealthStatus.lastCheck = Date.now();
      this.currentHealthStatus.uptime = Date.now() - this.startTime;
      
      const checkDuration = Date.now() - checkStartTime;
      
      this.emit('healthCheckCompleted', {
        status: this.currentHealthStatus.overall,
        duration: checkDuration,
        timestamp: this.currentHealthStatus.lastCheck
      });
      
    } catch (error) {
      console.error('Health check failed:', error);
      
      this.currentHealthStatus.overall = 'unhealthy';
      this.currentHealthStatus.lastCheck = Date.now();
      
      this.emit('healthCheckFailed', {
        error: error.message,
        timestamp: this.currentHealthStatus.lastCheck
      });
      
      // Create alert for health check failure
      await this.createAlert('health_check_failure', 'critical', {
        error: error.message,
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * Check connection pool health
   */
  async checkPoolHealth() {
    const poolHealth = new Map();
    
    try {
      const poolStats = this.connectionPool.getStatistics();
      
      for (const [poolName, stats] of Object.entries(poolStats.pools)) {
        const health = {
          status: 'healthy',
          totalCount: stats.totalCount || 0,
          idleCount: stats.idleCount || 0,
          waitingCount: stats.waitingCount || 0,
          connectionUsage: 0,
          responseTime: stats.health?.responseTime || 0,
          lastCheck: Date.now(),
          circuitBreakerState: stats.circuitBreakerState || 'closed',
          errors: []
        };
        
        // Calculate connection usage percentage
        if (stats.totalCount > 0) {
          health.connectionUsage = ((stats.totalCount - stats.idleCount) / stats.totalCount) * 100;
        }
        
        // Determine health status
        if (health.circuitBreakerState === 'open') {
          health.status = 'unhealthy';
          health.errors.push('Circuit breaker is open');
        } else if (health.connectionUsage > this.options.alertThresholds.connectionUsage) {
          health.status = 'degraded';
          health.errors.push(`High connection usage: ${health.connectionUsage.toFixed(1)}%`);
        } else if (health.responseTime > this.options.alertThresholds.responseTime) {
          health.status = 'degraded';
          health.errors.push(`High response time: ${health.responseTime}ms`);
        }
        
        if (stats.health?.status === 'unhealthy') {
          health.status = 'unhealthy';
          health.errors.push(stats.health.error || 'Pool health check failed');
        }
        
        poolHealth.set(poolName, health);
      }
      
    } catch (error) {
      console.error('Pool health check failed:', error.message);
      
      // Mark all pools as unhealthy
      for (const poolName of this.connectionPool.pools.keys()) {
        poolHealth.set(poolName, {
          status: 'unhealthy',
          errors: [error.message],
          lastCheck: Date.now()
        });
      }
    }
    
    this.currentHealthStatus.pools = poolHealth;
    return poolHealth;
  }
  
  /**
   * Check database health
   */
  async checkDatabaseHealth() {
    const dbHealth = { ...this.currentHealthStatus.database };
    
    try {
      // Basic connectivity test
      const result = await this.connectionPool.query('SELECT 1 as health_check, version() as version');
      
      dbHealth.connected = true;
      dbHealth.version = result.rows[0].version;
      
      // Get database size
      const sizeResult = await this.connectionPool.query(`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size
      `);
      dbHealth.size = sizeResult.rows[0].size;
      
      // Get connection statistics
      const connResult = await this.connectionPool.query(`
        SELECT 
          count(*) as total_connections,
          count(*) FILTER (WHERE state = 'active') as active_connections,
          count(*) FILTER (WHERE state = 'idle') as idle_connections
        FROM pg_stat_activity
        WHERE datname = current_database()
      `);
      
      const connStats = connResult.rows[0];
      dbHealth.connections = {
        active: parseInt(connStats.active_connections),
        idle: parseInt(connStats.idle_connections),
        total: parseInt(connStats.total_connections),
        max: this.connectionPool.pools.get('primary')?.options?.max || 20
      };
      
      // Get database uptime
      const uptimeResult = await this.connectionPool.query(`
        SELECT pg_postmaster_start_time() as start_time
      `);
      dbHealth.uptime = Date.now() - new Date(uptimeResult.rows[0].start_time).getTime();
      
    } catch (error) {
      console.error('Database health check failed:', error.message);
      
      dbHealth.connected = false;
      dbHealth.errors = [error.message];
    }
    
    this.currentHealthStatus.database = dbHealth;
    return dbHealth;
  }
  
  /**
   * Check performance health
   */
  async checkPerformanceHealth() {
    const perfHealth = { ...this.currentHealthStatus.performance };
    
    try {
      // Calculate average response time from recent queries
      if (this.performanceMetrics.queryTimes.length > 0) {
        const recentTimes = this.performanceMetrics.queryTimes.slice(-100); // Last 100 queries
        perfHealth.averageResponseTime = recentTimes.reduce((a, b) => a + b, 0) / recentTimes.length;
      }
      
      // Calculate queries per second
      const timeWindow = Date.now() - this.performanceMetrics.lastReset;
      if (timeWindow > 0) {
        perfHealth.queriesPerSecond = (this.performanceMetrics.queryCounts.reduce((a, b) => a + b, 0) / timeWindow) * 1000;
      }
      
      // Calculate error rate
      const totalQueries = this.performanceMetrics.queryCounts.reduce((a, b) => a + b, 0);
      const totalErrors = this.performanceMetrics.errorCounts.reduce((a, b) => a + b, 0);
      
      if (totalQueries > 0) {
        perfHealth.errorRate = (totalErrors / totalQueries) * 100;
      }
      
      // Count slow queries
      perfHealth.slowQueries = this.performanceMetrics.queryTimes.filter(
        time => time > (this.options.alertThresholds.responseTime || 5000)
      ).length;
      
      // Get database performance statistics
      const perfResult = await this.connectionPool.query(`
        SELECT 
          sum(xact_commit) as total_commits,
          sum(xact_rollback) as total_rollbacks,
          sum(tup_returned) as tuples_returned,
          sum(tup_fetched) as tuples_fetched,
          sum(tup_inserted) as tuples_inserted,
          sum(tup_updated) as tuples_updated,
          sum(tup_deleted) as tuples_deleted
        FROM pg_stat_database
        WHERE datname = current_database()
      `);
      
      if (perfResult.rows.length > 0) {
        perfHealth.databaseStats = perfResult.rows[0];
      }
      
    } catch (error) {
      console.error('Performance health check failed:', error.message);
      perfHealth.errors = [error.message];
    }
    
    this.currentHealthStatus.performance = perfHealth;
    return perfHealth;
  }
  
  /**
   * Check resource health
   */
  async checkResourceHealth() {
    const resourceHealth = { ...this.currentHealthStatus.resources };
    
    try {
      // Check disk usage
      const diskResult = await this.connectionPool.query(`
        SELECT 
          pg_size_pretty(pg_database_size(current_database())) as database_size,
          (pg_database_size(current_database()) / 
           (SELECT sum(pg_database_size(oid)) FROM pg_database)) * 100 as usage_percentage
      `);
      
      if (diskResult.rows.length > 0) {
        resourceHealth.disk = {
          used: diskResult.rows[0].database_size,
          percentage: parseFloat(diskResult.rows[0].usage_percentage)
        };
      }
      
      // Check memory usage (approximation through cache statistics)
      const memoryResult = await this.connectionPool.query(`
        SELECT 
          sum(blks_hit) as cache_hits,
          sum(blks_read) as cache_reads,
          sum(blks_hit) + sum(blks_read) as total_reads
        FROM pg_stat_database
        WHERE datname = current_database()
      `);
      
      if (memoryResult.rows.length > 0 && memoryResult.rows[0].total_reads > 0) {
        const cacheHitRatio = (memoryResult.rows[0].cache_hits / memoryResult.rows[0].total_reads) * 100;
        resourceHealth.memory = {
          cacheHitRatio,
          used: 0, // PostgreSQL doesn't easily expose memory usage
          percentage: 100 - cacheHitRatio // Inverse of cache hit ratio as indicator
        };
      }
      
      // Check table and index bloat
      const bloatResult = await this.connectionPool.query(`
        SELECT 
          sum(CASE WHEN bloat_ratio > 0.2 THEN 1 ELSE 0 END) as bloated_tables,
          count(*) as total_tables
        FROM (
          SELECT 
            schemaname,
            tablename,
            (pg_total_relation_size(schemaname||'.'||tablename) - 
             pg_relation_size(schemaname||'.'||tablename))::float / 
            pg_total_relation_size(schemaname||'.'||tablename) as bloat_ratio
          FROM pg_tables
          WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
        ) bloat_stats
      `);
      
      if (bloatResult.rows.length > 0) {
        resourceHealth.bloat = {
          bloatedTables: parseInt(bloatResult.rows[0].bloated_tables),
          totalTables: parseInt(bloatResult.rows[0].total_tables)
        };
      }
      
    } catch (error) {
      console.error('Resource health check failed:', error.message);
      resourceHealth.errors = [error.message];
    }
    
    this.currentHealthStatus.resources = resourceHealth;
    return resourceHealth;
  }
  
  /**
   * Check replication health
   */
  async checkReplicationHealth() {
    const replicationHealth = { ...this.currentHealthStatus.replication };
    
    try {
      // Check if replication is enabled
      const replicaCount = this.connectionPool.replicaPools.size;
      replicationHealth.enabled = replicaCount > 0;
      
      if (replicaCount > 0) {
        // Check replication lag for each replica
        const replicaHealth = [];
        
        for (const [replicaName, replica] of this.connectionPool.replicaPools) {
          try {
            const lagResult = await replica.pool.query(`
              SELECT 
                pg_last_xact_replay_timestamp() as last_replay,
                now() - pg_last_xact_replay_timestamp() as replication_lag
            `);
            
            if (lagResult.rows.length > 0) {
              const lag = lagResult.rows[0].replication_lag;
              const lagMs = lag ? lag.getTime() : 0;
              
              replicaHealth.push({
                name: replicaName,
                host: replica.config.host,
                lag: lagMs,
                status: lagMs > this.options.alertThresholds.replicationLag ? 'lagging' : 'healthy',
                lastReplay: lagResult.rows[0].last_replay
              });
            }
            
          } catch (error) {
            replicaHealth.push({
              name: replicaName,
              host: replica.config.host,
              status: 'error',
              error: error.message
            });
          }
        }
        
        replicationHealth.replicas = replicaHealth;
        
        // Calculate overall replication lag (maximum of all replicas)
        const validLags = replicaHealth
          .filter(r => r.lag !== undefined)
          .map(r => r.lag);
        
        if (validLags.length > 0) {
          replicationHealth.lag = Math.max(...validLags);
          replicationHealth.status = replicationHealth.lag > this.options.alertThresholds.replicationLag 
            ? 'lagging' 
            : 'healthy';
        }
      }
      
    } catch (error) {
      console.error('Replication health check failed:', error.message);
      replicationHealth.errors = [error.message];
      replicationHealth.status = 'error';
    }
    
    this.currentHealthStatus.replication = replicationHealth;
    return replicationHealth;
  }
  
  /**
   * Update overall health status
   */
  updateOverallHealth(healthData) {
    let overallStatus = 'healthy';
    const issues = [];
    
    // Check pool health
    for (const [poolName, poolHealth] of healthData.pools) {
      if (poolHealth.status === 'unhealthy') {
        overallStatus = 'unhealthy';
        issues.push(`Pool ${poolName} is unhealthy`);
      } else if (poolHealth.status === 'degraded' && overallStatus === 'healthy') {
        overallStatus = 'degraded';
      }
    }
    
    // Check database connectivity
    if (!healthData.database.connected) {
      overallStatus = 'unhealthy';
      issues.push('Database is not connected');
    }
    
    // Check performance metrics
    if (healthData.performance.errorRate > this.options.alertThresholds.errorRate) {
      overallStatus = 'unhealthy';
      issues.push(`High error rate: ${healthData.performance.errorRate.toFixed(1)}%`);
    }
    
    if (healthData.performance.averageResponseTime > this.options.alertThresholds.responseTime) {
      if (overallStatus === 'healthy') overallStatus = 'degraded';
      issues.push(`High response time: ${healthData.performance.averageResponseTime.toFixed(0)}ms`);
    }
    
    // Check resource usage
    if (healthData.resources.disk.percentage > this.options.alertThresholds.diskUsage) {
      if (overallStatus === 'healthy') overallStatus = 'degraded';
      issues.push(`High disk usage: ${healthData.resources.disk.percentage.toFixed(1)}%`);
    }
    
    // Check replication
    if (healthData.replication.enabled && healthData.replication.status === 'lagging') {
      if (overallStatus === 'healthy') overallStatus = 'degraded';
      issues.push(`Replication lag: ${healthData.replication.lag}ms`);
    }
    
    this.currentHealthStatus.overall = overallStatus;
    this.currentHealthStatus.issues = issues;
    
    this.emit('healthStatusChanged', {
      status: overallStatus,
      issues,
      timestamp: Date.now()
    });
  }
  
  /**
   * Store metrics for historical tracking
   */
  storeMetrics() {
    const metrics = {
      timestamp: Date.now(),
      status: this.currentHealthStatus.overall,
      performance: { ...this.currentHealthStatus.performance },
      resources: { ...this.currentHealthStatus.resources },
      connections: Array.from(this.currentHealthStatus.pools.values()).map(pool => ({
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        usage: pool.connectionUsage
      }))
    };
    
    this.metricsHistory.push(metrics);
    
    // Trim history if it exceeds maximum size
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift();
    }
    
    // Clean up old performance metrics
    this.cleanupPerformanceMetrics();
  }
  
  /**
   * Check for alerts and create them if thresholds are exceeded
   */
  async checkAlerts() {
    const alerts = [];
    
    // Check connection pool alerts
    for (const [poolName, poolHealth] of this.currentHealthStatus.pools) {
      if (poolHealth.connectionUsage > this.options.alertThresholds.connectionUsage) {
        alerts.push({
          type: 'connection_usage',
          severity: 'warning',
          pool: poolName,
          value: poolHealth.connectionUsage,
          threshold: this.options.alertThresholds.connectionUsage
        });
      }
      
      if (poolHealth.circuitBreakerState === 'open') {
        alerts.push({
          type: 'circuit_breaker_open',
          severity: 'critical',
          pool: poolName
        });
      }
    }
    
    // Check performance alerts
    if (this.currentHealthStatus.performance.errorRate > this.options.alertThresholds.errorRate) {
      alerts.push({
        type: 'high_error_rate',
        severity: 'critical',
        value: this.currentHealthStatus.performance.errorRate,
        threshold: this.options.alertThresholds.errorRate
      });
    }
    
    if (this.currentHealthStatus.performance.averageResponseTime > this.options.alertThresholds.responseTime) {
      alerts.push({
        type: 'high_response_time',
        severity: 'warning',
        value: this.currentHealthStatus.performance.averageResponseTime,
        threshold: this.options.alertThresholds.responseTime
      });
    }
    
    // Check resource alerts
    if (this.currentHealthStatus.resources.disk.percentage > this.options.alertThresholds.diskUsage) {
      alerts.push({
        type: 'high_disk_usage',
        severity: 'warning',
        value: this.currentHealthStatus.resources.disk.percentage,
        threshold: this.options.alertThresholds.diskUsage
      });
    }
    
    // Check replication alerts
    if (this.currentHealthStatus.replication.lag > this.options.alertThresholds.replicationLag) {
      alerts.push({
        type: 'replication_lag',
        severity: 'warning',
        value: this.currentHealthStatus.replication.lag,
        threshold: this.options.alertThresholds.replicationLag
      });
    }
    
    // Create alerts
    for (const alertData of alerts) {
      await this.createAlert(alertData.type, alertData.severity, alertData);
    }
  }
  
  /**
   * Create an alert
   */
  async createAlert(type, severity, data) {
    const alertId = `${type}_${Date.now()}`;
    const now = Date.now();
    
    // Check cooldown period
    const cooldownKey = `${type}_${severity}`;
    if (this.alertCooldowns.has(cooldownKey)) {
      const lastAlert = this.alertCooldowns.get(cooldownKey);
      if (now - lastAlert < 300000) { // 5 minute cooldown
        return; // Skip alert due to cooldown
      }
    }
    
    const alert = {
      id: alertId,
      type,
      severity,
      data,
      createdAt: now,
      acknowledged: false,
      resolved: false
    };
    
    this.activeAlerts.set(alertId, alert);
    this.alertHistory.push(alert);
    this.alertCooldowns.set(cooldownKey, now);
    
    this.emit('alertCreated', alert);
    
    // Attempt auto-recovery if enabled
    if (this.options.enableAutoRecovery && this.options.recoveryActions[type]) {
      await this.attemptRecovery(type, alert);
    }
    
    console.warn(`Database alert [${severity.toUpperCase()}]: ${type}`, data);
  }
  
  /**
   * Attempt automatic recovery for an alert
   */
  async attemptRecovery(alertType, alert) {
    try {
      const recoveryAction = this.options.recoveryActions[alertType];
      if (!recoveryAction) {
        return;
      }
      
      console.log(`Attempting auto-recovery for alert: ${alertType}`);
      
      // Execute recovery action based on type
      switch (alertType) {
        case 'connection_usage':
          // Try to increase pool size or close idle connections
          await this.recoverConnectionUsage(alert);
          break;
          
        case 'high_response_time':
          // Try to clear query cache or restart slow connections
          await this.recoverHighResponseTime(alert);
          break;
          
        case 'replication_lag':
          // Try to restart replication
          await this.recoverReplicationLag(alert);
          break;
          
        default:
          console.log(`No recovery action defined for alert type: ${alertType}`);
      }
      
      this.emit('recoveryAttempted', { alertType, alert });
      
    } catch (error) {
      console.error(`Auto-recovery failed for alert ${alertType}:`, error.message);
      this.emit('recoveryFailed', { alertType, alert, error: error.message });
    }
  }
  
  /**
   * Recovery actions for specific alert types
   */
  async recoverConnectionUsage(alert) {
    // Implementation would depend on connection pool capabilities
    console.log('Recovering from high connection usage...');
  }
  
  async recoverHighResponseTime(alert) {
    // Clear query caches if available
    if (this.connectionPool.queryOptimizer) {
      this.connectionPool.queryOptimizer.clearCaches();
    }
  }
  
  async recoverReplicationLag(alert) {
    // Attempt to restart replication
    console.log('Attempting to recover from replication lag...');
  }
  
  /**
   * Check if diagnostics should be run
   */
  shouldRunDiagnostics() {
    if (!this.lastDiagnosticsRun) {
      return true;
    }
    
    // Run diagnostics if health is degraded or unhealthy
    if (this.currentHealthStatus.overall !== 'healthy') {
      return true;
    }
    
    // Run diagnostics every hour
    return Date.now() - this.lastDiagnosticsRun > 3600000;
  }
  
  /**
   * Run comprehensive diagnostics
   */
  async runDiagnostics() {
    try {
      console.log('Running database diagnostics...');
      
      const diagnostics = {
        timestamp: Date.now(),
        databaseInfo: await this.getDatabaseInfo(),
        tableStats: await this.getTableStatistics(),
        indexStats: await this.getIndexStatistics(),
        slowQueries: await this.getSlowQueries(),
        locks: await this.getLockInformation(),
        configuration: await this.getDatabaseConfiguration()
      };
      
      this.diagnosticsCache.set('latest', diagnostics);
      this.lastDiagnosticsRun = Date.now();
      
      this.emit('diagnosticsCompleted', diagnostics);
      
    } catch (error) {
      console.error('Diagnostics failed:', error.message);
      this.emit('diagnosticsFailed', error);
    }
  }
  
  /**
   * Get detailed database information
   */
  async getDatabaseInfo() {
    try {
      const result = await this.connectionPool.query(`
        SELECT 
          current_database() as database_name,
          version() as version,
          pg_size_pretty(pg_database_size(current_database())) as size,
          pg_postmaster_start_time() as start_time,
          (pg_stat_file('base/postmaster.pid')).modification as restart_time
      `);
      
      return result.rows[0];
    } catch (error) {
      return { error: error.message };
    }
  }
  
  /**
   * Get table statistics
   */
  async getTableStatistics() {
    try {
      const result = await this.connectionPool.query(`
        SELECT 
          schemaname,
          tablename,
          n_tup_ins as inserts,
          n_tup_upd as updates,
          n_tup_del as deletes,
          n_live_tup as live_tuples,
          n_dead_tup as dead_tuples,
          last_vacuum,
          last_autovacuum,
          last_analyze,
          last_autoanalyze
        FROM pg_stat_user_tables
        ORDER BY n_live_tup DESC
        LIMIT 20
      `);
      
      return result.rows;
    } catch (error) {
      return { error: error.message };
    }
  }
  
  /**
   * Get index statistics
   */
  async getIndexStatistics() {
    try {
      const result = await this.connectionPool.query(`
        SELECT 
          schemaname,
          tablename,
          indexname,
          idx_scan as index_scans,
          idx_tup_read as tuples_read,
          idx_tup_fetch as tuples_fetched,
          pg_size_pretty(pg_relation_size(indexrelid)) as index_size
        FROM pg_stat_user_indexes
        ORDER BY idx_scan DESC
        LIMIT 20
      `);
      
      return result.rows;
    } catch (error) {
      return { error: error.message };
    }
  }
  
  /**
   * Get slow queries (if pg_stat_statements is available)
   */
  async getSlowQueries() {
    try {
      const result = await this.connectionPool.query(`
        SELECT 
          query,
          calls,
          total_exec_time,
          mean_exec_time,
          rows
        FROM pg_stat_statements
        WHERE mean_exec_time > 1000
        ORDER BY mean_exec_time DESC
        LIMIT 10
      `);
      
      return result.rows;
    } catch (error) {
      return { error: 'pg_stat_statements extension not available' };
    }
  }
  
  /**
   * Get lock information
   */
  async getLockInformation() {
    try {
      const result = await this.connectionPool.query(`
        SELECT 
          l.locktype,
          l.mode,
          l.relation::regclass as relation,
          a.usename as username,
          a.query as current_query,
          a.wait_event_type,
          a.wait_event
        FROM pg_locks l
        JOIN pg_stat_activity a ON l.pid = a.pid
        WHERE NOT l.granted
          AND a.datname = current_database()
        ORDER BY a.query_start
      `);
      
      return result.rows;
    } catch (error) {
      return { error: error.message };
    }
  }
  
  /**
   * Get database configuration
   */
  async getDatabaseConfiguration() {
    try {
      const result = await this.connectionPool.query(`
        SELECT name, setting, unit, short_desc
        FROM pg_settings
        WHERE name IN (
          'max_connections',
          'shared_buffers',
          'effective_cache_size',
          'work_mem',
          'maintenance_work_mem',
          'checkpoint_completion_target',
          'wal_buffers',
          'default_statistics_target'
        )
        ORDER BY name
      `);
      
      return result.rows;
    } catch (error) {
      return { error: error.message };
    }
  }
  
  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Listen to connection pool events
    this.connectionPool.on('queryFailed', (event) => {
      this.recordQueryError(event.duration);
    });
    
    this.connectionPool.on('queryExecuted', (event) => {
      this.recordQueryExecution(event.duration);
    });
  }
  
  /**
   * Record query execution metrics
   */
  recordQueryExecution(duration) {
    this.performanceMetrics.queryTimes.push(duration);
    
    // Keep only recent metrics
    if (this.performanceMetrics.queryTimes.length > 1000) {
      this.performanceMetrics.queryTimes.shift();
    }
    
    // Increment query count for current time window
    const currentWindow = Math.floor(Date.now() / 60000); // 1-minute windows
    if (!this.performanceMetrics.queryCounts[currentWindow]) {
      this.performanceMetrics.queryCounts[currentWindow] = 0;
    }
    this.performanceMetrics.queryCounts[currentWindow]++;
  }
  
  /**
   * Record query error
   */
  recordQueryError(duration) {
    // Increment error count for current time window
    const currentWindow = Math.floor(Date.now() / 60000); // 1-minute windows
    if (!this.performanceMetrics.errorCounts[currentWindow]) {
      this.performanceMetrics.errorCounts[currentWindow] = 0;
    }
    this.performanceMetrics.errorCounts[currentWindow]++;
  }
  
  /**
   * Clean up old performance metrics
   */
  cleanupPerformanceMetrics() {
    const cutoffTime = Date.now() - 3600000; // Keep 1 hour of data
    const cutoffWindow = Math.floor(cutoffTime / 60000);
    
    // Clean up query counts
    Object.keys(this.performanceMetrics.queryCounts).forEach(window => {
      if (parseInt(window) < cutoffWindow) {
        delete this.performanceMetrics.queryCounts[window];
      }
    });
    
    // Clean up error counts
    Object.keys(this.performanceMetrics.errorCounts).forEach(window => {
      if (parseInt(window) < cutoffWindow) {
        delete this.performanceMetrics.errorCounts[window];
      }
    });
    
    // Reset if window is too old
    if (Date.now() - this.performanceMetrics.lastReset > 3600000) {
      this.performanceMetrics.lastReset = Date.now();
    }
  }
  
  /**
   * Get current health status
   */
  async getHealthStatus() {
    return {
      ...this.currentHealthStatus,
      pools: Object.fromEntries(this.currentHealthStatus.pools),
      activeAlerts: Array.from(this.activeAlerts.values()),
      metricsHistory: this.metricsHistory.slice(-100), // Last 100 data points
      uptime: Date.now() - this.startTime
    };
  }
  
  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      current: this.currentHealthStatus.performance,
      history: this.metricsHistory,
      alerts: {
        active: Array.from(this.activeAlerts.values()),
        history: this.alertHistory.slice(-50) // Last 50 alerts
      }
    };
  }
  
  /**
   * Get diagnostics information
   */
  getDiagnostics() {
    return this.diagnosticsCache.get('latest') || null;
  }
  
  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId) {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedAt = Date.now();
      this.emit('alertAcknowledged', alert);
      return true;
    }
    return false;
  }
  
  /**
   * Resolve an alert
   */
  resolveAlert(alertId) {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
      this.activeAlerts.delete(alertId);
      this.emit('alertResolved', alert);
      return true;
    }
    return false;
  }
  
  /**
   * Shutdown the health monitor
   */
  async shutdown() {
    // Stop monitoring
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
    
    // Resolve all active alerts
    for (const alertId of this.activeAlerts.keys()) {
      this.resolveAlert(alertId);
    }
    
    this.emit('shutdown');
    console.log('Database health monitor shutdown complete');
  }
}

module.exports = HealthMonitor;