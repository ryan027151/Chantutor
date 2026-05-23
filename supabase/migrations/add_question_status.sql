-- Adds approval status to questions so AI-generated questions can be reviewed
-- before appearing in tests. Existing questions default to 'approved'.
ALTER TABLE public.all_questions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';

CREATE INDEX IF NOT EXISTS idx_all_questions_status ON public.all_questions (status);
