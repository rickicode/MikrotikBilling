// src/schemas/billing.js
/**
 * Mikrotik Billing System - Billing and Invoicing Schemas
 * Comprehensive validation schemas for billing operations with business logic validation
 */

const { Type } = require('@sinclair/typebox');
const T = Type;

const CommonSchemas = require('./common');

/**
 * Invoice Status Enum
 */
const InvoiceStatus = T.Enum(['draft', 'sent', 'paid', 'overdue', 'cancelled', 'refunded'], {
  description: 'Invoice status in the billing lifecycle'
});

/**
 * Payment Status Enum
 */
const PaymentStatus = T.Enum(['pending', 'processing', 'completed', 'failed', 'refunded', 'partially_refunded'], {
  description: 'Payment processing status'
});

/**
 * Billing Cycle Enum
 */
const BillingCycle = T.Enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'], {
  description: 'Billing cycle frequency'
});

/**
 * Invoice Type Enum
 */
const InvoiceType = T.Enum(['subscription', 'usage', 'one_time', 'credit_memo', 'debit_memo'], {
  description: 'Type of invoice being generated'
});

/**
 * Tax Type Enum (Indonesian tax system)
 */
const TaxType = T.Enum(['ppn_11', 'pph_21', 'pph_23', 'pph_4_2', 'ppnbm', 'none'], {
  description: 'Indonesian tax types'
});

/**
 * Billing Schemas
 */
