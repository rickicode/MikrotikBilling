/**
 * Centralized Plugin Registration Manager
 * 
 * Handles plugin loading with proper dependency management, error handling,
 * and performance monitoring for the Mikrotik Billing System.
 */

const fp = require('fastify-plugin');
const LoggerService = require('../services/LoggerService');

class PluginRegistry {
  constructor() {
    this.plugins = new Map();
    this.dependencies = new Map();
    this.loadOrder = [];
    this.loadedPlugins = new Set();
    this.failedPlugins = new Set();
    this.logger = new LoggerService('PluginRegistry');
    this.metrics = {
      totalPlugins: 0,
      loadedPlugins: 0,
      failedPlugins: 0,
      loadTimes: new Map()
    };
  }

  /**
   * Register a plugin with its dependencies and configuration
   */
  register(name, plugin, options = {}) {
    if (this.plugins.has(name)) {
      throw new Error(`Plugin ${name} is already registered`);
    }

    this.plugins.set(name, {
      name,
      plugin,
      options,
      dependencies: options.dependencies || [],
      priority: options.priority || 0,
      required: options.required !== false,
      environment: options.environment || 'all',
      healthCheck: options.healthCheck,
      gracefulShutdown: options.gracefulShutdown
    });

    this.metrics.totalPlugins++;
    this.logger.debug(`Plugin registered: ${name}`, {
      dependencies: options.dependencies,
      priority: options.priority,
      required: options.required
    });
  }

  /**
   * Calculate optimal load order based on dependencies and priority
   */
  calculateLoadOrder() {
    const visited = new Set();
    const visiting = new Set();
    const order = [];

    const visit = (pluginName) => {
      if (visiting.has(pluginName)) {
        throw new Error(`Circular dependency detected: ${pluginName}`);
      }
      if (visited.has(pluginName)) {
        return;
      }

      visiting.add(pluginName);
      const plugin = this.plugins.get(pluginName);
      
      if (!plugin) {
        throw new Error(`Plugin ${pluginName} not found`);
      }

      // Visit dependencies first
      for (const dep of plugin.dependencies) {
        visit(dep);
      }

      visiting.delete(pluginName);
      visited.add(pluginName);
      order.push(pluginName);
    };

    // Visit all plugins
    for (const [name] of this.plugins) {
      visit(name);
    }

    // Sort by priority (higher priority loads first)
    order.sort((a, b) => {
      const priorityA = this.plugins.get(a).priority;
      const priorityB = this.plugins.get(b).priority;
      return priorityB - priorityA;
    });

    this.loadOrder = order;
    this.logger.debug('Plugin load order calculated', { order });
    return order;
  }

  /**
   * Load all plugins in dependency order
   */
  async loadPlugins(server) {
    const startTime = Date.now();
    
    try {
      this.calculateLoadOrder();
      
      this.logger.info('Loading plugins', {
        totalPlugins: this.metrics.totalPlugins,
        loadOrder: this.loadOrder
      });

      for (const pluginName of this.loadOrder) {
        await this.loadPlugin(server, pluginName);
      }

      const totalTime = Date.now() - startTime;
      this.logger.info('All plugins loaded successfully', {
        loadedPlugins: this.metrics.loadedPlugins,
        failedPlugins: this.metrics.failedPlugins,
        totalTime
      });

      return {
        loaded: this.metrics.loadedPlugins,
        failed: this.metrics.failedPlugins,
        totalTime
      };

    } catch (error) {
      this.logger.error('Plugin loading failed', {
        error: error.message,
        stack: error.stack,
        loadedPlugins: this.metrics.loadedPlugins,
        failedPlugins: this.metrics.failedPlugins
      });
      throw error;
    }
  }

