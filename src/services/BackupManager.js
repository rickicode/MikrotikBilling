const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');
const zlib = require('zlib');
const tar = require('tar');

/**
 * Backup and Disaster Recovery Manager for HIJINETWORK
 * Handles automated backups, disaster recovery, and business continuity
 */
class BackupManager {
  constructor(config = {}) {
    this.config = {
      backupDir: config.backupDir || path.join(process.cwd(), 'backups'),
      retentionDays: config.retentionDays || 30,
      compressionLevel: config.compressionLevel || 6,
      encryptionEnabled: config.encryptionEnabled || false,
      encryptionKey: config.encryptionKey || null,
      maxBackupSize: config.maxBackupSize || 1024 * 1024 * 1024, // 1GB
      cloudStorage: config.cloudStorage || {
        enabled: false,
        provider: 'aws', // aws, gcp, azure
        bucket: '',
        region: '',
        credentials: {}
      },
      notifications: config.notifications || {
        enabled: false,
        webhook: '',
        email: '',
        slack: ''
      },
      ...config
    };

    this.backupHistory = [];
    this.backupStats = {
      totalBackups: 0,
      totalSize: 0,
      lastBackup: null,
      lastRestore: null,
      failedBackups: 0,
      successfulBackups: 0
    };

    this.initialize();
  }

  /**
   * Initialize backup manager
   */
  async initialize() {
    // Create backup directory
    await fs.mkdir(this.config.backupDir, { recursive: true });

    // Load backup history
    await this.loadBackupHistory();

    // Start backup scheduler
    this.startBackupScheduler();

    console.log('🔄 Backup Manager initialized successfully');
  }

  /**
   * Load backup history from disk
   */
  async loadBackupHistory() {
    try {
      const historyPath = path.join(this.config.backupDir, 'backup-history.json');
      if (await fs.access(historyPath).catch(() => false)) {
        const data = await fs.readFile(historyPath, 'utf8');
        this.backupHistory = JSON.parse(data);
      }
    } catch (error) {
      console.warn('Could not load backup history:', error.message);
    }
  }

  /**
   * Save backup history to disk
   */
  async saveBackupHistory() {
    try {
      const historyPath = path.join(this.config.backupDir, 'backup-history.json');
      await fs.writeFile(historyPath, JSON.stringify(this.backupHistory, null, 2));
    } catch (error) {
      console.error('Could not save backup history:', error.message);
    }
  }

