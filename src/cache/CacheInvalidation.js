/**
 * Smart Cache Invalidation System
 * Handles intelligent cache invalidation strategies including tag-based,
 * pattern-based, event-driven, and time-based invalidation
 */

const EventEmitter = require('events');
const cron = require('node-cron');

class CacheInvalidation extends EventEmitter {
  constructor(cacheManager, config = {}) {
    super();
    
    this.cacheManager = cacheManager;
    this.config = {
      // Invalidation strategies
      strategies: {
        immediate: {
          enabled: config.immediate?.enabled !== false,
          events: config.immediate?.events || [
            'customer:updated',
            'customer:deleted', 
            'subscription:updated',
            'subscription:deleted',
            'payment:completed',
            'voucher:used',
            'pppoe_user:updated'
          ]
        },
        
        delayed: {
          enabled: config.delayed?.enabled || false,
          delay: config.delayed?.delay || 5000, // 5 seconds
          batchSize: config.delayed?.batchSize || 10,
          maxQueueSize: config.delayed?.maxQueueSize || 1000
        },
        
        scheduled: {
          enabled: config.scheduled?.enabled !== false,
          schedule: config.scheduled?.schedule || '0 2 * * *', // Daily at 2 AM
          patterns: config.scheduled?.patterns || [
            'expired:sessions:*',
            'stale:analytics:*',
            'temp:notifications:*'
          ]
        }
      },
      
      // Tag-based invalidation
      tags: {
        enabled: config.tags?.enabled !== false,
        separator: config.tags?.separator || ':',
        
        // Tag mappings for entity relationships
        mappings: {
          'customer': ['customer:*', 'subscription:*:customer_*', 'payment:*:customer_*'],
          'subscription': ['subscription:*', 'customer:*:subscriptions'],
          'payment': ['payment:*', 'transaction:*', 'customer:*:payments'],
          'voucher': ['voucher:*', 'hotspot_user:*'],
          'pppoe': ['pppoe_user:*', 'pppoe_profile:*'],
          'settings': ['setting:*', 'config:*', 'system:*']
        }
      },
      
      // Pattern-based invalidation
      patterns: {
        enabled: config.patterns?.enabled !== false,
        
        // Common patterns
        commonPatterns: [
          'user:*:sessions',
          'analytics:*:daily',
          'reports:*:temp',
          'cache:*:stale'
        ]
      },
      
      // Dependency chains
      dependencies: {
        enabled: config.dependencies?.enabled || false,
        chains: config.dependencies?.chains || [
          {
            trigger: 'customer:updated',
            invalidations: [
              { type: 'tag', value: 'customer' },
              { type: 'pattern', value: 'customer:*:subscriptions' }
            ]
          }
        ]
      },
      
      // Performance settings
      performance: {
        maxConcurrentInvalidations: config.maxConcurrentInvalidations || 10,
        batchSize: config.batchSize || 50,
        timeout: config.timeout || 30000, // 30 seconds
        retryAttempts: config.retryAttempts || 3,
        retryDelay: config.retryDelay || 1000
      },
      
      // Monitoring
      debug: config.debug || false,
      metricsInterval: config.metricsInterval || 60000, // 1 minute
      
      ...config
    };

    // Invalidation state
    this.invalidationQueue = [];
    this.invalidationInProgress = new Set();
    this.cronJobs = new Map();
    this.tagRegistry = new Map(); // key -> Set(tags)
    this.patternRegistry = new Map(); // pattern -> Set(keys)
    
    // Performance metrics
    this.metrics = {
      totalInvalidations: 0,
      successfulInvalidations: 0,
      failedInvalidations: 0,
      immediateInvalidations: 0,
      delayedInvalidations: 0,
      scheduledInvalidations: 0,
      tagInvalidations: 0,
      patternInvalidations: 0,
      dependencyInvalidations: 0,
      avgInvalidationTime: 0,
      maxQueueSize: 0,
      keysPerInvalidation: 0
    };

    // Response time tracking
    this.invalidationTimes = [];
    this.maxInvalidationTimeHistory = 50;

    // Initialize invalidation system
    this.initialize();
  }

