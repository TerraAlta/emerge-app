/**
 * Permaprojects — permaprojects.be
 * Bio-intensive market-gardening institute + farm (La Hulpe, Brabant
 * wallon): field visits, thematic trainings, info sessions.
 *
 * WordPress/Bricks site. /agenda/ lists upcoming "évènements" (custom post
 * type `evenement`) as cards: "le 17 octobre" / "du 5 octobre au 9 octobre",
 * type and title, linking to /evenement/<slug>/. Detail pages carry
 * "Date Le 17 octobre", "Horaire De 09:30 à 17:30", optional "Lieu …"
 * ("À distance" = online → skipped) and "Prix …". No year is printed: it is
 * the next occurrence of that day/month. Events without a "Lieu" take place
 * at the training field (Chaussée de Bruxelles 117, 1310 La Hulpe).
 * One listing + ≤ 20 detail requests.
 *
 * (The old perma-projects.be domain does not resolve.)
 */
import * as cheerio from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { getText, parisIso, frMonth, geocodeFrFirst, ONLINE_RE } from './fr-common'

const SRC = 'perma-projects-be'
const BASE = 'https://permaprojects.be'
const AGENDA = `${BASE}/agenda/`
const FIELD = { name: 'Permaprojects, Chaussée de Bruxelles 117, 1310 La Hulpe', lat: 50.7484, lng: 4.4642 }
const MAX_DETAILS = 20

/** Next occurrence (from ~2 weeks ago) of day/month → year. */
function yearFor(d: number, m: number, now: Date): number {
  const y = now.getUTCFullYear()
  return Date.UTC(y, m - 1, d) < now.getTime() - 14 * 86400000 ? y + 1 : y
}

function dayMonth(s: string): { d: number; m: number } | null {
  const x = s.match(/(\d{1,2})(?:er)?\s+([a-zéû]+)/i)
  const m = x ? frMonth(x[2]) : undefined
  return x && m ? { d: +x[1], m } : null
}

function textOf(html: string): string {
  const $ = cheerio.load(html.replace(/<svg[\s\S]*?<\/svg>/g, ''))
  $('script, style, header, footer, nav').remove()
  return $('main').text().replace(/\s+/g, ' ').trim() || $('body').text().replace(/\s+/g, ' ').trim()
}

export const permaProjectsBe: SourceFetcher = {
  name: SRC,
  async fetch() {
    const html = await getText(AGENDA)
    if (!html) return []
    const $ = cheerio.load(html)
    const cards: { url: string; title: string; type: string; when: string }[] = []
    $('a[href*="/evenement/"]').each((_, el) => {
      const a = $(el)
      const url = a.attr('href')
      const title = a.find('h3').first().text().replace(/\s+/g, ' ').trim()
      if (!url || !title || cards.some((c) => c.url === url)) return
      cards.push({
        url,
        title,
        type: a.find('.brxe-text-basic').first().text().trim(),
        when: a.find('p').first().text().replace(/\s+/g, ' ').trim(),
      })
    })

    const now = new Date()
    const events: RawEvent[] = []
    for (const c of cards.slice(0, MAX_DETAILS)) {
      const page = await getText(c.url)
      const txt = page ? textOf(page) : ''
      // "Date Le 17 octobre Horaire De 09:30 à 17:30 Lieu … Public … Prix 95 €"
      const dateTxt = txt.match(/\bDate\s+(.{3,60}?)\s+(?:Horaire|Type|Lieu|Public|Prix)\b/)?.[1] ?? c.when
      const parts = dateTxt.split(/\s+au\s+/i)
      const sdm = dayMonth(parts[0])
      if (!sdm) continue
      const edm = parts[1] ? dayMonth(parts[1]) : null
      const hor = txt.match(/\bHoraire\s+De\s+(\d{1,2})[:h](\d{2})?\s+à\s+(\d{1,2})[:h](\d{2})?/i)
      const lieu = txt.match(/\bLieu\s+(.{2,120}?)\s+(?:Public|Prix|Type)\b/)?.[1]?.trim() ?? ''
      if (ONLINE_RE.test(lieu) || /distance/i.test(lieu)) continue

      const y = yearFor(sdm.d, sdm.m, now)
      const start = parisIso(y, sdm.m, sdm.d, hor ? +hor[1] : 10, hor ? +(hor[2] ?? 0) : 0)
      if (!start || Date.parse(start) < now.getTime()) continue
      let end: string | null = null
      if (hor) {
        const ed = edm ?? sdm
        const ey = ed.m < sdm.m ? y + 1 : y
        end = parisIso(ey, ed.m, ed.d, +hor[3], +(hor[4] ?? 0))
        if (end && end <= start) end = null
      }

      let loc = { name: FIELD.name, lat: FIELD.lat, lng: FIELD.lng }
      if (lieu && !/La Hulpe/i.test(lieu)) {
        const geo = await geocodeFrFirst([`${lieu}, Belgique`])
        if (!geo) continue
        loc = { name: lieu, ...geo }
      }
      const prix = txt.match(/\bPrix\s+(.{1,40}?)(?:\s{1}[A-ZÀ-Ý][a-zà-ÿ]|\s*$)/)?.[1]?.trim() ?? ''
      const descStart = txt.indexOf(c.title, txt.indexOf('Prix'))
      const description = (descStart > 0 ? txt.slice(descStart + c.title.length) : '')
        .replace(/je m'inscris.*$/i, '').replace(/Inscrivez-vous à notre newsletter.*$/i, '').trim().slice(0, 600)

      events.push({
        source: SRC,
        source_id: `permaprojects-${c.url.replace(/\/$/, '').split('/').pop()}-${start.slice(0, 10)}`,
        source_url: c.url,
        title: c.title,
        description: description || `${c.type || 'Évènement'} — Permaprojects, institut d'entrepreneuriat en maraîchage bio-intensif.`,
        organizer: 'Permaprojects',
        location_name: loc.name,
        lat: loc.lat, lng: loc.lng,
        starts_at: start,
        ends_at: end,
        cost: /gratuit/i.test(prix) ? 'Gratuit' : prix || 'Voir site',
      })
    }
    return events
  },
}
