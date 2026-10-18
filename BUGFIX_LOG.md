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
