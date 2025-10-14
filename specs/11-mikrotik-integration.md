# Mikrotik Integration v2.0 - Monitoring Approach

## 1. Overview

Sistem integrasi Mikrotik v2.0 menggunakan RouterOS API untuk manajemen user hotspot dan PPPoE dengan pendekatan user list monitoring. Sistem tidak menggunakan profile script, melainkan monitoring berkala melalui API calls.

## 2. Key Features

### 2.1 Core Features
- **RouterOS API Integration**: Menggunakan API Mikrotik untuk user management
- **User List Monitoring**: Monitoring aktif setiap 30 detik
- **Profile Pattern Matching**: Identifikasi user berdasarkan pattern nama profile
- **Real-time Sync**: Sinkronisasi data dua arah antara database dan Mikrotik
- **Comment Metadata**: Penyimpanan metadata di comment field Mikrotik
- **Connection Pooling**: Optimasi koneksi dengan connection pool
- **Auto-Reconnection**: Automatic reconnect dengan exponential backoff

### 2.2 Business Logic
- Tidak ada profile script injection
- Mengandalkan user list polling untuk deteksi aktivitas
- Profile pattern: `*voucher*` untuk hotspot, `*pppoe*` untuk PPPoE
- Comment format pipe-separated untuk metadata
- Monitoring session aktif dan tracking penggunaan

## 3. Architecture

### 3.1 Components
```
src/services/MikrotikClient.js       # Core Mikrotik API client
src/services/MikrotikMonitor.js      # User list monitoring
src/services/MikrotikSync.js         # Data synchronization
src/lib/RouterOSAPI.js              # RouterOS API wrapper
src/lib/ConnectionPool.js            # Connection pool manager
src/middleware/mikrotik.js          # Mikrotik middleware
config/mikrotik.js                  # Mikrotik configuration
```

### 3.2 Connection Management
```
┌─────────────────────────────────────────────────────────────┐
│                Mikrotik Connection Pool                    │
├─────────────────┬─────────────────┬─────────────────────────┤
│                 │                 │                         │
│   Connection 1  │   Connection 2  │    Connection N         │
│   (Active)      │   (Standby)     │    (Standby)            │
│                 │                 │                         │
│ - User Queries  │ - Ready to use  │ - Ready to use          │
│ - User Actions  │ - Auto failover │ - Auto failover         │
│ - API Calls     │ - Load balance  │ - Load balance          │
└─────────────────┴─────────────────┴─────────────────────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │   RouterOS      │
                 │   Device(s)     │
                 └─────────────────┘
```

## 4. API Client Implementation

### 4.1 MikrotikClient Class
```javascript
const RouterOSAPI = require('../lib/RouterOSAPI');

class MikrotikClient {
  constructor(config) {
    this.config = {
      host: config.host,
      port: config.port || 8728,
      username: config.username,
      password: config.password,
      timeout: config.timeout || 30000,
      maxConnections: config.maxConnections || 5,
      useSSL: config.useSSL || false
    };

    this.connectionPool = new ConnectionPool(this.config);
    this.deviceInfo = null;
    this.version = null;
  }

  async connect() {
    try {
      const connection = await this.connectionPool.getConnection();

      // Get device info
      this.deviceInfo = await this.executeCommand('/system/resource/print');
      this.version = await this.executeCommand('/system/package/print', {
        '?name': 'routeros'
      });

      console.log(`Connected to Mikrotik ${this.deviceInfo[0]['board-name']} v${this.version[0]['version']}`);

      this.connectionPool.releaseConnection(connection);
      return true;
    } catch (error) {
      console.error('Failed to connect to Mikrotik:', error);
      throw error;
    }
  }

  async executeCommand(command, params = {}) {
    const connection = await this.connectionPool.getConnection();

    try {
      const api = new RouterOSAPI(connection);
      const result = await api.write(command, params);

      this.connectionPool.releaseConnection(connection);
      return result;
    } catch (error) {
      this.connectionPool.releaseConnection(connection);
      throw error;
    }
  }

  // User Management Methods
  async getHotspotUsers(filter = {}) {
    const params = {};
    if (filter.profile) params['?profile'] = filter.profile;
    if (filter.name) params['?name'] = filter.name;

    return await this.executeCommand('/ip/hotspot/user/print', params);
  }

  async getHotspotActiveUsers() {
    return await this.executeCommand('/ip/hotspot/active/print');
  }

  async getPPPoESecrets(filter = {}) {
    const params = {};
    if (filter.profile) params['?profile'] = filter.profile;
    if (filter.name) params['?name'] = filter.name;

    return await this.executeCommand('/ppp/secret/print', params);
  }

  async getPPPoEActive() {
    return await this.executeCommand('/ppp/active/print');
  }

  async addHotspotUser(userData) {
    const params = {
      name: userData.name,
      password: userData.password,
      profile: userData.profile,
      comment: userData.comment || ''
    };

    return await this.executeCommand('/ip/hotspot/user/add', params);
  }

  async removeHotspotUser(username) {
    const params = {
      '.id': await this.getUserId(username, 'hotspot')
    };

    return await this.executeCommand('/ip/hotspot/user/remove', params);
  }

  async addPPPoESecret(secretData) {
    const params = {
      name: secretData.name,
      password: secretData.password,
      profile: secretData.profile,
      service: secretData.service || 'pppoe',
      comment: secretData.comment || ''
    };

    return await this.executeCommand('/ppp/secret/add', params);
  }

  async disablePPPoESecret(username) {
    const id = await this.getUserId(username, 'pppoe');
    return await this.executeCommand('/ppp/secret/disable', { '.id': id });
  }

  async enablePPPoESecret(username) {
    const id = await this.getUserId(username, 'pppoe');
    return await this.executeCommand('/ppp/secret/enable', { '.id': id });
  }

  async getUserId(username, type) {
    let command, params;

    if (type === 'hotspot') {
      command = '/ip/hotspot/user/print';
      params = { '?name': username };
    } else if (type === 'pppoe') {
      command = '/ppp/secret/print';
      params = { '?name': username };
    }

    const result = await this.executeCommand(command, params);
    return result[0]['.id'];
  }

  async updateUserComment(username, type, comment) {
    const id = await this.getUserId(username, type);
    const command = type === 'hotspot'
      ? '/ip/hotspot/user/set'
      : '/ppp/secret/set';

    return await this.executeCommand(command, {
      '.id': id,
      comment: comment
    });
  }
}
```

### 4.2 Connection Pool Implementation
```javascript
class ConnectionPool {
  constructor(config) {
    this.config = config;
    this.connections = [];
    this.activeConnections = new Set();
    this.maxConnections = config.maxConnections || 5;
    this.createConnectionPromise = null;
  }

  async getConnection() {
    // Check for available connection
    if (this.connections.length > 0) {
      const conn = this.connections.pop();
      this.activeConnections.add(conn);

      // Test if connection is still alive
      if (await this.testConnection(conn)) {
        return conn;
      } else {
        // Connection is dead, create new one
        return await this.createConnection();
      }
    }

    // Create new connection if under limit
    if (this.activeConnections.size < this.maxConnections) {
      const conn = await this.createConnection();
      this.activeConnections.add(conn);
      return conn;
    }

    // Wait for available connection
    return await this.waitForConnection();
  }

  releaseConnection(connection) {
    if (this.activeConnections.has(connection)) {
      this.activeConnections.delete(connection);
      this.connections.push(connection);
    }
  }

  async createConnection() {
    if (this.createConnectionPromise) {
      return await this.createConnectionPromise;
    }

    this.createConnectionPromise = this._createConnection();
    const conn = await this.createConnectionPromise;
    this.createConnectionPromise = null;
    return conn;
  }

  async _createConnection() {
    const api = new RouterOSAPI();

    return new Promise((resolve, reject) => {
      api.connect({
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        password: this.config.password,
        timeout: this.config.timeout,
        ssl: this.config.useSSL
      }, (err, conn) => {
        if (err) {
          reject(err);
        } else {
          resolve(conn);
        }
      });
    });
  }

  async testConnection(connection) {
    try {
      const api = new RouterOSAPI(connection);
      await api.write('/system/resource/print', [], { timeout: 5000 });
      return true;
    } catch (error) {
      return false;
    }
  }

  async waitForConnection() {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.connections.length > 0) {
          clearInterval(checkInterval);
          const conn = this.connections.pop();
          this.activeConnections.add(conn);
          resolve(conn);
        }
      }, 100);
    });
  }

  async closeAll() {
    // Close all connections
    for (const conn of this.connections) {
      conn.close();
    }
    for (const conn of this.activeConnections) {
      conn.close();
    }
    this.connections = [];
    this.activeConnections.clear();
  }
}
```

