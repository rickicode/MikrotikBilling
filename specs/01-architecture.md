# Architecture Overview v2.0

## 1. System Architecture

### 1.1 High-Level Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│                 │    │                 │    │                 │
│  Web Frontend   │◄──►│  Fastify API    │◄──►│  Mikrotik API   │
│ (Bootstrap+HTMX)│    │   Server        │    │  (RouterOS)     │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│                 │    │                 │    │                 │
│   Static Files  │    │  PostgreSQL DB  │    │   User Data     │
│   (Public)      │    │  (Primary)      │    │  (Comments)     │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        Services Layer                       │
├─────────────────┬─────────────────┬─────────────────────────┤
│  WhatsApp       │  Payment        │  Scheduler &            │
│  Integration    │  Gateway        │  Background Tasks      │
│  (Baileys)      │  (Plugin-Based) │  (Redis Queue)          │
└─────────────────┴─────────────────┴─────────────────────────┘
```

### 1.2 Component Architecture

```
src/
├── app.js                    # Main application entry
├── config/                   # Configuration files
│   ├── database.js          # Database configuration
│   ├── mikrotik.js          # Mikrotik connection config
│   └── payment.js           # Payment gateway config
├── database/                 # Database layer
│   ├── connection.js        # PostgreSQL connection pool
│   ├── migrations/          # Migration files
│   └── models/              # Data models
├── services/                 # Business logic services
│   ├── MikrotikClient.js    # Mikrotik API client
│   ├── WhatsAppService.js   # WhatsApp integration
│   ├── PaymentService.js    # Payment processing
│   ├── PluginManager.js     # Payment plugin manager
│   └── Scheduler.js         # Background tasks
├── routes/                   # API routes
│   ├── auth.js              # Authentication routes
│   ├── customers.js         # Customer management
│   ├── vouchers.js          # Voucher system
│   ├── pppoe.js             # PPPoE management
│   ├── payments.js          # Payment processing
│   └── subscriptions.js     # Subscription management
├── middleware/               # Custom middleware
│   ├── auth.js              # Authentication middleware
│   ├── validation.js        # Input validation
│   └── errorHandler.js      # Error handling
└── views/                    # EJS templates
    ├── layouts/             # Page layouts
    ├── customers/           # Customer views
    ├── vouchers/            # Voucher views
    └── payments/            # Payment views
```

## 2. Data Flow Architecture

### 2.1 Voucher System Flow

```
[Admin Create Voucher] → [Generate Batch] → [DB Transaction] → [Mikrotik API]
       ↓                         ↓                    ↓               ↓
  [Input Validation]    → [Unique Code Gen] → [Save to DB] → [Create User]
       ↓                         ↓                    ↓               ↓
  [Comment Format]      → [Transaction ID] → [Log Activity] → [Pipe Comment]
                                                                 ↓
                                                        [First Login Detection]
                                                                 ↓
                                                        [Start Expiry Timer]
```

### 2.2 Subscription Flow

```
[Customer Registration] → [Choose Package] → [Create Subscription] → [Generate Invoice]
           ↓                     ↓                    ↓                      ↓
    [Phone Validation] → [Profile Selection] → [DB Transaction] → [WhatsApp Notify]
                                                                              ↓
                                                                     [Invoice with Payment Options]
                                                                             ↓
                                   ┌────────────────────────────────┘
                                   ↓
                          [Customer Clicks Payment]
                                   ↓
                          ┌─────────────────┬────────────────┐
                          ↓                 ↓                ↓
                    [Online Payment]  [Manual/Cash]  [Other Methods]
                          ↓                 ↓                ↓
                    [Plugin Process]  [Admin Confirm]  [Custom Plugin]
                          ↓                 ↓                ↓
                    [Callback API]    → [Update Balance] → [Carry Over Logic]
```

### 2.3 Mikrotik Sync Flow

```
[System Startup] → [Connect to Mikrotik] → [Verify Integration] → [Background Sync]
        ↓                    ↓                      ↓                    ↓
   [Load Config]    → [Test Connection] → [Check Users] → [Scheduled Tasks]
        ↓                    ↓                      ↓                    ↓
[Cache Settings]  → [Pool Connection] → [Sync Missing] → [User Monitoring]
```

## 3. Service Layer Architecture

### 3.1 Service Communication Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    Service Layer                             │
├─────────────────┬─────────────────┬─────────────────────────┤
│                 │                 │                         │
│  Controller     │    Service      │      Repository         │
│  (Routes)       │   (Business)    │      (Data)             │
│                 │                 │                         │
│  - HTTP Request │  - Validate     │  - PostgreSQL Query    │
│  - Input Parse  │  - Process      │  - Transaction Mgmt    │
│  - Response     │  - Business     │  - Error Handling      │
│  - Error Handling│    Logic        │  - Connection Pool     │
└─────────────────┴─────────────────┴─────────────────────────┘
```

