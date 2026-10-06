/**
 * Fête des Possibles — fete-des-possibles.org (Belgian rendez-vous only)
 * Annual festival of citizen alternatives (mid-September → mid-October, run
 * by the Collectif pour une Transition Citoyenne). Most rendez-vous are in
 * France; a handful each year are in Wallonia/Brussels.
 *
 * Rendez-vous are a WordPress custom post type exposed on the public REST
 * API (/wp-json/wp/v2/rdv) with their ACF fields: name, start/end date
 * (YYYYMMDD), start/end time, street, town, postcode, country, lat/lng,
 * online flag, organiser. ACF fields cannot be filtered server-side, so we
 * page through the newest rendez-vous (100 per request, newest first) until
 * they were published more than ~10 months ago, and keep pays_rdv =
 * Belgique/Belgium, in person, upcoming. ≤ 10 requests.
 *
 * (The old fetedespossibles.be domain does not resolve.)
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml } from './utils'
import { getJson, parisIso, geocodeFrFirst } from './fr-common'

const SRC = 'fete-possibles-be'
const API = 'https://fete-des-possibles.org/wp-json/wp/v2/rdv'
const MAX_PAGES = 10
const MAX_EVENTS = 200

function toIso(ymd: string | null | undefined, hms: string | null | undefined, defHour: number): string | null {
  const d = String(ymd ?? '').match(/^(\d{4})(\d{2})(\d{2})$/)
  if (!d) return null
  const t = String(hms ?? '').match(/^(\d{1,2}):(\d{2})/)
  return parisIso(+d[1], +d[2], +d[3], t ? +t[1] : defHour, t ? +t[2] : 0)
}

export const fetePossiblesBe: SourceFetcher = {
  name: SRC,
  async fetch() {
    const now = Date.now()
    const oldest = now - 300 * 86400000
    const events: RawEvent[] = []
    const seen = new Set<number>()

    for (let page = 1; page <= MAX_PAGES; page++) {
      const rows = await getJson<any[]>(`${API}?per_page=100&page=${page}&_fields=id,date,link,acf`, 30000)
      if (!Array.isArray(rows) || !rows.length) break
      for (const r of rows) {
        const a = r.acf ?? {}
        if (seen.has(r.id) || !/^belg/i.test(String(a.pays_rdv ?? '').trim())) continue
        seen.add(r.id)
        if (a.rdv_en_ligne) continue
        const start = toIso(a.datedebut_rdv, a.heure_debut, 10)
        if (!start || Date.parse(start) < now) continue
        let end = toIso(a.plusieurs_jours_rdv && a.datefin_rdv ? a.datefin_rdv : a.datedebut_rdv, a.horaire_fin, -1)
        if (!a.horaire_fin && !(a.plusieurs_jours_rdv && a.datefin_rdv)) end = null
        if (end && end <= start) end = null

        const town = [a.cp_rdv, a.ville_rdv].filter(Boolean).join(' ')
        const street = String(a.lieu_rdv_admin ?? '').trim()
        let lat = parseFloat(a.lieu_rdv_lat)
        let lng = parseFloat(a.lieu_rdv_lng)
        if (!(lat > 49.3 && lat < 51.6 && lng > 2.4 && lng < 6.5)) {
          const geo = await geocodeFrFirst([`${street}, ${town}, Belgique`, `${town}, Belgique`])
          if (!geo) continue
          lat = geo.lat; lng = geo.lng
        }

        const title = stripHtml(String(a.nom_rdv || r.title?.rendered || '')).trim()
        if (!title) continue
        const desc = stripHtml(String(a.resume_rdv || a.desciptif_rdv || '')).slice(0, 600)
        events.push({
          source: SRC,
          source_id: `fdp-be-${r.id}`,
          source_url: r.link || null,
          title,
          description: desc || 'Rendez-vous de la Fête des Possibles.',
          organizer: stripHtml(String(a.structure_orga || 'Fête des Possibles')),
          location_name: [String(a.complement_adresse ?? '').trim(), street, town].filter(Boolean).join(', '),
          lat, lng,
          starts_at: start,
          ends_at: end,
          cost: 'Voir site',
        })
        if (events.length >= MAX_EVENTS) return events
      }
      const last = Date.parse(rows[rows.length - 1]?.date ?? '')
      if (rows.length < 100 || !(last > oldest)) break
    }
    return events
  },
}
