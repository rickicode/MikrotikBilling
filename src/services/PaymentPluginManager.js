/**
 * Payment Plugin Manager
 *
 * Manages loading, configuration, and execution of payment gateway plugins
 * Handles plugin lifecycle, health monitoring, and error recovery
 */

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { PaymentPluginInterface } = require('../lib/PaymentPlugin');

class PaymentPluginManager {
  constructor(databaseInstance = null) {
    this.db = databaseInstance;
    this.plugins = new Map();
    this.pluginConfigurations = new Map();
    this.transactionHandlers = new Map();
    this.activePlugins = new Set();
    this.logger = console;
  }

  /**
   * Initialize the Payment Plugin Manager
   */
  async initialize() {
    try {
      this.logger.info({
        message: 'Initializing Payment Plugin Manager...',
        timestamp: new Date().toISOString(),
        active_plugins: this.activePlugins.size,
        total_transactions: this.transactionHandlers.size
      });

      // Load plugin configurations from database
      await this.loadPluginConfigurations();

      // Load all available plugins
      await this.loadPlugins();

      this.logger.info({
        message: 'Payment Plugin Manager initialized successfully',
        timestamp: new Date().toISOString(),
        active_plugins: this.activePlugins.size,
        total_transactions: this.transactionHandlers.size
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to initialize Payment Plugin Manager', {
        timestamp: new Date().toISOString(),
        active_plugins: this.activePlugins.size,
        total_transactions: this.transactionHandlers.size,
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Load plugin configurations from database
   */
  async loadPluginConfigurations() {
    try {
      if (!this.db) {
        this.logger.warn('No database instance available, skipping plugin configuration loading');
        return;
      }

      const plugins = await this.db.getMany('payment_plugins', { is_enabled: true });

      for (const plugin of plugins) {
        const config = {
          id: plugin.id,
          name: plugin.name,
          version: plugin.version,
          description: plugin.description,
          author: plugin.author,
          file_path: plugin.file_path,
          config_schema: plugin.config_schema,
          is_enabled: plugin.is_enabled,
          installed_at: plugin.installed_at,
          updated_at: plugin.updated_at
        };

        this.pluginConfigurations.set(plugin.name, config);
        this.logger.info(`Loaded plugin configuration: ${plugin.name}`);
      }
    } catch (error) {
      this.logger.error('Failed to load plugin configurations:', error);
    }
  }

  /**
   * Load all plugins from the plugins directory
   */
  async loadPlugins() {
    try {
      const pluginsDir = path.join(__dirname, '../plugins/payments');

      // Ensure plugins directory exists
      try {
        await fs.access(pluginsDir);
      } catch {
        await fs.mkdir(pluginsDir, { recursive: true });
        this.logger.info(`Created plugins directory: ${pluginsDir}`);
        return;
      }

      const entries = await fs.readdir(pluginsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Load plugin from subdirectory
          await this.loadPluginFromDirectory(path.join(pluginsDir, entry.name));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
          // Load plugin from direct file (legacy support)
          await this.loadPlugin(path.join(pluginsDir, entry.name));
        }
      }
    } catch (error) {
      this.logger.error('Failed to load plugins:', error);
    }
  }

  /**
   * Load plugin from directory (new structure)
   */
  async loadPluginFromDirectory(pluginDir) {
    try {
      const pluginName = path.basename(pluginDir);

      // Read manifest
      const manifestPath = path.join(pluginDir, 'manifest.json');
      let manifest;
      try {
        this.logger.info(`Loading plugin from directory: ${pluginDir}`);
        this.logger.info(`Reading manifest from: ${manifestPath}`);
        const manifestContent = await fs.readFile(manifestPath, 'utf8');
        manifest = JSON.parse(manifestContent);
        this.logger.info(`Successfully loaded manifest for plugin ${pluginName}: v${manifest.version}`);
      } catch (error) {
        this.logger.error(`Missing or invalid manifest.json for plugin ${pluginName}:`, {
          error: error.message,
          manifestPath: manifestPath,
          pluginDir: pluginDir
        });
        return;
      }

      // Get main file from manifest
      const mainFile = manifest.main || 'index.js';
      const pluginPath = path.join(pluginDir, mainFile);

      // Check if plugin is enabled in database
      const config = this.pluginConfigurations.get(pluginName);
      if (config && !config.is_enabled) {
        this.logger.info(`Plugin ${pluginName} is disabled, skipping`);
        return;
      }

      // Clear require cache to reload plugin
      delete require.cache[require.resolve(pluginPath)];

      const PluginClass = require(pluginPath);

      // Initialize plugin
      const pluginInstance = new PluginClass();

      // Validate plugin using PaymentPluginInterface
      try {
        PaymentPluginInterface.validate(pluginInstance);
      } catch (error) {
        this.logger.error(`Plugin ${pluginName} does not implement PaymentPluginInterface: ${error.message}`);
        return;
      }

      // Store plugin with manifest
      this.plugins.set(pluginName, {
        instance: pluginInstance,
        path: pluginPath,
        manifest: manifest,
        config: config,
        loaded_at: new Date(),
        is_active: false
      });

      this.logger.info(`Loaded plugin: ${pluginName} v${manifest.version}`);

      // Activate plugin if configured
      if (config && config.is_enabled) {
        await this.activatePlugin(pluginName);
      }
    } catch (error) {
      this.logger.error(`Failed to load plugin from directory ${pluginDir}:`, error);
    }
  }

  /**
   * Load a single plugin
   */
  async loadPlugin(pluginPath) {
    try {
      const pluginName = path.basename(pluginPath, '.js');

      // Check if plugin is enabled in database
      const config = this.pluginConfigurations.get(pluginName);
      if (config && !config.is_enabled) {
        this.logger.info(`Plugin ${pluginName} is disabled, skipping`);
        return;
      }

      // Clear require cache to reload plugin
      delete require.cache[require.resolve(pluginPath)];

      const PluginClass = require(pluginPath);

      // Initialize plugin
      const pluginInstance = new PluginClass();

      // Validate plugin using PaymentPluginInterface
      try {
        PaymentPluginInterface.validate(pluginInstance);
      } catch (error) {
        this.logger.error(`Plugin ${pluginName} does not implement PaymentPluginInterface: ${error.message}`);
        return;
      }

      // Store plugin
      this.plugins.set(pluginName, {
        instance: pluginInstance,
        path: pluginPath,
        config: config,
        loaded_at: new Date(),
        is_active: false
      });

      this.logger.info(`Loaded plugin: ${pluginName}`);

      // Activate plugin if configured
      if (config && config.is_enabled) {
        await this.activatePlugin(pluginName);
      }
    } catch (error) {
      this.logger.error(`Failed to load plugin ${pluginPath}:`, error);
    }
  }

  /**
   * Activate a plugin
   */
  async activatePlugin(pluginName) {
    try {
      const plugin = this.plugins.get(pluginName);
      if (!plugin) {
        throw new Error(`Plugin ${pluginName} not found`);
      }

      // Check if this is a default system plugin
      const isDefaultPlugin = ['duitku', 'manual'].includes(pluginName);

      // Initialize plugin if it has initialize method
      if (typeof plugin.instance.initialize === 'function') {
        try {
          await plugin.instance.initialize(plugin.config || {});
        } catch (initError) {
          // For default plugins, log warning but still mark as active
          if (isDefaultPlugin) {
            this.logger.warn(`Default plugin ${pluginName} initialization failed, but keeping active: ${initError.message}`);
            // Don't throw error for default plugins
          } else {
            throw initError;
          }
        }
      }

      plugin.is_active = true;
      this.activePlugins.add(pluginName);

      this.logger.info(`Activated plugin: ${pluginName}`);
    } catch (error) {
      this.logger.error(`Failed to activate plugin ${pluginName}:`, error);
    }
  }

  /**
   * Deactivate a plugin
   */
  async deactivatePlugin(pluginName) {
    try {
      const plugin = this.plugins.get(pluginName);
      if (!plugin) {
        throw new Error(`Plugin ${pluginName} not found`);
      }

      // Cleanup plugin if it has cleanup method
      if (typeof plugin.instance.cleanup === 'function') {
        await plugin.instance.cleanup();
      }

      plugin.is_active = false;
      this.activePlugins.delete(pluginName);

      this.logger.info(`Deactivated plugin: ${pluginName}`);
    } catch (error) {
      this.logger.error(`Failed to deactivate plugin ${pluginName}:`, error);
    }
  }

  /**
   * Get active plugins for a payment method
   */
  getActivePlugins(paymentMethod = null) {
    const active = [];

    for (const [name, plugin] of this.plugins) {
      if (!plugin.is_active) continue;

      // If payment method specified, check if plugin supports it
      if (paymentMethod) {
        const supportedMethods = plugin.instance.getSupportedMethods?.() || [];
        if (!supportedMethods.includes(paymentMethod)) continue;
      }

      active.push({
        name,
        instance: plugin.instance,
        config: plugin.config
      });
    }

    return active;
  }

  /**
   * Create payment through active plugin
   */
  async createPayment(paymentData) {
    const { method, ...data } = paymentData;
    const activePlugins = this.getActivePlugins(method);

    if (activePlugins.length === 0) {
      throw new Error(`No active plugins found for payment method: ${method}`);
    }

    // Use first available plugin for now
    // In the future, this could be configured per payment method
    const plugin = activePlugins[0];

    try {
      const result = await plugin.instance.createPayment(data);

      // Store transaction handler for callback
      if (result.transactionId) {
        this.transactionHandlers.set(result.transactionId, {
          plugin: plugin.name,
          method,
          data,
          created_at: new Date()
        });
      }

      return result;
    } catch (error) {
      this.logger.error(`Payment creation failed with plugin ${plugin.name}:`, error);
      throw error;
    }
  }

  /**
   * Check payment status
   */
  async checkStatus(transactionId) {
    const handler = this.transactionHandlers.get(transactionId);
    if (!handler) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    const plugin = this.plugins.get(handler.plugin);
    if (!plugin || !plugin.is_active) {
      throw new Error(`Plugin ${handler.plugin} is not active`);
    }

    try {
      return await plugin.instance.checkStatus(transactionId);
    } catch (error) {
      this.logger.error(`Status check failed for transaction ${transactionId}:`, error);
      throw error;
    }
  }

  /**
   * Handle payment callback
   */
  async handleCallback(callbackData) {
    const transactionId = callbackData.transactionId || callbackData.id;

    if (!transactionId) {
      throw new Error('Transaction ID not found in callback data');
    }

    const handler = this.transactionHandlers.get(transactionId);
    if (!handler) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    const plugin = this.plugins.get(handler.plugin);
    if (!plugin || !plugin.is_active) {
      throw new Error(`Plugin ${handler.plugin} is not active`);
    }

    try {
      const result = await plugin.instance.handleCallback(callbackData);

      // Clean up transaction handler if payment is complete
      if (result.status === 'success' || result.status === 'failed' || result.status === 'cancelled') {
        this.transactionHandlers.delete(transactionId);
      }

      return result;
    } catch (error) {
      this.logger.error(`Callback handling failed for transaction ${transactionId}:`, error);
      throw error;
    }
  }

  /**
   * Get plugin by name
   */
  getPlugin(pluginName) {
    return this.plugins.get(pluginName);
  }

  /**
   * Get all loaded plugins
   */
  getAllPlugins() {
    const all = [];

    for (const [name, plugin] of this.plugins) {
      all.push({
        name,
        is_active: plugin.is_active,
        config: plugin.config,
        loaded_at: plugin.loaded_at
      });
    }

    return all;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    this.logger.info('Cleaning up Payment Plugin Manager...');

    // Deactivate all active plugins
    for (const pluginName of this.activePlugins) {
      await this.deactivatePlugin(pluginName);
    }

    // Clear all data
    this.plugins.clear();
    this.pluginConfigurations.clear();
    this.transactionHandlers.clear();
    this.activePlugins.clear();

    this.logger.info('Payment Plugin Manager cleaned up');
  }
}

module.exports = PaymentPluginManager;