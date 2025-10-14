# WhatsApp-Centric Notification System Design

## 📋 Overview

Complete refactor dari sistem notification Mikrotik Billing menjadi WhatsApp-centric yang sederhana dan otomatis.

## 🎯 Objectives

- **Otomatisasi penuh** reminder subscription expiry
- **Template system** yang fixed untuk sistem, custom untuk bulk send
- **Background scheduler** yang monitoring subscription dan payment
- **Clean database** dengan auto-cleanup 30 hari
- **Complete audit trail** untuk semua notifikasi

## 🗃️ Current Database State

### Existing Tables (18 tables)

**Core Business:**
- `customers` - Customer data (nama, nomor_hp, email, credit/debt)
- `subscriptions` - PPPoE/Hotspot subscriptions (customer_id, profile, expiry_date)
- `vouchers` - One-time vouchers (batch_id, voucher_code, expires_at)
- `payments` - Payment records (customer_id, amount, payment_status)
- `profiles` - Package profiles (sync dari Mikrotik)
- `vendors` - Vendor management
- `settings` - System configuration

**Existing WhatsApp:**
- `whatsapp_messages` - Current message storage
- `whatsapp_templates` - Current templates
- `whatsapp_sessions` - Connection management

**Legacy (akan di-deprecate):**
- `notification_queue` - Old queue system
- `notification_templates` - Old templates

## 🔄 Migration Plan

### Strategy: **Refactor, Not Drop**

1. **Enhance existing WhatsApp tables**
2. **Add new scheduler/audit tables**
3. **Migrate data secara gradual**
4. **Preserve existing functionality**

## 🗃️ Final Database Schema

### 1. Enhanced whatsapp_messages

```sql
CREATE TABLE whatsapp_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT UNIQUE NOT NULL,
  chat_id TEXT NOT NULL,                    -- Format: 6281234567890@s.whatsapp.net
  content TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'scheduled', 'sent', 'delivered', 'read', 'failed')),
  message_type TEXT DEFAULT 'outgoing' CHECK(message_type IN ('outgoing', 'incoming')),
  template_id INTEGER,
  related_id INTEGER,                       -- Reference ke customer/voucher/payment/subscription
  related_type TEXT CHECK(related_type IN ('customer', 'voucher', 'payment', 'subscription', 'general')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  scheduled_at DATETIME,                    -- Untuk delayed sending
  sent_at DATETIME,
  delivered_at DATETIME,
  read_at DATETIME,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  expires_at DATETIME DEFAULT (datetime('now', '+30 days'))  -- Auto-cleanup 30 hari
);
```

### 2. Enhanced whatsapp_templates

```sql
CREATE TABLE whatsapp_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  variables TEXT,                           -- JSON array of available variables
  template_type TEXT DEFAULT 'business' CHECK(template_type IN ('business', 'system')),
  category TEXT DEFAULT 'general' CHECK(category IN ('reminder', 'payment', 'expiry', 'invoice', 'general')),
  description TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 3. Unchanged whatsapp_sessions

```sql
CREATE TABLE whatsapp_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_name TEXT UNIQUE NOT NULL DEFAULT 'main',
  session_data TEXT,                        -- JSON encoded session data
  qr_code TEXT,                           -- Base64 encoded QR code
  status TEXT DEFAULT 'disconnected' CHECK(status IN ('disconnected', 'connecting', 'connected', 'scanning', 'error')),
  phone_number TEXT,                       -- Connected WhatsApp number
  last_activity DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 4. New scheduler_jobs

```sql
CREATE TABLE scheduler_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_name TEXT UNIQUE NOT NULL,
  job_type TEXT CHECK(job_type IN ('reminder_check', 'cleanup', 'sync')),
  schedule_pattern TEXT,                    -- Cron pattern: "0 9 * * *"
  is_active BOOLEAN DEFAULT 1,
  last_run DATETIME,
  next_run DATETIME,
  job_config TEXT,                          -- JSON config for job parameters
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 5. New notification_log

```sql
CREATE TABLE notification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER,                          -- Reference to scheduler_jobs
  template_id INTEGER,                     -- Reference to whatsapp_templates
  target_type TEXT,                        -- 'subscription_expiry', 'payment_confirmation'
  target_id INTEGER,                       -- subscription_id or payment_id
  chat_id TEXT NOT NULL,
  message_content TEXT NOT NULL,
  status TEXT CHECK(status IN ('success', 'failed', 'skipped')),
  error_message TEXT,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 📝 Template System

