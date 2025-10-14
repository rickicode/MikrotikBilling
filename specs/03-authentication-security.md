# Authentication & Security v2.0 - Spesifikasi Lengkap

## 1. Overview

Sistem security v2.0 menggunakan pendekatan praktis dengan JWT authentication, role-based access control, dan monitoring aktivitas. Sistem dirancang untuk balance antara security dan usability tanpa over-engineering.

## 2. Key Security Decisions

### 2.1 Applied Security Measures
- **JWT Authentication**: Token-based authentication dengan 30-day expiry
- **Role-Based Access Control (RBAC)**: 3 roles (Super Admin, Admin, Operator)
- **Activity Logging**: Semua aktivitas admin tercatat
- **Session Management**: Secure session handling dengan logout
- **Password Hashing**: bcrypt dengan salt rounds 12
- **Environment Variables**: Sensitive data disimpan di environment
- **CORS Configuration**: Cross-origin requests dibatasi
- **SQL Injection Prevention**: Parameterized queries di seluruh sistem

### 2.2 Explicitly Disabled Features
- **No API Rate Limiting**: Tidak perlu karena aplikasi internal
- **No 2FA (Two-Factor Authentication)**: Dianggap overkill untuk aplikasi internal
- **No IP Whitelisting**: Akses dari mana saja diizinkan
- **No Captcha**: Tidak diperlukan untuk internal admin panel
- **No Password Complexity Rules**: Minimum 6 karakter cukup

## 3. Authentication System

### 3.1 JWT Token Structure
```javascript
// JWT Payload Structure
{
  sub: admin.id,              // Admin ID
  username: admin.username,    // Username
  role: admin.role,           // Role (super_admin/admin/operator)
  permissions: [              // Role-based permissions
    "customers.create",
    "customers.edit",
    "customers.delete",
    "vouchers.create",
    // ... more permissions
  ],
  iat: 1641739200,            // Issued at
  exp: 1644331200,            // Expires in 30 days
  sessionId: "uuid-v4"        // Unique session ID
}
```

### 3.2 Role & Permission Matrix
```javascript
const ROLE_PERMISSIONS = {
  super_admin: [
    // Full access to all features
    'customers.create', 'customers.edit', 'customers.delete', 'customers.view',
    'vouchers.create', 'vouchers.edit', 'vouchers.delete', 'vouchers.view',
    'pppoe.create', 'pppoe.edit', 'pppoe.delete', 'pppoe.view',
    'profiles.create', 'profiles.edit', 'profiles.delete', 'profiles.view',
    'payments.create', 'payments.edit', 'payments.delete', 'payments.view',
    'subscriptions.create', 'subscriptions.edit', 'subscriptions.delete', 'subscriptions.view',
    'whatsapp.send', 'whatsapp.manage', 'whatsapp.qr_scan',
    'reports.view', 'reports.export',
    'settings.edit', 'settings.view',
    'admins.create', 'admins.edit', 'admins.delete', 'admins.view',
    'system.backup', 'system.restore',
    'plugins.upload', 'plugins.configure', 'plugins.activate'
  ],
  admin: [
    // Most features except system admin
    'customers.create', 'customers.edit', 'customers.delete', 'customers.view',
    'vouchers.create', 'vouchers.edit', 'vouchers.delete', 'vouchers.view',
    'pppoe.create', 'pppoe.edit', 'pppoe.delete', 'pppoe.view',
    'payments.create', 'payments.edit', 'payments.view',
    'subscriptions.create', 'subscriptions.edit', 'subscriptions.view',
    'whatsapp.send', 'whatsapp.qr_scan',
    'reports.view', 'reports.export',
    'settings.view'
  ],
  operator: [
    // Read-only and basic operations
    'customers.view', 'customers.edit', // Edit for basic info
    'vouchers.view', 'vouchers.create', // Can create but not delete
    'pppoe.view',
    'payments.view',
    'subscriptions.view',
    'whatsapp.send',
    'reports.view'
  ]
};
```

