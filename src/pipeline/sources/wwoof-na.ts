/**
 * WWOOF USA + WWOOF Canada
 * Both require membership. Manual submission + public page scraping.
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { resolve } from 'path'
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'

const USA_DIR = resolve(process.cwd(), 'data/submissions/wwoof-usa')
const CA_DIR = resolve(process.cwd(), 'data/submissions/wwoof-ca')

export const wwoofUsa: SourceFetcher = {
  name: 'wwoof-usa',
  async fetch() {
    const events: RawEvent[] = []
    events.push(...loadSubmissions(USA_DIR, 'wwoof-usa'))

    // Try scraping public page
    try {
      const res = await fetch('https://wwoofusa.org/', {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        const html = await res.text()
        events.push(...scrapeJsonLdFarms(html, 'wwoof-usa'))
      }
    } catch {}

    return events
  },
}

export const wwoofCa: SourceFetcher = {
  name: 'wwoof-ca',
  async fetch() {
    const events: RawEvent[] = []
    events.push(...loadSubmissions(CA_DIR, 'wwoof-ca'))

    try {
      const res = await fetch('https://wwoof.ca/', {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge-App/1.0)', Accept: 'text/html' },
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        const html = await res.text()
        events.push(...scrapeJsonLdFarms(html, 'wwoof-ca'))
      }
    } catch {}

    return events
  },
}

function loadSubmissions(dir: string, source: string): RawEvent[] {
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'))
  const events: RawEvent[] = []

  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(resolve(dir, file), 'utf-8'))
      if (!data.title || !data.lat || !data.lng || !data.starts_at) continue
      events.push({
        source,
        source_id: `${source}-${file.replace('.json', '')}`,
        source_url: data.url ?? null,
        title: data.title,
        description: data.description ?? '',
        organizer: data.organizer ?? data.farm_name ?? 'WWOOF host',
        location_name: data.location ?? 'Farm',
        lat: data.lat, lng: data.lng,
        starts_at: data.starts_at,
        ends_at: data.ends_at ?? null,
        cost: 'Free (food & lodging provided)',
      })
    } catch {}
  }
  return events
}

function scrapeJsonLdFarms(html: string, source: string): RawEvent[] {
  const events: RawEvent[] = []
  const blocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) ?? []
  for (const block of blocks) {
    try {
      const data = JSON.parse(block.replace(/<\/?script[^>]*>/g, ''))
      if (data['@type'] === 'Event' || data['@type'] === 'VolunteerAction') {
        events.push({
          source,
          source_id: `${source}-${hashStr(data.name ?? '')}`,
          source_url: data.url ?? null,
          title: `WWOOF — ${stripHtml(data.name ?? '')}`,
          description: stripHtml(data.description ?? '').slice(0, 500),
          organizer: data.organizer?.name ?? 'WWOOF host',
          location_name: data.location?.name ?? 'Farm',
          lat: parseFloat(data.location?.geo?.latitude ?? '0'),
          lng: parseFloat(data.location?.geo?.longitude ?? '0'),
          starts_at: data.startDate ? new Date(data.startDate).toISOString() : new Date().toISOString(),
          cost: 'Free (food & lodging provided)',
        })
      }
    } catch {}
  }
  return events
}
