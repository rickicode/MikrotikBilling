const crypto = require('crypto');
const EventEmitter = require('events');

/**
 * Advanced Transaction Management System
 * Provides enterprise-grade transaction handling with:
 * - Distributed transaction support
 * - Transaction timeout and rollback
 * - Nested transaction handling (savepoints)
 * - Deadlock detection and resolution
 * - Transaction logging and audit trails
 * - Connection pooling integration
 */
class TransactionManager extends EventEmitter {
  constructor(connectionPool, options = {}) {
    super();
    
    this.connectionPool = connectionPool;
    this.options = {
      timeout: options.timeout || 30000,
      enableDeadlockDetection: options.enableDeadlockDetection !== false,
      enableAuditLogging: options.enableAuditLogging !== false,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      isolationLevel: options.isolationLevel || 'READ_COMMITTED',
      enableSavepoints: options.enableSavepoints !== false,
      maxConcurrentTransactions: options.maxConcurrentTransactions || 100,
      ...options
    };
    
    // Active transactions tracking
    this.activeTransactions = new Map();
    this.transactionStats = {
      totalTransactions: 0,
      committedTransactions: 0,
      rolledBackTransactions: 0,
      deadlocksDetected: 0,
      timeouts: 0,
      savepointsCreated: 0,
      savepointsRolledBack: 0,
      averageTransactionTime: 0
    };
    
    // Transaction execution times for average calculation
    this.transactionTimes = [];
    this.maxTransactionTimeSamples = 1000;
    
    // Deadlock detection tracking
    this.deadlockPatterns = new Map();
    this.lockWaiters = new Map();
    
    this.isInitialized = false;
    this.cleanupTimer = null;
  }
  
  /**
   * Initialize the transaction manager
   */
  async initialize() {
    try {
      // Start cleanup timer for expired transactions
      this.startCleanupTimer();
      
      // Setup event listeners
      this.setupEventListeners();
      
      this.isInitialized = true;
      console.log('Transaction manager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize transaction manager:', error);
      throw error;
    }
  }
  
  /**
   * Execute operations in a transaction
   */
  async transaction(operations, options = {}) {
    const transactionId = this.generateTransactionId();
    const startTime = Date.now();
    
    const transactionOptions = {
      timeout: options.timeout || this.options.timeout,
      isolationLevel: options.isolationLevel || this.options.isolationLevel,
      readOnly: options.readOnly || false,
      deferrable: options.deferrable || false,
      retryOnDeadlock: options.retryOnDeadlock !== false,
      maxRetries: options.maxRetries || this.options.maxRetries,
      requestId: options.requestId,
      ...options
    };
    
    this.transactionStats.totalTransactions++;
    
    try {
      // Check concurrent transaction limit
      if (this.activeTransactions.size >= this.options.maxConcurrentTransactions) {
        throw new Error('Maximum concurrent transactions limit reached');
      }
      
      // Get a connection from the pool
      const pool = await this.connectionPool.selectPool('write', false);
      const client = await pool.pool.connect();
      
      // Create transaction context
      const transaction = {
        id: transactionId,
        client,
        startTime,
        options: transactionOptions,
        savepoints: new Map(),
        operations: [],
        status: 'active',
        isolationLevel: transactionOptions.isolationLevel,
        readOnly: transactionOptions.readOnly
      };
      
      this.activeTransactions.set(transactionId, transaction);
      
      // Set transaction timeout
      const timeoutHandle = setTimeout(() => {
        this.handleTransactionTimeout(transactionId);
      }, transactionOptions.timeout);
      
      try {
        // Begin transaction
        await this.beginTransaction(transaction);
        
        // Execute operations
        const results = [];
        for (let i = 0; i < operations.length; i++) {
          const operation = operations[i];
          
          // Add operation to transaction log
          transaction.operations.push({
            index: i,
            sql: this.sanitizeSql(operation.sql),
            params: operation.params,
            timestamp: Date.now()
          });
          
          // Execute operation
          const result = await this.executeOperation(transaction, operation);
          results.push(result);
          
          // Check for deadlock if enabled
          if (this.options.enableDeadlockDetection) {
            await this.checkForDeadlocks(transaction);
          }
        }
        
        // Commit transaction
        await this.commitTransaction(transaction);
        
        // Update statistics
        this.updateTransactionStats(startTime, true, false);
        
        clearTimeout(timeoutHandle);
        this.activeTransactions.delete(transactionId);
        
        this.emit('transactionCommitted', {
          transactionId,
          operationCount: operations.length,
          executionTime: Date.now() - startTime,
          requestId: transactionOptions.requestId
        });
        
        return results;
        
      } catch (error) {
        clearTimeout(timeoutHandle);
        
        // Handle deadlock retry
        if (this.isDeadlockError(error) && transactionOptions.retryOnDeadlock) {
          return await this.retryTransaction(operations, transactionOptions, error);
        }
        
        // Rollback transaction
        await this.rollbackTransaction(transaction);
        
        // Update statistics
        this.updateTransactionStats(startTime, false, this.isTimeoutError(error));
        
        this.activeTransactions.delete(transactionId);
        
        this.emit('transactionRolledBack', {
          transactionId,
          error: error.message,
          operationCount: transaction.operations.length,
          executionTime: Date.now() - startTime,
          requestId: transactionOptions.requestId
        });
        
        throw error;
        
      } finally {
        // Always release the connection
        client.release();
      }
      
    } catch (error) {
      this.updateTransactionStats(startTime, false, false);
      throw error;
    }
  }
  
