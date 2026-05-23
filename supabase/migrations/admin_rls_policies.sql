-- Grants admin users full write access to all_questions from the frontend.
-- The edge functions use service-role key and bypass RLS entirely.
-- Students (authenticated, non-admin) can only read.

-- Make sure RLS is on (safe if already enabled)
ALTER TABLE public.all_questions ENABLE ROW LEVEL SECURITY;

-- Read: all authenticated users can see questions (needed for tests)
DROP POLICY IF EXISTS "authenticated_read_questions" ON public.all_questions;
CREATE POLICY "authenticated_read_questions" ON public.all_questions
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Write: admin role only
DROP POLICY IF EXISTS "admin_insert_questions" ON public.all_questions;
CREATE POLICY "admin_insert_questions" ON public.all_questions
  FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "admin_update_questions" ON public.all_questions;
CREATE POLICY "admin_update_questions" ON public.all_questions
  FOR UPDATE
  USING  ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

DROP POLICY IF EXISTS "admin_delete_questions" ON public.all_questions;
CREATE POLICY "admin_delete_questions" ON public.all_questions
  FOR DELETE
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );
