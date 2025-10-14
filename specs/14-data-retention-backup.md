# Data Retention & Backup v2.0 - Spesifikasi Lengkap

## 1. Overview

Sistem data retention dan backup v2.0 mengelola penyimpanan data sesuai kebijakan retensi dan prosedur backup otomatis. Sistem menjaga data penting tetapi membersihkan data lama untuk optimasi performa.

## 2. Retention Policies

### 2.1 Data Retention Periods
```javascript
// Data retention configuration
const RETENTION_POLICIES = {
  // Log data
  admin_activity_logs: '365 days',           // 1 tahun
  customer_activity_log: '180 days',         // 6 bulan
  security_events: '730 days',               // 2 tahun
  failed_login_attempts: '90 days',          // 3 bulan
  notification_logs: '30 days',              // 30 hari (sesuai user request)

  // Usage data
  voucher_usage: '90 days',                  // 3 bulan
  pppoe_usage_logs: '90 days',               // 3 bulan

  // Temporary data
  session_data: '24 hours',                  // 1 hari
  temp_files: '7 days',                     // 7 hari

  // Financial data (never delete)
  payments: 'never',
  invoices: 'never',
  carry_over_transactions: 'never',
  balance_adjustments: 'never',

  // Customer data (soft delete)
  customers: 'soft_delete',                  // Soft delete setelah 5 tahun inactive
  subscriptions: 'soft_delete',              // Soft delete setelah expired
  vouchers: 'hard_delete',                  // Hard delete setelah 1 tahun expired

  // System data
  mikrotik_sync_logs: '30 days',            // 30 hari
  error_logs: '30 days',                    // 30 hari
  performance_logs: '7 days'                // 7 hari
};
```

### 2.2 Retention Implementation
```javascript
// src/services/DataRetentionService.js
class DataRetentionService {
  static async runRetentionCleanup() {
    console.log('Starting data retention cleanup...');
    const results = {
      cleaned: {},
      errors: []
    };

    try {
      // 1. Clean notification logs (30 days)
      const notificationResult = await this.cleanupOldData(
        'notification_logs',
        'created_at',
        30,
        'days'
      );
      results.cleaned.notification_logs = notificationResult;

      // 2. Clean activity logs (365 days for admin, 180 for customer)
      const adminActivityResult = await this.cleanupOldData(
        'admin_activity_logs',
        'timestamp',
        365,
        'days'
      );
      results.cleaned.admin_activity_logs = adminActivityResult;

      const customerActivityResult = await this.cleanupOldData(
        'customer_activity_log',
        'timestamp',
        180,
        'days'
      );
      results.cleaned.customer_activity_log = customerActivityResult;

      // 3. Clean usage logs (90 days)
      const voucherUsageResult = await this.cleanupOldData(
        'voucher_usage',
        'created_at',
        90,
        'days'
      );
      results.cleaned.voucher_usage = voucherUsageResult;

      const pppoeUsageResult = await this.cleanupOldData(
        'pppoe_usage_logs',
        'recorded_at',
        90,
        'days'
      );
      results.cleaned.pppoe_usage_logs = pppoeUsageResult;

      // 4. Clean security logs (2 years)
      const securityEventsResult = await this.cleanupOldData(
        'security_events',
        'timestamp',
        730,
        'days'
      );
      results.cleaned.security_events = securityEventsResult;

      // 5. Clean expired vouchers (1 year after expiry)
      await this.cleanupExpiredVouchers();

      // 6. Clean temporary files (7 days)
      await this.cleanupTempFiles();

      // 7. Soft delete inactive customers (5 years)
      await this.softDeleteInactiveCustomers();

      // 8. Log retention activity
      await this.logRetentionActivity(results);

      console.log('Data retention cleanup completed:', results);
      return results;

    } catch (error) {
      console.error('Error in retention cleanup:', error);
      results.errors.push(error.message);
      throw error;
    }
  }

  static async cleanupOldData(tableName, dateColumn, retentionPeriod, unit) {
    try {
      const cutoffDate = this.calculateCutoffDate(retentionPeriod, unit);

      const result = await db.query(`
        DELETE FROM ${tableName}
        WHERE ${dateColumn} < ?
      `, [cutoffDate]);

      console.log(`Cleaned ${result.rowCount} records from ${tableName}`);

      return {
        tableName: tableName,
        recordsDeleted: result.rowCount,
        cutoffDate: cutoffDate
      };

    } catch (error) {
      console.error(`Error cleaning ${tableName}:`, error);
      throw error;
    }
  }

  static calculateCutoffDate(period, unit) {
    const now = new Date();
    const cutoffDate = new Date(now);

    switch (unit) {
      case 'hours':
        cutoffDate.setHours(cutoffDate.getHours() - period);
        break;
      case 'days':
        cutoffDate.setDate(cutoffDate.getDate() - period);
        break;
      case 'months':
        cutoffDate.setMonth(cutoffDate.getMonth() - period);
        break;
      case 'years':
        cutoffDate.setFullYear(cutoffDate.getFullYear() - period);
        break;
    }

    return cutoffDate;
  }

  static async cleanupExpiredVouchers() {
    // Hard delete vouchers expired more than 1 year ago
    const cutoffDate = this.calculateCutoffDate(365, 'days');

    const result = await db.query(`
      DELETE FROM vouchers
      WHERE status = 'expired'
      AND expires_at < ?
    `, [cutoffDate]);

    console.log(`Cleaned ${result.rowCount} expired vouchers`);

    return result.rowCount;
  }

  static async softDeleteInactiveCustomers() {
    // Soft delete customers inactive for 5+ years
    const cutoffDate = this.calculateCutoffDate(1825, 'days'); // 5 years

    const result = await db.query(`
      UPDATE customers
      SET status = 'inactive',
          updated_at = NOW()
      WHERE status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM subscriptions s
        WHERE s.customer_id = customers.id
        AND s.status = 'active'
      )
      AND last_login_at < ?
      OR last_login_at IS NULL
      AND created_at < ?
    `, [cutoffDate, cutoffDate]);

    console.log(`Soft deleted ${result.rowCount} inactive customers`);

    return result.rowCount;
  }

  static async logRetentionActivity(results) {
    await db.query(`
      INSERT INTO system_logs
      (log_type, details, created_at)
      VALUES ('retention_cleanup', $1, NOW())
    `, [JSON.stringify(results)]);
  }
}
```

