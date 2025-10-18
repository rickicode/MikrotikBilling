// src/schemas/index.js
/**
 * Mikrotik Billing System - Comprehensive TypeBox Schema Registry
 * Main schema registry and exports for enhanced validation and type safety
 */

const { Type, TSchema } = require('@sinclair/typebox');
const T = Type;


/**
 * Schema Registry - Centralized schema management
 */
class SchemaRegistry {
  constructor() {
    this.schemas = new Map();
    this.compiledSchemas = new Map();
    this.schemaVersions = new Map();
    this.performanceMetrics = {
      validationCount: 0,
      averageValidationTime: 0,
      schemaCompileCount: 0
    };
    
    this.initialize();
  }

  /**
   * Initialize schema registry with all schemas
   */
  initialize() {
    // Register all schema modules
    this.registerModule('common', require('./common'));
    this.registerModule('customers', require('./customers'));
    this.registerModule('billing', require('./billing'));
    this.registerModule('vouchers', require('./vouchers'));
    this.registerModule('pppoe', require('./pppoe'));
    this.registerModule('payments', require('./payments'));
    this.registerModule('whatsapp', require('./whatsapp'));
    this.registerModule('admin', require('./admin'));
    this.registerModule('responses', require('./responses'));

    console.log(`Schema Registry initialized with ${this.schemas.size} schemas`);
  }

  /**
   * Register a schema module
   */
  registerModule(moduleName, moduleSchemas) {
    for (const [name, schema] of Object.entries(moduleSchemas)) {
      const schemaId = `${moduleName}.${name}`;
      
      // Add schema metadata
      if (schema && typeof schema === 'object') {
        schema.$id = schemaId;
        schema.$schema = 'http://json-schema.org/draft-07/schema#';
        schema['x-module'] = moduleName;
        schema['x-version'] = '1.0.0';
        
        // Add transformation functions if not present
        if (!schema['x-transform']) {
          schema['x-transform'] = this.getDefaultTransform(schema);
        }
      }
      
      this.schemas.set(schemaId, schema);
    }
  }

  /**
   * Get schema by ID
   */
  getSchema(schemaId) {
    return this.schemas.get(schemaId);
  }

  /**
   * Get all schemas
   */
  getAllSchemas() {
    return Object.fromEntries(this.schemas);
  }

  /**
   * Get schemas by module
   */
  getSchemasByModule(moduleName) {
    const moduleSchemas = {};
    for (const [id, schema] of this.schemas) {
      if (schema['x-module'] === moduleName) {
        moduleSchemas[id.replace(`${moduleName}.`, '')] = schema;
      }
    }
    return moduleSchemas;
  }

  /**
   * Compile schema for performance optimization
   */
  compileSchema(schemaId) {
    const schema = this.schemas.get(schemaId);
    if (!schema) {
      throw new Error(`Schema ${schemaId} not found`);
    }

    if (this.compiledSchemas.has(schemaId)) {
      return this.compiledSchemas.get(schemaId);
    }

    // Schema compilation logic (placeholder for actual compilation)
    const compiled = {
      schema,
      validate: (data) => this.validate(data, schema),
      transform: (data) => this.transform(data, schema)
    };

    this.compiledSchemas.set(schemaId, compiled);
    this.performanceMetrics.schemaCompileCount++;
    
    return compiled;
  }

  /**
   * Validate data against schema
   */
  validate(data, schema) {
    const startTime = Date.now();
    
    try {
      // Validation logic using TypeBox
      // This would integrate with Fastify's validation system
      const result = this.performValidation(data, schema);
      
      const duration = Date.now() - startTime;
      this.updatePerformanceMetrics(duration);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.updatePerformanceMetrics(duration);
      
      throw error;
    }
  }

  /**
   * Transform data according to schema rules
   */
  transform(data, schema) {
    const transformFn = schema['x-transform'];
    if (transformFn && typeof transformFn === 'function') {
      return transformFn(data);
    }
    return data;
  }

