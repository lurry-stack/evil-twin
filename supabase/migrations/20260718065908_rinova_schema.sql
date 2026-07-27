/*
# RINOVA VIP Investment Platform Schema

Creates the full schema for a VIP investment platform clone of hawa-rinova.com.

1. New Tables
- `profiles` — user profile (extends auth.users): full_name, phone, referral_code, referred_by, main_balance, total_earnings, total_deposit, total_referral_commission, is_admin, created_at.
- `vip_plans` — investment plans: name, investment_amount, daily_income, duration_days, total_return, sort_order, is_active.
- `user_vips` — purchased plans by users: user_id, vip_plan_id, plan_name, investment_amount, daily_income, duration_days, total_return, purchased_at, expires_at, last_income_at, days_paid, is_active.
- `deposits` — recharge requests: user_id, amount, status, bank_name, account_number, holder_name, created_at, reviewed_at, admin_note.
- `withdrawals` — withdrawal requests: user_id, amount, status, bank_name, account_number, holder_name, created_at, reviewed_at, admin_note.
- `transactions` — ledger entries: user_id, type, amount, description, created_at.
- `referral_commissions` — commission records: earner_id, source_user_id, deposit_id, level, commission_amount, paid, created_at.
- `checkins` — daily check-in records: user_id, reward_amount, reward_label, created_at.
- `tasks` — task catalog: title, description, reward, image, is_active, sort_order.
- `user_tasks` — task completions: user_id, task_id, completed, created_at.
- `settings` — platform settings (singleton): announcement, welcome_message, telegram_channel_link, min_deposit, max_balance_restriction.
- `redeem_codes` — gift codes: code, reward_amount, max_uses, used_count, is_active, expires_at.
- `user_redeems` — user redemption records: user_id, code_id, code, reward_amount, created_at.

2. Security
- Enable RLS on every table.
- profiles: owner-scoped CRUD (auth.uid() = id) plus admin read-all via is_admin flag.
- vip_plans, tasks, settings: public read (anon, authenticated) so unauthenticated users can browse; writes admin-only.
- user_vips, deposits, withdrawals, transactions, referral_commissions, checkins, user_tasks, user_redeems: owner-scoped CRUD (auth.uid() = user_id).
- redeem_codes: public read for active codes; admin writes.
- user_redeems: owner-scoped.

3. Notes
- Owner columns default to auth.uid() so inserts omitting user_id still satisfy RLS.
- referral_code auto-generated on insert via trigger.
- Admin role determined by profiles.is_admin.
*/

-- profiles
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT 'User',
  phone text,
  referral_code text UNIQUE,
  referred_by uuid REFERENCES profiles(id),
  main_balance numeric NOT NULL DEFAULT 0,
  total_earnings numeric NOT NULL DEFAULT 0,
  total_deposit numeric NOT NULL DEFAULT 0,
  total_referral_commission numeric NOT NULL DEFAULT 0,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin));

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- auto-create profile + referral code on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  code text;
BEGIN
  code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  INSERT INTO public.profiles (id, full_name, referral_code)
  VALUES (NEW.id, coalesce(NEW.raw_user_meta_data->>'full_name', 'RINOVA User'), code)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- vip_plans
CREATE TABLE IF NOT EXISTS vip_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  investment_amount numeric NOT NULL DEFAULT 0,
  daily_income numeric NOT NULL DEFAULT 0,
  duration_days integer NOT NULL DEFAULT 30,
  total_return numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE vip_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_vip_plans" ON vip_plans;
CREATE POLICY "read_vip_plans" ON vip_plans FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_vip_plans" ON vip_plans;
CREATE POLICY "admin_write_vip_plans" ON vip_plans FOR ALL
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin));

-- user_vips
CREATE TABLE IF NOT EXISTS user_vips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  vip_plan_id uuid REFERENCES vip_plans(id) ON DELETE SET NULL,
  plan_name text NOT NULL,
  investment_amount numeric NOT NULL DEFAULT 0,
  daily_income numeric NOT NULL DEFAULT 0,
  duration_days integer NOT NULL DEFAULT 30,
  total_return numeric NOT NULL DEFAULT 0,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  last_income_at timestamptz NOT NULL DEFAULT now(),
  days_paid integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_vips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_user_vips" ON user_vips;