## 3. Backup System

### 3.1 Backup Configuration
```javascript
// src/services/BackupService.js
class BackupService {
  static config = {
    // Backup schedule
    dailyBackup: {
      enabled: true,
      time: '02:00',
      retention: 30 // Keep 30 days
    },
    weeklyBackup: {
      enabled: true,
      day: 'sunday',
      time: '03:00',
      retention: 12 // Keep 12 weeks
    },
    monthlyBackup: {
      enabled: true,
      day: 1,
      time: '04:00',
      retention: 12 // Keep 12 months
    },

    // Backup destinations
    destinations: [
      {
        type: 'local',
        path: process.env.BACKUP_LOCAL_PATH || '/backups',
        enabled: true
      },
      {
        type: 's3',
        bucket: process.env.AWS_S3_BUCKET,
        region: process.env.AWS_REGION,
        enabled: process.env.AWS_ACCESS_KEY_ID ? true : false
      },
      {
        type: 'gdrive',
        folderId: process.env.GDRIVE_BACKUP_FOLDER_ID,
        enabled: process.env.GDRIVE_CREDENTIALS ? true : false
      }
    ],

    // Backup options
    compression: true,
    encryption: true,
    encryptionKey: process.env.BACKUP_ENCRYPTION_KEY,

    // Tables to include/exclude
    includeTables: [
      'customers', 'subscriptions', 'invoices', 'payments',
      'vouchers', 'pppoe_users', 'admin_users'
    ],
    excludeTables: [
      'sessions', 'temp_data', 'cache'
    ]
  };

  static async createBackup(type = 'daily') {
    const backupId = `backup-${type}-${Date.now()}`;
    const timestamp = new Date().toISOString();

    try {
      console.log(`Starting ${type} backup: ${backupId}`);

      // 1. Create backup directory
      const backupDir = path.join(
        this.config.destinations[0].path,
        new Date().toISOString().split('T')[0]
      );
      await fs.ensureDir(backupDir);

      // 2. Dump database
      const dumpFile = path.join(backupDir, `${backupId}.sql`);
      await this.dumpDatabase(dumpFile);

      // 3. Compress if enabled
      let finalFile = dumpFile;
      if (this.config.compression) {
        finalFile = await this.compressFile(dumpFile);
        await fs.remove(dumpFile);
      }

      // 4. Encrypt if enabled
      if (this.config.encryption) {
        finalFile = await this.encryptFile(finalFile);
      }

      // 5. Create backup metadata
      const metadata = {
        id: backupId,
        type: type,
        timestamp: timestamp,
        size: await fs.stat(finalFile).then(s => s.size),
        compressed: this.config.compression,
        encrypted: this.config.encryption,
        tables: this.config.includeTables,
        checksum: await this.calculateChecksum(finalFile)
      };

      // 6. Save metadata
      const metadataFile = path.join(backupDir, `${backupId}.json`);
      await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2));

      // 7. Upload to other destinations
      await this.uploadToDestinations(finalFile, metadataFile, backupId);

      // 8. Log backup
      await this.logBackup(metadata);

      // 9. Cleanup old backups
      await this.cleanupOldBackups(type);

      console.log(`Backup completed: ${backupId}`);
      return metadata;

    } catch (error) {
      console.error(`Backup failed: ${backupId}`, error);
      await this.logBackupError(backupId, error);
      throw error;
    }
  }

  static async dumpDatabase(filePath) {
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);

    // Build pg_dump command for PostgreSQL
    const command = [
      'pg_dump',
      `--host=${process.env.DB_HOST}`,
      `--port=${process.env.DB_PORT || 5432}`,
      `--username=${process.env.DB_USER}`,
      `--dbname=${process.env.DB_NAME}`,
      '--no-password',
      '--verbose',
      '--clean',
      '--no-acl',
      '--no-owner',
      '--format=custom',
      `--file=${filePath}`
    ];

    // Add specific tables
    if (this.config.includeTables.length > 0) {
      command.push(...this.config.includeTables.map(table => `--table=${table}`));
    }

    // Set password environment variable
    const env = {
      ...process.env,
      PGPASSWORD: process.env.DB_PASSWORD
    };

    await execPromise(command.join(' '), { env });

    return filePath;
  }

  static async compressFile(filePath) {
    const zlib = require('zlib');
    const gzip = zlib.createGzip();
    const inp = fs.createReadStream(filePath);
    const out = fs.createWriteStream(`${filePath}.gz`);

    return new Promise((resolve, reject) => {
      inp.pipe(gzip).pipe(out)
        .on('finish', () => resolve(`${filePath}.gz`))
        .on('error', reject);
    });
  }

  static async encryptFile(filePath) {
    const crypto = require('crypto');
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(this.config.encryptionKey, 'hex');
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipher(algorithm, key, iv);
    const input = fs.createReadStream(filePath);
    const output = fs.createWriteStream(`${filePath}.enc`);

    return new Promise((resolve, reject) => {
      input.pipe(cipher).pipe(output)
        .on('finish', () => {
          // Save IV
          fs.writeFileSync(`${filePath}.iv`, iv);
          resolve(`${filePath}.enc`);
        })
        .on('error', reject);
    });
  }

  static async uploadToDestinations(file, metadataFile, backupId) {
    const promises = [];

    for (const destination of this.config.destinations) {
      if (!destination.enabled) continue;

      switch (destination.type) {
        case 's3':
          promises.push(this.uploadToS3(file, metadataFile, backupId, destination));
          break;
        case 'gdrive':
          promises.push(this.uploadToGoogleDrive(file, metadataFile, backupId, destination));
          break;
      }
    }

    await Promise.allSettled(promises);
  }

  static async uploadToS3(file, metadataFile, backupId, config) {
    const AWS = require('aws-sdk');
    const s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: config.region
    });

    // Upload backup file
    const fileKey = `backups/${backupId}/${path.basename(file)}`;
    await s3.upload({
      Bucket: config.bucket,
      Key: fileKey,
      Body: fs.createReadStream(file),
      StorageClass: 'STANDARD_IA' // Infrequent Access for cost savings
    }).promise();

    // Upload metadata
    const metadataKey = `backups/${backupId}/metadata.json`;
    await s3.upload({
      Bucket: config.bucket,
      Key: metadataKey,
      Body: fs.createReadStream(metadataFile),
      ContentType: 'application/json'
    }).promise();

    console.log(`Uploaded to S3: s3://${config.bucket}/${fileKey}`);
  }

  static async restoreFromBackup(backupId, targetDate) {
    try {
      // 1. Find backup file
      const backup = await this.findBackup(backupId, targetDate);
      if (!backup) {
        throw new Error('Backup not found');
      }

      // 2. Download backup file
      const backupFile = await this.downloadBackup(backup);

      // 3. Decrypt if needed
      if (backup.encrypted) {
        backupFile = await this.decryptFile(backupFile);
      }

      // 4. Decompress if needed
      if (backup.compressed) {
        backupFile = await this.decompressFile(backupFile);
      }

      // 5. Create restore point
      const restorePoint = await this.createRestorePoint();

      // 6. Restore database
      await this.restoreDatabase(backupFile);

      // 7. Verify restore
      await this.verifyRestore(restorePoint);

      console.log(`Successfully restored from backup: ${backupId}`);
      return { success: true, restorePoint };

    } catch (error) {
      console.error('Restore failed:', error);
      throw error;
    }
  }

  static async cleanupOldBackups(type) {
    const retention = this.config[`${type}Backup`].retention;
    const cutoffDate = this.calculateCutoffDate(retention, 'days');

    for (const destination of this.config.destinations) {
      if (!destination.enabled) continue;

      switch (destination.type) {
        case 'local':
          await this.cleanupLocalBackups(destination.path, type, cutoffDate);
          break;
        case 's3':
          await this.cleanupS3Backups(destination, type, cutoffDate);
          break;
      }
    }
  }
}
```

## 4. Automated Backup Schedule

### 4.1 Backup Scheduler
```javascript
// src/services/BackupScheduler.js
const cron = require('node-cron');