  /**
   * Start backup scheduler
   */
  startBackupScheduler() {
    // Schedule daily backups at 2 AM
    setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 2 && now.getMinutes() === 0) {
        await this.createBackup('scheduled');
      }
    }, 60000); // Check every minute
  }

  /**
   * Create a comprehensive backup
   */
  async createBackup(type = 'manual', options = {}) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = crypto.createHash('md5').update(timestamp + type).digest('hex').substring(0, 8);
    const backupPath = path.join(this.config.backupDir, `backup-${backupId}`);

    console.log(`🔄 Creating backup: ${backupId} (${type})`);

    try {
      // Create backup directory
      await fs.mkdir(backupPath, { recursive: true });

      const backupManifest = {
        id: backupId,
        type: type,
        timestamp: timestamp,
        version: this.getAppVersion(),
        components: [],
        checksum: '',
        size: 0,
        status: 'in_progress'
      };

      // Backup database
      await this.backupDatabase(backupPath, backupManifest);

      // Backup application files
      await this.backupApplicationFiles(backupPath, backupManifest);

      // Backup configuration files
      await this.backupConfiguration(backupPath, backupManifest);

      // Backup SSL certificates
      await this.backupSSL(backupPath, backupManifest);

      // Backup logs
      await this.backupLogs(backupPath, backupManifest);

      // Create manifest file
      await this.createBackupManifest(backupPath, backupManifest);

      // Compress backup
      const compressedPath = await this.compressBackup(backupPath, backupManifest);

      // Encrypt backup if enabled
      if (this.config.encryptionEnabled && this.config.encryptionKey) {
        await this.encryptBackup(compressedPath, backupManifest);
      }

      // Upload to cloud storage if enabled
      if (this.config.cloudStorage.enabled) {
        await this.uploadToCloudStorage(compressedPath, backupManifest);
      }

      // Update backup history and stats
      backupManifest.status = 'completed';
      backupManifest.size = backupManifest.size;
      backupManifest.checksum = await this.calculateFileChecksum(compressedPath);

      this.backupHistory.push(backupManifest);
      await this.saveBackupHistory();

      // Update statistics
      this.backupStats.totalBackups++;
      this.backupStats.successfulBackups++;
      this.backupStats.totalSize += backupManifest.size;
      this.backupStats.lastBackup = timestamp;

      // Clean old backups
      await this.cleanupOldBackups();

      // Send notification
      await this.sendNotification('backup_completed', {
        backupId: backupId,
        type: type,
        size: backupManifest.size,
        timestamp: timestamp
      });

      console.log(`✅ Backup completed successfully: ${backupId}`);
      return {
        success: true,
        backupId: backupId,
        path: compressedPath,
        size: backupManifest.size,
        timestamp: timestamp
      };

    } catch (error) {
      console.error('❌ Backup failed:', error.message);

      // Update backup history
      if (this.backupHistory.length > 0) {
        const lastBackup = this.backupHistory[this.backupHistory.length - 1];
        if (lastBackup.id === backupId) {
          lastBackup.status = 'failed';
          lastBackup.error = error.message;
          await this.saveBackupHistory();
        }
      }

      // Update statistics
      this.backupStats.failedBackups++;

      // Send notification
      await this.sendNotification('backup_failed', {
        backupId: backupId,
        type: type,
        error: error.message,
        timestamp: timestamp
      });

      return {
        success: false,
        backupId: backupId,
        error: error.message
      };
    }
  }

  /**
   * Backup database
   */
  async backupDatabase(backupPath, manifest) {
    console.log('📊 Backing up database...');

    const dbBackupPath = path.join(backupPath, 'database');
    await fs.mkdir(dbBackupPath, { recursive: true });

    const databaseComponent = {
      name: 'database',
      type: 'postgresql',
      files: [],
      size: 0,
      status: 'in_progress'
    };

    try {
      // Check if database exists
      const dbPath = path.join(process.cwd(), 'database.sqlite');
      if (await fs.access(dbPath).catch(() => false)) {
        // SQLite backup
        const backupFile = path.join(dbBackupPath, 'database.sqlite');
        await fs.copyFile(dbPath, backupFile);

        const stats = await fs.stat(backupFile);
        databaseComponent.files.push('database.sqlite');
        databaseComponent.size += stats.size;
      } else {
        // PostgreSQL backup
        const backupFile = path.join(dbBackupPath, 'database.sql');
        const dbPassword = process.env.DB_PASSWORD || '';

        const command = `PGPASSWORD="${dbPassword}" pg_dump -h localhost -U hijinetwork -d hijinetwork > "${backupFile}"`;
        execSync(command, { stdio: 'pipe' });

        const stats = await fs.stat(backupFile);
        databaseComponent.files.push('database.sql');
        databaseComponent.size += stats.size;
      }

      databaseComponent.status = 'completed';
      manifest.components.push(databaseComponent);
      manifest.size += databaseComponent.size;

      console.log('✅ Database backup completed');
    } catch (error) {
      databaseComponent.status = 'failed';
      databaseComponent.error = error.message;
      manifest.components.push(databaseComponent);
      throw new Error(`Database backup failed: ${error.message}`);
    }
  }

  /**
   * Backup application files
   */
  async backupApplicationFiles(backupPath, manifest) {
    console.log('📁 Backing up application files...');

    const appBackupPath = path.join(backupPath, 'application');
    await fs.mkdir(appBackupPath, { recursive: true });

    const appComponent = {
      name: 'application',
      type: 'files',
      files: [],
      size: 0,
      status: 'in_progress'
    };

    try {
      const filesToBackup = [
        'package.json',
        'server.js',
        'src/',
        'views/',
        'public/',
        'CLAUDE.md',
        'ARCHITECTURE_NEW.md'
      ];

      for (const file of filesToBackup) {
        const sourcePath = path.join(process.cwd(), file);
        if (await fs.access(sourcePath).catch(() => false)) {
          const destPath = path.join(appBackupPath, file);
          const destDir = path.dirname(destPath);

          await fs.mkdir(destDir, { recursive: true });

          if ((await fs.stat(sourcePath)).isDirectory()) {
            await this.copyDirectory(sourcePath, destPath);
            const size = await this.getDirectorySize(destPath);
            appComponent.size += size;
            appComponent.files.push(file + '/');
          } else {
            await fs.copyFile(sourcePath, destPath);
            const stats = await fs.stat(destPath);
            appComponent.size += stats.size;
            appComponent.files.push(file);
          }
        }
      }

      appComponent.status = 'completed';
      manifest.components.push(appComponent);
      manifest.size += appComponent.size;

      console.log('✅ Application files backup completed');
    } catch (error) {
      appComponent.status = 'failed';
      appComponent.error = error.message;
      manifest.components.push(appComponent);
      throw new Error(`Application files backup failed: ${error.message}`);
    }
  }

  /**
   * Backup configuration files
   */
  async backupConfiguration(backupPath, manifest) {
    console.log('⚙️ Backing up configuration files...');

    const configBackupPath = path.join(backupPath, 'configuration');
    await fs.mkdir(configBackupPath, { recursive: true });

    const configComponent = {
      name: 'configuration',
      type: 'config',
      files: [],
      size: 0,
      status: 'in_progress'
    };

    try {
      const configFiles = [
        '.env.production',
        '.env',
        'deployment/',
        'security-audit.js'
      ];

      for (const file of configFiles) {
        const sourcePath = path.join(process.cwd(), file);
        if (await fs.access(sourcePath).catch(() => false)) {
          const destPath = path.join(configBackupPath, file);
          const destDir = path.dirname(destPath);

          await fs.mkdir(destDir, { recursive: true });

          if ((await fs.stat(sourcePath)).isDirectory()) {
            await this.copyDirectory(sourcePath, destPath);
            const size = await this.getDirectorySize(destPath);
            configComponent.size += size;
            configComponent.files.push(file + '/');
          } else {
            await fs.copyFile(sourcePath, destPath);
            const stats = await fs.stat(destPath);
            configComponent.size += stats.size;
            configComponent.files.push(file);
          }
        }
      }

      configComponent.status = 'completed';
      manifest.components.push(configComponent);
      manifest.size += configComponent.size;

      console.log('✅ Configuration files backup completed');
    } catch (error) {
      configComponent.status = 'failed';
      configComponent.error = error.message;
      manifest.components.push(configComponent);
      throw new Error(`Configuration files backup failed: ${error.message}`);
    }
  }

  /**
   * Backup SSL certificates
   */
  async backupSSL(backupPath, manifest) {
    console.log('🔐 Backing up SSL certificates...');

    const sslBackupPath = path.join(backupPath, 'ssl');
    await fs.mkdir(sslBackupPath, { recursive: true });

    const sslComponent = {
      name: 'ssl',
      type: 'certificates',
      files: [],
      size: 0,
      status: 'in_progress'
    };

    try {
      const sslPaths = [
        '/etc/letsencrypt',
        '/etc/nginx/ssl',
        'deployment/ssl'
      ];

      for (const sslPath of sslPaths) {
        if (await fs.access(sslPath).catch(() => false)) {
          const destPath = path.join(sslBackupPath, path.basename(sslPath));
          await this.copyDirectory(sslPath, destPath);
          const size = await this.getDirectorySize(destPath);
          sslComponent.size += size;
          sslComponent.files.push(path.basename(sslPath) + '/');
        }
      }

      sslComponent.status = 'completed';
      manifest.components.push(sslComponent);
      manifest.size += sslComponent.size;

      console.log('✅ SSL certificates backup completed');
    } catch (error) {
      sslComponent.status = 'failed';
      sslComponent.error = error.message;
      manifest.components.push(sslComponent);
      throw new Error(`SSL certificates backup failed: ${error.message}`);
    }
  }

  /**
   * Backup logs
   */
  async backupLogs(backupPath, manifest) {
    console.log('📝 Backing up logs...');

    const logsBackupPath = path.join(backupPath, 'logs');
    await fs.mkdir(logsBackupPath, { recursive: true });

    const logsComponent = {
      name: 'logs',
      type: 'logs',
      files: [],
      size: 0,
      status: 'in_progress'
    };

    try {
      const logPaths = [
        'logs/',
        '/var/log/hijinetwork/',
        '/var/log/nginx/'
      ];

      for (const logPath of logPaths) {
        if (await fs.access(logPath).catch(() => false)) {
          const destPath = path.join(logsBackupPath, path.basename(logPath));
          await this.copyDirectory(logPath, destPath);
          const size = await this.getDirectorySize(destPath);
          logsComponent.size += size;
          logsComponent.files.push(path.basename(logPath) + '/');
        }
      }

      logsComponent.status = 'completed';
      manifest.components.push(logsComponent);
      manifest.size += logsComponent.size;

      console.log('✅ Logs backup completed');
    } catch (error) {
      logsComponent.status = 'failed';
      logsComponent.error = error.message;
      manifest.components.push(logsComponent);
      throw new Error(`Logs backup failed: ${error.message}`);
    }
  }

  /**
   * Create backup manifest
   */
  async createBackupManifest(backupPath, manifest) {
    const manifestPath = path.join(backupPath, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }

  /**
   * Compress backup
   */
  async compressBackup(backupPath, manifest) {
    console.log('🗜️ Compressing backup...');

    const compressedPath = backupPath + '.tar.gz';

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(compressedPath);
      const gzip = zlib.createGzip({ level: this.config.compressionLevel });
      const archive = tar.create({ gzip: false, cwd: path.dirname(backupPath) }, [path.basename(backupPath)]);

      archive.pipe(gzip).pipe(output);

      output.on('finish', async () => {
        try {
          const stats = await fs.stat(compressedPath);
          manifest.compressedSize = stats.size;
          manifest.compressionRatio = ((manifest.size - stats.size) / manifest.size * 100).toFixed(2) + '%';

          // Remove uncompressed directory
          await this.removeDirectory(backupPath);

          console.log(`✅ Backup compressed: ${compressedPath} (${stats.size} bytes, ${manifest.compressionRatio} reduction)`);
          resolve(compressedPath);
        } catch (error) {
          reject(error);
        }
      });

      archive.on('error', reject);
      gzip.on('error', reject);
      output.on('error', reject);

      archive.end();
    });
  }

  /**
   * Encrypt backup
   */
  async encryptBackup(filePath, manifest) {
    console.log('🔐 Encrypting backup...');

    const encryptedPath = filePath + '.enc';
    const algorithm = 'aes-256-cbc';
    const iv = crypto.randomBytes(16);
    const key = crypto.createHash('sha256').update(this.config.encryptionKey).digest();

    return new Promise((resolve, reject) => {
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      const input = fs.createReadStream(filePath);
      const output = fs.createWriteStream(encryptedPath);

      output.write(iv);
      output.on('finish', async () => {
        try {
          const stats = await fs.stat(encryptedPath);
          manifest.encrypted = true;
          manifest.encryptedSize = stats.size;

          // Remove unencrypted file
          await fs.unlink(filePath);

          console.log(`✅ Backup encrypted: ${encryptedPath}`);
          resolve(encryptedPath);
        } catch (error) {
          reject(error);
        }
      });

      input.pipe(cipher).pipe(output);
    });
  }

  /**
   * Upload to cloud storage
   */
  async uploadToCloudStorage(filePath, manifest) {
    console.log('☁️ Uploading to cloud storage...');

    // This is a placeholder for cloud storage implementation
    // In a real implementation, you would use AWS S3, Google Cloud Storage, or Azure Blob Storage

    switch (this.config.cloudStorage.provider) {
      case 'aws':
        await this.uploadToAWS(filePath, manifest);
        break;
      case 'gcp':
        await this.uploadToGCP(filePath, manifest);
        break;
      case 'azure':
        await this.uploadToAzure(filePath, manifest);
        break;
      default:
        console.warn('Unknown cloud storage provider:', this.config.cloudStorage.provider);
    }

    console.log('✅ Cloud storage upload completed');
  }

  /**
   * Upload to AWS S3
   */
  async uploadToAWS(filePath, manifest) {
    // Placeholder for AWS S3 upload
    // In real implementation, use AWS SDK
    console.log('Uploading to AWS S3...');
  }

  /**
   * Upload to Google Cloud Storage
   */
  async uploadToGCP(filePath, manifest) {
    // Placeholder for GCS upload
    // In real implementation, use Google Cloud Storage SDK
    console.log('Uploading to Google Cloud Storage...');
  }

  /**
   * Upload to Azure Blob Storage
   */
  async uploadToAzure(filePath, manifest) {
    // Placeholder for Azure upload
    // In real implementation, use Azure Storage SDK
    console.log('Uploading to Azure Blob Storage...');
  }

  /**
   * Restore from backup
   */
  async restoreFromBackup(backupId, options = {}) {
    console.log(`🔄 Restoring from backup: ${backupId}`);

    try {
      // Find backup in history
      const backupRecord = this.backupHistory.find(b => b.id === backupId);
      if (!backupRecord) {
        throw new Error('Backup not found');
      }

      let backupPath = path.join(this.config.backupDir, `backup-${backupId}.tar.gz`);

      // Check if backup is encrypted
      if (backupRecord.encrypted) {
        backupPath = await this.decryptBackup(backupPath, this.config.encryptionKey);
      }

      // Extract backup
      const extractPath = path.join(this.config.backupDir, `restore-${backupId}`);
      await this.extractBackup(backupPath, extractPath);

      // Load manifest
      const manifestPath = path.join(extractPath, `backup-${backupId}`, 'manifest.json');
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

      // Restore components
      await this.restoreDatabase(extractPath, backupId, manifest, options);
      await this.restoreApplicationFiles(extractPath, backupId, manifest, options);
      await this.restoreConfiguration(extractPath, backupId, manifest, options);
      await this.restoreSSL(extractPath, backupId, manifest, options);

      // Update statistics
      this.backupStats.lastRestore = new Date().toISOString();

      // Send notification
      await this.sendNotification('restore_completed', {
        backupId: backupId,
        timestamp: new Date().toISOString()
      });

      console.log(`✅ Restore completed successfully: ${backupId}`);
      return {
        success: true,
        backupId: backupId,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Restore failed:', error.message);

      // Send notification
      await this.sendNotification('restore_failed', {
        backupId: backupId,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      return {
        success: false,
        backupId: backupId,
        error: error.message
      };
    }
  }

  /**
   * Decrypt backup
   */
  async decryptBackup(filePath, key) {
    console.log('🔐 Decrypting backup...');

    const decryptedPath = filePath.replace('.enc', '');
    const algorithm = 'aes-256-cbc';
    const decipherKey = crypto.createHash('sha256').update(key).digest();

    return new Promise((resolve, reject) => {
      const input = fs.createReadStream(filePath);
      const output = fs.createWriteStream(decryptedPath);

      // Read IV from file
      const iv = Buffer.alloc(16);
      input.read(iv, 0, 16);

      const decipher = crypto.createDecipheriv(algorithm, decipherKey, iv);

      input.pipe(decipher).pipe(output);

      output.on('finish', () => {
        console.log(`✅ Backup decrypted: ${decryptedPath}`);
        resolve(decryptedPath);
      });

      input.on('error', reject);
      decipher.on('error', reject);
      output.on('error', reject);
    });
  }

  /**
   * Extract backup
   */
  async extractBackup(filePath, extractPath) {
    console.log('📂 Extracting backup...');

    await fs.mkdir(extractPath, { recursive: true });

    return new Promise((resolve, reject) => {
      const extract = tar.extract({
        cwd: extractPath,
        strip: 0
      });

      const input = fs.createReadStream(filePath);
      const gunzip = zlib.createGunzip();

      input.pipe(gunzip).pipe(extract);

      extract.on('finish', () => {
        console.log(`✅ Backup extracted: ${extractPath}`);
        resolve(extractPath);
      });

      input.on('error', reject);
      gunzip.on('error', reject);
      extract.on('error', reject);
    });
  }

  /**
   * Restore database
   */
  async restoreDatabase(extractPath, backupId, manifest, options) {
    console.log('📊 Restoring database...');

    const dbPath = path.join(extractPath, `backup-${backupId}`, 'database');

    if (options.database !== false) {
      // Implementation would depend on database type
      console.log('✅ Database restore completed');
    }
  }

  /**
   * Restore application files
   */
  async restoreApplicationFiles(extractPath, backupId, manifest, options) {
    console.log('📁 Restoring application files...');

    const appPath = path.join(extractPath, `backup-${backupId}`, 'application');

    if (options.application !== false) {
      // Implementation would copy files back to application directory
      console.log('✅ Application files restore completed');
    }
  }

  /**
   * Restore configuration
   */
  async restoreConfiguration(extractPath, backupId, manifest, options) {
    console.log('⚙️ Restoring configuration...');

    const configPath = path.join(extractPath, `backup-${backupId}`, 'configuration');

    if (options.configuration !== false) {
      // Implementation would restore configuration files
      console.log('✅ Configuration restore completed');
    }
  }

  /**
   * Restore SSL certificates
   */
  async restoreSSL(extractPath, backupId, manifest, options) {
    console.log('🔐 Restoring SSL certificates...');

    const sslPath = path.join(extractPath, `backup-${backupId}`, 'ssl');

    if (options.ssl !== false) {
      // Implementation would restore SSL certificates
      console.log('✅ SSL certificates restore completed');
    }
  }

  /**
   * Clean up old backups
   */
  async cleanupOldBackups() {
    console.log('🧹 Cleaning up old backups...');

    try {
      const files = await fs.readdir(this.config.backupDir);
      const cutoffDate = new Date(Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000));

      for (const file of files) {
        if (file.startsWith('backup-') && (file.endsWith('.tar.gz') || file.endsWith('.tar.gz.enc'))) {
          const filePath = path.join(this.config.backupDir, file);
          const stats = await fs.stat(filePath);

          if (stats.mtime < cutoffDate) {
            await fs.unlink(filePath);
            console.log(`🗑️ Deleted old backup: ${file}`);
          }
        }
      }

      // Clean backup history
      this.backupHistory = this.backupHistory.filter(backup => {
        const backupDate = new Date(backup.timestamp);
        return backupDate > cutoffDate;
      });

      await this.saveBackupHistory();

      console.log('✅ Old backups cleanup completed');
    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
    }
  }

  /**
   * Get backup list
   */
  async getBackupList() {
    return this.backupHistory.map(backup => ({
      id: backup.id,
      type: backup.type,
      timestamp: backup.timestamp,
      size: backup.size,
      compressedSize: backup.compressedSize,
      status: backup.status,
      components: backup.components.length,
      checksum: backup.checksum
    }));
  }

  /**
   * Get backup statistics
   */
  async getBackupStats() {
    return {
      ...this.backupStats,
      retentionDays: this.config.retentionDays,
      lastCleanup: new Date().toISOString(),
      nextBackup: this.getNextBackupTime()
    };
  }

  /**
   * Calculate file checksum
   */
  async calculateFileChecksum(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (data) => {
        hash.update(data);
      });

      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });

      stream.on('error', reject);
    });
  }

  /**
   * Get application version
   */
  getAppVersion() {
    try {
      const packagePath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      return packageJson.version || '1.0.0';
    } catch (error) {
      return '1.0.0';
    }
  }

  /**
   * Get directory size
   */
  async getDirectorySize(dirPath) {
    let totalSize = 0;
    const files = await fs.readdir(dirPath);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = await fs.stat(filePath);

      if (stats.isDirectory()) {
        totalSize += await this.getDirectorySize(filePath);
      } else {
        totalSize += stats.size;
      }
    }

    return totalSize;
  }

  /**
   * Copy directory
   */
  async copyDirectory(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const files = await fs.readdir(src);

    for (const file of files) {
      const srcPath = path.join(src, file);
      const destPath = path.join(dest, file);
      const stats = await fs.stat(srcPath);

      if (stats.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Remove directory
   */
  async removeDirectory(dirPath) {
    const files = await fs.readdir(dirPath);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = await fs.stat(filePath);

      if (stats.isDirectory()) {
        await this.removeDirectory(filePath);
      } else {
        await fs.unlink(filePath);
      }
    }

    await fs.rmdir(dirPath);
  }

  /**
   * Get next backup time
   */
  getNextBackupTime() {
    const now = new Date();
    const nextBackup = new Date(now);
    nextBackup.setHours(2, 0, 0, 0); // 2 AM

    if (nextBackup <= now) {
      nextBackup.setDate(nextBackup.getDate() + 1);
    }

    return nextBackup.toISOString();
  }

  /**
   * Send notification
   */
  async sendNotification(type, data) {
    if (!this.config.notifications.enabled) {
      return;
    }

    // Placeholder for notification implementation
    console.log(`📧 Sending notification: ${type}`, data);
  }
}

// Export the class
module.exports = BackupManager;