  /**
   * Create a savepoint within a transaction
   */
  async savepoint(transactionId, savepointName, operations) {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    
    if (!this.options.enableSavepoints) {
      throw new Error('Savepoints are disabled');
    }
    
    const name = savepointName || this.generateSavepointName(transaction);
    
    try {
      // Create savepoint
      await transaction.client.query(`SAVEPOINT ${name}`);
      
      // Track savepoint
      transaction.savepoints.set(name, {
        name,
        created: Date.now(),
        operations: []
      });
      
      this.transactionStats.savepointsCreated++;
      
      // Execute operations
      const results = [];
      for (const operation of operations) {
        const result = await this.executeOperation(transaction, operation);
        results.push(result);
        
        // Track operation for this savepoint
        transaction.savepoints.get(name).operations.push({
          sql: this.sanitizeSql(operation.sql),
          timestamp: Date.now()
        });
      }
      
      return results;
      
    } catch (error) {
      // Rollback to savepoint on error
      await this.rollbackToSavepoint(transaction, name);
      throw error;
    }
  }
  
  /**
   * Rollback to a specific savepoint
   */
  async rollbackToSavepoint(transactionId, savepointName) {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    
    const savepoint = transaction.savepoints.get(savepointName);
    if (!savepoint) {
      throw new Error('Savepoint not found');
    }
    
    try {
      await transaction.client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
      
      this.transactionStats.savepointsRolledBack++;
      
      // Remove savepoint and any subsequent ones
      const savepointNames = Array.from(transaction.savepoints.keys());
      const savepointIndex = savepointNames.indexOf(savepointName);
      
      for (let i = savepointIndex; i < savepointNames.length; i++) {
        transaction.savepoints.delete(savepointNames[i]);
      }
      
      this.emit('savepointRolledBack', {
        transactionId,
        savepointName,
        operationsRolledBack: savepoint.operations.length
      });
      
    } catch (error) {
      console.error(`Failed to rollback to savepoint ${savepointName}:`, error.message);
      throw error;
    }
  }
  
  /**
   * Begin a transaction
   */
  async beginTransaction(transaction) {
    const { isolationLevel, readOnly, deferrable } = transaction.options;
    
    let beginSql = 'BEGIN';
    
    if (isolationLevel !== 'DEFAULT') {
      beginSql += ` ISOLATION LEVEL ${isolationLevel}`;
    }
    
    if (readOnly) {
      beginSql += ' READ ONLY';
    }
    
    if (deferrable) {
      beginSql += ' DEFERRABLE';
    }
    
    await transaction.client.query(beginSql);
    
    // Set transaction name for easier debugging
    await transaction.client.query(`SET LOCAL transaction_name = '${transaction.id}'`);
    
    this.emit('transactionStarted', {
      transactionId: transaction.id,
      isolationLevel,
      readOnly
    });
  }
  
  /**
   * Commit a transaction
   */
  async commitTransaction(transaction) {
    await transaction.client.query('COMMIT');
    
    transaction.status = 'committed';
    this.transactionStats.committedTransactions++;
    
    // Log transaction if audit logging is enabled
    if (this.options.enableAuditLogging) {
      await this.logTransaction(transaction);
    }
  }
  
  /**
   * Rollback a transaction
   */
  async rollbackTransaction(transaction) {
    try {
      await transaction.client.query('ROLLBACK');
      transaction.status = 'rolled_back';
      this.transactionStats.rolledBackTransactions++;
      
      // Log transaction if audit logging is enabled
      if (this.options.enableAuditLogging) {
        await this.logTransaction(transaction);
      }
      
    } catch (error) {
      console.error(`Failed to rollback transaction ${transaction.id}:`, error.message);
    }
  }
  
