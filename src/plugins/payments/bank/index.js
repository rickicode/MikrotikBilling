const { PaymentPlugin } = require('../../../lib/PaymentPlugin');

/**
 * Bank Transfer Payment Gateway Plugin
 *
 * Handles bank transfer payment processing including:
 * - Virtual account generation
 * - Bank transfer confirmation
 * - Multiple bank support
 * - Automatic validation
 */
class BankTransferPlugin extends PaymentPlugin {
  constructor(config = {}) {
    super({
      name: 'BankTransfer',
      version: '1.0.0',
      ...config
    });

    this.supportedBanks = config.supported_banks || [
      {
        code: 'bca',
        name: 'BCA (Bank Central Asia)',
        va_prefix: '88088',
        account_number: config.accounts?.bca || '1234567890',
        account_name: config.account_names?.bca || 'PT. HIJINETWORK'
      },
      {
        code: 'bni',
        name: 'BNI (Bank Negara Indonesia)',
        va_prefix: '88089',
        account_number: config.accounts?.bni || '0987654321',
        account_name: config.account_names?.bni || 'PT. HIJINETWORK'
      },
      {
        code: 'bri',
        name: 'BRI (Bank Rakyat Indonesia)',
        va_prefix: '88090',
        account_number: config.accounts?.bri || '5555666677',
        account_name: config.account_names?.bri || 'PT. HIJINETWORK'
      },
      {
        code: 'mandiri',
        name: 'Bank Mandiri',
        va_prefix: '88091',
        account_number: config.accounts?.mandiri || '9999888877',
        account_name: config.account_names?.mandiri || 'PT. HIJINETWORK'
      }
    ];

    this.autoExpiryHours = config.auto_expiry_hours || 24;
    this.requireConfirmation = config.require_confirmation !== false;
    this.allowPartialPayment = config.allow_partial_payment || false;
    this.validationMode = config.validation_mode || 'automatic'; // 'automatic' or 'manual'
  }

  async initialize() {
    try {
      // Validate bank configurations
      for (const bank of this.supportedBanks) {
        if (!bank.account_number) {
          this.log('warn', `No account number configured for ${bank.name}`, {
            bank_code: bank.code
          });
        }
      }

      this.isInitialized = true;
      this.log('info', 'Bank Transfer plugin initialized successfully', {
        supported_banks: this.supportedBanks.length,
        auto_expiry_hours: this.autoExpiryHours,
        require_confirmation: this.requireConfirmation
      });

      return true;
    } catch (error) {
      this.log('error', 'Failed to initialize Bank Transfer plugin', { error: error.message });
      throw this.handleError(error, 'initialize');
    }
  }

