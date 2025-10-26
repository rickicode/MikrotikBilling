const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');

/**
 * Billing Domain Service
 * Handles all billing-related business logic including voucher activation,
 * subscription billing, payment processing, and revenue tracking
 */
class BillingService extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      taxRate: config.taxRate || 0.11,
      currency: config.currency || 'IDR',
      enableAutoBilling: config.enableAutoBilling !== false,
      billingRetryAttempts: config.billingRetryAttempts || 3,
      gracePeriodDays: config.gracePeriodDays || 3,
      ...config
    };

    this.isRunning = false;
    this.activeSubscriptions = new Map();
    this.billingQueue = [];
    this.processingInterval = null;
  }

  /**
   * Start the billing service
   */
  async start() {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log('🧾 Billing Service started');

    // Start billing processor
    this.startBillingProcessor();

    // Setup event listeners
    this.setupEventListeners();

    this.emit('started');
  }

  /**
   * Stop the billing service
   */
  async stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    console.log('🧾 Billing Service stopped');
    this.emit('stopped');
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    await this.stop();

    // Process remaining billing queue
    if (this.billingQueue.length > 0) {
      console.log(`Processing ${this.billingQueue.length} remaining billing items...`);
      await this.processBillingQueue();
    }
  }

  /**
   * Setup event listeners for cross-domain communication
   */
  setupEventListeners() {
    this.on('voucher-activated', this.handleVoucherActivation.bind(this));
    this.on('subscription-created', this.handleSubscriptionCreation.bind(this));
    this.on('payment-completed', this.handlePaymentCompletion.bind(this));
    this.on('payment-failed', this.handlePaymentFailure.bind(this));
  }

  /**
   * Record voucher activation for billing
   */
  async recordVoucherActivation(voucherData) {
    const billingRecord = {
      id: uuidv4(),
      type: 'voucher',
      voucherId: voucherData.id,
      customerId: voucherData.customerId,
      amount: voucherData.price,
      currency: this.config.currency,
      taxAmount: this.calculateTax(voucherData.price),
      totalAmount: this.calculateTotal(voucherData.price),
      activationTime: new Date().toISOString(),
      status: 'active',
      metadata: {
        profile: voucherData.profile,
        duration: voucherData.duration,
        mikrotikUser: voucherData.username
      }
    };

    // Store billing record
    await this.storeBillingRecord(billingRecord);

    // Emit event for notification service
    this.emit('billing-record-created', billingRecord);

    return billingRecord;
  }

  /**
   * Create subscription billing record
   */
  async createSubscriptionBilling(subscriptionData) {
    const billingRecord = {
      id: uuidv4(),
      type: 'subscription',
      subscriptionId: subscriptionData.id,
      customerId: subscriptionData.customerId,
      amount: subscriptionData.price,
      currency: this.config.currency,
      taxAmount: this.calculateTax(subscriptionData.price),
      totalAmount: this.calculateTotal(subscriptionData.price),
      billingCycle: subscriptionData.billingCycle,
      nextBillingDate: this.calculateNextBillingDate(subscriptionData.billingCycle),
      status: 'active',
      createdAt: new Date().toISOString(),
      metadata: {
        profile: subscriptionData.profile,
        serviceType: subscriptionData.serviceType,
        autoRenew: subscriptionData.autoRenew
      }
    };

    // Store billing record
    await this.storeBillingRecord(billingRecord);

    // Add to active subscriptions
    this.activeSubscriptions.set(subscriptionData.id, billingRecord);

    // Emit event
    this.emit('subscription-billing-created', billingRecord);

    return billingRecord;
  }

  /**
   * Process payment completion
   */
  async processPaymentCompletion(paymentData) {
    const billingRecord = await this.findBillingRecord(paymentData.billingRecordId);

    if (!billingRecord) {
      throw new Error(`Billing record not found: ${paymentData.billingRecordId}`);
    }

    // Update billing record
    billingRecord.status = 'paid';
    billingRecord.paidAt = new Date().toISOString();
    billingRecord.paymentId = paymentData.id;
    billingRecord.paymentMethod = paymentData.method;
    billingRecord.paymentAmount = paymentData.amount;

    // Store updated record
    await this.updateBillingRecord(billingRecord);

    // Emit event for other services
    this.emit('billing-payment-completed', billingRecord);

    return billingRecord;
  }

  /**
   * Process payment failure
   */
  async processPaymentFailure(paymentData) {
    const billingRecord = await this.findBillingRecord(paymentData.billingRecordId);

    if (!billingRecord) {
      throw new Error(`Billing record not found: ${paymentData.billingRecordId}`);
    }

    // Update billing record
    billingRecord.status = 'payment_failed';
    billingRecord.lastPaymentAttempt = new Date().toISOString();
    billingRecord.paymentAttempts = (billingRecord.paymentAttempts || 0) + 1;

    // Check if max attempts reached
    if (billingRecord.paymentAttempts >= this.config.billingRetryAttempts) {
      billingRecord.status = 'payment_overdue';

      // Emit overdue event
      this.emit('billing-payment-overdue', billingRecord);
    }

    // Store updated record
    await this.updateBillingRecord(billingRecord);

    // Emit event
    this.emit('billing-payment-failed', billingRecord);

    return billingRecord;
  }

  /**
   * Calculate tax amount
   */
  calculateTax(amount) {
    return Math.round(amount * this.config.taxRate);
  }

  /**
   * Calculate total amount including tax
   */
  calculateTotal(amount) {
    return amount + this.calculateTax(amount);
  }

  /**
   * Calculate next billing date
   */
  calculateNextBillingDate(billingCycle) {
    const now = new Date();

    switch (billingCycle) {
      case 'daily':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      case 'weekly':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      case 'monthly':
        const nextMonth = new Date(now);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        return nextMonth.toISOString();
      case 'yearly':
        const nextYear = new Date(now);
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        return nextYear.toISOString();
      default:
        throw new Error(`Unknown billing cycle: ${billingCycle}`);
    }
  }

  /**
   * Start automatic billing processor
   */
  startBillingProcessor() {
    if (!this.config.enableAutoBilling) return;

    // Process billing every hour
    this.processingInterval = setInterval(async () => {
      await this.processAutomaticBilling();
    }, 60 * 60 * 1000); // 1 hour

    console.log('🔄 Automatic billing processor started');
  }

  /**
   * Process automatic billing for due subscriptions
   */
  async processAutomaticBilling() {
    try {
      const dueSubscriptions = await this.findDueSubscriptions();

      for (const subscription of dueSubscriptions) {
        // Add to billing queue
        this.billingQueue.push({
          type: 'subscription_billing',
          subscription,
          timestamp: new Date().toISOString()
        });
      }

      // Process billing queue
      await this.processBillingQueue();

    } catch (error) {
      console.error('Automatic billing failed:', error);
      this.emit('billing-error', error);
    }
  }

  /**
   * Process billing queue
   */
  async processBillingQueue() {
    while (this.billingQueue.length > 0) {
      const item = this.billingQueue.shift();

      try {
        await this.processBillingItem(item);
      } catch (error) {
        console.error('Failed to process billing item:', error);

        // Re-queue for retry
        if (item.retries < this.config.billingRetryAttempts) {
          item.retries = (item.retries || 0) + 1;
          this.billingQueue.push(item);
        } else {
          this.emit('billing-item-failed', item, error);
        }
      }
    }
  }

  /**
   * Process individual billing item
   */
  async processBillingItem(item) {
    switch (item.type) {
      case 'subscription_billing':
        await this.processSubscriptionBilling(item.subscription);
        break;
      case 'payment_retry':
        await this.processPaymentRetry(item.paymentData);
        break;
      default:
        throw new Error(`Unknown billing item type: ${item.type}`);
    }
  }

  /**
   * Process subscription billing
   */
  async processSubscriptionBilling(subscription) {
    // Create new billing record for next cycle
    const newBillingRecord = {
      id: uuidv4(),
      type: 'subscription',
      subscriptionId: subscription.id,
      customerId: subscription.customerId,
      amount: subscription.price,
      currency: this.config.currency,
      taxAmount: this.calculateTax(subscription.price),
      totalAmount: this.calculateTotal(subscription.price),
      billingCycle: subscription.billingCycle,
      nextBillingDate: this.calculateNextBillingDate(subscription.billingCycle),
      status: 'pending',
      createdAt: new Date().toISOString(),
      metadata: {
        profile: subscription.profile,
        serviceType: subscription.serviceType,
        autoRenew: subscription.autoRenew
      }
    };

    // Store billing record
    await this.storeBillingRecord(newBillingRecord);

    // Emit event for payment service
    this.emit('billing-payment-required', newBillingRecord);

    return newBillingRecord;
  }

  /**
   * Get billing statistics
   */
  async getBillingStatistics(dateRange = {}) {
    const stats = {
      totalRevenue: 0,
      voucherRevenue: 0,
      subscriptionRevenue: 0,
      totalTransactions: 0,
      paidTransactions: 0,
      pendingTransactions: 0,
      failedTransactions: 0,
      taxCollected: 0,
      averageTransactionValue: 0,
      currency: this.config.currency
    };

    // This would typically query the database
    // For now, return mock data
    return stats;
  }

  /**
   * Generate billing report
   */
  async generateBillingReport(options = {}) {
    const {
      dateRange = {},
      customerId = null,
      status = null,
      type = null,
      format = 'json'
    } = options;

    const report = {
      id: uuidv4(),
      type: 'billing_report',
      generatedAt: new Date().toISOString(),
      dateRange,
      filters: { customerId, status, type },
      data: await this.getBillingData({ dateRange, customerId, status, type }),
      summary: await this.getBillingStatistics(dateRange)
    };

    return report;
  }

  // Event handlers
  async handleVoucherActivation(voucherData) {
    await this.recordVoucherActivation(voucherData);
  }

  async handleSubscriptionCreation(subscriptionData) {
    await this.createSubscriptionBilling(subscriptionData);
  }

  async handlePaymentCompletion(paymentData) {
    await this.processPaymentCompletion(paymentData);
  }

  async handlePaymentFailure(paymentData) {
    await this.processPaymentFailure(paymentData);
  }

  // Database operations (to be implemented with actual database)
  async storeBillingRecord(record) {
    // TODO: Implement database storage
    console.log('Storing billing record:', record.id);
  }

  async updateBillingRecord(record) {
    // TODO: Implement database update
    console.log('Updating billing record:', record.id);
  }

  async findBillingRecord(id) {
    // TODO: Implement database lookup
    return null;
  }

  async findDueSubscriptions() {
    // TODO: Implement database query
    return [];
  }

  async getBillingData(filters) {
    // TODO: Implement database query
    return [];
  }
}

module.exports = BillingService;