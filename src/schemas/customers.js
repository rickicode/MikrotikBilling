// src/schemas/customers.js
/**
 * Mikrotik Billing System - Customer Management Schemas
 * Comprehensive validation schemas for customer data with Indonesian business rules
 */

const { Type } = require('@sinclair/typebox');
const T = Type;

const CommonSchemas = require('./common');

/**
 * Customer Type Enum
 */
const CustomerType = T.Enum(['individual', 'business'], {
  description: 'Customer type classification'
});

/**
 * Customer Status Enum
 */
const CustomerStatus = T.Enum(['active', 'inactive', 'suspended', 'blacklisted'], {
  description: 'Customer account status'
});

/**
 * Gender Enum (Indonesian standards)
 */
const Gender = T.Enum(['male', 'female', 'other'], {
  description: 'Gender identity'
});

/**
 * Religion Enum (Indonesian official religions)
 */
const Religion = T.Enum(['islam', 'christian', 'catholic', 'hindu', 'buddha', 'confucian', 'other'], {
  description: 'Religion (Indonesian official recognition)'
});

/**
 * Customer Schemas
 */
const CustomerSchemas = {
  // Base customer schema
  customer: T.Object({
    id: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    type: CustomerType,
    name: CommonSchemas.name,
    email: T.Optional(CommonSchemas.email),
    phone: T.Optional(CommonSchemas.phone),
    phone2: T.Optional(CommonSchemas.phone),
    address: T.Optional(CommonSchemas.address),
    city: T.Optional(T.String({
      minLength: 2,
      maxLength: 50,
      description: 'City name'
    })),
    province: T.Optional(T.String({
      minLength: 2,
      maxLength: 50,
      description: 'Province name'
    })),
    postalCode: T.Optional(T.String({
      pattern: '^[0-9]{5}$',
      description: 'Indonesian postal code (5 digits)'
    })),
    ktpNumber: T.Optional(CommonSchemas.ktpNumber),
    ktpImage: T.Optional(T.String({
      format: 'uri',
      description: 'KTP image file URL or path'
    })),
    birthDate: T.Optional(T.String({
      format: 'date',
      description: 'Date of birth in YYYY-MM-DD format'
    })),
    gender: T.Optional(Gender),
    religion: T.Optional(Religion),
    companyName: T.Optional(T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Company name (for business customers)'
    })),
    companyRegistrationNumber: T.Optional(T.String({
      minLength: 1,
      maxLength: 50,
      description: 'Company registration number (NPWP/SIUP)'
    })),
    taxId: T.Optional(T.String({
      pattern: '^[0-9]{15}$',
      description: 'Indonesian Tax ID (NPWP) - 15 digits'
    })),
    balance: T.Number({
      minimum: -999999999,
      maximum: 999999999,
      default: 0,
      description: 'Customer account balance'
    }),
    creditLimit: T.Optional(T.Number({
      minimum: 0,
      maximum: 999999999,
      description: 'Credit limit for the customer'
    })),
    status: CustomerStatus,
    notes: T.Optional(T.String({
      maxLength: 1000,
      description: 'Additional notes about the customer'
    })),
    tags: T.Optional(T.Array(T.String({
      minLength: 1,
      maxLength: 50
    }), {
      maxItems: 10,
      description: 'Customer tags for categorization'
    })),
    metadata: T.Optional(CommonSchemas.metadataObject),
    locationId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ], {
      description: 'Associated Mikrotik location ID'
    })),
    referredBy: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ], {
      description: 'Customer ID who referred this customer'
    })),
    registrationSource: T.Optional(T.Enum([
      'website', 'mobile_app', 'office', 'phone', 'referral', 'other'
    ], {
      description: 'How the customer was registered'
    }))
  }, {
    description: 'Complete customer record',
    examples: [
      {
        type: 'individual',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+628123456789',
        address: 'Jl. Sudirman No. 123',
        city: 'Jakarta',
        province: 'DKI Jakarta',
        postalCode: '12345',
        ktpNumber: '1234567890123456',
        birthDate: '1990-01-01',
        gender: 'male',
        balance: 0,
        status: 'active'
      }
    ]
  }),

  // Customer creation schema
  createCustomer: T.Object({
    type: CustomerType,
    name: CommonSchemas.name,
    email: T.Optional(CommonSchemas.email),
    phone: T.Optional(CommonSchemas.phone),
    phone2: T.Optional(CommonSchemas.phone),
    address: T.Optional(CommonSchemas.address),
    city: T.Optional(T.String({
      minLength: 2,
      maxLength: 50
    })),
    province: T.Optional(T.String({
      minLength: 2,
      maxLength: 50
    })),
    postalCode: T.Optional(T.String({
      pattern: '^[0-9]{5}$'
    })),
    ktpNumber: T.Optional(CommonSchemas.ktpNumber),
    birthDate: T.Optional(T.String({
      format: 'date'
    })),
    gender: T.Optional(Gender),
    companyName: T.Optional(T.String({
      minLength: 1,
      maxLength: 100
    })),
    companyRegistrationNumber: T.Optional(T.String({
      minLength: 1,
      maxLength: 50
    })),
    taxId: T.Optional(T.String({
      pattern: '^[0-9]{15}$'
    })),
    creditLimit: T.Optional(T.Number({
      minimum: 0,
      maximum: 999999999
    })),
    notes: T.Optional(T.String({
      maxLength: 1000
    })),
    tags: T.Optional(T.Array(T.String({
      minLength: 1,
      maxLength: 50
    }), {
      maxItems: 10
    })),
    locationId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    referredBy: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    registrationSource: T.Optional(T.Enum([
      'website', 'mobile_app', 'office', 'phone', 'referral', 'other'
    ]))
  }, {
    required: ['type', 'name'],
    description: 'Schema for creating new customer',
    examples: [
      {
        type: 'individual',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+628123456789',
        address: 'Jl. Sudirman No. 123'
      }
    ]
  }),

  // Customer update schema
  updateCustomer: T.Object({
    name: T.Optional(CommonSchemas.name),
    email: T.Optional(CommonSchemas.email),
    phone: T.Optional(CommonSchemas.phone),
    phone2: T.Optional(CommonSchemas.phone),
    address: T.Optional(CommonSchemas.address),
    city: T.Optional(T.String({
      minLength: 2,
      maxLength: 50
    })),
    province: T.Optional(T.String({
      minLength: 2,
      maxLength: 50
    })),
    postalCode: T.Optional(T.String({
      pattern: '^[0-9]{5}$'
    })),
    ktpNumber: T.Optional(CommonSchemas.ktpNumber),
    birthDate: T.Optional(T.String({
      format: 'date'
    })),
    gender: T.Optional(Gender),
    companyName: T.Optional(T.String({
      minLength: 1,
      maxLength: 100
    })),
    companyRegistrationNumber: T.Optional(T.String({
      minLength: 1,
      maxLength: 50
    })),
    taxId: T.Optional(T.String({
      pattern: '^[0-9]{15}$'
    })),
    creditLimit: T.Optional(T.Number({
      minimum: 0,
      maximum: 999999999
    })),
    status: T.Optional(CustomerStatus),
    notes: T.Optional(T.String({
      maxLength: 1000
    })),
    tags: T.Optional(T.Array(T.String({
      minLength: 1,
      maxLength: 50
    }), {
      maxItems: 10
    })),
    locationId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]))
  }, {
    description: 'Schema for updating existing customer',
    examples: [
      {
        name: 'John Doe Updated',
        phone: '+628123456789',
        status: 'active'
      }
    ]
  }),

  // Customer balance adjustment schema
  balanceAdjustment: T.Object({
    customerId: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    amount: T.Number({
      description: 'Adjustment amount (positive for credit, negative for debit)'
    }),
    type: T.Enum(['credit', 'debit'], {
      description: 'Adjustment type'
    }),
    reason: T.String({
      minLength: 5,
      maxLength: 500,
      description: 'Reason for balance adjustment'
    }),
    reference: T.Optional(T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Reference number or invoice ID'
    })),
    metadata: T.Optional(CommonSchemas.metadataObject)
  }, {
    required: ['customerId', 'amount', 'type', 'reason'],
    description: 'Schema for customer balance adjustments',
    examples: [
      {
        customerId: 1,
        amount: 50000,
        type: 'credit',
        reason: 'Payment for invoice #INV-001',
        reference: 'INV-001'
      }
    ]
  }),

  // Customer search and filter schemas
  customerSearchQuery: T.Object({
    search: T.Optional(T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Search term for customer name, email, or phone'
    })),
    type: T.Optional(CustomerType),
    status: T.Optional(CustomerStatus),
    city: T.Optional(T.String({
      minLength: 2,
      maxLength: 50
    })),
    province: T.Optional(T.String({
      minLength: 2,
      maxLength: 50
    })),
    hasBalance: T.Optional(T.Boolean({
      description: 'Filter customers with non-zero balance'
    })),
    balanceMin: T.Optional(T.Number({
      minimum: 0,
      description: 'Minimum balance filter'
    })),
    balanceMax: T.Optional(T.Number({
      minimum: 0,
      description: 'Maximum balance filter'
    })),
    registrationDateFrom: T.Optional(T.String({
      format: 'date',
      description: 'Filter customers registered from this date'
    })),
    registrationDateTo: T.Optional(T.String({
      format: 'date',
      description: 'Filter customers registered to this date'
    })),
    tags: T.Optional(T.Array(T.String({
      minLength: 1,
      maxLength: 50
    }), {
      maxItems: 5
    })),
    locationId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    ...CommonSchemas.paginationQuery.properties
  }, {
    description: 'Customer search and filter parameters',
    examples: [
      {
        search: 'John',
        type: 'individual',
        status: 'active',
        city: 'Jakarta',
        page: 1,
        limit: 20
      }
    ]
  }),

  // Customer statistics schema
  customerStats: T.Object({
    totalCustomers: T.Integer({
      minimum: 0,
      description: 'Total number of customers'
    }),
    activeCustomers: T.Integer({
      minimum: 0,
      description: 'Number of active customers'
    }),
    inactiveCustomers: T.Integer({
      minimum: 0,
      description: 'Number of inactive customers'
    }),
    newCustomersThisMonth: T.Integer({
      minimum: 0,
      description: 'Number of new customers this month'
    }),
    totalBalance: T.Number({
      description: 'Total balance across all customers'
    }),
    averageBalance: T.Number({
      description: 'Average customer balance'
    }),
    customersByType: T.Record(T.String(), T.Integer(), {
      description: 'Customer count by type'
    }),
    customersByStatus: T.Record(T.String(), T.Integer(), {
      description: 'Customer count by status'
    }),
    topCustomersByBalance: T.Array(T.Object({
      customerId: T.Union([T.Integer(), T.String()]),
      customerName: T.String(),
      balance: T.Number()
    }), {
      maxItems: 10,
      description: 'Top 10 customers by balance'
    })
  }, {
    description: 'Customer statistics and analytics data'
  }),

  // Customer bulk operations
  bulkCustomerOperation: T.Object({
    customerIds: T.Array(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]), {
      minItems: 1,
      maxItems: 100,
      description: 'List of customer IDs for bulk operation'
    }),
    operation: T.Enum(['activate', 'deactivate', 'suspend', 'delete', 'export'], {
      description: 'Type of bulk operation'
    }),
    parameters: T.Optional(T.Record(T.String(), T.Any(), {
      description: 'Additional parameters for the operation'
    }))
  }, {
    required: ['customerIds', 'operation'],
    description: 'Schema for bulk customer operations',
    examples: [
      {
        customerIds: [1, 2, 3],
        operation: 'activate'
      }
    ]
  }),

  // Customer export schema
  customerExport: T.Object({
    format: T.Enum(['csv', 'xlsx', 'pdf'], {
      default: 'csv',
      description: 'Export file format'
    }),
    filters: T.Optional(T.Object({
      search: T.Optional(T.String({
        minLength: 1,
        maxLength: 100,
        description: 'Search term for customer name, email, or phone'
      })),
      type: T.Optional(T.Enum(['individual', 'business'])),
      status: T.Optional(T.Enum(['active', 'inactive', 'suspended', 'blacklisted'])),
      city: T.Optional(T.String({
        minLength: 2,
        maxLength: 50
      })),
      province: T.Optional(T.String({
        minLength: 2,
        maxLength: 50
      })),
      hasBalance: T.Optional(T.Boolean({
        description: 'Filter customers with non-zero balance'
      })),
      balanceMin: T.Optional(T.Number({
        minimum: 0,
        description: 'Minimum balance filter'
      })),
      balanceMax: T.Optional(T.Number({
        minimum: 0,
        description: 'Maximum balance filter'
      })),
      registrationDateFrom: T.Optional(T.String({
        format: 'date',
        description: 'Filter customers registered from this date'
      })),
      registrationDateTo: T.Optional(T.String({
        format: 'date',
        description: 'Filter customers registered to this date'
      })),
      tags: T.Optional(T.Array(T.String({
        minLength: 1,
        maxLength: 50
      }), {
        maxItems: 5
      })),
      locationId: T.Optional(T.Union([
        T.Integer({ minimum: 1 }),
        T.String({ pattern: CommonSchemas.UUIDPattern })
      ]))
    })),
    fields: T.Optional(T.Array(T.Enum([
      'id', 'type', 'name', 'email', 'phone', 'address', 'city',
      'province', 'postalCode', 'ktpNumber', 'birthDate', 'gender',
      'balance', 'status', 'createdAt', 'updatedAt'
    ]), {
      description: 'Fields to include in export'
    })),
    includeHeaders: T.Optional(T.Boolean({
      default: true,
      description: 'Include column headers in export'
    }))
  }, {
    description: 'Schema for customer data export',
    examples: [
      {
        format: 'csv',
        filters: {
          status: 'active',
          city: 'Jakarta'
        },
        fields: ['id', 'name', 'email', 'phone', 'balance']
      }
    ]
  })
};

module.exports = CustomerSchemas;