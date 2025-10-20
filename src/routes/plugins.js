/**
 * Plugin Management Routes - WordPress Style Interface
 *
 * Handles plugin installation, activation, configuration, and management
 */

const { db } = require('../database/DatabaseManager');
const auth = require('../middleware/auth');
const { ApiErrorHandler } = require('../middleware/apiErrorHandler');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const pluginRoutes = (fastify, options, done) => {
    // Plugin Management Dashboard - WordPress Style
    fastify.get('/', { preHandler: auth.verifyToken }, async (request, reply) => {
        try {
            // Get all plugins from database
            const pluginsResult = await db.query(`
                SELECT
                    id,
                    name,
                    version,
                    author,
                    description,
                    is_enabled as is_active,
                    has_error,
                    error_message,
                    '{}'::jsonb as settings,
                    installed_at,
                    updated_at
                FROM payment_plugins
                ORDER BY name ASC
            `);

            const plugins = pluginsResult.rows || [];

            // Get built-in plugins from file system
            const pluginManager = fastify.paymentPluginManager;
            const builtInPlugins = pluginManager ? pluginManager.getAllPlugins() : [];

            // Merge database plugins with built-in plugins
            const allPlugins = plugins.map(dbPlugin => {
                const builtInPlugin = builtInPlugins.find(bp => bp.name === dbPlugin.name);
                return {
                    ...dbPlugin,
                    is_builtin: !!builtInPlugin,
                    loaded_at: builtInPlugin ? builtInPlugin.loaded_at : null,
                    manifest: builtInPlugin ? builtInPlugin.manifest : null
                };
            });

            // Add built-in plugins that aren't in database
            builtInPlugins.forEach(builtInPlugin => {
                if (!plugins.find(p => p.name === builtInPlugin.name)) {
                    allPlugins.push({
                        id: null,
                        name: builtInPlugin.name,
                        version: builtInPlugin.manifest?.version || '1.0.0',
                        author: builtInPlugin.manifest?.author || 'System',
                        description: builtInPlugin.manifest?.description || builtInPlugin.description || 'Built-in plugin',
                        is_active: builtInPlugin.is_active,
                        has_error: builtInPlugin.has_error || false,
                        error_message: builtInPlugin.error_message || null,
                        settings: builtInPlugin.settings || {},
                        installed_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        is_builtin: true,
                        loaded_at: builtInPlugin.loaded_at,
                        manifest: builtInPlugin.manifest
                    });
                }
            });

            // Get plugin statistics
            const statsResult = await db.query(`
                SELECT
                    COUNT(*) as total_plugins,
                    COUNT(CASE WHEN is_enabled = true THEN 1 END) as active_plugins,
                    COUNT(CASE WHEN has_error = true THEN 1 END) as error_plugins
                FROM payment_plugins
            `);

            const stats = statsResult.rows[0] || {
                total_plugins: allPlugins.length,
                active_plugins: allPlugins.filter(p => p.is_active).length,
                error_plugins: allPlugins.filter(p => p.has_error).length
            };

            return reply.view('plugins/index', {
                admin: request.admin,
                plugins: allPlugins,
                stats,
                successMessage: request.query.success || null,
                errorMessage: request.query.error || null
            });

        } catch (error) {
            fastify.log.error('Error loading plugins page:', error);
            return reply.code(500).view('error', {
                error: 'Internal Server Error',
                detail: error.message
            });
        }
    });

    // API: Get all plugins
    fastify.get('/api/plugins', { preHandler: auth.verifyTokenAPI }, ApiErrorHandler.asyncHandler(async (request, reply) => {
        const pluginsResult = await db.query(`
            SELECT
                id,
                name,
                version,
                author,
                description,
                is_enabled as is_active,
                has_error,
                error_message,
                '{}'::jsonb as settings,
                installed_at,
                updated_at
            FROM payment_plugins
            ORDER BY name ASC
        `);

        // Get built-in plugins
        const pluginManager = fastify.paymentPluginManager;
        const builtInPlugins = pluginManager ? pluginManager.getAllPlugins() : [];

        // Merge database plugins with built-in plugins
        const allPlugins = pluginsResult.rows.map(dbPlugin => {
            const builtInPlugin = builtInPlugins.find(bp => bp.name === dbPlugin.name);
            return {
                ...dbPlugin,
                is_builtin: !!builtInPlugin,
                loaded_at: builtInPlugin ? builtInPlugin.loaded_at : null,
                manifest: builtInPlugin ? builtInPlugin.manifest : null
            };
        });

        // Add built-in plugins that aren't in database
        builtInPlugins.forEach(builtInPlugin => {
            if (!pluginsResult.rows.find(p => p.name === builtInPlugin.name)) {
                allPlugins.push({
                    id: null,
                    name: builtInPlugin.name,
                    version: builtInPlugin.manifest?.version || '1.0.0',
                    author: builtInPlugin.manifest?.author || 'System',
                    description: builtInPlugin.manifest?.description || builtInPlugin.description || 'Built-in plugin',
                    is_active: builtInPlugin.is_active,
                    has_error: builtInPlugin.has_error || false,
                    error_message: builtInPlugin.error_message || null,
                    settings: builtInPlugin.settings || {},
                    installed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    is_builtin: true,
                    loaded_at: builtInPlugin.loaded_at,
                    manifest: builtInPlugin.manifest
                });
            }
        });

        return reply.send({
            success: true,
            data: allPlugins
        });
    }));

    // API: Toggle plugin activation
    fastify.post('/api/plugins/:name/toggle', { preHandler: auth.verifyTokenAPI }, ApiErrorHandler.asyncHandler(async (request, reply) => {
        const { name } = request.params;
        const { active } = request.body;

        const pluginManager = fastify.paymentPluginManager;
        if (!pluginManager) {
            return reply.code(503).send({
                success: false,
                message: 'Plugin manager not available'
            });
        }

        // Check if plugin exists
        const plugin = pluginManager.getPlugin(name);
        if (!plugin) {
            return ApiErrorHandler.notFoundError(reply, 'Plugin not found');
        }

        // Cannot deactivate built-in critical plugins
        if (!active && ['duitku', 'manual'].includes(name)) {
            return ApiErrorHandler.validationError(reply, 'Cannot deactivate built-in critical plugin');
        }

        if (active) {
            await pluginManager.activatePlugin(name);
        } else {
            await pluginManager.deactivatePlugin(name);
        }

        // Update database
        await db.query(`
            INSERT INTO payment_plugins (name, version, author, description, is_enabled, installed_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
            ON CONFLICT (name)
            DO UPDATE SET
                is_enabled = $5,
                has_error = false,
                error_message = NULL,
                updated_at = NOW()
        `, [
            name,
            plugin.manifest?.version || '1.0.0',
            plugin.manifest?.author || 'System',
            plugin.manifest?.description || plugin.description || 'Built-in plugin',
            active
        ]);

        // Log activity
        await db.query(`
            INSERT INTO activity_logs (user_id, action, details, created_at)
            VALUES ($1, $2, $3::jsonb, NOW())
        `, [request.admin.id, `plugin_${active ? 'activated' : 'deactivated'}`, JSON.stringify({
            plugin_name: name,
            action: active ? 'activated' : 'deactivated',
            message: `Plugin "${name}" ${active ? 'activated' : 'deactivated'}`
        })]);

        return reply.send({
            success: true,
            message: `Plugin ${active ? 'activated' : 'deactivated'} successfully`
        });
    }));

    // API: Update plugin configuration
    fastify.put('/api/plugins/:name/config', { preHandler: auth.verifyTokenAPI }, ApiErrorHandler.asyncHandler(async (request, reply) => {
        const { name } = request.params;
        const config = request.body;

        // Validate config object
        if (typeof config !== 'object' || config === null) {
            return ApiErrorHandler.validationError(reply, 'Invalid configuration format');
        }

        // Update configuration in database
        await db.query(`
            INSERT INTO plugin_configurations (plugin_name, config_key, config_value, created_at, updated_at)
            VALUES ($1, $2, $3, NOW(), NOW())
            ON CONFLICT (plugin_name, config_key)
            DO UPDATE SET
                config_value = $3,
                updated_at = NOW()
        `, [name, 'main_config', JSON.stringify(config)]);

        // Reload plugin if active
        const pluginManager = fastify.paymentPluginManager;
        if (pluginManager) {
            const plugin = pluginManager.getPlugin(name);
            if (plugin && plugin.is_active) {
                await pluginManager.deactivatePlugin(name);
                await pluginManager.activatePlugin(name);
            }
        }

        // Log activity
        await db.query(`
            INSERT INTO activity_logs (user_id, action, details, created_at)
            VALUES ($1, $2, $3::jsonb, NOW())
        `, [request.admin.id, 'plugin_config_updated', JSON.stringify({
            plugin_name: name,
            action: 'config_updated',
            message: `Configuration updated for plugin "${name}"`
        })]);

        return reply.send({
            success: true,
            message: 'Configuration updated successfully'
        });
    }));

    // API: Get plugin logs
    fastify.get('/api/plugins/:name/logs', { preHandler: auth.verifyTokenAPI }, ApiErrorHandler.asyncHandler(async (request, reply) => {
        const { name } = request.params;
        const { limit = 100, level = 'all' } = request.query;

        let query = `
            SELECT created_at, level, message, details
            FROM plugin_error_logs
            WHERE plugin_name = $1
        `;
        const params = [name];

        if (level !== 'all') {
            query += ` AND level = $2`;
            params.push(level);
        }

        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
        params.push(parseInt(limit));

        const logsResult = await db.query(query, params);

        return reply.send({
            success: true,
            data: logsResult.rows || []
        });
    }));

    // Plugin Settings Page
    fastify.get('/:name/settings', { preHandler: auth.verifyToken }, async (request, reply) => {
        try {
            const { name } = request.params;

            // Get plugin details
            const pluginResult = await db.query(`
                SELECT
                    id,
                    name,
                    version,
                    author,
                    description,
                    is_enabled as is_active,
                    has_error,
                    error_message,
                    '{}'::jsonb as settings,
                    installed_at,
                    updated_at
                FROM payment_plugins
                WHERE name = $1
            `, [name]);

            let plugin = pluginResult.rows[0];

            // If not in database, get from built-in plugins
            if (!plugin) {
                const pluginManager = fastify.paymentPluginManager;
                if (pluginManager) {
                    const builtInPlugin = pluginManager.getPlugin(name);
                    if (builtInPlugin) {
                        plugin = {
                            id: null,
                            name: builtInPlugin.name,
                            version: builtInPlugin.manifest?.version || '1.0.0',
                            author: builtInPlugin.manifest?.author || 'System',
                            description: builtInPlugin.manifest?.description || builtInPlugin.description || 'Built-in plugin',
                            is_active: builtInPlugin.is_active,
                            has_error: builtInPlugin.has_error || false,
                            error_message: builtInPlugin.error_message || null,
                            settings: builtInPlugin.settings || {},
                            installed_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                            is_builtin: true,
                            loaded_at: builtInPlugin.loaded_at,
                            manifest: builtInPlugin.manifest
                        };
                    }
                }
            }

            if (!plugin) {
                return reply.code(404).view('error', {
                    error: 'Plugin Not Found',
                    detail: 'The requested plugin does not exist.'
                });
            }

            return reply.view('plugins/settings', {
                title: `${plugin.displayName || plugin.name} Settings`,
                admin: request.admin,
                plugin,
                successMessage: request.query.success || null,
                errorMessage: request.query.error || null
            });

        } catch (error) {
            fastify.log.error('Error loading plugin settings page:', error);
            return reply.code(500).view('error', {
                error: 'Internal Server Error',
                detail: error.message
            });
        }
    });

    done();
};

module.exports = pluginRoutes;