# PPPoE System v2.0 - Spesifikasi Lengkap

## 1. Overview

Sistem PPPoE v2.0 mengelola user PPPoE untuk paket berlangganan mingguan/bulanan dengan automatic numbering system dan profile patterns. Sistem menggunakan Mikrotik PPP secrets management dengan comment metadata untuk tracking.

## 2. Key Features

### 2.1 Core Features
- **Subscription-Based Management**: User PPPoE untuk paket mingguan/bulanan
- **Automatic Numbering**: Sistem penomoran otomatis untuk username
- **Profile Pattern Matching**: Identifikasi profile dengan PPPOE_SYSTEM comment
- **Mikrotik Integration**: Real-time sync dengan RouterOS PPP secrets
- **Comment Metadata**: Tracking lengkap di Mikrotik comments
- **Bulk Operations**: Create, update, delete multiple users
- **Expiry Management**: Automatic disable untuk expired users
- **Grace Period**: Opsional grace period sebelum hard disable

### 2.2 Business Logic
- Username menggunakan format: [prefix]-[sequence]
- Password sama dengan username (default) atau custom
- Profile harus memiliki comment: `PPPOE_SYSTEM`
- Profile sync dari Mikrotik ke local database
- Auto disable saat expired, auto enable saat pembayaran
- Support multiple vendor assignments
- Comment format: `PPPOE_SYSTEM|customer_id|subscription_id|vendor_id|created_date`

## 3. Architecture

### 3.1 Components
```
src/routes/pppoe.js                # PPPoE management routes
src/services/PPPoEService.js      # Core PPPoE logic
src/models/PPPoEUser.js           # PPPoE user model
src/services/PPPoESyncService.js  # Sync dengan Mikrotik
src/lib/PPPoENumberGenerator.js  # Automatic numbering
views/pppoe/                       # PPPoE management UI
  ├── index.ejs                   # PPPoE user list
  ├── create.ejs                  # Create PPPoE user
  ├── bulk-create.ejs             # Bulk creation
  └── profile-sync.ejs            # Profile sync
public/js/pppoe.js                 # Frontend PPPoE logic
```

### 3.2 PPPoE User Data Model
```javascript
// PPPoE User Structure
{
  id: 12345,
  username: "pppoe-001234",
  password: "pppoe-001234",
  name: "John Doe - PPPoE",
  service_type: "pppoe",
  profile_id: 5,
  profile_name: "PPPoE-10MB",
  customer_id: 678,
  subscription_id: 901,
  mikrotik_id: "*5",
  status: "active", // active, expired, disabled
  local_address: "192.168.1.100",
  remote_address: "10.0.0.100",
  uptime: "1d 12h 34m",
  bytes_in: 1073741824,
  bytes_out: 2147483648,
  last_seen: "2025-01-09T15:30:00Z",
  expires_at: "2025-01-16T00:00:00Z",
  created_at: "2025-01-09T10:00:00Z",
  updated_at: "2025-01-09T10:00:00Z",
  mikrotik_comment: "PPPOE_SYSTEM|678|901|VENDOR-001|2025-01-09"
}
```

