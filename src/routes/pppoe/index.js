/**
 * PPPoE Route Module
 * PPPoE user management endpoints
 * @version 1.0.0
 */

const routes = require('./routes');
const middleware = require('./middleware');
const validators = require('./validators');
const PPPoEService = require('../../services/PPPoEService');

/**
 * PPPoE route module registration
 */
async function register(fastify, options) {
  // Initialize PPPoE service
  const pppoeService = new PPPoEService(fastify);
  fastify.decorate('pppoeService', pppoeService);

  // Register middleware
  middleware.register(fastify);

  // Register routes
  routes.register(fastify, options);

  // Register validators
  validators.register(fastify);

  fastify.log.info('PPPoE route module registered');
}

module.exports = {
  register,
  routes: routes.getRouteInfo(),
  metadata: {
    name: 'PPPoE Management',
    version: '1.0.0',
    description: 'PPPoE user management and configuration',
    healthCheck: async () => {
      return { status: 'healthy', checks: ['database', 'mikrotik'] };
    }
  }
};