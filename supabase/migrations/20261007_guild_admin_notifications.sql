-- Remembers admin notification emails so a route called in a loop can't
-- flood the admin inbox / Gmail quota (2026-10-07 audit). Server-only.
CREATE TABLE IF NOT EXISTS public.guild_admin_notifications (
  kind text NOT NULL,
  ref_id uuid NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, ref_id)
);
ALTER TABLE public.guild_admin_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guild_admin_notifications FROM anon, authenticated;
GRANT ALL ON public.guild_admin_notifications TO service_role;
