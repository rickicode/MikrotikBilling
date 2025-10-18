// examples/typebox-integration-example.js
/**
 * TypeBox Integration Example for Mikrotik Billing System
 * Shows how to use TypeBox schemas with Fastify for validation and documentation
 */

const { Type } = require('@sinclair/typebox');
const Fastify = require('fastify');

// Import our comprehensive schemas
const schemas = require('../src/schemas');

// Create Fastify instance
const app = Fastify({
  logger: true
});

// Register all TypeBox schemas with Fastify
app.addSchema(schemas.getFastifySchemas());

// Example route using customer schemas
app.post('/api/customers', {
  schema: {
    body: schemas.CustomerSchemas.createCustomer,
    response: {
      201: schemas.ResponseSchemas.createdResponse,
      400: schemas.ResponseSchemas.validationErrorResponse,
      500: schemas.ResponseSchemas.errorResponse
    }
  }
}, async (request, reply) => {
  try {
    // Create customer logic here
    const newCustomer = {
      id: Date.now(),
      ...request.body,
      createdAt: new Date().toISOString()
    };
    
    return reply.status(201).send({
      success: true,
      message: 'Customer created successfully',
      data: newCustomer,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: request.id,
        processingTime: 50
      }
    });
  } catch (error) {
    return reply.status(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create customer',
        timestamp: new Date().toISOString(),
        requestId: request.id
      }
    });
  }
});

// Example route with pagination
app.get('/api/customers', {
  schema: {
    querystring: schemas.CustomerSchemas.customerSearchQuery,
    response: {
      200: schemas.ResponseSchemas.paginatedResponse,
      400: schemas.ResponseSchemas.errorResponse
    }
  }
}, async (request, reply) => {
  try {
    // Mock data retrieval with pagination
    const customers = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      name: `Customer ${i + 1}`,
      email: `customer${i + 1}@example.com`,
      type: 'individual',
      status: 'active',
      balance: Math.floor(Math.random() * 1000000),
      createdAt: new Date().toISOString()
    }));

    const page = request.query.page || 1;
    const limit = request.query.limit || 20;
    const start = (page - 1) * limit;
    const end = start + limit;

    const paginatedCustomers = customers.slice(start, end);

    return {
      success: true,
      message: 'Customers retrieved successfully',
      data: paginatedCustomers,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: request.id,
        pagination: {
          page,
          limit,
          total: customers.length,
          totalPages: Math.ceil(customers.length / limit),
          hasNext: end < customers.length,
          hasPrev: page > 1
        },
        processingTime: 25
      }
    };
  } catch (error) {
    return reply.status(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve customers',
        timestamp: new Date().toISOString(),
        requestId: request.id
      }
    });
  }
});

// Example voucher generation route
app.post('/api/vouchers/generate', {
  schema: {
    body: schemas.VoucherSchemas.generateVouchers,
    response: {
      201: schemas.ResponseSchemas.batchOperationResponse,
      400: schemas.ResponseSchemas.validationErrorResponse,
      500: schemas.ResponseSchemas.errorResponse
    }
  }
}, async (request, reply) => {
  try {
    const { quantity, profileId, price } = request.body;
    
    // Mock voucher generation
    const vouchers = Array.from({ length: quantity }, (_, i) => ({
      id: Date.now() + i,
      code: `VCH-${String(Date.now()).slice(-6)}-${String(i + 1).padStart(3, '0')}`,
      profileId,
      price,
      status: 'active',
      createdAt: new Date().toISOString()
    }));

    return reply.status(201).send({
      success: true,
      message: `Successfully generated ${quantity} vouchers`,
      data: {
        total: quantity,
        successful: quantity,
        failed: 0,
        skipped: 0,
        results: vouchers.map((voucher, index) => ({
          index,
          id: voucher.id,
          success: true,
          data: voucher
        })),
        errors: []
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: request.id,
        processingTime: 150,
        batchSize: quantity
      }
    });
  } catch (error) {
    return reply.status(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to generate vouchers',
        timestamp: new Date().toISOString(),
        requestId: request.id
      }
    });
  }
});

// Health check route with custom schema
app.get('/health', {
  schema: {
    response: {
      200: schemas.ResponseSchemas.healthCheckResponse
    }
  }
}, async (request, reply) => {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: {
        status: 'healthy',
        responseTime: 5,
        lastCheck: new Date().toISOString()
      },
      mikrotik: {
        status: 'healthy',
        responseTime: 12,
        lastCheck: new Date().toISOString(),
        connectedDevices: 25
      },
      whatsapp: {
        status: 'healthy',
        responseTime: 8,
        lastCheck: new Date().toISOString(),
        activeSessions: 2
      },
      cache: {
        status: 'healthy',
        responseTime: 2,
        lastCheck: new Date().toISOString(),
        hitRate: 85.5
      }
    },
    metrics: {
      memoryUsage: 45.2,
      cpuUsage: 12.8,
      diskUsage: 67.3,
      activeConnections: 15,
      requestsPerMinute: 120
    }
  };
});

// Error handler for validation errors
app.setErrorHandler(function (error, request, reply) {
  if (error.validation) {
    reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error.validation.map(err => ({
          field: err.instancePath || err.path || 'root',
          message: err.message,
          value: err.value,
          code: err.keyword
        })),
        timestamp: new Date().toISOString(),
        requestId: request.id
      }
    });
  } else {
    // Handle other errors
    reply.status(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        timestamp: new Date().toISOString(),
        requestId: request.id
      }
    });
  }
});

// Start server
const start = async () => {
  try {
    await app.listen({ port: 3000, host: '0.0.0.0' });
    console.log('🚀 TypeBox Integration Server running on http://localhost:3000');
    console.log('');
    console.log('📚 Available endpoints:');
    console.log('  POST /api/customers          - Create customer');
    console.log('  GET  /api/customers          - List customers (with pagination)');
    console.log('  POST /api/vouchers/generate  - Generate vouchers');
    console.log('  GET  /health                 - Health check');
    console.log('');
    console.log('✨ TypeBox schemas provide:');
    console.log('  - Compile-time type safety');
    console.log('  - Automatic API documentation');
    console.log('  - Request/response validation');
    console.log('  - Indonesian business rules validation');
    console.log('  - Security protection patterns');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();