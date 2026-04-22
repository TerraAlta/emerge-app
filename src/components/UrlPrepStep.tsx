'use client'

import { useState } from 'react'

export interface UrlPrepResult {
  urls: string[]
  combinedText: string
  perUrl: Array<{ url: string; ok: boolean; error?: string; title?: string; bytes?: number }>
}

interface Props {
  /** Called when the user skips OR successfully ingests URLs. */
  onDone: (result: UrlPrepResult) => void
  /** Copy tuned per flow (practitioner / client / pitch). */
  title?: string
  subtitle?: string
  skipLabel?: string
  submitLabel?: string
}

/**
 * Optional pre-interview step: user pastes up to 3 URLs. We fetch, strip,
 * and hand the combined text back so the next screen can include it in the
 * AI call. Used by all 3 Guild flows.
 */
export default function UrlPrepStep({
  onDone,
  title = 'Share a page about your work (optional)',
  subtitle = 'Paste up to 3 URLs — your personal site, a project page, a CV. I\'ll read them first so the interview can be much shorter. Skip if you\'d rather just chat.',
  skipLabel = 'Skip this',
  submitLabel = 'Read these and continue',
}: Props) {
  const [urls, setUrls] = useState<string[]>(['', '', ''])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  function setAt(i: number, v: string) {
    const next = [...urls]
    next[i] = v
    setUrls(next)
  }

  async function submit() {
    const cleaned = urls.map(u => u.trim()).filter(u => u.length > 0)
    if (cleaned.length === 0) {
      onDone({ urls: [], combinedText: '', perUrl: [] })
      return
    }
    setLoading(true)
    setErrors([])
    try {
      const res = await fetch('/api/guild/pitch/prep-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: cleaned }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrors([data.error || 'Something went wrong'])
        setLoading(false)
        return
      }
      const failedUrls = (data.results || []).filter((r: any) => !r.ok)
      if (failedUrls.length > 0 && failedUrls.length === cleaned.length) {
        // All failed — show the errors and let the user retry or skip
        setErrors(failedUrls.map((r: any) => `${r.url}: ${r.error}`))
        setLoading(false)
        return
      }
      onDone({
        urls: cleaned,
        combinedText: data.combinedText || '',
        perUrl: data.results || [],
      })
    } catch (err: any) {
      setErrors([err?.message || 'Fetch failed'])
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

      <div className="space-y-2">
        {urls.map((u, i) => (
          <input
            key={i}
            value={u}
            onChange={e => setAt(i, e.target.value)}
            placeholder={`https://... (${i + 1} of 3)`}
            className="w-full rounded-lg px-3 py-2.5 text-[14px]"
            style={inputStyle}
          />
        ))}
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
          onClick={() => onDone({ urls: [], combinedText: '', perUrl: [] })}
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