  /**
   * Execute an operation within a transaction
   */
  async executeOperation(transaction, operation) {
    const { sql, params, timeout = transaction.options.timeout } = operation;
    
    try {
      const result = await transaction.client.query({
        text: sql,
        values: params,
        timeout
      });
      
      return result;
      
    } catch (error) {
      // Add context to the error
      error.transactionId = transaction.id;
      error.operation = this.sanitizeSql(sql);
      throw error;
    }
  }
  
  /**
   * Check for deadlocks in the current transaction
   */
  async checkForDeadlocks(transaction) {
    try {
      // Query pg_locks to detect potential deadlocks
      const lockQuery = `
        SELECT 
          l.locktype,
          l.mode,
          l.relation::regclass as relation,
          l.pid,
          a.usename as username,
          a.query as current_query,
          a.wait_event_type,
          a.wait_event
        FROM pg_locks l
        JOIN pg_stat_activity a ON l.pid = a.pid
        WHERE l.pid != pg_backend_pid()
          AND NOT l.granted
          AND a.datname = current_database()
      `;
      
      const result = await transaction.client.query(lockQuery);
      
      if (result.rows.length > 0) {
        // Analyze lock wait patterns
        const lockPattern = this.generateLockPattern(result.rows);
        
        if (this.deadlockPatterns.has(lockPattern)) {
          const pattern = this.deadlockPatterns.get(lockPattern);
          pattern.count++;
          pattern.lastSeen = Date.now();
          
          // If we've seen this pattern multiple times, it might be a deadlock
          if (pattern.count > 3) {
            this.transactionStats.deadlocksDetected++;
            this.emit('potentialDeadlock', {
              transactionId: transaction.id,
              lockPattern,
              waitingLocks: result.rows
            });
          }
        } else {
          this.deadlockPatterns.set(lockPattern, {
            count: 1,
            firstSeen: Date.now(),
            lastSeen: Date.now()
          });
        }
      }
      
    } catch (error) {
      // Don't let deadlock detection fail the transaction
      console.warn('Deadlock detection failed:', error.message);
    }
  }
  
  /**
   * Handle transaction timeout
   */
  handleTransactionTimeout(transactionId) {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      return;
    }
    
    console.warn(`Transaction ${transactionId} timed out after ${this.options.timeout}ms`);
    
    this.transactionStats.timeouts++;
    
    // Force rollback the transaction
    this.rollbackTransaction(transaction).catch(error => {
      console.error(`Failed to rollback timed out transaction ${transactionId}:`, error.message);
    });
    
    this.activeTransactions.delete(transactionId);
    
