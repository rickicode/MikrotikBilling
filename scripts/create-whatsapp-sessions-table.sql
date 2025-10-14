-- Create WhatsApp sessions table for multi-session management
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    session_name VARCHAR(255) NOT NULL,
    session_type VARCHAR(50) DEFAULT 'personal',
    phone_number VARCHAR(20),
    status VARCHAR(50) DEFAULT 'disconnected', -- disconnected, connecting, connected, qr
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    priority INTEGER DEFAULT 0,
    qr_code TEXT,
    connected_at TIMESTAMP,
    last_activity TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_session_id ON whatsapp_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_status ON whatsapp_sessions(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_is_active ON whatsapp_sessions(is_active);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_whatsapp_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_update_whatsapp_sessions_updated_at
    BEFORE UPDATE ON whatsapp_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_whatsapp_sessions_updated_at();

-- Insert sample data for testing
INSERT INTO whatsapp_sessions (session_id, session_name, session_type, phone_number, status, is_active, is_default, priority) VALUES
('session_main', 'Main Account', 'personal', '+628123456789', 'disconnected', true, true, 100),
('session_support', 'Support Team', 'support', '+628987654321', 'disconnected', true, false, 80),
('session_notification', 'Notification Bot', 'notification', '+628112233445', 'disconnected', true, false, 60);

-- Update sequence
SELECT setval('whatsapp_sessions_id_seq', (SELECT MAX(id) FROM whatsapp_sessions));