/**
 * Vitale Rassen — vitalerassen.be
 * Flemish organic seed cooperative/network: seed fairs (zadenbeurzen,
 * "Reclaim The Seeds"), study days, courses — mostly January–March.
 *
 * There is no agenda: events are announced as ordinary WordPress posts
 * whose TITLE starts with the date — "Zon. 15 maart – Reclaim The Seeds
 * (Mol)", "Zon. 15/02 Zadenbeurs 't Grom", "Bijeenkomst 16/1: …". We read
 * the latest posts from the REST API (/wp-json/wp/v2/posts, one request)
 * and keep only those with a day+month in the title; the year is the first
 * occurrence on/after the publication date. Hours come from the body
 * ("van 10u tot 17u", "10:00 - 16:00"), else 10:00 local. Place: the
 * "(Town)" in the title, or "Locatie:/Waar:" in the body, geocoded (cached);
 * posts without a place are skipped.
 *
 * Outside seed-fair season this legitimately returns nothing. (The old
 * vitaelerassen.be domain does not resolve.)
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, decodeEntities } from './utils'
import { getJson, parisIso, ONLINE_RE } from './fr-common'
import { geocodeBeNl } from './csa-be'

const SRC = 'vitale-rassen-be'
const API = 'https://www.vitalerassen.be/wp-json/wp/v2/posts?per_page=40&_fields=id,date,link,title,content'

const NL_MONTHS: Record<string, number> = {
  jan: 1, januari: 1, feb: 2, februari: 2, mrt: 3, maart: 3, apr: 4, april: 4, mei: 5, jun: 6, juni: 6,
  jul: 7, juli: 7, aug: 8, augustus: 8, sep: 9, sept: 9, september: 9, okt: 10, oktober: 10,
  nov: 11, november: 11, dec: 12, december: 12,
}

/** Day + month from a title: "15 maart", "15/02", "16/1". */
function titleDate(t: string): { d: number; m: number; y?: number } | null {
  const a = t.match(/(?:^|[\s.:(])(\d{1,2})\s+([a-z]+)\.?(?:\s+(20\d{2}))?/i)
  if (a && NL_MONTHS[a[2].toLowerCase()]) return { d: +a[1], m: NL_MONTHS[a[2].toLowerCase()], y: a[3] ? +a[3] : undefined }
  const b = t.match(/(?:^|[\s.:(])(\d{1,2})\/(\d{1,2})(?:\/(?:'|’)?(\d{2,4}))?(?![\d/])/)
  if (b && +b[2] >= 1 && +b[2] <= 12) {
    const y = b[3] ? (b[3].length === 2 ? 2000 + +b[3] : +b[3]) : undefined
    return { d: +b[1], m: +b[2], y }
  }
  return null
}

export const vitaleRassenBe: SourceFetcher = {
  name: SRC,
  async fetch() {
    const posts = await getJson<any[]>(API, 25000)
    if (!Array.isArray(posts)) return []
    const now = Date.now()
    const events: RawEvent[] = []
    for (const p of posts) {
      const title = decodeEntities(stripHtml(p.title?.rendered ?? ''))
      const td = titleDate(title)
      if (!td) continue
      if (/geannuleerd|afgelast|volzet/i.test(title)) continue
      const pub = new Date(p.date)
      if (isNaN(pub.getTime())) continue
      let y = td.y ?? pub.getUTCFullYear()
      if (!td.y && Date.UTC(y, td.m - 1, td.d) < pub.getTime() - 86400000) y++
      const body = decodeEntities(String(p.content?.rendered ?? '').replace(/<[^>]+>/g, '\n'))
        .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')

      const hm = body.match(/(?:van\s+)?(\d{1,2})(?:[u:.h](\d{2})?)\s*(?:u\s*)?(?:tot|-|–)\s*(\d{1,2})(?:[u:.h](\d{2})?)/i)
      const valid = hm && +hm[1] < 24 && +hm[3] < 24 && /[u:h.]/.test(hm[0])
      const start = parisIso(y, td.m, td.d, valid ? +hm![1] : 10, valid ? +(hm![2] ?? 0) : 0)
      if (!start || Date.parse(start) < now) continue
      let end = valid ? parisIso(y, td.m, td.d, +hm![3], +(hm![4] ?? 0)) : null
      if (end && end <= start) end = null

      const town = title.match(/\(([^)]{2,40})\)\s*$/)?.[1]?.trim() ?? ''
      const where = (body.match(/(?:Locatie|Waar|Adres)\s*:\s*([^\n]{3,140})/i)?.[1] ?? '')
        .replace(/\s*(?:Toegang|Prijs|Wanneer|Inkom)\b.*$/i, '').replace(/\s*\((?:nabij|bij)[^)]*\)/i, '').trim()
      if (ONLINE_RE.test(`${title} ${where}`)) continue
      const geo = await geocodeBeNl([
        where ? `${where.replace(/\s+in\s+/i, ', ')}, België` : '',
        town ? `${town}, België` : '',
      ].filter(Boolean))
      if (!geo) continue

      const cleanTitle = title.replace(/^(?:[A-Za-z]{2,4}\.?\s+)?\d{1,2}(?:\s+[a-z]+\.?|\/\d{1,2})\s*[–:-]?\s*/i, '').trim() || title
      events.push({
        source: SRC,
        source_id: `vitalerassen-${p.id}`,
        source_url: p.link ?? null,
        title: cleanTitle,
        description: body.replace(/\s+/g, ' ').trim().slice(0, 600),
        organizer: 'Vitale Rassen',
        location_name: where || town,
        lat: geo.lat, lng: geo.lng,
        starts_at: start,
        ends_at: end,
        cost: 'Zie website',
      })
    }
    return events
  },
}
