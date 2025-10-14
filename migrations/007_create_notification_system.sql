-- 007_create_notification_system.sql

-- Notification channels
CREATE TABLE notification_channels (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    type VARCHAR(20) NOT NULL, -- 'whatsapp', 'email', 'sms', 'push'
    config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    rate_limit INTEGER DEFAULT 30, -- messages per minute
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notification templates
CREATE TABLE notification_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    channel_id INTEGER REFERENCES notification_channels(id) ON DELETE CASCADE,
    event_trigger VARCHAR(100) NOT NULL, -- 'payment_received', 'subscription_expired', etc.
    subject_template TEXT,
    content_template TEXT NOT NULL,
    variables JSONB, -- Variable definitions
    is_active BOOLEAN DEFAULT true,
    language VARCHAR(10) DEFAULT 'id',
    created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notification logs
CREATE TABLE notification_logs (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES notification_channels(id),
    template_id INTEGER REFERENCES notification_templates(id),
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(255),
    content TEXT NOT NULL,
    variables JSONB,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'read', 'failed'
    error_message TEXT,
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMP,
    external_id VARCHAR(100), -- Reference to external entity
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notification schedules
CREATE TABLE notification_schedules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    template_id INTEGER REFERENCES notification_templates(id) ON DELETE CASCADE,
    schedule_type VARCHAR(20) NOT NULL, -- 'recurring', 'one-time', 'conditional'
    schedule_config JSONB NOT NULL, -- Cron expression or date/delay
    conditions JSONB, -- Conditions for sending
    is_active BOOLEAN DEFAULT true,
    last_run_at TIMESTAMP,
    next_run_at TIMESTAMP,
    run_count INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notification preferences (customer-specific)
CREATE TABLE notification_preferences (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    channel_id INTEGER REFERENCES notification_channels(id),
    event_type VARCHAR(100) NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    preferred_time TIME, -- Preferred time for notifications
    timezone VARCHAR(50) DEFAULT 'Asia/Jakarta',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(customer_id, channel_id, event_type)
);

-- Message queue for notifications
CREATE TABLE notification_queue (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES notification_channels(id),
    template_id INTEGER REFERENCES notification_templates(id),
    priority VARCHAR(20) DEFAULT 'normal', -- 'high', 'normal', 'low'
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(255),
    content TEXT NOT NULL,
    variables JSONB,
    external_id VARCHAR(100),
    send_after TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expire_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'sent', 'failed', 'expired'
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    last_attempt_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notification statistics
CREATE TABLE notification_stats (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES notification_channels(id),
    date DATE NOT NULL,
    event_type VARCHAR(100),
    total_sent INTEGER DEFAULT 0,
    total_delivered INTEGER DEFAULT 0,
    total_failed INTEGER DEFAULT 0,
    total_read INTEGER DEFAULT 0,
    avg_delivery_time_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(channel_id, date, event_type)
);

-- Create indexes
CREATE INDEX idx_notification_channels_type ON notification_channels(type);
CREATE INDEX idx_notification_channels_is_active ON notification_channels(is_active);
CREATE INDEX idx_notification_templates_channel_id ON notification_templates(channel_id);
CREATE INDEX idx_notification_templates_event_trigger ON notification_templates(event_trigger);
CREATE INDEX idx_notification_templates_is_active ON notification_templates(is_active);
CREATE INDEX idx_notification_logs_channel_id ON notification_logs(channel_id);
CREATE INDEX idx_notification_logs_template_id ON notification_logs(template_id);
CREATE INDEX idx_notification_logs_recipient ON notification_logs(recipient);
CREATE INDEX idx_notification_logs_status ON notification_logs(status);
CREATE INDEX idx_notification_logs_created_at ON notification_logs(created_at);
CREATE INDEX idx_notification_logs_next_retry ON notification_logs(next_retry_at);
CREATE INDEX idx_notification_schedules_template_id ON notification_schedules(template_id);
CREATE INDEX idx_notification_schedules_type ON notification_schedules(schedule_type);
CREATE INDEX idx_notification_schedules_is_active ON notification_schedules(is_active);
CREATE INDEX idx_notification_schedules_next_run ON notification_schedules(next_run_at);
CREATE INDEX idx_notification_preferences_customer_id ON notification_preferences(customer_id);
CREATE INDEX idx_notification_preferences_event_type ON notification_preferences(event_type);
CREATE INDEX idx_notification_queue_channel_id ON notification_queue(channel_id);
CREATE INDEX idx_notification_queue_priority ON notification_queue(priority);
CREATE INDEX idx_notification_queue_status ON notification_queue(status);
CREATE INDEX idx_notification_queue_send_after ON notification_queue(send_after);
CREATE INDEX idx_notification_queue_expire_at ON notification_queue(expire_at);
CREATE INDEX idx_notification_stats_channel_date ON notification_stats(channel_id, date);
CREATE INDEX idx_notification_stats_event_type ON notification_stats(event_type);

-- Create triggers for updated_at
CREATE TRIGGER update_notification_channels_updated_at
    BEFORE UPDATE ON notification_channels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_templates_updated_at
    BEFORE UPDATE ON notification_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_logs_updated_at
    BEFORE UPDATE ON notification_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_schedules_updated_at
    BEFORE UPDATE ON notification_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_queue_updated_at
    BEFORE UPDATE ON notification_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default notification channels
INSERT INTO notification_channels (name, type, config, priority, rate_limit) VALUES
('whatsapp_primary', 'whatsapp', '{"session": "primary", "enabled": true}', 100, 30),
('whatsapp_backup', 'whatsapp', '{"session": "backup", "enabled": true}', 90, 30);

-- Insert default notification templates
INSERT INTO notification_templates (name, channel_id, event_trigger, subject_template, content_template, variables, is_active) VALUES
('payment_received', 1, 'payment_received', null, '🎉 Pembayaran Berhasil!\n\nTerima kasih atas pembayaran Anda sebesar {{amount}} untuk invoice {{invoice_number}}.\n\nStatus: PAID\nTanggal: {{payment_date}}\n\nSilakan hubungi kami jika ada pertanyaan.', '{"amount": "number", "invoice_number": "string", "payment_date": "date"}', true),
('subscription_expired', 1, 'subscription_expired', null, '⚠️ Subscription Expired\n\nHai {{customer_name}},\n\nSubscription Anda untuk {{service_name}} telah expired pada {{expiry_date}}.\n\nSegera perpanjang untuk melanjutkan layanan.\n\nTerima kasih.', '{"customer_name": "string", "service_name": "string", "expiry_date": "date"}', true),
('welcome_message', 1, 'customer_created', null, '👋 Selamat Datang di {{company_name}}!\n\nTerima kasih telah mendaftar, {{customer_name}}!\n\nNomor HP: {{phone_number}}\n\nKami siap melayani kebutuhan internet Anda.\n\nHubungi kami untuk informasi lebih lanjut.', '{"company_name": "string", "customer_name": "string", "phone_number": "string"}', true);