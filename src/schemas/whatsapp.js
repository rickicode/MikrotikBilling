// src/schemas/whatsapp.js
/**
 * Mikrotik Billing System - WhatsApp Notification Schemas
 * Comprehensive validation schemas for WhatsApp messaging and template management
 */

const { Type } = require('@sinclair/typebox');
const T = Type;

const CommonSchemas = require('./common');

/**
 * WhatsApp Session Status Enum
 */
const SessionStatus = T.Enum(['connecting', 'connected', 'disconnected', 'qr', 'loading', 'open', 'closed', 'error'], {
  description: 'WhatsApp session connection status'
});

/**
 * Message Status Enum
 */
const MessageStatus = T.Enum(['pending', 'sent', 'delivered', 'read', 'failed', 'deleted'], {
  description: 'WhatsApp message status'
});

/**
 * Message Type Enum
 */
const MessageType = T.Enum(['text', 'image', 'document', 'video', 'audio', 'location', 'contact', 'button', 'list', 'template'], {
  description: 'WhatsApp message type'
});

/**
 * Template Category Enum
 */
const TemplateCategory = T.Enum(['marketing', 'utility', 'authentication'], {
  description: 'WhatsApp message template category'
});

/**
 * WhatsApp Schemas
 */
const WhatsAppSchemas = {
  // WhatsApp session schema
  whatsappSession: T.Object({
    id: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    sessionId: T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Unique session identifier'
    }),
    phoneNumber: CommonSchemas.phone,
    deviceName: T.String({
      minLength: 1,
      maxLength: 100,
      description: 'WhatsApp device name'
    }),
    status: SessionStatus,
    qrCode: T.Optional(T.String({
      description: 'QR code data for authentication'
    })),
    qrCodeExpiry: T.Optional(T.String({
      format: 'date-time',
      description: 'QR code expiry time'
    })),
    isConnected: T.Boolean({
      default: false,
      description: 'Whether session is connected'
    }),
    lastActivity: T.Optional(T.String({
      format: 'date-time',
      description: 'Last activity timestamp'
    })),
    batteryLevel: T.Optional(T.Integer({
      minimum: 0,
      maximum: 100,
      description: 'Device battery level percentage'
    })),
    plugged: T.Optional(T.Boolean({
      description: 'Whether device is plugged in'
    })),
    profilePictureUrl: T.Optional(T.String({
      format: 'uri',
      description: 'Profile picture URL'
    })),
    pushname: T.Optional(T.String({
      maxLength: 100,
      description: 'WhatsApp display name'
    })),
    locationId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    isActive: T.Boolean({
      default: true,
      description: 'Session active status'
    }),
    autoReconnect: T.Boolean({
      default: true,
      description: 'Auto-reconnect on disconnection'
    }),
    maxReconnectAttempts: T.Integer({
      minimum: 0,
      maximum: 10,
      default: 5,
      description: 'Maximum reconnection attempts'
    }),
    metadata: T.Optional(CommonSchemas.metadataObject),
    createdAt: T.Optional(T.String({
      format: 'date-time'
    })),
    updatedAt: T.Optional(T.String({
      format: 'date-time'
    }))
  }, {
    required: ['sessionId', 'phoneNumber', 'deviceName', 'status'],
    description: 'WhatsApp session information',
    examples: [
      {
        sessionId: 'whatsapp-session-1',
        phoneNumber: '+628123456789',
        deviceName: 'Mikrotik Billing System',
        status: 'connected',
        isConnected: true,
        isActive: true,
        autoReconnect: true
      }
    ]
  }),

  // Send message schema
  sendMessage: T.Object({
    sessionId: T.String({
      minLength: 1,
      maxLength: 100,
      description: 'WhatsApp session ID'
    }),
    recipient: CommonSchemas.phone,
    messageType: MessageType,
    content: T.Union([
      T.String({
        minLength: 1,
        maxLength: 4096,
        description: 'Text message content'
      }),
      T.Object({
        url: T.String({
          format: 'uri',
          description: 'Media file URL'
        }),
        caption: T.Optional(T.String({
          maxLength: 1024,
          description: 'Media caption'
        })),
        filename: T.Optional(T.String({
          maxLength: 255,
          description: 'Original filename'
        }))
      }, {
        description: 'Media message content'
      }),
      T.Object({
        latitude: T.Number({
          minimum: -90,
          maximum: 90
        }),
        longitude: T.Number({
          minimum: -180,
          maximum: 180
        }),
        name: T.Optional(T.String({
          maxLength: 100
        })),
        address: T.Optional(T.String({
          maxLength: 200
        }))
      }, {
        description: 'Location message content'
      })
    ], {
      description: 'Message content based on type'
    }),
    templateId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    templateVariables: T.Optional(T.Record(T.String(), T.String(), {
      description: 'Template variable substitutions'
    })),
    priority: T.Integer({
      minimum: 1,
      maximum: 10,
      default: 5,
      description: 'Message priority (1-10)'
    }),
    scheduledAt: T.Optional(T.String({
      format: 'date-time',
      description: 'Schedule message for later delivery'
    })),
    metadata: T.Optional(CommonSchemas.metadataObject)
  }, {
    required: ['sessionId', 'recipient', 'messageType', 'content'],
    description: 'Send WhatsApp message request',
    examples: [
      {
        sessionId: 'whatsapp-session-1',
        recipient: '+628123456789',
        messageType: 'text',
        content: 'Hello, this is a test message from Mikrotik Billing System',
        priority: 5
      }
    ]
  }),

  // Bulk send message schema
  sendBulkMessage: T.Object({
    sessionId: T.String({
      minLength: 1,
      maxLength: 100
    }),
    recipients: T.Array(CommonSchemas.phone, {
      minItems: 1,
      maxItems: 100,
      description: 'List of recipient phone numbers'
    }),
    messageType: MessageType,
    content: T.Union([
      T.String({
        minLength: 1,
        maxLength: 4096
      }),
      T.Object({
        url: T.String({
          format: 'uri'
        }),
        caption: T.Optional(T.String({
          maxLength: 1024
        }))
      })
    ]),
    templateId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    templateVariables: T.Optional(T.Record(T.String(), T.String())),
    delayBetweenMessages: T.Integer({
      minimum: 0,
      maximum: 60,
      default: 1,
      description: 'Delay between messages in seconds'
    }),
    priority: T.Integer({
      minimum: 1,
      maximum: 10,
      default: 5
    }),
    scheduledAt: T.Optional(T.String({
      format: 'date-time'
    })),
    metadata: T.Optional(CommonSchemas.metadataObject)
  }, {
    required: ['sessionId', 'recipients', 'messageType', 'content'],
    description: 'Send bulk WhatsApp messages',
    examples: [
      {
        sessionId: 'whatsapp-session-1',
        recipients: ['+628123456789', '+628123456790'],
        messageType: 'text',
        content: 'System maintenance notification',
        delayBetweenMessages: 2
      }
    ]
  }),

  // Message record schema
  messageRecord: T.Object({
    id: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    messageId: T.String({
      minLength: 1,
      maxLength: 100,
      description: 'WhatsApp message ID'
    }),
    sessionId: T.String({
      minLength: 1,
      maxLength: 100
    }),
    sender: CommonSchemas.phone,
    recipient: CommonSchemas.phone,
    messageType: MessageType,
    content: T.Union([
      T.String(),
      T.Object({
        url: T.String(),
        caption: T.Optional(T.String()),
        filename: T.Optional(T.String())
      }),
      T.Object({
        latitude: T.Number(),
        longitude: T.Number(),
        name: T.Optional(T.String()),
        address: T.Optional(T.String())
      })
    ]),
    status: MessageStatus,
    timestamp: T.String({
      format: 'date-time'
    }),
    deliveredAt: T.Optional(T.String({
      format: 'date-time'
    })),
    readAt: T.Optional(T.String({
      format: 'date-time'
    })),
    error: T.Optional(T.String({
      maxLength: 500,
      description: 'Error message if failed'
    })),
    retryCount: T.Integer({
      minimum: 0,
      maximum: 5,
      default: 0,
      description: 'Number of retry attempts'
    }),
    priority: T.Integer({
      minimum: 1,
      maximum: 10,
      default: 5
    }),
    customerId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    templateId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    metadata: T.Optional(CommonSchemas.metadataObject),
    createdAt: T.Optional(T.String({
      format: 'date-time'
    })),
    updatedAt: T.Optional(T.String({
      format: 'date-time'
    }))
  }, {
    required: ['messageId', 'sessionId', 'sender', 'recipient', 'messageType', 'content', 'status', 'timestamp'],
    description: 'WhatsApp message record'
  }),

  // Template schema
  template: T.Object({
    id: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    name: T.String({
      minLength: 1,
      maxLength: 100,
      pattern: '^[a-z0-9_]+$',
      description: 'Template name (lowercase, numbers, underscores)'
    }),
    displayName: T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Display name for template'
    }),
    category: TemplateCategory,
    language: T.String({
      pattern: '^[a-z]{2}(_[A-Z]{2})?$',
      default: 'id_ID',
      description: 'Template language code (e.g., id_ID, en_US)'
    }),
    content: T.String({
      minLength: 1,
      maxLength: 4096,
      description: 'Template content with variables'
    }),
    variables: T.Array(T.String({
      pattern: '^\\{[a-zA-Z0-9_]+\\}$',
      description: 'Template variables in format {variable_name}'
    }), {
      description: 'List of variables used in template'
    }),
    isActive: T.Boolean({
      default: true,
      description: 'Template active status'
    }),
    isGlobal: T.Boolean({
      default: false,
      description: 'Template available globally'
    }),
    locationId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    description: T.String({
      maxLength: 500,
      description: 'Template description'
    }),
    examples: T.Array(T.Object({
      variables: T.Record(T.String(), T.String()),
      result: T.String({
        description: 'Example result with variables replaced'
      })
    }), {
      maxItems: 3,
      description: 'Template examples'
    }),
    usageCount: T.Integer({
      minimum: 0,
      default: 0,
      description: 'Number of times template has been used'
    }),
    lastUsedAt: T.Optional(T.String({
      format: 'date-time',
      description: 'Last used timestamp'
    })),
    createdBy: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    metadata: T.Optional(CommonSchemas.metadataObject),
    createdAt: T.Optional(T.String({
      format: 'date-time'
    })),
    updatedAt: T.Optional(T.String({
      format: 'date-time'
    }))
  }, {
    required: ['name', 'displayName', 'category', 'language', 'content'],
    description: 'WhatsApp message template',
    examples: [
      {
        name: 'payment_confirmation',
        displayName: 'Payment Confirmation',
        category: 'utility',
        language: 'id_ID',
        content: 'Halo {customer_name}, pembayaran sebesar Rp {amount} telah {status}. Terima kasih.',
        variables: ['{customer_name}', '{amount}', '{status}'],
        isActive: true,
        description: 'Template for payment confirmation notifications'
      }
    ]
  }),

  // Create template schema
  createTemplate: T.Object({
    name: T.String({
      minLength: 1,
      maxLength: 100,
      pattern: '^[a-z0-9_]+$'
    }),
    displayName: T.String({
      minLength: 1,
      maxLength: 100
    }),
    category: TemplateCategory,
    language: T.String({
      pattern: '^[a-z]{2}(_[A-Z]{2})?$',
      default: 'id_ID'
    }),
    content: T.String({
      minLength: 1,
      maxLength: 4096
    }),
    isGlobal: T.Optional(T.Boolean({
      default: false
    })),
    locationId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    description: T.String({
      maxLength: 500
    }),
    examples: T.Array(T.Object({
      variables: T.Record(T.String(), T.String()),
      result: T.String()
    }), {
      maxItems: 3
    }),
    metadata: T.Optional(CommonSchemas.metadataObject)
  }, {
    required: ['name', 'displayName', 'category', 'language', 'content'],
    description: 'Create WhatsApp template'
  }),

  // Message search and filter schema
  messageSearchQuery: T.Object({
    search: T.Optional(T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Search message content or phone numbers'
    })),
    sessionId: T.Optional(T.String({
      minLength: 1,
      maxLength: 100
    })),
    sender: T.Optional(CommonSchemas.phone),
    recipient: T.Optional(CommonSchemas.phone),
    messageType: T.Optional(MessageType),
    status: T.Optional(MessageStatus),
    templateId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    customerId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    timestampFrom: T.Optional(T.String({
      format: 'date-time'
    })),
    timestampTo: T.Optional(T.String({
      format: 'date-time'
    })),
    hasError: T.Optional(T.Boolean({
      description: 'Filter messages with errors'
    })),
    locationId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    ...CommonSchemas.paginationQuery.properties
  }, {
    description: 'Message search and filter parameters'
  }),

  // WhatsApp statistics schema
  whatsappStats: T.Object({
    totalSessions: T.Integer({
      minimum: 0,
      description: 'Total WhatsApp sessions'
    }),
    activeSessions: T.Integer({
      minimum: 0,
      description: 'Number of active sessions'
    }),
    connectedSessions: T.Integer({
      minimum: 0,
      description: 'Number of connected sessions'
    }),
    totalMessages: T.Integer({
      minimum: 0,
      description: 'Total messages sent'
    }),
    sentMessages: T.Integer({
      minimum: 0,
      description: 'Number of sent messages'
    }),
    deliveredMessages: T.Integer({
      minimum: 0,
      description: 'Number of delivered messages'
    }),
    readMessages: T.Integer({
      minimum: 0,
      description: 'Number of read messages'
    }),
    failedMessages: T.Integer({
      minimum: 0,
      description: 'Number of failed messages'
    }),
    totalTemplates: T.Integer({
      minimum: 0,
      description: 'Total message templates'
    }),
    activeTemplates: T.Integer({
      minimum: 0,
      description: 'Number of active templates'
    }),
    messagesByType: T.Record(T.String(), T.Integer(), {
      description: 'Message count by type'
    }),
    messagesByStatus: T.Record(T.String(), T.Integer(), {
      description: 'Message count by status'
    }),
    messagesBySession: T.Array(T.Object({
      sessionId: T.String(),
      sessionPhone: T.String(),
      messageCount: T.Integer(),
      successRate: T.Number()
    }), {
      maxItems: 10,
      description: 'Top sessions by message count'
    }),
    dailyStats: T.Array(T.Object({
      date: T.String(),
      sentCount: T.Integer(),
      deliveredCount: T.Integer(),
      readCount: T.Integer(),
      failedCount: T.Integer()
    }), {
      maxItems: 30,
      description: 'Daily statistics for the last 30 days'
    }),
    topTemplates: T.Array(T.Object({
      templateId: T.Union([T.Integer(), T.String()]),
      templateName: T.String(),
      usageCount: T.Integer(),
      lastUsedAt: T.String()
    }), {
      maxItems: 10,
      description: 'Most used templates'
    })
  }, {
    description: 'WhatsApp system statistics and analytics'
  }),

  // WhatsApp configuration schema
  whatsappConfig: T.Object({
    id: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    name: T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Configuration name'
    }),
    maxSessions: T.Integer({
      minimum: 1,
      maximum: 10,
      default: 3,
      description: 'Maximum number of concurrent sessions'
    }),
    messageQueueSize: T.Integer({
      minimum: 100,
      maximum: 10000,
      default: 1000,
      description: 'Message queue size'
    }),
    rateLimiting: T.Object({
      enabled: T.Boolean({
        default: true,
        description: 'Enable rate limiting'
      }),
      messagesPerSecond: T.Integer({
        minimum: 1,
        maximum: 10,
        default: 1,
        description: 'Messages per second per session'
      }),
      burstLimit: T.Integer({
        minimum: 1,
        maximum: 50,
        default: 10,
        description: 'Burst limit for messages'
      })
    }, {
      description: 'Rate limiting configuration'
    }),
    retryPolicy: T.Object({
      enabled: T.Boolean({
        default: true,
        description: 'Enable retry policy'
      }),
      maxRetries: T.Integer({
        minimum: 0,
        maximum: 5,
        default: 3,
        description: 'Maximum retry attempts'
      }),
      retryDelay: T.Integer({
        minimum: 1,
        maximum: 300,
        default: 30,
        description: 'Retry delay in seconds'
      }),
      backoffMultiplier: T.Number({
        minimum: 1,
        maximum: 5,
        default: 2,
        description: 'Backoff multiplier for retries'
      })
    }, {
      description: 'Retry policy configuration'
    }),
    sessionTimeout: T.Integer({
      minimum: 60,
      maximum: 3600,
      default: 300,
      description: 'Session timeout in seconds'
    }),
    autoReconnect: T.Boolean({
      default: true,
      description: 'Enable auto-reconnect'
    }),
    logLevel: T.Enum(['error', 'warn', 'info', 'debug'], {
      default: 'info',
      description: 'Logging level'
    }),
    webhooks: T.Optional(T.Array(T.Object({
      event: T.Enum(['message_sent', 'message_delivered', 'message_read', 'session_connected', 'session_disconnected', 'error']),
      url: T.String({
        format: 'uri'
      }),
      secret: T.Optional(T.String({
        minLength: 16,
        description: 'Webhook secret for verification'
      }))
    }), {
      description: 'Webhook configurations'
    })),
    isActive: T.Boolean({
      default: true,
      description: 'Configuration active status'
    }),
    metadata: T.Optional(CommonSchemas.metadataObject),
    createdAt: T.Optional(T.String({
      format: 'date-time'
    })),
    updatedAt: T.Optional(T.String({
      format: 'date-time'
    }))
  }, {
    required: ['name'],
    description: 'WhatsApp system configuration'
  }),

  // WhatsApp export schema
  whatsappExport: T.Object({
    exportType: T.Enum(['messages', 'templates', 'sessions', 'statistics'], {
      description: 'Type of data to export'
    }),
    format: T.Enum(['csv', 'xlsx', 'json'], {
      default: 'csv',
      description: 'Export file format'
    }),
    filters: T.Optional(T.Union([
      T.Object({
        search: T.Optional(T.String({
          minLength: 1,
          maxLength: 100,
          description: 'Search message content or phone numbers'
        })),
        sessionId: T.Optional(T.String({
          minLength: 1,
          maxLength: 100
        })),
        sender: T.Optional(CommonSchemas.phone),
        recipient: T.Optional(CommonSchemas.phone),
        messageType: T.Optional(T.Enum(['text', 'image', 'document', 'video', 'audio', 'location', 'contact', 'button', 'list', 'template'])),
        status: T.Optional(T.Enum(['pending', 'sent', 'delivered', 'read', 'failed', 'deleted'])),
        templateId: T.Optional(T.Union([
          T.Integer({ minimum: 1 }),
          T.String({ pattern: CommonSchemas.UUIDPattern })
        ])),
        customerId: T.Optional(T.Union([
          T.Integer({ minimum: 1 }),
          T.String({ pattern: CommonSchemas.UUIDPattern })
        ])),
        timestampFrom: T.Optional(T.String({
          format: 'date-time'
        })),
        timestampTo: T.Optional(T.String({
          format: 'date-time'
        })),
        hasError: T.Optional(T.Boolean({
          description: 'Filter messages with errors'
        })),
        locationId: T.Optional(T.Union([
          T.Integer({ minimum: 1 }),
          T.String({ pattern: CommonSchemas.UUIDPattern })
        ])),
        ...CommonSchemas.paginationQuery.properties
      }),
      T.Object({
        sessionId: T.Optional(T.String()),
        status: T.Optional(SessionStatus),
        isActive: T.Optional(T.Boolean())
      })
    ])),
    fields: T.Optional(T.Array(T.Enum([
      'id', 'messageId', 'sender', 'recipient', 'messageType', 'content', 'status',
      'timestamp', 'deliveredAt', 'readAt', 'sessionId', 'templateName'
    ]), {
      description: 'Fields to include in export'
    })),
    dateRange: T.Optional(CommonSchemas.dateRangeQuery),
    includeHeaders: T.Optional(T.Boolean({
      default: true,
      description: 'Include column headers in export'
    }))
  }, {
    description: 'Schema for WhatsApp data export'
  })
};

module.exports = WhatsAppSchemas;