  /**
   * Create bank transfer payment
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

      // Get selected bank or use default
      const selectedBank = paymentData.bank_code
        ? this.supportedBanks.find(bank => bank.code === paymentData.bank_code)
        : this.supportedBanks[0];

      if (!selectedBank) {
        throw new Error(`Unsupported bank code: ${paymentData.bank_code}`);
      }

      // Generate unique payment reference
      const reference = this.generateReference('BANK');

      // Generate virtual account number
      const virtualAccount = this.generateVirtualAccount(selectedBank, paymentData.customer_id);

      // Calculate fee (bank transfers usually have minimal fees)
      const feeCalculation = this.calculateFee(paymentData.amount);

      // Calculate expiry time
      const expiresAt = this.calculateExpiryTime();

      // Create payment record
      const paymentRecord = {
        reference,
        bank_code: selectedBank.code,
        bank_name: selectedBank.name,
        virtual_account: virtualAccount,
        account_number: selectedBank.account_number,
        account_name: selectedBank.account_name,
        amount: paymentData.amount,
        currency: paymentData.currency || 'IDR',
        customer_id: paymentData.customer_id,
        customer_name: paymentData.customer_name,
        customer_email: paymentData.customer_email,
        customer_phone: paymentData.customer_phone,
        description: paymentData.description,
        status: this.requireConfirmation ? 'PENDING' : 'SUCCESS',
        created_at: new Date().toISOString(),
        expires_at: expiresAt,
        fee: feeCalculation.fee,
        total_amount: feeCalculation.total,
        payment_details: {
          method: 'bank_transfer',
          bank_code: selectedBank.code,
          bank_name: selectedBank.name,
          virtual_account: virtualAccount,
          destination_account: selectedBank.account_number,
          account_name: selectedBank.account_name,
          require_confirmation: this.requireConfirmation,
          allow_partial_payment: this.allowPartialPayment,
          validation_mode: this.validationMode
        }
      };

      this.log('info', 'Bank transfer payment created', {
        reference,
        bank_code: selectedBank.code,
        virtual_account: virtualAccount,
        amount: paymentData.amount,
        customer_id: paymentData.customer_id
      });

      const result = {
        success: true,
        reference,
        payment_type: 'bank_transfer',
        status: paymentRecord.status,
        amount: paymentData.amount,
        currency: paymentRecord.currency,
        fee: feeCalculation.fee,
        total_amount: feeCalculation.total,
        bank_details: {
          bank_code: selectedBank.code,
          bank_name: selectedBank.name,
          virtual_account: virtualAccount,
          account_number: selectedBank.account_number,
          account_name: selectedBank.account_name
        },
        redirect_url: null, // Bank transfers don't need redirect
        qr_code: null,
        expires_at: expiresAt,
        instructions: this.getPaymentInstructions(selectedBank, paymentRecord),
        metadata: {
          plugin: 'BankTransfer',
          created_at: paymentRecord.created_at,
          payment_record: paymentRecord
        }
      };

      this.log('info', 'Bank transfer payment created successfully', {
        reference,
        bank_code: selectedBank.code,
        status: result.status
      });

      return result;

    } catch (error) {
      this.log('error', 'Failed to create bank transfer payment', {
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
      // or check with bank API for confirmation
      const mockPayment = {
        reference,
        status: 'SUCCESS', // SUCCESS, PENDING, FAILED, EXPIRED
        amount: 50000,
        currency: 'IDR',
        paid_amount: 50000,
        remaining_amount: 0,
        bank_code: 'bca',
        virtual_account: '8808801234567890',
        confirmed_at: new Date().toISOString(),
        notes: 'Bank transfer confirmed'
      };

      const result = {
        success: true,
        reference: mockPayment.reference,
        status: mockPayment.status,
        amount: mockPayment.amount,
        currency: mockPayment.currency,
        paid_amount: mockPayment.paid_amount,
        remaining_amount: mockPayment.remaining_amount,
        bank_code: mockPayment.bank_code,
        virtual_account: mockPayment.virtual_account,
        confirmed_at: mockPayment.confirmed_at,
        expires_at: mockPayment.expires_at || null,
        metadata: {
          plugin: 'BankTransfer',
          checked_at: new Date().toISOString(),
          payment_details: mockPayment
        }
      };

      this.log('info', 'Bank transfer payment status checked', {
        reference,
        status: result.status
      });

      return result;

    } catch (error) {
      this.log('error', 'Failed to check bank transfer payment status', {
        reference,
        error: error.message
      });
      throw this.handleError(error, 'checkStatus');
    }
  }

  /**
   * Handle payment confirmation callback
   */
  async handleCallback(callbackData) {
    try {
      this.log('info', 'Processing bank transfer callback', callbackData);

      // Verify callback data
      const reference = callbackData.reference || callbackData.payment_reference;
      if (!reference) {
        throw new Error('Payment reference not found in callback data');
      }

      // For bank transfers, callbacks are usually manual confirmations
      const result = {
        success: true,
        reference: reference,
        status: 'SUCCESS',
        amount: callbackData.amount || 0,
        paid_amount: callbackData.amount || 0,
        confirmed_at: new Date().toISOString(),
        payment_method: 'bank_transfer',
        bank_code: callbackData.bank_code,
        confirmation_notes: callbackData.notes || '',
        metadata: {
          callback_data: callbackData,
          processed_at: new Date().toISOString()
        }
      };

      this.log('info', 'Bank transfer callback processed successfully', {
        reference: result.reference,
        status: result.status
      });

      return result;

    } catch (error) {
      this.log('error', 'Failed to process bank transfer callback', {
        callback_data: callbackData,
        error: error.message
      });
      throw this.handleError(error, 'handleCallback');
    }
  }

  /**
   * Confirm bank transfer payment manually
   */
  async confirmPayment(reference, confirmationData) {
    try {
      this.log('info', 'Confirming bank transfer payment', {
        reference,
        confirmation_data: confirmationData
      });

      const result = {
        success: true,
        reference,
        status: 'SUCCESS',
        confirmed_at: new Date().toISOString(),
        confirmed_by: confirmationData.confirmed_by || 'System',
        confirmation_notes: confirmationData.notes || '',
        transfer_amount: confirmationData.transfer_amount,
        transfer_date: confirmationData.transfer_date,
        account_name: confirmationData.account_name,
        metadata: {
          confirmation_data,
          confirmed_at: new Date().toISOString()
        }
      };

      this.log('info', 'Bank transfer payment confirmed successfully', {
        reference,
        confirmed_by: result.confirmed_by
      });

      return result;

    } catch (error) {
      this.log('error', 'Failed to confirm bank transfer payment', {
        reference,
        error: error.message
      });
      throw this.handleError(error, 'confirmPayment');
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
      'manual_confirmation',
      'multiple_banks',
      'virtual_accounts',
      'auto_expiry',
      'payment_validation'
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
      type: 'fixed',
      amount: 2500, // Small fixed fee for bank transfers
      min_fee: 0,
      max_fee: 10000
    };
  }