### 3.3 Database Schema
```sql
-- PPPoE profiles (synced from Mikrotik)
CREATE TABLE pppoe_profiles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL, -- Profile name di Mikrotik
    rate_limit VARCHAR(100),          -- e.g., "10M/10M"
    local_address VARCHAR(50),        -- e.g., "192.168.1.1"
    remote_address VARCHAR(50),       -- e.g., "192.168.1.2-192.168.1.254"
    session_timeout INTEGER,          -- Session timeout in seconds
    idle_timeout INTEGER,             -- Idle timeout in seconds
    only_one VARCHAR(10),             -- 'yes' or 'no'
    mikrotik_id VARCHAR(50),          -- Mikrotik internal ID
    comment TEXT,                     -- Profile comment
    is_active BOOLEAN DEFAULT true,
    last_sync TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PPPoE users
CREATE TABLE pppoe_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(100) NOT NULL,
    name VARCHAR(200),
    customer_id INTEGER REFERENCES customers(id),
    subscription_id INTEGER REFERENCES subscriptions(id),
    profile_id INTEGER REFERENCES pppoe_profiles(id),
    mikrotik_id VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'disabled', 'suspended')),
    local_address INET,
    remote_address INET,
    uptime_seconds INTEGER DEFAULT 0,
    bytes_in BIGINT DEFAULT 0,
    bytes_out BIGINT DEFAULT 0,
    packets_in BIGINT DEFAULT 0,
    packets_out BIGINT DEFAULT 0,
    last_seen TIMESTAMP,
    expires_at TIMESTAMP,
    disabled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    mikrotik_comment TEXT
);

-- PPPoE numbering sequences
CREATE TABLE pppoe_numbering (
    id SERIAL PRIMARY KEY,
    prefix VARCHAR(20) UNIQUE NOT NULL, -- e.g., "pppoe"
    last_sequence INTEGER DEFAULT 0,
    padding_length INTEGER DEFAULT 4,
    description VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PPPoE usage statistics
CREATE TABLE pppoe_usage_logs (
    id SERIAL PRIMARY KEY,
    pppoe_user_id INTEGER REFERENCES pppoe_users(id),
    session_start TIMESTAMP,
    session_end TIMESTAMP,
    duration_seconds INTEGER,
    bytes_in BIGINT,
    bytes_out BIGINT,
    disconnect_reason VARCHAR(50),
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 4. Profile Management

### 4.1 Profile Sync from Mikrotik
```javascript
// src/services/PPPoESyncService.js
class PPPoESyncService {
  static async syncProfiles() {
    try {
      // 1. Get all PPPoE profiles from Mikrotik
      const mikrotikProfiles = await mikrotik.getPPPoEProfiles();

      const syncedProfiles = [];
      const errors = [];

      for (const profile of mikrotikProfiles) {
        try {
          // 2. Check if profile has PPPOE_SYSTEM comment
          const isPPPoEProfile = profile.comment &&
                                profile.comment.includes('PPPOE_SYSTEM');

          if (isPPPoEProfile) {
            // 3. Parse profile data
            const profileData = {
              name: profile.name,
              rate_limit: profile['rate-limit'],
              local_address: profile['local-address'],
              remote_address: profile['remote-address'],
              session_timeout: profile['session-timeout'],
              idle_timeout: profile['idle-timeout'],
              only_one: profile['only-one'],
              mikrotik_id: profile['.id'],
              comment: profile.comment,
              last_sync: new Date()
            };

            // 4. Upsert to local database
            await db.query(`
              INSERT INTO pppoe_profiles
              (name, rate_limit, local_address, remote_address, session_timeout,
               idle_timeout, only_one, mikrotik_id, comment, is_active, last_sync)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10)
              ON CONFLICT (name) DO UPDATE SET
                rate_limit = EXCLUDED.rate_limit,
                local_address = EXCLUDED.local_address,
                remote_address = EXCLUDED.remote_address,
                session_timeout = EXCLUDED.session_timeout,
                idle_timeout = EXCLUDED.idle_timeout,
                only_one = EXCLUDED.only_one,
                mikrotik_id = EXCLUDED.mikrotik_id,
                comment = EXCLUDED.comment,
                last_sync = EXCLUDED.last_sync,
                is_active = true
            `, Object.values(profileData));

            syncedProfiles.push(profileData);
          }
        } catch (error) {
          errors.push({
            profile: profile.name,
            error: error.message
          });
        }
      }

      // 5. Deactivate profiles not found in Mikrotik
      await db.query(`
        UPDATE pppoe_profiles
        SET is_active = false
        WHERE last_sync < $1
      `, [new Date(Date.now() - 5 * 60 * 1000)]); // 5 minutes ago

      return {
        success: true,
        synced: syncedProfiles.length,
        profiles: syncedProfiles,
        errors: errors
      };

    } catch (error) {
      console.error('Profile sync error:', error);
      throw error;
    }
  }

  static async getActiveProfiles() {
    const result = await db.query(`
      SELECT * FROM pppoe_profiles
      WHERE is_active = true
      ORDER BY name
    `);

    return result.rows;
  }
}
```

### 4.2 Profile Configuration
```javascript
// Profile configuration service
class PPPoEProfileService {
  static async createProfileInMikrotik(profileData) {
    try {
      // Create PPPoE profile in Mikrotik
      const command = `/ppp profile add name="${profileData.name}"`;

      if (profileData.rateLimit) {
        command += ` rate-limit="${profileData.rateLimit}"`;
      }
      if (profileData.localAddress) {
        command += ` local-address="${profileData.localAddress}"`;
      }
      if (profileData.remoteAddress) {
        command += ` remote-address="${profileData.remoteAddress}"`;
      }

      // Add PPPOE_SYSTEM comment
      command += ` comment="PPPOE_SYSTEM|${profileData.description || ''}|${new Date().toISOString().split('T')[0]}"`;

      const result = await mikrotik.executeCommand(command);

      // Sync back to database
      await this.syncProfiles();

      return { success: true, mikrotikId: result['.id'] };

    } catch (error) {
      console.error('Error creating profile:', error);
      throw error;
    }
  }

