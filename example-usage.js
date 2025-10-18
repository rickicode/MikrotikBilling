/**
 * Example Usage of Complete Mikrotik Billing Architecture
 *
 * This file demonstrates how to use all the architectural components together
 * to build a comprehensive, enterprise-grade billing system
 */

const { createApplication } = require('./src/app-architectured');

/**
 * Example 1: Basic Application Setup
 */
async function basicSetup() {
  console.log('=== BASIC APPLICATION SETUP ===');

  // Create application instance
  const app = createApplication({
    serviceId: 'mikrotik-billing-demo',
    version: '2.0.0',
    environment: 'development',

    // Component configurations
    serviceContainer: {
      enableLogging: true,
      enableMonitoring: true,
      enableCaching: true
    },

    tracing: {
      enableTracing: true,
      sampleRate: 1.0
    },

    monitoring: {
      enablePrometheus: true,
      enableMetrics: true,
      enableAlerts: false // Disable in development
    },

    apiGateway: {
      enableAuthentication: true,
      enableRateLimiting: true,
      defaultRateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 100
      }
    },

    queueService: {
      enableMetrics: true,
      enablePriority: true,
      enableBatching: true
    },

    eventBus: {
      enablePersistence: true,
      enableRetry: true,
      enableMetrics: true
    },

    errorHandler: {
      enableLogging: true,
      enableErrorTracking: true,
      enableErrorAlerts: false
    }
  });

  // Initialize the application
  await app.initialize();

  // Get health status
  const health = await app.getHealthStatus();
  console.log('Application Health:', health.service.status);

  // Get metrics
  const metrics = await app.getMetrics();
  console.log('Components:', Object.keys(metrics.components));

  return app;
}

/**
 * Example 2: Domain Service Usage
 */
async function domainServiceExample(app) {
  console.log('\n=== DOMAIN SERVICE EXAMPLE ===');

  // Get service container
  const container = app.components.serviceContainer;

  // Create a customer (using Billing Service)
  const billingService = container.get('billingService');
  if (billingService) {
    // Create a new customer subscription
    const subscription = await billingService.createSubscriptionBilling({
      id: 'sub_001',
      customerId: 'customer_001',
      price: 50000,
      currency: 'IDR',
      billingCycle: 'monthly',
      profile: '10MB-MONTHLY',
      serviceType: 'hotspot',
      autoRenew: true
    });

    console.log('Created subscription:', subscription.id);

    // Process a payment
    const paymentResult = await billingService.processPaymentCompletion({
      billingRecordId: subscription.id,
      id: 'pay_001',
      amount: 50000,
      method: 'cash',
      status: 'completed'
    });

    console.log('Payment processed:', paymentResult.status);
  }
}

/**
 * Example 3: Event Bus Usage
 */
async function eventBusExample(app) {
  console.log('\n=== EVENT BUS EXAMPLE ===');

  const eventBus = app.components.eventBus;

  // Subscribe to billing events
  eventBus.subscribe('billing.payment.completed', async (event) => {
    console.log('💰 Payment completed event received:', event.data);

    // Send notification
    await app.components.queueService.add('notifications', {
      id: 'notif_' + Date.now(),
      type: 'payment_confirmation',
      recipient: event.data.customerId,
      message: `Payment of ${event.data.amount} ${event.data.currency} received successfully`,
      data: event.data
    });
  }, {
    domain: 'billing'
  });

  // Subscribe to customer events
  eventBus.subscribe('customer.created', async (event) => {
    console.log('👤 Customer created event received:', event.data);

    // Send welcome notification
    await app.components.queueService.add('notifications', {
      id: 'welcome_' + Date.now(),
      type: 'welcome',
      recipient: event.data.customerId,
      message: 'Welcome to Mikrotik Billing System!',
      data: event.data
    });
  });

  // Publish a custom event
  await eventBus.publish('system.maintenance', {
    type: 'scheduled',
    message: 'System maintenance scheduled',
    startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    duration: 3600000 // 1 hour
  });
}