class BackupScheduler {
  static init() {
    // Daily backup at 2 AM
    cron.schedule('0 2 * * *', async () => {
      console.log('Running daily backup...');
      try {
        await BackupService.createBackup('daily');
      } catch (error) {
        console.error('Daily backup failed:', error);
      }
    });

    // Weekly backup on Sunday at 3 AM
    cron.schedule('0 3 * * 0', async () => {
      console.log('Running weekly backup...');
      try {
        await BackupService.createBackup('weekly');
      } catch (error) {
        console.error('Weekly backup failed:', error);
      }
    });

    // Monthly backup on 1st at 4 AM
    cron.schedule('0 4 1 * *', async () => {
      console.log('Running monthly backup...');
      try {
        await BackupService.createBackup('monthly');
      } catch (error) {
        console.error('Monthly backup failed:', error);
      }
    });

    // Data retention cleanup daily at 5 AM
    cron.schedule('0 5 * * *', async () => {
      console.log('Running data retention cleanup...');
      try {
        await DataRetentionService.runRetentionCleanup();
      } catch (error) {
        console.error('Retention cleanup failed:', error);
      }
    });

    // Backup health check every hour
    cron.schedule('0 * * * *', async () => {
      await this.checkBackupHealth();
    });
  }

  static async checkBackupHealth() {
    try {
      // Check if recent backups exist
      const dailyBackup = await this.getLatestBackup('daily');
      const weeklyBackup = await this.getLatestBackup('weekly');

      if (!dailyBackup || this.isOlderThan(dailyBackup.timestamp, '26 hours')) {
        await this.sendAlert('Daily backup missing or delayed');
      }

      if (!weeklyBackup || this.isOlderThan(weeklyBackup.timestamp, '8 days')) {
        await this.sendAlert('Weekly backup missing or delayed');
      }

      // Check disk space
      const diskSpace = await this.checkDiskSpace();
      if (diskSpace.free < 10 * 1024 * 1024 * 1024) { // Less than 10GB
        await this.sendAlert('Low disk space for backups');
      }

    } catch (error) {
      console.error('Backup health check failed:', error);
    }
  }

