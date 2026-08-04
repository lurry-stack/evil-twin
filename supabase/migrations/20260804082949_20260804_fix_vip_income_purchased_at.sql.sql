-- Fix: pay_daily_vip_income referenced created_at but the column is purchased_at
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
    SELECT uv.id, uv.user_id, uv.daily_income, uv.days_paid, uv.duration_days, uv.purchased_at
    FROM public.user_vips uv
    WHERE uv.is_active = true
      AND uv.days_paid < uv.duration_days
  LOOP
    v_days_elapsed := v_today - DATE(v_uv.purchased_at);
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