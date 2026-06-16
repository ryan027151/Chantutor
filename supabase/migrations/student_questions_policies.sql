-- Student write policies for the questions table (student answer records).
-- The questions table had RLS enabled with only an admin SELECT policy.
-- Students need INSERT + UPDATE to save their answers, and SELECT to resume tests.
-- Run this in Supabase SQL Editor.

-- Students can save their own answers
DROP POLICY IF EXISTS "students_insert_questions" ON public.questions;
CREATE POLICY "students_insert_questions"
  ON public.questions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Students can update their own answers (handles upsert conflict path)
DROP POLICY IF EXISTS "students_update_questions" ON public.questions;
CREATE POLICY "students_update_questions"
  ON public.questions FOR UPDATE
  TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Students can read their own answers (needed for test resume + results)
DROP POLICY IF EXISTS "students_read_own_questions" ON public.questions;
CREATE POLICY "students_read_own_questions"
  ON public.questions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
