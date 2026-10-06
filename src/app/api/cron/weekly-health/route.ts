import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, isEmailConfigured } from '@/lib/email'

/**
 * Monday health report for the event pipeline — one email (and a Telegram
 * message if a bot token is configured), every week, good news or bad.
 *
 * Reads pipeline_source_runs (written by the Sunday GitHub slices and the
 * iMac Eventbrite job — see src/pipeline/run-log.ts), quests and
 * pipeline_errors. Flags: runners that didn't report, crashed or hit the cost
 * cap; sources that went quiet or dropped sharply; fake-dated events; AI
 * credit errors. Built after the 2026-10-06 inspection found ~180 of 224
 * sources returning nothing for months without anyone noticing.
 *
 * ?dry=1 returns the report as JSON without sending.
 */
export const maxDuration = 30

const EXPECTED_RUNNERS = ['network 1/4', 'network 2/4', 'network 3/4', 'network 4/4', 'city 1/1']
const DAY = 24 * 60 * 60 * 1000

function supa() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

interface RunRow {
  run_at: string
  runner: string
  source: string
  fetched: number
  already_stored: number
  inserted: number
  errors: number
  cost_usd: number | null
}

async function allRows<T>(q: () => any): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q().range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}

async function buildReport() {
  const db = supa()
  const now = Date.now()
  const thisWeekFrom = new Date(now - 4 * DAY).toISOString()
  const historyFrom = new Date(now - 32 * DAY).toISOString()

  const runs = await allRows<RunRow>(() =>
    db.from('pipeline_source_runs')
      .select('run_at, runner, source, fetched, already_stored, inserted, errors, cost_usd')
      .gte('run_at', historyFrom)
      .order('run_at', { ascending: true }))
  const thisWeek = runs.filter(r => r.run_at >= thisWeekFrom)
  const before = runs.filter(r => r.run_at < thisWeekFrom)

  const problems: string[] = []
  const notes: string[] = []

  // 1. Did every runner report, and finish?
  const slices = thisWeek.filter(r => r.source === '__slice__')
  const reported = new Set(slices.map(s => s.runner))
  const missing = EXPECTED_RUNNERS.filter(r => !reported.has(r))
  if (missing.length === EXPECTED_RUNNERS.length) {
    problems.push('No pipeline run reported this week — the Sunday run did not happen (or could not write its results).')
  } else if (missing.length) {
    const why = missing.some(m => m.startsWith('city')) ? ' (the city runner is the iMac Eventbrite job — is the iMac on on Sunday evenings?)' : ''
    problems.push(`Runners that didn't report: ${missing.join(', ')}${why}.`)
  }
  for (const s of slices) {
    if (s.errors === 1) problems.push(`${s.runner} crashed partway.`)
    if (s.errors === 2) problems.push(`${s.runner} hit its AI cost cap and stopped early.`)
  }
  const cost = slices.reduce((n, s) => n + Number(s.cost_usd ?? 0), 0)
  const prevSlices = before.filter(r => r.source === '__slice__')
  const prevWeeks = new Set(prevSlices.map(s => s.run_at.slice(0, 10))).size || 0
  const prevCost = prevSlices.reduce((n, s) => n + Number(s.cost_usd ?? 0), 0)

  // 2. Per-source: went quiet, or dropped sharply, compared with the last ~4 weeks
  const srcThis = new Map<string, number>()
  for (const r of thisWeek) if (r.source !== '__slice__') srcThis.set(r.source, (srcThis.get(r.source) ?? 0) + r.fetched)
  const srcHist = new Map<string, number[]>()
  for (const r of before) {
    if (r.source === '__slice__') continue
    const a = srcHist.get(r.source) ?? []
    a.push(r.fetched)
    srcHist.set(r.source, a)
  }
  const quiet: string[] = []
  const dropped: string[] = []
  for (const [src, n] of srcThis) {
    const hist = srcHist.get(src)
    if (!hist || hist.length === 0) continue
    const avg = hist.reduce((a, b) => a + b, 0) / hist.length
    if (n === 0 && Math.max(...hist) > 0) quiet.push(`${src} (was ~${Math.round(avg)})`)
    else if (avg >= 10 && n < avg * 0.25) dropped.push(`${src} ${n} (was ~${Math.round(avg)})`)
  }
  if (quiet.length) problems.push(`Sources that went quiet (returned events before, none this week): ${quiet.join(', ')}.`)
  if (dropped.length) problems.push(`Sources that dropped sharply: ${dropped.join(', ')}.`)
  const working = [...srcThis.values()].filter(n => n > 0).length
  if (before.length === 0 && thisWeek.length > 0) notes.push('First recorded week — source comparisons start next Monday.')

  // 3. Fake-dated events slipping past the start-date guard: saved with a
  // start time at (or before) the moment they were saved.
  const recent = await allRows<{ created_at: string; starts_at: string; source_name: string }>(() =>
    db.from('quests').select('created_at, starts_at, source_name')
      .gte('created_at', new Date(now - 7 * DAY).toISOString()))
  const fake = recent.filter(q => Date.parse(q.starts_at) < Date.parse(q.created_at) + 60 * 60 * 1000)
  if (fake.length > 0) {
    const bySrc = [...new Set(fake.map(f => f.source_name))].slice(0, 5).join(', ')
    problems.push(`${fake.length} events saved this week were dated at or before the moment they were saved (fake dates?) — from: ${bySrc}.`)
  }

  // 4. Pipeline errors (credits!)
  const { data: errs } = await db.from('pipeline_errors').select('reason')
    .gte('created_at', new Date(now - 7 * DAY).toISOString())
  const errCounts = new Map<string, number>()
  for (const e of errs ?? []) errCounts.set(e.reason, (errCounts.get(e.reason) ?? 0) + 1)
  if (errCounts.has('credits_exhausted')) problems.push('Anthropic AI credits ran out this week — scoring stopped until they were topped up. Check the balance in the Anthropic console.')
  for (const [reason, n] of errCounts) {
    if (reason === 'credits_exhausted' || reason === 'religious_content_rejected') continue
    notes.push(`Pipeline error "${reason}" ×${n}.`)
  }

  // 5. What users see
  const nowIso = new Date(now).toISOString()
  const added = recent.length
  const { count: upcoming } = await db.from('quests').select('id', { count: 'exact', head: true }).gte('starts_at', nowIso)
  const upRows = await allRows<{ country_code: string | null }>(() =>
    db.from('quests').select('country_code').gte('starts_at', nowIso))
  const byCountry = new Map<string, number>()
  for (const r of upRows) { const c = r.country_code ?? '—'; byCountry.set(c, (byCountry.get(c) ?? 0) + 1) }
  const countries = [...byCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  if ((added ?? 0) === 0) problems.push('No new events were saved this week.')

  return {
    ok: problems.length === 0,
    problems,
    notes,
    run: {
      runnersReported: reported.size,
      runnersExpected: EXPECTED_RUNNERS.length,
      sourcesWithEvents: working,
      sourcesRun: srcThis.size,
      fetched: slices.reduce((n, s) => n + s.fetched, 0),
      alreadyStored: slices.reduce((n, s) => n + s.already_stored, 0),
      inserted: slices.reduce((n, s) => n + s.inserted, 0),
      costUsd: Number(cost.toFixed(2)),
      prevAvgCostUsd: prevWeeks ? Number((prevCost / prevWeeks).toFixed(2)) : null,
    },
    events: { addedThisWeek: added ?? 0, upcoming: upcoming ?? 0, byCountry: countries },
  }
}

type Report = Awaited<ReturnType<typeof buildReport>>

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function toHtml(r: Report): string {
  const li = (xs: string[]) => xs.map(x => `<li style="margin:4px 0">${esc(x)}</li>`).join('')
  const costLine = `$${r.run.costUsd.toFixed(2)}${r.run.prevAvgCostUsd != null ? ` (recent weeks ~$${r.run.prevAvgCostUsd.toFixed(2)})` : ''}`
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;color:#222;line-height:1.45">
<h2 style="margin:0 0 4px">${r.ok ? '✅ Emerge pipeline: all good' : `⚠️ Emerge pipeline: ${r.problems.length} thing${r.problems.length > 1 ? 's' : ''} to look at`}</h2>
<p style="color:#666;margin:0 0 16px">Weekly health report · ${new Date().toISOString().slice(0, 10)}</p>
${r.problems.length ? `<h3 style="margin:16px 0 4px">Needs a look</h3><ul style="padding-left:18px">${li(r.problems)}</ul>` : ''}
<h3 style="margin:16px 0 4px">This week's run</h3>
<ul style="padding-left:18px">
<li>Runners reported: ${r.run.runnersReported} of ${r.run.runnersExpected}</li>
<li>Sources returning events: ${r.run.sourcesWithEvents} of ${r.run.sourcesRun} run</li>
<li>Fetched ${r.run.fetched}, already stored ${r.run.alreadyStored}, newly saved ${r.run.inserted}</li>
<li>AI cost: ${costLine}</li>
</ul>
<h3 style="margin:16px 0 4px">What users see</h3>
<ul style="padding-left:18px">
<li>New events this week: ${r.events.addedThisWeek}</li>
<li>Upcoming events: ${r.events.upcoming} — ${r.events.byCountry.map(([c, n]) => `${esc(c)} ${n}`).join(', ')}</li>
</ul>
${r.notes.length ? `<h3 style="margin:16px 0 4px">Notes</h3><ul style="padding-left:18px">${li(r.notes)}</ul>` : ''}
<p style="color:#888;font-size:12px;margin-top:20px">Sent every Monday by /api/cron/weekly-health. Per-source numbers are in the pipeline_source_runs table.</p>
</div>`
}

function toText(r: Report): string {
  return [
    r.ok ? '✅ Emerge pipeline: all good' : `⚠️ Emerge pipeline: ${r.problems.length} to look at`,
    ...r.problems.map(p => `• ${p}`),
    `Run: ${r.run.runnersReported}/${r.run.runnersExpected} runners, ${r.run.sourcesWithEvents} sources with events, ${r.run.inserted} saved, AI $${r.run.costUsd.toFixed(2)}`,
    `Users see: ${r.events.addedThisWeek} new this week, ${r.events.upcoming} upcoming`,
  ].join('\n')
}

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const report = await buildReport()
  if (request.nextUrl.searchParams.get('dry') === '1') return NextResponse.json(report)

  const sent: Record<string, unknown> = {}
  const to = process.env.NEXT_PUBLIC_ADMIN_EMAIL
  if (to && isEmailConfigured()) {
    const subject = report.ok
      ? `✅ Emerge weekly health: all good (${report.run.inserted} new events)`
      : `⚠️ Emerge weekly health: ${report.problems.length} to look at`
    sent.email = await sendEmail({ to, subject, html: toHtml(report) })
  }
  const bot = process.env.TELEGRAM_BOT_TOKEN
  const chat = process.env.TELEGRAM_ADMIN_CHAT_ID
  if (bot && chat) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: toText(report) }),
      })
      sent.telegram = res.ok
    } catch {
      sent.telegram = false
    }
  }
  return NextResponse.json({ ok: true, healthy: report.ok, sent })
}
