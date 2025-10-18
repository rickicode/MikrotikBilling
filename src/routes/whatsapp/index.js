/**
 * WhatsApp Route Module
 * WhatsApp messaging and template management endpoints
 * @version 1.0.0
 */

const routes = require('./routes');
const middleware = require('./middleware');
const validators = require('./validators');
const WhatsAppService = require('../../services/WhatsAppService');

/**
 * WhatsApp route module registration
 */
async function register(fastify, options) {
  // Initialize WhatsApp service
  const whatsappService = new WhatsAppService(fastify);
  fastify.decorate('whatsappService', whatsappService);

  // Register middleware
  middleware.register(fastify);

  // Register routes
  routes.register(fastify, options);

  // Register validators
  validators.register(fastify);

  fastify.log.info('WhatsApp route module registered');
}

module.exports = {
  register,
  routes: routes.getRouteInfo(),
  metadata: {
    name: 'WhatsApp Management',
    version: '1.0.0',
    description: 'WhatsApp messaging and notification system',
    healthCheck: async () => {
      return { status: 'healthy', checks: ['whatsapp_sessions', 'templates'] };
    }
  }
};