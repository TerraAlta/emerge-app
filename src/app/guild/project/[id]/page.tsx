'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { FLOWER_PETALS } from '@/lib/flower-petals'

interface ProjectRow {
  id: string
  client_user_id: string
  project_name: string
  country: string
  region: string
  status: string
  paid: boolean
  extracted_brief: any
  created_at: string
}

interface ScopingDocRow {
  id: string
  project_id: string
  doc_content: any
  matched_practitioner_ids: string[]
  matching_reasoning: any
  approved_at: string | null
}

interface PractitionerRow {
  id: string
  display_name: string
  tagline: string
  bio: string
  country: string
  region: string
  languages: string[]
  flower_petals: string[]
  specialties: string[]
}

export default function GuildProjectPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const projectId = params?.id as string
  const justSubmitted = searchParams.get('submitted') === '1' || searchParams.get('paid') === '1'

  const [loading, setLoading] = useState(true)
  const [project, setProject] = useState<ProjectRow | null>(null)
  const [doc, setDoc] = useState<ScopingDocRow | null>(null)
  const [practitioners, setPractitioners] = useState<Record<string, PractitionerRow>>({})
  const [error, setError] = useState('')
  const [submitLoading, setSubmitLoading] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) {
      router.push('/?auth=signin')
      return
    }

    const { data: p, error: pErr } = await supabase
      .from('guild_projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (pErr || !p) {
      setError('Project not found or you do not have access.')
      setLoading(false)
      return
    }
    setProject(p as ProjectRow)

    // Fetch doc only if status has moved past scoping (doc exists) — client will only see it if approved (RLS)
    if (p.status === 'matched' || p.status === 'delivered' || p.status === 'closed') {
      const { data: d } = await supabase
        .from('guild_scoping_docs')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle()
      if (d) {
        setDoc(d as ScopingDocRow)
        const ids = d.matched_practitioner_ids || []
        if (ids.length > 0) {
          const { data: prs } = await supabase
            .from('guild_practitioners')
            .select('id, display_name, tagline, bio, country, region, languages, flower_petals, specialties')
            .in('id', ids)
          const map: Record<string, PractitionerRow> = {}
          ;(prs || []).forEach((pr: any) => { map[pr.id] = pr })
          setPractitioners(map)
        }
      }
    }

    setLoading(false)
  }

  useEffect(() => { if (projectId) void load() }, [projectId])

  async function submitForScoping() {
    if (!project) return
    setSubmitLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/guild/submit-for-scoping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ projectId: project.id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Could not submit project')
      }
      router.replace(`/guild/project/${project.id}?submitted=1`)
      await load()
    } catch (err: any) {
      setError(err.message || 'Submission failed')
      setSubmitLoading(false)
    }
  }

  function petalLabel(key: string): string {
    return FLOWER_PETALS.find(p => p.key === key)?.label || key
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>Loading...</p>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6" style={{ background: 'var(--color-bg)' }}>
        <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>{error || 'Not found'}</p>
        <button onClick={() => router.push('/guild')} className="text-[12px] underline" style={{ color: 'var(--color-amber)', background: 'none', border: 'none', cursor: 'pointer' }}>
          Back to Guild
        </button>
      </div>
    )
  }

  const brief = project.extracted_brief || {}
  const isApproved = !!doc?.approved_at
  const isPendingReview = project.status === 'matched' && !isApproved
  const isScoping = project.status === 'scoping'
  const canSubmit = project.status === 'intake' && project.extracted_brief && Object.keys(project.extracted_brief).length > 0

  return (
    <div className="min-h-screen font-body flex justify-center" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full relative flex flex-col" style={{ maxWidth: 720, minHeight: '100dvh', padding: '24px 20px 40px' }}>

        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.push('/guild')} className="text-[13px]" style={{ color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>
            ← Back to Guild
          </button>
        </div>

        <div className="mb-6">
          <h1 className="font-heading text-[30px] font-light leading-tight" style={{ color: 'var(--color-text)' }}>
            {project.project_name || 'Your project'}
          </h1>
          {brief.tagline && (
            <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>{brief.tagline}</p>
          )}
        </div>

        {justSubmitted && (isPendingReview || isScoping) && (
          <div className="rounded-2xl p-4 mb-5" style={{ background: 'var(--color-amber-light)', border: '0.5px solid var(--color-amber-border)' }}>
            <p className="text-[13px]" style={{ color: 'var(--color-text)' }}>
              Thank you. Your scoping document is being drafted and will be personally reviewed before we send it — usually within 2 days. You will receive an email when it is ready.
            </p>
          </div>
        )}

        {isScoping && !justSubmitted && (
          <div className="rounded-2xl p-6 mb-5 text-center" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)' }}>
            <p className="text-[14px]" style={{ color: 'var(--color-text)' }}>Drafting your scoping document...</p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>Refresh in a minute.</p>
          </div>
        )}

        {isPendingReview && (
          <div className="rounded-2xl p-5 mb-5" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)' }}>
            <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-amber)' }}>In review</div>
            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text)' }}>
              Your doc is drafted and with us for personal review. We typically deliver within 2 days. You will get an email.
            </p>
          </div>
        )}

        {/* The preview / brief (always visible to owner) */}
        {brief && Object.keys(brief).length > 0 && (
          <section className="mb-6">
            <h2 className="font-heading text-[20px] font-light mb-3" style={{ color: 'var(--color-text)' }}>
              What <em style={{ color: 'var(--color-amber)' }}>we heard</em>
            </h2>
            <div className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)' }}>
              {brief.site_context && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Site</div>
                  <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text)' }}>{brief.site_context}</p>
                </div>
              )}
              {brief.vision && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Vision</div>
                  <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text)' }}>{brief.vision}</p>
                </div>
              )}
              {(brief.values && brief.values.length > 0) && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Values</div>
                  <div className="flex flex-wrap gap-1.5">
                    {brief.values.map((v: string, i: number) => (
                      <span key={i} className="rounded-full px-2.5 py-1 text-[11px]" style={{ background: 'var(--color-amber-light)', border: '0.5px solid var(--color-amber-border)', color: 'var(--color-text)' }}>{v}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Submit CTA if intake done but not yet submitted for scoping */}
        {canSubmit && (
          <div className="rounded-2xl p-5 space-y-3 mb-5" style={{ background: 'var(--color-amber-light)', border: '0.5px solid var(--color-amber-border)' }}>
            <h3 className="font-heading text-[18px] font-light" style={{ color: 'var(--color-text)' }}>The full scoping document</h3>
            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text)' }}>
              We will draft the full doc — site reading, design principles, phased approach, and 2-6 matched practitioners with reasoning.
            </p>
            <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              Free while we grow the Guild. The network is small today — expect a few matches, not many. Personally reviewed before delivery, usually within 2 days.
            </p>
            <button
              onClick={submitForScoping}
              disabled={submitLoading}
              className="w-full py-3 rounded-full text-[14px] font-semibold"
              style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)', border: 'none', cursor: submitLoading ? 'default' : 'pointer', opacity: submitLoading ? 0.5 : 1 }}
            >{submitLoading ? 'Submitting...' : 'Submit for scoping'}</button>
          </div>
        )}

        {/* FULL DOC — only when approved */}
        {isApproved && doc?.doc_content && (
          <section className="space-y-6">
            <div>
              <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-amber)' }}>Scoping document</div>
              <h2 className="font-heading text-[24px] font-light leading-tight" style={{ color: 'var(--color-text)' }}>
                {doc.doc_content.title || project.project_name}
              </h2>
            </div>

            {doc.doc_content.executive_summary && (
              <div>
                <h3 className="font-heading text-[16px] font-light mb-2" style={{ color: 'var(--color-text)' }}>Summary</h3>
                <p className="text-[13px] leading-relaxed whitespace-pre-line" style={{ color: 'var(--color-text)' }}>
                  {doc.doc_content.executive_summary}
                </p>
              </div>
            )}

            {doc.doc_content.site_reading && (
              <div>
                <h3 className="font-heading text-[16px] font-light mb-2" style={{ color: 'var(--color-text)' }}>Site reading</h3>
                <p className="text-[13px] leading-relaxed whitespace-pre-line" style={{ color: 'var(--color-text)' }}>
                  {doc.doc_content.site_reading}
                </p>
              </div>
            )}

            {doc.doc_content.design_principles?.length > 0 && (
              <div>
                <h3 className="font-heading text-[16px] font-light mb-2" style={{ color: 'var(--color-text)' }}>Design principles</h3>
                <ul className="space-y-1.5">
                  {doc.doc_content.design_principles.map((p: string, i: number) => (
                    <li key={i} className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text)' }}>· {p}</li>
                  ))}
                </ul>
              </div>
            )}

            {doc.doc_content.suggested_phases?.length > 0 && (
              <div>
                <h3 className="font-heading text-[16px] font-light mb-2" style={{ color: 'var(--color-text)' }}>Suggested phases</h3>
                <div className="space-y-3">
                  {doc.doc_content.suggested_phases.map((ph: any, i: number) => (
                    <div key={i} className="rounded-xl p-4" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)' }}>
                      <div className="text-[13px] font-semibold mb-1.5" style={{ color: 'var(--color-amber)' }}>{ph.phase_name}</div>
                      {ph.objectives?.length > 0 && (
                        <div className="mb-2">
                          <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Objectives</div>
                          <ul className="text-[12px] space-y-0.5" style={{ color: 'var(--color-text)' }}>
                            {ph.objectives.map((o: string, j: number) => <li key={j}>· {o}</li>)}
                          </ul>
                        </div>
                      )}
                      {ph.key_activities?.length > 0 && (
                        <div className="mb-2">
                          <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Activities</div>
                          <ul className="text-[12px] space-y-0.5" style={{ color: 'var(--color-text)' }}>
                            {ph.key_activities.map((a: string, j: number) => <li key={j}>· {a}</li>)}
                          </ul>
                        </div>
                      )}
                      {ph.practitioner_roles?.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Practitioner roles</div>
                          <div className="flex flex-wrap gap-1">
                            {ph.practitioner_roles.map((r: string, j: number) => (
                              <span key={j} className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: 'var(--color-amber-light)', color: 'var(--color-text)', border: '0.5px solid var(--color-amber-border)' }}>{r}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {doc.doc_content.practitioner_recommendations?.length > 0 && (
              <div>
                <h3 className="font-heading text-[16px] font-light mb-2" style={{ color: 'var(--color-text)' }}>Suggested practitioners from the Guild</h3>
                <div className="space-y-3">
                  {doc.doc_content.practitioner_recommendations.map((r: any, i: number) => {
                    const pr = practitioners[r.practitioner_id]
                    if (!pr) return null
                    return (
                      <div key={i} className="rounded-xl p-4" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)' }}>
                        <div className="text-[14px] font-semibold mb-0.5" style={{ color: 'var(--color-text)' }}>{pr.display_name}</div>
                        {pr.tagline && <div className="text-[12px] mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>{pr.tagline}</div>}
                        <div className="flex flex-wrap gap-1 mb-2">
                          {(pr.flower_petals || []).map((k, j) => (
                            <span key={j} className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: 'var(--color-pill-bg)', color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border)' }}>{petalLabel(k)}</span>
                          ))}
                        </div>
                        {r.suggested_role && (
                          <div className="text-[11px] mb-1" style={{ color: 'var(--color-amber)' }}>
                            Suggested role: {r.suggested_role}
                          </div>
                        )}
                        {r.why_this_match && (
                          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text)' }}>{r.why_this_match}</p>
                        )}
                        {r.phase && (
                          <div className="text-[10px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>Phase: {r.phase}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {doc.doc_content.risks_and_open_questions?.length > 0 && (
              <div>
                <h3 className="font-heading text-[16px] font-light mb-2" style={{ color: 'var(--color-text)' }}>Open questions</h3>
                <ul className="space-y-1">
                  {doc.doc_content.risks_and_open_questions.map((q: string, i: number) => (
                    <li key={i} className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>· {q}</li>
                  ))}
                </ul>
              </div>
            )}

            {doc.doc_content.closing_note && (
              <div className="rounded-2xl p-4" style={{ background: 'var(--color-amber-light)', border: '0.5px solid var(--color-amber-border)' }}>
                <p className="text-[13px] italic leading-relaxed" style={{ color: 'var(--color-text)' }}>{doc.doc_content.closing_note}</p>
              </div>
            )}

            <div className="text-center pt-4">
              <button
                onClick={() => window.print()}
                className="text-[12px] underline"
                style={{ color: 'var(--color-amber)', background: 'none', border: 'none', cursor: 'pointer' }}
              >Print / save as PDF</button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
