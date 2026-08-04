/*
# Locked Investments: Buy Directly from VIP Plans

## What Changed
Previously locked investments were created by "doubling" an existing active
investment — the user clicked a Lock button on a VIP they already owned.
The user wants to change this: locked investments should be purchasable
directly from the VIP plans page, just like normal investments, but shown
in a separate "Locked Investments" tab. When a user buys a locked plan,
their account balance is deducted (the plan price = the VIP plan's
investment_amount), and the money is locked for 10 days at 8% daily.

## 1. locked_investments table — add vip_plan_id column
- Added `vip_plan_id` (uuid, nullable, references vip_plans) so we know
  which plan template a locked investment was bought from.
- Removed the `source_user_vip_id` foreign key constraint (the old flow
  is replaced — locked investments are now bought directly, not derived
  from an existing user_vip). The column itself is kept for backwards
  compatibility with any existing rows, but new rows will use vip_plan_id.

## 2. New function: buy_locked_investment
- Parameters: p_user_id, p_plan_id, p_plan_name, p_amount (the VIP plan's
  investment_amount), p_duration_days (10)
- Deducts p_amount from the user's main_balance
- Creates a locked_investments row with:
  - investment_amount = p_amount * 2 (doubled)
  - daily_income = investment_amount * 0.08 (8% daily)
  - duration_days = 10
  - total_return = daily_income * 10
  - claim_at = now() + 10 days
- Records a transaction
- Returns the created locked_investments row

## 3. Updated lock_investment function
- Kept for backwards compatibility but no longer the primary flow.
  The frontend will now use buy_locked_investment instead.
*/
-- 1. Add vip_plan_id column to locked_investments
ALTER TABLE public.locked_investments
  ADD COLUMN IF NOT EXISTS vip_plan_id uuid REFERENCES public.vip_plans(id) ON DELETE SET NULL;

-- 2. Create buy_locked_investment function
CREATE OR REPLACE FUNCTION public.buy_locked_investment(
  p_user_id uuid,
  p_plan_id uuid,
  p_plan_name text,
  p_amount numeric,
  p_duration_days integer DEFAULT 10
)
RETURNS public.locked_investments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_balance numeric;
  v_doubled numeric;
  v_daily numeric;
  v_total numeric;
  v_locked public.locked_investments;
BEGIN
  -- Validate user exists and has enough balance
  SELECT main_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_balance < p_amount THEN RAISE EXCEPTION 'Insufficient balance. Need RWF %', p_amount; END IF;

  -- Calculate locked investment terms: double the amount, 8% daily, 10 days
  v_doubled := p_amount * 2;
  v_daily := v_doubled * 0.08;
  v_total := v_daily * p_duration_days;

  -- Deduct from user's main balance
  UPDATE public.profiles SET main_balance = main_balance - p_amount WHERE id = p_user_id;

  -- Create locked investment record
  INSERT INTO public.locked_investments
    (user_id, vip_plan_id, plan_name, investment_amount, daily_income, duration_days, total_return, locked_at, claim_at)
  VALUES
    (p_user_id, p_plan_id, p_plan_name, v_doubled, v_daily, p_duration_days, v_total, now(), now() + (p_duration_days || ' days')::interval)
  RETURNING * INTO v_locked;

  -- Record transaction
  INSERT INTO public.transactions (user_id, type, amount, description)
  VALUES (p_user_id, 'locked_purchase', p_amount, 'Purchased locked ' || p_plan_name || ' (10 days @ 8%/day)');

  RETURN v_locked;
END;
$func$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.buy_locked_investment(uuid, uuid, text, numeric, integer) TO authenticated;