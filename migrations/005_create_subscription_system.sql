-- 005_create_subscription_system.sql

-- Subscription types
CREATE TABLE subscription_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    service_type VARCHAR(20) NOT NULL, -- 'hotspot', 'pppoe', 'voucher'
    description TEXT,
    is_recurring BOOLEAN DEFAULT false,
    billing_cycle VARCHAR(20), -- 'daily', 'weekly', 'monthly', 'yearly'
    auto_renew BOOLEAN DEFAULT false,
    grace_period_days INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Subscriptions table
CREATE TABLE subscriptions (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    subscription_type_id INTEGER REFERENCES subscription_types(id),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    profile_id INTEGER, -- Reference to voucher_profiles or pppoe_profiles
    profile_name VARCHAR(100),
    price DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'IDR',
    billing_cycle VARCHAR(20), -- 'daily', 'weekly', 'monthly', 'yearly', 'onetime'
    is_active BOOLEAN DEFAULT true,
    auto_renew BOOLEAN DEFAULT false,
    starts_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP,
    last_renewed_at TIMESTAMP,
    next_billing_at TIMESTAMP,
    grace_period_ends_at TIMESTAMP,
    Mikrotik_user VARCHAR(50), -- Associated Mikrotik username
    service_data JSONB, -- Additional service-specific data
    notes TEXT,
    created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Subscription billing records
CREATE TABLE subscription_billings (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE CASCADE,
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'paid', 'overdue', 'cancelled'
    invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
    due_date TIMESTAMP NOT NULL,
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Subscription usage tracking
CREATE TABLE subscription_usage (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    usage_type VARCHAR(50) NOT NULL, -- 'login', 'data', 'time'
    usage_value DECIMAL(15,2) NOT NULL,
    usage_unit VARCHAR(20), -- 'times', 'bytes', 'seconds'
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(subscription_id, date, usage_type)
);

-- Subscription history
CREATE TABLE subscription_history (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- 'created', 'renewed', 'cancelled', 'expired', 'suspended', 'reactivated'
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    details JSONB,
    changed_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Carry over balances (for partial payments)
CREATE TABLE carry_over_balances (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'IDR',
    reason VARCHAR(100),
    expires_at TIMESTAMP,
    is_used BOOLEAN DEFAULT false,
    used_in_billing_id INTEGER REFERENCES subscription_billings(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_subscription_types_name ON subscription_types(name);
CREATE INDEX idx_subscription_types_service_type ON subscription_types(service_type);
CREATE INDEX idx_subscriptions_customer_id ON subscriptions(customer_id);
CREATE INDEX idx_subscriptions_type_id ON subscriptions(subscription_type_id);
CREATE INDEX idx_subscriptions_profile_id ON subscriptions(profile_id);
CREATE INDEX idx_subscriptions_is_active ON subscriptions(is_active);
CREATE INDEX idx_subscriptions_expires_at ON subscriptions(expires_at);
CREATE INDEX idx_subscriptions_next_billing ON subscriptions(next_billing_at);
CREATE INDEX idx_subscriptions_mikrotik_user ON subscriptions(Mikrotik_user);
CREATE INDEX idx_subscription_billings_subscription_id ON subscription_billings(subscription_id);
CREATE INDEX idx_subscription_billings_period ON subscription_billings(billing_period_start, billing_period_end);
CREATE INDEX idx_subscription_billings_status ON subscription_billings(status);
CREATE INDEX idx_subscription_billings_due_date ON subscription_billings(due_date);
CREATE INDEX idx_subscription_usage_subscription_date ON subscription_usage(subscription_id, date);
CREATE INDEX idx_subscription_usage_type ON subscription_usage(usage_type);
CREATE INDEX idx_subscription_history_subscription_id ON subscription_history(subscription_id);
CREATE INDEX idx_subscription_history_action ON subscription_history(action);
CREATE INDEX idx_carry_over_customer_id ON carry_over_balances(customer_id);
CREATE INDEX idx_carry_over_subscription_id ON carry_over_balances(subscription_id);
CREATE INDEX idx_carry_over_is_used ON carry_over_balances(is_used);
CREATE INDEX idx_carry_over_expires_at ON carry_over_balances(expires_at);

-- Create triggers for updated_at
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_billings_updated_at
    BEFORE UPDATE ON subscription_billings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_carry_over_balances_updated_at
    BEFORE UPDATE ON carry_over_balances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default subscription types
INSERT INTO subscription_types (name, service_type, description, is_recurring, billing_cycle, auto_renew, grace_period_days) VALUES
('hotspot_onetime', 'hotspot', 'One-time hotspot voucher', false, null, false, 0),
('hotspot_daily', 'hotspot', 'Daily hotspot subscription', true, 'daily', false, 1),
('hotspot_weekly', 'hotspot', 'Weekly hotspot subscription', true, 'weekly', false, 2),
('hotspot_monthly', 'hotspot', 'Monthly hotspot subscription', true, 'monthly', false, 3),
('pppoe_weekly', 'pppoe', 'Weekly PPPoE subscription', true, 'weekly', false, 2),
('pppoe_monthly', 'pppoe', 'Monthly PPPoE subscription', true, 'monthly', false, 3),
('pppoe_yearly', 'pppoe', 'Yearly PPPoE subscription', true, 'yearly', false, 5);