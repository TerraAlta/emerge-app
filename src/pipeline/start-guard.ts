/**
 * Start-date guard — applied to every scraped event BEFORE AI scoring.
 *
 * Many scrapers fall back to `new Date()` when they can't parse a date, so
 * the event is stamped with the moment of scraping. Those rows were saved as
 * "happening now" (2am Monday), vanished from the app by morning, and cost a
 * Haiku call each week: 719 of 4,531 events stored in the 120 days to
 * 2026-10-06, from 20 sources.
 *
 * Emerge only lists upcoming events anyway, so require a real date at least
 * an hour ahead. That rejects the "now" fallback, past events and unparseable
 * dates in one place, whatever the source.
 */
const MIN_LEAD_MS = 60 * 60 * 1000

export function hasUsableStart(ev: { starts_at?: string | null }, now = Date.now()): boolean {
  if (!ev.starts_at) return false
  const t = Date.parse(ev.starts_at)
  return Number.isFinite(t) && t > now + MIN_LEAD_MS
}
