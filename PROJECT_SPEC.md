# MIKROTIK BILLING SYSTEM - PROJECT SPECIFICATION

## 📋 Project Overview

Sistem manajemen billing Mikrotik yang lengkap dengan modular architecture, payment gateway plugins, dan multi-location support.

## 🎯 Business Requirements

### Core Features
- **Voucher Hotspot Management**: One-time voucher generation with Mikrotik integration
- **PPPoE User Management**: Recurring subscription management
- **Customer Management**: Complete customer database dengan balance tracking
- **Payment Gateway System**: Modular payment methods dengan plugin architecture
- **WhatsApp Integration**: Multi-session notification system dengan custom templates
- **Mikrotik Integration**: Real-time sync dengan RouterOS API
- **Plugin Manager**: WordPress-style plugin management
- **Multi-Location Support**: Centralized management untuk multiple Mikrotik devices
- **Backup Manager**: Automated backup dengan restore functionality

### User Roles & Permissions
- **Super Admin**: Full system access, plugin management, backup control
- **Admin**: Customer management, payment approval, reporting
- **Operator**: Voucher creation, basic user management

## 🏗️ Technical Architecture

### System Architecture
```
Frontend (Web) → API Layer → Service Layer → Data Layer
     ↓              ↓           ↓           ↓
  Responsive      Fastify     Business      PostgreSQL
  Interface      Server      Logic         + Supabase
  (Mobile-First)   (Node.js)  (Services)    (Database)
```

### Technology Stack
- **Backend**: Node.js + Fastify
- **Database**: PostgreSQL (Supabase hosting)
- **Frontend**: HTML5, CSS3, JavaScript (ES6+), Bootstrap 5
- **Authentication**: JWT tokens (30-day sessions)
- **Mikrotik Integration**: RouterOS API
- **WhatsApp Integration**: WhatsApp Web JS
- **File Storage**: Local + SFTP/Cloud backup

## 📊 Database Schema

### Core Tables
```sql
-- Customer Management
customers (id, name, phone, email, address, balance, debt, created_at, updated_at)
subscriptions (id, customer_id, type, status, username, password, profile_id, expiry_date, mikrotik_synced)

-- Payment System
payments (id, customer_id, subscription_id, amount, method, status, reference, created_at, updated_at)
payment_plugins (id, name, version, author, description, is_active, settings)
payment_methods (id, plugin_id, name, fee_type, fee_amount, is_active)

-- Mikrotik Integration
profiles (id, name, type, price_sell, price_cost, duration, mikrotik_id)
vouchers (id, code, password, profile_id, status, created_at, valid_until, used_at)
pppoe_users (id, username, password, profile_id, customer_id, status, created_at)

-- Multi-Location Support
locations (id, name, host, port, username, password, is_active, settings, created_at)
location_users (id, location_id, user_id, user_type, created_at)

-- WhatsApp System
whatsapp_sessions (id, session_name, phone_number, is_active, priority, last_activity)
whatsapp_templates (id, name, category, content, variables, is_active, created_at)
whatsapp_messages (id, session_id, recipient, content, status, sent_at, created_at)

-- Plugin System
plugins (id, name, version, author, description, is_active, has_error, error_message, settings)
plugin_hooks (id, plugin_id, hook_name, callback_function, priority)

-- Backup System
backups (id, name, type, location, file_path, file_size, status, created_at)
backup_schedules (id, name, frequency, retention_days, is_active, last_run, next_run)

-- System Management
admin_users (id, username, email, password_hash, role, last_login, is_active)
settings (key, value, description, category, updated_at)
activity_logs (id, user_id, action, details, ip_address, created_at)
```

## 🔌 Plugin System Architecture

### Plugin Interface
```javascript
class PaymentPlugin {
    constructor(config) {
        this.config = config;
        this.name = '';
        this.version = '';
        this.author = '';
    }

    async createPayment(paymentData) { /* Required */ }
    async checkStatus(paymentId) { /* Required */ }
    async handleCallback(callbackData) { /* Required */ }
    async processRefund(paymentId, amount) { /* Optional */ }
    async validateSettings(settings) { /* Optional */ }
}
```

