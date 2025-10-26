const crypto = require('crypto');
const EventEmitter = require('events');
const LRUCache = require('../services/LRUCache');

/**
 * Query Optimization and Caching System
 * Provides intelligent query optimization with:
 * - Query plan caching and optimization
 * - Automatic query parameter binding
 * - Slow query detection and logging
 * - Query result caching with intelligent invalidation
 * - Batch query optimization
 * - Index usage analysis and recommendations
 */
class QueryOptimizer extends EventEmitter {
  constructor(connectionPool, options = {}) {
    super();
    
    this.connectionPool = connectionPool;
    this.options = {
      enableCaching: options.enableCaching !== false,
      cacheSize: options.cacheSize || 1000,
      cacheTTL: options.cacheTTL || 300000, // 5 minutes
      slowQueryThreshold: options.slowQueryThreshold || 1000,
      enablePlanCache: options.enablePlanCache !== false,
      enableParameterBinding: options.enableParameterBinding !== false,
      enableBatchOptimization: options.enableBatchOptimization !== false,
      enableIndexAnalysis: options.enableIndexAnalysis !== false,
      maxBatchSize: options.maxBatchSize || 1000,
      ...options
    };
    
    // Initialize caches
    this.queryPlanCache = new LRUCache(this.options.cacheSize);
    this.resultCache = new LRUCache(this.options.cacheSize);
    this.preparedStatements = new Map();
    
    // Metrics tracking
    this.metrics = {
      totalQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      slowQueries: 0,
      optimizedQueries: 0,
      batchQueries: 0,
      planCacheHits: 0,
      planCacheMisses: 0,
      averageExecutionTime: 0,
      totalExecutionTime: 0
    };
    
    // Query execution times for average calculation
    this.executionTimes = [];
    this.maxExecutionTimeSamples = 1000;
    
    // Index analysis data
    this.indexUsageStats = new Map();
    this.tableIndexInfo = new Map();
    
    this.isInitialized = false;
  }
  
  /**
   * Initialize the query optimizer
   */
  async initialize() {
    try {
      // Load table and index information
      if (this.options.enableIndexAnalysis) {
        await this.loadIndexInformation();
      }
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Start periodic tasks
      this.startPeriodicTasks();
      
      this.isInitialized = true;
      console.log('Query optimizer initialized successfully');
    } catch (error) {
      console.error('Failed to initialize query optimizer:', error);
      throw error;
    }
  }
  
  /**
   * Execute optimized query
   */
  async query(sql, params = [], options = {}) {
    const startTime = Date.now();
    const queryId = this.generateQueryId();
    
    try {
      this.metrics.totalQueries++;
      
      const {
        useCache = this.options.enableCaching,
        usePlanCache = this.options.enablePlanCache,
        operation = 'read',
        requestId,
        timeout
      } = options;
      
      // Optimize the query
      const optimizedQuery = await this.optimizeQuery(sql, params, {
        usePlanCache,
        operation
      });
      
      // Check result cache for SELECT queries
      let result;
      if (useCache && this.isSelectQuery(sql) && !this.hasNonDeterministicFunctions(sql)) {
        const cacheKey = this.generateCacheKey(optimizedQuery.sql, optimizedQuery.params);
        result = this.resultCache.get(cacheKey);
        
        if (result) {
          this.metrics.cacheHits++;
          this.recordQueryMetrics(startTime, true, true);
          
          this.emit('queryCacheHit', {
            queryId,
            sql: this.sanitizeSql(sql),
            cacheKey,
            requestId
          });
          
          return result;
        }
        
        this.metrics.cacheMisses++;
      }
      
      // Execute the query
      result = await this.connectionPool.query(optimizedQuery.sql, optimizedQuery.params, {
        operation,
        requestId,
        timeout
      });
      
      // Cache the result if applicable
      if (useCache && result && this.isSelectQuery(sql) && !this.hasNonDeterministicFunctions(sql)) {
        const cacheKey = this.generateCacheKey(optimizedQuery.sql, optimizedQuery.params);
        this.resultCache.set(cacheKey, result, this.options.cacheTTL);
        
        this.emit('queryCached', {
          queryId,
          sql: this.sanitizeSql(sql),
          cacheKey,
          ttl: this.options.cacheTTL,
          requestId
        });
      }
      
      // Record metrics
      this.recordQueryMetrics(startTime, true, false);
      this.metrics.optimizedQueries++;
      
      this.emit('queryExecuted', {
        queryId,
        sql: this.sanitizeSql(sql),
        optimizedSql: this.sanitizeSql(optimizedQuery.sql),
        executionTime: Date.now() - startTime,
        cacheHit: false,
        requestId
      });
      
      return result;
      
    } catch (error) {
      this.recordQueryMetrics(startTime, false, false);
      
      this.emit('queryFailed', {
        queryId,
        sql: this.sanitizeSql(sql),
        error: error.message,
        executionTime: Date.now() - startTime,
        requestId
      });
      
      throw error;
    }
  }
  