### 3.3 Authentication Flow
```javascript
// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

class AuthService {
  async login(username, password) {
    try {
      // 1. Find admin user
      const admin = await db.query(
        'SELECT * FROM admin_users WHERE username = ? AND is_active = true',
        [username]
      );

      if (!admin.rows.length) {
        throw new Error('Invalid credentials');
      }

      // 2. Verify password
      const validPassword = await bcrypt.compare(password, admin.rows[0].password);
      if (!validPassword) {
        throw new Error('Invalid credentials');
      }

      // 3. Generate session ID
      const sessionId = uuidv4();

      // 4. Create JWT token
      const token = jwt.sign(
        {
          sub: admin.rows[0].id,
          username: admin.rows[0].username,
          role: admin.rows[0].role,
          permissions: ROLE_PERMISSIONS[admin.rows[0].role],
          sessionId: sessionId
        },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      // 5. Log login activity
      await this.logActivity({
        admin_id: admin.rows[0].id,
        action: 'login',
        details: { sessionId, ip: this.getClientIP() },
        timestamp: new Date()
      });

      // 6. Update last login
      await db.query(
        'UPDATE admin_users SET last_login = NOW() WHERE id = ?',
        [admin.rows[0].id]
      );

      return {
        success: true,
        token: token,
        user: {
          id: admin.rows[0].id,
          username: admin.rows[0].username,
          name: admin.rows[0].name,
          role: admin.rows[0].role,
          lastLogin: admin.rows[0].last_login
        },
        expiresIn: '30d'
      };

    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  async verifyToken(token) {
    try {
      // 1. Verify JWT
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 2. Check if admin is still active
      const admin = await db.query(
        'SELECT * FROM admin_users WHERE id = ? AND is_active = true',
        [decoded.sub]
      );

      if (!admin.rows.length) {
        throw new Error('Admin user not found or inactive');
      }

      // 3. Return verified user data
      return {
        ...decoded,
        user: {
          id: admin.rows[0].id,
          username: admin.rows[0].username,
          name: admin.rows[0].name,
          role: admin.rows[0].role
        }
      };

    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token expired');
      }
      throw new Error('Invalid token');
    }
  }

  async logout(adminId, sessionId) {
    try {
      // Log logout activity
      await this.logActivity({
        admin_id: adminId,
        action: 'logout',
        details: { sessionId },
        timestamp: new Date()
      });

      // Note: JWT tokens cannot be invalidated directly
      // In production, implement token blacklist if needed

      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  }
}
```

## 4. Security Middleware

### 4.1 Authentication Middleware
```javascript
// src/middleware/auth.js
const fastifyPlugin = require('fastify-plugin');

async function authMiddleware(fastify) {
  // Authentication hook for protected routes
  fastify.addHook('preHandler', async (request, reply) => {
    // Skip authentication for public routes
    if (isPublicRoute(request.url)) {
      return;
    }

    try {
      // Extract token from Authorization header
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        reply.code(401).send({ error: 'No token provided' });
        return;
      }

      const token = authHeader.split(' ')[1];

      // Verify token
      const decoded = await fastify.authService.verifyToken(token);

      // Attach user to request
      request.user = decoded;

    } catch (error) {
      reply.code(401).send({ error: error.message });
    }
  });

  // Permission checking helper
  fastify.decorate('checkPermission', (permission) => {
    return async (request, reply) => {
      if (!request.user || !request.user.permissions.includes(permission)) {
        reply.code(403).send({ error: 'Insufficient permissions' });
        return;
      }
    };
  });
}

function isPublicRoute(url) {
  const publicRoutes = [
    '/api/auth/login',
    '/api/auth/logout',
    '/api/health',
    '/favicon.ico',
    '/public/'
  ];

  return publicRoutes.some(route => url.startsWith(route));
}

module.exports = fastifyPlugin(authMiddleware);
```

