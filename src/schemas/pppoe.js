// src/schemas/pppoe.js
/**
 * Mikrotik Billing System - PPPoE User Management Schemas
 * Comprehensive validation schemas for PPPoE user management with Mikrotik integration
 */

const { Type } = require('@sinclair/typebox');
const T = Type;

const CommonSchemas = require('./common');

/**
 * PPPoE User Status Enum
 */
const PPPoEStatus = T.Enum(['active', 'disabled', 'expired', 'suspended'], {
  description: 'PPPoE user account status'
});

/**
 * PPPoE Service Type Enum
 */
const ServiceType = T.Enum(['internet', 'vpn', 'corporate', 'residential', 'business'], {
  description: 'Type of PPPoE service'
});

/**
 * Billing Cycle Enum for PPPoE
 */
const PPPoEBillingCycle = T.Enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'prepaid'], {
  description: 'PPPoE billing cycle frequency'
});

/**
 * PPPoE Schemas
 */
const PPPoESchemas = {
  // Base PPPoE user schema
  pppoeUser: T.Object({
    id: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    username: CommonSchemas.mikrotikUsername,
    password: T.String({
      minLength: 4,
      maxLength: 31,
      pattern: '^[a-zA-Z0-9!@#$%^&*()_+-=\\[\\]{};:.,<>?]+$',
      description: 'PPPoE user password'
    }),
    status: PPPoEStatus,
    serviceType: ServiceType,
    profileId: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    profileName: T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Mikrotik PPP profile name'
    }),
    customerId: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    customerName: T.String({
      maxLength: 100,
      description: 'Customer name'
    }),
    localAddress: T.Optional(CommonSchemas.ipAddress),
    remoteAddress: T.Optional(CommonSchemas.ipAddress),
    macAddress: T.Optional(CommonSchemas.macAddress),
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
    dataLimit: T.Optional(T.Number({
      minimum: 0,
      description: 'Data limit in bytes'
    })),
    timeLimit: T.Optional(T.Number({
      minimum: 0,
      description: 'Time limit in minutes'
    })),
    billingCycle: PPPoEBillingCycle,
    price: T.Number({
      minimum: 0,
      description: 'Monthly subscription price'
    }),
    cost: T.Number({
      minimum: 0,
      description: 'Monthly cost'
    }),
    currencyCode: T.String({
      pattern: '^[A-Z]{3}$',
      default: 'IDR',
      description: 'Currency code'
    }),
    startDate: T.String({
      format: 'date',
      description: 'Service start date'
    }),
    endDate: T.Optional(T.String({
      format: 'date',
      description: 'Service end date (if applicable)'
    })),
    lastLoginAt: T.Optional(T.String({
      format: 'date-time',
      description: 'Last login timestamp'
    })),
    uptime: T.Optional(T.String({
      description: 'Current uptime (Mikrotik format)'
    })),
    bytesIn: T.Optional(T.Number({
      minimum: 0,
      description: 'Bytes downloaded'
    })),
    bytesOut: T.Optional(T.Number({
      minimum: 0,
      description: 'Bytes uploaded'
    })),
    mikrotikId: T.Optional(T.String({
      description: 'Mikrotik secret ID'
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
    autoRenew: T.Boolean({
      default: false,
      description: 'Auto-renew subscription'
    }),
    gracePeriodDays: T.Integer({
      minimum: 0,
      maximum: 30,
      default: 3,
      description: 'Grace period in days after expiry'
    }),
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
    required: ['username', 'password', 'status', 'serviceType', 'profileId', 'profileName', 'customerId', 'customerName', 'billingCycle', 'price', 'cost', 'startDate'],
    description: 'Complete PPPoE user record',
    examples: [
      {
        username: 'user123',
        password: 'SecuredPass123!',
        status: 'active',
        serviceType: 'residential',
        profileId: 1,
        profileName: 'pppoe-residential-10mbps',
        customerId: 1,
        customerName: 'John Doe',
        billingCycle: 'monthly',
        price: 150000,
        cost: 120000,
        currencyCode: 'IDR',
        startDate: '2024-01-01',
        autoRenew: false,
        gracePeriodDays: 3,
        mikrotikComment: 'PPPOE_SYSTEM|150000|1735689600|1767225600'
      }
    ]
  }),

  // Create PPPoE user schema
  createPPPoEUser: T.Object({
    username: CommonSchemas.mikrotikUsername,
    password: T.String({
      minLength: 4,
      maxLength: 31,
      pattern: '^[a-zA-Z0-9!@#$%^&*()_+-=\\[\\]{};:.,<>?]+$'
    }),
    serviceType: ServiceType,
    profileId: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    customerId: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    localAddress: T.Optional(CommonSchemas.ipAddress),
    remoteAddress: T.Optional(CommonSchemas.ipAddress),
    macAddress: T.Optional(CommonSchemas.macAddress),
    rateLimit: T.Optional(T.Object({
      upload: T.Number({
        minimum: 0
      }),
      download: T.Number({
        minimum: 0
      })
    })),
    dataLimit: T.Optional(T.Number({
      minimum: 0
    })),
    timeLimit: T.Optional(T.Number({
      minimum: 0
    })),
    billingCycle: PPPoEBillingCycle,
    price: T.Number({
      minimum: 0
    }),
    cost: T.Optional(T.Number({
      minimum: 0
    })),
    startDate: T.String({
      format: 'date'
    }),
    endDate: T.Optional(T.String({
      format: 'date'
    })),
    locationId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    autoRenew: T.Optional(T.Boolean({
      default: false
    })),
    gracePeriodDays: T.Optional(T.Integer({
      minimum: 0,
      maximum: 30,
      default: 3
    })),
    notes: T.Optional(T.String({
      maxLength: 500
    })),
    metadata: T.Optional(CommonSchemas.metadataObject),
    createInMikrotik: T.Optional(T.Boolean({
      default: true,
      description: 'Create user in Mikrotik immediately'
    }))
  }, {
    required: ['username', 'password', 'serviceType', 'profileId', 'customerId', 'billingCycle', 'price', 'startDate'],
    description: 'Schema for creating new PPPoE user',
    examples: [
      {
        username: 'user123',
        password: 'SecuredPass123!',
        serviceType: 'residential',
        profileId: 1,
        customerId: 1,
        billingCycle: 'monthly',
        price: 150000,
        startDate: '2024-01-01',
        createInMikrotik: true
      }
    ]
  }),

  // Bulk PPPoE user creation schema
  generatePPPoEUsers: T.Object({
    profileId: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    quantity: T.Integer({
      minimum: 1,
      maximum: 100,
      description: 'Number of PPPoE users to create'
    }),
    usernamePrefix: T.Optional(T.String({
      minLength: 1,
      maxLength: 10,
      pattern: '^[a-zA-Z0-9_-]*$',
      description: 'Username prefix'
    })),
    usernameSuffix: T.Optional(T.String({
      minLength: 1,
      maxLength: 10,
      pattern: '^[a-zA-Z0-9_-]*$',
      description: 'Username suffix'
    })),
    usernameLength: T.Optional(T.Integer({
      minimum: 3,
      maximum: 31,
      default: 8,
      description: 'Username length (excluding prefix/suffix)'
    })),
    serviceType: ServiceType,
    billingCycle: PPPoEBillingCycle,
    price: T.Number({
      minimum: 0,
      description: 'Monthly subscription price'
    }),
    cost: T.Optional(T.Number({
      minimum: 0,
      description: 'Monthly cost'
    })),
    startDate: T.String({
      format: 'date',
      description: 'Service start date for all users'
    }),
    endDate: T.Optional(T.String({
      format: 'date',
      description: 'Service end date for all users'
    })),
    customerId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    locationId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    passwordLength: T.Integer({
      minimum: 4,
      maximum: 31,
      default: 12,
      description: 'Generated password length'
    }),
    generatePasswords: T.Boolean({
      default: true,
      description: 'Generate random passwords'
    }),
    autoRenew: T.Optional(T.Boolean({
      default: false
    })),
    gracePeriodDays: T.Optional(T.Integer({
      minimum: 0,
      maximum: 30,
      default: 3
    })),
    notes: T.Optional(T.String({
      maxLength: 500
    })),
    metadata: T.Optional(CommonSchemas.metadataObject),
    createInMikrotik: T.Optional(T.Boolean({
      default: true,
      description: 'Create users in Mikrotik immediately'
    })),
    batchId: T.Optional(T.String({
      minLength: 1,
      maxLength: 50,
      description: 'Batch identifier for tracking'
    }))
  }, {
    required: ['profileId', 'quantity', 'serviceType', 'billingCycle', 'price', 'startDate'],
    description: 'Schema for bulk PPPoE user generation',
    examples: [
      {
        profileId: 1,
        quantity: 50,
        usernamePrefix: 'PPPOE',
        serviceType: 'residential',
        billingCycle: 'monthly',
        price: 150000,
        startDate: '2024-01-01',
        batchId: 'PPPOE-BATCH-2024-001'
      }
    ]
  }),

  // Update PPPoE user schema
  updatePPPoEUser: T.Object({
    password: T.Optional(T.String({
      minLength: 4,
      maxLength: 31,
      pattern: '^[a-zA-Z0-9!@#$%^&*()_+-=\\[\\]{};:.,<>?]+$'
    })),
    status: T.Optional(PPPoEStatus),
    localAddress: T.Optional(CommonSchemas.ipAddress),
    remoteAddress: T.Optional(CommonSchemas.ipAddress),
    macAddress: T.Optional(CommonSchemas.macAddress),
    rateLimit: T.Optional(T.Object({
      upload: T.Number({
        minimum: 0
      }),
      download: T.Number({
        minimum: 0
      })
    })),
    price: T.Optional(T.Number({
      minimum: 0
    })),
    cost: T.Optional(T.Number({
      minimum: 0
    })),
    endDate: T.Optional(T.String({
      format: 'date'
    })),
    autoRenew: T.Optional(T.Boolean()),
    gracePeriodDays: T.Optional(T.Integer({
      minimum: 0,
      maximum: 30
    })),
    notes: T.Optional(T.String({
      maxLength: 500
    })),
    metadata: T.Optional(CommonSchemas.metadataObject)
  }, {
    description: 'Schema for updating existing PPPoE user'
  }),

  // PPPoE user search and filter schema
  pppoeSearchQuery: T.Object({
    search: T.Optional(T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Search username or customer name'
    })),
    status: T.Optional(PPPoEStatus),
    serviceType: T.Optional(ServiceType),
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
    billingCycle: T.Optional(PPPoEBillingCycle),
    priceMin: T.Optional(T.Number({
      minimum: 0
    })),
    priceMax: T.Optional(T.Number({
      minimum: 0
    })),
    startDateFrom: T.Optional(T.String({
      format: 'date'
    })),
    startDateTo: T.Optional(T.String({
      format: 'date'
    })),
    endDateFrom: T.Optional(T.String({
      format: 'date'
    })),
    endDateTo: T.Optional(T.String({
      format: 'date'
    })),
    isExpired: T.Optional(T.Boolean({
      description: 'Filter expired users'
    })),
    hasUsage: T.Optional(T.Boolean({
      description: 'Filter users with usage data'
    })),
    batchId: T.Optional(T.String({
      minLength: 1,
      maxLength: 50
    })),
    ...CommonSchemas.paginationQuery.properties
  }, {
    description: 'PPPoE user search and filter parameters',
    examples: [
      {
        status: 'active',
        serviceType: 'residential',
        profileId: 1,
        priceMin: 100000,
        page: 1,
        limit: 20
      }
    ]
  }),

  // PPPoE profile schema
  pppoeProfile: T.Object({
    id: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    name: T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Profile name'
    }),
    serviceType: ServiceType,
    description: T.String({
      maxLength: 500,
      description: 'Profile description'
    }),
    rateLimit: T.Object({
      upload: T.Number({
        minimum: 0,
        description: 'Upload rate limit in kbps'
      }),
      download: T.Number({
        minimum: 0,
        description: 'Download rate limit in kbps'
      })
    }, {
      description: 'Default rate limit configuration'
    }),
    dataLimit: T.Optional(T.Number({
      minimum: 0,
      description: 'Default data limit in bytes'
    })),
    timeLimit: T.Optional(T.Number({
      minimum: 0,
      description: 'Default time limit in minutes'
    })),
    cost: T.Number({
      minimum: 0,
      description: 'Default monthly cost'
    }),
    recommendedPrice: T.Optional(T.Number({
      minimum: 0,
      description: 'Recommended monthly price'
    })),
    mikrotikProfileName: T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Mikrotik PPP profile name'
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
    authentication: T.Optional(T.Enum(['pap', 'chap', 'mschap1', 'mschap2'], {
      default: 'mschap2',
      description: 'Authentication method'
    })),
    compression: T.Optional(T.Boolean({
      default: true,
      description: 'Enable compression'
    })),
    encryption: T.Optional(T.Enum(['none', 'mppe', 'mppe-128', 'mppe-40'], {
      default: 'mppe-128',
      description: 'Encryption method'
    })),
    metadata: T.Optional(CommonSchemas.metadataObject),
    createdAt: T.Optional(T.String({
      format: 'date-time'
    })),
    updatedAt: T.Optional(T.String({
      format: 'date-time'
    }))
  }, {
    required: ['name', 'serviceType', 'description', 'rateLimit', 'cost', 'mikrotikProfileName'],
    description: 'PPPoE profile configuration',
    examples: [
      {
        name: 'Residential 10 Mbps',
        serviceType: 'residential',
        description: 'Residential internet service with 10 Mbps speed',
        rateLimit: {
          upload: 2500,
          download: 10000
        },
        cost: 120000,
        recommendedPrice: 150000,
        mikrotikProfileName: 'pppoe-residential-10mbps',
        isActive: true,
        authentication: 'mschap2',
        encryption: 'mppe-128'
      }
    ]
  }),

  // Create PPPoE profile schema
  createPPPoEProfile: T.Object({
    name: T.String({
      minLength: 1,
      maxLength: 100
    }),
    serviceType: ServiceType,
    description: T.String({
      maxLength: 500
    }),
    rateLimit: T.Object({
      upload: T.Number({
        minimum: 0
      }),
      download: T.Number({
        minimum: 0
      })
    }),
    dataLimit: T.Optional(T.Number({
      minimum: 0
    })),
    timeLimit: T.Optional(T.Number({
      minimum: 0
    })),
    cost: T.Number({
      minimum: 0
    }),
    recommendedPrice: T.Optional(T.Number({
      minimum: 0
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
    authentication: T.Optional(T.Enum(['pap', 'chap', 'mschap1', 'mschap2'])),
    compression: T.Optional(T.Boolean({
      default: true
    })),
    encryption: T.Optional(T.Enum(['none', 'mppe', 'mppe-128', 'mppe-40'])),
    metadata: T.Optional(CommonSchemas.metadataObject)
  }, {
    required: ['name', 'serviceType', 'description', 'rateLimit', 'cost', 'mikrotikProfileName'],
    description: 'Schema for creating PPPoE profile'
  }),

  // PPPoE usage statistics schema
  pppoeStats: T.Object({
    totalUsers: T.Integer({
      minimum: 0,
      description: 'Total number of PPPoE users'
    }),
    activeUsers: T.Integer({
      minimum: 0,
      description: 'Number of active users'
    }),
    disabledUsers: T.Integer({
      minimum: 0,
      description: 'Number of disabled users'
    }),
    expiredUsers: T.Integer({
      minimum: 0,
      description: 'Number of expired users'
    }),
    onlineUsers: T.Integer({
      minimum: 0,
      description: 'Currently online users'
    }),
    usersCreatedToday: T.Integer({
      minimum: 0,
      description: 'Users created today'
    }),
    monthlyRevenue: T.Number({
      description: 'Monthly recurring revenue'
    }),
    monthlyCost: T.Number({
      description: 'Monthly cost'
    }),
    monthlyProfit: T.Number({
      description: 'Monthly profit'
    }),
    averageRevenuePerUser: T.Number({
      description: 'Average revenue per user'
    }),
    usersByServiceType: T.Record(T.String(), T.Integer(), {
      description: 'User count by service type'
    }),
    usersByStatus: T.Record(T.String(), T.Integer(), {
      description: 'User count by status'
    }),
    usersByProfile: T.Array(T.Object({
      profileId: T.Union([T.Integer(), T.String()]),
      profileName: T.String(),
      userCount: T.Integer(),
      monthlyRevenue: T.Number()
    }), {
      maxItems: 20,
      description: 'Top profiles by user count'
    }),
    bandwidthUsage: T.Object({
      totalBytesIn: T.Number({
        description: 'Total download bytes this month'
      }),
      totalBytesOut: T.Number({
        description: 'Total upload bytes this month'
      }),
      averageDailyUsage: T.Number({
        description: 'Average daily usage in GB'
      }),
      topUsersByUsage: T.Array(T.Object({
        username: T.String(),
        customerName: T.String(),
        bytesIn: T.Number(),
        bytesOut: T.Number(),
        totalBytes: T.Number()
      }), {
        maxItems: 10,
        description: 'Top 10 users by usage'
      })
    }, {
      description: 'Bandwidth usage statistics'
    }),
    dailyStats: T.Array(T.Object({
      date: T.String(),
      newUsers: T.Integer(),
      activeUsers: T.Integer(),
      onlineUsers: T.Integer(),
      revenue: T.Number()
    }), {
      maxItems: 30,
      description: 'Daily statistics for the last 30 days'
    })
  }, {
    description: 'PPPoE system statistics and analytics'
  }),

  // PPPoE bulk operation schema
  bulkPPPoEOperation: T.Object({
    userIds: T.Optional(T.Array(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]), {
      minItems: 1,
      maxItems: 100,
      description: 'List of PPPoE user IDs for operation'
    })),
    batchId: T.Optional(T.String({
      minLength: 1,
      maxLength: 50,
      description: 'Batch ID to operate on (alternative to userIds)'
    })),
    operation: T.Enum(['activate', 'disable', 'enable', 'expire', 'renew', 'delete', 'export'], {
      description: 'Type of bulk operation'
    }),
    parameters: T.Optional(T.Record(T.String(), T.Any(), {
      description: 'Operation-specific parameters'
    }))
  }, {
    required: ['operation'],
    description: 'Schema for bulk PPPoE user operations',
    examples: [
      {
        batchId: 'PPPOE-BATCH-2024-001',
        operation: 'disable'
      },
      {
        userIds: [1, 2, 3],
        operation: 'renew',
        parameters: {
          extendDays: 30
        }
      }
    ]
  }),

  // PPPoE export schema
  pppoeExport: T.Object({
    format: T.Enum(['csv', 'xlsx', 'pdf'], {
      default: 'csv',
      description: 'Export file format'
    }),
    filters: T.Optional(T.Object({
      search: T.Optional(T.String({
        minLength: 1,
        maxLength: 100,
        description: 'Search username or customer name'
      })),
      status: T.Optional(T.Enum(['active', 'disabled', 'expired', 'suspended'])),
      serviceType: T.Optional(T.Enum(['internet', 'vpn', 'corporate', 'residential', 'business'])),
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
      billingCycle: T.Optional(T.Enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'prepaid'])),
      priceMin: T.Optional(T.Number({
        minimum: 0
      })),
      priceMax: T.Optional(T.Number({
        minimum: 0
      })),
      startDateFrom: T.Optional(T.String({
        format: 'date'
      })),
      startDateTo: T.Optional(T.String({
        format: 'date'
      })),
      endDateFrom: T.Optional(T.String({
        format: 'date'
      })),
      endDateTo: T.Optional(T.String({
        format: 'date'
      })),
      isExpired: T.Optional(T.Boolean({
        description: 'Filter expired users'
      })),
      hasUsage: T.Optional(T.Boolean({
        description: 'Filter users with usage data'
      })),
      batchId: T.Optional(T.String({
        minLength: 1,
        maxLength: 50
      })),
      ...CommonSchemas.paginationQuery.properties
    })),
    fields: T.Optional(T.Array(T.Enum([
      'id', 'username', 'password', 'status', 'serviceType', 'profileName',
      'customerName', 'price', 'cost', 'startDate', 'endDate', 'lastLoginAt',
      'bytesIn', 'bytesOut', 'locationName', 'createdAt', 'updatedAt'
    ]), {
      description: 'Fields to include in export'
    })),
    includePasswords: T.Optional(T.Boolean({
      default: false,
      description: 'Include passwords in export'
    })),
    includeHeaders: T.Optional(T.Boolean({
      default: true,
      description: 'Include column headers in export'
    })),
    includeUsageData: T.Optional(T.Boolean({
      default: false,
      description: 'Include usage statistics'
    })),
    groupBy: T.Optional(T.Enum(['profile', 'status', 'service_type', 'location'], {
      description: 'Group users in export'
    }))
  }, {
    description: 'Schema for PPPoE user data export',
    examples: [
      {
        format: 'xlsx',
        filters: {
          status: 'active',
          serviceType: 'residential'
        },
        fields: ['username', 'customerName', 'profileName', 'price', 'endDate'],
        includePasswords: false,
        includeUsageData: true
      }
    ]
  }),

  // PPPoE renewal schema
  pppoeRenewal: T.Object({
    userId: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    renewalPeriod: T.Object({
      value: T.Integer({
        minimum: 1,
        maximum: 365,
        description: 'Renewal period value'
      }),
      unit: T.Enum(['days', 'weeks', 'months'], {
        description: 'Renewal period unit'
      })
    }, {
      description: 'Renewal period configuration'
    }),
    newPrice: T.Optional(T.Number({
      minimum: 0,
      description: 'New price after renewal'
    })),
    newCost: T.Optional(T.Number({
      minimum: 0,
      description: 'New cost after renewal'
    })),
    billingCycle: T.Optional(PPPoEBillingCycle),
    paymentId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    notes: T.Optional(T.String({
      maxLength: 500
    })),
    metadata: T.Optional(CommonSchemas.metadataObject)
  }, {
    required: ['userId', 'renewalPeriod'],
    description: 'Schema for PPPoE user renewal',
    examples: [
      {
        userId: 1,
        renewalPeriod: {
          value: 1,
          unit: 'months'
        },
        newPrice: 160000,
        notes: 'Annual subscription renewal'
      }
    ]
  }),

  // Mikrotik sync schema for PPPoE
  mikrotikSyncPPPoE: T.Object({
    userId: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    operation: T.Enum(['create', 'update', 'delete', 'disable', 'enable'], {
      description: 'Sync operation type'
    }),
    mikrotikData: T.Optional(T.Object({
      name: T.String({
        minLength: 3,
        maxLength: 31,
        pattern: '^[a-zA-Z0-9_-]+$'
      }),
      password: T.String({
        minLength: 4,
        maxLength: 31
      }),
      profile: T.String({
        minLength: 1,
        maxLength: 100
      }),
      localAddress: T.Optional(CommonSchemas.ipAddress),
      remoteAddress: T.Optional(CommonSchemas.ipAddress),
      comment: T.Optional(T.String({
        maxLength: 255
      })),
      disabled: T.Optional(T.Boolean({
        default: false
      }))
    }, {
      description: 'Mikrotik PPP secret data'
    })),
    locationId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]))
  }, {
    required: ['userId', 'operation'],
    description: 'Schema for PPPoE user synchronization with Mikrotik'
  })
};

module.exports = PPPoESchemas;