-- Insert default subscription tiers
INSERT INTO subscription_tiers (name, slug, description, monthly_price, yearly_price, features, limits, display_order, is_active, is_public)
VALUES
    ('Free', 'free', 'Perfect for getting started with screenplay writing', 0, 0,
     '["Up to 3 projects", "Basic screenplay editor", "Character and location tracking", "Beat board", "Community support"]'::jsonb,
     '{"max_projects": 3, "max_collaborators_per_project": 2, "max_ai_requests_per_month": 10, "max_storage_mb": 100}'::jsonb,
     1, true, true),
    
    ('Pro', 'pro', 'For professional writers who need more power', 15, 150,
     '["Unlimited projects", "Advanced editor features", "AI-powered writing assistant", "Real-time collaboration", "Priority support", "Export to PDF/FDX"]'::jsonb,
     '{"max_projects": -1, "max_collaborators_per_project": 10, "max_ai_requests_per_month": 500, "max_storage_mb": 5000}'::jsonb,
     2, true, true),
    
    ('Studio', 'studio', 'For production teams and studios', 50, 500,
     '["Everything in Pro", "Unlimited collaborators", "Advanced analytics", "Custom branding", "API access", "Dedicated support", "Custom integrations"]'::jsonb,
     '{"max_projects": -1, "max_collaborators_per_project": -1, "max_ai_requests_per_month": -1, "max_storage_mb": -1}'::jsonb,
     3, true, true)
ON CONFLICT (slug) DO NOTHING;

-- Insert payment gateway configurations
INSERT INTO payment_gateways (gateway_id, name, description, config, active)
VALUES
    ('stripe', 'Stripe', 'Stripe payment processing', '{}'::jsonb, false),
    ('paddle', 'Paddle', 'Paddle payment processing', '{}'::jsonb, false),
    ('lemonsqueezy', 'Lemon Squeezy', 'Lemon Squeezy payment processing', '{}'::jsonb, false)
ON CONFLICT (gateway_id) DO NOTHING;