### 4.2 Activity Logging Middleware
```javascript
// src/middleware/securityLogger.js
class SecurityLogger {
  static async logActivity(data) {
    try {
      await db.query(`
        INSERT INTO admin_activity_logs
        (admin_id, action, details, ip_address, user_agent, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        data.admin_id,
        data.action,
        JSON.stringify(data.details),
        data.ip || null,
        data.user_agent || null,
        data.timestamp || new Date()
      ]);
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  }

  static async logFailedLogin(username, ip, reason) {
    await db.query(`
      INSERT INTO failed_login_attempts
      (username, ip_address, reason, timestamp)
      VALUES ($1, $2, $3, $4)
    `, [username, ip, reason, new Date()]);
  }

  static async logSecurityEvent(event, details) {
    await db.query(`
      INSERT INTO security_events
      (event_type, details, severity, timestamp)
      VALUES ($1, $2, $3, $4)
    `, [
      event,
      JSON.stringify(details),
      details.severity || 'medium',
      new Date()
    ]);
  }
}
```

## 5. Database Security

### 5.1 Security-Related Tables
```sql
-- Admin users table
CREATE TABLE admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL, -- bcrypt hash
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    role VARCHAR(20) NOT NULL CHECK (role IN ('super_admin', 'admin', 'operator')),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES admin_users(id)
);

-- Admin activity logs
CREATE TABLE admin_activity_logs (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES admin_users(id),
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Failed login attempts
CREATE TABLE failed_login_attempts (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    ip_address INET,
    reason VARCHAR(100),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Security events
CREATE TABLE security_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    details JSONB,
    severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Session management (optional for token blacklist)
CREATE TABLE blacklisted_tokens (
    id SERIAL PRIMARY KEY,
    token_id VARCHAR(255) UNIQUE NOT NULL,
    admin_id INTEGER REFERENCES admin_users(id),
    reason VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 5.2 Secure Database Operations
```javascript
// Always use parameterized queries
class SecureDB {
  static async query(sql, params = []) {
    try {
      const result = await db.query(sql, params);
      return result;
    } catch (error) {
      console.error('Database error:', error);
      throw error;
    }
  }

  // Example secure operations
  static async createVoucher(data) {
    // Never interpolate values directly!
    const sql = `
      INSERT INTO vouchers (code, batch_id, profile_id, mikrotik_comment)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    return this.query(sql, [
      data.code,
      data.batchId,
      data.profileId,
      data.comment
    ]);
  }
}
```

## 6. Security Configuration

### 6.1 Environment Variables
```bash
# .env
# Security settings
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters-long
SESSION_SECRET=your-session-secret-for-cookies
ENCRYPTION_KEY=your-encryption-key-for-sensitive-data

# Database
DB_TYPE=postgresql
DB_HOST=your-db-host
DB_PORT=5432
DB_NAME=mikrotik_billing
DB_USER=postgres
DB_PASSWORD=your-db-password

# CORS
CORS_ORIGIN=http://localhost:3000
CORS_CREDENTIALS=true

# Mikrotik
MIKROTIK_API_USER=apiuser
MIKROTIK_API_PASSWORD=apipassword

# WhatsApp
WHATSAPP_WEBHOOK_SECRET=webhook-secret

# Payment
PAYMENT_URL_SECRET=payment-url-secret-key
DUITKU_API_KEY=duitku-api-key
DUITKU_MERCHANT_CODE=your-merchant-code
```

### 6.2 Fastify Security Configuration
```javascript
// server.js
const fastify = require('fastify')({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    serializers: {
      req: function (req) {
        return {
          method: req.method,
          url: req.url,
          headers: {
            'user-agent': req.headers['user-agent'],
            'host': req.headers.host
          }
        };
      }
    }
  }
});

// Security headers
fastify.addHook('preHandler', async (request, reply) => {
  // Security headers
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('X-XSS-Protection', '1; mode=block');
  reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});

// CORS configuration
fastify.register(require('fastify-cors'), {
  origin: process.env.CORS_ORIGIN || true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
});

// Rate limiting (disabled per user request)
// fastify.register(require('fastify-rate-limit'), {
//   max: 100,
//   timeWindow: '1 minute'
// });
```

## 7. Security Best Practices

### 7.1 Password Management
```javascript
// Password hashing with bcrypt
const bcrypt = require('bcrypt');

class PasswordService {
  static async hashPassword(password) {
    const saltRounds = 12; // High security level
    return await bcrypt.hash(password, saltRounds);
  }