  /**
   * Load individual plugin with error handling
   */
  async loadPlugin(server, pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin ${pluginName} not found`);
    }

    // Check if plugin is suitable for current environment
    if (plugin.environment !== 'all' && plugin.environment !== process.env.NODE_ENV) {
      this.logger.debug(`Skipping plugin ${pluginName} (environment mismatch)`, {
        pluginEnvironment: plugin.environment,
        currentEnvironment: process.env.NODE_ENV
      });
      return;
    }

    // Check if dependencies are loaded
    for (const dep of plugin.dependencies) {
      if (!this.loadedPlugins.has(dep)) {
        const depPlugin = this.plugins.get(dep);
        if (depPlugin && depPlugin.required) {
          throw new Error(`Required dependency ${dep} not loaded for plugin ${pluginName}`);
        }
      }
    }

    const startTime = Date.now();
    
    try {
      this.logger.debug(`Loading plugin: ${pluginName}`);

      // Register plugin with server
      await server.register(plugin.plugin, plugin.options);

      const loadTime = Date.now() - startTime;
      this.metrics.loadTimes.set(pluginName, loadTime);
      this.loadedPlugins.add(pluginName);
      this.metrics.loadedPlugins++;

      // Run plugin health check if available
      if (plugin.healthCheck) {
        try {
          const health = await plugin.healthCheck(server);
          this.logger.debug(`Plugin health check: ${pluginName}`, health);
        } catch (healthError) {
          this.logger.warn(`Plugin health check failed: ${pluginName}`, {
            error: healthError.message
          });
        }
      }

      this.logger.info(`Plugin loaded: ${pluginName}`, {
        loadTime,
        dependencies: plugin.dependencies
      });

    } catch (error) {
      const loadTime = Date.now() - startTime;
      this.failedPlugins.add(pluginName);
      this.metrics.failedPlugins++;

      this.logger.error(`Failed to load plugin: ${pluginName}`, {
        error: error.message,
        stack: error.stack,
        loadTime,
        dependencies: plugin.dependencies
      });

      if (plugin.required) {
        throw new Error(`Required plugin ${pluginName} failed to load: ${error.message}`);
      } else {
        this.logger.warn(`Optional plugin ${pluginName} failed to load, continuing...`);
      }
    }
  }

  /**
   * Get plugin status and metrics
   */
  getPluginStatus() {
    return {
      total: this.metrics.totalPlugins,
      loaded: this.metrics.loadedPlugins,
      failed: this.metrics.failedPlugins,
      loadedPlugins: Array.from(this.loadedPlugins),
      failedPlugins: Array.from(this.failedPlugins),
      loadTimes: Object.fromEntries(this.metrics.loadTimes),
      loadOrder: this.loadOrder
    };
  }

  /**
   * Perform health check on all loaded plugins
   */
  async performHealthChecks(server) {
    const healthResults = {};
    
    for (const pluginName of this.loadedPlugins) {
      const plugin = this.plugins.get(pluginName);
      if (plugin.healthCheck) {
        try {
          const startTime = Date.now();
          const health = await plugin.healthCheck(server);
          const responseTime = Date.now() - startTime;
          
          healthResults[pluginName] = {
            status: 'healthy',
            responseTime,
            ...health
          };
        } catch (error) {
          healthResults[pluginName] = {
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
          };
        }
      }
    }

    return healthResults;
  }

  /**
   * Gracefully shutdown all plugins
   */
  async shutdownPlugins(server) {
    this.logger.info('Shutting down plugins...');
    
    // Shutdown in reverse order
    const shutdownOrder = [...this.loadOrder].reverse();
    
    for (const pluginName of shutdownOrder) {
      if (this.loadedPlugins.has(pluginName)) {
        const plugin = this.plugins.get(pluginName);
        
        if (plugin.gracefulShutdown) {
          try {
            this.logger.debug(`Shutting down plugin: ${pluginName}`);
            await plugin.gracefulShutdown(server);
            this.logger.debug(`Plugin shutdown complete: ${pluginName}`);
          } catch (error) {
            this.logger.error(`Plugin shutdown failed: ${pluginName}`, {
              error: error.message
            });
          }
        }
      }
    }

    this.logger.info('Plugin shutdown completed');
  }

  /**
   * Get plugin dependencies
   */
  getDependencies(pluginName) {
    const plugin = this.plugins.get(pluginName);
    return plugin ? plugin.dependencies : [];
  }

  /**
   * Check if plugin is loaded
   */
  isPluginLoaded(pluginName) {
    return this.loadedPlugins.has(pluginName);
  }

  /**
   * Get plugin load time
   */
  getPluginLoadTime(pluginName) {
    return this.metrics.loadTimes.get(pluginName);
  }
}

// Create singleton instance
const pluginRegistry = new PluginRegistry();

module.exports = {
  PluginRegistry,
  pluginRegistry
};
