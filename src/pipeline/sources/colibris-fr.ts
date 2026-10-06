/**
 * Colibris France — the local groups' shared agenda.
 *
 * colibris-lemouvement.org no longer has an agenda (the /agenda URL is a
 * 404 since the 2026 redesign). Colibris local groups publish their public
 * events on the YesWiki "colibris-groupeslocaux.org" (page ?ListeEvenement),
 * whose Bazar form 5 ("événement groupes locaux") is exposed as JSON:
 *   https://colibris-groupeslocaux.org/?api/forms/5/entries/json
 * One request returns every entry (≈300, mostly past). Fields:
 *   bf_titre, bf_date_debut_evenement / bf_date_fin_evenement ("2026-10-18"
 *   or "2026-09-19T14:00:00+00:00" — YesWiki stores the wall-clock time with
 *   a fake +00:00, so we treat it as Europe/Paris), bf_adresse,
 *   bf_adresse_courte (town), bf_geolocation {latitude, longitude},
 *   listeListeTypeDEvenement, bf_url, url.
 * Events marked "virtuel"/visio are skipped. Coordinates come from the entry
 * when real (not the France-centre default the form pre-fills), else from
 * Nominatim on the address / town.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'
import { getJson, parisIso, geocodeFrFirst, ONLINE_RE } from './fr-common'

const SRC = 'colibris-fr'
const BASE = 'https://colibris-groupeslocaux.org'
const API = `${BASE}/?api/forms/5/entries/json`
const MAX_EVENTS = 200

const TYPE_LABEL: Record<string, string> = {
  atelier: 'Atelier', 'rencontre-publique': 'Rencontre publique', reucc: 'Réunion', 'cine-debat': 'Ciné-débat',
  'sortie-nature': 'Sortie nature', festival: 'Festival', forum: 'Forum', conf: 'Conférence',
  'cafe-colibris': 'Café Colibris', formation: 'Formation',
}

/** "2026-10-18" or "2026-09-19T14:00:00+00:00" (Paris wall-clock) → ISO UTC. */
function ywDate(v: string | undefined): { iso: string; hasTime: boolean } | null {
  const m = (v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/)
  if (!m) return null
  const iso = parisIso(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0)
  return iso ? { iso, hasTime: !!m[4] } : null
}

function realGeo(g: any): { lat: number; lng: number } | null {
  const lat = parseFloat(g?.latitude ?? '')
  const lng = parseFloat(g?.longitude ?? '')
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  // Form default = map centre of France (46.2254, 2.2412): not a real location
  if (Math.abs(lat - 46.2254) < 0.01 && Math.abs(lng - 2.2412) < 0.01) return null
  if (lat < 41 || lat > 51.6 || lng < -5.6 || lng > 9.7) return null
  return { lat, lng }
}

export const colibrisFr: SourceFetcher = {
  name: SRC,
  async fetch() {
    const data = await getJson<Record<string, any> | any[]>(API)
    if (!data) {
      console.warn('[colibris-fr] YesWiki API unavailable')
      return []
    }
    const entries: any[] = Array.isArray(data) ? data : Object.values(data)
    const now = Date.now()
    const events: RawEvent[] = []
    const seen = new Set<string>()

    const upcoming = entries
      .map((e) => ({ e, s: ywDate(e.bf_date_debut_evenement) }))
      .filter((x) => x.s && new Date(x.s.iso).getTime() > now - 86400000)
      .sort((a, b) => a.s!.iso.localeCompare(b.s!.iso))

    for (const { e, s } of upcoming) {
      if (events.length >= MAX_EVENTS) break
      if (e.statut_fiche && String(e.statut_fiche) !== '1') continue
      const title = stripHtml(String(e.bf_titre ?? ''))
      if (!title) continue

      const addr = stripHtml(String(e.bf_adresse ?? ''))
      const town = stripHtml(String(e.bf_adresse_courte ?? ''))
      const descr = stripHtml(String(e.bf_description ?? '').replace(/\[\[(\S+)\s+([^\]]+)\]\]/g, '$2'))
      if (/virtuel/i.test(`${addr} ${town}`) || ONLINE_RE.test(`${title} ${addr} ${town}`)) continue

      // Skip the form's placeholder text if someone left it in
      const cleanAddr = /adresse pour g[ée]olocaliser/i.test(addr) ? '' : addr
      let geo = realGeo(e.bf_geolocation)
      if (!geo) {
        geo = await geocodeFrFirst([
          cleanAddr,
          cleanAddr.match(/\b\d{5}\s+[^,]+/)?.[0] ?? '',
          town,
        ].filter(Boolean))
      }
      if (!geo) continue

      const end = ywDate(e.bf_date_fin_evenement)
      // Start must still be ahead; if it already started (multi-day expo),
      // the pipeline drops it anyway — keep the real date, never shift it.
      const key = `${title}|${s!.iso}`
      if (seen.has(key)) continue
      seen.add(key)

      const type = TYPE_LABEL[e.listeListeTypeDEvenement] ?? ''
      const link = (typeof e.url === 'string' && e.url) || `${BASE}/?${e.id_fiche}`
      const img = e.imagebf_image ? `${BASE}/files/${e.imagebf_image}` : null
      events.push({
        source: SRC,
        source_id: `colibris-${e.id_fiche ? String(e.id_fiche) : hashStr(key)}`,
        source_url: link,
        title,
        description: (descr || `${type} — groupe local Colibris`).slice(0, 500),
        organizer: 'Colibris — groupe local',
        location_name: (cleanAddr || town || 'France').slice(0, 200),
        lat: geo.lat,
        lng: geo.lng,
        starts_at: s!.iso,
        ends_at: end && end.iso > s!.iso
          ? (end.hasTime ? end.iso : new Date(new Date(end.iso).getTime() + 23 * 3600000).toISOString())
          : null,
        cost: 'Voir l’événement',
        image_url: img,
      })
    }
    return events
  },
}
