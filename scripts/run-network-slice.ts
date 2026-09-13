/**
 * One slice of the weekly network sweep (Phase 0 — the 224 curated/federated
 * sources). Designed to run on GitHub Actions, several slices in parallel, so
 * the harvest no longer depends on Pedro's iMac being awake on a Sunday.
 *
 * Usage:
 *   npx tsx scripts/run-network-slice.ts --slice 0/4 [--dry-run]
 *
 * Why slices: the full sweep takes ~5.8 hours end to end, and a GitHub Actions
 * job is killed at 6 hours. Four parallel slices bring each one to ~1.5h with
 * plenty of headroom.
 *
 * Env: reads .env.local when present (local runs); otherwise takes everything
 * from the real environment (GitHub Actions secrets). Never writes to an
 * absolute path — CI has no /Users/pedrovaldjiu.
 */
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { runPipeline, listSourceNames } from '../src/pipeline/orchestrator'
import { costTracker, CostCapExceeded } from '../src/pipeline/cost-cap'

// ── Env: .env.local locally, process.env in CI ──
const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq)
    if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1)
  }
}

// ── Args ──
const dryRun = process.argv.includes('--dry-run')
const listOnly = process.argv.includes('--list')
const sliceArg = process.argv[process.argv.indexOf('--slice') + 1] ?? '0/1'
const [idxRaw, totalRaw] = sliceArg.split('/')
const index = Number(idxRaw)
const total = Number(totalRaw)

if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1 || index < 0 || index >= total) {
  console.error(`Bad --slice "${sliceArg}". Expected i/n with 0 <= i < n, e.g. 0/4`)
  process.exit(1)
}

// --list needs no credentials and touches no network: print the partition
// and exit, so the slicing can be verified for free.
if (listOnly) {
  const names = listSourceNames({ index, total })
  console.log(`slice ${index}/${total}: ${names.length} sources`)
  for (const n of names) console.log(`  ${n}`)
  process.exit(0)
}

const REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY']
const missing = REQUIRED.filter(k => !process.env[k])
if (missing.length) {
  console.error(`Missing required env: ${missing.join(', ')}`)
  process.exit(1)
}

// ── Budget: divide the weekly cap across the parallel slices ──
// Each slice is a separate process with its own costTracker, so without this
// four workers would each get the full cap and the run could cost 4x.
const weeklyCap = parseFloat(process.env.PIPELINE_MAX_USD ?? '') || 8
const sliceCap = weeklyCap / total
costTracker.reset(sliceCap)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function stamp(msg: string) {
  console.log(`${new Date().toISOString()} [slice ${index + 1}/${total}] ${msg}`)
}

async function main() {
  const started = Date.now()
  stamp(`Starting — budget $${sliceCap.toFixed(2)} of $${weeklyCap.toFixed(2)} weekly${dryRun ? ' (DRY RUN)' : ''}`)

  const results = await runPipeline({
    scoreThreshold: 50,
    dryRun,
    supabase: dryRun ? undefined : supabase,
    cacheOnly: false,
    slice: { index, total },
  })

  let fetched = 0, inserted = 0, filtered = 0, errors = 0
  for (const r of results) {
    fetched += r.fetched; inserted += r.inserted
    filtered += r.filtered; errors += r.errors
    if (r.fetched > 0) {
      stamp(`  ${r.source}: ${r.fetched} fetched → ${r.inserted} inserted, ${r.filtered} filtered`)
    }
  }

  const mins = ((Date.now() - started) / 60000).toFixed(1)
  stamp(`Done in ${mins}m — ${results.length} sources, ${fetched} fetched, ${inserted} inserted, ${filtered} filtered, ${errors} errors`)
  stamp(costTracker.summary())

  // Surfaced so a slice that quietly fetched nothing is visible in the run
  // summary rather than looking like a clean pass.
  if (fetched === 0) {
    stamp('WARNING: this slice fetched 0 events — sources may be blocked or broken.')
  }
}

main().catch(err => {
  if (err instanceof CostCapExceeded) {
    stamp(`HALTED: ${err.message}`)
    stamp(costTracker.summary())
    process.exit(2)
  }
  stamp(`CRASHED: ${err?.message ?? err}`)
  stamp(costTracker.summary())
  console.error(err)
  process.exit(1)
})
