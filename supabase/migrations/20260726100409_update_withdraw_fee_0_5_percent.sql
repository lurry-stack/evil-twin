-- Fix withdrawal fee from 5% (0.05) to 0.5% (0.005)
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

  v_fee := p_amount * 0.005;  -- 0.5% fee (was 0.05 = 5%)
  UPDATE public.profiles SET main_balance = main_balance - p_amount WHERE id = v_user_id;
  INSERT INTO public.withdrawals (user_id, amount, status, bank_name, account_number, holder_name, fee)
    VALUES (v_user_id, p_amount, 'pending', p_provider, p_phone, p_holder_name, v_fee) RETURNING * INTO v_w;
  INSERT INTO public.transactions (user_id, type, amount, description)
    VALUES (v_user_id, 'withdrawal', p_amount, 'Withdrawal requested (' || p_provider || ') - Fee: ' || v_fee);
  RETURN v_w;
END;
$$;
