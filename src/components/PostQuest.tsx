'use client'

import { useState, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'

const PinMap = dynamic(() => import('./PinMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full rounded-[12px] flex items-center justify-center" style={{ background: '#162814' }}>
      <span className="text-[10px]" style={{ color: 'rgba(232,242,224,0.25)' }}>Loading map...</span>
    </div>
  ),
})

const TYPES = [
  { key: 'food', label: 'Harvest', emoji: '\u{1F33F}' },
  { key: 'craft', label: 'Build', emoji: '\u{1F3D7}\u{FE0F}' },
  { key: 'learning', label: 'Teach', emoji: '\u{1F4D6}' },
  { key: 'community', label: 'Gather', emoji: '\u{1F3B5}' },
  { key: 'nature', label: 'Restore', emoji: '\u{2728}' },
  { key: 'wellness', label: 'Repair', emoji: '\u{1F527}' },
] as const

interface Props {
  userId: string
  onBack: () => void
  onSuccess: () => void
}

export default function PostQuest({ userId, onBack, onSuccess }: Props) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('')
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

  // Slide in
  useState(() => { requestAnimationFrame(() => setAnimateIn(true)) })

  function handleBack() {
    setAnimateIn(false)
    setTimeout(onBack, 200)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    // Validate
    if (!title.trim()) { setError('Give your quest a title.'); return }
    if (!type) { setError('Pick a quest type.'); return }
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
      category: type,
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
            <span className="text-[11px]" style={{ color: 'rgba(232,242,224,0.4)' }}>Back</span>
          </button>
          <span className="text-[11px] font-medium" style={{ color: 'rgba(232,242,224,0.35)' }}>New quest</span>
          <div className="w-[50px]" />
        </div>

        {/* Header */}
        <div className="px-4 pt-2 pb-4">
          <h1 className="font-heading text-[22px] font-light leading-tight" style={{ color: '#E8F2E0' }}>
            Plant a <em className="text-emerge-dawn">quest</em>
          </h1>
          <p className="text-[11px] mt-1" style={{ color: 'rgba(232,242,224,0.4)' }}>
            Something real for your community to do together.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-4 space-y-4">

          {/* Title */}
          <div>
            <label className="text-[10px] uppercase block mb-1.5" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.08em' }}>
              Quest title
            </label>
            <input
              type="text"
              placeholder="Food forest harvest — Sintra hills"
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'rgba(200,145,58,0.6)'}
              onBlur={e => e.target.style.borderColor = 'rgba(200,145,58,0.2)'}
            />
          </div>

          {/* Type pills */}
          <div>
            <label className="text-[10px] uppercase block mb-1.5" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.08em' }}>
              Quest type
            </label>
            <div className="flex flex-wrap gap-1.5">
              {TYPES.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setType(t.key)}
                  className="px-3 py-1.5 rounded-full text-[11px] font-medium transition-all"
                  style={{
                    background: type === t.key ? '#C8913A' : '#162814',
                    color: type === t.key ? '#0D1A0B' : 'rgba(232,242,224,0.5)',
                    border: type === t.key ? '0.5px solid #C8913A' : '0.5px solid rgba(200,145,58,0.15)',
                  }}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] uppercase block mb-1.5" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.08em' }}>
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
              <label className="text-[10px] uppercase block mb-1.5" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.08em' }}>
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
              <label className="text-[10px] uppercase block mb-1.5" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.08em' }}>
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
            <label className="text-[10px] uppercase block mb-1.5" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.08em' }}>
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

          {/* Pin map */}
          <div>
            <label className="text-[10px] uppercase block mb-1.5" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.08em' }}>
              Drop a pin {pin ? '\u2014 tap to move' : '\u2014 tap the map'}
            </label>
            <div
              className="h-[160px] rounded-[12px] overflow-hidden"
              style={{ border: '0.5px solid rgba(200,145,58,0.15)' }}
            >
              <PinMap pin={pin} onPin={setPin} />
            </div>
            {pin && (
              <p className="text-[9px] mt-1" style={{ color: 'rgba(232,242,224,0.3)' }}>
                {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
              </p>
            )}
          </div>

          {/* Spots */}
          <div>
            <label className="text-[10px] uppercase block mb-1.5" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.08em' }}>
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
            <label className="text-[10px] uppercase block mb-1.5" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.08em' }}>
              Cost
            </label>
            <div className="flex gap-2 mb-2">
              {(['free', 'paid'] as const).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCostType(c)}
                  className="px-4 py-1.5 rounded-full text-[11px] font-medium transition-all"
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
            <p className="text-[10px] leading-relaxed" style={{ color: 'rgba(232,242,224,0.35)' }}>
              {'\u{1F6E1}\u{FE0F}'} Location will be shown as approximate until someone joins.
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
            {submitting ? 'Planting...' : 'Post quest'}
          </button>

        </form>
      </div>
    </div>
  )
}
