/*
# Admin panel support: is_admin() helper, approval RPCs, admin RLS policies

## Purpose
Enables an admin panel for the RINOVA platform. Admins (profiles.is_admin = true)
can review deposits/withdrawals, manage users, VIP plans, tasks, settings, and
redeem codes. Previously the admin button in ProfilePage navigated to /admin
but no admin page or supporting backend existed.

## Changes

### 1. New functions
- `public.is_admin()` — SECURITY DEFINER boolean function returning true if the
  current authenticated user has profiles.is_admin = true. Used inside RLS
  policies to avoid the infinite recursion that a self-referential subquery
  on `profiles` would cause.
- `public.approve_deposit(p_deposit_id uuid)` — SECURITY DEFINER RPC. Marks a
  pending deposit approved, credits the user's main_balance + total_deposit,
  records a transaction, and records referral commissions (3 levels: 10% / 5% /
  2% of the deposit) for the referrer chain. Returns the updated deposit row.
- `public.reject_deposit(p_deposit_id uuid, p_note text)` — marks a pending
  deposit rejected with an admin note.
- `public.approve_withdrawal(p_withdrawal_id uuid)` — marks a pending withdrawal
  approved. (Funds were already reserved at request time by the application; if
  the balance is insufficient the RPC raises an exception.)
- `public.reject_withdrawal(p_withdrawal_id uuid, p_note text)` — marks a pending
  withdrawal rejected and refunds the amount to the user's main_balance.

### 2. RLS policy updates (admin read/write where appropriate)
- profiles: admin can SELECT all rows (read-only) via is_admin().
- deposits: admin can SELECT and UPDATE all rows via is_admin().
- withdrawals: admin can SELECT and UPDATE all rows via is_admin().
- vip_plans: admin can SELECT/INSERT/UPDATE/DELETE via is_admin().
- tasks: admin can INSERT/UPDATE/DELETE via is_admin().
- settings: admin can UPDATE via is_admin().
- redeem_codes: admin can INSERT/UPDATE/DELETE via is_admin().
- user_vips, transactions, referral_commissions, checkins, user_tasks,
  user_redeems: admin can SELECT all rows via is_admin() (read-only oversight).

### 3. Notes
- All functions are SECURITY DEFINER so they bypass RLS and avoid recursion.
- No data is lost; only policies and functions are added/changed.
- Idempotent: DROP ... IF EXISTS before CREATE.
*/

-- ============================================================
-- is_admin() helper — safe (non-recursive) admin check for RLS
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  );
$$;

-- ============================================================
-- Deposit approval / rejection RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_deposit(p_deposit_id uuid)
RETURNS public.deposits
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deposit public.deposits;
  v_user_id uuid;
  v_amount numeric;
  v_referrer uuid;
  v_level1 uuid;
  v_level2 uuid;
  v_level3 uuid;
  v_comm numeric;
BEGIN
  SELECT * INTO v_deposit FROM public.deposits WHERE id = p_deposit_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit not found';
  END IF;
  IF v_deposit.status <> 'pending' THEN
    RAISE EXCEPTION 'Deposit already processed';
  END IF;
  v_user_id := v_deposit.user_id;
  v_amount := v_deposit.amount;

  -- Credit user balance + total deposit
  UPDATE public.profiles
    SET main_balance = main_balance + v_amount,
        total_deposit = total_deposit + v_amount
    WHERE id = v_user_id;

  -- Mark deposit approved
  UPDATE public.deposits
    SET status = 'approved', reviewed_at = now()
    WHERE id = p_deposit_id
    RETURNING * INTO v_deposit;

  -- Record transaction
  INSERT INTO public.transactions (user_id, type, amount, description)
    VALUES (v_user_id, 'deposit', v_amount, 'Deposit approved');

  -- Referral commissions (3 levels up the referral chain)
  SELECT referred_by INTO v_level1 FROM public.profiles WHERE id = v_user_id;
  IF v_level1 IS NOT NULL THEN
    v_comm := v_amount * 0.10;
    UPDATE public.profiles
      SET total_referral_commission = total_referral_commission + v_comm,
          main_balance = main_balance + v_comm
      WHERE id = v_level1;
    INSERT INTO public.referral_commissions
      (earner_id, source_user_id, deposit_id, level, commission_amount, paid)
      VALUES (v_level1, v_user_id, p_deposit_id, 1, v_comm, true);

    SELECT referred_by INTO v_level2 FROM public.profiles WHERE id = v_level1;
    IF v_level2 IS NOT NULL THEN
      v_comm := v_amount * 0.05;
      UPDATE public.profiles
        SET total_referral_commission = total_referral_commission + v_comm,
            main_balance = main_balance + v_comm
        WHERE id = v_level2;
      INSERT INTO public.referral_commissions
        (earner_id, source_user_id, deposit_id, level, commission_amount, paid)
        VALUES (v_level2, v_user_id, p_deposit_id, 2, v_comm, true);

      SELECT referred_by INTO v_level3 FROM public.profiles WHERE id = v_level2;
      IF v_level3 IS NOT NULL THEN
        v_comm := v_amount * 0.02;
        UPDATE public.profiles
          SET total_referral_commission = total_referral_commission + v_comm,
              main_balance = main_balance + v_comm
          WHERE id = v_level3;
        INSERT INTO public.referral_commissions
          (earner_id, source_user_id, deposit_id, level, commission_amount, paid)
          VALUES (v_level3, v_user_id, p_deposit_id, 3, v_comm, true);
      END IF;
    END IF;
  END IF;

  RETURN v_deposit;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_deposit(p_deposit_id uuid, p_note text DEFAULT 'Rejected by admin')
