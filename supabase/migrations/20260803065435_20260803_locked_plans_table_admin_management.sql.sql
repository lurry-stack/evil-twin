/*
# Locked Plans Table + Admin Management

## What Changed
The locked investment plans were previously derived from vip_plans by doubling
the amount at purchase time. The admin now needs to manage locked plans as
their own set of plans (add, edit, delete) — separate from the current VIP
plans. This migration creates a dedicated `locked_plans` table and rewires
the purchase flow to use it.

## 1. New Table: locked_plans
- `id` (uuid PK)
- `name` (text)
- `investment_amount` (numeric — the price the user pays from their balance)
- `daily_income` (numeric — 8% of investment_amount by default, admin-editable)
- `duration_days` (integer — default 10, admin-editable)
- `total_return` (numeric — daily_income * duration_days, admin-editable)
- `sort_order` (integer, default 0)
- `is_active` (boolean, default true)
- `created_at` (timestamptz, default now())

This mirrors the vip_plans structure so the admin UI can reuse the same
add/edit/delete pattern. No "doubled amount" field — the investment_amount
IS the locked amount, and daily_income/total_return are set directly.

## 2. Updated locked_investments table
- Added `locked_plan_id` (uuid, nullable, references locked_plans) so a
  purchased locked investment knows which plan template it came from.

## 3. Updated buy_locked_investment function
- Now takes `p_locked_plan_id` instead of `p_plan_id` and reads the plan
  details directly from locked_plans. No more doubling — the
  investment_amount from the plan is used as-is. The daily_income,
  duration_days, and total_return all come from the locked_plans row.

## 4. New function: admin_delete_locked_investment
- SECURITY DEFINER, callable by admins only (checks is_admin on profile).
- Deletes a user's locked investment record. If the investment is not yet
  claimed, refunds the investment_amount to the user's main_balance first.
*/

-- 1. Create locked_plans table
CREATE TABLE IF NOT EXISTS public.locked_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  investment_amount numeric NOT NULL DEFAULT 0,
  daily_income numeric NOT NULL DEFAULT 0,
  duration_days integer NOT NULL DEFAULT 10,
  total_return numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.locked_plans ENABLE ROW LEVEL SECURITY;

-- Admins manage locked_plans; all authenticated users can read active plans
DROP POLICY IF EXISTS "select_locked_plans" ON public.locked_plans;
CREATE POLICY "select_locked_plans" ON public.locked_plans
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_locked_plans" ON public.locked_plans;
CREATE POLICY "admin_insert_locked_plans" ON public.locked_plans
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "admin_update_locked_plans" ON public.locked_plans;
CREATE POLICY "admin_update_locked_plans" ON public.locked_plans
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "admin_delete_locked_plans" ON public.locked_plans;
CREATE POLICY "admin_delete_locked_plans" ON public.locked_plans
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- 2. Add locked_plan_id to locked_investments
ALTER TABLE public.locked_investments
  ADD COLUMN IF NOT EXISTS locked_plan_id uuid REFERENCES public.locked_plans(id) ON DELETE SET NULL;

-- 3. Seed default locked plans based on current vip_plans (8% daily, 10 days)
INSERT INTO public.locked_plans (name, investment_amount, daily_income, duration_days, total_return, sort_order, is_active)
SELECT
  'Locked ' || name,
  investment_amount,
  investment_amount * 0.08,
  10,
  (investment_amount * 0.08) * 10,
  sort_order,
  true
FROM public.vip_plans
WHERE is_active = true
ORDER BY sort_order
ON CONFLICT DO NOTHING;

-- 4. Updated buy_locked_investment — reads from locked_plans, no doubling
CREATE OR REPLACE FUNCTION public.buy_locked_investment(
  p_user_id uuid,
  p_locked_plan_id uuid,
  p_plan_name text,
  p_amount numeric,
  p_daily_income numeric,
  p_duration_days integer,
  p_total_return numeric
)
RETURNS public.locked_investments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_balance numeric;
  v_locked public.locked_investments;
BEGIN
  SELECT main_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_balance < p_amount THEN RAISE EXCEPTION 'Insufficient balance. Need RWF %', p_amount; END IF;

  UPDATE public.profiles SET main_balance = main_balance - p_amount WHERE id = p_user_id;

  INSERT INTO public.locked_investments
    (user_id, locked_plan_id, plan_name, investment_amount, daily_income, duration_days, total_return, locked_at, claim_at)
  VALUES
    (p_user_id, p_locked_plan_id, p_plan_name, p_amount, p_daily_income, p_duration_days, p_total_return, now(), now() + (p_duration_days || ' days')::interval)
  RETURNING * INTO v_locked;

  INSERT INTO public.transactions (user_id, type, amount, description)
  VALUES (p_user_id, 'locked_purchase', p_amount, 'Purchased locked ' || p_plan_name || ' (' || p_duration_days || ' days @ 8%/day)');

  RETURN v_locked;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.buy_locked_investment(uuid, uuid, text, numeric, numeric, integer, numeric) TO authenticated;

-- 5. admin_delete_locked_investment — refunds if unclaimed, then deletes
CREATE OR REPLACE FUNCTION public.admin_delete_locked_investment(p_locked_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_admin_id uuid := auth.uid();
  v_is_admin boolean;
  v_li public.locked_investments;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_admin_id;
  IF v_is_admin IS NULL OR v_is_admin = false THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT * INTO v_li FROM public.locked_investments WHERE id = p_locked_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Locked investment not found'; END IF;

  -- Refund the investment amount if not yet claimed
  IF v_li.is_claimed = false THEN
    UPDATE public.profiles
    SET main_balance = main_balance + v_li.investment_amount
    WHERE id = v_li.user_id;

    INSERT INTO public.transactions (user_id, type, amount, description)
    VALUES (v_li.user_id, 'locked_refund', v_li.investment_amount, 'Admin deleted locked investment: ' || v_li.plan_name);
  END IF;

  DELETE FROM public.locked_investments WHERE id = p_locked_id;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.admin_delete_locked_investment(uuid) TO authenticated;