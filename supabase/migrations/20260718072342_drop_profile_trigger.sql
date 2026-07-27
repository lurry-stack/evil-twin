/*
# Drop auto profile trigger, handle profile creation in app/edge function

1. Changes
- Drop the on_auth_user_created trigger and handle_new_user function.
- Profile creation is now handled explicitly by the signup edge function using the service role key, which bypasses RLS.
- This avoids the "Database error creating new user" caused by the trigger failing inside the auth.users insert flow (permission/search_path issues in the Supabase auth schema context).

2. Security
- No policy changes. The edge function uses the service role key (bypasses RLS) and is the only path that creates profiles.
- profiles INSERT policy for authenticated users remains for any future client-side flows.
*/

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