### Plugin Hooks
- `payment.created`: Triggered saat payment dibuat
- `payment.completed`: Triggered saat payment selesai
- `payment.failed`: Triggered saat payment gagal
- `user.created`: Triggered saat user dibuat
- `user.expired`: Triggered saat user expired

## 📱 WhatsApp Template System

### Template Variables
```javascript
{
    customer: {
        name: 'Customer Name',
        phone: 'Customer Phone',
        balance: 'Current Balance'
    },
    service: {
        type: 'Service Type',
        username: 'Username',
        password: 'Password',
        expiry: 'Expiry Date'
    },
    payment: {
        amount: 'Payment Amount',
        method: 'Payment Method',
        reference: 'Payment Reference'
    }
}
```

### Template Categories
- **welcome**: Welcome messages untuk new users
- **payment**: Payment confirmations dan notifications
- **expiry**: Expiry warnings dan reminders
- **renewal**: Renewal confirmations
- **support**: Customer support messages

## 🌐 Multi-Location Architecture

### Location Management
```javascript
class LocationManager {
    async addLocation(locationData) { /* Add new Mikrotik location */ }
    async testConnection(locationId) { /* Test connection to location */ }
    async getLocationStatus(locationId) { /* Get real-time status */ }
    async switchLocation(userId, fromLocation, toLocation) { /* Switch user location */ }
}
```

### Load Balancing Strategy
- **Round Robin**: Distribute users evenly across locations
- **Least Users**: Assign to location dengan least active users
- **Geographic**: Assign based on geographic proximity
- **Manual Override**: Admin can manually assign locations

## 💾 Backup System Architecture

### Backup Types
1. **Database Backup**: Full PostgreSQL dump
2. **Configuration Backup**: System settings dan plugin configs
3. **Media Backup**: WhatsApp media, templates, documents
4. **Log Backup**: System logs dan activity logs

### Backup Schedule
```javascript
const backupSchedules = {
    daily: { frequency: '0 2 * * *', retention: 7 },
    weekly: { frequency: '0 3 * * 0', retention: 4 },
    monthly: { frequency: '0 4 1 * *', retention: 12 }
};
```

### Backup Storage Options
- **Local**: `/backups/` directory dengan automatic cleanup
- **SFTP**: Remote server backup dengan SSH key authentication
- **Cloud**: S3-compatible storage (AWS S3, DigitalOcean Spaces, etc.)

## 🔐 Security Requirements

### Authentication & Authorization
- **JWT Tokens**: 30-day expiration dengan refresh mechanism
- **Role-Based Access**: Super Admin, Admin, Operator roles
- **Session Management**: Redis-based session storage
- **Rate Limiting**: API rate limiting per user/IP

### Data Security
- **Password Hashing**: bcrypt untuk admin passwords
- **Database Security**: Encrypted connections (SSL/TLS)
- **API Security**: Input validation dan sanitization
- **Backup Encryption**: AES-256 encryption untuk backup files

### Plugin Security
- **Sandbox Environment**: Isolated plugin execution
- **Code Validation**: Static code analysis untuk plugins
- **Permission System**: Plugin access control
- **Error Isolation**: Plugin crashes tidak affect main system

## 📱 Mobile Responsiveness Requirements

### Breakpoints
- **Mobile**: 320px - 768px
- **Tablet**: 768px - 1024px
- **Desktop**: 1024px+

### Mobile Optimization
- **Touch-Friendly**: Minimum 44px touch targets
- **Fast Loading**: Optimized CSS/JS loading
- **Offline Support**: Service worker untuk critical features
- **Progressive Web App**: PWA capabilities untuk mobile apps

## 🎛️ User Interface Requirements

### Design Principles
- **Mobile-First**: Design untuk mobile dulu, desktop adapt
- **Consistent Layout**: Uniform design system
- **Accessibility**: WCAG 2.1 AA compliance
- **Performance**: Fast load times (< 3 seconds)

