/**
 * URL pre-ingest helper for Guild flows.
 *
 * Before an AI interview (practitioner / client / pitch), users can paste
 * up to 3 URLs (personal site, existing project page, portfolio). We fetch
 * each, strip HTML, truncate, and return a single blob of plain text
 * tagged per URL. The AI then reads this as context before its first
 * question, so the interview can be shorter and more focused.
 *
 * Safety:
 * - Only http(s) schemes
 * - Blocks localhost / RFC1918 / link-local / metadata-service IPs
 * - 50KB per URL, 8s timeout
 * - Max 3 URLs per call
 * - No JavaScript execution (plain fetch, HTML only)
 */

const MAX_URLS = 3
const MAX_BYTES_PER_URL = 50_000
const FETCH_TIMEOUT_MS = 8_000
const TOTAL_TEXT_CAP = 20_000 // hard cap on combined text handed to the AI

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /metadata\.google\.internal/i,
  /169\.254\.169\.254/, // AWS/GCP metadata IP
]

export interface UrlIngestResult {
  url: string
  ok: boolean
  error?: string
  title?: string
  text?: string
  bytes?: number
}

function isBlockedHost(hostname: string): boolean {
  return BLOCKED_HOST_PATTERNS.some(p => p.test(hostname))
}

function stripHtmlToText(html: string): { title: string | null; text: string } {
  // Extract <title>
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : null

  // Drop script, style, noscript, and meta blocks entirely
  let stripped = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')

  // Remove all tags
  stripped = stripped.replace(/<[^>]+>/g, ' ')

  // Collapse whitespace
  stripped = stripped.replace(/\s+/g, ' ').trim()

  return { title, text: decodeEntities(stripped) }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&(?:[a-z]+|#[0-9]+);/gi, ' ')
}

async function fetchOne(raw: string): Promise<UrlIngestResult> {
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    return { url: raw, ok: false, error: 'Invalid URL' }
  }
  if (!/^https?:$/i.test(parsed.protocol)) {
    return { url: raw, ok: false, error: 'Only http(s) URLs are supported' }
  }
  if (isBlockedHost(parsed.hostname)) {
    return { url: raw, ok: false, error: 'Host not allowed' }
  }

  let res: Response
  try {
    res = await fetch(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Emerge-Guild/1.0; +https://emerge.terralta.org)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en,pt,es,fr,it,de;q=0.7',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (err: any) {
    return { url: raw, ok: false, error: err?.message?.includes('timeout') ? 'Timed out' : 'Fetch failed' }
  }

  if (!res.ok) {
    return { url: raw, ok: false, error: `HTTP ${res.status}` }
  }

  const contentType = res.headers.get('content-type') || ''
  if (!/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) {
    return { url: raw, ok: false, error: `Unsupported content-type (${contentType})` }
  }

  // Cap at MAX_BYTES_PER_URL
  const reader = res.body?.getReader()
  if (!reader) return { url: raw, ok: false, error: 'No body' }
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (total < MAX_BYTES_PER_URL) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        total += value.byteLength
      }
    }
    await reader.cancel().catch(() => {})
  } catch (err: any) {
    return { url: raw, ok: false, error: 'Read failed' }
  }

  const buf = Buffer.concat(chunks.map(c => Buffer.from(c)))
  const html = buf.toString('utf-8', 0, Math.min(buf.length, MAX_BYTES_PER_URL))
  const { title, text } = stripHtmlToText(html)

  return {
    url: parsed.toString(),
    ok: true,
    title: title || undefined,
    text: text.slice(0, MAX_BYTES_PER_URL),
    bytes: total,
  }
}

/**
 * Fetch up to 3 URLs in parallel, strip HTML, return per-URL results.
 * Also returns a single combined text blob suitable for injecting into an
 * AI system prompt, capped at TOTAL_TEXT_CAP chars.
 */
export async function ingestUrls(urls: string[]): Promise<{
  results: UrlIngestResult[]
  combinedText: string
}> {
  const list = (urls || []).filter(u => typeof u === 'string' && u.trim().length > 0).slice(0, MAX_URLS)
  if (list.length === 0) return { results: [], combinedText: '' }

  const results = await Promise.all(list.map(fetchOne))

  // Build a single text blob: per-source block with the title and content.
  const parts: string[] = []
  let budget = TOTAL_TEXT_CAP
  for (const r of results) {
    if (!r.ok || !r.text) continue
    const header = `--- ${r.title ? r.title + ' ' : ''}(${r.url}) ---\n`
    const available = Math.max(0, budget - header.length - 4)
    if (available <= 0) break
    const body = r.text.slice(0, available)
    parts.push(header + body)
    budget -= header.length + body.length + 4
    if (budget <= 0) break
  }

  return { results, combinedText: parts.join('\n\n') }
}
