const fs = require('fs');
const path = require('path');

/**
 * Comprehensive security logging system for HIJINETWORK
 * Implements audit trails, incident response, and compliance monitoring
 */
class SecurityLogger {
  constructor() {
    this.logDir = path.join(process.cwd(), 'logs', 'security');
    this.ensureLogDirectory();
    this.initializeLoggers();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  initializeLoggers() {
    // Different log files for different security events
    this.logFiles = {
      authentication: path.join(this.logDir, 'auth.log'),
      authorization: path.join(this.logDir, 'authz.log'),
      data_access: path.join(this.logDir, 'data_access.log'),
      suspicious_activity: path.join(this.logDir, 'suspicious.log'),
      system_events: path.join(this.logDir, 'system.log'),
      compliance: path.join(this.logDir, 'compliance.log'),
      incidents: path.join(this.logDir, 'incidents.log')
    };
  }

  /**
   * Log authentication events
   */
  logAuthentication(event, details) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      type: 'authentication',
      details: {
        ip: details.ip,
        username: details.username,
        success: details.success,
        userAgent: details.userAgent,
        method: details.method,
        failureReason: details.failureReason,
        sessionId: details.sessionId
      },
      severity: details.success ? 'info' : 'warning'
    };

    this.writeLog('authentication', logEntry);

