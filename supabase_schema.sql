-- FieldIQ backend schema. Safe to re-run: every statement is idempotent.
-- Run in the Supabase SQL Editor whenever a new table or column is added here.
-- This is OWNER setup, done once for the whole app. End users never run any of this.

-- 1. Main per-user state (policies already live; do not loosen them)
CREATE TABLE IF NOT EXISTS hc_state (
  id text PRIMARY KEY,
  state_json jsonb,
  updated_at timestamptz DEFAULT now()
);

-- 2. Customer price portals
CREATE TABLE IF NOT EXISTS price_portals (
  token text PRIMARY KEY,
  customer_name text,
  customer_code text,
  margin_pct numeric,
  items jsonb,
  cat_margins jsonb DEFAULT '{}'::jsonb,
  pinned_prices jsonb DEFAULT '{}'::jsonb,
  item_margins jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE price_portals ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE price_portals ADD COLUMN IF NOT EXISTS customer_code text;
ALTER TABLE price_portals ADD COLUMN IF NOT EXISTS margin_pct numeric;
ALTER TABLE price_portals ADD COLUMN IF NOT EXISTS items jsonb;
ALTER TABLE price_portals ADD COLUMN IF NOT EXISTS cat_margins jsonb DEFAULT '{}'::jsonb;
ALTER TABLE price_portals ADD COLUMN IF NOT EXISTS pinned_prices jsonb DEFAULT '{}'::jsonb;
ALTER TABLE price_portals ADD COLUMN IF NOT EXISTS item_margins jsonb DEFAULT '{}'::jsonb;
ALTER TABLE price_portals ADD COLUMN IF NOT EXISTS company_name text;  -- rep's company, shown as the portal's home-screen name
ALTER TABLE price_portals ADD COLUMN IF NOT EXISTS user_id uuid;       -- owning rep (needed later for push notifications)

-- 3. Portal engagement tracking
CREATE TABLE IF NOT EXISTS portal_views (
  token text PRIMARY KEY,
  viewed_at timestamptz DEFAULT now()
);
ALTER TABLE portal_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public all" ON portal_views;
CREATE POLICY "Public all" ON portal_views FOR ALL TO anon USING (true) WITH CHECK (true);

-- 4. Customer quote requests submitted from a portal
CREATE TABLE IF NOT EXISTS portal_quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL,
  customer_name text,
  items jsonb,
  submitted_at timestamptz DEFAULT now(),
  dismissed boolean DEFAULT false
);
ALTER TABLE portal_quote_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public insert" ON portal_quote_requests;
CREATE POLICY "Public insert" ON portal_quote_requests FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "Auth all" ON portal_quote_requests;
CREATE POLICY "Auth all" ON portal_quote_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Push notification subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint text PRIMARY KEY,
  user_id uuid,
  subscription jsonb,
  created_at timestamptz DEFAULT now()
);

-- 6. Client error reports (app writes these; failures are ignored by the app)
CREATE TABLE IF NOT EXISTS app_errors (
  id bigserial PRIMARY KEY,
  user_id uuid,
  ts timestamptz DEFAULT now(),
  msg text,
  src text,
  line integer,
  col integer,
  stack text,
  ua text,
  app_ver text
);
ALTER TABLE app_errors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth insert" ON app_errors;
CREATE POLICY "Auth insert" ON app_errors FOR INSERT TO authenticated WITH CHECK (true);

-- Storage bucket 'fieldiq-docs' (private, per-user folders) is managed in Supabase > Storage.

NOTIFY pgrst, 'reload schema';
