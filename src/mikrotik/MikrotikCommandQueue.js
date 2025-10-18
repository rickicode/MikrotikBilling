/**
 * Mikrotik Command Queue and Batch Processing System
 *
 * Features:
 * - Priority-based command queuing
 * - Batch processing for efficiency
 * - Command deduplication
 * - Rate limiting and throttling
 * - Command retry with exponential backoff
 * - Transaction support for atomic operations
 * - Command scheduling and delayed execution
 * - Queue monitoring and metrics
 * - Command dependency management
 * - Real-time queue status tracking
 */

const { EventEmitter } = require('events');
const { LRUCache } = require('../services/LRUCache');
const { QueueService } = require('../services/QueueService');

class MikrotikCommandQueue extends EventEmitter {
    constructor(config, dependencies = {}) {
        super();

        this.config = {
            // Queue configuration
            maxQueueSize: 10000,
            batchSize: 10,
            batchTimeout: 1000, // 1 second
            maxConcurrentBatches: 5,
            enableDeduplication: true,
            deduplicationWindow: 30000, // 30 seconds

            // Priority levels
            priorities: {
                critical: 0,
                high: 1,
                normal: 2,
                low: 3,
                background: 4
            },
            defaultPriority: 'normal',

            // Retry configuration
            maxRetries: 3,
            retryDelay: 1000,
            retryBackoffMultiplier: 2,
            maxRetryDelay: 30000, // 30 seconds

            // Rate limiting
            enableRateLimiting: true,
            commandsPerSecond: 100,
            burstSize: 200,
            rateLimitWindow: 1000, // 1 second

            // Transaction support
            enableTransactions: true,
            transactionTimeout: 30000, // 30 seconds
            maxTransactionSize: 50,

            // Scheduling
            enableScheduling: true,
            scheduleCheckInterval: 1000, // 1 second

            // Monitoring
            enableMetrics: true,
            metricsInterval: 60000, // 1 minute

            ...config
        };

        this.dependencies = {
            eventBus: null,
            logger: console,
            ...dependencies
        };

        // Queue storage
        this.queues = new Map(); // priority -> queue
        this.pendingCommands = new Map(); // commandId -> command
        this.processingBatches = new Set(); // batchIds currently processing
        this.completedCommands = new LRUCache(1000); // commandId -> result

        // Deduplication
        this.commandHashes = new Map(); // hash -> timestamp
        this.deduplicationCache = new LRUCache(this.config.maxQueueSize);

        // Rate limiting
        this.rateLimiter = {
            tokens: this.config.burstSize,
            lastRefill: Date.now(),
            requests: []
        };

        // Transactions
        this.transactions = new Map(); // transactionId -> transaction
        this.transactionCounter = 0;

        // Scheduling
        this.scheduledCommands = new Map(); // timestamp -> [commands]
        this.scheduledCommandIds = new Map(); // commandId -> timeout

        // Command counters
        this.commandCounter = 0;
        this.batchCounter = 0;

        // Processing state
        this.isProcessing = false;
        this.processingTimer = null;

        // Statistics
        this.stats = {
            totalCommands: 0,
            processedCommands: 0,
            failedCommands: 0,
            retriedCommands: 0,
            deduplicatedCommands: 0,
            batchesProcessed: 0,
            averageProcessingTime: 0,
            averageWaitTime: 0,
            queueSizes: new Map(),
            priorityDistribution: new Map(),
            errorTypes: new Map(),
            processingTimes: []
        };

        // Initialize queues
        this.initializeQueues();

        // Setup event handlers
        this.setupEventHandlers();

        // Start processing
        this.startProcessing();

        // Start scheduled command processing
        if (this.config.enableScheduling) {
            this.startScheduledProcessing();
        }

        // Start metrics collection
        if (this.config.enableMetrics) {
            this.startMetricsCollection();
        }
    }

    /**
     * Initialize priority queues
     */
    initializeQueues() {
        for (const priority of Object.keys(this.config.priorities)) {
            this.queues.set(priority, []);
            this.stats.queueSizes.set(priority, 0);
            this.stats.priorityDistribution.set(priority, 0);
        }
    }

