/**
 * Accademia Italiana di Permacultura — permacultura.it
 * The Accademia's national course register: PDC 72h design courses,
 * introductions, workshops and teacher trainings, published by teachers.
 *
 * The register is a plain PHP app:
 *   /programmi/corsi/visualizza_corsi.php?anno=YYYY&pag=N
 * 10 courses per page, ordered by start date ascending, so the upcoming
 * ones sit on the last pages of the current year. Each entry has
 * "Data: DD-MM-YYYY • DD-MM-YYYY", "Luogo: <region> <free text>",
 * "Titolo: …", the teachers and the start of the programme text.
 * We read every page of the current year and of next year (~5–8 requests).
 *
 * Times: the register has dates only. We take a start time from the
 * programme text when it states one ("dalle 9:30", "ore 10"), otherwise
 * assume 09:00 Europe/Rome. Online courses are skipped. Venues are
 * geocoded via Nominatim from the free-text place + region.
 */
import { load } from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'
import { getText, romeIso, geocodeFirst } from './italy-common'

const SRC = 'permacultura-it'
const LIST = 'https://www.permacultura.it/programmi/corsi/visualizza_corsi.php'
const MAX_PAGES_PER_YEAR = 15
const MAX_EVENTS = 200

interface Course {
  id: string
  category: string
  start: [number, number, number]
  end: [number, number, number] | null
  region: string
  place: string
  title: string
  teachers: string
  program: string
}

function dmy(s: string): [number, number, number] | null {
  const m = s.match(/(\d{1,2})-(\d{1,2})-(\d{4})/)
  return m ? [+m[3], +m[2], +m[1]] : null
}

function parsePage(html: string): Course[] {
  const out: Course[] = []
  // Each course starts with a "Categoria:" header row
  const chunks = html.split(/<b>Categoria:<\/b>/).slice(1)
  for (const chunk of chunks) {
    const $ = load(chunk)
    const idm = chunk.match(/visualizza_corsi\.php\?idc=(\d+)/)
    const dataM = chunk.match(/<b>Data:<\/b>([\s\S]*?)<b>Luogo:/)
    if (!idm || !dataM) continue
    const dates = stripHtml(dataM[1]).split('•').map((s) => s.trim())
    const start = dmy(dates[0] ?? '')
    if (!start) continue
    const end = dates[1] ? dmy(dates[1]) : null
    const region = stripHtml($('span.label').first().text())
    const luogoM = chunk.match(/<b>Luogo:<\/b>[\s\S]*?<\/h4>([\s\S]*?)<\/td>/)
    const place = luogoM ? stripHtml(luogoM[1]) : ''
    const title = stripHtml($('#sottotitolo').first().text()).replace(/^Titolo:\s*/i, '')
    const teachersM = chunk.match(/<b>Docenti<\/b><br>([\s\S]*?)<br>/)
    const progM = chunk.match(/Programma, info e contatti:<\/strong><br>([\s\S]*?)<a href="visualizza_corsi/)
    const program = progM ? stripHtml(progM[1].replace(/<br\s*\/?>/gi, ' ')) : ''
    const category = stripHtml(chunk.split('</th>')[0])
    if (!title) continue
    out.push({
      id: idm[1], category, start, end, region, place, title,
      teachers: teachersM ? stripHtml(teachersM[1]) : '',
      program,
    })
  }
  return out
}

function startTime(text: string): [number, number] {
  const m = text.match(/\b(?:dalle(?: ore)?|ore|alle ore|inizio(?: ore)?)\s*(\d{1,2})(?:[:.](\d{2}))?/i)
  if (m) {
    const h = +m[1]
    const mi = m[2] ? +m[2] : 0
    if (h >= 7 && h <= 21 && mi < 60) return [h, mi]
  }
  return [9, 0]
}

function placeQueries(place: string, region: string): string[] {
  const clean = place
    .replace(/\b(presso|c\/o|in|nel|nella|a)\b\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const q: string[] = []
  const reg = region && !/^-/.test(region) ? region : ''
  // "Pramaggiore (VE)", "San Giovanni in Persiceto (BO)"
  const prov = place.match(/([A-ZÀ-Ü][\wÀ-ü' ]{2,40}?)\s*\(([A-Z]{2})\)/)
  if (prov) q.push(`${prov[1].trim().split(/\s+/).slice(-3).join(' ')}, ${prov[2]}`, prov[1].trim())
  q.push(`${clean}, ${reg}`)
  for (const seg of place.split(/[,;\-–]/).map((s) => s.trim()).filter((s) => s.length > 2)) {
    q.push(`${seg}, ${reg}`)
  }
  // Last two / last word of the free text (often the town)
  const words = clean.split(' ')
  if (words.length > 1) q.push(`${words.slice(-2).join(' ')}, ${reg}`, `${words[words.length - 1]}, ${reg}`)
  return [...new Set(q.map((s) => s.replace(/,\s*$/, '').trim()).filter(Boolean))].slice(0, 6)
}

async function fetchYear(year: number): Promise<Course[]> {
  const out: Course[] = []
  let pages = 1
  for (let p = 1; p <= Math.min(pages, MAX_PAGES_PER_YEAR); p++) {
    const html = await getText(`${LIST}?anno=${year}&pag=${p}`)
    if (!html) break
    if (p === 1) {
      const nums = [...html.matchAll(/pag=(\d+)/g)].map((m) => +m[1])
      pages = nums.length ? Math.max(...nums) : 1
    }
    const courses = parsePage(html)
    if (!courses.length) break
    out.push(...courses)
  }
  return out
}

export const permaculturaIt: SourceFetcher = {
  name: SRC,
  async fetch() {
    const year = new Date().getUTCFullYear()
    const courses = [...(await fetchYear(year)), ...(await fetchYear(year + 1))]
    const seen = new Set<string>()
    const events: RawEvent[] = []
    for (const c of courses) {
      if (events.length >= MAX_EVENTS) break
      if (seen.has(c.id)) continue
      seen.add(c.id)
      if (/\b(online|on-line|webinar|zoom|a distanza)\b/i.test(`${c.place} ${c.title}`)) continue
      const [h, mi] = startTime(c.program)
      const startsAt = romeIso(c.start[0], c.start[1], c.start[2], h, mi)
      if (new Date(startsAt).getTime() < Date.now()) continue
      if (!c.place && !c.region) continue

      const geo = await geocodeFirst(placeQueries(c.place, c.region))
      if (!geo) continue

      const endsAt = c.end && c.end.join('-') !== c.start.join('-')
        ? romeIso(c.end[0], c.end[1], c.end[2], 18, 0)
        : null
      const cost = c.program.match(/(?:€|euro)\s*\d+[\d.,]*|\d+[\d.,]*\s*(?:€|euro)/i)?.[0]
      const descr = [
        c.category,
        c.teachers ? `Docenti: ${c.teachers}.` : '',
        c.program,
      ].filter(Boolean).join(' — ')

      events.push({
        source: SRC,
        source_id: `perm-it-${c.id}`,
        source_url: `${LIST}?idc=${c.id}`,
        title: c.title.slice(0, 200),
        description: descr.slice(0, 500),
        organizer: c.teachers ? c.teachers.slice(0, 120) : 'Accademia Italiana di Permacultura',
        location_name: [c.place, c.region].filter(Boolean).join(', ').slice(0, 200),
        lat: geo.lat,
        lng: geo.lng,
        starts_at: startsAt,
        ends_at: endsAt,
        cost: cost ? cost.replace(/\s+/g, ' ') : 'Vedi evento',
      })
    }
    return events
  },
}
