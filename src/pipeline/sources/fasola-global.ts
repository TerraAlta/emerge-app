/** FaSoLa / Sacred Harp — fasola.org/singings — shape note community singing worldwide */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'

export const fasolaGlobal: SourceFetcher = {
  name: 'fasola-global',
  async fetch() {
    const all: RawEvent[] = []
    try {
      // fasola.org provides a singings calendar — try JSON endpoint first
      const r = await fetch('https://fasola.org/singings/', {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Emerge/1.0)', Accept: 'text/html' },
        signal: AbortSignal.timeout(12000),
      })
      if (!r.ok) return []
      const html = await r.text()

      // Parse singing events from the calendar page
      // Typical format: date, location, contact info in table rows or list items
      const rx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
      let m
      while ((m = rx.exec(html)) !== null) {
        const cells = m[1].match(/<td[^>]*>([\s\S]*?)<\/td>/gi)
        if (!cells || cells.length < 2) continue

        const text = cells.map(c => stripHtml(c)).join(' | ')
        // Look for date patterns
        const dateMatch = text.match(/(\w+\s+\d{1,2},?\s+\d{4})|(\d{1,2}\s+\w+\s+\d{4})|(\d{4}-\d{2}-\d{2})/i)
        if (!dateMatch) continue

        const parsed = new Date(dateMatch[0])
        if (isNaN(parsed.getTime()) || parsed < new Date()) continue

        const title = stripHtml(cells[1] ?? cells[0]).trim()
        if (!title || title.length < 5) continue

        const linkMatch = m[1].match(/href="([^"]+)"/i)
        const locText = cells.length >= 3 ? stripHtml(cells[2]).trim() : 'Community venue'

        all.push({
          source: 'fasola-global',
          source_id: `fas-${hashStr(title + dateMatch[0])}`,
          source_url: linkMatch ? new URL(linkMatch[1], 'https://fasola.org').toString() : 'https://fasola.org/singings/',
          title: `Sacred Harp Singing: ${title}`,
          description: `Shape note / Sacred Harp community singing. Open to all voices — no audition, no music reading required. Come and sing in four-part harmony with people you've never met.`,
          organizer: 'FaSoLa community',
          location_name: locText,
          lat: 51.5074, lng: -0.1278, // Default, geocoder will fix
          starts_at: parsed.toISOString(),
          cost: 'Free',
        })
      }
    } catch {}
    return all
  },
}
