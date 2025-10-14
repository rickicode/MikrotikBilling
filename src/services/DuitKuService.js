const crypto = require('crypto');
const axios = require('axios');
const moment = require('moment');

class DuitKuService {
  constructor(db) {
    this.db = db;
    this.config = null;
    this.configLoadedAt = null;
    this.configCacheMinutes = 5; // Cache config for 5 minutes
  }

  /**
   * Load DuitKu configuration from database with caching
   */
  async loadConfiguration() {
    const now = moment();

    // Return cached config if still valid
    if (this.config && this.configLoadedAt &&
        now.diff(this.configLoadedAt, 'minutes') < this.configCacheMinutes) {
      return this.config;
    }

    try {
      const DuitKuConfiguration = require('../models/DuitKuConfiguration');
      const configModel = new DuitKuConfiguration(this.db);
      this.config = await configModel.getActiveForApi();
      this.configLoadedAt = now;

      if (!this.config) {
        throw new Error('No active DuitKu configuration found. Please configure DuitKu settings.');
      }

      return this.config;
    } catch (error) {
      console.error('Failed to load DuitKu configuration:', error);
      throw error;
    }
  }

  /**
   * Get DuitKu API URL based on environment
   * @param {string} endpoint - API endpoint
   * @returns {string} Full API URL
   */
  getApiUrl(endpoint) {
    if (!this.config) {
      throw new Error('DuitKu configuration not loaded');
    }

    const baseUrl = this.config.environment === 'production'
      ? 'https://api.duitku.com/v2'
      : 'https://api-sandbox.duitku.com/v2';

    return baseUrl + endpoint;
  }

  /**
   * Generate SHA256 signature for DuitKu API
   * @param {Object} payload - Request payload
   * @returns {string} SHA256 signature
   */
  generateSignature(payload) {
    if (!this.config) {
      throw new Error('DuitKu configuration not loaded');
    }

    // Create signature string: merchantCode + invoiceNumber + amount + apiKey
    const signatureString = [
      this.config.merchant_code,
      payload.invoiceNumber,
      payload.amount.toString(),
      this.config.api_key
    ].join('');

    return crypto
      .createHash('sha256')
      .update(signatureString)
      .digest('hex');
  }

