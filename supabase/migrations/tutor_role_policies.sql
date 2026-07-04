-- Tutor role: read-only access to student data + ability to assign work + manage reports.
-- Tutors CANNOT delete students, tests, questions, or report logs.
-- Run this in Supabase SQL Editor.

-- ── 0. Allow 'tutor' as a valid role in the user_role enum ──────────────────
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'tutor';

-- ── 1. Update get_all_profiles() to allow tutor role ─────────────────────────
-- Drop and recreate because the function body changes (was admin-only).
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
  SELECT role::text INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' AND v_role IS DISTINCT FROM 'tutor' THEN
    RAISE EXCEPTION 'admin or tutor role required';
  END IF;
  RETURN QUERY
    SELECT p.id, p.first_name, p.last_name, p.role::text, p.last_sign_in_at, p.created_at
    FROM public.profiles p
    ORDER BY p.first_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_profiles() TO authenticated;

-- ── 2. Tutors can read tests of their assigned students only ──────────────────
DROP POLICY IF EXISTS "Tutors read all tests" ON public.tests;
DROP POLICY IF EXISTS "Tutors read assigned student tests" ON public.tests;
CREATE POLICY "Tutors read assigned student tests"
  ON public.tests FOR SELECT TO authenticated
  USING (
    (SELECT role::text FROM public.profiles WHERE id = auth.uid()) = 'tutor'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = tests.user_id AND p.tutor_id = auth.uid()
    )
  );

-- ── 3. Tutors can read question answers of their assigned students only ────────
DROP POLICY IF EXISTS "Tutors read all questions" ON public.questions;
DROP POLICY IF EXISTS "Tutors read assigned student questions" ON public.questions;
CREATE POLICY "Tutors read assigned student questions"
  ON public.questions FOR SELECT TO authenticated
  USING (
    (SELECT role::text FROM public.profiles WHERE id = auth.uid()) = 'tutor'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = questions.user_id AND p.tutor_id = auth.uid()
    )
  );

-- ── 4. Tutors can manage assignments (assign, view, update, delete) ───────────
DROP POLICY IF EXISTS "Tutors manage assignments" ON public.assignments;
CREATE POLICY "Tutors manage assignments"
  ON public.assignments FOR ALL TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'tutor'
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'tutor'
  );

-- ── 5. Tutors can read and update question reports (no delete) ────────────────
DROP POLICY IF EXISTS "Tutors read question reports" ON public.question_reports;
CREATE POLICY "Tutors read question reports"
  ON public.question_reports FOR SELECT TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'tutor'
  );

DROP POLICY IF EXISTS "Tutors update question reports" ON public.question_reports;
CREATE POLICY "Tutors update question reports"
  ON public.question_reports FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'tutor'
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'tutor'
  );
