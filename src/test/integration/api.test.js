const request = require('supertest');
const { setup, teardown, TestUtils } = require('../setup');

describe('API Integration Tests', () => {
  let app, dbConfig, redis, utils, server, testUser, authToken;

  beforeAll(async () => {
    ({ app, dbConfig, redis, utils } = await setup());
    server = app.getServer();
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
    await teardown(dbConfig, redis);
  });

  beforeEach(async () => {
    // Create test user
    testUser = await TestUtils.createTestUser(dbConfig);
    authToken = TestUtils.generateJWT(testUser.id, testUser.username, testUser.role);
  });

  afterEach(async () => {
    // Clean up test data
    await dbConfig.query('DELETE FROM admin_users WHERE username LIKE $1', ['test%']);
    await dbConfig.query('DELETE FROM customers WHERE name LIKE $1', ['Test%']);
    await dbConfig.query('DELETE FROM vouchers WHERE code LIKE $1', ['TEST%']);
  });

  describe('Authentication API', () => {
    test('POST /api/auth/login - successful login', async () => {
      const response = await request(server)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'testpass123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user.username).toBe('testuser');
    });

    test('POST /api/auth/login - invalid credentials', async () => {
      const response = await request(server)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid username or password');
    });

    test('POST /api/auth/login - missing credentials', async () => {
      const response = await request(server)
        .post('/api/auth/login')
        .send({
          username: 'testuser'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toContain('Password is required');
    });

    test('POST /api/auth/logout - successful logout', async () => {
      const response = await request(server)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('POST /api/auth/logout - unauthorized', async () => {
      const response = await request(server)
        .post('/api/auth/logout');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Customers API', () => {
    let testCustomer;

    beforeEach(async () => {
      testCustomer = await TestUtils.createTestCustomer(dbConfig);
    });

    test('GET /api/customers - list customers', async () => {
      const response = await request(server)
        .get('/api/customers')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.customers)).toBe(true);
      expect(response.body.data.customers.length).toBeGreaterThan(0);
    });

    test('POST /api/customers - create customer', async () => {
      const customerData = {
        name: 'New Test Customer',
        email: 'newtest@example.com',
        phone: '+6281234567890',
        address: 'New Test Address'
      };

      const response = await request(server)
        .post('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .send(customerData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.customer.name).toBe(customerData.name);
      expect(response.body.data.customer.email).toBe(customerData.email);
    });

    test('POST /api/customers - validation error', async () => {
      const response = await request(server)
        .post('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: '', // Empty name should fail validation
          email: 'invalid-email' // Invalid email should fail
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });

    test('GET /api/customers/:id - get customer', async () => {
      const response = await request(server)
        .get(`/api/customers/${testCustomer.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.customer.id).toBe(testCustomer.id);
      expect(response.body.data.customer.name).toBe(testCustomer.name);
    });

    test('PUT /api/customers/:id - update customer', async () => {
      const updateData = {
        name: 'Updated Test Customer',
        email: 'updated@example.com'
      };

      const response = await request(server)
        .put(`/api/customers/${testCustomer.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.customer.name).toBe(updateData.name);
      expect(response.body.data.customer.email).toBe(updateData.email);
    });

    test('DELETE /api/customers/:id - delete customer', async () => {
      const response = await request(server)
        .delete(`/api/customers/${testCustomer.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify customer is deleted
      const deletedCustomer = await dbConfig.query(
        'SELECT * FROM customers WHERE id = $1',
        [testCustomer.id]
      );
      expect(deletedCustomer.rows.length).toBe(0);
    });
  });

  describe('Vouchers API', () => {
    test('GET /api/vouchers - list vouchers', async () => {
      const response = await request(server)
        .get('/api/vouchers')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.vouchers)).toBe(true);
    });

    test('POST /api/vouchers - create voucher', async () => {
      const voucherData = {
        profileId: 'test_profile',
        quantity: 5,
        prefix: 'TEST',
        price: 15000
      };

      const response = await request(server)
        .post('/api/vouchers')
        .set('Authorization', `Bearer ${authToken}`)
        .send(voucherData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.vouchers).toHaveLength(5);
    });

    test('POST /api/vouchers - validation error', async () => {
      const response = await request(server)
        .post('/api/vouchers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          quantity: -1, // Invalid quantity
          profileId: '' // Empty profile ID
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('Payments API', () => {
    let testCustomer;

    beforeEach(async () => {
      testCustomer = await TestUtils.createTestCustomer(dbConfig);
    });

    test('GET /api/payments - list payments', async () => {
      const response = await request(server)
        .get('/api/payments')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.payments)).toBe(true);
    });

    test('POST /api/payments - create payment', async () => {
      const paymentData = {
        customerId: testCustomer.id,
        amount: 50000,
        method: 'cash',
        description: 'Test payment'
      };

      const response = await request(server)
        .post('/api/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(paymentData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.payment.amount).toBe(paymentData.amount);
      expect(response.body.data.payment.method).toBe(paymentData.method);
    });

    test('POST /api/payments - validation error', async () => {
      const response = await request(server)
        .post('/api/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          customerId: 'invalid-id',
          amount: -1000, // Invalid amount
          method: 'invalid-method'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('Rate Limiting', () => {
    test('API rate limiting - should allow normal requests', async () => {
      const promises = Array(10).fill().map(() =>
        request(server)
          .get('/api/customers')
          .set('Authorization', `Bearer ${authToken}`)
      );

      const responses = await Promise.all(promises);

      // All requests should succeed under normal rate limit
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    test('Login rate limiting - should block excessive attempts', async () => {
      const promises = Array(10).fill().map(() =>
        request(server)
          .post('/api/auth/login')
          .send({
            username: 'testuser',
            password: 'wrongpassword'
          })
      );

      const responses = await Promise.all(promises);

      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Security Headers', () => {
    test('Should include security headers', async () => {
      const response = await request(server)
        .get('/api/customers')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });
  });

  describe('Error Handling', () => {
    test('Should handle 404 errors', async () => {
      const response = await request(server)
        .get('/api/nonexistent-endpoint')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not found');
    });

    test('Should handle server errors gracefully', async () => {
      // This would need to be adjusted based on your actual error-prone endpoint
      const response = await request(server)
        .post('/api/test-error')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Health Check', () => {
    test('GET /health - should return health status', async () => {
      const response = await request(server).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.uptime).toBeDefined();
      expect(response.body.memory).toBeDefined();
      expect(response.body.database).toBeDefined();
    });
  });
});