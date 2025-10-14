const logger = console;

/**
 * Production Alerting Service
 * Implements alert management, notifications, and escalation
 */
class AlertingService {
  constructor() {
    this.alerts = new Map();
    this.alertRules = new Map();
    this.notificationChannels = new Map();
    this.alertHistory = [];
    this.escalationPolicies = new Map();

    this.initializeAlertRules();
    this.initializeNotificationChannels();
    this.initializeEscalationPolicies();
  }

  /**
   * Initialize default alert rules
   */
  initializeAlertRules() {
    // System Health Alerts
    this.alertRules.set('high_cpu_usage', {
      name: 'High CPU Usage',
      description: 'CPU usage exceeds threshold',
      severity: 'warning',
      condition: (metrics) => {
        // Handle both old and new metric structures
        const cpuUsage = metrics?.metrics?.cpu?.usage || metrics?.system?.cpu || 0;
        return cpuUsage > 80;
      },
      threshold: 80,
      duration: 300, // 5 minutes
      cooldown: 1800 // 30 minutes
    });

    this.alertRules.set('high_memory_usage', {
      name: 'High Memory Usage',
      description: 'Memory usage exceeds threshold',
      severity: 'warning',
      condition: (metrics) => {
        // Handle both old and new metric structures
        const memoryUsage = metrics?.metrics?.memory?.percentage || metrics?.system?.memory || 0;
        return memoryUsage > 85;
      },
      threshold: 85,
      duration: 300,
      cooldown: 1800
    });

    this.alertRules.set('disk_space_low', {
      name: 'Low Disk Space',
      description: 'Available disk space is below threshold',
      severity: 'critical',
      condition: (metrics) => {
        // Handle both old and new metric structures
        const diskUsage = metrics?.metrics?.disk?.percentage || metrics?.system?.disk || 0;
        return diskUsage > 90;
      },
      threshold: 90,
      duration: 60,
      cooldown: 3600
    });

    // Application Health Alerts
    this.alertRules.set('database_connection_failed', {
      name: 'Database Connection Failed',
      description: 'Unable to connect to database',
      severity: 'critical',
      condition: (metrics) => {
        // Default to connected if no status provided
        return !!(metrics?.database?.connected === false);
      },
      duration: 30,
      cooldown: 600
    });

    this.alertRules.set('redis_connection_failed', {
      name: 'Redis Connection Failed',
      description: 'Unable to connect to Redis',
      severity: 'critical',
      condition: (metrics) => {
        // Default to connected if no status provided
        return !!(metrics?.redis?.connected === false);
      },
      duration: 30,
      cooldown: 600
    });

    this.alertRules.set('mikrotik_connection_failed', {
      name: 'Mikrotik Connection Failed',
      description: 'Unable to connect to Mikrotik router',
      severity: 'critical',
      condition: (metrics) => {
        // Default to connected if no status provided
        return !!(metrics?.mikrotik?.connected === false);
      },
      duration: 60,
      cooldown: 1800
    });

    // Business Logic Alerts
    this.alertRules.set('high_error_rate', {
      name: 'High Error Rate',
      description: 'HTTP error rate exceeds threshold',
      severity: 'warning',
      condition: (metrics) => {
        // Handle missing http metrics gracefully
        const totalRequests = metrics?.http?.total || 0;
        const errorRequests = metrics?.http?.errors || 0;
        return totalRequests > 0 && (errorRequests / totalRequests) > 0.05; // 5%
      },
      threshold: 5,
      duration: 300,
      cooldown: 1800
    });

    this.alertRules.set('slow_response_time', {
      name: 'Slow Response Time',
      description: 'Average response time exceeds threshold',
      severity: 'warning',
      condition: (metrics) => (metrics?.http?.avgResponseTime || 0) > 5000, // 5 seconds
      threshold: 5000,
      duration: 300,
      cooldown: 1800
    });

    this.alertRules.set('payment_failure_rate', {
      name: 'High Payment Failure Rate',
      description: 'Payment failure rate exceeds threshold',
      severity: 'critical',
      condition: (metrics) => {
        // Handle missing payment metrics gracefully
        const totalPayments = metrics?.payments?.total || 0;
        const failedPayments = metrics?.payments?.failed || 0;
        return totalPayments > 0 && (failedPayments / totalPayments) > 0.1; // 10%
      },
      threshold: 10,
      duration: 600,
      cooldown: 3600
    });

    // Security Alerts
    this.alertRules.set('failed_login_attempts', {
      name: 'Failed Login Attempts',
      description: 'Multiple failed login attempts detected',
      severity: 'warning',
      condition: (metrics) => (metrics?.security?.failedLogins || 0) > 5,
      threshold: 5,
      duration: 300,
      cooldown: 3600
    });

    this.alertRules.set('suspicious_activity', {
      name: 'Suspicious Activity',
      description: 'Suspicious activity detected',
      severity: 'critical',
      condition: (metrics) => (metrics?.security?.suspiciousActivity || 0) > 0,
      threshold: 1,
      duration: 60,
      cooldown: 7200
    });

    // Business Alerts
    this.alertRules.set('low_voucher_stock', {
      name: 'Low Voucher Stock',
      description: 'Available voucher count is below threshold',
      severity: 'warning',
      condition: (metrics) => (metrics?.business?.vouchers?.available || 999) < 10,
      threshold: 10,
      duration: 60,
      cooldown: 3600
    });

    this.alertRules.set('subscription_expiry_soon', {
      name: 'Subscription Expiring Soon',
      description: 'Customers with subscriptions expiring soon',
      severity: 'info',
      condition: (metrics) => (metrics?.business?.subscriptions?.expiringSoon || 0) > 0,
      threshold: 1,
      duration: 3600, // 1 hour
      cooldown: 86400 // 24 hours
    });

    // Backup Alerts
    this.alertRules.set('backup_failed', {
      name: 'Backup Failed',
      description: 'Backup operation failed',
      severity: 'critical',
      condition: (metrics) => metrics?.backup?.lastStatus === 'failed',
      threshold: 1,
      duration: 60,
      cooldown: 1800
    });

    this.alertRules.set('backup_not_recent', {
      name: 'Backup Not Recent',
      description: 'No recent backup available',
      severity: 'warning',
      condition: (metrics) => {
        const lastBackup = metrics?.backup?.lastSuccessful;
        return !lastBackup || (Date.now() - lastBackup) > 86400000; // 24 hours
      },
      threshold: 86400000,
      duration: 300,
      cooldown: 7200
    });
  }