## 5. User List Monitoring

### 5.1 Monitoring Service
```javascript
class MikrotikMonitor {
  constructor(mikrotikClient) {
    this.client = mikrotikClient;
    this.monitoringInterval = 30000; // 30 seconds
    this.isMonitoring = false;
    this.lastSyncTime = null;
    this.activeUsers = new Map();
    this.userSessionInfo = new Map();
  }

  start() {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    console.log('Starting Mikrotik user monitoring...');

    // Run immediately on start
    this.monitorUsers();

    // Schedule regular monitoring
    this.monitoringTimer = setInterval(() => {
      this.monitorUsers();
    }, this.monitoringInterval);
  }

  stop() {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }
    console.log('Mikrotik monitoring stopped');
  }

  async monitorUsers() {
    try {
      const startTime = Date.now();

      // Monitor hotspot users
      await this.monitorHotspotUsers();

      // Monitor PPPoE users
      await this.monitorPPPoEUsers();

      // Check connection health
      await this.checkConnectionHealth();

      this.lastSyncTime = new Date();

      const duration = Date.now() - startTime;
      console.log(`Monitoring completed in ${duration}ms`);

    } catch (error) {
      console.error('Monitoring error:', error);
      await this.handleMonitoringError(error);
    }
  }

  async monitorHotspotUsers() {
    // Get all hotspot users with voucher profiles
    const voucherUsers = await this.client.getHotspotUsers({
      profile: '*voucher*'
    });

    // Get active users
    const activeUsers = await this.client.getHotspotActiveUsers();
    const activeUserMap = new Map(
      activeUsers.map(user => [user.user, user])
    );

    for (const user of voucherUsers) {
      const isActive = activeUserMap.has(user.name);
      const activeInfo = activeUserMap.get(user.name) || {};

      // Parse comment
      const commentData = this.parseComment(user.comment || '');

      if (isActive && !this.activeUsers.has(user.name)) {
        // User just came online
        await this.handleUserOnline(user.name, 'hotspot', {
          ...commentData,
          ipAddress: activeInfo.address,
          macAddress: activeInfo['mac-address'],
          uptime: activeInfo.uptime,
          loginTime: activeInfo['login-by']
        });
      } else if (!isActive && this.activeUsers.has(user.name)) {
        // User went offline
        await this.handleUserOffline(user.name, 'hotspot');
      }

      // Update active user tracking
      if (isActive) {
        this.activeUsers.set(user.name, {
          type: 'hotspot',
          data: user,
          activeInfo,
          lastSeen: new Date()
        });

        this.userSessionInfo.set(user.name, {
          bytesIn: parseInt(activeInfo['bytes-in']) || 0,
          bytesOut: parseInt(activeInfo['bytes-out']) || 0,
          uptime: activeInfo.uptime || 0
        });
      } else {
        this.activeUsers.delete(user.name);
      }
    }
  }

  async monitorPPPoEUsers() {
    // Get all PPPoE secrets
    const pppoeSecrets = await this.client.getPPPoESecrets({
      profile: '*pppoe*'
    });

    // Get active PPPoE connections
    const activeConnections = await this.client.getPPPoEActive();
    const activeConnMap = new Map(
      activeConnections.map(conn => [conn.name, conn])
    );

    for (const secret of pppoeSecrets) {
      const isActive = activeConnMap.has(secret.name);
      const activeInfo = activeConnMap.get(secret.name) || {};

      // Parse comment
      const commentData = this.parseComment(secret.comment || '');

      if (isActive && !this.activeUsers.has(secret.name)) {
        // User just connected
        await this.handleUserOnline(secret.name, 'pppoe', {
          ...commentData,
          ipAddress: activeInfo.address,
          uptime: activeInfo.uptime,
          callerId: activeInfo['caller-id']
        });
      } else if (!isActive && this.activeUsers.has(secret.name)) {
        // User disconnected
        await this.handleUserOffline(secret.name, 'pppoe');
      }

      // Update active user tracking
      if (isActive) {
        this.activeUsers.set(secret.name, {
          type: 'pppoe',
          data: secret,
          activeInfo,
          lastSeen: new Date()
        });

        this.userSessionInfo.set(secret.name, {
          bytesIn: parseInt(activeInfo['bytes-in']) || 0,
          bytesOut: parseInt(activeInfo['bytes-out']) || 0,
          uptime: activeInfo.uptime || 0
        });
      } else {
        this.activeUsers.delete(secret.name);
      }
    }
  }

  async handleUserOnline(username, type, data) {
    console.log(`User ${username} (${type}) came online`);

    if (type === 'hotspot') {
      // Handle voucher first login
      await this.handleVoucherFirstLogin(username, data);
    }

    // Update database
    await db.query(`
      UPDATE ${type === 'hotspot' ? 'vouchers' : 'subscriptions'}
      SET last_seen = NOW(), ip_address = $1, mac_address = $2
      WHERE ${type === 'hotspot' ? 'code' : 'pppoe_username'} = $3
    `, [data.ipAddress, data.macAddress, username]);

    // Log activity
    await db.query(`
      INSERT INTO user_activity_log
      (username, type, action, ip_address, mac_address, data, created_at)
      VALUES ($1, $2, 'login', $3, $4, $5, NOW())
    `, [
      username,
      type,
      data.ipAddress,
      data.macAddress,
      JSON.stringify(data)
    ]);
  }

  async handleUserOffline(username, type) {
    console.log(`User ${username} (${type}) went offline`);

    // Get session info
    const sessionInfo = this.userSessionInfo.get(username);

    // Update usage statistics
    if (sessionInfo) {
      await db.query(`
        INSERT INTO user_usage_stats
        (username, type, session_end, bytes_in, bytes_out, uptime_seconds)
        VALUES ($1, $2, NOW(), $3, $4, $5)
        ON CONFLICT (username) DO UPDATE SET
          session_end = EXCLUDED.session_end,
          bytes_in = EXCLUDED.bytes_in,
          bytes_out = EXCLUDED.bytes_out,
          uptime_seconds = EXCLUDED.uptime_seconds
      `, [
        username,
        type,
        sessionInfo.bytesIn,
        sessionInfo.bytesOut,
        Math.floor(sessionInfo.uptime / 1000)
      ]);
    }

    // Log activity
    await db.query(`
      INSERT INTO user_activity_log
      (username, type, action, created_at)
      VALUES ($1, $2, 'logout', NOW())
    `, [username, type]);
  }

  async handleVoucherFirstLogin(username, data) {
    // Check if this is first login
    const voucher = await db.query(
      'SELECT * FROM vouchers WHERE code = $1 AND status = $2',
      [username, 'created']
    );

    if (voucher.rows.length > 0) {
      const v = voucher.rows[0];

      // Activate voucher
      const now = new Date();
      const expiryTime = new Date(now.getTime() + (v.valid_hours * 60 * 60 * 1000));

      await db.query(`
        UPDATE vouchers
        SET status = 'active',
            first_login_at = $1,
            expires_at = $2,
            ip_address = $3,
            mac_address = $4,
            updated_at = NOW()
        WHERE id = $5
      `, [now, expiryTime, data.ipAddress, data.macAddress, v.id]);

      // Update Mikrotik comment
      const comment = this.parseComment(v.mikrotik_comment);
      comment.first_login_at = now.toISOString();
      comment.expires_at = expiryTime.toISOString();

      await this.client.updateUserComment(username, 'hotspot',
        this.buildComment(comment)
      );

      console.log(`Voucher ${username} activated at ${now}`);
    }
  }

  parseComment(comment) {
    const data = {
      system: null,
      batch_id: null,
      customer_id: null,
      subscription_id: null,
      price_sell: null,
      price_cost: null,
      valid_hours: null,
      created_date: null,
      created_by: null,
      first_login_at: null,
      expires_at: null
    };

    if (!comment) return data;

    const parts = comment.split('|');
    if (parts[0] === 'VOUCHER_SYSTEM' || parts[0] === 'PPPOE_SYSTEM') {
      data.system = parts[0];
      data.batch_id = parts[1];
      data.price_sell = parts[2];
      data.price_cost = parts[3];

      if (parts[0] === 'VOUCHER_SYSTEM') {
        data.valid_hours = parts[4];
        data.vendor_id = parts[5];
        data.created_date = parts[6];
        data.created_by = parts[7];
        data.first_login_at = parts[8];
        data.expires_at = parts[9];
      } else {
        data.customer_id = parts[4];
        data.subscription_id = parts[5];
        data.created_date = parts[6];
        data.created_by = parts[7];
      }
    }

    return data;
  }

  buildComment(data) {
    const parts = [
      data.system,
      data.batch_id,
      data.price_sell,
      data.price_cost
    ];

    if (data.system === 'VOUCHER_SYSTEM') {
      parts.push(
        data.valid_hours,
        data.vendor_id,
        data.created_date,
        data.created_by,
        data.first_login_at,
        data.expires_at
      );
    } else {
      parts.push(
        data.customer_id,
        data.subscription_id,
        data.created_date,
        data.created_by
      );
    }

    return parts.join('|');
  }

  async checkConnectionHealth() {
    try {
      // Simple ping to RouterOS
      await this.client.executeCommand('/ping', {
        address: '8.8.8.8',
        count: 1,
        'interface': 'ether1'
      });

      return true;
    } catch (error) {
      console.error('Connection health check failed:', error);
      return false;
    }
  }

  async handleMonitoringError(error) {
    // Log error
    console.error('Monitoring error:', error);

    // Try to reconnect
    if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
      console.log('Attempting to reconnect...');
      try {
        await this.client.connect();
      } catch (reconnectError) {
        console.error('Reconnection failed:', reconnectError);
      }
    }
  }

  getActiveUsers() {
    return Array.from(this.activeUsers.entries()).map(([username, info]) => ({
      username,
      type: info.type,
      lastSeen: info.lastSeen,
      ipAddress: info.activeInfo.address,
      uptime: info.activeInfo.uptime,
      bytesIn: info.activeInfo['bytes-in'],
      bytesOut: info.activeInfo['bytes-out']
    }));
  }

  getActiveUsersCount(type = null) {
    if (type) {
      return Array.from(this.activeUsers.values())
        .filter(info => info.type === type)
        .length;
    }
    return this.activeUsers.size;
  }
}
```

