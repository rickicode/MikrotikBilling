# Payment Gateway Plugin System - Project Specifications

## 📋 Overview

Modular payment gateway system dengan arsitektur plugin-based untuk Mikrotik Billing System. Sistem ini memungkinkan penambahan payment method baru tanpa mengubah kode inti aplikasi.

## 🎯 Project Goals

1. **Modular Architecture**: Setiap payment method adalah plugin terpisah
2. **Hot-swappable**: Buka/tutup plugin tanpa restart aplikasi
3. **Standardized Interface**: API yang konsisten untuk semua plugin
4. **Easy Configuration**: Pengaturan per plugin melalui database
5. **Future-proof**: Mudah tambah payment method baru

## 🏗️ Architecture Design

### Plugin Interface Structure

```
src/
├── lib/
│   └── PaymentPlugin.js           # Base plugin class
├── plugins/
│   └── payments/
│       ├── Base/
│       │   └── PaymentPlugin.js    # Abstract base class
│       ├── DuitKu/
│       │   ├── DuitKuPlugin.js     # DuitKu implementation
│       │   ├── DuitKuConfig.js     # Configuration schema
│       │   └── DuitKuWebhook.js    # Webhook handlers
│       ├── Manual/
│       │   ├── ManualPlugin.js     # Cash/credit/debt
│       │   └── ManualConfig.js     # Configuration
│       ├── BankTransfer/
│       │   ├── BankTransferPlugin.js
│       │   └── BankTransferConfig.js
│       └── [Future Plugins]/
├── services/
│   ├── PaymentPluginManager.js    # Plugin loader & manager
│   └── PaymentService.js          # Updated to use plugins
└── routes/
    └── payments.js                 # Plugin-aware routes
```

### Database Schema Enhancement

```sql
-- Payment plugin configurations
CREATE TABLE payment_plugins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_name VARCHAR(50) UNIQUE NOT NULL,
  plugin_version VARCHAR(20) NOT NULL,
  is_enabled BOOLEAN DEFAULT 1,
  config_data TEXT, -- JSON configuration
  fee_structure TEXT, -- JSON fee settings
  supported_currencies TEXT, -- JSON array
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Available payment methods
CREATE TABLE payment_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_name VARCHAR(50) NOT NULL,
  method_code VARCHAR(50) NOT NULL,
  method_name VARCHAR(100) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  fee_type ENUM('percentage', 'fixed') DEFAULT 'fixed',
  fee_amount DECIMAL(10,2) DEFAULT 0,
  min_fee DECIMAL(10,2) DEFAULT 0,
  max_fee DECIMAL(10,2) DEFAULT 0,
  currencies TEXT, -- JSON array of supported currencies
  sort_order INTEGER DEFAULT 0,
  icon_url VARCHAR(255),
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(plugin_name, method_code)
);

-- Payment method configurations
CREATE TABLE payment_method_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_name VARCHAR(50) NOT NULL,
  config_key VARCHAR(100) NOT NULL,
  config_value TEXT,
  config_type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
  is_encrypted BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(plugin_name, config_key)
);
```

## 🔌 Plugin Interface Specifications

### Required Methods

Setiap plugin WAJIB mengimplementasikan methods berikut:

```javascript
class PaymentPlugin {
  async initialize()                    // Initialize plugin dengan config
  async createPayment(paymentData)      // Buat transaksi pembayaran
  async checkStatus(reference)          // Cek status pembayaran
  async handleCallback(callbackData)    // Handle webhook/callback
}
```

### Optional Methods

```javascript
async cancelPayment(reference)          // Batalkan pembayaran
async refundPayment(reference, amount)  // Refund pembayaran
validatePaymentData(paymentData)       // Validasi data pembayaran
calculateFee(amount)                   // Hitung biaya transaksi
```

### Payment Data Structure

```javascript
const paymentData = {
  amount: 50000,                        // Nominal pembayaran
  currency: 'IDR',                      // Kode mata uang
  customer_id: 123,                     // ID pelanggan
  customer_name: 'John Doe',            // Nama pelanggan
  customer_email: 'john@example.com',   // Email pelanggan
  customer_phone: '+628123456789',      // Nomor HP pelanggan
  description: 'Paket Internet 1 Bulan', // Deskripsi pembayaran
  order_id: 'SUB-123',                  // ID order/subscription
  callback_url: 'https://domain.com/webhook', // URL callback
  return_url: 'https://domain.com/return',     // URL return
  metadata: {                           // Additional metadata
    subscription_id: 123,
    voucher_code: 'ABC123'
  }
}
```

### Response Format Standard

**Create Payment Response:**
```javascript
{
  success: true,
  reference: 'DUITKU-ABC123456',       // Transaction reference
  redirect_url: 'https://payment.gateway.com/pay/ABC123456',
  payment_url: 'https://payment.gateway.com/pay/ABC123456',
  qr_code: 'data:image/png;base64,iVBORw0KGgoAAAANS...', // Optional
  expires_at: '2025-10-10T12:00:00Z',  // Payment expiry
  instructions: {                      // Payment instructions
    method: 'transfer',
    bank_name: 'BCA',
    account_number: '1234567890',
    account_name: 'PT. Example'
  },
  metadata: {
    transaction_id: 'TXN123456',
    created_at: '2025-10-09T12:00:00Z'
  }
}
```