CREATE POLICY "select_own_user_vips" ON user_vips FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_user_vips" ON user_vips;
CREATE POLICY "insert_own_user_vips" ON user_vips FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_user_vips" ON user_vips;
CREATE POLICY "update_own_user_vips" ON user_vips FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_user_vips" ON user_vips;
CREATE POLICY "delete_own_user_vips" ON user_vips FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- deposits
CREATE TABLE IF NOT EXISTS deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  bank_name text,
  account_number text,
  holder_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  admin_note text
);
ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_deposits" ON deposits;
CREATE POLICY "select_own_deposits" ON deposits FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin));

DROP POLICY IF EXISTS "insert_own_deposits" ON deposits;
CREATE POLICY "insert_own_deposits" ON deposits FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_deposits" ON deposits;
CREATE POLICY "update_own_deposits" ON deposits FOR UPDATE
  TO authenticated USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin))
  WITH CHECK (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin));

-- withdrawals
CREATE TABLE IF NOT EXISTS withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  bank_name text,
  account_number text,
  holder_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  admin_note text
);
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_withdrawals" ON withdrawals;
CREATE POLICY "select_own_withdrawals" ON withdrawals FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin));

DROP POLICY IF EXISTS "insert_own_withdrawals" ON withdrawals;
CREATE POLICY "insert_own_withdrawals" ON withdrawals FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_withdrawals" ON withdrawals;
CREATE POLICY "update_own_withdrawals" ON withdrawals FOR UPDATE
  TO authenticated USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin))
  WITH CHECK (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin));

-- transactions
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_transactions" ON transactions;
CREATE POLICY "select_own_transactions" ON transactions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_transactions" ON transactions;
CREATE POLICY "insert_own_transactions" ON transactions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- referral_commissions
CREATE TABLE IF NOT EXISTS referral_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  earner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  source_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  deposit_id uuid REFERENCES deposits(id) ON DELETE SET NULL,
  level integer NOT NULL DEFAULT 1,
  commission_amount numeric NOT NULL DEFAULT 0,
  paid boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE referral_commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_commissions" ON referral_commissions;
CREATE POLICY "select_own_commissions" ON referral_commissions FOR SELECT
  TO authenticated USING (auth.uid() = earner_id);

DROP POLICY IF EXISTS "insert_own_commissions" ON referral_commissions;
CREATE POLICY "insert_own_commissions" ON referral_commissions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = earner_id);

-- checkins
CREATE TABLE IF NOT EXISTS checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  reward_amount numeric NOT NULL DEFAULT 0,
  reward_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_checkins" ON checkins;
CREATE POLICY "select_own_checkins" ON checkins FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_checkins" ON checkins;
CREATE POLICY "insert_own_checkins" ON checkins FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- tasks
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  reward numeric NOT NULL DEFAULT 0,
  image text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_tasks" ON tasks;
CREATE POLICY "read_tasks" ON tasks FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_tasks" ON tasks;
CREATE POLICY "admin_write_tasks" ON tasks FOR ALL
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin));

-- user_tasks
CREATE TABLE IF NOT EXISTS user_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_user_tasks" ON user_tasks;
CREATE POLICY "select_own_user_tasks" ON user_tasks FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_user_tasks" ON user_tasks;
CREATE POLICY "insert_own_user_tasks" ON user_tasks FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_user_tasks" ON user_tasks;
CREATE POLICY "update_own_user_tasks" ON user_tasks FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- settings (singleton)
CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement text,
  welcome_message text,
  telegram_channel_link text,
  min_deposit numeric NOT NULL DEFAULT 6000,
  max_balance_restriction numeric NOT NULL DEFAULT 0
);
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_settings" ON settings;
CREATE POLICY "read_settings" ON settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_settings" ON settings;
CREATE POLICY "admin_write_settings" ON settings FOR ALL
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin));

-- redeem_codes
CREATE TABLE IF NOT EXISTS redeem_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  reward_amount numeric NOT NULL DEFAULT 0,
  max_uses integer NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE redeem_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_redeem_codes" ON redeem_codes;
CREATE POLICY "read_redeem_codes" ON redeem_codes FOR SELECT
  TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "admin_write_redeem_codes" ON redeem_codes;
CREATE POLICY "admin_write_redeem_codes" ON redeem_codes FOR ALL
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin));

