-- Allow admins to delete report logs from question_reports
DROP POLICY IF EXISTS "admins_delete_reports" ON question_reports;
CREATE POLICY "admins_delete_reports" ON question_reports
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
