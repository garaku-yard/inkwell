-- B (token-accurate managed AI) — give each tier a monthly managed-AI token
-- allowance. Managed AI is metered by tokens (provider-reported); these caps are
-- enforced on the managed dispatch path. -1 = unlimited. Admin-editable later.
UPDATE subscription_tiers SET limits = limits || '{"max_ai_tokens_per_month": 50000}'::jsonb   WHERE slug = 'free';
UPDATE subscription_tiers SET limits = limits || '{"max_ai_tokens_per_month": 2000000}'::jsonb WHERE slug = 'pro';
UPDATE subscription_tiers SET limits = limits || '{"max_ai_tokens_per_month": -1}'::jsonb       WHERE slug = 'business';
