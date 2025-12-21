-- Drop tables in reverse order
DROP TABLE IF EXISTS billing_audit_logs;
DROP TABLE IF EXISTS user_limit_overrides;
DROP TABLE IF EXISTS usage_metrics;
DROP TABLE IF EXISTS user_subscriptions;
DROP TABLE IF EXISTS payment_gateways;
DROP TABLE IF EXISTS subscription_tiers;

-- Drop extension
DROP EXTENSION IF EXISTS "uuid-ossp";
