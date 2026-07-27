/*
# Simplify handle_new_user trigger

1. Changes
- Simplify the trigger function to a plain INSERT (no ON CONFLICT clause) — the ON CONFLICT DO UPDATE was referencing columns in a way that can fail during the auth user creation flow.
- Keep SECURITY DEFINER / postgres owner so RLS is bypassed.
- Keep phone capture from raw_user_meta_data.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code text;
BEGIN
  code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  INSERT INTO public.profiles (id, full_name, phone, referral_code)
  VALUES (
    NEW.id,
    coalesce(NEW.raw_user_meta_data->>'full_name', 'RINOVA User'),
    NEW.raw_user_meta_data->>'phone',
    code
  );
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
