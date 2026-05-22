-- cleanup_old_tests: auto-delete non-diagnostic tests and their question records
-- after 1 year for all students.
--
-- Excluded: test_name = 'Diagnostic Test' (kept permanently as baseline)
-- Targets:  test_name IN ('Mock Test', 'Practice') with created_at older than 1 year
--
-- Cascade order:
--   questions  → tests
--   question_reports.test_id  CASCADE: ON DELETE SET NULL (auto, via FK)
--
-- Prerequisites: pg_cron already enabled by cleanup_inactive_students migration.

-- ── 1. Cleanup function ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cleanup_old_tests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff    TIMESTAMPTZ := NOW() - INTERVAL '1 year';
  old_tests UUID[];
BEGIN

  -- Collect IDs of non-diagnostic tests older than 1 year
  SELECT ARRAY_AGG(id)
  INTO   old_tests
  FROM   public.tests
  WHERE  test_name <> 'Diagnostic Test'
    AND  created_at < cutoff;

  IF old_tests IS NULL OR CARDINALITY(old_tests) = 0 THEN
    RETURN;
  END IF;

  -- 1. Delete question answers first (respects FK from tests → questions)
  DELETE FROM public.questions
  WHERE  test_id = ANY(old_tests);

  -- 2. Delete the tests (question_reports.test_id SET NULL via FK on cascade)
  DELETE FROM public.tests
  WHERE  id = ANY(old_tests);

END;
$$;

-- Only the postgres role (cron runner) may call this directly
REVOKE ALL ON FUNCTION public.cleanup_old_tests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_tests() TO postgres;

-- ── 2. Schedule: every Sunday at 04:00 UTC (1 h after student cleanup) ────────

-- Idempotent: drop any pre-existing schedule with the same name
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-tests') THEN
    PERFORM cron.unschedule('cleanup-old-tests');
  END IF;
END;
$$;

SELECT cron.schedule(
  'cleanup-old-tests',                    -- job name
  '0 4 * * 0',                            -- Sunday 04:00 UTC
  'SELECT public.cleanup_old_tests()'
);
