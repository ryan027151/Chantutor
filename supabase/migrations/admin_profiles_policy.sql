-- SECURITY DEFINER function to check admin role without RLS recursion
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- SELECT: all authenticated users can read all profiles
-- (admin panel is route-protected; students only see their own data through app logic)
DROP POLICY IF EXISTS "admins_read_all_profiles" ON public.profiles;
DROP POLICY IF EXISTS "authenticated_read_all_profiles" ON public.profiles;
CREATE POLICY "authenticated_read_all_profiles" ON public.profiles
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- UPDATE: admins only
DROP POLICY IF EXISTS "admins_update_all_profiles" ON public.profiles;
CREATE POLICY "admins_update_all_profiles" ON public.profiles
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- DELETE: admins only
DROP POLICY IF EXISTS "admins_delete_profiles" ON public.profiles;
CREATE POLICY "admins_delete_profiles" ON public.profiles
  FOR DELETE
  USING (public.is_admin());
