-- Remove seed data
DELETE FROM payment_gateways WHERE gateway_id IN ('stripe', 'paddle', 'lemonsqueezy');
DELETE FROM subscription_tiers WHERE slug IN ('free', 'pro', 'studio');
