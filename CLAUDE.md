# Emerge

**Launch Claude from this directory:** `cd ~/emerge-app && claude`

Running from another project's dir will mix memory — see `~/.claude/projects/` structure.

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
- Pre-filter: 94% rejected before AI → keeps cost at ~$5/week
- Daily Vercel crons: `city-pipeline`, `network-pipeline`, `sync-luma`, `stale-check`, `weekly-digest`

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
