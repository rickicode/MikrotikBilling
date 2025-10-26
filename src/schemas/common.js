// src/schemas/common.js
/**
 * Mikrotik Billing System - Common Schemas
 * Reusable schema definitions and types for the billing system
 */

const { Type } = require('@sinclair/typebox');
const T = Type;

/**
 * Indonesian phone number validation pattern
 * Supports: +62xxx, 08xxx, 62xxx formats
 */
const IndonesianPhonePattern = /^(\+62|62|08)[0-9]{8,13}$/;

/**
 * Indonesian ID Card (KTP/NIK) validation pattern
 * 16 digits with basic validation
 */
const KTPPattern = /^[0-9]{16}$/;

/**
 * Strong password pattern - at least 12 chars with mixed case, numbers, and special chars
 */
const StrongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;

/**
 * UUID pattern
 */
const UUIDPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Currency amount pattern (supports decimal with 2 digits)
 */
const CurrencyPattern = /^\d{1,12}(\.\d{1,2})?$/;

/**
 * Common reusable schemas
 */
const CommonSchemas = {
  // Pagination and sorting schemas
  paginationQuery: T.Object({
    page: T.Integer({
      minimum: 1,
      maximum: 1000,
      default: 1,
      description: 'Page number for pagination'
    }),
    limit: T.Integer({
      minimum: 1,
      maximum: 100,
      default: 20,
      description: 'Number of items per page'
    }),
    sortBy: T.Optional(T.String({
      minLength: 1,
      maxLength: 50,
      description: 'Field to sort by'
    })),
    sortOrder: T.Optional(T.Enum(['asc', 'desc'], {
      default: 'desc',
      description: 'Sort order direction'
    }))
  }, {
    description: 'Pagination query parameters',
    examples: [
      { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' }
    ]
  }),

  searchQuery: T.Object({
    search: T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Search term for filtering results'
    }),
    searchFields: T.Optional(T.Array(T.String({
      minLength: 1,
      maxLength: 50
    }), {
      maxItems: 10,
      description: 'Specific fields to search in'
    }))
  }, {
    description: 'Search query parameters',
    examples: [
      { search: 'John', searchFields: ['name', 'email'] }
    ]
  }),

  // ID parameter schemas
  idParam: T.Object({
    id: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: UUIDPattern })
    ], {
      description: 'Resource identifier (integer ID or UUID)'
    })
  }, {
    description: 'Path parameter for resource ID',
    examples: [
      { id: 1 },
      { id: '550e8400-e29b-41d4-a716-446655440000' }
    ]
  }),

  // Date range schemas
  dateRangeQuery: T.Object({
    startDate: T.String({
      format: 'date',
      description: 'Start date in YYYY-MM-DD format'
    }),
    endDate: T.String({
      format: 'date',
      description: 'End date in YYYY-MM-DD format'
    })
  }, {
    description: 'Date range filter',
    examples: [
      { startDate: '2024-01-01', endDate: '2024-12-31' }
    ]
  }),

  datetimeRangeQuery: T.Object({
    startDatetime: T.String({
      format: 'date-time',
      description: 'Start datetime in ISO 8601 format'
    }),
    endDatetime: T.String({
      format: 'date-time',
      description: 'End datetime in ISO 8601 format'
    })
  }, {
    description: 'Datetime range filter',
    examples: [
      { startDatetime: '2024-01-01T00:00:00Z', endDatetime: '2024-12-31T23:59:59Z' }
    ]
  }),

  // Common field schemas
  name: T.String({
    minLength: 1,
    maxLength: 100,
    pattern: '^[a-zA-Z\\s\\\'\\-\\.]+$',
    description: 'Full name with letters, spaces, and basic punctuation'
  }),

  email: T.String({
    format: 'email',
    maxLength: 255,
    description: 'Valid email address'
  }),

  phone: T.String({
    pattern: IndonesianPhonePattern,
    minLength: 10,
    maxLength: 15,
    description: 'Indonesian phone number (+62xxx, 08xxx, or 62xxx)'
  }),

  ktpNumber: T.String({
    pattern: KTPPattern,
    description: 'Indonesian ID Card number (16 digits)'
  }),

  address: T.String({
    minLength: 5,
    maxLength: 500,
    description: 'Complete address'
  }),

  password: T.String({
    minLength: 12,
    maxLength: 128,
    pattern: StrongPasswordPattern,
    description: 'Strong password (12+ chars with mixed case, numbers, and special chars)'
  }),

  username: T.String({
    minLength: 3,
    maxLength: 30,
    pattern: '^[a-zA-Z0-9_-]+$',
    description: 'Username with letters, numbers, underscores, and hyphens'
  }),

  currency: T.Object({
    amount: T.Number({
      minimum: 0,
      maximum: 999999999999,
      description: 'Currency amount'
    }),
    currencyCode: T.String({
      pattern: '^[A-Z]{3}$',
      default: 'IDR',
      description: 'ISO 4217 currency code'
    })
  }, {
    description: 'Currency amount with code',
    examples: [
      { amount: 10000, currencyCode: 'IDR' }
    ]
  }),

  // Status and type enums
  status: T.Enum(['active', 'inactive', 'pending', 'suspended', 'expired'], {
    description: 'Record status'
  }),

  boolean: T.Boolean({
    description: 'Boolean value'
  }),

  // File upload schemas
  fileUpload: T.Object({
    filename: T.String({
      minLength: 1,
      maxLength: 255,
      pattern: '^[a-zA-Z0-9._-]+$',
      description: 'Safe filename'
    }),
    mimetype: T.String({
      pattern: '^[a-zA-Z0-9][a-zA-Z0-9!#$&\\-^_]*\\/[a-zA-Z0-9][a-zA-Z0-9!#$&\\-_.]*$',
      description: 'MIME type'
    }),
    size: T.Integer({
      minimum: 0,
      maximum: 104857600, // 100MB
      description: 'File size in bytes'
    })
  }, {
    description: 'File upload metadata'
  }),

  // Location schemas
  coordinates: T.Object({
    latitude: T.Number({
      minimum: -90,
      maximum: 90,
      description: 'Latitude coordinate'
    }),
    longitude: T.Number({
      minimum: -180,
      maximum: 180,
      description: 'Longitude coordinate'
    })
  }, {
    description: 'GPS coordinates',
    examples: [
      { latitude: -6.2088, longitude: 106.8456 }
    ]
  }),

  // Metadata schemas
  metadata: T.Object({
    key: T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Metadata key'
    }),
    value: T.Union([
      T.String({ maxLength: 1000 }),
      T.Number(),
      T.Boolean(),
      T.Null()
    ], {
      description: 'Metadata value'
    })
  }, {
    description: 'Key-value metadata pair'
  }),

  metadataObject: T.Record(
    T.String({ minLength: 1, maxLength: 100 }),
    T.Union([
      T.String({ maxLength: 1000 }),
      T.Number(),
      T.Boolean(),
      T.Null()
    ]),
    {
      description: 'Object with metadata key-value pairs'
    }
  ),

  // API key schema
  apiKey: T.String({
    minLength: 32,
    maxLength: 128,
    pattern: '^[a-zA-Z0-9_-]+$',
    description: 'API key for authentication'
  }),

  // Token schemas
  jwtToken: T.String({
    pattern: '^[A-Za-z0-9-_]*\\.[A-Za-z0-9-_]*\\.[A-Za-z0-9-_]*$',
    description: 'JWT token'
  }),

  // UUID pattern for external use
  UUIDPattern,
  IndonesianPhonePattern,
  KTPPattern,
  StrongPasswordPattern,
  CurrencyPattern,

  // Validation schemas for specific formats
  ipAddress: T.String({
    format: 'ipv4',
    description: 'IPv4 address'
  }),

  macAddress: T.String({
    pattern: '^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$',
    description: 'MAC address'
  }),

  // Mikrotik specific schemas
  mikrotikUsername: T.String({
    minLength: 3,
    maxLength: 31,
    pattern: '^[a-zA-Z0-9_-]+$',
    description: 'Mikrotik username (alphanumeric, underscore, hyphen)'
  }),

  mikrotikComment: T.String({
    maxLength: 255,
    description: 'Mikrotik user comment field'
  }),

  // Business logic schemas
  profitCalculation: T.Object({
    costPrice: T.Number({
      minimum: 0,
      description: 'Cost price'
    }),
    sellingPrice: T.Number({
      minimum: 0,
      description: 'Selling price'
    }),
    profit: T.Number({
      description: 'Calculated profit'
    }),
    profitMargin: T.Number({
      minimum: 0,
      maximum: 100,
      description: 'Profit margin percentage'
    })
  }, {
    description: 'Profit calculation data',
    examples: [
      { costPrice: 5000, sellingPrice: 10000, profit: 5000, profitMargin: 50 }
    ]
  })
};

module.exports = CommonSchemas;