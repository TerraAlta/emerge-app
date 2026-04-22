'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import GuildChatScreen from '@/components/GuildChatScreen'
import UrlPrepStep from '@/components/UrlPrepStep'
import ManualBriefForm from '@/components/ManualBriefForm'

type Step = 'intro' | 'basic' | 'fork' | 'url_prep' | 'intake' | 'extracting' | 'manual_form' | 'preview'

interface Message { role: 'user' | 'assistant'; content: string }

interface ExtractedBrief {
  project_name?: string
  tagline?: string
  country?: string
  region?: string
  land_size_ha?: number | null
  climate_zone?: string
  project_scale?: string
  project_type?: string
  site_context?: string
  vision?: string
  story_fragment?: string
  stakeholders?: string
  timeline?: string
  constraints?: string[]
  values?: string[]
  help_sought?: string[]
  suggested_petals?: string[]
  languages?: string[]
}

export default function GuildProjectNewPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('intro')
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [projectName, setProjectName] = useState('')
  const [country, setCountry] = useState('')
  const [language, setLanguage] = useState('en')

  const [projectId, setProjectId] = useState<string | null>(null)
  const [brief, setBrief] = useState<ExtractedBrief | null>(null)
  const [prepContextText, setPrepContextText] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push('/?auth=signin')
        return
      }
      setUserId(data.user.id)
      setLoading(false)
    })
  }, [router])

  async function startProject() {
    setError('')
    if (!projectName.trim()) { setError('Give your project a working name'); return }
    if (!country.trim()) { setError('Where is the project located?'); return }
    if (!userId) return

    setLoading(true)
    const { data, error: dbErr } = await supabase
      .from('guild_projects')
      .insert({
        client_user_id: userId,
        project_name: projectName.trim(),
        country: country.trim(),
        language: language.trim() || 'en',
        status: 'intake',
      })
      .select()
      .single()
    setLoading(false)

    if (dbErr || !data) {
      setError(dbErr?.message || 'Could not create project')
      return
    }
    setProjectId(data.id)
    setStep('fork')
  }

  function chooseAIPath() { setStep('url_prep') }

  function chooseManualPath() {
    setBrief({
      project_name: projectName,
      country: country,
      languages: [language],
    })
    setStep('manual_form')
  }

  function handleUrlPrepDone(result: { combinedText: string }) {
    setPrepContextText(result.combinedText)
    setStep('intake')
  }

  /** Manual form → build an extracted_brief JSONB identical to what the AI
   *  would produce, persist it, and jump to preview. Stripe + generate-scoping
   *  are untouched.  */
  async function submitManualBrief(draft: ExtractedBrief) {
    if (!projectId) return
    setError('')
    setBrief(draft)
    await supabase
      .from('guild_projects')
      .update({
        extracted_brief: draft,
        project_name: draft.project_name || projectName,
        country: draft.country || country,
        region: draft.region || '',
        land_size_ha: draft.land_size_ha ?? null,
        project_type: draft.project_type || '',
        description: draft.tagline || '',
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)
    setStep('preview')
  }

  async function handleIntakeComplete(transcript: Message[]) {
    if (!projectId || !userId) return
    setStep('extracting')
    setError('')

    // Save transcript
    await supabase
      .from('guild_projects')
      .update({ intake_transcript: transcript, updated_at: new Date().toISOString() })
      .eq('id', projectId)

    // Extract brief
    try {
      const res = await fetch('/api/guild/extract-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, projectId, transcript, prep_context_text: prepContextText }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Extraction failed')
      }
      const { brief: extracted } = await res.json()
      setBrief(extracted)

      // Persist brief on project row
      await supabase
        .from('guild_projects')
        .update({
          extracted_brief: extracted,
          project_name: extracted.project_name || projectName,
          country: extracted.country || country,
          region: extracted.region || '',
          land_size_ha: extracted.land_size_ha ?? null,
          project_type: extracted.project_type || '',
          description: extracted.tagline || '',
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)

      setStep('preview')
    } catch (err: any) {
      setError(err.message || 'Could not read your intake. Your conversation is saved — you can continue later.')
      setStep('preview')
      setBrief({})
    }
  }

  async function startCheckout() {
    if (!projectId) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/guild/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Could not start checkout')
      }
      const { url } = await res.json()
      if (url) window.location.href = url
    } catch (err: any) {
      setError(err.message || 'Checkout failed')
      setLoading(false)
    }
  }

  if (loading && step === 'intro') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>Loading...</p>
      </div>
    )
  }

  const inputStyle = {
    background: 'var(--color-pill-bg)',
    border: '0.5px solid var(--color-amber-border)',
    color: 'var(--color-text)',
    outline: 'none',
  }

  return (
    <div className="min-h-screen font-body flex justify-center" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full relative flex flex-col" style={{ maxWidth: 640, minHeight: '100dvh', padding: '24px 20px 40px' }}>

        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push('/guild')}
            className="text-[13px]"
            style={{ color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
          >← Back to Guild</button>
        </div>

        {step === 'intro' && (
          <div className="space-y-5">
            <div>
              <h1 className="font-heading text-[28px] font-light leading-tight mb-2" style={{ color: 'var(--color-text)' }}>
                Commission a <em style={{ color: 'var(--color-amber)' }}>scoping</em>
              </h1>
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                A regenerative project is part site, part story, part people. This is how we begin to read all three.
              </p>
            </div>

            <div className="rounded-2xl p-5" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)' }}>
              <h3 className="font-heading text-[18px] font-light mb-3" style={{ color: 'var(--color-text)' }}>How it works</h3>
              <ol className="space-y-3 text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                <li><strong style={{ color: 'var(--color-text)' }}>1.</strong> Share the basics (1 min)</li>
                <li><strong style={{ color: 'var(--color-text)' }}>2.</strong> A warm AI intake — 10 to 15 questions about your land, vision, and what you are looking for (~15 min)</li>
                <li><strong style={{ color: 'var(--color-text)' }}>3.</strong> We show you a free preview of what we heard</li>
                <li><strong style={{ color: 'var(--color-text)' }}>4.</strong> If it resonates, pay <strong style={{ color: 'var(--color-amber)' }}>€40</strong> for the full scoping document with suggested practitioners</li>
                <li><strong style={{ color: 'var(--color-text)' }}>5.</strong> Each doc is personally reviewed before we send it — usually within 2 days</li>
              </ol>
            </div>

            <div className="rounded-2xl p-5" style={{ background: 'var(--color-amber-light)', border: '0.5px solid var(--color-amber-border)' }}>
              <p className="text-[13px] italic leading-relaxed" style={{ color: 'var(--color-text)' }}>
                The scoping doc is our only revenue. Practitioners never pay to be listed and we take nothing from the work you commission with them. If the doc is not useful, we refund you.
              </p>
            </div>

            <button
              onClick={() => setStep('basic')}
              className="w-full py-3.5 rounded-full text-[14px] font-semibold"
              style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)', border: 'none', cursor: 'pointer' }}
            >Begin</button>
          </div>
        )}

        {step === 'basic' && (
          <div className="space-y-5">
            <h1 className="font-heading text-[24px] font-light" style={{ color: 'var(--color-text)' }}>
              The <em style={{ color: 'var(--color-amber)' }}>basics</em>
            </h1>
            <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>We only need three things to begin.</p>

            <div>
              <label className="text-[12px] mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Working name for this project</label>
              <input
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                placeholder="e.g. Quinta da Aveleira"
                className="w-full rounded-lg px-3 py-2.5 text-[14px]"
                style={inputStyle}
              />
            </div>

            <div>
              <label className="text-[12px] mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Country where the land is</label>
              <input
                value={country}
                onChange={e => setCountry(e.target.value)}
                placeholder="e.g. Portugal"
                className="w-full rounded-lg px-3 py-2.5 text-[14px]"
                style={inputStyle}
              />
            </div>

            <div>
              <label className="text-[12px] mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Preferred language</label>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-[14px]"
                style={inputStyle}
              >
                <option value="en">English</option>
                <option value="pt">Português</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="it">Italiano</option>
                <option value="nl">Nederlands</option>
              </select>
            </div>

            {error && <p className="text-[12px] text-center" style={{ color: 'var(--color-error)' }}>{error}</p>}

            <button
              onClick={startProject}
              disabled={loading}
              className="w-full py-3 rounded-full text-[14px] font-semibold"
              style={{
                background: 'var(--color-amber)',
                color: 'var(--color-pill-active-text)',
                border: 'none',
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.5 : 1,
              }}
            >{loading ? 'Saving...' : 'Continue to intake →'}</button>
          </div>
        )}

        {step === 'fork' && (
          <div className="space-y-4">
            <div>
              <h2 className="font-heading text-[22px] font-light mb-2" style={{ color: 'var(--color-text)' }}>
                How would you like to describe your project?
              </h2>
              <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                Both paths cost the same (€40) and produce the same scoping document with matched practitioners. The difference is only how you tell us about your land.
              </p>
            </div>
            <button
              onClick={chooseAIPath}
              className="w-full rounded-2xl p-5 text-left transition-all active:scale-[0.99]"
              style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)', cursor: 'pointer' }}
            >
              <h3 className="font-heading text-[17px] font-light mb-1" style={{ color: 'var(--color-text)' }}>
                Let the AI interview me
              </h3>
              <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                A warm conversation. You can share URLs first (site plans, past documents, your farm's website) so it asks fewer, sharper questions.
              </p>
            </button>
            <button
              onClick={chooseManualPath}
              className="w-full rounded-2xl p-5 text-left transition-all active:scale-[0.99]"
              style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)', cursor: 'pointer' }}
            >
              <h3 className="font-heading text-[17px] font-light mb-1" style={{ color: 'var(--color-text)' }}>
                Fill a form myself
              </h3>
              <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                Skip the AI chat. Type directly into the brief form. Your scoping document is still AI-generated after payment.
              </p>
            </button>
          </div>
        )}

        {step === 'url_prep' && (
          <UrlPrepStep
            onDone={handleUrlPrepDone}
            title="Got a page about your land or project?"
            subtitle="Paste up to 3 URLs — your farm's website, a design document, a past project writeup. I'll read them first so the intake interview is much shorter. Skip to chat directly."
          />
        )}

        {step === 'manual_form' && brief && (
          <ManualBriefForm
            initial={brief}
            onSubmit={submitManualBrief}
            onBack={() => setStep('fork')}
          />
        )}

        {step === 'intake' && userId && (
          <div>
            <div className="mb-3">
              <h2 className="font-heading text-[22px] font-light mb-1" style={{ color: 'var(--color-text)' }}>
                The <em style={{ color: 'var(--color-amber)' }}>intake</em>
              </h2>
              <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                Take your time. There are no wrong answers. Tell us what you are imagining.
              </p>
            </div>
            <GuildChatScreen
              endpoint="/api/guild/intake"
              userId={userId}
              extraBody={{ prep_context_text: prepContextText }}
              onComplete={handleIntakeComplete}
            />
          </div>
        )}

        {step === 'extracting' && (
          <div className="rounded-xl p-8 text-center" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)' }}>
            <p className="text-[13px] mb-2" style={{ color: 'var(--color-text)' }}>Reading your story...</p>
            <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>Takes about 30 seconds.</p>
          </div>
        )}

        {step === 'preview' && brief && (
          <div className="space-y-5">
            <div>
              <h1 className="font-heading text-[26px] font-light leading-tight" style={{ color: 'var(--color-text)' }}>
                What <em style={{ color: 'var(--color-amber)' }}>we heard</em>
              </h1>
              <p className="text-[12px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                A free preview. Edit-by-conversation only for now — if something is off, you can start over.
              </p>
            </div>

            <div className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)' }}>
              {brief.tagline && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>Project</div>
                  <div className="text-[16px]" style={{ color: 'var(--color-text)' }}>{brief.project_name}</div>
                  <div className="text-[13px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{brief.tagline}</div>
                </div>
              )}

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
                    {brief.values.map((v, i) => (
                      <span key={i} className="rounded-full px-2.5 py-1 text-[11px]" style={{ background: 'var(--color-amber-light)', border: '0.5px solid var(--color-amber-border)', color: 'var(--color-text)' }}>{v}</span>
                    ))}
                  </div>
                </div>
              )}

              {(brief.help_sought && brief.help_sought.length > 0) && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Help sought</div>
                  <ul className="text-[13px] space-y-0.5" style={{ color: 'var(--color-text)' }}>
                    {brief.help_sought.map((h, i) => <li key={i}>· {h}</li>)}
                  </ul>
                </div>
              )}
            </div>

            <div className="rounded-2xl p-5 space-y-3" style={{ background: 'var(--color-amber-light)', border: '0.5px solid var(--color-amber-border)' }}>
              <h3 className="font-heading text-[18px] font-light" style={{ color: 'var(--color-text)' }}>
                The full scoping document
              </h3>
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text)' }}>
                A structured scoping doc — site reading, regenerative design principles, phased approach, and 2-6 practitioners from the Guild matched to your project with reasoning.
              </p>
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                Personally reviewed before delivery. If the doc is not useful, we refund you.
              </p>
              <button
                onClick={startCheckout}
                disabled={loading}
                className="w-full py-3 rounded-full text-[14px] font-semibold mt-2"
                style={{
                  background: 'var(--color-amber)',
                  color: 'var(--color-pill-active-text)',
                  border: 'none',
                  cursor: loading ? 'default' : 'pointer',
                  opacity: loading ? 0.5 : 1,
                }}
              >{loading ? 'Opening checkout...' : 'Unlock full scoping — €40'}</button>
            </div>

            {error && <p className="text-[12px] text-center" style={{ color: 'var(--color-error)' }}>{error}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
