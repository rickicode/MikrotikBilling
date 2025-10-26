const { Pool } = require('pg');
const EventEmitter = require('events');

class ReadReplicasManager extends EventEmitter {
  constructor(primaryConfig, replicaConfigs = []) {
    super();

    this.primaryConfig = primaryConfig;
    this.replicaConfigs = replicaConfigs;
    this.replicas = new Map();
    this.currentReplicaIndex = 0;
    this.healthCheckInterval = 30000; // 30 seconds
    this.isShuttingDown = false;

    this.initializeReplicas();
    this.startHealthChecks();
  }

  initializeReplicas() {
    console.log(`📊 Initializing ${this.replicaConfigs.length} read replicas...`);

    this.replicaConfigs.forEach((config, index) => {
      const replica = {
        id: `replica-${index}`,
        pool: null,
        config: { ...config, readOnly: true },
        status: 'initializing',
        lastHealthCheck: null,
        errorCount: 0,
        queryCount: 0,
        averageResponseTime: 0
      };

      try {
        replica.pool = new Pool({
          host: config.host,
          port: config.port || 5432,
          database: config.database || this.primaryConfig.database,
          user: config.user || this.primaryConfig.user,
          password: config.password || this.primaryConfig.password,
          max: config.maxConnections || 20,
          min: config.minConnections || 2,
          idleTimeoutMillis: config.idleTimeout || 30000,
          connectionTimeoutMillis: config.connectionTimeout || 10000,
          readOnly: true,
          // Replica-specific settings
          application_name: `mikrotik_billing_replica_${index}`,
          // Disable statement timeout for replicas (read operations should be fast)
          statement_timeout: null
        });

        // Set up event listeners
        replica.pool.on('connect', (client) => {
          // Set read-only session parameters
          client.query('SET default_transaction_read_only = true');
          client.query('SET transaction_read_only = true');
        });

        replica.pool.on('error', (error) => {
          console.error(`❌ Replica ${replica.id} error:`, error);
          replica.errorCount++;
          this.handleReplicaError(replica.id, error);
        });

        this.replicas.set(replica.id, replica);
        console.log(`✅ Replica ${replica.id} initialized (${config.host}:${config.port || 5432})`);

      } catch (error) {
        console.error(`❌ Failed to initialize replica ${replica.id}:`, error);
        replica.status = 'failed';
        replica.error = error.message;
      }
    });
  }

  startHealthChecks() {
    if (this.healthCheckInterval <= 0) return;

    setInterval(async () => {
      if (!this.isShuttingDown) {
        await this.performHealthChecks();
      }
    }, this.healthCheckInterval);

    // Initial health check
    setTimeout(() => this.performHealthChecks(), 5000);
  }

  async performHealthChecks() {
    const healthCheckPromises = Array.from(this.replicas.entries()).map(
      async ([replicaId, replica]) => {
        try {
          const startTime = Date.now();
          const result = await replica.pool.query('SELECT 1 as health_check, pg_last_xact_replay_timestamp() as last_replay');
          const responseTime = Date.now() - startTime;

          // Update replica stats
          replica.status = 'healthy';
          replica.lastHealthCheck = new Date();
          replica.averageResponseTime = (replica.averageResponseTime + responseTime) / 2;

          // Check replication lag
          if (result.rows[0].pg_last_xact_replay_timestamp) {
            const replicationLag = Date.now() - new Date(result.rows[0].pg_last_xact_replay_timestamp).getTime();
            replica.replicationLag = replicationLag;

            if (replicationLag > 30000) { // 30 seconds lag
              console.warn(`⚠️  Replica ${replicaId} has high replication lag: ${replicationLag}ms`);
              replica.status = 'lagging';
            }
          }

          this.emit('replica-health', {
            replicaId,
            status: replica.status,
            responseTime,
            replicationLag: replica.replicationLag
          });

        } catch (error) {
          replica.status = 'unhealthy';
          replica.lastHealthCheck = new Date();
          replica.errorCount++;

          console.error(`❌ Health check failed for replica ${replicaId}:`, error.message);

          this.emit('replica-error', {
            replicaId,
            error: error.message
          });
        }
      }
    );

    await Promise.allSettled(healthCheckPromises);
  }

  // Get a healthy replica for read operations
  getReadReplica() {
    const healthyReplicas = Array.from(this.replicas.entries())
      .filter(([id, replica]) => replica.status === 'healthy' && replica.pool);

    if (healthyReplicas.length === 0) {
      console.warn('⚠️  No healthy replicas available, falling back to primary');
      return null;
    }

    // Round-robin selection
    const [replicaId, replica] = healthyReplicas[this.currentReplicaIndex % healthyReplicas.length];
    this.currentReplicaIndex++;

    // Update query count
    replica.queryCount++;

    return {
      id: replicaId,
      pool: replica.pool,
      replica
    };
  }

