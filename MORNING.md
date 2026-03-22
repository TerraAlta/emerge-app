# Emerge — Session Summary (20 March 2026)

## Overview

Massive expansion session: scaled the Emerge pipeline from ~50 cities to **220+ cities across 23 countries**, added new AI scoring categories, built core UI features, set up monitoring, and secured the admin panel.

---

## 1. Pipeline Expansion — 23 Countries

Added city-based Meetup + Eventbrite event scraping with native-language keywords and local organisation scrapers for every country below. Each batch includes cities with coordinates, soul-document-aligned keywords (land, circular, community, arts, wellness, energy), and city-specific local org scrapers.

| Country | Cities | Keywords | Local Orgs |
|---|---|---|---|
| UK (England) | 13 | 35 English | 5 |
| Germany | 11 | German | 4 |
| France | 13 | French | 4 |
| USA | 14 | English + mutual aid | 5 |
| Netherlands | 12 | Dutch | 3 |
| Portugal | 10 | Portuguese | 5 |
| Belgium | 8 | French + Dutch | 3 |
| Spain | 12 | Spanish | 4 |
| Italy | 10 | Italian | 3 |
| Switzerland | 7 | German + French | 3 |
| Canada | 11 | English + French | 4 |
| Finland | 7 | Finnish | 6 |
| Denmark | 6 | Danish | 6 |
| Luxembourg | 4 | French + German | 7 |
| Austria | 7 | German | 8 |
| Malta | 4 | Maltese + English | 3 |
| Ireland | 7 | Irish + English | 9 |
| Wales | 7 | Welsh + English | 7 |
| Scotland | 8 | Scots Gaelic + English | 9 |
| Iceland | 4 | Icelandic + English | 7 |
| Serbia | 5 | Serbian + English | 8 |
| Slovenia | 6 | Slovenian + English | 8 |
| Hungary | 7 | Hungarian + English | 9 |

**Total: ~220 cities, 240 keywords in 10+ languages, 178+ local org scrapers**

### Key pipeline files changed
- `src/pipeline/sources/cities.ts` — all city definitions
- `src/pipeline/sources/keywords.ts` — multilingual keyword list
- `src/pipeline/sources/local-networks.ts` — local org scrapers with multi-strategy extraction
- `src/pipeline/sources/eventbrite-cities.ts` — country slug additions
- `src/pipeline/sources/meetup-cities.ts` — Apollo state scanning fix
- `src/pipeline/sources/utils.ts` — Eventbrite JSON-LD ItemList unwrapping fix
- `src/pipeline/orchestrator.ts` — registered new fetchers

### Critical bug fixes
- **Eventbrite returning 0 events**: `extractJsonLd()` wasn't handling `ItemList > ListItem.item` wrapping. Fixed — went from 0 → 19 events per search.
- **Meetup sparse results**: Apollo state scanning only checked one entry. Fixed to scan all entries for `__typename === 'Event'`.

---

## 2. Cron Jobs

Two daily Vercel cron cycles configured in `vercel.json`:
- `06:00 UTC` — city pipeline (Meetup + Eventbrite for all 220+ cities)
- `18:00 UTC` — network pipeline (local orgs + Meetup + Eventbrite with dedup)

API routes: `src/app/api/cron/city-pipeline/route.ts`, `src/app/api/cron/network-pipeline/route.ts`

---

## 3. Soul Document — Communal Table + Feast Category

Added "Communal Table" as a new scoring dimension in the soul document and AI scorer:
- **Feast** quest category (bg `#FFF8E1`, text `#A0522D`)
- Communal cooking + eating bonus: +15 to +20 points
- Diaspora cultural celebration bonus: +15 points
- Passive activity penalty: -10 points
- Calibration examples: Nowruz feast (85), Disco Soup (88), Community Iftar (72), Supper Club (35 reject)

---

## 4. Religion Hard-Reject Filter

Added to ALL scoring prompts (main scorer + submit-event + connect-luma + sync-luma):
- Events whose PRIMARY purpose is worship, prayer, sermon, religious instruction, proselytising, or pilgrimage → score 0, reason `religious_content`
- Cultural occasions (Eid, Diwali, Nowruz, Christmas) do NOT trigger rejection — only the purpose does
- Test: "if food and gathering were removed, would it still be a religious service?"
- Rejected events logged to `pipeline_errors` table for edge-case review