  /**
   * Execute prepared statement
   */
  async preparedQuery(name, sql, params = [], options = {}) {
    const startTime = Date.now();
    
    try {
      // Check if statement is already prepared
      if (!this.preparedStatements.has(name)) {
        await this.prepareStatement(name, sql);
      }
      
      // Execute prepared statement
      const result = await this.connectionPool.query(
        `EXECUTE ${name}(${params.map((_, i) => `$${i + 1}`).join(', ')})`,
        params,
        options
      );
      
      this.recordQueryMetrics(startTime, true, false);
      
      return result;
      
    } catch (error) {
      this.recordQueryMetrics(startTime, false, false);
      
      // Remove broken prepared statement
      this.preparedStatements.delete(name);
      
      throw error;
    }
  }
  
  /**
   * Execute batch queries
   */
  async batchQuery(queries, options = {}) {
    const startTime = Date.now();
    const batchId = this.generateBatchId();
    
    try {
      const {
        batchSize = this.options.maxBatchSize,
        transaction = true,
        operation = 'write'
      } = options;
      
      this.metrics.batchQueries++;
      
      // Split queries into batches
      const batches = this.createBatches(queries, batchSize);
      const results = [];
      
      if (transaction) {
        // Execute all batches in a single transaction
        const batchResults = await this.connectionPool.transaction(
          batches.map(batch => ({
            sql: this.optimizeBatchSql(batch),
            params: this.flattenBatchParams(batch)
          }))
        );
        
        results.push(...batchResults.map(r => r.rows).flat());
        
      } else {
        // Execute batches separately
        for (const batch of batches) {
          const optimizedBatch = batch.map(q => this.optimizeQuery(q.sql, q.params));
          
          const batchResult = await this.connectionPool.query(
            this.optimizeBatchSql(optimizedBatch),
            this.flattenBatchParams(optimizedBatch),
            { operation }
          );
          
          results.push(...batchResult.rows);
        }
      }
      
      const executionTime = Date.now() - startTime;
      
      this.emit('batchQueryExecuted', {
        batchId,
        queryCount: queries.length,
        batchSize,
        executionTime,
        transaction
      });
      
      return { rows: results, rowCount: results.length };
      
    } catch (error) {
      this.emit('batchQueryFailed', {
        batchId,
        queryCount: queries.length,
        error: error.message,
        executionTime: Date.now() - startTime
      });
      
      throw error;
    }
  }
  
  /**
   * Optimize a single query
   */
  async optimizeQuery(sql, params = [], options = {}) {
    const { usePlanCache = true, operation = 'read' } = options;
    
    try {
      // Generate query signature for plan caching
      const querySignature = this.generateQuerySignature(sql);
      
      // Check plan cache
      let queryPlan = null;
      if (usePlanCache && this.queryPlanCache.has(querySignature)) {
        queryPlan = this.queryPlanCache.get(querySignature);
        this.metrics.planCacheHits++;
      } else {
        // Generate new query plan
        queryPlan = await this.generateQueryPlan(sql, params);
        
        if (usePlanCache) {
          this.queryPlanCache.set(querySignature, queryPlan);
          this.metrics.planCacheMisses++;
        }
      }
      
      // Apply optimizations based on the plan
      const optimizedQuery = this.applyQueryOptimizations(sql, params, queryPlan);
      
      // Record index usage if applicable
      if (this.options.enableIndexAnalysis && queryPlan.usedIndexes) {
        this.recordIndexUsage(queryPlan.usedIndexes);
      }
      
      return optimizedQuery;
      
    } catch (error) {
      console.warn('Query optimization failed, using original query:', error.message);
      return { sql, params };
    }
  }
  
