'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { FLOWER_PETALS } from '@/lib/flower-petals'
import { isAdminEmail } from '@/lib/admin-emails'

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
  region?: string
  status: string
  updated_at: string
  client_email?: string | null
  extracted_brief?: any
  doc?: any
}

interface PendingPractitioner {
  id: string
  display_name: string | null
  tagline: string | null
  bio: string | null
  country: string | null
  region: string | null
  languages: string[] | null
  flower_petals: string[] | null
  specialties: string[] | null
  climate_zones_worked: string[] | null
  project_scales: string[] | null
  years_experience: number | null
  pdc_certified: boolean | null
  advanced_certifications: string | null
  rate_range: string | null
  email: string | null
  created_at: string
}

interface RecentPractitioner {
  id: string
  display_name: string | null
  country: string | null
  updated_at: string
}

interface PendingPitch {
  id: string
  title: string | null
  one_line_vision: string | null
  vision_long: string | null
  offering: string | null
  stage: string | null
  commitment_level: string | null
  country: string | null
  region: string | null
  language: string | null
  flower_petals: string[] | null
  roles_sought: string[] | null
  seed_capital_range: string | null
  contact_method: string | null
  contact_value: string | null
  hero_image_url: string | null
  email: string | null
  created_at: string
  updated_at: string
}

interface RecentPitch {
  id: string
  title: string | null
  country: string | null
  status: string
  published_at: string | null
}

type TabKey = 'practitioners' | 'pitches' | 'consultations'

