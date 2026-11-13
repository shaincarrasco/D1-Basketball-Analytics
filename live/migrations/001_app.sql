-- App schema (applied to Neon project d1hoops). Users live in neon_auth; we key on their id (JWT sub).
CREATE SCHEMA IF NOT EXISTS app;
CREATE TABLE IF NOT EXISTS app.profiles (
  user_id text PRIMARY KEY, email text, plan text NOT NULL DEFAULT 'free', plan_status text,
  stripe_customer_id text UNIQUE, stripe_subscription_id text, current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS app.follows (
  user_id text NOT NULL, kind text NOT NULL CHECK (kind IN ('team','player')), ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, kind, ref));
CREATE INDEX IF NOT EXISTS follows_ref ON app.follows (kind, ref);
CREATE TABLE IF NOT EXISTS app.push_subscriptions (
  endpoint text PRIMARY KEY, user_id text NOT NULL, p256dh text NOT NULL, auth text NOT NULL,
  prefs jsonb NOT NULL DEFAULT '{"tipoff":true,"close":true,"final":true,"upsets":false}',
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS push_user ON app.push_subscriptions (user_id);
CREATE TABLE IF NOT EXISTS app.sent_alerts (key text PRIMARY KEY, sent_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS app.picks (
  user_id text NOT NULL, game_id text NOT NULL, pick text NOT NULL CHECK (pick IN ('home','away')),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, game_id));
CREATE TABLE IF NOT EXISTS app.stripe_events (id text PRIMARY KEY, received_at timestamptz NOT NULL DEFAULT now());
