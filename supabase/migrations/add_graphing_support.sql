-- Track whether a question was added manually ('bank') or AI-generated ('ai')
ALTER TABLE public.all_questions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'bank';

-- Fast filtering by source in the admin panel
CREATE INDEX IF NOT EXISTS idx_all_questions_source ON public.all_questions (source);
