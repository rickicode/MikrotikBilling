const { PaymentPlugin } = require('../../../lib/PaymentPlugin');

/**
 * Manual/Cash Payment Gateway Plugin
 *
 * Handles manual payment processing including:
 * - Cash payments
 * - Credit/Debt recording
 * - Multiple payment splits
 * - Receipt generation
 */
class ManualPlugin extends PaymentPlugin {
  constructor(config = {}) {
    super({
      name: 'Manual',
      version: '1.0.0',
      ...config
    });

    this.allowCredit = config.allow_credit !== false;
    this.maxCreditAmount = config.max_credit_amount || 500000;
    this.creditTermsDays = config.credit_terms_days || 30;
    this.autoReceipt = config.auto_receipt !== false;
    this.requireApproval = config.require_approval || false;
    this.receiptTemplate = config.receipt_template || 'default';
  }

  async initialize() {
    try {
      // Validate configuration
      if (this.allowCredit && this.maxCreditAmount <= 0) {
        throw new Error('Max credit amount must be greater than 0 when credit is allowed');
      }

      this.isInitialized = true;
      this.log('info', 'Manual payment plugin initialized successfully', {
        allow_credit: this.allowCredit,
        max_credit_amount: this.maxCreditAmount,
        credit_terms_days: this.creditTermsDays
      });

      return true;
    } catch (error) {
      this.log('error', 'Failed to initialize Manual plugin', { error: error.message });
      throw this.handleError(error, 'initialize');
    }
  }

  /**
   * Create manual payment transaction
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

      // Generate unique transaction reference
      const reference = this.generateReference('MANUAL');

      // Determine payment type
      const paymentType = this.determinePaymentType(paymentData);

      // Calculate fee (manual payments usually have no fees)
      const feeCalculation = this.calculateFee(paymentData.amount);

      // Create payment record
      const paymentRecord = {
        reference,
        type: paymentType,
        amount: paymentData.amount,
        currency: paymentData.currency || 'IDR',
        customer_id: paymentData.customer_id,
        customer_name: paymentData.customer_name,
        description: paymentData.description,
        status: paymentType === 'cash' ? 'SUCCESS' : 'PENDING',
        paid_amount: paymentType === 'cash' ? paymentData.amount : 0,
        remaining_amount: paymentType === 'cash' ? 0 : paymentData.amount,
        created_at: new Date().toISOString(),
        due_date: paymentType === 'credit' ? this.calculateDueDate() : null,
        fee: feeCalculation.fee,
        total_amount: feeCalculation.total,
        payment_details: {
          method: paymentData.payment_method || 'cash',
          notes: paymentData.notes || '',
          split_payments: paymentData.split_payments || [],
          received_by: paymentData.received_by || 'System',
          approval_required: this.requireApproval && paymentType === 'credit'
        }
      };

      // Log payment creation
      this.log('info', 'Manual payment created', {
        reference,
        type: paymentType,
        amount: paymentData.amount,
        customer_id: paymentData.customer_id
      });

      // Generate receipt if auto-receipt is enabled
      let receipt = null;
      if (this.autoReceipt && paymentType === 'cash') {
        receipt = await this.generateReceipt(paymentRecord);
      }

      const result = {
        success: true,
        reference,
        payment_type: paymentType,
        status: paymentRecord.status,
        amount: paymentData.amount,
        currency: paymentRecord.currency,
        fee: feeCalculation.fee,
        total_amount: feeCalculation.total,
        receipt: receipt,
        payment_details: paymentRecord.payment_details,
        redirect_url: null, // Manual payments don't need redirect
        qr_code: null,
        expires_at: null,
        instructions: this.getPaymentInstructions(paymentType, paymentRecord),
        metadata: {
          plugin: 'Manual',
          created_at: paymentRecord.created_at,
          payment_record: paymentRecord
        }
      };

      this.log('info', 'Manual payment created successfully', {
        reference,
        payment_type: paymentType,
        status: result.status
      });

      return result;

    } catch (error) {
      this.log('error', 'Failed to create manual payment', {
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

      // In a real implementation, this would query the database
      // For now, return a mock response
      const mockPayment = {
        reference,
        status: 'SUCCESS', // SUCCESS, PENDING, FAILED
        amount: 50000,
        currency: 'IDR',
        paid_amount: 50000,
        remaining_amount: 0,
        payment_type: 'cash',
        paid_at: new Date().toISOString(),
        notes: 'Payment received in cash'
      };

      const result = {
        success: true,
        reference: mockPayment.reference,
        status: mockPayment.status,
        amount: mockPayment.amount,
        currency: mockPayment.currency,
        paid_amount: mockPayment.paid_amount,
        remaining_amount: mockPayment.remaining_amount,
        payment_type: mockPayment.payment_type,
        paid_at: mockPayment.paid_at,
        due_date: mockPayment.due_date || null,
        metadata: {
          plugin: 'Manual',
          checked_at: new Date().toISOString(),
          payment_details: mockPayment
        }
      };

      this.log('info', 'Manual payment status checked', {
        reference,
        status: result.status
      });

      return result;

    } catch (error) {
      this.log('error', 'Failed to check manual payment status', {
        reference,
        error: error.message
      });
      throw this.handleError(error, 'checkStatus');
    }
  }

  /**
   * Handle callback (not applicable for manual payments)
   */
  async handleCallback(callbackData) {
    // Manual payments don't have external callbacks
    return {
      success: false,
      message: 'Manual payments do not support external callbacks',
      metadata: {
        plugin: 'Manual',
        callback_data: callbackData
      }
    };
  }

