'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

type TicketType = 'bug' | 'suggestion'

export default function SupportTicketButton() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<TicketType>('bug')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!user) return null

  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && !submitting

  const reset = () => {
    setTitle('')
    setDescription('')
    setType('bug')
    setError('')
    setSent(false)
  }

  const close = () => {
    setOpen(false)
    setTimeout(reset, 200)
  }

  const handleSubmit = async () => {
    if (!user) return
    setError('')
    setSubmitting(true)
    try {
      const { error: insertError } = await supabase.from('support_tickets').insert({
        user_id: user.id,
        user_email: user.email,
        type,
        title: title.trim(),
        description: description.trim(),
        page_url: typeof window !== 'undefined' ? window.location.href : null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      })
      if (insertError) {
        setError(insertError.message)
        return
      }
      setSent(true)
    } catch (e) {
      setError((e as Error).message || 'Could not submit — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Report a bug or share a suggestion"
        title="Report a bug or share a suggestion"
        className="fixed bottom-24 right-5 z-[9999] w-12 h-12 rounded-full flex items-center justify-center active:scale-95 transition-transform"
        style={{
          background: 'var(--color-amber)',
          color: '#FFFFFF',
          boxShadow: '0 6px 16px rgba(0,0,0,0.18)',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <line x1="12" y1="8" x2="12" y2="13" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="support-ticket-title"
          className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={close}
        >
          <div
            className="w-full max-w-[440px] rounded-2xl p-5"
            style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <h2 id="support-ticket-title" className="font-heading text-[18px] font-light" style={{ color: 'var(--color-text)' }}>
                {sent ? 'Thank you' : 'Report a bug or share a suggestion'}
              </h2>
              <button
                onClick={close}
                aria-label="Close"
                className="w-7 h-7 rounded-full flex items-center justify-center text-[16px] leading-none"
                style={{ color: 'var(--color-text-muted)' }}
              >
                ×
              </button>
            </div>

            {sent ? (
              <div className="flex flex-col gap-4">
                <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {type === 'bug'
                    ? 'Your bug report is in. We read every one and fix what we can.'
                    : 'Your suggestion is in. We read every one — thank you for helping shape Emerge.'}
                </p>
                <button
                  onClick={close}
                  className="w-full py-3 rounded-full text-[13px] font-semibold text-white"
                  style={{ background: 'var(--color-amber)' }}
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setType('bug')}
                    className="flex-1 py-2 px-3 rounded-lg text-[13px] font-medium transition-colors"
                    style={{
                      background: type === 'bug' ? 'var(--color-amber)' : 'var(--color-input-bg)',
                      color: type === 'bug' ? '#FFFFFF' : 'var(--color-text-secondary)',
                      border: type === 'bug' ? '0.5px solid var(--color-amber)' : '0.5px solid var(--color-input-border)',
                    }}
                  >
                    Bug
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('suggestion')}
                    className="flex-1 py-2 px-3 rounded-lg text-[13px] font-medium transition-colors"
                    style={{
                      background: type === 'suggestion' ? 'var(--color-amber)' : 'var(--color-input-bg)',
                      color: type === 'suggestion' ? '#FFFFFF' : 'var(--color-text-secondary)',
                      border: type === 'suggestion' ? '0.5px solid var(--color-amber)' : '0.5px solid var(--color-input-border)',
                    }}
                  >
                    Suggestion
                  </button>
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="support-title" className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                    Title
                  </label>
                  <input
                    id="support-title"
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    maxLength={120}
                    placeholder={type === 'bug' ? 'What went wrong?' : 'What would make Emerge better?'}
                    className="w-full rounded-lg px-3 py-2.5 text-[13px] outline-none"
                    style={{
                      background: 'var(--color-input-bg)',
                      color: 'var(--color-text)',
                      border: '0.5px solid var(--color-input-border)',
                    }}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="support-description" className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                    Details
                  </label>
                  <textarea
                    id="support-description"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={5}
                    maxLength={2000}
                    placeholder={
                      type === 'bug'
                        ? 'Steps to reproduce, what you expected, what happened instead.'
                        : 'Describe the feature or improvement you have in mind.'
                    }
                    className="w-full rounded-lg px-3 py-2.5 text-[13px] outline-none resize-y"
                    style={{
                      background: 'var(--color-input-bg)',
                      color: 'var(--color-text)',
                      border: '0.5px solid var(--color-input-border)',
                    }}
                  />
                  <span className="text-[10px] text-right" style={{ color: 'var(--color-text-muted)' }}>
                    {description.length}/2000
                  </span>
                </div>

                <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  We include the current page URL and your browser so we can reproduce the issue.
                </p>

                {error && (
                  <div className="text-[12px]" style={{ color: 'var(--color-error)' }}>
                    {error}
                  </div>
                )}

                <div className="flex gap-2 mt-1">
                  <button
                    onClick={close}
                    disabled={submitting}
                    className="flex-1 py-3 rounded-full text-[13px] font-semibold disabled:opacity-50"
                    style={{
                      background: 'var(--color-input-bg)',
                      color: 'var(--color-text-secondary)',
                      border: '0.5px solid var(--color-input-border)',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="flex-1 py-3 rounded-full text-[13px] font-semibold text-white disabled:opacity-40"
                    style={{ background: 'var(--color-amber)' }}
                  >
                    {submitting ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
