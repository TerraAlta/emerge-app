-- Close the remaining write gaps on public.quests (2026-10-07 debug pass).
--
-- Before this migration:
--   - "Authenticated users can post quests" allowed INSERT with created_by
--     NULL for ANY role, including anon. Anon inserts only failed by accident:
--     the quests_country_code trigger calls country_at(), which anon lost
--     EXECUTE on in 20261006_guard_protected_columns. Grant that back and
--     anyone on the internet could post events with no account.
--   - A signed-in user posting from the browser could set ai_score = 100 and
--     any source_name, making a self-post look like a curated, AI-approved
--     event; the owner UPDATE policy had no WITH CHECK, so created_by could
--     be handed to someone else.
--
-- The app's only browser write is PostEvent.tsx (signed-in only), which
-- already sends created_by = the user, source_name 'user', ai_score 0.
-- Pipeline, submit-event and connect-luma write with the service role and
-- are unaffected (same is_end_user_request() pattern as the 10-06 guards).

-- 1. No anonymous / author-less posts.
DROP POLICY IF EXISTS "Authenticated users can post quests" ON public.quests;
REVOKE INSERT, UPDATE, DELETE ON public.quests FROM anon;

-- 2. End-user posts are always marked as user posts, never as AI-curated.
CREATE OR REPLACE FUNCTION public.guard_quests_user_posts()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public.is_end_user_request() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by   := auth.uid();
    NEW.source_name  := 'user';
    NEW.ai_score     := 0;
    NEW.ai_reasoning := '';
  ELSE
    NEW.created_by   := OLD.created_by;
    NEW.source_name  := OLD.source_name;
    NEW.ai_score     := OLD.ai_score;
    NEW.ai_reasoning := OLD.ai_reasoning;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_quests_user_posts ON public.quests;
CREATE TRIGGER guard_quests_user_posts BEFORE INSERT OR UPDATE ON public.quests
  FOR EACH ROW EXECUTE FUNCTION public.guard_quests_user_posts();
