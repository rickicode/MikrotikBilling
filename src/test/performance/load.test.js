const { setup, teardown, TestUtils } = require('../setup');

describe('Performance Tests', () => {
  let app, dbConfig, redis, utils, server, testUser, authToken;

  beforeAll(async () => {
    ({ app, dbConfig, redis, utils } = await setup());
    server = app.getServer();
    testUser = await TestUtils.createTestUser(dbConfig);
    authToken = TestUtils.generateJWT(testUser.id, testUser.username, testUser.role);
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
    await teardown(dbConfig, redis);
  });

  describe('API Response Times', () => {
    test('Health check should respond within 100ms', async () => {
      const { duration } = await utils.measureTime(async () => {
        await fetch(`http://localhost:3000/health`);
      });

      expect(duration).toBeLessThan(100);
    });

    test('Customer list API should respond within 500ms', async () => {
      const { duration } = await utils.measureTime(async () => {
        await fetch(`http://localhost:3000/api/customers`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
      });

      expect(duration).toBeLessThan(500);
    });

    test('Customer creation should complete within 1000ms', async () => {
      const customerData = {
        name: 'Performance Test Customer',
        email: 'perf-test@example.com',
        phone: '+6281234567890',
        address: 'Performance Test Address'
      };

      const { duration } = await utils.measureTime(async () => {
        await fetch(`http://localhost:3000/api/customers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`
          },
          body: JSON.stringify(customerData)
        });
      });

      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Database Performance', () => {
    test('Database query should complete within 100ms', async () => {
      const { duration } = await utils.measureTime(async () => {
        await dbConfig.query('SELECT COUNT(*) FROM admin_users');
      });

      expect(duration).toBeLessThan(100);
    });

    test('Batch insert should complete within 1000ms', async () => {
      const customers = Array(100).fill().map((_, index) => ({
        name: `Batch Customer ${index}`,
        email: `batch${index}@example.com`,
        phone: `+6281234567${index.toString().padStart(4, '0')}`,
        address: `Batch Address ${index}`,
        balance: 0
      }));

      const { duration } = await utils.measureTime(async () => {
        await dbConfig.batchInsert('customers', customers);
      });

      expect(duration).toBeLessThan(1000);

      // Clean up
      await dbConfig.query("DELETE FROM customers WHERE name LIKE 'Batch%'");
    });

    test('Complex join query should complete within 500ms', async () => {
      const { duration } = await utils.measureTime(async () => {
        await dbConfig.query(`
          SELECT c.name, c.email, COUNT(v.id) as voucher_count
          FROM customers c
          LEFT JOIN vouchers v ON c.id = v.customer_id
          GROUP BY c.id, c.name, c.email
          ORDER BY c.name
          LIMIT 50
        `);
      });

      expect(duration).toBeLessThan(500);
    });
  });

  describe('Cache Performance', () => {
    test('Cache set and get should complete within 50ms', async () => {
      if (!redis) {
        console.warn('Skipping cache tests - Redis not available');
        return;
      }

      const { duration } = await utils.measureTime(async () => {
        await redis.set('test-key', 'test-value');
        await redis.get('test-key');
      });

      expect(duration).toBeLessThan(50);

      // Clean up
      await redis.del('test-key');
    });

    test('Cache batch operations should complete within 200ms', async () => {
      if (!redis) {
        console.warn('Skipping cache tests - Redis not available');
        return;
      }

      const operations = Array(100).fill().map((_, index) => ({
        key: `batch-key-${index}`,
        value: `batch-value-${index}`
      }));

      const { duration } = await utils.measureTime(async () => {
        const pipeline = redis.pipeline();
        operations.forEach(op => pipeline.set(op.key, op.value));
        await pipeline.exec();
      });

      expect(duration).toBeLessThan(200);

      // Clean up
      const pipeline = redis.pipeline();
      operations.forEach(op => pipeline.del(op.key));
      await pipeline.exec();
    });
  });

  describe('Load Testing', () => {
    test('Should handle 50 concurrent requests', async () => {
      const requests = Array(50).fill().map(async () => {
        const { duration } = await utils.measureTime(async () => {
          const response = await fetch(`http://localhost:3000/health`);
          return response.status;
        });
        return duration;
      });

      const results = await Promise.all(requests);

      // All requests should succeed
      expect(results.every(status => status === 200)).toBe(true);

      // Calculate statistics
      const avg = results.reduce((sum, time) => sum + time, 0) / results.length;
      const max = Math.max(...results);
      const min = Math.min(...results);

      expect(avg).toBeLessThan(200); // Average response time
      expect(max).toBeLessThan(1000); // Max response time
    });

    test('Should handle 100 database queries concurrently', async () => {
      const queries = Array(100).fill().map(async () => {
        const { duration } = await utils.measureTime(async () => {
          await dbConfig.query('SELECT 1 as test');
        });
        return duration;
      });

      const results = await Promise.all(queries);

      const avg = results.reduce((sum, time) => sum + time, 0) / results.length;
      const max = Math.max(...results);

      expect(avg).toBeLessThan(100); // Average query time
      expect(max).toBeLessThan(500); // Max query time
    });
  });

  describe('Memory Usage', () => {
    test('Memory usage should be reasonable', async () => {
      const initialMemory = process.memoryUsage();

      // Create and delete 100 customers
      const customers = [];
      for (let i = 0; i < 100; i++) {
        const customer = await TestUtils.createTestCustomer(dbConfig, {
          name: `Memory Test Customer ${i}`,
          email: `memory${i}@example.com`
        });
        customers.push(customer);
      }

      // Delete all customers
      for (const customer of customers) {
        await dbConfig.query('DELETE FROM customers WHERE id = $1', [customer.id]);
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('Benchmark Tests', () => {
    test('Database operations benchmark', async () => {
      const iterations = 1000;

      const insertBenchmark = await utils.benchmark(async () => {
        await TestUtils.createTestCustomer(dbConfig, {
          name: `Benchmark Customer ${Math.random()}`,
          email: `benchmark-${Math.random()}@example.com`
        });
      }, iterations);

      console.log('Database Insert Benchmark:', insertBenchmark);
      expect(insertBenchmark.avg).toBeLessThan(50); // Average insert time

      // Clean up
      await dbConfig.query("DELETE FROM customers WHERE name LIKE 'Benchmark%'");
    });

    test('Cache operations benchmark', async () => {
      if (!redis) {
        console.warn('Skipping cache benchmark - Redis not available');
        return;
      }

      const iterations = 1000;

      const cacheBenchmark = await utils.benchmark(async () => {
        const key = `benchmark-${Math.random()}`;
        await redis.set(key, 'benchmark-value');
        await redis.get(key);
        await redis.del(key);
      }, iterations);

      console.log('Cache Operations Benchmark:', cacheBenchmark);
      expect(cacheBenchmark.avg).toBeLessThan(10); // Average cache operation time
    });
  });

  describe('Stress Tests', () => {
    test('Should recover from memory pressure', async () => {
      // Create memory pressure
      const largeArrays = [];
      for (let i = 0; i < 10; i++) {
        largeArrays.push(new Array(100000).fill(0).map(() => Math.random()));
      }

      // Test that the system still responds
      const { duration } = await utils.measureTime(async () => {
        await fetch(`http://localhost:3000/health`);
      });

      expect(duration).toBeLessThan(5000); // Should still respond within 5 seconds

      // Clean up memory
      largeArrays.length = 0;

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    });

    test('Should handle database connection pool exhaustion', async () => {
      // Create many concurrent database operations
      const queries = Array(100).fill().map(async (index) => {
        try {
          const result = await dbConfig.query('SELECT pg_sleep(0.1), $1 as index', [index]);
          return result.rows[0].index;
        } catch (error) {
          return `Error: ${error.message}`;
        }
      });

      const results = await Promise.all(queries);

      // Most queries should succeed
      const successfulQueries = results.filter(r => typeof r === 'number');
      expect(successfulQueries.length).toBeGreaterThan(80); // At least 80% should succeed
    });
  });
});