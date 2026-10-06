/**
 * DEAL — Doughnut Economics Action Lab — doughnuteconomics.org/events
 *
 * Community event board (Rails). Most entries are online, but local groups
 * post in-person meetups, workshops and — every October — dozens of
 * "Global Donut Days" gatherings worldwide.
 *
 * Listing: https://doughnuteconomics.org/events?page=N (24 cards per page,
 * upcoming first in date order, then past events). Each card has:
 *   <li><a href="/events/<slug>"> … header "Upcoming Event" / "Past Event"
 *     <span class="time_utc">2026-10-20T16:00:00Z</span>   (UTC, no tz guessing)
 *     <p class="location"><span>Berlin, Germany</span> | "Online" | "None"
 * We walk pages until past events start, keep cards with a real place, then
 * read each detail page for the summary (og:description), end time (Outlook
 * link enddt=…Z) and the posting group. Places are OSM-style strings, geocoded
 * with Nominatim.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, decodeEntities } from './utils'
import { getText, geocodeWorldFirst, ONLINE_RE } from './global-common'

const SRC = 'deal-global'
const BASE = 'https://doughnuteconomics.org'
const MAX_PAGES = 8
const MAX_DETAILS = 30
const MAX_EVENTS = 200

interface Card { href: string; title: string; start: string; location: string }

export const dealGlobal: SourceFetcher = {
  name: SRC,
  async fetch() {
    const now = Date.now()
    const cards: Card[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const html = await getText(`${BASE}/events${page > 1 ? `?page=${page}` : ''}`)
      if (!html) break
      let n = 0
      let sawPast = false
      const re = /<li><a href="(\/events\/[^"]+)">([\s\S]*?)<\/a><\/li>/g
      let m: RegExpExecArray | null
      while ((m = re.exec(html)) !== null) {
        n++
        const b = m[2]
        if (/Past Event/.test(b.match(/class="header">([\s\S]*?)<\/div>/)?.[1] ?? '')) { sawPast = true; continue }
        const start = b.match(/class="time_utc"[^>]*>([^<]+)</)?.[1]?.trim()
        const title = stripHtml(b.match(/class="title[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? '')
        const location = stripHtml(b.match(/class="location[^"]*">[\s\S]*?<span>([\s\S]*?)<\/span>/)?.[1] ?? '')
        if (!start || !title) continue
        cards.push({ href: m[1], title, start, location })
      }
      if (n === 0 || sawPast) break
    }

    const seen = new Set<string>()
    const candidates = cards.filter((c) => {
      const ms = Date.parse(c.start)
      if (!Number.isFinite(ms) || ms < now + 3600_000) return false
      if (!c.location || /^(online|none|null|tbd|tba|n\/a)$/i.test(c.location)) return false
      if (ONLINE_RE.test(c.title) || ONLINE_RE.test(c.location)) return false
      if (seen.has(c.href)) return false
      seen.add(c.href)
      return true
    }).sort((a, b) => a.start.localeCompare(b.start))

    const events: RawEvent[] = []
    let details = 0
    for (const c of candidates) {
      if (events.length >= MAX_EVENTS) break
      const url = `${BASE}${c.href}`
      let desc = ''
      let organizer = 'Doughnut Economics Action Lab community'
      let endIso: string | null = null
      if (details < MAX_DETAILS) {
        details++
        const html = await getText(url)
        if (html) {
          desc = decodeEntities(html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/)?.[1] ?? '').trim()
          const by = stripHtml(html.match(/Posted by\s*<a[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? '')
          if (by) organizer = `${by} (DEAL community)`
          const end = html.match(/enddt=(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/)?.[1]
          if (end && Date.parse(end) > Date.parse(c.start)) endIso = new Date(end).toISOString()
          // Detail page can reveal an online-only event the card didn't flag
          if (ONLINE_RE.test(desc) && !/\b(in[- ]person|hybrid)\b/i.test(desc) && /\b(zoom|webinar|online event)\b/i.test(desc)) continue
        }
      }

      const parts = c.location.split(',').map((p) => p.trim()).filter(Boolean)
      const queries = [c.location]
      for (let i = 1; i < parts.length - 1; i++) queries.push(parts.slice(i).join(', '))
      if (parts.length >= 2) queries.push(`${parts[parts.length - 2]}, ${parts[parts.length - 1]}`)
      const geo = await geocodeWorldFirst(queries.slice(0, 4))
      if (!geo) continue

      events.push({
        source: SRC,
        source_id: `deal-${c.href.replace('/events/', '').slice(0, 80)}`,
        source_url: url,
        title: c.title,
        description: [
          desc,
          /donut day|doughnut day|gdd/i.test(c.title) ? 'Part of Global Donut Days — local gatherings worldwide exploring Doughnut Economics: meeting the needs of all people within the means of the living planet.' : 'A Doughnut Economics community gathering — exploring how to meet the needs of all people within the means of the living planet.',
        ].filter(Boolean).join(' ').slice(0, 1000),
        organizer,
        location_name: c.location,
        lat: geo.lat,
        lng: geo.lng,
        starts_at: new Date(c.start).toISOString(),
        ends_at: endIso,
        cost: 'See event page',
      })
    }
    return events
  },
}
