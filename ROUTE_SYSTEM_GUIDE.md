# Modular Route System Guide

## Overview

This guide explains the new modular route system implemented for the Mikrotik Billing System. The system breaks down monolithic route files into organized, maintainable modules with auto-discovery, comprehensive middleware, validation, and enterprise-grade features.

## Architecture

### Core Components

1. **Central Route Registry** (`src/routes/index.js`)
   - Auto-discovers and registers route modules
   - Provides health checks and route information
   - Manages module lifecycle

2. **Route Modules** (`src/routes/{module}/`)
   - Self-contained route packages
   - Each module has: `index.js`, `routes.js`, `middleware.js`, `validators.js`

3. **Shared Middleware** (`src/middleware/route-middleware.js`)
   - Common middleware for authentication, CORS, compression, etc.
   - Reusable across all route modules

4. **Route Helpers** (`src/utils/route-helpers.js`)
   - Utility functions for response formatting, pagination, validation
   - Database query helpers and error handling

## Directory Structure

```
src/routes/
├── index.js                 # Central registry with auto-discovery
├── customers/
│   ├── index.js            # Module registration and exports
│   ├── routes.js           # Customer route definitions
│   ├── middleware.js       # Customer-specific middleware
│   └── validators.js       # Customer route validators
├── billing/
│   ├── index.js
│   ├── routes.js
│   ├── middleware.js
│   └── validators.js
├── vouchers/
│   ├── index.js
│   ├── routes.js
│   ├── middleware.js
│   └── validators.js
├── pppoe/
├── payments/
├── whatsapp/
└── admin/
```

## Key Features

### 1. Auto-Discovery and Registration

The route registry automatically discovers and registers all modules in the routes directory:

```javascript
// In src/routes/index.js
await routeRegistry.registerAllRoutes();
```

### 2. Modular Structure

Each route module is self-contained with its own:
- Routes and handlers
- Middleware
- Validation schemas
- Service integration
- Health checks

### 3. Comprehensive Middleware

- **Authentication**: JWT-based with role verification
- **Authorization**: Role-based access control
- **Rate Limiting**: Per-route and global rate limiting
- **CORS**: Configurable per-module
- **Compression**: Response compression
- **Security Headers**: Security best practices
- **Audit Logging**: Comprehensive audit trails
- **Caching**: Intelligent response caching

### 4. Advanced Validation

- **Schema Validation**: JSON Schema-based validation
- **Input Sanitization**: Automatic data cleaning
- **Type Safety**: Type checking and conversion
- **Custom Validators**: Business logic validation

### 5. Performance Optimization

- **Route-Level Caching**: Intelligent caching strategies
- **Database Optimization**: Query helpers and connection pooling
- **Response Compression**: Bandwidth optimization
- **Metrics Collection**: Performance monitoring

### 6. Enterprise Features

- **Event Publishing**: Event-driven architecture
- **Audit Trails**: Comprehensive logging
- **Health Monitoring**: Per-module health checks
- **API Documentation**: Auto-generated OpenAPI docs
- **Error Handling**: Centralized error management

## Usage Examples

### Creating a New Route Module

1. **Create Module Directory**
```bash
mkdir src/routes/newmodule
```

2. **Create Module Index** (`src/routes/newmodule/index.js`)
```javascript
const routes = require('./routes');
const middleware = require('./middleware');
const validators = require('./validators');
const NewModuleService = require('../../services/NewModuleService');

async function register(fastify, options) {
  const service = new NewModuleService(fastify);
  fastify.decorate('newModuleService', service);

  middleware.register(fastify);
  routes.register(fastify, options);
  validators.register(fastify);

  fastify.log.info('NewModule route module registered');
}

module.exports = {
  register,
  routes: routes.getRouteInfo(),
  metadata: {
    name: 'New Module Management',
    version: '1.0.0',
    description: 'New module functionality',
    healthCheck: async () => ({ status: 'healthy' })
  }
};
```

3. **Create Routes** (`src/routes/newmodule/routes.js`)
```javascript
const RouteMiddleware = require('../../middleware/route-middleware');

class NewModuleRoutes {
  register(fastify, options = {}) {
    const middleware = new RouteMiddleware(fastify);
    const { getCommon } = middleware;
    const helpers = fastify.routeHelpers || fastify;

    fastify.get('/', {
      preHandler: [getCommon.authenticated]
    }, fastify.asyncHandler(async (request, reply) => {
      // Route implementation
      return reply.send(helpers.success(data, 'Success'));
    }));
  }

  getRouteInfo() {
    return [{ method: 'GET', path: '/', summary: 'List items' }];
  }
}

module.exports = new NewModuleRoutes();
```

### Using the Route System

1. **Register in Main App**
```javascript
// In your main app file
const { routeRegistryPlugin } = require('./routes/index');

await fastify.register(routeRegistryPlugin, {
  autoDiscover: true,
  prefix: '/api',
  version: 'v1'
});
```

2. **Access Route Information**
```javascript
// Get all registered routes
const routesInfo = fastify.routeRegistry.getRoutesInfo();

// Health check all modules
const health = await fastify.routeRegistry.healthCheck();
```

### Advanced Route Features

#### Custom Middleware Pipelines
```javascript
// In routes.js
fastify.get('/sensitive', {
  preHandler: [
    getCommon.authenticated,
    middleware.requireRole(['admin']),
    middleware.auditLogger(),
    middleware.cache({ ttl: 300 })
  ]
}, handler);
```

#### Event Publishing
```javascript
// In route handler
await helpers.publishEvent('resource.created', {
  resourceId: resource.id,
  userId: request.user.id
});
```

