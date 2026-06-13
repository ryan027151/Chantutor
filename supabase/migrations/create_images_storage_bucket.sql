-- Create the images storage bucket for question media
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'Images',
  'Images',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users (admins) to upload images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admins can upload images'
  ) THEN
    CREATE POLICY "Admins can upload images"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'Images');
  END IF;
END $$;

-- Allow authenticated users to update/replace images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admins can update images'
  ) THEN
    CREATE POLICY "Admins can update images"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'Images');
  END IF;
END $$;

-- Allow authenticated users to delete images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admins can delete images'
  ) THEN
    CREATE POLICY "Admins can delete images"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'Images');
  END IF;
END $$;

-- Allow public read access to images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public can view images'
  ) THEN
    CREATE POLICY "Public can view images"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'Images');
  END IF;
END $$;
