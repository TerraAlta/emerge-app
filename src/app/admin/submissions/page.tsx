'use client'

/**
 * /admin/submissions — events people submitted by link, waiting for a human
 * decision. Nothing submitted by link goes live until it's approved here.
 */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isAdminEmail } from '@/lib/admin-emails'
import { safeHref } from '@/lib/safe-url'

interface Submission {
  id: string
  url: string
  title: string
  description: string | null
  category: string | null
  address: string | null
  starts_at: string | null
  lat: number | null
  lng: number | null
  organizer: string | null
  ai_score: number
  ai_reasoning: string | null
  created_at: string
}

interface Decided {
  id: string
  title: string
  status: 'approved' | 'rejected'
  ai_score: number
  reviewed_at: string | null
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function AdminSubmissionsPage() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<Submission[]>([])
  const [recent, setRecent] = useState<Decided[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function authHeader(): Promise<Record<string, string>> {
    const { data: sess } = await supabase.auth.getSession()
    const token = sess?.session?.access_token
    return token ? { authorization: `Bearer ${token}` } : {}
  }

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/submissions', { headers: await authHeader() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load submissions')
      setPending(data.pending)
      setRecent(data.recent)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const ok = isAdminEmail(data.user?.email)
      setAuthed(ok)
      if (ok) void load()
    })
  }, [])

  async function decide(s: Submission, action: 'approve' | 'reject') {
    if (action === 'approve' && !confirm(`Publish “${s.title}” to Emerge?`)) return
    setBusy(s.id)
    setError('')
    try {
      const res = await fetch('/api/admin/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ id: s.id, action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Action failed')
      if (data.alreadyOnEmerge) setError(`“${s.title}” was already on Emerge — marked approved, nothing duplicated.`)
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  if (authed === null) return null
  if (!authed) {
    return <div className="p-8 text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>Admins only.</div>
  }

  return (
    <div className="min-h-screen font-body" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <div className="max-w-[720px] mx-auto px-4 py-8">
        <a href="/admin" className="text-[13px] font-medium" style={{ color: 'var(--color-amber)' }}>← Admin</a>
        <h1 className="font-heading text-[26px] font-light mt-3 mb-1">Submitted events</h1>
        <p className="text-[13px] mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          Events people submitted by link. The AI turned away clear misses; everything here waits for you — nothing goes live until you approve it.
        </p>

        {error && (
          <div className="mb-4 rounded-[12px] px-4 py-3 text-[13px]" role="alert" style={{ background: 'var(--color-amber-bg)', border: '0.5px solid var(--color-amber-border)' }}>
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
        ) : pending.length === 0 ? (
          <div className="rounded-[14px] px-4 py-10 text-center" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)' }}>
            <p className="text-[14px]">Nothing waiting 🌱</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(s => {
              const href = safeHref(s.url)
              const missing = !s.starts_at || s.lat == null || s.lng == null
              return (
                <div key={s.id} className="rounded-[14px] px-4 py-4" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium leading-snug">{s.title}</p>
                      <p className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                        {fmt(s.starts_at)} · {s.address || 'no location'}{s.organizer ? ` · ${s.organizer}` : ''}
                      </p>
                    </div>
                    <span className="text-[12px] font-semibold shrink-0" style={{ color: 'var(--color-amber)' }}>{s.ai_score}/100</span>
                  </div>
                  {s.description && (
                    <p className="text-[13px] mt-2 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                      {s.description.slice(0, 400)}{s.description.length > 400 ? '…' : ''}
                    </p>
                  )}
                  {s.ai_reasoning && (
                    <p className="text-[12px] mt-2 italic" style={{ color: 'var(--color-text-muted)' }}>AI: {s.ai_reasoning}</p>
                  )}
                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    {href && <a href={href} target="_blank" rel="noopener noreferrer" className="text-[12px] font-medium" style={{ color: 'var(--color-amber)' }}>Open the event page ↗</a>}
                    <span className="flex-1" />
                    <button
                      onClick={() => decide(s, 'reject')}
                      disabled={busy === s.id}
                      className="text-[13px] px-4 py-2 rounded-full"
                      style={{ background: 'var(--color-pill-bg)', color: 'var(--color-text-secondary)', border: 'none', cursor: 'pointer' }}
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => decide(s, 'approve')}
                      disabled={busy === s.id || missing}
                      title={missing ? 'No date or location found — can’t be published' : undefined}
                      className="text-[13px] px-4 py-2 rounded-full font-semibold"
                      style={{ background: 'var(--color-amber)', color: '#fff', border: 'none', cursor: missing ? 'not-allowed' : 'pointer', opacity: missing ? 0.5 : 1 }}
                    >
                      Approve
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {recent.length > 0 && (
          <div className="mt-10">
            <h2 className="text-[11px] uppercase font-semibold mb-2" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.06em' }}>Recently decided</h2>
            <div className="space-y-1.5">
              {recent.map(r => (
                <div key={r.id} className="flex items-center justify-between text-[13px]">
                  <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>{r.title}</span>
                  <span className="shrink-0 ml-3" style={{ color: r.status === 'approved' ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                    {r.status === 'approved' ? 'Published' : 'Rejected'} · {fmt(r.reviewed_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
