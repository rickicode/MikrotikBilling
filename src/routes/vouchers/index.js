/**
 * Voucher Route Module
 * Voucher management and generation endpoints
 * @version 1.0.0
 */

const routes = require('./routes');
const middleware = require('./middleware');
const validators = require('./validators');
const VoucherService = require('../../services/VoucherService');

/**
 * Voucher route module registration
 */
async function register(fastify, options) {
  // Initialize voucher service
  const voucherService = new VoucherService(fastify);
  fastify.decorate('voucherService', voucherService);

  // Register middleware
  middleware.register(fastify);

  // Register routes
  routes.register(fastify, options);

  // Register validators
  validators.register(fastify);

  fastify.log.info('Voucher route module registered');
}

module.exports = {
  register,
  routes: routes.getRouteInfo(),
  metadata: {
    name: 'Voucher Management',
    version: '1.0.0',
    description: 'Hotspot voucher generation and management',
    healthCheck: async () => {
      return { status: 'healthy', checks: ['database', 'mikrotik'] };
    }
  }
};