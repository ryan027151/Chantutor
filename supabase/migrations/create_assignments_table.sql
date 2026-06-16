CREATE TABLE IF NOT EXISTS public.assignments (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id       UUID        NOT NULL,
  assigned_by      UUID        NOT NULL,
  test_type        TEXT        NOT NULL CHECK (test_type IN ('mock', 'practice')),
  num_questions    INT,
  difficulties     TEXT[],
  categories       TEXT[],
  due_date         TIMESTAMPTZ,
  duration_minutes INT,
  note             TEXT,
  status           TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  test_id          UUID        REFERENCES public.tests(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read own assignments"
  ON public.assignments FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Students update own assignments"
  ON public.assignments FOR UPDATE TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Admins manage assignments"
  ON public.assignments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
