const { PaymentPlugin } = require('../../../lib/PaymentPlugin');
const crypto = require('crypto');

/**
 * DuitKu Payment Gateway Plugin
 *
 * Supports 80+ payment methods including:
 * - Virtual Accounts (BCA, BNI, BRI, Mandiri, dll)
 * - E-Wallets (GoPay, OVO, Dana, ShopeePay, dll)
 * - Over the Counter (Alfamart, Indomaret, dll)
 * - QRIS payments
 */
class DuitKuPlugin extends PaymentPlugin {
  constructor(config = {}) {
    super({
      name: 'DuitKu',
      version: '1.0.0',
      ...config
    });

    this.apiKey = config.api_key;
    this.merchantCode = config.merchant_code;
    this.environment = config.environment || 'sandbox';
    this.callbackUrl = config.callback_url;
    this.returnUrl = config.return_url;
    this.expiryMinutes = config.expiry_minutes || 60;

    // API endpoints
    this.baseUrl = this.environment === 'production'
      ? 'https://passport.duitku.com'
      : 'https://sandbox.duitku.com';

    this.paymentMethods = config.payment_methods || [];
  }

  async initialize() {
    try {
      // For default plugin, allow initialization without full config
      if (!this.apiKey || !this.merchantCode) {
        this.log('warn', 'DuitKu plugin initialized without API credentials. Please configure to use.', {
          environment: this.environment,
          hasApiKey: !!this.apiKey,
          hasMerchantCode: !!this.merchantCode
        });
      } else {
        // Test API connection only if credentials are provided
        await this.testConnection();
        this.log('info', 'DuitKu plugin initialized successfully', {
          environment: this.environment,
          merchant_code: this.merchantCode
        });
      }

      this.isInitialized = true;
      return true;
    } catch (error) {
      this.log('error', 'Failed to initialize DuitKu plugin', { error: error.message });
      throw this.handleError(error, 'initialize');
    }
  }

  /**
   * Test API connection by getting payment methods
   */
  async testConnection() {
    const datetime = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const signature = crypto.createHash('sha256').update(this.merchantCode + '10000' + datetime + this.apiKey).digest('hex');

    const payload = {
      merchantcode: this.merchantCode,
      amount: '10000',
      datetime: datetime,
      signature: signature
    };

    const response = await this.makeRequest('/webapi/api/merchant/paymentmethod/getpaymentmethod', {
      method: 'POST',
      body: payload
    });

    if (response.responseCode && response.responseCode !== '00') {
      throw new Error(`DuitKu API connection failed: ${response.responseMessage}`);
    }

    return true;
  }

  /**
   * Create payment transaction
   */
  async createPayment(paymentData) {
    try {
      if (!this.isInitialized) {
        throw new Error('Plugin not initialized');
      }

      // Validate payment data
      const validation = this.validatePaymentData(paymentData);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Generate unique order number
      const orderNumber = this.generateReference('DUITKU');

      // Calculate fee
      const feeCalculation = this.calculateFee(paymentData.amount);

      // Build payment payload
      const payload = {
        merchantCode: this.merchantCode,
        paymentAmount: this.formatAmount(paymentData.amount),
        merchantOrderId: orderNumber,
        productDetails: paymentData.description || 'Payment for Mikrotik Billing',
        email: paymentData.customer_email || 'customer@example.com',
        customerVaName: paymentData.customer_name || 'Customer',
        phoneNumber: paymentData.customer_phone || '',
        itemDetails: [
          {
            name: paymentData.description || 'Payment',
            price: this.formatAmount(paymentData.amount),
            quantity: 1
          }
        ],
        callbackUrl: this.callbackUrl || `${process.env.BASE_URL}/payments/duitku/callback`,
        returnUrl: this.returnUrl || `${process.env.BASE_URL}/payments/duitku/return`,
        expiryPeriod: this.expiryMinutes,
        signature: this.generateSignature(orderNumber, paymentData.amount)
      };

      // Add payment method if specified
      if (paymentData.payment_method) {
        payload.paymentMethod = paymentData.payment_method;
      }

      this.log('info', 'Creating DuitKu payment', {
        order_number: orderNumber,
        amount: paymentData.amount,
        payment_method: paymentData.payment_method
      });

      // Make API request
      const response = await this.makeRequest('/webapi/api/merchant/v2/inquiry', {
        method: 'POST',
        body: payload
      });

      if (response.statusCode !== '00') {
        throw new Error(`DuitKu payment creation failed: ${response.statusMessage}`);
      }

      const result = {
        success: true,
        reference: response.reference,
        order_number: orderNumber,
        redirect_url: response.paymentUrl,
        payment_url: response.paymentUrl,
        qr_code: response.qrCode || null,
        expires_at: this.calculateExpiryTime(),
        instructions: this.getPaymentInstructions(response),
        fee: feeCalculation.fee,
        total_amount: feeCalculation.total,
        metadata: {
          merchant_code: this.merchantCode,
          payment_method: response.paymentMethod,
          created_at: new Date().toISOString(),
          duitku_response: response
        }
      };

      this.log('info', 'DuitKu payment created successfully', {
        reference: result.reference,
        order_number: orderNumber
      });

      return result;

    } catch (error) {
      this.log('error', 'Failed to create DuitKu payment', {
        amount: paymentData.amount,
        error: error.message
      });
      throw this.handleError(error, 'createPayment');
    }
  }

