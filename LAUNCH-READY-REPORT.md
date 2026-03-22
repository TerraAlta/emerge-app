# Emerge — Launch Readiness Report
**Date:** 2026-03-22
**Auditor:** Claude Opus 4.6 production audit

---

## FIXED

1. **Supabase security: 7 functions had mutable search_path** — all set to `SET search_path = ''`
2. **quest_participants_public view was SECURITY DEFINER** — recreated without it
3. **RLS policies too permissive** — `Pipeline can insert/update quests`, `Service can insert attendance`, `connected_calendars`, `pipeline_errors` all restricted to `service_role` only
4. **Users can insert own quests** — new RLS policy: `auth.uid() = created_by`
5. **All 228 quests had country_code = NULL** — backfilled from coordinates (GB: 95, FR: 58, DE: 46, NL: 17, PT: 7, US: 5)
6. **National mode now works** — 228 quests visible with correct country codes

---

## VERIFIED — No Issues Found

- **Date consistency**: All date labels use shared `lib/dateUtils.ts` with local midnight comparison
- **Midnight times**: Events at 00:00 show "time TBC" not "12:00 AM"
- **Proximity pills**: Match date labels (both use `daysUntil()`)
- **Location search**: Shows city + region + country, deduplicates within 10km, caps at 4, sorts by user country
- **Regen score**: Completely removed — no references in UI or database
- **Points language**: Completely removed — trust journey uses milestones only
- **Category constraint**: Includes all 9 types (nature, food, craft, community, wellness, learning, feast, play, make)
- **Onboarding splash**: Correct copy ("walking distance, cycling distance, or as wide as your region"), dark theme, localStorage key
- **Quest form**: "e.g." placeholder, multi-select dropdown (8 types), full-screen crosshair map, dark tiles
- **Map**: Dark CartoDB tiles everywhere, category-coloured dots, interactive popups with action buttons
- **Skills**: Have/want two-state, soft-sort quest feed
- **Font sizes**: All bumped from 9-11px to 11-13px for mobile readability
- **No console.log in production UI code**
- **.env.local is gitignored** — not committed to repo
- **Service role key only used server-side** (API routes, not client components)

---

## FLOWS VERIFIED

### Flow 1 — New User Sign Up: PASS
- Email confirmation disabled (Supabase free tier)
- `handle_new_user()` trigger creates profile row
- Trust level defaults to 'newcomer'
- Onboarding splash fires on first visit

### Flow 2 — Find Quests: PASS
- 228 quests in database, 155 upcoming
- PostGIS `nearby_quests()` and `national_quests()` both working
- Category pills, dates, distances, source names all render correctly
- Filter strip (Today/This week/All upcoming) works
- Radius selector (2/10/25/50/National) works
- Map renders with correct dot positions and dark tiles

### Flow 3 — Join a Quest: PASS
- QuestDetail loads with join button
- `quest_participants` insert works via RLS
- Joiner count updates
- Auto-attendance function ready (triggers 24h after quest date)

### Flow 4 — Post a Quest: PASS
- Unified "Add a quest" page with form + URL paste modes
- Full-screen crosshair map for pin drop
- Multi-select type dropdown (8 categories)
- Inserts to quests table with `created_by = auth.uid()`
- RLS policy allows authenticated users to insert own quests

### Flow 5 — Location Search: PASS
- Nominatim search with full labels (city, region, country)
- Deduplication by coordinate proximity (10km)
- Country-first sorting
- Max 4 results
- Saves lat/lng + country_code to profile

---

## SECURITY

| Check | Status |
|---|---|
| All tables have RLS enabled | PASS (except spatial_ref_sys — PostGIS system table, acceptable) |
| API keys not in client code | PASS |
| .env.local not committed | PASS |
| Service role key server-side only | PASS |
| Quest location blurred before joining | PASS (500m circle in DetailMap, exact pin only after join) |
| User emails not exposed | PASS |
| Cron routes protected by CRON_SECRET | PASS |
| Pipeline insert/update restricted to service_role | PASS (fixed this audit) |
| Function search_path set | PASS (fixed this audit) |
| Leaked password protection | FLAGGED — must enable in Supabase Dashboard |

---

## FLAGGED — Needs Human Decision

1. **Leaked password protection disabled** — Enable in Supabase Dashboard: Auth > Security > Enable "Check passwords against HaveIBeenPwned"
2. **Luma API keys stored plaintext** in `connected_calendars.api_key_encrypted` — currently no encryption. Low risk (no Luma users yet) but should encrypt before promoting the feature
3. **PostGIS extension in public schema** — Supabase recommends moving to a separate schema. Low risk, no action needed now
4. **spatial_ref_sys table has no RLS** — PostGIS system table, not user data, acceptable
5. **Submit-event route has no auth** — by design (public submission), AI scorer gatekeeps quality. Monitor for abuse
6. **Email provider (Resend)** — domain not verified (Wix DNS limitation). Emails send from `onboarding@resend.dev`. Works but looks less professional
7. **Supabase Site URL** — still set to localhost:3000 in Dashboard. Update to `emerge.terralta.org` for password reset emails to work

---

## HEALTH

### Verdict: READY TO LAUNCH

228 quests across 6 countries. 155 upcoming events. 5 cron jobs running daily. AI scorer with religion + new age filters. 8 screen components all rendering correctly. No critical security issues remaining.

---

## FIRST USER INSTRUCTIONS

**For the first real user to test the full flow:**

1. Go to **emerge.terralta.org** on your phone
2. Tap **Sign up** — enter email and password
3. Allow location access when prompted (or search for your city)
4. You'll see quests near you sorted by date
5. Tap any quest card to see details
6. Tap **Join** to sign up for a quest
7. After the quest date passes, your "Quests attended" count will update automatically
8. Tap the **+** button to add your own quest — fill in the form or paste an event URL
9. Explore the **Skills** tab — mark what you can offer and what you want to learn
10. Check the **Trust** tab to see your community journey

**For the admin:**
- Admin dashboard at `emerge.terralta.org/admin` (logged in as terraalta.sintra@gmail.com)
- Pipeline alerts come to Telegram via @emerge_quests_bot
- Weekly email digests send every Monday at 9am UTC (once Resend domain is verified)
