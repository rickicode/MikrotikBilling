# HIJINETWORK Mikrotik Billing System

Sistem manajemen voucher hotspot dan user PPPoE mikrotik lengkap menggunakan pendekatan fullstack. Sistem ini mengelola dua jenis layanan: voucher hotspot untuk penggunaan sementara dan user PPPoE untuk paket mingguan/bulanan dengan layout konsisten di seluruh aplikasi.

## Tech Stack

- **Framework**: Node.js dengan Fastify
- **Database**: SQLite dengan migration system
- **Frontend**: HTML, CSS, JavaScript, Bootstrap 5, HTMX
- **Mikrotik Integration**: RouterOS API
- **WhatsApp Integration**: WhatsApp Web JS
- **Authentication**: JWT dengan role-based access control

## Core Business Logic

### 1. Dual Service Management

**Customer Subscription System**

- File: `src/routes/customers.js`, `views/customers/`
- Customer database dengan balance tracking
- Mandatory customer assignment untuk subscriptions
- Service creation flow dengan payment integration

**One-time Voucher System**

- File: `src/routes/vouchers.js`, `views/vouchers/`
- Auto-generation voucher tanpa customer requirement
- Mikrotik user creation dengan comment metadata
- Print support dan expiry management

**User PPPoE**

- File: `src/routes/pppoe.js`, `views/pppoe/`
- Username/password generation
- Package management dengan profile assignment
- Bulk creation dan numbering system

### 2. Voucher Hotspot Management

**Mikrotik Profile Integration**

- File: `src/services/MikrotikClient.js`
- Profile filtering berdasarkan VOUCHER_SYSTEM comment
- Automatic sync dari Mikrotik ke local database
- Profile detection untuk voucher generation

**Voucher Generation Logic**

- Comment pattern: `VOUCHER_SYSTEM|price_sell|first_login_timestamp|valid_until_timestamp`
- Auto-create Mikrotik users dengan comment metadata
- Price calculation (cost vs selling price)
- Batch operations dengan custom prefix

**Auto User Detection**

- File: `src/services/Scheduler.js`
- Real-time scanning dari Mikrotik user list
- First login detection via profile scripts
- Auto cleanup expired users
- Expiry monitoring dan countdown

### 3. PPPoE User Management

**Mikrotik PPP Profile Integration**

- Profile filtering berdasarkan PPPOE_SYSTEM comment
- Profile sync ke local database
- Bandwidth dan pricing configuration

**PPPoE User Lifecycle**

- Username/password generation patterns
- Mikrotik PPP secret creation
- Comment metadata dengan customer assignment
- Auto disable untuk expired users
- Grace period configuration

### 4. Customer Management System

**Customer Database**

- Table: `customers` dengan credit/debt tracking
- Multiple users per customer support
- Subscription history tracking
- Contact information management

**Subscription Management**

- File: `src/routes/subscriptions.js`
- Support berbagai subscription types:
  - One-time vouchers
  - Recurring hotspot
  - Recurring PPPoE
- Billing cycle management
- Auto-renewal configuration

**Payment Integration**

- File: `src/routes/payments.js`
- **Plugin-based Payment Gateway System**: Modular architecture supporting multiple payment methods
- Payment plugin interface with standardized methods (createPayment, checkStatus, handleCallback)
- Built-in plugins: DuitKu, Manual/Cash payment
- Automatic fee calculation per payment method
- Payment link generation dan webhook handling
- Receipt generation
- Hot-swappable payment methods without system restart

### 5. WhatsApp Notification System

**WhatsApp Web JS Integration**

- File: `src/services/WhatsAppService.js`
- Direct WhatsApp messaging tanpa API fees
- QR code generation untuk session login
- Rate limiting (1 message per second)
- Queue management dengan retry logic

**Template System**

- File: `src/services/TemplateService.js`
- Variable substitution dalam templates
- Pre-built templates untuk berbagai triggers
- Custom template creation

**Notification Triggers**

- File: `src/services/Scheduler.js`
- Real-time triggers untuk user events
- Scheduled daily checks
- Billing reminders dan expiry warnings
- Payment confirmations

### 6. Automatic User Lifecycle Management

**Hotspot User Lifecycle**

- First login detection methods:
  - Profile script callback
  - User list monitoring
  - Active session tracking
- Auto cleanup expired users
- Subscription management automation

**Profile Script Integration**

- Automatic script injection ke Mikrotik profiles
- On-login callback endpoints
- Real-time first login tracking
- Script template untuk detection

**PPPoE User Lifecycle**

- Creation, expiry monitoring, auto disable
- Renewal handling dengan grace periods
- Billing cycle management
- Status tracking (active/expired/disabled)

