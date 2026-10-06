/**
 * Regenerative Living Zürich / AdvantiKA — advantika.ch (Wix)
 *
 * AdvantiKA (the organiser of "Regenerative Living Zürich") publishes its
 * gatherings with the Wix Events app: weekly "Inner Leadership Practice"
 * sessions, the monthly "Patagonia Impact Lab" at Impact Hub Viadukt, Climate
 * Fresk workshops and the Regenerative Living Zürich days. There is no
 * /events/ list page; every event has a page under /event-details-registration/
 * listed in /event-pages-sitemap.xml, and each page embeds the Wix event JSON
 * (UTC start/end, Europe/Zurich, venue with coordinates).
 *
 * We read the sitemap, open the pages whose slug date (…-2026-11-12-16-00) is
 * today or later plus undated slugs modified in the last 120 days (≤ 15
 * pages), and keep upcoming, non-cancelled, in-person events.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'
import { getText, extractWixEvents, ONLINE_RE, geocodeCh } from './ch-common'

const SRC = 'regen-zh'
const BASE = 'https://www.advantika.ch'
const SITEMAP = `${BASE}/event-pages-sitemap.xml`
const MAX_PAGES = 15

export const regenZh: SourceFetcher = {
  name: SRC,
  async fetch() {
    const xml = await getText(SITEMAP, 20000, 'application/xml,text/xml,*/*')
    if (!xml) return []
    const now = Date.now()
    const today = new Date(now).toISOString().slice(0, 10)
    const dated: Array<{ url: string; d: string }> = []
    const undated: Array<{ url: string; mod: string }> = []
    for (const m of xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*(?:<lastmod>([^<]+)<\/lastmod>)?/g)) {
      const url = m[1].replace(/\/form$/, '')
      if (!url.startsWith(`${BASE}/event-details-registration/`)) continue
      const sd = url.match(/-(\d{4}-\d{2}-\d{2})-\d{2}-\d{2}(?:-\d+)?$/)?.[1]
      if (sd) { if (sd >= today) dated.push({ url, d: sd }) }
      else if (m[2] && Date.parse(m[2]) > now - 120 * 864e5) undated.push({ url, mod: m[2] })
    }
    dated.sort((a, b) => a.d.localeCompare(b.d))
    const pages = [...new Set([...dated.map((x) => x.url), ...undated.map((x) => x.url)])].slice(0, MAX_PAGES)

    const seen = new Set<string>()
    const out: RawEvent[] = []
    for (const url of pages) {
      const html = await getText(url)
      if (!html) continue
      for (const e of extractWixEvents(html)) {
        if (seen.has(e.id)) continue
        seen.add(e.id)
        const cfg = e.scheduling?.config
        if (!cfg || cfg.scheduleTbd || !cfg.startDate) continue
        if (e.status === 3) continue // cancelled
        const startMs = Date.parse(cfg.startDate)
        if (!Number.isFinite(startMs) || startMs < now + 3600_000) continue
        const loc = e.location ?? {}
        if (loc.type === 1 || loc.type === 'ONLINE' || ONLINE_RE.test(`${loc.name ?? ''} ${e.title}`)) continue
        let lat = Number(loc.coordinates?.lat)
        let lng = Number(loc.coordinates?.lng)
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
          const g = loc.address ? await geocodeCh(loc.address) : null
          if (!g) continue
          lat = g.lat; lng = g.lng
        }
        const endMs = cfg.endDate ? Date.parse(cfg.endDate) : NaN
        const title = stripHtml(e.title)
        out.push({
          source: SRC,
          source_id: `rg-zh-${e.id}`,
          source_url: e.slug ? `${BASE}/event-details-registration/${e.slug}` : url,
          title,
          description: stripHtml(`${e.description ?? ''} ${e.about ?? ''}`).slice(0, 500) || `${title} — AdvantiKA, Zürich.`,
          organizer: 'AdvantiKA (Regenerative Living Zürich)',
          location_name: [loc.name, loc.address].filter(Boolean).join(', ') || 'Zürich',
          lat, lng,
          starts_at: new Date(startMs).toISOString(),
          ends_at: Number.isFinite(endMs) && endMs > startMs ? new Date(endMs).toISOString() : null,
          cost: 'See event page',
          image_url: e.mainImage?.url ?? null,
        })
      }
    }
    return out.slice(0, 200)
  },
}
