# Emerge

**Launch Claude from this directory:** `cd ~/emerge-app && claude`

Running from another project's dir will mix memory — see `~/.claude/projects/` structure.

## 🔔 Open TODOs (remind Pedro every session)

On every session start, before doing other work, glance at this list and remind Pedro of anything still open. Be brief (one sentence per item). Don't nag more than once per session.

- [ ] **Recruit 3-5 real verified Guild practitioners.** Right now only Pedro is verified in `guild_practitioners`, so every scoping doc will recommend only him — matching looks broken from a client's perspective. Priority before sharing the Guild publicly. Pedro is finding people manually. Ask how it's going.
- [ ] **5 ticketing scrapers are disabled** (see below). Research-backed decision — free replacements (Mobilizon, OpenAgenda) deliver 1,500+ aligned events per weekly pipeline run, which is much more than the ticketing scrapers would have. Only re-fix if paid infra ever becomes feasible. See `RESEARCH-ticketing-scrapers.md`.
- [ ] (add more here as they come)

## ⏳ Waiting list — revisit when the app has traction

These are intentionally deferred until Emerge has enough real users that the extra cost/effort is justified. Don't do them now.

- [ ] **Add Mobilizon + OpenAgenda to the daily Vercel `network-pipeline` cron.** Currently they only run once a week via the Sunday launchd job. Daily would cut event freshness lag from ~7 days to ~24h. Cost goes from ~€5/week to ~€10-15/week in Haiku scoring. **Revisit when:** users complain events look stale OR you hit 500+ active users. Low effort (~30min).
- [ ] **Gancio federated scraper.** Small volume (~3-5K events/yr) but extremely aligned with autogestione/anarcho-ecology/squat communities in IT/DE/CH/ES. Same pattern as `mobilizon.ts`. Effort ~3h.
- [ ] **Lu.ma curated calendar scraper.** Climate-tech, regen-finance, bioregionalism salons. Effort ~4h.
- [ ] **Paid scraping service (Bright Data ~€11/mo)** to recover DICE/Humanitix/Billetto events. Only worth it if (a) app has revenue or donations covering it AND (b) those platforms still host regen content worth recovering.
- [ ] **Verify-practitioner admin UI + email on flip.** Currently Pedro flips `verified=true` manually in Supabase with no email sent to the practitioner. **Revisit when:** signups exceed 2-3/week so manual SQL gets old.

## ⚠ Disabled scrapers (2026-04-22)

Five ticketing-platform scrapers were disabled after all returning 0 usable events. Imports and SOURCES entries in `src/pipeline/orchestrator.ts` are commented out; the source files remain in `src/pipeline/sources/` for reference.

| Scraper | Root cause | Fix requires |
|---|---|---|
| `dice` | Cloudflare 403 (TLS-level bot block) | Paid scraping service |
| `ticket-tailor` | Cloudflare 403 | Paid scraping service |
| `outsavvy` | Site search is broken — returns 600 junk items titled "FREE" regardless of query | Wait for them to fix it, or use their API (if any) |
| `humanitix` | Site is a Next.js SPA; event data loads via private API after page render. `/search?q=X` used to work but now redirects to 404. New URLs are `/gb/search/{location}?q=X` but initial HTML has no event data. | Playwright/headless browser, OR find their private API token |
| `billetto` | Same as humanitix — SPA, events loaded client-side | Playwright, OR reverse-engineer their API |

The failing launchd path was fixed the same day (`com.emerge.weekly-pipeline.plist` pointed to `~/emerge-app` but the real path is `~/Documents/Terra_apps/emerge-app`). Next Sunday run should execute correctly.

## What Emerge is
Regenerative community quest app — discover permaculture/regenerative events by location across 23 countries, 220+ cities. AI-curated events from 220+ sources, aligned with the soul doc. Free, no ads, no algorithms.

**Live:** https://emerge.terralta.org
**Supabase project:** `jxkbblstaqstwutmrdaf` (name: "Emerge", region: eu-west-1)
**GitHub:** https://github.com/TerraAlta/emerge-app
**Vercel:** `prj_qDDW0PLWXSem2ux3fT0xIGZFNNJL` (team: terraaltas-projects)

## Stack
- Next.js 14 + TypeScript + React 18
- Tailwind 3 + CSS variables (light default, dark toggle)
- Supabase (auth, PostGIS database, storage)
- Claude Haiku 4.5 for AI scoring (`claude-haiku-4-5-20251001` — **NEVER** Sonnet/Opus in this app)
- Leaflet for maps
- Resend for email digest
- Vercel for hosting (auto-deploy on push to main)

## Node setup
```bash
export PATH="$HOME/local/node-v20.11.1-darwin-x64/bin:$PATH"
```

