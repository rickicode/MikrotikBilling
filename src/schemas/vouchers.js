// src/schemas/vouchers.js
/**
 * Mikrotik Billing System - Voucher Management Schemas
 * Comprehensive validation schemas for voucher generation and management with Mikrotik integration
 */

const { Type } = require('@sinclair/typebox');
const T = Type;

const CommonSchemas = require('./common');

/**
 * Voucher Status Enum
 */
const VoucherStatus = T.Enum(['active', 'used', 'expired', 'disabled'], {
  description: 'Voucher status in the lifecycle'
});

/**
 * Voucher Type Enum
 */
const VoucherType = T.Enum(['hotspot', 'pppoe', 'universal'], {
  description: 'Type of voucher service'
});

/**
 * Time Unit Enum
 */
const TimeUnit = T.Enum(['seconds', 'minutes', 'hours', 'days', 'weeks', 'months'], {
  description: 'Time unit for voucher duration'
});

/**
 * Voucher Generation Method Enum
 */
const GenerationMethod = T.Enum(['random', 'sequential', 'custom'], {
  description: 'Method for generating voucher codes'
});

/**
 * Voucher Schemas
 */
const VoucherSchemas = {
  // Base voucher schema
  voucher: T.Object({
    id: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    code: T.String({
      minLength: 3,
      maxLength: 31,
      pattern: '^[a-zA-Z0-9_-]+$',
      description: 'Voucher access code (Mikrotik username format)'
    }),
    password: T.Optional(T.String({
      minLength: 1,
      maxLength: 31,
      description: 'Voucher password (if required)'
    })),
    type: VoucherType,
    status: VoucherStatus,
    profileId: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    profileName: T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Mikrotik profile name'
    }),
    timeLimit: T.Optional(T.Number({
      minimum: 0,
      description: 'Time limit in specified unit'
    })),
    timeUnit: T.Optional(TimeUnit),
    dataLimit: T.Optional(T.Number({
      minimum: 0,
      description: 'Data limit in bytes'
    })),
    price: T.Number({
      minimum: 0,
      description: 'Voucher selling price'
    }),
    cost: T.Number({
      minimum: 0,
      description: 'Voucher cost price'
    }),
    currencyCode: T.String({
      pattern: '^[A-Z]{3}$',
      default: 'IDR',
      description: 'Currency code'
    }),
    validFrom: T.String({
      format: 'date-time',
      description: 'Voucher validity start date'
    }),
    validUntil: T.String({
      format: 'date-time',
      description: 'Voucher expiry date'
    }),
    firstLoginAt: T.Optional(T.String({
      format: 'date-time',
      description: 'First login timestamp'
    })),
    lastLoginAt: T.Optional(T.String({
      format: 'date-time',
      description: 'Last login timestamp'
    })),
    usageCount: T.Integer({
      minimum: 0,
      default: 0,
      description: 'Number of times voucher has been used'
    }),
    maxUsage: T.Optional(T.Integer({
      minimum: 1,
      description: 'Maximum allowed usage count'
    })),
    customerId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    customerName: T.Optional(T.String({
      maxLength: 100,
      description: 'Customer name if assigned'
    })),
    mikrotikId: T.Optional(T.String({
      description: 'Mikrotik user identifier'
    })),
    mikrotikComment: T.Optional(CommonSchemas.mikrotikComment),
    locationId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    locationName: T.Optional(T.String({
      maxLength: 100,
      description: 'Location name'
    })),
    notes: T.Optional(T.String({
      maxLength: 500,
      description: 'Additional notes'
    })),
    metadata: T.Optional(CommonSchemas.metadataObject),
    createdAt: T.Optional(T.String({
      format: 'date-time'
    })),
    updatedAt: T.Optional(T.String({
      format: 'date-time'
    }))
  }, {
    required: ['code', 'type', 'status', 'profileId', 'profileName', 'price', 'cost', 'validFrom', 'validUntil'],
    description: 'Complete voucher record',
    examples: [
      {
        code: 'VCH-12345678',
        type: 'hotspot',
        status: 'active',
        profileId: 1,
        profileName: 'WiFi-Premium',
        price: 10000,
        cost: 8000,
        currencyCode: 'IDR',
        validFrom: '2024-01-01T00:00:00Z',
        validUntil: '2024-12-31T23:59:59Z',
        mikrotikComment: 'VOUCHER_SYSTEM|10000||1735689599'
      }
    ]
  }),

  // Create voucher schema
  createVoucher: T.Object({
    profileId: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    price: T.Number({
      minimum: 0,
      description: 'Voucher selling price'
    }),
    cost: T.Optional(T.Number({
      minimum: 0,
      description: 'Voucher cost price (defaults to profile cost)'
    })),
    validFrom: T.Optional(T.String({
      format: 'date-time',
      default: () => new Date().toISOString(),
      description: 'Voucher validity start date'
    })),
    validUntil: T.Optional(T.String({
      format: 'date-time',
      description: 'Voucher expiry date (defaults to profile validity)'
    })),
    customerId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    locationId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    notes: T.Optional(T.String({
      maxLength: 500
    })),
    metadata: T.Optional(CommonSchemas.metadataObject)
  }, {
    required: ['profileId', 'price'],
    description: 'Schema for creating single voucher',
    examples: [
      {
        profileId: 1,
        price: 10000,
        validUntil: '2024-12-31T23:59:59Z'
      }
    ]
  }),

  // Bulk voucher generation schema
  generateVouchers: T.Object({
    profileId: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    quantity: T.Integer({
      minimum: 1,
      maximum: 1000,
      description: 'Number of vouchers to generate'
    }),
    prefix: T.Optional(T.String({
      minLength: 1,
      maxLength: 10,
      pattern: '^[a-zA-Z0-9_-]*$',
      description: 'Voucher code prefix'
    })),
    suffix: T.Optional(T.String({
      minLength: 1,
      maxLength: 10,
      pattern: '^[a-zA-Z0-9_-]*$',
      description: 'Voucher code suffix'
    })),
    codeLength: T.Optional(T.Integer({
      minimum: 3,
      maximum: 31,
      default: 8,
      description: 'Voucher code length (excluding prefix/suffix)'
    })),
    generationMethod: T.Optional(GenerationMethod),
    customCodes: T.Optional(T.Array(T.String({
      minLength: 3,
      maxLength: 31,
      pattern: '^[a-zA-Z0-9_-]+$'
    }), {
      maxItems: 1000,
      description: 'Custom voucher codes (required if method is custom)'
    })),
    price: T.Number({
      minimum: 0,
      description: 'Voucher selling price'
    }),
    cost: T.Optional(T.Number({
      minimum: 0,
      description: 'Voucher cost price'
    })),
    validFrom: T.Optional(T.String({
      format: 'date-time',
      default: () => new Date().toISOString(),
      description: 'Voucher validity start date'
    })),
    validUntil: T.Optional(T.String({
      format: 'date-time',
      description: 'Voucher expiry date'
    })),
    locationId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    generatePasswords: T.Optional(T.Boolean({
      default: false,
      description: 'Generate random passwords for vouchers'
    })),
    passwordLength: T.Optional(T.Integer({
      minimum: 4,
      maximum: 31,
      default: 8,
      description: 'Password length (if generating passwords)'
    })),
    notes: T.Optional(T.String({
      maxLength: 500
    })),
    metadata: T.Optional(CommonSchemas.metadataObject),
    createInMikrotik: T.Optional(T.Boolean({
      default: true,
      description: 'Create vouchers in Mikrotik immediately'
    })),
    batchId: T.Optional(T.String({
      minLength: 1,
      maxLength: 50,
      description: 'Batch identifier for tracking'
    }))
  }, {
    required: ['profileId', 'quantity', 'price'],
    description: 'Schema for bulk voucher generation',
    examples: [
      {
        profileId: 1,
        quantity: 100,
        prefix: 'VCH',
        price: 10000,
        validUntil: '2024-12-31T23:59:59Z',
        batchId: 'BATCH-2024-001'
      }
    ]
  }),

  // Voucher update schema
  updateVoucher: T.Object({
    price: T.Optional(T.Number({
      minimum: 0
    })),
    cost: T.Optional(T.Number({
      minimum: 0
    })),
    status: T.Optional(VoucherStatus),
    validUntil: T.Optional(T.String({
      format: 'date-time'
    })),
    customerId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    notes: T.Optional(T.String({
      maxLength: 500
    })),
    metadata: T.Optional(CommonSchemas.metadataObject)
  }, {
    description: 'Schema for updating existing voucher'
  }),

  // Voucher search and filter schema
  voucherSearchQuery: T.Object({
    search: T.Optional(T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Search voucher code or profile name'
    })),
    type: T.Optional(VoucherType),
    status: T.Optional(VoucherStatus),
    profileId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    customerId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    locationId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    priceMin: T.Optional(T.Number({
      minimum: 0
    })),
    priceMax: T.Optional(T.Number({
      minimum: 0
    })),
    createdFrom: T.Optional(T.String({
      format: 'date-time'
    })),
    createdTo: T.Optional(T.String({
      format: 'date-time'
    })),
    validFrom: T.Optional(T.String({
      format: 'date-time'
    })),
    validUntil: T.Optional(T.String({
      format: 'date-time'
    })),
    isExpired: T.Optional(T.Boolean({
      description: 'Filter expired vouchers'
    })),
    batchId: T.Optional(T.String({
      minLength: 1,
      maxLength: 50
    })),
    ...CommonSchemas.paginationQuery.properties
  }, {
    description: 'Voucher search and filter parameters',
    examples: [
      {
        status: 'active',
        profileId: 1,
        priceMin: 5000,
        priceMax: 20000,
        page: 1,
        limit: 20
      }
    ]
  }),

  // Voucher profile schema
  voucherProfile: T.Object({
    id: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    name: T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Profile name'
    }),
    type: VoucherType,
    description: T.String({
      maxLength: 500,
      description: 'Profile description'
    }),
    timeLimit: T.Optional(T.Number({
      minimum: 0,
      description: 'Time limit'
    })),
    timeUnit: T.Optional(TimeUnit),
    dataLimit: T.Optional(T.Number({
      minimum: 0,
      description: 'Data limit in bytes'
    })),
    cost: T.Number({
      minimum: 0,
      description: 'Default cost price'
    }),
    recommendedPrice: T.Optional(T.Number({
      minimum: 0,
      description: 'Recommended selling price'
    })),
    validityDays: T.Optional(T.Integer({
      minimum: 1,
      maximum: 3650,
      description: 'Default validity period in days'
    })),
    mikrotikProfileName: T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Mikrotik profile name'
    }),
    mikrotikProfileId: T.Optional(T.String({
      description: 'Mikrotik profile identifier'
    })),
    isActive: T.Boolean({
      default: true,
      description: 'Profile active status'
    }),
    locationId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    locationSpecific: T.Boolean({
      default: false,
      description: 'Profile is location-specific'
    }),
    maxConcurrentUsers: T.Optional(T.Integer({
      minimum: 1,
      description: 'Maximum concurrent users'
    })),
    rateLimit: T.Optional(T.Object({
      upload: T.Number({
        minimum: 0,
        description: 'Upload rate limit in kbps'
      }),
      download: T.Number({
        minimum: 0,
        description: 'Download rate limit in kbps'
      })
    }, {
      description: 'Rate limit configuration'
    })),
    metadata: T.Optional(CommonSchemas.metadataObject),
    createdAt: T.Optional(T.String({
      format: 'date-time'
    })),
    updatedAt: T.Optional(T.String({
      format: 'date-time'
    }))
  }, {
    required: ['name', 'type', 'description', 'cost', 'mikrotikProfileName'],
    description: 'Voucher profile configuration',
    examples: [
      {
        name: 'WiFi Premium 1 Hour',
        type: 'hotspot',
        description: '1 hour premium WiFi access',
        timeLimit: 1,
        timeUnit: 'hours',
        cost: 8000,
        recommendedPrice: 10000,
        validityDays: 30,
        mikrotikProfileName: 'wifi-premium-1h',
        isActive: true
      }
    ]
  }),

  // Create voucher profile schema
  createVoucherProfile: T.Object({
    name: T.String({
      minLength: 1,
      maxLength: 100
    }),
    type: VoucherType,
    description: T.String({
      maxLength: 500
    }),
    timeLimit: T.Optional(T.Number({
      minimum: 0
    })),
    timeUnit: T.Optional(TimeUnit),
    dataLimit: T.Optional(T.Number({
      minimum: 0
    })),
    cost: T.Number({
      minimum: 0
    }),
    recommendedPrice: T.Optional(T.Number({
      minimum: 0
    })),
    validityDays: T.Optional(T.Integer({
      minimum: 1,
      maximum: 3650
    })),
    mikrotikProfileName: T.String({
      minLength: 1,
      maxLength: 100
    }),
    locationId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    locationSpecific: T.Optional(T.Boolean({
      default: false
    })),
    maxConcurrentUsers: T.Optional(T.Integer({
      minimum: 1
    })),
    rateLimit: T.Optional(T.Object({
      upload: T.Number({
        minimum: 0
      }),
      download: T.Number({
        minimum: 0
      })
    })),
    metadata: T.Optional(CommonSchemas.metadataObject)
  }, {
    required: ['name', 'type', 'description', 'cost', 'mikrotikProfileName'],
    description: 'Schema for creating voucher profile'
  }),

  // Voucher usage statistics schema
  voucherStats: T.Object({
    totalVouchers: T.Integer({
      minimum: 0,
      description: 'Total number of vouchers'
    }),
    activeVouchers: T.Integer({
      minimum: 0,
      description: 'Number of active vouchers'
    }),
    usedVouchers: T.Integer({
      minimum: 0,
      description: 'Number of used vouchers'
    }),
    expiredVouchers: T.Integer({
      minimum: 0,
      description: 'Number of expired vouchers'
    }),
    vouchersGeneratedToday: T.Integer({
      minimum: 0,
      description: 'Vouchers generated today'
    }),
    vouchersUsedToday: T.Integer({
      minimum: 0,
      description: 'Vouchers used today'
    }),
    totalRevenue: T.Number({
      description: 'Total revenue from vouchers'
    }),
    totalCost: T.Number({
      description: 'Total cost of vouchers'
    }),
    totalProfit: T.Number({
      description: 'Total profit from vouchers'
    }),
    averageProfitMargin: T.Number({
      description: 'Average profit margin percentage'
    }),
    vouchersByType: T.Record(T.String(), T.Integer(), {
      description: 'Voucher count by type'
    }),
    vouchersByStatus: T.Record(T.String(), T.Integer(), {
      description: 'Voucher count by status'
    }),
    vouchersByProfile: T.Array(T.Object({
      profileId: T.Union([T.Integer(), T.String()]),
      profileName: T.String(),
      voucherCount: T.Integer(),
      revenue: T.Number()
    }), {
      maxItems: 20,
      description: 'Top profiles by voucher count'
    }),
    dailyUsage: T.Array(T.Object({
      date: T.String(),
      vouchersUsed: T.Integer(),
      revenue: T.Number()
    }), {
      maxItems: 30,
      description: 'Daily usage for the last 30 days'
    })
  }, {
    description: 'Voucher system statistics and analytics'
  }),

  // Voucher batch operation schema
  bulkVoucherOperation: T.Object({
    voucherIds: T.Optional(T.Array(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]), {
      minItems: 1,
      maxItems: 1000,
      description: 'List of voucher IDs for operation'
    })),
    batchId: T.Optional(T.String({
      minLength: 1,
      maxLength: 50,
      description: 'Batch ID to operate on (alternative to voucherIds)'
    })),
    operation: T.Enum(['activate', 'deactivate', 'expire', 'delete', 'export', 'extend_validity'], {
      description: 'Type of bulk operation'
    }),
    parameters: T.Optional(T.Record(T.String(), T.Any(), {
      description: 'Operation-specific parameters'
    }))
  }, {
    required: ['operation'],
    description: 'Schema for bulk voucher operations',
    examples: [
      {
        batchId: 'BATCH-2024-001',
        operation: 'expire'
      },
      {
        voucherIds: [1, 2, 3],
        operation: 'extend_validity',
        parameters: {
          days: 30
        }
      }
    ]
  }),

  // Voucher export schema
  voucherExport: T.Object({
    format: T.Enum(['csv', 'xlsx', 'pdf'], {
      default: 'csv',
      description: 'Export file format'
    }),
    filters: T.Optional(T.Object({
      search: T.Optional(T.String({
        minLength: 1,
        maxLength: 100,
        description: 'Search voucher code or profile name'
      })),
      type: T.Optional(T.Enum(['hotspot', 'pppoe', 'universal'])),
      status: T.Optional(T.Enum(['active', 'used', 'expired', 'disabled'])),
      profileId: T.Optional(T.Union([
        T.Integer({ minimum: 1 }),
        T.String({ pattern: CommonSchemas.UUIDPattern })
      ])),
      customerId: T.Optional(T.Union([
        T.Integer({ minimum: 1 }),
        T.String({ pattern: CommonSchemas.UUIDPattern })
      ])),
      locationId: T.Optional(T.Union([
        T.Integer({ minimum: 1 }),
        T.String({ pattern: CommonSchemas.UUIDPattern })
      ])),
      priceMin: T.Optional(T.Number({
        minimum: 0
      })),
      priceMax: T.Optional(T.Number({
        minimum: 0
      })),
      createdFrom: T.Optional(T.String({
        format: 'date-time'
      })),
      createdTo: T.Optional(T.String({
        format: 'date-time'
      })),
      validFrom: T.Optional(T.String({
        format: 'date-time'
      })),
      validUntil: T.Optional(T.String({
        format: 'date-time'
      })),
      isExpired: T.Optional(T.Boolean({
        description: 'Filter expired vouchers'
      })),
      batchId: T.Optional(T.String({
        minLength: 1,
        maxLength: 50
      })),
      ...CommonSchemas.paginationQuery.properties
    })),
    fields: T.Optional(T.Array(T.Enum([
      'id', 'code', 'password', 'type', 'status', 'profileName', 'price', 'cost',
      'validFrom', 'validUntil', 'firstLoginAt', 'usageCount', 'customerName',
      'locationName', 'createdAt', 'updatedAt'
    ]), {
      description: 'Fields to include in export'
    })),
    includePasswords: T.Optional(T.Boolean({
      default: false,
      description: 'Include voucher passwords in export'
    })),
    includeHeaders: T.Optional(T.Boolean({
      default: true,
      description: 'Include column headers in export'
    })),
    groupBy: T.Optional(T.Enum(['profile', 'status', 'batch', 'location'], {
      description: 'Group vouchers in export'
    }))
  }, {
    description: 'Schema for voucher data export',
    examples: [
      {
        format: 'xlsx',
        filters: {
          status: 'active',
          profileId: 1
        },
        fields: ['code', 'profileName', 'price', 'validUntil', 'customerName'],
        includePasswords: false
      }
    ]
  }),

  // Mikrotik sync schema
  mikrotikSyncVoucher: T.Object({
    voucherId: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    operation: T.Enum(['create', 'update', 'delete', 'disable', 'enable'], {
      description: 'Sync operation type'
    }),
    mikrotikData: T.Optional(T.Object({
      username: T.String({
        minLength: 3,
        maxLength: 31,
        pattern: '^[a-zA-Z0-9_-]+$'
      }),
      password: T.Optional(T.String({
        maxLength: 31
      })),
      profile: T.String({
        minLength: 1,
        maxLength: 100
      }),
      comment: T.Optional(T.String({
        maxLength: 255
      })),
      disabled: T.Optional(T.Boolean({
        default: false
      }))
    }, {
      description: 'Mikrotik user data'
    })),
    locationId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]))
  }, {
    required: ['voucherId', 'operation'],
    description: 'Schema for voucher synchronization with Mikrotik'
  })
};

module.exports = VoucherSchemas;