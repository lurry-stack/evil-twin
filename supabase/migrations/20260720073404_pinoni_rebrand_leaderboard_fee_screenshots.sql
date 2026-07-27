/*
# PINONI rebrand, admin update, leaderboard, withdrawal fee, deposit screenshots

## Changes
1. Make user with phone 0799881324 an admin
2. Update settings: min_deposit=2000, rebrand text to PINONI, add telegram_admin_link column
3. Deactivate all existing tasks (task center replaced by referral leaderboard)
4. Add screenshot_url column to deposits for payment proof uploads
5. Add fee column to withdrawals for 0.05% withdrawal fee
6. Update auto_deposit RPC to accept screenshot_url parameter
7. Update auto_withdraw RPC to deduct 0.05% fee from withdrawal amount
8. Create get_referral_leaderboard() function for referral leaderboard
9. Create distribute_sunday_rewards() function (admin-triggered, 10k/5k/3k to top 3)
10. Create storage bucket 'deposit-screenshots' for payment screenshot uploads
11. Add storage policies for screenshot bucket
*/

-- ============================================================
-- 1. Make 0799881324 admin
-- ============================================================
UPDATE public.profiles SET is_admin = true WHERE phone = '0799881324';

-- ============================================================
-- 2. Update settings: min_deposit, PINONI text, telegram links
-- ============================================================
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS telegram_admin_link text;

UPDATE public.settings SET
  min_deposit = 2000,
  announcement = 'Welcome to PINONI VIP Investment Platform! Earn daily income with our premium VIP plans.',
  welcome_message = 'Welcome to PINONI! Start your investment journey today and earn daily income with our premium VIP plans.',
  telegram_channel_link = 'https://t.me/pinoni',
  telegram_admin_link = 'https://t.me/pinoni_admin'
WHERE id = (SELECT id FROM public.settings LIMIT 1);

-- ============================================================
-- 3. Deactivate all tasks (replaced by referral leaderboard)
-- ============================================================
UPDATE public.tasks SET is_active = false WHERE is_active = true;

-- ============================================================
-- 4. Add screenshot_url to deposits
-- ============================================================
ALTER TABLE public.deposits ADD COLUMN IF NOT EXISTS screenshot_url text;

-- ============================================================
-- 5. Add fee column to withdrawals
-- ============================================================
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS fee numeric NOT NULL DEFAULT 0;

-- ============================================================
-- 6. Update auto_deposit to accept screenshot_url
-- ============================================================
DROP FUNCTION IF EXISTS public.auto_deposit(numeric, text, text);
CREATE OR REPLACE FUNCTION public.auto_deposit(
  p_amount numeric,
  p_provider text,
  p_phone text,
  p_screenshot_url text DEFAULT NULL
)
RETURNS public.deposits
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_deposit public.deposits;
  v_level1 uuid;
  v_level2 uuid;
  v_level3 uuid;
  v_comm numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;
  IF p_provider NOT IN ('MTN', 'Airtel') THEN
    RAISE EXCEPTION 'Provider must be MTN or Airtel';
  END IF;

  INSERT INTO public.deposits (user_id, amount, status, bank_name, account_number, holder_name, reviewed_at, screenshot_url)
    VALUES (v_user_id, p_amount, 'approved', p_provider, p_phone, p_provider || ' - ' || p_phone, now(), p_screenshot_url)
    RETURNING * INTO v_deposit;

  UPDATE public.profiles
    SET main_balance = main_balance + p_amount,
        total_deposit = total_deposit + p_amount
    WHERE id = v_user_id;

  INSERT INTO public.transactions (user_id, type, amount, description)
    VALUES (v_user_id, 'deposit', p_amount, 'Mobile money deposit (' || p_provider || ')');

  -- Referral commissions (10% / 5% / 2%)
  SELECT referred_by INTO v_level1 FROM public.profiles WHERE id = v_user_id;
  IF v_level1 IS NOT NULL THEN
    v_comm := p_amount * 0.10;
    UPDATE public.profiles SET total_referral_commission = total_referral_commission + v_comm, main_balance = main_balance + v_comm WHERE id = v_level1;
    INSERT INTO public.referral_commissions (earner_id, source_user_id, deposit_id, level, commission_amount, paid)
      VALUES (v_level1, v_user_id, v_deposit.id, 1, v_comm, true);

    SELECT referred_by INTO v_level2 FROM public.profiles WHERE id = v_level1;
    IF v_level2 IS NOT NULL THEN
      v_comm := p_amount * 0.05;
      UPDATE public.profiles SET total_referral_commission = total_referral_commission + v_comm, main_balance = main_balance + v_comm WHERE id = v_level2;
      INSERT INTO public.referral_commissions (earner_id, source_user_id, deposit_id, level, commission_amount, paid)
        VALUES (v_level2, v_user_id, v_deposit.id, 2, v_comm, true);

      SELECT referred_by INTO v_level3 FROM public.profiles WHERE id = v_level2;
      IF v_level3 IS NOT NULL THEN
        v_comm := p_amount * 0.02;
        UPDATE public.profiles SET total_referral_commission = total_referral_commission + v_comm, main_balance = main_balance + v_comm WHERE id = v_level3;
        INSERT INTO public.referral_commissions (earner_id, source_user_id, deposit_id, level, commission_amount, paid)
          VALUES (v_level3, v_user_id, v_deposit.id, 3, v_comm, true);
      END IF;
    END IF;
  END IF;

  RETURN v_deposit;
