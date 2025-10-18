/**
 * Intelligent Cache Warmer
 * Proactively loads and refreshes cache data based on access patterns,
 * scheduled intervals, and predictive algorithms
 */

const EventEmitter = require('events');
const cron = require('node-cron');

class CacheWarmer extends EventEmitter {
  constructor(cacheManager, config = {}) {
    super();
    
    this.cacheManager = cacheManager;
    this.config = {
      // Warming strategies
      strategies: {
        onStartup: {
          enabled: config.onStartup?.enabled !== false,
          delay: config.onStartup?.delay || 5000, // 5 seconds
          concurrency: config.onStartup?.concurrency || 3
        },
        
        scheduled: {
          enabled: config.scheduled?.enabled !== false,
          schedule: config.scheduled?.schedule || '0 */6 * * *', // Every 6 hours
          timezone: config.scheduled?.timezone || 'UTC'
        },
        
        predictive: {
          enabled: config.predictive?.enabled || false,
          algorithm: config.predictive?.algorithm || 'frequency-recency',
          lookbackPeriod: config.predictive?.lookbackPeriod || 86400000, // 24 hours
          minAccessCount: config.predictive?.minAccessCount || 5,
          predictionThreshold: config.predictive?.predictionThreshold || 0.7
        }
      },
      
      // Performance settings
      performance: {
        batchSize: config.batchSize || 50,
        concurrency: config.concurrency || 3,
        timeout: config.timeout || 30000, // 30 seconds
        retryAttempts: config.retryAttempts || 3,
        retryDelay: config.retryDelay || 1000 // 1 second
      },
      
      // Data sets to warm
      dataSets: config.dataSets || [],
      
      // Monitoring
      debug: config.debug || false,
      metricsInterval: config.metricsInterval || 300000, // 5 minutes
      
      ...config
    };

    // Access pattern tracking
    this.accessPatterns = new Map(); // key -> { timestamps, frequency, lastAccess }
    this.accessHistory = []; // Array of { key, timestamp, type }
    
    // Warming state
    this.warmingInProgress = new Set();
    this.warmingQueue = [];
    this.cronJobs = new Map();
    
    // Performance metrics
    this.metrics = {
      totalWarmings: 0,
      successfulWarmings: 0,
      failedWarmings: 0,
      predictiveWarmings: 0,
      scheduledWarmings: 0,
      startupWarmings: 0,
      avgWarmingTime: 0,
      totalDataSize: 0,
      cacheHitRate: 0,
      warmingAccuracy: 0 // How many warmed items were actually accessed
    };

    // Response time tracking
    this.warmingTimes = [];
    this.maxWarmingTimeHistory = 50;

    // Initialize warming system
    this.initialize();
  }

  /**
   * Initialize the cache warming system
   */
  initialize() {
    // Setup scheduled warming
    if (this.config.strategies.scheduled.enabled) {
      this.setupScheduledWarming();
    }

    // Setup predictive warming
    if (this.config.strategies.predictive.enabled) {
      this.setupPredictiveWarming();
    }

    // Setup metrics collection
    if (this.config.metricsInterval > 0) {
      this.metricsTimer = setInterval(() => {
        this.collectMetrics();
      }, this.config.metricsInterval);
    }

    // Setup event listeners
    this.setupEventListeners();

    this.debugLog('Cache warmer initialized', {
      strategies: Object.keys(this.config.strategies).filter(key => this.config.strategies[key].enabled),
      dataSets: this.config.dataSets.length,
      performance: this.config.performance
    });
  }

  /**
   * Setup scheduled warming using cron
   */
  setupScheduledWarming() {
    const schedule = this.config.strategies.scheduled.schedule;
    
    try {
      const task = cron.schedule(schedule, async () => {
        this.debugLog('Starting scheduled cache warming');
        await this.performScheduledWarming();
      }, {
        scheduled: true,
        timezone: this.config.strategies.scheduled.timezone
      });

      this.cronJobs.set('scheduled', task);
      this.debugLog(`Scheduled warming configured: ${schedule}`);
    } catch (error) {
      this.debugLog('Failed to setup scheduled warming:', error);
    }
  }

