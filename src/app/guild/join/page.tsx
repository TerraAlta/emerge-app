'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { FLOWER_PETALS, CLIMATE_ZONES, PROJECT_SCALES } from '@/lib/flower-petals'
import GuildChatScreen from '@/components/GuildChatScreen'
import UrlPrepStep from '@/components/UrlPrepStep'

type Step = 'intro' | 'basic' | 'fork' | 'url_prep' | 'interview' | 'review' | 'done'

interface ExtractedProfile {
  tagline?: string
  bio?: string
  specialties?: string[]
  climate_zones_worked?: string[]
  project_scales?: string[]
  years_experience?: number
  pdc_certified?: boolean
  advanced_certifications?: string
  rate_range?: string
  notable_projects?: string[]
  languages_detected?: string[]
  regions_experienced?: string[]
}

interface Message { role: 'user' | 'assistant'; content: string }

const COMMON_LANGUAGES = [
  'English', 'Spanish', 'Portuguese', 'French', 'German', 'Italian',
  'Dutch', 'Polish', 'Arabic', 'Hindi', 'Mandarin', 'Japanese', 'Swahili',
]

export default function GuildJoinPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('intro')
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Step 1: basic info
  const [displayName, setDisplayName] = useState('')
  const [country, setCountry] = useState('')
  const [languages, setLanguages] = useState<string[]>(['English'])
  const [customLanguage, setCustomLanguage] = useState('')
  const [petals, setPetals] = useState<string[]>([])

  // Step 2/3: interview + extraction
  const [practitionerId, setPractitionerId] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<Message[]>([])
  const [extracting, setExtracting] = useState(false)
  const [profile, setProfile] = useState<ExtractedProfile | null>(null)

  // URL pre-ingest context (passed to AI interview + extraction)
  const [prepContextText, setPrepContextText] = useState('')

  // Check auth on mount
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.push('/')
        return
      }
      setUserId(data.user.id)

      // If they already have a practitioner profile, pre-fill everything
      // and jump straight to review so they can edit instead of redoing the
      // whole onboarding.
      const { data: existing } = await supabase
        .from('guild_practitioners')
        .select('*')
        .eq('user_id', data.user.id)
        .maybeSingle()

      if (existing) {
        setPractitionerId(existing.id)
        setDisplayName(existing.display_name || '')
        setCountry(existing.country || '')
        setLanguages(existing.languages || ['English'])
        setPetals(existing.flower_petals || [])
        setProfile({
          tagline: existing.tagline || '',
          bio: existing.bio || '',
          specialties: existing.specialties || [],
          climate_zones_worked: existing.climate_zones_worked || [],
          project_scales: existing.project_scales || [],
          years_experience: existing.years_experience || 0,
          pdc_certified: existing.pdc_certified || false,
          advanced_certifications: existing.advanced_certifications || '',
          rate_range: existing.rate_range || '',
        })
        setStep('review')
        setLoading(false)
        return
      }

      // New practitioner — prefill display name from their Emerge profile
      const { data: p } = await supabase
        .from('profiles')
        .select('first_name')
        .eq('id', data.user.id)
        .single()
      if (p?.first_name) setDisplayName(p.first_name)
      setLoading(false)
    })
  }, [router])

  function toggleLanguage(lang: string) {
    setLanguages(prev => prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang])
  }

  function addCustomLanguage() {
    const lang = customLanguage.trim()
    if (lang && !languages.includes(lang)) {
      setLanguages([...languages, lang])
      setCustomLanguage('')
    }
  }

  function togglePetal(key: string) {
    setPetals(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key])
  }

  async function submitBasicInfo() {
    setError('')
    if (!displayName.trim()) { setError('Please share your name'); return }
    if (!country.trim()) { setError('Please share your country'); return }
    if (languages.length === 0) { setError('Please select at least one language'); return }
    if (petals.length === 0) { setError('Please select at least one area of practice'); return }
    if (!userId) return

    setLoading(true)
    // Create the practitioner row (unverified, will be filled by extraction)
    const { data, error: dbErr } = await supabase
      .from('guild_practitioners')
      .insert({
        user_id: userId,
        display_name: displayName.trim(),
        country: country.trim(),
        languages,
        flower_petals: petals,
        availability_status: 'available',
        verified: false,
      })
      .select()
      .single()

    setLoading(false)
    if (dbErr) {
      // Maybe they already have a profile — check
      const { data: existing } = await supabase
        .from('guild_practitioners')
        .select()
        .eq('user_id', userId)
        .single()
      if (existing) {
        setPractitionerId(existing.id)
        // Update their basic info
        await supabase.from('guild_practitioners')
          .update({ display_name: displayName.trim(), country: country.trim(), languages, flower_petals: petals })
          .eq('id', existing.id)
        setStep('fork')
        return
      }
      setError(dbErr.message)
      return
    }

    setPractitionerId(data.id)
    setStep('fork')
  }

  function chooseAIPath() {
    setStep('url_prep')
  }

  function chooseManualPath() {
    // Skip AI entirely — go to review with empty extracted profile
    setProfile({
      tagline: '',
      bio: '',
      specialties: [],
      climate_zones_worked: [],
      project_scales: [],
    })
    setStep('review')
  }

  function handleUrlPrepDone(result: { combinedText: string }) {
    setPrepContextText(result.combinedText)
    setStep('interview')
  }

  async function handleInterviewComplete(finalTranscript: Message[]) {
    setTranscript(finalTranscript)
    setStep('review')
    setExtracting(true)
    setError('')

    // Save raw transcript
    if (practitionerId) {
      await supabase.from('guild_practitioner_interviews').insert({
        practitioner_id: practitionerId,
        transcript: finalTranscript,
      })
    }

    // Call extraction API
    try {
      const res = await fetch('/api/guild/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, practitionerId, transcript: finalTranscript, prep_context_text: prepContextText }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Extraction failed')
      }
      const { profile: extracted } = await res.json()
      setProfile(extracted)
    } catch (err: any) {
      setError(err.message || 'Failed to extract profile. You can still edit manually.')
      // Provide empty profile so user can fill manually
      setProfile({
        tagline: '',
        bio: '',
        specialties: [],
        climate_zones_worked: [],
        project_scales: [],
      })
    } finally {
      setExtracting(false)
    }
  }

  async function saveProfile() {
    if (!profile || !practitionerId) return
    setLoading(true)
    setError('')

    const { error: dbErr } = await supabase
      .from('guild_practitioners')
      .update({
        tagline: profile.tagline || '',
        bio: profile.bio || '',
        specialties: profile.specialties || [],
        climate_zones_worked: profile.climate_zones_worked || [],
        project_scales: profile.project_scales || [],
        years_experience: profile.years_experience || 0,
        pdc_certified: profile.pdc_certified || false,
        advanced_certifications: profile.advanced_certifications || '',
        rate_range: profile.rate_range || '',
      })
      .eq('id', practitionerId)

    setLoading(false)
    if (dbErr) { setError(dbErr.message); return }

    // Fire-and-forget admin notification — don't block the user if it fails
    try {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess?.session?.access_token
      if (token) {
        void fetch('/api/guild/notify-admin-pending-practitioner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ practitionerId }),
        }).catch(() => {})
      }
    } catch {
      // ignore — notification is best-effort
    }

    setStep('done')
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

        {step !== 'interview' && step !== 'done' && (
          <div className="mb-5">
            <h1
              className="font-heading text-[28px] font-light leading-tight mb-2"
              style={{ color: 'var(--color-text)' }}
            >
              Join the <em style={{ color: 'var(--color-amber)' }}>Guild</em>
            </h1>
            <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
              A network of regenerative practitioners. Free listing, always.
            </p>
          </div>
        )}

        {/* STEP: INTRO */}
        {step === 'intro' && (
          <div className="space-y-5">
            <div
              className="rounded-2xl p-5"
              style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)' }}
            >
              <h3 className="font-heading text-[18px] font-light mb-2" style={{ color: 'var(--color-text)' }}>
                How this works
              </h3>
              <ol className="space-y-3 text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                <li><strong style={{ color: 'var(--color-text)' }}>1.</strong> A few basic questions (2 min)</li>
                <li><strong style={{ color: 'var(--color-text)' }}>2.</strong> A warm AI interview — 10 to 15 questions about your practice (~15 min)</li>
                <li><strong style={{ color: 'var(--color-text)' }}>3.</strong> Review the profile the AI drew from your words — edit freely</li>
                <li><strong style={{ color: 'var(--color-text)' }}>4.</strong> We verify your profile personally and publish you to the directory</li>
              </ol>
            </div>
            <div
              className="rounded-2xl p-5"
              style={{ background: 'var(--color-amber-light)', border: '0.5px solid var(--color-amber-border)' }}
            >
              <p className="text-[13px] italic" style={{ color: 'var(--color-text)' }}>
                &ldquo;Free listing, always. No bidding, no commission on your work.
                The Guild exists so practitioners can be found — not extracted from.&rdquo;
              </p>
            </div>
            <button
              onClick={() => setStep('basic')}
              className="w-full py-3.5 rounded-full text-[14px] font-semibold"
              style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)', border: 'none', cursor: 'pointer' }}
            >
              Begin
            </button>
          </div>
        )}

        {/* STEP: BASIC INFO */}
        {step === 'basic' && (
          <div className="space-y-5">
            <div>
              <label className="text-[12px] mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>
                Your name
              </label>
              <input
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="e.g. Ana Silva"
                className="w-full rounded-lg px-3 py-2.5 text-[14px]"
                style={inputStyle}
              />
            </div>

            <div>
              <label className="text-[12px] mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>
                Country you are based in
              </label>
              <input
                value={country}
                onChange={e => setCountry(e.target.value)}
                placeholder="e.g. Portugal"
                className="w-full rounded-lg px-3 py-2.5 text-[14px]"
                style={inputStyle}
              />
            </div>

            <div>
              <label className="text-[12px] mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>
                Languages you work in
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {COMMON_LANGUAGES.map(lang => (
                  <button
                    key={lang}
                    onClick={() => toggleLanguage(lang)}
                    className="rounded-full px-3 py-1.5 text-[12px] transition-all"
                    style={{
                      background: languages.includes(lang) ? 'var(--color-amber)' : 'var(--color-pill-bg)',
                      color: languages.includes(lang) ? 'var(--color-pill-active-text)' : 'var(--color-text-secondary)',
                      border: '0.5px solid var(--color-amber-border)',
                      cursor: 'pointer',
                    }}
                  >
                    {lang}
                  </button>
                ))}
                {languages.filter(l => !COMMON_LANGUAGES.includes(l)).map(lang => (
                  <button
                    key={lang}
                    onClick={() => toggleLanguage(lang)}
                    className="rounded-full px-3 py-1.5 text-[12px]"
                    style={{
                      background: 'var(--color-amber)',
                      color: 'var(--color-pill-active-text)',
                      border: '0.5px solid var(--color-amber-border)',
                      cursor: 'pointer',
                    }}
                  >
                    {lang} ×
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={customLanguage}
                  onChange={e => setCustomLanguage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomLanguage())}
                  placeholder="Add another language..."
                  className="flex-1 rounded-lg px-3 py-2 text-[13px]"
                  style={inputStyle}
                />
                <button
                  onClick={addCustomLanguage}
                  className="rounded-lg px-4 text-[12px]"
                  style={{
                    background: 'var(--color-pill-bg)',
                    border: '0.5px solid var(--color-amber-border)',
                    color: 'var(--color-text)',
                    cursor: 'pointer',
                  }}
                >
                  Add
                </button>
              </div>
            </div>

            <div>
              <label className="text-[12px] mb-2 block" style={{ color: 'var(--color-text-secondary)' }}>
                Which petals of the permaculture flower do you work in?
              </label>
              <div className="space-y-2">
                {FLOWER_PETALS.map(petal => (
                  <button
                    key={petal.key}
                    onClick={() => togglePetal(petal.key)}
                    className="w-full text-left rounded-xl p-3 transition-all"
                    style={{
                      background: petals.includes(petal.key) ? 'var(--color-amber-light)' : 'var(--color-card)',
                      border: `0.5px solid ${petals.includes(petal.key) ? petal.color : 'var(--color-border)'}`,
                      cursor: 'pointer',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: petal.color }}></span>
                      <span className="text-[14px] font-medium" style={{ color: 'var(--color-text)' }}>{petal.label}</span>
                    </div>
                    <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                      {petal.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-[12px] text-center" style={{ color: 'var(--color-error)' }}>{error}</p>
            )}

            <button
              onClick={submitBasicInfo}
              disabled={loading}
              className="w-full py-3 rounded-full text-[14px] font-semibold"
              style={{
                background: 'var(--color-amber)',
                color: 'var(--color-pill-active-text)',
                border: 'none',
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.5 : 1,
              }}
            >
              {loading ? 'Saving...' : 'Continue to interview →'}
            </button>
          </div>
        )}

        {/* STEP: FORK — AI or manual */}
        {step === 'fork' && (
          <div className="space-y-4">
            <div>
              <h2 className="font-heading text-[22px] font-light mb-2" style={{ color: 'var(--color-text)' }}>
                How would you like to write your profile?
              </h2>
              <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                Both paths end in the same reviewable profile. Pick whichever feels easier.
              </p>
            </div>
            <button
              onClick={chooseAIPath}
              className="w-full rounded-2xl p-5 text-left transition-all active:scale-[0.99]"
              style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)', cursor: 'pointer' }}
            >
              <h3 className="font-heading text-[17px] font-light mb-1" style={{ color: 'var(--color-text)' }}>Let the AI interview me</h3>
              <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                A warm conversation, ~5–15 questions. Share URLs (CV, project page, portfolio) first for a much shorter interview.
              </p>
            </button>
            <button
              onClick={chooseManualPath}
              className="w-full rounded-2xl p-5 text-left transition-all active:scale-[0.99]"
              style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)', cursor: 'pointer' }}
            >
              <h3 className="font-heading text-[17px] font-light mb-1" style={{ color: 'var(--color-text)' }}>Fill the profile myself</h3>
              <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                Skip the AI entirely. Type directly into the profile form.
              </p>
            </button>
          </div>
        )}

        {/* STEP: URL PREP */}
        {step === 'url_prep' && (
          <UrlPrepStep
            onDone={handleUrlPrepDone}
            title="Share a page about your work (optional)"
            subtitle="Paste up to 3 URLs — your personal site, a project page, a CV, a portfolio. I'll read them first so the interview is much shorter. Skip to just chat."
          />
        )}

        {/* STEP: INTERVIEW */}
        {step === 'interview' && userId && (
          <div>
            <div className="mb-3">
              <h2 className="font-heading text-[22px] font-light mb-1" style={{ color: 'var(--color-text)' }}>
                The <em style={{ color: 'var(--color-amber)' }}>interview</em>
              </h2>
              <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                Take your time. There are no wrong answers. The AI will ask 10-15 adaptive questions.
              </p>
            </div>
            <GuildChatScreen
              endpoint="/api/guild/interview"
              userId={userId}
              extraBody={{ petals, prep_context_text: prepContextText }}
              onComplete={handleInterviewComplete}
            />
          </div>
        )}

        {/* STEP: REVIEW */}
        {step === 'review' && (
          <div className="space-y-4">
            <h2 className="font-heading text-[24px] font-light" style={{ color: 'var(--color-text)' }}>
              Your <em style={{ color: 'var(--color-amber)' }}>profile</em>
            </h2>
            <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
              This is what the AI drew from your words. Edit anything freely.
            </p>

            {extracting && (
              <div className="rounded-xl p-5 text-center" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)' }}>
                <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                  Reading your story... this takes about 20 seconds.
                </p>
              </div>
            )}

            {profile && !extracting && (
              <>
                <div>
                  <label className="text-[12px] mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>
                    Tagline (one-line summary)
                  </label>
                  <input
                    value={profile.tagline || ''}
                    onChange={e => setProfile({ ...profile, tagline: e.target.value })}
                    maxLength={120}
                    className="w-full rounded-lg px-3 py-2.5 text-[14px]"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label className="text-[12px] mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>
                    Bio
                  </label>
                  <textarea
                    value={profile.bio || ''}
                    onChange={e => setProfile({ ...profile, bio: e.target.value })}
                    rows={8}
                    className="w-full rounded-lg px-3 py-2.5 text-[13px] leading-relaxed"
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>

                <div>
                  <label className="text-[12px] mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>
                    Specialties
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {(profile.specialties || []).map((s, i) => (
                      <div
                        key={i}
                        className="rounded-full px-3 py-1 text-[12px] flex items-center gap-1.5"
                        style={{ background: 'var(--color-amber-light)', border: '0.5px solid var(--color-amber-border)', color: 'var(--color-text)' }}
                      >
                        {s}
                        <button
                          onClick={() => setProfile({ ...profile, specialties: (profile.specialties || []).filter((_, j) => j !== i) })}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                  <input
                    placeholder="Type specialty, press Enter to add"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                        e.preventDefault()
                        setProfile({ ...profile, specialties: [...(profile.specialties || []), e.currentTarget.value.trim()] })
                        e.currentTarget.value = ''
                      }
                    }}
                    className="w-full rounded-lg px-3 py-2 text-[13px] mt-2"
                    style={inputStyle}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[12px] mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>
                      Years of experience
                    </label>
                    <input
                      type="number"
                      value={profile.years_experience || 0}
                      onChange={e => setProfile({ ...profile, years_experience: parseInt(e.target.value) || 0 })}
                      className="w-full rounded-lg px-3 py-2 text-[13px]"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="text-[12px] mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>
                      Rate range (optional)
                    </label>
                    <input
                      value={profile.rate_range || ''}
                      onChange={e => setProfile({ ...profile, rate_range: e.target.value })}
                      placeholder="e.g. EUR 50-100/hr"
                      className="w-full rounded-lg px-3 py-2 text-[13px]"
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: 'var(--color-text)' }}>
                    <input
                      type="checkbox"
                      checked={profile.pdc_certified || false}
                      onChange={e => setProfile({ ...profile, pdc_certified: e.target.checked })}
                    />
                    PDC certified
                  </label>
                </div>

                <div>
                  <label className="text-[12px] mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>
                    Advanced certifications (optional)
                  </label>
                  <input
                    value={profile.advanced_certifications || ''}
                    onChange={e => setProfile({ ...profile, advanced_certifications: e.target.value })}
                    placeholder="e.g. Diploma of Applied Permaculture Design"
                    className="w-full rounded-lg px-3 py-2 text-[13px]"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label className="text-[12px] mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>
                    Project scales you work at
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {PROJECT_SCALES.map(scale => (
                      <button
                        key={scale}
                        onClick={() => {
                          const current = profile.project_scales || []
                          setProfile({
                            ...profile,
                            project_scales: current.includes(scale)
                              ? current.filter(s => s !== scale)
                              : [...current, scale],
                          })
                        }}
                        className="rounded-full px-3 py-1.5 text-[11px]"
                        style={{
                          background: (profile.project_scales || []).includes(scale) ? 'var(--color-amber)' : 'var(--color-pill-bg)',
                          color: (profile.project_scales || []).includes(scale) ? 'var(--color-pill-active-text)' : 'var(--color-text-secondary)',
                          border: '0.5px solid var(--color-amber-border)',
                          cursor: 'pointer',
                        }}
                      >
                        {scale}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[12px] mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>
                    Climate zones you have worked in
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {CLIMATE_ZONES.map(zone => (
                      <button
                        key={zone}
                        onClick={() => {
                          const current = profile.climate_zones_worked || []
                          setProfile({
                            ...profile,
                            climate_zones_worked: current.includes(zone)
                              ? current.filter(z => z !== zone)
                              : [...current, zone],
                          })
                        }}
                        className="rounded-full px-3 py-1.5 text-[11px]"
                        style={{
                          background: (profile.climate_zones_worked || []).includes(zone) ? 'var(--color-amber)' : 'var(--color-pill-bg)',
                          color: (profile.climate_zones_worked || []).includes(zone) ? 'var(--color-pill-active-text)' : 'var(--color-text-secondary)',
                          border: '0.5px solid var(--color-amber-border)',
                          cursor: 'pointer',
                        }}
                      >
                        {zone}
                      </button>
                    ))}
                  </div>
                </div>

                {error && (
                  <p className="text-[12px] text-center" style={{ color: 'var(--color-error)' }}>{error}</p>
                )}

                <button
                  onClick={saveProfile}
                  disabled={loading}
                  className="w-full py-3 rounded-full text-[14px] font-semibold"
                  style={{
                    background: 'var(--color-amber)',
                    color: 'var(--color-pill-active-text)',
                    border: 'none',
                    cursor: loading ? 'default' : 'pointer',
                    opacity: loading ? 0.5 : 1,
                  }}
                >
                  {loading ? 'Saving...' : 'Submit for verification'}
                </button>
              </>
            )}
          </div>
        )}

        {/* STEP: DONE */}
        {step === 'done' && (
          <div className="text-center space-y-5 py-10">
            <div
              className="w-16 h-16 rounded-full mx-auto flex items-center justify-center"
              style={{ background: 'var(--color-amber-light)', border: '1px solid var(--color-amber-border)' }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-amber)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h2 className="font-heading text-[26px] font-light" style={{ color: 'var(--color-text)' }}>
              Welcome, <em style={{ color: 'var(--color-amber)' }}>practitioner</em>
            </h2>
            <p className="text-[14px] leading-relaxed max-w-sm mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
              Your profile is with us for personal review. We typically verify within a few days
              and will email you when you&rsquo;re live in the directory.
            </p>
            <div className="pt-4">
              <button
                onClick={() => router.push('/guild')}
                className="rounded-full px-8 py-3 text-[13px] font-medium"
                style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)', border: 'none', cursor: 'pointer' }}
              >
                Browse the directory
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
