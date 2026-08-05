-- RPC functions for dictionary_of_media that bypass RLS via SECURITY DEFINER.
-- Each function verifies the caller is an admin before acting.

-- Upsert (insert or update) a media record.
-- Uses IF EXISTS → UPDATE / ELSE → MAX("index")+1 INSERT to avoid
-- PK conflicts when "index" has a fixed default (e.g. DEFAULT 0).
CREATE OR REPLACE FUNCTION public.upsert_media_record(
  p_media_id    text,
  p_question_id text,
  p_media_type  text,
  p_content     text,
  p_index       integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role    text;
  v_new_idx integer;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  IF EXISTS (SELECT 1 FROM public.dictionary_of_media WHERE media_id = p_media_id) THEN
    -- Row exists: update all fields including question_id so the passage is
    -- correctly linked to the question it belongs to.
    UPDATE public.dictionary_of_media
    SET media_type  = p_media_type,
        content     = p_content,
        question_id = p_question_id
    WHERE media_id = p_media_id;
  ELSE
    -- Row does not exist: compute a unique index (MAX + 1) and insert.
    -- This avoids PK conflicts when "index" has a fixed default value (e.g. 0).
    SELECT COALESCE(MAX("index"), -1) + 1 INTO v_new_idx
    FROM public.dictionary_of_media;

    INSERT INTO public.dictionary_of_media ("index", media_id, question_id, media_type, content)
    VALUES (v_new_idx, p_media_id, p_question_id, p_media_type, p_content);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_media_record TO authenticated;

-- Delete a media record by media_id.
CREATE OR REPLACE FUNCTION public.delete_media_record(
  p_media_id text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'admin role required';
  END IF;
  DELETE FROM public.dictionary_of_media WHERE media_id = p_media_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_media_record TO authenticated;

-- Fetch all media records for a question.
-- No role check needed — authenticated SELECT is allowed by RLS policy.
-- SECURITY DEFINER ensures it bypasses any future restrictive RLS changes.
-- DROP first because changing RETURNS TABLE columns requires a full recreate.
DROP FUNCTION IF EXISTS public.get_media_for_question(text);
CREATE FUNCTION public.get_media_for_question(
  p_question_id text
) RETURNS TABLE (
  media_id   text,
  media_type text,
  content    text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT d.media_id, d.media_type, d.content
    FROM public.dictionary_of_media d
    WHERE d.question_id = p_question_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_media_for_question TO authenticated;