  /**
   * Complete partial payment
   */
  async completePartialPayment(reference, paymentData) {
    try {
      // In real implementation, update database record
      this.log('info', 'Partial payment completed', {
        reference,
        amount: paymentData.amount
      });

      return {
        success: true,
        reference,
        paid_amount: paymentData.amount,
        remaining_amount: paymentData.remaining_amount || 0,
        status: paymentData.remaining_amount > 0 ? 'PENDING' : 'SUCCESS',
        metadata: {
          completed_at: new Date().toISOString()
        }
      };
    } catch (error) {
      throw this.handleError(error, 'completePartialPayment');
    }
  }

  /**
   * Get supported features
   */
  getFeatures() {
    return [
      'create_payment',
      'check_status',
      'partial_payments',
      'credit_payments',
      'receipt_generation',
      'payment_splits',
      'approval_workflow'
    ];
  }

  /**
   * Get supported currencies
   */
  getSupportedCurrencies() {
    return ['IDR', 'USD', 'EUR'];
  }

  /**
   * Get fee structure (manual payments usually no fees)
   */
  getFeeStructure() {
    return {
      type: 'fixed',
      amount: 0
    };
  }

  /**
   * Determine payment type based on data
   */
  determinePaymentType(paymentData) {
    const method = paymentData.payment_method || 'cash';

    switch (method.toLowerCase()) {
      case 'cash':
        return 'cash';
      case 'credit':
      case 'debt':
        return 'credit';
      case 'transfer':
        return 'transfer';
      case 'split':
        return 'split';
      default:
        return 'cash';
    }
  }

  /**
   * Calculate due date for credit payments
   */
  calculateDueDate() {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + this.creditTermsDays);
    return dueDate.toISOString();
  }

  /**
   * Get payment instructions
   */
  getPaymentInstructions(paymentType, paymentRecord) {
    const instructions = {
      type: paymentType,
      steps: []
    };

    switch (paymentType) {
      case 'cash':
        instructions.steps = [
          '1. Receive cash payment from customer',
          '2. Count and verify amount',
          '3. Record payment in system',
          '4. Provide receipt to customer'
        ];
        break;

      case 'credit':
        instructions.steps = [
          '1. Verify customer credit limit',
          '2. Record credit/debt in system',
          '3. Set payment due date',
          '4. Send payment reminder to customer'
        ];
        break;

      case 'transfer':
        instructions.steps = [
          '1. Provide bank account details to customer',
          '2. Wait for transfer confirmation',
          '3. Verify transfer in bank statement',
          '4. Record payment in system'
        ];
        break;

      case 'split':
        instructions.steps = [
          '1. Record each payment method and amount',
          '2. Sum partial payments',
          '3. Update remaining balance',
          '4. Complete when full amount received'
        ];
        break;
    }

    return instructions;
  }

  /**
   * Generate receipt for payment
   */
  async generateReceipt(paymentRecord) {
    try {
      const receipt = {
        receipt_number: this.generateReference('RCP'),
        payment_reference: paymentRecord.reference,
        customer_name: paymentRecord.customer_name,
        amount: paymentRecord.amount,
        currency: paymentRecord.currency,
        payment_type: paymentRecord.type,
        description: paymentRecord.description,
        paid_amount: paymentRecord.paid_amount,
        received_by: paymentRecord.payment_details.received_by,
        created_at: paymentRecord.created_at,
        status: paymentRecord.status
      };

      this.log('info', 'Receipt generated', {
        receipt_number: receipt.receipt_number,
        payment_reference: paymentRecord.reference
      });

      return receipt;
    } catch (error) {
      this.log('error', 'Failed to generate receipt', {
        reference: paymentRecord.reference,
        error: error.message
      });
      throw this.handleError(error, 'generateReceipt');
    }
  }

  /**
   * Validate payment data for manual payments
   */
  validatePaymentData(paymentData) {
    const errors = super.validatePaymentData(paymentData);

    // Validate credit limit if credit payment
    if (paymentData.payment_method === 'credit' && this.allowCredit) {
      if (!paymentData.customer_id) {
        errors.push('Customer ID required for credit payments');
      }

      // Check if amount exceeds credit limit
      if (paymentData.amount > this.maxCreditAmount) {
        errors.push(`Amount exceeds maximum credit limit of ${this.maxCreditAmount}`);
      }
    }

    // Validate split payments
    if (paymentData.payment_method === 'split' && paymentData.split_payments) {
      const totalSplit = paymentData.split_payments.reduce((sum, payment) => sum + payment.amount, 0);
      if (totalSplit !== paymentData.amount) {
        errors.push('Split payment amounts must equal total amount');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Calculate fee for manual payments (usually none)
   */
  calculateFee(amount) {
    return {
      fee: 0,
      total: amount
    };
  }

  /**
   * Format amount (manual payments usually no decimal places)
   */
  formatAmount(amount, currency = 'IDR') {
    if (currency === 'IDR') {
      return Math.round(parseInt(amount));
    }
    return parseFloat(amount).toFixed(2);
  }
}

module.exports = ManualPlugin;