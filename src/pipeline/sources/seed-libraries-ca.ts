/**
 * Seed swaps across Canada — Seeds of Diversity's "Seedy Saturdays and Events"
 * directory (https://seeds.ca/events/).
 *
 * The old target (seedlibraries.ca) no longer resolves. Seeds of Diversity
 * keeps the national list of Seedy Saturdays / Seedy Sundays / seed swaps:
 * a server-rendered page (default range: today → +5 months) where each event
 * is a <div class='EV_Event'> with <h3>title</h3> and a bold block
 * "Saturday February 20, 2027   10:00 am - 3:00 pm<br/>102 Greenview Ave<br/>
 * Ottawa, ON<br/>". Times are local to the province (mapped to its IANA zone);
 * events without a time start at 10:00 local. Venues are geocoded with
 * Nominatim (street address first, then city), at most 30 lookups per run.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'
import { getText, zonedIso, enMonth, parseClock, geocodeFirst, type LatLng } from './misc-common'

const SRC = 'seed-libraries-ca'
const PAGE = 'https://seeds.ca/events/'
const MAX_GEOCODES = 30

const PROV: Record<string, { tz: string; name: string }> = {
  BC: { tz: 'America/Vancouver', name: 'British Columbia' },
  AB: { tz: 'America/Edmonton', name: 'Alberta' },
  SK: { tz: 'America/Regina', name: 'Saskatchewan' },
  MB: { tz: 'America/Winnipeg', name: 'Manitoba' },
  ON: { tz: 'America/Toronto', name: 'Ontario' },
  QC: { tz: 'America/Toronto', name: 'Quebec' },
  NB: { tz: 'America/Moncton', name: 'New Brunswick' },
  NS: { tz: 'America/Halifax', name: 'Nova Scotia' },
  PE: { tz: 'America/Halifax', name: 'Prince Edward Island' },
  NL: { tz: 'America/St_Johns', name: 'Newfoundland and Labrador' },
  YT: { tz: 'America/Whitehorse', name: 'Yukon' },
  NT: { tz: 'America/Yellowknife', name: 'Northwest Territories' },
  NU: { tz: 'America/Iqaluit', name: 'Nunavut' },
}

export const seedLibrariesCa: SourceFetcher = {
  name: SRC,
  async fetch() {
    const html = await getText(PAGE)
    if (!html) return []
    const now = Date.now()
    const out: RawEvent[] = []
    let geocodes = 0

    for (const m of html.matchAll(/<div class='EV_Event'>([\s\S]*?)<hr style='clear:both'\/>/g)) {
      const block = m[1]
      const title = stripHtml(block.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] ?? '')
      const strong = block.match(/<p><strong>([\s\S]*?)<\/strong><\/p>/)?.[1]
      if (!title || !strong) continue
      const lines = strong.split(/<br\s*\/?>/i).map((l) => stripHtml(l)).filter(Boolean)
      // "Saturday February 20, 2027 10:00 am - 3:00 pm"
      const dm = lines[0]?.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})(.*)$/)
      const mo = enMonth(dm?.[1])
      if (!dm || !mo) continue
      const placeLine = lines[lines.length - 1] ?? ''
      const pm = placeLine.match(/^(.*?),\s*([A-Z]{2})$/)
      const prov = pm ? PROV[pm[2]] : undefined
      if (!pm || !prov) continue // can't place it or pick a time zone
      const city = pm[1].replace(/,\s*(Ontario|Quebec|British Columbia|Alberta|Manitoba|Saskatchewan|Nova Scotia)$/i, '').trim()

      const times = (dm[4] ?? '').split(/\s+[-–]\s+/)
      const st = times[0] ? parseClock(times[0]) : null
      const en = times[1] ? parseClock(times[1]) : null
      const start = zonedIso(prov.tz, +dm[3], mo, +dm[2], st?.[0] ?? 10, st?.[1] ?? 0)
      if (!start || Date.parse(start) < now + 3600_000) continue
      const endIso = en ? zonedIso(prov.tz, +dm[3], mo, +dm[2], en[0], en[1]) : null

      const address = lines.slice(1, -1).join(', ')
      let geo: LatLng | null = null
      if (geocodes < MAX_GEOCODES) {
        geocodes++
        geo = await geocodeFirst([
          address ? `${address.replace(/\s+/g, ' ')}, ${city}, ${prov.name}` : '',
          `${city}, ${prov.name}`,
        ], 'ca')
      }
      if (!geo) continue

      const desc = stripHtml(block.match(/<p style='width:80%'>([\s\S]*?)<\/p>/)?.[1] ?? '')
      const more = block.match(/More information:\s*<a href='([^']+)'/)?.[1]
      out.push({
        source: SRC,
        source_id: `sodca-${hashStr(`${title}|${start.slice(0, 10)}|${city}`)}`,
        source_url: more && /^https?:\/\//.test(more) ? more : PAGE,
        title,
        description: (desc || `Seed swap in ${city}, ${prov.name}.`).slice(0, 500),
        organizer: title.replace(/\s*Seedy (Saturday|Sunday).*$/i, '').trim() || 'Seeds of Diversity',
        location_name: [address, `${city}, ${pm[2]}`].filter(Boolean).join(', '),
        lat: geo.lat,
        lng: geo.lng,
        starts_at: start,
        ends_at: endIso && endIso > start ? endIso : null,
        cost: /free admission|\bfree\b/i.test(desc) ? 'Free' : 'See event page',
      })
      if (out.length >= 200) break
    }
    return out
  },
}
