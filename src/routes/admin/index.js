/**
 * Admin Route Module
 * Administrative and system management endpoints
 * @version 1.0.0
 */

const routes = require('./routes');
const middleware = require('./middleware');
const validators = require('./validators');
const AdminService = require('../../services/AdminService');

/**
 * Admin route module registration
 */
async function register(fastify, options) {
  // Initialize admin service
  const adminService = new AdminService(fastify);
  fastify.decorate('adminService', adminService);

  // Register middleware
  middleware.register(fastify);

  // Register routes
  routes.register(fastify, options);

  // Register validators
  validators.register(fastify);

  fastify.log.info('Admin route module registered');
}

module.exports = {
  register,
  routes: routes.getRouteInfo(),
  metadata: {
    name: 'Admin Management',
    version: '1.0.0',
    description: 'Administrative functions and system management',
    healthCheck: async () => {
      return { status: 'healthy', checks: ['database', 'system_health'] };
    }
  }
};