### 7. Mikrotik Integration Architecture

**API Connection Management**

- Secure connection dengan connection pooling
- Auto reconnection dan error handling
- Rate limiting untuk API calls
- Connection health monitoring

**Real-time Data Sync**

- Background synchronization system
- Configurable polling intervals
- Offline mode dengan conflict resolution
- Data consistency checks

**Comment Data Format**

- Voucher: `VOUCHER_SYSTEM|price_sell|first_login_timestamp|valid_until_timestamp`
- Subscription: Complete metadata dengan customer assignment
- Consistent pattern across all user types

### 8. User Interface Structure

**Navigation System**

- Dashboard dengan live statistics
- Customer Management section
- Voucher generation interface
- PPPoE user management
- WhatsApp Management (QR scanner, templates)
- Profile configuration
- Reports dan monitoring

**Dashboard Features**

- Live statistics dari Mikrotik:
  - Active hotspot users count
  - Active PPPoE users count
  - Total profit calculation
- Real-time session monitoring
- Automated tasks status

**Admin Authentication**

- JWT tokens dengan 30-day sessions
- Role-based permissions (Super Admin, Admin, Operator)
- Activity logging dan security monitoring
- Session management

### 9. Print System

**Auto Print Workflow**

- File: `src/routes/print.js`
- Auto-open new tab setelah voucher creation
- Print-optimized pages tanpa navigation
- Multiple format support (A4, thermal)

**Voucher Print Layout**

- A4: 120 voucher per lembar (3x40 grid)
- Thermal: Continuous roll format
- Design includes kode, durasi, expiry, harga
- CSS print media queries

### 10. Monitoring & Reports

**Live User Monitoring**

- Real-time data dari Mikrotik API
- Hotspot users status tracking
- PPPoE users management
- Session monitoring

**Financial Reports**

- Profit analysis dari comment data
- Revenue tracking dari payment records
- Cost tracking dari profile settings
- Debt management dengan aging reports
- Audit trail protection

### 11. Payment Gateway Plugin System

**Plugin Architecture**

- File: `src/lib/PaymentPlugin.js` - Base plugin class and interface
- File: `src/plugins/payments/` - Individual payment method plugins
- Standardized plugin interface dengan required methods
- Hot-swappable plugins tanpa system restart
- Automatic plugin validation and error handling

**Plugin Features**

- Modular payment method implementation
- Automatic fee calculation per method
- Support for multiple currencies
- Built-in validation and error handling
- Callback/webhook handling standardized
- Transaction status checking
- Refund and cancellation support (optional)

**Built-in Plugins**

- **DuitKu Plugin**: E-wallet, bank transfer, retail payments
- **Manual/Cash Plugin**: Cash, credit/debt recording
- **Bank Transfer Plugin**: Direct bank transfer confirmation
- **Crypto Plugin**: Cryptocurrency payments (future)

**Plugin Configuration**

- Database-stored plugin settings
- Real-time plugin status monitoring
- Fee structure per payment method
- Currency conversion support
- Transaction logging per plugin

### 12. Configuration System

**General Settings**

- Company/WiFi name configuration
- Cleanup schedule settings
- Mikrotik connection parameters
- Profile comment markers
- Print layout customization

**Pricing Configuration**

- Dual pricing system (cost vs selling)
- Profit margin calculation
- Bulk pricing rules
- Multiple currency support
- Payment method fee configuration

### 13. Database Schema

**Core Tables**

- `customers` - Customer information dan balances
- `subscriptions` - Subscription management
- `profiles` - Profile configuration
- `payments` - Payment processing records
- `payment_plugins` - Payment gateway plugin configurations
- `payment_methods` - Available payment methods with fee structures
- `whatsapp_*` tables - WhatsApp integration
- `admin_users` - Admin authentication
- `settings` - System configuration

**Data Sources**

- Live data dari Mikrotik API
- Local database untuk audit trail
- Comment metadata untuk user tracking

## Critical Implementation Notes

1. **Separate UI Systems**: Voucher generation (no customer) vs Customer subscriptions (mandatory customer)
2. **Payment-First Renewal**: No auto-renewal, manual payment required
3. **Plugin-based Payments**: Modular payment gateway system with hot-swappable methods
4. **Mikrotik-Centric**: RouterOS handles primary user logic
5. **Audit Protection**: Manual Mikrotik changes tidak affect billing
6. **WhatsApp-Only**: Single notification channel untuk simplicity
7. **Real-time Sync**: Polling dengan offline mode fallback
8. **Comment Patterns**: Consistent metadata storage dalam Mikrotik comments
9. **Auto Lifecycle**: System-managed user creation, monitoring, dan cleanup
