'use client'

import { useState } from 'react'

type Status = 'idle' | 'connecting' | 'done' | 'error'

export default function ConnectLuma({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [apiKey, setApiKey] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<any>(null)

  async function handleConnect() {
    if (!apiKey.trim()) return
    setStatus('connecting')
    setResult(null)

    try {
      const res = await fetch('/api/connect-luma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey.trim(), user_id: userId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatus('error')
        setResult({ error: data.error ?? 'Failed to connect' })
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
        <p className="text-[13px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--color-amber)' }}>
          Connect your calendar
        </p>
        <h1 className="font-heading text-xl font-light mb-1" style={{ color: 'var(--color-text)' }}>
          Luma integration
        </h1>
        <p className="text-[13px] mb-1" style={{ color: 'var(--color-text-secondary)' }}>
          If you host events on Luma, connect your calendar once and all your events will automatically appear on Emerge.
        </p>
        <p className="text-[12px] mb-6" style={{ color: 'var(--color-text-muted)' }}>
          Find your API key at lu.ma &rarr; Settings &rarr; Developer
        </p>

        {/* Input */}
        <input
          type="password"
          placeholder="Luma API key"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          disabled={status === 'connecting'}
          className="w-full rounded-xl px-4 py-3.5 text-[13px] outline-none placeholder:text-gray-500"
          style={{ background: 'var(--color-card)', color: 'var(--color-text)', border: '0.5px solid var(--color-amber-border)' }}
        />

        {status !== 'connecting' && (
          <button
            onClick={handleConnect}
            disabled={!apiKey.trim()}
            className="w-full mt-3 py-3 rounded-full text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ background: 'var(--color-amber)' }}
          >
            Connect
          </button>
        )}

        {status === 'connecting' && (
          <div className="mt-6 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--color-amber)' }} />
            <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>Connecting and syncing events&hellip;</span>
          </div>
        )}

        {status === 'done' && result && (
          <div className="mt-6 rounded-xl px-4 py-4" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-text-faint)' }}>
            <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--color-amber)' }}>Connected!</p>
            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              {result.organiser_name} &mdash; {result.events_found} events found, {result.inserted} added to Emerge.
            </p>
            <p className="text-[12px] mt-2 italic" style={{ color: 'var(--color-text-muted)' }}>
              New events will sync automatically every day.
            </p>
          </div>
        )}

        {status === 'error' && result?.error && (
          <div className="mt-6 rounded-xl px-4 py-3" style={{ background: 'var(--color-card)', border: '0.5px solid rgba(200,80,60,0.3)' }}>
            <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>{result.error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