  /**
   * Initialize the cache invalidation system
   */
  initialize() {
    // Setup immediate invalidation listeners
    if (this.config.strategies.immediate.enabled) {
      this.setupImmediateInvalidation();
    }

    // Setup delayed invalidation
    if (this.config.strategies.delayed.enabled) {
      this.setupDelayedInvalidation();
    }

    // Setup scheduled invalidation
    if (this.config.strategies.scheduled.enabled) {
      this.setupScheduledInvalidation();
    }

    // Setup metrics collection
    if (this.config.metricsInterval > 0) {
      this.metricsTimer = setInterval(() => {
        this.collectMetrics();
      }, this.config.metricsInterval);
    }

    this.debugLog('Cache invalidation initialized', {
      strategies: Object.keys(this.config.strategies).filter(key => this.config.strategies[key].enabled),
      tagMappings: Object.keys(this.config.tags.mappings).length,
      dependencies: this.config.dependencies.chains.length
    });
  }

  /**
   * Setup immediate invalidation
   */
  setupImmediateInvalidation() {
    // Listen to application events for immediate invalidation
    this.config.strategies.immediate.events.forEach(event => {
      // This would typically connect to the application's event bus
      // For now, we'll provide a method to trigger events manually
      this.debugLog(`Immediate invalidation configured for event: ${event}`);
    });
  }

  /**
   * Setup delayed invalidation with batching
   */
  setupDelayedInvalidation() {
    // Process invalidation queue at intervals
    this.delayedTimer = setInterval(async () => {
      if (this.invalidationQueue.length > 0) {
        await this.processDelayedInvalidations();
      }
    }, this.config.strategies.delayed.delay);

    this.debugLog(`Delayed invalidation configured with ${this.config.strategies.delayed.delay}ms delay`);
  }

  /**
   * Setup scheduled invalidation using cron
   */
  setupScheduledInvalidation() {
    const schedule = this.config.strategies.scheduled.schedule;
    
    try {
      const task = cron.schedule(schedule, async () => {
        this.debugLog('Starting scheduled cache invalidation');
        await this.performScheduledInvalidation();
      }, {
        scheduled: true,
        timezone: 'UTC'
      });

      this.cronJobs.set('scheduled', task);
      this.debugLog(`Scheduled invalidation configured: ${schedule}`);
    } catch (error) {
      this.debugLog('Failed to setup scheduled invalidation:', error);
    }
  }

