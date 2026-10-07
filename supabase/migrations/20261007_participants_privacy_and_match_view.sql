-- Polish pass after the 2026-10-06 audit (applied after a rolled-back test).
--
-- quest_participants was readable by anyone, signed out included (user ids +
-- which event they joined), while the "who's going" view the event page
-- reads had no grants at all — so the list was always empty. Now:
--   - raw sign-ups: each user sees only their own rows;
--   - quest_participants_public (first name + trust level): signed-in users
--     only — this makes "who's going" work for the first time;
--   - guild_pitch_matches_as_matched (unused by the app) exposed every match
--     to any signed-in user via owner rights: closed and made security_invoker.

DROP POLICY IF EXISTS "Users can see participants of any quest" ON public.quest_participants;
CREATE POLICY "Users can see own participation" ON public.quest_participants
  FOR SELECT USING ((select auth.uid()) = user_id);
GRANT SELECT ON public.quest_participants_public TO authenticated;
REVOKE SELECT ON public.quest_participants_public FROM anon;
REVOKE ALL ON public.guild_pitch_matches_as_matched FROM anon, authenticated;
ALTER VIEW public.guild_pitch_matches_as_matched SET (security_invoker = true);
