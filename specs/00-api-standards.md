# API Standards v2.0 - Spesifikasi API Terstandar

## 1. Overview

Dokumen ini mendefinisikan standar API yang digunakan di seluruh sistem Mikrotik Billing v2.0 untuk memastikan konsistensi, maintainability, dan kemudahan integrasi.

## 2. API Architecture

### 2.1 Base URL Structure
```
Development: http://localhost:3000/api
Staging:     https://staging.mikrotikbilling.com/api
Production:  https://app.mikrotikbilling.com/api
```

### 2.2 Versioning
- **URL Versioning**: `v2/` di base URL
- **Header Versioning**: `API-Version: v2`
- **Default Version**: v2 (jika tidak disebutkan)

### 2.3 Response Format
```javascript
// Success Response
{
  "success": true,
  "data": {
    // Response payload
  },
  "message": "Operation successful",
  "timestamp": "2025-01-09T10:00:00.000Z",
  "requestId": "req_1234567890"
}

// Error Response
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {
      "field": "email",
      "reason": "Invalid email format"
    }
  },
  "timestamp": "2025-01-09T10:00:00.000Z",
  "requestId": "req_1234567890"
}
```

## 3. HTTP Methods & Status Codes

### 3.1 Method Usage
| Method | Usage | Example |
|--------|--------|---------|
| GET | Retrieve resources | `GET /api/v2/customers` |
| POST | Create resource | `POST /api/v2/customers` |
| PUT | Update entire resource | `PUT /api/v2/customers/123` |
| PATCH | Partial update | `PATCH /api/v2/customers/123` |
| DELETE | Delete resource | `DELETE /api/v2/customers/123` |

### 3.2 Status Codes
| Status | Usage | Description |
|--------|--------|------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 204 | No Content | Success, no content returned |
| 400 | Bad Request | Invalid request data |
| 401 | Unauthorized | Invalid or missing authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource conflict |
| 422 | Unprocessable Entity | Validation failed |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | Service temporarily unavailable |

## 4. Authentication & Authorization

### 4.1 JWT Token Structure
```json
{
  "sub": "123",
  "username": "admin",
  "role": "admin",
  "permissions": [
    "customers.read",
    "customers.write",
    "vouchers.create"
  ],
  "iat": 1641739200,
  "exp": 1644331200,
  "sessionId": "uuid-v4"
}
```

### 4.2 Authorization Header
```http
Authorization: Bearer <jwt_token>
```

### 4.3 Permission Required Format
```javascript
// Middleware permission check
const requiredPermission = 'customers.write';

// API endpoint documentation
GET /api/v2/customers
Permissions: customers.read

POST /api/v2/customers
Permissions: customers.write
```

## 5. Request/Response Standards

### 5.1 Request Headers
```http
Content-Type: application/json
Authorization: Bearer <token>
X-Request-ID: uuid-v4
Accept: application/json
```

### 5.2 Response Headers
```http
Content-Type: application/json
X-Request-ID: uuid-v4
Cache-Control: no-cache
X-Rate-Limit-Limit: 100
X-Rate-Limit-Remaining: 99
X-Rate-Limit-Reset: 1641742800
```

### 5.3 Pagination
```javascript
// Request
GET /api/v2/customers?page=2&limit=20&sort=name&order=asc

// Response
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "page": 2,
      "limit": 20,
      "total": 150,
      "totalPages": 8,
      "hasNext": true,
      "hasPrev": true
    }
  }
}
```

### 5.4 Filtering & Searching
```javascript
// Query Parameters
GET /api/v2/customers?search=john&status=active&created_after=2025-01-01

// Response
{
  "success": true,
  "data": {
    "filters": {
      "search": "john",
      "status": "active",
      "created_after": "2025-01-01"
    },
    "items": [...]
  }
}
```

## 6. Error Handling

### 6.1 Error Response Structure
```javascript
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format",
        "value": "invalid-email"
      },
      {
        "field": "phone",
        "message": "Phone number is required",
        "value": null
      }
    ]
  }
}
```

