/**
 * Growing Communities — growingcommunities.org
 * Hackney-based community-led food hub: organic veg scheme, the UK's only
 * all-organic farmers' market, market gardens and volunteer days.
 *
 * The site (Drupal) has no events listing, feed or API — the old /events URL
 * 404s. The one public, dated thing it publishes is the weekly Stoke
 * Newington Farmers' Market: /market states the schedule ("Every Saturday
 * 10am to 2.30pm"), the venue (St Paul's Church, N16 7UE) and a weekly
 * "Who's coming to the market on Saturday 10 October?" line naming the next
 * market date. We emit that one market, only when the page names a concrete
 * upcoming date — nothing is extrapolated from "every Saturday".
 */
import { load } from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'

const SRC = 'growing-communities-uk'
const URL_MARKET = 'https://growingcommunities.org/market'
const UA = 'Mozilla/5.0 (compatible; Emerge-App/1.0)'
// St Paul's Church, Stoke Newington Road, N16 7UE (postcodes.io centroid)
const MARKET_LAT = 51.5565
const MARKET_LNG = -0.0723

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
}

function londonOffsetMin(ts: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  )
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000)
}

function londonIso(y: number, mo: number, d: number, h: number, mi: number): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  return new Date(guess - londonOffsetMin(guess) * 60000).toISOString()
}

/** "10am to 2.30pm" → [[10,0],[14,30]] */
function parseHours(s: string): [[number, number], [number, number]] | null {
  const m = s.match(/(\d{1,2})(?:[:.](\d\d))?\s*(am|pm)\s*(?:to|–|-)\s*(\d{1,2})(?:[:.](\d\d))?\s*(am|pm)/i)
  if (!m) return null
  const h = (x: string, mer: string) => (mer.toLowerCase() === 'pm' ? (+x % 12) + 12 : +x % 12)
  return [[h(m[1], m[3]), +(m[2] ?? 0)], [h(m[4], m[6]), +(m[5] ?? 0)]]
}

export const growingCommunitiesUk: SourceFetcher = {
  name: SRC,
  async fetch() {
    let html: string
    try {
      const res = await fetch(URL_MARKET, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) {
        console.warn(`[${SRC}] /market HTTP ${res.status}`)
        return []
      }
      html = await res.text()
    } catch (err) {
      console.warn(`[${SRC}] /market failed:`, (err as Error).message)
      return []
    }

    const $ = load(html)
    $('script, style, noscript').remove()
    const text = $('body').text().replace(/\s+/g, ' ')

    // "Who's coming to the market on Saturday 10 October?"
    const next = text.match(/market on (?:Saturday|Sat)\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)/i)
    if (!next) return []
    const mo = MONTHS[next[2].toLowerCase()]
    if (!mo) return []
    const day = +next[1]

    // The page doesn't print the year: take the nearest such date from today
    // forward, and only accept it if it's a Saturday within the next 3 weeks.
    const now = new Date()
    let year = now.getUTCFullYear()
    if (Date.UTC(year, mo - 1, day) < Date.UTC(year, now.getUTCMonth(), now.getUTCDate()) - 864e5) year += 1
    const dateUtc = new Date(Date.UTC(year, mo - 1, day))
    if (dateUtc.getUTCDay() !== 6) return []
    if (dateUtc.getTime() - now.getTime() > 21 * 864e5) return []

    const hoursTxt = text.match(/Every Saturday\s+([^.]{0,40}?(?:am|pm)[^.]{0,20}?(?:am|pm))/i)?.[1] ?? ''
    const hours = parseHours(hoursTxt) ?? [[10, 0], [14, 30]]
    const venue = text.match(/St Paul'?s Church,?\s*Stoke Newington[^.]{0,20}?N16\s*7UE/i)?.[0] ?? "St Paul's Church, Stoke Newington N16 7UE"

    const startsAt = londonIso(year, mo, day, hours[0][0], hours[0][1])
    const endsAt = londonIso(year, mo, day, hours[1][0], hours[1][1])
    const iso = `${year}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return [{
      source: SRC,
      source_id: `gc-market-${iso}`,
      source_url: URL_MARKET,
      title: "Stoke Newington Farmers' Market",
      description: "The UK's only all-organic farmers' market, run by Growing Communities every Saturday in Hackney — produce from small, sustainable farms almost all within 60 miles of London.",
      organizer: 'Growing Communities',
      location_name: venue,
      lat: MARKET_LAT,
      lng: MARKET_LNG,
      starts_at: startsAt,
      ends_at: endsAt > startsAt ? endsAt : null,
      cost: 'Free entry',
    }] satisfies RawEvent[]
  },
}
