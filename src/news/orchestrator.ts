/**
 * News orchestrator — runs all RSS sources, dedupes, filters out items
 * we've already ingested. Returns fresh items ready for AI scoring.
 */
import { NEWS_SOURCES } from './rss-source'
import type { RawNewsItem, NewsSourceFetcher } from './types'

export interface NewsFetchResult {
  /** Items per source, annotated with the source's default petal. */
  fresh: Array<RawNewsItem & { _defaultPetal: string; _sourceName: string }>
  bySource: Record<string, { fetched: number; skipped: number; fresh: number }>
}

/**
 * Fetch from all sources, dedupe by source_url, exclude URLs already in
 * the provided `existingUrls` set. Items are tagged with the source's
 * defaultPetal so the scorer has a fallback if it can't infer one.
 */
export async function runNewsPipeline(
  existingUrls: Set<string>,
  sources: NewsSourceFetcher[] = NEWS_SOURCES,
): Promise<NewsFetchResult> {
  const fresh: NewsFetchResult['fresh'] = []
  const bySource: NewsFetchResult['bySource'] = {}
  const seen = new Set<string>()

  for (const source of sources) {
    const stats = { fetched: 0, skipped: 0, fresh: 0 }
    bySource[source.name] = stats

    let items: RawNewsItem[] = []
    try {
      items = await source.fetch()
    } catch (err) {
      console.warn(`[news-orchestrator] ${source.name} threw:`, (err as Error).message)
      continue
    }
    stats.fetched = items.length

    for (const item of items) {
      if (!item.source_url) continue
      if (seen.has(item.source_url)) { stats.skipped++; continue }
      seen.add(item.source_url)
      if (existingUrls.has(item.source_url)) { stats.skipped++; continue }

      fresh.push({ ...item, _defaultPetal: source.defaultPetal, _sourceName: source.name })
      stats.fresh++
    }

    console.log(
      `[news-orchestrator] ${source.name}: fetched ${stats.fetched}, skipped ${stats.skipped} dupes/seen, fresh ${stats.fresh}`,
    )
  }

  return { fresh, bySource }
}