  /**
   * Generate payment URL through DuitKu API
   * @param {Object} paymentData - Payment data
   * @param {number} paymentData.customerId - Customer ID
   * @param {number} paymentData.amount - Payment amount
   * @param {string} paymentData.invoiceNumber - Invoice number
   * @param {string} [paymentData.description] - Payment description
   * @param {number} [paymentData.expiryHours] - Custom expiry hours
   * @param {Object} paymentData.customerInfo - Customer information
   * @param {string} [paymentData.paymentMethod] - Specific payment method
   * @returns {Object} Payment link data
   */
  async generatePaymentUrl(paymentData) {
    await this.loadConfiguration();

    const {
      customerId,
      amount,
      invoiceNumber,
      description = 'Payment for services',
      expiryHours,
      customerInfo,
      paymentMethod = ''
    } = paymentData;

    // Validate required fields
    if (!customerId || !amount || !invoiceNumber || !customerInfo) {
      throw new Error('Missing required payment data: customerId, amount, invoiceNumber, customerInfo');
    }

    // Validate amount
    if (amount <= 0) {
      throw new Error('Payment amount must be greater than 0');
    }

    // Generate DuitKu request payload
    const payload = {
      merchantCode: this.config.merchant_code,
      invoiceNumber: invoiceNumber,
      amount: Math.round(amount), // DuitKu requires integer amount
      paymentMethod: paymentMethod,
      productDetails: description,
      customer: {
        name: customerInfo.name,
        email: customerInfo.email || '',
        phoneNumber: customerInfo.phone || ''
      },
      expiryPeriod: expiryHours || this.config.expiry_hours
    };

    // Add callback URL if configured
    if (this.config.callback_url) {
      payload.callbackUrl = `${process.env.BASE_URL || 'http://localhost:3000'}${this.config.callback_url}`;
    }

    // Generate signature
    payload.signature = this.generateSignature(payload);

    // Log transaction attempt
    const PaymentTransaction = require('../models/PaymentTransaction');
    const transactionModel = new PaymentTransaction(this.db);

    const transaction = await transactionModel.logUrlGeneration(null, {
      payload: { ...payload, signature: '***MASKED***' },
      timestamp: new Date().toISOString()
    });

    try {
      // Make API request to DuitKu
      const response = await axios.post(
        this.getApiUrl('/webapi/api/merchant/v2/inquiry'),
        payload,
        {
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'HIJINETWORK-Billing/1.0'
          }
        }
      );

      // Update transaction with API response
      await transactionModel.updateStatus(transaction.id, 'success');
      await transactionModel.updateStatus(transaction.id, 'success');

      if (response.data.statusCode === '00') {
        // Success - return payment link data
        return {
          success: true,
          reference: response.data.reference,
          paymentUrl: response.data.paymentUrl,
          paymentMethod: response.data.paymentMethod,
          vaNumber: response.data.vaNumber,
          expiryDate: moment().add(expiryHours || this.config.expiry_hours, 'hours').toDate()
        };
      } else {
        // API returned error
        const errorMessage = `DuitKu API error: ${response.data.statusMessage}`;
        await transactionModel.markFailed(transaction.id, errorMessage);
        throw new Error(errorMessage);
      }

    } catch (error) {
      // Log API failure
      const errorMessage = `DuitKu API request failed: ${error.message}`;
      await transactionModel.markFailed(transaction.id, errorMessage);

      console.error('DuitKu payment URL generation failed:', error);
      throw error;
    }
  }

  /**
   * Validate DuitKu webhook callback
   * @param {Object} callbackData - Callback data from DuitKu
   * @returns {Object} Validation result
   */
  async validatePaymentCallback(callbackData) {
    await this.loadConfiguration();

    const {
      merchantCode,
      invoiceNumber,
      amount,
      signature,
      paymentStatus,
      paymentMethod
    } = callbackData;

    // Verify merchant code
    if (merchantCode !== this.config.merchant_code) {
      throw new Error('Invalid merchant code in callback');
    }

    // Generate expected signature
    const expectedSignature = crypto
      .createHash('sha256')
      .update([
        this.config.merchant_code,
        invoiceNumber,
        amount.toString(),
        this.config.api_key
      ].join(''))
      .digest('hex');

    // Verify signature
    if (signature !== expectedSignature) {
      throw new Error('Invalid signature in callback');
    }

    return {
      isValid: true,
      invoiceNumber,
      amount: parseFloat(amount),
      paymentStatus,
      paymentMethod
    };
  }

  /**
   * Check payment status for an invoice
   * @param {string} invoiceNumber - Invoice number
   * @returns {Object} Payment status
   */
  async checkPaymentStatus(invoiceNumber) {
    await this.loadConfiguration();

    const payload = {
      merchantCode: this.config.merchant_code,
      invoiceNumber: invoiceNumber
    };

    // Generate signature for status check
    payload.signature = crypto
      .createHash('sha256')
      .update([
        this.config.merchant_code,
        invoiceNumber,
        this.config.api_key
      ].join(''))
      .digest('hex');

    try {
      const response = await axios.post(
        this.getApiUrl('/webapi/api/merchant/v2/inquiry'),
        payload,
        {
          timeout: 15000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.statusCode === '00') {
        return {
          success: true,
          status: response.data.paymentStatus,
          amount: response.data.amount,
          paymentMethod: response.data.paymentMethod,
          reference: response.data.reference
        };
      } else {
        return {
          success: false,
          error: response.data.statusMessage
        };
      }

    } catch (error) {
      console.error('Failed to check payment status:', error);
      throw error;
    }
  }

  /**
   * Check if a date is expired
   * @param {Date|string} expiryDate - Expiry date
   * @returns {boolean} True if expired
   */
  isExpired(expiryDate) {
    const now = moment();
    const expiry = moment(expiryDate);
    return expiry.isBefore(now);
  }

  /**
   * Calculate expiry date from hours
   * @param {number} hours - Hours from now
   * @returns {Date} Expiry date
   */
  calculateExpiryDate(hours) {
    return moment().add(hours, 'hours').toDate();
  }

  /**
   * Get available payment methods from DuitKu
   * @returns {Array} Available payment methods
   */
  async getAvailablePaymentMethods() {
    await this.loadConfiguration();

    try {
      const response = await axios.get(
        this.getApiUrl('/webapi/api/merchant/paymentmethod'),
        {
          timeout: 15000,
          params: {
            merchantCode: this.config.merchant_code,
            amount: 10000 // Sample amount to get payment methods
          }
        }
      );

      if (response.data.statusCode === '00') {
        return response.data.paymentMethod || [];
      } else {
        console.warn('Failed to get payment methods:', response.data.statusMessage);
        return [];
      }

    } catch (error) {
      console.error('Failed to fetch payment methods:', error);
      return [];
    }
  }

  /**
   * Generate unique invoice number
   * @param {number} customerId - Customer ID
   * @param {string} prefix - Invoice prefix
   * @returns {string} Unique invoice number
   */
  generateInvoiceNumber(customerId, prefix = 'INV') {
    const timestamp = moment().format('YYYYMMDDHHmmss');
    const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}-${customerId}-${timestamp}-${randomSuffix}`;
  }

  /**
   * Test DuitKu API connectivity
   * @returns {Object} Test result
   */
  async testConnectivity() {
    try {
      await this.loadConfiguration();

      // Test by fetching payment methods
      const methods = await this.getAvailablePaymentMethods();

      return {
        success: true,
        environment: this.config.environment,
        merchantCode: this.config.merchant_code,
        availableMethods: methods.length,
        message: `Successfully connected to DuitKu ${this.config.environment} API`
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to connect to DuitKu API'
      };
    }
  }

  /**
   * Clear configuration cache (useful after config updates)
   */
  clearConfigurationCache() {
    this.config = null;
    this.configLoadedAt = null;
  }

  /**
   * Get configuration status
   * @returns {Object} Configuration status
   */
  async getConfigurationStatus() {
    try {
      await this.loadConfiguration();

      return {
        configured: true,
        environment: this.config.environment,
        merchantCode: this.config.merchant_code,
        callbackUrl: this.config.callback_url,
        expiryHours: this.config.expiry_hours,
        maxRegenerations: this.config.max_regenerations,
        lastLoaded: this.configLoadedAt
      };

    } catch (error) {
      return {
        configured: false,
        error: error.message
      };
    }
  }

  /**
   * Validate payment amount (DuitKu has minimum/maximum limits)
   * @param {number} amount - Payment amount
   * @returns {Object} Validation result
   */
  validateAmount(amount) {
    // DuitKu typical limits (these may vary by agreement)
    const MIN_AMOUNT = 1000; // Minimum 1000 IDR
    const MAX_AMOUNT = 100000000; // Maximum 100 million IDR

    if (typeof amount !== 'number' || isNaN(amount)) {
      return {
        valid: false,
        error: 'Amount must be a valid number'
      };
    }

    if (amount < MIN_AMOUNT) {
      return {
        valid: false,
        error: `Minimum amount is ${MIN_AMOUNT.toLocaleString('id-ID')}`
      };
    }

    if (amount > MAX_AMOUNT) {
      return {
        valid: false,
        error: `Maximum amount is ${MAX_AMOUNT.toLocaleString('id-ID')}`
      };
    }

    return {
      valid: true
    };
  }
}

module.exports = DuitKuService;