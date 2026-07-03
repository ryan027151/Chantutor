-- Tutor role: read-only access to student data + ability to assign work + manage reports.
-- Tutors CANNOT delete students, tests, questions, or report logs.
-- Run this in Supabase SQL Editor.

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
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('admin', 'tutor') THEN
    RAISE EXCEPTION 'admin or tutor role required';
  END IF;
  RETURN QUERY
    SELECT p.id, p.first_name, p.last_name, p.role, p.last_sign_in_at, p.created_at
    FROM public.profiles p
    ORDER BY p.first_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_profiles() TO authenticated;

-- ── 2. Tutors can read all tests ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Tutors read all tests" ON public.tests;
CREATE POLICY "Tutors read all tests"
  ON public.tests FOR SELECT TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'tutor'
  );

-- ── 3. Tutors can read all question answers ───────────────────────────────────
DROP POLICY IF EXISTS "Tutors read all questions" ON public.questions;
CREATE POLICY "Tutors read all questions"
  ON public.questions FOR SELECT TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'tutor'
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
