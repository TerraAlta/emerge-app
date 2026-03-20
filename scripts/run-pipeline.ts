/**
 * Run the full Emerge pipeline — scrape all sources globally,
 * geocode, score with AI, insert into Supabase.
 *
 * Usage: npx tsx scripts/run-pipeline.ts [--dry-run]
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { runPipeline } from '../src/pipeline/orchestrator'

// Load env
const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIndex = trimmed.indexOf('=')
  if (eqIndex === -1) continue
  const key = trimmed.slice(0, eqIndex)
  const val = trimmed.slice(eqIndex + 1)
  if (!process.env[key]) process.env[key] = val
}

const dryRun = process.argv.includes('--dry-run')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  console.log(`\n🌱 Emerge Pipeline — Full Global Scrape`)
  console.log(`Mode: ${dryRun ? 'DRY RUN (no DB writes)' : 'LIVE (writing to Supabase)'}`)
  console.log('─'.repeat(60))

  const startTime = Date.now()
  const results = await runPipeline({
    scoreThreshold: 50,
    dryRun,
    supabase: dryRun ? undefined : supabase,
  })

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  // Summary
  let totalFetched = 0, totalScored = 0, totalInserted = 0, totalFiltered = 0, totalErrors = 0
  const countryEvents: Record<string, number> = {}

  console.log('\n── Source Results ──')
  for (const r of results) {
    totalFetched += r.fetched
    totalScored += r.scored
    totalInserted += r.inserted
    totalFiltered += r.filtered
    totalErrors += r.errors

    if (r.fetched > 0 || r.errors > 0) {
      console.log(`  ${r.source}: ${r.fetched} fetched, ${r.inserted} inserted, ${r.filtered} filtered, ${r.errors} errors`)
    }

    // Try to group by country from source name
    const match = r.source.match(/-(pt|de|nl|uk|fr|be|es|it|ch|mt|usa|ca|na|eu|global)$/i)
    const country = match ? match[1].toUpperCase() : 'OTHER'
    countryEvents[country] = (countryEvents[country] || 0) + r.inserted
  }

  console.log('\n── Country Breakdown ──')
  for (const [country, count] of Object.entries(countryEvents).sort((a, b) => b[1] - a[1])) {
    if (count > 0) console.log(`  ${country}: ${count} events`)
  }

  console.log(`\n── Totals ──`)
  console.log(`  Sources:  ${results.length}`)
  console.log(`  Fetched:  ${totalFetched}`)
  console.log(`  Scored:   ${totalScored}`)
  console.log(`  Inserted: ${totalInserted}`)
  console.log(`  Filtered: ${totalFiltered} (below score threshold)`)
  console.log(`  Errors:   ${totalErrors}`)
  console.log(`  Time:     ${elapsed}s`)
  console.log()
}

main().catch(console.error)
