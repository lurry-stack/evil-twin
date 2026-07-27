/*
# Fix: allow users to read profiles in their 3-level referral chain (for Team page)
*/
CREATE OR REPLACE FUNCTION public.is_in_my_referral_chain(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH RECURSIVE chain AS (
    SELECT id FROM public.profiles WHERE referred_by = auth.uid()
    UNION
    SELECT c.id FROM public.profiles c JOIN chain ON c.referred_by = chain.id
  )
  SELECT EXISTS (SELECT 1 FROM chain WHERE id = p_user_id);
$$;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (
    auth.uid() = id
    OR public.is_admin()
    OR public.is_in_my_referral_chain(id)
  );
