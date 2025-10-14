-- 006_create_whatsapp_system.sql

-- WhatsApp sessions
CREATE TABLE whatsapp_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    session_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20),
    status VARCHAR(20) DEFAULT 'disconnected', -- 'disconnected', 'connecting', 'connected', 'qr', 'error'
    priority INTEGER DEFAULT 0, -- Higher number = higher priority
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    qr_code TEXT, -- Base64 encoded QR code
    last_activity TIMESTAMP,
    webhook_url VARCHAR(255),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- WhatsApp contacts
CREATE TABLE whatsapp_contacts (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) REFERENCES whatsapp_sessions(session_id) ON DELETE CASCADE,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    display_name VARCHAR(100),
    profile_pic_url VARCHAR(255),
    is_blocked BOOLEAN DEFAULT false,
    is_business BOOLEAN DEFAULT false,
    business_description TEXT,
    last_message_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- WhatsApp messages
CREATE TABLE whatsapp_messages (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) REFERENCES whatsapp_sessions(session_id) ON DELETE CASCADE,
    message_id VARCHAR(100) NOT NULL,
    from_number VARCHAR(20) NOT NULL,
    to_number VARCHAR(20) NOT NULL,
    message_type VARCHAR(20) NOT NULL, -- 'text', 'image', 'document', 'audio', 'video', 'template'
    content TEXT,
    media_url VARCHAR(255),
    media_type VARCHAR(20),
    is_incoming BOOLEAN DEFAULT false,
    is_read BOOLEAN DEFAULT false,
    is_delivered BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'read', 'failed'
    error_message TEXT,
    external_id VARCHAR(100), -- Reference to external entity (e.g., invoice_id)
    metadata JSONB,
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- WhatsApp message queues
CREATE TABLE whatsapp_message_queues (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) REFERENCES whatsapp_sessions(session_id) ON DELETE CASCADE,
    queue_name VARCHAR(50) NOT NULL, -- 'high', 'normal', 'low', 'bulk'
    priority INTEGER DEFAULT 0,
    phone_number VARCHAR(20) NOT NULL,
    message_type VARCHAR(20) NOT NULL,
    content TEXT,
    media_url VARCHAR(255),
    template_name VARCHAR(100),
    template_data JSONB,
    external_id VARCHAR(100),
    max_retries INTEGER DEFAULT 3,
    retry_count INTEGER DEFAULT 0,
    next_retry_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'sent', 'failed', 'cancelled'
    error_message TEXT,
    scheduled_at TIMESTAMP,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- WhatsApp templates
CREATE TABLE whatsapp_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(50) NOT NULL, -- 'transactional', 'marketing', 'otp'
    language VARCHAR(10) DEFAULT 'id',
    content TEXT NOT NULL,
    variables JSONB, -- Template variables definition
    is_active BOOLEAN DEFAULT true,
    is_approved BOOLEAN DEFAULT false,
    created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- WhatsApp session statistics
CREATE TABLE whatsapp_session_stats (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) REFERENCES whatsapp_sessions(session_id) ON DELETE CASCADE,
    date DATE NOT NULL,
    messages_sent INTEGER DEFAULT 0,
    messages_received INTEGER DEFAULT 0,
    messages_failed INTEGER DEFAULT 0,
    total_sent_bytes BIGINT DEFAULT 0,
    total_received_bytes BIGINT DEFAULT 0,
    uptime_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, date)
);

-- WhatsApp webhook logs
CREATE TABLE whatsapp_webhook_logs (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) REFERENCES whatsapp_sessions(session_id) ON DELETE CASCADE,
    webhook_type VARCHAR(50) NOT NULL, -- 'message', 'status', 'qr', 'error'
    payload JSONB,
    response_status INTEGER,
    response_body TEXT,
    processing_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_whatsapp_sessions_session_id ON whatsapp_sessions(session_id);
CREATE INDEX idx_whatsapp_sessions_status ON whatsapp_sessions(status);
CREATE INDEX idx_whatsapp_sessions_priority ON whatsapp_sessions(priority);
CREATE INDEX idx_whatsapp_sessions_is_active ON whatsapp_sessions(is_active);
CREATE INDEX idx_whatsapp_contacts_session_id ON whatsapp_contacts(session_id);
CREATE INDEX idx_whatsapp_contacts_phone_number ON whatsapp_contacts(phone_number);
CREATE INDEX idx_whatsapp_messages_session_id ON whatsapp_messages(session_id);
CREATE INDEX idx_whatsapp_messages_message_id ON whatsapp_messages(message_id);
CREATE INDEX idx_whatsapp_messages_from_number ON whatsapp_messages(from_number);
CREATE INDEX idx_whatsapp_messages_to_number ON whatsapp_messages(to_number);
CREATE INDEX idx_whatsapp_messages_type ON whatsapp_messages(message_type);
CREATE INDEX idx_whatsapp_messages_status ON whatsapp_messages(status);
CREATE INDEX idx_whatsapp_messages_created_at ON whatsapp_messages(created_at);
CREATE INDEX idx_whatsapp_queues_session_id ON whatsapp_message_queues(session_id);
CREATE INDEX idx_whatsapp_queues_queue_name ON whatsapp_message_queues(queue_name);
CREATE INDEX idx_whatsapp_queues_priority ON whatsapp_message_queues(priority);
CREATE INDEX idx_whatsapp_queues_status ON whatsapp_message_queues(status);
CREATE INDEX idx_whatsapp_queues_next_retry ON whatsapp_message_queues(next_retry_at);
CREATE INDEX idx_whatsapp_queues_scheduled_at ON whatsapp_message_queues(scheduled_at);
CREATE INDEX idx_whatsapp_templates_name ON whatsapp_templates(name);
CREATE INDEX idx_whatsapp_templates_category ON whatsapp_templates(category);
CREATE INDEX idx_whatsapp_templates_is_active ON whatsapp_templates(is_active);
CREATE INDEX idx_whatsapp_session_stats_session_date ON whatsapp_session_stats(session_id, date);
CREATE INDEX idx_whatsapp_webhook_logs_session_id ON whatsapp_webhook_logs(session_id);
CREATE INDEX idx_whatsapp_webhook_logs_type ON whatsapp_webhook_logs(webhook_type);

-- Create triggers for updated_at
CREATE TRIGGER update_whatsapp_sessions_updated_at
    BEFORE UPDATE ON whatsapp_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_contacts_updated_at
    BEFORE UPDATE ON whatsapp_contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_messages_updated_at
    BEFORE UPDATE ON whatsapp_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_message_queues_updated_at
    BEFORE UPDATE ON whatsapp_message_queues
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_templates_updated_at
    BEFORE UPDATE ON whatsapp_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();