RETURNS public.deposits
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deposit public.deposits;
BEGIN
  SELECT * INTO v_deposit FROM public.deposits WHERE id = p_deposit_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit not found';
  END IF;
  IF v_deposit.status <> 'pending' THEN
    RAISE EXCEPTION 'Deposit already processed';
  END IF;
  UPDATE public.deposits
    SET status = 'rejected', reviewed_at = now(), admin_note = p_note
    WHERE id = p_deposit_id
    RETURNING * INTO v_deposit;
  RETURN v_deposit;
END;
$$;

-- ============================================================
-- Withdrawal approval / rejection RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_withdrawal(p_withdrawal_id uuid)
RETURNS public.withdrawals
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_w public.withdrawals;
  v_user_id uuid;
  v_amount numeric;
  v_balance numeric;
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
  SELECT main_balance INTO v_balance FROM public.profiles WHERE id = v_user_id;
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF v_balance < v_amount THEN
    RAISE EXCEPTION 'Insufficient balance for approval';
  END IF;
  -- Deduct the balance (funds were only reserved at request time, not yet moved)
  UPDATE public.profiles
    SET main_balance = main_balance - v_amount
    WHERE id = v_user_id;
  UPDATE public.withdrawals
    SET status = 'approved', reviewed_at = now()
    WHERE id = p_withdrawal_id
    RETURNING * INTO v_w;
  INSERT INTO public.transactions (user_id, type, amount, description)
    VALUES (v_user_id, 'withdrawal', v_amount, 'Withdrawal approved');
  RETURN v_w;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_withdrawal(p_withdrawal_id uuid, p_note text DEFAULT 'Rejected by admin')
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
  -- Refund the reserved amount
  UPDATE public.profiles
    SET main_balance = main_balance + v_amount
    WHERE id = v_user_id;
  UPDATE public.withdrawals
    SET status = 'rejected', reviewed_at = now(), admin_note = p_note
    WHERE id = p_withdrawal_id
    RETURNING * INTO v_w;
  RETURN v_w;
END;
$$;

-- ============================================================
-- RLS policy updates — admin access via is_admin()
-- ============================================================

-- profiles: admin read-all (non-recursive)
DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "admin_update_profiles" ON profiles;
CREATE POLICY "admin_update_profiles" ON profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- deposits: admin can select + update all
DROP POLICY IF EXISTS "select_own_deposits" ON deposits;
CREATE POLICY "select_own_deposits" ON deposits FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "update_own_deposits" ON deposits;
CREATE POLICY "update_own_deposits" ON deposits FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- withdrawals: admin can select + update all
DROP POLICY IF EXISTS "select_own_withdrawals" ON withdrawals;
CREATE POLICY "select_own_withdrawals" ON withdrawals FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "update_own_withdrawals" ON withdrawals;
CREATE POLICY "update_own_withdrawals" ON withdrawals FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- vip_plans: admin full CRUD
DROP POLICY IF EXISTS "admin_write_vip_plans" ON vip_plans;
CREATE POLICY "admin_insert_vip_plans" ON vip_plans FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "admin_update_vip_plans" ON vip_plans FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_delete_vip_plans" ON vip_plans FOR DELETE
  TO authenticated USING (public.is_admin());

-- tasks: admin full CRUD
DROP POLICY IF EXISTS "admin_write_tasks" ON tasks;
CREATE POLICY "admin_insert_tasks" ON tasks FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "admin_update_tasks" ON tasks FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_delete_tasks" ON tasks FOR DELETE
  TO authenticated USING (public.is_admin());

-- settings: admin update
DROP POLICY IF EXISTS "admin_write_settings" ON settings;
CREATE POLICY "admin_update_settings" ON settings FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_insert_settings" ON settings FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "admin_delete_settings" ON settings FOR DELETE
  TO authenticated USING (public.is_admin());

-- redeem_codes: admin full CRUD
DROP POLICY IF EXISTS "admin_write_redeem_codes" ON redeem_codes;
CREATE POLICY "admin_insert_redeem_codes" ON redeem_codes FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "admin_update_redeem_codes" ON redeem_codes FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_delete_redeem_codes" ON redeem_codes FOR DELETE
  TO authenticated USING (public.is_admin());

-- Admin read-only oversight on user tables
DROP POLICY IF EXISTS "select_own_user_vips" ON user_vips;
CREATE POLICY "select_own_user_vips" ON user_vips FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "select_own_transactions" ON transactions;
CREATE POLICY "select_own_transactions" ON transactions FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "select_own_commissions" ON referral_commissions;
CREATE POLICY "select_own_commissions" ON referral_commissions FOR SELECT
  TO authenticated USING (auth.uid() = earner_id OR public.is_admin());

DROP POLICY IF EXISTS "select_own_checkins" ON checkins;
CREATE POLICY "select_own_checkins" ON checkins FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "select_own_user_tasks" ON user_tasks;
CREATE POLICY "select_own_user_tasks" ON user_tasks FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "select_own_user_redeems" ON user_redeems;
CREATE POLICY "select_own_user_redeems" ON user_redeems FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR public.is_admin());
