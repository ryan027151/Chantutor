-- SECURITY DEFINER function so the admin panel can read all profiles
-- without hitting PostgREST's RLS/query-parameter conflicts on the profiles table.
CREATE OR REPLACE FUNCTION public.get_all_profiles()
RETURNS TABLE (
  id            uuid,
  first_name    text,
  last_name     text,
  role          text,
  last_sign_in_at timestamptz,
  created_at    timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id, first_name, last_name, role, last_sign_in_at, created_at
  FROM public.profiles
  ORDER BY first_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_profiles() TO authenticated;
