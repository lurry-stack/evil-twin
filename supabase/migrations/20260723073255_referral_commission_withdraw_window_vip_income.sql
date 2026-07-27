/*
# Referral commission 20%, withdraw time window, total_withdraw, VIP midnight income, leaderboard fix
*/

-- 1. Add total_withdraw to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_withdraw numeric NOT NULL DEFAULT 0;

-- 2. Referral commission: 20% / 5% / 2%
CREATE OR REPLACE FUNCTION public.approve_deposit(p_deposit_id uuid)
RETURNS public.deposits
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deposit public.deposits;
  v_user_id uuid;
  v_amount numeric;
  v_level1 uuid;
  v_level2 uuid;
  v_level3 uuid;
  v_comm numeric;
BEGIN
  SELECT * INTO v_deposit FROM public.deposits WHERE id = p_deposit_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deposit not found'; END IF;
  IF v_deposit.status <> 'pending' THEN RAISE EXCEPTION 'Deposit already processed'; END IF;
  v_user_id := v_deposit.user_id;
  v_amount := v_deposit.amount;

  UPDATE public.profiles SET main_balance = main_balance + v_amount, total_deposit = total_deposit + v_amount WHERE id = v_user_id;
  UPDATE public.deposits SET status = 'approved', reviewed_at = now() WHERE id = p_deposit_id RETURNING * INTO v_deposit;
  INSERT INTO public.transactions (user_id, type, amount, description) VALUES (v_user_id, 'deposit', v_amount, 'Deposit approved');

  SELECT referred_by INTO v_level1 FROM public.profiles WHERE id = v_user_id;
  IF v_level1 IS NOT NULL THEN
    v_comm := v_amount * 0.20;
    UPDATE public.profiles SET total_referral_commission = total_referral_commission + v_comm, main_balance = main_balance + v_comm WHERE id = v_level1;
    INSERT INTO public.referral_commissions (earner_id, source_user_id, deposit_id, level, commission_amount, paid) VALUES (v_level1, v_user_id, p_deposit_id, 1, v_comm, true);

    SELECT referred_by INTO v_level2 FROM public.profiles WHERE id = v_level1;
    IF v_level2 IS NOT NULL THEN
      v_comm := v_amount * 0.05;
      UPDATE public.profiles SET total_referral_commission = total_referral_commission + v_comm, main_balance = main_balance + v_comm WHERE id = v_level2;
      INSERT INTO public.referral_commissions (earner_id, source_user_id, deposit_id, level, commission_amount, paid) VALUES (v_level2, v_user_id, p_deposit_id, 2, v_comm, true);

      SELECT referred_by INTO v_level3 FROM public.profiles WHERE id = v_level2;
      IF v_level3 IS NOT NULL THEN
        v_comm := v_amount * 0.02;
        UPDATE public.profiles SET total_referral_commission = total_referral_commission + v_comm, main_balance = main_balance + v_comm WHERE id = v_level3;
        INSERT INTO public.referral_commissions (earner_id, source_user_id, deposit_id, level, commission_amount, paid) VALUES (v_level3, v_user_id, p_deposit_id, 3, v_comm, true);
      END IF;
    END IF;
  END IF;
  RETURN v_deposit;
END;
$$;

-- 3. approve_withdrawal: increment total_withdraw
CREATE OR REPLACE FUNCTION public.approve_withdrawal(p_withdrawal_id uuid)
RETURNS public.withdrawals
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_w public.withdrawals;
  v_user_id uuid;
  v_amount numeric;
BEGIN
  SELECT * INTO v_w FROM public.withdrawals WHERE id = p_withdrawal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Withdrawal not found'; END IF;
  IF v_w.status <> 'pending' THEN RAISE EXCEPTION 'Withdrawal already processed'; END IF;
  v_user_id := v_w.user_id;
  v_amount := v_w.amount;
  UPDATE public.withdrawals SET status = 'approved', reviewed_at = now() WHERE id = p_withdrawal_id RETURNING * INTO v_w;
  UPDATE public.profiles SET total_withdraw = total_withdraw + v_amount WHERE id = v_user_id;
  INSERT INTO public.transactions (user_id, type, amount, description) VALUES (v_user_id, 'withdrawal', v_amount, 'Withdrawal approved');
  RETURN v_w;
END;
$$;

