# Bugfix log — automated sweep (branch `bugfix/auto-sweep`)

_Summary is written at the top when the sweep finishes._

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
