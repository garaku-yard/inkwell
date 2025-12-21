-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Subscription tiers table
CREATE TABLE IF NOT EXISTS subscription_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    monthly_price DECIMAL(12,2) NOT NULL DEFAULT 0,
    yearly_price DECIMAL(12,2) NOT NULL DEFAULT 0,
    features JSONB DEFAULT '[]',
    limits JSONB DEFAULT '{}',
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_public BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
);

CREATE INDEX idx_subscription_tiers_slug ON subscription_tiers(slug);
CREATE INDEX idx_subscription_tiers_active ON subscription_tiers(is_active);
CREATE INDEX idx_subscription_tiers_display_order ON subscription_tiers(display_order);
CREATE INDEX idx_subscription_tiers_deleted_at ON subscription_tiers(deleted_at);

-- Payment gateways table
CREATE TABLE IF NOT EXISTS payment_gateways (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gateway_id VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    config JSONB DEFAULT '{}',
    active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_gateway_id CHECK (gateway_id IN ('stripe', 'paddle', 'lemonsqueezy'))
);

CREATE INDEX idx_payment_gateways_gateway_id ON payment_gateways(gateway_id);
CREATE INDEX idx_payment_gateways_active ON payment_gateways(active);

-- User subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    tier_id UUID NOT NULL REFERENCES subscription_tiers(id) ON DELETE RESTRICT,
    gateway_id UUID NOT NULL REFERENCES payment_gateways(id) ON DELETE RESTRICT,
    external_subscription_id VARCHAR(255),
    external_customer_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly',
    current_period_start TIMESTAMP NOT NULL,
    current_period_end TIMESTAMP NOT NULL,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    canceled_at TIMESTAMP,
    trial_start TIMESTAMP,
    trial_end TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP,
    CONSTRAINT chk_status CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'incomplete', 'incomplete_expired', 'unpaid')),
    CONSTRAINT chk_billing_cycle CHECK (billing_cycle IN ('monthly', 'yearly'))
);

CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_tier_id ON user_subscriptions(tier_id);
CREATE INDEX idx_user_subscriptions_gateway_id ON user_subscriptions(gateway_id);
CREATE INDEX idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX idx_user_subscriptions_external_sub ON user_subscriptions(external_subscription_id);
CREATE INDEX idx_user_subscriptions_deleted_at ON user_subscriptions(deleted_at);

-- Usage metrics table
CREATE TABLE IF NOT EXISTS usage_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    projects_count INT NOT NULL DEFAULT 0,
    ai_requests_count INT NOT NULL DEFAULT 0,
    storage_bytes BIGINT NOT NULL DEFAULT 0,
    collaborators_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_metrics_user_id ON usage_metrics(user_id);
CREATE INDEX idx_usage_metrics_period ON usage_metrics(period_start, period_end);
CREATE INDEX idx_usage_metrics_user_period ON usage_metrics(user_id, period_start, period_end);

-- User limit overrides table
CREATE TABLE IF NOT EXISTS user_limit_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    custom_limits JSONB NOT NULL DEFAULT '{}',
    reason TEXT,
    expires_at TIMESTAMP,
    created_by UUID NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_limit_overrides_user_id ON user_limit_overrides(user_id);
CREATE INDEX idx_user_limit_overrides_expires_at ON user_limit_overrides(expires_at);

-- Billing audit log table
CREATE TABLE IF NOT EXISTS billing_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL,
    performed_by UUID NOT NULL,
    changes JSONB,
    metadata JSONB,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_billing_audit_logs_resource ON billing_audit_logs(resource_type, resource_id);
CREATE INDEX idx_billing_audit_logs_performed_by ON billing_audit_logs(performed_by);
CREATE INDEX idx_billing_audit_logs_timestamp ON billing_audit_logs(timestamp);
CREATE INDEX idx_billing_audit_logs_action ON billing_audit_logs(action);