  /**
   * Get default transformation function for schema
   */
  getDefaultTransform(schema) {
    return (data) => {
      if (!data || typeof data !== 'object') return data;
      
      const transformed = {};
      for (const [key, value] of Object.entries(data)) {
        if (schema.properties && schema.properties[key]) {
          const propSchema = schema.properties[key];
          
          // Apply string trimming for string properties
          if (typeof value === 'string' && propSchema.type === 'string') {
            transformed[key] = value.trim();
          }
          // Apply number conversion for numeric properties
          else if (propSchema.type === 'number' && value !== null && value !== undefined) {
            const num = Number(value);
            transformed[key] = isNaN(num) ? value : num;
          }
          else {
            transformed[key] = value;
          }
        } else {
          transformed[key] = value;
        }
      }
      
      return transformed;
    };
  }

  /**
   * Perform actual validation (simplified)
   */
  performValidation(data, schema) {
    // This would integrate with TypeBox's validation system
    // For now, return basic validation result
    return {
      valid: true,
      data: this.transform(data, schema),
      errors: []
    };
  }

  /**
   * Update performance metrics
   */
  updatePerformanceMetrics(duration) {
    this.performanceMetrics.validationCount++;
    this.performanceMetrics.averageValidationTime = 
      (this.performanceMetrics.averageValidationTime * (this.performanceMetrics.validationCount - 1) + duration) 
      / this.performanceMetrics.validationCount;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return { ...this.performanceMetrics };
  }

  /**
   * Health check for schema system
   */
  healthCheck() {
    return {
      status: 'healthy',
      schemasLoaded: this.schemas.size,
      compiledSchemas: this.compiledSchemas.size,
      performanceMetrics: this.getPerformanceMetrics(),
      timestamp: new Date().toISOString()
    };
  }
}

// Create global schema registry instance
const schemaRegistry = new SchemaRegistry();

// Export individual schema modules
const CommonSchemas = require('./common');
const CustomerSchemas = require('./customers');
const BillingSchemas = require('./billing');
const VoucherSchemas = require('./vouchers');
const PPPoESchemas = require('./pppoe');
const PaymentSchemas = require('./payments');
const WhatsAppSchemas = require('./whatsapp');
const AdminSchemas = require('./admin');
const ResponseSchemas = require('./responses');

module.exports = {
  // Core TypeBox exports
  Type,
  T,
  TSchema,

  // Schema registry
  SchemaRegistry,
  registry: schemaRegistry,

  // Individual schema modules
  CommonSchemas,
  CustomerSchemas,
  BillingSchemas,
  VoucherSchemas,
  PPPoESchemas,
  PaymentSchemas,
  WhatsAppSchemas,
  AdminSchemas,
  ResponseSchemas,

  // Convenience getters
  getSchema: (schemaId) => schemaRegistry.getSchema(schemaId),
  getAllSchemas: () => schemaRegistry.getAllSchemas(),
  getSchemasByModule: (moduleName) => schemaRegistry.getSchemasByModule(moduleName),

  // Fastify integration helpers
  getFastifySchemas: () => {
    const schemas = {};
    for (const [id, schema] of schemaRegistry.schemas) {
      schemas[id] = schema;
    }
    return schemas;
  },

  // Validation helpers
  validate: (data, schemaId) => {
    const schema = schemaRegistry.getSchema(schemaId);
    if (!schema) {
      throw new Error(`Schema ${schemaId} not found`);
    }
    return schemaRegistry.validate(data, schema);
  },

  // Performance monitoring
  getPerformanceMetrics: () => schemaRegistry.getPerformanceMetrics(),
  healthCheck: () => schemaRegistry.healthCheck()
};

// Export specific commonly used schemas
module.exports.pagination = CommonSchemas.paginationQuery;
module.exports.search = CommonSchemas.searchQuery;
module.exports.idParam = CommonSchemas.idParam;
module.exports.apiResponse = ResponseSchemas.apiResponse;
module.exports.errorResponse = ResponseSchemas.errorResponse;