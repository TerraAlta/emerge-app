/**
 * Telegram source — two modes:
 *
 * MODE 1: PUBLIC CHANNEL SCRAPER (no token needed)
 * Scrapes t.me/s/<handle> — the public web preview of any public channel.
 * Extracts messages, runs them through date/location regex to find events.
 *
 * MODE 2: BOT POLLING (needs TELEGRAM_BOT_TOKEN)
 * Reads /quest structured messages from groups where the bot is added.
 *
 * Both modes produce RawEvent[] for the pipeline.
 */
import type { RawEvent, SourceFetcher } from './types'
import { stripHtml, hashStr } from './utils'
import { TELEGRAM_CHANNELS, type TelegramChannel } from './telegram-channels'

// ─── Date patterns across languages ───
const DATE_PATTERNS = [
  // ISO: 2026-03-22 10:00
  /(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2})[:.h](\d{2}))?/,
  // EU: 22/03/2026, 22.03.2026
  /(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2})[:.h](\d{2}))?/,
  // English: March 22, 2026
  /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i,
  // German: 22\. März 2026
  /(\d{1,2})\.\s*(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i,
  // French: 22 mars 2026
  /(\d{1,2})\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/i,
  // Spanish: 22 de marzo de 2026
  /(\d{1,2})\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})/i,
  // Italian: 22 marzo 2026
  /(\d{1,2})\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i,
  // Portuguese: 22 de março de 2026
  /(\d{1,2})\s+de\s+(?:janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/i,
  // Dutch: 22 maart 2026
  /(\d{1,2})\s+(?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(\d{4})/i,
]

const LOCATION_SIGNALS = [
  /📍\s*(.+)/,
  /📌\s*(.+)/,
  /(?:location|where|lieu|ort|lugar|luogo|local|locatie|onde)[:\s]+(.+)/i,
]

const EVENT_KEYWORDS = /workshop|event|gathering|meeting|harvest|volunteer|circle|walk|festival|course|open day|skill ?share|repair|swap|planting|seed|ferment|compost|forag|pruni|graft|wassail|drum|choir|sing|danc|theatre|playback|birth|doula|kitchen|cook|feast|orchard|gleaning|apple|cider|bioblitz|clean.?up|restor/i

// Track last processed bot update
let lastUpdateId = 0

export const telegram: SourceFetcher = {
  name: 'telegram',

  async fetch(opts) {
    const events: RawEvent[] = []

    // MODE 1: Scrape public channels
    const channelEvents = await scrapePublicChannels(opts)
    events.push(...channelEvents)

    // MODE 2: Bot polling (if token available)
    const botEvents = await pollBotUpdates(opts)
    events.push(...botEvents)

    console.log(`[telegram] ${events.length} events (${channelEvents.length} from channels, ${botEvents.length} from bot)`)
    return events
  },
}

// ─── MODE 1: Public Channel Scraper ───

async function scrapePublicChannels(
  opts: { lat: number; lng: number; radiusKm: number }
): Promise<RawEvent[]> {
  const allEvents: RawEvent[] = []

  // Process channels in batches of 5 to avoid rate limiting
  for (let i = 0; i < TELEGRAM_CHANNELS.length; i += 5) {
    const batch = TELEGRAM_CHANNELS.slice(i, i + 5)
    const results = await Promise.allSettled(
      batch.map(ch => scrapeChannel(ch))
    )
    for (const r of results) {
      if (r.status === 'fulfilled') allEvents.push(...r.value)
    }
    // Small delay between batches
    if (i + 5 < TELEGRAM_CHANNELS.length) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  return allEvents
}

async function scrapeChannel(channel: TelegramChannel): Promise<RawEvent[]> {
  const url = `https://t.me/s/${channel.handle}`
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Emerge/1.0)',
        'Accept': 'text/html',
      },
    })
    if (!res.ok) {
      console.warn(`[telegram] ${channel.handle}: HTTP ${res.status}`)
      return []
    }

    const html = await res.text()
    return extractEventsFromHtml(html, channel)
  } catch (err) {
    console.warn(`[telegram] ${channel.handle}: ${(err as Error).message}`)
    return []
  }
}

