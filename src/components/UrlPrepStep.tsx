'use client'

import { useState } from 'react'

export interface PrepResult {
  urls: string[]
  files: Array<{ filename: string; bytes?: number; ok: boolean; error?: string }>
  combinedText: string
}

interface Props {
  /** Called when the user skips OR successfully ingests URLs/files. */
  onDone: (result: PrepResult) => void
  title?: string
  subtitle?: string
  skipLabel?: string
  submitLabel?: string
}

/**
 * Optional pre-interview context step used by all 3 Guild flows.
 * User can paste up to 3 URLs and/or upload up to 3 files (PDF or text).
 * Everything is fetched/parsed server-side and the combined plain text is
 * passed back so the next screen can feed it to the AI interview.
 */
export default function UrlPrepStep({
  onDone,
  title = 'Share something about your work (optional)',
  subtitle = 'Paste URLs or upload PDFs — your CV, a project writeup, your site, a portfolio. I\'ll read them first so the interview can be much shorter. Skip if you\'d rather just chat.',
  skipLabel = 'Skip this',
  submitLabel = 'Read these and continue',
}: Props) {
  const [urls, setUrls] = useState<string[]>(['', '', ''])
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  function setAtUrl(i: number, v: string) {
    const next = [...urls]
    next[i] = v
    setUrls(next)
  }

  function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || [])
    const combined = [...files, ...picked].slice(0, 3)
    setFiles(combined)
    e.target.value = '' // allow re-pick the same file
  }
  function removeFile(i: number) {
    setFiles(files.filter((_, idx) => idx !== i))
  }

  async function submit() {
    const cleanedUrls = urls.map(u => u.trim()).filter(u => u.length > 0)
    if (cleanedUrls.length === 0 && files.length === 0) {
      onDone({ urls: [], files: [], combinedText: '' })
      return
    }
    setLoading(true)
    setErrors([])

    try {
      // Fire URL + file requests in parallel, then merge combinedText
      const urlPromise = cleanedUrls.length > 0
        ? fetch('/api/guild/pitch/prep-context', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: cleanedUrls }),
          }).then(r => r.json())
        : Promise.resolve({ results: [], combinedText: '' })

      let filePromise: Promise<any> = Promise.resolve({ results: [], combinedText: '' })
      if (files.length > 0) {
        const form = new FormData()
        files.forEach((f, i) => form.append(`file${i + 1}`, f))
        filePromise = fetch('/api/guild/pitch/prep-files', { method: 'POST', body: form })
          .then(r => r.json())
      }

      const [urlData, fileData] = await Promise.all([urlPromise, filePromise])

      const errs: string[] = []
      for (const r of urlData.results || []) {
        if (!r.ok) errs.push(`${r.url}: ${r.error}`)
      }
      for (const r of fileData.results || []) {
        if (!r.ok) errs.push(`${r.filename}: ${r.error}`)
      }

      // If nothing succeeded, show errors and let user retry or skip
      const anyOk = (urlData.results || []).some((r: any) => r.ok)
        || (fileData.results || []).some((r: any) => r.ok)
      if (!anyOk) {
        setErrors(errs.length > 0 ? errs : ['Nothing could be read. Try a different URL or file, or skip.'])
        setLoading(false)
        return
      }

      const combinedText = [urlData.combinedText || '', fileData.combinedText || '']
        .filter(Boolean).join('\n\n')

      onDone({
        urls: cleanedUrls,
        files: (fileData.results || []).map((r: any) => ({ filename: r.filename, bytes: r.bytes, ok: r.ok, error: r.error })),
        combinedText,
      })
    } catch (err: any) {
      setErrors([err?.message || 'Something went wrong'])
      setLoading(false)
    }
  }

  const inputStyle = {
    background: 'var(--color-pill-bg)',
    border: '0.5px solid var(--color-amber-border)',
    color: 'var(--color-text)',
    outline: 'none',
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-[20px] font-light mb-1" style={{ color: 'var(--color-text)' }}>
          {title}
        </h2>
        <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          {subtitle}
        </p>
      </div>

      {/* URLs */}
      <div>
        <p className="text-[11px] uppercase mb-1.5" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.08em' }}>Links</p>
        <div className="space-y-2">
          {urls.map((u, i) => (
            <input
              key={i}
              value={u}
              onChange={e => setAtUrl(i, e.target.value)}
              placeholder={`https://... (${i + 1} of 3)`}
              className="w-full rounded-lg px-3 py-2.5 text-[14px]"
              style={inputStyle}
            />
          ))}
        </div>
      </div>

      {/* Files */}
      <div>
        <p className="text-[11px] uppercase mb-1.5" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.08em' }}>
          Files — PDF or text, up to 3, max 5 MB each
        </p>
        <div className="space-y-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px]"
              style={{ background: 'var(--color-amber-light)', border: '0.5px solid var(--color-amber-border)' }}>
              <span style={{ flex: 1, color: 'var(--color-text)' }}>
                📎 {f.name} <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>· {(f.size / 1024).toFixed(0)} KB</span>
              </span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
              >×</button>
            </div>
          ))}
          {files.length < 3 && (
            <label
              className="flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-[13px] cursor-pointer transition-all"
              style={{ background: 'var(--color-pill-bg)', border: '1px dashed var(--color-amber-border)', color: 'var(--color-text-secondary)' }}
            >
              <input
                type="file"
                accept="application/pdf,text/plain,.pdf,.txt,.md"
                multiple
                onChange={onFilesPicked}
                style={{ display: 'none' }}
              />
              <span>+ Add file{files.length > 0 ? ` (${3 - files.length} more)` : ''}</span>
            </label>
          )}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="rounded-lg p-3" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-error)' }}>
          {errors.map((e, i) => (
            <p key={i} className="text-[12px]" style={{ color: 'var(--color-error)' }}>{e}</p>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={loading}
          className="flex-1 py-3 rounded-full text-[14px] font-semibold"
          style={{
            background: 'var(--color-amber)',
            color: 'var(--color-pill-active-text)',
            border: 'none',
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? 'Reading...' : submitLabel}
        </button>
        <button
          onClick={() => onDone({ urls: [], files: [], combinedText: '' })}
          disabled={loading}
          className="rounded-full px-5 py-3 text-[13px]"
          style={{
            background: 'transparent',
            color: 'var(--color-text-secondary)',
            border: '0.5px solid var(--color-border)',
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {skipLabel}
        </button>
      </div>
    </div>
  )
}
