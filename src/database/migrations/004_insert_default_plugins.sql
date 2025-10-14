-- Insert default payment plugins
INSERT INTO payment_plugins (name, version, description, author, file_path, is_enabled) VALUES
('duitku', '1.0.0', 'DuitKu Payment Gateway - Supports 80+ payment methods including Virtual Accounts, E-Wallets, and Over the Counter payments', 'System', 'src/plugins/payments/duitku', true),
('manual', '1.0.0', 'Manual/Cash Payment Gateway - Handles cash payments, credit/debt recording, and receipt generation', 'System', 'src/plugins/payments/manual', true)
ON CONFLICT (name) DO UPDATE SET
    version = EXCLUDED.version,
    description = EXCLUDED.description,
    file_path = EXCLUDED.file_path,
    is_enabled = true,
    updated_at = CURRENT_TIMESTAMP;

-- Add default configurations for duitku
INSERT INTO plugin_configurations (plugin_name, config_key, config_value) VALUES
('duitku', 'environment', 'sandbox'),
('duitku', 'api_key', ''),
('duitku', 'merchant_code', ''),
('duitku', 'callback_url', '/api/payments/duitku/callback'),
('duitku', 'return_url', '/payments/return'),
('duitku', 'expiry_minutes', '60')
ON CONFLICT (plugin_name, config_key) DO UPDATE SET
    config_value = EXCLUDED.config_value,
    updated_at = CURRENT_TIMESTAMP;

-- Add default configurations for manual
INSERT INTO plugin_configurations (plugin_name, config_key, config_value) VALUES
('manual', 'allow_credit', 'true'),
('manual', 'max_credit_amount', '500000'),
('manual', 'credit_terms_days', '30'),
('manual', 'auto_receipt', 'true'),
('manual', 'require_approval', 'false'),
('manual', 'receipt_template', 'default')
ON CONFLICT (plugin_name, config_key) DO UPDATE SET
    config_value = EXCLUDED.config_value,
    updated_at = CURRENT_TIMESTAMP;

-- Mark these plugins as system defaults (cannot be deleted)
-- Add a column to mark system plugins if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payment_plugins'
        AND column_name = 'is_system'
    ) THEN
        ALTER TABLE payment_plugins ADD COLUMN is_system BOOLEAN DEFAULT false;
        COMMENT ON COLUMN payment_plugins.is_system IS 'Indicates if this is a system plugin that cannot be deleted';

        -- Mark default plugins as system plugins
        UPDATE payment_plugins SET is_system = true WHERE name IN ('duitku', 'manual');
    END IF;
END $$;