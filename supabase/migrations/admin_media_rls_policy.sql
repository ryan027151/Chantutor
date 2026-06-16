-- Grant admin users full CRUD access to dictionary_of_media.
-- Without this policy admins cannot INSERT/UPDATE/DELETE media records.

DROP POLICY IF EXISTS "Admins can manage media dictionary" ON public.dictionary_of_media;
CREATE POLICY "Admins can manage media dictionary"
  ON public.dictionary_of_media FOR ALL
  TO authenticated
  USING      ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Allow everyone (authenticated) to read media records so questions render for students.
DROP POLICY IF EXISTS "Authenticated users can read media dictionary" ON public.dictionary_of_media;
CREATE POLICY "Authenticated users can read media dictionary"
  ON public.dictionary_of_media FOR SELECT
  TO authenticated
  USING (true);