  /**
   * Check payment status
   */
  async checkStatus(reference) {
    try {
      if (!this.isInitialized) {
        throw new Error('Plugin not initialized');
      }

      const payload = {
        merchantCode: this.merchantCode,
        merchantOrderId: reference,
        signature: this.generateSignature(reference, null) // Amount not needed for status check
      };

      this.log('info', 'Checking DuitKu payment status', { reference });

      const response = await this.makeRequest('/webapi/api/merchant/transactionStatus', {
        method: 'POST',
        body: payload
      });

      if (response.statusCode !== '00') {
        throw new Error(`DuitKu status check failed: ${response.statusMessage}`);
      }

      // Map DuitKu status to standard status
      // DuitKu statusCode: '00' = Success, '01' = Pending, '02' = Cancelled
      const statusMap = {
        '00': 'SUCCESS',
        '01': 'PENDING',
        '02': 'CANCELLED'
      };

      const result = {
        success: true,
        reference: reference,
        order_number: response.merchantOrderId,
        status: statusMap[response.statusCode] || 'PENDING',
        amount: parseInt(response.amount),
        currency: 'IDR',
        paid_amount: parseInt(response.amount) || 0,
        paid_at: response.paymentDate ? new Date(response.paymentDate).toISOString() : null,
        payment_method: response.paymentMethod || 'Unknown',
        va_number: response.vaNumber || null,
        biller_code: response.billerCode || null,
        biller_name: response.billerName || null,
        metadata: {
          duitku_response: response,
          checked_at: new Date().toISOString()
        }
      };

      this.log('info', 'DuitKu payment status checked', {
        reference,
        status: result.status,
        amount: result.amount
      });

      return result;

    } catch (error) {
      this.log('error', 'Failed to check DuitKu payment status', {
        reference,
        error: error.message
      });
      throw this.handleError(error, 'checkStatus');
    }
  }

  /**
   * Handle webhook callback
   */
  async handleCallback(callbackData) {
    try {
      this.log('info', 'Processing DuitKu callback', callbackData);

      // Verify callback signature
      const isSignatureValid = this.verifyCallbackSignature(callbackData);
      if (!isSignatureValid) {
        throw new Error('Invalid callback signature');
      }

      // Get payment status from DuitKu
      const statusResult = await this.checkStatus(callbackData.merchantOrderId);

      const result = {
        success: true,
        reference: callbackData.merchantOrderId,
        status: statusResult.status,
        amount: statusResult.amount,
        paid_amount: statusResult.paid_amount,
        paid_at: statusResult.paid_at,
        payment_method: statusResult.payment_method,
        metadata: {
          callback_data: callbackData,
          status_result: statusResult,
          processed_at: new Date().toISOString()
        }
      };

      this.log('info', 'DuitKu callback processed successfully', {
        reference: result.reference,
        status: result.status
      });

      return result;

    } catch (error) {
      this.log('error', 'Failed to process DuitKu callback', {
        callback_data: callbackData,
        error: error.message
      });
      throw this.handleError(error, 'handleCallback');
    }
  }

