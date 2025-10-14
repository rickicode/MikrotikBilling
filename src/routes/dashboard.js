async function dashboardRoutes(fastify, options) {
  // Redirect root to admin dashboard to avoid conflicts
  fastify.get('/', async (request, reply) => {
    return reply.redirect('/dashboard');
  });
}

module.exports = dashboardRoutes;