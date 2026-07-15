'use client'

import { useState } from 'react'

type Status = 'idle' | 'fetching' | 'scoring' | 'done' | 'error'
type Result = { approved?: boolean; queued?: boolean; score?: number; reason?: string; title?: string; error?: string }

export default function SubmitEvent({ onBack }: { onBack: () => void }) {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<Result | null>(null)

  async function handleSubmit() {
    if (!url.trim()) return
    setStatus('fetching')
    setResult(null)

    // Brief delay so user sees "Fetching" state
    await new Promise(r => setTimeout(r, 400))
    setStatus('scoring')

    try {
      const res = await fetch('/api/submit-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatus('error')
        setResult({ error: data.error ?? 'Something went wrong' })
        return
      }
      setStatus('done')
      setResult(data)
    } catch {
      setStatus('error')
      setResult({ error: 'Network error — please try again' })
    }
  }

  return (
    <div className="min-h-screen font-body flex flex-col" style={{ background: 'var(--color-bg)' }}>
      {/* Header */}
      <div className="flex items-center px-4 pt-3 pb-2" style={{ paddingTop: 'calc(12px + var(--sat, 0px))' }}>
        <button onClick={onBack} className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
          &larr; Back
        </button>
      </div>

      <div className="flex-1 px-4 pt-4">
        <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--color-amber)' }}>
          Add your event
        </p>
        <h1 className="font-heading text-xl font-light mb-1" style={{ color: 'var(--color-text)' }}>
          Paste any event URL
        </h1>
        <p className="text-[11px] mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          Eventbrite, Luma, Ticket Tailor, Facebook, your website&hellip;
        </p>

        {/* Input */}
        <input
          type="url"
          placeholder="https://..."
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && status === 'idle' && handleSubmit()}
          disabled={status !== 'idle' && status !== 'error' && status !== 'done'}
          className="w-full rounded-xl px-4 py-3.5 text-[13px] outline-none placeholder:text-gray-500"
          style={{ background: 'var(--color-card)', color: 'var(--color-text)', border: '0.5px solid var(--color-amber-border)' }}
        />

        {/* Submit button */}
        {(status === 'idle' || status === 'error' || status === 'done') && (
          <button
            onClick={handleSubmit}
            disabled={!url.trim()}
            className="w-full mt-3 py-3 rounded-full text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ background: 'var(--color-amber)' }}
          >
            Check it
          </button>
        )}

        {/* Status */}
        {status === 'fetching' && (
          <div className="mt-6 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--color-amber)' }} />
            <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>Fetching event details&hellip;</span>
          </div>
        )}
        {status === 'scoring' && (
          <div className="mt-6 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--color-amber)' }} />
            <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>Checking regenerative alignment&hellip;</span>
          </div>
        )}

        {/* Result */}
        {status === 'done' && result && (
          <div className="mt-6 rounded-xl px-4 py-4" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-text-faint)' }}>
            {result.approved && (
              <>
                <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--color-amber)' }}>Your event is live!</p>
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  &ldquo;{result.title}&rdquo; will appear for people nearby.
                </p>
                <p className="text-[10px] mt-2 italic" style={{ color: 'var(--color-text-muted)' }}>
                  Score: {result.score}/100 &middot; {result.reason}
                </p>
              </>
            )}
            {result.queued && (
              <>
                <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--color-text)' }}>We&apos;re reviewing it</p>
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  &ldquo;{result.title}&rdquo; is queued for review &mdash; usually within 24h.
                </p>
                <p className="text-[10px] mt-2 italic" style={{ color: 'var(--color-text-muted)' }}>
                  {result.reason}
                </p>
              </>
            )}
            {!result.approved && !result.queued && (
              <>
                <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--color-text)' }}>Not quite right for Emerge</p>
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  {result.reason}
                </p>
                <p className="text-[10px] mt-2 italic" style={{ color: 'var(--color-text-muted)' }}>
                  Emerge focuses on hands-on, local, regenerative gatherings &mdash; repair caf&eacute;s, seed swaps, food forests, community builds.
                </p>
              </>
            )}
          </div>
        )}

        {/* Error */}
        {status === 'error' && result?.error && (
          <div className="mt-6 rounded-xl px-4 py-3" style={{ background: 'var(--color-card)', border: '0.5px solid rgba(200,80,60,0.3)' }}>
            <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>{result.error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
