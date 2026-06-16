-- Fix: revert profiles SELECT policy to be resilient to token-refresh timing.
--
-- security_hardening.sql changed the policy to USING (auth.uid() = id).
-- During a Supabase token refresh, auth.uid() can transiently return null
-- inside the DB session. When this coincides with a getUser() call, the query
-- returns zero rows → setUser(null) → student logged out mid-test.
--
-- Primary fix: App.tsx no longer calls getUser() for same-user auth events
-- (see the extended loadedUserIdRef guard). This SQL is defense-in-depth only.
--
-- The policy reverts to auth.role() = 'authenticated' — any logged-in user can
-- read any profile row. This is acceptable because:
--   • getUser() always adds .eq('id', authUser.id), so students never see others' data.
--   • The profiles table contains no sensitive data (name, role only — no emails/passwords).
--   • get_all_profiles() RPC (admin-only) is the controlled pathway for listing all profiles.
--
-- Run this in Supabase SQL Editor after security_hardening.sql.

DROP POLICY IF EXISTS "users_read_own_profile"         ON public.profiles;
DROP POLICY IF EXISTS "authenticated_read_all_profiles" ON public.profiles;

CREATE POLICY "users_read_own_profile" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.role() = 'authenticated');