  static async sendAlert(message) {
    console.log(`BACKUP ALERT: ${message}`);

    // Send to administrators
    const admins = await db.query(
      'SELECT whatsapp FROM admin_users WHERE role = $1 AND is_active = true',
      ['super_admin']
    );

    for (const admin of admins.rows) {
      if (admin.whatsapp) {
        await whatsappService.sendNotification(
          admin.whatsapp,
          'system_alert',
          { type: 'backup', message }
        );
      }
    }
  }
}
```

## 5. Database Schema for Backup & Retention

### 5.1 Backup Management Tables
```sql
-- Backup records
CREATE TABLE backup_records (
    id SERIAL PRIMARY KEY,
    backup_id VARCHAR(100) UNIQUE NOT NULL,
    type VARCHAR(20) NOT NULL, -- daily, weekly, monthly, manual
    timestamp TIMESTAMP NOT NULL,
    file_path TEXT,
    file_size BIGINT,
    compressed BOOLEAN DEFAULT false,
    encrypted BOOLEAN DEFAULT false,
    checksum VARCHAR(64),
    tables_included JSONB,
    status VARCHAR(20) DEFAULT 'completed', -- in_progress, completed, failed
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Retention logs
CREATE TABLE retention_logs (
    id SERIAL PRIMARY KEY,
    cleanup_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    table_name VARCHAR(100),
    records_deleted INTEGER,
    cutoff_date TIMESTAMP,
    execution_time_ms INTEGER,
    status VARCHAR(20) DEFAULT 'success'
);

-- System logs
CREATE TABLE system_logs (
    id SERIAL PRIMARY KEY,
    log_type VARCHAR(50) NOT NULL,
    details JSONB,
    severity VARCHAR(20) DEFAULT 'info',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Backup destinations
CREATE TABLE backup_destinations (
    id SERIAL PRIMARY KEY,
    type VARCHAR(20) NOT NULL, -- local, s3, gdrive
    config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_upload TIMESTAMP,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 6. API Endpoints for Backup Management

### 6.1 Backup API Endpoints
```javascript
// Manual backup
POST /api/admin/backup/create
{
  type: "daily|weekly|monthly|manual",
  description: "Optional backup description"
}

// Get backup list
GET /api/admin/backups
{
  type?: "daily|weekly|monthly",
  limit?: 50,
  offset?: 0
}

// Get backup details
GET /api/admin/backups/:backupId

// Download backup file
GET /api/admin/backups/:backupId/download

// Restore from backup
POST /api/admin/backup/restore
{
  backupId: "backup-daily-1641739200000",
  confirm: true
}

// Delete backup
DELETE /api/admin/backups/:backupId

// Run retention cleanup
POST /api/admin/retention/cleanup

// Get retention policies
GET /api/admin/retention/policies

// Update retention policy
PUT /api/admin/retention/policies/:table
{
  retentionPeriod: "30 days",
  action: "soft_delete|hard_delete"
}

// Get backup statistics
GET /api/admin/backups/statistics
// Response:
{
  totalBackups: 90,
  totalSize: "10.5GB",
  lastBackup: "2025-01-09T02:00:00Z",
  nextBackup: "2025-01-10T02:00:00Z",
  retentionStatus: {
    daily: { count: 30, oldest: "2024-12-10" },
    weekly: { count: 12, oldest: "2024-10-13" },
    monthly: { count: 12, oldest: "2024-01-01" }
  }
}
```

## 7. Frontend UI for Backup Management

### 7.1 Backup Dashboard UI
```html
<!-- views/admin/backup.ejs -->
<div class="container-fluid">
  <h4 class="mb-4">Backup & Restore</h4>

  <!-- Backup Status Cards -->
  <div class="row mb-4">
    <div class="col-md-3">
      <div class="card bg-primary text-white">
        <div class="card-body">
          <h5 class="card-title">Last Backup</h5>
          <h2 id="lastBackupTime">-</h2>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card bg-success text-white">
        <div class="card-body">
          <h5 class="card-title">Total Backups</h5>
          <h2 id="totalBackups">-</h2>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card bg-info text-white">
        <div class="card-body">
          <h5 class="card-title">Storage Used</h5>
          <h2 id="storageUsed">-</h2>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card bg-warning text-white">
        <div class="card-body">
          <h5 class="card-title">Next Backup</h5>
          <h2 id="nextBackupTime">-</h2>
        </div>
      </div>
    </div>
  </div>

  <!-- Backup Actions -->
  <div class="card mb-4">
    <div class="card-header">
      <h5 class="mb-0">Backup Actions</h5>
    </div>
    <div class="card-body">
      <div class="row">
        <div class="col-md-8">
          <button class="btn btn-primary" onclick="createBackup('daily')">
            <i class="fas fa-download me-2"></i>Create Daily Backup
          </button>
          <button class="btn btn-success" onclick="createBackup('weekly')">
            <i class="fas fa-download me-2"></i>Create Weekly Backup
          </button>
          <button class="btn btn-info" onclick="createBackup('monthly')">
            <i class="fas fa-download me-2"></i>Create Monthly Backup
          </button>
          <button class="btn btn-warning" onclick="runRetentionCleanup()">
            <i class="fas fa-trash me-2"></i>Run Retention Cleanup
          </button>
        </div>
        <div class="col-md-4 text-end">
          <button class="btn btn-outline-secondary" onclick="refreshBackupStatus()">
            <i class="fas fa-sync"></i> Refresh
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Backup List -->
  <div class="card">
    <div class="card-header d-flex justify-content-between">
      <h5 class="mb-0">Backup History</h5>
      <div>
        <select class="form-select form-select-sm d-inline-block w-auto me-2" id="backupTypeFilter">
          <option value="">All Types</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="manual">Manual</option>
        </select>
      </div>
    </div>
    <div class="card-body">
      <div class="table-responsive">
        <table class="table" id="backupTable">
          <thead>
            <tr>
              <th>ID</th>
              <th>Type</th>
              <th>Date</th>
              <th>Size</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="backupTableBody">
            <!-- Data loaded dynamically -->
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Retention Policies -->
  <div class="card mt-4">
    <div class="card-header">
      <h5 class="mb-0">Data Retention Policies</h5>
    </div>
    <div class="card-body">
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Table/Data</th>
              <th>Retention Period</th>
              <th>Action</th>
              <th>Last Cleanup</th>
            </tr>
          </thead>
          <tbody id="retentionTableBody">
            <!-- Data loaded dynamically -->
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<!-- Restore Modal -->
<div class="modal fade" id="restoreModal">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Restore from Backup</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <div class="alert alert-warning">
          <i class="fas fa-exclamation-triangle me-2"></i>
          <strong>Warning:</strong> This will replace all current data. Make sure you have a current backup before proceeding.
        </div>

        <div class="mb-3">
          <label class="form-label">Backup ID</label>
          <input type="text" class="form-control" id="restoreBackupId" readonly>
        </div>

        <div class="mb-3">
          <label class="form-label">Confirmation</label>
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="restoreConfirm">
            <label class="form-check-label" for="restoreConfirm">
              I understand this will replace all current data
            </label>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
        <button type="button" class="btn btn-danger" id="confirmRestoreBtn" disabled>
          <i class="fas fa-undo me-2"></i>Restore
        </button>
      </div>
    </div>
  </div>
</div>
```

### 7.2 Backup JavaScript
```javascript
// public/js/backup.js
class BackupManager {
  static init() {
    this.loadBackupStatus();
    this.loadBackupList();
    this.loadRetentionPolicies();
    this.bindEvents();
  }

  static bindEvents() {
    // Restore confirmation checkbox
    document.getElementById('restoreConfirm').addEventListener('change', (e) => {
      document.getElementById('confirmRestoreBtn').disabled = !e.target.checked;
    });

    // Backup type filter
    document.getElementById('backupTypeFilter').addEventListener('change', () => {
      this.loadBackupList();
    });

    // Confirm restore button
    document.getElementById('confirmRestoreBtn').addEventListener('click', () => {
      this.confirmRestore();
    });
  }

  static async loadBackupStatus() {
    try {
      const response = await fetch('/api/admin/backups/statistics');
      const stats = await response.json();

      document.getElementById('lastBackupTime').textContent =
        this.formatDateTime(stats.lastBackup);
      document.getElementById('totalBackups').textContent = stats.totalBackups;
      document.getElementById('storageUsed').textContent = this.formatFileSize(stats.totalSize);
      document.getElementById('nextBackupTime').textContent =
        this.formatDateTime(stats.nextBackup);

    } catch (error) {
      console.error('Error loading backup status:', error);
    }
  }

  static async loadBackupList() {
    try {
      const filter = document.getElementById('backupTypeFilter').value;
      const url = filter ? `/api/admin/backups?type=${filter}` : '/api/admin/backups';

      const response = await fetch(url);
      const backups = await response.json();

      this.renderBackupTable(backups);

    } catch (error) {
      console.error('Error loading backup list:', error);
    }
  }

  static renderBackupTable(backups) {
    const tbody = document.getElementById('backupTableBody');

    if (backups.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center">No backups found</td></tr>';
      return;
    }

    tbody.innerHTML = backups.map(backup => `
      <tr>
        <td><code>${backup.backup_id}</code></td>
        <td>
          <span class="badge bg-${this.getTypeColor(backup.type)}">
            ${backup.type}
          </span>
        </td>
        <td>${this.formatDateTime(backup.timestamp)}</td>
        <td>${this.formatFileSize(backup.file_size)}</td>
        <td>
          <span class="badge bg-${backup.status === 'completed' ? 'success' : 'danger'}">
            ${backup.status}
          </span>
        </td>
        <td>
          <div class="btn-group">
            <button class="btn btn-sm btn-outline-primary" onclick="downloadBackup('${backup.backup_id}')" title="Download">
              <i class="fas fa-download"></i>
            </button>
            <button class="btn btn-sm btn-outline-warning" onclick="restoreFromBackup('${backup.backup_id}')" title="Restore">
              <i class="fas fa-undo"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteBackup('${backup.backup_id}')" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  static async createBackup(type) {
    try {
      this.showLoading(`Creating ${type} backup...`);

      const response = await fetch('/api/admin/backup/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type })
      });

      const result = await response.json();

      if (result.success) {
        this.showSuccess(`${type} backup created successfully`);
        this.loadBackupList();
        this.loadBackupStatus();
      } else {
        this.showError(result.error);
      }

    } catch (error) {
      console.error('Error creating backup:', error);
      this.showError('Failed to create backup');
    } finally {
      this.hideLoading();
    }
  }

  static async restoreFromBackup(backupId) {
    document.getElementById('restoreBackupId').value = backupId;

    const modal = new bootstrap.Modal(document.getElementById('restoreModal'));
    modal.show();
  }

  static async confirmRestore() {
    const backupId = document.getElementById('restoreBackupId').value;

    try {
      this.showLoading('Restoring from backup...');

      const response = await fetch('/api/admin/backup/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ backupId, confirm: true })
      });

      const result = await response.json();

      if (result.success) {
        this.showSuccess('System restored successfully');

        // Hide modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('restoreModal'));
        modal.hide();

        // Reload page after delay
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      } else {
        this.showError(result.error);
      }

    } catch (error) {
      console.error('Error restoring backup:', error);
      this.showError('Failed to restore from backup');
    } finally {
      this.hideLoading();
    }
  }

  static async deleteBackup(backupId) {
    if (!confirm('Are you sure you want to delete this backup?')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/backups/${backupId}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (result.success) {
        this.showSuccess('Backup deleted successfully');
        this.loadBackupList();
      } else {
        this.showError(result.error);
      }

    } catch (error) {
      console.error('Error deleting backup:', error);
      this.showError('Failed to delete backup');
    }
  }

  static async runRetentionCleanup() {
    if (!confirm('Are you sure you want to run retention cleanup? This will delete old data.')) {
      return;
    }

    try {
      this.showLoading('Running retention cleanup...');

      const response = await fetch('/api/admin/retention/cleanup', {
        method: 'POST'
      });

      const result = await response.json();

      if (result.success) {
        this.showSuccess(`Cleanup completed. Deleted ${result.totalDeleted} records`);
        this.loadRetentionPolicies();
      } else {
        this.showError(result.error);
      }

    } catch (error) {
      console.error('Error running cleanup:', error);
      this.showError('Failed to run retention cleanup');
    } finally {
      this.hideLoading();
    }
  }

  static getTypeColor(type) {
    const colors = {
      'daily': 'primary',
      'weekly': 'success',
      'monthly': 'info',
      'manual': 'warning'
    };
    return colors[type] || 'secondary';
  }

  static formatDateTime(dateString) {
    return new Date(dateString).toLocaleString('id-ID');
  }

  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static showLoading(message = 'Loading...') {
    // Implement loading indicator
  }

  static hideLoading() {
    // Hide loading indicator
  }

  static showSuccess(message) {
    // Show success toast
    alert(message);
  }

  static showError(message) {
    // Show error toast
    alert(message);
  }
}

