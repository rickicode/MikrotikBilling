/**
 * Intelligent Alert Manager
 * Multi-channel alerting system with correlation and escalation
 * @version 1.0.0
 * @author Mikrotik Billing System
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class AlertManager extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      enabled: config.enabled !== false,
      cooldownPeriod: config.cooldownPeriod || 300000, // 5 minutes
      maxAlertsPerHour: config.maxAlertsPerHour || 100,
      retentionPeriod: config.retentionPeriod || 86400000, // 24 hours
      aggregationWindow: config.aggregationWindow || 60000, // 1 minute
      escalationDelay: config.escalationDelay || 600000, // 10 minutes
      maxEscalationLevel: config.maxEscalationLevel || 3,
      enableDeduplication: config.enableDeduplication !== false,
      enableCorrelation: config.enableCorrelation !== false,
      enableMLDetection: config.enableMLDetection || false,
      channels: config.channels || {},
      rules: config.rules || [],
      templates: config.templates || {},
      onCall: config.onCall || {},
      ...config
    };

    // Alert storage
    this.alerts = new Map();
    this.activeAlerts = new Map();
    this.alertHistory = [];
    this.silencedAlerts = new Map();
    this.escalationTimers = new Map();

    // Rate limiting
    this.alertCounts = new Map();
    this.lastReset = Date.now();

    // Correlation engine
    this.correlationEngine = new AlertCorrelationEngine(this.config.correlation);

    // Notification channels
    this.channels = new Map();
    this.initializeChannels();

    // Alert processors
    this.processors = new Map();
    this.initializeProcessors();

    // Alert rules engine
    this.rulesEngine = new AlertRulesEngine(this.config.rules);

    // Alert state tracking
    this.alertStates = new Map();
    this.alertMetrics = {
      total: 0,
      sent: 0,
      failed: 0,
      suppressed: 0,
      correlated: 0
    };

    // Start cleanup timer
    this.startCleanupTimer();
  }

  /**
   * Initialize notification channels
   */
  initializeChannels() {
    // Email channel
    if (this.config.channels.email?.enabled) {
      this.channels.set('email', new EmailChannel(this.config.channels.email));
    }

    // Slack channel
    if (this.config.channels.slack?.enabled) {
      this.channels.set('slack', new SlackChannel(this.config.channels.slack));
    }

    // SMS channel
    if (this.config.channels.sms?.enabled) {
      this.channels.set('sms', new SMSChannel(this.config.channels.sms));
    }

    // Webhook channel
    if (this.config.channels.webhook?.enabled) {
      this.channels.set('webhook', new WebhookChannel(this.config.channels.webhook));
    }

    // WhatsApp channel
    if (this.config.channels.whatsapp?.enabled) {
      this.channels.set('whatsapp', new WhatsAppChannel(this.config.channels.whatsapp));
    }

    // PagerDuty channel
    if (this.config.channels.pagerduty?.enabled) {
      this.channels.set('pagerduty', new PagerDutyChannel(this.config.channels.pagerduty));
    }
  }

  /**
   * Initialize alert processors
   */
  initializeProcessors() {
    this.processors.set('deduplication', new DeduplicationProcessor(this.config));
    this.processors.set('rateLimit', new RateLimitProcessor(this.config));
    this.processors.set('aggregation', new AggregationProcessor(this.config));
    this.processors.set('escalation', new EscalationProcessor(this.config));
    this.processors.set('templating', new TemplatingProcessor(this.config.templates));
  }

  /**
   * Create and send an alert
   */
  async createAlert(alertData) {
    try {
      const alert = this.normalizeAlert(alertData);
      const alertId = alert.id || this.generateAlertId(alert);

      // Check if alert should be processed
      if (!this.shouldProcessAlert(alert)) {
        this.alertMetrics.suppressed++;
        return { id: alertId, status: 'suppressed', reason: 'filtered' };
      }

      // Store alert
      this.alerts.set(alertId, alert);
      this.alertMetrics.total++;

      // Process alert through processors
      const processedAlert = await this.processAlert(alert);

      if (processedAlert.status === 'suppressed') {
        this.alertMetrics.suppressed++;
        return { id: alertId, status: 'suppressed', reason: processedAlert.reason };
      }

      // Check for correlations
      if (this.config.enableCorrelation) {
        const correlations = await this.correlationEngine.findCorrelations(processedAlert);
        if (correlations.length > 0) {
          processedAlert.correlations = correlations;
          this.alertMetrics.correlated++;
        }
      }

      // Send alert through channels
      const results = await this.sendAlert(processedAlert);

      // Update alert state
      this.updateAlertState(alertId, processedAlert, results);

      // Emit events
      this.emit('alert:created', { alert: processedAlert, results });
      this.emit('alert:sent', { alertId, results });

      return {
        id: alertId,
        status: 'sent',
        alert: processedAlert,
        results
      };

    } catch (error) {
      this.emit('alert:error', { error, alertData });
      throw error;
    }
  }

  /**
   * Normalize alert data
   */
  normalizeAlert(alertData) {
    return {
      id: alertData.id || null,
      name: alertData.name || 'Unknown Alert',
      message: alertData.message || '',
      severity: alertData.severity || 'warning',
      status: alertData.status || 'firing',
      timestamp: alertData.timestamp || Date.now(),
      labels: alertData.labels || {},
      annotations: alertData.annotations || {},
      source: alertData.source || 'system',
      component: alertData.component || 'unknown',
      environment: alertData.environment || process.env.NODE_ENV || 'development',
      fingerprint: alertData.fingerprint || null,
      runbook_url: alertData.runbook_url || null,
      dashboard_url: alertData.dashboard_url || null,
      values: alertData.values || {},
      threshold: alertData.threshold || null,
      currentValue: alertData.currentValue || null,
      ...alertData
    };
  }

  /**
   * Generate alert ID
   */
  generateAlertId(alert) {
    const fingerprint = this.generateFingerprint(alert);
    return crypto.createHash('sha256')
      .update(`${fingerprint}-${Date.now()}`)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Generate alert fingerprint for deduplication
   */
  generateFingerprint(alert) {
    const key = [
      alert.name,
      alert.severity,
      alert.component,
      JSON.stringify(alert.labels),
      JSON.stringify(alert.values)
    ].join('|');

    return crypto.createHash('md5').update(key).digest('hex');
  }

  /**
   * Check if alert should be processed
   */
  shouldProcessAlert(alert) {
    // Check if alert is silenced
    if (this.isSilenced(alert)) {
      return false;
    }

    // Check rate limits
    if (this.isRateLimited(alert)) {
      return false;
    }

    // Check alert rules
    if (!this.rulesEngine.evaluate(alert)) {
      return false;
    }

    return true;
  }

  /**
   * Check if alert is silenced
   */
  isSilenced(alert) {
    const fingerprint = alert.fingerprint || this.generateFingerprint(alert);
    const silenced = this.silencedAlerts.get(fingerprint);

    if (silenced && silenced.expires > Date.now()) {
      return true;
    }

    return false;
  }

  /**
   * Check if alert is rate limited
   */
  isRateLimited(alert) {
    const now = Date.now();
    const hour = Math.floor(now / 3600000); // Current hour

    // Reset counters every hour
    if (hour > this.lastReset) {
      this.alertCounts.clear();
      this.lastReset = hour;
    }

    const key = `${alert.name}-${alert.severity}`;
    const count = this.alertCounts.get(key) || 0;

    if (count >= this.config.maxAlertsPerHour) {
      return true;
    }

    this.alertCounts.set(key, count + 1);
    return false;
  }

  /**
   * Process alert through processors
   */
  async processAlert(alert) {
    let processedAlert = { ...alert };

    for (const [name, processor] of this.processors) {
      try {
        processedAlert = await processor.process(processedAlert);
      } catch (error) {
        console.error(`Alert processor ${name} failed:`, error);
      }
    }

    return processedAlert;
  }

  /**
   * Send alert through configured channels
   */
  async sendAlert(alert) {
    const results = new Map();

    // Determine which channels to use
    const targetChannels = this.getTargetChannels(alert);

    for (const channelName of targetChannels) {
      const channel = this.channels.get(channelName);

      if (!channel) {
        results.set(channelName, { success: false, error: 'Channel not found' });
        continue;
      }

      try {
        const result = await channel.send(alert);
        results.set(channelName, { success: true, ...result });
        this.alertMetrics.sent++;
      } catch (error) {
        results.set(channelName, { success: false, error: error.message });
        this.alertMetrics.failed++;
      }
    }

    return results;
  }

  /**
   * Get target channels for alert
   */
  getTargetChannels(alert) {
    const channels = [];

    // Default channels based on severity
    switch (alert.severity) {
      case 'critical':
        channels.push('email', 'sms', 'pagerduty', 'slack');
        break;
      case 'warning':
        channels.push('email', 'slack');
        break;
      case 'info':
        channels.push('slack');
        break;
      default:
        channels.push('email');
    }

    // Add custom channels based on labels
    if (alert.labels.channels) {
      const customChannels = alert.labels.channels.split(',').map(c => c.trim());
      channels.push(...customChannels);
    }

    // Filter to available channels
    return channels.filter(channel => this.channels.has(channel));
  }

  /**
   * Update alert state
   */
  updateAlertState(alertId, alert, results) {
    const state = {
      alertId,
      alert,
      results,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      escalationLevel: 0,
      notificationsSent: Array.from(results.keys())
    };

    this.alertStates.set(alertId, state);
    this.activeAlerts.set(alertId, state);

    // Setup escalation if needed
    if (alert.severity === 'critical') {
      this.setupEscalation(alertId, alert);
    }

    // Add to history
    this.alertHistory.push({
      ...state,
      action: 'created'
    });
  }

  /**
   * Setup escalation for alert
   */
  setupEscalation(alertId, alert) {
    if (alert.escalationLevel >= this.config.maxEscalationLevel) {
      return;
    }

    const timer = setTimeout(async () => {
      await this.escalateAlert(alertId, alert);
    }, this.config.escalationDelay);

    this.escalationTimers.set(alertId, timer);
  }

  /**
   * Escalate alert
   */
  async escalateAlert(alertId, alert) {
    const state = this.alertStates.get(alertId);
    if (!state) return;

    // Increase escalation level
    alert.escalationLevel = (alert.escalationLevel || 0) + 1;

    // Get escalation channels
    const escalationChannels = this.getEscalationChannels(alert);

    // Send through escalation channels
    const results = await this.sendAlert({
      ...alert,
      escalated: true,
      escalationLevel: alert.escalationLevel
    });

    // Update state
    state.escalationLevel = alert.escalationLevel;
    state.updatedAt = Date.now();
    state.notificationsSent.push(...Array.from(results.keys()));

    // Setup next escalation if needed
    if (alert.escalationLevel < this.config.maxEscalationLevel) {
      this.setupEscalation(alertId, alert);
    }

    this.emit('alert:escalated', { alertId, alert, results });
  }

  /**
   * Get escalation channels
   */
  getEscalationChannels(alert) {
    const channels = [];

    switch (alert.escalationLevel) {
      case 1:
        channels.push('sms', 'pagerduty');
        break;
      case 2:
        channels.push('pagerduty', 'whatsapp');
        break;
      case 3:
        channels.push('pagerduty', 'sms', 'email');
        break;
      default:
        channels.push('pagerduty');
    }

    return channels.filter(channel => this.channels.has(channel));
  }

  /**
   * Resolve alert
   */
  async resolveAlert(alertId, resolution = null) {
    const state = this.alertStates.get(alertId);
    if (!state) {
      throw new Error('Alert not found');
    }

    // Clear escalation timer
    const timer = this.escalationTimers.get(alertId);
    if (timer) {
      clearTimeout(timer);
      this.escalationTimers.delete(alertId);
    }

    // Update alert
    const alert = { ...state.alert, status: 'resolved' };
    if (resolution) {
      alert.resolution = resolution;
    }

    // Send resolution notification
    const results = await this.sendAlert(alert);

    // Update state
    state.status = 'resolved';
    state.alert = alert;
    state.results = results;
    state.updatedAt = Date.now();
    state.resolvedAt = Date.now();

    // Move from active to resolved
    this.activeAlerts.delete(alertId);

    // Add to history
    this.alertHistory.push({
      ...state,
      action: 'resolved'
    });

    this.emit('alert:resolved', { alertId, alert, results });

    return { alertId, status: 'resolved', results };
  }

  /**
   * Silence alert
   */
  silenceAlert(alertId, duration, reason = null) {
    const state = this.alertStates.get(alertId);
    if (!state) {
      throw new Error('Alert not found');
    }

    const fingerprint = state.alert.fingerprint || this.generateFingerprint(state.alert);
    const expires = Date.now() + duration;

    this.silencedAlerts.set(fingerprint, {
      alertId,
      reason,
      expires,
      createdAt: Date.now()
    });

    this.emit('alert:silenced', { alertId, fingerprint, duration, reason });

    return { alertId, silenced: true, expires };
  }

  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(alertId, acknowledgedBy = null) {
    const state = this.alertStates.get(alertId);
    if (!state) {
      throw new Error('Alert not found');
    }

    // Update alert
    const alert = { ...state.alert, status: 'acknowledged' };
    if (acknowledgedBy) {
      alert.acknowledgedBy = acknowledgedBy;
      alert.acknowledgedAt = Date.now();
    }

    // Send acknowledgment notification
    const results = await this.sendAlert(alert);

    // Update state
    state.status = 'acknowledged';
    state.alert = alert;
    state.results = results;
    state.updatedAt = Date.now();

    // Add to history
    this.alertHistory.push({
      ...state,
      action: 'acknowledged'
    });

    this.emit('alert:acknowledged', { alertId, alert, results });

    return { alertId, status: 'acknowledged', results };
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(filters = {}) {
    let alerts = Array.from(this.activeAlerts.values());

    // Apply filters
    if (filters.severity) {
      alerts = alerts.filter(state => state.alert.severity === filters.severity);
    }

    if (filters.component) {
      alerts = alerts.filter(state => state.alert.component === filters.component);
    }

    if (filters.status) {
      alerts = alerts.filter(state => state.alert.status === filters.status);
    }

    if (filters.limit) {
      alerts = alerts.slice(0, filters.limit);
    }

    return alerts;
  }

  /**
   * Get alert history
   */
  getAlertHistory(filters = {}) {
    let history = [...this.alertHistory];

    // Apply filters
    if (filters.startTime) {
      history = history.filter(entry => entry.createdAt >= filters.startTime);
    }

    if (filters.endTime) {
      history = history.filter(entry => entry.createdAt <= filters.endTime);
    }

    if (filters.action) {
      history = history.filter(entry => entry.action === filters.action);
    }

    // Sort by timestamp (newest first)
    history.sort((a, b) => b.createdAt - a.createdAt);

    if (filters.limit) {
      history = history.slice(0, filters.limit);
    }

    return history;
  }

  /**
   * Get alert metrics
   */
  getAlertMetrics() {
    return {
      ...this.alertMetrics,
      activeAlerts: this.activeAlerts.size,
      silencedAlerts: this.silencedAlerts.size,
      escalationTimers: this.escalationTimers.size,
      rateLimitedAlerts: Array.from(this.alertCounts.values()).reduce((sum, count) => sum + count, 0),
      uptime: process.uptime(),
      channelStatus: this.getChannelStatus()
    };
  }

  /**
   * Get channel status
   */
  getChannelStatus() {
    const status = {};

    for (const [name, channel] of this.channels) {
      status[name] = {
        enabled: channel.isEnabled(),
        lastUsed: channel.getLastUsed(),
        errorCount: channel.getErrorCount(),
        successRate: channel.getSuccessRate()
      };
    }

    return status;
  }

  /**
   * Start cleanup timer
   */
  startCleanupTimer() {
    setInterval(() => {
      this.cleanup();
    }, 300000); // Every 5 minutes
  }

  /**
   * Cleanup old data
   */
  cleanup() {
    const now = Date.now();
    const cutoff = now - this.config.retentionPeriod;

    // Clean up old history
    this.alertHistory = this.alertHistory.filter(entry => entry.createdAt > cutoff);

    // Clean up expired silences
    for (const [fingerprint, silence] of this.silencedAlerts) {
      if (silence.expires < now) {
        this.silencedAlerts.delete(fingerprint);
      }
    }

    // Clean up resolved states
    for (const [alertId, state] of this.alertStates) {
      if (state.status === 'resolved' && state.resolvedAt < cutoff) {
        this.alertStates.delete(alertId);
      }
    }

    this.emit('cleanup:completed', {
      historyEntries: this.alertHistory.length,
      silencedAlerts: this.silencedAlerts.size,
      totalStates: this.alertStates.size
    });
  }

  /**
   * Test alert system
   */
  async testAlert(alertData = null) {
    const testAlert = alertData || {
      name: 'Test Alert',
      message: 'This is a test alert from the alert manager',
      severity: 'info',
      component: 'alert-manager',
      source: 'test'
    };

    return await this.createAlert(testAlert);
  }

  /**
   * Get system status
   */
  getSystemStatus() {
    return {
      enabled: this.config.enabled,
      uptime: process.uptime(),
      metrics: this.getAlertMetrics(),
      config: {
        cooldownPeriod: this.config.cooldownPeriod,
        maxAlertsPerHour: this.config.maxAlertsPerHour,
        channelsEnabled: this.channels.size,
        correlationEnabled: this.config.enableCorrelation,
        mlDetectionEnabled: this.config.enableMLDetection
      }
    };
  }

  /**
   * Shutdown alert manager
   */
  async shutdown() {
    // Clear escalation timers
    for (const timer of this.escalationTimers.values()) {
      clearTimeout(timer);
    }
    this.escalationTimers.clear();

    // Close channels
    for (const channel of this.channels.values()) {
      if (typeof channel.close === 'function') {
        await channel.close();
      }
    }

    this.emit('shutdown');
  }
}

/**
 * Alert Correlation Engine
 */
class AlertCorrelationEngine {
  constructor(config = {}) {
    this.config = {
      enabled: config.enabled !== false,
      windowSize: config.windowSize || 300000, // 5 minutes
      similarityThreshold: config.similarityThreshold || 0.8,
      maxCorrelations: config.maxCorrelations || 5,
      ...config
    };

    this.correlationRules = config.rules || [];
    this.recentAlerts = [];
  }

  async findCorrelations(alert) {
    if (!this.config.enabled) {
      return [];
    }

    const correlations = [];
    const now = Date.now();
    const windowStart = now - this.config.windowSize;

    // Get recent alerts within time window
    const recentAlerts = this.recentAlerts.filter(a => a.timestamp >= windowStart);

    // Check correlation rules
    for (const rule of this.correlationRules) {
      const matches = this.applyCorrelationRule(alert, recentAlerts, rule);
      if (matches.length > 0) {
        correlations.push({
          rule: rule.name,
          alerts: matches,
          confidence: rule.confidence || 0.8
        });
      }
    }

    // Add current alert to recent alerts
    this.recentAlerts.push(alert);

    // Cleanup old alerts
    this.recentAlerts = this.recentAlerts.filter(a => a.timestamp >= windowStart);

    return correlations.slice(0, this.config.maxCorrelations);
  }

  applyCorrelationRule(alert, recentAlerts, rule) {
    const matches = [];

    for (const recentAlert of recentAlerts) {
      if (this.matchesRule(alert, recentAlert, rule)) {
        matches.push(recentAlert);
      }
    }

    return matches;
  }

  matchesRule(alert1, alert2, rule) {
    // Check component similarity
    if (rule.component && alert1.component === alert2.component && alert1.component === rule.component) {
      return true;
    }

    // Check label similarity
    if (rule.labels) {
      for (const [key, value] of Object.entries(rule.labels)) {
        if (alert1.labels[key] === value && alert2.labels[key] === value) {
          return true;
        }
      }
    }

    // Check time proximity
    if (rule.timeWindow && Math.abs(alert1.timestamp - alert2.timestamp) <= rule.timeWindow) {
      return true;
    }

    return false;
  }
}

/**
 * Alert Rules Engine
 */
class AlertRulesEngine {
  constructor(rules = []) {
    this.rules = rules;
  }

  evaluate(alert) {
    for (const rule of this.rules) {
      if (this.matchesRule(alert, rule)) {
        return rule.action !== 'suppress';
      }
    }

    return true; // Default: allow alert
  }

  matchesRule(alert, rule) {
    // Check severity
    if (rule.severity && !rule.severity.includes(alert.severity)) {
      return false;
    }

    // Check component
    if (rule.component && alert.component !== rule.component) {
      return false;
    }

    // Check labels
    if (rule.labels) {
      for (const [key, value] of Object.entries(rule.labels)) {
        if (alert.labels[key] !== value) {
          return false;
        }
      }
    }

    // Check time window
    if (rule.timeWindow) {
      const now = Date.now();
      if (alert.timestamp < now - rule.timeWindow) {
        return false;
      }
    }

    return true;
  }
}

/**
 * Base Alert Processor
 */
class AlertProcessor {
  constructor(config = {}) {
    this.config = config;
  }

  async process(alert) {
    throw new Error('Process method must be implemented');
  }
}

/**
 * Deduplication Processor
 */
class DeduplicationProcessor extends AlertProcessor {
  async process(alert) {
    const fingerprint = alert.fingerprint || this.generateFingerprint(alert);
    alert.fingerprint = fingerprint;

    // Check for duplicates in recent alerts
    // This would integrate with a persistent store in production
    return alert;
  }

  generateFingerprint(alert) {
    const key = [
      alert.name,
      alert.severity,
      alert.component,
      JSON.stringify(alert.labels)
    ].join('|');

    return require('crypto').createHash('md5').update(key).digest('hex');
  }
}

/**
 * Rate Limit Processor
 */
class RateLimitProcessor extends AlertProcessor {
  async process(alert) {
    // Check if alert should be rate limited
    // This would integrate with a persistent store in production
    return alert;
  }
}

/**
 * Aggregation Processor
 */
class AggregationProcessor extends AlertProcessor {
  async process(alert) {
    // Check if alert should be aggregated
    // This would implement logic to group similar alerts
    return alert;
  }
}

/**
 * Escalation Processor
 */
class EscalationProcessor extends AlertProcessor {
  async process(alert) {
    // Set up escalation rules
    if (alert.severity === 'critical') {
      alert.escalationLevel = 0;
    }

    return alert;
  }
}

/**
 * Templating Processor
 */
class TemplatingProcessor extends AlertProcessor {
  constructor(templates = {}) {
    super();
    this.templates = templates;
  }

  async process(alert) {
    // Apply templates to alert message
    if (this.templates[alert.name]) {
      alert.message = this.applyTemplate(alert.message, alert, this.templates[alert.name]);
    }

    return alert;
  }

  applyTemplate(message, alert, template) {
    // Simple template substitution
    return message.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return alert[key] || alert.labels[key] || match;
    });
  }
}

