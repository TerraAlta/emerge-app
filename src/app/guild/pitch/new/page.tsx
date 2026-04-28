'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import GuildChatScreen from '@/components/GuildChatScreen'
import UrlPrepStep from '@/components/UrlPrepStep'
import PitchEditForm, { type PitchDraft } from '@/components/PitchEditForm'

type Step = 'intro' | 'fork' | 'url_prep' | 'interview' | 'extracting' | 'review' | 'publishing' | 'done'
interface Message { role: 'user' | 'assistant'; content: string }

const EMPTY_DRAFT: PitchDraft = {
  title: '',
  one_line_vision: '',
  vision_long: '',
  stage: 'idea',
  commitment_level: 'exploratory',
  country: '',
  region: '',
  target_region_flexibility: '',
  flower_petals: [],
  roles_sought: [],
  offering: '',
  seed_capital_range: '',
  language: 'en',
  contact_method: 'email',
  contact_value: '',
}

interface DraftSummary {
  id: string
  title: string
  one_line_vision: string
  updated_at: string
}

export default function GuildPitchNewPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('intro')
  const [userId, setUserId] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [error, setError] = useState('')

  // State across steps
  const [pitchId, setPitchId] = useState<string | null>(null)
  const [prepContextText, setPrepContextText] = useState('')
  const [prepUrls, setPrepUrls] = useState<string[]>([])
  const [transcript, setTranscript] = useState<Message[]>([])
  const [draft, setDraft] = useState<PitchDraft>(EMPTY_DRAFT)
  const [intakeMode, setIntakeMode] = useState<'ai_interview' | 'manual'>('ai_interview')

  // Resume support
  const [existingDrafts, setExistingDrafts] = useState<DraftSummary[]>([])

  useEffect(() => {
    async function init() {
      const { data: u } = await supabase.auth.getUser()
      if (!u.user) {
        router.push('/?auth=signin')
        return
      }
      setUserId(u.user.id)

      // Find any existing drafts for this user
      const { data: drafts } = await supabase
        .from('guild_pitches')
        .select('id, title, one_line_vision, updated_at')
        .eq('user_id', u.user.id)
        .eq('status', 'draft')
        .order('updated_at', { ascending: false })
        .limit(5)
      const list = (drafts as DraftSummary[]) || []
      setExistingDrafts(list)

      // ?resume=<id> auto-loads that specific draft
      const resumeId = new URLSearchParams(window.location.search).get('resume')
      if (resumeId && list.some(d => d.id === resumeId)) {
        await resumeDraft(resumeId)
      }

      setAuthLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  /** Load a saved draft pitch row into form state and jump to the review step. */
  async function resumeDraft(id: string) {
    setError('')
    const { data, error: dbErr } = await supabase
      .from('guild_pitches')
      .select('*')
      .eq('id', id)
      .single()
    if (dbErr || !data) {
      setError(dbErr?.message || 'Could not load draft')
      return
    }
    setPitchId(data.id)
    setIntakeMode(data.intake_mode === 'manual' ? 'manual' : 'ai_interview')
    setDraft({
      title: data.title || '',
      one_line_vision: data.one_line_vision || '',
      vision_long: data.vision_long || '',
      stage: data.stage || 'idea',
      commitment_level: data.commitment_level || 'exploratory',
      country: data.country || '',
      region: data.region || '',
      target_region_flexibility: data.target_region_flexibility || '',
      flower_petals: data.flower_petals || [],
      roles_sought: data.roles_sought || [],
      offering: data.offering || '',
      seed_capital_range: data.seed_capital_range || '',
      language: data.language || 'en',
      contact_method: data.contact_method === 'external_link' ? 'external_link' : 'email',
      contact_value: data.contact_value || '',
    })
    setStep('review')
  }

  /** Create a draft pitch row so we have an id to attach transcripts/matches to. */
  async function createDraftPitch(mode: 'ai_interview' | 'manual', urls: string[] = []): Promise<string | null> {
    if (!userId) return null
    const { data, error } = await supabase
      .from('guild_pitches')
      .insert({
        user_id: userId,
        title: '',
        status: 'draft',
        intake_mode: mode,
        prep_context_urls: urls,
      })
      .select('id')
      .single()
    if (error) { setError(error.message); return null }
    return data.id
  }

  async function chooseAIPath() {
    setIntakeMode('ai_interview')
    setStep('url_prep')
  }
  async function chooseManualPath() {
    setIntakeMode('manual')
    const id = await createDraftPitch('manual')
    if (id) {
      setPitchId(id)
      setDraft(EMPTY_DRAFT)
      setStep('review')
    }
  }

  async function handleUrlPrep(result: { urls: string[]; combinedText: string }) {
    setPrepUrls(result.urls)
    setPrepContextText(result.combinedText)
    const id = await createDraftPitch('ai_interview', result.urls)
    if (id) {
      setPitchId(id)
      setStep('interview')
    }
  }

  async function handleInterviewComplete(final: Message[]) {
    setTranscript(final)
    setStep('extracting')
    try {
      const res = await fetch('/api/guild/pitch/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          pitchId,
          transcript: final,
          prep_context_text: prepContextText,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Extraction failed')
      }
      const { pitch } = await res.json()
      setDraft({
        title: pitch.title || '',
        one_line_vision: pitch.one_line_vision || '',
        vision_long: pitch.vision_long || '',
        stage: pitch.stage || 'idea',
        commitment_level: pitch.commitment_level || 'exploratory',
        country: pitch.country || '',
        region: pitch.region || '',
        target_region_flexibility: pitch.target_region_flexibility || '',
        flower_petals: pitch.flower_petals || [],
        roles_sought: pitch.roles_sought || [],
        offering: pitch.offering || '',
        seed_capital_range: pitch.seed_capital_range || '',
        language: pitch.language || 'en',
        contact_method: pitch.contact_method === 'external_link' ? 'external_link' : 'email',
        contact_value: pitch.contact_value || '',
      })
      setStep('review')
    } catch (err: any) {
      setError(err?.message || 'Extraction failed — you can still edit manually.')
      setStep('review')
    }
  }

  async function saveDraft() {
    if (!pitchId) return
    setError('')
    const { error } = await supabase
      .from('guild_pitches')
      .update({
        title: draft.title.trim(),
        one_line_vision: draft.one_line_vision.trim(),
        vision_long: draft.vision_long.trim(),
        stage: draft.stage,
        commitment_level: draft.commitment_level,
        country: draft.country.trim(),
        region: draft.region.trim(),
        target_region_flexibility: draft.target_region_flexibility.trim(),
        flower_petals: draft.flower_petals,
        roles_sought: draft.roles_sought,
        offering: draft.offering.trim(),
        seed_capital_range: draft.seed_capital_range.trim(),
        language: draft.language || 'en',
        contact_method: draft.contact_method,
        contact_value: draft.contact_value.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', pitchId)
    if (error) setError(error.message)
  }

  async function publish() {
    if (!pitchId) return
    if (!draft.title.trim() || !draft.one_line_vision.trim()) {
      setError('Title and one-line vision are required.')
      return
    }
    setStep('publishing')
    setError('')
    await saveDraft()
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/guild/pitch/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ pitchId }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setError(err.error || 'Publish failed')
      setStep('review')
      return
    }
    setStep('done')
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen font-body flex justify-center" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full flex flex-col" style={{ maxWidth: 640, minHeight: '100dvh', padding: '24px 20px 40px' }}>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push('/guild')}
            className="text-[13px]"
            style={{ color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ← Back
          </button>
        </div>

        {step === 'intro' && (
          <div className="space-y-5">
            {existingDrafts.length > 0 && (
              <div className="rounded-2xl p-4" style={{ background: 'var(--color-amber-light)', border: '0.5px solid var(--color-amber-border)' }}>
                <p className="text-[12px] mb-2 font-semibold" style={{ color: 'var(--color-text)' }}>
                  You have {existingDrafts.length === 1 ? 'an unfinished pitch' : `${existingDrafts.length} unfinished pitches`}
                </p>
                <div className="space-y-1.5">
                  {existingDrafts.map(d => (
                    <button
                      key={d.id}
                      onClick={() => resumeDraft(d.id)}
                      className="w-full text-left rounded-lg px-3 py-2 transition-all active:scale-[0.99]"
                      style={{ background: 'var(--color-bg)', border: '0.5px solid var(--color-amber-border)', cursor: 'pointer' }}
                    >
                      <p className="text-[13px]" style={{ color: 'var(--color-text)' }}>
                        {d.title?.trim() || '(untitled)'}
                      </p>
                      {d.one_line_vision && (
                        <p className="text-[11px] mt-0.5 line-clamp-1" style={{ color: 'var(--color-text-secondary)' }}>
                          {d.one_line_vision}
                        </p>
                      )}
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                        Resume editing →
                      </p>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
                  Or scroll down to start a new pitch.
                </p>
              </div>
            )}

            <div>
              <h1 className="font-heading text-[28px] font-light leading-tight mb-2" style={{ color: 'var(--color-text)' }}>
                Share your <em style={{ color: 'var(--color-amber)' }}>seed</em>
              </h1>
              <p className="text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
                You have a vision. What you're missing is the people. Publish a free pitch; the Guild connects you to practitioners and other pitchers whose work overlaps with yours.
              </p>
            </div>

            <div className="rounded-2xl p-5" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)' }}>
              <h3 className="font-heading text-[16px] font-light mb-3" style={{ color: 'var(--color-text)' }}>
                How it works
              </h3>
              <ol className="space-y-2 text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                <li><strong style={{ color: 'var(--color-text)' }}>1.</strong> Choose AI interview OR fill a form yourself (your choice — both free)</li>
                <li><strong style={{ color: 'var(--color-text)' }}>2.</strong> Review and edit everything before publishing</li>
                <li><strong style={{ color: 'var(--color-text)' }}>3.</strong> Your pitch goes live with a shareable link</li>
                <li><strong style={{ color: 'var(--color-text)' }}>4.</strong> The Guild matches you to aligned practitioners and other pitchers</li>
                <li><strong style={{ color: 'var(--color-text)' }}>5.</strong> Pitches expire in 6 months unless you confirm them active</li>
              </ol>
            </div>

            <div className="rounded-2xl p-5" style={{ background: 'var(--color-amber-light)', border: '0.5px solid var(--color-amber-border)' }}>
              <p className="text-[13px] italic mb-2" style={{ color: 'var(--color-text)' }}>
                &ldquo;The real question isn't where is my land. It's who are my seven people, and what vessel will hold us together when things get hard.&rdquo;
              </p>
              <a
                href="/starting-your-dream-project.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] underline"
                style={{ color: 'var(--color-amber)' }}
              >
                Download our short guide: Starting Your Dream Project (PDF)
              </a>
            </div>

            <button
              onClick={() => setStep('fork')}
              className="w-full py-3.5 rounded-full text-[14px] font-semibold"
              style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)', border: 'none', cursor: 'pointer' }}
            >
              Begin
            </button>
          </div>
        )}

        {step === 'fork' && (
          <div className="space-y-4">
            <div>
              <h2 className="font-heading text-[22px] font-light mb-2" style={{ color: 'var(--color-text)' }}>
                How do you want to write it?
              </h2>
              <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                Both paths end in the same published pitch. Pick whichever feels easier.
              </p>
            </div>

            <button
              onClick={chooseAIPath}
              className="w-full rounded-2xl p-5 text-left transition-all active:scale-[0.99]"
              style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)', cursor: 'pointer' }}
            >
              <h3 className="font-heading text-[17px] font-light mb-1" style={{ color: 'var(--color-text)' }}>
                Let the AI ask you questions
              </h3>
              <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                A warm conversation, ~5–12 questions. You can share URLs first so it asks fewer, sharper questions.
              </p>
            </button>

            <button
              onClick={chooseManualPath}
              className="w-full rounded-2xl p-5 text-left transition-all active:scale-[0.99]"
              style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)', cursor: 'pointer' }}
            >
              <h3 className="font-heading text-[17px] font-light mb-1" style={{ color: 'var(--color-text)' }}>
                Fill it out yourself
              </h3>
              <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                Skip the AI entirely. Type directly into the pitch form.
              </p>
            </button>

            {error && <p className="text-[12px] text-center" style={{ color: 'var(--color-error)' }}>{error}</p>}
          </div>
        )}

        {step === 'url_prep' && userId && (
          <UrlPrepStep
            onDone={handleUrlPrep}
            title="Got a page about your project or yourself?"
            subtitle="Paste up to 3 URLs — your site, existing project, portfolio, CV. I'll read them first so the interview is much shorter. Skip to go straight to the chat."
          />
        )}

        {step === 'interview' && userId && pitchId && (
          <div>
            <div className="mb-3">
              <h2 className="font-heading text-[20px] font-light" style={{ color: 'var(--color-text)' }}>
                The <em style={{ color: 'var(--color-amber)' }}>interview</em>
              </h2>
              <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                {prepContextText ? 'I\'ve read what you shared. A few clarifying questions.' : 'Around 8-12 adaptive questions. Take your time.'}
              </p>
            </div>
            <GuildChatScreen
              endpoint="/api/guild/pitch/interview"
              userId={userId}
              extraBody={{ prep_context_text: prepContextText }}
              onComplete={handleInterviewComplete}
              placeholder="Share your answer..."
            />
          </div>
        )}

        {step === 'extracting' && (
          <div className="rounded-xl p-8 text-center" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)' }}>
            <p className="text-[13px] mb-2" style={{ color: 'var(--color-text)' }}>Reading your story...</p>
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Drafting your pitch. About 20 seconds.</p>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            <div>
              <h2 className="font-heading text-[22px] font-light mb-1" style={{ color: 'var(--color-text)' }}>
                Your <em style={{ color: 'var(--color-amber)' }}>pitch</em>
              </h2>
              <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                {intakeMode === 'ai_interview'
                  ? 'This is what I understood. Edit anything before submitting.'
                  : 'Fill in each field. Nothing goes live until you submit.'}
              </p>
            </div>

            <PitchEditForm value={draft} onChange={setDraft} />

            {error && <p className="text-[12px] text-center" style={{ color: 'var(--color-error)' }}>{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={saveDraft}
                className="rounded-full px-5 py-3 text-[13px]"
                style={{
                  background: 'transparent',
                  color: 'var(--color-text-secondary)',
                  border: '0.5px solid var(--color-border)',
                  cursor: 'pointer',
                }}
              >
                Save draft
              </button>
              <button
                onClick={publish}
                className="flex-1 py-3 rounded-full text-[14px] font-semibold"
                style={{
                  background: 'var(--color-amber)',
                  color: 'var(--color-pill-active-text)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Submit pitch
              </button>
            </div>
          </div>
        )}

        {step === 'publishing' && (
          <div className="rounded-xl p-8 text-center" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)' }}>
            <p className="text-[13px]" style={{ color: 'var(--color-text)' }}>Submitting your pitch for review...</p>
          </div>
        )}

        {step === 'done' && pitchId && (
          <div className="text-center space-y-5 py-10">
            <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center"
              style={{ background: 'var(--color-amber-light)', border: '1px solid var(--color-amber-border)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-amber)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h2 className="font-heading text-[26px] font-light" style={{ color: 'var(--color-text)' }}>
              Pitch <em style={{ color: 'var(--color-amber)' }}>submitted</em>
            </h2>
            <p className="text-[14px] leading-relaxed max-w-sm mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
              We personally review every pitch before it goes live in the Guild.
              You'll get an email once it's published, usually within a day or two.
            </p>
            <div className="flex gap-2 justify-center pt-2">
              <button
                onClick={() => router.push(`/guild/pitch/${pitchId}`)}
                className="rounded-full px-6 py-3 text-[13px] font-medium"
                style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)', border: 'none', cursor: 'pointer' }}
              >
                View public pitch
              </button>
              <button
                onClick={() => router.push('/guild/pitch/mine')}
                className="rounded-full px-6 py-3 text-[13px]"
                style={{ background: 'transparent', color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border)', cursor: 'pointer' }}
              >
                My pitches
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
