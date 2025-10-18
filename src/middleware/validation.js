const SecurityConfig = require('../config/security');

class ValidationMiddleware {
  constructor() {
    this.securityConfig = new SecurityConfig();
  }

  // Generic validation schema validator
  validate(schema) {
    return async (request, reply) => {
      try {
        const { body, query, params } = request;
        const data = { ...body, ...query, ...params };

        const errors = this.validateAgainstSchema(data, schema);

        if (errors.length > 0) {
          return reply.code(400).send({
            success: false,
            message: 'Validation failed',
            errors
          });
        }

        // Sanitize validated data
        if (body) {
          request.body = this.sanitizeData(body, schema);
        }
        if (query) {
          request.query = this.sanitizeData(query, schema);
        }
        if (params) {
          request.params = this.sanitizeData(params, schema);
        }
      } catch (error) {
        console.error('Validation middleware error:', error);
        return reply.code(500).send({
          success: false,
          message: 'Validation error'
        });
      }
    };
  }

  // Validate data against schema
  validateAgainstSchema(data, schema) {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field];

      // Required validation
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }

      // Skip validation if field is optional and not provided
      if (!rules.required && (value === undefined || value === null || value === '')) {
        continue;
      }

      // Type validation
      if (rules.type && !this.validateType(value, rules.type)) {
        errors.push(`${field} must be of type ${rules.type}`);
        continue;
      }

      // Length validation for strings
      if (typeof value === 'string') {
        if (rules.minLength && value.length < rules.minLength) {
          errors.push(`${field} must be at least ${rules.minLength} characters long`);
        }
        if (rules.maxLength && value.length > rules.maxLength) {
          errors.push(`${field} must not exceed ${rules.maxLength} characters`);
        }
      }

      // Numeric validation
      if (rules.type === 'number') {
        if (rules.min !== undefined && value < rules.min) {
          errors.push(`${field} must be at least ${rules.min}`);
        }
        if (rules.max !== undefined && value > rules.max) {
          errors.push(`${field} must not exceed ${rules.max}`);
        }
        if (rules.positive && value <= 0) {
          errors.push(`${field} must be positive`);
        }
      }

      // Email validation
      if (rules.format === 'email' && !this.securityConfig.validateEmail(value)) {
        errors.push(`${field} must be a valid email address`);
      }

      // Username validation
      if (rules.format === 'username' && !this.securityConfig.validateUsername(value)) {
        errors.push(`${field} must be 3-30 characters and contain only letters, numbers, underscores, and hyphens`);
      }

      // Enum validation
      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
      }

      // Pattern validation
      if (rules.pattern && !new RegExp(rules.pattern).test(value)) {
        errors.push(`${field} format is invalid`);
      }

      // Password strength validation
      if (rules.validatePassword && typeof value === 'string') {
        const passwordCheck = this.securityConfig.validatePasswordStrength(value);
        if (!passwordCheck.isValid) {
          errors.push(`${field}: ${passwordCheck.issues.join(', ')}`);
        }
      }
    }

    return errors;
  }

  // Validate data type
  validateType(value, type) {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      default:
        return true;
    }
  }

  // Sanitize data
  sanitizeData(data, schema) {
    const sanitized = {};

    for (const [field, rules] of Object.entries(schema)) {
      if (data[field] !== undefined && data[field] !== null) {
        if (typeof data[field] === 'string') {
          sanitized[field] = this.securityConfig.sanitizeInput(data[field]);
        } else {
          sanitized[field] = data[field];
        }
      }
    }

    return sanitized;
  }

  // SQL injection prevention for database queries
  sanitizeQuery(query, params = []) {
    // Ensure query is a prepared statement
    if (typeof query === 'string' && query.includes('$')) {
      return { query, params };
    }

    throw new Error('Invalid query format - use prepared statements');
  }

  // File upload validation
  validateFileUpload(options = {}) {
    return async (request, reply) => {
      try {
        const file = await request.file();

        if (!file && !options.optional) {
          return reply.code(400).send({
            success: false,
            message: 'File is required'
          });
        }

        if (file) {
          // File size validation
          const maxSize = options.maxSize || 10 * 1024 * 1024; // 10MB default
          if (file.file.readableLength > maxSize) {
            return reply.code(400).send({
              success: false,
              message: `File size exceeds maximum limit of ${maxSize / 1024 / 1024}MB`
            });
          }

          // File type validation
          if (options.allowedTypes && !options.allowedTypes.includes(file.mimetype)) {
            return reply.code(400).send({
              success: false,
              message: `File type ${file.mimetype} is not allowed`
            });
          }

          // Filename validation
          if (file.filename) {
            const safeFilename = file.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
            file.filename = safeFilename;
          }
        }

        request.file = file;
      } catch (error) {
        console.error('File upload validation error:', error);
        return reply.code(500).send({
          success: false,
          message: 'File upload error'
        });
      }
    };
  }

  // Common validation schemas
  static schemas = {
    login: {
      username: {
        type: 'string',
        required: true,
        minLength: 3,
        maxLength: 30,
        format: 'username'
      },
      password: {
        type: 'string',
        required: true,
        minLength: 8
      }
    },

    register: {
      username: {
        type: 'string',
        required: true,
        minLength: 3,
        maxLength: 30,
        format: 'username'
      },
      email: {
        type: 'string',
        required: true,
        format: 'email',
        maxLength: 255
      },
      password: {
        type: 'string',
        required: true,
        minLength: 12,
        validatePassword: true
      },
      confirmPassword: {
        type: 'string',
        required: true
      }
    },

    customer: {
      name: {
        type: 'string',
        required: true,
        minLength: 2,
        maxLength: 100
      },
      email: {
        type: 'string',
        required: false,
        format: 'email',
        maxLength: 255
      },
      phone: {
        type: 'string',
        required: false,
        pattern: '^[+]?[0-9]{10,15}$'
      },
      address: {
        type: 'string',
        required: false,
        maxLength: 500
      },
      balance: {
        type: 'number',
        required: false,
        min: 0,
        default: 0
      }
    },

    voucher: {
      profileId: {
        type: 'string',
        required: true
      },
      quantity: {
        type: 'number',
        required: true,
        min: 1,
        max: 1000
      },
      prefix: {
        type: 'string',
        required: false,
        maxLength: 10,
        pattern: '^[a-zA-Z0-9_-]*$'
      },
      price: {
        type: 'number',
        required: false,
        min: 0,
        positive: true
      }
    },

    payment: {
      customerId: {
        type: 'string',
        required: true
      },
      amount: {
        type: 'number',
        required: true,
        min: 1,
        positive: true
      },
      method: {
        type: 'string',
        required: true,
        enum: ['cash', 'transfer', 'duitku', 'midtrans', 'manual']
      },
      description: {
        type: 'string',
        required: false,
        maxLength: 500
      }
    },

    pagination: {
      page: {
        type: 'number',
        required: false,
        min: 1,
        default: 1
      },
      limit: {
        type: 'number',
        required: false,
        min: 1,
        max: 100,
        default: 20
      },
      search: {
        type: 'string',
        required: false,
        maxLength: 100
      }
    }
  };
}

module.exports = ValidationMiddleware;