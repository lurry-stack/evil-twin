/*
# Fix: allow users to read profiles of their direct referrals (for Team page)
*/
DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (
    auth.uid() = id
    OR public.is_admin()
    OR referred_by = auth.uid()
  );
