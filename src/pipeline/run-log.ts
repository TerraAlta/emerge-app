/**
 * Records a pipeline run's per-source results in pipeline_source_runs, for
 * the Monday health check (/api/cron/weekly-health).
 *
 * One row per source, plus one '__slice__' row with the runner's totals, AI
 * spend and outcome (errors: 0 = finished, 1 = crashed, 2 = hit the cost cap).
 * Never throws — a logging failure must not fail the run.
 */
export interface SourceRunRow {
  source: string
  fetched: number
  alreadyStored?: number
  inserted: number
  filtered: number
  errors: number
}

export const SLICE_OK = 0
export const SLICE_CRASHED = 1
export const SLICE_HALTED = 2

export async function recordRun(
  supabase: any,
  runner: string,
  rows: SourceRunRow[],
  costUsd: number,
  outcome: number = SLICE_OK,
): Promise<void> {
  if (!supabase) return
  try {
    const run_at = new Date().toISOString()
    const sum = (k: keyof SourceRunRow) => rows.reduce((n, r) => n + (Number(r[k]) || 0), 0)
    const payload = [
      ...rows.map(r => ({
        run_at, runner, source: r.source,
        fetched: r.fetched, already_stored: r.alreadyStored ?? 0,
        inserted: r.inserted, filtered: r.filtered, errors: r.errors,
      })),
      {
        run_at, runner, source: '__slice__',
        fetched: sum('fetched'), already_stored: sum('alreadyStored'),
        inserted: sum('inserted'), filtered: sum('filtered'), errors: outcome,
        cost_usd: Number(costUsd.toFixed(4)),
      },
    ]
    const { error } = await supabase.from('pipeline_source_runs').insert(payload)
    if (error) console.warn(`[run-log] could not record run: ${error.message}`)
  } catch (err: any) {
    console.warn(`[run-log] could not record run: ${err?.message ?? err}`)
  }
}