  /**
   * Generate query execution plan
   */
  async generateQueryPlan(sql, params) {
    try {
      const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`;
      const result = await this.connectionPool.query(explainSql, params, {
        operation: 'read',
        useReplica: true
      });
      
      const plan = result.rows[0]['QUERY PLAN'][0];
      
      return {
        plan,
        executionTime: plan['Execution Time'],
        usedIndexes: this.extractIndexUsage(plan),
        cost: plan.Plan?.['Total Cost'] || 0,
        rows: plan.Plan?.['Plan Rows'] || 0,
        optimizations: this.suggestOptimizations(plan)
      };
      
    } catch (error) {
      console.warn('Failed to generate query plan:', error.message);
      return {
        plan: null,
        executionTime: 0,
        usedIndexes: [],
        cost: 0,
        rows: 0,
        optimizations: []
      };
    }
  }
  
  /**
   * Apply query optimizations
   */
  applyQueryOptimizations(sql, params, queryPlan) {
    let optimizedSql = sql;
    let optimizedParams = [...params];
    
    // Apply parameter binding optimization
    if (this.options.enableParameterBinding) {
      const result = this.optimizeParameterBinding(optimizedSql, optimizedParams);
      optimizedSql = result.sql;
      optimizedParams = result.params;
    }
    
    // Apply plan-based optimizations
    if (queryPlan.optimizations && queryPlan.optimizations.length > 0) {
      for (const optimization of queryPlan.optimizations) {
        const result = this.applyOptimization(optimizedSql, optimizedParams, optimization);
        optimizedSql = result.sql;
        optimizedParams = result.params;
      }
    }
    
    // Apply general optimizations
    optimizedSql = this.applyGeneralOptimizations(optimizedSql);
    
    return { sql: optimizedSql, params: optimizedParams };
  }
  
  /**
   * Optimize parameter binding
   */
  optimizeParameterBinding(sql, params) {
    // Replace common patterns with parameterized versions
    let optimizedSql = sql;
    let optimizedParams = [...params];
    
    // Replace hardcoded dates with parameters
    optimizedSql = optimizedSql.replace(/'(\d{4}-\d{2}-\d{2})'/g, (match, date) => {
      optimizedParams.push(date);
      return `$${optimizedParams.length}`;
    });
    
    // Replace hardcoded numbers with parameters (if they look like values, not limits)
    optimizedSql = optimizedSql.replace(/\b(\d+)\b(?![\s)]*$)/g, (match, number) => {
      // Don't parameterize very small numbers or LIMIT values
      if (parseInt(number) < 10 || /LIMIT\s+\d+$/i.test(optimizedSql)) {
        return match;
      }
      
      optimizedParams.push(number);
      return `$${optimizedParams.length}`;
    });
    
    return { sql: optimizedSql, params: optimizedParams };
  }
  
  /**
   * Apply general query optimizations
   */
  applyGeneralOptimizations(sql) {
    let optimized = sql;
    
    // Remove unnecessary whitespace
    optimized = optimized.replace(/\s+/g, ' ').trim();
    
    // Add explicit column list instead of SELECT *
    if (/SELECT\s+\*\s+FROM/i.test(optimized)) {
      // This is a simplified version - in practice, you'd want to look up the actual columns
      console.warn('Consider using explicit column list instead of SELECT *');
    }
    
    // Optimize ORDER BY with LIMIT
    if (/ORDER BY.+LIMIT\s+\d+$/i.test(optimized)) {
      // PostgreSQL handles this optimization automatically
    }
    
    // Suggest EXISTS instead of IN for subqueries
    if (/\s+IN\s*\(\s*SELECT\s+/i.test(optimized)) {
      console.warn('Consider using EXISTS instead of IN for better performance');
    }
    
    return optimized;
  }
  
  /**
   * Prepare a statement for reuse
   */
  async prepareStatement(name, sql) {
    try {
      await this.connectionPool.query(`PREPARE ${name} AS ${sql}`);
      this.preparedStatements.set(name, { sql, prepared: Date.now() });
      
      this.emit('statementPrepared', { name, sql });
      
    } catch (error) {
      console.error(`Failed to prepare statement ${name}:`, error.message);
      throw error;
    }
  }
  
  /**
   * Load index information for analysis
   */
  async loadIndexInformation() {
    try {
      // Get all table indexes
      const indexQuery = `
        SELECT 
          schemaname,
          tablename,
          indexname,
          indexdef
        FROM pg_indexes
        WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
        ORDER BY tablename, indexname
      `;
      
      const indexResult = await this.connectionPool.query(indexQuery, {
        operation: 'read',
        useReplica: true
      });
      
      // Group indexes by table
      for (const row of indexResult.rows) {
        const tableKey = `${row.schemaname}.${row.tablename}`;
        
        if (!this.tableIndexInfo.has(tableKey)) {
          this.tableIndexInfo.set(tableKey, []);
        }
        
        this.tableIndexInfo.get(tableKey).push({
          name: row.indexname,
          definition: row.indexdef
        });
      }
      
      console.log(`Loaded index information for ${this.tableIndexInfo.size} tables`);
      
    } catch (error) {
      console.warn('Failed to load index information:', error.message);
    }
  }
  
  /**
   * Record index usage statistics
   */
  recordIndexUsage(usedIndexes) {
    for (const indexName of usedIndexes) {
      if (!this.indexUsageStats.has(indexName)) {
        this.indexUsageStats.set(indexName, {
          usageCount: 0,
          lastUsed: null
        });
      }
      
      const stats = this.indexUsageStats.get(indexName);
      stats.usageCount++;
      stats.lastUsed = Date.now();
    }
  }
  
  /**
   * Extract index usage from query plan
   */
  extractIndexUsage(plan) {
    const usedIndexes = [];
    
    const scanPlan = (node) => {
      if (node['Node Type'] === 'Index Scan' || node['Node Type'] === 'Index Only Scan') {
        if (node['Index Name']) {
          usedIndexes.push(node['Index Name']);
        }
      }
      
      if (node.Plans) {
        node.Plans.forEach(scanPlan);
      }
    };
    
    if (plan.Plan) {
      scanPlan(plan.Plan);
    }
    
    return usedIndexes;
  }
  
  /**
   * Suggest optimizations based on query plan
   */
  suggestOptimizations(plan) {
    const optimizations = [];
    
    if (!plan.Plan) {
      return optimizations;
    }
    
    // Check for sequential scans on large tables
    const findSeqScans = (node) => {
      if (node['Node Type'] === 'Seq Scan') {
        if (node['Plan Rows'] > 1000) {
          optimizations.push({
            type: 'missing_index',
            description: `Consider adding an index on table used in sequential scan`,
            severity: 'medium'
          });
        }
      }
      
      if (node.Plans) {
        node.Plans.forEach(findSeqScans);
      }
    };
    
    findSeqScans(plan.Plan);
    
    // Check for high cost queries
    if (plan.Plan['Total Cost'] > 10000) {
      optimizations.push({
        type: 'high_cost',
        description: 'Query has high cost, consider optimization',
        severity: 'low'
      });
    }
    
    // Check for sort operations
    const findSorts = (node) => {
      if (node['Node Type'] === 'Sort') {
        optimizations.push({
          type: 'sort_optimization',
          description: 'Consider adding index to avoid sorting',
          severity: 'low'
        });
      }
      
      if (node.Plans) {
        node.Plans.forEach(findSorts);
      }
    };
    
    findSorts(plan.Plan);
    
    return optimizations;
  }
  
  /**
   * Create batches for batch operations
   */
  createBatches(queries, maxSize) {
    const batches = [];
    for (let i = 0; i < queries.length; i += maxSize) {
      batches.push(queries.slice(i, i + maxSize));
    }
    return batches;
  }
  
  /**
   * Optimize SQL for batch operations
   */
  optimizeBatchSql(batch) {
    if (batch.length === 1) {
      return batch[0].sql;
    }
    
    // Combine similar queries if possible
    const firstQuery = batch[0].sql;
    const allSame = batch.every(q => q.sql === firstQuery);
    
    if (allSame) {
      // Create a single query with multiple value sets
      const valuesClauses = batch.map((_, index) => {
        const paramOffset = index * (batch[0].params?.length || 0);
        return `(${batch[0].params?.map((_, i) => `$${paramOffset + i + 1}`).join(', ') || ''})`;
      }).join(', ');
      
      return firstQuery.replace(/\(.*?\)/, valuesClauses);
    }
    
    // Fall back to union all if queries are different but compatible
    return batch.map(q => `(${q.sql})`).join(' UNION ALL ');
  }
  
  /**
   * Flatten parameters for batch operations
   */
  flattenBatchParams(batch) {
    const allParams = [];
    
    for (const query of batch) {
      if (query.params) {
        allParams.push(...query.params);
      }
    }
    
    return allParams;
  }
  
  /**
   * Check if query is a SELECT statement
   */
  isSelectQuery(sql) {
    return /^\s*SELECT\s/i.test(sql);
  }
  
  /**
   * Check if query has non-deterministic functions
   */
  hasNonDeterministicFunctions(sql) {
    const nonDeterministicFunctions = [
      'random', 'now', 'current_timestamp', 'current_time', 'current_date',
      'timeofday', 'transaction_timestamp', 'statement_timestamp'
    ];
    
    const upperSql = sql.toUpperCase();
    return nonDeterministicFunctions.some(func => 
      new RegExp(`\\b${func.toUpperCase()}\\s*\\(`, 'i').test(upperSql)
    );
  }
  
  /**
   * Generate cache key for query results
   */
  generateCacheKey(sql, params) {
    const queryHash = crypto.createHash('md5').update(sql).digest('hex');
    const paramsHash = params.length > 0 
      ? crypto.createHash('md5').update(JSON.stringify(params)).digest('hex')
      : '';
    
    return `${queryHash}_${paramsHash}`;
  }
  
  /**
   * Generate query signature for plan caching
   */
  generateQuerySignature(sql) {
    // Normalize SQL for signature generation
    const normalized = sql
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/\$\d+/g, '$?'); // Replace parameter placeholders
    
    return crypto.createHash('md5').update(normalized).digest('hex');
  }
  
  /**
   * Sanitize SQL for logging
   */
  sanitizeSql(sql) {
    return sql
      .replace(/\b(password\s*=\s*'[^']+')/gi, "password='***'")
      .replace(/\b(token\s*=\s*'[^']+')/gi, "token='***'")
      .substring(0, 200) + (sql.length > 200 ? '...' : '');
  }
  
  /**
   * Generate query ID
   */
  generateQueryId() {
    return `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Generate batch ID
   */
  generateBatchId() {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Record query metrics
   */
  recordQueryMetrics(startTime, success, fromCache) {
    const executionTime = Date.now() - startTime;
    
    this.totalExecutionTime += executionTime;
    this.executionTimes.push(executionTime);
    
    if (this.executionTimes.length > this.maxExecutionTimeSamples) {
      this.executionTimes.shift();
    }
    
    this.metrics.averageExecutionTime = this.executionTimes.reduce((a, b) => a + b, 0) / this.executionTimes.length;
    
    if (!success && executionTime > this.options.slowQueryThreshold) {
      this.metrics.slowQueries++;
    }
  }
  
  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Listen to connection pool events
    this.connectionPool.on('queryExecuted', (event) => {
      // Track performance patterns
      if (event.duration > this.options.slowQueryThreshold) {
        this.emit('slowQueryDetected', event);
      }
    });
  }
  
  /**
   * Start periodic tasks
   */
  startPeriodicTasks() {
    // Periodically clean up caches
    setInterval(() => {
      this.cleanupCaches();
    }, 300000); // Every 5 minutes
    
    // Periodically refresh index information
    if (this.options.enableIndexAnalysis) {
      setInterval(() => {
        this.loadIndexInformation();
      }, 3600000); // Every hour
    }
  }
  
  /**
   * Clean up expired cache entries
   */
  cleanupCaches() {
    this.queryPlanCache.cleanup();
    this.resultCache.cleanup();
  }
  
  /**
   * Get optimization statistics
   */
  getStatistics() {
    return {
      ...this.metrics,
      cacheHitRatio: this.metrics.totalQueries > 0 
        ? (this.metrics.cacheHits / this.metrics.totalQueries * 100).toFixed(2) + '%'
        : '0%',
      planCacheHitRatio: this.metrics.planCacheHits + this.metrics.planCacheMisses > 0
        ? (this.metrics.planCacheHits / (this.metrics.planCacheHits + this.metrics.planCacheMisses) * 100).toFixed(2) + '%'
        : '0%',
      cacheSize: {
        queryPlans: this.queryPlanCache.size,
        results: this.resultCache.size
      },
      indexUsageStats: Object.fromEntries(this.indexUsageStats),
      tableCount: this.tableIndexInfo.size
    };
  }
  
  /**
   * Get optimization recommendations
   */
  getRecommendations() {
    const recommendations = [];
    
    // Cache recommendations
    if (this.metrics.cacheHitRatio < 50) {
      recommendations.push({
        type: 'cache_optimization',
        description: 'Low cache hit ratio, consider increasing cache size or TTL',
        priority: 'medium'
      });
    }
    
    // Index recommendations
    const unusedIndexes = Array.from(this.indexUsageStats.entries())
      .filter(([_, stats]) => stats.usageCount === 0);
    
    if (unusedIndexes.length > 0) {
      recommendations.push({
        type: 'index_cleanup',
        description: `${unusedIndexes.length} unused indexes detected, consider removing them`,
        priority: 'low'
      });
    }
    
    return recommendations;
  }
  
  /**
   * Clear all caches
   */
  clearCaches() {
    this.queryPlanCache.clear();
    this.resultCache.clear();
    this.preparedStatements.clear();
    
    this.emit('cachesCleared');
  }
  
  /**
   * Shutdown the query optimizer
   */
  async shutdown() {
    this.clearCaches();
    
    this.emit('shutdown');
    console.log('Query optimizer shutdown complete');
  }
}

module.exports = QueryOptimizer;