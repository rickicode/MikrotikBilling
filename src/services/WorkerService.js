const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');
const os = require('os');

class WorkerService {
  constructor(options = {}) {
    this.options = {
      maxWorkers: options.maxWorkers || Math.max(2, os.cpus().length - 1),
      workerTimeout: options.workerTimeout || 30000,
      maxTaskQueue: options.maxTaskQueue || 1000,
      ...options
    };

    this.workers = new Map();
    this.taskQueue = [];
    this.activeWorkers = 0;
    this.workerIdCounter = 0;
    this.isShuttingDown = false;

    if (isMainThread) {
      this.initializeWorkerPool();
      this.setupGracefulShutdown();
    }
  }

  initializeWorkerPool() {
    console.log(`🔧 Initializing worker pool with ${this.options.maxWorkers} workers`);

    for (let i = 0; i < this.options.maxWorkers; i++) {
      this.createWorker();
    }

    // Start task processor
    this.processTaskQueue();
  }

  createWorker() {
    const workerId = ++this.workerIdCounter;
    const worker = new Worker(__filename, {
      workerData: { workerId }
    });

    worker.on('online', () => {
      console.log(`✅ Worker ${workerId} is online`);
      this.workers.set(workerId, {
        worker,
        busy: false,
        lastUsed: Date.now(),
        taskCount: 0
      });
    });

    worker.on('message', (result) => {
      this.handleWorkerMessage(workerId, result);
    });

    worker.on('error', (error) => {
      console.error(`❌ Worker ${workerId} error:`, error);
      this.handleWorkerError(workerId, error);
    });

    worker.on('exit', (code) => {
      console.log(`🔌 Worker ${workerId} exited with code ${code}`);
      this.handleWorkerExit(workerId, code);
    });

    // Set worker timeout
    setTimeout(() => {
      if (this.workers.has(workerId)) {
        console.warn(`⚠️  Worker ${workerId} timeout, terminating...`);
        worker.terminate();
      }
    }, this.options.workerTimeout);

    return worker;
  }

  async executeTask(taskType, data, options = {}) {
    return new Promise((resolve, reject) => {
      const task = {
        id: this.generateTaskId(),
        type: taskType,
        data,
        options,
        resolve,
        reject,
        createdAt: Date.now(),
        timeout: options.timeout || this.options.workerTimeout
      };

      if (this.taskQueue.length >= this.options.maxTaskQueue) {
        reject(new Error('Task queue is full'));
        return;
      }

      this.taskQueue.push(task);
      this.processTaskQueue();
    });
  }

  processTaskQueue() {
    if (this.isShuttingDown || this.taskQueue.length === 0) {
      return;
    }

    // Find available worker
    const availableWorker = Array.from(this.workers.entries())
      .find(([id, worker]) => !worker.busy && worker.worker);

    if (!availableWorker) {
      // No available workers, wait for one to finish
      return;
    }

    const [workerId, workerInfo] = availableWorker;
    const task = this.taskQueue.shift();

    if (!task) {
      return;
    }

    // Mark worker as busy
    workerInfo.busy = true;
    workerInfo.lastUsed = Date.now();
    workerInfo.taskCount++;
    this.activeWorkers++;

    // Set task timeout
    const timeoutId = setTimeout(() => {
      if (this.workers.has(workerId)) {
        workerInfo.worker.terminate();
        task.reject(new Error(`Task ${task.id} timed out after ${task.timeout}ms`));
      }
    }, task.timeout);

    // Send task to worker
    workerInfo.worker.postMessage({
      taskId: task.id,
      type: task.type,
      data: task.data,
      options: task.options
    });

    // Store task reference
    this.workers.get(workerId).currentTask = {
      ...task,
      timeoutId
    };
  }

  handleWorkerMessage(workerId, result) {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo) return;

    const task = workerInfo.currentTask;
    if (!task) return;

    // Clear timeout
    clearTimeout(task.timeoutId);

