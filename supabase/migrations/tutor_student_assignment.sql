-- Tutor-student assignment: admin assigns a tutor to a student;
-- tutors only see their own assigned students via get_all_profiles().

-- 1. Add tutor_id to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tutor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Recreate get_all_profiles:
--    admin → all profiles (with tutor name joined)
--    tutor → only profiles where tutor_id = auth.uid()
DROP FUNCTION IF EXISTS public.get_all_profiles();

CREATE FUNCTION public.get_all_profiles()
RETURNS TABLE (
  id               uuid,
  first_name       text,
  last_name        text,
  role             text,
  email            text,
  last_sign_in_at  timestamptz,
  tutor_id         uuid,
  tutor_first_name text,
  tutor_last_name  text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH caller AS (
    SELECT id, role::text AS role FROM public.profiles WHERE id = auth.uid()
  )
  SELECT
    p.id,
    p.first_name,
    p.last_name,
    p.role::text,
    p.email,
    p.last_sign_in_at,
    p.tutor_id,
    t.first_name AS tutor_first_name,
    t.last_name  AS tutor_last_name
  FROM public.profiles p
  LEFT JOIN public.profiles t ON t.id = p.tutor_id
  WHERE
    (SELECT role FROM caller) = 'admin'
    OR (
      (SELECT role FROM caller) = 'tutor'
      AND p.tutor_id = (SELECT id FROM caller)
    )
  ORDER BY p.first_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_profiles() TO authenticated;
NOTIFY pgrst, 'reload schema';
