/*
# Fix infinite recursion in profiles RLS policy

## Problem
The `profiles` SELECT policy used a self-referential subquery:
  `EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin)`
This causes infinite recursion because evaluating the policy on `profiles`
queries `profiles` again, which re-evaluates the policy, and so on.
The result: every profile fetch returns a 500 error, which blocks the auth
guard in the frontend from ever resolving, so navigation buttons appear
"stuck" / not redirecting.

## Fix
Replace the recursive admin check with a plain owner-scoped SELECT policy
(auth.uid() = id). Admin read-all is removed for now to eliminate the
recursion; it can be re-added later via a SECURITY DEFINER helper function
if needed. The INSERT/UPDATE policies already use the non-recursive
`auth.uid() = id` form and are re-affirmed here for consistency.

## Security
- profiles SELECT: owner only (auth.uid() = id).
- profiles INSERT/UPDATE: owner only (unchanged).
*/

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
