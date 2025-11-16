-- Billing Service Database Schema
-- This schema handles subscriptions, payments, plans, and usage tracking

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Subscription plans
CREATE TABLE plans (
    plan_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    price_cents INTEGER NOT NULL, -- Price in cents
    currency VARCHAR(3) DEFAULT 'USD',
    billing_interval VARCHAR(20) NOT NULL CHECK (billing_interval IN ('monthly', 'yearly')),
    max_projects INTEGER DEFAULT -1, -- -1 for unlimited
    max_collaborators_per_project INTEGER DEFAULT -1, -- -1 for unlimited
    ai_features_enabled BOOLEAN DEFAULT false,
    priority_support BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    stripe_price_id VARCHAR(255), -- Stripe price ID
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- User subscriptions
CREATE TABLE subscriptions (
    subscription_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- References users.user_id from Identity service
    plan_id UUID NOT NULL REFERENCES plans(plan_id),
    status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing', 'incomplete')),
    current_period_start TIMESTAMP NOT NULL,
    current_period_end TIMESTAMP NOT NULL,
    trial_end TIMESTAMP,
    cancelled_at TIMESTAMP,
    cancel_at_period_end BOOLEAN DEFAULT false,
    stripe_subscription_id VARCHAR(255) UNIQUE,
    stripe_customer_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Payment methods
CREATE TABLE payment_methods (
    payment_method_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- References users.user_id from Identity service
    type VARCHAR(50) NOT NULL CHECK (type IN ('card', 'bank_account')),
    last_four VARCHAR(4),
    brand VARCHAR(50), -- "visa", "mastercard", etc.
    exp_month INTEGER,
    exp_year INTEGER,
    is_default BOOLEAN DEFAULT false,
    stripe_payment_method_id VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Invoices
CREATE TABLE invoices (
    invoice_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- References users.user_id from Identity service
    subscription_id UUID REFERENCES subscriptions(subscription_id),
    amount_paid INTEGER NOT NULL, -- Amount in cents
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) NOT NULL CHECK (status IN ('paid', 'unpaid', 'voided', 'draft')),
    invoice_date TIMESTAMP NOT NULL,
    due_date TIMESTAMP,
    paid_at TIMESTAMP,
    stripe_invoice_id VARCHAR(255) UNIQUE,
    hosted_invoice_url TEXT,
    invoice_pdf_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Invoice line items
CREATE TABLE invoice_line_items (
    line_item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_price INTEGER NOT NULL, -- Price in cents
    total_amount INTEGER NOT NULL, -- Total in cents
    period_start TIMESTAMP,
    period_end TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Usage tracking
CREATE TABLE usage (
    usage_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- References users.user_id from Identity service
    subscription_id UUID REFERENCES subscriptions(subscription_id),
    metric_name VARCHAR(100) NOT NULL, -- "projects_created", "ai_requests", "storage_mb", etc.
    quantity INTEGER NOT NULL DEFAULT 0,
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, metric_name, period_start, period_end)
);

-- Payment history
CREATE TABLE payments (
    payment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- References users.user_id from Identity service
    invoice_id UUID REFERENCES invoices(invoice_id),
    amount INTEGER NOT NULL, -- Amount in cents
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) NOT NULL CHECK (status IN ('succeeded', 'failed', 'pending', 'refunded')),
    payment_method_id UUID REFERENCES payment_methods(payment_method_id),
    stripe_payment_intent_id VARCHAR(255),
    failure_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Coupons and discounts
CREATE TABLE coupons (
    coupon_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('percentage', 'fixed_amount')),
    value INTEGER NOT NULL, -- Percentage (0-100) or amount in cents
    currency VARCHAR(3), -- Required for fixed_amount coupons
    duration VARCHAR(20) NOT NULL CHECK (duration IN ('once', 'repeating', 'forever')),
    duration_in_months INTEGER, -- Required for repeating coupons
    max_redemptions INTEGER, -- NULL for unlimited
    redemptions_count INTEGER DEFAULT 0,
    valid_from TIMESTAMP DEFAULT NOW(),
    valid_until TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    stripe_coupon_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Coupon redemptions
CREATE TABLE coupon_redemptions (
    redemption_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coupon_id UUID NOT NULL REFERENCES coupons(coupon_id),
    user_id UUID NOT NULL, -- References users.user_id from Identity service
    subscription_id UUID REFERENCES subscriptions(subscription_id),
    redeemed_at TIMESTAMP DEFAULT NOW()
);

-- Webhook events log
CREATE TABLE webhook_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stripe_event_id VARCHAR(255) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    processed BOOLEAN DEFAULT false,
    processing_attempts INTEGER DEFAULT 0,
    data JSONB NOT NULL,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_plans_active ON plans(is_active);
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_payment_methods_user_id ON payment_methods(user_id);
CREATE INDEX idx_payment_methods_default ON payment_methods(is_default);
CREATE INDEX idx_invoices_user_id ON invoices(user_id);
CREATE INDEX idx_invoices_subscription_id ON invoices(subscription_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);
CREATE INDEX idx_usage_user_id ON usage(user_id);
CREATE INDEX idx_usage_metric ON usage(metric_name);
CREATE INDEX idx_usage_period ON usage(period_start, period_end);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_coupons_code ON coupons(code);
CREATE INDEX idx_coupons_active ON coupons(is_active);
CREATE INDEX idx_coupon_redemptions_user_id ON coupon_redemptions(user_id);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX idx_webhook_events_type ON webhook_events(event_type);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON plans
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Function to increment coupon redemption count
CREATE OR REPLACE FUNCTION increment_coupon_redemptions()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE coupons SET redemptions_count = redemptions_count + 1 
    WHERE coupon_id = NEW.coupon_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically increment redemption count
CREATE TRIGGER increment_coupon_redemptions_trigger AFTER INSERT ON coupon_redemptions
    FOR EACH ROW EXECUTE PROCEDURE increment_coupon_redemptions();

-- Insert default plans
INSERT INTO plans (name, description, price_cents, currency, billing_interval, max_projects, max_collaborators_per_project, ai_features_enabled, priority_support) VALUES
('Free', 'Perfect for getting started with basic screenplay writing', 0, 'USD', 'monthly', 3, 2, false, false),
('Pro', 'For serious screenwriters and small teams', 1999, 'USD', 'monthly', 25, 10, true, false),
('Team', 'For production companies and larger writing teams', 4999, 'USD', 'monthly', -1, -1, true, true),
('Pro Annual', 'Pro plan billed annually with 2 months free', 19990, 'USD', 'yearly', 25, 10, true, false),
('Team Annual', 'Team plan billed annually with 2 months free', 49990, 'USD', 'yearly', -1, -1, true, true);