/**
 * Réseau AMAP — the regional AMAP network's own agenda (Réseau des AMAP
 * d'Île-de-France, amap-idf.org "Les prochains rendez-vous").
 *
 * reseau-amap.org is a frozen static directory of AMAPs (no events) and
 * miramap.org is read by miramap-fr, so this source reads the largest
 * regional network's agenda instead. The page lists every upcoming
 * rendez-vous as:
 *   <div class="rdv … " id="date531">
 *     <div class="rdv-date"><time class="date_le" datetime="2026-10-13">…
 *        <div class="horaires">19h-21h</div></time></div>
 *     (or <time class="date_du" datetime=…> … <time class="date_au" datetime=…>)
 *     <span class="rdv-theme">…</span><h2 class="rdv-titre">…</h2>
 *     <div class="rdv-lieu">NONVILLE (77)</div> <div class="rdv-desc">…</div>
 *     <a class="bouton" href="…">Toutes les infos</a>
 * One request. Times are Europe/Paris. Visio events and rendez-vous with no
 * usable place ("IDF", none) are skipped; places are geocoded (cached).
 */
import * as cheerio from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'
import { getText, parisIso, frMonth, geocodeFrFirst, ONLINE_RE } from './fr-common'

const SRC = 'amap-fr'
const BASE = 'https://amap-idf.org'
const AGENDA = `${BASE}/le-reseau/les-prochains-rendez-vous`
const MAX_EVENTS = 200

/** "19h-21h", "9h30-17H30", "18h50-21h", "18h - 20h" → [[h,m],[h,m]|null] */
function parseHours(s: string): { start: [number, number] | null; end: [number, number] | null } {
  const m = s.match(/(\d{1,2})\s*[hH:]\s*(\d{2})?(?:\s*[-–à]\s*(\d{1,2})\s*[hH:]\s*(\d{2})?)?/)
  if (!m) return { start: null, end: null }
  return {
    start: [+m[1], m[2] ? +m[2] : 0],
    end: m[3] ? [+m[3], m[4] ? +m[4] : 0] : null,
  }
}

function ymd(s: string | undefined): [number, number, number] | null {
  const m = (s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? [+m[1], +m[2], +m[3]] : null
}

/** Fallback when there is no <time datetime>: "les lundis 5 et 12 octobre 2026" → first day. */
function textDate(s: string): [number, number, number] | null {
  const m = s.match(/(\d{1,2})\D+?(?:\d{1,2}\s+)?([a-zéû.]{3,10})\s+(\d{4})/i)
  if (!m) return null
  const mo = frMonth(m[2])
  return mo ? [+m[3], mo, +m[1]] : null
}

export const amapFr: SourceFetcher = {
  name: SRC,
  async fetch() {
    const html = await getText(AGENDA)
    if (!html) {
      console.warn('[amap-fr] agenda page unavailable')
      return []
    }
    const $ = cheerio.load(html)
    const now = Date.now()
    const events: RawEvent[] = []

    for (const node of $('div.rdv[id^="date"]').toArray()) {
      if (events.length >= MAX_EVENTS) break
      const el = $(node)
      const id = (el.attr('id') ?? '').replace(/^date/, '')
      const dateBox = el.find('.rdv-date').first()
      const titleEl = el.find('h2.rdv-titre').first()
      const sub = titleEl.find('.soustitre').text().trim()
      titleEl.find('.soustitre').remove()
      const title = titleEl.text().replace(/\s+/g, ' ').trim()
      if (!title) continue
      const theme = el.find('.rdv-theme').first().text().trim()
      const lieu = el.find('.rdv-lieu').first().text().replace(/\s+/g, ' ').trim()
      const desc = stripHtml((el.find('.rdv-desc').first().html() ?? '').replace(/<[^>]+>/g, ' '))
      if (!lieu || ONLINE_RE.test(`${title} ${sub} ${lieu}`)) continue
      if (/^(idf|[iî]le[- ]de[- ]france)$/i.test(lieu)) continue

      const startDay = ymd(dateBox.find('time.date_le, time.date_du').first().attr('datetime')) ?? textDate(dateBox.text())
      if (!startDay) continue
      const endDay = ymd(dateBox.find('time.date_au').first().attr('datetime'))
      const hours = parseHours(dateBox.find('.horaires').first().text())
      const starts = parisIso(startDay[0], startDay[1], startDay[2], hours.start?.[0] ?? 0, hours.start?.[1] ?? 0)
      if (!starts || new Date(starts).getTime() < now) continue
      let ends: string | null = null
      if (endDay) ends = parisIso(endDay[0], endDay[1], endDay[2], hours.end?.[0] ?? 23, hours.end?.[1] ?? 0)
      else if (hours.end) ends = parisIso(startDay[0], startDay[1], startDay[2], hours.end[0], hours.end[1])
      if (ends && ends <= starts) ends = null

      // "NONVILLE (77)", "Yvelines & Val-d'Oise", "Paris 2 Pl. Baudoyer, 75004 Paris"
      const first = lieu.split(/\s*(?:&|\/| - )\s*/)[0]
      const geo = await geocodeFrFirst([
        lieu,
        first.replace(/\((\d{2})\)/, ''),
        lieu.match(/\b\d{5}\s+[^,]+/)?.[0] ?? '',
      ].filter(Boolean))
      if (!geo) continue

      const link = el.find('.rdv-cta a[href]').first().attr('href')
      const organizer = el.find('.rdv-infos-formations strong').first().text().trim() || 'Réseau des AMAP Île-de-France'
      events.push({
        source: SRC,
        source_id: `amap-idf-${id || startDay.join('')}`,
        source_url: link ? new URL(link, BASE).toString() : `${AGENDA}#date${id}`,
        title: sub ? `${title} — ${sub}` : title,
        description: [theme, desc].filter(Boolean).join(' — ').slice(0, 500) || title,
        organizer,
        location_name: lieu.slice(0, 200),
        lat: geo.lat,
        lng: geo.lng,
        starts_at: starts,
        ends_at: ends,
        cost: 'Voir l’événement',
        image_url: el.find('img').first().attr('src') ?? null,
      })
    }
    return events
  },
}
