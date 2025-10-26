const EventEmitter = require('events');
const Redis = require('ioredis');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

/**
 * Enhanced Queue Service with Advanced Features
 * Provides comprehensive background job processing with priorities, scheduling,
 * retries, dead letter queues, and detailed monitoring
 */
class EnhancedQueueService extends EventEmitter {
  constructor(redisOptions = {}) {
    super();

    this.redis = new Redis({
      ...redisOptions,
      keyPrefix: 'mikrotik_billing:queue:',
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      lazyConnect: true,
      enableOfflineQueue: false
    });

    this.queues = new Map();
    this.processors = new Map();
    this.concurrency = new Map();
    this.isShuttingDown = false;
    this.isPaused = false;

    // Enhanced features
    this.scheduledJobs = new Map();
    this.jobPriorities = new Map();
    this.jobDependencies = new Map();
    this.jobMetrics = new Map();
    this.batchProcessors = new Map();

    // Monitoring
    this.stats = {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      retriedJobs: 0,
      deadJobs: 0,
      processingTime: [],
      queueDepth: 0,
      throughput: 0
    };

    this.setupRedisEventHandlers();
    this.startMetricsCollection();
  }

  setupRedisEventHandlers() {
    this.redis.on('connect', () => {
      console.log('✅ Enhanced Queue service connected to Redis');
    });

    this.redis.on('error', (error) => {
      console.error('❌ Enhanced Queue service Redis error:', error);
      this.emit('error', error);
    });

    this.redis.on('ready', () => {
      console.log('✅ Enhanced Queue service Redis ready');
    });
  }

