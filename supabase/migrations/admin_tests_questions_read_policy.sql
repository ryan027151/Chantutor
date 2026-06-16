-- Allow admins to read any student's test records and question answers.
-- Students already have their own read policies (user_id = auth.uid()) set up in dashboard.

-- tests table
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read all tests" ON public.tests;
CREATE POLICY "Admins read all tests"
  ON public.tests FOR SELECT TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- questions table (student answers)
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read all questions" ON public.questions;
CREATE POLICY "Admins read all questions"
  ON public.questions FOR SELECT TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );
