/**
 * File pre-ingest for Guild flows. Accepts up to 3 uploaded PDF or
 * plain-text files, extracts text, returns per-file results + combined blob.
 *
 * Files are NOT persisted — we parse, return text, discard bytes.
 *
 * POST multipart/form-data with fields: file1, file2, file3 (any subset).
 * Returns: { results: FileIngestResult[], combinedText: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { ingestFiles } from '@/lib/file-ingest'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    const files: File[] = []
    for (const [key, value] of form.entries()) {
      if (value instanceof File && value.size > 0) files.push(value)
      if (files.length >= 3) break
    }
    const out = await ingestFiles(files)
    return NextResponse.json(out)
  } catch (err: any) {
    console.error('[prep-files]', err)
    return NextResponse.json({ error: err?.message || 'Upload failed' }, { status: 500 })
  }
}
