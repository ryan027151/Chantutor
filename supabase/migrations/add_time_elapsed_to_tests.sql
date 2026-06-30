-- Cross-device timer resume: stores seconds elapsed during an active test session.
-- On resume (same or new device), the client computes remaining = duration*60 - time_elapsed.
-- localStorage is still the primary source on the same device (updated every second);
-- this column is the fallback used when localStorage is empty (new device / cleared browser).
-- Cleared to NULL when the test is marked complete.

ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS time_elapsed integer DEFAULT 0;
