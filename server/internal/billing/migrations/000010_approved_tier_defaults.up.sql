-- Approved launch defaults. Administrators can continue changing every value
-- through /admin/billing; this migration only establishes fresh/deployed DBs.
UPDATE subscription_tiers
   SET monthly_price = 25,
       yearly_price = 250,
       description = 'For teams and studios — per-seat, with business workspaces',
       features = '["Everything in Pro", "Business workspaces", "Unlimited collaborators", "Managed AI under fair use", "Priority support"]'::jsonb,
       limits = limits || '{"max_projects": -1, "max_collaborators_per_project": -1, "max_ai_tokens_per_month": -1, "business_workspaces": 1}'::jsonb
 WHERE slug = 'business';

UPDATE subscription_tiers
   SET monthly_price = 15,
       yearly_price = 150,
       description = 'For professional writers who need cloud scale and managed AI',
       features = '["Unlimited projects", "Up to 10 collaborators per project", "2M managed AI tokens per month", "Priority support"]'::jsonb,
       limits = limits || '{"max_projects": -1, "max_collaborators_per_project": 10, "max_ai_tokens_per_month": 2000000, "business_workspaces": 0}'::jsonb
 WHERE slug = 'pro';

UPDATE subscription_tiers
   SET monthly_price = 0,
       yearly_price = 0,
       description = 'For writers getting started with local-first creative tools',
       features = '["Up to 3 synced projects", "Up to 2 collaborators per project", "50K managed AI tokens per month", "Local AI and bring-your-own provider", "Standard exports"]'::jsonb,
       limits = limits || '{"max_projects": 3, "max_collaborators_per_project": 2, "max_ai_tokens_per_month": 50000, "business_workspaces": 0}'::jsonb
 WHERE slug = 'free';
