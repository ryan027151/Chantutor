-- Security hardening — fixes four gaps found during audit.
-- Run this once in Supabase SQL Editor.

-- ── 1. Storage: restrict writes to admin only ────────────────────────────────
-- The original create_images_storage_bucket.sql allowed any authenticated user
-- to upload/update/delete images. Fix: require admin role for all writes.

DROP POLICY IF EXISTS "Admins can upload images"  ON storage.objects;
DROP POLICY IF EXISTS "Admins can update images"  ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete images"  ON storage.objects;

CREATE POLICY "Admins can upload images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'Images'
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Admins can update images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'Images'
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Admins can delete images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'Images'
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );


-- ── 2. get_all_profiles() RPC: add admin check ───────────────────────────────
-- Previously had no role check — any authenticated user could list all profiles.
-- DROP first because the return type is changing (adding admin check changes PL/pgSQL body).

DROP FUNCTION IF EXISTS public.get_all_profiles();
CREATE OR REPLACE FUNCTION public.get_all_profiles()
RETURNS TABLE (
  id              uuid,
  first_name      text,
  last_name       text,
  role            text,
  last_sign_in_at timestamptz,
  created_at      timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'admin role required';
  END IF;
  RETURN QUERY
    SELECT p.id, p.first_name, p.last_name, p.role, p.last_sign_in_at, p.created_at
    FROM public.profiles p
    ORDER BY p.first_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_profiles() TO authenticated;


-- ── 3. dictionary_of_media: ensure RLS is enabled ───────────────────────────
-- The policies exist but were never paired with ENABLE ROW LEVEL SECURITY.

ALTER TABLE public.dictionary_of_media ENABLE ROW LEVEL SECURITY;


-- ── 4. profiles SELECT: restrict to own row (admin uses RPC instead) ─────────
-- Previously all authenticated users could read every profile.
-- Admins already use get_all_profiles() RPC which bypasses RLS via SECURITY DEFINER.

DROP POLICY IF EXISTS "authenticated_read_all_profiles" ON public.profiles;
DROP POLICY IF EXISTS "admins_read_all_profiles"        ON public.profiles;

-- Users read only their own profile
CREATE POLICY "users_read_own_profile" ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);
