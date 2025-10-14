# Voucher System v2.0 - Spesifikasi Lengkap

## 1. Overview

Sistem voucher v2.0 mengelola voucher hotspot satu kali pakai dengan expiry berdasarkan first login. Sistem menggunakan pipe-separated comment format untuk metadata di Mikrotik.

## 2. Key Features

### 2.1 Core Features
- **No Time Decay**: Voucher tidak expired sampai first login
- **Batch Creation**: Generate voucher dalam batch dengan tracking
- **Pipe-Separated Comments**: Metadata storage di Mikrotik
- **Transaction Rollback**: Full rollback untuk error handling
- **Automated Cleanup**: Background task untuk expired users
- **Print Support**: Multiple format (A4, thermal)
- **User List Monitoring**: Real-time monitoring via Mikrotik API
- **All-or-Nothing**: Batch creation atomic operation

### 2.2 Business Logic
- Voucher aktif setelah first login
- Expiry countdown dimulai setelah first login
- Unique generation dengan collision detection
- Cost vs selling price tracking
- Vendor assignment support
- **First Login Detection**: Via user list monitoring (no profile scripts)
- **Profile Pattern**: `*voucher*` untuk identifikasi otomatis

## 3. Architecture

### 3.1 Components
```
src/routes/vouchers.js          # Voucher management routes
src/services/VoucherEngine.js   # Core voucher logic
src/services/Scheduler.js      # Background tasks
src/lib/VoucherGenerator.js    # Unique code generation
src/services/VoucherMonitor.js  # User list monitoring service
views/vouchers/                # Voucher management UI
```

### 3.2 User List Monitoring Strategy

**Monitoring Flow**:
```
Scheduler (30 detik) → Get User List → Filter *voucher* profiles → Check New Users → Update First Login → Start Expiry
```

**Implementation Pattern**:
```javascript
// Monitor user list for first login detection
async function monitorVoucherUsers() {
  const users = await mikrotik.getUserList();
  const voucherUsers = users.filter(u => u.profile.includes('voucher'));

  for (const user of voucherUsers) {
    const voucher = await db.query(
      'SELECT * FROM vouchers WHERE code = ? AND status = "created"',
      [user.name]
    );

    if (voucher && user.uptime > 0) {
      // First login detected
      await activateVoucher(voucher.id, {
        firstLoginAt: new Date(),
        ipAddress: user.address,
        macAddress: user['mac-address']
      });
    }
  }
}
```

### 3.2 Comment Format
```
v2.0 Format:
VOUCHER_SYSTEM|{batch_id}|{price_sell}|{price_cost}|{valid_hours}|{vendor_id}|{created_date}|{created_by}

Example:
VOUCHER_SYSTEM|BATCH-202501-001|15000|10000|24|VENDOR-001|2025-01-09|admin

Field Descriptions:
- batch_id: Unique identifier for batch
- price_sell: Selling price to customer
- price_cost: Cost price for tracking
- valid_hours: Validity after first login
- vendor_id: Vendor identifier
- created_date: Creation date
- created_by: Admin who created
```

## 4. Database Schema

### 4.1 Tables
```sql
-- Voucher batches
CREATE TABLE voucher_batches (
    id SERIAL PRIMARY KEY,
    batch_id VARCHAR(20) UNIQUE NOT NULL,
    quantity INTEGER NOT NULL,
    profile_id INTEGER NOT NULL,
    price_sell DECIMAL(10,2) NOT NULL,
    price_cost DECIMAL(10,2) NOT NULL,
    valid_hours INTEGER DEFAULT 24,
    vendor_id VARCHAR(50),
    created_by VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

-- Individual vouchers
CREATE TABLE vouchers (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    batch_id INTEGER NOT NULL,
    profile_id INTEGER NOT NULL,
    mikrotik_id VARCHAR(50),
    status VARCHAR(20) DEFAULT 'created', -- created, active, used, expired
    first_login_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    used_at TIMESTAMP NULL,
    ip_address VARCHAR(45),
    mac_address VARCHAR(17),
    mikrotik_comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (batch_id) REFERENCES voucher_batches(id),
    FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

-- Voucher usage tracking
CREATE TABLE voucher_usage (
    id SERIAL PRIMARY KEY,
    voucher_id INTEGER NOT NULL,
    username VARCHAR(100),
    ip_address INET,
    mac_address VARCHAR(17),
    session_start TIMESTAMP,
    session_end TIMESTAMP,
    bytes_used BIGINT DEFAULT 0,
    packets_used BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (voucher_id) REFERENCES vouchers(id)
);
```

## 5. API Endpoints

