-- A2.2 — per-seat billing. The Business tier (per_seat) bills by quantity, so a
-- subscription records how many seats were purchased. Defaults to 1 so existing
-- and flat (non-per-seat) subscriptions are unaffected.
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