## Dev commands
```bash
npm run dev          # Port 3000
npm run build        # Verify before deploying
npx vercel --prod --yes  # Manual deploy
```

## Directory structure
```
src/
├── app/
│   ├── api/             # Next.js API routes (NO Supabase edge functions)
│   │   ├── cron/        # Weekly pipeline, digest, stale-check
│   │   ├── guild/       # Guild AI routes (interview, extract)
│   │   ├── submit-event/
│   │   └── connect-luma/
│   ├── guild/           # The Guild pages (/guild, /guild/join)
│   ├── admin/           # Admin dashboard
│   ├── auth/            # Auth callback
│   ├── reset-password/
│   ├── page.tsx         # Main app (Quests, Map, Skills tabs)
│   └── layout.tsx       # Root layout + theme init
├── components/          # React components
├── hooks/               # useAuth, useNearbyQuests
├── lib/
│   ├── supabase.ts      # Client + service role
│   ├── theme.ts         # Light/dark theme management
│   ├── scoring-prompt.ts  # Shared AI scoring prompt
│   ├── guild-costs.ts   # Guild cost controls (Haiku, €2/day cap)
│   ├── flower-petals.ts # 7 permaculture flower domains
│   ├── sanitize.ts      # Input sanitization
│   └── crypto.ts        # AES-256-GCM for Luma keys
├── pipeline/            # Weekly quest scraping pipeline
│   ├── sources/         # 220+ source scrapers
│   ├── score-quest.ts   # AI scoring
│   └── soul-document.txt  # THE SOUL — all decisions trace back here
└── types/
```

## Key principles (the soul)
- Physical presence > online
- Community participation > passive consumption
- Free for users, always (no ads, no paid placement)
- Hard reject: religious content, new-age pseudoscience, corporate wellness
- Multilingual matching
- Human judgment stays in the loop — AI helps, people decide

**Read `src/pipeline/soul-document.txt` before making any AI/scoring changes.**