### 🔒 System Templates (4 Fixed Templates)

**Tidak bisa dihapus/hanya bisa diedit variables-nya**

1. **`reminder_7d`** - Reminder 7 hari sebelum expiry
   ```
   ⏰ Pengingat Langganan 7 Hari

   Halo {customer_name},
   Paket {package_name} Anda akan berakhir dalam 7 hari.

   Perpanjang sekarang: {payment_link}
   Terima kasih!
   ```
   **Variables:** `customer_name`, `package_name`, `expiry_date`, `payment_link`

2. **`reminder_3d`** - Reminder 3 hari sebelum expiry
   ```
   ⏰ Pengingat Langganan 3 Hari

   Halo {customer_name},
   Paket {package_name} Anda akan berakhir dalam 3 hari!

   Segera perpanjang: {payment_link}
   Terima kasih!
   ```
   **Variables:** `customer_name`, `package_name`, `expiry_date`, `payment_link`

3. **`expired`** - Notifikasi kadaluarsa
   ```
   ❌ Paket Berakhir

   Halo {customer_name},
   Paket {package_name} Anda telah berakhir pada {expiry_date}.

   Aktifkan kembali: {payment_link}
   Hubungi admin untuk bantuan.
   ```
   **Variables:** `customer_name`, `package_name`, `expiry_date`, `payment_link`

4. **`payment_ok`** - Konfirmasi pembayaran
   ```
   ✅ Pembayaran Diterima

   Terima kasih {customer_name}!
   Pembayaran Rp {amount} telah diterima.

   Paket: {package_name}
   Periode: {period}
   Status: Aktif kembali
   ```
   **Variables:** `customer_name`, `amount`, `package_name`, `period`, `payment_date`

### ➕ Custom Templates (Unlimited)

**Bisa ditambah/diedit/hapus untuk bulk send manual**

- Digunakan untuk send bulk ke multiple customers
- Bebas menentukan content dan variables
- Tidak digunakan oleh sistem otomatis
- Contoh: announcement, promotion, custom messages

## ⚙️ Scheduler System

### Background Process Flow

```javascript
// WhatsAppNotificationScheduler.js
class WhatsAppNotificationScheduler {
  async start() {
    // Run setiap jam
    while (this.isRunning) {
      await this.checkSubscriptionExpiry();    // Cek subscription yang akan expired
      await this.checkPaymentConfirmations();  // Cek payment baru
      await this.cleanupOldMessages();        // Cleanup 30 hari
      await this.syncWithMikrotik();          // Sync data

      // Sleep 1 jam
      await new Promise(resolve => setTimeout(resolve, 60 * 60 * 1000));
    }
  }
}
```

### Trigger Logic

**Subscription Expiry Check:**
1. Query subscriptions dari local database
2. Filter: `expiry_date = today + 7 days` → `reminder_7d`
3. Filter: `expiry_date = today + 3 days` → `reminder_3d`
4. Filter: `expiry_date < today` → `expired`
5. Get customer info dari `customers` table
6. Send WhatsApp message
7. Log ke `notification_log`

**Payment Confirmation Check:**
1. Query payments dengan `payment_status = 'paid'` dan `notification_sent = 0`
2. Get customer dan package info
3. Use `payment_ok` template
4. Send WhatsApp message
5. Update `notification_sent = 1`
6. Log ke `notification_log`

### Data Sources

**Customer Data:**
```sql
SELECT id, nama as customer_name, nomor_hp as phone
FROM customers
WHERE status_aktif = 1;
```

**Subscription Data:**
```sql
SELECT s.*, c.nama as customer_name, c.nomor_hp as phone, p.name as package_name
FROM subscriptions s
JOIN customers c ON s.customer_id = c.id
JOIN profiles p ON s.profile_id = p.id
WHERE s.status IN ('active', 'disabled')
AND (s.expiry_date <= date('now', '+7 days'));
```

