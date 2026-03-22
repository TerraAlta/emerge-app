'use client'

import { useState, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'

const PinMap = dynamic(() => import('./PinMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full rounded-[12px] flex items-center justify-center" style={{ background: '#162814' }}>
      <span className="text-[12px]" style={{ color: 'rgba(232,242,224,0.25)' }}>Loading map...</span>
    </div>
  ),
})

const FullScreenMap = dynamic(() => import('./FullScreenMap'), {
  ssr: false,
  loading: () => null,
})

const TYPES = [
  { key: 'food', label: 'Harvest', emoji: '🌾' },
  { key: 'craft', label: 'Build', emoji: '🏗️' },
  { key: 'learning', label: 'Teach', emoji: '📖' },
  { key: 'community', label: 'Gather', emoji: '🤝' },
  { key: 'nature', label: 'Restore', emoji: '✨' },
  { key: 'wellness', label: 'Repair', emoji: '🔧' },
  { key: 'play', label: 'Play', emoji: '🎵' },
  { key: 'make', label: 'Make', emoji: '🎨' },
] as const

type Mode = 'form' | 'url'

interface Props {
  userId: string
  onBack: () => void
  onSuccess: () => void
}

export default function PostQuest({ userId, onBack, onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>('form')
  const [title, setTitle] = useState('')
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [locationName, setLocationName] = useState('')
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null)
  const [spots, setSpots] = useState('')
  const [costType, setCostType] = useState<'free' | 'paid'>('free')
  const [costAmount, setCostAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [animateIn, setAnimateIn] = useState(false)
  const [showFullMap, setShowFullMap] = useState(false)

  // URL mode state
  const [url, setUrl] = useState('')
  const [urlStatus, setUrlStatus] = useState<'idle' | 'fetching' | 'scoring' | 'done' | 'error'>('idle')
  const [urlResult, setUrlResult] = useState<any>(null)

  const dropdownRef = useRef<HTMLDivElement>(null)

  // Slide in
  useEffect(() => { requestAnimationFrame(() => setAnimateIn(true)) }, [])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setTypeDropdownOpen(false)
      }
    }
    if (typeDropdownOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [typeDropdownOpen])

  function handleBack() {
    setAnimateIn(false)
    setTimeout(onBack, 200)
  }

  function toggleType(key: string) {
    setSelectedTypes(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
    setTypeDropdownOpen(false)
  }

  function removeType(key: string) {
    setSelectedTypes(prev => prev.filter(k => k !== key))
  }

  async function handleUrlSubmit() {
    if (!url.trim()) return
    setUrlStatus('fetching')
    setUrlResult(null)
    await new Promise(r => setTimeout(r, 400))
    setUrlStatus('scoring')
    try {
      const res = await fetch('/api/submit-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setUrlStatus('error')
        setUrlResult({ error: data.error ?? 'Something went wrong' })
        return
      }
      setUrlStatus('done')
      setUrlResult(data)
    } catch {
      setUrlStatus('error')
      setUrlResult({ error: 'Network error — please try again' })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!title.trim()) { setError('Give your quest a title.'); return }
    if (selectedTypes.length === 0) { setError('Pick at least one quest type.'); return }
    if (!description.trim()) { setError('Describe what people will do.'); return }
    if (!date) { setError('Choose a date.'); return }
    if (!time) { setError('Set a start time.'); return }
    if (!locationName.trim()) { setError('Name the meeting place.'); return }
    if (!pin) { setError('Drop a pin on the map for the location.'); return }

    setSubmitting(true)

    const startsAt = new Date(`${date}T${time}`).toISOString()

    const { error: dbError } = await supabase.from('quests').insert({
      title: title.trim(),
      description: description.trim(),
      category: selectedTypes[0],
      geog: `POINT(${pin.lng} ${pin.lat})`,
      address: locationName.trim(),
      starts_at: startsAt,
      source_name: 'user',
      source_url: null,
      ai_score: 0,
      ai_reasoning: '',
      max_participants: spots ? parseInt(spots) : null,
      created_by: userId,
    })

    if (dbError) {
      setError(dbError.message)
      setSubmitting(false)
      return
    }

    onSuccess()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 14px',
    borderRadius: 10,
    border: '0.5px solid rgba(200,145,58,0.2)',
    background: '#162814',
    color: '#E8F2E0',
    fontSize: 13,
    fontFamily: 'var(--font-outfit), sans-serif',
    outline: 'none',
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 font-body flex justify-center overflow-y-auto transition-transform duration-200 ease-out"
        style={{
          background: '#0D1A0B',
          color: '#E8F2E0',
          transform: animateIn ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        <div className="w-full pb-10" style={{ maxWidth: 390 }}>

          {/* Top bar */}
          <div className="flex items-center justify-between px-4 pb-2 sticky top-0 z-10" style={{ background: '#0D1A0B', paddingTop: 'calc(20px + var(--sat, 0px))' }}>
            <button onClick={handleBack} className="flex items-center gap-1.5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C8913A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
              </svg>
              <span className="text-[13px]" style={{ color: 'rgba(232,242,224,0.4)' }}>Back</span>
            </button>
            <span className="text-[13px] font-medium" style={{ color: 'rgba(232,242,224,0.35)' }}>New quest</span>
            <div className="w-[50px]" />
          </div>

          {/* Header */}
          <div className="px-4 pt-2 pb-4">
            <h1 className="font-heading text-[22px] font-light leading-tight" style={{ color: '#E8F2E0' }}>
              Add a <em style={{ color: '#C8913A' }}>quest</em>
            </h1>
            <p className="text-[13px] mt-1" style={{ color: 'rgba(232,242,224,0.4)' }}>
              Something real for your community to do together.
            </p>
          </div>

          {/* FIX 1 — Mode selector */}
          <div className="px-4 pb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setMode('form')}
              className="flex-1 rounded-[12px] px-3 py-3 text-left transition-all"
              style={{
                background: '#162814',
                border: mode === 'form' ? '1px solid #C8913A' : '0.5px solid rgba(200,145,58,0.15)',
              }}
            >
              <div className="text-[14px] mb-0.5">🌱</div>
              <div className="text-[13px] font-medium" style={{ color: '#E8F2E0' }}>Fill in the details</div>
              <div className="text-[11px]" style={{ color: 'rgba(232,242,224,0.35)' }}>Create a quest directly</div>
            </button>
            <button
              type="button"
              onClick={() => setMode('url')}
              className="flex-1 rounded-[12px] px-3 py-3 text-left transition-all"
              style={{
                background: '#162814',
                border: mode === 'url' ? '1px solid #C8913A' : '0.5px solid rgba(200,145,58,0.15)',
              }}
            >
              <div className="text-[14px] mb-0.5">🔗</div>
              <div className="text-[13px] font-medium" style={{ color: '#E8F2E0' }}>I have an event URL</div>
              <div className="text-[11px]" style={{ color: 'rgba(232,242,224,0.35)' }}>Eventbrite, Luma, your site...</div>
            </button>
          </div>

          {/* ═══════ URL MODE ═══════ */}
          {mode === 'url' && (
            <div className="px-4">
              <input
                type="url"
                placeholder="https://..."
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && urlStatus === 'idle' && handleUrlSubmit()}
                disabled={urlStatus === 'fetching' || urlStatus === 'scoring'}
                className="w-full rounded-xl px-4 py-3.5 text-[13px] outline-none"
                style={{ background: '#162814', color: '#E8F2E0', border: '0.5px solid rgba(200,145,58,0.2)' }}
              />

              {(urlStatus === 'idle' || urlStatus === 'error' || urlStatus === 'done') && (
                <button
                  onClick={handleUrlSubmit}
                  disabled={!url.trim()}
                  className="w-full mt-3 py-3 rounded-full text-[13px] font-semibold transition-opacity disabled:opacity-40"
                  style={{ background: '#C8913A', color: '#0D1A0B' }}
                >
                  Fetch details
                </button>
              )}

              {urlStatus === 'fetching' && (
                <div className="mt-6 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#C8913A' }} />
                  <span className="text-[12px]" style={{ color: 'rgba(232,242,224,0.5)' }}>Fetching event details&hellip;</span>
                </div>
              )}
              {urlStatus === 'scoring' && (
                <div className="mt-6 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#C8913A' }} />
                  <span className="text-[12px]" style={{ color: 'rgba(232,242,224,0.5)' }}>Checking regenerative alignment&hellip;</span>
                </div>
              )}

              {urlStatus === 'done' && urlResult && (
                <div className="mt-6 rounded-xl px-4 py-4" style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.15)' }}>
                  {urlResult.approved && (
                    <>
                      <p className="text-[13px] font-medium mb-1" style={{ color: '#C8913A' }}>Your quest is live!</p>
                      <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(232,242,224,0.6)' }}>
                        &ldquo;{urlResult.title}&rdquo; will appear for people nearby.
                      </p>
                      <p className="text-[12px] mt-2 italic" style={{ color: 'rgba(232,242,224,0.3)' }}>
                        Score: {urlResult.score}/100 &middot; {urlResult.reason}
                      </p>
                    </>
                  )}
                  {urlResult.queued && (
                    <>
                      <p className="text-[13px] font-medium mb-1" style={{ color: '#E8F2E0' }}>We&apos;re reviewing it</p>
                      <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(232,242,224,0.6)' }}>
                        &ldquo;{urlResult.title}&rdquo; is queued for review — usually within 24h.
                      </p>
                    </>
                  )}
                  {!urlResult.approved && !urlResult.queued && (
                    <>
                      <p className="text-[13px] font-medium mb-1" style={{ color: '#E8F2E0' }}>Not quite right for Emerge</p>
                      <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(232,242,224,0.6)' }}>
                        {urlResult.reason}
                      </p>
                    </>
                  )}
                </div>
              )}

              {urlStatus === 'error' && urlResult?.error && (
                <div className="mt-6 rounded-xl px-4 py-3" style={{ background: '#162814', border: '0.5px solid rgba(200,80,60,0.3)' }}>
                  <p className="text-[12px]" style={{ color: 'rgba(232,242,224,0.6)' }}>{urlResult.error}</p>
                </div>
              )}
            </div>
          )}

          {/* ═══════ FORM MODE ═══════ */}
          {mode === 'form' && (
            <form onSubmit={handleSubmit} className="px-4 space-y-4">

              {/* FIX 2 — Title with "e.g." placeholder */}
              <div>
                <label className="text-[12px] uppercase block mb-1.5" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.08em' }}>
                  Quest title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Food forest harvest — Sintra hills"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'rgba(200,145,58,0.6)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(200,145,58,0.2)'}
                />
              </div>

              {/* FIX 3 — Multi-select type dropdown */}
              <div ref={dropdownRef}>
                <label className="text-[12px] uppercase block mb-1.5" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.08em' }}>
                  Quest type
                </label>
                <button
                  type="button"
                  onClick={() => setTypeDropdownOpen(!typeDropdownOpen)}
                  className="w-full text-left flex items-center justify-between"
                  style={{
                    ...inputStyle,
                    cursor: 'pointer',
                    color: selectedTypes.length > 0 ? '#E8F2E0' : 'rgba(232,242,224,0.35)',
                  }}
                >
                  <span className="text-[13px]">
                    {selectedTypes.length === 0
                      ? 'Select quest type(s)'
                      : `${selectedTypes.length} type${selectedTypes.length > 1 ? 's' : ''} selected`}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(232,242,224,0.4)" strokeWidth="2">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {typeDropdownOpen && (
                  <div
                    className="mt-1 rounded-[10px] overflow-hidden"
                    style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.25)' }}
                  >
                    {TYPES.map(t => {
                      const isSelected = selectedTypes.includes(t.key)
                      return (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => toggleType(t.key)}
                          className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                          style={{
                            background: isSelected ? 'rgba(200,145,58,0.1)' : 'transparent',
                            borderBottom: '0.5px solid rgba(232,242,224,0.04)',
                          }}
                        >
                          <span className="text-[12px]" style={{ color: '#E8F2E0' }}>
                            {t.emoji} {t.label}
                          </span>
                          {isSelected && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C8913A" strokeWidth="2.5">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Selected type pills */}
                {selectedTypes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {selectedTypes.map(key => {
                      const t = TYPES.find(x => x.key === key)
                      return (
                        <span
                          key={key}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-medium"
                          style={{ background: 'rgba(200,145,58,0.15)', color: '#C8913A', border: '0.5px solid rgba(200,145,58,0.3)' }}
                        >
                          {t?.emoji} {t?.label}
                          <button type="button" onClick={() => removeType(key)} className="ml-0.5 opacity-60 hover:opacity-100">&times;</button>
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="text-[12px] uppercase block mb-1.5" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.08em' }}>
                  What will people do?
                </label>
                <textarea
                  placeholder="Describe the quest — what happens, what to bring, who it's for..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={4}
                  style={{ ...inputStyle, resize: 'none' }}
                  onFocus={e => e.target.style.borderColor = 'rgba(200,145,58,0.6)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(200,145,58,0.2)'}
                />
              </div>

              {/* Date + Time */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[12px] uppercase block mb-1.5" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.08em' }}>
                    Date
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    style={{ ...inputStyle, colorScheme: 'dark' }}
                    onFocus={e => e.target.style.borderColor = 'rgba(200,145,58,0.6)'}
                    onBlur={e => e.target.style.borderColor = 'rgba(200,145,58,0.2)'}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[12px] uppercase block mb-1.5" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.08em' }}>
                    Time
                  </label>
                  <input
                    type="time"
                    value={time}
                    onChange={e => setTime(e.target.value)}
                    style={{ ...inputStyle, colorScheme: 'dark' }}
                    onFocus={e => e.target.style.borderColor = 'rgba(200,145,58,0.6)'}
                    onBlur={e => e.target.style.borderColor = 'rgba(200,145,58,0.2)'}
                  />
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="text-[12px] uppercase block mb-1.5" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.08em' }}>
                  Meeting place
                </label>
                <input
                  type="text"
                  placeholder="Community garden, park name, café..."
                  value={locationName}
                  onChange={e => setLocationName(e.target.value)}
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'rgba(200,145,58,0.6)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(200,145,58,0.2)'}
                />
              </div>

              {/* FIX 4 & 5 — Map: collapsed preview + full-screen expand (dark tiles) */}
              <div>
                <label className="text-[12px] uppercase block mb-1.5" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.08em' }}>
                  Location on map
                </label>
                <div
                  className="relative h-[160px] rounded-[12px] overflow-hidden cursor-pointer"
                  style={{ border: '0.5px solid rgba(200,145,58,0.15)' }}
                  onClick={() => setShowFullMap(true)}
                >
                  <PinMap pin={pin} onPin={() => setShowFullMap(true)} />
                  {/* Overlay button */}
                  <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(10,20,10,0.4)', pointerEvents: 'none' }}>
                    <div
                      className="px-4 py-2 rounded-full text-[12px] font-medium"
                      style={{ background: 'rgba(10,20,10,0.85)', color: '#C8913A', border: '0.5px solid rgba(200,145,58,0.4)' }}
                    >
                      📍 {pin ? 'Tap to move pin' : 'Tap to set location'}
                    </div>
                  </div>
                </div>
                {pin && (
                  <p className="text-[13px] mt-1" style={{ color: 'rgba(232,242,224,0.3)' }}>
                    {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
                  </p>
                )}
              </div>

              {/* Spots */}
              <div>
                <label className="text-[12px] uppercase block mb-1.5" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.08em' }}>
                  Spots available <span style={{ color: 'rgba(232,242,224,0.2)' }}>(optional)</span>
                </label>
                <input
                  type="number"
                  placeholder="Leave blank for unlimited"
                  value={spots}
                  onChange={e => setSpots(e.target.value)}
                  min={1}
                  max={500}
                  style={{ ...inputStyle, maxWidth: 200 }}
                  onFocus={e => e.target.style.borderColor = 'rgba(200,145,58,0.6)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(200,145,58,0.2)'}
                />
              </div>

              {/* Cost */}
              <div>
                <label className="text-[12px] uppercase block mb-1.5" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.08em' }}>
                  Cost
                </label>
                <div className="flex gap-2 mb-2">
                  {(['free', 'paid'] as const).map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCostType(c)}
                      className="px-4 py-1.5 rounded-full text-[13px] font-medium transition-all"
                      style={{
                        background: costType === c ? '#C8913A' : '#162814',
                        color: costType === c ? '#0D1A0B' : 'rgba(232,242,224,0.5)',
                        border: costType === c ? '0.5px solid #C8913A' : '0.5px solid rgba(200,145,58,0.15)',
                      }}
                    >
                      {c === 'free' ? 'Free' : 'Paid'}
                    </button>
                  ))}
                </div>
                {costType === 'paid' && (
                  <div className="flex items-center gap-2" style={{ maxWidth: 160 }}>
                    <span className="text-[14px]" style={{ color: 'rgba(232,242,224,0.4)' }}>&euro;</span>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={costAmount}
                      onChange={e => setCostAmount(e.target.value)}
                      min={0}
                      step={0.5}
                      style={inputStyle}
                      onFocus={e => e.target.style.borderColor = 'rgba(200,145,58,0.6)'}
                      onBlur={e => e.target.style.borderColor = 'rgba(200,145,58,0.2)'}
                    />
                  </div>
                )}
              </div>

              {/* Safety notes */}
              <div
                className="rounded-[12px] px-3.5 py-3"
                style={{ background: 'rgba(200,145,58,0.05)', border: '0.5px solid rgba(200,145,58,0.1)' }}
              >
                <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(232,242,224,0.35)' }}>
                  🛡️ Location will be shown as approximate until someone joins.
                  Your quest will be reviewed if flagged by the community.
                </p>
              </div>

              {/* Error */}
              {error && (
                <p className="text-[12px]" style={{ color: '#D4785A' }}>{error}</p>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-[12px] text-[14px] font-semibold transition-opacity"
                style={{
                  background: '#C8913A',
                  color: '#0D1A0B',
                  opacity: submitting ? 0.6 : 1,
                  letterSpacing: '0.02em',
                }}
              >
                {submitting ? 'Posting...' : 'Post quest'}
              </button>

            </form>
          )}
        </div>
      </div>

      {/* FIX 4 — Full-screen map overlay */}
      {showFullMap && (
        <FullScreenMap
          initialPin={pin}
          onConfirm={(p) => {
            setPin(p)
            setShowFullMap(false)
          }}
          onCancel={() => setShowFullMap(false)}
        />
      )}
    </>
  )
}
