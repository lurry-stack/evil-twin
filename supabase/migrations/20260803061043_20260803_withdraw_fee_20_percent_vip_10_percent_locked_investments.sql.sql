/*
# Withdraw Fee 20% (admin-configurable), VIP Plans 10% Daily Rate, Locked Investments Feature

## 1. Settings Changes
- Added `withdraw_fee_percent` column to `settings` table (numeric, default 20).
  The admin can change this at any time from the Admin Settings panel.
  The `request_withdrawal` function reads this value dynamically instead of
  using a hardcoded 5%.

## 2. VIP Plans Updated to 10% Daily
- All existing VIP plans have had their `daily_income` and `total_return`
  recalculated from 8% daily to 10% daily.
  Formula: daily_income = investment_amount * 0.10
           total_return  = daily_income * duration_days
  Duration remains 20 days for all plans.

## 3. New Table: locked_investments
- `id` (uuid PK)
- `user_id` (uuid, FK to auth.users, defaults to auth.uid())
- `source_user_vip_id` (uuid, FK to user_vips — the investment being doubled)
- `plan_name` (text — name of the source plan)
- `investment_amount` (numeric — the doubled amount, same as source)
- `daily_income` (numeric — 8% of investment_amount per day)
- `duration_days` (integer — always 10)
- `total_return` (numeric — daily_income * 10)
- `locked_at` (timestamptz — when the lock started)
- `claim_at` (timestamptz — when the user can claim, = locked_at + 10 days)
- `days_paid` (integer, default 0 — how many days of income have accrued)
- `accrued_income` (numeric, default 0 — total income accumulated, shown separately)
- `is_claimed` (boolean, default false — whether the user has claimed)
- `claimed_at` (timestamptz, nullable — when claimed)
- `created_at` (timestamptz, default now())

  This is NOT added to the user's main balance until they click "Claim".
  The accrued income accumulates daily via the cron job, but the user sees
  it as a separate "locked balance" that only becomes available on claim.

## 4. New Functions
- `lock_investment(p_user_vip_id uuid)`:
  Takes an active user_vip, doubles its investment_amount into a locked
  investment at 8% daily for 10 days. Does NOT deduct from main_balance
  (the money is already invested in the source VIP). Creates a parallel
  locked position.

- `claim_locked_investment(p_locked_id uuid)`:
  Can only be called after `claim_at` has passed. Adds accrued_income
  to the user's main_balance and total_earnings, marks is_claimed = true.
  Returns the claimed amount.

- `pay_daily_locked_income()`:
  Called by the cron job. For each locked investment where is_claimed = false
  and days_paid < duration_days and hasn't been paid today:
  increments days_paid, adds daily_income to accrued_income, records a
  transaction. Does NOT touch main_balance — that only happens on claim.

## 5. Security
- RLS enabled on locked_investments with owner-scoped CRUD (4 policies).
- `lock_investment` and `claim_locked_investment` use auth.uid() for ownership.
- `pay_daily_locked_income` is SECURITY DEFINER (runs as owner for cron).
*/

-- 1. Add withdraw_fee_percent to settings
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS withdraw_fee_percent numeric NOT NULL DEFAULT 20;

-- 2. Update all VIP plans from 8% to 10% daily rate
-- daily_income = investment_amount * 0.10, total_return = daily_income * duration_days
UPDATE public.vip_plans
SET
  daily_income = investment_amount * 0.10,
  total_return = (investment_amount * 0.10) * duration_days
WHERE is_active = true;

