UPDATE subscription_tiers
   SET monthly_price = 50,
       yearly_price = 500,
       description = 'For teams and studios — per-seat, with business workspaces',
       features = '["Everything in Pro", "Unlimited collaborators", "Advanced analytics", "Custom branding", "API access", "Dedicated support", "Custom integrations"]'::jsonb
 WHERE slug = 'business';

UPDATE subscription_tiers
   SET monthly_price = 15,
       yearly_price = 150,
       description = 'For professional writers who need more power',
       features = '["Unlimited projects", "Advanced editor features", "AI-powered writing assistant", "Real-time collaboration", "Priority support", "Export to PDF/FDX"]'::jsonb
 WHERE slug = 'pro';

UPDATE subscription_tiers
   SET monthly_price = 0,
       yearly_price = 0,
       description = 'Perfect for getting started with screenplay writing',
       features = '["Up to 3 projects", "Basic screenplay editor", "Character and location tracking", "Beat board", "Community support"]'::jsonb
 WHERE slug = 'free';
