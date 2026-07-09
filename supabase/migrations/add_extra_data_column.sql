-- Add extra_data JSONB column to all_questions.
-- Used by multi-select questions to store select_count and optional choice_5 / choice_6.
-- All existing rows get NULL — zero impact on MCQ, grid-in, and linear_graphing questions.
ALTER TABLE public.all_questions ADD COLUMN IF NOT EXISTS extra_data JSONB;