export default function AdminGuildPage() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [tab, setTab] = useState<TabKey>('practitioners')
  const [error, setError] = useState('')

  // Practitioners
  const [practLoading, setPractLoading] = useState(true)
  const [pendingPracts, setPendingPracts] = useState<PendingPractitioner[]>([])
  const [recentPracts, setRecentPracts] = useState<RecentPractitioner[]>([])

  // Pitches
  const [pitchLoading, setPitchLoading] = useState(true)
  const [pendingPitches, setPendingPitches] = useState<PendingPitch[]>([])
  const [recentPitches, setRecentPitches] = useState<RecentPitch[]>([])

  // Consultations (scoping docs — existing flow)
  const [consultLoading, setConsultLoading] = useState(true)
  const [pendingProjects, setPendingProjects] = useState<PendingProject[]>([])
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const ok = isAdminEmail(data.user?.email)
      setAuthed(ok)
      if (ok) {
        void loadPractitioners()
        void loadPitches()
        void loadConsultations()
      }
    })
  }, [])

  async function authHeader(): Promise<Record<string, string>> {
    const { data: sess } = await supabase.auth.getSession()
    const token = sess?.session?.access_token
    return token ? { authorization: `Bearer ${token}` } : {}
  }

  async function loadPractitioners() {
    setPractLoading(true)
    try {
      const res = await fetch('/api/guild/admin/pending-practitioners', { headers: await authHeader() })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load practitioners')
      const json = await res.json()
      setPendingPracts(json.pending || [])
      setRecentPracts(json.recent || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setPractLoading(false)
    }
  }

  async function loadPitches() {
    setPitchLoading(true)
    try {
      const res = await fetch('/api/guild/admin/pending-pitches', { headers: await authHeader() })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load pitches')
      const json = await res.json()
      setPendingPitches(json.pending || [])
      setRecentPitches(json.recent || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setPitchLoading(false)
    }
  }

  async function loadConsultations() {
    setConsultLoading(true)
    try {
      const res = await fetch('/api/guild/admin/pending', { headers: await authHeader() })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load consultations')
      const json = await res.json()
      setPendingProjects(json.pending || [])
      setRecentProjects(json.recent || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setConsultLoading(false)
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

  /* ── Practitioner actions ── */
  async function approvePractitioner(id: string, name: string) {
    if (!confirm(`Approve ${name || 'this practitioner'}? They will receive an email letting them know they're live in the directory.`)) return
    setActionLoading(id)
    try {
      const res = await fetch('/api/guild/admin/approve-practitioner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ practitionerId: id }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Approve failed')
      await loadPractitioners()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setActionLoading(null)
    }
  }

  /* ── Pitch actions ── */
  async function approvePitch(id: string, title: string) {
    if (!confirm(`Approve "${title || 'this pitch'}"? It will go live in the directory and the owner will be emailed.`)) return
    setActionLoading(id)
    try {
      const res = await fetch('/api/guild/admin/approve-pitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ pitchId: id }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Approve failed')
      await loadPitches()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setActionLoading(null)
    }
  }

  /* ── Consultation actions (existing) ── */
  async function approveProject(projectId: string) {
    if (!confirm('Approve this scoping doc? The client will receive an email with the link.')) return
    setActionLoading(projectId)
    try {
      const res = await fetch('/api/guild/admin/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ projectId }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Approve failed')
      await loadConsultations()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setActionLoading(null)
    }
  }

  async function rejectProject(projectId: string) {
    const reason = prompt('Reason for rejection (shown to client):')
    if (reason === null) return
    if (!confirm('Reject this scoping doc? (If the project was paid, a full Stripe refund will be issued automatically. Free projects close without refund.)')) return
    setActionLoading(projectId)
    try {
      const res = await fetch('/api/guild/admin/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ projectId, reason }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Reject failed')
      await loadConsultations()
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
          Approve practitioners, pitches, and consultation scoping docs
        </p>
      </div>

      {/* Tabs */}
      <div className="px-6 pb-4">
        <div
          className="inline-flex rounded-[10px] p-0.5 flex-wrap"
          style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)' }}
        >
          {([
            { key: 'practitioners' as const, label: 'Practitioners', count: pendingPracts.length },
            { key: 'pitches' as const, label: 'Pitches', count: pendingPitches.length },
            { key: 'consultations' as const, label: 'Consultations', count: pendingProjects.length },
          ]).map(t => {
            const isActive = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="px-4 py-2 rounded-[8px] text-[11px] font-medium transition-all flex items-center gap-1.5"
                style={{
                  background: isActive ? 'var(--color-amber-light)' : 'transparent',
                  color: isActive ? 'var(--color-amber)' : 'var(--color-text-secondary)',
                  letterSpacing: '0.04em',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {t.label}
                {t.count > 0 && (
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                    style={{
                      background: isActive ? 'var(--color-amber)' : 'var(--color-pill-bg)',
                      color: isActive ? 'var(--color-pill-active-text)' : 'var(--color-text-muted)',
                      lineHeight: 1,
                    }}
                  >{t.count}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="px-6 pb-12 space-y-6">
        {error && <p className="text-[12px] text-center" style={{ color: 'var(--color-error)' }}>{error}</p>}

        {/* PRACTITIONERS TAB */}
        {tab === 'practitioners' && (
          <>
            {practLoading && <p className="text-[12px] text-center py-10" style={{ color: 'var(--color-text-secondary)' }}>Loading...</p>}
            {!practLoading && (
              <>
                <section>
                  <h2 className="text-[9px] uppercase px-1 mb-2" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.1em' }}>
                    Pending review ({pendingPracts.length})
                  </h2>
                  {pendingPracts.length === 0 ? (
                    <div className="rounded-[12px] px-4 py-6 text-center text-[11px]" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                      Nothing pending right now.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {pendingPracts.map(p => {
                        const isExpanded = expanded.has(p.id)
                        return (
                          <div key={p.id} className="rounded-[12px] overflow-hidden" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)' }}>
                            <button
                              onClick={() => toggle(p.id)}
                              className="w-full text-left px-4 py-3 flex items-start justify-between gap-3"
                              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-[14px] font-medium truncate" style={{ color: 'var(--color-text)' }}>
                                  {p.display_name || '(unnamed)'}
                                </div>
                                <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--color-text-secondary)' }}>
                                  {p.tagline || '—'}
                                </div>
                                <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                                  {[p.country, p.region].filter(Boolean).join(' · ') || '?'}
                                  {p.email ? ` · ${p.email}` : ''}
                                </div>
                              </div>
                              <span style={{ color: 'var(--color-text-muted)' }}>{isExpanded ? '▴' : '▾'}</span>
                            </button>

                            {isExpanded && (
                              <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                                {p.bio && (
                                  <div className="pt-3">
                                    <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Bio</div>
                                    <p className="text-[12px] whitespace-pre-line leading-relaxed" style={{ color: 'var(--color-text)' }}>{p.bio}</p>
                                  </div>
                                )}
                                {p.flower_petals && p.flower_petals.length > 0 && (
                                  <div>
                                    <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Petals</div>
                                    <p className="text-[11px]" style={{ color: 'var(--color-text)' }}>{p.flower_petals.map(petalLabel).join(' · ')}</p>
                                  </div>
                                )}
                                {p.specialties && p.specialties.length > 0 && (
                                  <div>
                                    <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Specialties</div>
                                    <p className="text-[11px]" style={{ color: 'var(--color-text)' }}>{p.specialties.join(' · ')}</p>
                                  </div>
                                )}
                                {p.languages && p.languages.length > 0 && (
                                  <div>
                                    <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Languages</div>
                                    <p className="text-[11px]" style={{ color: 'var(--color-text)' }}>{p.languages.join(', ')}</p>
                                  </div>
                                )}
                                <div className="grid grid-cols-2 gap-2">
                                  {p.years_experience != null && p.years_experience > 0 && (
                                    <div>
                                      <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--color-text-muted)' }}>Experience</div>
                                      <p className="text-[11px]" style={{ color: 'var(--color-text)' }}>{p.years_experience} yrs{p.pdc_certified ? ' · PDC' : ''}</p>
                                    </div>
                                  )}
                                  {p.rate_range && (
                                    <div>
                                      <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--color-text-muted)' }}>Rate</div>
                                      <p className="text-[11px]" style={{ color: 'var(--color-text)' }}>{p.rate_range}</p>
                                    </div>
                                  )}
                                </div>
                                {p.advanced_certifications && (
                                  <div>
                                    <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--color-text-muted)' }}>Certs</div>
                                    <p className="text-[11px]" style={{ color: 'var(--color-text)' }}>{p.advanced_certifications}</p>
                                  </div>
                                )}
                                <div className="flex gap-2 pt-2">
                                  <button
                                    onClick={() => approvePractitioner(p.id, p.display_name || '')}
                                    disabled={actionLoading === p.id}
                                    className="flex-1 py-2 rounded-full text-[12px] font-semibold"
                                    style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)', border: 'none', cursor: 'pointer', opacity: actionLoading === p.id ? 0.5 : 1 }}
                                  >{actionLoading === p.id ? 'Working...' : 'Approve & email'}</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>

                <section>
                  <h2 className="text-[9px] uppercase px-1 mb-2" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.1em' }}>
                    Recently verified ({recentPracts.length})
                  </h2>
                  <div className="rounded-[12px] overflow-hidden" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)' }}>
                    {recentPracts.length === 0 ? (
                      <div className="px-4 py-6 text-center text-[11px]" style={{ color: 'var(--color-text-muted)' }}>None yet.</div>
                    ) : (
                      recentPracts.map((r, i) => (
                        <div key={r.id} className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: i < recentPracts.length - 1 ? '0.5px solid var(--color-pill-bg)' : 'none' }}>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] truncate" style={{ color: 'var(--color-text)' }}>{r.display_name || '(unnamed)'}</div>
                            <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{r.country || '—'}</div>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--color-amber-light)', color: 'var(--color-amber)' }}>verified</span>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </>
            )}
          </>
        )}

        {/* PITCHES TAB */}
        {tab === 'pitches' && (
          <>
            {pitchLoading && <p className="text-[12px] text-center py-10" style={{ color: 'var(--color-text-secondary)' }}>Loading...</p>}
            {!pitchLoading && (
              <>
                <section>
                  <h2 className="text-[9px] uppercase px-1 mb-2" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.1em' }}>
                    Pending review ({pendingPitches.length})
                  </h2>
                  {pendingPitches.length === 0 ? (
                    <div className="rounded-[12px] px-4 py-6 text-center text-[11px]" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                      Nothing pending right now.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {pendingPitches.map(p => {
                        const isExpanded = expanded.has(p.id)
                        return (
                          <div key={p.id} className="rounded-[12px] overflow-hidden" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)' }}>
                            <button
                              onClick={() => toggle(p.id)}
                              className="w-full text-left px-4 py-3 flex items-start justify-between gap-3"
                              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-[14px] font-medium truncate" style={{ color: 'var(--color-text)' }}>
                                  {p.title || '(untitled)'}
                                </div>
                                <div className="text-[11px] mt-0.5 truncate italic" style={{ color: 'var(--color-text-secondary)' }}>
                                  {p.one_line_vision || '—'}
                                </div>
                                <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                                  {[p.country, p.region].filter(Boolean).join(' · ') || '?'}
                                  {p.email ? ` · ${p.email}` : ''}
                                </div>
                              </div>
                              <span style={{ color: 'var(--color-text-muted)' }}>{isExpanded ? '▴' : '▾'}</span>
                            </button>

                            {isExpanded && (
                              <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                                {p.vision_long && (
                                  <div className="pt-3">
                                    <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Long vision</div>
                                    <p className="text-[12px] whitespace-pre-line leading-relaxed" style={{ color: 'var(--color-text)' }}>{p.vision_long}</p>
                                  </div>
                                )}
                                {p.offering && (
                                  <div>
                                    <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Offering</div>
                                    <p className="text-[12px] whitespace-pre-line leading-relaxed" style={{ color: 'var(--color-text)' }}>{p.offering}</p>
                                  </div>
                                )}
                                {p.flower_petals && p.flower_petals.length > 0 && (
                                  <div>
                                    <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Petals</div>
                                    <p className="text-[11px]" style={{ color: 'var(--color-text)' }}>{p.flower_petals.map(petalLabel).join(' · ')}</p>
                                  </div>
                                )}
                                {p.roles_sought && p.roles_sought.length > 0 && (
                                  <div>
                                    <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Roles sought</div>
                                    <p className="text-[11px]" style={{ color: 'var(--color-text)' }}>{p.roles_sought.join(' · ')}</p>
                                  </div>
                                )}
                                <div className="grid grid-cols-2 gap-2">
                                  {p.stage && (
                                    <div>
                                      <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--color-text-muted)' }}>Stage</div>
                                      <p className="text-[11px]" style={{ color: 'var(--color-text)' }}>{p.stage}</p>
                                    </div>
                                  )}
                                  {p.commitment_level && (
                                    <div>
                                      <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--color-text-muted)' }}>Commitment</div>
                                      <p className="text-[11px]" style={{ color: 'var(--color-text)' }}>{p.commitment_level}</p>
                                    </div>
                                  )}
                                  {p.language && (
                                    <div>
                                      <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--color-text-muted)' }}>Language</div>
                                      <p className="text-[11px]" style={{ color: 'var(--color-text)' }}>{p.language}</p>
                                    </div>
                                  )}
                                  {p.seed_capital_range && (
                                    <div>
                                      <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--color-text-muted)' }}>Capital</div>
                                      <p className="text-[11px]" style={{ color: 'var(--color-text)' }}>{p.seed_capital_range}</p>
                                    </div>
                                  )}
                                </div>
                                {p.contact_value && (
                                  <div>
                                    <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--color-text-muted)' }}>Contact ({p.contact_method || '—'})</div>
                                    <p className="text-[11px]" style={{ color: 'var(--color-text)' }}>{p.contact_value}</p>
                                  </div>
                                )}
                                <div>
                                  <a
                                    href={`/guild/pitch/${p.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[11px] underline"
                                    style={{ color: 'var(--color-amber)' }}
                                  >Preview as visitor →</a>
                                </div>
                                <div className="flex gap-2 pt-2">
                                  <button
                                    onClick={() => approvePitch(p.id, p.title || '')}
                                    disabled={actionLoading === p.id}
                                    className="flex-1 py-2 rounded-full text-[12px] font-semibold"
                                    style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)', border: 'none', cursor: 'pointer', opacity: actionLoading === p.id ? 0.5 : 1 }}
                                  >{actionLoading === p.id ? 'Working...' : 'Approve & publish'}</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>

                <section>
                  <h2 className="text-[9px] uppercase px-1 mb-2" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.1em' }}>
                    Recently published ({recentPitches.length})
                  </h2>
                  <div className="rounded-[12px] overflow-hidden" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)' }}>
                    {recentPitches.length === 0 ? (
                      <div className="px-4 py-6 text-center text-[11px]" style={{ color: 'var(--color-text-muted)' }}>None yet.</div>
                    ) : (
                      recentPitches.map((r, i) => (
                        <div key={r.id} className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: i < recentPitches.length - 1 ? '0.5px solid var(--color-pill-bg)' : 'none' }}>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] truncate" style={{ color: 'var(--color-text)' }}>{r.title || '(untitled)'}</div>
                            <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{r.country || '—'}</div>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--color-amber-light)', color: 'var(--color-amber)' }}>live</span>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </>
            )}
          </>
        )}

        {/* CONSULTATIONS TAB (existing scoping doc flow) */}
        {tab === 'consultations' && (
          <>
            {consultLoading && <p className="text-[12px] text-center py-10" style={{ color: 'var(--color-text-secondary)' }}>Loading...</p>}
            {!consultLoading && (
              <>
                <section>
                  <h2 className="text-[9px] uppercase px-1 mb-2" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.1em' }}>
                    Pending review ({pendingProjects.length})
                  </h2>

                  {pendingProjects.length === 0 && (
                    <div className="rounded-[12px] px-4 py-6 text-center text-[11px]" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                      Nothing pending right now.
                    </div>
                  )}

                  <div className="space-y-3">
                    {pendingProjects.map(p => {
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
                                    onClick={() => approveProject(p.id)}
                                    disabled={actionLoading === p.id}
                                    className="flex-1 py-2 rounded-full text-[12px] font-semibold"
                                    style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)', border: 'none', cursor: 'pointer', opacity: actionLoading === p.id ? 0.5 : 1 }}
                                  >{actionLoading === p.id ? 'Working...' : 'Approve & email'}</button>
                                  <button
                                    onClick={() => rejectProject(p.id)}
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
                    Recent ({recentProjects.length})
                  </h2>
                  <div className="space-y-2">
                    {recentProjects.length === 0 ? (
                      <div className="rounded-[12px] px-4 py-6 text-center text-[11px]" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)', color: 'var(--color-text-muted)' }}>No recent activity.</div>
                    ) : (
                      recentProjects.map(r => {
                        const isExpanded = expanded.has(r.id)
                        const doc = r.doc
                        return (
                          <div key={r.id} className="rounded-[12px] overflow-hidden" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)' }}>
                            <button
                              onClick={() => toggle(r.id)}
                              className="w-full text-left px-4 py-2.5 flex items-center justify-between gap-3"
                              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-[12px] truncate" style={{ color: 'var(--color-text)' }}>{r.project_name}</div>
                                <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{r.country}{r.client_email ? ` · ${r.client_email}` : ''}</div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: r.status === 'delivered' ? 'var(--color-amber-light)' : 'var(--color-pill-bg)', color: r.status === 'delivered' ? 'var(--color-amber)' : 'var(--color-text-muted)' }}>{r.status}</span>
                                <span style={{ color: 'var(--color-text-muted)' }}>{isExpanded ? '▴' : '▾'}</span>
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                                {!doc && (
                                  <p className="text-[11px] pt-3" style={{ color: 'var(--color-text-muted)' }}>
                                    No scoping doc on file for this project.
                                  </p>
                                )}

                                {doc?.doc_content && (
                                  <div className="space-y-3 pt-3">
                                    <div>
                                      <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Title</div>
                                      <p className="text-[13px]" style={{ color: 'var(--color-text)' }}>{doc.doc_content.title || r.project_name}</p>
                                    </div>
                                    {doc.doc_content.executive_summary && (
                                      <div>
                                        <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Summary</div>
                                        <p className="text-[12px] whitespace-pre-line leading-relaxed" style={{ color: 'var(--color-text)' }}>{doc.doc_content.executive_summary}</p>
                                      </div>
                                    )}
                                    {doc.doc_content.site_reading && (
                                      <div>
                                        <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Site reading</div>
                                        <p className="text-[12px] whitespace-pre-line leading-relaxed" style={{ color: 'var(--color-text)' }}>{doc.doc_content.site_reading}</p>
                                      </div>
                                    )}
                                    {doc.doc_content.design_principles?.length > 0 && (
                                      <div>
                                        <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Design principles</div>
                                        <ul className="text-[11px] space-y-0.5" style={{ color: 'var(--color-text)' }}>
                                          {doc.doc_content.design_principles.map((d: string, i: number) => <li key={i}>· {d}</li>)}
                                        </ul>
                                      </div>
                                    )}
                                    {doc.doc_content.suggested_phases?.length > 0 && (
                                      <div>
                                        <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Phases</div>
                                        <ul className="text-[11px] space-y-0.5" style={{ color: 'var(--color-text)' }}>
                                          {doc.doc_content.suggested_phases.map((ph: any, i: number) => <li key={i}>· {ph.phase_name}</li>)}
                                        </ul>
                                      </div>
                                    )}
                                    {doc.doc_content.practitioner_recommendations?.length > 0 && (
                                      <div>
                                        <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Matched practitioners</div>
                                        <ul className="text-[11px] space-y-0.5" style={{ color: 'var(--color-text)' }}>
                                          {doc.doc_content.practitioner_recommendations.map((rec: any, i: number) => (
                                            <li key={i}>· <strong>{rec.suggested_role}</strong> — {rec.why_this_match}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {doc.doc_content.closing_note && (
                                      <div>
                                        <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Closing note</div>
                                        <p className="text-[12px] italic whitespace-pre-line leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{doc.doc_content.closing_note}</p>
                                      </div>
                                    )}
                                    {doc.approved_at && (
                                      <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                                        Delivered {new Date(doc.approved_at).toLocaleDateString()}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </section>
              </>
            )}
          </>
        )}

        <div className="text-center pt-4">
          <a href="/admin" style={{ color: 'var(--color-text-secondary)', fontSize: 10, textDecoration: 'underline' }}>← Back to main admin</a>
        </div>
      </div>
    </div>
  )
}
