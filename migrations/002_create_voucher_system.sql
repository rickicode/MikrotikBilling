-- 002_create_voucher_system.sql

-- Voucher profiles table (synced from Mikrotik)
CREATE TABLE voucher_profiles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    price_buy DECIMAL(10,2) NOT NULL,
    price_sell DECIMAL(10,2) NOT NULL,
    duration_hours INTEGER NOT NULL,
    is_shared_users BOOLEAN DEFAULT false,
    user_limit INTEGER DEFAULT 1,
    rate_limit VARCHAR(50),
    validity_days INTEGER DEFAULT 1,
    mikrotik_id VARCHAR(50),
    last_sync_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vouchers table
CREATE TABLE vouchers (
    id SERIAL PRIMARY KEY,
    kode VARCHAR(50) UNIQUE NOT NULL,
    profile_id INTEGER REFERENCES voucher_profiles(id) ON DELETE CASCADE,
    price_sell DECIMAL(10,2) NOT NULL,
    duration_hours INTEGER NOT NULL,
    is_used BOOLEAN DEFAULT false,
    first_login_at TIMESTAMP,
    expires_at TIMESTAMP,
    mikrotik_user VARCHAR(50),
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Voucher usage logs
CREATE TABLE voucher_usage_logs (
    id SERIAL PRIMARY KEY,
    voucher_id INTEGER REFERENCES vouchers(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- 'created', 'first_login', 'expired', 'cleanup'
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Voucher batches
CREATE TABLE voucher_batches (
    id SERIAL PRIMARY KEY,
    prefix VARCHAR(20) NOT NULL,
    profile_id INTEGER REFERENCES voucher_profiles(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    price_sell DECIMAL(10,2) NOT NULL,
    duration_hours INTEGER NOT NULL,
    start_number INTEGER NOT NULL,
    end_number INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'completed', 'cancelled'
    created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Hotspot sessions (live data from Mikrotik)
CREATE TABLE hotspot_sessions (
    id SERIAL PRIMARY KEY,
    mikrotik_user VARCHAR(50) UNIQUE NOT NULL,
    ip_address INET,
    mac_address VARCHAR(17),
    session_id VARCHAR(50),
    login_time TIMESTAMP,
    uptime_seconds INTEGER DEFAULT 0,
    bytes_in BIGINT DEFAULT 0,
    bytes_out BIGINT DEFAULT 0,
    packet_in BIGINT DEFAULT 0,
    packet_out BIGINT DEFAULT 0,
    rate_limit VARCHAR(50),
    last_seen TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_vouchers_kode ON vouchers(kode);
CREATE INDEX idx_vouchers_profile_id ON vouchers(profile_id);
CREATE INDEX idx_vouchers_is_used ON vouchers(is_used);
CREATE INDEX idx_vouchers_expires_at ON vouchers(expires_at);
CREATE INDEX idx_voucher_batches_prefix ON voucher_batches(prefix);
CREATE INDEX idx_voucher_batches_status ON voucher_batches(status);
CREATE INDEX idx_hotspot_sessions_mikrotik_user ON hotspot_sessions(mikrotik_user);
CREATE INDEX idx_hotspot_sessions_is_active ON hotspot_sessions(is_active);
CREATE INDEX idx_hotspot_sessions_last_seen ON hotspot_sessions(last_seen);

-- Create triggers for updated_at
CREATE TRIGGER update_voucher_profiles_updated_at
    BEFORE UPDATE ON voucher_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vouchers_updated_at
    BEFORE UPDATE ON vouchers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_voucher_batches_updated_at
    BEFORE UPDATE ON voucher_batches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_hotspot_sessions_updated_at
    BEFORE UPDATE ON hotspot_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();