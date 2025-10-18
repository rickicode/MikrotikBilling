# Fastify Plugin Architecture Documentation

## Overview

The Mikrotik Billing System has been enhanced with a sophisticated Fastify plugin architecture that provides:

- **Proper dependency management** between plugins
- **Environment-specific configurations** 
- **Comprehensive error handling** and recovery
- **Performance monitoring** and metrics
- **Graceful degradation** for optional plugins
- **Health checks** and status monitoring
- **Automated lifecycle management**

## Architecture Components

### 1. Core Plugin Registry (`src/config/plugins.js`)

The central plugin management system that handles:

- Plugin registration with dependencies
- Load order calculation based on priorities
- Plugin health monitoring
- Graceful shutdown procedures
- Performance metrics collection

```javascript
const { pluginRegistry } = require('./config/plugins');

// Register a new plugin
pluginRegistry.register('my-plugin', myPluginFunction, {
  priority: 500,
  required: true,
  dependencies: ['database', 'cache'],
  environment: 'all'
});
```

### 2. Fastify Core Plugins (`src/plugins/fastify-plugins.js`)

Essential Fastify plugins with optimized configurations:

- **databasePlugin** - PostgreSQL connection management
- **cachePlugin** - Redis caching with fallback to memory
- **securityPlugin** - CORS, Helmet, CSRF, Rate limiting
- **sessionPlugin** - Session management with Redis/Memory storage
- **compressionPlugin** - Response compression (gzip, deflate, brotli)
- **staticPlugin** - Static file serving with caching headers
- **viewPlugin** - EJS templating engine configuration
- **formPlugin** - Form data and file upload handling
- **cookiePlugin** - Cookie parsing and management
- **monitoringPlugin** - Performance monitoring and metrics

### 3. Application Plugins (`src/plugins/application-plugins.js`)

Business logic plugins specific to the Mikrotik Billing System:

- **mikrotikPlugin** - RouterOS API integration with multi-location support
- **whatsappPlugin** - WhatsApp Web JS integration with multi-session management
- **authPlugin** - JWT authentication and role-based access control
- **paymentPlugin** - Payment gateway plugin system
- **schedulerPlugin** - Background task scheduling and management
- **auditPlugin** - Comprehensive audit logging

### 4. Plugin Configuration (`src/config/plugin-config.js`)

Central plugin configuration with:

- Environment-specific plugin loading
- Dependency resolution
- Health check definitions
- Graceful shutdown procedures

### 5. Enhanced Application (`src/app-enhanced.js`)

Modern Fastify application using the plugin architecture:

- Optimized server configuration
- Global error handling
- Lifecycle management
- Health check endpoints

### 6. Route Registry (`src/config/routes.js`)

Advanced route management system:

- Auto-discovery of route files
- Dependency-aware route registration
- Route grouping and organization
- Performance monitoring

## Plugin Development Guidelines

### Creating a New Plugin

1. **Plugin Structure**:

```javascript
const fp = require('fastify-plugin');

async function myPlugin(server, options) {
  // Plugin initialization logic
  server.decorate('myService', new MyService());
  
  // Add health check if needed
  server.addHook('onReady', async () => {
    console.log('My plugin is ready');
  });
}

module.exports = fp(myPlugin, {
  name: 'my-plugin',
  dependencies: ['database', 'cache'],
  fastify: '4.x'
});
```

2. **Plugin Registration**:

```javascript
// In src/config/plugin-config.js
pluginRegistry.register('my-plugin', myPlugin, {
  priority: 300,
  required: false,
  environment: 'all',
  dependencies: ['database', 'cache'],
  healthCheck: async (server) => {
    return {
      status: 'healthy',
      message: 'My plugin is operational'
    };
  },
  gracefulShutdown: async (server) => {
    // Cleanup logic
  }
});
```

### Plugin Dependencies

Plugins can specify dependencies that must be loaded before them:

```javascript
pluginRegistry.register('payment', paymentPlugin, {
  dependencies: ['database', 'cache', 'monitoring'],
  // The plugin will wait for these to be loaded first
});
```

### Environment-Specific Plugins

```javascript
pluginRegistry.register('dev-tools', devToolsPlugin, {
  environment: 'development',  // Only loads in development
  required: false
});

pluginRegistry.register('production', productionPlugin, {
  environment: 'production',   // Only loads in production
  required: true
});
```

## Health Monitoring

### Plugin Health Checks

Each plugin can provide a health check function:

