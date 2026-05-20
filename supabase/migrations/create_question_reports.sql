-- Question reports table — stores flags submitted by students during tests
CREATE TABLE IF NOT EXISTS question_reports (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    timestamptz DEFAULT now() NOT NULL,
  user_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  test_id       uuid        REFERENCES tests(id) ON DELETE SET NULL,
  question_uid  text,
  order_index   integer,
  test_name     text,
  reason        text        NOT NULL,
  description   text,
  status        text        DEFAULT 'pending'
                CHECK (status IN ('pending', 'reviewed', 'resolved'))
);

ALTER TABLE question_reports ENABLE ROW LEVEL SECURITY;

-- Students can file reports for their own sessions
CREATE POLICY "students_insert_reports"
  ON question_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Students can read their own reports
CREATE POLICY "students_read_own_reports"
  ON question_reports FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can read all reports
CREATE POLICY "admins_read_all_reports"
  ON question_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can update report status
CREATE POLICY "admins_update_reports"
  ON question_reports FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