  /**
   * Setup predictive warming
   */
  setupPredictiveWarming() {
    // Run predictive warming every hour
    this.predictiveTimer = setInterval(async () => {
      if (this.config.strategies.predictive.enabled) {
        await this.performPredictiveWarming();
      }
    }, 3600000); // 1 hour

    this.debugLog('Predictive warming configured');
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Listen to cache events to track access patterns
    this.cacheManager.on('hit', (key, layer, responseTime) => {
      this.trackAccess(key, 'hit');
    });

    this.cacheManager.on('miss', (key) => {
      this.trackAccess(key, 'miss');
    });

    // Listen to cache manager refresh events
    this.cacheManager.on('refresh:scheduled', (key, options) => {
      this.handleRefreshRequest(key, options);
    });
  }

  /**
   * Track access patterns for predictive warming
   */
  trackAccess(key, type) {
    const now = Date.now();
    
    // Update access pattern for the key
    if (!this.accessPatterns.has(key)) {
      this.accessPatterns.set(key, {
        timestamps: [],
        frequency: 0,
        lastAccess: now,
        hitRate: 0
      });
    }

    const pattern = this.accessPatterns.get(key);
    pattern.timestamps.push(now);
    pattern.frequency++;
    pattern.lastAccess = now;
    
    // Update hit rate
    if (type === 'hit') {
      pattern.hits = (pattern.hits || 0) + 1;
    }
    pattern.totalAccess = (pattern.totalAccess || 0) + 1;
    pattern.hitRate = pattern.hits / pattern.totalAccess;

    // Keep only recent access history (based on lookback period)
    const lookbackCutoff = now - this.config.strategies.predictive.lookbackPeriod;
    pattern.timestamps = pattern.timestamps.filter(timestamp => timestamp > lookbackCutoff);

    // Add to global access history
    this.accessHistory.push({ key, timestamp: now, type });
    
    // Keep access history manageable
    if (this.accessHistory.length > 10000) {
      this.accessHistory = this.accessHistory.slice(-5000);
    }
  }

  /**
   * Perform startup warming
   */
  async performStartupWarming() {
    if (!this.config.strategies.onStartup.enabled) {
      return;
    }

    this.debugLog('Starting startup cache warming');
    
    setTimeout(async () => {
      try {
        const startTime = Date.now();
        const results = await this.warmDataSets('startup');
        const duration = Date.now() - startTime;
        
        this.metrics.startupWarmings++;
        this.trackWarmingTime(duration);
        
        this.emit('warming:startup', results, duration);
        this.debugLog(`Startup warming completed in ${duration}ms`, results);
      } catch (error) {
        this.debugLog('Startup warming failed:', error);
        this.emit('warming:error', 'startup', error);
      }
    }, this.config.strategies.onStartup.delay);
  }

  /**
   * Perform scheduled warming
   */
  async performScheduledWarming() {
    try {
      const startTime = Date.now();
      const results = await this.warmDataSets('scheduled');
      const duration = Date.now() - startTime;
      
      this.metrics.scheduledWarmings++;
      this.trackWarmingTime(duration);
      
      this.emit('warming:scheduled', results, duration);
      this.debugLog(`Scheduled warming completed in ${duration}ms`, results);
    } catch (error) {
      this.debugLog('Scheduled warming failed:', error);
      this.emit('warming:error', 'scheduled', error);
    }
  }

  /**
   * Perform predictive warming
   */
  async performPredictiveWarming() {
    try {
      const startTime = Date.now();
      const candidates = this.getPredictiveWarmingCandidates();
      const results = await this.warmCandidates(candidates, 'predictive');
      const duration = Date.now() - startTime;
      
      this.metrics.predictiveWarmings++;
      this.trackWarmingTime(duration);
      
      this.emit('warming:predictive', results, duration);
      this.debugLog(`Predictive warming completed in ${duration}ms`, { candidates: candidates.length, results });
    } catch (error) {
      this.debugLog('Predictive warming failed:', error);
      this.emit('warming:error', 'predictive', error);
    }
  }

