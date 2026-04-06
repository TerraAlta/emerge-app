import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import * as cheerio from 'cheerio'
import { isCreditError, notifyPipelineFailure } from '@/lib/pipeline-monitor'
import { buildScoringPrompt } from '@/lib/scoring-prompt'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Simple in-memory rate limiter: max 10 submissions per IP per hour
const rateLimitMap = new Map<string, { count: number; reset: number }>()
function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.reset) {
    rateLimitMap.set(ip, { count: 1, reset: now + 3600_000 })
    return true
  }
  if (entry.count >= 10) return false
  entry.count++
  return true
}

let _ai: Anthropic | null = null
function getAI() {
  if (!_ai) _ai = new Anthropic()
  return _ai
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

/** Fetch a URL and extract structured event data using cheerio + JSON-LD */
async function extractEventFromUrl(url: string) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`)

  const html = await res.text()
  const $ = cheerio.load(html)

  // Try JSON-LD first
  const jsonLd = extractJsonLdEvent($)
  if (jsonLd) return jsonLd

  // Fallback: extract from meta tags and page content
  return extractFromMeta($, url)
}

function extractJsonLdEvent($: cheerio.CheerioAPI) {
  const scripts = $('script[type="application/ld+json"]')
  for (let i = 0; i < scripts.length; i++) {
    try {
      const data = JSON.parse($(scripts[i]).html() ?? '')
      const items = findEvents(data)
      if (items.length > 0) {
        const ev = items[0]
        const loc = ev.location ?? {}
        const geo = loc.geo ?? {}
        return {
          title: ev.name ?? '',
          description: (ev.description ?? '').slice(0, 1000),
          starts_at: ev.startDate ? new Date(ev.startDate).toISOString() : null,
          ends_at: ev.endDate ? new Date(ev.endDate).toISOString() : null,
          location_name: loc.name ?? loc.address?.addressLocality ?? '',
          lat: parseFloat(geo.latitude ?? '0'),
          lng: parseFloat(geo.longitude ?? '0'),
          organizer: ev.organizer?.name ?? '',
          image_url: typeof ev.image === 'string' ? ev.image : ev.image?.url ?? null,
          cost: ev.isAccessibleForFree ? 'Free' : (ev.offers?.price ? `${ev.offers.priceCurrency ?? ''}${ev.offers.price}` : ''),
        }
      }
    } catch { /* skip */ }
  }
  return null
}

function findEvents(data: any): any[] {
  if (!data || typeof data !== 'object') return []
  if (data['@type'] === 'Event') return [data]
  if (data['@type'] === 'ItemList' && Array.isArray(data.itemListElement)) {
    return data.itemListElement.map((li: any) => li.item ?? li).filter((i: any) => i['@type'] === 'Event')
  }
  if (Array.isArray(data)) return data.flatMap(findEvents)
  if (data['@graph']) return findEvents(data['@graph'])
  return []
}

function extractFromMeta($: cheerio.CheerioAPI, url: string) {
  const og = (prop: string) => $(`meta[property="og:${prop}"]`).attr('content') ?? ''
  const title = og('title') || $('title').text() || $('h1').first().text()
  const description = og('description') || $('meta[name="description"]').attr('content') || ''
  const image = og('image') || null

  // Try to find date from common patterns
  const dateEl = $('time[datetime]').first().attr('datetime')
  const starts_at = dateEl ? new Date(dateEl).toISOString() : null

  // Try to find location
  const location_name =
    $('[class*="location"], [class*="venue"], [itemprop="location"]').first().text().trim().slice(0, 200) || ''

  return {
    title: title.trim().slice(0, 200),
    description: description.trim().slice(0, 1000),
    starts_at,
    ends_at: null as string | null,
    location_name,
    lat: 0,
    lng: 0,
    organizer: og('site_name') || new URL(url).hostname.replace(/^www\./, ''),
    image_url: image,
    cost: '',
  }
}

/** Geocode an address via Nominatim */
async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address) return null
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'Emerge-Pipeline/1.0' } }
    )
    const data = await res.json()
    if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch { /* skip */ }
  return null
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Too many submissions. Try again in an hour.' }, { status: 429 })
    }

    const { url } = await request.json()
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Validate URL — only allow http/https, block private IPs
    let parsed: URL
    try { parsed = new URL(url) } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'Only HTTP/HTTPS URLs are allowed' }, { status: 400 })
    }
    const host = parsed.hostname.toLowerCase()
    if (host === 'localhost' || host.startsWith('127.') || host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('172.') || host === '0.0.0.0' || host.endsWith('.local') || host === '[::1]') {
      return NextResponse.json({ error: 'Private/local URLs are not allowed' }, { status: 400 })
    }

    // 1. Extract event data
    const event = await extractEventFromUrl(url)
    if (!event.title) {
      return NextResponse.json({ error: 'Could not find event details on this page' }, { status: 422 })
    }

    // 2. Geocode if missing coordinates
    if (event.lat === 0 && event.lng === 0 && event.location_name) {
      const geo = await geocode(event.location_name)
      if (geo) { event.lat = geo.lat; event.lng = geo.lng }
    }

    // 3. AI scoring with Haiku
    let aiResult
    try {
      aiResult = await getAI().messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: buildScoringPrompt(),
        messages: [{
          role: 'user',
          content: `Event: "${event.title}"\nDescription: "${event.description}"\nLocation: "${event.location_name}"\nOrganiser: "${event.organizer}"`,
        }],
      })
    } catch (err) {
      if (isCreditError(err)) {
        await notifyPipelineFailure('credits_exhausted', { source: 'submit-event', event: event.title })
        return NextResponse.json({ error: 'Scoring temporarily unavailable — please try again later' }, { status: 503 })
      }
      throw err
    }

    const aiText = aiResult.content[0].type === 'text' ? aiResult.content[0].text : ''
    const cleaned = aiText.replace(/```json\s*|```\s*/g, '').trim()
    const scored = JSON.parse(cleaned)
    const score = Math.max(0, Math.min(100, Math.round(scored.score)))

    // 4. Decision
    const approved = score >= 75
    const queued = score >= 40 && score < 75
    const rejected = score < 40

    // 5. Insert if approved
    if (approved && event.starts_at) {
      const sourceName = event.organizer || parsed.hostname.replace(/^www\./, '')

      const { error: dbError } = await supabase.from('quests').upsert(
        {
          title: event.title,
          description: event.description,
          category: scored.category ?? 'community',
          geog: event.lat !== 0 ? `POINT(${event.lng} ${event.lat})` : null,
          address: event.location_name || 'See event page',
          starts_at: event.starts_at,
          ends_at: event.ends_at,
          source_url: url,
          source_name: sourceName,
          ai_score: score,
          ai_reasoning: scored.reason,
          image_url: event.image_url,
          max_participants: null,
        },
        { onConflict: 'title,starts_at' }
      )

      if (dbError) {
        console.error('[submit-event] DB error:', dbError.message)
      }
    }

    return NextResponse.json({
      approved,
      queued,
      rejected,
      score,
      reason: scored.reason,
      title: event.title,
    })
  } catch (err) {
    console.error('[submit-event]', err)
    return NextResponse.json({ error: 'Failed to process event' }, { status: 500 })
  }
}
