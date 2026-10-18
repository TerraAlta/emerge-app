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
