const AuthMiddleware = require('../middleware/auth');

async function adminRoutes(fastify, options) {
  const auth = new AuthMiddleware(fastify);
  const db = fastify.db;

  // Dashboard
  fastify.get('/dashboard', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    try {
      // Get statistics with error handling
      let stats = {
        totalCustomers: 0,
        activeSubscriptions: 0,
        todayRevenue: 0,
        pendingPayments: 0
      };

      try {
        const customerResult = await db.query('SELECT COUNT(*) as count FROM customers WHERE is_active = true');
      stats.totalCustomers = customerResult.rows && customerResult.rows.length > 0 ? customerResult.rows[0].count : 0;
      } catch (error) {
        console.warn('Error getting customer count:', error.message);
      }

      try {
        const subscriptionResult = await db.query('SELECT COUNT(*) as count FROM subscriptions WHERE status = \'active\'');
      stats.activeSubscriptions = subscriptionResult.rows && subscriptionResult.rows.length > 0 ? subscriptionResult.rows[0].count : 0;
      } catch (error) {
        console.warn('Error getting subscription count:', error.message);
      }

      try {
        const revenueResult = await db.query(
          'SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = \'paid\' AND DATE(created_at) = CURRENT_DATE'
        );
      stats.todayRevenue = revenueResult.rows && revenueResult.rows.length > 0 ? revenueResult.rows[0].total : 0;
      } catch (error) {
        console.warn('Error getting today revenue:', error.message);
      }

      try {
        const pendingResult = await db.query('SELECT COUNT(*) as count FROM payments WHERE status = \'pending\'');
      stats.pendingPayments = pendingResult.rows && pendingResult.rows.length > 0 ? pendingResult.rows[0].count : 0;
      } catch (error) {
        console.warn('Error getting pending payments count:', error.message);
      }

      // Get recent activities with error handling
      let recentActivities = [];
      try {
        recentActivities = await db.query(`
          SELECT aal.action, aal.created_at, au.username as admin_name,
                 aal.target_type, aal.details
          FROM admin_activity_logs aal
          JOIN admin_users au ON aal.admin_id = au.id
          ORDER BY aal.created_at DESC
          LIMIT 10
        `);
      } catch (error) {
        console.warn('Error getting recent activities:', error.message);
        recentActivities = [];
      }

      return reply.view('admin/dashboard', {
        admin: request.admin,
        stats,
        recentActivities,
        currentUrl: request.url,
        settings: reply.locals.settings
      });
    } catch (error) {
            fastify.log.error('Internal Server Error:', error);
            return reply.code(500).send({
                success: false,
                message: 'Internal Server Error',
                error: {
                    detail: error.message,
                    type: error.constructor.name,
                    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
                }
            });
    }
  });

  // Profile
  fastify.get('/profile', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    return reply.view('admin/profile', {
      admin: request.admin,
      currentUrl: request.url,
      settings: reply.locals.settings
    });
  });

  // Update profile
  fastify.post('/profile', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    const { current_password, new_password, confirm_password } = request.body;

    try {
      if (new_password && new_password !== confirm_password) {
        return reply.view('admin/profile', {
          admin: request.admin,
          error: 'New passwords do not match'
        });
      }

      if (new_password) {
        // Verify current password
        const adminResult = await db.query(
          'SELECT password_hash FROM admin_users WHERE id = $1',
          [request.admin.id]
        );
      const admin = adminResult.rows && adminResult.rows.length > 0 ? adminResult.rows[0] : null;

        if (!await auth.verifyPassword(current_password, admin.password_hash)) {
          return reply.view('admin/profile', {
            admin: request.admin,
            error: 'Current password is incorrect'
          });
        }

        // Update password
        const hashedPassword = await auth.hashPassword(new_password);
        await db.query(
          'UPDATE admin_users SET password_hash = $1 WHERE id = $2',
          [hashedPassword, request.admin.id]
        );
      }

      // Log activity
      await auth.logActivity(request.admin.id, 'update_profile', null, null, null, request);

      return reply.view('admin/profile', {
        admin: request.admin,
        success: 'Profile updated successfully'
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.view('admin/profile', {
        admin: request.admin,
        error: 'Failed to update profile'
      });
    }
  });

  // Settings
  fastify.get('/settings', {
    preHandler: [auth.requireRole('super_admin')]
  }, async (request, reply) => {
    const settingsResult = await db.query('SELECT key, value, description FROM settings ORDER BY key');
    const settings = settingsResult.rows || settingsResult || [];
    const settingsMap = {};
    settings.forEach(setting => {
      settingsMap[setting.key] = setting.value;
    });

    return reply.view('admin/settings', {
      admin: request.admin,
      settings: settingsMap
    });
  });

  // Template Settings
  fastify.get('/templates', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    const settingsResult = await db.query('SELECT key, value, description FROM settings ORDER BY key');
    const settings = settingsResult.rows || settingsResult || [];
    const settingsMap = {};
    settings.forEach(setting => {
      settingsMap[setting.key] = setting.value;
    });

    // Load current template content from data/print folder
    const fs = require('fs');
    const path = require('path');
    const currentTemplateType = settingsMap.template_type || 'a4';
    const templatePath = path.join(__dirname, '../../data/print', `template_${currentTemplateType}.html`);

    let currentTemplateContent = '';
    try {
      if (fs.existsSync(templatePath)) {
        currentTemplateContent = fs.readFileSync(templatePath, 'utf8');
      }
    } catch (error) {
      console.warn('Error loading template:', error.message);
    }

    return reply.view('admin/templates', {
      admin: request.admin,
      settings: settingsMap,
      currentTemplate: currentTemplateContent,
      success: request.query.success,
      error: request.query.error
    });
  });

  // Save template settings
  fastify.post('/templates', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    const { template_type, template_content, print_template_type } = request.body;

    try {
      const fs = require('fs');
      const path = require('path');

      // Create data/print directory if it doesn't exist
      const dataDir = path.join(__dirname, '../../data/print');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Save template as HTML file in data/print folder
      const templateFileName = `template_${template_type}.html`;
      const templateFilePath = path.join(dataDir, templateFileName);

      fs.writeFileSync(templateFilePath, template_content, 'utf8');

      // Also save to main data folder for backward compatibility
      const mainDataDir = path.join(__dirname, '../../data');
      const mainTemplatePath = path.join(mainDataDir, templateFileName);
      fs.writeFileSync(mainTemplatePath, template_content, 'utf8');

      // Save print template type setting
      if (print_template_type) {
        await db.query(`
          INSERT INTO settings (key, value, description, updated_at)
          VALUES ('print_template_type', $1, 'Default print template type', CURRENT_TIMESTAMP)
          ON CONFLICT (key) DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = CURRENT_TIMESTAMP
        `, [print_template_type]);
      }

      // Log the template save action
      fastify.log.info(`Template ${template_type} saved to file: ${templateFilePath}`);

      return reply.send({
        success: true,
        message: 'Template berhasil disimpan ke file'
      });
    } catch (error) {
      fastify.log.error('Error saving template to file:', error);
      reply.status(500).send({
        success: false,
        message: 'Gagal menyimpan template ke file: ' + error.message
      });
    }
  });

  // API untuk mendapatkan template default
  fastify.get('/api/templates/default/:type', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    const { type } = request.params;
    const fs = require('fs');
    const path = require('path');

    try {
      // Validasi template type
      if (!['a4', 'thermal'].includes(type)) {
        return reply.code(400).send({
          success: false,
          message: 'Template type tidak valid. Gunakan a4 atau thermal'
        });
      }

      // Path ke template default
      const templatePath = path.join(__dirname, '../../data/print/default', `template_${type}.html`);

      // Cek apakah file template ada
      if (!fs.existsSync(templatePath)) {
        return reply.code(404).send({
          success: false,
          message: `File template ${type} tidak ditemukan`
        });
      }

      // Baca template file
      const templateContent = fs.readFileSync(templatePath, 'utf8');

      return reply.send({
        success: true,
        template: templateContent,
        type: type,
        message: `Template default ${type} berhasil dimuat`
      });

    } catch (error) {
      fastify.log.error('Error loading default template:', error);
      return reply.code(500).send({
        success: false,
        message: 'Gagal memuat template: ' + error.message
      });
    }
  });

  // Redirect old mikrotik-config route to settings mikrotik tab
  fastify.get('/mikrotik-config', {
    preHandler: [auth.requireRole('super_admin')]
  }, async (request, reply) => {
    return reply.redirect('/admin/settings?tab=mikrotik');
  });

  // Redirect old mikrotik-config POST to settings
  fastify.post('/mikrotik-config', {
    preHandler: [auth.requireRole('super_admin')]
  }, async (request, reply) => {
    const { host, port, username, password, use_ssl } = request.body;

    try {
      // Clear existing Mikrotik settings before updating
      await db.query(`
        DELETE FROM settings
        WHERE key IN ('mikrotik_host', 'mikrotik_port', 'mikrotik_username', 'mikrotik_password', 'mikrotik_use_ssl')
      `);

      // Update settings in database
      await db.query(`
        INSERT INTO settings (key, value, description, updated_at)
        VALUES ('mikrotik_host', $1, 'Mikrotik IP address', CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = CURRENT_TIMESTAMP
      `, [host]);

      await db.query(`
        INSERT INTO settings (key, value, description, updated_at)
        VALUES ('mikrotik_port', $1, 'Mikrotik API port', CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = CURRENT_TIMESTAMP
      `, [port]);

      await db.query(`
        INSERT INTO settings (key, value, description, updated_at)
        VALUES ('mikrotik_username', $1, 'Mikrotik API username', CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = CURRENT_TIMESTAMP
      `, [username]);

      await db.query(`
        INSERT INTO settings (key, value, description, updated_at)
        VALUES ('mikrotik_password', $1, 'Mikrotik API password', CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = CURRENT_TIMESTAMP
      `, [password]);

      await db.query(`
        INSERT INTO settings (key, value, description, updated_at)
        VALUES ('mikrotik_use_ssl', $1, 'Use SSL for Mikrotik connection', CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = CURRENT_TIMESTAMP
      `, [use_ssl ? 'true' : 'false']);

      // Reload Mikrotik client configuration
      fastify.mikrotik.reloadConfig();

      // Test connection
      let connectionTest = 'unknown';
      try {
        const connected = await fastify.mikrotik.connect();
        connectionTest = connected ? 'success' : 'failed';
      } catch (error) {
        connectionTest = 'error';
      }

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'update_mikrotik_config',
        null,
        null,
        { host, port, username, connection_test: connectionTest },
        request
      );

      return reply.redirect('/admin/settings?tab=mikrotik&success=Mikrotik configuration updated successfully&connection=' + connectionTest);
    } catch (error) {
      fastify.log.error(error);
      return reply.redirect('/admin/settings?tab=mikrotik&error=Failed to update Mikrotik configuration');
    }
  });

  // Update settings
  fastify.post('/settings', {
    preHandler: [auth.requireRole('super_admin')]
  }, async (request, reply) => {
    const { settings } = request.body;

    try {
      // Clear any existing cache before updating
      await db.query('DELETE FROM settings WHERE key IN (SELECT key FROM settings)');

      for (const [key, value] of Object.entries(settings)) {
        await db.query(`
          INSERT INTO settings (key, value, description, updated_at)
          VALUES ($1, $2,
            COALESCE((SELECT description FROM settings WHERE key = $3), 'System setting'),
            CURRENT_TIMESTAMP)
          ON CONFLICT (key) DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = CURRENT_TIMESTAMP
        `, [key, value, key]);
      }

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'update_settings',
        null,
        null,
        { updated_settings: Object.keys(settings) },
        request
      );

      return reply.redirect('/admin/settings?success=Settings updated successfully');
    } catch (error) {
      fastify.log.error(error);
      return reply.redirect('/admin/settings?error=Failed to update settings');
    }
  });

  // Admin users management (super admin only)
  fastify.get('/users', {
    preHandler: [auth.requireRole('super_admin')]
  }, async (request, reply) => {
    const admins = await db.query(`
      SELECT id, username, role, permissions, last_login, created_at
      FROM admin_users
      ORDER BY created_at DESC
    `);

    return reply.view('admin/users', {
      admin: request.admin,
      admins
    });
  });

  // Create admin user
  fastify.post('/users', {
    preHandler: [auth.requireRole('super_admin')]
  }, async (request, reply) => {
    const { username, password, role, permissions } = request.body;

    try {
      // Check if username exists
      const existingResult = await db.query(
        'SELECT id FROM admin_users WHERE username = $1',
        [username]
      );
      const existing = existingResult.rows && existingResult.rows.length > 0 ? existingResult.rows[0] : null;

      if (existing) {
        return reply.view('admin/users', {
          admin: request.admin,
          admins: await db.query('SELECT * FROM admin_users ORDER BY created_at DESC'),
          error: 'Username already exists'
        });
      }

      // Create admin user
      const hashedPassword = await auth.hashPassword(password);
      const result = await db.query(
        'INSERT INTO admin_users (username, password_hash, role, permissions) VALUES ($1, $2, $3, $4) RETURNING *',
        [username, hashedPassword, role, permissions || '{}']
      );

      // Log activity
      await auth.logActivity(
        request.admin.id,
        'create_admin',
        'admin_user',
result.rows[0].id,
        { username, role },
        request
      );

      return reply.redirect('/admin/users?success=Admin user created successfully');
    } catch (error) {
      fastify.log.error(error);
      return reply.redirect('/admin/users?error=Failed to create admin user');
    }
  });

  // Helper function for action badge classes
  function getActionBadgeClass(action) {
    const badgeClasses = {
      'create': 'success',
      'update': 'warning',
      'delete': 'danger',
      'login': 'info',
      'logout': 'secondary',
      'view': 'primary'
    };
    return badgeClasses[action] || 'secondary';
  }

  // Activity logs
  fastify.get('/logs', {
    preHandler: [auth.requireRole('admin')]
  }, async (request, reply) => {
    const page = parseInt(request.query.page) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;

    const logs = await db.query(`
      SELECT aal.*, au.username as admin_name
      FROM admin_activity_logs aal
      JOIN admin_users au ON aal.admin_id = au.id
      ORDER BY aal.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const totalResult = await db.query('SELECT COUNT(*) as count FROM admin_activity_logs');
      const total = totalResult.rows && totalResult.rows.length > 0 ? totalResult.rows[0].count : 0;

    return reply.view('admin/logs', {
      title: 'Log Aktivitas',
      admin: request.admin,
      logs,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        from: offset + 1,
        to: Math.min(offset + limit, total),
        total
      },
      getActionBadgeClass
    });
  });
}

module.exports = adminRoutes;