-- user_redeems
CREATE TABLE IF NOT EXISTS user_redeems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  code_id uuid REFERENCES redeem_codes(id) ON DELETE SET NULL,
  code text NOT NULL,
  reward_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_redeems ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_user_redeems" ON user_redeems;
CREATE POLICY "select_own_user_redeems" ON user_redeems FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_user_redeems" ON user_redeems;
CREATE POLICY "insert_own_user_redeems" ON user_redeems FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- buy_vip_plan RPC
CREATE OR REPLACE FUNCTION buy_vip_plan(
  p_user_id uuid,
  p_plan_id uuid,
  p_amount numeric,
  p_daily_income numeric,
  p_duration_days integer,
  p_total_return numeric,
  p_plan_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  expires_at timestamptz;
BEGIN
  expires_at := now() + (p_duration_days || ' days')::interval;
  INSERT INTO user_vips (user_id, vip_plan_id, plan_name, investment_amount, daily_income, duration_days, total_return, purchased_at, expires_at, last_income_at, is_active)
  VALUES (p_user_id, p_plan_id, p_plan_name, p_amount, p_daily_income, p_duration_days, p_total_return, now(), expires_at, now(), true);
  UPDATE profiles SET main_balance = main_balance - p_amount WHERE id = p_user_id;
  INSERT INTO transactions (user_id, type, amount, description)
  VALUES (p_user_id, 'vip_purchase', p_amount, 'Purchased ' || p_plan_name);
END;
$$;

-- seed settings singleton
INSERT INTO settings (announcement, welcome_message, telegram_channel_link, min_deposit, max_balance_restriction)
SELECT 'Welcome to RINOVA VIP Investment Platform! Earn daily income with our premium VIP plans.',
       'Welcome to RINOVA! Start your investment journey today and earn daily income with our premium VIP plans.',
       'https://t.me/rinova',
       6000, 0
WHERE NOT EXISTS (SELECT 1 FROM settings);

-- seed vip plans
INSERT INTO vip_plans (name, investment_amount, daily_income, duration_days, total_return, sort_order, is_active)
SELECT 'VIP 1', 6000, 150, 60, 9000, 1, true
WHERE NOT EXISTS (SELECT 1 FROM vip_plans WHERE name = 'VIP 1');

INSERT INTO vip_plans (name, investment_amount, daily_income, duration_days, total_return, sort_order, is_active)
SELECT 'VIP 2', 18000, 540, 60, 32400, 2, true
WHERE NOT EXISTS (SELECT 1 FROM vip_plans WHERE name = 'VIP 2');

INSERT INTO vip_plans (name, investment_amount, daily_income, duration_days, total_return, sort_order, is_active)
SELECT 'VIP 3', 60000, 2100, 60, 126000, 3, true
WHERE NOT EXISTS (SELECT 1 FROM vip_plans WHERE name = 'VIP 3');

INSERT INTO vip_plans (name, investment_amount, daily_income, duration_days, total_return, sort_order, is_active)
SELECT 'VIP 4', 180000, 7200, 60, 432000, 4, true
WHERE NOT EXISTS (SELECT 1 FROM vip_plans WHERE name = 'VIP 4');

INSERT INTO vip_plans (name, investment_amount, daily_income, duration_days, total_return, sort_order, is_active)
SELECT 'VIP 5', 600000, 27000, 60, 1620000, 5, true
WHERE NOT EXISTS (SELECT 1 FROM vip_plans WHERE name = 'VIP 5');

-- seed tasks
INSERT INTO tasks (title, description, reward, image, is_active, sort_order)
SELECT 'Daily Login', 'Log in to the app every day', 50, '', true, 1
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Daily Login');

INSERT INTO tasks (title, description, reward, image, is_active, sort_order)
SELECT 'Join Telegram', 'Join our official Telegram channel', 200, '', true, 2
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Join Telegram');

INSERT INTO tasks (title, description, reward, image, is_active, sort_order)
SELECT 'Invite a Friend', 'Invite a friend to join RINOVA', 500, '', true, 3
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Invite a Friend');

INSERT INTO tasks (title, description, reward, image, is_active, sort_order)
SELECT 'First Deposit', 'Make your first deposit', 1000, '', true, 4
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'First Deposit');