### 3.2 Plugin Architecture for Payment Gateway

**Why Plugin-Based?**
Mempermudah penambahan payment gateway baru tanpa mengubah kode inti sistem. Cukup upload file ZIP dan centang untuk mengaktifkan.

```
┌─────────────────────────────────────────────────────────────┐
│              Payment Plugin Manager v2.0                    │
├─────────────────┬─────────────────┬─────────────────────────┤
│                 │                 │                         │
│   Plugin Base   │   DuitKu        │    Manual/Cash         │
│   (Interface)   │   (Plugin)      │      (Plugin)           │
│                 │                 │                         │
│ - createPayment │ - API Request   │ - Manual Input         │
│ - checkStatus   │ - Signature     │ - Admin Confirmation   │
│ - handleCallback│ - Webhook       │ - Receipt Generation   │
│ - refund        │ - QR Generation │ - Balance Update       │
│ - getInfo       │ - Fee Calc      │ - Receipt Print         │
│ - validate      │ - Status Check  │ - History Tracking      │
└─────────────────┴─────────────────┴─────────────────────────┘
                          ↓
                 ┌─────────────────┐
                 │  Upload ZIP UI  │
                 │  + Checkbox     │
                 │  Activation     │
                 └─────────────────┘
```

**Plugin ZIP Structure**
```
payment-plugin.zip
├── index.js           # Main plugin file (CommonJS)
├── manifest.json      # Plugin metadata
├── assets/           # Frontend assets (CSS, JS, images)
│   ├── admin.css
│   ├── payment.js
│   └── logo.png
└── config.json       # Default configuration
```

**Plugin Security**
- Plugin execution dalam sandboxed context
- File validation (ZIP only, max 10MB)
- Plugin signature verification (production)
- Error isolation dengan try-catch wrapper

## 4. Database Architecture

### 4.1 PostgreSQL Connection Strategy

```javascript
// Connection Pool Configuration
const pool = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,        // Maximum connections
  min: 5,         // Minimum connections
  idle: 10000,    // Idle timeout
  acquire: 30000, // Acquire timeout
  evict: 1000     // Eviction check
};
```

### 4.2 Migration Strategy

```
migrations/
├── 001_create_initial_schema.sql
├── 002_add_voucher_system.sql
├── 003_add_payment_system.sql
├── 004_add_whatsapp_tables.sql
├── 005_add_pppoe_system.sql
└── 006_add_subscription_system.sql
```

### 4.3 Transaction Management

```javascript
// Transaction Pattern
async function createVoucherBatch(data) {
  const transaction = await db.beginTransaction();

  try {
    // 1. Create batch record
    const batch = await transaction.query(`
      INSERT INTO voucher_batches (...)
      VALUES (...)
      RETURNING id
    `, [data]);

    // 2. Generate and create vouchers
    for (const voucher of vouchers) {
      await transaction.query(`
        INSERT INTO vouchers (...)
        VALUES (...)
      `, [voucher]);
    }

    // 3. Create in Mikrotik
    await mikrotik.createUsers(vouchers);

    await transaction.commit();
    return { success: true, batch_id: batch.id };
  } catch (error) {
    await transaction.rollback();
    // Cleanup partial Mikrotik users
    await mikrotik.cleanupPartial(vouchers);
    throw error;
  }
}
```

## 5. Caching Strategy

### 5.1 Multi-Level Caching

```
┌─────────────────────────────────────────────────────────────┐
│                     Caching Layers                          │
├─────────────────┬─────────────────┬─────────────────────────┤
│                 │                 │                         │
│   Application   │    Redis        │     Mikrotik           │
│   (Memory)      │   (Cache)       │      (API)             │
│                 │                 │                         │
│ - User Session  │ - Auth Tokens   │ - Profile Data         │
│ - Settings      │ - API Responses │ - Active Users         │
│ - Templates     │ - Queue Data    │ - Bandwidth Info       │
│ - Fast Lookup   │ - Temp Data     │ - System Status        │
│ (TTL: 5-30 min) │ (TTL: 1-24 hr)  │ (TTL: 30-60 sec)       │
└─────────────────┴─────────────────┴─────────────────────────┘
```

### 5.2 Cache Implementation Pattern

