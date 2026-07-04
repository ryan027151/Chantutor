-- Tutor RLS for question_reports.
-- Replaces the over-broad "Tutors read/update question reports" policies
-- (which allowed all reports) with policies scoped to assigned students only.

-- ── 1. Drop old over-broad tutor policies ────────────────────────────────────
DROP POLICY IF EXISTS "Tutors read question reports"   ON public.question_reports;
DROP POLICY IF EXISTS "Tutors update question reports" ON public.question_reports;

-- ── 2. INSERT — tutors can file reports for their assigned students' tests ───
DROP POLICY IF EXISTS "Tutors insert question reports" ON public.question_reports;
CREATE POLICY "Tutors insert question reports"
  ON public.question_reports FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'tutor'
    AND auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.tests t
      JOIN public.student_tutors st ON st.student_id = t.user_id
      WHERE t.id = test_id AND st.tutor_id = auth.uid()
    )
  );

-- ── 3. SELECT — tutors see only reports for their assigned students' tests ───
DROP POLICY IF EXISTS "Tutors read assigned student reports" ON public.question_reports;
CREATE POLICY "Tutors read assigned student reports"
  ON public.question_reports FOR SELECT TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'tutor'
    AND EXISTS (
      SELECT 1 FROM public.tests t
      JOIN public.student_tutors st ON st.student_id = t.user_id
      WHERE t.id = question_reports.test_id AND st.tutor_id = auth.uid()
    )
  );

-- ── 4. UPDATE — tutors can update status on their assigned students' reports ─
DROP POLICY IF EXISTS "Tutors update assigned student reports" ON public.question_reports;
CREATE POLICY "Tutors update assigned student reports"
  ON public.question_reports FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'tutor'
    AND EXISTS (
      SELECT 1 FROM public.tests t
      JOIN public.student_tutors st ON st.student_id = t.user_id
      WHERE t.id = question_reports.test_id AND st.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'tutor'
    AND EXISTS (
      SELECT 1 FROM public.tests t
      JOIN public.student_tutors st ON st.student_id = t.user_id
      WHERE t.id = question_reports.test_id AND st.tutor_id = auth.uid()
    )
  );