  /**
   * Warm configured data sets
   */
  async warmDataSets(type) {
    const results = {
      total: this.config.dataSets.length,
      successful: 0,
      failed: 0,
      skipped: 0,
      dataSets: []
    };

    const batches = this.createBatches(this.config.dataSets, this.config.performance.batchSize);
    
    for (const batch of batches) {
      const batchResults = await this.processBatch(batch, type);
      
      results.successful += batchResults.successful;
      results.failed += batchResults.failed;
      results.skipped += batchResults.skipped;
      results.dataSets.push(...batchResults.dataSets);
      
      // Small delay between batches to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }

  /**
   * Get predictive warming candidates based on access patterns
   */
  getPredictiveWarmingCandidates() {
    const now = Date.now();
    const lookbackPeriod = this.config.strategies.predictive.lookbackPeriod;
    const minAccessCount = this.config.strategies.predictive.minAccessCount;
    const threshold = this.config.strategies.predictive.predictionThreshold;
    
    const candidates = [];

    for (const [key, pattern] of this.accessPatterns.entries()) {
      // Skip if already being warmed
      if (this.warmingInProgress.has(key)) {
        continue;
      }

      // Check minimum access count
      if (pattern.frequency < minAccessCount) {
        continue;
      }

      // Calculate prediction score
      const score = this.calculatePredictionScore(key, pattern, now, lookbackPeriod);
      
      if (score >= threshold) {
        candidates.push({
          key,
          score,
          frequency: pattern.frequency,
          lastAccess: pattern.lastAccess,
          hitRate: pattern.hitRate
        });
      }
    }

    // Sort by score (highest first) and return top candidates
    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.performance.batchSize * 2); // Limit candidates
  }

  /**
   * Calculate prediction score for a key
   */
  calculatePredictionScore(key, pattern, now, lookbackPeriod) {
    const algorithm = this.config.strategies.predictive.algorithm;
    
    switch (algorithm) {
      case 'frequency-recency':
        return this.calculateFrequencyRecencyScore(pattern, now, lookbackPeriod);
      
      case 'time-decay':
        return this.calculateTimeDecayScore(pattern, now, lookbackPeriod);
      
      case 'ml-based':
        return this.calculateMLBasedScore(key, pattern, now, lookbackPeriod);
      
      default:
        return this.calculateFrequencyRecencyScore(pattern, now, lookbackPeriod);
    }
  }

  /**
   * Calculate frequency-recency score
   */
  calculateFrequencyRecencyScore(pattern, now, lookbackPeriod) {
    // Frequency component (0-0.5)
    const maxFrequency = 100; // Arbitrary max for normalization
    const frequencyScore = Math.min(pattern.frequency / maxFrequency, 1) * 0.5;
    
    // Recency component (0-0.5)
    const timeSinceLastAccess = now - pattern.lastAccess;
    const recencyScore = Math.max(0, 1 - (timeSinceLastAccess / lookbackPeriod)) * 0.5;
    
    // Hit rate bonus (0-0.2)
    const hitRateBonus = (pattern.hitRate || 0) * 0.2;
    
    return Math.min(frequencyScore + recencyScore + hitRateBonus, 1);
  }

  /**
   * Calculate time-decay score
   */
  calculateTimeDecayScore(pattern, now, lookbackPeriod) {
    let totalScore = 0;
    const decayConstant = 0.1; // Adjust for faster/slower decay
    
    for (const timestamp of pattern.timestamps) {
      const age = now - timestamp;
      const decay = Math.exp(-decayConstant * (age / (lookbackPeriod / 24))); // Decay per hour
      totalScore += decay;
    }
    
    return Math.min(totalScore / 10, 1); // Normalize to 0-1
  }

  /**
   * Calculate ML-based score (simplified version)
   */
  calculateMLBasedScore(key, pattern, now, lookbackPeriod) {
    // This would typically use a trained ML model
    // For now, we'll use a heuristic approach
    
    // Features: frequency, recency, hit rate, time of day patterns
    const frequencyScore = Math.min(pattern.frequency / 50, 1) * 0.3;
    const recencyScore = Math.max(0, 1 - ((now - pattern.lastAccess) / lookbackPeriod)) * 0.3;
    const hitRateScore = (pattern.hitRate || 0) * 0.2;
    
    // Time of day pattern (simplified)
    const hourOfDay = new Date(now).getHours();
    const businessHoursScore = (hourOfDay >= 8 && hourOfDay <= 18) ? 0.2 : 0.1;
    
    return frequencyScore + recencyScore + hitRateScore + businessHoursScore;
  }

  /**
   * Warm candidate keys
   */
  async warmCandidates(candidates, type) {
    const results = {
      total: candidates.length,
      successful: 0,
      failed: 0,
      skipped: 0,
      candidates: []
    };

    // Create batches based on concurrency
    const batches = this.createBatches(candidates, this.config.performance.concurrency);
    
    for (const batch of batches) {
      const batchPromises = batch.map(candidate => 
        this.warmCandidate(candidate, type)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        const candidate = batch[i];
        
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            results.successful++;
          } else {
            results.failed++;
          }
          results.candidates.push({
            key: candidate.key,
            score: candidate.score,
            success: result.value.success,
            duration: result.value.duration,
            error: result.value.error
          });
        } else {
          results.failed++;
          results.candidates.push({
            key: candidate.key,
            score: candidate.score,
            success: false,
            error: result.reason.message
          });
        }
      }
    }

