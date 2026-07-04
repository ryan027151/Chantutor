-- Allow tutors to reset tests for their assigned students.
-- Reset = delete all questions for a test + set tests.score = null.
-- Tutors must NOT be able to delete test rows themselves.

-- ── 1. DELETE on questions — tutors can clear answers for assigned students ───
DROP POLICY IF EXISTS "Tutors delete assigned student questions" ON public.questions;
CREATE POLICY "Tutors delete assigned student questions"
  ON public.questions FOR DELETE TO authenticated
  USING (
    (SELECT role::text FROM public.profiles WHERE id = auth.uid()) = 'tutor'
    AND EXISTS (
      SELECT 1 FROM public.student_tutors
      WHERE student_id = questions.user_id AND tutor_id = auth.uid()
    )
  );

-- ── 2. UPDATE on tests — tutors can set score = null (reset) for assigned students
-- Note: no DELETE policy on tests, so tutors cannot delete test rows.
DROP POLICY IF EXISTS "Tutors update assigned student tests" ON public.tests;
CREATE POLICY "Tutors update assigned student tests"
  ON public.tests FOR UPDATE TO authenticated
  USING (
    (SELECT role::text FROM public.profiles WHERE id = auth.uid()) = 'tutor'
    AND EXISTS (
      SELECT 1 FROM public.student_tutors
      WHERE student_id = tests.user_id AND tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    (SELECT role::text FROM public.profiles WHERE id = auth.uid()) = 'tutor'
    AND EXISTS (
      SELECT 1 FROM public.student_tutors
      WHERE student_id = tests.user_id AND tutor_id = auth.uid()
    )
  );