  /**
   * Get supported banks
   */
  getSupportedBanks() {
    return this.supportedBanks.map(bank => ({
      code: bank.code,
      name: bank.name,
      has_account: !!bank.account_number
    }));
  }

  /**
   * Generate virtual account number
   */
  generateVirtualAccount(bank, customerId) {
    // Use customer ID to generate consistent VA
    const customerPart = String(customerId).padStart(8, '0');
    const randomPart = Math.random().toString(36).substr(2, 4).toUpperCase();

    return `${bank.va_prefix}${customerPart}${randomPart}`;
  }

  /**
   * Calculate expiry time
   */
  calculateExpiryTime() {
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + this.autoExpiryHours);
    return expiry.toISOString();
  }

  /**
   * Get payment instructions
   */
  getPaymentInstructions(bank, paymentRecord) {
    const instructions = {
      bank_code: bank.code,
      bank_name: bank.name,
      virtual_account: paymentRecord.virtual_account,
      account_number: bank.account_number,
      account_name: bank.account_name,
      amount: paymentRecord.amount,
      steps: []
    };

    switch (bank.code.toLowerCase()) {
      case 'bca':
        instructions.steps = [
          `1. Login ke aplikasi BCA Mobile atau website KlikBCA`,
          `2. Pilih menu "Transfer"`,
          `3. Pilih "Virtual Account"`,
          `4. Masukkan nomor VA: ${paymentRecord.virtual_account}`,
          `5. Masukkan jumlah pembayaran: Rp ${this.formatAmount(paymentRecord.amount)}`,
          '6. Konfirmasi dan selesaikan pembayaran'
        ];
        break;

      case 'bni':
        instructions.steps = [
          `1. Login ke aplikasi BNI Mobile Banking atau website BNI`,
          `2. Pilih menu "Transfer"`,
          `3. Pilih "Virtual Account Billing"`,
          `4. Masukkan nomor VA: ${paymentRecord.virtual_account}`,
          `5. Masukkan jumlah pembayaran: Rp ${this.formatAmount(paymentRecord.amount)}`,
          '6. Konfirmasi dan selesaikan pembayaran'
        ];
        break;

      case 'bri':
        instructions.steps = [
          `1. Login ke aplikasi BRImo atau website BRI`,
          `2. Pilih menu "Pembayaran"`,
          `3. Pilih "BRIVA"`,
          `4. Masukkan nomor VA: ${paymentRecord.virtual_account}`,
          `5. Masukkan jumlah pembayaran: Rp ${this.formatAmount(paymentRecord.amount)}`,
          '6. Konfirmasi dan selesaikan pembayaran'
        ];
        break;

      case 'mandiri':
        instructions.steps = [
          `1. Login ke aplikasi Livin' by Mandiri atau website Mandiri`,
          `2. Pilih menu "Pembayaran"`,
          `3. Pilih "Multipayment" atau "Virtual Account"`,
          `4. Masukkan nomor VA: ${paymentRecord.virtual_account}`,
          `5. Masukkan jumlah pembayaran: Rp ${this.formatAmount(paymentRecord.amount)}`,
          '6. Konfirmasi dan selesaikan pembayaran'
        ];
        break;

      default:
        instructions.steps = [
          `1. Login ke aplikasi ${bank.name}`,
          '2. Pilih menu Transfer atau Pembayaran',
          `3. Pilih Virtual Account`,
          `4. Masukkan nomor VA: ${paymentRecord.virtual_account}`,
          `5. Masukkan jumlah pembayaran: Rp ${this.formatAmount(paymentRecord.amount)}`,
          '6. Konfirmasi dan selesaikan pembayaran'
        ];
    }

    return instructions;
  }

  /**
   * Validate payment data for bank transfers
   */
  validatePaymentData(paymentData) {
    const errors = super.validatePaymentData(paymentData);

    // Validate bank code if specified
    if (paymentData.bank_code) {
      const supportedBank = this.supportedBanks.find(bank => bank.code === paymentData.bank_code);
      if (!supportedBank) {
        errors.push(`Unsupported bank code: ${paymentData.bank_code}`);
      }
    }

    // Validate customer ID for VA generation
    if (!paymentData.customer_id) {
      errors.push('Customer ID is required for virtual account generation');
    }

    // Validate amount
    if (paymentData.amount < 10000) {
      errors.push('Minimum amount for bank transfer is Rp 10,000');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Format amount for display
   */
  formatAmount(amount, currency = 'IDR') {
    if (currency === 'IDR') {
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
      }).format(amount);
    }
    return parseFloat(amount).toFixed(2);
  }

  /**
   * Get supported payment methods for external systems
   */
  getSupportedMethods() {
    return ['bank_transfer', 'virtual_account'];
  }
}

module.exports = BankTransferPlugin;