// Global functions
function createBackup(type) {
  BackupManager.createBackup(type);
}

function restoreFromBackup(backupId) {
  BackupManager.restoreFromBackup(backupId);
}

function confirmRestore() {
  BackupManager.confirmRestore();
}

function downloadBackup(backupId) {
  window.open(`/api/admin/backups/${backupId}/download`, '_blank');
}

function deleteBackup(backupId) {
  BackupManager.deleteBackup(backupId);
}

function runRetentionCleanup() {
  BackupManager.runRetentionCleanup();
}

function refreshBackupStatus() {
  BackupManager.loadBackupStatus();
  BackupManager.loadBackupList();
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  BackupManager.init();
});
```

## 8. Monitoring & Alerts

### 8.1 Backup Monitoring Service
```javascript
// src/services/BackupMonitorService.js
class BackupMonitorService {
  static async checkBackupHealth() {
    const checks = [];

    // Check last backup time
    const lastBackup = await this.getLastBackupTime();
    if (this.isOlderThan(lastBackup, '26 hours')) {
      checks.push({
        type: 'error',
        message: 'Daily backup is delayed',
        recommendation: 'Check backup logs and system resources'
      });
    }

    // Check disk space
    const diskSpace = await this.getDiskSpace();
    if (diskSpace.free < 10 * 1024 * 1024 * 1024) { // Less than 10GB
      checks.push({
        type: 'warning',
        message: `Low disk space: ${this.formatBytes(diskSpace.free)} remaining`,
        recommendation: 'Clean up old backups or add more storage'
      });
    }

    // Check backup file integrity
    const recentBackups = await this.getRecentBackups(7);
    for (const backup of recentBackups) {
      if (backup.checksum && await this.verifyChecksum(backup)) {
        // Checksum verified
      } else {
        checks.push({
          type: 'error',
          message: `Backup ${backup.backup_id} checksum verification failed`,
          recommendation: 'Recreate backup manually'
        });
      }
    }

    // Check backup destinations
    const destinations = await this.checkBackupDestinations();
    destinations.forEach(dest => {
      if (!dest.status) {
        checks.push({
          type: 'error',
          message: `Backup destination ${dest.type} is not accessible`,
          recommendation: 'Check connection and credentials'
        });
      }
    });

    return checks;
  }

