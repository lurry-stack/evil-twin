-- Update withdrawal fee from 0.05% to 5%
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

  v_fee := p_amount * 0.05;

  UPDATE public.profiles SET main_balance = main_balance - p_amount WHERE id = v_user_id;

  INSERT INTO public.withdrawals (user_id, amount, status, bank_name, account_number, holder_name, reviewed_at, fee)
    VALUES (v_user_id, p_amount, 'approved', p_provider, p_phone, p_provider || ' - ' || p_phone, now(), v_fee)
    RETURNING * INTO v_w;

  INSERT INTO public.transactions (user_id, type, amount, description)
    VALUES (v_user_id, 'withdrawal', p_amount, 'Mobile money withdrawal (' || p_provider || ') - Fee: ' || v_fee);

  RETURN v_w;
END;
$$;
