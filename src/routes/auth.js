const AuthMiddleware = require('../middleware/auth');

async function authRoutes(fastify, options) {
  const auth = new AuthMiddleware(fastify);

  // Login page - no authentication needed
  fastify.get('/login', async (request, reply) => {
    return reply.view('auth/login', { error: null, username: '' });
  });

  // Login handler - no authentication needed
  fastify.post('/login', async (request, reply) => {
    return await auth.login(request, reply);
  });

  // Logout - no authentication needed
  fastify.get('/logout', async (request, reply) => {
    return await auth.logout(request, reply);
  });
}

module.exports = authRoutes;