```javascript
pluginRegistry.register('mikrotik', mikrotikPlugin, {
  healthCheck: async (server) => {
    if (!server.mikrotik) {
      return { status: 'disabled', message: 'Mikrotik not available' };
    }
    
    const connections = await server.mikrotik.healthCheck();
    return {
      status: 'healthy',
      message: 'Mikrotik connections operational',
      connections
    };
  }
});
```

### Health Check Endpoints

- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed plugin health status
- `GET /health/plugins` - Plugin-specific health information
- `GET /ready` - Readiness probe (checks critical dependencies)
- `GET /live` - Liveness probe

## Performance Monitoring

### Built-in Metrics

The plugin architecture automatically tracks:

- Plugin load times
- Request/response times
- Memory usage
- Database connection health
- Cache hit/miss ratios
- Error rates

### Custom Metrics

```javascript
// In any plugin
if (server.performanceMonitor) {
  server.performanceMonitor.recordMetric('custom.metric', value);
}
```

## Route Development

### Route Structure for Plugin Architecture

Routes should be structured to work with the plugin system:

```javascript
// src/routes/example.js
async function exampleRoutes(server, context) {
  const { requireAuth, requireRole, logRequest } = context.decorators;

  server.get('/api/example', {
    preHandler: [requireAuth, requireRole(['admin'])],
    schema: {
      // Fastify schema validation
    }
  }, async (request, reply) => {
    await logRequest('example.action', 'category')(request, reply);
    
    // Route logic
    return { success: true, data: 'example' };
  });
}

module.exports = exampleRoutes;
```

### Route Auto-Discovery

Routes are automatically discovered from `src/routes/` directory and organized by filename.

## Configuration

### Environment Variables

Key environment variables for plugin configuration:

```bash
# General Configuration
NODE_ENV=development
HOST=0.0.0.0
PORT=3000

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mikrotik_billing
DB_USER=postgres
DB_PASSWORD=password

# Cache Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Security Configuration
JWT_SECRET=your-secret-key
COOKIE_SECRET=your-cookie-secret
RATE_LIMIT_MAX=100

# Mikrotik Configuration
MIKROTIK_HOST=192.168.1.1
MIKROTIK_PORT=8728
MIKROTIK_USERNAME=admin
MIKROTIK_PASSWORD=password

# WhatsApp Configuration
WHATSAPP_MAX_SESSIONS=5
WHATSAPP_MESSAGE_DELAY=1000

# Performance Configuration
REQUEST_TIMEOUT=30000
BODY_LIMIT=10485760
KEEP_ALIVE_TIMEOUT=72000
```

## Migration from Legacy System

### Step 1: Update Server Entry Point

Replace the old server initialization with the enhanced version:

```javascript
// Old: const app = require('./src/app');
// New: const EnhancedApplication = require('./src/app-enhanced');
```

### Step 2: Update Route Files

Convert route files to use the new plugin architecture pattern:

```javascript
// Old: module.exports = (fastify, opts, done) => { ... }
// New: async function routeHandler(server, context) { ... }
```

### Step 3: Plugin Registration

Register existing functionality as plugins in the configuration system.

## Benefits of the Plugin Architecture

1. **Modularity** - Clear separation of concerns
2. **Testability** - Each plugin can be tested independently
3. **Maintainability** - Easier to maintain and update individual components
4. **Scalability** - Can add/remove plugins without affecting the system
5. **Reliability** - Graceful degradation for optional components
6. **Monitoring** - Built-in health checks and performance metrics
7. **Security** - Centralized security configuration
8. **Performance** - Optimized loading order and resource management

## Troubleshooting

### Common Issues

1. **Plugin Loading Failures**:
   - Check plugin dependencies
   - Verify environment configuration
   - Review plugin logs

2. **Health Check Failures**:
   - Check plugin status via `/health/detailed`
   - Verify external service connectivity
   - Review plugin-specific configurations

3. **Performance Issues**:
   - Monitor plugin load times
   - Check for memory leaks in plugins
   - Review request/response metrics

### Debug Mode

Enable debug logging:

```bash
DEBUG=plugin:* npm start
```

## Contributing

When adding new plugins:

1. Follow the established naming conventions
2. Include comprehensive health checks
3. Add proper error handling
4. Include performance metrics
5. Write tests for plugin functionality
6. Update documentation

---

This plugin architecture provides a robust foundation for the Mikrotik Billing System, enabling better maintainability, scalability, and reliability while maintaining high performance and security standards.