  // Execute read query on replica
  async queryOnReplica(sql, params = [], options = {}) {
    const replica = this.getReadReplica();

    if (!replica) {
      throw new Error('No healthy replicas available');
    }

    const startTime = Date.now();

    try {
      const result = await replica.pool.query({
        text: sql,
        values: params,
        timeout: options.timeout || 30000
      });

      const duration = Date.now() - startTime;

      // Update performance metrics
      replica.replica.averageResponseTime = (replica.replica.averageResponseTime + duration) / 2;

      // Log slow queries
      if (duration > 1000) {
        console.warn(`⚠️  Slow query on replica ${replica.id}: ${duration}ms`);
      }

      this.emit('query-executed', {
        replicaId: replica.id,
        sql,
        duration,
        success: true
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;

      console.error(`❌ Query failed on replica ${replica.id}:`, error);

      this.emit('query-failed', {
        replicaId: replica.id,
        sql,
        duration,
        error: error.message
      });

      // Mark replica as unhealthy if too many errors
      if (replica.replica.errorCount > 5) {
        replica.status = 'unhealthy';
      }

      throw error;
    }
  }

  // Execute read query with automatic failover
  async queryWithFailover(sql, params = [], options = {}) {
    const maxRetries = options.maxRetries || 2;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt === 0) {
          // First attempt: try replica
          return await this.queryOnReplica(sql, params, options);
        } else {
          // Subsequent attempts: try different replicas or fallback to primary
          console.warn(`⚠️  Query retry ${attempt} for SQL: ${sql.substring(0, 100)}...`);

          if (this.getReadReplica()) {
            return await this.queryOnReplica(sql, params, options);
          } else {
            // Fallback to primary if no replicas are healthy
            console.warn('⚠️  Falling back to primary database');
            throw new Error('No healthy replicas available');
          }
        }
      } catch (error) {
        lastError = error;

        if (attempt < maxRetries) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 100 * attempt));
        }
      }
    }

    throw lastError;
  }

  // Batch read operations across replicas
  async batchQuery(queries, options = {}) {
    const { batchSize = 10, useParallel = true } = options;
    const results = [];

    if (useParallel) {
      // Execute queries in parallel across different replicas
      const promises = queries.map(async (query, index) => {
        try {
          const result = await this.queryWithFailover(query.sql, query.params, query.options);
          return { index, success: true, data: result };
        } catch (error) {
          return { index, success: false, error: error.message };
        }
      });

      const batchResults = await Promise.allSettled(promises);
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results[result.value.index] = result.value;
        } else {
          results[index] = { success: false, error: result.reason.message };
        }
      });

    } else {
      // Execute queries sequentially
      for (let i = 0; i < queries.length; i++) {
        try {
          const result = await this.queryWithFailover(queries[i].sql, queries[i].params, queries[i].options);
          results.push({ success: true, data: result });
        } catch (error) {
          results.push({ success: false, error: error.message });
        }
      }
    }

    return results;
  }

  // Get replication statistics
  getReplicationStats() {
    const stats = {
      totalReplicas: this.replicas.size,
      healthyReplicas: 0,
      unhealthyReplicas: 0,
      replicas: []
    };

    for (const [replicaId, replica] of this.replicas) {
      const replicaStats = {
        id: replicaId,
        status: replica.status,
        host: replica.config.host,
        port: replica.config.port || 5432,
        queryCount: replica.queryCount,
        averageResponseTime: replica.averageResponseTime,
        errorCount: replica.errorCount,
        lastHealthCheck: replica.lastHealthCheck,
        replicationLag: replica.replicationLag
      };

      stats.replicas.push(replicaStats);

      if (replica.status === 'healthy') {
        stats.healthyReplicas++;
      } else {
        stats.unhealthyReplicas++;
      }
    }

    return stats;
  }

  // Promote a replica to primary (for disaster recovery)
  async promoteReplica(replicaId) {
    const replica = this.replicas.get(replicaId);
    if (!replica) {
      throw new Error(`Replica ${replicaId} not found`);
    }

    try {
      console.log(`🔧 Promoting replica ${replicaId} to primary...`);

      // This would typically involve:
      // 1. Stopping replication
      // 2. Enabling write mode
      // 3. Updating application configuration

      await replica.pool.query('SELECT pg_promote()');

      console.log(`✅ Replica ${replicaId} promoted to primary`);

      this.emit('replica-promoted', { replicaId });

    } catch (error) {
      console.error(`❌ Failed to promote replica ${replicaId}:`, error);
      throw error;
    }
  }

  // Handle replica errors
  handleReplicaError(replicaId, error) {
    const replica = this.replicas.get(replicaId);
    if (!replica) return;

    replica.errorCount++;

    if (replica.errorCount > 10) {
      replica.status = 'unhealthy';
      console.error(`❌ Replica ${replicaId} marked as unhealthy after ${replica.errorCount} errors`);
    }

    this.emit('replica-error', {
      replicaId,
      error: error.message,
      errorCount: replica.errorCount
    });
  }

  // Restart unhealthy replica
  async restartReplica(replicaId) {
    const replica = this.replicas.get(replicaId);
    if (!replica) {
      throw new Error(`Replica ${replicaId} not found`);
    }

    try {
      console.log(`🔄 Restarting replica ${replicaId}...`);

      // Close existing pool
      if (replica.pool) {
        await replica.pool.end();
      }

      // Recreate pool
      replica.pool = new Pool({
        ...replica.config,
        application_name: `mikrotik_billing_replica_${replicaId.split('-')[1]}`
      });

      replica.status = 'initializing';
      replica.errorCount = 0;

      // Test connection
      await replica.pool.query('SELECT 1');
      replica.status = 'healthy';

      console.log(`✅ Replica ${replicaId} restarted successfully`);

    } catch (error) {
      console.error(`❌ Failed to restart replica ${replicaId}:`, error);
      replica.status = 'failed';
      throw error;
    }
  }

  // Graceful shutdown
  async shutdown() {
    console.log('🛑 Shutting down read replicas manager...');
    this.isShuttingDown = true;

    const closePromises = Array.from(this.replicas.entries()).map(async ([replicaId, replica]) => {
      try {
        if (replica.pool) {
          await replica.pool.end();
          console.log(`✅ Replica ${replicaId} closed`);
        }
      } catch (error) {
        console.error(`❌ Error closing replica ${replicaId}:`, error);
      }
    });

    await Promise.all(closePromises);
    this.replicas.clear();

    console.log('✅ Read replicas manager shutdown completed');
  }
}

module.exports = ReadReplicasManager;