## 6. Synchronization Service

### 6.1 Bidirectional Sync
```javascript
class MikrotikSync {
  constructor(mikrotikClient, monitor) {
    this.client = mikrotikClient;
    this.monitor = monitor;
    this.syncInterval = 300000; // 5 minutes for full sync
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log('Starting Mikrotik synchronization...');

    // Run full sync immediately
    this.fullSync();

    // Schedule regular sync
    this.syncTimer = setInterval(() => {
      this.fullSync();
    }, this.syncInterval);
  }

  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    console.log('Mikrotik synchronization stopped');
  }

  async fullSync() {
    console.log('Starting full synchronization...');

    try {
      // Sync profiles
      await this.syncProfiles();

      // Sync hotspot users
      await this.syncHotspotUsers();

      // Sync PPPoE secrets
      await this.syncPPPoESecrets();

      // Check for orphaned users
      await this.cleanupOrphanedUsers();

      console.log('Full synchronization completed');
    } catch (error) {
      console.error('Sync error:', error);
    }
  }

  async syncProfiles() {
    // Get Mikrotik profiles
    const hotspotProfiles = await this.client.executeCommand(
      '/ip/hotspot/user/profile/print'
    );

    const pppoeProfiles = await this.client.executeCommand(
      '/ppp/profile/print'
    );

    // Update local database
    for (const profile of hotspotProfiles) {
      if (profile.name.includes('voucher')) {
        await db.query(`
          INSERT INTO mikrotik_profiles (name, type, rate_limit, uptime_limit)
          VALUES ($1, 'hotspot', $2, $3)
          ON CONFLICT (name) DO UPDATE SET
            rate_limit = EXCLUDED.rate_limit,
            uptime_limit = EXCLUDED.uptime_limit,
            updated_at = NOW()
        `, [
          profile.name,
          profile['rate-limit'],
          profile['uptime-limit']
        ]);
      }
    }

    for (const profile of pppoeProfiles) {
      if (profile.name.includes('pppoe')) {
        await db.query(`
          INSERT INTO mikrotik_profiles (name, type, rate_limit)
          VALUES ($1, 'pppoe', $2)
          ON CONFLICT (name) DO UPDATE SET
            rate_limit = EXCLUDED.rate_limit,
            updated_at = NOW()
        `, [
          profile.name,
          profile['rate-limit']
        ]);
      }
    }
  }

  async syncHotspotUsers() {
    // Get local vouchers
    const localVouchers = await db.query(
      'SELECT * FROM vouchers ORDER BY created_at'
    );

    // Get Mikrotik users
    const mikrotikUsers = await this.client.getHotspotUsers();

    const mikrotikUserMap = new Map(
      mikrotikUsers.map(u => [u.name, u])
    );

    // Find missing users in Mikrotik
    for (const voucher of localVouchers.rows) {
      if (!mikrotikUserMap.has(voucher.code)) {
        console.log(`Missing user in Mikrotik: ${voucher.code}`);

        // Recreate in Mikrotik
        try {
          await this.client.addHotspotUser({
            name: voucher.code,
            password: voucher.code,
            profile: voucher.profile_name,
            comment: voucher.mikrotik_comment
          });

          console.log(`Recreated user: ${voucher.code}`);
        } catch (error) {
          console.error(`Failed to recreate ${voucher.code}:`, error);
        }
      }
    }

    // Find extra users in Mikrotik
    for (const [username, user] of mikrotikUserMap) {
      const local = localVouchers.rows.find(v => v.code === username);

      if (!local && user.comment && user.comment.includes('VOUCHER_SYSTEM')) {
        console.log(`Extra user in Mikrotik: ${username}`);

        // Option 1: Remove from Mikrotik
        // await this.client.removeHotspotUser(username);

        // Option 2: Add to local database
        const commentData = this.monitor.parseComment(user.comment);
        await db.query(`
          INSERT INTO vouchers (code, profile_id, mikrotik_comment, status)
          VALUES ($1, $2, $3, 'migrated')
        `, [
          username,
          await this.getProfileId(user.profile),
          user.comment
        ]);
      }
    }
  }

  async cleanupOrphanedUsers() {
    // Find users not in local database
    const hotspotUsers = await this.client.getHotspotUsers();
    const pppoeSecrets = await this.client.getPPPoESecrets();

    for (const user of hotspotUsers) {
      if (user.comment && !user.comment.includes('SYSTEM')) {
        // No system marker, might be manually created
        console.warn(`Manual user detected: ${user.name}`);
      }
    }

    for (const secret of pppoeSecrets) {
      if (secret.comment && !secret.comment.includes('SYSTEM')) {
        // No system marker, might be manually created
        console.warn(`Manual PPPoE secret detected: ${secret.name}`);
      }
    }
  }

  async getProfileId(profileName) {
    const result = await db.query(
      'SELECT id FROM mikrotik_profiles WHERE name = $1',
      [profileName]
    );

    return result.rows[0]?.id || null;
  }
}
```