    /**
     * Add command to queue
     */
    async enqueueCommand(command, options = {}) {
        const {
            priority = this.config.defaultPriority,
            deviceId,
            deduplicationKey = null,
            transactionId = null,
            scheduleAt = null,
            timeout = 30000,
            retryCount = 0,
            maxRetries = this.config.maxRetries
        } = options;

        const { logger } = this.dependencies;

        try {
            // Validate priority
            if (!this.config.priorities.hasOwnProperty(priority)) {
                throw new Error(`Invalid priority: ${priority}`);
            }

            // Check queue size
            if (this.getTotalQueueSize() >= this.config.maxQueueSize) {
                throw new Error('Command queue is full');
            }

            // Generate command ID
            const commandId = this.generateCommandId();

            // Create command object
            const commandObj = {
                id: commandId,
                command,
                options: {
                    priority,
                    deviceId,
                    deduplicationKey,
                    transactionId,
                    scheduleAt,
                    timeout,
                    retryCount,
                    maxRetries,
                    ...options
                },
                createdAt: Date.now(),
                enqueuedAt: Date.now(),
                status: 'queued',
                attempts: 0,
                result: null,
                error: null
            };

            // Check for deduplication
            if (this.config.enableDeduplication) {
                const isDuplicate = await this.checkForDuplicate(commandObj);
                if (isDuplicate) {
                    this.stats.deduplicatedCommands++;
                    logger.debug(`Command deduplicated: ${commandId}`);
                    return { commandId, status: 'deduplicated', reason: 'duplicate' };
                }
            }

            // Handle scheduled commands
            if (scheduleAt && scheduleAt > Date.now()) {
                return this.scheduleCommand(commandObj);
            }

            // Handle transaction commands
            if (transactionId) {
                return this.addToTransaction(commandObj);
            }

            // Add to appropriate priority queue
            this.addToQueue(commandObj);

            // Update statistics
            this.stats.totalCommands++;
            this.stats.priorityDistribution.set(
                priority,
                (this.stats.priorityDistribution.get(priority) || 0) + 1
            );

            logger.debug(`Command enqueued: ${commandId} (priority: ${priority}, device: ${deviceId})`);

            // Emit command enqueued event
            this.emit('commandEnqueued', {
                commandId,
                command: commandObj,
                timestamp: Date.now()
            });

            // Trigger processing if not already running
            if (!this.isProcessing) {
                this.processQueue();
            }

            return { commandId, status: 'queued' };

        } catch (error) {
            logger.error('Failed to enqueue command:', error);
            throw error;
        }
    }

