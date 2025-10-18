// src/schemas/responses.js
/**
 * Mikrotik Billing System - Standardized API Response Schemas
 * Standardized response schemas for consistent API responses and error handling
 */

const { Type } = require('@sinclair/typebox');
const T = Type;

const CommonSchemas = require('./common');

/**
 * HTTP Status Code Enum
 */
const HttpStatus = T.Enum([100, 101, 102, 200, 201, 202, 203, 204, 205, 206, 207, 208, 226, 300, 301, 302, 303, 304, 305, 306, 307, 308, 400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 421, 422, 423, 424, 425, 426, 428, 429, 431, 451, 500, 501, 502, 503, 504, 505, 506, 507, 508, 510, 511], {
  description: 'HTTP status codes'
});

/**
 * Error Code Enum
 */
const ErrorCode = T.Enum([
  'VALIDATION_ERROR',
  'AUTHENTICATION_ERROR',
  'AUTHORIZATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMIT_EXCEEDED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
  'DATABASE_ERROR',
  'NETWORK_ERROR',
  'MIKROTIK_ERROR',
  'PAYMENT_ERROR',
  'WHATSAPP_ERROR',
  'INVALID_REQUEST',
  'PERMISSION_DENIED',
  'RESOURCE_LOCKED',
  'QUOTA_EXCEEDED',
  'MAINTENANCE_MODE',
  'INVALID_FORMAT',
  'MISSING_REQUIRED_FIELD',
  'INVALID_FIELD_VALUE',
  'DUPLICATE_RESOURCE',
  'EXTERNAL_SERVICE_ERROR'
], {
  description: 'Standardized error codes'
});

/**
 * Response Schemas
 */