/**
 * Example 4: Queue Service Usage
 */
async function queueServiceExample(app) {
  console.log('\n=== QUEUE SERVICE EXAMPLE ===');

  const queueService = app.components.queueService;

  // Create a high priority job
  const urgentJob = await queueService.add('notifications', {
    id: 'urgent_001',
    type: 'alert',
    priority: 'high',
    recipient: 'admin@example.com',
    message: 'Critical system alert',
    data: { severity: 'critical' }
  }, {
    priority: 10,
    delay: 0
  });

  console.log('Created urgent job:', urgentJob.id);

  // Create a scheduled job
  const scheduledJob = await queueService.add('reports', {
    id: 'daily_report_001',
    type: 'daily',
    date: new Date().toISOString().split('T')[0],
    format: 'pdf'
  }, {
    cron: '0 0 * * *' // Daily at midnight
  });

  console.log('Created scheduled job:', scheduledJob.id);

  // Create a batch of jobs
  const batchJobs = [];
  for (let i = 0; i < 5; i++) {
    batchJobs.push(queueService.add('cleanup', {
      id: `cleanup_${i}`,
      type: 'logs',
      date: new Date().toISOString()
    }));
  }

  console.log('Created batch jobs:', batchJobs.length);

  // Get queue statistics
  const stats = await queueService.getStats();
  console.log('Queue statistics:', stats);
}

/**
 * Example 5: API Gateway Usage
 */
async function apiGatewayExample(app) {
  console.log('\n=== API GATEWAY EXAMPLE ===');

  const gateway = app.components.apiGateway;

  // Register custom API routes
  gateway.registerRoute('/api/v1/customers', async (context) => {
    const { query } = context.request;

    // Mock customer data
    const customers = [
      { id: 1, name: 'John Doe', email: 'john@example.com', balance: 100000 },
      { id: 2, name: 'Jane Smith', email: 'jane@example.com', balance: 50000 }
    ];

    // Apply filtering
    if (query.search) {
      return customers.filter(c =>
        c.name.toLowerCase().includes(query.search.toLowerCase()) ||
        c.email.toLowerCase().includes(query.search.toLowerCase())
      );
    }

    return {
      customers,
      total: customers.length,
      page: parseInt(query.page) || 1,
      limit: parseInt(query.limit) || 10
    };
  }, {
    method: 'GET',
    auth: true,
    cache: 300, // 5 minutes cache
    validation: {
      query: {
        search: { type: 'string', optional: true },
        page: { type: 'number', optional: true },
        limit: { type: 'number', optional: true }
      }
    }
  });

  // Register POST route for creating customers
  gateway.registerRoute('/api/v1/customers', async (context) => {
    const { body } = context.request;

    // Mock customer creation
    const newCustomer = {
      id: Date.now(),
      ...body,
      createdAt: new Date().toISOString(),
      balance: 0
    };

    // Publish customer created event
    await app.components.eventBus.publish('customer.created', newCustomer);

    return {
      success: true,
      customer: newCustomer
    };
  }, {
    method: 'POST',
    auth: true,
    validation: {
      body: {
        name: { type: 'string', required: true },
        email: { type: 'string', required: true },
        phone: { type: 'string', optional: true }
      }
    }
  });

  // Register webhook endpoint
  gateway.registerRoute('/api/v1/webhook/payment', async (context) => {
    const { body, headers } = context.request;

    // Verify webhook signature (if applicable)
    const signature = headers['x-webhook-signature'];

    // Process payment webhook
    const webhookData = {
      ...body,
      receivedAt: new Date().toISOString(),
      signature
    };

    // Add to processing queue
    await app.components.queueService.add('webhooks', {
      id: 'webhook_' + Date.now(),
      type: 'payment',
      data: webhookData
    });

    return {
      success: true,
      message: 'Webhook received for processing'
    };
  }, {
    method: 'POST',
    auth: false, // Webhooks typically don't require authentication
    enableRequestSigning: true,
    validation: {
      body: {
        transactionId: { type: 'string', required: true },
        status: { type: 'string', required: true },
        amount: { type: 'number', required: true }
      }
    }
  });

  console.log('Custom API routes registered');
}