    /**
     * Add multiple commands to queue
     */
    async enqueueCommands(commands, options = {}) {
        const results = [];

        for (const command of commands) {
            try {
                const result = await this.enqueueCommand(command, options);
                results.push(result);
            } catch (error) {
                results.push({
                    status: 'failed',
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Check for duplicate command
     */
    async checkForDuplicate(commandObj) {
        const { command, options } = commandObj;
        const { deduplicationKey } = options;

        if (!deduplicationKey) {
            return false;
        }

        const hash = this.generateCommandHash(command, deduplicationKey);
        const existingHash = this.commandHashes.get(hash);

        if (existingHash) {
            const age = Date.now() - existingHash;
            if (age < this.config.deduplicationWindow) {
                return true;
            } else {
                // Remove expired hash
                this.commandHashes.delete(hash);
            }
        }

        // Add new hash
        this.commandHashes.set(hash, Date.now());
        return false;
    }

    /**
     * Generate command hash for deduplication
     */
    generateCommandHash(command, deduplicationKey) {
        const commandStr = typeof command === 'string' ? command : JSON.stringify(command);
        return `${deduplicationKey}:${Buffer.from(commandStr).toString('base64')}`;
    }

    /**
     * Schedule command for future execution
     */
    scheduleCommand(commandObj) {
        const { scheduleAt } = commandObj.options;
        const { logger } = this.dependencies;

        logger.debug(`Scheduling command ${commandObj.id} for ${new Date(scheduleAt).toISOString()}`);

        // Add to scheduled commands
        if (!this.scheduledCommands.has(scheduleAt)) {
            this.scheduledCommands.set(scheduleAt, []);
        }
        this.scheduledCommands.get(scheduleAt).push(commandObj);

        // Set timeout for execution
        const delay = scheduleAt - Date.now();
        const timeout = setTimeout(() => {
            this.executeScheduledCommand(commandObj);
        }, delay);

        this.scheduledCommandIds.set(commandObj.id, timeout);

        return { commandId: commandObj.id, status: 'scheduled', scheduleAt };
    }

    /**
     * Execute scheduled command
     */
    executeScheduledCommand(commandObj) {
        const { logger } = this.dependencies;

        logger.debug(`Executing scheduled command ${commandObj.id}`);

        // Remove from scheduled commands
        this.scheduledCommandIds.delete(commandObj.id);

        // Add to regular queue
        this.addToQueue(commandObj);

        // Update status
        commandObj.status = 'queued';
        commandObj.enqueuedAt = Date.now();
    }

    /**
     * Add command to transaction
     */
    addToTransaction(commandObj) {
        const { transactionId } = commandObj.options;
        const { logger } = this.dependencies;

        let transaction = this.transactions.get(transactionId);

        if (!transaction) {
            transaction = {
                id: transactionId,
                commands: [],
                createdAt: Date.now(),
                status: 'active',
                timeout: setTimeout(() => {
                    this.handleTransactionTimeout(transactionId);
                }, this.config.transactionTimeout)
            };

            this.transactions.set(transactionId, transaction);
            logger.debug(`Created transaction ${transactionId}`);
        }

        // Check transaction size limit
        if (transaction.commands.length >= this.config.maxTransactionSize) {
            throw new Error(`Transaction ${transactionId} is full`);
        }

        transaction.commands.push(commandObj);
        commandObj.status = 'in_transaction';

        logger.debug(`Added command ${commandObj.id} to transaction ${transactionId}`);

        return { commandId: commandObj.id, status: 'in_transaction', transactionId };
    }

    /**
     * Commit transaction
     */
    async commitTransaction(transactionId) {
        const { logger } = this.dependencies;

        const transaction = this.transactions.get(transactionId);
        if (!transaction) {
            throw new Error(`Transaction ${transactionId} not found`);
        }

        if (transaction.status !== 'active') {
            throw new Error(`Transaction ${transactionId} is not active`);
        }

        logger.debug(`Committing transaction ${transactionId} with ${transaction.commands.length} commands`);

        transaction.status = 'committing';

        try {
            // Add all commands to queue
            for (const command of transaction.commands) {
                this.addToQueue(command);
                command.status = 'queued';
            }

            // Clear transaction timeout
            clearTimeout(transaction.timeout);

            // Remove transaction
            this.transactions.delete(transactionId);

            logger.debug(`Transaction ${transactionId} committed successfully`);

            // Emit transaction committed event
            this.emit('transactionCommitted', {
                transactionId,
                commandCount: transaction.commands.length,
                timestamp: Date.now()
            });

            return { transactionId, status: 'committed', commandCount: transaction.commands.length };

        } catch (error) {
            transaction.status = 'failed';
            logger.error(`Failed to commit transaction ${transactionId}:`, error);
            throw error;
        }
    }

    /**
     * Rollback transaction
     */
    async rollbackTransaction(transactionId) {
        const { logger } = this.dependencies;

        const transaction = this.transactions.get(transactionId);
        if (!transaction) {
            throw new Error(`Transaction ${transactionId} not found`);
        }

        logger.debug(`Rolling back transaction ${transactionId}`);

        // Clear transaction timeout
        clearTimeout(transaction.timeout);

        // Update command statuses
        for (const command of transaction.commands) {
            command.status = 'rolled_back';
        }

        // Remove transaction
        this.transactions.delete(transactionId);

        logger.debug(`Transaction ${transactionId} rolled back`);

        // Emit transaction rolled back event
        this.emit('transactionRolledBack', {
            transactionId,
            commandCount: transaction.commands.length,
            timestamp: Date.now()
        });

        return { transactionId, status: 'rolled_back', commandCount: transaction.commands.length };
    }

    /**
     * Add command to priority queue
     */
    addToQueue(commandObj) {
        const queue = this.queues.get(commandObj.options.priority);
        queue.push(commandObj);

        // Update queue size statistics
        this.stats.queueSizes.set(
            commandObj.options.priority,
            queue.length
        );

        // Store in pending commands
        this.pendingCommands.set(commandObj.id, commandObj);
    }

    /**
     * Start queue processing
     */
    startProcessing() {
        this.isProcessing = true;

        // Process immediately
        this.processQueue();

        // Set up periodic processing
        this.processingTimer = setInterval(() => {
            this.processQueue();
        }, 100); // Process every 100ms

        const { logger } = this.dependencies;
        logger.debug('Command queue processing started');
    }

    /**
     * Process queue
     */
    async processQueue() {
        if (this.processingBatches.size >= this.config.maxConcurrentBatches) {
            return; // Too many batches processing
        }

        // Check rate limiting
        if (this.config.enableRateLimiting && !this.checkRateLimit()) {
            return; // Rate limited
        }

        // Collect commands for batch processing
        const batch = this.collectBatch();

        if (batch.length === 0) {
            return; // No commands to process
        }

        // Create batch ID
        const batchId = this.generateBatchId();

        // Add to processing batches
        this.processingBatches.add(batchId);

        // Update statistics
        this.stats.batchesProcessed++;

        // Process batch
        this.processBatch(batchId, batch);
    }

    /**
     * Collect batch of commands
     */
    collectBatch() {
        const batch = [];
        const batchSize = Math.min(this.config.batchSize, this.getAvailableCommands());

        // Collect commands by priority
        for (const priority of Object.keys(this.config.priorities)) {
            const queue = this.queues.get(priority);

            while (queue.length > 0 && batch.length < batchSize) {
                const command = queue.shift();
                batch.push(command);
            }

            if (batch.length >= batchSize) {
                break;
            }
        }

        // Update queue size statistics
        for (const [priority, queue] of this.queues) {
            this.stats.queueSizes.set(priority, queue.length);
        }

        return batch;
    }

    /**
     * Get number of available commands
     */
    getAvailableCommands() {
        let total = 0;
        for (const queue of this.queues.values()) {
            total += queue.length;
        }
        return total;
    }

    /**
     * Process batch of commands
     */
    async processBatch(batchId, batch) {
        const { logger } = this.dependencies;
        const startTime = Date.now();

        try {
            logger.debug(`Processing batch ${batchId} with ${batch.length} commands`);

            // Update command statuses
            for (const command of batch) {
                command.status = 'processing';
                command.startedAt = Date.now();
            }

            // Group commands by device for efficient processing
            const deviceGroups = this.groupCommandsByDevice(batch);

            // Process each device group
            const results = [];
            for (const [deviceId, commands] of deviceGroups) {
                try {
                    const deviceResults = await this.processDeviceCommands(deviceId, commands);
                    results.push(...deviceResults);
                } catch (error) {
                    // Handle device-level errors
                    for (const command of commands) {
                        results.push({
                            commandId: command.id,
                            success: false,
                            error: error.message,
                            retryable: this.isRetryableError(error)
                        });
                    }
                }
            }

            // Process results
            await this.processBatchResults(batch, results);

            const processingTime = Date.now() - startTime;

            // Update statistics
            this.updateBatchStatistics(batch, processingTime, results);

            logger.debug(`Batch ${batchId} processed in ${processingTime}ms`);

            // Emit batch processed event
            this.emit('batchProcessed', {
                batchId,
                commandCount: batch.length,
                processingTime,
                results,
                timestamp: Date.now()
            });

        } catch (error) {
            logger.error(`Batch ${batchId} processing failed:`, error);

            // Handle batch failure
            await this.handleBatchFailure(batch, error);

        } finally {
            // Remove from processing batches
            this.processingBatches.delete(batchId);

            // Trigger next processing cycle
            if (this.getAvailableCommands() > 0) {
                setImmediate(() => this.processQueue());
            }
        }
    }

    /**
     * Group commands by device
     */
    groupCommandsByDevice(commands) {
        const groups = new Map();

        for (const command of commands) {
            const deviceId = command.options.deviceId || 'default';

            if (!groups.has(deviceId)) {
                groups.set(deviceId, []);
            }

            groups.get(deviceId).push(command);
        }

        return groups;
    }

    /**
     * Process commands for a specific device
     */
    async processDeviceCommands(deviceId, commands) {
        const { logger } = this.dependencies;

        // In a real implementation, this would use the connection pool
        // to execute commands on the actual Mikrotik device

        logger.debug(`Processing ${commands.length} commands for device ${deviceId}`);

        const results = [];

        for (const command of commands) {
            try {
                // Simulate command execution
                await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

                // Simulate occasional failures (10% failure rate)
                if (Math.random() < 0.1) {
                    throw new Error('Simulated command failure');
                }

                // Success
                const result = {
                    commandId: command.id,
                    success: true,
                    data: { mock: 'response', timestamp: Date.now() },
                    processingTime: Date.now() - command.startedAt
                };

                results.push(result);

                // Cache result
                this.completedCommands.set(command.id, result);

            } catch (error) {
                const result = {
                    commandId: command.id,
                    success: false,
                    error: error.message,
                    processingTime: Date.now() - command.startedAt,
                    retryable: this.isRetryableError(error)
                };

                results.push(result);
            }
        }

        return results;
    }

    /**
     * Process batch results
     */
    async processBatchResults(commands, results) {
        const { logger } = this.dependencies;

        for (let i = 0; i < commands.length; i++) {
            const command = commands[i];
            const result = results[i];

            if (result.success) {
                // Command succeeded
                command.status = 'completed';
                command.result = result.data;
                command.completedAt = Date.now();

                this.stats.processedCommands++;

                // Remove from pending commands
                this.pendingCommands.delete(command.id);

                // Emit command completed event
                this.emit('commandCompleted', {
                    commandId: command.id,
                    command,
                    result: result.data,
                    processingTime: result.processingTime,
                    timestamp: Date.now()
                });

            } else {
                // Command failed
                await this.handleCommandFailure(command, result.error, result.retryable);
            }
        }
    }

    /**
     * Handle command failure
     */
    async handleCommandFailure(command, error, retryable) {
        const { logger } = this.dependencies;

        command.error = error;
        command.attempts++;

        if (retryable && command.attempts < command.options.maxRetries) {
            // Retry command
            const retryDelay = this.calculateRetryDelay(command.attempts);

            logger.debug(`Retrying command ${command.id} in ${retryDelay}ms (attempt ${command.attempts})`);

            // Schedule retry
            setTimeout(() => {
                this.retryCommand(command);
            }, retryDelay);

            this.stats.retriedCommands++;

        } else {
            // Command failed permanently
            command.status = 'failed';
            command.completedAt = Date.now();

            this.stats.failedCommands++;

            // Remove from pending commands
            this.pendingCommands.delete(command.id);

            // Update error statistics
            const errorType = this.getErrorType(error);
            const errorCount = this.stats.errorTypes.get(errorType) || 0;
            this.stats.errorTypes.set(errorType, errorCount + 1);

            // Emit command failed event
            this.emit('commandFailed', {
                commandId: command.id,
                command,
                error,
                attempts: command.attempts,
                timestamp: Date.now()
            });

            logger.error(`Command ${command.id} failed permanently: ${error}`);
        }
    }

    /**
     * Retry command
     */
    retryCommand(command) {
        const { logger } = this.dependencies;

        // Update command for retry
        command.status = 'queued';
        command.enqueuedAt = Date.now();
        command.error = null;

        // Add back to queue
        this.addToQueue(command);

        logger.debug(`Command ${command.id} queued for retry`);

        // Emit command retry event
        this.emit('commandRetry', {
            commandId: command.id,
            command,
            attempt: command.attempts,
            timestamp: Date.now()
        });
    }

    /**
     * Handle batch failure
     */
    async handleBatchFailure(batch, error) {
        const { logger } = this.dependencies;

        logger.error(`Batch processing failed: ${error}`);

        // Handle all commands in batch as failed
        for (const command of batch) {
            await this.handleCommandFailure(command, error.message, true);
        }
    }

    /**
     * Check if error is retryable
     */
    isRetryableError(error) {
        const retryableErrors = [
            'timeout',
            'connection refused',
            'connection reset',
            'network unreachable',
            'temporary failure'
        ];

        const errorMessage = error.message.toLowerCase();
        return retryableErrors.some(retryable => errorMessage.includes(retryable));
    }

    /**
     * Get error type for statistics
     */
    getErrorType(error) {
        const errorMessage = error.message.toLowerCase();

        if (errorMessage.includes('timeout')) return 'timeout';
        if (errorMessage.includes('connection')) return 'connection';
        if (errorMessage.includes('authentication')) return 'authentication';
        if (errorMessage.includes('permission')) return 'permission';
        if (errorMessage.includes('invalid')) return 'invalid_command';
        if (errorMessage.includes('busy')) return 'device_busy';

        return 'unknown';
    }

    /**
     * Calculate retry delay with exponential backoff
     */
    calculateRetryDelay(attempt) {
        const baseDelay = this.config.retryDelay;
        const delay = baseDelay * Math.pow(this.config.retryBackoffMultiplier, attempt - 1);
        return Math.min(delay, this.config.maxRetryDelay);
    }

    /**
     * Check rate limiting
     */
    checkRateLimit() {
        const now = Date.now();
        const { tokens, lastRefill, requests } = this.rateLimiter;

        // Refill tokens based on time elapsed
        const timeElapsed = now - lastRefill;
        const tokensToAdd = (timeElapsed / this.config.rateLimitWindow) * this.config.commandsPerSecond;

        this.rateLimiter.tokens = Math.min(
            this.config.burstSize,
            tokens + tokensToAdd
        );
        this.rateLimiter.lastRefill = now;

        // Check if we have tokens available
        if (this.rateLimiter.tokens >= 1) {
            this.rateLimiter.tokens--;
            return true;
        }

        return false;
    }

    /**
     * Start scheduled command processing
     */
    startScheduledProcessing() {
        const { logger } = this.dependencies;

        setInterval(() => {
            this.processScheduledCommands();
        }, this.config.scheduleCheckInterval);

        logger.debug('Scheduled command processing started');
    }

    /**
     * Process scheduled commands
     */
    processScheduledCommands() {
        const now = Date.now();
        const commandsToExecute = [];

        // Find commands scheduled for execution
        for (const [scheduleTime, commands] of this.scheduledCommands) {
            if (scheduleTime <= now) {
                commandsToExecute.push(...commands);
                this.scheduledCommands.delete(scheduleTime);
            }
        }

        // Execute scheduled commands
        for (const command of commandsToExecute) {
            this.executeScheduledCommand(command);
        }
    }

    /**
     * Handle transaction timeout
     */
    handleTransactionTimeout(transactionId) {
        const { logger } = this.dependencies;

        logger.warn(`Transaction ${transactionId} timed out`);

        const transaction = this.transactions.get(transactionId);
        if (transaction) {
            // Rollback transaction
            this.rollbackTransaction(transactionId).catch(error => {
                logger.error(`Failed to rollback timed out transaction ${transactionId}:`, error);
            });
        }
    }

    /**
     * Update batch statistics
     */
    updateBatchStatistics(batch, processingTime, results) {
        // Update processing times
        this.stats.processingTimes.push(processingTime);
        if (this.stats.processingTimes.length > 1000) {
            this.stats.processingTimes.splice(0, this.stats.processingTimes.length - 1000);
        }

        // Calculate average processing time
        const totalProcessingTime = this.stats.processingTimes.reduce((sum, time) => sum + time, 0);
        this.stats.averageProcessingTime = totalProcessingTime / this.stats.processingTimes.length;

        // Calculate average wait time
        let totalWaitTime = 0;
        let waitTimeCount = 0;

        for (const command of batch) {
            if (command.startedAt && command.enqueuedAt) {
                totalWaitTime += (command.startedAt - command.enqueuedAt);
                waitTimeCount++;
            }
        }

        if (waitTimeCount > 0) {
            const averageWaitTime = totalWaitTime / waitTimeCount;
            this.stats.averageWaitTime = (this.stats.averageWaitTime + averageWaitTime) / 2;
        }
    }

    /**
     * Start metrics collection
     */
    startMetricsCollection() {
        const { logger } = this.dependencies;

        setInterval(() => {
            this.collectMetrics();
        }, this.config.metricsInterval);

        logger.debug('Metrics collection started');
    }

    /**
     * Collect metrics
     */
    collectMetrics() {
        // Update queue sizes
        for (const [priority, queue] of this.queues) {
            this.stats.queueSizes.set(priority, queue.length);
        }

        // Emit metrics event
        this.emit('metrics', {
            stats: this.getStats(),
            timestamp: Date.now()
        });
    }

    /**
     * Generate command ID
     */
    generateCommandId() {
        return `cmd_${++this.commandCounter}_${Date.now()}`;
    }

    /**
     * Generate batch ID
     */
    generateBatchId() {
        return `batch_${++this.batchCounter}_${Date.now()}`;
    }

    /**
     * Get total queue size
     */
    getTotalQueueSize() {
        let total = 0;
        for (const queue of this.queues.values()) {
            total += queue.length;
        }
        return total;
    }

    /**
     * Get queue statistics
     */
    getStats() {
        return {
            ...this.stats,
            queueSize: this.getTotalQueueSize(),
            processingBatches: this.processingBatches.size,
            activeTransactions: this.transactions.size,
            scheduledCommands: this.scheduledCommandIds.size,
            pendingCommands: this.pendingCommands.size,
            rateLimiter: {
                tokens: this.rateLimiter.tokens,
                maxTokens: this.config.burstSize
            }
        };
    }

    /**
     * Get command status
     */
    getCommandStatus(commandId) {
        const command = this.pendingCommands.get(commandId);
        if (command) {
            return {
                commandId,
                status: command.status,
                createdAt: command.createdAt,
                enqueuedAt: command.enqueuedAt,
                startedAt: command.startedAt,
                completedAt: command.completedAt,
                attempts: command.attempts,
                maxRetries: command.options.maxRetries,
                error: command.error,
                result: command.result
            };
        }

        // Check completed commands cache
        const completed = this.completedCommands.get(commandId);
        if (completed) {
            return {
                commandId,
                status: 'completed',
                result: completed.data,
                processingTime: completed.processingTime,
                cached: true
            };
        }

        return null;
    }

    /**
     * Get transaction status
     */
    getTransactionStatus(transactionId) {
        const transaction = this.transactions.get(transactionId);
        if (!transaction) {
            return null;
        }

        return {
            transactionId,
            status: transaction.status,
            createdAt: transaction.createdAt,
            commandCount: transaction.commands.length,
            commands: transaction.commands.map(cmd => ({
                commandId: cmd.id,
                status: cmd.status,
                attempts: cmd.attempts
            }))
        };
    }

    /**
     * Clear queue
     */
    clearQueue(priority = null) {
        const { logger } = this.dependencies;

        if (priority) {
            const queue = this.queues.get(priority);
            if (queue) {
                const clearedCount = queue.length;
                queue.length = 0;
                this.stats.queueSizes.set(priority, 0);

                logger.info(`Cleared ${clearedCount} commands from ${priority} priority queue`);
                return clearedCount;
            }
        } else {
            let totalCleared = 0;
            for (const [priority, queue] of this.queues) {
                totalCleared += queue.length;
                queue.length = 0;
                this.stats.queueSizes.set(priority, 0);
            }

            logger.info(`Cleared ${totalCleared} commands from all queues`);
            return totalCleared;
        }

        return 0;
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        const { eventBus } = this.dependencies;

        if (eventBus) {
            eventBus.on('mikrotik:device:offline', (deviceId) => {
                this.handleDeviceOffline(deviceId);
            });

            eventBus.on('mikrotik:device:online', (deviceId) => {
                this.handleDeviceOnline(deviceId);
            });
        }
    }

    /**
     * Handle device offline
     */
    handleDeviceOffline(deviceId) {
        const { logger } = this.dependencies;

        logger.info(`Device ${deviceId} offline, pausing commands`);

        // Move all pending commands for this device to failed state
        for (const [commandId, command] of this.pendingCommands) {
            if (command.options.deviceId === deviceId) {
                this.handleCommandFailure(command, 'Device offline', true);
            }
        }
    }

    /**
     * Handle device online
     */
    handleDeviceOnline(deviceId) {
        const { logger } = this.dependencies;

        logger.info(`Device ${deviceId} online, resuming command processing`);

        // Trigger processing to handle any queued commands
        if (!this.isProcessing) {
            this.startProcessing();
        }
    }

    /**
     * Shutdown command queue
     */
    async shutdown() {
        const { logger } = this.dependencies;

        logger.info('Shutting down Mikrotik Command Queue...');

        // Stop processing
        this.isProcessing = false;
        if (this.processingTimer) {
            clearInterval(this.processingTimer);
        }

        // Wait for current batches to complete
        const maxWaitTime = 30000; // 30 seconds
        const startTime = Date.now();

        while (this.processingBatches.size > 0 && (Date.now() - startTime) < maxWaitTime) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Cancel scheduled commands
        for (const timeout of this.scheduledCommandIds.values()) {
            clearTimeout(timeout);
        }
        this.scheduledCommandIds.clear();

        // Cancel transaction timeouts
        for (const transaction of this.transactions.values()) {
            clearTimeout(transaction.timeout);
        }

        // Clear all data structures
        this.queues.clear();
        this.pendingCommands.clear();
        this.processingBatches.clear();
        this.completedCommands.clear();
        this.commandHashes.clear();
        this.transactions.clear();
        this.scheduledCommands.clear();

        logger.info('Mikrotik Command Queue shutdown complete');
    }
}

module.exports = { MikrotikCommandQueue };