    // Mark worker as available
    workerInfo.busy = false;
    workerInfo.currentTask = null;
    this.activeWorkers--;

    // Resolve/reject task
    if (result.success) {
      task.resolve(result.data);
    } else {
      task.reject(new Error(result.error));
    }

    // Process next task
    this.processTaskQueue();
  }

  handleWorkerError(workerId, error) {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo) return;

    const task = workerInfo.currentTask;
    if (task) {
      clearTimeout(task.timeoutId);
      task.reject(error);
      workerInfo.currentTask = null;
      this.activeWorkers--;
    }

    // Remove and recreate worker
    this.workers.delete(workerId);
    setTimeout(() => this.createWorker(), 1000);
  }

  handleWorkerExit(workerId, code) {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo) return;

    const task = workerInfo.currentTask;
    if (task) {
      clearTimeout(task.timeoutId);
      task.reject(new Error(`Worker exited with code ${code}`));
      workerInfo.currentTask = null;
      this.activeWorkers--;
    }

    // Remove worker
    this.workers.delete(workerId);

    // Recreate worker if not shutting down
    if (!this.isShuttingDown) {
      setTimeout(() => this.createWorker(), 1000);
    }
  }

  // Specific task handlers
  async processVoucherBatch(voucherData) {
    return this.executeTask('process-voucher-batch', voucherData);
  }

  async syncMikrotikData(syncData) {
    return this.executeTask('sync-mikrotik-data', syncData);
  }

  async generateReport(reportConfig) {
    return this.executeTask('generate-report', reportConfig);
  }

  async sendBulkNotifications(notifications) {
    return this.executeTask('send-bulk-notifications', notifications);
  }

  async processPaymentBatch(paymentData) {
    return this.executeTask('process-payment-batch', paymentData);
  }

  async backupDatabase(backupConfig) {
    return this.executeTask('backup-database', backupConfig, {
      timeout: 300000 // 5 minutes for backup
    });
  }

  async compressFiles(files) {
    return this.executeTask('compress-files', files, {
      timeout: 600000 // 10 minutes for compression
    });
  }

  // Utility methods
  generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getWorkerStatistics() {
    const stats = {
      totalWorkers: this.workers.size,
      activeWorkers: this.activeWorkers,
      queuedTasks: this.taskQueue.length,
      workers: []
    };

    for (const [id, worker] of this.workers) {
      stats.workers.push({
        id,
        busy: worker.busy,
        lastUsed: worker.lastUsed,
        taskCount: worker.taskCount,
        uptime: Date.now() - worker.lastUsed
      });
    }

    return stats;
  }

  async shutdown() {
    console.log('🛑 Shutting down worker service...');
    this.isShuttingDown = true;

    // Wait for active tasks to complete (with timeout)
    const shutdownTimeout = 10000; // 10 seconds
    const startTime = Date.now();

    while (this.activeWorkers > 0 && Date.now() - startTime < shutdownTimeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Terminate all workers
    const terminatePromises = Array.from(this.workers.entries()).map(([id, worker]) => {
      if (worker.currentTask) {
        clearTimeout(worker.currentTask.timeoutId);
        worker.currentTask.reject(new Error('Worker service shutting down'));
      }
      return worker.worker.terminate();
    });

    await Promise.all(terminatePromises);
    this.workers.clear();

    console.log('✅ Worker service shutdown completed');
  }

  setupGracefulShutdown() {
    const gracefulShutdown = async () => {
      console.log('📡 Received shutdown signal, shutting down worker service...');
      await this.shutdown();
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  }
}

// Worker thread implementation
if (!isMainThread) {
  const { workerId } = workerData;

  // Task handlers
  const taskHandlers = {
    'process-voucher-batch': async (data) => {
      // Simulate CPU-intensive voucher batch processing
      const { vouchers, batchSize = 100 } = data;
      const results = [];

      for (let i = 0; i < vouchers.length; i += batchSize) {
        const batch = vouchers.slice(i, i + batchSize);

        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 10));

        // Process batch
        const processedBatch = batch.map(voucher => ({
          ...voucher,
          processed: true,
          timestamp: new Date().toISOString(),
          workerId
        }));

        results.push(...processedBatch);
      }

      return {
        success: true,
        data: {
          processed: results.length,
          vouchers: results
        }
      };
    },

    'sync-mikrotik-data': async (data) => {
      // Simulate Mikrotik data synchronization
      const { routerHost, syncType } = data;

      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

      return {
        success: true,
        data: {
          routerHost,
          syncType,
          syncedAt: new Date().toISOString(),
          recordsCount: Math.floor(Math.random() * 1000),
          workerId
        }
      };
    },

    'generate-report': async (data) => {
      // Simulate report generation
      const { reportType, dateRange } = data;

      // Simulate CPU-intensive report generation
      await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

      return {
        success: true,
        data: {
          reportType,
          dateRange,
          generatedAt: new Date().toISOString(),
          recordCount: Math.floor(Math.random() * 10000),
          fileSize: Math.floor(Math.random() * 1000000), // bytes
          workerId
        }
      };
    },

    'send-bulk-notifications': async (data) => {
      // Simulate bulk notification sending
      const { notifications, batchSize = 50 } = data;
      const results = [];

      for (let i = 0; i < notifications.length; i += batchSize) {
        const batch = notifications.slice(i, i + batchSize);

        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 100));

        const batchResults = batch.map(notification => ({
          ...notification,
          sent: true,
          sentAt: new Date().toISOString(),
          workerId
        }));

        results.push(...batchResults);
      }

      return {
        success: true,
        data: {
          sent: results.length,
          notifications: results
        }
      };
    },

    'process-payment-batch': async (data) => {
      // Simulate payment batch processing
      const { payments } = data;

      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

      const results = payments.map(payment => ({
        ...payment,
        status: Math.random() > 0.1 ? 'success' : 'failed',
        processedAt: new Date().toISOString(),
        workerId
      }));

      return {
        success: true,
        data: {
          processed: results.length,
          successful: results.filter(r => r.status === 'success').length,
          failed: results.filter(r => r.status === 'failed').length,
          payments: results
        }
      };
    },

    'backup-database': async (data) => {
      // Simulate database backup
      const { backupType, compression } = data;

      // Simulate backup time (longer operation)
      await new Promise(resolve => setTimeout(resolve, 5000 + Math.random() * 10000));

      return {
        success: true,
        data: {
          backupType,
          compression,
          backupPath: `/backups/backup_${Date.now()}.sql`,
          size: Math.floor(Math.random() * 100000000), // 0-100MB
          createdAt: new Date().toISOString(),
          workerId
        }
      };
    },

    'compress-files': async (data) => {
      // Simulate file compression
      const { files, compressionType = 'gzip' } = data;

      // Simulate compression time
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      const compressionTime = Math.max(1000, totalSize / 1000000 * 2000); // 2s per MB

      await new Promise(resolve => setTimeout(resolve, compressionTime));

      return {
        success: true,
        data: {
          compressionType,
          originalSize: totalSize,
          compressedSize: Math.floor(totalSize * 0.3), // 70% compression
          filesCount: files.length,
          compressedAt: new Date().toISOString(),
          workerId
        }
      };
    }
  };

  // Handle messages from main thread
  parentPort.on('message', async (message) => {
    const { taskId, type, data, options } = message;

    try {
      const handler = taskHandlers[type];
      if (!handler) {
        throw new Error(`Unknown task type: ${type}`);
      }

      const result = await handler(data);

      parentPort.postMessage({
        taskId,
        success: true,
        data: result.data
      });

    } catch (error) {
      parentPort.postMessage({
        taskId,
        success: false,
        error: error.message
      });
    }
  });

  // Handle worker shutdown
  process.on('SIGTERM', () => {
    process.exit(0);
  });
}

module.exports = WorkerService;