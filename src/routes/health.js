// Health check endpoint
fastify.get('/health', async (request, reply) => {
  try {
    // Check database connection
    const dbCheck = await db.getOne("SELECT 1");

    // Check WhatsApp service
    const whatsappStatus = fastify.whatsappService.isReady();

    // Check queue status
    const queueStats = fastify.queueService.getStats();

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: require('../../package.json').version,
      services: {
        database: dbCheck ? 'healthy' : 'unhealthy',
        whatsapp: whatsappStatus ? 'healthy' : 'unhealthy',
        queue: queueStats.pending < 100 ? 'healthy' : 'degraded'
      },
      metrics: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      }
    };

    return health;
  } catch (error) {
    return reply.status(500).send({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});
