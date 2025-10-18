const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

/**
 * Comprehensive Event Bus System
 * Provides domain event communication with persistence, retry mechanisms,
 * event sourcing, and comprehensive monitoring
 */
class EventBus extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      // Event bus settings
      busId: config.busId || 'mikrotik-billing-eventbus',
      version: config.version || '1.0.0',
      environment: config.environment || 'production',

      // Persistence
      enablePersistence: config.enablePersistence !== false,
      enableEventSourcing: config.enableEventSourcing || false,
      maxEventsInMemory: config.maxEventsInMemory || 10000,

      // Reliability
      enableRetry: config.enableRetry !== false,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      retryBackoff: config.retryBackoff || 'exponential',

      // Performance
      enableBatching: config.enableBatching || false,
      batchSize: config.batchSize || 100,
      batchTimeout: config.batchTimeout || 5000,
      enableCompression: config.enableCompression || false,

      // Monitoring
      enableMetrics: config.enableMetrics !== false,
      enableTracing: config.enableTracing !== false,

      // Security
      enableEventSigning: config.enableEventSigning || false,
      signingKey: config.signingKey || crypto.randomBytes(64).toString('hex'),

      // Filtering
      enableEventFiltering: config.enableEventFiltering !== false,

      ...config
    };

    // Event storage
    this.events = new Map();
    this.eventStreams = new Map();
    this.eventStore = [];

    // Subscribers
    this.subscribers = new Map();
    this.patternSubscribers = new Map();
    this.domainSubscribers = new Map();

    // Event processing
    this.eventQueue = [];
    this.processingQueue = [];
    this.deadLetterQueue = [];

    // Metrics
    this.metrics = {
      totalEvents: 0,
      processedEvents: 0,
      failedEvents: 0,
      retriedEvents: 0,
      deadLetterEvents: 0,
      averageProcessingTime: 0,
      eventTypes: new Map(),
      subscribersCount: 0
    };

    // Event schemas
    this.eventSchemas = new Map();
    this.eventValidators = new Map();

    // Batching
    this.eventBatch = [];
    this.batchTimer = null;

    this.setupEventHandlers();
    this.startEventProcessor();
  }

  setupEventHandlers() {
    this.on('event-published', this.handleEventPublished.bind(this));
    this.on('event-processed', this.handleEventProcessed.bind(this));
    this.on('event-failed', this.handleEventFailed.bind(this));
    this.on('event-retried', this.handleEventRetried.bind(this));
    this.on('subscriber-added', this.handleSubscriberAdded.bind(this));
    this.on('subscriber-removed', this.handleSubscriberRemoved.bind(this));
  }

  /**
   * Publish an event
   */
  async publish(eventName, data, options = {}) {
    const event = this.createEvent(eventName, data, options);

    try {
      // Validate event if schema exists
      if (this.eventSchemas.has(eventName)) {
        await this.validateEvent(event);
      }

      // Sign event if enabled
      if (this.config.enableEventSigning) {
        event.signature = this.signEvent(event);
      }

      // Store event
      await this.storeEvent(event);

      // Add to processing queue
      this.eventQueue.push(event);

      // Process immediately if batching is disabled
      if (!this.config.enableBatching) {
        this.processEvents();
      }

      // Update metrics
      this.metrics.totalEvents++;
      this.updateEventTypeMetrics(eventName);

      // Emit event published
      this.emit('event-published', event);

      console.log(`📤 Event published: ${eventName} (${event.id})`);
      return event;

    } catch (error) {
      console.error(`❌ Failed to publish event ${eventName}:`, error);
      throw error;
    }
  }

  /**
   * Subscribe to events
   */
  subscribe(eventName, handler, options = {}) {
    const subscription = {
      id: this.generateSubscriptionId(),
      eventName,
      handler,
      options: {
        once: options.once || false,
        priority: options.priority || 0,
        filter: options.filter || null,
        transform: options.transform || null,
        retryCount: options.retryCount || this.config.maxRetries,
        timeout: options.timeout || 30000,
        domain: options.domain || null,
        ...options
      },
      createdAt: Date.now(),
      eventCount: 0,
      lastProcessed: null
    };

    // Store subscription
    if (!this.subscribers.has(eventName)) {
      this.subscribers.set(eventName, []);
    }
    this.subscribers.get(eventName).push(subscription);

    // Add to domain subscribers if specified
    if (subscription.options.domain) {
      if (!this.domainSubscribers.has(subscription.options.domain)) {
        this.domainSubscribers.set(subscription.options.domain, []);
      }
      this.domainSubscribers.get(subscription.options.domain).push(subscription);
    }

    // Sort by priority (higher priority first)
    this.subscribers.get(eventName).sort((a, b) => b.options.priority - a.options.priority);

    this.metrics.subscribersCount++;
    this.emit('subscriber-added', subscription);

    console.log(`👂 Subscribed to event: ${eventName} (${subscription.id})`);
    return subscription;
  }

  /**
   * Subscribe to event pattern (wildcard)
   */
  subscribePattern(pattern, handler, options = {}) {
    const subscription = {
      id: this.generateSubscriptionId(),
      pattern,
      handler,
      options: {
        once: options.once || false,
        priority: options.priority || 0,
        filter: options.filter || null,
        transform: options.transform || null,
        retryCount: options.retryCount || this.config.maxRetries,
        timeout: options.timeout || 30000,
        ...options
      },
      createdAt: Date.now(),
      eventCount: 0,
      lastProcessed: null
    };

    // Store pattern subscription
    if (!this.patternSubscribers.has(pattern)) {
      this.patternSubscribers.set(pattern, []);
    }
    this.patternSubscribers.get(pattern).push(subscription);

    // Sort by priority
    this.patternSubscribers.get(pattern).sort((a, b) => b.options.priority - a.options.priority);

    this.metrics.subscribersCount++;
    this.emit('subscriber-added', subscription);

    console.log(`👂 Subscribed to pattern: ${pattern} (${subscription.id})`);
    return subscription;
  }

  /**
   * Subscribe to domain events
   */
  subscribeToDomain(domainName, handler, options = {}) {
    return this.subscribePattern(`${domainName}.*`, handler, {
      ...options,
      domain: domainName
    });
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId) {
    // Find and remove from regular subscribers
    for (const [eventName, subscribers] of this.subscribers) {
      const index = subscribers.findIndex(sub => sub.id === subscriptionId);
      if (index !== -1) {
        subscribers.splice(index, 1);
        if (subscribers.length === 0) {
          this.subscribers.delete(eventName);
        }
        this.metrics.subscribersCount--;
        this.emit('subscriber-removed', subscriptionId);
        console.log(`🔇 Unsubscribed: ${subscriptionId}`);
        return true;
      }
    }

    // Find and remove from pattern subscribers
    for (const [pattern, subscribers] of this.patternSubscribers) {
      const index = subscribers.findIndex(sub => sub.id === subscriptionId);
      if (index !== -1) {
        subscribers.splice(index, 1);
        if (subscribers.length === 0) {
          this.patternSubscribers.delete(pattern);
        }
        this.metrics.subscribersCount--;
        this.emit('subscriber-removed', subscriptionId);
        console.log(`🔇 Unsubscribed from pattern: ${subscriptionId}`);
        return true;
      }
    }

    return false;
  }

  /**
   * Create an event
   */
  createEvent(eventName, data, options = {}) {
    return {
      id: options.id || uuidv4(),
      name: eventName,
      data: this.config.enableCompression ? this.compressData(data) : data,
      metadata: {
        timestamp: options.timestamp || new Date().toISOString(),
        version: options.version || '1.0.0',
        source: options.source || 'unknown',
        correlationId: options.correlationId || uuidv4(),
        causationId: options.causationId || null,
        userId: options.userId || null,
        sessionId: options.sessionId || null,
        traceId: options.traceId || null,
        tags: options.tags || [],
        ...options.metadata
      },
      options: {
        priority: options.priority || 0,
        ttl: options.ttl || null,
        retryCount: 0,
        maxRetries: options.maxRetries || this.config.maxRetries,
        ...options
      }
    };
  }

  /**
   * Store event
   */
  async storeEvent(event) {
    // Add to in-memory store
    this.events.set(event.id, event);

    // Add to event store for event sourcing
    if (this.config.enableEventSourcing) {
      this.eventStore.push({
        ...event,
        storedAt: Date.now()
      });

      // Limit event store size
      if (this.eventStore.length > this.config.maxEventsInMemory) {
        this.eventStore = this.eventStore.slice(-this.config.maxEventsInMemory);
      }
    }

    // Add to event stream
    if (!this.eventStreams.has(event.name)) {
      this.eventStreams.set(event.name, []);
    }
    this.eventStreams.get(event.name).push(event);
  }

  /**
   * Process events from queue
   */
  async processEvents() {
    if (this.processingQueue.length > 0) {
      return; // Already processing
    }

    // Move events from queue to processing queue
    this.processingQueue = [...this.eventQueue];
    this.eventQueue = [];

    if (this.processingQueue.length === 0) {
      return;
    }

    console.log(`⚙️  Processing ${this.processingQueue.length} events`);

    // Process events in parallel with limited concurrency
    const concurrency = 10;
    const chunks = this.chunkArray(this.processingQueue, concurrency);

    for (const chunk of chunks) {
      await Promise.all(chunk.map(event => this.processEvent(event)));
    }

    this.processingQueue = [];
  }

  /**
   * Process individual event
   */
  async processEvent(event) {
    const startTime = Date.now();

    try {
      // Find matching subscribers
      const subscribers = this.findMatchingSubscribers(event);

      if (subscribers.length === 0) {
        console.warn(`⚠️  No subscribers for event: ${event.name}`);
        return;
      }

      // Process event with all subscribers
      await Promise.all(subscribers.map(subscriber =>
        this.notifySubscriber(subscriber, event)
      ));

      const duration = Date.now() - startTime;
      this.metrics.processedEvents++;
      this.updateProcessingTimeMetrics(duration);

      this.emit('event-processed', event, subscribers);

    } catch (error) {
      const duration = Date.now() - startTime;
      this.handleEventProcessingError(event, error, duration);
    }
  }

  /**
   * Find matching subscribers for event
   */
  findMatchingSubscribers(event) {
    const subscribers = [];

    // Exact match subscribers
    const exactSubscribers = this.subscribers.get(event.name) || [];
    subscribers.push(...exactSubscribers);

    // Pattern match subscribers
    for (const [pattern, patternSubscribers] of this.patternSubscribers) {
      if (this.patternMatches(event.name, pattern)) {
        subscribers.push(...patternSubscribers);
      }
    }

    // Apply filters
    return subscribers.filter(subscriber => {
      if (subscriber.options.filter) {
        return subscriber.options.filter(event);
      }
      return true;
    });
  }

  /**
   * Notify subscriber of event
   */
  async notifySubscriber(subscriber, event) {
    const startTime = Date.now();

    try {
      // Transform event if transformer is specified
      let processedEvent = event;
      if (subscriber.options.transform) {
        processedEvent = await subscriber.options.transform(event);
      }

      // Execute handler with timeout
      const result = await this.executeWithTimeout(
        subscriber.handler,
        processedEvent,
        subscriber.options.timeout
      );

      // Update subscriber stats
      subscriber.eventCount++;
      subscriber.lastProcessed = Date.now();

      // Remove subscriber if it's a once subscription
      if (subscriber.options.once) {
        this.unsubscribe(subscriber.id);
      }

      const duration = Date.now() - startTime;
      this.emit('subscriber-notified', subscriber, event, duration);

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.handleSubscriberError(subscriber, event, error, duration);
      throw error;
    }
  }

  /**
   * Handle event processing error
   */
  handleEventProcessingError(event, error, duration) {
    this.metrics.failedEvents++;

    // Increment retry count
    event.options.retryCount++;

    // Check if we should retry
    if (this.config.enableRetry && event.options.retryCount <= event.options.maxRetries) {
      // Calculate retry delay
      const delay = this.calculateRetryDelay(event.options.retryCount);

      // Schedule retry
      setTimeout(() => {
        this.eventQueue.push(event);
        this.processEvents();
      }, delay);

      this.metrics.retriedEvents++;
      this.emit('event-retried', event, error, delay);

      console.warn(`🔄 Retrying event ${event.name} (attempt ${event.options.retryCount}) in ${delay}ms`);

    } else {
      // Add to dead letter queue
      this.deadLetterQueue.push({
        ...event,
        error: error.message,
        failedAt: Date.now(),
        processingTime: duration
      });

      this.metrics.deadLetterEvents++;
      this.emit('event-failed', event, error);

      console.error(`💀 Event failed permanently: ${event.name} - ${error.message}`);
    }
  }

  /**
   * Handle subscriber error
   */
  handleSubscriberError(subscriber, event, error, duration) {
    console.error(`❌ Subscriber ${subscriber.id} failed for event ${event.name}:`, error.message);

    // Emit subscriber error event
    this.emit('subscriber-error', subscriber, event, error, duration);

    // Could implement subscriber-specific retry logic here
  }

  /**
   * Get events from stream
   */
  getEventStream(eventName, options = {}) {
    const {
      limit = 100,
      offset = 0,
      from = null,
      to = null,
      filter = null
    } = options;

    let events = this.eventStreams.get(eventName) || [];

    // Apply time range filter
    if (from || to) {
      events = events.filter(event => {
        const timestamp = new Date(event.metadata.timestamp).getTime();
        if (from && timestamp < from) return false;
        if (to && timestamp > to) return false;
        return true;
      });
    }

    // Apply custom filter
    if (filter) {
      events = events.filter(filter);
    }

    // Apply pagination
    const total = events.length;
    events = events.slice(offset, offset + limit);

    return {
      events,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + limit < total
      }
    };
  }

  /**
   * Get events by correlation ID
   */
  getEventsByCorrelationId(correlationId) {
    return Array.from(this.events.values()).filter(event =>
      event.metadata.correlationId === correlationId
    );
  }

  /**
   * Get events by trace ID
   */
  getEventsByTraceId(traceId) {
    return Array.from(this.events.values()).filter(event =>
      event.metadata.traceId === traceId
    );
  }

  /**
   * Register event schema
   */
  registerEventSchema(eventName, schema) {
    this.eventSchemas.set(eventName, schema);
    console.log(`📋 Registered schema for event: ${eventName}`);
  }

  /**
   * Validate event against schema
   */
  async validateEvent(event) {
    const schema = this.eventSchemas.get(event.name);
    if (!schema) return true;

    // This would use a proper validation library like Joi or Yup
    // For now, return true
    return true;
  }

  /**
   * Sign event
   */
  signEvent(event) {
    const eventData = JSON.stringify(event);
    const signature = crypto.createHmac('sha256', this.config.signingKey);
    signature.update(eventData);
    return signature.digest('hex');
  }

  /**
   * Verify event signature
   */
  verifyEventSignature(event) {
    if (!event.signature) return false;

    const expectedSignature = this.signEvent(event);
    return event.signature === expectedSignature;
  }

  /**
   * Compress data
   */
  compressData(data) {
    // This would use a proper compression library
    // For now, return data as-is
    return data;
  }

  /**
   * Check if pattern matches
   */
  patternMatches(eventName, pattern) {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return regex.test(eventName);
  }

  /**
   * Calculate retry delay
   */
  calculateRetryDelay(retryCount) {
    switch (this.config.retryBackoff) {
      case 'fixed':
        return this.config.retryDelay;
      case 'linear':
        return retryCount * this.config.retryDelay;
      case 'exponential':
        return Math.min(300000, Math.pow(2, retryCount) * this.config.retryDelay);
      default:
        return this.config.retryDelay;
    }
  }

  /**
   * Execute with timeout
   */
  async executeWithTimeout(fn, ...args) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Subscriber timeout'));
      }, args[2] || 30000);

      try {
        const result = await fn(args[0], args[1]);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Update event type metrics
   */
  updateEventTypeMetrics(eventName) {
    if (!this.metrics.eventTypes.has(eventName)) {
      this.metrics.eventTypes.set(eventName, 0);
    }
    this.metrics.eventTypes.set(eventName, this.metrics.eventTypes.get(eventName) + 1);
  }

  /**
   * Update processing time metrics
   */
  updateProcessingTimeMetrics(duration) {
    const totalProcessed = this.metrics.processedEvents;
    const totalTime = this.metrics.averageProcessingTime * (totalProcessed - 1) + duration;
    this.metrics.averageProcessingTime = totalTime / totalProcessed;
  }

  /**
   * Chunk array
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Start event processor
   */
  startEventProcessor() {
    if (this.config.enableBatching) {
      this.batchTimer = setInterval(() => {
        if (this.eventBatch.length > 0) {
          this.eventQueue.push(...this.eventBatch);
          this.eventBatch = [];
          this.processEvents();
        }
      }, this.config.batchTimeout);
    }
  }

  /**
   * Get comprehensive statistics
   */
  getStatistics() {
    return {
      bus: {
        id: this.config.busId,
        version: this.config.version,
        environment: this.config.environment
      },
      events: {
        total: this.metrics.totalEvents,
        processed: this.metrics.processedEvents,
        failed: this.metrics.failedEvents,
        retried: this.metrics.retriedEvents,
        deadLetter: this.metrics.deadLetterEvents,
        averageProcessingTime: Math.round(this.metrics.averageProcessingTime),
        types: Object.fromEntries(this.metrics.eventTypes)
      },
      subscribers: {
        total: this.metrics.subscribersCount,
        byEvent: Object.fromEntries(
          Array.from(this.subscribers.entries()).map(([event, subs]) => [event, subs.length])
        ),
        byPattern: Object.fromEntries(
          Array.from(this.patternSubscribers.entries()).map(([pattern, subs]) => [pattern, subs.length])
        )
      },
      queues: {
        pending: this.eventQueue.length,
        processing: this.processingQueue.length,
        deadLetter: this.deadLetterQueue.length
      },
      storage: {
        inMemory: this.events.size,
        eventStore: this.eventStore.length,
        maxEvents: this.config.maxEventsInMemory
      }
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    return {
      status: 'healthy',
      bus: this.config.busId,
      version: this.config.version,
      uptime: Date.now() - (this.startTime || Date.now()),
      metrics: {
        pendingEvents: this.eventQueue.length,
        processingEvents: this.processingQueue.length,
        deadLetterEvents: this.deadLetterQueue.length,
        subscriberCount: this.metrics.subscribersCount
      }
    };
  }

  /**
   * Clear dead letter queue
   */
  clearDeadLetterQueue() {
    const count = this.deadLetterQueue.length;
    this.deadLetterQueue = [];
    console.log(`🧹 Cleared ${count} events from dead letter queue`);
    return count;
  }

  /**
   * Replay events from dead letter queue
   */
  async replayDeadLetterEvents(limit = 100) {
    const eventsToReplay = this.deadLetterQueue.splice(0, limit);

    for (const event of eventsToReplay) {
      // Reset retry count
      event.options.retryCount = 0;
      delete event.error;
      delete event.failedAt;
      delete event.processingTime;

      // Add back to queue
      this.eventQueue.push(event);
    }

    if (eventsToReplay.length > 0) {
      this.processEvents();
    }

    console.log(`🔄 Replayed ${eventsToReplay.length} events from dead letter queue`);
    return eventsToReplay.length;
  }

  // Event handlers
  handleEventPublished(event) {
    console.log(`📤 Event published: ${event.name} (${event.id})`);
  }

  handleEventProcessed(event, subscribers) {
    console.log(`✅ Event processed: ${event.name} by ${subscribers.length} subscribers`);
  }

  handleEventFailed(event, error) {
    console.error(`💀 Event failed: ${event.name} - ${error.message}`);
  }

  handleEventRetried(event, error, delay) {
    console.log(`🔄 Event retried: ${event.name} in ${delay}ms`);
  }

  handleSubscriberAdded(subscription) {
    console.log(`👂 Subscriber added: ${subscription.eventName || subscription.pattern} (${subscription.id})`);
  }

  handleSubscriberRemoved(subscriptionId) {
    console.log(`🔇 Subscriber removed: ${subscriptionId}`);
  }

  /**
   * Generate subscription ID
   */
  generateSubscriptionId() {
    return `sub_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Start the event bus
   */
  start() {
    this.startTime = Date.now();
    console.log(`🚀 Event Bus started: ${this.config.busId} v${this.config.version}`);
    this.emit('started');
  }

  /**
   * Stop the event bus
   */
  stop() {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }

    // Process remaining events
    if (this.eventQueue.length > 0) {
      console.log(`Processing ${this.eventQueue.length} remaining events...`);
      this.processEvents();
    }

    console.log(`🛑 Event Bus stopped: ${this.config.busId}`);
    this.emit('stopped');
  }
}

module.exports = EventBus;