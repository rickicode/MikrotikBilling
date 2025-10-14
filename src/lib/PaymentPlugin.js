/**
 * Payment Gateway Plugin System for Mikrotik Billing
 *
 * Modular payment system with plugin architecture
 * Supports multiple payment methods through standardized interface
 */

class PaymentPlugin {
  constructor(config = {}) {
    this.name = config.name || 'GenericPaymentPlugin';
    this.version = config.version || '1.0.0';
    this.enabled = config.enabled !== false;
    this.config = config;
    this.isInitialized = false;
  }

  /**
   * Initialize the plugin with configuration
   * @returns {Promise<boolean>} True if initialization successful
   */
  async initialize() {
    // Override in subclasses
    throw new Error('initialize() method must be implemented by plugin');
  }

  /**
   * Get plugin information
   * @returns {Object} Plugin metadata
   */
  getInfo() {
    return {
      name: this.name,
      version: this.version,
      enabled: this.enabled,
      features: this.getFeatures(),
      currencies: this.getSupportedCurrencies(),
      fees: this.getFeeStructure()
    };
  }

  /**
   * Get supported features
   * @returns {Array<string>} Array of supported features
   */
  getFeatures() {
    return ['create_payment', 'check_status', 'callback_handler'];
  }

  /**
   * Get supported currencies
   * @returns {Array<string>} Array of currency codes
   */
  getSupportedCurrencies() {
    return ['IDR'];
  }

  /**
   * Get fee structure
   * @returns {Object} Fee configuration
   */
  getFeeStructure() {
    return {
      type: 'percentage', // 'percentage' or 'fixed'
      amount: 0,
      min_fee: 0,
      max_fee: 0
    };
  }

  /**
   * Create payment transaction
   * @param {Object} paymentData - Payment details
   * @returns {Promise<Object>} Payment response with redirect_url, reference, etc.
   */
  async createPayment(paymentData) {
    // Override in subclasses
    throw new Error('createPayment() method must be implemented by plugin');
  }

  /**
   * Check payment status
   * @param {string} reference - Payment reference/transaction ID
   * @returns {Promise<Object>} Payment status
   */
  async checkStatus(reference) {
    // Override in subclasses
    throw new Error('checkStatus() method must be implemented by plugin');
  }

  /**
   * Handle payment callback/webhook
   * @param {Object} callbackData - Callback data from payment gateway
   * @returns {Promise<Object>} Processed callback result
   */
  async handleCallback(callbackData) {
    // Override in subclasses
    throw new Error('handleCallback() method must be implemented by plugin');
  }

  /**
   * Cancel payment transaction
   * @param {string} reference - Payment reference
   * @returns {Promise<Object>} Cancellation result
   */
  async cancelPayment(reference) {
    // Override in subclasses if supported
    throw new Error('cancelPayment() not supported by this plugin');
  }

  /**
   * Refund payment transaction
   * @param {string} reference - Payment reference
   * @param {number} amount - Refund amount
   * @returns {Promise<Object>} Refund result
   */
  async refundPayment(reference, amount) {
    // Override in subclasses if supported
    throw new Error('refundPayment() not supported by this plugin');
  }

  /**
   * Validate payment data before processing
   * @param {Object} paymentData - Payment data to validate
   * @returns {Object} Validation result {valid: boolean, errors: []}
   */
  validatePaymentData(paymentData) {
    const errors = [];

    if (!paymentData.amount || paymentData.amount <= 0) {
      errors.push('Invalid amount');
    }

    if (!paymentData.customer_id) {
      errors.push('Customer ID is required');
    }

    if (!paymentData.description) {
      errors.push('Payment description is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Format currency amount according to plugin requirements
   * @param {number} amount - Amount to format
   * @param {string} currency - Currency code
   * @returns {string|number} Formatted amount
   */
  formatAmount(amount, currency = 'IDR') {
    // Default implementation - override in subclasses
    return Math.round(amount);
  }

  /**
   * Calculate transaction fee
   * @param {number} amount - Transaction amount
   * @returns {Object} Fee calculation {fee: number, total: number}
   */
  calculateFee(amount) {
    const feeStructure = this.getFeeStructure();
    let fee = 0;

    if (feeStructure.type === 'percentage') {
      fee = (amount * feeStructure.amount) / 100;
      if (feeStructure.min_fee && fee < feeStructure.min_fee) {
        fee = feeStructure.min_fee;
      }
      if (feeStructure.max_fee && fee > feeStructure.max_fee) {
        fee = feeStructure.max_fee;
      }
    } else {
      fee = feeStructure.amount;
    }

    return {
      fee,
      total: amount + fee
    };
  }

  /**
   * Generate unique reference number
   * @param {string} prefix - Reference prefix
   * @returns {string} Unique reference
   */
  generateReference(prefix = 'PAY') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 6);
    return `${prefix}${timestamp}${random}`.toUpperCase();
  }

  /**
   * Log payment activity
   * @param {string} level - Log level (info, warn, error)
   * @param {string} action - Action performed
   * @param {Object} data - Related data
   */
  log(level, action, data = {}) {
    console.log(`[${this.name}] ${level.toUpperCase()}: ${action}`, {
      plugin: this.name,
      timestamp: new Date().toISOString(),
      ...data
    });
  }

  /**
   * Handle plugin-specific errors
   * @param {Error} error - Error object
   * @param {string} context - Context where error occurred
   * @returns {Error} Standardized error
   */
  handleError(error, context) {
    this.log('error', `${context}: ${error.message}`, {
      stack: error.stack,
      context
    });

    // Return standardized error
    const pluginError = new Error(`[${this.name}] ${error.message}`);
    pluginError.code = error.code || 'PLUGIN_ERROR';
    pluginError.plugin = this.name;
    pluginError.context = context;

    return pluginError;
  }
}

/**
 * Payment Plugin Interface Validation
 * Ensures plugins implement required methods
 */
class PaymentPluginInterface {
  static validate(plugin) {
    const requiredMethods = [
      'initialize',
      'createPayment',
      'checkStatus',
      'handleCallback'
    ];

    const missingMethods = [];

    for (const method of requiredMethods) {
      if (typeof plugin[method] !== 'function') {
        missingMethods.push(method);
      }
    }

    if (missingMethods.length > 0) {
      throw new Error(`Plugin missing required methods: ${missingMethods.join(', ')}`);
    }

    return true;
  }

  static validateConfig(config) {
    const required = ['name', 'version'];
    const missing = [];

    for (const field of required) {
      if (!config[field]) {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Plugin config missing required fields: ${missing.join(', ')}`);
    }

    return true;
  }
}

module.exports = {
  PaymentPlugin,
  PaymentPluginInterface
};