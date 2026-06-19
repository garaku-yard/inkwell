-- A1.1 — admin-configurable tiers + the decided Free/Pro/Business model.

-- is_default: the tier applied to users with NO subscription (the paywall's
-- "free by default" semantics; replaces the old "no subscription = unlimited").
-- per_seat: Business tier bills per member (quantity subscriptions).
ALTER TABLE subscription_tiers ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE subscription_tiers ADD COLUMN IF NOT EXISTS per_seat   BOOLEAN NOT NULL DEFAULT false;

-- At most one default tier.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tiers_one_default
    ON subscription_tiers (is_default) WHERE is_default = true;

-- Free is the default tier (applies when a user has no subscription).
UPDATE subscription_tiers SET is_default = true WHERE slug = 'free';

-- Align the seeded tiers to the decided model: Studio → Business (per-seat,
-- unlocks business/org workspaces). The business_workspaces gate lives in the
-- enforced `limits` map (1 = allowed).
UPDATE subscription_tiers
   SET name = 'Business',
       slug = 'business',
       per_seat = true,
       description = 'For teams and studios — per-seat, with business workspaces',
       limits = limits || '{"business_workspaces": 1}'::jsonb
 WHERE slug = 'studio';

UPDATE subscription_tiers
   SET limits = limits || '{"business_workspaces": 0}'::jsonb
 WHERE slug IN ('free', 'pro');
