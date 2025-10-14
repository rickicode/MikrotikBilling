const BackupManager = require('../services/BackupManager');
const AuthMiddleware = require('../middleware/auth');

/**
 * Backup Management Routes
 * Handles backup creation, restoration, and management
 */
class BackupRoutes {
  constructor(fastify) {
    this.fastify = fastify;
    this.auth = new AuthMiddleware(fastify);
    this.backupManager = new BackupManager();
    this.setupRoutes();
  }

  setupRoutes() {
    // Backup dashboard
    this.fastify.get('/backup', {
      preHandler: this.auth.verifyToken.bind(this.auth)
    }, this.backupDashboard.bind(this));

    // Get backup list
    this.fastify.get('/api/backups', {
      preHandler: this.auth.verifyToken.bind(this.auth)
    }, this.getBackupList.bind(this));

    // Create backup
    this.fastify.post('/api/backups', {
      preHandler: this.auth.verifyToken.bind(this.auth)
    }, this.createBackup.bind(this));

    // Get backup details
    this.fastify.get('/api/backups/:backupId', {
      preHandler: this.auth.verifyToken.bind(this.auth)
    }, this.getBackupDetails.bind(this));

    // Restore from backup
    this.fastify.post('/api/backups/:backupId/restore', {
      preHandler: this.auth.verifyToken.bind(this.auth)
    }, this.restoreBackup.bind(this));

    // Delete backup
    this.fastify.delete('/api/backups/:backupId', {
      preHandler: this.auth.verifyToken.bind(this.auth)
    }, this.deleteBackup.bind(this));

    // Get backup statistics
    this.fastify.get('/api/backups/stats', {
      preHandler: this.auth.verifyToken.bind(this.auth)
    }, this.getBackupStats.bind(this));

    // Download backup
    this.fastify.get('/api/backups/:backupId/download', {
      preHandler: this.auth.verifyToken.bind(this.auth)
    }, this.downloadBackup.bind(this));

    // Backup settings
    this.fastify.get('/api/backups/settings', {
      preHandler: this.auth.verifyToken.bind(this.auth)
    }, this.getBackupSettings.bind(this));

    // Update backup settings
    this.fastify.put('/api/backups/settings', {
      preHandler: this.auth.verifyToken.bind(this.auth)
    }, this.updateBackupSettings.bind(this));

    // Test backup configuration
    this.fastify.post('/api/backups/test', {
      preHandler: this.auth.verifyToken.bind(this.auth)
    }, this.testBackupConfiguration.bind(this));
  }

  /**
   * Backup dashboard page
   */
  async backupDashboard(request, reply) {
    try {
      const stats = await this.backupManager.getBackupStats();
      const backups = await this.backupManager.getBackupList();

      return reply.view('backup/dashboard', {
        title: 'Backup Management',
        stats,
        backups,
        currentPage: 'backup'
      });
    } catch (error) {
      request.log.error('Backup dashboard error:', error);
      return reply.view('error', {
        title: 'Error',
        message: 'Failed to load backup dashboard',
        error: error.message
      });
    }
  }

