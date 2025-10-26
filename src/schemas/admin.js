// src/schemas/admin.js
/**
 * Mikrotik Billing System - Admin User and Authentication Schemas
 * Comprehensive validation schemas for admin users, roles, and authentication with security validation
 */

const { Type } = require('@sinclair/typebox');
const T = Type;

const CommonSchemas = require('./common');

/**
 * Admin Role Enum
 */
const AdminRole = T.Enum(['super_admin', 'admin', 'operator', 'viewer'], {
  description: 'Admin user role with different permission levels'
});

/**
 * Admin Status Enum
 */
const AdminStatus = T.Enum(['active', 'inactive', 'suspended', 'locked'], {
  description: 'Admin account status'
});

/**
 * Authentication Method Enum
 */
const AuthMethod = T.Enum(['password', '2fa', 'sso', 'api_key'], {
  description: 'Authentication method for admin login'
});

/**
 * Session Status Enum
 */
const SessionStatus = T.Enum(['active', 'expired', 'terminated', 'suspended'], {
  description: 'Admin session status'
});

/**
 * Admin Schemas
 */
const AdminSchemas = {
  // Admin user schema
  adminUser: T.Object({
    id: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    username: CommonSchemas.username,
    email: CommonSchemas.email,
    passwordHash: T.String({
      minLength: 60,
      maxLength: 255,
      description: 'Hashed password (bcrypt)'
    }),
    role: AdminRole,
    status: AdminStatus,
    firstName: CommonSchemas.name,
    lastName: T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Last name'
    }),
    fullName: T.String({
      minLength: 1,
      maxLength: 200,
      description: 'Full name'
    }),
    phone: T.Optional(CommonSchemas.phone),
    avatar: T.Optional(T.String({
      format: 'uri',
      description: 'Profile avatar URL'
    })),
    lastLoginAt: T.Optional(T.String({
      format: 'date-time',
      description: 'Last login timestamp'
    })),
    lastLoginIp: T.Optional(CommonSchemas.ipAddress),
    loginAttempts: T.Integer({
      minimum: 0,
      maximum: 10,
      default: 0,
      description: 'Number of failed login attempts'
    }),
    lockedUntil: T.Optional(T.String({
      format: 'date-time',
      description: 'Account locked until timestamp'
    })),
    twoFactorEnabled: T.Boolean({
      default: false,
      description: 'Two-factor authentication enabled'
    }),
    twoFactorSecret: T.Optional(T.String({
      description: 'Two-factor authentication secret (encrypted)'
    })),
    apiKeys: T.Array(T.String({
      pattern: '^[a-zA-Z0-9_-]{32,128}$',
      description: 'API keys for authentication'
    }), {
      maxItems: 5,
      description: 'API keys associated with user'
    }),
    permissions: T.Array(T.String({
      pattern: '^[a-z_:]+$',
      description: 'Custom permissions (lowercase with underscores)'
    }), {
      description: 'Additional permissions beyond role permissions'
    }),
    locationIds: T.Array(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]), {
      description: 'Location IDs this admin has access to'
    }),
    preferences: T.Object({
      language: T.String({
        pattern: '^[a-z]{2}(_[A-Z]{2})?$',
        default: 'id_ID',
        description: 'Interface language preference'
      }),
      timezone: T.String({
        pattern: '^[A-Za-z_]+/[A-Za-z_]+$',
        default: 'Asia/Jakarta',
        description: 'Timezone preference'
      }),
      theme: T.Enum(['light', 'dark', 'auto'], {
        default: 'light',
        description: 'UI theme preference'
      }),
      notifications: T.Object({
        email: T.Boolean({
          default: true
        }),
        sms: T.Boolean({
          default: false
        }),
        push: T.Boolean({
          default: true
        }),
        whatsapp: T.Boolean({
          default: false
        })
      }, {
        description: 'Notification preferences'
      }),
      dashboard: T.Object({
        defaultView: T.Enum(['overview', 'customers', 'payments', 'vouchers', 'pppoe'], {
          default: 'overview'
        }),
        itemsPerPage: T.Integer({
          minimum: 10,
          maximum: 100,
          default: 20
        }),
        refreshInterval: T.Integer({
          minimum: 30,
          maximum: 300,
          default: 60,
          description: 'Dashboard refresh interval in seconds'
        })
      }, {
        description: 'Dashboard preferences'
      })
    }, {
      description: 'User preferences'
    }),
    metadata: T.Optional(CommonSchemas.metadataObject),
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
    required: ['username', 'email', 'passwordHash', 'role', 'status', 'firstName', 'lastName', 'fullName'],
    description: 'Complete admin user record',
    examples: [
      {
        username: 'admin123',
        email: 'admin@mikrotik-billing.com',
        passwordHash: '$2b$12$hashedpasswordexample',
        role: 'admin',
        status: 'active',
        firstName: 'John',
        lastName: 'Doe',
        fullName: 'John Doe',
        phone: '+628123456789',
        twoFactorEnabled: false,
        preferences: {
          language: 'id_ID',
          timezone: 'Asia/Jakarta',
          theme: 'light'
        }
      }
    ]
  }),

  // Create admin user schema
  createAdminUser: T.Object({
    username: CommonSchemas.username,
    email: CommonSchemas.email,
    password: CommonSchemas.password,
    confirmPassword: T.String({
      description: 'Password confirmation (must match password)'
    }),
    role: AdminRole,
    firstName: CommonSchemas.name,
    lastName: T.String({
      minLength: 1,
      maxLength: 100
    }),
    phone: T.Optional(CommonSchemas.phone),
    locationIds: T.Optional(T.Array(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]))),
    permissions: T.Optional(T.Array(T.String({
      pattern: '^[a-z_:]+$'
    }))),
    twoFactorEnabled: T.Optional(T.Boolean({
      default: false
    })),
    sendWelcomeEmail: T.Optional(T.Boolean({
      default: true,
      description: 'Send welcome email to new admin'
    })),
    metadata: T.Optional(CommonSchemas.metadataObject)
  }, {
    required: ['username', 'email', 'password', 'confirmPassword', 'role', 'firstName', 'lastName'],
    description: 'Schema for creating new admin user',
    examples: [
      {
        username: 'newadmin',
        email: 'newadmin@example.com',
        password: 'SecurePass123!@#',
        confirmPassword: 'SecurePass123!@#',
        role: 'operator',
        firstName: 'New',
        lastName: 'Admin',
        twoFactorEnabled: false
      }
    ]
  }),

  // Login schema
  adminLogin: T.Object({
    username: T.Union([
      CommonSchemas.username,
      CommonSchemas.email
    ], {
      description: 'Username or email for login'
    }),
    password: T.String({
      minLength: 1,
      maxLength: 128,
      description: 'Password'
    }),
    rememberMe: T.Optional(T.Boolean({
      default: false,
      description: 'Remember login for extended session'
    })),
    twoFactorCode: T.Optional(T.String({
      pattern: '^[0-9]{6}$',
      description: 'Two-factor authentication code'
    })),
    captchaToken: T.Optional(T.String({
      description: 'Captcha token for bot protection'
    }))
  }, {
    required: ['username', 'password'],
    description: 'Admin login request',
    examples: [
      {
        username: 'admin123',
        password: 'mypassword123',
        rememberMe: true
      }
    ]
  }),

  // Update admin user schema
  updateAdminUser: T.Object({
    email: T.Optional(CommonSchemas.email),
    firstName: T.Optional(CommonSchemas.name),
    lastName: T.Optional(T.String({
      minLength: 1,
      maxLength: 100
    })),
    phone: T.Optional(CommonSchemas.phone),
    avatar: T.Optional(T.String({
      format: 'uri'
    })),
    role: T.Optional(AdminRole),
    status: T.Optional(AdminStatus),
    locationIds: T.Optional(T.Array(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]))),
    permissions: T.Optional(T.Array(T.String({
      pattern: '^[a-z_:]+$'
    }))),
    preferences: T.Optional(T.Object({
      language: T.Optional(T.String({
        pattern: '^[a-z]{2}(_[A-Z]{2})?$'
      })),
      timezone: T.Optional(T.String({
        pattern: '^[A-Za-z_]+/[A-Za-z_]+$'
      })),
      theme: T.Optional(T.Enum(['light', 'dark', 'auto'])),
      notifications: T.Optional(T.Object({
        email: T.Optional(T.Boolean()),
        sms: T.Optional(T.Boolean()),
        push: T.Optional(T.Boolean()),
        whatsapp: T.Optional(T.Boolean())
      })),
      dashboard: T.Optional(T.Object({
        defaultView: T.Optional(T.Enum(['overview', 'customers', 'payments', 'vouchers', 'pppoe'])),
        itemsPerPage: T.Optional(T.Integer({
          minimum: 10,
          maximum: 100
        })),
        refreshInterval: T.Optional(T.Integer({
          minimum: 30,
          maximum: 300
        }))
      }))
    })),
    metadata: T.Optional(CommonSchemas.metadataObject)
  }, {
    description: 'Schema for updating existing admin user'
  }),

  // Change password schema
  changePassword: T.Object({
    currentPassword: T.String({
      minLength: 1,
      maxLength: 128,
      description: 'Current password'
    }),
    newPassword: CommonSchemas.password,
    confirmPassword: T.String({
      description: 'Confirm new password'
    })
  }, {
    required: ['currentPassword', 'newPassword', 'confirmPassword'],
    description: 'Change password request'
  }),

  // Admin session schema
  adminSession: T.Object({
    id: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    sessionId: T.String({
      minLength: 32,
      maxLength: 255,
      description: 'Session identifier'
    }),
    adminId: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    adminUsername: T.String({
      minLength: 3,
      maxLength: 30
    }),
    ipAddress: CommonSchemas.ipAddress,
    userAgent: T.String({
      maxLength: 500,
      description: 'Browser user agent string'
    }),
    status: SessionStatus,
    loginAt: T.String({
      format: 'date-time',
      description: 'Login timestamp'
    }),
    lastActivityAt: T.String({
      format: 'date-time',
      description: 'Last activity timestamp'
    }),
    expiresAt: T.String({
      format: 'date-time',
      description: 'Session expiry timestamp'
    }),
    rememberMe: T.Boolean({
      default: false,
      description: 'Extended session duration'
    }),
    twoFactorVerified: T.Boolean({
      default: false,
      description: 'Two-factor authentication verified'
    }),
    location: T.Object({
      country: T.Optional(T.String({
        maxLength: 100
      })),
      region: T.Optional(T.String({
        maxLength: 100
      })),
      city: T.Optional(T.String({
        maxLength: 100
      })),
      timezone: T.Optional(T.String({
        maxLength: 100
      }))
    }, {
      description: 'Login location information'
    }),
    metadata: T.Optional(CommonSchemas.metadataObject),
    createdAt: T.Optional(T.String({
      format: 'date-time'
    })),
    updatedAt: T.Optional(T.String({
      format: 'date-time'
    }))
  }, {
    required: ['sessionId', 'adminId', 'adminUsername', 'ipAddress', 'status', 'loginAt', 'lastActivityAt', 'expiresAt'],
    description: 'Admin session record'
  }),

  // API key schema
  apiKey: T.Object({
    id: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    keyId: T.String({
      pattern: '^[a-zA-Z0-9_-]{8,32}$',
      description: 'API key identifier'
    }),
    keyValue: T.String({
      pattern: '^[a-zA-Z0-9_-]{32,128}$',
      description: 'API key value'
    }),
    adminId: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    name: T.String({
      minLength: 1,
      maxLength: 100,
      description: 'API key display name'
    }),
    description: T.String({
      maxLength: 500,
      description: 'API key description'
    }),
    permissions: T.Array(T.String({
      pattern: '^[a-z_:]+$',
      description: 'API permissions (e.g., read_customers, write_payments)'
    }), {
      minItems: 1,
      description: 'Permissions granted to this API key'
    }),
    isActive: T.Boolean({
      default: true,
      description: 'API key active status'
    }),
    lastUsedAt: T.Optional(T.String({
      format: 'date-time',
      description: 'Last usage timestamp'
    })),
    expiresAt: T.Optional(T.String({
      format: 'date-time',
      description: 'API key expiry date'
    })),
    rateLimitPerHour: T.Integer({
      minimum: 1,
      maximum: 10000,
      default: 1000,
      description: 'Rate limit per hour'
    }),
    allowedIPs: T.Optional(T.Array(CommonSchemas.ipAddress, {
      maxItems: 10,
      description: 'Allowed IP addresses for this API key'
    })),
    metadata: T.Optional(CommonSchemas.metadataObject),
    createdBy: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    createdAt: T.Optional(T.String({
      format: 'date-time'
    })),
    updatedAt: T.Optional(T.String({
      format: 'date-time'
    }))
  }, {
    required: ['keyId', 'keyValue', 'adminId', 'name', 'permissions'],
    description: 'API key record'
  }),

  // Create API key schema
  createApiKey: T.Object({
    name: T.String({
      minLength: 1,
      maxLength: 100
    }),
    description: T.String({
      maxLength: 500
    }),
    permissions: T.Array(T.String({
      pattern: '^[a-z_:]+$'
    }), {
      minItems: 1
    }),
    expiresAt: T.Optional(T.String({
      format: 'date-time'
    })),
    rateLimitPerHour: T.Optional(T.Integer({
      minimum: 1,
      maximum: 10000,
      default: 1000
    })),
    allowedIPs: T.Optional(T.Array(CommonSchemas.ipAddress, {
      maxItems: 10
    })),
    metadata: T.Optional(CommonSchemas.metadataObject)
  }, {
    required: ['name', 'permissions'],
    description: 'Create new API key'
  }),

  // Admin search and filter schema
  adminSearchQuery: T.Object({
    search: T.Optional(T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Search username, email, or name'
    })),
    role: T.Optional(AdminRole),
    status: T.Optional(AdminStatus),
    locationId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    createdFrom: T.Optional(T.String({
      format: 'date'
    })),
    createdTo: T.Optional(T.String({
      format: 'date'
    })),
    lastLoginFrom: T.Optional(T.String({
      format: 'date-time'
    })),
    lastLoginTo: T.Optional(T.String({
      format: 'date-time'
    })),
    twoFactorEnabled: T.Optional(T.Boolean()),
    hasApiKeys: T.Optional(T.Boolean()),
    ...CommonSchemas.paginationQuery.properties
  }, {
    description: 'Admin user search and filter parameters'
  }),

  // Admin activity log schema
  adminActivityLog: T.Object({
    id: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    adminId: T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ]),
    adminUsername: T.String({
      minLength: 3,
      maxLength: 30
    }),
    action: T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Action performed (e.g., create_customer, update_payment)'
    }),
    resource: T.String({
      minLength: 1,
      maxLength: 100,
      description: 'Resource type (e.g., customer, payment, voucher)'
    }),
    resourceId: T.Optional(T.Union([
      T.Integer({ minimum: 1 }),
      T.String({ pattern: CommonSchemas.UUIDPattern })
    ])),
    details: T.Record(T.String(), T.Any(), {
      description: 'Action details and changes'
    }),
    ipAddress: CommonSchemas.ipAddress,
    userAgent: T.String({
      maxLength: 500
    }),
    timestamp: T.String({
      format: 'date-time'
    }),
    location: T.Optional(T.Object({
      country: T.Optional(T.String()),
      region: T.Optional(T.String()),
      city: T.Optional(T.String())
    })),
    success: T.Boolean({
      description: 'Action completed successfully'
    }),
    errorMessage: T.Optional(T.String({
      maxLength: 1000,
      description: 'Error message if action failed'
    })),
    sessionId: T.Optional(T.String({
      maxLength: 255
    })),
    metadata: T.Optional(CommonSchemas.metadataObject)
  }, {
    required: ['adminId', 'adminUsername', 'action', 'resource', 'details', 'ipAddress', 'timestamp', 'success'],
    description: 'Admin activity log record'
  }),

  // Admin statistics schema
  adminStats: T.Object({
    totalAdmins: T.Integer({
      minimum: 0,
      description: 'Total number of admin users'
    }),
    activeAdmins: T.Integer({
      minimum: 0,
      description: 'Number of active admin users'
    }),
    inactiveAdmins: T.Integer({
      minimum: 0,
      description: 'Number of inactive admin users'
    }),
    suspendedAdmins: T.Integer({
      minimum: 0,
      description: 'Number of suspended admin users'
    }),
    activeSessions: T.Integer({
      minimum: 0,
      description: 'Number of active sessions'
    }),
    totalApiKeys: T.Integer({
      minimum: 0,
      description: 'Total number of API keys'
    }),
    activeApiKeys: T.Integer({
      minimum: 0,
      description: 'Number of active API keys'
    }),
    twoFactorEnabledUsers: T.Integer({
      minimum: 0,
      description: 'Number of users with 2FA enabled'
    }),
    loginsToday: T.Integer({
      minimum: 0,
      description: 'Number of logins today'
    }),
    failedLoginsToday: T.Integer({
      minimum: 0,
      description: 'Number of failed login attempts today'
    }),
    adminsByRole: T.Record(T.String(), T.Integer(), {
      description: 'Admin count by role'
    }),
    adminsByStatus: T.Record(T.String(), T.Integer(), {
      description: 'Admin count by status'
    }),
    loginsByDay: T.Array(T.Object({
      date: T.String(),
      successfulLogins: T.Integer(),
      failedLogins: T.Integer(),
      uniqueUsers: T.Integer()
    }), {
      maxItems: 30,
      description: 'Daily login statistics for the last 30 days'
    }),
    topActiveUsers: T.Array(T.Object({
      adminId: T.Union([T.Integer(), T.String()]),
      username: T.String(),
      loginCount: T.Integer(),
      lastLoginAt: T.String()
    }), {
      maxItems: 10,
      description: 'Top 10 most active users'
    }),
    recentActivity: T.Array(T.Object({
      adminUsername: T.String(),
      action: T.String(),
      resource: T.String(),
      timestamp: T.String(),
      success: T.Boolean()
    }), {
      maxItems: 20,
      description: 'Recent admin activities'
    })
  }, {
    description: 'Admin system statistics and analytics'
  }),

  // Password reset request schema
  passwordResetRequest: T.Object({
    email: CommonSchemas.email,
    captchaToken: T.Optional(T.String({
      description: 'Captcha token for bot protection'
    }))
  }, {
    required: ['email'],
    description: 'Password reset request'
  }),

  // Password reset confirmation schema
  passwordResetConfirm: T.Object({
    token: T.String({
      minLength: 32,
      maxLength: 255,
      description: 'Password reset token'
    }),
    newPassword: CommonSchemas.password,
    confirmPassword: T.String({
      description: 'Confirm new password'
    })
  }, {
    required: ['token', 'newPassword', 'confirmPassword'],
    description: 'Password reset confirmation'
  }),

  // Two-factor setup schema
  twoFactorSetup: T.Object({
    secret: T.String({
      minLength: 32,
      maxLength: 32,
      description: 'Two-factor authentication secret'
    }),
    qrCode: T.String({
      format: 'uri',
      description: 'QR code URL for 2FA setup'
    }),
    backupCodes: T.Array(T.String({
      pattern: '^[0-9]{8}$',
      description: '8-digit backup codes'
    }), {
      minItems: 10,
      maxItems: 10,
      description: 'Backup codes for account recovery'
    }),
    instructions: T.Array(T.String({
      maxLength: 200
    }), {
      description: 'Setup instructions'
    })
  }, {
    description: 'Two-factor authentication setup response'
  }),

  // Admin export schema
  adminExport: T.Object({
    format: T.Enum(['csv', 'xlsx', 'pdf'], {
      default: 'csv',
      description: 'Export file format'
    }),
    filters: T.Optional(T.Object({
      search: T.Optional(T.String({
        minLength: 1,
        maxLength: 100,
        description: 'Search username, email, or name'
      })),
      role: T.Optional(T.Enum(['super_admin', 'admin', 'operator', 'viewer'])),
      status: T.Optional(T.Enum(['active', 'inactive', 'suspended', 'locked'])),
      locationId: T.Optional(T.Union([
        T.Integer({ minimum: 1 }),
        T.String({ pattern: CommonSchemas.UUIDPattern })
      ])),
      createdFrom: T.Optional(T.String({
        format: 'date'
      })),
      createdTo: T.Optional(T.String({
        format: 'date'
      })),
      lastLoginFrom: T.Optional(T.String({
        format: 'date-time'
      })),
      lastLoginTo: T.Optional(T.String({
        format: 'date-time'
      })),
      twoFactorEnabled: T.Optional(T.Boolean()),
      hasApiKeys: T.Optional(T.Boolean()),
      ...CommonSchemas.paginationQuery.properties
    })),
    fields: T.Optional(T.Array(T.Enum([
      'id', 'username', 'email', 'role', 'status', 'firstName', 'lastName',
      'phone', 'lastLoginAt', 'createdAt', 'updatedAt'
    ]), {
      description: 'Fields to include in export'
    })),
    includeSensitiveData: T.Optional(T.Boolean({
      default: false,
      description: 'Include sensitive data (use with caution)'
    })),
    includeHeaders: T.Optional(T.Boolean({
      default: true,
      description: 'Include column headers in export'
    }))
  }, {
    description: 'Schema for admin user data export'
  })
};

module.exports = AdminSchemas;