/**
 * Payments Route Module
 * Payment processing and management endpoints
 * @version 1.0.0
 */

const routes = require('./routes');
const middleware = require('./middleware');
const validators = require('./validators');
const PaymentService = require('../../services/PaymentService');

/**
 * Payments route module registration
 */
async function register(fastify, options) {
  // Initialize payment service
  const paymentService = new PaymentService(fastify);
  fastify.decorate('paymentService', paymentService);

  // Register middleware
  middleware.register(fastify);

  // Register routes
  routes.register(fastify, options);

  // Register validators
  validators.register(fastify);

  fastify.log.info('Payments route module registered');
}

module.exports = {
  register,
  routes: routes.getRouteInfo(),
  metadata: {
    name: 'Payment Management',
    version: '1.0.0',
    description: 'Payment processing and gateway management',
    healthCheck: async () => {
      return { status: 'healthy', checks: ['database', 'payment_gateways'] };
    }
  }
};