/**
 * Example 6: Circuit Breaker Usage
 */
async function circuitBreakerExample(app) {
  console.log('\n=== CIRCUIT BREAKER EXAMPLE ===');

  const circuitBreaker = app.components.circuitBreaker;

  // Register external service circuit breaker
  const mikrotikBreaker = circuitBreaker.registerService('mikrotik-api', {
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    maxRetries: 3,
    enableHealthCheck: true,
    healthCheckEndpoint: 'http://mikrotik.local/health'
  });

  // Execute operation through circuit breaker
  try {
    const result = await circuitBreaker.execute('mikrotik-api', async () => {
      // Simulate Mikrotik API call
      console.log('Calling Mikrotik API...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      return {
        success: true,
        data: { activeUsers: 150, bandwidth: '100Mbps' }
      };
    });

    console.log('Mikrotik API result:', result);

  } catch (error) {
    console.error('Mikrotik API call failed:', error.message);
  }

  // Get circuit breaker statistics
  const stats = circuitBreaker.getStatistics();
  console.log('Circuit breaker statistics:', stats.summary);
}

/**
 * Example 7: Testing Framework Usage
 */
async function testingExample(app) {
  console.log('\n=== TESTING FRAMEWORK EXAMPLE ===');

  if (!app.components.testingFramework) {
    console.log('Testing framework not available in production environment');
    return;
  }

  const testing = app.components.testingFramework;

  // Run unit tests
  console.log('Running unit tests...');
  const unitResults = await testing.runUnitTests({
    parallel: true,
    maxConcurrency: 4,
    enableCoverage: true
  });

  console.log('Unit test results:', {
    total: unitResults.summary.total,
    passed: unitResults.summary.passed,
    failed: unitResults.summary.failed,
    successRate: ((unitResults.summary.passed / unitResults.summary.total) * 100).toFixed(2) + '%'
  });

  // Run integration tests
  console.log('Running integration tests...');
  const integrationResults = await testing.runIntegrationTests({
    timeout: 60000, // 1 minute
    retries: 1
  });

  console.log('Integration test results:', {
    total: integrationResults.summary.total,
    passed: integrationResults.summary.passed,
    failed: integrationResults.summary.failed
  });

  // Get testing statistics
  const stats = testing.getStatistics();
  console.log('Testing statistics:', stats);
}

/**
 * Example 8: Distributed Tracing Usage
 */
async function tracingExample(app) {
  console.log('\n=== DISTRIBUTED TRACING EXAMPLE ===');

  const tracing = app.components.tracing;

  // Start a trace
  const trace = tracing.startTrace('customer-registration-flow');

  // Start a span for user validation
  const validationSpan = tracing.startSpan(trace.traceId, 'validate-user-data');
  await new Promise(resolve => setTimeout(resolve, 100));
  tracing.addTag(trace.traceId, validationSpan.spanId, 'validation.status', 'success');
  tracing.finishSpan(trace.traceId, validationSpan.spanId);

  // Start a span for database operation
  const dbSpan = tracing.startSpan(trace.traceId, 'save-customer-to-database');
  await new Promise(resolve => setTimeout(resolve, 200));
  tracing.addTag(trace.traceId, dbSpan.spanId, 'db.operation', 'insert');
  tracing.addTag(trace.traceId, dbSpan.spanId, 'db.table', 'customers');
  tracing.finishSpan(trace.traceId, dbSpan.spanId);

  // Start a span for notification
  const notificationSpan = tracing.startSpan(trace.traceId, 'send-welcome-notification');
  await new Promise(resolve => setTimeout(resolve, 150));
  tracing.addTag(trace.traceId, notificationSpan.spanId, 'notification.type', 'email');
  tracing.addTag(trace.traceId, notificationSpan.spanId, 'notification.status', 'sent');
  tracing.finishSpan(trace.traceId, notificationSpan.spanId);

  // Finish the trace
  tracing.finishTrace(trace.traceId);

  // Get trace statistics
  const traceStats = tracing.getStatistics();
  console.log('Tracing statistics:', traceStats);
}

