-- Events submitted by link wait here for Pedro's approval instead of going
-- live on an AI score alone (2026-10-07: "human judgment stays in the loop";
-- a crafted page could prompt-inject a high score). Every scored submission is
-- recorded (incl. auto-rejected) so submissions per user can be rate-limited.
-- Server-only: written by /api/submit-event, read/decided via admin routes.
CREATE TABLE IF NOT EXISTS public.quest_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  url text NOT NULL,
  title text NOT NULL,
  description text,
  category text,
  lat double precision,
  lng double precision,
  address text,
  starts_at timestamptz,
  ends_at timestamptz,
  image_url text,
  organizer text,
  ai_score int NOT NULL,
  ai_reasoning text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'auto_rejected')),
  quest_id uuid REFERENCES public.quests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS quest_submissions_status_idx ON public.quest_submissions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS quest_submissions_user_idx ON public.quest_submissions (submitted_by, created_at DESC);
ALTER TABLE public.quest_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quest_submissions FROM anon, authenticated;
GRANT ALL ON public.quest_submissions TO service_role;