  /**
   * Initialize notification channels - WhatsApp Only
   */
  initializeNotificationChannels() {
    // WhatsApp notifications only
    this.notificationChannels.set('whatsapp', {
      name: 'WhatsApp Notifications',
      type: 'whatsapp',
      enabled: process.env.WHATSAPP_NOTIFICATIONS_ENABLED !== 'false', // Default to enabled
      config: {
        phoneNumbers: process.env.ALERT_WHATSAPP_NUMBERS?.split(',') || ['+6281234567890']
      }
    });
  }

  /**
   * Initialize escalation policies - WhatsApp Only
   */
  initializeEscalationPolicies() {
    this.escalationPolicies.set('critical', {
      levels: [
        {
          level: 1,
          delay: 0, // Immediate
          channels: ['whatsapp'],
          recipients: ['admin', 'support']
        },
        {
          level: 2,
          delay: 1800, // 30 minutes
          channels: ['whatsapp'],
          recipients: ['admin', 'manager', 'support']
        },
        {
          level: 3,
          delay: 3600, // 1 hour
          channels: ['whatsapp'],
          recipients: ['admin', 'manager', 'support', 'emergency']
        }
      ]
    });

    this.escalationPolicies.set('warning', {
      levels: [
        {
          level: 1,
          delay: 0,
          channels: ['whatsapp'],
          recipients: ['admin']
        },
        {
          level: 2,
          delay: 3600, // 1 hour
          channels: ['whatsapp'],
          recipients: ['admin', 'support']
        }
      ]
    });

    this.escalationPolicies.set('info', {
      levels: [
        {
          level: 1,
          delay: 0,
          channels: ['whatsapp'],
          recipients: ['admin']
        }
      ]
    });
  }

  /**
   * Evaluate alert rules against current metrics
   */
  async evaluateAlerts(metrics) {
    const triggeredAlerts = [];

    for (const [ruleId, rule] of this.alertRules) {
      try {
        if (rule.condition(metrics)) {
          const alert = await this.triggerAlert(ruleId, metrics);
          if (alert) {
            triggeredAlerts.push(alert);
          }
        } else {
          await this.resolveAlert(ruleId, metrics);
        }
      } catch (error) {
        logger.error(`Error evaluating alert rule ${ruleId}:`, error);
      }
    }

    return triggeredAlerts;
  }