## 7. API Endpoints

### 7.1 User Management
```javascript
// Get active users
GET /api/mikrotik/users/active?filter=hotspot
Response: {
  users: [{
    username: "WIFI-123456",
    type: "hotspot",
    ipAddress: "192.168.1.100",
    uptime: "1h30m",
    bytesIn: 1048576,
    bytesOut: 524288
  }]
}

// Get user statistics
GET /api/mikrotik/stats/summary
Response: {
  totalHotspotUsers: 45,
  totalPPPoEUsers: 23,
  totalBytesIn: 1073741824,
  totalBytesOut: 536870912,
  uptime: "15 days"
}

// Create user
POST /api/mikrotik/users/hotspot
{
  name: "WIFI-123456",
  password: "WIFI-123456",
  profile: "voucher-1hr",
  comment: "VOUCHER_SYSTEM|BATCH-001|15000|10000|24"
}

// Remove user
DELETE /api/mikrotik/users/hotspot/WIFI-123456
```

### 7.2 Monitoring
```javascript
// Get monitoring status
GET /api/mikrotik/monitoring/status
Response: {
  isMonitoring: true,
  lastSync: "2025-01-09T10:30:00Z",
  activeConnections: 3,
  connectionPool: {
    active: 2,
    idle: 3,
    max: 5
  }
}

// Force sync
POST /api/mikrotik/sync/force

// Test connection
GET /api/mikrotik/test-connection
```