  static async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  static generateSecurePassword() {
    // Generate random password for admin creation
    const crypto = require('crypto');
    return crypto.randomBytes(8).toString('hex');
  }
}

// Password policy (simple - per user request)
function validatePassword(password) {
  if (!password || password.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters' };
  }
  return { valid: true };
}
```

### 7.2 Input Validation
```javascript
// Using Joi for validation
const Joi = require('joi');

const schemas = {
  login: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    password: Joi.string().min(6).required()
  }),

  createCustomer: Joi.object({
    name: Joi.string().min(1).max(100).required(),
    email: Joi.string().email().optional(),
    phone: Joi.string().pattern(/^\+?[0-9\s\-()]+$/).optional(),
    address: Joi.string().max(500).optional()
  }),

  createVoucher: Joi.object({
    profileId: Joi.number().integer().positive().required(),
    quantity: Joi.number().integer().min(1).max(1000).required(),
    prefix: Joi.string().alphanum().max(10).optional(),
    priceSell: Joi.number().min(0).precision(2).required()
  })
};

// Validation middleware
function validate(schema) {
  return async (request, reply) => {
    const { error, value } = schema.validate(request.body);
    if (error) {
      reply.code(400).send({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
      return;
    }
    request.body = value;
  };
}
```

### 7.3 SQL Injection Prevention
```javascript
// Always use parameterized queries
class VoucherService {
  async createVoucher(data) {
    // WRONG: Vulnerable to SQL injection
    // const sql = `INSERT INTO vouchers (code) VALUES ('${data.code}')`;

    // CORRECT: Using parameterized query
    const sql = 'INSERT INTO vouchers (code, profile_id, mikrotik_comment) VALUES ($1, $2, $3)';

    try {
      const result = await db.query(sql, [
        data.code,
        data.profileId,
        data.comment
      ]);
      return result.rows[0];
    } catch (error) {
      console.error('Database error:', error);
      throw new Error('Failed to create voucher');
    }
  }

  async getVouchers(filters) {
    // Building dynamic query safely
    let sql = 'SELECT * FROM vouchers WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filters.status) {
      sql += ` AND status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.batchId) {
      sql += ` AND batch_id = $${paramIndex}`;
      params.push(filters.batchId);
      paramIndex++;
    }

    // Add LIMIT safely
    sql += ` LIMIT $${paramIndex}`;
    params.push(filters.limit || 100);

    return await db.query(sql, params);
  }
}
```

## 8. Monitoring & Audit

### 8.1 Activity Monitoring
```javascript
// Activity monitoring service
class ActivityMonitor {
  static async getActivityLogs(filters = {}) {
    let sql = `
      SELECT al.*, a.name as admin_name, a.username
      FROM admin_activity_logs al
      JOIN admin_users a ON al.admin_id = a.id
      WHERE 1=1
    `;
    const params = [];
    let index = 1;

    if (filters.adminId) {
      sql += ` AND al.admin_id = $${index}`;
      params.push(filters.adminId);
      index++;
    }

    if (filters.action) {
      sql += ` AND al.action = $${index}`;
      params.push(filters.action);
      index++;
    }

    if (filters.startDate) {
      sql += ` AND al.timestamp >= $${index}`;
      params.push(filters.startDate);
      index++;
    }

    if (filters.endDate) {
      sql += ` AND al.timestamp <= $${index}`;
      params.push(filters.endDate);
      index++;
    }

    sql += ` ORDER BY al.timestamp DESC`;

    if (filters.limit) {
      sql += ` LIMIT $${index}`;
      params.push(filters.limit);
      index++;
    }

    return await db.query(sql, params);
  }

  static async getSecurityEvents(severity = null) {
    let sql = 'SELECT * FROM security_events';
    const params = [];

    if (severity) {
      sql += ' WHERE severity = $1';
      params.push(severity);
    }

    sql += ' ORDER BY timestamp DESC LIMIT 100';

    return await db.query(sql, params);
  }
}
```

### 8.2 Security Alerts
```javascript
// Security alert system
class SecurityAlertService {
  static async checkSuspiciousActivity() {
    // Check for multiple failed logins
    const failedLogins = await db.query(`
      SELECT ip_address, COUNT(*) as attempts
      FROM failed_login_attempts
      WHERE timestamp > NOW() - INTERVAL '1 hour'
      GROUP BY ip_address
      HAVING COUNT(*) > 10
    `);

    if (failedLogins.rows.length > 0) {
      await this.sendSecurityAlert({
        type: 'multiple_failed_logins',
        ips: failedLogins.rows,
        severity: 'high'
      });
    }

    // Check for unusual activity patterns
    const unusualActivity = await db.query(`
      SELECT admin_id, COUNT(*) as actions
      FROM admin_activity_logs
      WHERE timestamp > NOW() - INTERVAL '1 hour'
      GROUP BY admin_id
      HAVING COUNT(*) > 1000
    `);

    if (unusualActivity.rows.length > 0) {
      await this.sendSecurityAlert({
        type: 'unusual_activity',
        admins: unusualActivity.rows,
        severity: 'medium'
      });
    }
  }

  static async sendSecurityAlert(data) {
    // Log security event
    await db.query(`
      INSERT INTO security_events
      (event_type, details, severity, timestamp)
      VALUES ($1, $2, $3, NOW())
    `, [
      data.type,
      JSON.stringify(data),
      data.severity
    ]);

    // Send WhatsApp notification to super admins
    const superAdmins = await db.query(
      'SELECT whatsapp FROM admin_users WHERE role = $1 AND is_active = true',
      ['super_admin']
    );

    for (const admin of superAdmins.rows) {
      if (admin.whatsapp) {
        await whatsappService.sendNotification(
          admin.whatsapp,
          'security_alert',
          data
        );
      }
    }
  }
}
```

## 9. Frontend Security

### 9.1 Client-Side Security
```javascript
// public/js/main.js
class SecurityClient {
  static init() {
    // Store token securely
    this.token = localStorage.getItem('authToken');

    // Setup auto-logout on token expiry
    this.setupAutoLogout();

    // Protect sensitive data
    this.protectSensitiveData();
  }

  static setupAutoLogout() {
    if (this.token) {
      try {
        const decoded = jwt_decode(this.token);
        const expiryTime = decoded.exp * 1000; // Convert to milliseconds
        const currentTime = Date.now();
        const timeUntilExpiry = expiryTime - currentTime;

        if (timeUntilExpiry > 0) {
          setTimeout(() => {
            this.logout();
            alert('Session expired. Please login again.');
          }, timeUntilExpiry);
        } else {
          this.logout();
        }
      } catch (error) {
        console.error('Invalid token:', error);
        this.logout();
      }
    }
  }

  static logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }

  static protectSensitiveData() {
    // Prevent console logging sensitive data in production
    if (process.env.NODE_ENV === 'production') {
      console.log = function() {};
      console.error = function() {};
      console.warn = function() {};
    }
  }

  static makeAuthenticatedRequest(url, options = {}) {
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      }
    }).then(async response => {
      if (response.status === 401) {
        this.logout();
        return;
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Request failed');
      }

      return response.json();
    });
  }
}
```

### 9.2 CSRF Protection (Optional)
```javascript
// Since we're using JWT in Authorization header,
// CSRF protection is less critical but still recommended
class CSRFProtection {
  static generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  static validateToken(token, sessionToken) {
    return token === sessionToken;
  }
}
```

## 10. Backup & Recovery Security

### 10.1 Secure Backup Process
```javascript
class SecureBackupService {
  static async createEncryptedBackup() {
    try {
      // 1. Create backup file
      const backupData = await this.exportAllData();

      // 2. Encrypt backup
      const encryptedData = await this.encryptData(backupData);

      // 3. Create backup file with timestamp
      const filename = `backup-${Date.now()}.enc`;
      const filePath = path.join(process.env.BACKUP_DIR, filename);

      await fs.writeFile(filePath, encryptedData);

      // 4. Log backup creation
      await this.logBackupEvent('backup_created', {
        filename,
        size: encryptedData.length,
        encrypted: true
      });

      return { success: true, filename };

    } catch (error) {
      console.error('Backup error:', error);
      throw error;
    }
  }

  static async encryptData(data) {
    const crypto = require('crypto');
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipher(algorithm, key, iv);

    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Combine IV, authTag, and encrypted data
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }
}
```

## 11. Security Checklist

### 11.1 Implementation Checklist
- [ ] JWT tokens dengan 30-day expiry
- [ ] Password hashing dengan bcrypt (salt rounds 12)
- [ ] Role-based access control (3 roles)
- [ ] Activity logging untuk semua admin actions
- [ ] SQL injection prevention dengan parameterized queries
- [ ] Input validation dengan Joi
- [ ] Security headers (HSTS, XSS Protection, etc.)
- [ ] Environment variables untuk sensitive data
- [ ] CORS configuration
- [ ] Failed login tracking
- [ ] Security event logging
- [ ] Auto-logout on token expiry
- [ ] Secure backup encryption

### 11.2 Disabled Features (Per Requirements)
- [x] No API rate limiting
- [x] No 2FA authentication
- [x] No IP whitelisting
- [x] No CAPTCHA
- [x] No complex password rules

## 12. Testing Security

### 12.1 Security Test Cases
```javascript
// Security tests
describe('Security Tests', () => {
  test('Should reject requests without token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/customers'
      // No Authorization header
    });

    expect(response.statusCode).toBe(401);
  });

  test('Should reject invalid token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/customers',
      headers: {
        'Authorization': 'Bearer invalid-token'
      }
    });

    expect(response.statusCode).toBe(401);
  });

  test('Should enforce role permissions', async () => {
    const operatorToken = await loginAs('operator');

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/customers/1',
      headers: {
        'Authorization': `Bearer ${operatorToken}`
      }
    });

    expect(response.statusCode).toBe(403);
  });

  test('Should prevent SQL injection', async () => {
    const maliciousInput = "'; DROP TABLE vouchers; --";

    const response = await app.inject({
      method: 'POST',
      url: '/api/vouchers',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      },
      payload: {
        code: maliciousInput,
        profileId: 1
      }
    });

    expect(response.statusCode).toBe(400);
    // Verify vouchers table still exists
    const vouchers = await db.query('SELECT COUNT(*) FROM vouchers');
    expect(vouchers.rows[0].count).not.toBe(0);
  });
});
```

## 13. Common Security Issues & Solutions

### 13.1 Known Vulnerabilities & Mitigations
1. **XSS (Cross-Site Scripting)**
   - Mitigation: Input validation, output encoding, CSP headers
   - Implemented: Yes (via security headers)

2. **SQL Injection**
   - Mitigation: Parameterized queries, input validation
   - Implemented: Yes (using parameterized queries throughout)

3. **Authentication Bypass**
   - Mitigation: Secure JWT implementation, proper token validation
   - Implemented: Yes (with 30-day expiry)

4. **Authorization Issues**
   - Mitigation: RBAC implementation, permission checking
   - Implemented: Yes (3-tier role system)

5. **Sensitive Data Exposure**
   - Mitigation: Environment variables, encryption at rest
   - Implemented: Yes (with .env file)

## 14. Future Security Enhancements

### 14.1 Potential Improvements
- **Password Policy**: Implement stronger password requirements
- **Session Management**: Token blacklist for immediate logout
- **Audit Logs**: Immutable audit trail with digital signatures
- **API Rate Limiting**: Optional rate limiting per IP/user
- **2FA Support**: Optional TOTP-based 2FA for sensitive operations
- **IP Whitelisting**: Optional IP restrictions for admin access
- **Database Encryption**: Column-level encryption for sensitive data

### 14.2 Security Monitoring Tools
- **Fail2Ban Integration**: Block IPs with multiple failed attempts
- **Intrusion Detection**: Monitor for unusual patterns
- **Log Aggregation**: Centralized logging with ELK stack
- **Security Scanning**: Automated vulnerability scanning

---

*Version: 2.0.0*
*Last Updated: 2025-01-09*
*Status: Ready for Implementation*