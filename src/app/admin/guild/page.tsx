'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { FLOWER_PETALS } from '@/lib/flower-petals'

const ADMIN_EMAILS = ['terraalta.sintra@gmail.com', 'valdjiu@protonmail.com']

interface PendingProject {
  id: string
  project_name: string
  country: string
  region: string
  client_email: string | null
  created_at: string
  updated_at: string
  extracted_brief: any
  doc: any
}

interface RecentProject {
  id: string
  project_name: string
  country: string
  status: string
  updated_at: string
}

export default function AdminGuildPage() {
  const router = useRouter()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<PendingProject[]>([])
  const [recent, setRecent] = useState<RecentProject[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const ok = ADMIN_EMAILS.includes(data.user?.email ?? '')
      setAuthed(ok)
      if (ok) void load()
    })
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    const { data: sess } = await supabase.auth.getSession()
    const token = sess?.session?.access_token
    try {
      const res = await fetch('/api/guild/admin/pending', {
        headers: { authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load')
      const json = await res.json()
      setPending(json.pending || [])
      setRecent(json.recent || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function approve(projectId: string) {
    if (!confirm('Approve this scoping doc? The client will receive an email with the link.')) return
    setActionLoading(projectId)
    const { data: sess } = await supabase.auth.getSession()
    const token = sess?.session?.access_token
    try {
      const res = await fetch('/api/guild/admin/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectId }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Approve failed')
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setActionLoading(null)
    }
  }

  async function reject(projectId: string) {
    const reason = prompt('Reason for rejection (shown to client):')
    if (reason === null) return
    if (!confirm('Reject and issue a full refund via Stripe?')) return
    setActionLoading(projectId)
    const { data: sess } = await supabase.auth.getSession()
    const token = sess?.session?.access_token
    try {
      const res = await fetch('/api/guild/admin/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectId, reason }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Reject failed')
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setActionLoading(null)
    }
  }

  function petalLabel(key: string): string {
    return FLOWER_PETALS.find(p => p.key === key)?.label || key
  }

  if (authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div className="text-[11px] animate-pulse" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
      </div>
    )
  }
  if (!authed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6" style={{ background: 'var(--color-bg)' }}>
        <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>Admin access restricted.</p>
        <a href="/" style={{ color: 'var(--color-amber)', fontSize: 11, textDecoration: 'underline' }}>Back to app</a>
      </div>
    )
  }

  return (
    <div className="min-h-screen font-body" style={{ background: 'var(--color-bg)' }}>
      <div className="px-6 pt-8 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-heading text-[22px] font-light" style={{ color: 'var(--color-text)' }}>
            Guild <span style={{ color: 'var(--color-amber)' }}>review</span>
          </span>
          <span
            className="text-[9px] uppercase px-1.5 py-0.5 rounded-full ml-1"
            style={{ background: 'var(--color-amber-light)', color: 'var(--color-amber)', letterSpacing: '0.06em', border: '0.5px solid var(--color-amber-border)' }}
          >
            Admin
          </span>
        </div>
        <p className="text-[10px]" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.04em' }}>
          Approve or refund pending scoping documents
        </p>
      </div>

      <div className="px-6 pb-12 space-y-6">
        {loading && (
          <p className="text-[12px] text-center py-10" style={{ color: 'var(--color-text-secondary)' }}>Loading...</p>
        )}

        {error && <p className="text-[12px] text-center" style={{ color: 'var(--color-error)' }}>{error}</p>}

        {!loading && (
          <>
            <section>
              <h2 className="text-[9px] uppercase px-1 mb-2" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.1em' }}>
                Pending review ({pending.length})
              </h2>

              {pending.length === 0 && (
                <div className="rounded-[12px] px-4 py-6 text-center text-[11px]" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                  Nothing pending right now.
                </div>
              )}

              <div className="space-y-3">
                {pending.map(p => {
                  const isExpanded = expanded.has(p.id)
                  const doc = p.doc
                  const isGenerating = !doc
                  return (
                    <div key={p.id} className="rounded-[12px] overflow-hidden" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)' }}>
                      <button
                        onClick={() => toggle(p.id)}
                        className="w-full text-left px-4 py-3 flex items-start justify-between gap-3"
                        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] font-medium truncate" style={{ color: 'var(--color-text)' }}>
                            {p.project_name || '(unnamed)'}
                          </div>
                          <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                            {p.country || '?'}{p.region ? ` · ${p.region}` : ''} · {p.client_email || 'no email'}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isGenerating ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--color-pill-bg)', color: 'var(--color-text-muted)' }}>generating</span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--color-amber-light)', color: 'var(--color-amber)' }}>ready to review</span>
                          )}
                          <span style={{ color: 'var(--color-text-muted)' }}>{isExpanded ? '▴' : '▾'}</span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                          {p.extracted_brief && (
                            <div className="pt-3">
                              <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Client brief</div>
                              {p.extracted_brief.tagline && <p className="text-[12px] mb-1" style={{ color: 'var(--color-text)' }}>{p.extracted_brief.tagline}</p>}
                              {p.extracted_brief.vision && <p className="text-[11px] italic" style={{ color: 'var(--color-text-secondary)' }}>{p.extracted_brief.vision}</p>}
                            </div>
                          )}

                          {isGenerating && (
                            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                              Scoping doc is being drafted. Refresh in a minute.
                            </p>
                          )}

                          {doc?.doc_content && (
                            <div className="space-y-3">
                              <div>
                                <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Draft title</div>
                                <p className="text-[13px]" style={{ color: 'var(--color-text)' }}>{doc.doc_content.title}</p>
                              </div>
                              {doc.doc_content.executive_summary && (
                                <div>
                                  <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Summary</div>
                                  <p className="text-[12px] whitespace-pre-line leading-relaxed" style={{ color: 'var(--color-text)' }}>{doc.doc_content.executive_summary}</p>
                                </div>
                              )}
                              {doc.doc_content.practitioner_recommendations?.length > 0 && (
                                <div>
                                  <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Matched practitioners</div>
                                  <ul className="text-[11px] space-y-0.5" style={{ color: 'var(--color-text)' }}>
                                    {doc.doc_content.practitioner_recommendations.map((r: any, i: number) => (
                                      <li key={i}>· <strong>{r.suggested_role}</strong> — {r.why_this_match}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              <div>
                                <a
                                  href={`/guild/project/${p.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] underline"
                                  style={{ color: 'var(--color-amber)' }}
                                >Preview as client →</a>
                                <span className="text-[10px] ml-3" style={{ color: 'var(--color-text-muted)' }}>
                                  ({doc.tokens_used} tokens · ${Number(doc.cost_usd).toFixed(3)})
                                </span>
                              </div>
                            </div>
                          )}

                          {doc && (
                            <div className="flex gap-2 pt-2">
                              <button
                                onClick={() => approve(p.id)}
                                disabled={actionLoading === p.id}
                                className="flex-1 py-2 rounded-full text-[12px] font-semibold"
                                style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)', border: 'none', cursor: 'pointer', opacity: actionLoading === p.id ? 0.5 : 1 }}
                              >{actionLoading === p.id ? 'Working...' : 'Approve & email'}</button>
                              <button
                                onClick={() => reject(p.id)}
                                disabled={actionLoading === p.id}
                                className="flex-1 py-2 rounded-full text-[12px]"
                                style={{ background: 'var(--color-pill-bg)', color: 'var(--color-text)', border: '0.5px solid var(--color-border)', cursor: 'pointer', opacity: actionLoading === p.id ? 0.5 : 1 }}
                              >Reject & refund</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>

            <section>
              <h2 className="text-[9px] uppercase px-1 mb-2" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.1em' }}>
                Recent ({recent.length})
              </h2>
              <div className="rounded-[12px] overflow-hidden" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)' }}>
                {recent.length === 0 ? (
                  <div className="px-4 py-6 text-center text-[11px]" style={{ color: 'var(--color-text-muted)' }}>No recent activity.</div>
                ) : (
                  recent.map((r, i) => (
                    <div key={r.id} className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: i < recent.length - 1 ? '0.5px solid var(--color-pill-bg)' : 'none' }}>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] truncate" style={{ color: 'var(--color-text)' }}>{r.project_name}</div>
                        <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{r.country}</div>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: r.status === 'delivered' ? 'var(--color-amber-light)' : 'var(--color-pill-bg)', color: r.status === 'delivered' ? 'var(--color-amber)' : 'var(--color-text-muted)' }}>{r.status}</span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}

        <div className="text-center pt-4">
          <a href="/admin" style={{ color: 'var(--color-text-secondary)', fontSize: 10, textDecoration: 'underline' }}>← Back to main admin</a>
        </div>
      </div>
    </div>
  )
}
