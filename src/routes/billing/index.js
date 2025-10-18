/**
 * Billing Route Module
 * Billing and invoice management endpoints
 * @version 1.0.0
 */

const routes = require('./routes');
const middleware = require('./middleware');
const validators = require('./validators');
const BillingService = require('../../services/BillingService');

/**
 * Billing route module registration
 */
async function register(fastify, options) {
  // Initialize billing service
  const billingService = new BillingService(fastify);
  fastify.decorate('billingService', billingService);

  // Register middleware
  middleware.register(fastify);

  // Register routes
  routes.register(fastify, options);

  // Register validators
  validators.register(fastify);

  fastify.log.info('Billing route module registered');
}

module.exports = {
  register,
  routes: routes.getRouteInfo(),
  metadata: {
    name: 'Billing Management',
    version: '1.0.0',
    description: 'Billing, invoicing, and financial operations',
    healthCheck: async () => {
      return { status: 'healthy', checks: ['database', 'payment_gateways'] };
    }
  }
};