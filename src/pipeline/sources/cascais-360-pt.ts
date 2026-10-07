/**
 * Cascais 360 — 360.cascais.pt — Cascais municipality's agenda, environment
 * and nature sections (community gardens, environmental volunteering,
 * beekeeping, nest boxes, nature walks).
 *
 * Server-rendered Drupal list: each `.result-row` carries data-filter-title,
 * data-filter-local (parish) and data-filter-date (epoch seconds), plus a
 * link. Parishes are geocoded by the orchestrator. Added 2026-10-07.
 * Curated municipal section (~45 events) — not bulk; the scorer decides.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, decodeEntities, hashStr } from './utils'

const SRC = 'cascais-360-pt'
const PAGES = [
  'https://360.cascais.pt/pt/agenda/ambiente',
  'https://360.cascais.pt/pt/agenda/atividades-de-natureza-1',
]

export const cascais360Pt: SourceFetcher = {
  name: SRC,
  async fetch() {
    const now = Date.now()
    const byUrl = new Map<string, RawEvent>()
    for (const page of PAGES) {
      let html: string
      try {
        const res = await fetch(page, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)' }, signal: AbortSignal.timeout(30_000) })
        if (!res.ok) continue
        html = await res.text()
      } catch {
        continue
      }
      const row = /<div class="result-row[^"]*"\s+data-filter-title="([^"]*)"\s+data-filter-local="([^"]*)"\s+data-filter-date="(\d+)">([\s\S]*?)<\/div><\/div>(?=<div class="result-row|<\/div>)/g
      for (const m of html.matchAll(row)) {
        const [, rawTitle, parish, epoch, inner] = m
        const startMs = Number(epoch) * 1000
        if (!Number.isFinite(startMs) || startMs < now) continue
        const href = inner.match(/href="(https:\/\/360\.cascais\.pt\/[^"]+)"/)?.[1]
        if (!href) continue
        const url = href.replace(/\?id=\d+$/, '')
        if (byUrl.has(url)) continue
        const img = inner.match(/<img src="([^"]+)"/)?.[1] ?? null
        const title = decodeEntities(stripHtml(rawTitle)).trim()
        byUrl.set(url, {
          source: SRC,
          source_id: `${SRC}-${hashStr(url + startMs)}`,
          source_url: url,
          title,
          description: `${title} — Cascais 360, agenda de ambiente e natureza.`,
          organizer: 'Câmara Municipal de Cascais',
          location_name: `${decodeEntities(parish) || 'Cascais'}, Cascais, Portugal`,
          lat: 0,
          lng: 0,
          starts_at: new Date(startMs).toISOString(),
          ends_at: null,
          cost: 'See event page',
          image_url: img,
        })
      }
    }
    return [...byUrl.values()]
  },
}
