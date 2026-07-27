-- Fix buy_vip_plan: set last_income_at to midnight of purchase day
-- so income always starts at the NEXT 00:00 after purchase.
CREATE OR REPLACE FUNCTION public.buy_vip_plan(
  p_user_id uuid, p_plan_id uuid, p_amount numeric, p_daily_income numeric,
  p_duration_days integer, p_total_return numeric, p_plan_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  expires_at timestamptz;
  v_purchase_midnight timestamptz;
BEGIN
  v_purchase_midnight := DATE_TRUNC('day', now());
  expires_at := v_purchase_midnight + (p_duration_days || ' days')::interval;
  INSERT INTO user_vips (user_id, vip_plan_id, plan_name, investment_amount, daily_income, duration_days, total_return, purchased_at, expires_at, last_income_at, is_active)
  VALUES (p_user_id, p_plan_id, p_plan_name, p_amount, p_daily_income, p_duration_days, p_total_return, now(), expires_at, v_purchase_midnight, true);
  UPDATE profiles SET main_balance = main_balance - p_amount WHERE id = p_user_id;
  INSERT INTO transactions (user_id, type, amount, description)
  VALUES (p_user_id, 'vip_purchase', p_amount, 'Purchased ' || p_plan_name);
END;
$$;
