-- ── Student Groups ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.student_groups (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  created_by uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.student_group_members (
  group_id   uuid NOT NULL REFERENCES public.student_groups(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.student_group_tutors (
  group_id uuid NOT NULL REFERENCES public.student_groups(id) ON DELETE CASCADE,
  tutor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, tutor_id)
);

-- Shared metadata for a batch of assignments sent to a whole group
CREATE TABLE IF NOT EXISTS public.group_assignments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id         uuid        NOT NULL REFERENCES public.student_groups(id) ON DELETE CASCADE,
  assigned_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  test_type        text        NOT NULL CHECK (test_type IN ('mock', 'practice')),
  num_questions    integer,
  difficulties     text[],
  categories       text[],
  due_date         timestamptz,
  duration_minutes integer,
  note             text,
  question_ids     text[],
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Extend assignments table ─────────────────────────────────────────────────
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS group_assignment_id uuid
    REFERENCES public.group_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS question_ids text[];

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.student_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_group_tutors  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_assignments     ENABLE ROW LEVEL SECURITY;

-- Helper: is current user an admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Helper: is current user a tutor assigned to a specific group?
CREATE OR REPLACE FUNCTION public.is_group_tutor(p_group_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_group_tutors
    WHERE group_id = p_group_id AND tutor_id = auth.uid()
  );
$$;

-- student_groups: admins see/do all; tutors see only groups they're in
CREATE POLICY "groups_admin_all"     ON public.student_groups FOR ALL     TO authenticated
  USING   (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "groups_tutor_select"  ON public.student_groups FOR SELECT  TO authenticated
  USING   (public.is_group_tutor(id) OR public.is_admin());

CREATE POLICY "groups_tutor_update"  ON public.student_groups FOR UPDATE  TO authenticated
  USING   (public.is_group_tutor(id))
  WITH CHECK (public.is_group_tutor(id));

-- student_group_members: admins all; tutors can read/insert/delete for their groups
CREATE POLICY "members_admin_all"    ON public.student_group_members FOR ALL     TO authenticated
  USING   (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "members_tutor_select" ON public.student_group_members FOR SELECT  TO authenticated
  USING   (public.is_group_tutor(group_id) OR public.is_admin());

CREATE POLICY "members_tutor_insert" ON public.student_group_members FOR INSERT  TO authenticated
  WITH CHECK (public.is_group_tutor(group_id));

CREATE POLICY "members_tutor_delete" ON public.student_group_members FOR DELETE  TO authenticated
  USING   (public.is_group_tutor(group_id));

-- student_group_tutors: admins all; tutors can read their own rows
CREATE POLICY "gtutors_admin_all"    ON public.student_group_tutors FOR ALL     TO authenticated
  USING   (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "gtutors_tutor_select" ON public.student_group_tutors FOR SELECT  TO authenticated
  USING   (tutor_id = auth.uid() OR public.is_admin());

-- group_assignments: admins all; tutors can read/insert for their groups
CREATE POLICY "gassign_admin_all"    ON public.group_assignments FOR ALL     TO authenticated
  USING   (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "gassign_tutor_select" ON public.group_assignments FOR SELECT  TO authenticated
  USING   (public.is_group_tutor(group_id) OR public.is_admin());

CREATE POLICY "gassign_tutor_insert" ON public.group_assignments FOR INSERT  TO authenticated
  WITH CHECK (public.is_group_tutor(group_id));

CREATE POLICY "gassign_tutor_update" ON public.group_assignments FOR UPDATE  TO authenticated
  USING   (public.is_group_tutor(group_id))
  WITH CHECK (public.is_group_tutor(group_id));

CREATE POLICY "gassign_tutor_delete" ON public.group_assignments FOR DELETE  TO authenticated
  USING   (public.is_group_tutor(group_id));