---

## 5. Diaspora Cultural Event Sources

- Added 15 cultural feast keywords to Eventbrite/Meetup searches (Nowruz, Eid, Iftar, Diwali, Lunar New Year, etc.)
- Added `allevents.in` scraper for cultural events category per city
- Added Eventbrite `cultural-ethnic-identity` category scraping
- Seasonal calendar triggers: boost searches 2 weeks before/after Nowruz, Ramadan, Eid al-Adha, Diwali, Lunar New Year, Caribbean Carnival
- Auto-approve threshold for cultural feast events lowered to 78+

---

## 6. UI Features

### Onboarding Splash (`src/components/OnboardingSplash.tsx`)
- Full-screen overlay on first visit, localStorage key `emerge_onboarding_seen`
- Dark theme card matching app design (`#162814` bg, `#E8F2E0` text)
- Three numbered steps explaining what Emerge does
- CTA: "Show me what's nearby →"

### Time Filter Strip + Proximity Pills
- Replaced "what to do today" with "quests near you"
- Horizontal pill filter: Today / This week / All upcoming (default)
- Time proximity pills on cards: Today, Tomorrow, In N days, Next week, In N weeks
- Section dividers in All upcoming view: Today, This week, This month, Later
- Empty state for Today filter with link to switch to All upcoming

### Source Tags on Quest Cards
- "via [Source]" tag at bottom of each card with amber dot
- `deriveSourceName()` maps domains to readable names
- `source_name` column added to quests table

### Event Submission (`/submit`)
- URL paste → fetch → AI score → auto-approve/review/reject
- Uses Claude Haiku for scoring with full soul document rubric

### Luma Calendar Integration (`/connect-luma`)
- Organisers connect Luma API key once
- All future events auto-synced daily via `/api/cron/sync-luma`
- `connected_calendars` Supabase table

### Eventbrite API Integration
- `EVENTBRITE_API_KEY` env var (user fills in value)
- Searches all soul doc keywords per city via official API
- Dedup by title + date + coordinates

---

## 7. Pipeline Monitoring

### Credit error handling (`src/lib/pipeline-monitor.ts`)
- All Anthropic API calls wrapped with credit/rate-limit error detection
- `isCreditError()` and `isRateLimitError()` helpers
- Graceful degradation — pipeline continues, skips scoring

### Telegram alerts (`@emerge_quests_bot`)
- Bot connected to Pedro's Telegram (chat ID `1508728570`)
- Alerts for: credits exhausted, pipeline stale (48h no new quests), scraper errors
- Rate limited to 1 alert per hour to avoid spam

### Stale pipeline check
- Daily cron at 9am: if newest quest > 48h old → Telegram alert
- Route: `/api/cron/stale-check`

### Pipeline errors table
- `pipeline_errors` in Supabase: id, reason, details (jsonb), created_at
- Logs credit failures, religious content rejections, stale pipeline alerts

---

## 8. Admin & Auth

### Admin page protection
- `/admin` now checks logged-in user email against `NEXT_PUBLIC_ADMIN_EMAIL`
- Only `terraalta.sintra@gmail.com` can access
- Everyone else sees "Admin access restricted"

### Email confirmation disabled
- Toggled off in Supabase Dashboard (free tier email was unreliable)
- Signups now instant — no confirmation email needed

### Service worker cache bump
- `sw.js` CACHE_NAME bumped from `emerge-v2` to `emerge-v3`

---

## Environment Variables Added

| Key | Where | Value |
|---|---|---|
| `TELEGRAM_ADMIN_CHAT_ID` | `.env.local` + Vercel | `1508728570` |
| `NEXT_PUBLIC_ADMIN_EMAIL` | `.env.local` + Vercel | `terraalta.sintra@gmail.com` |
| `EVENTBRITE_API_KEY` | `.env.local` | (user to fill in) |

---

## Still Pending

- **Supabase Site URL**: Update from `localhost:3000` to `emerge.terralta.org` in Supabase Dashboard → Auth → URL Configuration
- **Eventbrite API key**: Fill in `EVENTBRITE_API_KEY` in `.env.local` and Vercel env vars
- **SMTP setup**: For reliable email delivery later (Resend, Mailgun, or Gmail app password)
