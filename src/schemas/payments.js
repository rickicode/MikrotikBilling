// src/schemas/payments.js
/**
 * Mikrotik Billing System - Payment Processing Schemas
 * Comprehensive validation schemas for payment processing with plugin validation
 */

const { Type } = require('@sinclair/typebox');
const T = Type;

const CommonSchemas = require('./common');

/**
 * Payment Gateway Type Enum
 */
const PaymentGatewayType = T.Enum(['duitku', 'midtrans', 'xendit', 'ipaymu', 'manual', 'cash', 'bank_transfer'], {
  description: 'Payment gateway provider'
});

/**
 * Payment Status Enum
 */
const PaymentStatus = T.Enum(['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded', 'partially_refunded'], {
  description: 'Payment processing status'
});

/**
 * Transaction Type Enum
 */
const TransactionType = T.Enum(['payment', 'refund', 'partial_refund', 'chargeback', 'fee'], {
  description: 'Transaction type'
});

/**
 * Currency Code Enum (Indonesian focus)
 */
const CurrencyCode = T.Enum(['IDR', 'USD', 'EUR', 'SGD', 'MYR', 'THB', 'PHP', 'VND'], {
  description: 'Supported currency codes'
});

/**
 * Payment Schemas
 */
const PaymentSchemas = {
  // Base payment schema
  payment: T.Object({
    id: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    paymentNumber: T.String({
      pattern: '^PAY-[0-9]{4}-[0-9]{6}$',
      description: 'Payment number in format PAY-YYYY-NNNNNN'
    }),
    invoiceId: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    customerId: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    amount: T.Number({
      minimum: 0,
      maximum: 999999999,
      description: 'Payment amount'
    }),
    currencyCode: CurrencyCode,
    exchangeRate: T.Number({
      minimum: 0,
      default: 1,
      description: 'Exchange rate from base currency'
    }),
    originalAmount: T.Optional(T.Number({
      minimum: 0,
      description: 'Original amount in original currency'
    })),
    gateway: PaymentGatewayType,
    gatewayTransactionId: T.Optional(T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Gateway transaction ID'
    })),
    gatewayReference: T.Optional(T.String({
      minLength: 1,
      maxLength: 200,
      description: 'Gateway reference number'
    })),
    status: PaymentStatus,
    paymentDate: T.String({
      format: 'date-time',
      description: 'Payment date and time'
    }),
    expiryDate: T.Optional(T.String({
      format: 'date-time',
      description: 'Payment expiry date for pending payments'
    })),
    completedAt: T.Optional(T.String({
      format: 'date-time',
      description: 'Payment completion timestamp'
    })),
    method: T.Enum(['cash', 'transfer', 'credit_card', 'debit_card', 'e_wallet', 'qris', 'virtual_account', 'over_the_counter', 'bank_transfer', 'other'], {
      description: 'Payment method'
    }),
    methodDetails: T.Optional(T.Record(T.String(), T.Any(), {
      description: 'Payment method specific details'
    })),
    fees: T.Array(T.Object({
      type: T.Enum(['processing', 'gateway', 'admin', 'tax', 'other'], {
        description: 'Fee type'
      }),
      name: T.String({
        minLength: 1,
        maxLength: 100,
        description: 'Fee name'
      }),
      amount: T.Number({
        minimum: 0,
        description: 'Fee amount'
      }),
      percentage: T.Optional(T.Number({
        minimum: 0,
        maximum: 100,
        description: 'Fee percentage if applicable'
      }))
    }), {
      description: 'Payment fee breakdown'
    }),
    totalFees: T.Number({
      minimum: 0,
      default: 0,
      description: 'Total fees charged'
    }),
    netAmount: T.Number({
      description: 'Net amount after fees'
    }),
    description: T.Optional(T.String({
      maxLength: 500,
      description: 'Payment description or notes'
    })),
    customerInfo: T.Optional(T.Object({
      name: T.String({
        maxLength: 100
      }),
      email: T.Optional(CommonSchemas.email),
      phone: T.Optional(CommonSchemas.phone)
    }, {
      description: 'Customer information for payment'
    })),
    metadata: T.Optional(CommonSchemas.metadataObject),
    locationId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    createdBy: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    createdAt: T.Optional(T.String({
      format: 'date-time'
    })),
    updatedAt: T.Optional(T.String({
      format: 'date-time'
    }))
  }, {
    required: ['paymentNumber', 'invoiceId', 'customerId', 'amount', 'currencyCode', 'gateway', 'status', 'paymentDate', 'method'],
    description: 'Complete payment record',
    examples: [
      {
        paymentNumber: 'PAY-2024-000123',
        invoiceId: 1,
        customerId: 1,
        amount: 111000,
        currencyCode: 'IDR',
        gateway: 'duitku',
        status: 'completed',
        paymentDate: '2024-01-10T10:30:00Z',
        completedAt: '2024-01-10T10:32:15Z',
        method: 'e_wallet',
        totalFees: 2500,
        netAmount: 108500,
        gatewayTransactionId: 'DTK-202401101030001234'
      }
    ]
  }),

  // Create payment schema
  createPayment: T.Object({
    invoiceId: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    amount: T.Number({
      minimum: 0,
      maximum: 999999999
    }),
    currencyCode: T.Optional(CurrencyCode),
    gateway: PaymentGatewayType,
    method: T.Enum(['cash', 'transfer', 'credit_card', 'debit_card', 'e_wallet', 'qris', 'virtual_account', 'over_the_counter', 'bank_transfer', 'other']),
    customerInfo: T.Optional(T.Object({
      name: T.String({
        maxLength: 100
      }),
      email: T.Optional(CommonSchemas.email),
      phone: T.Optional(CommonSchemas.phone)
    })),
    paymentDate: T.Optional(T.String({
      format: 'date-time',
      default: () => new Date().toISOString()
    })),
    description: T.Optional(T.String({
      maxLength: 500
    })),
    metadata: T.Optional(CommonSchemas.metadataObject),
    locationId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    autoProcess: T.Optional(T.Boolean({
      default: true,
      description: 'Automatically process payment through gateway'
    })),
    sendNotification: T.Optional(T.Boolean({
      default: true,
      description: 'Send payment notification to customer'
    }))
  }, {
    required: ['invoiceId', 'amount', 'gateway', 'method'],
    description: 'Schema for creating new payment',
    examples: [
      {
        invoiceId: 1,
        amount: 111000,
        gateway: 'duitku',
        method: 'e_wallet',
        customerInfo: {
          name: 'John Doe',
          email: 'john@example.com',
          phone: '+628123456789'
        }
      }
    ]
  }),

  // Payment gateway configuration schema
  paymentGatewayConfig: T.Object({
    id: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    gateway: PaymentGatewayType,
    name: T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Configuration name'
    }),
    isActive: T.Boolean({
      default: true,
      description: 'Gateway active status'
    }),
    environment: T.Enum(['sandbox', 'production'], {
      default: 'sandbox',
      description: 'Gateway environment'
    }),
    merchantCode: T.Optional(T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Merchant code or identifier'
    })),
    apiKey: T.Optional(T.String({
      minLength: 1,
      maxLength: 500,
      description: 'API key (encrypted in storage)'
    })),
    apiSecret: T.Optional(T.String({
      minLength: 1,
      maxLength: 500,
      description: 'API secret (encrypted in storage)'
    })),
    webhookUrl: T.Optional(T.String({
      format: 'uri',
      description: 'Webhook URL for callbacks'
    })),
    returnUrl: T.Optional(T.String({
      format: 'uri',
      description: 'Return URL after payment'
    })),
    callbackUrl: T.Optional(T.String({
      format: 'uri',
      description: 'Callback URL for payment status'
    })),
    supportedMethods: T.Array(T.Enum(['cash', 'transfer', 'credit_card', 'debit_card', 'e_wallet', 'qris', 'virtual_account', 'over_the_counter', 'bank_transfer', 'other']), {
      description: 'Supported payment methods'
    }),
    feeConfiguration: T.Object({
      type: T.Enum(['fixed', 'percentage', 'tiered'], {
        description: 'Fee calculation type'
      }),
      fixedAmount: T.Optional(T.Number({
        minimum: 0,
        description: 'Fixed fee amount'
      })),
      percentage: T.Optional(T.Number({
        minimum: 0,
        maximum: 100,
        description: 'Percentage fee'
      })),
      minimumFee: T.Optional(T.Number({
        minimum: 0,
        description: 'Minimum fee amount'
      })),
      maximumFee: T.Optional(T.Number({
        minimum: 0,
        description: 'Maximum fee amount'
      })),
      tiers: T.Optional(T.Array(T.Object({
        minAmount: T.Number({
          minimum: 0
        }),
        maxAmount: T.Optional(T.Number({
          minimum: 0
        })),
        feeType: T.Enum(['fixed', 'percentage']),
        feeValue: T.Number({
          minimum: 0
        })
      }), {
        description: 'Tiered fee configuration'
      }))
    }, {
      description: 'Fee configuration for this gateway'
    }),
    currencyConfiguration: T.Object({
      baseCurrency: CurrencyCode,
      supportedCurrencies: T.Array(CurrencyCode, {
        description: 'Supported currencies'
      }),
      autoConvert: T.Boolean({
        default: false,
        description: 'Auto-convert to base currency'
      })
    }, {
      description: 'Currency configuration'
    }),
    limits: T.Object({
      minimumAmount: T.Number({
        minimum: 0,
        description: 'Minimum transaction amount'
      }),
      maximumAmount: T.Number({
        minimum: 0,
        description: 'Maximum transaction amount'
      }),
      dailyLimit: T.Optional(T.Number({
        minimum: 0,
        description: 'Daily transaction limit'
      })),
      monthlyLimit: T.Optional(T.Number({
        minimum: 0,
        description: 'Monthly transaction limit'
      }))
    }, {
      description: 'Transaction limits'
    }),
    settings: T.Optional(T.Record(T.String(), T.Any(), {
      description: 'Gateway-specific settings'
    })),
    metadata: T.Optional(CommonSchemas.metadataObject),
    createdAt: T.Optional(T.String({
      format: 'date-time'
    })),
    updatedAt: T.Optional(T.String({
      format: 'date-time'
    }))
  }, {
    required: ['gateway', 'name', 'supportedMethods', 'feeConfiguration', 'currencyConfiguration', 'limits'],
    description: 'Payment gateway configuration',
    examples: [
      {
        gateway: 'duitku',
        name: 'DuitKu Production',
        isActive: true,
        environment: 'production',
        merchantCode: 'MIKROTIK',
        supportedMethods: ['e_wallet', 'virtual_account', 'bank_transfer'],
        feeConfiguration: {
          type: 'percentage',
          percentage: 2.5,
          minimumFee: 1500,
          maximumFee: 10000
        },
        currencyConfiguration: {
          baseCurrency: 'IDR',
          supportedCurrencies: ['IDR', 'USD'],
          autoConvert: false
        },
        limits: {
          minimumAmount: 1000,
          maximumAmount: 50000000
        }
      }
    ]
  }),

  // Payment method schema
  paymentMethod: T.Object({
    id: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    gateway: PaymentGatewayType,
    method: T.Enum(['cash', 'transfer', 'credit_card', 'debit_card', 'e_wallet', 'qris', 'virtual_account', 'over_the_counter', 'bank_transfer', 'other']),
    name: T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Display name for payment method'
    }),
    description: T.String({
      maxLength: 500,
      description: 'Payment method description'
    }),
    isActive: T.Boolean({
      default: true,
      description: 'Method active status'
    }),
    icon: T.Optional(T.String({
      format: 'uri',
      description: 'Method icon URL'
    })),
    sortOrder: T.Integer({
      minimum: 0,
      default: 0,
      description: 'Display sort order'
    }),
    feeConfiguration: T.Object({
      type: T.Enum(['fixed', 'percentage', 'tiered']),
      fixedAmount: T.Optional(T.Number({
        minimum: 0
      })),
      percentage: T.Optional(T.Number({
        minimum: 0,
        maximum: 100
      })),
      minimumFee: T.Optional(T.Number({
        minimum: 0
      })),
      maximumFee: T.Optional(T.Number({
        minimum: 0
      }))
    }, {
      description: 'Fee configuration for this method'
    }),
    limits: T.Object({
      minimumAmount: T.Number({
        minimum: 0
      }),
      maximumAmount: T.Number({
        minimum: 0
      })
    }, {
      description: 'Transaction limits for this method'
    }),
    configuration: T.Optional(T.Record(T.String(), T.Any(), {
      description: 'Method-specific configuration'
    })),
    metadata: T.Optional(CommonSchemas.metadataObject),
    createdAt: T.Optional(T.String({
      format: 'date-time'
    })),
    updatedAt: T.Optional(T.String({
      format: 'date-time'
    }))
  }, {
    required: ['gateway', 'method', 'name', 'description', 'feeConfiguration', 'limits'],
    description: 'Payment method configuration'
  }),

  // Payment search and filter schema
  paymentSearchQuery: T.Object({
    search: T.Optional(T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Search payment number, invoice, or customer name'
    })),
    invoiceId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    customerId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    gateway: T.Optional(PaymentGatewayType),
    status: T.Optional(PaymentStatus),
    method: T.Optional(T.Enum(['cash', 'transfer', 'credit_card', 'debit_card', 'e_wallet', 'qris', 'virtual_account', 'over_the_counter', 'bank_transfer', 'other'])),
    currencyCode: T.Optional(CurrencyCode),
    amountMin: T.Optional(T.Number({
      minimum: 0
    })),
    amountMax: T.Optional(T.Number({
      minimum: 0
    })),
    paymentDateFrom: T.Optional(T.String({
      format: 'date-time'
    })),
    paymentDateTo: T.Optional(T.String({
      format: 'date-time'
    })),
    hasGatewayTransaction: T.Optional(T.Boolean({
      description: 'Filter payments with gateway transactions'
    })),
    locationId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    createdBy: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    ...CommonSchemas.paginationQuery.properties
  }, {
    description: 'Payment search and filter parameters',
    examples: [
      {
        status: 'completed',
        gateway: 'duitku',
        paymentDateFrom: '2024-01-01T00:00:00Z',
        paymentDateTo: '2024-01-31T23:59:59Z',
        page: 1,
        limit: 20
      }
    ]
  }),

  // Payment processing schema
  processPayment: T.Object({
    paymentId: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    action: T.Enum(['process', 'verify', 'complete', 'fail', 'cancel', 'refund'], {
      description: 'Processing action'
    }),
    amount: T.Optional(T.Number({
      minimum: 0,
      description: 'Amount for partial operations'
    })),
    reason: T.Optional(T.String({
      maxLength: 500,
      description: 'Reason for the action'
    })),
    gatewayResponse: T.Optional(T.Record(T.String(), T.Any(), {
      description: 'Gateway response data'
    })),
    metadata: T.Optional(CommonSchemas.metadataObject)
  }, {
    required: ['paymentId', 'action'],
    description: 'Schema for payment processing actions',
    examples: [
      {
        paymentId: 1,
        action: 'complete',
        gatewayResponse: {
          transaction_id: 'DTK-202401101030001234',
          status: 'SUCCESS'
        }
      }
    ]
  }),

  // Payment statistics schema
  paymentStats: T.Object({
    totalPayments: T.Integer({
      minimum: 0,
      description: 'Total number of payments'
    }),
    completedPayments: T.Integer({
      minimum: 0,
      description: 'Number of completed payments'
    }),
    failedPayments: T.Integer({
      minimum: 0,
      description: 'Number of failed payments'
    }),
    pendingPayments: T.Integer({
      minimum: 0,
      description: 'Number of pending payments'
    }),
    totalAmount: T.Number({
      description: 'Total payment amount'
    }),
    completedAmount: T.Number({
      description: 'Amount from completed payments'
    }),
    failedAmount: T.Number({
      description: 'Amount from failed payments'
    }),
    pendingAmount: T.Number({
      description: 'Amount from pending payments'
    }),
    totalFees: T.Number({
      description: 'Total fees collected'
    }),
    netAmount: T.Number({
      description: 'Net amount after fees'
    }),
    averagePaymentAmount: T.Number({
      description: 'Average payment amount'
    }),
    averageFeeAmount: T.Number({
      description: 'Average fee amount'
    }),
    paymentsByGateway: T.Record(T.String(), T.Integer(), {
      description: 'Payment count by gateway'
    }),
    paymentsByMethod: T.Record(T.String(), T.Integer(), {
      description: 'Payment count by method'
    }),
    paymentsByStatus: T.Record(T.String(), T.Integer(), {
      description: 'Payment count by status'
    }),
    paymentsByCurrency: T.Record(T.String(), T.Integer(), {
      description: 'Payment count by currency'
    }),
    revenueByGateway: T.Record(T.String(), T.Number(), {
      description: 'Revenue by gateway'
    }),
    dailyStats: T.Array(T.Object({
      date: T.String(),
      paymentCount: T.Integer(),
      totalAmount: T.Number(),
      completedAmount: T.Number(),
      feeAmount: T.Number()
    }), {
      maxItems: 30,
      description: 'Daily statistics for the last 30 days'
    }),
    topPaymentMethods: T.Array(T.Object({
      method: T.String(),
      count: T.Integer(),
      amount: T.Number(),
      percentage: T.Number()
    }), {
      maxItems: 10,
      description: 'Top payment methods by usage'
    })
  }, {
    description: 'Payment system statistics and analytics'
  }),

  // Payment export schema
  paymentExport: T.Object({
    format: T.Enum(['csv', 'xlsx', 'pdf'], {
      default: 'csv',
      description: 'Export file format'
    }),
    filters: T.Optional(T.Object({
      search: T.Optional(T.String({
        minLength: 1,
        maxLength: 100,
        description: 'Search payment number, invoice, or customer name'
      })),
      invoiceId: T.Optional(T.Union([
        T.Integer({ minimum: 1 }),
        T.String({ pattern: CommonSchemas.UUIDPattern })
      ])),
      customerId: T.Optional(T.Union([
        T.Integer({ minimum: 1 }),
        T.String({ pattern: CommonSchemas.UUIDPattern })
      ])),
      gateway: T.Optional(T.Enum(['duitku', 'midtrans', 'xendit', 'ipaymu', 'manual', 'cash', 'bank_transfer'])),
      status: T.Optional(T.Enum(['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded', 'partially_refunded'])),
      method: T.Optional(T.Enum(['cash', 'transfer', 'credit_card', 'debit_card', 'e_wallet', 'qris', 'virtual_account', 'over_the_counter', 'bank_transfer', 'other'])),
      currencyCode: T.Optional(T.Enum(['IDR', 'USD', 'EUR', 'SGD', 'MYR', 'THB', 'PHP', 'VND'])),
      amountMin: T.Optional(T.Number({
        minimum: 0
      })),
      amountMax: T.Optional(T.Number({
        minimum: 0
      })),
      paymentDateFrom: T.Optional(T.String({
        format: 'date-time'
      })),
      paymentDateTo: T.Optional(T.String({
        format: 'date-time'
      })),
      hasGatewayTransaction: T.Optional(T.Boolean({
        description: 'Filter payments with gateway transactions'
      })),
      locationId: T.Optional(T.Union([
        T.Integer({ minimum: 1 }),
        T.String({ pattern: CommonSchemas.UUIDPattern })
      ])),
      createdBy: T.Optional(T.Union([
        T.Integer({ minimum: 1 }),
        T.String({ pattern: CommonSchemas.UUIDPattern })
      ]))
    })),
    fields: T.Optional(T.Array(T.Enum([
      'id', 'paymentNumber', 'invoiceId', 'customerName', 'amount', 'currencyCode',
      'gateway', 'method', 'status', 'paymentDate', 'completedAt', 'totalFees',
      'netAmount', 'gatewayTransactionId', 'description', 'locationName'
    ]), {
      description: 'Fields to include in export'
    })),
    includeHeaders: T.Optional(T.Boolean({
      default: true,
      description: 'Include column headers in export'
    })),
    groupBy: T.Optional(T.Enum(['gateway', 'method', 'status', 'currency', 'location'], {
      description: 'Group payments in export'
    })),
    includeSummary: T.Optional(T.Boolean({
      default: false,
      description: 'Include summary statistics'
    }))
  }, {
    description: 'Schema for payment data export',
    examples: [
      {
        format: 'xlsx',
        filters: {
          status: 'completed',
          paymentDateFrom: '2024-01-01T00:00:00Z',
          paymentDateTo: '2024-01-31T23:59:59Z'
        },
        fields: ['paymentNumber', 'customerName', 'amount', 'gateway', 'method', 'paymentDate'],
        includeSummary: true
      }
    ]
  }),

  // Refund schema
  refund: T.Object({
    id: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    paymentId: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    refundNumber: T.String({
      pattern: '^REF-[0-9]{4}-[0-9]{6}$',
      description: 'Refund number in format REF-YYYY-NNNNNN'
    }),
    amount: T.Number({
      minimum: 0,
      description: 'Refund amount'
    }),
    reason: T.String({
      minLength: 5,
      maxLength: 500,
      description: 'Refund reason'
    }),
    status: T.Enum(['pending', 'processing', 'completed', 'failed'], {
      description: 'Refund status'
    }),
    processedBy: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    gatewayRefundId: T.Optional(T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Gateway refund transaction ID'
    })),
    refundDate: T.String({
      format: 'date-time',
      description: 'Refund date and time'
    }),
    completedAt: T.Optional(T.String({
      format: 'date-time',
      description: 'Refund completion timestamp'
    })),
    fees: T.Array(T.Object({
      type: T.Enum(['processing', 'gateway', 'penalty']),
      name: T.String({
        minLength: 1,
        maxLength: 100
      }),
      amount: T.Number({
        minimum: 0
      })
    }), {
      description: 'Refund fee breakdown'
    }),
    netRefundAmount: T.Number({
      description: 'Net refund amount after fees'
    }),
    notes: T.Optional(T.String({
      maxLength: 500,
      description: 'Additional refund notes'
    })),
    metadata: T.Optional(CommonSchemas.metadataObject),
    createdAt: T.Optional(T.String({
      format: 'date-time'
    })),
    updatedAt: T.Optional(T.String({
      format: 'date-time'
    }))
  }, {
    required: ['paymentId', 'refundNumber', 'amount', 'reason', 'status', 'refundDate'],
    description: 'Refund record'
  }),

  // Payment webhook schema
  paymentWebhook: T.Object({
    gateway: PaymentGatewayType,
    eventType: T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Webhook event type'
    }),
    transactionId: T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Gateway transaction ID'
    }),
    paymentId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    status: PaymentStatus,
    amount: T.Number({
      minimum: 0,
      description: 'Payment amount'
    }),
    currency: CurrencyCode,
    timestamp: T.String({
      format: 'date-time',
      description: 'Webhook timestamp'
    }),
    signature: T.Optional(T.String({
      description: 'Webhook signature for verification'
    })),
    payload: T.Record(T.String(), T.Any(), {
      description: 'Complete webhook payload'
    }),
    processed: T.Boolean({
      default: false,
      description: 'Whether webhook has been processed'
    }),
    processingAttempts: T.Integer({
      minimum: 0,
      default: 0,
      description: 'Number of processing attempts'
    }),
    lastError: T.Optional(T.String({
      maxLength: 500,
      description: 'Last processing error'
    })),
    createdAt: T.String({
      format: 'date-time'
    }),
    processedAt: T.Optional(T.String({
      format: 'date-time'
    }))
  }, {
    required: ['gateway', 'eventType', 'transactionId', 'status', 'amount', 'currency', 'timestamp', 'payload', 'createdAt'],
    description: 'Payment webhook record'
  })
};

module.exports = PaymentSchemas;