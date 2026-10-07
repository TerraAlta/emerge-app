/**
 * A Quinta da Lage — aquinta.org — permaculture / natural-building farm in
 * São Luís, Odemira (Alentejo). Runs PDCs and natural-building courses.
 *
 * Squarespace: /agenda?format=json returns `upcoming[]` with startDate/endDate
 * in epoch ms. Its map pin is a Squarespace default (New York), so we use the
 * farm's real address and coordinates instead. Added 2026-10-07.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'

const SRC = 'quinta-da-lage-pt'
const URL_JSON = 'https://www.aquinta.org/agenda?format=json'
const SITE = 'https://www.aquinta.org'
// São Luís, Odemira (postcode 7630-436)
const LAT = 37.7208
const LNG = -8.7317

export const quintaDaLagePt: SourceFetcher = {
  name: SRC,
  async fetch() {
    try {
      const res = await fetch(URL_JSON, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) return []
      const data = await res.json()
      const now = Date.now()
      const events: RawEvent[] = []
      for (const e of data?.upcoming ?? []) {
        const start = Number(e.startDate)
        if (!e.title || !Number.isFinite(start) || start < now) continue
        const end = Number(e.endDate)
        const url = e.fullUrl ? SITE + e.fullUrl : SITE + '/agenda'
        events.push({
          source: SRC,
          source_id: `${SRC}-${hashStr(url + start)}`,
          source_url: url,
          title: stripHtml(e.title).replace(/\s+/g, ' ').trim(),
          description: stripHtml(e.excerpt ?? '').slice(0, 500),
          organizer: 'A Quinta da Lage',
          location_name: 'A Quinta da Lage, São Luís, Odemira, Portugal',
          lat: LAT,
          lng: LNG,
          starts_at: new Date(start).toISOString(),
          ends_at: Number.isFinite(end) && end > start ? new Date(end).toISOString() : null,
          cost: 'See event page',
          image_url: e.assetUrl ?? null,
        })
      }
      return events
    } catch {
      return []
    }
  },
}
