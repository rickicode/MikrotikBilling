/**
 * Customer Route Module
 * Customer management endpoints with sub-routing
 * @version 1.0.0
 */

const routes = require('./routes');
const middleware = require('./middleware');
const validators = require('./validators');
const CustomerService = require('../../services/CustomerService');

/**
 * Customer route module registration
 */
async function register(fastify, options) {
  // Initialize customer service
  const customerService = new CustomerService(fastify);
  fastify.decorate('customerService', customerService);

  // Register middleware
  middleware.register(fastify);

  // Register routes
  routes.register(fastify, options);

  // Register validators
  validators.register(fastify);

  fastify.log.info('Customer route module registered');
}

module.exports = {
  register,
  routes: routes.getRouteInfo(),
  metadata: {
    name: 'Customer Management',
    version: '1.0.0',
    description: 'Customer CRUD operations and management',
    healthCheck: async () => {
      // Health check implementation
      return { status: 'healthy', checks: ['database', 'mikrotik'] };
    }
  }
};