/**
 * Example 9: Monitoring and Alerting
 */
async function monitoringExample(app) {
  console.log('\n=== MONITORING AND ALERTING EXAMPLE ===');

  const monitoring = app.components.monitoring;

  // Record custom business metrics
  monitoring.recordBusinessMetric('new_customers', 1, {
    source: 'registration',
    plan: 'premium'
  });

  monitoring.recordBusinessMetric('revenue', 50000, {
    currency: 'IDR',
    payment_method: 'bank_transfer'
  });

  // Record performance metrics
  monitoring.recordPerformanceMetric('customer_creation', 250, {
    steps: ['validation', 'database', 'notification']
  });

  // Record HTTP request metric
  monitoring.recordHttpRequest('POST', '/api/v1/customers', 201, 450);

  // Get monitoring dashboard data
  const dashboard = monitoring.getDashboardData();
  console.log('Dashboard overview:', {
    service: dashboard.overview.service,
    uptime: dashboard.overview.uptime,
    activeAlerts: dashboard.alerts.active.length,
    overallHealth: dashboard.health.overall
  });
}

/**
 * Example 10: Error Handling
 */
async function errorHandlingExample(app) {
  console.log('\n=== ERROR HANDLING EXAMPLE ===');

  const errorHandler = app.components.errorHandler;

  // Wrap a function with error handling
  const riskyOperation = errorHandler.wrap(async (customerId) => {
    if (!customerId) {
      throw new Error('Customer ID is required');
    }

    if (customerId === 'invalid') {
      throw new Error('Invalid customer ID format');
    }

    return {
      id: customerId,
      name: 'Test Customer',
      status: 'active'
    };
  }, {
    context: {
      operation: 'customer_lookup',
      component: 'customer_service'
    }
  });

  // Test successful operation
  try {
    const result = await riskyOperation('customer_123');
    console.log('Operation succeeded:', result);
  } catch (error) {
    console.error('Operation failed:', error.message);
  }

  // Test error handling
  try {
    const result = await riskyOperation(null);
  } catch (error) {
    console.log('Error handled by framework:', error.message);
  }

  // Get error statistics
  const errorStats = errorHandler.getErrorStatistics();
  console.log('Error statistics:', {
    total: errorStats.total,
    byCategory: errorStats.byCategory
  });
}

/**
 * Main execution function
 */
async function main() {
  let app;

  try {
    // Initialize application
    app = await basicSetup();

    // Run all examples
    await domainServiceExample(app);
    await eventBusExample(app);
    await queueServiceExample(app);
    await apiGatewayExample(app);
    await circuitBreakerExample(app);
    await testingExample(app);
    await tracingExample(app);
    await monitoringExample(app);
    await errorHandlingExample(app);

    console.log('\n🎉 ALL EXAMPLES COMPLETED SUCCESSFULLY!');
    console.log('\nThe Mikrotik Billing System with Complete Architecture is running.');
    console.log('Components:', Object.keys(app.components));
    console.log('Health Status:', (await app.getHealthStatus()).service.status);

  } catch (error) {
    console.error('❌ Error in examples:', error);
  } finally {
    // Graceful shutdown
    if (app) {
      console.log('\n🛑 Shutting down application...');
      await app.shutdown();
    }
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  basicSetup,
  domainServiceExample,
  eventBusExample,
  queueServiceExample,
  apiGatewayExample,
  circuitBreakerExample,
  testingExample,
  tracingExample,
  monitoringExample,
  errorHandlingExample,
  main
};