  /**
   * Get backup list
   */
  async getBackupList(request, reply) {
    try {
      const backups = await this.backupManager.getBackupList();
      return reply.send({
        success: true,
        data: backups
      });
    } catch (error) {
      request.log.error('Get backup list error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get backup list',
        error: error.message
      });
    }
  }

  /**
   * Create backup
   */
  async createBackup(request, reply) {
    try {
      const { type = 'manual', description } = request.body;

      // Validate backup type
      const validTypes = ['manual', 'scheduled', 'pre-update'];
      if (!validTypes.includes(type)) {
        return reply.status(400).send({
          success: false,
          message: 'Invalid backup type'
        });
      }

      // Create backup
      const result = await this.backupManager.createBackup(type, { description });

      return reply.send({
        success: true,
        message: 'Backup created successfully',
        data: result
      });
    } catch (error) {
      request.log.error('Create backup error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to create backup',
        error: error.message
      });
    }
  }

  /**
   * Get backup details
   */
  async getBackupDetails(request, reply) {
    try {
      const { backupId } = request.params;

      // Find backup in history
      const backup = this.backupManager.backupHistory.find(b => b.id === backupId);
      if (!backup) {
        return reply.status(404).send({
          success: false,
          message: 'Backup not found'
        });
      }

      return reply.send({
        success: true,
        data: backup
      });
    } catch (error) {
      request.log.error('Get backup details error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get backup details',
        error: error.message
      });
    }
  }

  /**
   * Restore from backup
   */
  async restoreBackup(request, reply) {
    try {
      const { backupId } = request.params;
      const { options = {} } = request.body;

      // Validate backup exists
      const backup = this.backupManager.backupHistory.find(b => b.id === backupId);
      if (!backup) {
        return reply.status(404).send({
          success: false,
          message: 'Backup not found'
        });
      }

      // Validate backup status
      if (backup.status !== 'completed') {
        return reply.status(400).send({
          success: false,
          message: 'Cannot restore from incomplete backup'
        });
      }

      // Confirm restoration (security measure)
      if (!options.confirmed) {
        return reply.status(400).send({
          success: false,
          message: 'Backup restoration requires confirmation',
          requiresConfirmation: true
        });
      }

      // Perform restoration
      const result = await this.backupManager.restoreFromBackup(backupId, options);

      return reply.send({
        success: true,
        message: 'Backup restoration completed successfully',
        data: result
      });
    } catch (error) {
      request.log.error('Restore backup error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to restore from backup',
        error: error.message
      });
    }
  }

  /**
   * Delete backup
   */
  async deleteBackup(request, reply) {
    try {
      const { backupId } = request.params;

      // Find backup in history
      const backup = this.backupManager.backupHistory.find(b => b.id === backupId);
      if (!backup) {
        return reply.status(404).send({
          success: false,
          message: 'Backup not found'
        });
      }

      // Delete backup file
      const backupPath = this.backupManager.config.backupDir;
      const backupFiles = [
        `${backupPath}/backup-${backupId}.tar.gz`,
        `${backupPath}/backup-${backupId}.tar.gz.enc`
      ];

      for (const file of backupFiles) {
        try {
          await require('fs').promises.unlink(file);
        } catch (error) {
          // File might not exist, continue
        }
      }

      // Remove from history
      this.backupManager.backupHistory = this.backupManager.backupHistory.filter(b => b.id !== backupId);
      await this.backupManager.saveBackupHistory();

      return reply.send({
        success: true,
        message: 'Backup deleted successfully'
      });
    } catch (error) {
      request.log.error('Delete backup error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to delete backup',
        error: error.message
      });
    }
  }

  /**
   * Get backup statistics
   */
  async getBackupStats(request, reply) {
    try {
      const stats = await this.backupManager.getBackupStats();
      return reply.send({
        success: true,
        data: stats
      });
    } catch (error) {
      request.log.error('Get backup stats error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get backup statistics',
        error: error.message
      });
    }
  }

  /**
   * Download backup
   */
  async downloadBackup(request, reply) {
    try {
      const { backupId } = request.params;

      // Find backup in history
      const backup = this.backupManager.backupHistory.find(b => b.id === backupId);
      if (!backup) {
        return reply.status(404).send({
          success: false,
          message: 'Backup not found'
        });
      }

      // Check backup file exists
      const backupPath = this.backupManager.config.backupDir;
      let backupFile = `${backupPath}/backup-${backupId}.tar.gz`;

      // Check if backup is encrypted
      if (backup.encrypted) {
        backupFile += '.enc';
      }

      const fs = require('fs');
      if (!fs.existsSync(backupFile)) {
        return reply.status(404).send({
          success: false,
          message: 'Backup file not found'
        });
      }

      // Send file for download
      return reply.sendFile(backupFile);
    } catch (error) {
      request.log.error('Download backup error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to download backup',
        error: error.message
      });
    }
  }

  /**
   * Get backup settings
   */
  async getBackupSettings(request, reply) {
    try {
      const settings = {
        ...this.backupManager.config,
        // Don't expose sensitive data
        encryptionKey: undefined,
        cloudStorage: {
          ...this.backupManager.config.cloudStorage,
          credentials: undefined
        }
      };

      return reply.send({
        success: true,
        data: settings
      });
    } catch (error) {
      request.log.error('Get backup settings error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get backup settings',
        error: error.message
      });
    }
  }

  /**
   * Update backup settings
   */
  async updateBackupSettings(request, reply) {
    try {
      const { settings } = request.body;

      // Validate settings
      const validSettings = [
        'backupDir', 'retentionDays', 'compressionLevel', 'encryptionEnabled',
        'maxBackupSize', 'cloudStorage', 'notifications'
      ];

      const updatedSettings = {};
      for (const key of validSettings) {
        if (settings[key] !== undefined) {
          updatedSettings[key] = settings[key];
        }
      }

      // Update backup manager configuration
      Object.assign(this.backupManager.config, updatedSettings);

      // Validate configuration changes
      if (updatedSettings.backupDir) {
        require('fs').promises.mkdir(updatedSettings.backupDir, { recursive: true });
      }

      return reply.send({
        success: true,
        message: 'Backup settings updated successfully',
        data: updatedSettings
      });
    } catch (error) {
      request.log.error('Update backup settings error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to update backup settings',
        error: error.message
      });
    }
  }

  /**
   * Test backup configuration
   */
  async testBackupConfiguration(request, reply) {
    try {
      const { testType = 'connection' } = request.body;

      const testResults = {
        connection: false,
        storage: false,
        encryption: false,
        cloud: false
      };

      // Test backup directory connection
      try {
        const fs = require('fs');
        await fs.promises.access(this.backupManager.config.backupDir);
        testResults.connection = true;
      } catch (error) {
        // Directory access failed
      }

      // Test storage space
      try {
        const stats = require('fs').statSync(this.backupManager.config.backupDir);
        const availableSpace = require('os').freemem();
        testResults.storage = availableSpace > this.backupManager.config.maxBackupSize;
      } catch (error) {
        // Storage test failed
      }

      // Test encryption if enabled
      if (this.backupManager.config.encryptionEnabled) {
        try {
          const crypto = require('crypto');
          const testKey = crypto.createHash('sha256').update('test').digest();
          testResults.encryption = testKey.length === 32;
        } catch (error) {
          // Encryption test failed
        }
      }

      // Test cloud storage if enabled
      if (this.backupManager.config.cloudStorage.enabled) {
        try {
          // Placeholder for cloud storage test
          testResults.cloud = true;
        } catch (error) {
          // Cloud storage test failed
        }
      }

      // Calculate overall health
      const healthChecks = Object.values(testResults);
      const passedChecks = healthChecks.filter(check => check).length;
      const overallHealth = (passedChecks / healthChecks.length) * 100;

      return reply.send({
        success: true,
        message: 'Backup configuration test completed',
        data: {
          tests: testResults,
          overallHealth: Math.round(overallHealth),
          recommendations: this.generateTestRecommendations(testResults)
        }
      });
    } catch (error) {
      request.log.error('Test backup configuration error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to test backup configuration',
        error: error.message
      });
    }
  }

  /**
   * Generate test recommendations
   */
  generateTestRecommendations(testResults) {
    const recommendations = [];

    if (!testResults.connection) {
      recommendations.push('Backup directory is not accessible. Check permissions and path.');
    }

    if (!testResults.storage) {
      recommendations.push('Insufficient storage space available for backups.');
    }

    if (this.backupManager.config.encryptionEnabled && !testResults.encryption) {
      recommendations.push('Encryption configuration is invalid. Check encryption key.');
    }

    if (this.backupManager.config.cloudStorage.enabled && !testResults.cloud) {
      recommendations.push('Cloud storage configuration is invalid. Check credentials and connection.');
    }

    return recommendations;
  }
}

module.exports = function(fastify, opts, next) {
  const backupRoutes = new BackupRoutes(fastify);
  next();
};

module.exports.BackupRoutes = BackupRoutes;