  /**
   * Get supported features
   */
  getFeatures() {
    return [
      'create_payment',
      'check_status',
      'callback_handler',
      'cancel_payment',
      'multiple_payment_methods',
      'auto_expiry',
      'status_notification'
    ];
  }

  /**
   * Get supported currencies
   */
  getSupportedCurrencies() {
    return ['IDR'];
  }

  /**
   * Get fee structure
   */
  getFeeStructure() {
    return {
      type: 'percentage',
      amount: 2.5, // 2.5% fee
      min_fee: 2500,
      max_fee: 15000
    };
  }

  /**
   * Generate signature for DuitKu API
   */
  generateSignature(orderNumber, amount) {
    // For Create Transaction and Check Status: MD5(merchantCode + merchantOrderId + amount + apiKey)
    const data = `${this.merchantCode}${orderNumber}${amount || ''}${this.apiKey}`;
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * Generate signature for Get Payment Method
   */
  generatePaymentMethodSignature(amount, datetime) {
    // For Get Payment Method: SHA256(merchantcode + amount + datetime + apiKey)
    const data = `${this.merchantCode}${amount}${datetime}${this.apiKey}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Verify callback signature
   */
  verifyCallbackSignature(callbackData) {
    if (!callbackData.signature) return false;

    // Callback signature: MD5(merchantCode + amount + merchantOrderId + apiKey)
    const expectedSignature = crypto.createHash('md5')
      .update(this.merchantCode + callbackData.amount + callbackData.merchantOrderId + this.apiKey)
      .digest('hex');

    return callbackData.signature === expectedSignature;
  }

  /**
   * Make HTTP request to DuitKu API
   */
  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers
    };

    const requestOptions = {
      method: options.method || 'GET',
      headers,
      body: JSON.stringify(options.body),
      timeout: 30000
    };

    // In real implementation, use axios or node-fetch
    // This is a placeholder for the actual HTTP request
    const mockResponse = {
      statusCode: '00',
      statusMessage: 'Success',
      reference: 'DUITKU' + Date.now(),
      paymentUrl: 'https://sandbox.duitku.com/payment/' + Date.now(),
      qrCode: null
    };

    return new Promise((resolve) => {
      setTimeout(() => resolve(mockResponse), 1000);
    });
  }

  /**
   * Calculate expiry time
   */
  calculateExpiryTime() {
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + this.expiryMinutes);
    return expiry.toISOString();
  }

  /**
   * Get payment instructions
   */
  getPaymentInstructions(response) {
    const instructions = {
      method: response.paymentMethod || 'Unknown',
      steps: []
    };

    if (response.vaNumber) {
      instructions.va_number = response.vaNumber;
      instructions.steps.push(
        '1. Open your banking app or ATM',
        '2. Select transfer to Virtual Account',
        `3. Enter VA number: ${response.vaNumber}`,
        '4. Enter the payment amount',
        '5. Confirm and complete payment'
      );
    }

    if (response.billerCode) {
      instructions.biller_code = response.billerCode;
      instructions.biller_name = response.billerName;
    }

    return instructions;
  }

  /**
   * Cancel payment transaction
   */
  async cancelPayment(reference) {
    try {
      // DuitKu doesn't have direct cancel API
      // Payment will expire automatically after expiry period
      this.log('info', 'DuitKu payment will be cancelled by expiry', { reference });

      return {
        success: true,
        reference,
        status: 'CANCELLED',
        message: 'Payment will be cancelled automatically after expiry period',
        metadata: {
          cancelled_at: new Date().toISOString(),
          note: 'DuitKu payments expire automatically'
        }
      };
    } catch (error) {
      throw this.handleError(error, 'cancelPayment');
    }
  }

  /**
   * Format amount for DuitKu (no decimal places)
   */
  formatAmount(amount, currency = 'IDR') {
    return Math.round(parseInt(amount));
  }
}

module.exports = DuitKuPlugin;