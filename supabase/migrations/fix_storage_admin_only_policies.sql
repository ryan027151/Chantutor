-- Fix storage bucket upload/update/delete policies to admin-only.
-- The original migration named them "Admins can …" but allowed all authenticated
-- users.  This migration drops and recreates them with the correct admin check.

-- INSERT: only admin role may upload
DROP POLICY IF EXISTS "Admins can upload images" ON storage.objects;
CREATE POLICY "Admins can upload images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'Images'
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- UPDATE: only admin role may replace
DROP POLICY IF EXISTS "Admins can update images" ON storage.objects;
CREATE POLICY "Admins can update images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'Images'
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- DELETE: only admin role may remove
DROP POLICY IF EXISTS "Admins can delete images" ON storage.objects;
CREATE POLICY "Admins can delete images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'Images'
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- SELECT: public read stays unchanged (no changes needed)