function extractEventsFromHtml(html: string, channel: TelegramChannel): RawEvent[] {
  const events: RawEvent[] = []

  // Telegram channel preview uses multiple possible HTML structures:
  // 1. class="tgme_widget_message_text" — standard channel preview
  // 2. class="tgme_widget_message_bubble" wrapping text
  // 3. Inline text with timestamps like "Name, [HH:MM]"
  const msgPatterns = [
    /class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g,
    /class="tgme_widget_message_bubble"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g,
    /class="js-message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g,
  ]
  const datePattern = /datetime="([^"]+)"/g

  // Collect all messages with their dates
  const messages: { text: string; date: string }[] = []

  // Try each pattern until we find messages
  let msgTexts: string[] = []
  for (const pattern of msgPatterns) {
    msgTexts = [...html.matchAll(pattern)].map(m => stripHtml(m[1]).trim())
    if (msgTexts.length > 0) break
  }

  // Fallback: extract text between timestamp patterns like "Name, [16:11]"
  if (msgTexts.length === 0) {
    const blocks = html.split(/\w+,\s*\[\d{1,2}:\d{2}\]/).filter(b => {
      const clean = stripHtml(b).trim()
      return clean.length > 30 && clean.length < 2000
    })
    msgTexts = blocks.map(b => stripHtml(b).trim())
  }

  const msgDates = [...html.matchAll(datePattern)].map(m => m[1])

  for (let i = 0; i < msgTexts.length; i++) {
    if (msgTexts[i].length > 20) {
      messages.push({
        text: msgTexts[i],
        date: msgDates[i] || new Date().toISOString(),
      })
    }
  }

  // Filter for messages that look like event announcements
  for (const msg of messages) {
    if (!EVENT_KEYWORDS.test(msg.text)) continue

    // Must contain a date reference (future event, not just posted date)
    let eventDate: string | null = null
    for (const pattern of DATE_PATTERNS) {
      const match = msg.text.match(pattern)
      if (match) {
        try {
          // Try to parse — the regex groups vary per pattern
          const parsed = new Date(match[0].replace(/\./g, '/'))
          if (!isNaN(parsed.getTime()) && parsed > new Date()) {
            eventDate = parsed.toISOString()
          }
        } catch { /* skip */ }
        break
      }
    }
    if (!eventDate) continue

    // Extract location if present
    let locationName = channel.name
    for (const locPattern of LOCATION_SIGNALS) {
      const locMatch = msg.text.match(locPattern)
      if (locMatch) {
        locationName = locMatch[1].trim().slice(0, 100)
        break
      }
    }

    // Extract title — first line or first sentence
    const firstLine = msg.text.split('\n')[0].slice(0, 120)
    const title = firstLine.length > 10 ? firstLine : msg.text.slice(0, 120)

    events.push({
      source: 'telegram',
      source_id: `tg-${channel.handle}-${hashStr(msg.text.slice(0, 100))}`,
      source_url: `https://t.me/s/${channel.handle}`,
      title,
      description: msg.text.slice(0, 500),
      organizer: channel.name,
      location_name: locationName,
      lat: channel.defaultLat,
      lng: channel.defaultLng,
      starts_at: eventDate,
      cost: msg.text.toLowerCase().includes('free') || msg.text.toLowerCase().includes('gratis')
        || msg.text.toLowerCase().includes('gratuit') || msg.text.toLowerCase().includes('kostenlos')
        ? 'Free' : 'Unknown',
    })
  }

  return events
}

// ─── MODE 2: Bot Polling ───

async function pollBotUpdates(
  opts: { lat: number; lng: number; radiusKm: number }
): Promise<RawEvent[]> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return []

  try {
    const url = `https://api.telegram.org/bot${token}/getUpdates?` +
      `offset=${lastUpdateId + 1}&limit=100&timeout=5&allowed_updates=["message"]`

    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return []

    const data = await res.json() as { ok: boolean; result?: TgUpdate[] }
    if (!data.ok || !data.result) return []

    const updates = data.result
    if (updates.length > 0) {
      lastUpdateId = updates[updates.length - 1].update_id
    }

    // Process both /quest commands AND natural event messages
    const events: RawEvent[] = []

    for (const u of updates) {
      const msg = u.message
      if (!msg?.text) continue

      if (msg.text.startsWith('/quest')) {
        const event = parseQuestCommand(msg, opts.lat, opts.lng)
        if (event) events.push(event)
      } else if (EVENT_KEYWORDS.test(msg.text)) {
        // Natural language event — check for date
        const event = parseNaturalEvent(msg, opts.lat, opts.lng)
        if (event) events.push(event)
      }
    }

    return events
  } catch (err) {
    console.warn('[telegram] Bot polling failed:', (err as Error).message)
    return []
  }
}