-- 4. request_withdrawal: enforce time window 07:00-13:00 Mon-Sat
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_amount numeric, p_provider text, p_phone text, p_holder_name text DEFAULT ''
)
RETURNS public.withdrawals
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_w public.withdrawals;
  v_balance numeric;
  v_fee numeric;
  v_min numeric;
  v_has_vip boolean;
  v_hour int;
  v_dow int;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF p_provider NOT IN ('MTN', 'Airtel') THEN RAISE EXCEPTION 'Provider must be MTN or Airtel'; END IF;

  v_hour := EXTRACT(HOUR FROM now());
  v_dow := EXTRACT(DOW FROM now());
  IF v_dow = 0 THEN
    RAISE EXCEPTION 'Withdrawals are not available on Sundays. Available Mon-Sat 07:00-13:00';
  END IF;
  IF v_hour < 7 OR v_hour >= 13 THEN
    RAISE EXCEPTION 'Withdrawals are only available from 07:00 to 13:00, Monday to Saturday';
  END IF;

  SELECT min_withdraw INTO v_min FROM public.settings LIMIT 1;
  IF v_min IS NULL THEN v_min := 2000; END IF;
  IF p_amount < v_min THEN RAISE EXCEPTION 'Minimum withdrawal is % RWF', v_min; END IF;

  SELECT EXISTS(SELECT 1 FROM public.user_vips WHERE user_id = v_user_id) INTO v_has_vip;
  IF NOT v_has_vip THEN RAISE EXCEPTION 'You must purchase at least one product before withdrawing'; END IF;

  SELECT main_balance INTO v_balance FROM public.profiles WHERE id = v_user_id;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_balance < p_amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  v_fee := p_amount * 0.05;
  UPDATE public.profiles SET main_balance = main_balance - p_amount WHERE id = v_user_id;
  INSERT INTO public.withdrawals (user_id, amount, status, bank_name, account_number, holder_name, fee)
    VALUES (v_user_id, p_amount, 'pending', p_provider, p_phone, p_holder_name, v_fee) RETURNING * INTO v_w;
  INSERT INTO public.transactions (user_id, type, amount, description)
    VALUES (v_user_id, 'withdrawal', p_amount, 'Withdrawal requested (' || p_provider || ') - Fee: ' || v_fee);
  RETURN v_w;
END;
$$;

-- 5. Fix get_referral_leaderboard
DROP FUNCTION IF EXISTS public.get_referral_leaderboard(int);
CREATE OR REPLACE FUNCTION public.get_referral_leaderboard(p_limit int DEFAULT 20)
RETURNS TABLE (user_id uuid, full_name text, phone text, referral_code text, referral_count bigint, total_deposit numeric)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT p.id AS user_id, p.full_name, p.phone, p.referral_code,
         COUNT(c.id)::bigint AS referral_count, COALESCE(p.total_deposit, 0) AS total_deposit
  FROM public.profiles p
  LEFT JOIN public.profiles c ON c.referred_by = p.id
  GROUP BY p.id, p.full_name, p.phone, p.referral_code, p.total_deposit
  ORDER BY referral_count DESC, p.total_deposit DESC LIMIT p_limit;
$$;

-- 6. VIP daily income function (called by scheduled edge function)
CREATE OR REPLACE FUNCTION public.pay_daily_vip_income()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uv RECORD;
  v_today date := CURRENT_DATE;
BEGIN
  FOR v_uv IN
    SELECT uv.id, uv.user_id, uv.daily_income, uv.days_paid, uv.duration_days, uv.last_income_at
    FROM public.user_vips uv
    WHERE uv.is_active = true AND uv.days_paid < uv.duration_days
      AND (uv.last_income_at IS NULL OR DATE(uv.last_income_at) < v_today)
  LOOP
    UPDATE public.user_vips
      SET days_paid = days_paid + 1, last_income_at = now(), is_active = (days_paid + 1 < duration_days)
      WHERE id = v_uv.id;
    UPDATE public.profiles SET main_balance = main_balance + v_uv.daily_income, total_earnings = total_earnings + v_uv.daily_income WHERE id = v_uv.user_id;
    INSERT INTO public.transactions (user_id, type, amount, description) VALUES (v_uv.user_id, 'vip_income', v_uv.daily_income, 'Daily VIP income');
  END LOOP;
END;
$$;
