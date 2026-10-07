-- Luma events the AI scored below threshold, per calendar, so the daily sync
-- never pays to score them again (2026-10-07 audit: they were re-scored daily).
ALTER TABLE public.connected_calendars
  ADD COLUMN IF NOT EXISTS rejected_event_ids text[] NOT NULL DEFAULT '{}';
