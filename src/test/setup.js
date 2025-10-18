const path = require('path');
const { Worker } = require('worker_threads');

// Test configuration
const testConfig = {
  testDatabase: {
    host: process.env.TEST_DB_HOST || 'localhost',
    port: process.env.TEST_DB_PORT || 5432,
    database: process.env.TEST_DB_NAME || 'mikrotik_billing_test',
    user: process.env.TEST_DB_USER || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'test'
  },
  testRedis: {
    host: process.env.TEST_REDIS_HOST || 'localhost',
    port: process.env.TEST_REDIS_PORT || 6379,
    db: 1 // Use different DB for tests
  }
};

// Test utilities
class TestUtils {
  static async setupTestDatabase() {
    const { Pool } = require('pg');
    const pool = new Pool(testConfig.testDatabase);

    try {
      // Create test database if it doesn't exist
      const adminPool = new Pool({
        host: testConfig.testDatabase.host,
        port: testConfig.testDatabase.port,
        user: testConfig.testDatabase.user,
        password: testConfig.testDatabase.password,
        database: 'postgres'
      });

      await adminPool.query(`CREATE DATABASE ${testConfig.testDatabase.database}`);
      await adminPool.end();

      console.log('✅ Test database created');
    } catch (error) {
      if (error.code !== '42P04') { // Database already exists
        throw error;
      }
    }

    // Run migrations on test database
    const DatabaseConfig = require('../config/database');
    const dbConfig = new DatabaseConfig();

    // Override test database config
    dbConfig.pools.clear();
    dbConfig.createPool('test', testConfig.testDatabase);

    return dbConfig;
  }

  static async cleanupTestDatabase() {
    const { Pool } = require('pg');
    const pool = new Pool(testConfig.testDatabase);

    try {
      // Drop all tables
      const tables = await pool.query(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
      `);

      for (const table of tables.rows) {
        await pool.query(`DROP TABLE IF EXISTS ${table.tablename} CASCADE`);
      }

      console.log('✅ Test database cleaned up');
    } finally {
      await pool.end();
    }
  }

  static async setupTestRedis() {
    const Redis = require('ioredis');
    const redis = new Redis(testConfig.testRedis);

    try {
      await redis.flushdb(); // Clear test database
      console.log('✅ Test Redis setup completed');
      return redis;
    } catch (error) {
      console.warn('⚠️  Redis not available for tests');
      return null;
    }
  }

  static createTestApp() {
    const Application = require('../app');
    const app = new Application();

    // Override configurations for testing
    process.env.NODE_ENV = 'test';
    process.env.DB_HOST = testConfig.testDatabase.host;
    process.env.DB_PORT = testConfig.testDatabase.port;
    process.env.DB_NAME = testConfig.testDatabase.database;
    process.env.DB_USER = testConfig.testDatabase.user;
    process.env.DB_PASSWORD = testConfig.testDatabase.password;
    process.env.REDIS_HOST = testConfig.testRedis.host;
    process.env.REDIS_PORT = testConfig.testRedis.port;
    process.env.REDIS_DB = testConfig.testRedis.db;

    return app;
  }

  static async createTestUser(db, userData = {}) {
    const bcrypt = require('bcrypt');
    const defaultUser = {
      username: 'testuser',
      password: 'testpass123',
      role: 'admin',
      active: true
    };

    const user = { ...defaultUser, ...userData };
    const hashedPassword = await bcrypt.hash(user.password, 10);

    const result = await db.query(`
      INSERT INTO admin_users (username, password_hash, role, active, created_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, username, role
    `, [user.username, hashedPassword, user.role, user.active, new Date()]);

    return result.rows[0];
  }

  static async createTestCustomer(db, customerData = {}) {
    const defaultCustomer = {
      name: 'Test Customer',
      email: 'test@example.com',
      phone: '+628123456789',
      address: 'Test Address',
      balance: 0
    };

    const customer = { ...defaultCustomer, ...customerData };

    const result = await db.query(`
      INSERT INTO customers (name, email, phone, address, balance, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, email
    `, [customer.name, customer.email, customer.phone, customer.address, customer.balance, new Date()]);

    return result.rows[0];
  }

  static async createTestVoucher(db, voucherData = {}) {
    const defaultVoucher = {
      code: 'TEST001',
      profile_id: 'test_profile',
      price_sell: 10000,
      first_login: null,
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'active',
      created_at: new Date()
    };

    const voucher = { ...defaultVoucher, ...voucherData };

    const result = await db.query(`
      INSERT INTO vouchers (code, profile_id, price_sell, first_login, valid_until, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, code, status
    `, [voucher.code, voucher.profile_id, voucher.price_sell, voucher.first_login, voucher.valid_until, voucher.status, voucher.created_at]);

    return result.rows[0];
  }

  static generateJWT(userId, username = 'testuser', role = 'admin') {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
      { id: userId, username, role },
      process.env.JWT_SECRET || 'test-secret-key-for-testing-only',
      { expiresIn: '1h' }
    );
  }

  static createTestRequest(options = {}) {
    const defaults = {
      method: 'GET',
      url: '/',
      headers: {
        'user-agent': 'test-agent',
        'x-request-id': 'test-request-id'
      },
      body: {},
      query: {},
      params: {}
    };

    return { ...defaults, ...options };
  }

  static async waitFor(condition, timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Condition not met within ${timeout}ms`);
  }

  static generateRandomString(length = 10) {
    return Math.random().toString(36).substring(2, 2 + length);
  }

  static generateRandomEmail() {
    return `test-${Math.random().toString(36).substring(2)}@example.com`;
  }

  static generateRandomPhone() {
    return `+628${Math.random().toString(36).substring(2, 12)}`;
  }

  // Worker thread utilities for parallel testing
  static async runTestInWorker(testFile, testData = {}) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(__filename, {
        workerData: { testFile, testData }
      });

      worker.on('message', resolve);
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    });
  }

  // Performance testing utilities
  static async measureTime(fn) {
    const start = process.hrtime.bigint();
    const result = await fn();
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to milliseconds

    return { result, duration };
  }

  static async benchmark(fn, iterations = 100) {
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const { duration } = await this.measureTime(fn);
      times.push(duration);
    }

    const sorted = times.sort((a, b) => a - b);
    const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];