### 5.1 Voucher Management
```javascript
// Create voucher batch
POST /api/vouchers/batch
{
  profile_id: 123,
  quantity: 100,
  prefix: "WIFI-",
  price_sell: 15000,
  price_cost: 10000,
  valid_hours: 24,
  vendor_id: "VENDOR-001"
}

// Get batch details
GET /api/vouchers/batch/:batch_id

// Check code uniqueness
GET /api/vouchers/unique-check?code=WIFI-123456&batch_id=BATCH-001

// Activate voucher (first login)
POST /api/vouchers/:code/activate
{
  username: "WIFI-123456",
  ip_address: "192.168.1.100",
  profile: "voucher-1hr"
}

// Get voucher statistics
GET /api/vouchers/statistics
{
  total_created: 1000,
  total_used: 850,
  total_active: 50,
  total_expired: 100,
  revenue_total: 12750000,
  revenue_cost: 8500000,
  profit: 4250000
}
```

### 5.2 Print & Export
```javascript
// Generate print preview
GET /api/vouchers/batch/:batch_id/print-preview
// Returns HTML optimized for A4/thermal printing

// Export voucher list
GET /api/vouchers/export?format=csv&batch_id=BATCH-001&status=used
```

## 6. Business Logic Flow

### 6.1 Voucher Creation Flow (All-or-Nothing)
```javascript
async function createVoucherBatch(data) {
  const transaction = await db.beginTransaction();
  const createdVouchers = [];
  const createdMikrotikUsers = [];

  try {
    // 1. Generate unique batch ID
    const batchId = generateBatchId();

    // 2. Create batch record
    const batch = await createBatchRecord(transaction, {
      ...data,
      batch_id: batchId
    });

    // 3. Generate unique voucher codes (check against DB)
    const vouchers = [];
    for (let i = 0; i < data.quantity; i++) {
      let code;
      let attempts = 0;
      do {
        code = generateVoucherCode(data.prefix);
        attempts++;
        if (attempts > 100) {
          throw new Error('Unable to generate unique voucher code');
        }
      } while (vouchers.includes(code) ||
               await isCodeExists(transaction, code));

      vouchers.push(code);
    }

    // 4. Create vouchers in database
    for (const code of vouchers) {
      const voucher = await createVoucherRecord(transaction, {
        code,
        batch_id: batch.id,
        profile_id: data.profile_id,
        mikrotik_comment: buildComment({
          system: 'VOUCHER_SYSTEM',
          batch_id: batchId,
          price_sell: data.price_sell,
          price_cost: data.price_cost,
          valid_hours: data.valid_hours,
          vendor_id: data.vendor_id,
          created_date: new Date().toISOString().split('T')[0],
          created_by: data.created_by
        })
      });
      createdVouchers.push(voucher);
    }

    // 5. Create in Mikrotik (all or nothing)
    for (const code of vouchers) {
      try {
        const mikrotikUser = await mikrotik.addHotspotUser({
          name: code,
          password: code,
          profile: data.profile_name,
          comment: createdVouchers.find(v => v.code === code).mikrotik_comment
        });
        createdMikrotikUsers.push({ code, mikrotikId: mikrotikUser['.id'] });
      } catch (error) {
        // If any Mikrotik creation fails, cleanup all
        await cleanupMikrotikUsers(createdMikrotikUsers);
        throw new Error(`Mikrotik creation failed for ${code}: ${error.message}`);
      }
    }

    // 6. Update vouchers with Mikrotik IDs
    for (const { code, mikrotikId } of createdMikrotikUsers) {
      await updateVoucherMikrotikId(transaction, code, mikrotikId);
    }

    await transaction.commit();

    // 7. Auto-open print preview
    if (data.auto_print) {
      return {
        success: true,
        batch_id: batchId,
        vouchers,
        print_url: `/vouchers/batch/${batchId}/print-preview`
      };
    }

    return { success: true, batch_id: batchId, vouchers };

  } catch (error) {
    await transaction.rollback();

    // Cleanup partial Mikrotik users
    if (createdMikrotikUsers.length > 0) {
      await cleanupMikrotikUsers(createdMikrotikUsers);
    }

    throw error;
  }
}
```

### 6.2 First Login Detection (User List Monitoring)
```javascript
// Called from scheduler every 30 seconds
async function detectVoucherFirstLogin() {
  const transaction = await db.beginTransaction();

  try {
    // 1. Get all users from Mikrotik
    const users = await mikrotik.getUserList();

    // 2. Filter voucher profiles
    const voucherUsers = users.filter(user =>
      user.profile && user.profile.includes('voucher')
    );

    // 3. Check for new activations
    for (const user of voucherUsers) {
      // Check if user is online (uptime > 0)
      if (user.uptime > 0) {
        const voucher = await transaction.query(`
          SELECT * FROM vouchers
          WHERE code = ? AND status = 'created'
        `, [user.name]);

        if (voucher.rows.length > 0) {
          const v = voucher.rows[0];
          const now = new Date();
          const expiryTime = new Date(
            now.getTime() + (v.valid_hours * 60 * 60 * 1000)
          );

          // 4. Update voucher status
          await transaction.query(`
            UPDATE vouchers
            SET status = 'active',
                first_login_at = ?,
                expires_at = ?,
                ip_address = ?,
                mac_address = ?,
                updated_at = ?
            WHERE id = ?
          `, [
            now,
            expiryTime,
            user.address,
            user['mac-address'],
            now,
            v.id
          ]);

          // 5. Create usage record
          await transaction.query(`
            INSERT INTO voucher_usage
            (voucher_id, username, ip_address, mac_address, session_start)
            VALUES (?, ?, ?, ?, ?)
          `, [v.id, user.name, user.address, user['mac-address'], now]);

          // 6. Update Mikrotik comment
          const comment = parseComment(v.mikrotik_comment);
          comment.first_login_at = now.toISOString();
          comment.expires_at = expiryTime.toISOString();

          await mikrotik.updateUserComment(v.mikrotik_id,
            buildComment(comment)
          );
        }
      }
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    console.error('Error detecting voucher first login:', error);
  }
}
```

