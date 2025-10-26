/**
 * Real-time Dashboard Data Aggregation Service
 * Provides aggregated data for dashboard visualization
 * @version 1.0.0
 * @author Mikrotik Billing System
 */

const EventEmitter = require('events');
const WebSocket = require('ws');
const { createReadStream } = require('fs');

class DashboardService extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      port: config.port || 3001,
      enableWebSocket: config.enableWebSocket !== false,
      enableRealtime: config.enableRealtime !== false,
      updateInterval: config.updateInterval || 5000, // 5 seconds
      cacheTimeout: config.cacheTimeout || 10000, // 10 seconds
      maxConnections: config.maxConnections || 100,
      enableCompression: config.enableCompression !== false,
      retentionPeriod: config.retentionPeriod || 3600000, // 1 hour
      aggregationWindows: config.aggregationWindows || {
        '1m': 60000,
        '5m': 300000,
        '15m': 900000,
        '1h': 3600000,
        '1d': 86400000
      },
      ...config
    };

    // WebSocket server
    this.wss = null;
    this.connections = new Set();

    // Data storage
    this.dashboardData = new Map();
    this.realtimeData = new Map();
    this.historicalData = new Map();
    this.aggregatedData = new Map();

    // Cache
    this.cache = new Map();
    this.cacheTimestamps = new Map();

    // Update timers
    this.updateTimer = null;
    this.cleanupTimer = null;

    // Data collectors
    this.collectors = new Map();

    // Initialize service
    this.initialize();
  }

  /**
   * Initialize dashboard service
   */
  initialize() {
    // Setup WebSocket server if enabled
    if (this.config.enableWebSocket) {
      this.setupWebSocketServer();
    }

    // Start real-time updates if enabled
    if (this.config.enableRealtime) {
      this.startRealtimeUpdates();
    }

    // Start cleanup timer
    this.startCleanupTimer();

    // Initialize dashboard components
    this.initializeDashboardComponents();

    this.emit('service:initialized');
  }

  /**
   * Setup WebSocket server for real-time updates
   */
  setupWebSocketServer() {
    this.wss = new WebSocket.Server({
      port: this.config.port,
      maxPayload: 1024 * 1024, // 1MB
      perMessageDeflate: this.config.enableCompression
    });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      this.emit('websocket:error', error);
    });

    this.emit('websocket:started', { port: this.config.port });
  }

  /**
   * Handle new WebSocket connection
   */
  handleConnection(ws, req) {
    const connectionId = this.generateConnectionId();
    const clientInfo = {
      id: connectionId,
      ws,
      ip: req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      connectedAt: Date.now(),
      subscriptions: new Set(),
      lastPing: Date.now()
    };

    this.connections.add(clientInfo);

    // Setup connection handlers
    ws.on('message', (data) => {
      this.handleMessage(clientInfo, data);
    });

    ws.on('pong', () => {
      clientInfo.lastPing = Date.now();
    });

    ws.on('close', () => {
      this.handleDisconnection(clientInfo);
    });

    ws.on('error', (error) => {
      this.emit('connection:error', { clientInfo, error });
    });

    // Send initial data
    this.sendInitialData(clientInfo);

    // Setup ping interval
    const pingInterval = setInterval(() => {
      if (clientInfo.ws.readyState === WebSocket.OPEN) {
        clientInfo.ws.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, 30000);

    clientInfo.pingInterval = pingInterval;

    this.emit('connection:established', clientInfo);

    // Enforce connection limit
    if (this.connections.size > this.config.maxConnections) {
      this.closeOldestConnection();
    }
  }

  /**
   * Handle WebSocket message
   */
  handleMessage(clientInfo, data) {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'subscribe':
          this.handleSubscription(clientInfo, message.data);
          break;
        case 'unsubscribe':
          this.handleUnsubscription(clientInfo, message.data);
          break;
        case 'request_data':
          this.handleDataRequest(clientInfo, message.data);
          break;
        case 'ping':
          clientInfo.ws.send(JSON.stringify({ type: 'pong' }));
          break;
        default:
          this.emit('message:unknown', { clientInfo, message });
      }
    } catch (error) {
      this.emit('message:error', { clientInfo, error });
    }
  }

  /**
   * Handle subscription to dashboard data
   */
  handleSubscription(clientInfo, subscription) {
    const { dashboard, component, filters } = subscription;

    const subscriptionKey = `${dashboard}:${component}`;
    clientInfo.subscriptions.add(subscriptionKey);

    // Send current data for subscription
    const currentData = this.getCurrentData(dashboard, component, filters);
    this.sendData(clientInfo, {
      type: 'subscription_update',
      subscription: subscriptionKey,
      data: currentData
    });

    this.emit('subscription:added', { clientInfo, subscription });
  }

  /**
   * Handle unsubscription
   */
  handleUnsubscription(clientInfo, subscription) {
    const { dashboard, component } = subscription;
    const subscriptionKey = `${dashboard}:${component}`;
    clientInfo.subscriptions.delete(subscriptionKey);

    this.emit('subscription:removed', { clientInfo, subscription });
  }

  /**
   * Handle data request
   */
  async handleDataRequest(clientInfo, request) {
    const { dashboard, component, timeframe, filters } = request;

    try {
      const data = await this.getData(dashboard, component, timeframe, filters);
      this.sendData(clientInfo, {
        type: 'data_response',
        requestId: request.requestId,
        data
      });
    } catch (error) {
      this.sendData(clientInfo, {
        type: 'error',
        requestId: request.requestId,
        error: error.message
      });
    }
  }

  /**
   * Send initial data to new connection
   */
  async sendInitialData(clientInfo) {
    try {
      const initialData = {
        type: 'initial_data',
        timestamp: Date.now(),
        dashboards: await this.getAllDashboardData(),
        systemInfo: this.getSystemInfo()
      };

      this.sendData(clientInfo, initialData);
    } catch (error) {
      this.emit('initial_data:error', { clientInfo, error });
    }
  }

  /**
   * Send data to client
   */
  sendData(clientInfo, data) {
    if (clientInfo.ws.readyState === WebSocket.OPEN) {
      try {
        clientInfo.ws.send(JSON.stringify(data));
      } catch (error) {
        this.emit('send:error', { clientInfo, error });
      }
    }
  }

  /**
   * Handle disconnection
   */
  handleDisconnection(clientInfo) {
    if (clientInfo.pingInterval) {
      clearInterval(clientInfo.pingInterval);
    }

    this.connections.delete(clientInfo);
    this.emit('connection:closed', clientInfo);
  }

  /**
   * Close oldest connection when limit is reached
   */
  closeOldestConnection() {
    let oldestConnection = null;
    let oldestTime = Date.now();

    for (const connection of this.connections) {
      if (connection.connectedAt < oldestTime) {
        oldestTime = connection.connectedAt;
        oldestConnection = connection;
      }
    }

    if (oldestConnection) {
      oldestConnection.ws.close(1008, 'Connection limit exceeded');
    }
  }

  /**
   * Start real-time updates
   */
  startRealtimeUpdates() {
    this.updateTimer = setInterval(async () => {
      await this.updateRealtimeData();
    }, this.config.updateInterval);
  }

  /**
   * Update real-time data
   */
  async updateRealtimeData() {
    try {
      const timestamp = Date.now();

      // Collect data from all sources
      const updates = await this.collectRealtimeUpdates();

      // Update internal data stores
      this.updateDataStores(updates, timestamp);

      // Broadcast to subscribed clients
      this.broadcastUpdates(updates, timestamp);

      this.emit('data:updated', { timestamp, updates });
    } catch (error) {
      this.emit('update:error', error);
    }
  }

  /**
   * Collect real-time updates from all sources
   */
  async collectRealtimeUpdates() {
    const updates = {};

    // System metrics
    updates.system = await this.collectSystemMetrics();

    // Business metrics
    updates.business = await this.collectBusinessMetrics();

    // Application metrics
    updates.application = await this.collectApplicationMetrics();

    // Database metrics
    updates.database = await this.collectDatabaseMetrics();

    // Cache metrics
    updates.cache = await this.collectCacheMetrics();

    // Mikrotik metrics
    updates.mikrotik = await this.collectMikrotikMetrics();

    // Alert metrics
    updates.alerts = await this.collectAlertMetrics();

    return updates;
  }

  /**
   * Collect system metrics
   */
  async collectSystemMetrics() {
    const os = require('os');
    const memUsage = process.memoryUsage();

    return {
      cpu: {
        usage: process.cpuUsage(),
        loadAverage: os.loadavg(),
        cores: os.cpus().length
      },
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        rss: memUsage.rss
      },
      uptime: process.uptime(),
      timestamp: Date.now()
    };
  }

  /**
   * Collect business metrics
   */
  async collectBusinessMetrics() {
    // This would integrate with the actual business data sources
    return {
      customers: {
        total: 0,
        active: 0,
        new: 0,
        byLocation: {}
      },
      vouchers: {
        total: 0,
        active: 0,
        sold: 0,
        revenue: 0,
        byLocation: {}
      },
      payments: {
        total: 0,
        successful: 0,
        failed: 0,
        amount: 0,
        byMethod: {}
      },
      timestamp: Date.now()
    };
  }

  /**
   * Collect application metrics
   */
  async collectApplicationMetrics() {
    return {
      http: {
        requests: 0,
        active: 0,
        errors: 0,
        avgResponseTime: 0,
        statusCodes: {}
      },
      sessions: {
        active: 0,
        total: 0,
        byUserType: {}
      },
      events: {
        processed: 0,
        failed: 0,
        queueSize: 0
      },
      timestamp: Date.now()
    };
  }

  /**
   * Collect database metrics
   */
  async collectDatabaseMetrics() {
    return {
      connections: {
        active: 0,
        idle: 0,
        total: 0,
        byPool: {}
      },
      queries: {
        total: 0,
        successful: 0,
        failed: 0,
        avgDuration: 0,
        byTable: {}
      },
      timestamp: Date.now()
    };
  }

  /**
   * Collect cache metrics
   */
  async collectCacheMetrics() {
    return {
      redis: {
        hitRate: 0,
        keys: 0,
        memory: 0,
        operations: 0
      },
      lru: {
        hitRate: 0,
        size: 0,
        evictions: 0,
        operations: 0
      },
      timestamp: Date.now()
    };
  }

  /**
   * Collect Mikrotik metrics
   */
  async collectMikrotikMetrics() {
    return {
      connections: {
        active: 0,
        total: 0,
        byLocation: {}
      },
      users: {
        hotspot: 0,
        pppoe: 0,
        total: 0,
        byLocation: {}
      },
      api: {
        requests: 0,
        successful: 0,
        failed: 0,
        avgDuration: 0
      },
      timestamp: Date.now()
    };
  }

  /**
   * Collect alert metrics
   */
  async collectAlertMetrics() {
    return {
      active: 0,
      total: 0,
      bySeverity: {
        critical: 0,
        warning: 0,
        info: 0
      },
      byComponent: {},
      timestamp: Date.now()
    };
  }

  /**
   * Update data stores with new data
   */
  updateDataStores(updates, timestamp) {
    // Update real-time data
    Object.entries(updates).forEach(([category, data]) => {
      if (!this.realtimeData.has(category)) {
        this.realtimeData.set(category, []);
      }

      const categoryData = this.realtimeData.get(category);
      categoryData.push({ ...data, timestamp });

      // Keep only recent data
      const maxAge = timestamp - this.config.retentionPeriod;
      this.realtimeData.set(category,
        categoryData.filter(item => item.timestamp > maxAge)
      );
    });

    // Update aggregated data
    this.updateAggregatedData(updates, timestamp);
  }

  /**
   * Update aggregated data
   */
  updateAggregatedData(updates, timestamp) {
    Object.entries(this.config.aggregationWindows).forEach(([windowName, windowSize]) => {
      Object.entries(updates).forEach(([category, data]) => {
        const key = `${category}:${windowName}`;

        if (!this.aggregatedData.has(key)) {
          this.aggregatedData.set(key, []);
        }

        const aggregated = this.aggregatedData.get(key);
        aggregated.push({ ...data, timestamp });

        // Keep only data within aggregation window
        const cutoff = timestamp - windowSize;
        this.aggregatedData.set(key,
          aggregated.filter(item => item.timestamp > cutoff)
        );
      });
    });
  }

  /**
   * Broadcast updates to subscribed clients
   */
  broadcastUpdates(updates, timestamp) {
    const updateMessage = {
      type: 'realtime_update',
      timestamp,
      updates
    };

    this.connections.forEach(clientInfo => {
      if (clientInfo.subscriptions.size > 0) {
        // Filter updates based on subscriptions
        const filteredUpdates = this.filterUpdatesForClient(updates, clientInfo);

        if (Object.keys(filteredUpdates).length > 0) {
          this.sendData(clientInfo, {
            ...updateMessage,
            updates: filteredUpdates
          });
        }
      }
    });
  }

  /**
   * Filter updates based on client subscriptions
   */
  filterUpdatesForClient(updates, clientInfo) {
    const filtered = {};

    for (const subscription of clientInfo.subscriptions) {
      const [dashboard, component] = subscription.split(':');

      if (updates[component]) {
        filtered[component] = updates[component];
      }
    }

    return filtered;
  }

  /**
   * Get current data for dashboard component
   */
  getCurrentData(dashboard, component, filters = {}) {
    const cacheKey = `${dashboard}:${component}:${JSON.stringify(filters)}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.config.cacheTimeout) {
      return cached.data;
    }

    // Get data from source
    let data = this.realtimeData.get(component);

    // Apply filters
    if (filters && data) {
      data = this.applyFilters(data, filters);
    }

    // Cache result
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });

    return data || [];
  }

  /**
   * Get data with timeframe
   */
  async getData(dashboard, component, timeframe, filters = {}) {
    const cacheKey = `${dashboard}:${component}:${timeframe}:${JSON.stringify(filters)}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.config.cacheTimeout) {
      return cached.data;
    }

    // Get data based on timeframe
    let data;
    const windowSize = this.config.aggregationWindows[timeframe];

    if (windowSize) {
      const key = `${component}:${timeframe}`;
      data = this.aggregatedData.get(key) || [];
    } else {
      data = this.realtimeData.get(component) || [];
    }

    // Apply filters
    if (filters) {
      data = this.applyFilters(data, filters);
    }

    // Cache result
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });

    return data;
  }

  /**
   * Apply filters to data
   */
  applyFilters(data, filters) {
    if (!filters || !Array.isArray(data)) {
      return data;
    }

    return data.filter(item => {
      // Time filter
      if (filters.startTime && item.timestamp < filters.startTime) {
        return false;
      }
      if (filters.endTime && item.timestamp > filters.endTime) {
        return false;
      }

      // Value filters
      if (filters.minValue && item.value < filters.minValue) {
        return false;
      }
      if (filters.maxValue && item.value > filters.maxValue) {
        return false;
      }

      // Custom filters
      if (filters.custom && typeof filters.custom === 'function') {
        return filters.custom(item);
      }

      return true;
    });
  }

  /**
   * Get all dashboard data
   */
  async getAllDashboardData() {
    const dashboards = {};

    for (const [category, data] of this.realtimeData) {
      dashboards[category] = {
        current: data[data.length - 1] || null,
        recent: data.slice(-10) // Last 10 data points
      };
    }

    return dashboards;
  }

  /**
   * Get system information
   */
  getSystemInfo() {
    return {
      version: process.env.npm_package_version || '1.0.0',
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      connectedClients: this.connections.size,
      activeSubscriptions: Array.from(this.connections)
        .reduce((sum, client) => sum + client.subscriptions.size, 0)
    };
  }

  /**
   * Initialize dashboard components
   */
  initializeDashboardComponents() {
    // Initialize system overview dashboard
    this.dashboardData.set('system-overview', {
      name: 'System Overview',
      components: ['cpu', 'memory', 'disk', 'network'],
      refreshInterval: 5000
    });

    // Initialize business metrics dashboard
    this.dashboardData.set('business-metrics', {
      name: 'Business Metrics',
      components: ['customers', 'vouchers', 'payments', 'revenue'],
      refreshInterval: 10000
    });

    // Initialize application performance dashboard
    this.dashboardData.set('application-performance', {
      name: 'Application Performance',
      components: ['http', 'database', 'cache', 'events'],
      refreshInterval: 5000
    });

    // Initialize Mikrotik dashboard
    this.dashboardData.set('mikrotik-status', {
      name: 'Mikrotik Status',
      components: ['connections', 'users', 'api'],
      refreshInterval: 10000
    });
  }

  /**
   * Generate connection ID
   */
  generateConnectionId() {
    return Math.random().toString(36).substr(2, 9);
  }

  /**
   * Start cleanup timer
   */
  startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 300000); // Every 5 minutes
  }

  /**
   * Cleanup old data
   */
  cleanup() {
    const now = Date.now();
    const cutoff = now - this.config.retentionPeriod;

    // Clean up cache
    for (const [key, cached] of this.cache) {
      if ((now - cached.timestamp) > this.config.cacheTimeout) {
        this.cache.delete(key);
      }
    }

    // Clean up data stores
    for (const [category, data] of this.realtimeData) {
      this.realtimeData.set(category,
        data.filter(item => item.timestamp > cutoff)
      );
    }

    // Clean up aggregated data
    for (const [key, data] of this.aggregatedData) {
      const [category, windowName] = key.split(':');
      const windowSize = this.config.aggregationWindows[windowName];
      const dataCutoff = now - windowSize;

      this.aggregatedData.set(key,
        data.filter(item => item.timestamp > dataCutoff)
      );
    }

    this.emit('cleanup:completed');
  }

  /**
   * Get service statistics
   */
  getStatistics() {
    return {
      connections: {
        active: this.connections.size,
        max: this.config.maxConnections,
        subscriptions: Array.from(this.connections)
          .reduce((sum, client) => sum + client.subscriptions.size, 0)
      },
      data: {
        realtimeData: Array.from(this.realtimeData.values())
          .reduce((sum, data) => sum + data.length, 0),
        aggregatedData: Array.from(this.aggregatedData.values())
          .reduce((sum, data) => sum + data.length, 0),
        cacheSize: this.cache.size
      },
      performance: {
        updateInterval: this.config.updateInterval,
        cacheTimeout: this.config.cacheTimeout,
        retentionPeriod: this.config.retentionPeriod
      }
    };
  }

  /**
   * Shutdown service
   */
  async shutdown() {
    // Clear timers
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
    }

    // Close all connections
    for (const clientInfo of this.connections) {
      if (clientInfo.pingInterval) {
        clearInterval(clientInfo.pingInterval);
      }
      clientInfo.ws.close();
    }

    this.connections.clear();
    this.emit('service:shutdown');
  }
}

module.exports = DashboardService;