  static async deleteProfileFromMikrotik(profileName) {
    try {
      // Check if profile has active users
      const activeUsers = await db.query(`
        SELECT COUNT(*) as count
        FROM pppoe_users pu
        JOIN pppoe_profiles pp ON pu.profile_id = pp.id
        WHERE pp.name = ? AND pu.status = 'active'
      `, [profileName]);

      if (parseInt(activeUsers.rows[0].count) > 0) {
        throw new Error('Cannot delete profile with active users');
      }

      // Delete from Mikrotik
      await mikrotik.executeCommand(`/ppp profile remove [find name="${profileName}"]`);

      // Update local database
      await db.query(
        'UPDATE pppoe_profiles SET is_active = false WHERE name = ?',
        [profileName]
      );

      return { success: true };

    } catch (error) {
      console.error('Error deleting profile:', error);
      throw error;
    }
  }
}
```

## 5. PPPoE User Management

### 5.1 Automatic Numbering System
```javascript
// src/lib/PPPoENumberGenerator.js
class PPPoENumberGenerator {
  static async generateUsername(prefix = 'pppoe') {
    try {
      // 1. Get or create numbering sequence
      let numbering = await db.query(
        'SELECT * FROM pppoe_numbering WHERE prefix = ?',
        [prefix]
      );

      if (numbering.rows.length === 0) {
        // Create new numbering sequence
        await db.query(`
          INSERT INTO pppoe_numbering (prefix, last_sequence, padding_length, description)
          VALUES (?, 0, 4, ?)
        `, [prefix, `Auto numbering for ${prefix}`]);

        numbering = await db.query(
          'SELECT * FROM pppoe_numbering WHERE prefix = ?',
          [prefix]
        );
      }

      // 2. Get next sequence number
      const nextSequence = numbering.rows[0].last_sequence + 1;
      const paddingLength = numbering.rows[0].padding_length;

      // 3. Format username
      const username = `${prefix}-${nextSequence.toString().padStart(paddingLength, '0')}`;

      // 4. Check for uniqueness in both local and Mikrotik
      const existsLocal = await db.query(
        'SELECT id FROM pppoe_users WHERE username = ?',
        [username]
      );

      if (existsLocal.rows.length > 0) {
        // Increment and retry
        await db.query(
          'UPDATE pppoe_numbering SET last_sequence = last_sequence + 1 WHERE prefix = ?',
          [prefix]
        );
        return this.generateUsername(prefix); // Recursive call
      }

      // Check in Mikrotik
      const existsMikrotik = await mikrotik.getPPPoESecret(username);
      if (existsMikrotik) {
        // Increment and retry
        await db.query(
          'UPDATE pppoe_numbering SET last_sequence = last_sequence + 1 WHERE prefix = ?',
          [prefix]
        );
        return this.generateUsername(prefix); // Recursive call
      }

      // 5. Update sequence
      await db.query(
        'UPDATE pppoe_numbering SET last_sequence = ?, updated_at = NOW() WHERE prefix = ?',
        [nextSequence, prefix]
      );

      return username;

    } catch (error) {
      console.error('Error generating username:', error);
      throw error;
    }
  }