END;
$$;

-- ============================================================
-- 7. Update auto_withdraw to deduct 0.05% fee
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_withdraw(p_amount numeric, p_provider text, p_phone text)
RETURNS public.withdrawals
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_w public.withdrawals;
  v_balance numeric;
  v_fee numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;
  IF p_provider NOT IN ('MTN', 'Airtel') THEN
    RAISE EXCEPTION 'Provider must be MTN or Airtel';
  END IF;

  SELECT main_balance INTO v_balance FROM public.profiles WHERE id = v_user_id;
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  v_fee := p_amount * 0.0005;

  -- Deduct full amount from balance
  UPDATE public.profiles SET main_balance = main_balance - p_amount WHERE id = v_user_id;

  -- Create withdrawal record with fee (auto-approved)
  INSERT INTO public.withdrawals (user_id, amount, status, bank_name, account_number, holder_name, reviewed_at, fee)
    VALUES (v_user_id, p_amount, 'approved', p_provider, p_phone, p_provider || ' - ' || p_phone, now(), v_fee)
    RETURNING * INTO v_w;

  INSERT INTO public.transactions (user_id, type, amount, description)
    VALUES (v_user_id, 'withdrawal', p_amount, 'Mobile money withdrawal (' || p_provider || ') - Fee: ' || v_fee);

  RETURN v_w;
END;
$$;

-- ============================================================
-- 8. Referral leaderboard function
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_referral_leaderboard(p_limit int DEFAULT 20)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  phone text,
  referral_code text,
  referral_count bigint,
  total_deposit numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT p.id, p.full_name, p.phone, p.referral_code,
         COUNT(c.id)::bigint AS referral_count,
         COALESCE(p.total_deposit, 0)
  FROM public.profiles p
  LEFT JOIN public.profiles c ON c.referred_by = p.id
  GROUP BY p.id, p.full_name, p.phone, p.referral_code, p.total_deposit
  ORDER BY referral_count DESC, p.total_deposit DESC
  LIMIT p_limit;
$$;

-- ============================================================
-- 9. Sunday rewards distribution (admin-triggered)
-- ============================================================
CREATE OR REPLACE FUNCTION public.distribute_sunday_rewards()
RETURNS TABLE (rank int, user_id uuid, full_name text, reward numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_first uuid; v_second uuid; v_third uuid;
  v_first_name text; v_second_name text; v_third_name text;
BEGIN
  -- Top 3 by referral count
  SELECT user_id, full_name INTO v_first, v_first_name FROM public.get_referral_leaderboard(1) LIMIT 1;
  SELECT user_id, full_name INTO v_second, v_second_name FROM public.get_referral_leaderboard(2) OFFSET 1 LIMIT 1;
  SELECT user_id, full_name INTO v_third, v_third_name FROM public.get_referral_leaderboard(3) OFFSET 2 LIMIT 1;

  IF v_first IS NOT NULL THEN
    UPDATE public.profiles SET main_balance = main_balance + 10000, total_earnings = total_earnings + 10000 WHERE id = v_first;
    INSERT INTO public.transactions (user_id, type, amount, description) VALUES (v_first, 'weekly_reward', 10000, 'Sunday referral reward - 1st place (10,000 RWF)');
  END IF;
  IF v_second IS NOT NULL THEN
    UPDATE public.profiles SET main_balance = main_balance + 5000, total_earnings = total_earnings + 5000 WHERE id = v_second;
    INSERT INTO public.transactions (user_id, type, amount, description) VALUES (v_second, 'weekly_reward', 5000, 'Sunday referral reward - 2nd place (5,000 RWF)');
  END IF;
  IF v_third IS NOT NULL THEN
    UPDATE public.profiles SET main_balance = main_balance + 3000, total_earnings = total_earnings + 3000 WHERE id = v_third;
    INSERT INTO public.transactions (user_id, type, amount, description) VALUES (v_third, 'weekly_reward', 3000, 'Sunday referral reward - 3rd place (3,000 RWF)');
  END IF;

  RETURN QUERY SELECT 1, v_first, v_first_name, 10000::numeric
  UNION ALL SELECT 2, v_second, v_second_name, 5000::numeric
  UNION ALL SELECT 3, v_third, v_third_name, 3000::numeric;
END;
$$;

-- ============================================================
-- 10. Storage bucket for deposit screenshots
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('deposit-screenshots', 'deposit-screenshots', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 11. Storage policies for screenshot bucket
-- ============================================================
DROP POLICY IF EXISTS "upload_deposit_screenshots" ON storage.objects;
CREATE POLICY "upload_deposit_screenshots" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'deposit-screenshots');

DROP POLICY IF EXISTS "read_deposit_screenshots" ON storage.objects;
CREATE POLICY "read_deposit_screenshots" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'deposit-screenshots');
