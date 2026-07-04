-- SECURITY DEFINER functions for assigner names — avoids RLS recursion.
-- (A direct profiles policy subquerying assignments loops back into profiles.)

-- For students: returns assigner names for their own assignments
DROP FUNCTION IF EXISTS public.get_my_assignment_assigners();
CREATE FUNCTION public.get_my_assignment_assigners()
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
  WHERE a.student_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_assignment_assigners() TO authenticated;


-- For admin/tutor: returns assigner names for a given student's assignments
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
        AND (SELECT tutor_id FROM public.profiles WHERE id = p_student_id) = auth.uid()
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_student_assignment_assigners(uuid) TO authenticated;
