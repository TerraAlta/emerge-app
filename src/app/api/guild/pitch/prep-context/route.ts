/**
 * Fetches 1-3 URLs the pitcher/practitioner/client pasted before an AI
 * interview, strips HTML, returns plain text per URL + a combined blob.
 * No AI cost. No DB writes (caller decides what to persist).
 *
 * POST body: { urls: string[] }
 * Returns:   { results: UrlIngestResult[], combinedText: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { ingestUrls } from '@/lib/url-ingest'

export const maxDuration = 20

export async function POST(request: NextRequest) {
  try {
    const { urls } = await request.json()
    if (!Array.isArray(urls)) {
      return NextResponse.json({ error: 'urls must be an array' }, { status: 400 })
    }
    const out = await ingestUrls(urls)
    return NextResponse.json(out)
  } catch (err: any) {
    console.error('[prep-context]', err)
    return NextResponse.json({ error: err?.message || 'Ingest failed' }, { status: 500 })
  }
}
