DROP INDEX IF EXISTS idx_tiers_one_default;
ALTER TABLE subscription_tiers DROP COLUMN IF EXISTS is_default;
ALTER TABLE subscription_tiers DROP COLUMN IF EXISTS per_seat;
UPDATE subscription_tiers
   SET name = 'Studio', slug = 'studio',
       description = 'For production teams and studios'
 WHERE slug = 'business';
