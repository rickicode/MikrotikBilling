# MIKROTIK BILLING SYSTEM v2.0

## Primary Project Overview

Mikrotik Billing System v2.0 adalah sistem manajemen billing lengkap untuk layanan hotspot dan PPPoE berbasis Mikrotik RouterOS. Sistem mengelola siklus hidup pelanggan mulai dari pendaftaran, pembayaran, otomasi layanan, hingga pelaporan keuangan.

## Core Value Proposition

**All-in-One Billing Solution**
- Manajemen voucher hotspot one-time
- Subscription PPPoE berjangka
- Payment gateway integration
- WhatsApp automation
- Real-time monitoring

## Target Users

- **WISP (Wireless Internet Service Provider)**
- **RT/RW Net Providers**
- **Voucher WiFi Sellers**
- **Small to Medium ISPs**

## Architecture Highlights

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Frontend  │    │  REST API       │    │  Mikrotik API   │
│   (Bootstrap)   │◄──►│  (Fastify)      │◄──►│  (RouterOS)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │  PostgreSQL DB  │
                       │   (Primary)     │
                       └─────────────────┘
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
        ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
        │ WhatsApp    │ │ Payment     │ │ Scheduler   │
        │ Integration │ │ Gateway     │ │ Service     │
        └─────────────┘ └─────────────┘ └─────────────┘
```

## Key Business Modules

### 1. **Voucher System**
- Voucher hotspot one-time use
- Expiry setelah first login
- Batch creation dengan tracking
- Pipe-separated comment metadata

### 2. **Customer Management**
- Database pelanggan lengkap
- Credit/debt tracking
- Multiple users per customer
- Activity history

### 3. **PPPoE System**
- Paket berlangganan (mingguan/bulanan)
- Auto-renewal reminders
- Grace period management
- Profile-based bandwidth

### 4. **Payment Gateway**
- Plugin-based architecture dengan ZIP upload
- DuitKu integration sebagai plugin default
- Payment links dengan online/offline options
- Automatic fee calculation per plugin
- Hot-swappable plugins tanpa restart

### 5. **WhatsApp Automation**
- Multi-session support (multiple devices)
- Priority bulk notifications
- Queue management dengan failover
- Template system
- Rate limiting (1 msg/detik)

## Differentiators

1. **Mikrotik-Native**: Memanfaatkan RouterOS untuk user management
2. **No Time Decay**: Voucher tidak expired sampai first use
3. **Dual Pricing**: Cost vs selling price tracking
4. **WhatsApp-First**: Single channel notifikasi
5. **Real-time Sync**: Live data dari Mikrotik API

## Technical Stack

- **Backend**: Node.js + Fastify v4.24.0
- **Database**: PostgreSQL dengan migration files
- **Frontend**: Bootstrap 5 + EJS (partial HTMX)
- **Integrations**: Mikrotik API, WhatsApp Web JS (Baileys), DuitKu API
- **Authentication**: JWT dengan role-based access (super_admin, admin, operator)
- **Background Tasks**: Simple scheduler dengan Redis queue
- **Payment**: Plugin-based architecture dengan ZIP upload & activation
- **Monitoring**: Real-time connection & queue monitoring
- **Email**: SMTP untuk backup notifikasi (opsional)

## Business Logic

### Voucher Flow
```
Create Batch → Generate Codes → Push to Mikrotik → User List Monitoring → First Login Detection → Start Expiry → Auto Cleanup
```

### PPPoE User Flow
```
Create User → Assign Profile → Monitor via User List → Check Expiry → Disable/Remove → Cleanup
```

### Subscription Flow
```
Register Customer → Choose Package → Create PPPoE User → Generate Invoice → WhatsApp Notification → Payment (Online/Offline) → Update Balance → No Grace Period (Invoice URL Always Active)
```

### Payment Flow
```
Generate Invoice → WhatsApp Notification → Customer Clicks Payment URL → Choose Method (Online Plugin/Offline Manual) → Process Payment → Update Balance → Carry Over if Partial → WhatsApp Confirmation
```

## Database Design Principles

- Single source of truth (PostgreSQL)
- Migration files untuk version control
- Audit trail protection dengan detailed logging
- Comment-based metadata storage di Mikrotik
- Real-time synchronization antara database dan Mikrotik

## Security Features

- JWT authentication dengan 30-day expiry
- Role-based permissions (super_admin, admin, operator)
- **Tidak ada API rate limiting** (per user request)
- **Tidak ada 2FA** (considered overkill)
- SQL injection protection dengan parameterized queries
- XSS protection dengan input validation
- Plugin sandboxing (eval dalam try-catch)
- File upload validation (ZIP only)
- Signature verification untuk payment callbacks
- Comprehensive logging untuk security audit

## Performance Targets

- 1000+ concurrent users
- Sub-second API response
- Real-time dashboard updates
- Batch voucher creation (500+)

## Deployment & Operations

- Single server deployment
- Environment-based configuration
- Redis untuk background tasks
- **Backup**: Mikrotik data only via SFTP (30 hari)
- **Data Retention**: Logs 30 hari, WhatsApp 15 hari
- **Monitoring**: Connection status, queue health, active users
- **No Automated Testing**: Manual testing approach
- **Email**: SMTP backup untuk WhatsApp (opsional)

## Documentation Structure

```
PROJECT_SPECIFICATIONS.md    # Primary overview (this file)
specs/                       # Detailed module specifications
├── 01-architecture.md      # Technical architecture
├── 02-database-schema.md   # PostgreSQL migration design
├── 03-authentication-security.md  # Auth & security
├── 04-voucher-system.md    # Voucher system dengan user list monitoring
├── 05-customer-management.md  # Customer management dengan self-service limitations
├── 06-pppoe-system.md      # PPPoE system dengan profile patterns
├── 07-subscription-management.md  # Subscriptions dengan carry over
├── 08-payment-gateway.md   # Plugin-based payment gateway (ZIP upload)
├── 09-payment-links.md     # Payment URL service
├── 10-carry-over-logic.md  # Partial payment carry over implementation
├── 11-mikrotik-integration.md  # Mikrotik API integration
├── 12-whatsapp-automation.md  # WhatsApp multi-session
├── 13-payment-invoice-ui.md  # Invoice UI dengan payment buttons
├── 14-data-retention-backup.md  # Data retention & backup policies
└── 15-performance-monitoring.md  # Performance & monitoring
```

## Development Status

- **Version**: 2.0.0 (Complete Rewrite)
- **Database**: PostgreSQL (Supabase)
- **Status**: Ready for Implementation
- **Estimate**: 3-4 months development
- **Key Decisions**: No rate limiting, No 2FA, Manual testing, Plugin ZIP upload

## Next Steps

1. Implement core database schema
2. Develop authentication system
3. Build Mikrotik integration
4. Create voucher system
5. Implement payment gateway
6. Add WhatsApp automation
7. Build dashboard UI
8. Testing & deployment

---

*Last Updated: 2025-01-09*
*Version: 2.0.0*