#### Transaction Support
```javascript
const result = await helpers.transaction(async (client) => {
  await client.query('INSERT INTO...', [params]);
  await client.query('UPDATE...', [params]);
  return result;
});
```

#### Caching
```javascript
// Route-level caching
fastify.get('/cached-data', {
  preHandler: [middleware.cache({ ttl: 600 })]
}, handler);

// Manual caching
const data = await helpers.cache('key', fetchFunction, ttl);
```

## Performance Considerations

### 1. Database Optimization
- Use the provided query helpers for consistent error handling
- Implement proper indexing for search fields
- Use transactions for complex operations

### 2. Caching Strategy
- Cache frequently accessed read-only data
- Use appropriate TTL values
- Implement cache invalidation for data changes

### 3. Rate Limiting
- Set appropriate limits per route
- Consider different limits for different user roles
- Monitor rate limit violations

### 4. Response Compression
- Enable for all API responses
- Configure appropriate compression levels
- Consider impact on CPU usage

## Security Best Practices

### 1. Authentication & Authorization
- Always validate JWT tokens
- Implement proper role-based access control
- Use middleware consistently

### 2. Input Validation
- Validate all input data
- Sanitize user inputs
- Use parameterized queries

### 3. Audit Logging
- Log all sensitive operations
- Include relevant context (user, IP, timestamp)
- Store logs securely

### 4. Error Handling
- Don't expose internal errors to clients
- Log detailed errors for debugging
- Provide user-friendly error messages

## Monitoring and Observability

### 1. Health Checks
```javascript
// Check all modules
GET /routes/health

// Check specific module
GET /routes/health?module=customers
```

### 2. Metrics
```javascript
// Record custom metrics
await helpers.recordMetric('custom_operation', 1, {
  operation_type: 'create',
  user_role: 'admin'
});
```

### 3. API Documentation
```javascript
// Get OpenAPI documentation
GET /docs
```

## Testing

### 1. Unit Testing Route Modules
```javascript
// test/routes/customers.test.js
const fastify = require('fastify');
const customerRoutes = require('../../src/routes/customers');

test('customer routes', async () => {
  const app = fastify();
  await app.register(customerRoutes.register);
  
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/customers'
  });
  
  expect(response.statusCode).toBe(200);
});
```

### 2. Integration Testing
```javascript
// test/integration/routes.test.js
test('full route integration', async () => {
  // Setup database, services, etc.
  // Test complete request flow
});
```

## Migration Guide

### From Monolithic Routes

1. **Identify Route Groups**: Group related routes by functionality
2. **Create Module Structure**: Create directories for each group
3. **Extract Routes**: Move route definitions to module `routes.js`
4. **Extract Middleware**: Move middleware to module `middleware.js`
5. **Add Validation**: Create validation schemas in `validators.js`
6. **Update Module Index**: Create `index.js` for module registration
7. **Update Main App**: Replace old route registration with route registry

### Example Migration

**Before (monolithic):**
```javascript
// customers.js
fastify.get('/customers', handler);
fastify.post('/customers', handler);
fastify.get('/customers/:id', handler);
```

**After (modular):**
```javascript
// routes/customers/routes.js
class CustomerRoutes {
  register(fastify) {
    fastify.get('/', handler);
    fastify.post('/', handler);
    fastify.get('/:id', handler);
  }
}

// routes/customers/index.js
module.exports = {
  register: (fastify) => new CustomerRoutes().register(fastify)
};
```

## Best Practices

### 1. Module Organization
- Keep modules focused on single responsibility
- Use consistent naming conventions
- Document module purpose and dependencies

### 2. Route Design
- Use RESTful conventions
- Provide clear error messages
- Include appropriate HTTP status codes
- Support pagination for list endpoints

### 3. Middleware Usage
- Compose middleware for complex behavior
- Keep middleware focused and reusable
- Document middleware purpose and requirements

### 4. Validation
- Validate all inputs
- Provide clear validation error messages
- Use appropriate data types and constraints

### 5. Error Handling
- Use consistent error response format
- Log errors appropriately
- Handle edge cases gracefully

## Troubleshooting

### Common Issues

1. **Module Not Registered**
   - Check module has proper `index.js` with `register` function
   - Verify module directory is in routes folder
   - Check for syntax errors in module files

2. **Route Not Found**
   - Verify route registration in module
   - Check route prefix configuration
   - Ensure proper HTTP method and path

3. **Middleware Not Applied**
   - Verify middleware registration order
   - Check middleware function signatures
   - Ensure preHandler array is properly defined

4. **Validation Errors**
   - Check schema definitions in validators
   - Verify request body format
   - Ensure proper error handling

### Debug Mode

Enable debug logging:
```javascript
const fastify = require('fastify')({ 
  logger: { level: 'debug' }
});
```

## Contributing

When adding new route modules:

1. Follow the established module structure
2. Include comprehensive tests
3. Add proper documentation
4. Implement health checks
5. Follow security best practices
6. Add appropriate error handling

## Performance Metrics

Monitor these key metrics:

- Route response times
- Database query performance
- Cache hit rates
- Error rates by route
- Request patterns and volumes

## Future Enhancements

Planned improvements:

1. **Advanced Caching**: Redis-based distributed caching
2. **Rate Limiting**: Distributed rate limiting
3. **API Versioning**: Advanced versioning strategies
4. **GraphQL Support**: GraphQL endpoint integration
5. **WebSocket Routes**: Real-time communication support
6. **Service Mesh**: Microservice integration
7. **Advanced Monitoring**: Prometheus metrics integration
8. **Circuit Breakers**: Resilience patterns