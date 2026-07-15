-- Fix expired signed URLs stored in dictionary_of_media.
-- Old records were written with /object/sign/Images/... URLs (private bucket era).
-- The Images bucket is now public, so we rewrite them to /object/public/Images/...
-- The underlying files in storage are untouched.

UPDATE public.dictionary_of_media
SET content = regexp_replace(
  replace(content, '/object/sign/', '/object/public/'),
  '\?.*$', ''
)
WHERE content LIKE '%/object/sign/%';
