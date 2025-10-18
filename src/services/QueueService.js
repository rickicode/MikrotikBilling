const EventEmitter = require('events');
const Redis = require('ioredis');
const crypto = require('crypto');

class QueueService extends EventEmitter {
  constructor(redisOptions = {}) {
    super();

    this.redis = new Redis({
      ...redisOptions,
      keyPrefix: 'mikrotik_billing:queue:',
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      lazyConnect: true
    });

    this.queues = new Map();
    this.processors = new Map();
    this.concurrency = new Map();
    this.isShuttingDown = false;

    this.setupRedisEventHandlers();
  }

  setupRedisEventHandlers() {
    this.redis.on('connect', () => {
      console.log('✅ Queue service connected to Redis');
    });

    this.redis.on('error', (error) => {
      console.error('❌ Queue service Redis error:', error);
      this.emit('error', error);
    });

    this.redis.on('ready', () => {
      console.log('✅ Queue service Redis ready');
    });
  }

  async connect() {
    try {
      await this.redis.connect();
      console.log('🔗 Queue service connected to Redis');
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error);
      throw error;
    }
  }

  // Create a new queue
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
      maxLen: options.maxLen || 10000
    };

    this.queues.set(name, queue);
    this.concurrency.set(name, options.concurrency || 1);

    console.log(`📝 Created queue: ${name}`);

    return queue;
  }

  // Add job to queue
  async add(queueName, data, options = {}) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
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
        ...options
      },
      createdAt: new Date().toISOString(),
      status: 'waiting'
    };

    try {
      // Add to queue list
      if (job.options.delay > 0) {
        // Delayed job
        await this.redis.zadd(
          `${queueName}:delayed`,
          Date.now() + job.options.delay,
          JSON.stringify(job)
        );
      } else {
        // Immediate job
        await this.redis.lpush(
          `${queueName}:waiting`,
          JSON.stringify(job)
        );
      }

      // Enforce queue length limit
      await this.enforceQueueLimit(queueName);

      this.emit('job-added', job);

      // Trigger processing if not already running
      this.processQueue(queueName);

      return job;

    } catch (error) {
      console.error(`❌ Failed to add job to queue ${queueName}:`, error);
      throw error;
    }
  }

  // Process jobs from queue
  async processQueue(queueName) {
    if (this.isShuttingDown) return;

    const processor = this.processors.get(queueName);
    if (!processor) {
      console.warn(`⚠️  No processor registered for queue ${queueName}`);
      return;
    }

    const concurrency = this.concurrency.get(queueName) || 1;
    const processingKey = `${queueName}:processing`;

    // Check if we're already at concurrency limit
    const processingCount = await this.redis.llen(processingKey);
    if (processingCount >= concurrency) {
      return;
    }

    // Try to get a job
    const jobData = await this.redis.brpoplpush(
      `${queueName}:waiting`,
      processingKey,
      1 // 1 second timeout
    );

    if (!jobData) {
      // Try delayed jobs
      await this.processDelayedJobs(queueName);
      return;
    }

    const job = JSON.parse(jobData);
    job.status = 'active';
    job.startedAt = new Date().toISOString();

    try {
      // Execute job processor
      await processor(job);

      // Job completed successfully
      job.status = 'completed';
      job.completedAt = new Date().toISOString();

      // Remove from processing
      await this.redis.lrem(processingKey, 1, jobData);

      // Remove from queue if configured
      if (job.options.removeOnComplete) {
        await this.redis.zrem(`${queueName}:completed`, job.id);
      } else {
        await this.redis.zadd(
          `${queueName}:completed`,
          Date.now(),
          JSON.stringify(job)
        );
      }

      this.emit('job-completed', job);

      // Continue processing
      setImmediate(() => this.processQueue(queueName));

    } catch (error) {
      // Job failed
      job.status = 'failed';
      job.error = error.message;
      job.failedAt = new Date().toISOString();
      job.attempts = (job.attempts || 0) + 1;

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
            `${queueName}:delayed`,
            Date.now() + delay,
            JSON.stringify(job)
          );
        } else {
          // Immediate retry
          await this.redis.lpush(`${queueName}:waiting`, JSON.stringify(job));
        }

        this.emit('job-retry', job);

      } else {
        // Max attempts reached, move to dead letter queue
        job.status = 'dead';
        await this.redis.lpush(job.options.deadLetterQueue, JSON.stringify(job));
        this.emit('job-dead', job);
      }

      // Continue processing
      setImmediate(() => this.processQueue(queueName));
    }
  }

  // Process delayed jobs
  async processDelayedJobs(queueName) {
    const now = Date.now();
    const delayedKey = `${queueName}:delayed`;

    // Get jobs that are ready to be processed
    const jobs = await this.redis.zrangebyscore(delayedKey, 0, now);

    for (const jobData of jobs) {
      const job = JSON.parse(jobData);

      // Remove from delayed queue
      await this.redis.zrem(delayedKey, jobData);

      // Add to waiting queue
      await this.redis.lpush(`${queueName}:waiting`, jobData);

      this.emit('job-delayed-ready', job);
    }

    // If we moved any jobs, trigger processing
    if (jobs.length > 0) {
      setImmediate(() => this.processQueue(queueName));
    }
  }

  // Register job processor
  process(queueName, processor) {
    if (typeof processor !== 'function') {
      throw new Error('Processor must be a function');
    }

    this.processors.set(queueName, processor);
    console.log(`📝 Registered processor for queue: ${queueName}`);

    // Start processing if there are jobs waiting
    this.processQueue(queueName);
  }

  // Set queue concurrency
  setConcurrency(queueName, concurrency) {
    this.concurrency.set(queueName, Math.max(1, concurrency));
    console.log(`⚙️  Set concurrency for queue ${queueName}: ${concurrency}`);

    // Trigger processing to respect new concurrency limit
    this.processQueue(queueName);
  }

  // Calculate retry delay based on backoff strategy
  calculateRetryDelay(job) {
    const { backoff, attempts } = job;

    switch (backoff) {
      case 'fixed':
        return 5000; // 5 seconds

      case 'linear':
        return attempts * 5000; // 5s, 10s, 15s...

      case 'exponential':
        return Math.min(300000, Math.pow(2, attempts) * 1000); // 1s, 2s, 4s... max 5 minutes

      default:
        return 5000;
    }
  }

  // Enforce queue length limit
  async enforceQueueLimit(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue || !queue.maxLen) return;

    const waitingKey = `${queueName}:waiting`;
    const length = await this.redis.llen(waitingKey);

    if (length > queue.maxLen) {
      // Remove oldest jobs
      const removeCount = length - queue.maxLen;
      const jobs = await this.redis.lrange(waitingKey, 0, removeCount - 1);

      for (const jobData of jobs) {
        const job = JSON.parse(jobData);
        job.status = 'dropped';
        job.droppedAt = new Date().toISOString();
        job.reason = 'Queue full';

        // Add to dead letter queue
        await this.redis.lpush(job.options.deadLetterQueue, JSON.stringify(job));
        this.emit('job-dropped', job);
      }

      await this.redis.ltrim(waitingKey, removeCount, -1);
    }
  }

  // Get queue statistics
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

        stats[name] = {
          waiting,
          processing,
          delayed,
          completed,
          dead,
          total: waiting + processing + delayed + completed + dead,
          concurrency: this.concurrency.get(name) || 1
        };

      } catch (error) {
        stats[name] = {
          error: error.message
        };
      }
    }

    return queueName ? stats[queueName] : stats;
  }

  // Get job details
  async getJob(queueName, jobId) {
    const completed = await this.redis.zrange(`${queueName}:completed`, 0, -1);
    const dead = await this.redis.lrange(`${queueName}:dlq`, 0, -1);

    for (const jobData of [...completed, ...dead]) {
      const job = JSON.parse(jobData);
      if (job.id === jobId) {
        return job;
      }
    }

    return null;
  }

  // Retry failed jobs from dead letter queue
  async retryDeadJobs(queueName, limit = 100) {
    const dlqKey = `${queueName}:dlq`;
    const jobs = await this.redis.lrange(dlqKey, 0, limit - 1);

    let retriedCount = 0;

    for (const jobData of jobs) {
      const job = JSON.parse(jobData);

      // Reset job status and attempts
      job.status = 'waiting';
      job.attempts = 0;
      job.error = null;
      job.failedAt = null;
      job.retriedAt = new Date().toISOString();

      // Add back to waiting queue
      await this.redis.lpush(`${queueName}:waiting`, JSON.stringify(job));

      // Remove from DLQ
      await this.redis.lrem(dlqKey, 1, jobData);

      retriedCount++;
      this.emit('job-retried-from-dlq', job);
    }

    console.log(`🔄 Retried ${retriedCount} jobs from DLQ for queue ${queueName}`);

    // Trigger processing
    if (retriedCount > 0) {
      setImmediate(() => this.processQueue(queueName));
    }

    return retriedCount;
  }

  // Clear queues
  async clearQueue(queueName, type = 'all') {
    const keys = {
      all: [`${queueName}:waiting`, `${queueName}:processing`, `${queueName}:delayed`, `${queueName}:completed`, `${queueName}:dlq`],
      waiting: [`${queueName}:waiting`],
      processing: [`${queueName}:processing`],
      delayed: [`${queueName}:delayed`],
      completed: [`${queueName}:completed`],
      failed: [`${queueName}:dlq`]
    };

    const keysToClear = keys[type] || keys.all;

    for (const key of keysToClear) {
      await this.redis.del(key);
    }

    console.log(`🗑️  Cleared ${type} jobs from queue ${queueName}`);
  }

  // Pause/Resume queue processing
  pause(queueName) {
    this.processors.delete(queueName);
    console.log(`⏸️  Paused queue processing: ${queueName}`);
  }

  resume(queueName) {
    if (this.queues.has(queueName)) {
      this.processQueue(queueName);
      console.log(`▶️  Resumed queue processing: ${queueName}`);
    }
  }

  // Utility methods
  generateJobId() {
    return `job_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  // Graceful shutdown
  async shutdown() {
    console.log('🛑 Shutting down queue service...');
    this.isShuttingDown = true;

    // Wait for processing jobs to complete
    const queues = Array.from(this.queues.keys());
    const shutdownPromises = queues.map(async (queueName) => {
      let processingCount = await this.redis.llen(`${queueName}:processing`);
      let attempts = 0;

      while (processingCount > 0 && attempts < 30) { // Wait up to 30 seconds
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

    // Close Redis connection
    await this.redis.quit();

    console.log('✅ Queue service shutdown completed');
  }
}

module.exports = QueueService;