    return results;
  }

  /**
   * Warm a single candidate
   */
  async warmCandidate(candidate, type) {
    const startTime = Date.now();
    const key = candidate.key;
    
    // Check if already being warmed
    if (this.warmingInProgress.has(key)) {
      return { success: false, duration: 0, error: 'Already warming' };
    }

    this.warmingInProgress.add(key);
    
    try {
      // The actual warming logic would be application-specific
      // This is a placeholder that would need to be implemented based on the data source
      const success = await this.performWarmingForCandidate(key, candidate);
      
      const duration = Date.now() - startTime;
      
      if (success) {
        this.metrics.successfulWarmings++;
        this.metrics.totalDataSize += this.estimateDataSize(key);
      } else {
        this.metrics.failedWarmings++;
      }
      
      return { success, duration };
    } catch (error) {
      this.metrics.failedWarmings++;
      return { success: false, duration: Date.now() - startTime, error: error.message };
    } finally {
      this.warmingInProgress.delete(key);
      this.metrics.totalWarmings++;
    }
  }

  /**
   * Perform warming for a specific candidate (to be implemented by application)
   */
  async performWarmingForCandidate(key, candidate) {
    // This would typically fetch the data from the source and cache it
    // For now, we'll emit an event that the application can handle
    
    return new Promise((resolve) => {
      this.emit('warming:candidate', key, candidate, (success) => {
        resolve(success !== false);
      });
      
      // Timeout if no response
      setTimeout(() => resolve(false), this.config.performance.timeout);
    });
  }

  /**
   * Process a batch of data sets
   */
  async processBatch(batch, type) {
    const results = {
      successful: 0,
      failed: 0,
      skipped: 0,
      dataSets: []
    };

    const promises = batch.map(async (dataSet) => {
      try {
        const startTime = Date.now();
        const success = await this.warmDataSet(dataSet, type);
        const duration = Date.now() - startTime;
        
        if (success) {
          results.successful++;
        } else {
          results.failed++;
        }
        
        results.dataSets.push({
          name: dataSet.name,
          success,
          duration,
          recordCount: dataSet.recordCount || 0
        });
        
        return success;
      } catch (error) {
        results.failed++;
        results.dataSets.push({
          name: dataSet.name,
          success: false,
          error: error.message
        });
        return false;
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Warm a data set
   */
  async warmDataSet(dataSet, type) {
    try {
      // Execute the data set query
      const data = await this.executeDataSetQuery(dataSet);
      
      if (!data || data.length === 0) {
        this.debugLog(`No data returned for data set: ${dataSet.name}`);
        return true; // Not an error, just no data
      }

      // Cache the data using the configured key prefix
      const cachePromises = data.map(record => {
        const cacheKey = `${dataSet.keyPrefix}${record.id || record.key}`;
        return this.cacheManager.set(cacheKey, record, {
          ttl: dataSet.ttl,
          tags: dataSet.tags || [dataSet.name]
        });
      });

      await Promise.all(cachePromises);
      
      this.debugLog(`Warmed ${data.length} records for data set: ${dataSet.name}`);
      return true;
    } catch (error) {
      this.debugLog(`Failed to warm data set ${dataSet.name}:`, error);
      return false;
    }
  }

  /**
   * Execute data set query (to be implemented by application)
   */
  async executeDataSetQuery(dataSet) {
    // This would typically execute the SQL query and return results
    // For now, we'll emit an event that the application can handle
    
    return new Promise((resolve) => {
      this.emit('warming:dataset', dataSet, (data) => {
        resolve(data || []);
      });
      
      // Timeout if no response
      setTimeout(() => resolve([]), this.config.performance.timeout);
    });
  }

  /**
   * Handle refresh requests from cache manager
   */
  async handleRefreshRequest(key, options) {
    // Check if this key should be warmed based on access patterns
    const pattern = this.accessPatterns.get(key);
    
    if (pattern && pattern.frequency >= this.config.strategies.predictive.minAccessCount) {
      // This is a frequently accessed key, prioritize its warming
      this.warmingQueue.unshift({ key, options, priority: 'high' });
    } else {
      this.warmingQueue.push({ key, options, priority: 'normal' });
    }
    
    // Process the queue
    this.processWarmingQueue();
  }

  /**
   * Process the warming queue
   */
  async processWarmingQueue() {
    if (this.warmingQueue.length === 0) {
      return;
    }

    const item = this.warmingQueue.shift();
    
    try {
      await this.performWarmingForCandidate(item.key, { priority: item.priority });
    } catch (error) {
      this.debugLog(`Failed to warm queued item ${item.key}:`, error);
    }
    
    // Process next item if queue is not empty
    if (this.warmingQueue.length > 0) {
      setTimeout(() => this.processWarmingQueue(), 100);
    }
  }

  /**
   * Create batches from array
   */
  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Estimate data size for a key
   */
  estimateDataSize(key) {
    // This would typically get the actual size from cache
    // For now, return an estimate
    return 1024; // 1KB estimate
  }

  /**
   * Track warming time
   */
  trackWarmingTime(duration) {
    this.warmingTimes.push(duration);
    
    if (this.warmingTimes.length > this.maxWarmingTimeHistory) {
      this.warmingTimes.shift();
    }
    
    this.metrics.avgWarmingTime = this.warmingTimes.reduce((sum, time) => sum + time, 0) / this.warmingTimes.length;
  }

  /**
   * Collect additional metrics
   */
  collectMetrics() {
    try {
      // Calculate cache hit rate for warmed items
      let warmedHits = 0;
      let warmedTotal = 0;
      
      for (const [key, pattern] of this.accessPatterns.entries()) {
        if (this.warmingInProgress.has(key) || this.warmingQueue.some(item => item.key === key)) {
          warmedHits += pattern.hits || 0;
          warmedTotal += pattern.totalAccess || 0;
        }
      }
      
      this.metrics.cacheHitRate = warmedTotal > 0 ? (warmedHits / warmedTotal) * 100 : 0;
      
      // Calculate warming accuracy (how many warmed items were actually accessed)
      const totalWarmed = this.metrics.successfulWarmings;
      const accessedWarmed = this.accessHistory.filter(access => 
        this.warmingInProgress.has(access.key) || 
        this.warmingQueue.some(item => item.key === access.key)
      ).length;
      
      this.metrics.warmingAccuracy = totalWarmed > 0 ? (accessedWarmed / totalWarmed) * 100 : 0;
      
      this.emit('metrics', this.metrics);
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Get warming statistics
   */
  getStats() {
    return {
      ...this.metrics,
      patterns: {
        totalTracked: this.accessPatterns.size,
        totalHistory: this.accessHistory.length
      },
      queue: {
        length: this.warmingQueue.length,
        inProgress: this.warmingInProgress.size
      },
      config: {
        strategies: Object.keys(this.config.strategies).filter(key => this.config.strategies[key].enabled),
        batchSize: this.config.performance.batchSize,
        concurrency: this.config.performance.concurrency
      }
    };
  }

  /**
   * Add a new data set for warming
   */
  addDataSet(dataSet) {
    this.config.dataSets.push(dataSet);
    this.debugLog(`Added data set for warming: ${dataSet.name}`);
  }

  /**
   * Remove a data set from warming
   */
  removeDataSet(name) {
    this.config.dataSets = this.config.dataSets.filter(ds => ds.name !== name);
    this.debugLog(`Removed data set from warming: ${name}`);
  }

  /**
   * Force immediate warming
   */
  async forceWarming(types = ['startup', 'predictive']) {
    const results = {};
    
    for (const type of types) {
      try {
        switch (type) {
          case 'startup':
            results.startup = await this.warmDataSets('startup');
            break;
          case 'scheduled':
            results.scheduled = await this.warmDataSets('scheduled');
            break;
          case 'predictive':
            results.predictive = await this.performPredictiveWarming();
            break;
        }
      } catch (error) {
        results[type] = { error: error.message };
      }
    }
    
    return results;
  }

  /**
   * Debug logging
   */
  debugLog(message, data = null) {
    if (this.config.debug) {
      console.log(`[CacheWarmer] ${message}`, data || '');
    }
  }

  /**
   * Close and cleanup
   */
  async close() {
    // Clear timers
    if (this.predictiveTimer) {
      clearInterval(this.predictiveTimer);
    }
    
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }
    
    // Stop cron jobs
    for (const [name, job] of this.cronJobs.entries()) {
      job.stop();
      this.debugLog(`Stopped ${name} warming schedule`);
    }
    
    this.cronJobs.clear();
    
    // Clear data
    this.accessPatterns.clear();
    this.accessHistory = [];
    this.warmingInProgress.clear();
    this.warmingQueue = [];
    
    this.emit('close');
    this.debugLog('Cache warmer closed');
  }
}

module.exports = CacheWarmer;