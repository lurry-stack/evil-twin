-- Fix: pg_cron job was only calling pay_daily_vip_income but NOT pay_daily_locked_income.
-- This means locked investments never accrued any daily income.
-- Replace the existing job with one that calls BOTH functions.

-- Remove old job
SELECT cron.unschedule('pay_daily_vip_income');

-- Create new combined job that pays both VIP and locked income at midnight
SELECT cron.schedule(
  'pay_daily_all_income',
  '0 0 * * *',
  $$
    SELECT public.pay_daily_vip_income();
    SELECT public.pay_daily_locked_income();
  $$
);

-- Fix pay_daily_locked_income: the old date logic used
--   DATE(li.locked_at + (li.days_paid || ' days')::interval) <= v_today
-- which only pays if locked_at + days_paid days have passed. But it doesn't
-- account for the fact that days_paid starts at 0 and the first payment should
-- happen after 1 day. Rewrite to use a cleaner day-difference approach that
-- pays for each elapsed day since locked_at, capping at duration_days.

CREATE OR REPLACE FUNCTION public.pay_daily_locked_income()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_li RECORD;
  v_today date := CURRENT_DATE;
  v_days_elapsed integer;
  v_days_to_pay integer;
BEGIN
  FOR v_li IN
    SELECT li.id, li.user_id, li.daily_income, li.days_paid, li.duration_days, li.locked_at
    FROM public.locked_investments li
    WHERE li.is_claimed = false
      AND li.days_paid < li.duration_days
  LOOP
    -- How many full days have elapsed since the lock started?
    v_days_elapsed := v_today - DATE(v_li.locked_at);
    IF v_days_elapsed < 1 THEN
      CONTINUE;  -- Not even 1 day yet
    END IF;
    -- Cap at duration so it stops when the plan expires
    v_days_to_pay := LEAST(v_days_elapsed, v_li.duration_days) - v_li.days_paid;
    IF v_days_to_pay <= 0 THEN
      CONTINUE;  -- Already paid for all elapsed days
    END IF;

    UPDATE public.locked_investments
    SET days_paid = days_paid + v_days_to_pay,
        accrued_income = accrued_income + (v_days_to_pay * v_li.daily_income)
    WHERE id = v_li.id;

    INSERT INTO public.transactions (user_id, type, amount, description)
    VALUES (v_li.user_id, 'locked_income', v_days_to_pay * v_li.daily_income,
            'Locked investment daily income (' || v_days_to_pay || ' day(s))');
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.pay_daily_locked_income() TO authenticated;

-- Also fix pay_daily_vip_income to use the same day-difference approach
-- so it handles multiple missed days correctly (not just 1 per run)
CREATE OR REPLACE FUNCTION public.pay_daily_vip_income()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_uv RECORD;
  v_today date := CURRENT_DATE;
  v_days_elapsed integer;
  v_days_to_pay integer;
BEGIN
  FOR v_uv IN
    SELECT uv.id, uv.user_id, uv.daily_income, uv.days_paid, uv.duration_days, uv.last_income_at
    FROM public.user_vips uv
    WHERE uv.is_active = true
      AND uv.days_paid < uv.duration_days
  LOOP
    -- Use created_at date as the start reference
    v_days_elapsed := v_today - DATE(v_uv.created_at);
    IF v_days_elapsed < 1 THEN
      CONTINUE;
    END IF;
    v_days_to_pay := LEAST(v_days_elapsed, v_uv.duration_days) - v_uv.days_paid;
    IF v_days_to_pay <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE public.user_vips
    SET days_paid = days_paid + v_days_to_pay,
        last_income_at = now(),
        is_active = ((days_paid + v_days_to_pay) < duration_days)
    WHERE id = v_uv.id;

    UPDATE public.profiles
    SET main_balance = main_balance + (v_days_to_pay * v_uv.daily_income),
        total_earnings = total_earnings + (v_days_to_pay * v_uv.daily_income)
    WHERE id = v_uv.user_id;

    INSERT INTO public.transactions (user_id, type, amount, description)
    VALUES (v_uv.user_id, 'vip_income', v_days_to_pay * v_uv.daily_income,
            'VIP daily income (' || v_days_to_pay || ' day(s))');
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.pay_daily_vip_income() TO authenticated;