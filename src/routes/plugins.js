/**
 * Plugin Management Routes
 *
 * Handles plugin installation, activation, configuration, and management
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

module.exports = async function (fastify, opts) {

  // Plugin Manager Dashboard
  fastify.get('/plugins', async (request, reply) => {
    try {
      // Get all installed plugins
      const pluginManager = fastify.paymentPluginManager;
      const plugins = pluginManager.getAllPlugins();

      // Get plugin configurations from database
      const dbPlugins = await fastify.db.getMany('payment_plugins', {});

      reply.view('admin/plugins/index', {
        plugins,
        dbPlugins,
        title: 'Plugin Management',
        currentRoute: 'plugins'
      });
    } catch (error) {
      fastify.log.error('Error loading plugins page:', error);
      reply.code(500).send({ error: 'Failed to load plugins' });
    }
  });

  // Get plugin details
  fastify.get('/plugins/:name', async (request, reply) => {
    try {
      const { name } = request.params;
      const pluginManager = fastify.paymentPluginManager;
      const plugin = pluginManager.getPlugin(name);

      if (!plugin) {
        return reply.code(404).send({ error: 'Plugin not found' });
      }

      // Get plugin configuration
      const config = await fastify.db.getMany('plugin_configurations', {
        plugin_name: name
      });

      const configObj = {};
      config.forEach(c => {
        configObj[c.config_key] = c.config_value;
      });

      reply.send({
        plugin: {
          name,
          is_active: plugin.is_active,
          config: configObj,
          loaded_at: plugin.loaded_at
        }
      });
    } catch (error) {
      fastify.log.error('Error getting plugin details:', error);
      reply.code(500).send({ error: 'Failed to get plugin details' });
    }
  });

  // Get plugin manifest
  fastify.get('/plugins/:name/manifest', async (request, reply) => {
    try {
      const { name } = request.params;
      const pluginManager = fastify.paymentPluginManager;
      const plugin = pluginManager.getPlugin(name);

      if (!plugin || !plugin.manifest) {
        return reply.code(404).send({ error: 'Plugin manifest not found' });
      }

      reply.send(plugin.manifest);
    } catch (error) {
      fastify.log.error('Error getting plugin manifest:', error);
      reply.code(500).send({ error: 'Failed to get plugin manifest' });
    }
  });

  // Upload new plugin
  fastify.post('/plugins/upload', async (request, reply) => {
    try {
      // For now, return a placeholder response
      // ZIP extraction functionality needs additional dependencies
      reply.send({
        success: false,
        message: 'Plugin upload functionality is under development',
        note: 'Please manually extract plugins to /src/plugins/payments/[plugin-name]/'
      });
    } catch (error) {
      fastify.log.error('Error uploading plugin:', error);
      reply.code(500).send({ error: 'Failed to upload plugin' });
    }
  });

  // Toggle plugin activation
  fastify.post('/plugins/:name/toggle', async (request, reply) => {
    try {
      const { name } = request.params;
      const { active } = request.body;

      const pluginManager = fastify.paymentPluginManager;

      if (active) {
        await pluginManager.activatePlugin(name);
        await fastify.db.update('payment_plugins',
          { status: 'active' },
          { name }
        );
      } else {
        await pluginManager.deactivatePlugin(name);
        await fastify.db.update('payment_plugins',
          { status: 'inactive' },
          { name }
        );
      }

      reply.send({
        success: true,
        message: `Plugin ${active ? 'activated' : 'deactivated'} successfully`
      });

    } catch (error) {
      fastify.log.error('Error toggling plugin:', error);
      reply.code(500).send({ error: 'Failed to toggle plugin' });
    }
  });

  // Update plugin configuration
  fastify.put('/plugins/:name/config', async (request, reply) => {
    try {
      const { name } = request.params;
      const config = request.body;

      // Update configuration in database
      for (const [key, value] of Object.entries(config)) {
        await fastify.db.query(`
          INSERT INTO plugin_configurations (plugin_name, config_key, config_value)
          VALUES ($1, $2, $3)
          ON CONFLICT (plugin_name, config_key)
          DO UPDATE SET config_value = $3, updated_at = CURRENT_TIMESTAMP
        `, [name, key, JSON.stringify(value)]);
      }

      // Reload plugin if active
      const pluginManager = fastify.paymentPluginManager;
      const plugin = pluginManager.getPlugin(name);
      if (plugin && plugin.is_active) {
        await pluginManager.deactivatePlugin(name);
        await pluginManager.activatePlugin(name);
      }

      reply.send({
        success: true,
        message: 'Configuration updated successfully'
      });

    } catch (error) {
      fastify.log.error('Error updating plugin config:', error);
      reply.code(500).send({ error: 'Failed to update configuration' });
    }
  });

  // Delete plugin
  fastify.delete('/plugins/:name', async (request, reply) => {
    try {
      const { name } = request.params;

      // Cannot delete built-in plugins
      if (['duitku', 'manual'].includes(name)) {
        return reply.code(400).send({ error: 'Cannot delete built-in plugin' });
      }

      // Deactivate plugin first
      const pluginManager = fastify.paymentPluginManager;
      await pluginManager.deactivatePlugin(name);

      // Remove plugin directory
      const pluginDir = path.join(__dirname, '../plugins/payments', name);
      await fs.rmdir(pluginDir, { recursive: true });

      // Remove from database
      await fastify.db.delete('payment_plugins', { name });
      await fastify.db.delete('plugin_configurations', { plugin_name: name });

      reply.send({
        success: true,
        message: 'Plugin deleted successfully'
      });

    } catch (error) {
      fastify.log.error('Error deleting plugin:', error);
      reply.code(500).send({ error: 'Failed to delete plugin' });
    }
  });

  // Get plugin logs
  fastify.get('/plugins/:name/logs', async (request, reply) => {
    try {
      const { name } = request.params;
      const { limit = 100 } = request.query;

      const logs = await fastify.db.getMany('plugin_error_logs',
        { plugin_name: name },
        { order: 'created_at DESC', limit: parseInt(limit) }
      );

      reply.send({ logs });

    } catch (error) {
      fastify.log.error('Error getting plugin logs:', error);
      reply.code(500).send({ error: 'Failed to get plugin logs' });
    }
  });
};

