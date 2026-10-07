/**
 * AgendaLx — agendalx.pt — Lisbon City Council's public event agenda.
 *
 * Public JSON API (/wp-json/agendalx/v1/events). Mostly culture (theatre,
 * music, exhibitions), so bulk: true and the keyword pre-filter does the
 * work; the hits are things like municipal gardening workshops, swap markets
 * and guided park walks. Each item lists all its dates in `occurences`; we
 * keep the next one. Venue names are geocoded by the orchestrator.
 * Added 2026-10-07 (the old "Agenda Cultural Lisboa" scraper was dead; this
 * API is alive).
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'

const SRC = 'agendalx-pt'
const API = 'https://www.agendalx.pt/wp-json/agendalx/v1/events'
const PER_PAGE = 100
const MAX_PAGES = 15

export const agendalxPt: SourceFetcher = {
  name: SRC,
  bulk: true,

  async fetch() {
    const today = new Date().toISOString().slice(0, 10)
    const horizon = new Date(Date.now() + 120 * 86400_000).toISOString().slice(0, 10)
    const events: RawEvent[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      let items: any[]
      try {
        const res = await fetch(`${API}?per_page=${PER_PAGE}&page=${page}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'application/json' },
          signal: AbortSignal.timeout(30_000),
        })
        if (!res.ok) break
        items = await res.json()
      } catch {
        break
      }
      if (!Array.isArray(items) || items.length === 0) break

      for (const e of items) {
        const next = (e.occurences ?? []).filter((d: string) => d >= today && d <= horizon).sort()[0]
        const title = stripHtml(e.title?.rendered ?? '').trim()
        if (!next || !title) continue
        const venue = Object.values<any>(e.venue ?? {})[0]?.name
        const tags = [e.subject, ...Object.values<any>(e.categories_name_list ?? {}).map(c => c.name), ...Object.values<any>(e.tags_name_list ?? {}).map(t => t.name)]
          .filter(Boolean).join(', ')
        events.push({
          source: SRC,
          source_id: `${SRC}-${e.id}-${next}`,
          source_url: e.link ?? null,
          title,
          // Subject/categories/tags help the keyword pre-filter and the scorer.
          description: [e.subtitle, tags, stripHtml((e.description ?? []).join(' '))].filter(Boolean).join(' — ').slice(0, 500),
          organizer: 'Câmara Municipal de Lisboa',
          location_name: venue ? `${stripHtml(venue)}, Lisboa, Portugal` : 'See event page',
          lat: 0,
          lng: 0,
          starts_at: new Date(`${next}T10:00:00+01:00`).toISOString(),
          ends_at: null,
          cost: /gratuit/i.test(tags) ? 'Free' : 'See event page',
          image_url: e.featured_media_large ?? null,
        })
      }
    }
    return events
  },
}