-- 3. Update request_withdrawal to use configurable fee
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_amount numeric,
  p_provider text,
  p_phone text,
  p_holder_name text
)
RETURNS public.withdrawals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id uuid := auth.uid();
  v_w public.withdrawals;
  v_balance numeric;
  v_fee numeric;
  v_min numeric;
  v_fee_pct numeric;
  v_has_vip boolean;
  v_hour int;
  v_dow int;
  v_local_now timestamptz;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF p_provider NOT IN ('MTN', 'Airtel') THEN RAISE EXCEPTION 'Provider must be MTN or Airtel'; END IF;

  v_local_now := now() AT TIME ZONE 'Africa/Kigali';
  v_hour := EXTRACT(HOUR FROM v_local_now);
  v_dow  := EXTRACT(DOW  FROM v_local_now);

  IF v_dow = 0 THEN
    RAISE EXCEPTION 'Withdrawals are not available on Sundays. Available Mon–Sat 07:00–13:00';
  END IF;
  IF v_hour < 7 OR v_hour >= 13 THEN
    RAISE EXCEPTION 'Withdrawals are only available from 07:00 to 13:00, Monday to Saturday';
  END IF;

  SELECT min_withdraw, COALESCE(withdraw_fee_percent, 20) INTO v_min, v_fee_pct
  FROM public.settings LIMIT 1;
  IF v_min IS NULL THEN v_min := 2000; END IF;
  IF v_fee_pct IS NULL THEN v_fee_pct := 20; END IF;
  IF p_amount < v_min THEN RAISE EXCEPTION 'Minimum withdrawal is % RWF', v_min; END IF;

  SELECT EXISTS(SELECT 1 FROM public.user_vips WHERE user_id = v_user_id) INTO v_has_vip;
  IF NOT v_has_vip THEN RAISE EXCEPTION 'You must purchase at least one product before withdrawing'; END IF;

  SELECT main_balance INTO v_balance FROM public.profiles WHERE id = v_user_id;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_balance < p_amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  v_fee := p_amount * (v_fee_pct / 100.0);

  UPDATE public.profiles SET main_balance = main_balance - p_amount WHERE id = v_user_id;

  INSERT INTO public.withdrawals (user_id, amount, status, bank_name, account_number, holder_name, fee)
  VALUES (v_user_id, p_amount, 'pending', p_provider, p_phone, p_holder_name, v_fee)
  RETURNING * INTO v_w;

  INSERT INTO public.transactions (user_id, type, amount, description)
  VALUES (v_user_id, 'withdrawal', p_amount, 'Withdrawal requested (' || p_provider || ') - Fee: ' || v_fee || ' (' || v_fee_pct || '%)');

  RETURN v_w;
END;
$func$;

-- 4. Create locked_investments table
CREATE TABLE IF NOT EXISTS public.locked_investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  source_user_vip_id uuid REFERENCES public.user_vips(id) ON DELETE SET NULL,
  plan_name text NOT NULL,
  investment_amount numeric NOT NULL DEFAULT 0,
  daily_income numeric NOT NULL DEFAULT 0,
  duration_days integer NOT NULL DEFAULT 10,
  total_return numeric NOT NULL DEFAULT 0,
  locked_at timestamptz NOT NULL DEFAULT now(),
  claim_at timestamptz NOT NULL,
  days_paid integer NOT NULL DEFAULT 0,
  accrued_income numeric NOT NULL DEFAULT 0,
  is_claimed boolean NOT NULL DEFAULT false,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.locked_investments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_locked" ON public.locked_investments;
