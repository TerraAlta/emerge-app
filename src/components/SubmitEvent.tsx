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
    <div className="min-h-screen font-body flex flex-col" style={{ background: '#0D1A0B' }}>
      {/* Header */}
      <div className="flex items-center px-4 pt-3 pb-2" style={{ paddingTop: 'calc(12px + var(--sat, 0px))' }}>
        <button onClick={onBack} className="text-[13px]" style={{ color: 'rgba(232,242,224,0.5)' }}>
          &larr; Back
        </button>
      </div>

      <div className="flex-1 px-4 pt-4">
        <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: '#C8913A' }}>
          Add your event
        </p>
        <h1 className="font-heading text-xl font-light mb-1" style={{ color: '#E8F2E0' }}>
          Paste any event URL
        </h1>
        <p className="text-[11px] mb-6" style={{ color: 'rgba(232,242,224,0.4)' }}>
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
          style={{ background: '#162814', color: '#E8F2E0', border: '0.5px solid rgba(200,145,58,0.2)' }}
        />

        {/* Submit button */}
        {(status === 'idle' || status === 'error' || status === 'done') && (
          <button
            onClick={handleSubmit}
            disabled={!url.trim()}
            className="w-full mt-3 py-3 rounded-full text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ background: '#C8913A' }}
          >
            Check it
          </button>
        )}

        {/* Status */}
        {status === 'fetching' && (
          <div className="mt-6 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#C8913A' }} />
            <span className="text-[12px]" style={{ color: 'rgba(232,242,224,0.5)' }}>Fetching event details&hellip;</span>
          </div>
        )}
        {status === 'scoring' && (
          <div className="mt-6 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#C8913A' }} />
            <span className="text-[12px]" style={{ color: 'rgba(232,242,224,0.5)' }}>Checking regenerative alignment&hellip;</span>
          </div>
        )}

        {/* Result */}
        {status === 'done' && result && (
          <div className="mt-6 rounded-xl px-4 py-4" style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.15)' }}>
            {result.approved && (
              <>
                <p className="text-[13px] font-medium mb-1" style={{ color: '#C8913A' }}>Your quest is live!</p>
                <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(232,242,224,0.6)' }}>
                  &ldquo;{result.title}&rdquo; will appear for people nearby.
                </p>
                <p className="text-[10px] mt-2 italic" style={{ color: 'rgba(232,242,224,0.3)' }}>
                  Score: {result.score}/100 &middot; {result.reason}
                </p>
              </>
            )}
            {result.queued && (
              <>
                <p className="text-[13px] font-medium mb-1" style={{ color: '#E8F2E0' }}>We&apos;re reviewing it</p>
                <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(232,242,224,0.6)' }}>
                  &ldquo;{result.title}&rdquo; is queued for review &mdash; usually within 24h.
                </p>
                <p className="text-[10px] mt-2 italic" style={{ color: 'rgba(232,242,224,0.3)' }}>
                  {result.reason}
                </p>
              </>
            )}
            {!result.approved && !result.queued && (
              <>
                <p className="text-[13px] font-medium mb-1" style={{ color: '#E8F2E0' }}>Not quite right for Emerge</p>
                <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(232,242,224,0.6)' }}>
                  {result.reason}
                </p>
                <p className="text-[10px] mt-2 italic" style={{ color: 'rgba(232,242,224,0.3)' }}>
                  Emerge focuses on hands-on, local, regenerative gatherings &mdash; repair caf&eacute;s, seed swaps, food forests, community builds.
                </p>
              </>
            )}
          </div>
        )}

        {/* Error */}
        {status === 'error' && result?.error && (
          <div className="mt-6 rounded-xl px-4 py-3" style={{ background: '#162814', border: '0.5px solid rgba(200,80,60,0.3)' }}>
            <p className="text-[12px]" style={{ color: 'rgba(232,242,224,0.6)' }}>{result.error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