    this.emit('transactionTimeout', {
      transactionId,
      timeout: this.options.timeout,
      operationCount: transaction.operations.length
    });
  }
  
  /**
   * Retry transaction after deadlock
   */
  async retryTransaction(operations, options, originalError) {
    let lastError = originalError;
    
    for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
      console.warn(`Retrying transaction after deadlock, attempt ${attempt}/${options.maxRetries}`);
      
      // Exponential backoff
      const delay = this.options.retryDelay * Math.pow(2, attempt - 1);
      await this.sleep(delay);
      
      try {
        return await this.transaction(operations, {
          ...options,
          maxRetries: 0 // Prevent infinite retries
        });
        
      } catch (error) {
        lastError = error;
        
        if (!this.isDeadlockError(error)) {
          // Not a deadlock, don't retry
          break;
        }
      }
    }
    
    // All retries failed
    this.transactionStats.deadlocksDetected++;
    throw lastError;
  }
  
  /**
   * Log transaction for audit purposes
   */
  async logTransaction(transaction) {
    try {
      const auditData = {
        transactionId: transaction.id,
        status: transaction.status,
        startTime: transaction.startTime,
        endTime: Date.now(),
        duration: Date.now() - transaction.startTime,
        isolationLevel: transaction.isolationLevel,
        readOnly: transaction.readOnly,
        operationCount: transaction.operations.length,
        savepointCount: transaction.savepoints.size,
        operations: transaction.operations,
        savepoints: Array.from(transaction.savepoints.entries()).map(([name, data]) => ({
          name,
          created: data.created,
          operationCount: data.operations.length
        }))
      };
      
      // Store audit log (in a real implementation, this would go to a database table)
      console.log('Transaction audit:', JSON.stringify(auditData, null, 2));
      
      this.emit('transactionAudited', auditData);
      
    } catch (error) {
      console.error('Failed to log transaction audit:', error.message);
    }
  }
  
  /**
   * Generate lock pattern for deadlock detection
   */
  generateLockPattern(lockRows) {
    return lockRows
      .map(row => `${row.locktype}:${row.mode}:${row.relation}`)
      .sort()
      .join('|');
  }
  
  /**
   * Check if error is a deadlock
   */
  isDeadlockError(error) {
    return error.code === '40P01' || // deadlock_detected
           error.message?.toLowerCase().includes('deadlock');
  }
  
  /**
   * Check if error is a timeout
   */
  isTimeoutError(error) {
    return error.code === '57014' || // query_canceled
           error.message?.toLowerCase().includes('timeout') ||
           error.message?.toLowerCase().includes('cancel');
  }
  
  /**
   * Update transaction statistics
   */
  updateTransactionStats(startTime, success, wasTimeout) {
    const duration = Date.now() - startTime;
    
    this.transactionTimes.push(duration);
    if (this.transactionTimes.length > this.maxTransactionTimeSamples) {
      this.transactionTimes.shift();
    }
    
    this.transactionStats.averageTransactionTime = 
      this.transactionTimes.reduce((a, b) => a + b, 0) / this.transactionTimes.length;
  }
  
  /**
   * Start cleanup timer for expired transactions
   */
  startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredTransactions();
    }, 30000); // Every 30 seconds
  }
  
  /**
   * Clean up expired transactions
   */
  cleanupExpiredTransactions() {
    const now = Date.now();
    const expiredTransactions = [];
    
    for (const [transactionId, transaction] of this.activeTransactions) {
      const age = now - transaction.startTime;
      const timeout = transaction.options.timeout || this.options.timeout;
      
      if (age > timeout * 2) { // Give double the timeout before force cleanup
        expiredTransactions.push(transactionId);
      }
    }
    
    for (const transactionId of expiredTransactions) {
      console.warn(`Force cleaning up expired transaction: ${transactionId}`);
      
      const transaction = this.activeTransactions.get(transactionId);
      if (transaction) {
        // Try to rollback and release connection
        this.rollbackTransaction(transaction).catch(() => {});
        transaction.client.release().catch(() => {});
        
        this.activeTransactions.delete(transactionId);
      }
    }
  }
  
  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Listen to connection pool events
    this.connectionPool.on('connectionError', (event) => {
      // Check if any active transactions were affected
      for (const [transactionId, transaction] of this.activeTransactions) {
        if (transaction.client.processID === event.clientId) {
          console.error(`Transaction ${transactionId} affected by connection error`);
          
          // Mark transaction as failed
          transaction.status = 'failed';
          this.activeTransactions.delete(transactionId);
          
          this.emit('transactionFailed', {
            transactionId,
            reason: 'connection_error',
            error: event.error
          });
        }
      }
    });
  }
  
  /**
   * Generate unique transaction ID
   */
  generateTransactionId() {
    return `txn_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }
  
  /**
   * Generate unique savepoint name
   */
  generateSavepointName(transaction) {
    const index = transaction.savepoints.size + 1;
    return `sp_${index}_${crypto.randomBytes(4).toString('hex')}`;
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
   * Sleep utility for delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Get transaction statistics
   */
  getStatistics() {
    return {
      ...this.transactionStats,
      activeTransactions: this.activeTransactions.size,
      successRate: this.transactionStats.totalTransactions > 0
        ? (this.transactionStats.committedTransactions / this.transactionStats.totalTransactions * 100).toFixed(2) + '%'
        : '0%',
      deadlockPatterns: this.deadlockPatterns.size,
      averageTransactionTime: this.transactionStats.averageTransactionTime.toFixed(2) + 'ms'
    };
  }
  
  /**
   * Get active transaction information
   */
  getActiveTransactions() {
    const active = [];
    
    for (const [transactionId, transaction] of this.activeTransactions) {
      active.push({
        transactionId,
        startTime: transaction.startTime,
        age: Date.now() - transaction.startTime,
        isolationLevel: transaction.isolationLevel,
        readOnly: transaction.readOnly,
        operationCount: transaction.operations.length,
        savepointCount: transaction.savepoints.size,
        status: transaction.status
      });
    }
    
    return active;
  }
  
  /**
   * Force rollback all active transactions (emergency use only)
   */
  async forceRollbackAll() {
    console.warn('Force rolling back all active transactions');
    
    const rollbackPromises = Array.from(this.activeTransactions.entries()).map(
      async ([transactionId, transaction]) => {
        try {
          await this.rollbackTransaction(transaction);
          transaction.client.release();
        } catch (error) {
          console.error(`Failed to rollback transaction ${transactionId}:`, error.message);
        }
      }
    );
    
    await Promise.allSettled(rollbackPromises);
    this.activeTransactions.clear();
    
    this.emit('allTransactionsForceRolledBack');
  }
  
  /**
   * Shutdown the transaction manager
   */
  async shutdown() {
    // Clear cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    // Rollback all active transactions
    await this.forceRollbackAll();
    
    this.emit('shutdown');
    console.log('Transaction manager shutdown complete');
  }
}

module.exports = TransactionManager;