  async connect() {
    try {
      await this.redis.connect();
      console.log('🔗 Enhanced Queue service connected to Redis');
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error);
      throw error;
    }
  }

  /**
   * Create a new queue with enhanced options
   */
  createQueue(name, options = {}) {
    if (this.queues.has(name)) {
      return this.queues.get(name);
    }

    const queue = {
      name,
      ...options,
      priority: options.priority || 0,
      delay: options.delay || 0,
      attempts: options.attempts || 3,
      backoff: options.backoff || 'exponential',
      removeOnComplete: options.removeOnComplete !== false,
      removeOnFail: options.removeOnFail !== false,
      deadLetterQueue: options.deadLetterQueue || `${name}:dlq`,
      maxLen: options.maxLen || 10000,

      // Enhanced options
      enablePriority: options.enablePriority !== false,
      enableBatching: options.enableBatching || false,
      batchSize: options.batchSize || 10,
      batchTimeout: options.batchTimeout || 5000,
      enableDeduplication: options.enableDeduplication || false,
      deduplicationWindow: options.deduplicationWindow || 300000, // 5 minutes
      enableMetrics: options.enableMetrics !== false,
      enableScheduledJobs: options.enableScheduledJobs !== false
    };

    this.queues.set(name, queue);
    this.concurrency.set(name, options.concurrency || 1);
    this.jobMetrics.set(name, {
      processed: 0,
      failed: 0,
      retried: 0,
      avgProcessingTime: 0,
      lastProcessed: null
    });

    console.log(`📝 Created enhanced queue: ${name}`);

    return queue;
  }

  /**
   * Add job with enhanced options
   */
  async add(queueName, data, options = {}) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    // Check for duplicates if enabled
    if (queue.enableDeduplication) {
      const duplicateKey = this.generateDeduplicationKey(data, options.deduplicationKey);
      const isDuplicate = await this.checkForDuplicate(queueName, duplicateKey);
      if (isDuplicate) {
        throw new Error(`Duplicate job detected for queue ${queueName}`);
      }
    }

    const job = {
      id: options.jobId || this.generateJobId(),
      queueName,
      data,
      options: {
        priority: options.priority || queue.priority,
        delay: options.delay || queue.delay,
        attempts: options.attempts || queue.attempts,
        backoff: options.backoff || queue.backoff,
        removeOnComplete: options.removeOnComplete !== false ? options.removeOnComplete : queue.removeOnComplete,
        removeOnFail: options.removeOnFail !== false ? options.removeOnFail : queue.removeOnFail,
        deadLetterQueue: options.deadLetterQueue || queue.deadLetterQueue,

        // Enhanced options
        cron: options.cron, // For scheduled jobs
        repeat: options.repeat, // For recurring jobs
        dependencies: options.dependencies || [], // Job dependencies
        tags: options.tags || [],
        metadata: options.metadata || {},
        timeout: options.timeout || 300000, // 5 minutes default
        deduplicationKey: options.deduplicationKey,

        ...options
      },
      createdAt: new Date().toISOString(),
      status: 'waiting'
    };

    try {
      // Handle scheduled jobs
      if (job.options.cron) {
        await this.addScheduledJob(job);
        this.emit('job-scheduled', job);
        return job;
      }

      // Handle dependencies
      if (job.options.dependencies.length > 0) {
        await this.addJobWithDependencies(job);
        this.emit('job-with-dependencies', job);
        return job;
      }

      // Regular job processing
      await this.addRegularJob(job);

      this.stats.totalJobs++;
      this.emit('job-added', job);

      // Trigger processing if not paused
      if (!this.isPaused) {
        this.processQueue(queueName);
      }

      return job;

    } catch (error) {
      console.error(`❌ Failed to add job to queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Add regular job to queue
   */
  async addRegularJob(job) {
    const queue = this.queues.get(job.queueName);

    if (job.options.delay > 0) {
      // Delayed job
      await this.redis.zadd(
        `${job.queueName}:delayed`,
        Date.now() + job.options.delay,
        JSON.stringify(job)
      );
    } else if (queue.enablePriority && job.options.priority !== 0) {
      // Priority queue - use sorted set
      await this.redis.zadd(
        `${job.queueName}:priority`,
        job.options.priority,
        JSON.stringify(job)
      );
    } else {
      // Regular queue
      await this.redis.lpush(
        `${job.queueName}:waiting`,
        JSON.stringify(job)
      );
    }

    // Enforce queue length limit
    await this.enforceQueueLimit(job.queueName);
  }

  /**
   * Add scheduled job (cron-based)
   */
  async addScheduledJob(job) {
    const scheduledKey = `${job.queueName}:scheduled`;

    // Store scheduled job info
    await this.redis.hset(scheduledKey, job.id, JSON.stringify({
      ...job,
      nextRun: this.calculateNextCronRun(job.options.cron),
      lastRun: null
    }));

    this.scheduledJobs.set(job.id, job);
  }

  /**
   * Add job with dependencies
   */
  async addJobWithDependencies(job) {
    const dependenciesKey = `${job.queueName}:dependencies`;

    // Check if all dependencies are met
    const dependenciesMet = await this.checkDependencies(job.options.dependencies);

    if (dependenciesMet) {
      // Dependencies met, add to regular queue
      await this.addRegularJob(job);
    } else {
      // Dependencies not met, add to dependency queue
      await this.redis.hset(dependenciesKey, job.id, JSON.stringify(job));
      this.jobDependencies.set(job.id, job.options.dependencies);
    }
  }

  /**
   * Process jobs from queue with enhanced logic
   */
  async processQueue(queueName) {
    if (this.isShuttingDown || this.isPaused) return;

    const processor = this.processors.get(queueName);
    if (!processor) {
      console.warn(`⚠️  No processor registered for queue ${queueName}`);
      return;
    }

    const queue = this.queues.get(queueName);
    const concurrency = this.concurrency.get(queueName) || 1;
    const processingKey = `${queueName}:processing`;

    // Check if we're already at concurrency limit
    const processingCount = await this.redis.llen(processingKey);
    if (processingCount >= concurrency) {
      return;
    }

    // Try to get a job from priority queues first, then regular queue
    let jobData = null;

    if (queue.enablePriority) {
      // Try priority queue first
      const priorityJobs = await this.redis.zrevrange(`${queueName}:priority`, 0, 0);
      if (priorityJobs.length > 0) {
        jobData = priorityJobs[0];
        await this.redis.zrem(`${queueName}:priority`, jobData);
      }
    }

    if (!jobData) {
      // Try regular queue
      jobData = await this.redis.brpoplpush(
        `${queueName}:waiting`,
        processingKey,
        1 // 1 second timeout
      );
    }

    if (!jobData) {
      // Try delayed jobs
      await this.processDelayedJobs(queueName);
      return;
    }

    const job = JSON.parse(jobData);
    job.status = 'active';
    job.startedAt = new Date().toISOString();

    try {
      // Execute job with timeout
      const result = await this.executeJobWithTimeout(job, processor);

      // Job completed successfully
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      job.result = result;

      // Update metrics
      this.updateJobMetrics(queueName, job, 'completed');

      // Remove from processing and handle completion
      await this.handleJobCompletion(job);

      this.emit('job-completed', job);

      // Check and process dependent jobs
      await this.processDependentJobs(job);

      // Continue processing
      setImmediate(() => this.processQueue(queueName));

    } catch (error) {
      // Job failed
      await this.handleJobFailure(job, error);

      // Continue processing
      setImmediate(() => this.processQueue(queueName));
    }
  }

  /**
   * Execute job with timeout and enhanced error handling
   */
  async executeJobWithTimeout(job, processor) {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Job timeout for ${job.id} after ${job.options.timeout}ms`));
      }, job.options.timeout);

      try {
        const startTime = Date.now();

        // Add job context to processor
        const enhancedJob = {
          ...job,
          log: (message, level = 'info') => {
            this.emit('job-log', {
              jobId: job.id,
              queueName: job.queueName,
              message,
              level,
              timestamp: new Date().toISOString()
            });
          },
          updateProgress: (progress) => {
            this.emit('job-progress', {
              jobId: job.id,
              queueName: job.queueName,
              progress,
              timestamp: new Date().toISOString()
            });
          }
        };

        const result = await processor(enhancedJob);
        const duration = Date.now() - startTime;

        clearTimeout(timeout);

        // Record processing time
        this.stats.processingTime.push(duration);
        if (this.stats.processingTime.length > 1000) {
          this.stats.processingTime = this.stats.processingTime.slice(-1000);
        }

        resolve(result);

      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Handle job completion
   */
  async handleJobCompletion(job) {
    const processingKey = `${job.queueName}:processing`;
    const jobData = JSON.stringify(job);

    // Remove from processing
    await this.redis.lrem(processingKey, 1, jobData);

    // Remove from queue if configured
    if (job.options.removeOnComplete) {
      await this.redis.zrem(`${job.queueName}:completed`, job.id);
    } else {
      await this.redis.zadd(
        `${job.queueName}:completed`,
        Date.now(),
        JSON.stringify(job)
      );
    }

    // Update global stats
    this.stats.completedJobs++;
  }

  /**
   * Handle job failure
   */
  async handleJobFailure(job, error) {
    const processingKey = `${job.queueName}:processing`;
    const jobData = JSON.stringify(job);

    // Update job
    job.status = 'failed';
    job.error = error.message;
    job.failedAt = new Date().toISOString();
    job.attempts = (job.attempts || 0) + 1;

    // Update metrics
    this.updateJobMetrics(job.queueName, job, 'failed');

    // Remove from processing
    await this.redis.lrem(processingKey, 1, jobData);

    // Determine if we should retry
    if (job.attempts < job.options.attempts) {
      // Retry job
      const delay = this.calculateRetryDelay(job);
      job.nextRetryAt = new Date(Date.now() + delay).toISOString();

      if (delay > 0) {
        // Add to delayed queue
        await this.redis.zadd(
          `${job.queueName}:delayed`,
          Date.now() + delay,
          JSON.stringify(job)
        );
      } else {
        // Immediate retry
        await this.redis.lpush(`${job.queueName}:waiting`, JSON.stringify(job));
      }

      this.stats.retriedJobs++;
      this.emit('job-retry', job);

    } else {
      // Max attempts reached, move to dead letter queue
      job.status = 'dead';
      await this.redis.lpush(job.options.deadLetterQueue, JSON.stringify(job));
      this.stats.deadJobs++;
      this.emit('job-dead', job);
    }

    // Update global stats
    this.stats.failedJobs++;
    this.emit('job-failed', job, error);
  }

  /**
   * Register job processor with enhanced options
   */
  process(queueName, processor, options = {}) {
    if (typeof processor !== 'function') {
      throw new Error('Processor must be a function');
    }

    this.processors.set(queueName, processor);

    // Handle batch processing
    if (options.batchSize) {
      this.batchProcessors.set(queueName, {
        batchSize: options.batchSize,
        batchTimeout: options.batchTimeout || 5000,
        currentBatch: []
      });
    }

    console.log(`📝 Registered enhanced processor for queue: ${queueName}`);

    // Start processing if there are jobs waiting
    this.processQueue(queueName);
  }

  /**
   * Schedule cron job
   */
  async schedule(queueName, data, cronExpression, options = {}) {
    return await this.add(queueName, data, {
      ...options,
      cron: cronExpression
    });
  }

  /**
   * Process scheduled jobs
   */
  async processScheduledJobs() {
    const now = Date.now();

    for (const [queueName, queue] of this.queues) {
      if (!queue.enableScheduledJobs) continue;

      const scheduledKey = `${queueName}:scheduled`;
      const scheduledJobs = await this.redis.hgetall(scheduledKey);

      for (const [jobId, jobData] of Object.entries(scheduledJobs)) {
        const job = JSON.parse(jobData);

        if (job.nextRun <= now) {
          // Time to run the job
          const newJob = {
            ...job,
            id: this.generateJobId(),
            createdAt: new Date().toISOString(),
            status: 'waiting',
            scheduledFrom: jobId
          };

          await this.addRegularJob(newJob);

          // Update next run time
          job.lastRun = now;
          job.nextRun = this.calculateNextCronRun(job.options.cron);

          await this.redis.hset(scheduledKey, jobId, JSON.stringify(job));

          this.emit('scheduled-job-triggered', newJob);
        }
      }
    }
  }

  /**
   * Process dependent jobs
   */
  async processDependentJobs(completedJob) {
    const dependenciesKey = `${completedJob.queueName}:dependencies`;
    const dependentJobs = await this.redis.hgetall(dependenciesKey);

    for (const [jobId, jobData] of Object.entries(dependentJobs)) {
      const job = JSON.parse(jobData);

      // Remove completed job from dependencies
      job.options.dependencies = job.options.dependencies.filter(dep => dep !== completedJob.id);

      // Check if all dependencies are now met
      if (job.options.dependencies.length === 0) {
        // All dependencies met, add to regular queue
        delete job.options.dependencies;
        await this.addRegularJob(job);
        await this.redis.hdel(dependenciesKey, jobId);

        this.emit('job-dependencies-met', job);
      } else {
        // Update dependencies
        await this.redis.hset(dependenciesKey, jobId, JSON.stringify(job));
        this.jobDependencies.set(jobId, job.options.dependencies);
      }
    }
  }

  /**
   * Get enhanced queue statistics
   */
  async getStats(queueName = null) {
    const stats = {};
    const queues = queueName ? [queueName] : Array.from(this.queues.keys());

    for (const name of queues) {
      const queue = this.queues.get(name);
      if (!queue) continue;

      try {
        const waiting = await this.redis.llen(`${name}:waiting`);
        const processing = await this.redis.llen(`${name}:processing`);
        const delayed = await this.redis.zcard(`${name}:delayed`);
        const completed = await this.redis.zcard(`${name}:completed`);
        const dead = await this.redis.llen(`${name}:dlq`);
        const priority = queue.enablePriority ? await this.redis.zcard(`${name}:priority`) : 0;
        const scheduled = queue.enableScheduledJobs ? await this.redis.hlen(`${name}:scheduled`) : 0;
        const dependencies = await this.redis.hlen(`${name}:dependencies`);

        const metrics = this.jobMetrics.get(name) || {};

        stats[name] = {
          waiting,
          processing,
          delayed,
          completed,
          dead,
          priority,
          scheduled,
          dependencies,
          total: waiting + processing + delayed + completed + dead + priority,
          concurrency: this.concurrency.get(name) || 1,
          metrics: {
            processed: metrics.processed || 0,
            failed: metrics.failed || 0,
            retried: metrics.retried || 0,
            avgProcessingTime: metrics.avgProcessingTime || 0,
            lastProcessed: metrics.lastProcessed
          },
          features: {
            enablePriority: queue.enablePriority,
            enableBatching: queue.enableBatching,
            enableDeduplication: queue.enableDeduplication,
            enableScheduledJobs: queue.enableScheduledJobs
          }
        };

      } catch (error) {
        stats[name] = {
          error: error.message
        };
      }
    }

    return queueName ? stats[queueName] : stats;
  }

  /**
   * Get global statistics
   */
  getGlobalStats() {
    const avgProcessingTime = this.stats.processingTime.length > 0
      ? this.stats.processingTime.reduce((a, b) => a + b, 0) / this.stats.processingTime.length
      : 0;

    return {
      ...this.stats,
      avgProcessingTime,
      activeQueues: this.queues.size,
      isPaused: this.isPaused,
      uptime: Date.now() - (this.startTime || Date.now())
    };
  }

  // Utility methods
  generateJobId() {
    return `job_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  generateDeduplicationKey(data, customKey) {
    if (customKey) {
      return customKey;
    }
    const hash = crypto.createHash('md5');
    hash.update(JSON.stringify(data));
    return hash.digest('hex');
  }

  async checkForDuplicate(queueName, key) {
    const deduplicationKey = `${queueName}:dedup:${key}`;
    const exists = await this.redis.exists(deduplicationKey);
    if (!exists) {
      // Set deduplication key with TTL
      const queue = this.queues.get(queueName);
      await this.redis.setex(deduplicationKey, Math.floor(queue.deduplicationWindow / 1000), '1');
    }
    return exists;
  }

  calculateNextCronRun(cronExpression) {
    // Simple implementation - in production, use a proper cron library
    const now = Date.now();
    const [minute, hour, day, month] = cronExpression.split(' ').map(Number);

    const next = new Date(now);
    next.setMinutes(minute || 0);
    next.setHours(hour || 0);
    next.setDate(day || next.getDate());
    next.setMonth(month || next.getMonth());

    // If the time has passed today, schedule for tomorrow
    if (next.getTime() <= now) {
      next.setDate(next.getDate() + 1);
    }

    return next.getTime();
  }

  async checkDependencies(dependencies) {
    // Check if all dependency jobs are completed
    for (const depId of dependencies) {
      const completed = await this.redis.zscore('global:completed', depId);
      if (!completed) {
        return false;
      }
    }
    return true;
  }

  calculateRetryDelay(job) {
    const { backoff, attempts } = job;

    switch (backoff) {
      case 'fixed':
        return 5000;
      case 'linear':
        return attempts * 5000;
      case 'exponential':
        return Math.min(300000, Math.pow(2, attempts) * 1000);
      default:
        return 5000;
    }
  }

  updateJobMetrics(queueName, job, status) {
    const metrics = this.jobMetrics.get(queueName);
    if (!metrics || !this.queues.get(queueName).enableMetrics) return;

    if (status === 'completed') {
      metrics.processed++;
      const processingTime = Date.now() - new Date(job.startedAt).getTime();
      metrics.avgProcessingTime = (metrics.avgProcessingTime * (metrics.processed - 1) + processingTime) / metrics.processed;
      metrics.lastProcessed = new Date().toISOString();
    } else if (status === 'failed') {
      metrics.failed++;
    } else if (status === 'retried') {
      metrics.retried++;
    }
  }

  async enforceQueueLimit(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue || !queue.maxLen) return;

    const waitingKey = `${queueName}:waiting`;
    const length = await this.redis.llen(waitingKey);

    if (length > queue.maxLen) {
      const removeCount = length - queue.maxLen;
      const jobs = await this.redis.lrange(waitingKey, 0, removeCount - 1);

      for (const jobData of jobs) {
        const job = JSON.parse(jobData);
        job.status = 'dropped';
        job.droppedAt = new Date().toISOString();
        job.reason = 'Queue full';

        await this.redis.lpush(job.options.deadLetterQueue, JSON.stringify(job));
        this.emit('job-dropped', job);
      }

      await this.redis.ltrim(waitingKey, removeCount, -1);
    }
  }

  async processDelayedJobs(queueName) {
    const now = Date.now();
    const delayedKey = `${queueName}:delayed`;

    const jobs = await this.redis.zrangebyscore(delayedKey, 0, now);

    for (const jobData of jobs) {
      const job = JSON.parse(jobData);
      await this.redis.zrem(delayedKey, jobData);
      await this.redis.lpush(`${queueName}:waiting`, jobData);
      this.emit('job-delayed-ready', job);
    }

    if (jobs.length > 0) {
      setImmediate(() => this.processQueue(queueName));
    }
  }

  startMetricsCollection() {
    setInterval(() => {
      this.stats.throughput = this.stats.completedJobs / (this.stats.uptime / 1000) || 0;
    }, 10000);
  }

  // Control methods
  pause() {
    this.isPaused = true;
    console.log('⏸️  Enhanced Queue service paused');
  }

  resume() {
    this.isPaused = false;
    console.log('▶️  Enhanced Queue service resumed');

    // Resume processing for all queues
    for (const queueName of this.queues.keys()) {
      this.processQueue(queueName);
    }
  }

  // Graceful shutdown
  async shutdown() {
    console.log('🛑 Shutting down enhanced queue service...');
    this.isShuttingDown = true;

    // Wait for processing jobs to complete
    const queues = Array.from(this.queues.keys());
    const shutdownPromises = queues.map(async (queueName) => {
      let processingCount = await this.redis.llen(`${queueName}:processing`);
      let attempts = 0;

      while (processingCount > 0 && attempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        processingCount = await this.redis.llen(`${queueName}:processing`);
        attempts++;

        if (processingCount > 0) {
          console.log(`⏳ Waiting for ${processingCount} jobs to complete in queue ${queueName}...`);
        }
      }

      if (processingCount > 0) {
        console.warn(`⚠️  ${processingCount} jobs still processing in queue ${queueName} during shutdown`);
      }
    });

    await Promise.all(shutdownPromises);
    await this.redis.quit();

    console.log('✅ Enhanced Queue service shutdown completed');
  }
}

module.exports = EnhancedQueueService;