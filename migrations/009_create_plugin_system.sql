-- 009_create_plugin_system.sql

-- Plugin registry
CREATE TABLE plugin_registry (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    version VARCHAR(20) NOT NULL,
    category VARCHAR(50) NOT NULL, -- 'payment', 'notification', 'integration', 'theme'
    description TEXT,
    author VARCHAR(100),
    website VARCHAR(255),
    repository VARCHAR(255),
    license VARCHAR(50),
    minimum_node_version VARCHAR(20),
    dependencies JSONB, -- Plugin dependencies
    permissions JSONB, -- Required permissions
    status VARCHAR(20) DEFAULT 'installed', -- 'installed', 'active', 'disabled', 'error', 'updating'
    manifest JSONB NOT NULL,
    config_schema JSONB, -- Configuration schema
    default_config JSONB, -- Default configuration
    install_path VARCHAR(500),
    checksum VARCHAR(64), -- SHA256 checksum
    installed_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Plugin hooks registry
CREATE TABLE plugin_hooks (
    id SERIAL PRIMARY KEY,
    plugin_name VARCHAR(100) REFERENCES plugin_registry(name) ON DELETE CASCADE,
    hook_name VARCHAR(100) NOT NULL,
    hook_type VARCHAR(20) NOT NULL, -- 'action', 'filter', 'event'
    priority INTEGER DEFAULT 10,
    function_name VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(plugin_name, hook_name)
);

-- Plugin configurations
CREATE TABLE plugin_configurations_ext (
    id SERIAL PRIMARY KEY,
    plugin_name VARCHAR(100) REFERENCES plugin_registry(name) ON DELETE CASCADE,
    config_key VARCHAR(100) NOT NULL,
    config_value TEXT,
    config_type VARCHAR(20) DEFAULT 'string', -- 'string', 'number', 'boolean', 'json', 'encrypted'
    is_encrypted BOOLEAN DEFAULT false,
    is_public BOOLEAN DEFAULT false, -- Whether config can be exposed to frontend
    validation_rules JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plugin_name) REFERENCES plugin_registry(name),
    UNIQUE(plugin_name, config_key)
);