### 6.2 Error Codes
| Code | Description | HTTP Status |
|------|-------------|------------|
| `VALIDATION_ERROR` | Input validation failed | 400 |
| `AUTHENTICATION_ERROR` | Authentication failed | 401 |
| `AUTHORIZATION_ERROR` | Insufficient permissions | 403 |
| `RESOURCE_NOT_FOUND` | Resource not found | 404 |
| `CONFLICT_ERROR` | Resource conflict | 409 |
| `RATE_LIMIT_ERROR` | Rate limit exceeded | 429 |
| `INTERNAL_ERROR` | Internal server error | 500 |
| `SERVICE_UNAVAILABLE` | Service unavailable | 503 |

## 7. API Endpoints Specification

### 7.1 Authentication Endpoints
```http
POST /api/v2/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "password123"
}

Response:
{
  "success": true,
  "data": {
    "token": "jwt-token-here",
    "user": {
      "id": 123,
      "username": "admin",
      "name": "Admin User",
      "role": "admin"
    },
    "expiresIn": "30d"
  }
}
```

### 7.2 Customer Management
```http
// List customers
GET /api/v2/customers?page=1&limit=20&search=john&status=active

Response:
{
  "success": true,
  "data": {
    "customers": [
      {
        "id": 1,
        "name": "John Doe",
        "whatsapp": "+62812345678",
        "email": "john@example.com",
        "status": "active",
        "balance": 50000,
        "createdAt": "2025-01-09T10:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}

// Create customer
POST /api/v2/customers
{
  "name": "John Doe",
  "whatsapp": "+62812345678",
  "email": "john@example.com",
  "address": "Jl. Example No. 123"
}

Response:
{
  "success": true,
  "data": {
    "id": 1,
    "name": "John Doe",
    "whatsapp": "+62812345678",
    "email": "john@example.com",
    "address": "Jl. Example No. 123",
    "balance": 0,
    "status": "active",
    "createdAt": "2025-01-09T10:00:00Z"
  },
  "message": "Customer created successfully"
}
```

### 7.3 Voucher Management
```http
// Create voucher batch
POST /api/v2/vouchers/batch
{
  "profileId": 5,
  "quantity": 100,
  "prefix": "WIFI-",
  "priceSell": 15000,
  "priceCost": 10000,
  "validHours": 24,
  "vendorId": "VENDOR-001",
  "autoPrint": true
}

Response:
{
  "success": true,
  "data": {
    "batchId": "BATCH-20250109-001",
    "vouchers": [
      "WIFI-0001",
      "WIFI-0002",
      ...
    ],
    "printUrl": "/vouchers/batch/BATCH-20250109-001/print-preview"
  },
  "message": "Voucher batch created successfully"
}
```

### 7.4 Payment Processing
```http
// Create payment
POST /api/v2/payments/create
{
  "token": "jwt-token",
  "method": "duitku",
  "customerInfo": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+62812345678"
  },
  "returnUrl": "https://example.com/pay/success"
}

Response:
{
  "success": true,
  "data": {
    "paymentId": "pay_123456",
    "reference": "INV-2025-001",
    "paymentUrl": "https://payment-gateway.com/pay/123",
    "qrCode": "https://example.com/qr/123.png",
    "expiresAt": "2025-01-10T10:00:00Z"
  }
}

// Check payment status
GET /api/v2/payments/pay_123456/status

Response:
{
  "success": true,
  "data": {
    "status": "success",
    "paidAmount": 150000,
    "paymentDate": "2025-01-09T15:30:00Z",
    "method": "duitku"
  }
}
```

### 7.5 Mikrotik Integration
```http
// Get active users
GET /api/v2/mikrotik/users/active

Response:
{
  "success": true,
  "data": {
    "hotspot": [
      {
        "name": "WIFI-0001",
        "address": "192.168.1.100",
        "uptime": "1d 12h 34m",
        "bytesIn": 1073741824,
        "bytesOut": 2147483648
      }
    ],
    "pppoe": [
      {
        "name": "pppoe-0001",
        "address": "10.0.0.100",
        "uptime": "5d 8h 12m",
        "bytesIn": 53687091200,
        "bytesOut": 10737418240
      }
    ],
    "lastUpdated": "2025-01-09T10:00:00Z"
  }
}
```