  /**
   * Trigger an alert
   */
  async triggerAlert(ruleId, metrics) {
    const rule = this.alertRules.get(ruleId);
    if (!rule) return null;

    const alertId = `${ruleId}_${Date.now()}`;
    const existingAlert = this.alerts.get(ruleId);

    // Check cooldown
    if (existingAlert && existingAlert.lastTriggered) {
      const timeSinceLastTrigger = Date.now() - existingAlert.lastTriggered;
      if (timeSinceLastTrigger < rule.cooldown * 1000) {
        return null;
      }
    }

    const alert = {
      id: alertId,
      ruleId,
      name: rule.name,
      description: rule.description,
      severity: rule.severity,
      status: 'triggered',
      triggeredAt: new Date().toISOString(),
      metrics,
      acknowledged: false,
      resolved: false
    };

    this.alerts.set(ruleId, alert);
    this.alertHistory.push(alert);

    // Send notifications
    await this.sendNotifications(alert);

    // Start escalation if critical
    if (rule.severity === 'critical') {
      await this.startEscalation(alert);
    }

    logger.warn(`Alert triggered: ${rule.name} (${rule.severity})`);
    return alert;
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(ruleId, metrics) {
    const alert = this.alerts.get(ruleId);
    if (!alert || alert.resolved) return;

    alert.status = 'resolved';
    alert.resolvedAt = new Date().toISOString();
    alert.resolutionMetrics = metrics;

    // Send resolution notification
    await this.sendResolutionNotification(alert);

    logger.info(`Alert resolved: ${alert.name}`);
  }

  /**
   * Send notifications for an alert
   */
  async sendNotifications(alert) {
    const policy = this.escalationPolicies.get(alert.severity);
    if (!policy) return;

    const level = policy.levels[0]; // Start with level 1

    for (const channel of level.channels) {
      const notificationChannel = this.notificationChannels.get(channel);
      if (notificationChannel && notificationChannel.enabled) {
        try {
          await this.sendViaChannel(notificationChannel, alert);
        } catch (error) {
          logger.error(`Failed to send notification via ${channel}:`, error);
        }
      }
    }
  }

  /**
   * Send notification via specific channel - WhatsApp Only
   */
  async sendViaChannel(channel, alert) {
    const message = this.formatAlertMessage(alert);

    if (channel.type === 'whatsapp') {
      await this.sendWhatsAppNotification(channel, message, alert);
    } else {
      logger.warn(`Unsupported notification channel: ${channel.type}`);
    }
  }

  /**
   * Format alert message
   */
  formatAlertMessage(alert) {
    const severityEmoji = {
      critical: '🚨',
      warning: '⚠️',
      info: 'ℹ️'
    };

    // Helper function to safely extract metric values
    const getMetricValue = (path, fallback = 0) => {
      try {
        const keys = path.split('.');
        let value = alert.metrics || {};
        for (const key of keys) {
          value = value?.[key];
        }
        return typeof value === 'number' ? value : fallback;
      } catch {
        return fallback;
      }
    };

    // Helper function to safely extract boolean status
    const getConnectionStatus = (path) => {
      try {
        const keys = path.split('.');
        let value = alert.metrics || {};
        for (const key of keys) {
          value = value?.[key];
        }
        return value === true ? 'Connected' : 'Disconnected';
      } catch {
        return 'Disconnected';
      }
    };

    return `${severityEmoji[alert.severity]} *${alert.name}*

${alert.description}

*Severity:* ${alert.severity}
*Triggered:* ${new Date(alert.triggeredAt).toLocaleString()}

*System:*
- CPU: ${getMetricValue('system.cpu') || getMetricValue('metrics.cpu.usage') || 0}%
- Memory: ${getMetricValue('system.memory') || getMetricValue('metrics.memory.percentage') || 0}%
- Disk: ${getMetricValue('system.disk') || getMetricValue('metrics.disk.percentage') || 0}%

*Application:*
- Database: ${getConnectionStatus('database.connected')}
- Redis: ${getConnectionStatus('redis.connected')}
- Mikrotik: ${getConnectionStatus('mikrotik.connected')}

This is an automated alert from HIJINETWORK System.`;
  }

  /**
   * Send WhatsApp notification - Integrated with WhatsAppService
   */
  async sendWhatsAppNotification(channel, message, alert) {
    try {
      // Get WhatsAppService from global scope (will be set by monitoring route)
      const WhatsAppService = global.WhatsAppService || require('./WhatsAppService');

      // Send to all configured phone numbers
      for (const phoneNumber of channel.config.phoneNumbers) {
        if (typeof WhatsAppService === 'function') {
          // If it's a constructor, create instance
          const ws = new WhatsAppService();
          await ws.sendMessage(phoneNumber, message, {
            type: 'system_alert',
            alertName: alert.name,
            severity: alert.severity,
            description: alert.description,
            timestamp: alert.triggeredAt
          });
        } else if (WhatsAppService && typeof WhatsAppService.sendMessage === 'function') {
          // If it's already an instance
          await WhatsAppService.sendMessage(phoneNumber, message, {
            type: 'system_alert',
            alertName: alert.name,
            severity: alert.severity,
            description: alert.description,
            timestamp: alert.triggeredAt
          });
        }
      }

      logger.info(`WhatsApp alert processed for ${channel.config.phoneNumbers.length} recipients`);
    } catch (error) {
      logger.error('Failed to send WhatsApp notification:', error);
      throw error;
    }
  }

  /**
   * Send resolution notification
   */
  async sendResolutionNotification(alert) {
    const resolutionMessage = `✅ *${alert.name} Resolved*

The alert has been automatically resolved.

*Resolved:* ${new Date(alert.resolvedAt).toLocaleString()}
*Duration:* ${this.formatDuration(alert.triggeredAt, alert.resolvedAt)}`;

    // Send to all channels that received the original alert
    for (const [channelId, channel] of this.notificationChannels) {
      if (channel.enabled) {
        try {
          await this.sendViaChannel(channel, { ...alert, message: resolutionMessage });
        } catch (error) {
          logger.error(`Failed to send resolution notification via ${channelId}:`, error);
        }
      }
    }
  }

  /**
   * Start escalation process for critical alerts
   */
  async startEscalation(alert) {
    const policy = this.escalationPolicies.get(alert.severity);
    if (!policy || policy.levels.length <= 1) return;

    alert.escalation = {
      currentLevel: 1,
      startedAt: new Date().toISOString(),
      nextEscalation: null
    };

    // Schedule next escalation
    const nextLevel = policy.levels[1];
    if (nextLevel) {
      alert.escalation.nextEscalation = new Date(
        Date.now() + nextLevel.delay * 1000
      ).toISOString();

      // Set timeout for escalation
      setTimeout(async () => {
        await this.escalateAlert(alert, 2);
      }, nextLevel.delay * 1000);
    }
  }

  /**
   * Escalate alert to next level
   */
  async escalateAlert(alert, level) {
    const policy = this.escalationPolicies.get(alert.severity);
    if (!policy || level > policy.levels.length) return;

    const escalationLevel = policy.levels[level - 1];
    if (!escalationLevel) return;

    alert.escalation.currentLevel = level;
    alert.escalation.lastEscalatedAt = new Date().toISOString();

    // Send notifications to escalation level recipients
    for (const channel of escalationLevel.channels) {
      const notificationChannel = this.notificationChannels.get(channel);
      if (notificationChannel && notificationChannel.enabled) {
        try {
          const escalationMessage = `${this.formatAlertMessage(alert)}

*ESCALATION LEVEL ${level}*`;
          await this.sendViaChannel(notificationChannel, { ...alert, message: escalationMessage });
        } catch (error) {
          logger.error(`Failed to send escalation notification via ${channel}:`, error);
        }
      }
    }

    logger.warn(`Alert escalated to level ${level}: ${alert.name}`);

    // Schedule next escalation if available
    if (level < policy.levels.length) {
      const nextLevel = policy.levels[level];
      setTimeout(async () => {
        await this.escalateAlert(alert, level + 1);
      }, nextLevel.delay * 1000);
    }
  }

  /**
   * Get active alerts
   */
  getActiveAlerts() {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit = 100) {
    return this.alertHistory.slice(-limit).reverse();
  }

  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(alertId, acknowledgedBy) {
    const alert = Array.from(this.alerts.values()).find(a => a.id === alertId);
    if (!alert) return false;

    alert.acknowledged = true;
    alert.acknowledgedAt = new Date().toISOString();
    alert.acknowledgedBy = acknowledgedBy;

    // Stop escalation if in progress
    if (alert.escalation) {
      alert.escalation.stoppedAt = new Date().toISOString();
    }

    return true;
  }

  /**
   * Format duration
   */
  formatDuration(start, end) {
    const duration = Math.floor((new Date(end) - new Date(start)) / 1000);
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = duration % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

module.exports = AlertingService;