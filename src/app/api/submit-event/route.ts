import { NextRequest, NextResponse } from 'next/server'
import { safeFetch, BlockedUrlError } from '@/lib/safe-fetch'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import * as cheerio from 'cheerio'
import { isCreditError, notifyPipelineFailure } from '@/lib/pipeline-monitor'
import { buildScoringPrompt } from '@/lib/scoring-prompt'
import { getRequestUserId } from '@/lib/request-user'
import { sendEmail, isEmailConfigured } from '@/lib/email'
import { escapeHtml as esc } from '@/lib/html'
import { claimNotification } from '@/lib/notify-once'
import { getAppUrl } from '@/lib/app-url'

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

const MAX_SUBMISSIONS_PER_DAY = 20
/** Below this the AI's verdict stands; at or above, a person decides. */
const REVIEW_THRESHOLD = 40
function getAI() {
  if (!_ai) _ai = new Anthropic()
  return _ai
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

/** Fetch a URL and extract structured event data using cheerio + JSON-LD */
async function extractEventFromUrl(url: string) {
  // safeFetch: refuses private/internal destinations by resolved IP, per hop.
  const res = await safeFetch(url, {
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

    // Signed-in users only — the API was callable anonymously while the UI
    // asked for sign-in (2026-10-06 audit).
    const userId = await getRequestUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Please sign in to submit an event' }, { status: 401 })
    }

    // Per-account limit (the IP limiter above lives in one serverless
    // instance's memory, so it barely holds). Every scored submission is
    // recorded in quest_submissions, so this also caps AI spend per user.
    const { count: recent } = await supabase
      .from('quest_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('submitted_by', userId)
      .gte('created_at', new Date(Date.now() - 24 * 3600_000).toISOString())
    if ((recent ?? 0) >= MAX_SUBMISSIONS_PER_DAY) {
      return NextResponse.json({ error: 'You have submitted a lot of events today — please try again tomorrow.' }, { status: 429 })
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
    let event
    try {
      event = await extractEventFromUrl(url)
    } catch (err) {
      if (err instanceof BlockedUrlError) {
        return NextResponse.json({ error: 'Private/local URLs are not allowed' }, { status: 400 })
      }
      throw err
    }
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
        system: [
          {
            type: 'text',
            text: buildScoringPrompt(),
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{
          role: 'user',
          content: `Event: "${String(event.title).slice(0, 300)}"\nDescription: "${String(event.description ?? '').slice(0, 1500)}"\nLocation: "${event.location_name}"\nOrganiser: "${event.organizer}"`,
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
    const jsonStart = cleaned.indexOf('{'), jsonEnd = cleaned.lastIndexOf('}')
    const scored = JSON.parse(jsonStart >= 0 && jsonEnd > jsonStart ? cleaned.slice(jsonStart, jsonEnd + 1) : cleaned)
    const score = Math.max(0, Math.min(100, Math.round(scored.score)))

    // 4. Decision. Nothing a user submits by link goes live on the AI's word
    //    alone: a page can be written to talk the scorer into a high score, and
    //    the soul doc keeps human judgment in the loop. Clear misses are
    //    turned away; everything else waits for Pedro at /admin/submissions.
    let notSaved: string | null = null
    if (score >= REVIEW_THRESHOLD) {
      if (!event.starts_at) notSaved = "We couldn't find a date on that page, so it wasn't added."
      else if (!(event.lat || event.lng)) notSaved = "We couldn't find where it takes place, so it wasn't added."
      else {
        const { data: dup } = await supabase.from('quests').select('id').eq('source_url', url).limit(1)
        if (dup?.length) notSaved = 'This event is already on Emerge.'
      }
    }
    const queued = score >= REVIEW_THRESHOLD && !notSaved
    const rejected = score < REVIEW_THRESHOLD

    const { error: subErr } = await supabase.from('quest_submissions').insert({
      submitted_by: userId,
      url,
      title: String(event.title).slice(0, 500),
      description: event.description ?? null,
      category: scored.category ?? 'community',
      lat: event.lat || null,
      lng: event.lng || null,
      address: event.location_name || null,
      starts_at: event.starts_at || null,
      ends_at: event.ends_at || null,
      image_url: event.image_url || null,
      organizer: event.organizer || parsed.hostname.replace(/^www\./, ''),
      ai_score: score,
      ai_reasoning: scored.reason ?? null,
      status: queued ? 'pending' : 'auto_rejected',
    })
    if (subErr) {
      console.error('[submit-event] could not queue submission:', subErr.message)
      return NextResponse.json({ error: 'Something went wrong saving it — please try again later.' }, { status: 500 })
    }

    // At most one "submissions waiting" email an hour, however many arrive.
    if (queued && isEmailConfigured() && process.env.NEXT_PUBLIC_ADMIN_EMAIL &&
        await claimNotification(supabase, 'quest_submissions_waiting', '00000000-0000-0000-0000-000000000000', 1)) {
      await sendEmail({
        to: process.env.NEXT_PUBLIC_ADMIN_EMAIL,
        subject: `Event submitted to Emerge — waiting for your review`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:560px">
<p>A signed-in user submitted an event (AI score <strong>${score}/100</strong>). It's waiting for you — nothing goes live until you approve it.</p>
<p><strong>${esc(event.title)}</strong><br>${esc(event.starts_at ?? '')} · ${esc(event.location_name ?? '')}</p>
<p><a href="${getAppUrl()}/admin/submissions" style="display:inline-block;background:#C8913A;color:white;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:600;">Review submissions</a></p>
<p style="color:#888;font-size:12px">At most one of these emails an hour; any others are in the same queue.</p>
</div>`,
      }).catch(() => {})
    }

    return NextResponse.json({
      approved: false,
      notSaved,
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