```javascript
// Cache Service
class CacheService {
  constructor(redisClient) {
    this.redis = redisClient;
    this.localCache = new Map();
  }

  async get(key, fallback = null) {
    // 1. Check local cache
    if (this.localCache.has(key)) {
      return this.localCache.get(key);
    }

    // 2. Check Redis cache
    const cached = await this.redis.get(key);
    if (cached) {
      const data = JSON.parse(cached);
      this.localCache.set(key, data);
      return data;
    }

    // 3. Execute fallback
    if (fallback) {
      const data = await fallback();
      await this.set(key, data, ttl);
      return data;
    }

    return null;
  }

  async set(key, value, ttl = 3600) {
    this.localCache.set(key, value);
    await this.redis.setex(key, ttl, JSON.stringify(value));
  }
}
```

## 6. Background Task Architecture

### 6.1 Redis Queue Implementation

```javascript
// Simple Queue Service
class QueueService {
  constructor(redisClient) {
    this.redis = redisClient;
    this.processing = false;
    this.handlers = new Map();
  }

  async add(queue, data, options = {}) {
    const job = {
      id: uuid(),
      data,
      attempts: 0,
      maxAttempts: options.maxAttempts || 3,
      delay: options.delay || 0,
      createdAt: Date.now()
    };

    if (job.delay > 0) {
      await this.redis.zadd(
        `queue:${queue}:delayed`,
        Date.now() + job.delay,
        JSON.stringify(job)
      );
    } else {
      await this.redis.lpush(
        `queue:${queue}:pending`,
        JSON.stringify(job)
      );
    }
  }

  async process(queue, handler) {
    this.handlers.set(queue, handler);

    while (true) {
      // 1. Move delayed jobs to pending
      await this.moveDelayedJobs(queue);

      // 2. Get next job
      const jobData = await this.redis.brpop(
        `queue:${queue}:pending`,
        10
      );

      if (jobData) {
        const job = JSON.parse(jobData[1]);
        await this.executeJob(queue, job);
      }
    }
  }
}
```

### 6.2 Scheduled Tasks

```javascript
// Scheduler Service
class Scheduler {
  constructor(redisClient, services) {
    this.redis = redisClient;
    this.services = services;
    this.jobs = new Map();
  }

  start() {
    // Daily cleanup at 2 AM
    this.cron('0 2 * * *', async () => {
      await this.services.voucher.cleanupExpired();
      await this.services.pppoe.disableExpired();
      await this.services.subscriptions.checkExpiry();
      await this.services.cleanup.retentionPolicies();
    });

    // User monitoring every 30 seconds
    this.cron('*/30 * * * * *', async () => {
      await this.services.mikrotik.monitorUsers();
      await this.services.monitoring.checkConnectionHealth();
    });

    // WhatsApp queue processing every 3 seconds
    this.cron('*/3 * * * * *', async () => {
      await this.services.whatsapp.processQueue();
      await this.services.whatsapp.checkMultiSessionHealth();
    });

    // Backup every 6 hours
    this.cron('0 */6 * * *', async () => {
      await this.services.backup.mikrotikData();
    });
  }
}
```

## 7. Security Architecture

