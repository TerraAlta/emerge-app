/**
 * Daily news pipeline cron.
 * Fetches from 9 RSS sources, dedups against DB, scores with Haiku,
 * inserts scored items into news_items.
 *
 * Protected by CRON_SECRET (same pattern as other crons).
 * Configured in vercel.json — runs daily.
 */
import { NextRequest, NextResponse } from 'next/server'
import { ingestNews } from '@/news/ingest'

export const maxDuration = 300 // up to 5 min — scoring 50-100 items takes ~2 min

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const start = Date.now()
  try {
    const stats = await ingestNews()
    const durationMs = Date.now() - start
    return NextResponse.json({
      ok: true,
      durationMs,
      ...stats,
    })
  } catch (err: any) {
    console.error('[news-pipeline] unexpected error:', err?.message || err)
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 })
  }
}
