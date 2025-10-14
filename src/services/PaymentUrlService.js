const moment = require('moment');
const PaymentLink = require('../models/PaymentLink');
const PaymentTransaction = require('../models/PaymentTransaction');
const DuitKuConfiguration = require('../models/DuitKuConfiguration');
const DuitKuService = require('./DuitKuService');

class PaymentUrlService {
  constructor(db) {
    this.db = db;
    this.paymentLinkModel = new PaymentLink(db);
    this.transactionModel = new PaymentTransaction(db);
    this.configModel = new DuitKuConfiguration(db);
    this.duitkuService = new DuitKuService(db);
    this.isRunning = false;
    this.checkInterval = null;
  }

  /**
   * Start background monitoring of payment URLs
   * @param {Object} options - Monitoring options
   * @param {number} [options.checkIntervalMinutes=30] - Check interval in minutes
   * @param {number} [options.expiryWarningHours=2] - Send warning X hours before expiry
   */
  async startMonitoring(options = {}) {
    const {
      checkIntervalMinutes = 30,
      expiryWarningHours = 2
    } = options;

    if (this.isRunning) {
      console.log('Payment URL monitoring is already running');
      return;
    }

    this.isRunning = true;
    console.log(`Starting payment URL monitoring (check every ${checkIntervalMinutes} minutes)`);

    // Initial check
    await this.performMonitoringCycle(expiryWarningHours);

    // Set up recurring checks
    this.checkInterval = setInterval(async () => {
      if (this.isRunning) {
        try {
          await this.performMonitoringCycle(expiryWarningHours);
        } catch (error) {
          console.error('Error in payment URL monitoring cycle:', error);
        }
      }
    }, checkIntervalMinutes * 60 * 1000);
  }