  static async reserveUsername(username) {
    // Reserve a specific username (for manual assignment)
    const prefix = username.split('-')[0];
    const sequence = parseInt(username.split('-')[1]);

    await db.query(`
      INSERT INTO pppoe_numbering (prefix, last_sequence, padding_length)
      VALUES (?, ?, 4)
      ON CONFLICT (prefix) DO UPDATE SET
        last_sequence = GREATEST(pppoe_numbering.last_sequence, ?),
        updated_at = NOW()
    `, [prefix, sequence]);
  }
}
```

### 5.2 PPPoE User Creation
```javascript
// src/services/PPPoEService.js
class PPPoEService {
  static async createPPPoEUser(data) {
    const transaction = await db.beginTransaction();

    try {
      // 1. Generate username if not provided
      const username = data.username ||
                     await PPPoENumberGenerator.generateUsername(data.prefix || 'pppoe');

      // 2. Validate data
      if (!data.profile_id) {
        throw new Error('Profile is required');
      }

      if (!data.customer_id && !data.skipCustomer) {
        throw new Error('Customer is required');
      }

      // 3. Get profile details
      const profile = await transaction.query(
        'SELECT * FROM pppoe_profiles WHERE id = ? AND is_active = true',
        [data.profile_id]
      );

      if (!profile.rows.length) {
        throw new Error('Profile not found or inactive');
      }

      // 4. Build Mikrotik comment
      const comment = this.buildComment({
        system: 'PPPOE_SYSTEM',
        customer_id: data.customer_id,
        subscription_id: data.subscription_id,
        vendor_id: data.vendor_id,
        created_date: new Date().toISOString().split('T')[0],
        created_by: data.created_by
      });

      // 5. Create in Mikrotik
      const mikrotikSecret = await mikrotik.addPPPoESecret({
        name: username,
        password: data.password || username,
        profile: profile.rows[0].name,
        service: 'pppoe',
        comment: comment,
        'caller-id': data.callerId || '',
        disabled: 'no'
      });

      // 6. Create in local database
      const result = await transaction.query(`
        INSERT INTO pppoe_users
        (username, password, name, customer_id, subscription_id, profile_id,
         mikrotik_id, status, expires_at, mikrotik_comment)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        username,
        data.password || username,
        data.name || username,
        data.customer_id || null,
        data.subscription_id || null,
        data.profile_id,
        mikrotikSecret['.id'],
        data.status || 'active',
        data.expires_at || null,
        comment
      ]);

      const pppoeUser = result.rows[0];

      // 7. Log activity
      await this.logActivity({
        pppoe_user_id: pppoeUser.id,
        action: 'created',
        details: {
          username: username,
          profile: profile.rows[0].name,
          customer_id: data.customer_id
        },
        admin_id: data.created_by
      });

      await transaction.commit();

      return {
        success: true,
        user: await this.getPPPoEUserById(pppoeUser.id)
      };

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static buildComment(data) {
    // Build comment pattern: PPPOE_SYSTEM|customer_id|subscription_id|vendor_id|created_date
    const parts = [
      'PPPOE_SYSTEM',
      data.customer_id || 'NULL',
      data.subscription_id || 'NULL',
      data.vendor_id || 'NULL',
      data.created_date
    ];

    return parts.join('|');
  }

  static parseComment(comment) {
    // Parse comment back to object
    const parts = comment.split('|');

    return {
      system: parts[0],
      customer_id: parts[1] === 'NULL' ? null : parts[1],
      subscription_id: parts[2] === 'NULL' ? null : parts[2],
      vendor_id: parts[3] === 'NULL' ? null : parts[3],
      created_date: parts[4]
    };
  }
}
```

### 5.3 Bulk User Creation
```javascript
// Bulk PPPoE user creation
class PPPoEBulkService {
  static async createBulkUsers(data) {
    const transaction = await db.beginTransaction();
    const createdUsers = [];
    const errors = [];

    try {
      for (let i = 0; i < data.quantity; i++) {
        try {
          const userData = {
            ...data,
            username: null, // Generate automatically
            name: data.name_pattern.replace('{n}', i + 1)
          };

          const user = await this.createPPPoEUser(userData);
          createdUsers.push(user.user);

        } catch (error) {
          errors.push({
            sequence: i + 1,
            error: error.message
          });
        }
      }

      await transaction.commit();

      return {
        success: true,
        created: createdUsers.length,
        users: createdUsers,
        errors: errors,
        total_requested: data.quantity
      };

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}
```

## 6. User Monitoring & Status Management

### 6.1 Real-time Monitoring
```javascript
// src/services/PPPoEMonitorService.js
class PPPoEMonitorService {
  static async monitorActiveUsers() {
    try {
      // 1. Get all active PPPoE users from Mikrotik
      const activeUsers = await mikrotik.getPPPoEActive();

      const updates = [];
      const newUsers = [];

      for (const mikrotikUser of activeUsers) {
        // 2. Find matching user in database
        const localUser = await db.query(
          'SELECT * FROM pppoe_users WHERE username = ?',
          [mikrotikUser.name]
        );

        if (localUser.rows.length > 0) {
          const user = localUser.rows[0];

          // 3. Update user statistics
          const updates = await db.query(`
            UPDATE pppoe_users
            SET
              local_address = $1,
              remote_address = $2,
              uptime_seconds = $3,
              bytes_in = $4,
              bytes_out = $5,
              packets_in = $6,
              packets_out = $7,
              last_seen = NOW(),
              updated_at = NOW()
            WHERE id = $8
          `, [
            mikrotikUser['address'],
            mikrotikUser['remote-address'],
            this.parseUptime(mikrotikUser.uptime),
            parseInt(mikrotikUser['bytes-in']),
            parseInt(mikrotikUser['bytes-out']),
            parseInt(mikrotikUser['packets-in']),
            parseInt(mikrotikUser['packets-out']),
            user.id
          ]);

          // 4. Check if user should be active
          if (user.status === 'disabled' || user.status === 'expired') {
            // User is online but should be disabled
            await this.disableUserInMikrotik(user.username);
          }

        } else {
          // New user found in Mikrotik but not in database
          newUsers.push({
            username: mikrotikUser.name,
            address: mikrotikUser.address,
            uptime: mikrotikUser.uptime
          });
        }
      }

      // 5. Check for expired users that are still online
      await this.checkExpiredUsers();

      return {
        success: true,
        active_count: activeUsers.length,
        updates: updates.length,
        new_users: newUsers
      };

    } catch (error) {
      console.error('Monitor error:', error);
      throw error;
    }
  }

  static async checkExpiredUsers() {
    // Find users that are expired but still active
    const expiredUsers = await db.query(`
      SELECT * FROM pppoe_users
      WHERE status = 'active'
      AND expires_at < NOW()
    `);

    for (const user of expiredUsers.rows) {
      // Disable in Mikrotik
      await this.disableUserInMikrotik(user.username);

      // Update status
      await db.query(
        'UPDATE pppoe_users SET status = "expired", disabled_at = NOW() WHERE id = ?',
        [user.id]
      );

      // Log activity
      await this.logActivity({
        pppoe_user_id: user.id,
        action: 'auto_disabled',
        details: { reason: 'expired' }
      });
    }
  }

  static async disableUserInMikrotik(username) {
    try {
      await mikrotik.executeCommand(
        `/ppp secret disable [find name="${username}"]`
      );
      return true;
    } catch (error) {
      console.error('Error disabling user:', error);
      return false;
    }
  }

  static async enableUserInMikrotik(username) {
    try {
      await mikrotik.executeCommand(
        `/ppp secret enable [find name="${username}"]`
      );
      return true;
    } catch (error) {
      console.error('Error enabling user:', error);
      return false;
    }
  }

  static parseUptime(uptimeString) {
    // Parse Mikrotik uptime format (e.g., "1d12h34m") to seconds
    const days = uptimeString.match(/(\d+)d/);
    const hours = uptimeString.match(/(\d+)h/);
    const minutes = uptimeString.match(/(\d+)m/);
    const seconds = uptimeString.match(/(\d+)s/);

    let total = 0;
    if (days) total += parseInt(days[1]) * 86400;
    if (hours) total += parseInt(hours[1]) * 3600;
    if (minutes) total += parseInt(minutes[1]) * 60;
    if (seconds) total += parseInt(seconds[1]);

    return total;
  }
}
```

### 6.2 Usage Statistics
```javascript
// Usage tracking service
class PPPoEUsageService {
  static async recordUsageSession(userId, sessionData) {
    try {
      // Record session start
      if (sessionData.type === 'start') {
        await db.query(`
          INSERT INTO pppoe_usage_logs
          (pppoe_user_id, session_start, session_end, duration_seconds,
           bytes_in, bytes_out, disconnect_reason, recorded_at)
          VALUES ($1, $2, NULL, NULL, NULL, NULL, NULL, NOW())
        `, [userId, sessionData.timestamp]);
      }
      // Record session end
      else if (sessionData.type === 'end') {
        // Find the open session
        const openSession = await db.query(`
          SELECT id, session_start FROM pppoe_usage_logs
          WHERE pppoe_user_id = $1 AND session_end IS NULL
          ORDER BY session_start DESC LIMIT 1
        `, [userId]);

        if (openSession.rows.length > 0) {
          const startTime = new Date(openSession.rows[0].session_start);
          const endTime = new Date(sessionData.timestamp);
          const duration = Math.floor((endTime - startTime) / 1000);

          await db.query(`
            UPDATE pppoe_usage_logs
            SET
              session_end = $1,
              duration_seconds = $2,
              bytes_in = $3,
              bytes_out = $4,
              disconnect_reason = $5
            WHERE id = $6
          `, [
            sessionData.timestamp,
            duration,
            sessionData.bytes_in || 0,
            sessionData.bytes_out || 0,
            sessionData.disconnect_reason || 'unknown',
            openSession.rows[0].id
          ]);
        }
      }

      return { success: true };

    } catch (error) {
      console.error('Error recording usage:', error);
      throw error;
    }
  }

  static async getUsageStats(userId, period = '30d') {
    let dateFilter;
    const now = new Date();

    switch (period) {
      case '7d':
        dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        dateFilter = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const stats = await db.query(`
      SELECT
        COUNT(*) as total_sessions,
        SUM(duration_seconds) as total_uptime,
        SUM(bytes_in) as total_download,
        SUM(bytes_out) as total_upload,
        SUM(bytes_in + bytes_out) as total_traffic,
        AVG(duration_seconds) as avg_session_duration
      FROM pppoe_usage_logs
      WHERE pppoe_user_id = $1
      AND session_start >= $2
    `, [userId, dateFilter]);

    return stats.rows[0];
  }
}
```

## 7. API Endpoints

### 7.1 PPPoE Management Endpoints
```javascript
// User management
POST   /api/pppoe/users               // Create PPPoE user
POST   /api/pppoe/users/bulk          // Bulk create users
GET    /api/pppoe/users               // List PPPoE users
GET    /api/pppoe/users/:id           // Get user details
PUT    /api/pppoe/users/:id           // Update user
DELETE /api/pppoe/users/:id           // Delete user
POST   /api/pppoe/users/:id/enable    // Enable user
POST   /api/pppoe/users/:id/disable   // Disable user
POST   /api/pppoe/users/:id/reset     // Reset password

// Profile management
GET    /api/pppoe/profiles            // List profiles
POST   /api/pppoe/profiles/sync       // Sync profiles from Mikrotik
POST   /api/pppoe/profiles            // Create profile
PUT    /api/pppoe/profiles/:id        // Update profile
DELETE /api/pppoe/profiles/:id        // Delete profile

// Monitoring
GET    /api/pppoe/active              // Get active users
GET    /api/pppoe/users/:id/usage     // Get usage statistics
GET    /api/pppoe/monitor/status      // Get monitoring status
POST   /api/pppoe/monitor/refresh     // Refresh monitoring data

// Numbering
GET    /api/pppoe/numbering           // Get numbering sequences
POST   /api/pppoe/numbering           // Create numbering rule
PUT    /api/pppoe/numbering/:prefix   // Update numbering rule
DELETE /api/pppoe/numbering/:prefix   // Delete numbering rule

// Import/Export
POST   /api/pppoe/import              // Import users
GET    /api/pppoe/export              // Export users
```

### 7.2 Request/Response Examples
```javascript
// Create PPPoE user
POST /api/pppoe/users
{
  "username": null, // Auto-generate
  "password": null, // Same as username
  "name": "John Doe - PPPoE",
  "customer_id": 12345,
  "subscription_id": 67890,
  "profile_id": 5,
  "expires_at": "2025-02-09T00:00:00Z",
  "prefix": "pppoe",
  "created_by": "admin"
}

// Response
{
  "success": true,
  "user": {
    "id": 123,
    "username": "pppoe-0156",
    "password": "pppoe-0156",
    "name": "John Doe - PPPoE",
    "status": "active",
    "profile_name": "PPPoE-10MB",
    "customer_name": "John Doe",
    "expires_at": "2025-02-09T00:00:00Z"
  }
}

// Bulk create
POST /api/pppoe/users/bulk
{
  "quantity": 10,
  "profile_id": 5,
  "customer_id": 12345,
  "prefix": "pppoe",
  "name_pattern": "Customer-{n}",
  "expires_at": "2025-02-09T00:00:00Z"
}

// Get active users
GET /api/pppoe/active

// Response
{
  "users": [
    {
      "username": "pppoe-0156",
      "address": "192.168.1.100",
      "uptime": "1d 12h 34m",
      "bytes_in": 1073741824,
      "bytes_out": 2147483648,
      "connected_since": "2025-01-08T10:00:00Z"
    }
  ],
  "total": 1
}
```

## 8. Frontend Implementation

### 8.1 PPPoE User List UI
```html
<!-- views/pppoe/index.ejs -->
<div class="container-fluid">
  <!-- Quick Stats -->
  <div class="row mb-4">
    <div class="col-md-3">
      <div class="card bg-primary text-white">
        <div class="card-body">
          <h5 class="card-title">Total Users</h5>
          <h2 id="totalUsers">-</h2>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card bg-success text-white">
        <div class="card-body">
          <h5 class="card-title">Active Now</h5>
          <h2 id="activeUsers">-</h2>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card bg-warning text-white">
        <div class="card-body">
          <h5 class="card-title">Expired</h5>
          <h2 id="expiredUsers">-</h2>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card bg-info text-white">
        <div class="card-body">
          <h5 class="card-title">Total Traffic</h5>
          <h2 id="totalTraffic">-</h2>
        </div>
      </div>
    </div>
  </div>

  <!-- User Table -->
  <div class="card">
    <div class="card-header d-flex justify-content-between align-items-center">
      <h5 class="mb-0">PPPoE Users</h5>
      <div>
        <button class="btn btn-success btn-sm" data-bs-toggle="modal" data-bs-target="#createUserModal">
          <i class="fas fa-plus"></i> New User
        </button>
        <button class="btn btn-primary btn-sm" data-bs-toggle="modal" data-bs-target="#bulkCreateModal">
          <i class="fas fa-users"></i> Bulk Create
        </button>
        <button class="btn btn-info btn-sm" onclick="refreshActiveUsers()">
          <i class="fas fa-sync"></i> Refresh
        </button>
      </div>
    </div>
    <div class="card-body">
      <div class="table-responsive">
        <table class="table table-hover">
          <thead>
            <tr>
              <th>Status</th>
              <th>Username</th>
              <th>Name</th>
              <th>Customer</th>
              <th>Profile</th>
              <th>IP Address</th>
              <th>Uptime</th>
              <th>Usage</th>
              <th>Expires</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="pppoeUserTable">
            <!-- Data loaded dynamically -->
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<!-- Real-time Status Indicator -->
<div class="position-fixed bottom-0 end-0 p-3">
  <div id="connectionStatus" class="alert alert-success mb-0" style="display: none;">
    <i class="fas fa-circle"></i> Connected to Mikrotik
  </div>
</div>
```

### 8.2 Frontend JavaScript
```javascript
// public/js/pppoe.js
class PPPoEManager {
  static init() {
    this.loadUsers();
    this.startRealTimeUpdates();
  }

  static async loadUsers() {
    try {
      const users = await this.apiCall('/api/pppoe/users');
      this.renderUserTable(users);
      this.updateStats(users);
    } catch (error) {
      console.error('Error loading users:', error);
      this.showAlert('Error loading PPPoE users', 'danger');
    }
  }

  static renderUserTable(users) {
    const tbody = document.getElementById('pppoeUserTable');

    tbody.innerHTML = users.map(user => `
      <tr>
        <td>
          <span class="badge bg-${this.getStatusColor(user.status)}">
            ${user.status}
          </span>
        </td>
        <td>
          <div class="d-flex align-items-center">
            <div class="me-2">
              ${user.last_seen ? '<i class="fas fa-circle text-success"></i>' : '<i class="fas fa-circle text-secondary"></i>'}
            </div>
            <span class="font-monospace">${user.username}</span>
          </div>
        </td>
        <td>${user.name || '-'}</td>
        <td>${user.customer_name || '-'}</td>
        <td>${user.profile_name}</td>
        <td>${user.local_address || '-'}</td>
        <td>${this.formatUptime(user.uptime_seconds)}</td>
        <td>${this.formatBytes(user.bytes_in + user.bytes_out)}</td>
        <td>
          <small class="${user.expires_at && new Date(user.expires_at) < new Date() ? 'text-danger' : ''}">
            ${user.expires_at ? this.formatDate(user.expires_at) : 'Never'}
          </small>
        </td>
        <td>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" onclick="viewUserDetails(${user.id})">
              <i class="fas fa-eye"></i>
            </button>
            <button class="btn btn-outline-${user.status === 'active' ? 'warning' : 'success'}"
                    onclick="toggleUserStatus(${user.id}, '${user.status}')">
              <i class="fas fa-${user.status === 'active' ? 'pause' : 'play'}"></i>
            </button>
            <button class="btn btn-outline-info" onclick="viewUsage(${user.id})">
              <i class="fas fa-chart-line"></i>
            </button>
            <button class="btn btn-outline-danger" onclick="deleteUser(${user.id})">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  static async toggleUserStatus(userId, currentStatus) {
    try {
      const action = currentStatus === 'active' ? 'disable' : 'enable';
      const url = `/api/pppoe/users/${userId}/${action}`;

      await this.apiCall(url, { method: 'POST' });

      this.showAlert(`User ${action}d successfully`, 'success');
      this.loadUsers(); // Reload data

    } catch (error) {
      console.error('Error toggling status:', error);
      this.showAlert('Error updating user status', 'danger');
    }
  }

  static startRealTimeUpdates() {
    // Update active users every 30 seconds
    setInterval(() => {
      this.loadActiveUsers();
    }, 30000);

    // Show connection status
    this.showConnectionStatus();
  }

  static async loadActiveUsers() {
    try {
      const response = await this.apiCall('/api/pppoe/active');

      // Update active count
      document.getElementById('activeUsers').textContent = response.total;

      // Update online indicators
      response.users.forEach(activeUser => {
        const rows = document.querySelectorAll(`#pppoeUserTable tr`);
        rows.forEach(row => {
          if (row.textContent.includes(activeUser.username)) {
            const indicator = row.querySelector('.fa-circle');
            if (indicator) {
              indicator.className = 'fas fa-circle text-success';
            }
          }
        });
      });

    } catch (error) {
      console.error('Error loading active users:', error);
    }
  }

  static formatUptime(seconds) {
    if (!seconds) return '-';

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  static formatBytes(bytes) {
    if (!bytes) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  PPPoEManager.init();
});
```

## 9. Scheduled Tasks

### 9.1 Automated Tasks
```javascript
// src/services/PPPoEScheduler.js
class PPPoEScheduler {
  static async runScheduledTasks() {
    console.log('Running PPPoE scheduled tasks...');

    try {
      // 1. Monitor active users
      await PPPoEMonitorService.monitorActiveUsers();

      // 2. Check for expired users
      await PPPoEMonitorService.checkExpiredUsers();

      // 3. Sync profiles from Mikrotik
      if (this.shouldSyncProfiles()) {
        await PPPoESyncService.syncProfiles();
      }

      // 4. Generate usage reports
      await this.generateDailyUsageReport();

      // 5. Cleanup old usage logs
      await this.cleanupOldLogs();

      console.log('PPPoE scheduled tasks completed');

    } catch (error) {
      console.error('Error in scheduled tasks:', error);
    }
  }

  static shouldSyncProfiles() {
    // Check if last sync was more than 1 hour ago
    const lastSync = settings.get('last_profile_sync');
    if (!lastSync) return true;

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return new Date(lastSync) < oneHourAgo;
  }

  static async generateDailyUsageReport() {
    // Generate daily usage statistics
    const today = new Date().toISOString().split('T')[0];

    const stats = await db.query(`
      SELECT
        COUNT(DISTINCT pu.id) as active_users,
        SUM(pu.bytes_in + pu.bytes_out) as total_traffic,
        AVG(pu.uptime_seconds) as avg_uptime
      FROM pppoe_users pu
      WHERE pu.last_seen >= CURRENT_DATE
    `);

    await db.query(`
      INSERT INTO daily_reports
      (report_date, report_type, data)
      VALUES ($1, 'pppoe_usage', $2)
      ON CONFLICT (report_date, report_type) DO UPDATE SET
        data = EXCLUDED.data,
        updated_at = NOW()
    `, [today, JSON.stringify(stats.rows[0])]);
  }

  static async cleanupOldLogs() {
    // Delete usage logs older than 90 days
    const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const result = await db.query(
      'DELETE FROM pppoe_usage_logs WHERE recorded_at < $1',
      [cutoffDate]
    );

    console.log(`Cleaned up ${result.rowCount} old usage logs`);
  }
}
```

## 10. Error Handling & Recovery

### 10.1 Common Error Scenarios
```javascript
// Error handling service
class PPPoEErrorService {
  static async handleMikrotikConnectionError(error) {
    console.error('Mikrotik connection error:', error);

    // Log error
    await db.query(`
      INSERT INTO system_errors
      (component, error_type, error_message, timestamp)
      VALUES ('pppoe_service', 'mikrotik_connection', $1, NOW())
    `, [error.message]);

    // Try to reconnect
    setTimeout(async () => {
      try {
        await mikrotik.reconnect();
        console.log('Reconnected to Mikrotik');
      } catch (reconnectError) {
        console.error('Failed to reconnect:', reconnectError);
      }
    }, 5000); // Retry after 5 seconds
  }

  static async handleUserCreationError(username, error) {
    console.error(`Error creating user ${username}:`, error);

    // Check if username already exists
    if (error.message.includes('already exists')) {
      // Generate new username
      const newUsername = await PPPoENumberGenerator.generateUsername(
        username.split('-')[0]
      );

      return {
        error: 'Username conflict',
        suggestion: newUsername,
        retryable: true
      };
    }

    return {
      error: error.message,
      retryable: false
    };
  }

  static async syncOrphanedUsers() {
    // Find users in Mikrotik but not in database
    const mikrotikUsers = await mikrotik.getPPPoESecrets();

    for (const user of mikrotikUsers) {
      const localUser = await db.query(
        'SELECT id FROM pppoe_users WHERE username = ?',
        [user.name]
      );

      if (localUser.rows.length === 0 && user.comment.includes('PPPOE_SYSTEM')) {
        // Orphaned user found - try to recover
        const commentData = PPPoEService.parseComment(user.comment);

        await db.query(`
          INSERT INTO pppoe_users
          (username, password, profile_id, mikrotik_id, status, mikrotik_comment)
          VALUES ($1, $2, NULL, $3, 'orphaned', $4)
        `, [
          user.name,
          user.password,
          user['.id'],
          user.comment
        ]);

        console.log(`Recovered orphaned user: ${user.name}`);
      }
    }
  }
}
```

## 11. Performance Optimizations

### 11.1 Database Optimizations
```sql
-- Indexes for better performance
CREATE INDEX idx_pppoe_users_username ON pppoe_users(username);
CREATE INDEX idx_pppoe_users_status ON pppoe_users(status);
CREATE INDEX idx_pppoe_users_customer_id ON pppoe_users(customer_id);
CREATE INDEX idx_pppoe_users_expires_at ON pppoe_users(expires_at);
CREATE INDEX idx_pppoe_users_last_seen ON pppoe_users(last_seen);

-- Partition usage logs by month (for large datasets)
CREATE TABLE pppoe_usage_logs_y2025m01 PARTITION OF pppoe_usage_logs
FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

### 11.2 Caching Strategy
```javascript
// Cache service for PPPoE data
class PPPoECacheService {
  static cache = new Map();

  static async getActiveUsers() {
    const cacheKey = 'active_pppoe_users';
    const cached = this.cache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < 30000) { // 30 seconds
      return cached.data;
    }

    // Fresh data
    const data = await PPPoEMonitorService.monitorActiveUsers();
    this.cache.set(cacheKey, {
      data: data,
      timestamp: Date.now()
    });

    return data;
  }

  static async getProfileList() {
    const cacheKey = 'pppoe_profiles';
    const cached = this.cache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < 300000) { // 5 minutes
      return cached.data;
    }

    const data = await PPPoESyncService.getActiveProfiles();
    this.cache.set(cacheKey, {
      data: data,
      timestamp: Date.now()
    });

    return data;
  }

  static clearCache(pattern) {
    if (pattern) {
      // Clear specific pattern
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      // Clear all
      this.cache.clear();
    }
  }
}
```

## 12. Testing Strategy

### 12.1 Unit Tests
```javascript
// PPPoE service tests
describe('PPPoEService', () => {
  test('Should generate unique username', async () => {
    const username1 = await PPPoENumberGenerator.generateUsername('pppoe');
    const username2 = await PPPoENumberGenerator.generateUsername('pppoe');

    expect(username1).not.toBe(username2);
    expect(username1).toMatch(/^pppoe-\d{4}$/);
  });

  test('Should create PPPoE user with valid data', async () => {
    const userData = {
      profile_id: 1,
      customer_id: 123,
      prefix: 'pppoe',
      created_by: 'test-admin'
    };

    const result = await PPPoEService.createPPPoEUser(userData);

    expect(result.success).toBe(true);
    expect(result.user.username).toMatch(/^pppoe-\d{4}$/);
    expect(result.user.status).toBe('active');
  });

  test('Should build comment correctly', () => {
    const comment = PPPoEService.buildComment({
      system: 'PPPOE_SYSTEM',
      customer_id: 123,
      subscription_id: 456,
      vendor_id: 'VENDOR-001',
      created_date: '2025-01-09'
    });

    expect(comment).toBe('PPPOE_SYSTEM|123|456|VENDOR-001|2025-01-09');
  });
});
```

## 13. Best Practices & Guidelines

### 13.1 PPPoE Best Practices
1. **Username Consistency**: Use consistent prefix for easy identification
2. **Profile Management**: Always mark PPPoE profiles with PPPOE_SYSTEM comment
3. **Comment Standards**: Use consistent comment format for tracking
4. **Monitoring**: Regular monitoring of active users and expired users
5. **Backup Strategy**: Regular backup of PPPoE user database
6. **Sync Verification**: Verify database sync with Mikrotik periodically

### 13.2 Common Issues & Solutions
1. **Username Conflicts**: Implement proper collision detection
2. **Stale Sessions**: Monitor and clean up orphaned sessions
3. **Profile Mismatch**: Ensure profiles exist before creating users
4. **Connection Issues**: Implement reconnection logic
5. **Performance Issues**: Use caching and proper indexing

---

*Version: 2.0.0*
*Last Updated: 2025-01-09*
*Status: Ready for Implementation*