### 7.1 Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│                Authentication Flow                           │
├─────────────────┬─────────────────┬─────────────────────────┤
│                 │                 │                         │
│   Login Request │   Validate      │    Generate JWT         │
│   (POST /auth)  │  Credentials    │      (30 days)          │
│                 │                 │                         │
│ - Username      │ - BCrypt Verify │ - User ID               │
│ - Password      │ - No Rate Limit │ - Role                  │
│ - Remember Me   │ - Log Attempt   │ - Permissions           │
│ - IP Address    │ - Session Track │ - Session Data          │
└─────────────────┴─────────────────┴─────────────────────────┘
```

**Security Decisions**
- **No API Rate Limiting**: Per user request untuk kemudahan
- **No 2FA**: Dianggap overkill untuk sistem billing
- **SQL Injection Protection**: Parameterized queries wajib
- **XSS Protection**: Input validation dan output encoding
- **Plugin Sandboxing**: Eval dalam try-catch terisolasi

### 7.2 Permission System

```javascript
// Role-based Access Control
const permissions = {
  super_admin: [
    'system:read', 'system:write', 'system:delete',
    'user:create', 'user:read', 'user:update', 'user:delete',
    'payment:read', 'payment:write', 'payment:delete',
    'voucher:create', 'voucher:read', 'voucher:update', 'voucher:delete',
    'pppoe:create', 'pppoe:read', 'pppoe:update', 'pppoe:delete',
    'customer:create', 'customer:read', 'customer:update', 'customer:delete',
    'whatsapp:read', 'whatsapp:write', 'whatsapp:delete'
  ],
  admin: [
    'voucher:create', 'voucher:read', 'voucher:update',
    'pppoe:create', 'pppoe:read', 'pppoe:update',
    'customer:create', 'customer:read', 'customer:update',
    'payment:read', 'payment:write',
    'whatsapp:read', 'whatsapp:write'
  ],
  operator: [
    'voucher:read', 'voucher:create',
    'pppoe:read', 'pppoe:create',
    'customer:read', 'customer:create',
    'payment:read',
    'whatsapp:read'
  ]
};
```

## 8. Error Handling Architecture

### 8.1 Error Handling Pattern

```javascript
// Global Error Handler
class ErrorHandler {
  handle(error, request, reply) {
    // 1. Log detailed error
    this.logError({
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      request: {
        url: request.url,
        method: request.method,
        headers: request.headers,
        body: request.body
      },
      user: request.user?.id || 'anonymous',
      timestamp: new Date().toISOString()
    });

    // 2. Determine error type
    if (error instanceof ValidationError) {
      return reply.status(400).send({
        success: false,
        error: 'Validation Error',
        details: error.details
      });
    }

    if (error instanceof AuthenticationError) {
      return reply.status(401).send({
        success: false,
        error: 'Authentication Failed',
        details: 'Please check your credentials'
      });
    }

    // 3. Default error response
    return reply.status(500).send({
      success: false,
      error: 'Internal Server Error',
      details: process.env.NODE_ENV === 'development'
        ? error.message
        : 'Something went wrong'
    });
  }
}
```

### 8.2 Logging Strategy

```javascript
// Structured Logging
class Logger {
  log(level, message, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        ...context,
        service: 'mikrotik-billing',
        version: '2.0.0'
      }
    };

    // Log to console (or external service)
    console[level](JSON.stringify(logEntry, null, 2));

    // Store critical errors in database
    if (level === 'error' || level === 'critical') {
      this.storeError(logEntry);
    }
  }
}
```

## 9. Performance Considerations

### 9.1 Optimization Strategies

1. **Database Optimization**
   - Connection pooling
   - Query optimization with proper indexes
   - Batch operations for bulk inserts
   - Prepared statements for repeated queries
   - Read replicas untuk reporting (future)

2. **API Optimization**
   - Response compression (gzip)
   - Static asset caching dengan long TTL
   - API response caching where appropriate
   - Pagination untuk large data sets
   - **Tidak ada rate limiting** (per user request)

3. **Background Task Optimization**
   - Queue-based processing dengan Redis
   - Batch operations untuk Mikrotik API
   - Retry mechanism dengan exponential backoff
   - Priority queues untuk WhatsApp notifications

4. **Frontend Optimization**
   - Lazy loading of data
   - Debounced search inputs (300ms delay)
   - Optimized images dan assets
   - Minimal JavaScript footprint
   - Partial HTMX untuk dynamic content

5. **Monitoring & Alerting**
   - Connection health monitoring
   - Queue depth monitoring
   - Active user tracking
   - Performance metrics collection

### 9.2 Scaling Strategy

```
Phase 1: Single Server
- Node.js app with PostgreSQL
- Redis for cache and queue
- Up to 1000 concurrent users

Phase 2: Horizontal Scaling
- Load balancer
- Multiple app instances
- Shared PostgreSQL
- Redis cluster

Phase 3: Microservices (Optional)
- Separate services for:
  - Authentication
  - Payments
  - WhatsApp
  - Mikrotik Integration
```

## 10. Development Workflow

### 10.1 Development Architecture

```
Development Environment:
├── Source Code (Git)
├── PostgreSQL (local or Docker)
├── Redis (local or Docker)
├── Mikrotik (simulated or test device)
└── Node.js 18+

Testing:
├── Manual Testing
├── API Testing (Postman/Insomnia)
└── Browser Testing

Deployment:
├── PM2 Process Manager
├── Nginx (optional reverse proxy)
├── SSL Certificate
└── Monitoring Scripts
```

### 10.2 Configuration Management

```javascript
// Environment-based configuration
const config = {
  development: {
    database: {
      host: 'localhost',
      port: 5432,
      database: 'mikrotik_billing_dev'
    },
    redis: {
      host: 'localhost',
      port: 6379
    },
    logging: 'debug',
    plugins: {
      directory: './src/plugins/payments',
      autoLoad: true,
      hotReload: true // Development only
    }
  },
  production: {
    database: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      ssl: true
    },
    redis: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD
    },
    logging: 'info',
    plugins: {
      directory: './src/plugins/payments',
      autoLoad: false,
      hotReload: false,
      requireSignature: true // Production security
    }
  }
};
```

---

*Document Version: 2.0.0*
*Last Updated: 2025-01-09*