### 7.6 WhatsApp Notifications
```http
// Send message
POST /api/v2/whatsapp/send
{
  "recipients": ["+62812345678", "+62812345679"],
  "template": "payment_success",
  "data": {
    "customerName": "John Doe",
    "invoiceNumber": "INV-2025-001",
    "amount": 150000,
    "paymentMethod": "DuitKu"
  }
}

Response:
{
  "success": true,
  "data": {
    "messageId": "msg_123456",
    "sessionId": "session_001",
    "status": "queued",
    "recipients": [
      {
        "phone": "+62812345678",
        "status": "queued"
      },
      {
        "phone": "+62812345679",
        "status": "queued"
      }
    ]
  }
}
```

### 7.7 Monitoring & Health
```http
// Health check
GET /api/v2/health

Response:
{
  "success": true,
  "data": {
    "status": "healthy",
    "checks": {
      "database": {
        "status": "healthy",
        "responseTime": 5
      },
      "mikrotik": {
        "status": "healthy",
        "responseTime": 12
      },
      "whatsapp": {
        "status": "degraded",
        "activeSessions": 3
      }
    },
    "timestamp": "2025-01-09T10:00:00Z"
  }
}

// System metrics
GET /api/v2/monitoring/metrics

Response:
{
  "success": true,
  "data": {
    "system": {
      "cpuUsage": 45.2,
      "memoryUsage": 62.8,
      "diskUsage": 78.5
    },
    "application": {
      "activeUsers": {
        "hotspot": 150,
        "pppoe": 75
      },
      "requestRate": 1250,
      "averageResponseTime": 245
    },
    "business": {
      "dailyRevenue": 15000000,
      "conversionRate": 75.5
    }
  }
}
```

## 8. Data Models

### 8.1 Customer Model
```javascript
{
  "id": 1,
  "name": "John Doe",
  "whatsapp": "+62812345678",
  "email": "john@example.com",
  "phone": "+62812345678",
  "address": "Jl. Example No. 123",
  "balance": 50000,
  "status": "active",
  "totalSpent": 1500000,
  "subscriptionCount": 3,
  "createdAt": "2025-01-09T10:00:00Z",
  "updatedAt": "2025-01-09T10:00:00Z"
}
```

### 8.2 Voucher Model
```javascript
{
  "id": 1,
  "code": "WIFI-0001",
  "batchId": "BATCH-20250109-001",
  "profileId": 5,
  "profileName": "HOTSPOT-1HR",
  "mikrotikId": "*5",
  "status": "created",
  "firstLoginAt": null,
  "expiresAt": null,
  "usedAt": null,
  "ipAddress": null,
  "macAddress": null,
  "mikrotikComment": "VOUCHER_SYSTEM|15000|0|BATCH-20250109-001|2025-01-09|admin",
  "createdAt": "2025-01-09T10:00:00Z",
  "updatedAt": "2025-01-09T10:00:00Z"
}
```

### 8.3 Payment Model
```javascript
{
  "id": 123,
  "invoiceId": 456,
  "method": "duitku",
  "reference": "PAY-20250109-001",
  "amount": 150000,
  "status": "success",
  "paidAmount": 150000,
  "paymentDate": "2025-01-09T15:30:00Z",
  "customerInfo": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+62812345678"
  },
  "createdAt": "2025-01-09T15:25:00Z",
  "updatedAt": "2025-01-09T15:30:00Z"
}
```

## 9. Rate Limiting

### 9.1 Rate Limiting Rules
| Endpoint | Limit | Window | Description |
|----------|-------|--------|-------------|
| Login | 5/IP | 15m | Prevent brute force |
| OTP | 3/IP | 5m | OTP attempts |
| Create Voucher | 100/min | 1m | Batch creation |
| Send WhatsApp | 60/min | 1m | Message sending |
| Webhook | 1000/min | 1m | Payment callbacks |
| General API | 1000/min | 1m | All other endpoints |

