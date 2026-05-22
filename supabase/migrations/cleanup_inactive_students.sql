-- cleanup_inactive_students: auto-delete student accounts that have been inactive
-- for over 6 months, cascade to their data, and remove childless parents.
--
-- Inactivity definition:
--   account was created > 6 months ago
--   AND last_sign_in_at IS NULL or < 6 months ago
--   AND role = 'student'
--
-- Cascade order (respects FK constraints):
--   questions  → tests  → student_parents  → profiles  → auth.users
--   signup_tokens.used_by     CASCADE: ON DELETE SET NULL (auto)
--   question_reports.test_id  CASCADE: ON DELETE SET NULL (auto)
--   question_reports.user_id  CASCADE: ON DELETE SET NULL (auto, via auth.users FK)

-- ── 1. Enable pg_cron ─────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;

GRANT USAGE ON SCHEMA cron TO postgres;

-- ── 2. Cleanup function ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cleanup_inactive_students()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff          TIMESTAMPTZ := NOW() - INTERVAL '6 months';
  student_ids     UUID[];
  parent_ids      UUID[];
BEGIN

  -- ── Find inactive students ─────────────────────────────────────────────────
  -- An account is inactive if:
  --   • it was created more than 6 months ago, AND
  --   • last_sign_in_at is NULL (never logged in) OR older than 6 months
  SELECT ARRAY_AGG(au.id)
  INTO   student_ids
  FROM   auth.users   au
  JOIN   public.profiles p ON p.id = au.id
  WHERE  p.role = 'student'
    AND  au.created_at < cutoff
    AND  COALESCE(au.last_sign_in_at, au.created_at) < cutoff;

  -- Nothing to do
  IF student_ids IS NULL OR CARDINALITY(student_ids) = 0 THEN
    RETURN;
  END IF;

  -- ── Delete student data ────────────────────────────────────────────────────

  -- 1. Questions (answers recorded during tests / practice)
  DELETE FROM public.questions
  WHERE  user_id = ANY(student_ids);

  -- 2. Tests (question_reports.test_id → ON DELETE SET NULL; handled by FK)
  DELETE FROM public.tests
  WHERE  user_id = ANY(student_ids);

  -- 3. Parent-student links
  DELETE FROM public.student_parents
  WHERE  student_id = ANY(student_ids);

  -- 4. Profiles (signup_tokens.used_by → ON DELETE SET NULL; handled by FK)
  DELETE FROM public.profiles
  WHERE  id = ANY(student_ids);

  -- 5. Auth users (question_reports.user_id → ON DELETE SET NULL; handled by FK)
  DELETE FROM auth.users
  WHERE  id = ANY(student_ids);

  -- ── Find parents who now have no children ──────────────────────────────────
  SELECT ARRAY_AGG(au.id)
  INTO   parent_ids
  FROM   auth.users   au
  JOIN   public.profiles p ON p.id = au.id
  WHERE  p.role = 'parent'
    AND  NOT EXISTS (
      SELECT 1
      FROM   public.student_parents sp
      WHERE  sp.parent_id = au.id
    );

  IF parent_ids IS NULL OR CARDINALITY(parent_ids) = 0 THEN
    RETURN;
  END IF;

  -- ── Delete childless parent data ───────────────────────────────────────────

  DELETE FROM public.questions
  WHERE  user_id = ANY(parent_ids);

  DELETE FROM public.tests
  WHERE  user_id = ANY(parent_ids);

  DELETE FROM public.student_parents
  WHERE  parent_id = ANY(parent_ids);

  DELETE FROM public.profiles
  WHERE  id = ANY(parent_ids);

  DELETE FROM auth.users
  WHERE  id = ANY(parent_ids);

END;
$$;

-- Allow the scheduled cron job (running as postgres) to execute the function
REVOKE ALL ON FUNCTION public.cleanup_inactive_students() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_inactive_students() TO postgres;

-- ── 3. Schedule: every Sunday at 03:00 UTC ────────────────────────────────────

-- Remove any pre-existing schedule with the same name (makes migration idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-inactive-students') THEN
    PERFORM cron.unschedule('cleanup-inactive-students');
  END IF;
END;
$$;

SELECT cron.schedule(
  'cleanup-inactive-students',   -- job name
  '0 3 * * 0',                  -- cron expression: Sunday 03:00 UTC
  'SELECT public.cleanup_inactive_students()'
);