    return { avg, min, max, p50, p95, p99, iterations };
  }

  // Mock utilities
  static createMockMikrotikClient() {
    return {
      connect: jest.fn().mockResolvedValue(true),
      disconnect: jest.fn().mockResolvedValue(true),
      getUsers: jest.fn().mockResolvedValue([]),
      createUser: jest.fn().mockResolvedValue({ '.id': '*1' }),
      removeUser: jest.fn().mockResolvedValue(true),
      getProfiles: jest.fn().mockResolvedValue([]),
      executeCommand: jest.fn().mockResolvedValue([])
    };
  }

  static createMockWhatsAppService() {
    return {
      sendMessage: jest.fn().mockResolvedValue(true),
      isConnected: jest.fn().mockReturnValue(true),
      getSession: jest.fn().mockResolvedValue({ status: 'connected' })
    };
  }

  static createMockPaymentGateway() {
    return {
      createPayment: jest.fn().mockResolvedValue({
        success: true,
        paymentId: 'test-payment-id',
        redirectUrl: 'https://test-payment-url.com'
      }),
      checkStatus: jest.fn().mockResolvedValue({
        success: true,
        status: 'success',
        amount: 10000
      })
    };
  }
}

// Global test setup
async function setup() {
  console.log('🧪 Setting up test environment...');

  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
  process.env.SESSION_SECRET = 'test-session-secret-for-testing-only';

  // Setup test database
  const dbConfig = await TestUtils.setupTestDatabase();

  // Setup test Redis
  const redis = await TestUtils.setupTestRedis();

  // Create test app
  const app = TestUtils.createTestApp();
  await app.initialize();

  console.log('✅ Test environment setup completed');

  return {
    dbConfig,
    redis,
    app,
    utils: TestUtils
  };
}

// Global test cleanup
async function teardown(dbConfig, redis) {
  console.log('🧹 Cleaning up test environment...');

  // Cleanup test database
  await TestUtils.cleanupTestDatabase();

  // Close Redis connection
  if (redis) {
    await redis.quit();
  }

  // Close database connections
  if (dbConfig) {
    await dbConfig.close();
  }

  console.log('✅ Test environment cleanup completed');
}

// Export for use in tests
module.exports = {
  setup,
  teardown,
  TestUtils,
  testConfig
};