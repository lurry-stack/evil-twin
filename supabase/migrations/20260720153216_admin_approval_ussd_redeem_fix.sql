/*
# Admin approval flow, USSD codes, redeem expiry, leaderboard fix, admin user management

## Changes
1. Fix get_referral_leaderboard ambiguous user_id by aliasing columns
2. Switch deposits to pending (admin approval required) - drop auto_deposit RPC
3. Switch withdrawals to pending (admin approval required) - drop auto_withdraw RPC
4. Add USSD code columns to settings (mtn_ussd_template, airtel_ussd_template, mtn_destination, airtel_destination)
5. Add expiry_duration_minutes to redeem_codes for relative expiry
6. Add admin_delete_user RPC (deletes auth.users row, cascades to profiles)
7. Add admin_update_balance RPC
8. Add admin_delete_user_vip RPC
9. RLS: allow admin to delete user_vips, user_redeems, transactions
10. Allow admin to delete profiles (for user deletion)
*/

-- ============================================================
-- 1. Fix get_referral_leaderboard - ambiguous user_id
-- ============================================================
DROP FUNCTION IF EXISTS public.get_referral_leaderboard(int);
CREATE OR REPLACE FUNCTION public.get_referral_leaderboard(p_limit int DEFAULT 20)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  phone text,
  referral_code text,
  referral_count bigint,
  total_deposit numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT p.id AS user_id, p.full_name, p.phone, p.referral_code,
         COUNT(c.id)::bigint AS referral_count,
         COALESCE(p.total_deposit, 0) AS total_deposit
  FROM public.profiles p
  LEFT JOIN public.profiles c ON c.referred_by = p.id
  GROUP BY p.id, p.full_name, p.phone, p.referral_code, p.total_deposit
  ORDER BY referral_count DESC, p.total_deposit DESC
  LIMIT p_limit;
$$;

-- ============================================================
-- 2. Drop auto_deposit (deposits now require admin approval)
-- ============================================================
DROP FUNCTION IF EXISTS public.auto_deposit(numeric, text, text, text);

-- ============================================================
-- 3. Drop auto_withdraw (withdrawals now require admin approval)
-- Withdrawals still deduct balance at request time; approve_withdrawal
-- already exists and just marks approved. We update it to NOT deduct
-- again (balance was already deducted at request). reject_withdrawal
-- refunds.
-- ============================================================
DROP FUNCTION IF EXISTS public.auto_withdraw(numeric, text, text);

-- approve_withdrawal should NOT deduct balance (already deducted at request)
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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal not found';
  END IF;
  IF v_w.status <> 'pending' THEN
    RAISE EXCEPTION 'Withdrawal already processed';
  END IF;
  v_user_id := v_w.user_id;
  v_amount := v_w.amount;
  -- Balance was already deducted at request time; just mark approved
  UPDATE public.withdrawals
    SET status = 'approved', reviewed_at = now()
    WHERE id = p_withdrawal_id
    RETURNING * INTO v_w;
  INSERT INTO public.transactions (user_id, type, amount, description)
    VALUES (v_user_id, 'withdrawal', v_amount, 'Withdrawal approved');
  RETURN v_w;
END;
$$;

-- Create withdrawal as pending (deducts balance at request time, 5% fee recorded)
CREATE OR REPLACE FUNCTION public.request_withdrawal(p_amount numeric, p_provider text, p_phone text)
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

  -- Deduct full amount from balance at request time
  UPDATE public.profiles SET main_balance = main_balance - p_amount WHERE id = v_user_id;

  -- Create pending withdrawal record with fee
  INSERT INTO public.withdrawals (user_id, amount, status, bank_name, account_number, holder_name, fee)
    VALUES (v_user_id, p_amount, 'pending', p_provider, p_phone, p_provider || ' - ' || p_phone, v_fee)
    RETURNING * INTO v_w;

  INSERT INTO public.transactions (user_id, type, amount, description)
    VALUES (v_user_id, 'withdrawal', p_amount, 'Withdrawal requested (' || p_provider || ') - Fee: ' || v_fee);

  RETURN v_w;
END;
$$;

-- ============================================================
-- 4. USSD code columns in settings
-- ============================================================
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS mtn_ussd_template text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS airtel_ussd_template text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS mtn_destination text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS airtel_destination text;

UPDATE public.settings SET
  mtn_ussd_template = '*182*8*1*101010*{amount}#',
  airtel_ussd_template = '*425*2*101010*{amount}#',
  mtn_destination = '101010',
  airtel_destination = '101010'
WHERE id = (SELECT id FROM public.settings LIMIT 1);

-- ============================================================
-- 5. Redeem code expiry duration (minutes) + one-time per user
-- ============================================================
ALTER TABLE public.redeem_codes ADD COLUMN IF NOT EXISTS expiry_minutes integer;

-- RLS: allow users to read their own user_redeems (already exists)
-- Add unique constraint so a user can only redeem a code once
DROP INDEX IF EXISTS user_redeems_user_code_unique;
CREATE UNIQUE INDEX user_redeems_user_code_unique ON public.user_redeems (user_id, code_id);

-- ============================================================
-- 6. Admin delete user (deletes from auth.users, cascades to profiles)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

-- ============================================================
-- 7. Admin update user balance
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_update_balance(p_user_id uuid, p_new_balance numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  UPDATE public.profiles SET main_balance = p_new_balance WHERE id = p_user_id;
END;
$$;

-- ============================================================
-- 8. Admin delete user VIP product
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_delete_user_vip(p_user_vip_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  DELETE FROM public.user_vips WHERE id = p_user_vip_id;
END;
$$;

-- ============================================================
-- 9. RLS: admin can delete user_vips, user_redeems, transactions
-- ============================================================
DROP POLICY IF EXISTS "admin_delete_user_vips" ON user_vips;
CREATE POLICY "admin_delete_user_vips" ON user_vips FOR DELETE
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_user_redeems" ON user_redeems;
CREATE POLICY "admin_delete_user_redeems" ON user_redeems FOR DELETE
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_transactions" ON transactions;
CREATE POLICY "admin_delete_transactions" ON transactions FOR DELETE
  TO authenticated USING (public.is_admin());

-- Admin can delete profiles (for user management)
DROP POLICY IF EXISTS "admin_delete_profiles" ON profiles;
CREATE POLICY "admin_delete_profiles" ON profiles FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============================================================
-- 10. Allow admin to read all user_redeems (already has select policy
-- but let's make sure admin can read all)
-- ============================================================
DROP POLICY IF EXISTS "select_own_user_redeems" ON user_redeems;
CREATE POLICY "select_own_user_redeems" ON user_redeems FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR public.is_admin());

-- Allow admin to insert user_redeems (for testing purposes, not strictly needed)
DROP POLICY IF EXISTS "insert_own_user_redeems" ON user_redeems;
CREATE POLICY "insert_own_user_redeems" ON user_redeems FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
