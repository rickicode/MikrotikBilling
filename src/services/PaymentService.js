const moment = require('moment');
const Query = require('../lib/query');
const DuitKuService = require('./DuitKuService');
const PaymentLink = require('../models/PaymentLink');
const PaymentTransaction = require('../models/PaymentTransaction');
const DuitKuConfiguration = require('../models/DuitKuConfiguration');

class PaymentService {
  constructor(db) {
    // PostgreSQL pool
    this.query = new Query(db);
    this.duitkuService = new DuitKuService(db);
    this.paymentLinkModel = new PaymentLink(db);
    this.transactionModel = new PaymentTransaction(db);
    this.configModel = new DuitKuConfiguration(db);
  }

  /**
   * Create payment link for customer
   * @param {Object} paymentData - Payment data
   * @param {number} paymentData.customerId - Customer ID
   * @param {number} paymentData.amount - Payment amount
   * @param {string} [paymentData.description] - Payment description
   * @param {number} [paymentData.expiryHours] - Custom expiry hours
   * @param {string} [paymentData.paymentMethod] - Specific payment method
   * @param {Object} [paymentData.metadata] - Additional metadata
   * @returns {Object} Created payment link
   */
  async createPaymentLink(paymentData) {
    const {
      customerId,
      amount,
      description,
      expiryHours,
      paymentMethod,
      metadata = {}
    } = paymentData;

    // Validate input
    if (!customerId || !amount) {
      throw new Error('Customer ID and amount are required');
    }

    // Validate amount
    const amountValidation = this.duitkuService.validateAmount(amount);
    if (!amountValidation.valid) {
      throw new Error(amountValidation.error);
    }

    // Get customer information
    const customer = await this.query.getOne('SELECT * FROM customers WHERE id = $1', [customerId]);
    if (!customer) {
      throw new Error('Customer not found');
    }

    // Generate invoice number
    const invoiceNumber = this.duitkuService.generateInvoiceNumber(customerId);

    // Prepare customer info for DuitKu
    const customerInfo = {
      name: customer.name,
      email: customer.email || '',
      phone: customer.phone || ''
    };

    try {
      // Create transaction record
      const transaction = await this.transactionModel.logUrlGeneration(null, {
        customerId,
        amount,
        invoiceNumber,
        description,
        customerInfo,
        metadata
      });

      // Generate payment URL via DuitKu
      const duitkuResult = await this.duitkuService.generatePaymentUrl({
        customerId,
        amount,
        invoiceNumber,
        description,
        expiryHours,
        customerInfo,
        paymentMethod
      });

      if (duitkuResult.success) {
        // Create payment link record
        const paymentLink = await this.paymentLinkModel.create({
          customerId,
          invoiceNumber,
          amount,
          expiryDate: duitkuResult.expiryDate,
          duitkuReference: duitkuResult.reference,
          paymentUrl: duitkuResult.paymentUrl
        });

        // Update transaction with payment link ID
        await this.transactionModel.updateStatus(transaction.id, 'success');

        // Send notification if enabled
        await this.sendPaymentLinkNotification(customer, paymentLink);

        return {
          success: true,
          paymentLink: {
            ...paymentLink,
            customerName: customer.name,
            customerPhone: customer.phone
          },
          duitkuReference: duitkuResult.reference,
          paymentUrl: duitkuResult.paymentUrl,
          expiryDate: duitkuResult.expiryDate
        };
      } else {
        throw new Error(duitkuResult.error || 'Failed to generate payment URL');
      }

    } catch (error) {
      // Log error and re-throw
      console.error('Failed to create payment link:', error);
      throw error;
    }
  }

