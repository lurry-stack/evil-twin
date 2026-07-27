/*
# Update VIP plans (12 tiers), set admin, add auto-payment RPCs

## Changes

### 1. VIP Plans — replaced with 12 tiers
- VIP 1 through VIP 12 with investment amounts from 5,000 to 1,000,000 RWF.
- Daily income = 8% of investment (0.08 as decimal rate).
- Duration: 20 days. After 20 days the product expires and must be renewed.
- Total return = daily_income * 20.
- Old 5 plans are deactivated (not deleted, to preserve purchase history).

### 2. Admin user
- Sets lurryhurry4@gmail.com (auth.users id 9e807e6e-...) to is_admin = true.

### 3. Auto-payment RPCs (MTN / Airtel mobile money)
- `auto_deposit(p_amount, p_provider, p_phone)` — user-initiated. Creates a
  deposit record, immediately credits main_balance + total_deposit, records
  a transaction, pays referral commissions, and marks the deposit approved.
  Designed for automatic mobile-money confirmation (no admin action needed).
- `auto_withdraw(p_amount, p_provider, p_phone)` — user-initiated. Validates
  balance, deducts from main_balance, creates withdrawal record marked
  approved, records a transaction. Returns the withdrawal row.

### 4. Notes
- All RPCs are SECURITY DEFINER (bypass RLS) so authenticated users can call them.
- No data loss: old plans deactivated, not deleted.
- Idempotent where possible.
*/

-- ============================================================
-- 1. Deactivate old VIP plans and insert 12 new tiers
-- ============================================================
UPDATE public.vip_plans SET is_active = false WHERE is_active = true;

INSERT INTO public.vip_plans (name, investment_amount, daily_income, duration_days, total_return, sort_order, is_active)
VALUES
  ('VIP 1',     5000,    400,    20, 8000,     1,  true),
  ('VIP 2',     10000,   800,    20, 16000,    2,  true),
  ('VIP 3',     20000,   1600,   20, 32000,    3,  true),
  ('VIP 4',     30000,   2400,   20, 48000,    4,  true),
  ('VIP 5',     50000,   4000,   20, 80000,    5,  true),
  ('VIP 6',     100000,  8000,   20, 160000,   6,  true),
  ('VIP 7',     150000,  12000,  20, 240000,   7,  true),
  ('VIP 8',     230000,  18400,  20, 368000,   8,  true),
  ('VIP 9',     300000,  24000,  20, 480000,   9,  true),
  ('VIP 10',    450000,  36000,  20, 720000,   10, true),
  ('VIP 11',    600000,  48000,  20, 960000,   11, true),
  ('VIP 12',    1000000, 80000,  20, 1600000,  12, true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. Set lurryhurry4@gmail.com as admin
-- ============================================================
UPDATE public.profiles SET is_admin = true
WHERE id = '9e807e6e-8c3d-4059-b28c-1fbb28b9aec5';

-- ============================================================
-- 3. Auto-deposit RPC (MTN / Airtel)
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_deposit(p_amount numeric, p_provider text, p_phone text)
RETURNS public.deposits
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_deposit public.deposits;
  v_referrer uuid;
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

  -- Create deposit record (auto-approved)
  INSERT INTO public.deposits (user_id, amount, status, bank_name, account_number, holder_name, reviewed_at)
    VALUES (v_user_id, p_amount, 'approved', p_provider, p_phone, p_provider || ' - ' || p_phone, now())
    RETURNING * INTO v_deposit;

  -- Credit user balance
  UPDATE public.profiles
    SET main_balance = main_balance + p_amount,
        total_deposit = total_deposit + p_amount
    WHERE id = v_user_id;

  -- Record transaction
  INSERT INTO public.transactions (user_id, type, amount, description)
    VALUES (v_user_id, 'deposit', p_amount, 'Mobile money deposit (' || p_provider || ')');

  -- Referral commissions (3 levels: 10% / 5% / 2%)
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
-- 4. Auto-withdraw RPC (MTN / Airtel)
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

  -- Deduct balance immediately
  UPDATE public.profiles SET main_balance = main_balance - p_amount WHERE id = v_user_id;

  -- Create withdrawal record (auto-approved)
  INSERT INTO public.withdrawals (user_id, amount, status, bank_name, account_number, holder_name, reviewed_at)
    VALUES (v_user_id, p_amount, 'approved', p_provider, p_phone, p_provider || ' - ' || p_phone, now())
    RETURNING * INTO v_w;

  -- Record transaction
  INSERT INTO public.transactions (user_id, type, amount, description)
    VALUES (v_user_id, 'withdrawal', p_amount, 'Mobile money withdrawal (' || p_provider || ')');

  RETURN v_w;
END;
$$;
