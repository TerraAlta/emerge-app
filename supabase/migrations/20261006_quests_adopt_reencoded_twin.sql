-- Update instead of duplicate when a title comes back with its accents.
--
-- Until 2026-10-06 the pipeline's stripHtml() deleted HTML entities, so
-- "Caf&eacute; R&eacute;paration" was stored as "Caf R paration". With the fix,
-- the same event arrives as "Café Réparation". quests is unique on
-- (title, starts_at), so the upsert would insert a second row and any sign-ups
-- would stay on the garbled one.
--
-- Before each insert: if no row has this exact title + start, but one row from
-- the same source at the same start has a title that matches once everything
-- except a-z/0-9 is removed, update that row with the incoming values (keeping
-- its id, so sign-ups survive) and skip the insert.
--
-- Why not just rename the twin and let ON CONFLICT DO UPDATE take over:
-- Postgres refuses ("ON CONFLICT DO UPDATE command cannot affect row a second
-- time") because the trigger already modified that row in the same command.

CREATE OR REPLACE FUNCTION public.quests_title_skeleton(t text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$ SELECT lower(regexp_replace(t, '[^a-zA-Z0-9]', '', 'g')) $$;

CREATE OR REPLACE FUNCTION public.quests_adopt_reencoded_twin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  skel text;
  twin uuid;
BEGIN
  IF NEW.title IS NULL OR NEW.starts_at IS NULL THEN
    RETURN NEW;
  END IF;
  skel := public.quests_title_skeleton(NEW.title);
  -- Too little Latin text to compare safely (e.g. titles in other scripts)
  IF length(skel) < 6 THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.quests WHERE title = NEW.title AND starts_at = NEW.starts_at) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO twin
    FROM public.quests
   WHERE starts_at = NEW.starts_at
     AND source_name IS NOT DISTINCT FROM NEW.source_name
     -- Same link too (added after the security audit): a look-alike event
     -- submitted from another URL can never take over a real one.
     AND source_url IS NOT DISTINCT FROM NEW.source_url
     AND title <> NEW.title
     AND public.quests_title_skeleton(title) = skel
   LIMIT 1;

  IF twin IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.quests q SET
    title            = NEW.title,
    description      = COALESCE(NEW.description, q.description),
    category         = COALESCE(NEW.category, q.category),
    geog             = COALESCE(NEW.geog, q.geog),
    address          = COALESCE(NEW.address, q.address),
    ends_at          = COALESCE(NEW.ends_at, q.ends_at),
    source_url       = COALESCE(NEW.source_url, q.source_url),
    ai_score         = COALESCE(NEW.ai_score, q.ai_score),
    ai_reasoning     = COALESCE(NEW.ai_reasoning, q.ai_reasoning),
    image_url        = COALESCE(NEW.image_url, q.image_url),
    max_participants = COALESCE(NEW.max_participants, q.max_participants)
  WHERE q.id = twin;
  RETURN NULL; -- the existing row now holds this event
END;
$$;

DROP TRIGGER IF EXISTS quests_adopt_reencoded_twin ON public.quests;
CREATE TRIGGER quests_adopt_reencoded_twin
  BEFORE INSERT ON public.quests
  FOR EACH ROW EXECUTE FUNCTION public.quests_adopt_reencoded_twin();
