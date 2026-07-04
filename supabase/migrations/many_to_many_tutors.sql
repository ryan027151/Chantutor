-- Replace single profiles.tutor_id with a student_tutors junction table.
-- Supports: one student ↔ multiple tutors, one tutor ↔ multiple students.

-- ── 1. Junction table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_tutors (
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tutor_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (student_id, tutor_id)
);

ALTER TABLE public.student_tutors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage student_tutors" ON public.student_tutors
  FOR ALL TO authenticated
  USING  ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Tutors read own links" ON public.student_tutors
  FOR SELECT TO authenticated
  USING (tutor_id = auth.uid());

CREATE POLICY "Students read own tutor links" ON public.student_tutors
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());


-- ── 2. Migrate existing data from profiles.tutor_id ─────────────────────────
INSERT INTO public.student_tutors (student_id, tutor_id)
SELECT id, tutor_id FROM public.profiles
WHERE tutor_id IS NOT NULL
ON CONFLICT DO NOTHING;


-- ── 3. Recreate get_all_profiles() returning tutors as a JSON array ──────────
DROP FUNCTION IF EXISTS public.get_all_profiles();
CREATE FUNCTION public.get_all_profiles()
RETURNS TABLE (
  id               uuid,
  first_name       text,
  last_name        text,
  role             text,
  email            text,
  last_sign_in_at  timestamptz,
  tutors           jsonb
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH caller AS (
    SELECT id, role::text AS role FROM public.profiles WHERE id = auth.uid()
  )
  SELECT
    p.id,
    p.first_name,
    p.last_name,
    p.role::text,
    p.email,
    p.last_sign_in_at,
    COALESCE(
      (SELECT jsonb_agg(
                jsonb_build_object(
                  'id',         t.id::text,
                  'first_name', t.first_name,
                  'last_name',  t.last_name
                )
              )
       FROM public.student_tutors st
       JOIN public.profiles t ON t.id = st.tutor_id
       WHERE st.student_id = p.id),
      '[]'::jsonb
    ) AS tutors
  FROM public.profiles p
  WHERE
    (SELECT role FROM caller) = 'admin'
    OR (
      (SELECT role FROM caller) = 'tutor'
      AND EXISTS (
        SELECT 1 FROM public.student_tutors
        WHERE student_id = p.id AND tutor_id = (SELECT id FROM caller)
      )
    )
  ORDER BY p.first_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_profiles() TO authenticated;


-- ── 4. Drop dependent policies, then the column ──────────────────────────────
-- Must drop these old policies (which reference profiles.tutor_id) BEFORE
-- dropping the column, otherwise PostgreSQL rejects the ALTER TABLE.
DROP POLICY IF EXISTS "Tutors read assigned student tests" ON public.tests;
DROP POLICY IF EXISTS "Tutors read assigned student questions" ON public.questions;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS tutor_id;


-- ── 5. Recreate tutor RLS using student_tutors ───────────────────────────────
CREATE POLICY "Tutors read assigned student tests"
  ON public.tests FOR SELECT TO authenticated
  USING (
    (SELECT role::text FROM public.profiles WHERE id = auth.uid()) = 'tutor'
    AND EXISTS (
      SELECT 1 FROM public.student_tutors
      WHERE student_id = tests.user_id AND tutor_id = auth.uid()
    )
  );

CREATE POLICY "Tutors read assigned student questions"
  ON public.questions FOR SELECT TO authenticated
  USING (
    (SELECT role::text FROM public.profiles WHERE id = auth.uid()) = 'tutor'
    AND EXISTS (
      SELECT 1 FROM public.student_tutors
      WHERE student_id = questions.user_id AND tutor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Tutors manage assignments" ON public.assignments;
CREATE POLICY "Tutors manage assignments"
  ON public.assignments FOR ALL TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'tutor'
    AND EXISTS (
      SELECT 1 FROM public.student_tutors
      WHERE student_id = assignments.student_id AND tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'tutor'
    AND EXISTS (
      SELECT 1 FROM public.student_tutors
      WHERE student_id = assignments.student_id AND tutor_id = auth.uid()
    )
  );


-- ── 6. Update helper functions to use student_tutors ─────────────────────────
DROP FUNCTION IF EXISTS public.get_student_assignment_assigners(uuid);
CREATE FUNCTION public.get_student_assignment_assigners(p_student_id uuid)
RETURNS TABLE (assignment_id uuid, assigner_name text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT a.id,
         p.first_name || ' ' || p.last_name
  FROM public.assignments a
  JOIN public.profiles p ON p.id = a.assigned_by
  WHERE a.student_id = p_student_id
    AND (
      (SELECT role::text FROM public.profiles WHERE id = auth.uid()) = 'admin'
      OR (
        (SELECT role::text FROM public.profiles WHERE id = auth.uid()) = 'tutor'
        AND EXISTS (
          SELECT 1 FROM public.student_tutors
          WHERE student_id = p_student_id AND tutor_id = auth.uid()
        )
      )
    );
$$;
GRANT EXECUTE ON FUNCTION public.get_student_assignment_assigners(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_my_tutors();
CREATE FUNCTION public.get_my_tutors()
RETURNS TABLE (id uuid, first_name text, last_name text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT t.id, t.first_name, t.last_name
  FROM public.student_tutors st
  JOIN public.profiles t ON t.id = st.tutor_id
  WHERE st.student_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.get_my_tutors() TO authenticated;


NOTIFY pgrst, 'reload schema';