  /**
   * Regenerate expired payment URL
   * @param {number} paymentLinkId - Payment link ID
   * @returns {Object} New payment link data
   */
  async regeneratePaymentLink(paymentLinkId) {
    // Get existing payment link
    const paymentLink = await this.paymentLinkModel.findById(paymentLinkId);
    if (!paymentLink) {
      throw new Error('Payment link not found');
    }

    // Check if expired
    if (!this.duitkuService.isExpired(paymentLink.expiry_date)) {
      throw new Error('Payment link is not expired yet');
    }

    // Check regeneration limit
    const config = await this.configModel.getCurrent();
    if (paymentLink.regenerated_count >= (config?.max_regenerations || 3)) {
      throw new Error('Maximum regeneration attempts reached');
    }

    try {
      // Get customer info
      const customer = await this.query.getOne('SELECT * FROM customers WHERE id = $1', [paymentLink.customer_id]);
      if (!customer) {
        throw new Error('Customer not found');
      }

      // Log regeneration attempt
      const transaction = await this.transactionModel.logUrlRegeneration(paymentLinkId, {
        originalInvoiceNumber: paymentLink.invoice_number,
        regeneratedCount: paymentLink.regenerated_count + 1,
        reason: 'expired'
      });

      // Generate new invoice number for regeneration
      const newInvoiceNumber = `${paymentLink.invoice_number}-RENEW-${paymentLink.regenerated_count + 1}`;

      // Generate new payment URL
      const duitkuResult = await this.duitkuService.generatePaymentUrl({
        customerId: paymentLink.customer_id,
        amount: paymentLink.amount,
        invoiceNumber: newInvoiceNumber,
        description: `Regenerated payment for ${paymentLink.invoice_number}`,
        customerInfo: {
          name: customer.name,
          email: customer.email || '',
          phone: customer.phone || ''
        }
      });

      if (duitkuResult.success) {
        // Update original payment link as expired
        await this.paymentLinkModel.updateStatus(paymentLinkId, 'expired');

        // Create new payment link
        const newPaymentLink = await this.paymentLinkModel.create({
          customerId: paymentLink.customer_id,
          invoiceNumber: newInvoiceNumber,
          amount: paymentLink.amount,
          expiryDate: duitkuResult.expiryDate,
          duitkuReference: duitkuResult.reference,
          paymentUrl: duitkuResult.paymentUrl
        });

        // Update transaction status
        await this.transactionModel.updateStatus(transaction.id, 'success');

        return {
          success: true,
          paymentLink: {
            ...newPaymentLink,
            customerName: customer.name,
            customerPhone: customer.phone
          },
          originalLink: {
            id: paymentLink.id,
            invoiceNumber: paymentLink.invoice_number,
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
      console.error('Failed to regenerate payment link:', error);
      throw error;
    }
  }

  /**
   * Process DuitKu webhook callback
   * @param {Object} callbackData - Callback data from DuitKu
   * @returns {Object} Processing result
   */
  async processCallback(callbackData) {
    try {
      // Validate callback
      const validation = await this.duitkuService.validatePaymentCallback(callbackData);
      if (!validation.isValid) {
        throw new Error('Invalid callback signature');
      }

      // Find payment link by invoice number
      const paymentLink = await this.paymentLinkModel.findByInvoiceNumber(validation.invoiceNumber);
      if (!paymentLink) {
        throw new Error(`Payment link not found for invoice: ${validation.invoiceNumber}`);
      }

      // Log callback transaction
      const transaction = await this.transactionModel.logCallback(paymentLink.id, callbackData);

      // Update payment link based on payment status
      if (validation.paymentStatus === 'SUCCESS') {
        await this.paymentLinkModel.markCallbackReceived(
          paymentLink.id,
          callbackData,
          validation.paymentMethod
        );

        // Create payment record
        await this.createPaymentRecord(paymentLink, validation);

        // Update transaction
        await this.transactionModel.updateStatus(transaction.id, 'success');

        // Send payment confirmation notification
        await this.sendPaymentConfirmationNotification(paymentLink);

        return {
          success: true,
          status: 'paid',
          paymentLinkId: paymentLink.id,
          invoiceNumber: validation.invoiceNumber,
          amount: validation.amount
        };

      } else {
        // Payment failed or pending
        await this.transactionModel.updateStatus(transaction.id, 'failed', `Payment status: ${validation.paymentStatus}`);

        return {
          success: false,
          status: validation.paymentStatus.toLowerCase(),
          paymentLinkId: paymentLink.id,
          invoiceNumber: validation.invoiceNumber
        };
      }

    } catch (error) {
      console.error('Failed to process DuitKu callback:', error);
      throw error;
    }
  }

  /**
   * Get payment link details
   * @param {number} paymentLinkId - Payment link ID
   * @returns {Object|null} Payment link details
   */
  async getPaymentLink(paymentLinkId) {
    return await this.paymentLinkModel.findWithCustomer(paymentLinkId);
  }

  /**
   * Get customer payment links
   * @param {number} customerId - Customer ID
   * @param {Object} options - Query options
   * @returns {Array} Customer payment links
   */
  async getCustomerPaymentLinks(customerId, options = {}) {
    return await this.paymentLinkModel.findByCustomerId(customerId, options);
  }

  /**
   * Get payment links by status
   * @param {string} status - Payment link status
   * @param {Object} options - Query options
   * @returns {Array} Payment links
   */
  async getPaymentLinksByStatus(status, options = {}) {
    return await this.paymentLinkModel.findByStatus(status, options);
  }

  /**
   * Get payment links expiring soon
   * @param {number} hours - Hours from now
   * @returns {Array} Expiring payment links
   */
  async getExpiringPaymentLinks(hours = 24) {
    return await this.paymentLinkModel.findExpiringSoon(hours);
  }

  /**
   * Check and process expired payment links
   * @returns {number} Number of processed expired links
   */
  async processExpiredLinks() {
    const expiredLinks = await this.paymentLinkModel.findExpired();
    let processedCount = 0;

    for (const link of expiredLinks) {
      try {
        await this.paymentLinkModel.updateStatus(link.id, 'expired');
        processedCount++;

        // Send expiry notification if customer has it enabled
        await this.sendExpiryNotification(link);

      } catch (error) {
        console.error(`Failed to process expired link ${link.id}:`, error);
      }
    }

    return processedCount;
  }

  /**
   * Get payment statistics
   * @param {Object} filters - Date filters
   * @returns {Object} Payment statistics
   */
  async getStatistics(filters = {}) {
    return await this.paymentLinkModel.getStatistics(filters);
  }

  /**
   * Create payment record after successful callback
   * @param {Object} paymentLink - Payment link data
   * @param {Object} validation - Callback validation data
   */
  async createPaymentRecord(paymentLink, validation) {
    // PostgreSQL
    await this.query.query(`
        INSERT INTO payments (
          customer_id, amount, payment_method, payment_status,
          invoice_number, payment_link_id, duitku_invoice_number,
          duitku_payment_method, duitku_callback_data,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        paymentLink.customer_id,
        validation.amount,
        'online',
        'paid',
        validation.invoiceNumber,
        paymentLink.id,
        validation.invoiceNumber,
        validation.paymentMethod,
        JSON.stringify(validation)
      ]);
  }

  /**
   * Send payment link notification via WhatsApp
   * @param {Object} customer - Customer data
   * @param {Object} paymentLink - Payment link data
   */
  async sendPaymentLinkNotification(customer, paymentLink) {
    try {
      // WhatsApp notifications are handled by WhatsAppService
      // For now, just log it
      console.log(`Payment link notification sent to ${customer.name}: ${paymentLink.payment_url}`);
    } catch (error) {
      console.error('Failed to send payment link notification:', error);
    }
  }

  /**
   * Send payment confirmation notification
   * @param {Object} paymentLink - Payment link data
   */
  async sendPaymentConfirmationNotification(paymentLink) {
    try {
      console.log(`Payment confirmation sent for invoice: ${paymentLink.invoice_number}`);
    } catch (error) {
      console.error('Failed to send payment confirmation notification:', error);
    }
  }

  /**
   * Send expiry notification
   * @param {Object} paymentLink - Payment link data
   */
  async sendExpiryNotification(paymentLink) {
    try {
      console.log(`Expiry notification sent for invoice: ${paymentLink.invoice_number}`);
    } catch (error) {
      console.error('Failed to send expiry notification:', error);
    }
  }

  /**
   * Get DuitKu configuration status
   * @returns {Object} Configuration status
   */
  async getDuitKuStatus() {
    return await this.duitkuService.getConfigurationStatus();
  }

  /**
   * Test DuitKu connectivity
   * @returns {Object} Test result
   */
  async testDuitKuConnectivity() {
    return await this.duitkuService.testConnectivity();
  }
}

module.exports = PaymentService;