**Status Check Response:**
```javascript
{
  success: true,
  reference: 'DUITKU-ABC123456',
  status: 'SUCCESS',                   // PENDING, SUCCESS, FAILED, EXPIRED
  amount: 50000,
  currency: 'IDR',
  paid_amount: 50000,
  paid_at: '2025-10-09T12:30:00Z',
  payment_method: 'BCA Virtual Account',
  metadata: {
    transaction_id: 'TXN123456',
    updated_at: '2025-10-09T12:30:00Z'
  }
}
```

## 🔧 Plugin Manager Features

### Plugin Lifecycle Management

1. **Loading**: Otomatis load plugin saat startup
2. **Validation**: Validasi plugin interface
3. **Configuration**: Load config dari database
4. **Registration**: Register plugin ke system
5. **Health Check**: Monitor plugin status
6. **Hot Reload**: Enable/disable plugin tanpa restart

### Error Handling

1. **Plugin Isolation**: Error di satu plugin tidak affect plugin lain
2. **Fallback**: Automatic fallback ke payment method lain
3. **Logging**: Comprehensive error logging per plugin
4. **Recovery**: Automatic retry mechanism untuk failed transactions

### Security Features

1. **Config Encryption**: Sensitive config di-encrypt
2. **API Key Management**: Secure storage untuk API keys
3. **Request Validation**: Input validation untuk semua requests
4. **Rate Limiting**: Per-plugin rate limiting
5. **Audit Trail**: Complete transaction logging

## 📊 Built-in Plugins Specifications

### 1. DuitKu Plugin

**Features:**
- Support 80+ payment methods (E-wallet, Bank Transfer, Retail)
- Auto-check status every 5 minutes
- Built-in retry mechanism
- Comprehensive error handling

**Configuration:**
```javascript
{
  api_key: 'encrypted_api_key',
  merchant_code: 'D12345',
  environment: 'sandbox|production',
  callback_url: 'https://domain.com/duitku/callback',
  expiry_minutes: 60,
  payment_methods: [
    { code: 'VA', name: 'Virtual Account', enabled: true },
    { code: 'EW', name: 'E-Wallet', enabled: true },
    { code: 'OV', name: 'Over the Counter', enabled: true }
  ],
  fees: {
    VA: { type: 'fixed', amount: 2500 },
    EW: { type: 'percentage', amount: 2, min_fee: 1000 },
    OV: { type: 'fixed', amount: 5000 }
  }
}
```

### 2. Manual/Cash Plugin

**Features:**
- Cash payment recording
- Credit/debt tracking
- Multiple payment splits
- Receipt generation

**Configuration:**
```javascript
{
  allow_credit: true,
  max_credit_amount: 500000,
  credit_terms_days: 30,
  auto_receipt: true,
  require_approval: false,
  receipt_template: 'default'
}
```

### 3. Bank Transfer Plugin

**Features:**
- Manual bank transfer confirmation
- Upload payment proof
- Admin approval workflow
- Automatic matching

**Configuration:**
```javascript
{
  bank_accounts: [
    {
      bank_name: 'BCA',
      account_number: '1234567890',
      account_name: 'PT. Example',
      qr_code: 'data:image/png;base64,...'
    }
  ],
  require_proof: true,
  auto_confirm_amount: 100000,
  approval_required: false
}
```

## 🚀 Implementation Plan

### Phase 1: Core System (Week 1)
- [x] Base PaymentPlugin class
- [ ] PaymentPluginManager service
- [ ] Database migrations for plugin tables
- [ ] Basic plugin loading mechanism

### Phase 2: Built-in Plugins (Week 2)
- [ ] DuitKu plugin implementation
- [ ] Manual/Cash plugin implementation
- [ ] Bank Transfer plugin implementation
- [ ] Plugin configuration UI

### Phase 3: Integration (Week 3)
- [ ] Update payment routes to use plugin system
- [ ] Webhook handling standardization
- [ ] Error handling and logging
- [ ] Plugin health monitoring

### Phase 4: Testing & Documentation (Week 4)
- [ ] Unit tests for all plugins
- [ ] Integration tests
- [ ] Performance testing
- [ ] Plugin development documentation

## 📈 Performance Considerations

1. **Async Processing**: Non-blocking payment processing
2. **Caching**: Plugin configurations cached in memory
3. **Connection Pooling**: Reuse HTTP connections
4. **Batch Processing**: Multiple transactions in single request
5. **Rate Limiting**: Prevent API abuse

## 🔒 Security Requirements

1. **Input Validation**: Strict validation untuk semua input
2. **Config Encryption**: Sensitive data di-encrypt di database
3. **HTTPS Only**: Semua komunikasi via HTTPS
4. **CORS Protection**: Proper CORS configuration
5. **Rate Limiting**: Prevent brute force attacks
6. **Audit Logging**: Complete audit trail

## 📋 Success Metrics

1. **Plugin Availability**: 99.9% uptime untuk semua active plugins
2. **Transaction Success Rate**: >95% successful transactions
3. **Response Time**: <3 seconds untuk payment creation
4. **Error Rate**: <1% failed transactions
5. **Coverage**: Support 80%+ popular payment methods in Indonesia

## 🔄 Maintenance & Updates

1. **Automatic Updates**: Plugin auto-update mechanism
2. **Version Control**: Plugin version management
3. **Rollback**: Quick rollback jika plugin bermasalah
4. **Monitoring**: Real-time plugin performance monitoring
5. **Alerts**: Automatic alerts untuk plugin failures

---

**Status:** In Progress
**Started:** 2025-10-09
**Estimated Completion:** 2025-11-06
**Priority:** High
**Impact:** Major improvement in payment system flexibility and maintainability