## 8. Database Schema

### 8.1 Additional Tables
```sql
-- Mikrotik profiles
CREATE TABLE mikrotik_profiles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    type VARCHAR(20) NOT NULL, -- hotspot, pppoe
    rate_limit VARCHAR(50),
    uptime_limit VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User activity log
CREATE TABLE user_activity_log (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL, -- hotspot, pppoe
    action VARCHAR(20) NOT NULL, -- login, logout
    ip_address INET,
    mac_address VARCHAR(17),
    data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User usage statistics
CREATE TABLE user_usage_stats (
    username VARCHAR(100) PRIMARY KEY,
    type VARCHAR(20) NOT NULL,
    session_start TIMESTAMP,
    session_end TIMESTAMP,
    bytes_in BIGINT DEFAULT 0,
    bytes_out BIGINT DEFAULT 0,
    uptime_seconds INTEGER DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Mikrotik connection log
CREATE TABLE mikrotik_connection_log (
    id SERIAL PRIMARY KEY,
    event VARCHAR(50) NOT NULL, -- connect, disconnect, error
    message TEXT,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 9. Error Handling & Recovery

### 9.1 Connection Recovery
```javascript
class ConnectionRecovery {
  constructor(client) {
    this.client = client;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.baseDelay = 5000;
    this.maxDelay = 60000;
  }