interface TgUpdate {
  update_id: number
  message?: {
    message_id: number
    chat: { id: number; title?: string; type: string }
    from?: { id: number; first_name: string; username?: string }
    text?: string
    date: number
    location?: { latitude: number; longitude: number }
  }
}

function parseQuestCommand(
  msg: NonNullable<TgUpdate['message']>,
  defaultLat: number, defaultLng: number
): RawEvent | null {
  const text = msg.text ?? ''
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const title = lines[0]?.replace(/^\/quest\s*/i, '').trim()
  if (!title || title.length < 3) return null

  let locationName = '', dateStr = '', description = '', cost = 'Free'
  let lat = defaultLat, lng = defaultLng

  for (const line of lines.slice(1)) {
    const lo = line.toLowerCase()
    if (/^[📍📌]/.test(line) || lo.startsWith('location:') || lo.startsWith('where:'))
      locationName = line.replace(/^[📍📌\s]*/, '').replace(/^(?:location|where):\s*/i, '').trim()
    else if (/^[📅📆]/.test(line) || lo.startsWith('date:') || lo.startsWith('when:'))
      dateStr = line.replace(/^[📅📆\s]*/, '').replace(/^(?:date|when):\s*/i, '').trim()
    else if (/^[📝]/.test(line) || lo.startsWith('desc:') || lo.startsWith('info:'))
      description = line.replace(/^[📝\s]*/, '').replace(/^(?:desc|info|details):\s*/i, '').trim()
    else if (/^[💰]/.test(line) || lo.startsWith('cost:') || lo.startsWith('price:'))
      cost = line.replace(/^[💰\s]*/, '').replace(/^(?:cost|price):\s*/i, '').trim() || 'Free'
    else if (lo.startsWith('coords:') || lo.startsWith('gps:')) {
      const c = line.replace(/^(?:coords|gps):\s*/i, '').split(',')
      if (c.length === 2) { lat = parseFloat(c[0]) || defaultLat; lng = parseFloat(c[1]) || defaultLng }
    }
    else if (!description) description = line
  }

  if (msg.location) { lat = msg.location.latitude; lng = msg.location.longitude }

  let startsAt: string
  try { const d = new Date(dateStr); startsAt = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString() }
  catch { startsAt = new Date().toISOString() }

  return {
    source: 'telegram', source_id: `tg-${msg.chat.id}-${msg.message_id}`,
    source_url: null, title,
    description: description || `Quest from ${msg.from?.first_name ?? 'someone'} via ${msg.chat.title ?? 'Telegram'}`,
    organizer: `${msg.from?.first_name ?? 'Community'}${msg.from?.username ? ` (@${msg.from.username})` : ''}`,
    location_name: locationName || 'Location TBD',
    lat, lng, starts_at: startsAt, cost,
  }
}

function parseNaturalEvent(
  msg: NonNullable<TgUpdate['message']>,
  defaultLat: number, defaultLng: number
): RawEvent | null {
  const text = msg.text ?? ''

  // Must have a future date
  let eventDate: string | null = null
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      try {
        const parsed = new Date(match[0].replace(/\./g, '/'))
        if (!isNaN(parsed.getTime()) && parsed > new Date()) eventDate = parsed.toISOString()
      } catch { /* skip */ }
      break
    }
  }
  if (!eventDate) return null

  let locationName = msg.chat.title ?? 'Telegram'
  for (const p of LOCATION_SIGNALS) {
    const m = text.match(p)
    if (m) { locationName = m[1].trim().slice(0, 100); break }
  }

  const title = text.split('\n')[0].slice(0, 120)

  return {
    source: 'telegram', source_id: `tg-${msg.chat.id}-${msg.message_id}`,
    source_url: null, title,
    description: text.slice(0, 500),
    organizer: msg.chat.title ?? msg.from?.first_name ?? 'Telegram community',
    location_name: locationName,
    lat: msg.location?.latitude ?? defaultLat,
    lng: msg.location?.longitude ?? defaultLng,
    starts_at: eventDate, cost: 'Unknown',
  }
}
