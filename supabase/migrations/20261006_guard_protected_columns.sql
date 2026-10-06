-- Guard columns that only the server (service role) or admins may change.
--
-- The tables' RLS policies let owners write their own rows "FOR ALL" with no
-- column limits, so from the browser (anon key + user JWT) a signed-in user
-- could, before this migration (2026-10-06 audit):
--   - guild_practitioners: set verified = true on themselves
--   - guild_pitches:       set status = 'published', skipping review
--   - guild_projects:      set status / paid
--   - profiles:            raise their own trust_level and counters
--
-- These BEFORE triggers apply only to requests from end users (JWT role
-- 'authenticated' or 'anon'). The service role (API routes, admin actions,
-- pipeline) and direct database sessions (migrations, SECURITY DEFINER
-- maintenance run by cron) are unaffected.

CREATE OR REPLACE FUNCTION public.is_end_user_request()
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$ SELECT coalesce(auth.role(), '') IN ('authenticated', 'anon') $$;

-- ── guild_practitioners: only admins verify ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_guild_practitioners()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public.is_end_user_request() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.verified := false;
  ELSE
    NEW.verified := OLD.verified;
    NEW.user_id := OLD.user_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_guild_practitioners ON public.guild_practitioners;
CREATE TRIGGER guard_guild_practitioners BEFORE INSERT OR UPDATE ON public.guild_practitioners
  FOR EACH ROW EXECUTE FUNCTION public.guard_guild_practitioners();

-- ── guild_pitches: only the server publishes ────────────────────────────────
-- Owners may: create drafts; pause a live pitch; resume a paused pitch that
-- was approved before (published_at set) and hasn't expired; close it.
-- Submitting for review, approving and reactivating go through API routes.
CREATE OR REPLACE FUNCTION public.guard_guild_pitches()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public.is_end_user_request() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'draft';
    NEW.published_at := NULL;
    NEW.last_confirmed_active_at := NULL;
    NEW.expires_at := NULL;
    RETURN NEW;
  END IF;
  NEW.user_id := OLD.user_id;
  NEW.published_at := OLD.published_at;
  NEW.last_confirmed_active_at := OLD.last_confirmed_active_at;
  NEW.expires_at := OLD.expires_at;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
         (OLD.status = 'published' AND NEW.status = 'paused')
      OR (OLD.status = 'paused' AND NEW.status = 'published'
          AND OLD.published_at IS NOT NULL
          AND (OLD.expires_at IS NULL OR OLD.expires_at > now()))
      OR (OLD.status IN ('published', 'paused') AND NEW.status IN ('closed_success', 'closed_abandoned'))
    ) THEN
      RAISE EXCEPTION 'Pitch status % → % must go through Emerge (review/approval)', OLD.status, NEW.status
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_guild_pitches ON public.guild_pitches;
CREATE TRIGGER guard_guild_pitches BEFORE INSERT OR UPDATE ON public.guild_pitches
  FOR EACH ROW EXECUTE FUNCTION public.guard_guild_pitches();

-- ── guild_projects: status and payment are server-side ─────────────────────
CREATE OR REPLACE FUNCTION public.guard_guild_projects()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public.is_end_user_request() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'intake';
    NEW.paid := false;
  ELSE
    NEW.status := OLD.status;
    NEW.paid := OLD.paid;
    NEW.client_user_id := OLD.client_user_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_guild_projects ON public.guild_projects;
CREATE TRIGGER guard_guild_projects BEFORE INSERT OR UPDATE ON public.guild_projects
  FOR EACH ROW EXECUTE FUNCTION public.guard_guild_projects();

-- ── profiles: trust and counters are computed, not user-set ─────────────────
CREATE OR REPLACE FUNCTION public.guard_profiles()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public.is_end_user_request() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.trust_level := 'newcomer';
    NEW.quests_attended := 0;
    NEW.quests_posted_with_joiners := 0;
    NEW.endorsements_received := 0;
  ELSE
    NEW.trust_level := OLD.trust_level;
    NEW.quests_attended := OLD.quests_attended;
    NEW.quests_posted_with_joiners := OLD.quests_posted_with_joiners;
    NEW.endorsements_received := OLD.endorsements_received;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_profiles ON public.profiles;
CREATE TRIGGER guard_profiles BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profiles();

-- ── Internal functions don't need to be callable by end users ──────────────
REVOKE EXECUTE ON FUNCTION public.recalculate_trust_level(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_auto_attendance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.country_at(double precision, double precision) FROM PUBLIC, anon;
