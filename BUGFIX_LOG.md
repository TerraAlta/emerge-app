# Bugfix log — automated sweep (branch `bugfix/auto-sweep`)

## Summary (sweep PAUSED — usage limit reached, not finished)
- **Fixed so far: 4 bugs, all in the Guild** (directory + practitioner profiles). Build, typecheck, lint (0 errors) and all tests green at every commit.
- **Security / privacy concerns:** none new found in this sweep yet (an earlier session's audit of 2026-10-07 already fixed the known ones).
- **Proposed DB migrations:** none.
- **Not yet covered:** rest of `/guild/join` (review step UI, done step), Guild AI matching / scoping flow, Feed, auth/onboarding/settings, other tabs, and the two required clean passes.
- **Lint warnings to check later:** three `useEffect` missing-dependency warnings (admin/guild, admin/submissions, guild/project/[id]).

## Setup notes and decisions
- **Stack is Next.js 14 (App Router), not Vite** as the brief said. Worked with what's there.
- Worked in a separate git worktree (`../emerge-app-bugfix`) so other sessions using the main folder aren't moved onto this branch.
- `npm run lint` had never been configured (it prompted interactively). Added `.eslintrc.json` (`next/core-web-vitals`) with `eslint@8` + matching `eslint-config-next`. Turned off `react/no-unescaped-entities`: every error was an apostrophe/quote in JSX text, which React renders correctly (style, not a bug — and several are in the off-limits Pitch pages). Remaining lint output: 6 warnings, 0 errors.
- Added Vitest + React Testing Library (`npm test`) and Playwright (`npm run test:e2e`, desktop + Pixel 7, dev server on :3100).
- **Signed-in flows are tested with a mocked Supabase client, not in a browser.** Auth is the live Supabase project; creating test accounts would write to production, which the brief forbids. Logged-out flows are tested for real in Playwright.
- "Pitch Your Dream Project" (Phase 2, in development) = everything under `/guild/pitch*` and `/api/guild/pitch/*`. Left alone unless it breaks something else.

## Fixes

### 1. Guild directory — failed load claimed "no practitioners verified yet"
- **Area:** Guild / directory (`/guild`)
- **Bug:** the practitioner query ignored `error`; any failure (offline, flaky network, Supabase hiccup) left the list empty and showed "The Guild is just beginning. No practitioners verified yet." A rejected fetch would also leave "Loading practitioners..." forever.
- **How a user hits it:** opens the Guild on a weak mobile connection → told the network is empty.
- **Fix:** track a load error; show "We couldn't load practitioners just now… Try again" with a retry; the empty-state and no-match messages only show when the load succeeded.
- **Files:** `src/app/guild/page.tsx`
- **Test:** `tests/e2e/guild-directory.spec.ts` (aborts the Supabase request and asserts the error, not the empty state)

### 2. Guild directory — one incomplete profile could crash the whole page
- **Area:** Guild / practitioner profiles (`PractitionerCard`)
- **Bug:** the card called `.map` / `.length` / `.split` directly on `flower_petals`, `languages`, `specialties`, `project_scales`, `climate_zones_worked` and `display_name`. The join flow's first step inserts the row without `specialties`/`climate_zones_worked`/`project_scales`, and owners can edit their own row directly via RLS — any null made the card throw, and React unmounted the entire directory for every visitor. (The join page itself already guards all of these with `|| []`, which is what the card was missing.)
- **How a user hits it:** a practitioner verified with a half-filled or hand-edited profile → everyone opening `/guild` sees a crashed page.
- **Fix:** normalise those fields to `[]` / `''` at the top of the card.
- **Files:** `src/components/PractitionerCard.tsx`
- **Test:** `tests/unit/practitioner-card.test.tsx` (null lists, null name, Portuguese characters)

### 3. Guild profiles — broken photo showed a broken-image icon
- **Area:** Guild / practitioner profiles
- **Bug:** if `profile_photo_url` pointed to a deleted/unreachable file, the avatar rendered the browser's broken-image icon.
- **How a user hits it:** a practitioner replaces or deletes their photo in storage; their card shows a broken icon.
- **Fix:** `onError` on the avatar image falls back to the initials.
- **Files:** `src/components/PractitionerCard.tsx`
- **Test:** `tests/unit/practitioner-card.test.tsx` ("falls back to initials when the photo URL is broken")

### 4. Guild profiles — redoing the interview erased photo, links (or the whole profile)
- **Area:** Guild / practitioner profiles (`/guild/join`)
- **Bug:** returning practitioners land on "review" with their saved profile and can "redo with AI / add a CV". Each redo path *replaced* the profile instead of merging: the AI extraction never returns photo/links (`setProfile(extracted)`), the manual draft listed fields without them, and a failed extraction reset the profile to blank. Saving afterwards wrote `profile_photo_url: null`, `portfolio_urls: []` — and after a failed extraction, an empty tagline/bio.
- **How a user hits it:** a verified practitioner adds their CV to refresh their bio → their photo and website/Instagram links disappear from the directory. If the AI step errors, saving wipes their profile.
- **Fix:** three small helpers in `src/lib/practitioner-profile.ts` (merge extracted, manual draft, failed-extraction fallback) that keep existing fields; the page calls them in place of the inline replacements.
- **Files:** `src/app/guild/join/page.tsx`, `src/lib/practitioner-profile.ts`
- **Test:** `tests/unit/practitioner-profile-merge.test.ts`

### 5. Guild profiles — submitting during a photo upload lost the photo
- **Area:** Guild / practitioner profiles (`/guild/join` review step)
- **Bug:** "Submit for verification" was only disabled while saving, not while a photo was uploading. Submitting mid-upload saved `profile_photo_url: null`, moved to the done screen, and the finished upload was never saved.
- **How a user hits it:** picks a photo on a slow mobile connection and taps Submit right away → profile goes to review with no photo.
- **Fix:** button disabled while `photoUploading`, label "Waiting for photo upload…".
- **Files:** `src/app/guild/join/page.tsx`
- **Test:** `tests/unit/guild-join-photo.test.tsx` (mocked Supabase; upload held open) + reusable `tests/unit/helpers/supabase-mock.ts`

### 6. Guild AI interviews — failures left dead ends, lost answers, or endless spinners
- **Area:** Guild / AI interview chat (`GuildChatScreen`, shared by practitioner onboarding and project intake)
- **Bugs:** (a) if the opening question failed (e.g. the daily AI cap → 503) the only option was "Dismiss", leaving an empty chat with no question; (b) a failed answer was cleared from the input but stayed in the chat as if sent — the user had to retype it, and the next message was sent stuck to the failed one; (c) no request timeout, so a hung request spun "···" forever; network errors showed a raw browser message.
- **How a user hits it:** any flaky connection or AI outage mid-interview.
- **Fix:** "Try again" for a failed opener; a failed answer is removed from the chat and put back in the input; 90 s timeout with friendly timeout/offline messages.
- **Files:** `src/components/GuildChatScreen.tsx`
- **Test:** `tests/unit/guild-chat.test.tsx` (AI fully mocked; no real calls)

### 7. Guild AI matching — failed generations didn't count toward the daily cap
- **Area:** Guild / AI matching (`/api/guild/generate-scoping`)
- **Bug:** `logApiUsage` ran only after a successful parse + insert. A reply that failed to parse (up to 8,000 output tokens) was never recorded in `guild_api_usage`, so repeated failures bypassed the €2/day Guild AI cap.
- **How a user hits it:** indirectly — a malformed AI reply, then an admin re-run, then another: real spend climbs while the cap sees nothing.
- **Fix:** log usage immediately after the AI call, before parsing (and remove the later duplicate).
- **Files:** `src/app/api/guild/generate-scoping/route.ts`
- **Test:** `tests/unit/generate-scoping.test.ts` (AI, Supabase, admin auth and email mocked)

### 8. Guild AI matching — a trailing sentence after the JSON failed the whole scoping doc
- **Area:** Guild / AI matching
- **Bug:** the reply was parsed whole; Haiku occasionally appends a sentence after the JSON ("Hope this helps!"), which failed the parse and left the project stuck in "Being drafted".
- **How a user hits it:** submits a land project → the client page shows "Being drafted" indefinitely.
- **Fix:** parse from the first `{` to the last `}` (same fix already applied to event scoring).
- **Files:** `src/app/api/guild/generate-scoping/route.ts`
- **Test:** `tests/unit/generate-scoping.test.ts`

### 9. Guild profile + brief extraction — same uncounted-spend and trailing-text bugs
- **Area:** Guild / practitioner profiles (`/api/guild/extract`) and project intake (`/api/guild/extract-brief`)
- **Bug:** both logged AI usage only after a successful parse (failed parses bypassed the daily caps), and both failed on a trailing sentence after the JSON — the practitioner then saw "Profile extraction failed" and had to type the whole profile by hand.
- **How a user hits it:** finishes the 15-minute interview → "extraction failed".
- **Fix:** log usage before parsing; parse first `{` to last `}`.
- **Files:** `src/app/api/guild/extract/route.ts`, `src/app/api/guild/extract-brief/route.ts`
- **Test:** `tests/unit/extract-routes.test.ts` (fails 4/4 on the old code, passes 4/4 now)

### 10. Guild scoping docs — an oddly shaped AI field crashed the client page and the admin queue
- **Area:** Guild / AI matching results (`/guild/project/[id]`, `/admin/guild`)
- **Bug:** the pages called `.map` on AI-written fields (`design_principles`, `suggested_phases` and their `objectives`/`key_activities`/`practitioner_roles`, `risks_and_open_questions`, `practitioner_recommendations`, brief `values`) after only checking `.length`. When the AI returned a single sentence instead of a list (a string also has `.length`), React threw and the page went blank.
- **How a user hits it:** a client opens their delivered scoping doc → blank page. On the admin side, one such doc blanks the whole review queue, blocking every approval.
- **Fix:** shared `asList()` (`src/lib/as-list.ts`): arrays pass through, a sentence becomes a one-item list, anything else is empty. Used at every render site on both pages.
- **Files:** `src/lib/as-list.ts`, `src/app/guild/project/[id]/page.tsx`, `src/app/admin/guild/page.tsx`
- **Test:** `tests/unit/guild-project-page.test.tsx` (reproduced `brief.values.map is not a function`), `tests/unit/as-list.test.ts`

### 11. Guild project intake — same crash on the brief preview
- **Area:** Guild / project intake (`/guild/project/new` brief preview)
- **Bug:** `brief.values` and `brief.help_sought` (written by the AI in extract-brief) were `.map`-ed after a `.length` check — same failure as #10 if the AI returns a sentence.
- **How a user hits it:** finishes the intake interview → blank page instead of their brief.
- **Fix:** `asList()` at both render sites.
- **Files:** `src/app/guild/project/new/page.tsx`
- **Test:** covered by `tests/unit/as-list.test.ts`; failure mode reproduced in `tests/unit/guild-project-page.test.tsx` (#10).

### 12. Feed — events already under way were filed under "Later" and hidden by Today/This week
- **Area:** Feed (event list grouping and time filters, `src/lib/dateUtils.ts`)
- **Bug:** the feed lists short events that started earlier but haven't ended (`quest_is_listable`, migration 20261007). Their day count is negative, so `groupEvents` put them in "Later" at the bottom, and the Today / This week filters (which required `>= 0`) dropped them entirely.
- **How a user hits it:** a weekend workshop that began yesterday shows under "Later"; tapping "Today" hides it although it's on right now.
- **Fix:** negative day counts count as Today in grouping and both filters.
- **Files:** `src/lib/dateUtils.ts`
- **Test:** `tests/unit/date-utils.test.ts` (fake clock)

### 13. Feed — a failed load said "No events near you yet"
- **Area:** Feed (home event list)
- **Bug:** `useNearbyEvents` set `error` on a failed RPC, but the page never rendered it, so a network/Supabase failure showed "0 events nearby · No events near you yet."
- **How a user hits it:** opens Emerge on a bad connection → told their area is empty.
- **Fix:** render an error with "Try again" (the hook's existing `refetch`) before the empty states.
- **Files:** `src/app/page.tsx`
- **Test:** `tests/e2e/feed.spec.ts` (aborts `nearby_quests`; reproduced the wrong message first)

### 14. Settings — a failed name change failed silently
- **Area:** Account settings (`DigestSettings`)
- **Bug:** `saveName` ignored Supabase's returned `error`: on failure the button just reverted to "Save" with no message, so users believed the change had saved (the digest toggles already handled this).
- **How a user hits it:** edits their name on a flaky connection → nothing happens, no explanation.
- **Fix:** show the same "Couldn't save that — please try again." message on error/exception.
- **Files:** `src/components/DigestSettings.tsx`
- **Test:** `tests/unit/settings.test.tsx`

### 15. Skills tab — visitors' picks never saved (and every tap hit a 400)
- **Area:** Other tabs / Skills (`SkillsScreen`)
- **Bug:** visitors get `userId=""`, so the screen loaded `profiles?id=eq.` and wrote `update … where id=eq.` on every tap — both 400s. Selections looked saved and vanished on reload. For signed-in users a failed save was ignored the same way.
- **How a user hits it:** a visitor marks skills, comes back later → all gone, no explanation.
- **Fix:** no DB calls without a user, plus a "Sign in to save your skills" line; for signed-in users a failed save is reverted with "Couldn't save that".
- **Files:** `src/components/SkillsScreen.tsx`
- **Test:** `tests/unit/skills.test.tsx`; found by `tests/e2e/tabs.spec.ts` (400s on the Skills tab)

### 16. Post an event — past dates saved "successfully" and never appeared
- **Area:** Other tabs / Post an event (`PostEvent`)
- **Bug:** no check that the start is in the future (and no `min` on the date input). The event saved and the user got the success screen, but the feed only lists upcoming events, so it never showed anywhere.
- **How a user hits it:** picks the wrong year/month, or posts about something that already happened → "posted", then invisible.
- **Fix:** reject a start time ≤ now with "Choose a date and time in the future."; date picker `min` = today.
- **Files:** `src/components/PostEvent.tsx`
- **Test:** `tests/unit/post-event.test.tsx` (old code inserted `2020-03-01T10:00`; maps stubbed)

### 17. Event detail — Join / Leave failed silently
- **Area:** Feed / event detail (`EventDetail`)
- **Bug:** `handleJoin` / `handleLeave` ignored the returned `error`: on failure the button just reverted with no message, so users tapped repeatedly or believed they'd joined. A duplicate-key error (already joined from another tab) was also treated as failure.
- **How a user hits it:** taps "Join event" on a flaky connection → nothing happens.
- **Fix:** show "Couldn't join/leave — please try again." above the button; treat `23505` (already joined) as joined.
- **Files:** `src/components/EventDetail.tsx`
- **Test:** `tests/unit/event-detail.test.tsx`

### 18. Guild project intake — a brief that failed to save made submission impossible
- **Area:** Guild / project intake (`/guild/project/new`)
- **Bug:** the brief (AI-extracted or typed in the manual form) is written to `guild_projects.extracted_brief` without checking the error. If that write failed, the preview still showed the brief, but every "Submit for scoping" returned "Intake not complete yet" from the server, and nothing the client could do would fix it.
- **How a user hits it:** a dropped connection right as the brief is saved → stuck on the preview with an error that makes no sense.
- **Fix:** submit first re-saves the brief that's on screen (checking the error), then calls submit-for-scoping; a failed save shows "We couldn't save your brief — check your connection and try again."
- **Files:** `src/app/guild/project/new/page.tsx`
- **Test:** `tests/unit/project-intake.test.tsx` (first save fails; server stub rejects unsaved briefs — failed on the old code)

### 19. News — a failed un-save still removed the article from "Saved"
- **Area:** Feed / News (`NewsScreen`)
- **Bug:** in the Saved view, un-saving optimistically flipped the icon and reverted it on error, but the "drop from the Saved list" step ran regardless, so the article vanished while still saved (it reappears later, confusingly).
- **How a user hits it:** taps "Saved" to un-save on a weak connection → article disappears, then comes back next visit.
- **Fix:** only drop it when the delete succeeded.
- **Files:** `src/components/NewsScreen.tsx`
- **Test:** `tests/unit/news-saved.test.tsx`

### 20. Guild and Feed — "0 practitioners" / "0 events nearby" shown while still loading
- **Area:** Guild directory headline; Feed "Events nearby" counter
- **Bug:** both counts rendered the current array length, which is 0 until data arrives, so on a slow connection visitors first read "0 practitioners" or "0 Events nearby".
- **How a user hits it:** opens either page on mobile data → sees zero, may leave before the real number appears.
- **Fix:** headline reads "Practitioners" and the counter shows "—" until loaded (or on error).
- **Files:** `src/app/guild/page.tsx`, `src/app/page.tsx`
- **Test:** `tests/e2e/slow-network.spec.ts` (every Supabase response delayed 4 s; asserts the delay really applied)

### 21. Event detail — visitors were told "0 going" and shown wrong spot counts
- **Area:** Feed / event detail (`EventDetail`)
- **Bug:** visitors aren't allowed to read `quest_participants_public` (deliberate privacy rule, migration `20261007_participants_privacy_and_match_view`), so the request 401'd on every event open and was treated as "nobody". Visitors saw "0 going", "Be the first to join this event", and "N spots left" computed as if no one had joined — an event that was actually full looked open.
- **How a user hits it:** a visitor opens a popular capped workshop → sees free spots, signs up, finds it full.
- **Fix:** no participant request for visitors; the counts and "who's going" card are replaced by "Sign in to see who's going (and how many spots are left)", which opens sign-in. Signed-in users unchanged.
- **Files:** `src/components/EventDetail.tsx`
- **Test:** `tests/unit/event-detail.test.tsx` (visitor case); found by `tests/e2e/long-content.spec.ts` (401s on event open)

### 22. Feed — the phone's Back button left the feed instead of closing an event
- **Area:** Feed / event detail navigation (`src/app/page.tsx`)
- **Bug:** an opened event is an overlay with no browser-history entry, so Back (Android button, iOS swipe) navigated away from the feed to the previous page — on a phone it feels like the app closed.
- **How a user hits it:** opens an event from the list, presses Back → lands on whatever page they came from.
- **Fix:** opening an event pushes a history entry; `popstate` closes it; the in-app back arrow goes `history.back()` so there's never a leftover entry.
- **Files:** `src/app/page.tsx`
- **Test:** `tests/e2e/back-button.spec.ts` (fails on the old code: ended on `/privacy`; also checks the in-app arrow leaves no stale entry). While writing it I found my earlier "open an event" e2e check was too weak (a "via …" label already on the list satisfied it); both tests now wait for the event's Join button.

### 23. Post form, Luma and learning section — Back left the page (and threw away a half-written event)
- **Area:** Feed overlays + Learning section (`/quests`)
- **Bug:** same root cause as #22 in three more places. The "Post an event" form and "Connect Luma" screen are overlays; the petal quest list, quest player and journal are steps inside `/quests`. None had a history entry, so Back left the page entirely.
- **How a user hits it:** types half an event, presses Back → form and everything typed are gone. Or opens Foundations → Begin quests, presses Back → leaves the learning section instead of returning to the flower.
- **Fix:** moved #22's history logic into one small hook, `useBackToClose`, and used it for the event, post form, Luma screen, petal list, quest player and journal. Nested steps each own one entry, so one Back closes only the top step.
- **Files:** `src/hooks/useBackToClose.ts` (new), `src/app/page.tsx`, `src/app/quests/page.tsx`
- **Test:** `tests/e2e/back-button.spec.ts` gets a learning-section test (fails on the old code: ended on `/privacy`). `tests/unit/back-to-close.test.tsx` covers the hook itself, because the post form needs a signed-in account the e2e suite doesn't have.

### 24. Sign-up / sign-in screen — new members never saw "check your email"; expired links said nothing; no way out
- **Area:** Auth (`src/app/page.tsx`, `src/components/AuthScreen.tsx`)
- **Bug:** three problems on the same screen.
  1. After "Create account" the page closed the sign-in screen at once, even when the account still needed email confirmation. The "Check your email to confirm your account." message was set, but the screen had already gone.
  2. An expired or already-used confirmation link (email scanners often "click" links first) lands on `/#error=…otp_expired…`, and nothing read it.
  3. The sign-in screen has no close button, and phone Back left the site.
- **How a user hits it:**
  1. A new member signs up and is dropped back on the feed, not signed in and with no hint to check their inbox.
  2. Or they click an old confirmation email and see the normal home page as if nothing happened.
  3. Or a visitor taps "Join", decides to keep browsing, presses Back and lands outside Emerge.
- **Fix:**
  1. The screen now closes after sign-up only when a session came back.
  2. An expired-link `#error` opens the log-in screen with a plain-language note and cleans the address bar. This needed a small `initialError` prop on AuthScreen.
  3. `useBackToClose` (from #23) now covers the sign-in screen too.
- **Files:** `src/app/page.tsx`, `src/components/AuthScreen.tsx`
- **Test:** `tests/e2e/auth-screen.spec.ts`, 3 tests, all failing on the old code. The sign-up test mocks Supabase's `/auth/v1/signup` answer, so no account is created and no email is sent.

### 25. Skills — one tap could wipe every saved skill
- **Area:** Skills tab (`src/components/SkillsScreen.tsx`)
- **Bug:** the saved skills load in the background, and a failed load was ignored. Each save writes the *whole* list. So if the load failed, or simply hadn't finished, the screen showed no skills, and choosing one saved a list of just that skill over everything stored.
- **How a user hits it:** on weak mobile signal, opens Skills, taps "Teach → I have this". Their ten saved skills are replaced by one.
- **Fix:** signed-in edits wait for a successful load. While loading, a tap says "One moment — your saved skills are still loading." A failed load says "We couldn't load your saved skills. Try again" and saves nothing. Visitors are unchanged.
- **Files:** `src/components/SkillsScreen.tsx`
- **Test:** `tests/unit/skills.test.tsx`, two new signed-in tests. "Never overwrites when the load failed" fails on the old code. The other checks that a save adds to the loaded list.

### 26. Learning section — a quest with no cards yet would crash the page (latent)
- **Area:** Learning section (`src/lib/quest-data.ts`)
- **Bug:** quests and their cards come from the database (the curriculum is meant to grow there). `QuestPlayer` reads `quest.cards[0].type`, so a quest row saved before its cards crashes the page when opened. Such a quest could also never be completed, so its petal could never bloom. Checked production read-only: today all 27 quests have 3 or more cards, so nobody is hitting it yet.
- **How a user hits it:** Pedro adds a new quest in Supabase and writes its cards later. Anyone tapping it in between gets a crashed screen.
- **Fix:** `fetchAllQuests` leaves out quests that have no cards. They appear by themselves once their cards exist.
- **Files:** `src/lib/quest-data.ts`
- **Test:** `tests/unit/quest-data.test.ts` (fails on the old code).

### 27. Post an event — Back on the pin map threw away the whole form
- **Area:** Post an event (`src/components/PostEvent.tsx`)
- **Bug:** the full-screen "place the pin" map sits on top of the form with no history entry of its own. After #23 gave the form one, Back on the map closed the *form* and lost everything typed. Before #23 it left the page, same loss.
- **How a user hits it:** fills in an event, taps the map to place the pin, presses the phone's Back to leave the map. The form is gone.
- **Fix:** the map gets its own nested `useBackToClose` entry, so Back closes only the map. The map's cancel button uses the same path.
- **Files:** `src/components/PostEvent.tsx`
- **Test:** `tests/unit/post-event.test.tsx`, "phone Back on the pin map closes only the map and keeps what was typed" (fails on the old code).