  /**
   * Invalidate cache by tag
   */
  async invalidateByTag(tag, options = {}) {
    const startTime = Date.now();
    
    try {
      this.metrics.totalInvalidations++;
      this.metrics.tagInvalidations++;
      
      // Get all mappings for this tag
      const mappings = this.config.tags.mappings[tag];
      if (!mappings) {
        this.debugLog(`No mappings found for tag: ${tag}`);
        return 0;
      }

      let totalInvalidated = 0;
      
      // Invalidate each mapping
      for (const mapping of mappings) {
        try {
          let invalidated = 0;
          
          if (mapping.startsWith('*') || mapping.includes('*')) {
            // Pattern-based invalidation
            invalidated = await this.cacheManager.invalidateByPattern(mapping);
          } else {
            // Direct tag invalidation
            invalidated = await this.cacheManager.invalidateByTag(mapping);
          }
          
          totalInvalidated += invalidated;
        } catch (error) {
          this.debugLog(`Error invalidating mapping ${mapping} for tag ${tag}:`, error);
        }
      }

      const duration = Date.now() - startTime;
      this.trackInvalidationTime(duration);
      this.metrics.successfulInvalidations++;
      
      this.emit('invalidation:tag', tag, totalInvalidated, duration);
      this.debugLog(`Tag invalidation completed: ${tag}, invalidated ${totalInvalidated} keys in ${duration}ms`);
      
      return totalInvalidated;
    } catch (error) {
      this.metrics.failedInvalidations++;
      this.emit('invalidation:error', 'tag', tag, error);
      this.debugLog(`Tag invalidation failed for ${tag}:`, error);
      return 0;
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidateByPattern(pattern, options = {}) {
    const startTime = Date.now();
    
    try {
      this.metrics.totalInvalidations++;
      this.metrics.patternInvalidations++;
      
      const invalidated = await this.cacheManager.invalidateByPattern(pattern);
      
      const duration = Date.now() - startTime;
      this.trackInvalidationTime(duration);
      this.metrics.successfulInvalidations++;
      
      this.emit('invalidation:pattern', pattern, invalidated, duration);
      this.debugLog(`Pattern invalidation completed: ${pattern}, invalidated ${invalidated} keys in ${duration}ms`);
      
      return invalidated;
    } catch (error) {
      this.metrics.failedInvalidations++;
      this.emit('invalidation:error', 'pattern', pattern, error);
      this.debugLog(`Pattern invalidation failed for ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Invalidate multiple keys
   */
  async invalidateKeys(keys, options = {}) {
    const startTime = Date.now();
    
    try {
      this.metrics.totalInvalidations++;
      
      const batchSize = options.batchSize || this.config.performance.batchSize;
      const batches = this.createBatches(keys, batchSize);
      let totalInvalidated = 0;
      
      for (const batch of batches) {
        const batchPromises = batch.map(key => 
          this.cacheManager.delete(key).catch(error => {
            this.debugLog(`Error invalidating key ${key}:`, error);
            return 0;
          })
        );
        
        const batchResults = await Promise.all(batchPromises);
        totalInvalidated += batchResults.filter(result => result === true).length;
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const duration = Date.now() - startTime;
      this.trackInvalidationTime(duration);
      this.metrics.successfulInvalidations++;
      
      this.emit('invalidation:keys', keys.length, totalInvalidated, duration);
      this.debugLog(`Keys invalidation completed: ${totalInvalidated}/${keys.length} keys in ${duration}ms`);
      
      return totalInvalidated;
    } catch (error) {
      this.metrics.failedInvalidations++;
      this.emit('invalidation:error', 'keys', keys, error);
      this.debugLog(`Keys invalidation failed:`, error);
      return 0;
    }
  }

  /**
   * Trigger immediate invalidation based on event
   */
  async triggerInvalidation(event, data = {}) {
    if (!this.config.strategies.immediate.enabled) {
      return;
    }

    this.metrics.immediateInvalidations++;
    
    try {
      // Check if this event triggers dependency chains
      if (this.config.dependencies.enabled) {
        await this.processDependencyChains(event, data);
      }

      // Process immediate invalidation rules
      await this.processImmediateInvalidation(event, data);
      
      this.emit('invalidation:immediate', event, data);
    } catch (error) {
      this.debugLog(`Immediate invalidation failed for event ${event}:`, error);
      this.emit('invalidation:error', 'immediate', event, error);
    }
  }

  /**
   * Queue delayed invalidation
   */
  queueDelayedInvalidation(type, target, options = {}) {
    if (!this.config.strategies.delayed.enabled) {
      return;
    }

    // Check queue size limit
    if (this.invalidationQueue.length >= this.config.strategies.delayed.maxQueueSize) {
      this.debugLog('Invalidation queue full, dropping oldest items');
      this.invalidationQueue = this.invalidationQueue.slice(-this.config.strategies.delayed.maxQueueSize * 0.8);
    }

    this.invalidationQueue.push({
      type,
      target,
      options,
      timestamp: Date.now(),
      priority: options.priority || 'normal'
    });

    // Update max queue size metric
    this.metrics.maxQueueSize = Math.max(this.metrics.maxQueueSize, this.invalidationQueue.length);
    
    this.debugLog(`Queued delayed invalidation: ${type} ${target}`);
  }

  /**
   * Process delayed invalidations
   */
  async processDelayedInvalidations() {
    if (this.invalidationQueue.length === 0) {
      return;
    }

    const batchSize = Math.min(
      this.config.strategies.delayed.batchSize,
      this.invalidationQueue.length
    );

    const batch = this.invalidationQueue.splice(0, batchSize);
    
    this.metrics.delayedInvalidations++;
    
    try {
      // Group by type for batch processing
      const grouped = batch.reduce((acc, item) => {
        if (!acc[item.type]) {
          acc[item.type] = [];
        }
        acc[item.type].push(item);
        return acc;
      }, {});

      const results = {};
      
      // Process each group
      for (const [type, items] of Object.entries(grouped)) {
        try {
          results[type] = await this.processInvalidationGroup(type, items);
        } catch (error) {
          this.debugLog(`Error processing invalidation group ${type}:`, error);
          results[type] = { error: error.message, count: items.length };
        }
      }

      this.emit('invalidation:delayed', results);
      this.debugLog(`Processed delayed invalidations:`, results);
    } catch (error) {
      this.debugLog('Delayed invalidation processing failed:', error);
      this.emit('invalidation:error', 'delayed', batch, error);
    }
  }

  /**
   * Process a group of invalidations of the same type
   */
  async processInvalidationGroup(type, items) {
    switch (type) {
      case 'tag':
        const tags = [...new Set(items.map(item => item.target))];
        let totalTagInvalidated = 0;
        
        for (const tag of tags) {
          totalTagInvalidated += await this.invalidateByTag(tag);
        }
        
        return { invalidated: totalTagInvalidated, count: items.length };
        
      case 'pattern':
        const patterns = [...new Set(items.map(item => item.target))];
        let totalPatternInvalidated = 0;
        
        for (const pattern of patterns) {
          totalPatternInvalidated += await this.invalidateByPattern(pattern);
        }
        
        return { invalidated: totalPatternInvalidated, count: items.length };
        
      case 'keys':
        const allKeys = items.flatMap(item => Array.isArray(item.target) ? item.target : [item.target]);
        const invalidatedKeys = await this.invalidateKeys(allKeys);
        
        return { invalidated: invalidatedKeys, count: items.length };
        
      default:
        return { invalidated: 0, count: items.length, error: `Unknown invalidation type: ${type}` };
    }
  }

  /**
   * Perform scheduled invalidation
   */
  async performScheduledInvalidation() {
    try {
      const startTime = Date.now();
      const results = {
        total: 0,
        successful: 0,
        failed: 0,
        patterns: []
      };

      for (const pattern of this.config.strategies.scheduled.patterns) {
        try {
          const invalidated = await this.invalidateByPattern(pattern);
          results.total += invalidated;
          results.successful++;
          results.patterns.push({ pattern, invalidated, success: true });
        } catch (error) {
          results.failed++;
          results.patterns.push({ pattern, error: error.message, success: false });
        }
      }

      const duration = Date.now() - startTime;
      this.metrics.scheduledInvalidations++;
      
      this.emit('invalidation:scheduled', results, duration);
      this.debugLog(`Scheduled invalidation completed in ${duration}ms:`, results);
      
      return results;
    } catch (error) {
      this.debugLog('Scheduled invalidation failed:', error);
      this.emit('invalidation:error', 'scheduled', error);
      return { total: 0, error: error.message };
    }
  }

  /**
   * Process dependency chains
   */
  async processDependencyChains(event, data) {
    if (!this.config.dependencies.enabled) {
      return;
    }

    const chains = this.config.dependencies.chains.filter(chain => chain.trigger === event);
    
    for (const chain of chains) {
      try {
        await this.processDependencyChain(chain, data);
        this.metrics.dependencyInvalidations++;
      } catch (error) {
        this.debugLog(`Error processing dependency chain for ${event}:`, error);
      }
    }
  }

  /**
   * Process a single dependency chain
   */
  async processDependencyChain(chain, data) {
    for (const invalidation of chain.invalidations) {
      try {
        switch (invalidation.type) {
          case 'tag':
            // Substitute variables in tag value
            const tag = this.substituteVariables(invalidation.value, data);
            await this.invalidateByTag(tag);
            break;
            
          case 'pattern':
            // Substitute variables in pattern
            const pattern = this.substituteVariables(invalidation.value, data);
            await this.invalidateByPattern(pattern);
            break;
            
          case 'keys':
            // Substitute variables in keys
            const keys = this.substituteVariables(invalidation.value, data);
            const keysArray = Array.isArray(keys) ? keys : [keys];
            await this.invalidateKeys(keysArray);
            break;
        }
      } catch (error) {
        this.debugLog(`Error in dependency chain invalidation:`, error);
      }
    }
  }

  /**
   * Process immediate invalidation rules
   */
  async processImmediateInvalidation(event, data) {
    // Define immediate invalidation rules based on event types
    const rules = this.getInvalidationRules(event);
    
    for (const rule of rules) {
      try {
        await this.executeInvalidationRule(rule, data);
      } catch (error) {
        this.debugLog(`Error executing invalidation rule:`, error);
      }
    }
  }

  /**
   * Get invalidation rules for an event
   */
  getInvalidationRules(event) {
    const rules = [];
    
    switch (event) {
      case 'customer:updated':
        rules.push(
          { type: 'tag', value: 'customer' },
          { type: 'pattern', value: `customer:${data.id}:*` }
        );
        break;
        
      case 'customer:deleted':
        rules.push(
          { type: 'tag', value: 'customer' },
          { type: 'pattern', value: `customer:*` },
          { type: 'pattern', value: 'subscription:*:customer_*' },
          { type: 'pattern', value: 'payment:*:customer_*' }
        );
        break;
        
      case 'subscription:updated':
        rules.push(
          { type: 'tag', value: 'subscription' },
          { type: 'pattern', value: `subscription:${data.id}:*` },
          { type: 'pattern', value: `customer:${data.customer_id}:subscriptions` }
        );
        break;
        
      case 'payment:completed':
        rules.push(
          { type: 'tag', value: 'payment' },
          { type: 'pattern', value: `customer:${data.customer_id}:*` },
          { type: 'pattern', value: 'customer:${data.customer_id}:balance` }
        );
        break;
        
      case 'voucher:used':
        rules.push(
          { type: 'tag', value: 'voucher' },
          { type: 'pattern', value: 'voucher:*' },
          { type: 'pattern', value: 'hotspot_user:*' }
        );
        break;
        
      case 'settings:updated':
        rules.push(
          { type: 'tag', value: 'settings' },
          { type: 'pattern', value: 'setting:*' },
          { type: 'pattern', value: 'config:*' }
        );
        break;
    }
    
    return rules;
  }

  /**
   * Execute an invalidation rule
   */
  async executeInvalidationRule(rule, data) {
    switch (rule.type) {
      case 'tag':
        const tag = this.substituteVariables(rule.value, data);
        await this.invalidateByTag(tag);
        break;
        
      case 'pattern':
        const pattern = this.substituteVariables(rule.value, data);
        await this.invalidateByPattern(pattern);
        break;
        
      case 'keys':
        const keys = this.substituteVariables(rule.value, data);
        const keysArray = Array.isArray(keys) ? keys : [keys];
        await this.invalidateKeys(keysArray);
        break;
    }
  }

  /**
   * Substitute variables in invalidation targets
   */
  substituteVariables(template, data) {
    if (!template || !data) {
      return template;
    }
    
    let result = template;
    
    // Simple variable substitution
    for (const [key, value] of Object.entries(data)) {
      const placeholder = `_${key}_`;
      result = result.replace(new RegExp(placeholder, 'g'), value);
    }
    
    return result;
  }

  /**
   * Register cache keys with tags
   */
  registerKeyTags(key, tags) {
    if (!this.config.tags.enabled) {
      return;
    }

    for (const tag of tags) {
      if (!this.tagRegistry.has(tag)) {
        this.tagRegistry.set(tag, new Set());
      }
      this.tagRegistry.get(tag).add(key);
    }
  }

  /**
   * Unregister cache keys from tags
   */
  unregisterKeyTags(key, tags) {
    if (!this.config.tags.enabled) {
      return;
    }

    for (const tag of tags) {
      const keySet = this.tagRegistry.get(tag);
      if (keySet) {
        keySet.delete(key);
        if (keySet.size === 0) {
          this.tagRegistry.delete(tag);
        }
      }
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
   * Track invalidation time
   */
  trackInvalidationTime(duration) {
    this.invalidationTimes.push(duration);
    
    if (this.invalidationTimes.length > this.maxInvalidationTimeHistory) {
      this.invalidationTimes.shift();
    }
    
    this.metrics.avgInvalidationTime = this.invalidationTimes.reduce((sum, time) => sum + time, 0) / this.invalidationTimes.length;
  }

  /**
   * Collect additional metrics
   */
  collectMetrics() {
    try {
      // Calculate keys per invalidation ratio
      this.metrics.keysPerInvalidation = this.metrics.totalInvalidations > 0 ? 
        (this.metrics.successfulInvalidations / this.metrics.totalInvalidations) * 100 : 0;
      
      this.emit('metrics', this.metrics);
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Get invalidation statistics
   */
  getStats() {
    return {
      ...this.metrics,
      queue: {
        length: this.invalidationQueue.length,
        maxSize: this.metrics.maxQueueSize
      },
      registry: {
        tagCount: this.tagRegistry.size,
        patternCount: this.patternRegistry.size
      },
      config: {
        strategies: Object.keys(this.config.strategies).filter(key => this.config.strategies[key].enabled),
        batchSize: this.config.performance.batchSize,
        tagMappings: Object.keys(this.config.tags.mappings).length
      }
    };
  }

  /**
   * Add dependency chain
   */
  addDependencyChain(chain) {
    this.config.dependencies.chains.push(chain);
    this.debugLog(`Added dependency chain for trigger: ${chain.trigger}`);
  }

  /**
   * Remove dependency chain
   */
  removeDependencyChain(trigger) {
    this.config.dependencies.chains = this.config.dependencies.chains.filter(
      chain => chain.trigger !== trigger
    );
    this.debugLog(`Removed dependency chain for trigger: ${trigger}`);
  }

  /**
   * Add tag mapping
   */
  addTagMapping(tag, mappings) {
    this.config.tags.mappings[tag] = mappings;
    this.debugLog(`Added tag mapping for: ${tag}`);
  }

  /**
   * Force immediate invalidation
   */
  async forceInvalidation(type, target, options = {}) {
    try {
      switch (type) {
        case 'tag':
          return await this.invalidateByTag(target, options);
        case 'pattern':
          return await this.invalidateByPattern(target, options);
        case 'keys':
          const keys = Array.isArray(target) ? target : [target];
          return await this.invalidateKeys(keys, options);
        default:
          throw new Error(`Unknown invalidation type: ${type}`);
      }
    } catch (error) {
      this.debugLog(`Force invalidation failed:`, error);
      throw error;
    }
  }

  /**
   * Clear all invalidation queues and registries
   */
  async clear() {
    this.invalidationQueue = [];
    this.invalidationInProgress.clear();
    this.tagRegistry.clear();
    this.patternRegistry.clear();
    
    // Reset metrics
    this.metrics.totalInvalidations = 0;
    this.metrics.successfulInvalidations = 0;
    this.metrics.failedInvalidations = 0;
    
    this.emit('clear');
    this.debugLog('Invalidation system cleared');
  }

  /**
   * Debug logging
   */
  debugLog(message, data = null) {
    if (this.config.debug) {
      console.log(`[CacheInvalidation] ${message}`, data || '');
    }
  }

  /**
   * Close and cleanup
   */
  async close() {
    // Clear timers
    if (this.delayedTimer) {
      clearInterval(this.delayedTimer);
    }
    
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }
    
    // Stop cron jobs
    for (const [name, job] of this.cronJobs.entries()) {
      job.stop();
      this.debugLog(`Stopped ${name} invalidation schedule`);
    }
    
    this.cronJobs.clear();
    
    // Clear data
    await this.clear();
    
    this.emit('close');
    this.debugLog('Cache invalidation closed');
  }
}

module.exports = CacheInvalidation;