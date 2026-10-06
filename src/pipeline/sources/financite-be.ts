/**
 * Réseau Financité — financite.be
 * Ethical/solidarity finance network, French-speaking Belgium: ciné-débats,
 * conferences, workshops, "Financité Talks", local groups.
 *
 * Drupal agenda at /activités (paged ?page=N, ~14 per page, upcoming only).
 * Each card has <time datetime="…Z"> (the real start in UTC), the town
 * ("En ligne" for online activities → skipped), the type and a link. Detail
 * pages add the end time ("08H30 16H15"), venue name, street and postcode +
 * town (fields field-activites-*-lieu) and the description. Venue is
 * geocoded (cached), falling back to the town. ≤ 25 requests.
 */
import * as cheerio from 'cheerio'
import type { RawEvent, SourceFetcher } from './types'
import { getText, parisIso, geocodeFrFirst, ONLINE_RE } from './fr-common'

const SRC = 'financite-be'
const BASE = 'https://www.financite.be'
const LIST = `${BASE}/activit%C3%A9s`
const MAX_PAGES = 5
const MAX_REQUESTS = 25
const MAX_EVENTS = 200

interface Card { url: string; title: string; start: string; town: string; type: string; image: string | null }

function parseList(html: string): Card[] {
  const $ = cheerio.load(html)
  const out: Card[] = []
  // Cards are grid columns containing a <time> and an h2 title link
  $('time.datetime').each((_, el) => {
    const card = $(el).closest('[class*="col-xxl-3"], [class*="col-xl-4"]')
    if (!card.length) return
    const a = card.find('.bloc_titre_activites h2 a').first()
    const href = a.attr('href')
    const dt = $(el).attr('datetime')
    if (!href || !dt || isNaN(Date.parse(dt))) return
    const img = card.find('img').first().attr('src')
    out.push({
      url: new URL(href, BASE).toString(),
      title: a.text().replace(/\s+/g, ' ').trim(),
      start: new Date(dt).toISOString(),
      town: card.find('.typo_165').first().text().replace(/\s+/g, ' ').trim(),
      type: card.find('.SourceSerif4Regular').first().text().replace(/\s+/g, ' ').trim(),
      image: img ? new URL(img, BASE).toString() : null,
    })
  })
  return out
}

function field($: cheerio.CheerioAPI, name: string): string {
  return $(`.field--name-field-activites-${name}-lieu .field__item`).first().text().replace(/\s+/g, ' ').trim()
}

export const financiteBe: SourceFetcher = {
  name: SRC,
  async fetch() {
    const now = Date.now()
    let requests = 0
    const cards: Card[] = []
    const seen = new Set<string>()
    for (let page = 0; page < MAX_PAGES; page++) {
      requests++
      let html = await getText(page ? `${LIST}?page=${page}` : LIST)
      // The site occasionally serves the first page without its listing; one
      // retry keeps that from emptying the whole week.
      if (page === 0 && (!html || parseList(html).length === 0)) {
        await new Promise(r => setTimeout(r, 3000))
        requests++
        html = await getText(LIST)
      }
      if (!html) break
      let added = 0
      for (const c of parseList(html)) {
        const k = `${c.url}|${c.start}`
        if (seen.has(k)) continue
        seen.add(k)
        cards.push(c)
        added++
      }
      if (!added || !html.includes(`?page=${page + 1}"`)) break
    }

    const events: RawEvent[] = []
    for (const c of cards) {
      if (events.length >= MAX_EVENTS) break
      if (!c.title || Date.parse(c.start) < now) continue
      if (!c.town || ONLINE_RE.test(`${c.town} ${c.title}`)) continue

      let venue = ''
      let street = ''
      let cp = ''
      let end: string | null = null
      let description = ''
      if (requests < MAX_REQUESTS) {
        requests++
        const html = await getText(c.url)
        if (html) {
          const $ = cheerio.load(html)
          venue = field($, 'nom')
          street = field($, 'adresse')
          cp = field($, 'cpostal')
          description = $('.SourceSerif4Regular.typo_218').first().clone().children('.row').remove().end()
            .text().replace(/\s+/g, ' ').trim().slice(0, 600)
          // "JEU 08.10.2026 <br> 08H30 16H15"
          const when = $('.bloc_debug .typo_218').first().text().replace(/\s+/g, ' ')
          const m = when.match(/(\d{2})\.(\d{2})\.(\d{4})\s+\d{1,2}H\d{2}\s+(\d{1,2})H(\d{2})/i)
          if (m) {
            const e = parisIso(+m[3], +m[2], +m[1], +m[4], +m[5])
            if (e && e > c.start) end = e
          }
        }
      }

      const geo = await geocodeFrFirst([
        [street, cp || c.town].filter(Boolean).join(', ') + ', Belgique',
        `${cp || c.town}, Belgique`,
        `${c.town}, Belgique`,
      ])
      if (!geo) continue

      events.push({
        source: SRC,
        source_id: `financite-${c.url.split('/').pop()}-${c.start.slice(0, 10)}`,
        source_url: c.url,
        title: c.title,
        description: description || `${c.type || 'Activité'} du Réseau Financité à ${c.town}.`,
        organizer: 'Réseau Financité',
        location_name: [venue, street, cp || c.town].filter(Boolean).join(', '),
        lat: geo.lat, lng: geo.lng,
        starts_at: c.start,
        ends_at: end,
        cost: 'Voir site',
        image_url: c.image,
      })
    }
    return events
  },
}