  static async sendHealthAlert(checks) {
    const criticalChecks = checks.filter(c => c.type === 'error');

    if (criticalChecks.length > 0) {
      const message = `
        Backup System Alert:
        ${criticalChecks.map(c => `• ${c.message}`).join('\n')}

        Recommendations:
        ${criticalChecks.map(c => `• ${c.recommendation}`).join('\n')}
      `;

      // Send to admin WhatsApp
      await this.sendAdminAlert(message);

      // Log to system
      await this.logSystemEvent('backup_alert', {
        checks: checks,
        timestamp: new Date()
      });
    }
  }
}
```

## 9. Best Practices

### 9.1 Backup Best Practices
1. **3-2-1 Rule**: 3 copies, 2 different media, 1 off-site
2. **Regular Testing**: Test restore procedures monthly
3. **Encryption**: Always encrypt backup files
4. **Version Control**: Keep multiple backup versions
5. **Documentation**: Document backup and restore procedures
6. **Monitoring**: Monitor backup success/failure rates

### 9.2 Data Retention Best Practices
1. **Legal Compliance**: Follow local data retention laws
2. **Business Requirements**: Keep data as long as needed
3. **Privacy**: Delete personal data when no longer needed
4. **Performance**: Regular cleanup improves database performance
5. **Audit Trail**: Maintain logs of data deletion
6. **Recovery**: Ensure deleted data can be restored if needed

## 10. Testing

### 10.1 Backup Testing Strategy
```javascript
// Automated backup testing
class BackupTestingService {
  static async testBackupRestore() {
    // Create test database
    const testDbName = `test_restore_${Date.now()}`;
    await this.createTestDatabase(testDbName);

    try {
      // 1. Take backup
      const backupId = await BackupService.createBackup('test');

      // 2. Restore to test database
      await BackupService.restoreToDatabase(backupId, testDbName);

      // 3. Verify data integrity
      const verification = await this.verifyDataIntegrity(testDbName);

      // 4. Clean up test database
      await this.dropTestDatabase(testDbName);

      return {
        success: verification.success,
        backupId: backupId,
        issues: verification.issues || []
      };

    } catch (error) {
      await this.dropTestDatabase(testDbName);
      throw error;
    }
  }

  static async verifyDataIntegrity(testDbName) {
    // Compare record counts
    const comparisons = [
      { table: 'customers', critical: true },
      { table: 'subscriptions', critical: true },
      { table: 'invoices', critical: true },
      { table: 'payments', critical: true },
      { table: 'vouchers', critical: false },
      { table: 'pppoe_users', critical: false }
    ];

    const issues = [];

    for (const comp of comparisons) {
      const mainCount = await this.getRecordCount(comp.table);
      const testCount = await this.getRecordCount(comp.table, testDbName);

      if (mainCount !== testCount) {
        issues.push({
          table: comp.table,
          type: 'record_mismatch',
          main: mainCount,
          test: testCount,
          critical: comp.critical
        });
      }
    }

    return {
      success: issues.filter(i => i.critical).length === 0,
      issues: issues
    };
  }
}
```

---

*Version: 2.0.0*
*Last Updated: 2025-01-09*
*Status: Ready for Implementation*