    // Log failed authentication attempts to suspicious activity log
    if (!details.success) {
      this.logSuspiciousActivity({
        type: 'failed_authentication',
        ip: details.ip,
        username: details.username,
        details: `Failed ${details.method} authentication`,
        severity: 'medium'
      });
    }
  }

  /**
   * Log authorization events
   */
  logAuthorization(event, details) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      type: 'authorization',
      details: {
        userId: details.userId,
        username: details.username,
        action: details.action,
        resource: details.resource,
        authorized: details.authorized,
        ip: details.ip,
        method: details.method
      },
      severity: details.authorized ? 'info' : 'warning'
    };

    this.writeLog('authorization', logEntry);

    // Log unauthorized access attempts
    if (!details.authorized) {
      this.logSuspiciousActivity({
        type: 'unauthorized_access',
        userId: details.userId,
        action: details.action,
        resource: details.resource,
        details: `Unauthorized ${details.method} attempt`,
        severity: 'high'
      });
    }
  }

  /**
   * Log data access events
   */
  logDataAccess(event, details) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      type: 'data_access',
      details: {
        userId: details.userId,
        username: details.username,
        resource: details.resource,
        action: details.action,
        dataType: details.dataType,
        recordCount: details.recordCount,
        ip: details.ip,
        query: details.query // Only for audit purposes, not actual queries
      },
      severity: 'info'
    };

    this.writeLog('data_access', logEntry);

    // Monitor for bulk data access
    if (details.recordCount > 1000) {
      this.logComplianceEvent({
        type: 'bulk_data_access',
        userId: details.userId,
        resource: details.resource,
        recordCount: details.recordCount,
        details: `Large data access: ${details.recordCount} records`,
        severity: 'medium'
      });
    }
  }

  /**
   * Log suspicious activity
   */
  logSuspiciousActivity(activity) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'suspicious_activity',
      details: {
        activityType: activity.type,
        ip: activity.ip,
        userId: activity.userId,
        username: activity.username,
        details: activity.details,
        severity: activity.severity || 'medium',
        riskScore: this.calculateRiskScore(activity)
      },
      severity: activity.severity || 'warning'
    };

    this.writeLog('suspicious_activity', logEntry);

    // Escalate high-risk activities
    if (logEntry.details.riskScore >= 70) {
      this.createIncident({
        type: 'suspicious_activity_escalated',
        severity: 'high',
        description: `High-risk suspicious activity detected: ${activity.details}`,
        evidence: logEntry,
        requires_immediate_attention: true
      });
    }
  }

  /**
   * Log system security events
   */
  logSystemEvent(event, details) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      type: 'system_event',
      details: {
        component: details.component,
        action: details.action,
        status: details.status,
        message: details.message,
        error: details.error,
        metadata: details.metadata
      },
      severity: this.getSeverityFromStatus(details.status)
    };

    this.writeLog('system_events', logEntry);

    // Log system errors as incidents
    if (details.status === 'error' || details.status === 'critical') {
      this.createIncident({
        type: 'system_security_event',
        severity: details.status === 'critical' ? 'critical' : 'high',
        description: `System security event: ${details.message}`,
        evidence: logEntry,
        component: details.component
      });
    }
  }

  /**
   * Log compliance events
   */
  logComplianceEvent(event) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'compliance',
      details: {
        eventType: event.type,
        userId: event.userId,
        resource: event.resource,
        details: event.details,
        severity: event.severity || 'medium',
        complianceFramework: this.detectComplianceFramework(event)
      },
      severity: event.severity || 'info'
    };

    this.writeLog('compliance', logEntry);
  }

  /**
   * Create security incident
   */
  createIncident(incident) {
    const incidentLog = {
      incidentId: this.generateIncidentId(),
      timestamp: new Date().toISOString(),
      type: incident.type,
      severity: incident.severity,
      status: 'open',
      description: incident.description,
      evidence: incident.evidence,
      assignedTo: 'security_team',
      requires_immediate_attention: incident.requires_immediate_attention || false,
      metadata: {
        component: incident.component,
        affected_systems: incident.affected_systems || ['HIJINETWORK'],
        potential_impact: incident.potential_impact || 'medium'
      }
    };

    this.writeLog('incidents', incidentLog);

    // Alert for critical incidents
    if (incident.severity === 'critical' || incident.requires_immediate_attention) {
      this.sendSecurityAlert(incidentLog);
    }

    return incidentLog.incidentId;
  }

  /**
   * Calculate risk score for suspicious activity
   */
  calculateRiskScore(activity) {
    let score = 0;

    // Base scores for different activity types
    const baseScores = {
      'failed_authentication': 20,
      'unauthorized_access': 40,
      'sql_injection_attempt': 80,
      'xss_attempt': 70,
      'directory_traversal': 75,
      'command_injection': 85,
      'brute_force': 60,
      'suspicious_user_agent': 15,
      'missing_security_headers': 10
    };

    score += baseScores[activity.type] || 10;

    // IP-based risk factors
    if (this.isKnownMaliciousIP(activity.ip)) {
      score += 30;
    }

    // Frequency-based risk
    if (this.isRepeatedActivity(activity.ip, activity.type)) {
      score += 25;
    }

    // Time-based risk (off-hours activities)
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
      score += 15;
    }

    return Math.min(score, 100);
  }

  /**
   * Helper methods
   */
  isKnownMaliciousIP(ip) {
    // Check against known malicious IP patterns
    // This would typically integrate with threat intelligence services
    return false;
  }

  isRepeatedActivity(ip, type, windowMinutes = 60) {
    // Check if similar activity occurred from same IP recently
    // Implementation would check recent logs
    return false;
  }

  getSeverityFromStatus(status) {
    const severityMap = {
      'info': 'info',
      'success': 'info',
      'warning': 'warning',
      'error': 'high',
      'critical': 'critical'
    };
    return severityMap[status] || 'info';
  }

  detectComplianceFramework(event) {
    // Detect relevant compliance frameworks based on event type
    const frameworks = [];

    if (event.type.includes('personal_data') || event.type.includes('customer_data')) {
      frameworks.push('GDPR', 'PDPL');
    }

    if (event.type.includes('payment') || event.type.includes('financial')) {
      frameworks.push('PCI_DSS');
    }

    return frameworks;
  }

  generateIncidentId() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, -3);
    const random = Math.random().toString(36).substr(2, 4);
    return `INC-${timestamp}-${random}`;
  }

  sendSecurityAlert(incident) {
    // Send security alert via configured channels
    // This would integrate with notification systems
    console.error('🚨 SECURITY ALERT:', {
      incident: incident.incidentId,
      severity: incident.severity,
      description: incident.description,
      timestamp: incident.timestamp
    });
  }

  /**
   * Write log to file
   */
  writeLog(logType, logEntry) {
    const logFile = this.logFiles[logType];
    if (!logFile) return;

    try {
      const logLine = JSON.stringify(logEntry) + '\n';
      fs.appendFileSync(logFile, logLine);

      // Rotate log files if they get too large
      this.rotateLogFileIfNeeded(logFile);
    } catch (error) {
      console.error('Failed to write security log:', error);
    }
  }

  rotateLogFileIfNeeded(logFile) {
    try {
      const stats = fs.statSync(logFile);
      const maxSize = 10 * 1024 * 1024; // 10MB

      if (stats.size > maxSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = `${logFile}.${timestamp}.backup`;
        fs.renameSync(logFile, backupFile);
      }
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }

  /**
   * Security reporting and analytics
   */
  generateSecurityReport(timeRange = '24h') {
    const report = {
      generatedAt: new Date().toISOString(),
      timeRange,
      summary: {
        totalEvents: 0,
        criticalIncidents: 0,
        highRiskActivities: 0,
        failedAuthentications: 0,
        unauthorizedAccess: 0
      },
      topIPs: {},
      topUsers: {},
      incidentTypes: {},
      recommendations: []
    };

    // Analyze logs to generate report
    this.analyzeLogsForReport(report);

    return report;
  }

  analyzeLogsForReport(report) {
    // This would analyze the actual log files
    // For now, we'll return a basic structure
    report.recommendations = [
      'Enable 2FA for all admin accounts',
      'Review and update firewall rules',
      'Conduct regular security awareness training',
      'Implement automated backup verification',
      'Schedule regular security audits'
    ];
  }

  /**
   * Cleanup old log files
   */
  cleanup(retentionDays = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    Object.values(this.logFiles).forEach(logFile => {
      try {
        if (fs.existsSync(logFile)) {
          const stats = fs.statSync(logFile);
          if (stats.mtime < cutoffDate) {
            fs.unlinkSync(logFile);
          }
        }
      } catch (error) {
        console.error('Failed to cleanup log file:', error);
      }
    });
  }
}

// Export singleton instance
module.exports = SecurityLogger;