## Pipeline (weekly quest scraping)
- **launchd job** runs every Sunday 23:00: `com.emerge.weekly-pipeline.plist`
- Script: `scripts/run-full-pipeline-v2.ts` (NEVER the v1 — it's DISABLED)
- Pre-filter: 94% rejected before AI → keeps cost at ~$3-5/week
- Daily Vercel crons: `city-pipeline`, `network-pipeline`, `sync-luma`, `stale-check`, `weekly-digest`

### Cost protection (CRITICAL — read before touching the pipeline)
The pipeline must never blow past ~$5/week. Two guardrails enforce this:

1. **Keyword pre-filter** (`src/pipeline/pre-filter.ts`) — applied to every event from a "bulk" source BEFORE Claude is called. Any source that scrapes a large open catalogue (Eventbrite, AllEvents, Meetup, etc.) MUST set `bulk: true` on its `SourceFetcher` export. The orchestrator runs `isPotentiallyRelevant()` and silently drops events that don't match. Curated sources (small permaculture/transition networks) leave `bulk` unset.
2. **Hard cost cap** (`src/pipeline/cost-cap.ts`) — `costTracker.recordHaiku()` runs on every successful Haiku call, tallies real token spend, and throws `CostCapExceeded` the instant the budget is breached. Default $8/run; override with `PIPELINE_MAX_USD` env var. Pipeline halts cleanly, logs the cost summary, exits 2.

**Past incident (2026-05-24):** `eventbrite-cultural` and `allevents-cultural` were added to the orchestrator without `bulk: true`, sending 33k unfiltered Eventbrite events directly to Haiku. One weekly run cost ~$25 instead of $5 and ran for 49+ hours. The cap + bulk flag now prevent this class of bug.

**When adding a new source:** if it pulls more than ~500 events per run from an open catalogue, set `bulk: true` and verify a pre-filter keyword match exists for your target audience.

3. **Every entry point must apply both guardrails — not just the orchestrator.**
   The May fix was applied to `orchestrator.ts` alone, but the two daily cron
   routes (`/api/cron/city-pipeline`, `/api/cron/network-pipeline`) each keep
   their own copy of the scrape→score→insert loop. Both were calling
   `scoreQuest()` with no pre-filter and no cost cap until 2026-08-22. If you
   add or edit a route that scores events, it MUST:
   - `costTracker.reset(DAILY_CRON_CAP_USD)` at the top (serverless instances
     are reused between invocations; without a reset the cap eventually trips
     forever and the cron dies silently),
   - filter `source.bulk` events through `isPotentiallyRelevant()` before
     scoring,
   - let `CostCapExceeded` propagate out of the per-event `catch`.

   `npx tsx scripts/test-cost-guards.ts` checks all of this and costs nothing
   to run. Run it after touching `cost-cap.ts` or `pre-filter.ts`.

### What Emerge actually costs (audited 2026-08-22)
- **Anthropic ~$10/mo** — weekly pipeline $1.21–$1.33/run (~$5.40/mo, measured
  in the run log); Guild AI $0.24 *lifetime* since April; news pipeline ~$3–5/mo
  (now measured, not estimated — `costUsd` in the cron response).
- **Vercel $0** — the team is on the **Hobby** plan. Confirmed via API.
- **Supabase $25/mo Pro — but shared across 4 live projects** (Emerge 49 MB,
  terra-alta-hub 93 MB, PermaStudio 18 MB / 126 users, Biogrow 14 MB / 63 users).
  Emerge's fair share is ~$6/mo and its *marginal* cost is $0. Downgrading the
  org to Free is **not** a simple win: Free allows only 2 active projects per
  org, and all four are in current use.
- Emerge's true marginal cost is therefore **~$10/mo, essentially all Claude.**

## Features shipped
- **Quests tab**: browse events by location + radius + category, search, time filters
- **Map tab**: full-screen Leaflet map with quest pins
- **Post tab**: user-submit quest form
- **Skills tab**: "I have" / "I want to learn" skill tags (soft-sorts feed)
- **Guild tab** (new, Phase 1): practitioner directory + AI-guided onboarding
- Light/dark theme toggle, PWA install prompt, OG image for social sharing
- Report quest, share quest, join/leave quests
- Weekly email digest via Resend
- 220+ source scrapers + 5 ticketing platforms (Eventbrite, Humanitix, Billetto, Outsavvy, DICE)

## The Guild (Phase 1 + Phase 2 — live)
Regenerative practitioner network. Free listing, no bidding, no commission.
- DB: `guild_practitioners`, `guild_practitioner_interviews`, `guild_projects`, `guild_scoping_docs`, `guild_api_usage`

### Phase 1 (practitioners)
- Routes: `/guild` (directory), `/guild/join` (onboarding)
- AI: `/api/guild/interview` (15K token cap) + `/api/guild/extract` (5K cap)
- **Manual verification**: Pedro flips `verified = true` in Supabase after review
- **Cost**: ~€0.02 per practitioner onboarding, €2/day global cap

### Phase 2 (clients — scoping doc, €40)
- Routes: `/guild/project/new` (intake), `/guild/project/[id]` (status-aware view), `/admin/guild` (review queue)
- AI: `/api/guild/intake` → `/api/guild/extract-brief` → `/api/guild/generate-scoping`
- Payment: Stripe Checkout (€40). Webhook `/api/stripe/webhook` triggers scoping generation
- **Human-in-the-loop**: AI drafts → `status='matched'` (invisible to client via RLS) → Pedro reviews at `/admin/guild` → approve (email + delivered) or reject (auto-refund via Stripe)
- State machine: `intake → scoping → matched → delivered → closed`
- Matching: top 30 verified practitioners ranked by petal overlap + country + language; AI picks 2-6 with reasoning

### Guild env vars (Vercel)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `INTERNAL_TRIGGER_KEY`, `NEXT_PUBLIC_APP_URL=https://emerge.terralta.org`
- Optional: `GUILD_ADMIN_EMAIL` (defaults to terraalta.sintra@gmail.com)

### Stripe webhook
- Endpoint: `https://emerge.terralta.org/api/stripe/webhook`
- Event: `checkout.session.completed` only
- Test with card `4242 4242 4242 4242` in Sandbox mode

### DB grants gotcha
Guild tables were created without CRUD grants for `authenticated`/`service_role` — fixed via migration `guild_tables_grants_fix`. If you add new guild tables, remember to `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated; GRANT ALL ... TO service_role;` or RLS policies won't get a chance to run.

## Next features (planned, not built)
1. **The Guild Phase 3**: messaging between client and practitioners, ratings, multilingual UI
2. **Regenerative News Feed**: scrape international positive news, AI-score with soul doc, new tab

## Collaboration notes for Claude
- Pedro is non-technical — explain in plain language (permaculture analogies help)
- Commit often with descriptive messages
- NEVER touch existing features (quests, map, skills, pipeline) without asking
- If a decision touches the soul doc, STOP and ask
- Smaller and simpler wins — we have time
- Cost controls are non-negotiable: Haiku only, daily caps, usage logging

## Memory location
- `~/.claude/projects/-Users-pedrovaldjiu-Documents-BioGrow/memory/emerge_project.md` — main emerge context
- `emerge_session_apr15.md` — last big debug session

## Debugging disasters to remember
- **April 2026**: v1 pipeline crontab + launchd v2 + Claude scheduled task all firing at once. v1 had no pre-filter → scored 68K events → $98 week. **Fix**: v1 disabled forever, crontab removed, only launchd v2 runs.
- **Always check:** `ps aux | grep pipeline` before running anything expensive.