const ResponseSchemas = {
  // Standard API response schema
  apiResponse: T.Object({
    success: T.Boolean({
      description: 'Whether the operation was successful'
    }),
    message: T.String({
      minLength: 1,
      maxLength: 500,
      description: 'Response message'
    }),
    data: T.Optional(T.Union([
      T.Object({}, { additionalProperties: true }),
      T.Array(T.Any()),
      T.String(),
      T.Number(),
      T.Boolean(),
      T.Null()
    ], {
      description: 'Response data (varies by endpoint)'
    })),
    meta: T.Optional(T.Object({
      timestamp: T.String({
        format: 'date-time',
        description: 'Response timestamp'
      }),
      requestId: T.String({
        minLength: 1,
        maxLength: 100,
        description: 'Unique request identifier'
      }),
      version: T.String({
        pattern: '^\\d+\\.\\d+\\.\\d+$',
        description: 'API version'
      }),
      processingTime: T.Number({
        minimum: 0,
        description: 'Processing time in milliseconds'
      }),
      pagination: T.Optional(T.Object({
        page: T.Integer({
          minimum: 1
        }),
        limit: T.Integer({
          minimum: 1
        }),
        total: T.Integer({
          minimum: 0
        }),
        totalPages: T.Integer({
          minimum: 0
        }),
        hasNext: T.Boolean(),
        hasPrev: T.Boolean()
      }, {
        description: 'Pagination information'
      })),
      warnings: T.Array(T.String({
        maxLength: 500
      }), {
        description: 'Warning messages'
      })
    }, {
      description: 'Response metadata'
    }))
  }, {
    required: ['success', 'message'],
    description: 'Standard API response format',
    examples: [
      {
        success: true,
        message: 'Operation completed successfully',
        data: { id: 1, name: 'Test' },
        meta: {
          timestamp: '2024-01-01T00:00:00Z',
          requestId: 'req-123456',
          version: '1.0.0',
          processingTime: 150
        }
      }
    ]
  }),

  // Error response schema
  errorResponse: T.Object({
    success: T.Boolean({
      const: false,
      description: 'Always false for error responses'
    }),
    error: T.Object({
      code: ErrorCode,
      message: T.String({
        minLength: 1,
        maxLength: 500,
        description: 'Error message'
      }),
      details: T.Optional(T.Union([
        T.String({
          maxLength: 1000,
          description: 'Detailed error description'
        }),
        T.Array(T.String({
          maxLength: 500
        }), {
          description: 'Array of error details'
        }),
        T.Record(T.String(), T.Any(), {
          description: 'Error details as key-value pairs'
        })
      ])),
      field: T.Optional(T.String({
        description: 'Field name that caused the error (for validation errors)'
      })),
      value: T.Optional(T.Any({
        description: 'Invalid value that caused the error'
      })),
      timestamp: T.String({
        format: 'date-time',
        description: 'Error timestamp'
      }),
      requestId: T.Optional(T.String({
        minLength: 1,
        maxLength: 100,
        description: 'Request identifier'
      }),
      path: T.Optional(T.String({
        description: 'Request path'
      })),
      stack: T.Optional(T.String({
        description: 'Error stack trace (development only)'
      }))
    }, {
      required: ['code', 'message', 'timestamp'],
      description: 'Error information'
    }),
    meta: T.Optional(T.Object({
      timestamp: T.String({
        format: 'date-time'
      }),
      requestId: T.String({
        minLength: 1,
        maxLength: 100
      }),
      version: T.String({
        pattern: '^\\d+\\.\\d+\\.\\d+$'
      }),
      processingTime: T.Number({
        minimum: 0
      })
    }))
  }, {
    required: ['success', 'error'],
    description: 'Standard error response format',
    examples: [
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: ['Email is required', 'Password must be at least 12 characters'],
          timestamp: '2024-01-01T00:00:00Z',
          requestId: 'req-123456'
        }
      }
    ]
  }),

  // Success response schema (convenience)
  successResponse: T.Object({
    success: T.Boolean({
      const: true
    }),
    message: T.String({
      minLength: 1,
      maxLength: 500
    }),
    data: T.Optional(T.Any()),
    meta: T.Optional(T.Object({
      timestamp: T.String({
        format: 'date-time'
      }),
      requestId: T.String({
        minLength: 1,
        maxLength: 100
      }),
      processingTime: T.Number({
        minimum: 0
      })
    }))
  }, {
    description: 'Success response wrapper'
  }),

  // Paginated response schema
  paginatedResponse: T.Object({
    success: T.Boolean(),
    message: T.String({
      minLength: 1,
      maxLength: 500
    }),
    data: T.Array(T.Any()),
    meta: T.Object({
      timestamp: T.String({
        format: 'date-time'
      }),
      requestId: T.String({
        minLength: 1,
        maxLength: 100
      }),
      pagination: T.Object({
        page: T.Integer({
          minimum: 1
        }),
        limit: T.Integer({
          minimum: 1
        }),
        total: T.Integer({
          minimum: 0
        }),
        totalPages: T.Integer({
          minimum: 0
        }),
        hasNext: T.Boolean(),
        hasPrev: T.Boolean()
      }),
      processingTime: T.Number({
        minimum: 0
      })
    })
  }, {
    required: ['success', 'message', 'data', 'meta'],
    description: 'Paginated response format'
  }),

  // Validation error response schema
  validationErrorResponse: T.Object({
    success: T.Boolean({
      const: false
    }),
    error: T.Object({
      code: T.Literal('VALIDATION_ERROR'),
      message: T.String({
        minLength: 1,
        maxLength: 500
      }),
      details: T.Array(T.Object({
        field: T.String({
          minLength: 1,
          maxLength: 100
        }),
        message: T.String({
          minLength: 1,
          maxLength: 500
        }),
        value: T.Optional(T.Any()),
        code: T.Optional(T.String({
          maxLength: 100
        }))
      }), {
        minItems: 1,
        description: 'Array of validation errors'
      }),
      timestamp: T.String({
        format: 'date-time'
      }),
      requestId: T.String({
        minLength: 1,
        maxLength: 100
      })
    })
  }, {
    description: 'Validation error response format'
  }),

  // Created response schema (201)
  createdResponse: T.Object({
    success: T.Boolean({
      const: true
    }),
    message: T.String({
      minLength: 1,
      maxLength: 500
    }),
    data: T.Object({
      id: T.Union([
        T.Integer({ minimum: 1 }),
        T.String({ pattern: CommonSchemas.UUIDPattern })
      ]),
      createdAt: T.String({
        format: 'date-time'
      })
    }, {
      additionalProperties: true
    }),
    meta: T.Object({
      timestamp: T.String({
        format: 'date-time'
      }),
      requestId: T.String({
        minLength: 1,
        maxLength: 100
      }),
      processingTime: T.Number({
        minimum: 0
      })
    })
  }, {
    description: 'Created response format (201 status)'
  }),

  // No content response schema (204)
  noContentResponse: T.Object({
    success: T.Boolean({
      const: true
    }),
    message: T.String({
      minLength: 1,
      maxLength: 500
    }),
    meta: T.Object({
      timestamp: T.String({
        format: 'date-time'
      }),
      requestId: T.String({
        minLength: 1,
        maxLength: 100
      }),
      processingTime: T.Number({
        minimum: 0
      })
    })
  }, {
    description: 'No content response format (204 status)'
  }),

  // Health check response schema
  healthCheckResponse: T.Object({
    status: T.Enum(['healthy', 'degraded', 'unhealthy'], {
      description: 'Overall system health status'
    }),
    timestamp: T.String({
      format: 'date-time',
      description: 'Health check timestamp'
    }),
    uptime: T.Number({
      minimum: 0,
      description: 'System uptime in seconds'
    }),
    version: T.String({
      pattern: '^\\d+\\.\\d+\\.\\d+$',
      description: 'Application version'
    }),
    environment: T.String({
      pattern: '^[a-z]+$',
      description: 'Environment (development, staging, production)'
    }),
    services: T.Object({
      database: T.Object({
        status: T.Enum(['healthy', 'degraded', 'unhealthy']),
        responseTime: T.Number({
          minimum: 0,
          description: 'Response time in milliseconds'
        }),
        lastCheck: T.String({
          format: 'date-time'
        }),
        details: T.Optional(T.Record(T.String(), T.Any()))
      }),
      mikrotik: T.Object({
        status: T.Enum(['healthy', 'degraded', 'unhealthy']),
        responseTime: T.Number({
          minimum: 0
        }),
        lastCheck: T.String({
          format: 'date-time'
        }),
        connectedDevices: T.Optional(T.Integer({
          minimum: 0
        })),
        details: T.Optional(T.Record(T.String(), T.Any()))
      }),
      whatsapp: T.Object({
        status: T.Enum(['healthy', 'degraded', 'unhealthy']),
        responseTime: T.Number({
          minimum: 0
        }),
        lastCheck: T.String({
          format: 'date-time'
        }),
        activeSessions: T.Optional(T.Integer({
          minimum: 0
        })),
        details: T.Optional(T.Record(T.String(), T.Any()))
      }),
      cache: T.Object({
        status: T.Enum(['healthy', 'degraded', 'unhealthy']),
        responseTime: T.Number({
          minimum: 0
        }),
        lastCheck: T.String({
          format: 'date-time'
        }),
        hitRate: T.Optional(T.Number({
          minimum: 0,
          maximum: 100
        })),
        details: T.Optional(T.Record(T.String(), T.Any()))
      })
    }, {
      description: 'Service health information'
    }),
    metrics: T.Object({
      memoryUsage: T.Number({
        minimum: 0,
        maximum: 100,
        description: 'Memory usage percentage'
      }),
      cpuUsage: T.Number({
        minimum: 0,
        maximum: 100,
        description: 'CPU usage percentage'
      }),
      diskUsage: T.Number({
        minimum: 0,
        maximum: 100,
        description: 'Disk usage percentage'
      }),
      activeConnections: T.Integer({
        minimum: 0,
        description: 'Number of active connections'
      }),
      requestsPerMinute: T.Integer({
        minimum: 0,
        description: 'Requests per minute'
      })
    }, {
      description: 'System metrics'
    }),
    errors: T.Optional(T.Array(T.Object({
      service: T.String(),
      error: T.String(),
      timestamp: T.String({
        format: 'date-time'
      })
    }), {
      description: 'Service errors if any'
    }))
  }, {
    description: 'Health check response format'
  }),

  // Batch operation response schema
  batchOperationResponse: T.Object({
    success: T.Boolean(),
    message: T.String({
      minLength: 1,
      maxLength: 500
    }),
    data: T.Object({
      total: T.Integer({
        minimum: 0
      }),
      successful: T.Integer({
        minimum: 0
      }),
      failed: T.Integer({
        minimum: 0
      }),
      skipped: T.Integer({
        minimum: 0,
        default: 0
      }),
      results: T.Array(T.Object({
        index: T.Integer({
          minimum: 0
        }),
        id: T.Optional(T.Union([
          T.Integer({ minimum: 1 }),
          T.String()
        ])),
        success: T.Boolean(),
        error: T.Optional(T.String({
          maxLength: 500
        })),
        data: T.Optional(T.Any())
      }), {
        description: 'Individual operation results'
      }),
      errors: T.Array(T.Object({
        index: T.Integer({
          minimum: 0
        }),
        error: T.String({
          maxLength: 500
        }),
        details: T.Optional(T.Any())
      }), {
        description: 'Failed operations with errors'
      })
    }),
    meta: T.Object({
      timestamp: T.String({
        format: 'date-time'
      }),
      requestId: T.String({
        minLength: 1,
        maxLength: 100
      }),
      processingTime: T.Number({
        minimum: 0
      }),
      batchSize: T.Integer({
        minimum: 1
      })
    })
  }, {
    description: 'Batch operation response format'
  }),

  // File upload response schema
  fileUploadResponse: T.Object({
    success: T.Boolean(),
    message: T.String({
      minLength: 1,
      maxLength: 500
    }),
    data: T.Object({
      filename: T.String({
        minLength: 1,
        maxLength: 255
      }),
      originalName: T.String({
        minLength: 1,
        maxLength: 255
      }),
      mimetype: T.String(),
      size: T.Integer({
        minimum: 0
      }),
      url: T.String({
        format: 'uri'
      }),
      path: T.String(),
      uploadedAt: T.String({
        format: 'date-time'
      }),
      checksum: T.String({
        minLength: 32,
        maxLength: 128
      })
    }),
    meta: T.Object({
      timestamp: T.String({
        format: 'date-time'
      }),
      requestId: T.String({
        minLength: 1,
        maxLength: 100
      }),
      processingTime: T.Number({
        minimum: 0
      })
    })
  }, {
    description: 'File upload response format'
  }),

  // Export response schema
  exportResponse: T.Object({
    success: T.Boolean(),
    message: T.String({
      minLength: 1,
      maxLength: 500
    }),
    data: T.Object({
      exportId: T.String({
        pattern: '^[a-zA-Z0-9_-]+$',
        minLength: 1,
        maxLength: 100
      }),
      filename: T.String({
        minLength: 1,
        maxLength: 255
      }),
      format: T.Enum(['csv', 'xlsx', 'pdf', 'json']),
      size: T.Integer({
        minimum: 0
      }),
      downloadUrl: T.String({
        format: 'uri'
      }),
      expiresAt: T.String({
        format: 'date-time'
      }),
      recordCount: T.Integer({
        minimum: 0
      }),
      createdAt: T.String({
        format: 'date-time'
      })
    }),
    meta: T.Object({
      timestamp: T.String({
        format: 'date-time'
      }),
      requestId: T.String({
        minLength: 1,
        maxLength: 100
      }),
      processingTime: T.Number({
        minimum: 0
      })
    })
  }, {
    description: 'Data export response format'
  }),

  // WebSocket message schema
  websocketMessage: T.Object({
    type: T.Enum(['notification', 'update', 'alert', 'status', 'error'], {
      description: 'Message type'
    }),
    event: T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Event name'
    }),
    data: T.Union([
      T.Object({}, { additionalProperties: true }),
      T.Array(T.Any()),
      T.String(),
      T.Number(),
      T.Boolean()
    ], {
      description: 'Message payload'
    }),
    timestamp: T.String({
      format: 'date-time',
      description: 'Message timestamp'
    }),
    id: T.Optional(T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Message ID'
    })),
    channel: T.Optional(T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Channel name'
    })),
    userId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    sessionId: T.Optional(T.String({
      minLength: 1,
      maxLength: 255
    }))
  }, {
    description: 'WebSocket message format'
  }),

  // Rate limit response schema
  rateLimitResponse: T.Object({
    success: T.Boolean({
      const: false
    }),
    error: T.Object({
      code: T.Literal('RATE_LIMIT_EXCEEDED'),
      message: T.String({
        minLength: 1,
        maxLength: 500
      }),
      details: T.Object({
        limit: T.Integer({
          minimum: 1
        }),
        remaining: T.Integer({
          minimum: 0
        }),
        resetTime: T.Integer({
          minimum: 0,
          description: 'Unix timestamp when limit resets'
        }),
        retryAfter: T.Integer({
          minimum: 1,
          description: 'Seconds to wait before retrying'
        })
      }),
      timestamp: T.String({
        format: 'date-time'
      }),
      requestId: T.String({
        minLength: 1,
        maxLength: 100
      })
    })
  }, {
    description: 'Rate limit exceeded response'
  })
};

module.exports = ResponseSchemas;