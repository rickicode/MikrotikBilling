-- 003_create_pppoe_system.sql

-- PPPoE profiles table (synced from Mikrotik)
CREATE TABLE pppoe_profiles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    rate_upload VARCHAR(50) NOT NULL,
    rate_download VARCHAR(50) NOT NULL,
    price_buy DECIMAL(10,2) NOT NULL,
    price_sell DECIMAL(10,2) NOT NULL,
    session_timeout INTEGER, -- in minutes, null for unlimited
    is_active BOOLEAN DEFAULT true,
    mikrotik_id VARCHAR(50),
    last_sync_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PPPoE users table
CREATE TABLE pppoe_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(100) NOT NULL,
    profile_id INTEGER REFERENCES pppoe_profiles(id) ON DELETE CASCADE,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    service_type VARCHAR(20) DEFAULT 'pppoe',
    price_sell DECIMAL(10,2) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    is_disabled BOOLEAN DEFAULT false,
    last_login_at TIMESTAMP,
    expires_at TIMESTAMP,
    mikrotik_secret_id VARCHAR(50),
    comment TEXT,
    created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PPPoE user logs
CREATE TABLE pppoe_user_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES pppoe_users(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- 'created', 'disabled', 'enabled', 'expired', 'deleted'
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PPPoE active sessions (live data from Mikrotik)
CREATE TABLE pppoe_sessions (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    ip_address INET,
    calling_id VARCHAR(50), -- Calling Station ID (MAC/Phone)
    session_id VARCHAR(50),
    login_time TIMESTAMP,
    uptime_seconds INTEGER DEFAULT 0,
    bytes_in BIGINT DEFAULT 0,
    bytes_out BIGINT DEFAULT 0,
    packet_in BIGINT DEFAULT 0,
    packet_out BIGINT DEFAULT 0,
    rate_limit_upload VARCHAR(50),
    rate_limit_download VARCHAR(50),
    last_seen TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PPPoE user statistics
CREATE TABLE pppoe_user_stats (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES pppoe_users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_uptime_seconds INTEGER DEFAULT 0,
    total_bytes_in BIGINT DEFAULT 0,
    total_bytes_out BIGINT DEFAULT 0,
    total_sessions INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date)
);

-- Create indexes
CREATE INDEX idx_pppoe_profiles_name ON pppoe_profiles(name);
CREATE INDEX idx_pppoe_profiles_is_active ON pppoe_profiles(is_active);
CREATE INDEX idx_pppoe_users_username ON pppoe_users(username);
CREATE INDEX idx_pppoe_users_profile_id ON pppoe_users(profile_id);
CREATE INDEX idx_pppoe_users_customer_id ON pppoe_users(customer_id);
CREATE INDEX idx_pppoe_users_is_active ON pppoe_users(is_active);
CREATE INDEX idx_pppoe_users_expires_at ON pppoe_users(expires_at);
CREATE INDEX idx_pppoe_sessions_username ON pppoe_sessions(username);
CREATE INDEX idx_pppoe_sessions_is_active ON pppoe_sessions(is_active);
CREATE INDEX idx_pppoe_sessions_last_seen ON pppoe_sessions(last_seen);
CREATE INDEX idx_pppoe_user_stats_user_date ON pppoe_user_stats(user_id, date);

-- Create triggers for updated_at
CREATE TRIGGER update_pppoe_profiles_updated_at
    BEFORE UPDATE ON pppoe_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pppoe_users_updated_at
    BEFORE UPDATE ON pppoe_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pppoe_sessions_updated_at
    BEFORE UPDATE ON pppoe_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();