### Key Interface Components
- **Dashboard**: Real-time statistics dengan charts
- **Data Tables**: Responsive tables dengan pagination
- **Forms**: Progressive enhancement dengan validation
- **Modals**: Overlay dialogs untuk detailed actions
- **Notifications**: Toast notifications untuk system feedback

## 🔧 System Configuration

### Environment Variables
```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/mikrotik_billing

# Mikrotik
MIKROTIK_HOST=192.168.1.1
MIKROTIK_PORT=8728
MIKROTIK_USERNAME=admin
MIKROTIK_PASSWORD=password
MIKROTIK_TIMEOUT=30000

# WhatsApp
WHATSAPP_WEB_HOOK_URL=http://localhost:3005/webhook/whatsapp
WHATSAPP_SESSION_TIMEOUT=300000

# Security
JWT_SECRET=your-secret-key
SESSION_SECRET=your-session-secret
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100

# Backup
BACKUP_STORAGE_PATH=/var/backups/mikrotik-billing
SFTP_HOST=backup-server.com
SFTP_PORT=22
SFTP_USERNAME=backup-user
SFTP_PRIVATE_KEY_PATH=/path/to/private/key
```

## 📈 Performance Requirements

### Response Times
- **API Response**: < 200ms untuk 95% requests
- **Page Load**: < 3 seconds untuk mobile
- **Database Query**: < 100ms untuk optimized queries
- **Mikrotik API**: < 5 seconds untuk user operations

### Scalability Requirements
- **Concurrent Users**: Support 100+ concurrent admin users
- **Database Size**: Support 1M+ users/vouchers
- **API Throughput**: 1000+ requests/minute
- **File Storage**: Support 10GB+ backup files

## 🚀 Deployment Requirements

### Production Environment
- **Node.js**: Version 18.x LTS
- **PostgreSQL**: Version 14+
- **Redis**: Version 6+ (untuk sessions)
- **Nginx**: Reverse proxy dan static file serving
- **SSL**: Let's Encrypt certificate

### Monitoring & Logging
- **Application Monitoring**: PM2 process manager
- **Error Tracking**: Comprehensive error logging
- **Performance Monitoring**: Response time tracking
- **Database Monitoring**: Query performance analysis

## 🧪 Testing Requirements

### Test Coverage
- **Unit Tests**: 80%+ code coverage
- **Integration Tests**: API endpoints dan database operations
- **E2E Tests**: Critical user journeys
- **Performance Tests**: Load testing untuk peak usage

### Test Environment
- **Staging**: Mirror production environment
- **Test Data**: Sanitized production data clone
- **Automated Testing**: CI/CD pipeline integration
- **Manual Testing**: Regular QA cycles

## 📋 Project Timeline

### Phase 1: Core System (4 weeks)
- [ ] Database schema setup
- [ ] Basic authentication system
- [ ] Customer management
- [ ] Voucher generation
- [ ] Basic Mikrotik integration

### Phase 2: Payment System (3 weeks)
- [ ] Payment plugin architecture
- [ ] DuitKu integration
- [ ] Manual payment system
- [ ] Payment notifications

### Phase 3: Advanced Features (4 weeks)
- [ ] WhatsApp template system
- [ ] Plugin manager interface
- [ ] Multi-location support
- [ ] Backup system

### Phase 4: Polish & Launch (2 weeks)
- [ ] Mobile responsiveness
- [ ] Performance optimization
- [ ] Security hardening
- [ ] Documentation completion

## 🎯 Success Metrics

### Technical Metrics
- **Uptime**: 99.5%+ system availability
- **Performance**: < 200ms average response time
- **Error Rate**: < 1% API error rate
- **Security**: Zero critical vulnerabilities

### Business Metrics
- **User Adoption**: 90%+ admin user engagement
- **Transaction Success**: 95%+ payment success rate
- **System Efficiency**: 50%+ reduction in manual work
- **Scalability**: Support 10x user growth without degradation

---

**Last Updated**: 15 October 2025
**Version**: 1.0.0
**Status**: Ready for Development