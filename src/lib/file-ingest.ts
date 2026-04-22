/**
 * File ingest helper for Guild flows.
 *
 * Accepts PDFs + plain-text files uploaded before an AI interview.
 * Extracts text, caps size, returns a per-file result plus a combined blob.
 * Binary PDFs are parsed via `unpdf` (serverless-safe; no native deps).
 *
 * Files are NOT persisted. We parse, return text, discard bytes.
 */

const MAX_FILES = 3
const MAX_BYTES_PER_FILE = 5 * 1024 * 1024 // 5 MB per file
const TOTAL_TEXT_CAP = 20_000             // hard cap on combined text returned

export interface FileIngestResult {
  filename: string
  ok: boolean
  error?: string
  text?: string
  bytes?: number
  mime?: string
}

function isTextLike(mime: string, filename: string): boolean {
  if (mime.startsWith('text/')) return true
  if (filename.match(/\.(txt|md|markdown)$/i)) return true
  return false
}

function isPdf(mime: string, filename: string): boolean {
  if (mime === 'application/pdf') return true
  if (filename.toLowerCase().endsWith('.pdf')) return true
  return false
}

async function parsePdfBuffer(buf: Uint8Array): Promise<string> {
  // Dynamic import — unpdf ships ESM and also wants to avoid top-level cost
  const { extractText } = await import('unpdf')
  const result = await extractText(buf, { mergePages: true })
  // result.text is string | string[] depending on mergePages
  const text = Array.isArray(result.text) ? result.text.join('\n\n') : (result.text || '')
  return text
}

async function parseOne(file: File): Promise<FileIngestResult> {
  const filename = file.name || 'file'
  const mime = file.type || ''
  if (file.size > MAX_BYTES_PER_FILE) {
    return { filename, ok: false, error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 5MB.`, bytes: file.size, mime }
  }

  const buf = new Uint8Array(await file.arrayBuffer())

  try {
    let text: string
    if (isPdf(mime, filename)) {
      text = await parsePdfBuffer(buf)
    } else if (isTextLike(mime, filename)) {
      text = new TextDecoder('utf-8').decode(buf)
    } else {
      return { filename, ok: false, error: `Unsupported file type (${mime || 'unknown'}). Upload PDF or plain text.`, bytes: file.size, mime }
    }
    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim()
    return { filename, ok: true, text, bytes: file.size, mime }
  } catch (err: any) {
    return { filename, ok: false, error: err?.message || 'Failed to read file', bytes: file.size, mime }
  }
}

/**
 * Parse up to 3 uploaded files in parallel. Returns per-file status +
 * a single combined text blob capped at TOTAL_TEXT_CAP chars.
 */
export async function ingestFiles(files: File[]): Promise<{
  results: FileIngestResult[]
  combinedText: string
}> {
  const list = files.slice(0, MAX_FILES)
  if (list.length === 0) return { results: [], combinedText: '' }

  const results = await Promise.all(list.map(parseOne))

  const parts: string[] = []
  let budget = TOTAL_TEXT_CAP
  for (const r of results) {
    if (!r.ok || !r.text) continue
    const header = `--- ${r.filename} ---\n`
    const available = Math.max(0, budget - header.length - 4)
    if (available <= 0) break
    const body = r.text.slice(0, available)
    parts.push(header + body)
    budget -= header.length + body.length + 4
    if (budget <= 0) break
  }

  return { results, combinedText: parts.join('\n\n') }
}
