/**
 * Factory for building a RSS-backed news source.
 * Most of our sources (Rodale, Mongabay, Positive News, Atmos, Shareable,
 * Enlivening Edge, Resilience, Low-Tech Magazine, Regeneration International)
 * all expose standard RSS 2.0 / Atom feeds — one factory covers them all.
 */
import Parser from 'rss-parser'
import type { NewsSourceFetcher, RawNewsItem, FlowerPetalKey } from './types'

const UA = 'Mozilla/5.0 (compatible; Emerge-News/1.0; +https://emerge.terralta.org)'
const MAX_ITEMS_PER_SOURCE = 25   // cap to control scoring costs
const FETCH_TIMEOUT_MS = 20_000

interface RssSourceConfig {
  name: string                // 'rodale', 'mongabay', etc.
  displayName: string         // 'Rodale Institute' (what humans see)
  feedUrl: string             // https://.../feed/
  defaultPetal: FlowerPetalKey
  /** Skip items older than this many days (default 60) */
  maxAgeDays?: number
  /** Optional per-source item transform (fix quirks like mongabay's encoded descriptions) */
  transform?: (item: any) => Partial<RawNewsItem>
}

let _parser: Parser | null = null
function getParser(): Parser {
  if (!_parser) {
    _parser = new Parser({
      timeout: FETCH_TIMEOUT_MS,
      headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, text/xml, */*' },
      customFields: {
        item: [
          ['content:encoded', 'contentEncoded'],
          ['media:content', 'mediaContent', { keepArray: true }],
          ['media:thumbnail', 'mediaThumbnail'],
          ['dc:creator', 'dcCreator'],
        ],
      },
    })
  }
  return _parser
}

function stripHtml(s: string | undefined | null): string {
  if (!s) return ''
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function extractImageUrl(item: any): string | null {
  // 1. Explicit enclosure
  if (item.enclosure?.url && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(item.enclosure.url)) {
    return item.enclosure.url
  }
  // 2. media:content
  if (Array.isArray(item.mediaContent) && item.mediaContent.length > 0) {
    const firstMedia: any = item.mediaContent[0]
    const url = firstMedia?.$?.url || firstMedia?.url
    if (url) return url
  }
  // 3. media:thumbnail
  if (item.mediaThumbnail?.$?.url) return item.mediaThumbnail.$.url
  // 4. Extract first <img> from content:encoded or content
  const html = item.contentEncoded || item.content || item['content:encoded'] || ''
  const m = String(html).match(/<img[^>]+src=["']([^"']+)["']/i)
  return m?.[1] || null
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'unknown'
  }
}

export function buildRssSource(config: RssSourceConfig): NewsSourceFetcher {
  return {
    name: config.name,
    defaultPetal: config.defaultPetal,

    async fetch(): Promise<RawNewsItem[]> {
      let feed
      try {
        feed = await getParser().parseURL(config.feedUrl)
      } catch (err) {
        // rss-parser hides the real cause in some environments; try a
        // manual fetch + parseString as a fallback (handles redirects,
        // UA blocks, and some malformed XML better).
        try {
          const res = await fetch(config.feedUrl, {
            headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, text/xml, */*' },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const xml = await res.text()
          feed = await getParser().parseString(xml)
        } catch (err2) {
          console.warn(`[news:${config.name}] feed fetch failed:`, (err as Error).message || '(empty)', '| fallback:', (err2 as Error).message)
          return []
        }
      }

      const cutoff = Date.now() - (config.maxAgeDays ?? 60) * 86_400_000
      const out: RawNewsItem[] = []

      for (const item of (feed.items || []).slice(0, MAX_ITEMS_PER_SOURCE)) {
        if (!item.link || !item.title) continue

        const published = item.isoDate || item.pubDate
        if (!published) continue
        const publishedDate = new Date(published)
        if (!isFinite(publishedDate.getTime())) continue
        if (publishedDate.getTime() < cutoff) continue

        const summaryRaw =
          item.contentSnippet ||
          (item as any).contentEncoded ||
          item.content ||
          item.summary ||
          ''
        const summary = stripHtml(summaryRaw).slice(0, 500)

        const contentRaw = (item as any).contentEncoded || item.content || ''
        const content = stripHtml(contentRaw).slice(0, 4000) || null

        const base: RawNewsItem = {
          source_url: item.link,
          source_name: config.displayName,
          source_domain: getDomain(item.link),
          title: stripHtml(item.title),
          summary,
          content,
          author: (item as any).dcCreator || item.creator || null,
          image_url: extractImageUrl(item),
          published_at: publishedDate.toISOString(),
          language: 'en',
        }

        const merged = config.transform ? { ...base, ...config.transform(item) } : base
        if (!merged.title) continue

        out.push(merged)
      }

      return out
    },
  }
}

/** Convenience: build and export all 9 news sources */
export const NEWS_SOURCES: NewsSourceFetcher[] = [
  buildRssSource({
    name: 'rodale',
    displayName: 'Rodale Institute',
    feedUrl: 'https://rodaleinstitute.org/feed/',
    defaultPetal: 'land-nature',
  }),
  buildRssSource({
    name: 'mongabay',
    displayName: 'Mongabay',
    feedUrl: 'https://news.mongabay.com/feed/',
    defaultPetal: 'land-nature',
  }),
  buildRssSource({
    name: 'regeneration-international',
    displayName: 'Regeneration International',
    feedUrl: 'https://regenerationinternational.org/feed/',
    defaultPetal: 'land-nature',
  }),
  buildRssSource({
    name: 'low-tech-magazine',
    displayName: 'Low-Tech Magazine',
    feedUrl: 'https://solar.lowtechmagazine.com/feeds/all-en.atom.xml',
    defaultPetal: 'building-technology',
    maxAgeDays: 365, // publishes infrequently, let older pieces through
  }),
  buildRssSource({
    name: 'resilience',
    displayName: 'Resilience.org',
    feedUrl: 'https://www.resilience.org/feed/',
    defaultPetal: 'tools-materials', // circular, repair, appropriate tech, broad coverage
  }),
  buildRssSource({
    name: 'positive-news',
    displayName: 'Positive News',
    feedUrl: 'https://www.positive.news/feed/',
    defaultPetal: 'health-wellbeing',
  }),
  buildRssSource({
    name: 'atmos',
    displayName: 'Atmos',
    feedUrl: 'https://atmos.earth/feed/',
    defaultPetal: 'education-culture',
  }),
  buildRssSource({
    name: 'shareable',
    displayName: 'Shareable',
    feedUrl: 'https://www.shareable.net/feed/',
    defaultPetal: 'finance-economics', // commons, co-ops, sharing economy
  }),
  buildRssSource({
    name: 'enlivening-edge',
    displayName: 'Enlivening Edge',
    feedUrl: 'https://enliveningedge.org/feed/',
    defaultPetal: 'governance-community',
  }),
]