-- Plugin updates
CREATE TABLE plugin_updates (
    id SERIAL PRIMARY KEY,
    plugin_name VARCHAR(100) REFERENCES plugin_registry(name) ON DELETE CASCADE,
    from_version VARCHAR(20) NOT NULL,
    to_version VARCHAR(20) NOT NULL,
    update_file VARCHAR(500),
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'downloading', 'installing', 'completed', 'failed'
    download_url VARCHAR(500),
    checksum VARCHAR(64),
    file_size_bytes BIGINT DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Plugin backups
CREATE TABLE plugin_backups (
    id SERIAL PRIMARY KEY,
    plugin_name VARCHAR(100) REFERENCES plugin_registry(name) ON DELETE CASCADE,
    version VARCHAR(20) NOT NULL,
    backup_path VARCHAR(500),
    backup_size_bytes BIGINT DEFAULT 0,
    is_automatic BOOLEAN DEFAULT false,
    created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Plugin metrics
CREATE TABLE plugin_metrics (
    id SERIAL PRIMARY KEY,
    plugin_name VARCHAR(100) REFERENCES plugin_registry(name) ON DELETE CASCADE,
    date DATE NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15,2) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(plugin_name, date, metric_name)
);

-- Plugin event log
CREATE TABLE plugin_event_log (
    id SERIAL PRIMARY KEY,
    plugin_name VARCHAR(100) REFERENCES plugin_registry(name) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- 'installed', 'activated', 'deactivated', 'error', 'updated'
    event_message TEXT,
    event_data JSONB,
    user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Plugin dependencies tracking
CREATE TABLE plugin_dependencies (
    id SERIAL PRIMARY KEY,
    plugin_name VARCHAR(100) REFERENCES plugin_registry(name) ON DELETE CASCADE,
    dependency_name VARCHAR(100) NOT NULL,
    dependency_version VARCHAR(50), -- version constraint like "^1.0.0" or ">=2.0.0"
    is_optional BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(plugin_name, dependency_name)
);

-- Plugin marketplace cache
CREATE TABLE plugin_marketplace (
    id SERIAL PRIMARY KEY,
    plugin_id VARCHAR(100) UNIQUE NOT NULL, -- Marketplace plugin ID
    name VARCHAR(100) NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    version VARCHAR(20) NOT NULL,
    description TEXT,
    author VARCHAR(100),
    downloads INTEGER DEFAULT 0,
    rating DECIMAL(3,2) DEFAULT 0,
    category VARCHAR(50),
    tags JSONB,
    download_url VARCHAR(500),
    demo_url VARCHAR(500),
    documentation_url VARCHAR(500),
    last_checked_at TIMESTAMP,
    is_cached BOOLEAN DEFAULT false,
    cached_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_plugin_registry_name ON plugin_registry(name);
CREATE INDEX idx_plugin_registry_category ON plugin_registry(category);
CREATE INDEX idx_plugin_registry_status ON plugin_registry(status);
CREATE INDEX idx_plugin_hooks_plugin_name ON plugin_hooks(plugin_name);
CREATE INDEX idx_plugin_hooks_hook_name ON plugin_hooks(hook_name);
CREATE INDEX idx_plugin_hooks_is_active ON plugin_hooks(is_active);
CREATE INDEX idx_plugin_configurations_ext_plugin ON plugin_configurations_ext(plugin_name);
CREATE INDEX idx_plugin_configurations_ext_is_encrypted ON plugin_configurations_ext(is_encrypted);
CREATE INDEX idx_plugin_updates_plugin_name ON plugin_updates(plugin_name);
CREATE INDEX idx_plugin_updates_status ON plugin_updates(status);
CREATE INDEX idx_plugin_backups_plugin_name ON plugin_backups(plugin_name);
CREATE INDEX idx_plugin_backups_version ON plugin_backups(version);
CREATE INDEX idx_plugin_metrics_plugin_date ON plugin_metrics(plugin_name, date);
CREATE INDEX idx_plugin_metrics_metric_name ON plugin_metrics(metric_name);
CREATE INDEX idx_plugin_event_log_plugin_name ON plugin_event_log(plugin_name);
CREATE INDEX idx_plugin_event_log_event_type ON plugin_event_log(event_type);
CREATE INDEX idx_plugin_event_log_created_at ON plugin_event_log(created_at);
CREATE INDEX idx_plugin_dependencies_plugin ON plugin_dependencies(plugin_name);
CREATE INDEX idx_plugin_dependencies_dependency ON plugin_dependencies(dependency_name);
CREATE INDEX idx_plugin_marketplace_category ON plugin_marketplace(category);
CREATE INDEX idx_plugin_marketplace_is_cached ON plugin_marketplace(is_cached);
CREATE INDEX idx_plugin_marketplace_last_checked ON plugin_marketplace(last_checked_at);

-- Create triggers for updated_at
CREATE TRIGGER update_plugin_registry_updated_at
    BEFORE UPDATE ON plugin_registry
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plugin_configurations_ext_updated_at
    BEFORE UPDATE ON plugin_configurations_ext
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plugin_marketplace_updated_at
    BEFORE UPDATE ON plugin_marketplace
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to check plugin dependencies
CREATE OR REPLACE FUNCTION check_plugin_dependencies()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if all required dependencies are installed and active
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        IF NEW.status = 'active' THEN
            -- This would be called by application code
            -- to verify all dependencies are met
            NULL;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for dependency checking
CREATE TRIGGER check_plugin_dependencies_trigger
    BEFORE UPDATE ON plugin_registry
    FOR EACH ROW EXECUTE FUNCTION check_plugin_dependencies();