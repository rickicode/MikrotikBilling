/**
 * Customer Route Validators
 * Schema validation for customer endpoints
 * @version 1.0.0
 */

class CustomerValidators {
  constructor() {
    this.registered = false;
    this.schemas = this.generateSchemas();
  }

  /**
   * Register customer validators with Fastify
   */
  register(fastify) {
    if (this.registered) {
      return;
    }

    // Add all schemas to Fastify
    Object.keys(this.schemas).forEach(key => {
      fastify.addSchema(this.schemas[key]);
    });

    // Decorate Fastify instance with customer validators
    fastify.decorate('customerValidators', this);
    this.registered = true;

    fastify.log.info('Customer validators registered');
  }

  /**
   * Generate all customer-related schemas
   */
  generateSchemas() {
    return {
      // Customer base schema
      customerBase: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            pattern: '^[a-zA-Z\\s\\-\'\\.]+$',
            description: 'Customer full name'
          },
          email: {
            type: 'string',
            format: 'email',
            maxLength: 255,
            description: 'Customer email address'
          },
          phone: {
            type: 'string',
            minLength: 10,
            maxLength: 20,
            pattern: '^\\+?[1-9]\\d{1,14}$',
            description: 'Customer phone number (international format)'
          },
          address: {
            type: 'string',
            maxLength: 500,
            description: 'Customer address'
          },
          notes: {
            type: 'string',
            maxLength: 1000,
            description: 'Additional notes about customer'
          },
          is_active: {
            type: 'boolean',
            default: true,
            description: 'Whether customer is active'
          }
        }
      },

      // Customer creation schema
      customerCreate: {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            pattern: '^[a-zA-Z\\s\\-\'\\.]+$',
            description: 'Customer full name (required)'
          },
          email: {
            type: 'string',
            format: 'email',
            maxLength: 255,
            description: 'Customer email address (optional)'
          },
          phone: {
            type: 'string',
            minLength: 10,
            maxLength: 20,
            pattern: '^\\+?[1-9]\\d{1,14}$',
            description: 'Customer phone number (optional)'
          },
          address: {
            type: 'string',
            maxLength: 500,
            description: 'Customer address (optional)'
          },
          notes: {
            type: 'string',
            maxLength: 1000,
            description: 'Additional notes about customer (optional)'
          },
          is_active: {
            type: 'boolean',
            default: true,
            description: 'Whether customer is active (default: true)'
          }
        },
        additionalProperties: false
      },

      // Customer update schema
      customerUpdate: {
        type: 'object',
        minProperties: 1,
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            pattern: '^[a-zA-Z\\s\\-\'\\.]+$',
            description: 'Customer full name'
          },
          email: {
            type: 'string',
            format: 'email',
            maxLength: 255,
            description: 'Customer email address'
          },
          phone: {
            type: 'string',
            minLength: 10,
            maxLength: 20,
            pattern: '^\\+?[1-9]\\d{1,14}$',
            description: 'Customer phone number'
          },
          address: {
            type: 'string',
            maxLength: 500,
            description: 'Customer address'
          },
          notes: {
            type: 'string',
            maxLength: 1000,
            description: 'Additional notes about customer'
          },
          is_active: {
            type: 'boolean',
            description: 'Whether customer is active'
          }
        },
        additionalProperties: false
      },

      // Customer ID parameter schema
      customerId: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Customer UUID'
          }
        }
      },

      // Customer list query schema
      customerList: {
        type: 'object',
        properties: {
          page: {
            type: 'integer',
            minimum: 1,
            default: 1,
            description: 'Page number for pagination'
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 20,
            description: 'Number of items per page (max 100)'
          },
          search: {
            type: 'string',
            maxLength: 100,
            description: 'Search term for name, email, phone, or address'
          },
          status: {
            type: 'string',
            enum: ['active', 'inactive'],
            description: 'Filter by customer status'
          },
          sort: {
            type: 'string',
            enum: ['name', 'created_at', 'updated_at', 'email'],
            default: 'created_at',
            description: 'Field to sort by'
          },
          order: {
            type: 'string',
            enum: ['ASC', 'DESC'],
            default: 'DESC',
            description: 'Sort order (ascending or descending)'
          },
          created_after: {
            type: 'string',
            format: 'date-time',
            description: 'Filter customers created after this date'
          },
          created_before: {
            type: 'string',
            format: 'date-time',
            description: 'Filter customers created before this date'
          },
          has_balance: {
            type: 'boolean',
            description: 'Filter customers with/without balance'
          },
          has_debt: {
            type: 'boolean',
            description: 'Filter customers with/without debt'
          }
        }
      },

      // Balance adjustment schema
      balanceAdjustment: {
        type: 'object',
        required: ['amount', 'type'],
        properties: {
          amount: {
            type: 'number',
            minimum: 0,
            maximum: 999999.99,
            description: 'Amount to adjust (positive number)'
          },
          type: {
            type: 'string',
            enum: ['credit', 'debit'],
            description: 'Type of adjustment: credit (add) or debit (subtract)'
          },
          description: {
            type: 'string',
            maxLength: 500,
            description: 'Description for the adjustment'
          }
        },
        additionalProperties: false
      },

      // Customer response schema
      customerResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              email: { type: ['string', 'null'] },
              phone: { type: ['string', 'null'] },
              address: { type: ['string', 'null'] },
              notes: { type: ['string', 'null'] },
              balance: { type: 'number' },
              debt: { type: 'number' },
              is_active: { type: 'boolean' },
              created_at: { type: 'string', format: 'date-time' },
              updated_at: { type: 'string', format: 'date-time' }
            }
          },
          message: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' }
        }
      },

      // Customer list response schema
      customerListResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                email: { type: ['string', 'null'] },
                phone: { type: ['string', 'null'] },
                address: { type: ['string', 'null'] },
                balance: { type: 'number' },
                debt: { type: 'number' },
                is_active: { type: 'boolean' },
                subscription_count: { type: 'integer' },
                total_payments: { type: 'number' },
                created_at: { type: 'string', format: 'date-time' }
              }
            }
          },
          message: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
          pagination: {
            type: 'object',
            properties: {
              page: { type: 'integer' },
              limit: { type: 'integer' },
              total: { type: 'integer' },
              totalPages: { type: 'integer' },
              hasNextPage: { type: 'boolean' },
              hasPrevPage: { type: 'boolean' },
              nextPage: { type: ['integer', 'null'] },
              prevPage: { type: ['integer', 'null'] }
            }
          }
        }
      },

      // Customer statistics schema
      customerStats: {
        type: 'object',
        properties: {
          total_customers: { type: 'integer' },
          active_customers: { type: 'integer' },
          inactive_customers: { type: 'integer' },
          total_balance: { type: 'number' },
          total_debt: { type: 'number' },
          customers_with_balance: { type: 'integer' },
          customers_with_debt: { type: 'integer' },
          new_customers_this_month: { type: 'integer' },
          average_balance_per_customer: { type: 'number' }
        }
      },

      // Bulk operation schema
      bulkOperation: {
        type: 'object',
        required: ['operation', 'customer_ids'],
        properties: {
          operation: {
            type: 'string',
            enum: ['activate', 'deactivate', 'delete'],
            description: 'Bulk operation to perform'
          },
          customer_ids: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            minItems: 1,
            maxItems: 100,
            description: 'List of customer IDs to operate on'
          },
          reason: {
            type: 'string',
            maxLength: 500,
            description: 'Reason for bulk operation'
          }
        },
        additionalProperties: false
      },

      // Customer export schema
      customerExport: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['csv', 'xlsx', 'json'],
            default: 'csv',
            description: 'Export format'
          },
          filters: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['active', 'inactive'] },
              created_after: { type: 'string', format: 'date-time' },
              created_before: { type: 'string', format: 'date-time' },
              has_balance: { type: 'boolean' },
              has_debt: { type: 'boolean' }
            }
          },
          fields: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'id', 'name', 'email', 'phone', 'address', 
                'balance', 'debt', 'is_active', 'created_at', 'updated_at'
              ]
            },
            description: 'Fields to include in export'
          }
        }
      }
    };
  }

  /**
   * Get schema by name
   */
  getSchema(schemaName) {
    return this.schemas[schemaName];
  }

  /**
   * Validate customer data
   */
  validateCustomerCreate(data) {
    return this.validate(data, this.schemas.customerCreate);
  }

  /**
   * Validate customer update data
   */
  validateCustomerUpdate(data) {
    return this.validate(data, this.schemas.customerUpdate);
  }

  /**
   * Validate balance adjustment data
   */
  validateBalanceAdjustment(data) {
    return this.validate(data, this.schemas.balanceAdjustment);
  }

  /**
   * Validate bulk operation data
   */
  validateBulkOperation(data) {
    return this.validate(data, this.schemas.bulkOperation);
  }

  /**
   * Validate export request data
   */
  validateCustomerExport(data) {
    return this.validate(data, this.schemas.customerExport);
  }

  /**
   * Generic validation method
   */
  validate(data, schema) {
    // Simple validation implementation
    // In a real implementation, you would use a validation library like Joi or Ajv
    const errors = [];

    if (schema.required) {
      schema.required.forEach(field => {
        if (data[field] === undefined || data[field] === null || data[field] === '') {
          errors.push(`${field} is required`);
        }
      });
    }

    if (schema.properties) {
      Object.keys(schema.properties).forEach(field => {
        if (data[field] !== undefined) {
          const prop = schema.properties[field];
          
          // Type validation
          if (prop.type === 'string' && typeof data[field] !== 'string') {
            errors.push(`${field} must be a string`);
          }
          
          if (prop.type === 'number' && typeof data[field] !== 'number') {
            errors.push(`${field} must be a number`);
          }
          
          if (prop.type === 'boolean' && typeof data[field] !== 'boolean') {
            errors.push(`${field} must be a boolean`);
          }

          // Length validation
          if (prop.minLength && data[field].length < prop.minLength) {
            errors.push(`${field} must be at least ${prop.minLength} characters`);
          }
          
          if (prop.maxLength && data[field].length > prop.maxLength) {
            errors.push(`${field} must be at most ${prop.maxLength} characters`);
          }

          // Range validation
          if (prop.minimum !== undefined && data[field] < prop.minimum) {
            errors.push(`${field} must be at least ${prop.minimum}`);
          }
          
          if (prop.maximum !== undefined && data[field] > prop.maximum) {
            errors.push(`${field} must be at most ${prop.maximum}`);
          }

          // Pattern validation
          if (prop.pattern && !new RegExp(prop.pattern).test(data[field])) {
            errors.push(`${field} format is invalid`);
          }

          // Enum validation
          if (prop.enum && !prop.enum.includes(data[field])) {
            errors.push(`${field} must be one of: ${prop.enum.join(', ')}`);
          }

          // Email format validation
          if (prop.format === 'email' && !this.isValidEmail(data[field])) {
            errors.push(`${field} must be a valid email address`);
          }

          // UUID format validation
          if (prop.format === 'uuid' && !this.isValidUUID(data[field])) {
            errors.push(`${field} must be a valid UUID`);
          }
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Email validation helper
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * UUID validation helper
   */
  isValidUUID(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Get validation middleware for different operations
   */
  getValidationMiddleware() {
    return {
      create: (request, reply, done) => {
        const validation = this.validateCustomerCreate(request.body);
        if (!validation.isValid) {
          return reply.code(400).send({
            success: false,
            error: 'Validation failed',
            details: validation.errors
          });
        }
        done();
      },

      update: (request, reply, done) => {
        const validation = this.validateCustomerUpdate(request.body);
        if (!validation.isValid) {
          return reply.code(400).send({
            success: false,
            error: 'Validation failed',
            details: validation.errors
          });
        }
        done();
      },

      balanceAdjustment: (request, reply, done) => {
        const validation = this.validateBalanceAdjustment(request.body);
        if (!validation.isValid) {
          return reply.code(400).send({
            success: false,
            error: 'Validation failed',
            details: validation.errors
          });
        }
        done();
      },

      bulkOperation: (request, reply, done) => {
        const validation = this.validateBulkOperation(request.body);
        if (!validation.isValid) {
          return reply.code(400).send({
            success: false,
            error: 'Validation failed',
            details: validation.errors
          });
        }
        done();
      },

      export: (request, reply, done) => {
        const validation = this.validateCustomerExport(request.body);
        if (!validation.isValid) {
          return reply.code(400).send({
            success: false,
            error: 'Validation failed',
            details: validation.errors
          });
        }
        done();
      }
    };
  }
}

module.exports = new CustomerValidators();