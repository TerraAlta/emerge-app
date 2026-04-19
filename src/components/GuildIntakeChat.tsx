'use client'

import { useState, useEffect, useRef } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  userId: string
  initialTranscript?: Message[]
  onComplete: (transcript: Message[]) => void
}

export default function GuildIntakeChat({ userId, initialTranscript = [], onComplete }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialTranscript)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    if (messages.length === 0) void startIntake()
  }, [])

  async function startIntake() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/guild/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, transcript: [] }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to start intake')
      }
      const { reply } = await res.json()
      setMessages([{ role: 'assistant', content: reply }])
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return

    const newTranscript: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(newTranscript)
    setInput('')
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/guild/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, transcript: newTranscript }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to send message')
      }
      const { reply, done } = await res.json()
      const updated: Message[] = [...newTranscript, { role: 'assistant', content: reply }]
      setMessages(updated)

      if (done) {
        setTimeout(() => onComplete(updated), 1500)
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 200px)', maxHeight: 700 }}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 px-1 py-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className="max-w-[85%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed"
              style={{
                background: m.role === 'user' ? 'var(--color-amber-light)' : 'var(--color-card)',
                border: '0.5px solid var(--color-amber-border)',
                color: 'var(--color-text)',
              }}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-3 text-[14px]" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>
                <span className="inline-block animate-pulse">···</span>
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="text-center py-2">
            <p className="text-[12px]" style={{ color: 'var(--color-error)' }}>{error}</p>
            <button
              onClick={() => setError('')}
              className="text-[11px] underline mt-1"
              style={{ color: 'var(--color-amber)', background: 'none', border: 'none', cursor: 'pointer' }}
            >Dismiss</button>
          </div>
        )}
      </div>

      <div className="shrink-0 pt-3" style={{ borderTop: '0.5px solid var(--color-border)' }}>
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Share your answer..."
            rows={2}
            disabled={loading}
            className="flex-1 rounded-xl px-3 py-2.5 text-[14px] resize-none outline-none"
            style={{
              background: 'var(--color-pill-bg)',
              border: '0.5px solid var(--color-amber-border)',
              color: 'var(--color-text)',
              fontFamily: 'var(--font-outfit)',
            }}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="rounded-full px-5 py-3 text-[13px] font-semibold shrink-0"
            style={{
              background: 'var(--color-amber)',
              color: 'var(--color-pill-active-text)',
              border: 'none',
              cursor: loading || !input.trim() ? 'default' : 'pointer',
              opacity: loading || !input.trim() ? 0.5 : 1,
            }}
          >Send</button>
        </div>
        <p className="text-[10px] mt-2 text-center" style={{ color: 'var(--color-text-muted)' }}>
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