CREATE POLICY "select_own_locked" ON public.locked_investments
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_locked" ON public.locked_investments;
CREATE POLICY "insert_own_locked" ON public.locked_investments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_locked" ON public.locked_investments;
CREATE POLICY "update_own_locked" ON public.locked_investments
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_locked" ON public.locked_investments;
CREATE POLICY "delete_own_locked" ON public.locked_investments
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 5. lock_investment function — doubles an active VIP into a locked 10-day / 8% investment
CREATE OR REPLACE FUNCTION public.lock_investment(p_user_vip_id uuid)
RETURNS public.locked_investments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id uuid := auth.uid();
  v_uv public.user_vips;
  v_locked public.locked_investments;
  v_doubled_amount numeric;
  v_daily numeric;
  v_existing_count int;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Fetch the source VIP, ensure it belongs to the user and is active
  SELECT * INTO v_uv FROM public.user_vips WHERE id = p_user_vip_id AND user_id = v_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Investment not found'; END IF;
  IF v_uv.is_active = false THEN RAISE EXCEPTION 'This investment has expired and cannot be locked'; END IF;

  -- Prevent locking the same VIP twice
  SELECT count(*) INTO v_existing_count
  FROM public.locked_investments
  WHERE source_user_vip_id = p_user_vip_id AND user_id = v_user_id AND is_claimed = false;
  IF v_existing_count > 0 THEN RAISE EXCEPTION 'This investment is already locked'; END IF;

  -- Double the investment amount, 8% daily for 10 days
  v_doubled_amount := v_uv.investment_amount * 2;
  v_daily := v_doubled_amount * 0.08;

  INSERT INTO public.locked_investments
    (user_id, source_user_vip_id, plan_name, investment_amount, daily_income, duration_days, total_return, locked_at, claim_at)
  VALUES
    (v_user_id, p_user_vip_id, v_uv.plan_name, v_doubled_amount, v_daily, 10, v_daily * 10, now(), now() + interval '10 days')
  RETURNING * INTO v_locked;

  INSERT INTO public.transactions (user_id, type, amount, description)
  VALUES (v_user_id, 'lock_investment', v_doubled_amount, 'Locked ' || v_uv.plan_name || ' (10 days @ 8%/day)');

  RETURN v_locked;
END;
$func$;

-- 6. claim_locked_investment — adds accrued income to main_balance after lock period
CREATE OR REPLACE FUNCTION public.claim_locked_investment(p_locked_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id uuid := auth.uid();
  v_li public.locked_investments;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_li FROM public.locked_investments WHERE id = p_locked_id AND user_id = v_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Locked investment not found'; END IF;
  IF v_li.is_claimed THEN RAISE EXCEPTION 'Already claimed'; END IF;
  IF now() < v_li.claim_at THEN RAISE EXCEPTION 'Lock period has not ended yet'; END IF;

  -- Pay out accrued income + original doubled investment
  UPDATE public.locked_investments
  SET is_claimed = true, claimed_at = now()
  WHERE id = p_locked_id;

  -- Add the total return (doubled investment + income) to main_balance
  UPDATE public.profiles
  SET main_balance = main_balance + v_li.total_return,
      total_earnings = total_earnings + v_li.total_return
  WHERE id = v_user_id;

  INSERT INTO public.transactions (user_id, type, amount, description)
  VALUES (v_user_id, 'locked_claim', v_li.total_return, 'Claimed locked investment: ' || v_li.plan_name);

  RETURN v_li.total_return;
END;
$func$;

-- 7. pay_daily_locked_income — called by cron, accrues income without touching main_balance
CREATE OR REPLACE FUNCTION public.pay_daily_locked_income()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_li RECORD;
  v_today date := CURRENT_DATE;
BEGIN
  FOR v_li IN
    SELECT li.id, li.user_id, li.daily_income, li.days_paid, li.duration_days, li.locked_at, li.claim_at
    FROM public.locked_investments li
    WHERE li.is_claimed = false
      AND li.days_paid < li.duration_days
      AND DATE(li.locked_at + (li.days_paid || ' days')::interval) <= v_today
  LOOP
    UPDATE public.locked_investments
    SET days_paid = days_paid + 1,
        accrued_income = accrued_income + v_li.daily_income
    WHERE id = v_li.id;

    INSERT INTO public.transactions (user_id, type, amount, description)
    VALUES (v_li.user_id, 'locked_income', v_li.daily_income, 'Daily locked investment income');
  END LOOP;
END;
$func$;

-- 8. Grant execute on the new functions
GRANT EXECUTE ON FUNCTION public.lock_investment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_locked_investment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_daily_locked_income() TO authenticated;