**Payment Data:**
```sql
SELECT p.*, c.nama as customer_name, c.nomor_hp as phone, pr.name as package_name
FROM payments p
JOIN customers c ON p.customer_id = c.id
LEFT JOIN subscriptions s ON p.subscription_id = s.id
LEFT JOIN profiles pr ON s.profile_id = pr.id
WHERE p.payment_status = 'paid'
AND p.notification_sent = 0
AND p.created_at > datetime('now', '-24 hours');
```

## 🔧 Implementation Details

### Migration Steps

1. **ALTER TABLE whatsapp_messages** - Add chat_id, scheduled_at, delivered_at, read_at, expires_at
2. **ALTER TABLE whatsapp_templates** - Add template_type, description, rename template_content→content
3. **CREATE TABLE scheduler_jobs** - New table
4. **CREATE TABLE notification_log** - New table
5. **CREATE INDEXES** - Performance optimization
6. **CREATE TRIGGERS** - Auto-cleanup dan timestamp management
7. **MIGRATE DATA** - Convert existing data ke format baru
8. **INSERT DEFAULT JOBS** - Scheduler configuration

### Integration Points

**WhatsApp Service Integration:**
- Chat ID format: `6281234567890@s.whatsapp.net`
- Rate limiting: 1 message per second
- Status tracking: pending → sent → delivered → read
- Error handling dan retry logic

**Mikrotik Integration:**
- Sync PPPoE users untuk update expiry dates
- Sync voucher users untuk tracking
- Comment parsing untuk metadata extraction

**UI Requirements:**
1. **Template Management** - List system (read-only) + custom templates
2. **Message History** - View sent messages dengan status
3. **Bulk Send** - Select customers + custom template
4. **Scheduler Status** - Monitor background jobs

## 📊 Performance & Reliability

### Database Optimization

- **Indexes** pada chat_id, status, created_at, expires_at
- **Auto-cleanup** 30 hari via triggers
- **Connection pooling** untuk concurrent access
- **Batch processing** untuk bulk operations

### Error Handling

- **Graceful degradation** jika Mikrotik tidak accessible
- **Retry mechanisms** untuk failed WhatsApp sends
- **Comprehensive logging** di notification_log
- **Health checks** untuk scheduler service

### Monitoring

- **Message delivery rates** tracking
- **Scheduler job execution** monitoring
- **Database size** management
- **Error rate** alerting

## 🚀 Deployment

### Pre-Migration Checklist

1. **Backup database** `data/billing.db`
2. **Stop application** services
3. **Test migration** di development environment
4. **Verify data integrity** post-migration

### Post-Migration Verification

1. **Test WhatsApp connection** dan QR scanning
2. **Verify scheduler jobs** running correctly
3. **Test template rendering** dengan real data
4. **Monitor message delivery** untuk beberapa hari

### Rollback Plan

1. **Database backup** restore point
2. **Migration script** dengan rollback capability
3. **Feature flags** untuk enable/disable new functionality
4. **Monitoring** untuk detect issues early

## 📈 Future Considerations

### Potential Enhancements

1. **Advanced scheduling** - Custom cron patterns
2. **Template approval** workflow
3. **Multi-language support**
4. **Analytics dashboard** dengan detailed statistics
5. **Customer response** handling untuk two-way communication

### Scaling Considerations

1. **Distributed processing** untuk multiple scheduler instances
2. **Message queues** (Redis/RabbitMQ) untuk better reliability
3. **Database sharding** untuk large datasets
4. **Load balancing** untuk WhatsApp connections

---

## 📝 Summary

**WhatsApp-centric system ini menggabungkan:**

- ✅ **4 fixed system templates** untuk otomatisasi lengkap
- ✅ **Unlimited custom templates** untuk bulk send manual
- ✅ **Background scheduler** yang monitoring subscription/payment 24/7
- ✅ **Auto-cleanup 30 hari** untuk space management
- ✅ **Complete audit trail** untuk compliance dan debugging
- ✅ **Backward compatibility** dengan existing data
- ✅ **Performance optimized** dengan proper indexing

**Status:** Design completed, siap untuk implementation dengan migration script.