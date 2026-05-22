-- sync_last_sign_in: add last_sign_in_at to profiles and keep it in sync with
-- auth.users via a trigger so the admin panel can read inactivity without
-- accessing auth.users directly from the client.

-- ── 1. Add column ─────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz;

-- ── 2. Backfill existing users ────────────────────────────────────────────────

UPDATE public.profiles p
SET    last_sign_in_at = au.last_sign_in_at
FROM   auth.users au
WHERE  au.id = p.id
  AND  au.last_sign_in_at IS NOT NULL;

-- ── 3. Trigger function ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_last_sign_in()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET    last_sign_in_at = NEW.last_sign_in_at
  WHERE  id = NEW.id;
  RETURN NEW;
END;
$$;

-- ── 4. Attach trigger to auth.users ──────────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_sign_in ON auth.users;

CREATE TRIGGER on_auth_user_sign_in
AFTER UPDATE OF last_sign_in_at ON auth.users
FOR EACH ROW
WHEN (NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at)
EXECUTE FUNCTION public.sync_last_sign_in();