const BillingSchemas = {
  // Invoice base schema
  invoice: T.Object({
    id: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    invoiceNumber: T.String({
      pattern: '^INV-[0-9]{4}-[0-9]{6}$',
      description: 'Invoice number in format INV-YYYY-NNNNNN'
    }),
    customerId: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    type: InvoiceType,
    status: InvoiceStatus,
    issueDate: T.String({
      format: 'date',
      description: 'Invoice issue date in YYYY-MM-DD format'
    }),
    dueDate: T.String({
      format: 'date',
      description: 'Invoice due date in YYYY-MM-DD format'
    }),
    subtotal: T.Number({
      minimum: 0,
      description: 'Subtotal before taxes and discounts'
    }),
    discountAmount: T.Number({
      minimum: 0,
      default: 0,
      description: 'Discount amount applied'
    }),
    taxAmount: T.Number({
      minimum: 0,
      default: 0,
      description: 'Total tax amount'
    }),
    totalAmount: T.Number({
      minimum: 0,
      description: 'Total amount payable'
    }),
    paidAmount: T.Number({
      minimum: 0,
      default: 0,
      description: 'Amount already paid'
    }),
    balanceAmount: T.Number({
      description: 'Remaining balance to be paid'
    }),
    currencyCode: T.String({
      pattern: '^[A-Z]{3}$',
      default: 'IDR',
      description: 'Currency code for the invoice'
    }),
    items: T.Array(T.Object({
      id: T.Optional(T.Union([T.Integer(), T.String()])),
      description: T.String({
        minLength: 1,
        maxLength: 200,
        description: 'Item description'
      }),
      quantity: T.Number({
        minimum: 0,
        description: 'Item quantity'
      }),
      unitPrice: T.Number({
        minimum: 0,
        description: 'Price per unit'
      }),
      totalPrice: T.Number({
        minimum: 0,
        description: 'Total price for this item'
      }),
      itemType: T.Enum(['service', 'product', 'usage', 'discount'], {
        description: 'Type of item being billed'
      }),
      metadata: T.Optional(CommonSchemas.metadataObject)
    }), {
      minItems: 1,
      description: 'Line items in the invoice'
    }),
    taxes: T.Optional(T.Array(T.Object({
      type: TaxType,
      name: T.String({
        minLength: 1,
        maxLength: 100,
        description: 'Tax name description'
      }),
      rate: T.Number({
        minimum: 0,
        maximum: 100,
        description: 'Tax rate percentage'
      }),
      amount: T.Number({
        minimum: 0,
        description: 'Tax amount calculated'
      })
    }), {
      description: 'Tax breakdown for the invoice'
    })),
    notes: T.Optional(T.String({
      maxLength: 1000,
      description: 'Additional notes on the invoice'
    })),
    paymentTerms: T.Optional(T.String({
      maxLength: 500,
      description: 'Payment terms and conditions'
    })),
    metadata: T.Optional(CommonSchemas.metadataObject),
    locationId: T.Optional(T.Union([
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
    required: ['invoiceNumber', 'customerId', 'type', 'status', 'issueDate', 'dueDate', 'subtotal', 'totalAmount', 'items'],
    description: 'Complete invoice record',
    examples: [
      {
        invoiceNumber: 'INV-2024-000123',
        customerId: 1,
        type: 'subscription',
        status: 'sent',
        issueDate: '2024-01-01',
        dueDate: '2024-01-15',
        subtotal: 100000,
        discountAmount: 0,
        taxAmount: 11000,
        totalAmount: 111000,
        paidAmount: 0,
        balanceAmount: 111000,
        currencyCode: 'IDR',
        items: [
          {
            description: 'Internet Monthly Package',
            quantity: 1,
            unitPrice: 100000,
            totalPrice: 100000,
            itemType: 'service'
          }
        ],
        taxes: [
          {
            type: 'ppn_11',
            name: 'PPN 11%',
            rate: 11,
            amount: 11000
          }
        ]
      }
    ]
  }),

  // Create invoice schema
  createInvoice: T.Object({
    customerId: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    type: InvoiceType,
    issueDate: T.String({
      format: 'date',
      description: 'Invoice issue date'
    }),
    dueDate: T.String({
      format: 'date',
      description: 'Invoice due date'
    }),
    items: T.Array(T.Object({
      description: T.String({
        minLength: 1,
        maxLength: 200
      }),
      quantity: T.Number({
        minimum: 0
      }),
      unitPrice: T.Number({
        minimum: 0
      }),
      itemType: T.Enum(['service', 'product', 'usage', 'discount']),
      metadata: T.Optional(CommonSchemas.metadataObject)
    }), {
      minItems: 1
    }),
    currencyCode: T.Optional(T.String({
      pattern: '^[A-Z]{3}$',
      default: 'IDR'
    })),
    discountAmount: T.Optional(T.Number({
      minimum: 0,
      default: 0
    })),
    notes: T.Optional(T.String({
      maxLength: 1000
    })),
    paymentTerms: T.Optional(T.String({
      maxLength: 500
    })),
    metadata: T.Optional(CommonSchemas.metadataObject),
    autoCalculateTax: T.Optional(T.Boolean({
      default: true,
      description: 'Automatically calculate taxes based on tax rules'
    }))
  }, {
    required: ['customerId', 'type', 'issueDate', 'dueDate', 'items'],
    description: 'Schema for creating new invoice',
    examples: [
      {
        customerId: 1,
        type: 'subscription',
        issueDate: '2024-01-01',
        dueDate: '2024-01-15',
        items: [
          {
            description: 'Internet Monthly Package',
            quantity: 1,
            unitPrice: 100000,
            itemType: 'service'
          }
        ]
      }
    ]
  }),

  // Payment schema
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
      description: 'Payment amount'
    }),
    method: T.Enum(['cash', 'transfer', 'credit_card', 'e_wallet', 'bank_transfer', 'cheque', 'other'], {
      description: 'Payment method used'
    }),
    methodDetails: T.Optional(T.Record(T.String(), T.Any(), {
      description: 'Payment method specific details (e.g., bank name, card last 4 digits)'
    })),
    status: PaymentStatus,
    paymentDate: T.String({
      format: 'date',
      description: 'Date when payment was made'
    }),
    referenceNumber: T.Optional(T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Payment reference or transaction ID'
    })),
    description: T.Optional(T.String({
      maxLength: 500,
      description: 'Payment description or notes'
    })),
    processingFee: T.Optional(T.Number({
      minimum: 0,
      default: 0,
      description: 'Processing fee charged'
    })),
    currencyCode: T.String({
      pattern: '^[A-Z]{3}$',
      default: 'IDR',
      description: 'Payment currency'
    }),
    exchangeRate: T.Optional(T.Number({
      minimum: 0,
      default: 1,
      description: 'Exchange rate if different from invoice currency'
    })),
    metadata: T.Optional(CommonSchemas.metadataObject),
    createdAt: T.Optional(T.String({
      format: 'date-time'
    })),
    updatedAt: T.Optional(T.String({
      format: 'date-time'
    }))
  }, {
    required: ['paymentNumber', 'invoiceId', 'customerId', 'amount', 'method', 'status', 'paymentDate'],
    description: 'Payment record details',
    examples: [
      {
        paymentNumber: 'PAY-2024-000123',
        invoiceId: 1,
        customerId: 1,
        amount: 111000,
        method: 'transfer',
        status: 'completed',
        paymentDate: '2024-01-10',
        referenceNumber: 'TRX-1234567890',
        currencyCode: 'IDR'
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
      description: 'Payment amount'
    }),
    method: T.Enum(['cash', 'transfer', 'credit_card', 'e_wallet', 'bank_transfer', 'cheque', 'other']),
    paymentDate: T.String({
      format: 'date'
    }),
    referenceNumber: T.Optional(T.String({
      minLength: 1,
      maxLength: 100
    })),
    description: T.Optional(T.String({
      maxLength: 500
    })),
    methodDetails: T.Optional(T.Record(T.String(), T.Any())),
    metadata: T.Optional(CommonSchemas.metadataObject)
  }, {
    required: ['invoiceId', 'amount', 'method', 'paymentDate'],
    description: 'Schema for creating new payment',
    examples: [
      {
        invoiceId: 1,
        amount: 111000,
        method: 'transfer',
        paymentDate: '2024-01-10',
        referenceNumber: 'TRX-1234567890'
      }
    ]
  }),

  // Billing configuration schema
  billingConfig: T.Object({
    id: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    name: T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Configuration name'
    }),
    currencyCode: T.String({
      pattern: '^[A-Z]{3}$',
      default: 'IDR',
      description: 'Default currency'
    }),
    taxConfiguration: T.Object({
      enableTax: T.Boolean({
        default: true,
        description: 'Enable tax calculations'
      }),
      defaultTaxType: T.Optional(TaxType),
      taxRates: T.Record(T.String(), T.Number({
        minimum: 0,
        maximum: 100
      }), {
        description: 'Tax rates by type'
      }),
      taxNumber: T.Optional(T.String({
        pattern: '^[0-9]{15}$',
        description: 'Company tax identification number'
      }))
    }, {
      description: 'Tax configuration settings'
    }),
    invoiceConfiguration: T.Object({
      prefix: T.String({
        pattern: '^[A-Z]{3,5}$',
        default: 'INV',
        description: 'Invoice number prefix'
      }),
      numberLength: T.Integer({
        minimum: 4,
        maximum: 10,
        default: 6,
        description: 'Invoice number length'
      }),
      autoNumbering: T.Boolean({
        default: true,
        description: 'Enable automatic invoice numbering'
      }),
      defaultDueDays: T.Integer({
        minimum: 0,
        maximum: 365,
        default: 14,
        description: 'Default due days for invoices'
      }),
      lateFeePercentage: T.Number({
        minimum: 0,
        maximum: 100,
        default: 2,
        description: 'Late fee percentage per month'
      })
    }, {
      description: 'Invoice generation settings'
    }),
    paymentConfiguration: T.Object({
      prefix: T.String({
        pattern: '^[A-Z]{3,5}$',
        default: 'PAY',
        description: 'Payment number prefix'
      }),
      numberLength: T.Integer({
        minimum: 4,
        maximum: 10,
        default: 6,
        description: 'Payment number length'
      }),
      autoNumbering: T.Boolean({
        default: true,
        description: 'Enable automatic payment numbering'
      }),
      allowedMethods: T.Array(T.Enum(['cash', 'transfer', 'credit_card', 'e_wallet', 'bank_transfer', 'cheque', 'other']), {
        description: 'Allowed payment methods'
      }),
      defaultMethod: T.Enum(['cash', 'transfer', 'credit_card', 'e_wallet', 'bank_transfer', 'cheque', 'other'], {
        description: 'Default payment method'
      })
    }, {
      description: 'Payment processing settings'
    }),
    notificationConfiguration: T.Object({
      enableInvoiceReminder: T.Boolean({
        default: true,
        description: 'Enable invoice due reminders'
      }),
      reminderDays: T.Array(T.Integer({
        minimum: 0,
        maximum: 365
      }), {
        description: 'Days before due to send reminders'
      }),
      enableOverdueNotice: T.Boolean({
        default: true,
        description: 'Enable overdue payment notices'
      }),
      overdueFrequency: T.Enum(['daily', 'weekly', 'monthly'], {
        default: 'weekly',
        description: 'Overdue notice frequency'
      })
    }, {
      description: 'Notification settings'
    }),
    isActive: T.Boolean({
      default: true,
      description: 'Configuration active status'
    }),
    metadata: T.Optional(CommonSchemas.metadataObject)
  }, {
    required: ['name'],
    description: 'Billing system configuration',
    examples: [
      {
        name: 'Default Configuration',
        currencyCode: 'IDR',
        taxConfiguration: {
          enableTax: true,
          defaultTaxType: 'ppn_11',
          taxRates: {
            'ppn_11': 11
          }
        },
        invoiceConfiguration: {
          prefix: 'INV',
          numberLength: 6,
          autoNumbering: true,
          defaultDueDays: 14
        },
        paymentConfiguration: {
          prefix: 'PAY',
          numberLength: 6,
          autoNumbering: true,
          allowedMethods: ['cash', 'transfer', 'e_wallet']
        }
      }
    ]
  }),

  // Invoice search and filter schema
  invoiceSearchQuery: T.Object({
    search: T.Optional(T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Search invoice number or customer name'
    })),
    customerId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    status: T.Optional(InvoiceStatus),
    type: T.Optional(InvoiceType),
    issueDateFrom: T.Optional(T.String({
      format: 'date'
    })),
    issueDateTo: T.Optional(T.String({
      format: 'date'
    })),
    dueDateFrom: T.Optional(T.String({
      format: 'date'
    })),
    dueDateTo: T.Optional(T.String({
      format: 'date'
    })),
    amountMin: T.Optional(T.Number({
      minimum: 0
    })),
    amountMax: T.Optional(T.Number({
      minimum: 0
    })),
    isOverdue: T.Optional(T.Boolean({
      description: 'Filter overdue invoices only'
    })),
    hasBalance: T.Optional(T.Boolean({
      description: 'Filter invoices with remaining balance'
    })),
    currencyCode: T.Optional(T.String({
      pattern: '^[A-Z]{3}$'
    })),
    locationId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    ...CommonSchemas.paginationQuery.properties
  }, {
    description: 'Invoice search and filter parameters',
    examples: [
      {
        status: 'overdue',
        customerId: 1,
        issueDateFrom: '2024-01-01',
        page: 1,
        limit: 20
      }
    ]
  }),

  // Payment search and filter schema
  paymentSearchQuery: T.Object({
    search: T.Optional(T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Search payment number or reference'
    })),
    invoiceId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    customerId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    status: T.Optional(PaymentStatus),
    method: T.Optional(T.Enum(['cash', 'transfer', 'credit_card', 'e_wallet', 'bank_transfer', 'cheque', 'other'])),
    paymentDateFrom: T.Optional(T.String({
      format: 'date'
    })),
    paymentDateTo: T.Optional(T.String({
      format: 'date'
    })),
    amountMin: T.Optional(T.Number({
      minimum: 0
    })),
    amountMax: T.Optional(T.Number({
      minimum: 0
    })),
    currencyCode: T.Optional(T.String({
      pattern: '^[A-Z]{3}$'
    })),
    locationId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    ...CommonSchemas.paginationQuery.properties
  }, {
    description: 'Payment search and filter parameters'
  }),

  // Billing statistics schema
  billingStats: T.Object({
    totalInvoices: T.Integer({
      minimum: 0,
      description: 'Total number of invoices'
    }),
    totalInvoicesAmount: T.Number({
      description: 'Total amount of all invoices'
    }),
    paidInvoices: T.Integer({
      minimum: 0,
      description: 'Number of paid invoices'
    }),
    paidInvoicesAmount: T.Number({
      description: 'Total amount of paid invoices'
    }),
    unpaidInvoices: T.Integer({
      minimum: 0,
      description: 'Number of unpaid invoices'
    }),
    unpaidInvoicesAmount: T.Number({
      description: 'Total amount of unpaid invoices'
    }),
    overdueInvoices: T.Integer({
      minimum: 0,
      description: 'Number of overdue invoices'
    }),
    overdueInvoicesAmount: T.Number({
      description: 'Total amount of overdue invoices'
    }),
    totalPayments: T.Integer({
      minimum: 0,
      description: 'Total number of payments'
    }),
    totalPaymentsAmount: T.Number({
      description: 'Total amount of all payments'
    }),
    averageInvoiceAmount: T.Number({
      description: 'Average invoice amount'
    }),
    averagePaymentAmount: T.Number({
      description: 'Average payment amount'
    }),
    revenueThisMonth: T.Number({
      description: 'Revenue generated this month'
    }),
    revenueLastMonth: T.Number({
      description: 'Revenue generated last month'
    }),
    revenueGrowth: T.Number({
      description: 'Revenue growth percentage'
    }),
    invoicesByStatus: T.Record(T.String(), T.Integer(), {
      description: 'Invoice count by status'
    }),
    paymentsByMethod: T.Record(T.String(), T.Integer(), {
      description: 'Payment count by method'
    }),
    monthlyRevenue: T.Array(T.Object({
      month: T.String(),
      revenue: T.Number(),
      invoiceCount: T.Integer()
    }), {
      maxItems: 12,
      description: 'Monthly revenue for the last 12 months'
    })
  }, {
    description: 'Billing system statistics and analytics'
  }),

  // Tax calculation schema
  taxCalculation: T.Object({
    amount: T.Number({
      minimum: 0,
      description: 'Base amount before tax'
    }),
    taxType: TaxType,
    taxRate: T.Number({
      minimum: 0,
      maximum: 100,
      description: 'Tax rate percentage'
    }),
    taxAmount: T.Number({
      description: 'Calculated tax amount'
    }),
    totalAmount: T.Number({
      description: 'Total amount including tax'
    }),
    isTaxIncluded: T.Boolean({
      description: 'Whether tax is included in the base amount'
    }),
    currencyCode: T.String({
      pattern: '^[A-Z]{3}$',
      default: 'IDR'
    })
  }, {
    required: ['amount', 'taxType', 'taxRate'],
    description: 'Tax calculation request and result',
    examples: [
      {
        amount: 100000,
        taxType: 'ppn_11',
        taxRate: 11,
        taxAmount: 11000,
        totalAmount: 111000,
        isTaxIncluded: false,
        currencyCode: 'IDR'
      }
    ]
  })
};

module.exports = BillingSchemas;