// Export main class
module.exports = AlertManager;

// Export channel classes (would be implemented separately)
module.exports.EmailChannel = class EmailChannel {
  constructor(config) { this.config = config; }
  async send(alert) { return { messageId: 'email-123' }; }
  isEnabled() { return true; }
  getLastUsed() { return Date.now(); }
  getErrorCount() { return 0; }
  getSuccessRate() { return 1; }
};

module.exports.SlackChannel = class SlackChannel {
  constructor(config) { this.config = config; }
  async send(alert) { return { messageId: 'slack-123' }; }
  isEnabled() { return true; }
  getLastUsed() { return Date.now(); }
  getErrorCount() { return 0; }
  getSuccessRate() { return 1; }
};

module.exports.SMSChannel = class SMSChannel {
  constructor(config) { this.config = config; }
  async send(alert) { return { messageId: 'sms-123' }; }
  isEnabled() { return true; }
  getLastUsed() { return Date.now(); }
  getErrorCount() { return 0; }
  getSuccessRate() { return 1; }
};

module.exports.WebhookChannel = class WebhookChannel {
  constructor(config) { this.config = config; }
  async send(alert) { return { messageId: 'webhook-123' }; }
  isEnabled() { return true; }
  getLastUsed() { return Date.now(); }
  getErrorCount() { return 0; }
  getSuccessRate() { return 1; }
};

module.exports.WhatsAppChannel = class WhatsAppChannel {
  constructor(config) { this.config = config; }
  async send(alert) { return { messageId: 'whatsapp-123' }; }
  isEnabled() { return true; }
  getLastUsed() { return Date.now(); }
  getErrorCount() { return 0; }
  getSuccessRate() { return 1; }
};

module.exports.PagerDutyChannel = class PagerDutyChannel {
  constructor(config) { this.config = config; }
  async send(alert) { return { messageId: 'pagerduty-123' }; }
  isEnabled() { return true; }
  getLastUsed() { return Date.now(); }
  getErrorCount() { return 0; }
  getSuccessRate() { return 1; }
};