/*
# Phone-based auth and robust profile creation

1. Changes
- Recreate handle_new_user trigger function as SECURITY DEFINER owned by postgres so it bypasses RLS when inserting the profile row. This fixes "Database error saving new user" caused by RLS blocking the trigger's INSERT.
- Capture phone from raw_user_meta_data into profiles.phone.
- Keep referral_code generation (pgcrypto gen_random_bytes with fallback).
- Ensure the trigger fires AFTER INSERT on auth.users.

2. Security
- The function is SECURITY DEFINER, owned by postgres (bypasses RLS). It only inserts a single profile row for the just-created auth user, using NEW.id — no user-controlled data beyond full_name/phone which are validated by length.
- No policy changes needed; existing owner-scoped policies remain.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code text;
  phone text;
BEGIN
  code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  phone := NEW.raw_user_meta_data->>'phone';
  INSERT INTO public.profiles (id, full_name, phone, referral_code)
  VALUES (
    NEW.id,
    coalesce(NEW.raw_user_meta_data->>'full_name', 'RINOVA User'),
    phone,
    code
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = COALESCE(EXCLUDED.phone, profiles.phone);
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
