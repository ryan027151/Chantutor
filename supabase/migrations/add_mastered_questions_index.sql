-- Partial index on the questions table to make the cross-session mastery
-- lookup fast: SELECT id FROM questions WHERE user_id = $1 AND is_correct = true
-- Only rows where is_correct is true are indexed, keeping the index tiny.
CREATE INDEX IF NOT EXISTS idx_questions_user_mastered
  ON public.questions (user_id)
  WHERE is_correct = true;