### 9.2 Rate Limit Headers
```http
X-Rate-Limit-Limit: 1000
X-Rate-Limit-Remaining: 999
X-Rate-Limit-Reset: 1641742800
```

## 10. Security Standards

### 10.1 HTTPS Requirement
- All API endpoints must use HTTPS in production
- HTTP connections should redirect to HTTPS

### 10.2 CORS Configuration
```javascript
// Allowed origins in production
const allowedOrigins = [
  'https://app.mikrotikbilling.com',
  'https://admin.mikrotikbilling.com'
];

// CORS headers
Access-Control-Allow-Origin: <allowed-origin>
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Request-ID
Access-Control-Allow-Credentials: true
```

### 10.3 Input Validation
- All input must be validated
- SQL injection prevention
- XSS prevention
- File upload validation

### 10.4 Security Headers
```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

## 11. API Documentation

### 11.1 OpenAPI/Swagger Integration
```yaml
# swagger.yaml
openapi: 3.0.0
info:
  title: Mikrotik Billing API
  version: 2.0.0
  description: API documentation for Mikrotik Billing System v2.0
servers:
  - url: https://app.mikrotikbilling.com/api/v2
    description: Production server
  - url: https://staging.mikrotikbilling.com/api/v2
    description: Staging server
security:
  - bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

## 12. Testing Standards

### 12.1 API Testing
- Unit tests for all endpoints
- Integration tests for workflows
- Load testing for critical endpoints
- Security testing for authentication

### 12.2 Test Environment
```javascript
// Test API base URL
const testAPI = 'https://test.mikrotikbilling.com/api/v2';

// Test user credentials
const testUser = {
  username: 'test_admin',
  password: 'test_password_123'
};
```

## 13. Webhook Standards

### 13.1 Webhook Format
```javascript
// Payment webhook payload
{
  "reference": "PAY-20250109-001",
  "status": "success",
  "amount": 150000,
  "paymentMethod": "duitku",
  "signature": "generated_signature_hash",
  "timestamp": "2025-01-09T15:30:00Z",
  "customer": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+62812345678"
  },
  "invoice": {
    "number": "INV-2025-001",
    "amount": 150000,
    "dueDate": "2025-01-09T23:59:59Z"
  }
}
```

### 13.2 Webhook Verification
```javascript
// Webhook signature verification
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return expectedSignature === signature;
}
```

## 14. Implementation Checklist

### 14.1 API Development Checklist
- [ ] Use HTTPS in production
- [ ] Implement proper authentication
- [ ] Add comprehensive error handling
- [ ] Include request/response logging
- [ ] Add rate limiting
- [ ] Validate all inputs
- [ ] Use consistent response format
- [ ] Include CORS headers
- [ ] Add security headers
- [ ] Document all endpoints
- [ ] Implement pagination
- [ ] Add caching where appropriate
- [ ] Use proper HTTP status codes

### 14.2 API Client Guidelines
- [ ] Always check success flag
- [ ] Handle error responses properly
- [ ] Implement retry logic with exponential backoff
-   - Use retry for 5xx errors
   - Use backoff: 1s, 2s, 4s, 8s, 16s
- [ ] Include authentication header
- [ ] Use appropriate HTTP methods
- [ ] Validate responses before using data
- [ ] Handle rate limit errors (429)

## 15. Migration Guide

### 15.1 From v1 to v2
1. **Base URL Change**: Add `/v2/` to all URLs
2. **Authentication**: Update to JWT authentication
3. **Response Format**: Use new standardized response format
4. **Error Handling**: Implement new error response structure
5. **Rate Limiting**: Add rate limiting headers
6. **Security**: Update security headers
7. **Webhooks**: Update webhook payload format

---

*Version: 2.0.0*
*Last Updated: 2025-01-09*
*Status: Active Standard*