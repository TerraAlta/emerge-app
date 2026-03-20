/**
 * WWOOF source fetcher
 *
 * WWOOF requires paid membership to see farm listings. No public API.
 * This fetcher provides two real approaches:
 *
 * 1. Scrape public WWOOF country pages that list "urgent" or "open" hosts
 *    (some WWOOF orgs show a few public listings as teasers)
 * 2. Manual submission via JSON files — WWOOF hosts or community members
 *    drop event files into data/submissions/wwoof/ and they get ingested
 *
 * The manual submission approach is the honest one. WWOOF hosts who want
 * to appear on Emerge can submit their volunteer days directly.
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { resolve } from 'path'
import type { RawEvent, SourceFetcher } from './types'

const SUBMISSIONS_DIR = resolve(process.cwd(), 'data/submissions/wwoof')

// Public WWOOF pages that sometimes show host teasers
const WWOOF_PUBLIC_PAGES = [
  'https://wwoof.pt/',
  'https://wwoof.es/',
  'https://www.wwoof.fr/',
]

export const wwoof: SourceFetcher = {
  name: 'wwoof',

  async fetch() {
    const events: RawEvent[] = []

    // 1. Load manual submissions
    const manual = loadManualSubmissions()
    events.push(...manual)

    // 2. Try scraping public WWOOF pages for any visible host data
    for (const url of WWOOF_PUBLIC_PAGES) {
      try {
        const scraped = await scrapePublicPage(url)
        events.push(...scraped)
      } catch (err) {
        console.warn(`[wwoof] Failed to scrape ${url}:`, (err as Error).message)
      }
    }

    return events
  },
}

/**
 * Load events from JSON files in data/submissions/wwoof/
 * Each file should match the ManualSubmission interface.
 */
function loadManualSubmissions(): RawEvent[] {
  if (!existsSync(SUBMISSIONS_DIR)) return []

  const files = readdirSync(SUBMISSIONS_DIR).filter(f => f.endsWith('.json'))
  const events: RawEvent[] = []

  for (const file of files) {
    try {
      const raw = readFileSync(resolve(SUBMISSIONS_DIR, file), 'utf-8')
      const data = JSON.parse(raw)

      // Validate required fields
      if (!data.title || !data.lat || !data.lng || !data.starts_at) {
        console.warn(`[wwoof] Skipping ${file}: missing required fields`)
        continue
      }

      events.push({
        source: 'wwoof',
        source_id: `wwoof-manual-${file.replace('.json', '')}`,
        source_url: data.url ?? null,
        title: data.title,
        description: data.description ?? '',
        organizer: data.organizer ?? data.farm_name ?? 'WWOOF host',
        location_name: data.location ?? 'WWOOF farm',
        lat: data.lat,
        lng: data.lng,
        starts_at: data.starts_at,
        ends_at: data.ends_at ?? null,
        cost: 'Free (food & lodging provided)',
        image_url: data.image_url ?? null,
      })
    } catch (err) {
      console.warn(`[wwoof] Failed to parse ${file}:`, (err as Error).message)
    }
  }

  return events
}

/**
 * Scrape a public WWOOF country page for any visible host listings.
 * Many WWOOF sites show a handful of "featured hosts" or "urgent needs"
 * without requiring login.
 */
async function scrapePublicPage(url: string): Promise<RawEvent[]> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html',
    },
  })

  if (!res.ok) return []

  const html = await res.text()
  const events: RawEvent[] = []

  // Look for structured data (JSON-LD, microdata)
  const jsonLdBlocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) ?? []

  for (const block of jsonLdBlocks) {
    try {
      const json = block.replace(/<\/?script[^>]*>/g, '').trim()
      const data = JSON.parse(json)

      if (data['@type'] === 'Event' || data['@type'] === 'VolunteerAction') {
        events.push({
          source: 'wwoof',
          source_id: `wwoof-public-${hashStr(data.name ?? '')}`,
          source_url: data.url ?? url,
          title: `WWOOF — ${data.name}`,
          description: stripHtml(data.description ?? '').slice(0, 500),
          organizer: data.organizer?.name ?? 'WWOOF host',
          location_name: data.location?.name ?? data.location?.address ?? 'WWOOF farm',
          lat: parseFloat(data.location?.geo?.latitude ?? '0'),
          lng: parseFloat(data.location?.geo?.longitude ?? '0'),
          starts_at: data.startDate ? new Date(data.startDate).toISOString() : getNextMonday(),
          ends_at: data.endDate ? new Date(data.endDate).toISOString() : null,
          cost: 'Free (food & lodging provided)',
        })
      }
    } catch {
      // Skip
    }
  }

  // Look for host cards in HTML (common across WWOOF sites)
  // Pattern: <div class="host-card"> or <article class="farm-listing">
  const hostPattern = /<(?:div|article)[^>]*class="[^"]*(?:host|farm|listing)[^"]*"[\s\S]*?<\/(?:div|article)>/gi
  const hostBlocks = html.match(hostPattern) ?? []

  for (const block of hostBlocks.slice(0, 5)) {
    // Extract title
    const titleMatch = block.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i)
    const title = titleMatch ? stripHtml(titleMatch[1]).trim() : null
    if (!title) continue

    // Extract link
    const linkMatch = block.match(/href="([^"]*)"/)
    const link = linkMatch?.[1] ?? null

    events.push({
      source: 'wwoof',
      source_id: `wwoof-public-${hashStr(title)}`,
      source_url: link ? new URL(link, url).toString() : url,
      title: `WWOOF — ${title}`,
      description: 'Organic farm seeking volunteers. Food and accommodation provided in exchange for 4-5 hours of daily farm work.',
      organizer: title,
      location_name: 'See listing for details',
      lat: 0,
      lng: 0,
      starts_at: getNextMonday(),
      cost: 'Free (food & lodging provided)',
    })
  }

  return events
}

function getNextMonday(): string {
  const d = new Date()
  d.setDate(d.getDate() + ((1 - d.getDay() + 7) % 7 || 7))
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function hashStr(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}
