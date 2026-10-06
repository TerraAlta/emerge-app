/**
 * Transition Schweiz — Swiss Transition Town initiatives.
 *
 * Of the Swiss local sites the old file guessed (transition-basel.ch,
 * transition-bern.ch, transition-geneve.ch) only Bern is still online
 * (now transitionbern.ch). Basel/Genève and transition-schweiz.ch no longer
 * resolve; the national D-A-CH calendar (transition-initiativen.org) is
 * already covered by transition-de.
 *
 * Transition Bern publishes its dates in a DokuWiki page
 * (https://wiki.transitionbern.ch/doku.php?id=zeitplan, read as raw wiki text
 * with &do=export_raw): the next "Transition Bern Treffen" ("am **29.10.2026
 * (Donnerstag) ab 19 Uhr**. Ort folgt.") and a list of further meetings
 * ("07.12.2026 (Montag), 19 Uhr"). These open meetings are public ("alle
 * eingeladen"). Only lines in the "Transition Bern" sections are read (the
 * "Weiteres, Andere" section links other groups). The venue is usually
 * announced later ("Ort folgt"), so the event is placed in Bern city centre
 * unless a "Ort: …" is given. Times are Europe/Zurich.
 */
import type { RawEvent, SourceFetcher } from './types'
import { hashStr } from './utils'
import { getText, zurichIso, geocodeCh } from './ch-common'

const SRC = 'transition-ch'
const WIKI = 'https://wiki.transitionbern.ch/doku.php?id=zeitplan'
const BERN = { lat: 46.9480, lng: 7.4474 }

export const transitionCh: SourceFetcher = {
  name: SRC,
  async fetch() {
    const raw = await getText(`${WIKI}&do=export_raw`, 20000, 'text/plain,*/*')
    if (!raw) return []
    // Only the Transition Bern part (stop at the "Weiteres, Andere" heading)
    const cut = raw.search(/=+\s*Weiteres,\s*Andere/i)
    const text = cut > 0 ? raw.slice(0, cut) : raw

    const now = Date.now()
    const out: RawEvent[] = []
    const seen = new Set<string>()
    for (const line of text.split('\n')) {
      const clean = line.replace(/\*\*|\\\\|\[\[[^\]|]*\|?([^\]]*)\]\]/g, '$1').trim()
      const re = /\b(\d{1,2})\.(\d{1,2})\.(20\d\d)\b(?:\s*\([^)]*\))?[,\s]*(?:ab\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*Uhr/g
      let m: RegExpExecArray | null
      while ((m = re.exec(clean))) {
        const start = zurichIso(+m[3], +m[2], +m[1], +m[4], m[5] ? +m[5] : 0)
        if (!start || Date.parse(start) < now || seen.has(start)) continue
        seen.add(start)
        const extra = clean.slice(m.index + m[0].length).replace(/^[\s.,]+/, '')
        const ortM = clean.match(/\bOrt:\s*([^.\n]+)/)
        let geo = BERN
        let locName = 'Bern (Ort wird bekanntgegeben)'
        if (ortM && !/folgt/i.test(ortM[1])) {
          const g = await geocodeCh(`${ortM[1].trim()}, Bern`)
          if (g) { geo = g; locName = ortM[1].trim() }
        }
        const hv = /\bHV\b|Hauptversammlung/i.test(extra)
        out.push({
          source: SRC,
          source_id: `tr-ch-bern-${hashStr(start)}`,
          source_url: WIKI,
          title: hv ? 'Transition Bern Treffen mit Hauptversammlung' : 'Transition Bern Treffen',
          description: 'Offenes Treffen von Transition Bern: alle, die sich für den Grossen Wandel interessieren, sind eingeladen – Austausch, Kreativgruppen (Bern Unverpackt, Fair Economy, Innerer Wandel, SoLaVelo, Transition Streets …) und neue Projekte. Der Ort wird jeweils im Wiki bekanntgegeben.',
          organizer: 'Transition Bern',
          location_name: locName,
          lat: geo.lat,
          lng: geo.lng,
          starts_at: start,
          ends_at: null,
          cost: 'Free',
          image_url: null,
        })
      }
    }
    return out
  },
}