  /**
   * Stop background monitoring
   */
  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log('Payment URL monitoring stopped');
  }

  /**
   * Perform one monitoring cycle
   * @param {number} expiryWarningHours - Hours before expiry to send warning
   */
  async performMonitoringCycle(expiryWarningHours) {
    console.log('Payment URL monitoring cycle started');

    let processedCount = 0;
    let warningSentCount = 0;
    let regeneratedCount = 0;

    try {
      // 1. Process expired URLs
      const expiredLinks = await this.paymentLinkModel.findExpired();
      for (const link of expiredLinks) {
        try {
          await this.processExpiredLink(link);
          processedCount++;
        } catch (error) {
          console.error(`Failed to process expired link ${link.id}:`, error);
        }
      }

      // 2. Send expiry warnings
      const warningLinks = await this.paymentLinkModel.findExpiringSoon(expiryWarningHours);
      for (const link of warningLinks) {
        try {
          await this.sendExpiryWarning(link);
          warningSentCount++;
        } catch (error) {
          console.error(`Failed to send expiry warning for link ${link.id}:`, error);
        }
      }

      // 3. Auto-regenerate expired links if configured
      const config = await this.configModel.getCurrent();
      if (config && config.auto_regenerate) {
        regeneratedCount = await this.autoRegenerateExpiredLinks(expiredLinks);
      }

      console.log(`Payment URL monitoring cycle completed: ${processedCount} expired processed, ${warningSentCount} warnings sent, ${regeneratedCount} regenerated`);

    } catch (error) {
      console.error('Error in payment URL monitoring cycle:', error);
    }
  }

  /**
   * Process individual expired link
   * @param {Object} link - Payment link data
   */
  async processExpiredLink(link) {
    // Log transaction
    const transaction = await this.transactionModel.logUrlRegeneration(link.id, {
      reason: 'expired',
      originalExpiry: link.expiry_date,
      processedAt: new Date().toISOString()
    });

    try {
      // Update link status to expired
      await this.paymentLinkModel.updateStatus(link.id, 'expired');

      // Update transaction status
      await this.transactionModel.updateStatus(transaction.id, 'success');

      // Send expiry notification
      await this.sendExpiryNotification(link);

    } catch (error) {
      await this.transactionModel.markFailed(transaction.id, error.message);
      throw error;
    }
  }

  /**
   * Send expiry warning notification
   * @param {Object} link - Payment link data
   */
  async sendExpiryWarning(link) {
    // Only send if not already sent in the last hour
    const recentWarnings = await this.getRecentWarnings(link.id, 1); // 1 hour

    if (recentWarnings.length === 0) {
      // Log warning transaction
      const transaction = await this.transactionModel.logUrlRegeneration(link.id, {
        reason: 'expiry_warning',
        expiryDate: link.expiry_date,
        warningSentAt: new Date().toISOString()
      });

      // Send notification (implementation depends on notification system)
      await this.sendExpiryWarningNotification(link);

      await this.transactionModel.updateStatus(transaction.id, 'success');
    }
  }

  /**
   * Auto-regenerate expired links
   * @param {Array} expiredLinks - Array of expired links
   * @returns {number} Number of regenerated links
   */
  async autoRegenerateExpiredLinks(expiredLinks) {
    let regeneratedCount = 0;
    const config = await this.configModel.getCurrent();

    if (!config || !config.auto_regenerate) {
      return 0;
    }

    for (const link of expiredLinks) {
      try {
        // Check if we can still regenerate
        if (link.regenerated_count < config.max_regenerations) {
          await this.regeneratePaymentLink(link.id);
          regeneratedCount++;
        }
      } catch (error) {
        console.error(`Failed to auto-regenerate link ${link.id}:`, error);
      }
    }

    return regeneratedCount;
  }

  /**
   * Regenerate payment link (manual trigger)
   * @param {number} paymentLinkId - Payment link ID
   * @returns {Object} Regeneration result
   */
  async regeneratePaymentLink(paymentLinkId) {
    const link = await this.paymentLinkModel.findById(paymentLinkId);
    if (!link) {
      throw new Error('Payment link not found');
    }

    // Check if expired
    if (!this.duitkuService.isExpired(link.expiry_date)) {
      throw new Error('Payment link is not expired yet');
    }

    // Check regeneration limit
    const config = await this.configModel.getCurrent();
    if (link.regenerated_count >= (config?.max_regenerations || 3)) {
      throw new Error('Maximum regeneration attempts reached');
    }

    // Get customer info
    const customer = await db.getOne('SELECT * FROM customers WHERE id = $1', [link.customer_id]);
    if (!customer) {
      throw new Error('Customer not found');
    }

    // Log regeneration attempt
    const transaction = await this.transactionModel.logUrlRegeneration(paymentLinkId, {
      originalInvoiceNumber: link.invoice_number,
      regeneratedCount: link.regenerated_count + 1,
      reason: 'manual_regeneration',
      requestedAt: new Date().toISOString()
    });

    try {
      // Generate new invoice number
      const newInvoiceNumber = `${link.invoice_number}-RENEW-${link.regenerated_count + 1}`;

      // Generate new payment URL
      const duitkuResult = await this.duitkuService.generatePaymentUrl({
        customerId: link.customer_id,
        amount: link.amount,
        invoiceNumber: newInvoiceNumber,
        description: `Regenerated payment for ${link.invoice_number}`,
        customerInfo: {
          name: customer.name,
          email: customer.email || '',
          phone: customer.phone || ''
        }
      });

      if (duitkuResult.success) {
        // Update original link as expired
        await this.paymentLinkModel.updateStatus(paymentLinkId, 'expired');

        // Create new payment link
        const newPaymentLink = await this.paymentLinkModel.create({
          customerId: link.customer_id,
          invoiceNumber: newInvoiceNumber,
          amount: link.amount,
          expiryDate: duitkuResult.expiryDate,
          duitkuReference: duitkuResult.reference,
          paymentUrl: duitkuResult.paymentUrl
        });

        // Update transaction
        await this.transactionModel.updateStatus(transaction.id, 'success');

        // Send regeneration notification
        await this.sendRegenerationNotification(customer, newPaymentLink, link);

        return {
          success: true,
          newPaymentLink: {
            ...newPaymentLink,
            customerName: customer.name,
            customerPhone: customer.phone
          },
          originalLink: {
            id: link.id,
            invoiceNumber: link.invoice_number,
            status: 'expired'
          },
          duitkuReference: duitkuResult.reference,
          paymentUrl: duitkuResult.paymentUrl,
          expiryDate: duitkuResult.expiryDate
        };
      } else {
        await this.transactionModel.markFailed(transaction.id, duitkuResult.error);
        throw new Error(duitkuResult.error || 'Failed to regenerate payment URL');
      }

    } catch (error) {
      await this.transactionModel.markFailed(transaction.id, error.message);
      throw error;
    }
  }

  /**
   * Validate payment URL before presenting to user
   * @param {number} paymentLinkId - Payment link ID
   * @returns {Object} Validation result
   */
  async validatePaymentUrl(paymentLinkId) {
    const link = await this.paymentLinkModel.findById(paymentLinkId);
    if (!link) {
      return {
        valid: false,
        reason: 'Payment link not found'
      };
    }

    if (link.status !== 'active') {
      return {
        valid: false,
        reason: `Payment link is ${link.status}`,
        status: link.status
      };
    }

    if (this.duitkuService.isExpired(link.expiry_date)) {
      return {
        valid: false,
        reason: 'Payment link has expired',
        expired: true,
        expiryDate: link.expiry_date,
        canRegenerate: link.regenerated_count < 3
      };
    }

    // Check if payment URL is still valid with DuitKu
    try {
      const status = await this.duitkuService.checkPaymentStatus(link.invoice_number);
      if (status.status === 'SUCCESS') {
        // Mark as paid if DuitKu shows success
        await this.paymentLinkModel.updateStatus(paymentLinkId, 'paid');
        return {
          valid: false,
          reason: 'Payment has already been completed',
          status: 'paid'
        };
      }
    } catch (error) {
      console.error('Failed to validate with DuitKu:', error);
    }

    return {
      valid: true,
      paymentUrl: link.payment_url,
      expiryDate: link.expiry_date,
      amount: link.amount,
      invoiceNumber: link.invoice_number
    };
  }

  /**
   * Get payment URL health metrics
   * @returns {Object} Health metrics
   */
  async getHealthMetrics() {
    const stats = await this.paymentLinkModel.getStatistics();
    const expiringSoon = await this.paymentLinkModel.findExpiringSoon(24);
    const expired = await this.paymentLinkModel.findExpired();

    const config = await this.configModel.getCurrent();

    return {
      totalLinks: stats.byStatus.reduce((sum, item) => sum + item.count, 0),
      activeLinks: stats.byStatus.find(item => item.status === 'active')?.count || 0,
      expiredLinks: stats.byStatus.find(item => item.status === 'expired')?.count || 0,
      paidLinks: stats.byStatus.find(item => item.status === 'paid')?.count || 0,
      expiringSoonCount: expiringSoon.length,
      unprocessedExpiredCount: expired.length,
      monitoringActive: this.isRunning,
      autoRegenerationEnabled: config?.auto_regenerate || false,
      lastCheck: new Date().toISOString(),
      config: config ? {
        expiryHours: config.expiry_hours,
        maxRegenerations: config.max_regenerations,
        environment: config.environment
      } : null
    };
  }

  /**
   * Get recent warnings for a payment link
   * @param {number} paymentLinkId - Payment link ID
   * @param {number} hours - Hours back to check
   * @returns {Array} Recent warnings
   */
  async getRecentWarnings(paymentLinkId, hours) {
    const result = await db.query(`
      SELECT * FROM payment_transactions
      WHERE payment_link_id = $1
        AND transaction_type = 'regeneration'
        AND transaction_data LIKE '%expiry_warning%'
        AND created_date > NOW() - INTERVAL $2 hours
      ORDER BY created_date DESC
    `, [paymentLinkId, hours]);

    return result;
  }

  /**
   * Send expiry notification
   * @param {Object} link - Payment link data
   */
  async sendExpiryNotification(link) {
    try {
      console.log(`Expiry notification sent for invoice: ${link.invoice_number}`);
      // Implementation depends on notification system
    } catch (error) {
      console.error('Failed to send expiry notification:', error);
    }
  }

  /**
   * Send expiry warning notification
   * @param {Object} link - Payment link data
   */
  async sendExpiryWarningNotification(link) {
    try {
      console.log(`Expiry warning sent for invoice: ${link.invoice_number}`);
      // Implementation depends on notification system
    } catch (error) {
      console.error('Failed to send expiry warning notification:', error);
    }
  }

  /**
   * Send regeneration notification
   * @param {Object} customer - Customer data
   * @param {Object} newLink - New payment link data
   * @param {Object} oldLink - Old payment link data
   */
  async sendRegenerationNotification(customer, newLink, oldLink) {
    try {
      console.log(`Regeneration notification sent to ${customer.name}: ${newLink.payment_url}`);
      // Implementation depends on notification system
    } catch (error) {
      console.error('Failed to send regeneration notification:', error);
    }
  }

  /**
   * Cleanup old transaction logs
   * @param {number} daysOld - Delete transactions older than this
   * @returns {number} Number of deleted transactions
   */
  async cleanupOldTransactions(daysOld = 90) {
    return await this.transactionModel.cleanupOld(daysOld);
  }
}

module.exports = PaymentUrlService;