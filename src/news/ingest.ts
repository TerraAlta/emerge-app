/**
 * News ingestion: orchestrate → dedup against DB → score → insert.
 * Returns per-source stats for cron logging.
 */
import { createClient } from '@supabase/supabase-js'
import { runNewsPipeline } from './orchestrator'
import { scoreNews } from './score-news'
import { costTracker, CostCapExceeded, NEWS_CRON_CAP_USD } from '@/pipeline/cost-cap'
import type { FlowerPetalKey } from './types'

const MIN_PUBLISH_SCORE = 50  // below this we still store (low ai_score) for analytics but RLS hides them
const SCORING_CONCURRENCY = 3 // keep modest to respect Haiku rate limits

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export interface NewsIngestStats {
  fetched: number
  alreadyIngested: number
  scored: number
  published: number   // ai_score >= 50
  filtered: number    // scored but below threshold
  errors: number
  byPetal: Record<FlowerPetalKey, number>
  costUsd: number       // real Haiku spend for this run
  costCapped: boolean   // true if the run stopped early on the budget cap
}

export async function ingestNews(): Promise<NewsIngestStats> {
  const supabase = getServiceClient()

  // Warm Vercel instances are reused between days — start every run at zero
  // or the cap trips permanently. See CostTracker.reset().
  costTracker.reset(NEWS_CRON_CAP_USD)
  const stats: NewsIngestStats = {
    fetched: 0,
    alreadyIngested: 0,
    scored: 0,
    published: 0,
    filtered: 0,
    errors: 0,
    byPetal: {
      'land-nature': 0,
      'building-technology': 0,
      'tools-materials': 0,
      'health-wellbeing': 0,
      'education-culture': 0,
      'finance-economics': 0,
      'governance-community': 0,
    },
    costUsd: 0,
    costCapped: false,
  }

  // 1. Pull URLs already in DB (last 180 days) so we don't re-score old items
  const { data: existing } = await supabase
    .from('news_items')
    .select('source_url')
    .gte('created_at', new Date(Date.now() - 180 * 86400_000).toISOString())
  const existingUrls = new Set((existing ?? []).map(r => r.source_url))
  stats.alreadyIngested = existingUrls.size

  // 2. Fetch from all RSS sources, dedup, strip seen
  const { fresh, bySource } = await runNewsPipeline(existingUrls)
  stats.fetched = fresh.length

  for (const name of Object.keys(bySource)) {
    console.log(`[news-ingest] ${name}: ${bySource[name].fresh} fresh of ${bySource[name].fetched}`)
  }

  // 3. Score in small concurrent batches
  const queue = [...fresh]
  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item) break
      try {
        const scored = await scoreNews({
          title: item.title,
          summary: item.summary || item.content || '',
          source_name: item.source_name,
          defaultPetal: item._defaultPetal as FlowerPetalKey,
        })
        if (!scored) { stats.errors++; continue }
        stats.scored++

        // 4. Insert into DB (upsert by unique source_url)
        const { error } = await supabase.from('news_items').upsert({
          title: item.title.slice(0, 500),
          summary: item.summary.slice(0, 2000),
          content: item.content ? item.content.slice(0, 10000) : null,
          source_url: item.source_url,
          source_name: item.source_name,
          source_domain: item.source_domain,
          author: item.author || null,
          image_url: item.image_url || null,
          published_at: item.published_at,
          petal: scored.petal,
          ai_score: scored.ai_score,
          ai_reasoning: scored.ai_reasoning,
          language: item.language || 'en',
        }, { onConflict: 'source_url' })

        if (error) { console.warn(`[news-ingest] insert fail: ${error.message}`); stats.errors++; continue }
        if (scored.ai_score >= MIN_PUBLISH_SCORE) {
          stats.published++
          stats.byPetal[scored.petal]++
        } else {
          stats.filtered++
        }
      } catch (err) {
        // The budget cap is a hard stop, never an "error" to count and shrug at.
        if (err instanceof CostCapExceeded) throw err
        console.warn(`[news-ingest] worker error:`, (err as Error).message)
        stats.errors++
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: SCORING_CONCURRENCY }, () => worker()))
  } catch (err) {
    if (!(err instanceof CostCapExceeded)) throw err
    stats.costCapped = true
    queue.length = 0  // stop the sibling workers
    console.warn(`[news-ingest] ${err.message} — stopping this run early.`)
  }

  stats.costUsd = Number(costTracker.totalUsd.toFixed(4))
  console.log(`[news-ingest] ${costTracker.summary()}`)

  return stats
}