### 6.3 Automated Cleanup
```javascript
// Runs daily at 02:00 AM
async function cleanupExpiredVouchers() {
  const now = new Date();
  let cleanedCount = 0;

  // 1. Find expired vouchers
  const expiredVouchers = db.query(`
    SELECT v.*, m.name as mikrotik_name
    FROM vouchers v
    LEFT JOIN mikrotik_users m ON v.mikrotik_id = m.'.id'
    WHERE v.status = 'active'
    AND v.expires_at < ?
  `, [now]);

  // 2. Process each expired voucher
  for (const voucher of expiredVouchers) {
    try {
      // Remove from Mikrotik
      if (voucher.mikrotik_name) {
        await fastify.mikrotik.removeHotspotUser(voucher.mikrotik_name);
      }

      // Update status
      db.run(`
        UPDATE vouchers
        SET status = 'expired', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [voucher.id]);

      // End usage session
      db.run(`
        UPDATE voucher_usage
        SET session_end = ?
        WHERE voucher_id = ? AND session_end IS NULL
      `, [now, voucher.id]);

      cleanedCount++;

    } catch (error) {
      console.error(`Error cleaning voucher ${voucher.code}:`, error);
    }
  }

  // 3. Log cleanup result
  await logSystemEvent('voucher_cleanup', {
    cleaned_count: cleanedCount,
    timestamp: now.toISOString()
  });

  return cleanedCount;
}
```

## 7. Error Handling

### 7.1 Transaction Scenarios
- **Partial Creation**: Rollback all created vouchers and Mikrotik users
- **Mikrotik Failure**: Remove from database, keep batch for retry
- **Duplicate Code**: Regenerate new code automatically
- **Comment Length**: Truncate or use abbreviated format

### 7.2 Recovery Mechanisms
- **Batch Recovery**: Retry failed Mikrotik operations
- **Orphan Cleanup**: Find and remove vouchers not in database
- **Sync Verification**: Daily sync between database and Mikrotik

## 8. Performance Optimizations

### 8.1 Batch Operations
- Bulk insert for voucher creation
- Batch Mikrotik API calls
- Parallel processing for large batches

### 8.2 Caching
- Profile cache for batch creation
- Generated code cache for uniqueness check
- Statistics cache for dashboard

## 9. Security Considerations

### 9.1 Code Generation
- Cryptographically secure random generation
- Collision detection before creation
- No sequential patterns

### 9.2 Access Control
- Admin role required for creation
- Audit trail for all operations
- Vendor isolation if needed

## 10. Testing Strategy

### 10.1 Unit Tests
- Code generation uniqueness
- Comment parsing/formatting
- Expiry calculation logic

### 10.2 Integration Tests
- Mikrotik API integration
- Transaction rollback scenarios
- Batch creation workflows

### 10.3 Load Tests
- Large batch creation (1000+ vouchers)
- Concurrent activation requests
- Cleanup performance

## 11. Monitoring & Metrics

### 11.1 KPIs
- Voucher creation rate
- Activation rate
- Expiry rate
- Revenue tracking

### 11.2 Alerts
- High failure rate in creation
- Mikrotik sync issues
- Expired voucher cleanup failures

## 12. Migration from v1.0

### 12.1 Data Migration
```sql
-- Update existing vouchers to new format
UPDATE vouchers
SET comment = REPLACE(
  REPLACE(comment, 'VOUCHER_SYSTEM|', 'VOUCHER_SYSTEM|'),
  first_login_timestamp,
  '0'
)
WHERE comment LIKE 'VOUCHER_SYSTEM|%';
```

### 12.2 Feature Migration
- Migrate existing comment format
- Update Mikrotik scripts
- Enable background cleanup
- Update UI components

## 13. Future Enhancements

### 13.1 Planned Features
- QR code generation for vouchers
- Vendor portal for voucher management
- Advanced analytics and reporting
- Voucher templates system

### 13.2 Integration Points
- Payment gateway for voucher purchase
- SMS notification system
- External vendor systems

---
*Version: 2.0.0*
*Last Updated: 2025-01-09*
*Status: Ready for Implementation*