  async handleConnectionError(error) {
    if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
      this.reconnectAttempts++;

      if (this.reconnectAttempts > this.maxReconnectAttempts) {
        console.error('Max reconnection attempts reached');
        // Send alert to admin
        await this.sendAlert('mikrotik_connection_failed');
        return false;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        this.baseDelay * Math.pow(2, this.reconnectAttempts - 1),
        this.maxDelay
      );

      console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

      setTimeout(async () => {
        try {
          await this.client.connect();
          this.reconnectAttempts = 0;
          await this.sendAlert('mikrotik_connection_restored');
        } catch (error) {
          console.error('Reconnection failed:', error);
          await this.handleConnectionError(error);
        }
      }, delay);
    }
  }

  async sendAlert(type) {
    // Send WhatsApp alert to admin
    await whatsappService.sendMessage(process.env.ADMIN_WHATSAPP, {
      template: 'system_alert',
      data: {
        alert_type: type,
        device: this.client.config.host,
        timestamp: new Date().toISOString()
      }
    });
  }
}
```

## 10. Performance Optimization

### 10.1 Batch Operations
```javascript
class BatchOperations {
  constructor(client) {
    this.client = client;
    this.batchSize = 50;
  }

  async batchCreateUsers(users) {
    const batches = this.chunk(users, this.batchSize);

    for (const batch of batches) {
      const promises = batch.map(user =>
        this.client.addHotspotUser(user).catch(error => {
          console.error(`Failed to create user ${user.name}:`, error);
          return { error: error.message, user: user.name };
        })
      );

      const results = await Promise.allSettled(promises);

      // Wait between batches to avoid overwhelming Mikrotik
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  chunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
```

---

*Version: 2.0.0*
*Last Updated: 2025-01-09*
*Status: Ready for Implementation*