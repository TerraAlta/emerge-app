'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import SharePopup from './SharePopup'
import { formatDateTime } from '@/lib/dateUtils'

const DetailMap = dynamic(() => import('./DetailMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full rounded-[12px] flex items-center justify-center" style={{ background: '#162814' }}>
      <span className="text-[12px]" style={{ color: 'rgba(232,242,224,0.25)' }}>Loading map...</span>
    </div>
  ),
})

interface Quest {
  id: string
  title: string
  description: string
  category: string
  address: string
  starts_at: string
  ends_at: string | null
  source_name: string
  source_url: string | null
  ai_score: number
  ai_reasoning: string
  max_participants: number | null
  lat: number
  lng: number
  distance_km: number
}

interface Participant {
  user_id: string
  first_name: string
  trust_level: string
}

const typeEmoji: Record<string, string> = {
  nature: '\u{1F33F}', food: '\u{1F33F}', craft: '\u{1F3D7}\u{FE0F}',
  community: '\u{1F3B5}', wellness: '\u{2728}', learning: '\u{1F4D6}',
}
const typeLabel: Record<string, string> = {
  nature: 'Forage', food: 'Harvest', craft: 'Build',
  community: 'Gather', wellness: 'Wellness', learning: 'Learn',
}

const trustBadge: Record<string, { label: string; color: string }> = {
  newcomer:    { label: 'Newcomer', color: 'rgba(232,242,224,0.3)' },
  participant: { label: 'Participant', color: '#8FBF7A' },
  contributor: { label: 'Contributor', color: '#C8913A' },
  steward:     { label: 'Steward', color: '#D4A054' },
}

// formatDateTime imported from @/lib/dateUtils

function formatDuration(start: string, end: string): string | null {
  const hours = Math.round((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60) * 10) / 10
  if (hours <= 0) return null // same time or invalid — hide duration
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)} day${Math.round(hours / 24) > 1 ? 's' : ''}`
}

/** Strip street number / exact address, keep neighbourhood + city */
function approximateLocation(address: string): string {
  if (!address) return 'Nearby'
  // Remove leading numbers and common address prefixes
  const parts = address.split(',').map(p => p.trim())
  // Keep only the last 2-3 parts (neighbourhood, city, country)
  if (parts.length >= 3) return parts.slice(-3).join(', ')
  if (parts.length >= 2) return parts.slice(-2).join(', ')
  return address
}

export default function QuestDetail({
  quest,
  userId,
  onBack,
  onNeedAuth,
}: {
  quest: Quest
  userId: string | null
  onBack: () => void
  onNeedAuth: () => void
}) {
  const [joined, setJoined] = useState(false)
  const [joining, setJoining] = useState(false)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)
  const [animateIn, setAnimateIn] = useState(false)
  const [showShare, setShowShare] = useState(false)

  // Slide-in animation
  useEffect(() => {
    requestAnimationFrame(() => setAnimateIn(true))
  }, [])

  // Fetch participants + check if user joined
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('quest_participants_public')
        .select('user_id, first_name, trust_level')
        .eq('quest_id', quest.id)

      const ppl = (data ?? []) as Participant[]
      setParticipants(ppl)

      if (userId) {
        setJoined(ppl.some(p => p.user_id === userId))
      }
      setLoading(false)
    }
    load()
  }, [quest.id, userId])

  async function handleJoin() {
    if (!userId) { onNeedAuth(); return }
    if (joined) return
    setJoining(true)

    const { error } = await supabase
      .from('quest_participants')
      .insert({ quest_id: quest.id, user_id: userId })

    if (!error) {
      setJoined(true)
      // Refresh participants
      const { data } = await supabase
        .from('quest_participants_public')
        .select('user_id, first_name, trust_level')
        .eq('quest_id', quest.id)
      setParticipants((data ?? []) as Participant[])
    }
    setJoining(false)
  }

  async function handleLeave() {
    if (!userId) return
    setJoining(true)
    const { error } = await supabase
      .from('quest_participants')
      .delete()
      .eq('quest_id', quest.id)
      .eq('user_id', userId)

    if (!error) {
      setJoined(false)
      setParticipants(prev => prev.filter(p => p.user_id !== userId))
    }
    setJoining(false)
  }

  function handleBack() {
    setAnimateIn(false)
    setTimeout(onBack, 200)
  }

  async function handleShare() {
    const dateStr = new Date(quest.starts_at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    const loc = approximateLocation(quest.address)
    const shareUrl = `https://emerge.terralta.org/?quest=${quest.id}`
    const shareText = `Join me for ${quest.title} on ${dateStr} \u2014 ${loc}. Discover regenerative quests on Emerge.`

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: quest.title, text: shareText, url: shareUrl })
      } catch {
        // User cancelled or share failed — ignore
      }
    } else {
      setShowShare(true)
    }
  }

  const count = participants.length
  const maxSpots = quest.max_participants
  const spotsLeft = maxSpots ? Math.max(0, maxSpots - count) : null
  const fillPct = maxSpots ? Math.min(100, (count / maxSpots) * 100) : 0

  return (
    <div
      className="fixed inset-0 z-50 font-body flex justify-center overflow-y-auto transition-transform duration-200 ease-out"
      style={{
        background: '#0D1A0B',
        color: '#E8F2E0',
        transform: animateIn ? 'translateX(0)' : 'translateX(100%)',
      }}
    >
      <div className="w-full pb-36" style={{ maxWidth: 390 }}>

        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-4 pb-3 sticky top-0 z-10" style={{ background: '#0D1A0B', paddingTop: 'calc(20px + var(--sat, 0px))' }}>
          <button onClick={handleBack} className="flex items-center gap-1.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C8913A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
            </svg>
            <span className="text-[13px]" style={{ color: 'rgba(232,242,224,0.4)' }}>Back</span>
          </button>

          <span
            className="text-[13px] font-semibold uppercase px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(200,145,58,0.15)', color: '#C8913A', letterSpacing: '0.08em' }}
          >
            {typeEmoji[quest.category] ?? ''} {typeLabel[quest.category] ?? quest.category}
          </span>

          {/* Share button */}
          <button onClick={handleShare} className="opacity-50 hover:opacity-80 transition-opacity" title="Share this quest">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C8913A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </button>
        </div>

        {/* ── Content ── */}
        <div className="px-4">

          {/* Title */}
          <h1 className="font-heading text-[24px] font-light leading-snug mt-1 mb-2" style={{ color: '#E8F2E0' }}>
            {quest.title}
          </h1>

          {/* Organiser + source */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[13px]" style={{ color: 'rgba(232,242,224,0.45)' }}>
              via {quest.source_name}
            </span>
            <span className="text-[13px]" style={{ color: 'rgba(232,242,224,0.2)' }}>&middot;</span>
            <span className="text-[13px]" style={{ color: 'rgba(232,242,224,0.45)' }}>
              {quest.distance_km.toFixed(1)}km away
            </span>
            {quest.ai_score > 0 && (
              <>
                <span className="text-[13px]" style={{ color: 'rgba(232,242,224,0.2)' }}>&middot;</span>
                <span className="text-[12px] font-medium" style={{ color: '#C8913A' }}>
                  {quest.ai_score} regen
                </span>
              </>
            )}
          </div>

          {/* Date + time */}
          <div
            className="flex items-start gap-3 rounded-[12px] px-3.5 py-3 mb-2.5"
            style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.12)' }}
          >
            <span className="text-lg mt-0.5">{'\u{1F4C5}'}</span>
            <div>
              <p className="text-[13px] font-medium">{formatDateTime(quest.starts_at)}</p>
              {quest.ends_at && formatDuration(quest.starts_at, quest.ends_at) && (
                <p className="text-[13px] mt-0.5" style={{ color: 'rgba(232,242,224,0.4)' }}>
                  {formatDuration(quest.starts_at, quest.ends_at)} duration
                </p>
              )}
            </div>
          </div>

          {/* Location + map */}
          <div
            className="rounded-[12px] overflow-hidden mb-2.5"
            style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.12)' }}
          >
            <div className="px-3.5 py-3 flex items-start gap-3">
              <span className="text-lg mt-0.5">{'\u{1F4CD}'}</span>
              <div>
                <p className="text-[13px] font-medium">
                  {joined ? quest.address : approximateLocation(quest.address)}
                </p>
                <p className="text-[13px] mt-0.5" style={{ color: 'rgba(232,242,224,0.4)' }}>
                  {joined
                    ? `${quest.distance_km.toFixed(1)}km from you \u2014 exact location`
                    : `Approximate area \u2014 exact location after joining`
                  }
                </p>
              </div>
            </div>
            <div className="h-[130px]">
              <DetailMap lat={quest.lat} lng={quest.lng} title={quest.title} joined={joined} />
            </div>
          </div>

          {/* Exact address reveal (only after joining) */}
          {joined && quest.address && (
            <div
              className="rounded-[12px] px-3.5 py-2.5 mb-2.5 flex items-center gap-2"
              style={{ background: 'rgba(45,90,30,0.15)', border: '0.5px solid rgba(45,90,30,0.3)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8FBF7A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span className="text-[13px]" style={{ color: '#8FBF7A' }}>
                Full address: {quest.address}
              </span>
            </div>
          )}

          {/* Description */}
          <div
            className="rounded-[12px] px-3.5 py-3 mb-2.5"
            style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.12)' }}
          >
            <p className="text-[13px] leading-relaxed whitespace-pre-line" style={{ color: 'rgba(232,242,224,0.7)' }}>
              {quest.description}
            </p>
          </div>

          {/* Action buttons — view source + get directions */}
          <div className="flex gap-2 mb-2.5">
            {quest.source_url && (
              <a
                href={quest.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-[12px] text-[13px] font-medium active:scale-95 transition-transform"
                style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.2)', color: '#C8913A', textDecoration: 'none' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C8913A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                View original event
              </a>
            )}
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${quest.lat},${quest.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`${quest.source_url ? '' : 'flex-1'} flex items-center justify-center gap-2 py-3 rounded-[12px] text-[13px] font-medium active:scale-95 transition-transform`}
              style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.2)', color: '#E8F2E0', textDecoration: 'none', minWidth: quest.source_url ? 'auto' : undefined, paddingLeft: 16, paddingRight: 16 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E8F2E0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 11 22 2 13 21 11 13 3 11" />
              </svg>
              Directions
            </a>
          </div>

          {/* AI reasoning */}
          {quest.ai_reasoning && (
            <div
              className="rounded-[12px] px-3.5 py-3 mb-2.5"
              style={{ background: 'rgba(200,145,58,0.06)', border: '0.5px solid rgba(200,145,58,0.12)' }}
            >
              <p className="text-[13px] uppercase font-medium mb-1" style={{ color: '#C8913A', letterSpacing: '0.08em' }}>
                Why this quest matters
              </p>
              <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(232,242,224,0.5)' }}>
                {quest.ai_reasoning}
              </p>
            </div>
          )}

          {/* Spots + progress */}
          {!loading && (
            <div
              className="rounded-[12px] px-3.5 py-3 mb-2.5"
              style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.12)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px]" style={{ color: 'rgba(232,242,224,0.55)' }}>
                  {count} going{spotsLeft !== null && ` \u00b7 ${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left`}
                </span>
                {maxSpots && (
                  <span className="text-[12px]" style={{ color: 'rgba(232,242,224,0.25)' }}>{count}/{maxSpots}</span>
                )}
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(232,242,224,0.06)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: maxSpots ? `${fillPct}%` : `${Math.min(100, count * 12)}%`,
                    background: fillPct > 80 ? '#D4785A' : '#C8913A',
                  }}
                />
              </div>
            </div>
          )}

          {/* Who's going */}
          {!loading && (
            <div
              className="rounded-[12px] px-3.5 py-3 mb-2.5"
              style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.12)' }}
            >
              <p className="text-[13px] uppercase font-medium mb-2.5" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.08em' }}>
                Going {count > 0 ? `\u2014 first names only until you meet in person` : ''}
              </p>

              {count === 0 ? (
                <p className="text-[12px]" style={{ color: 'rgba(232,242,224,0.4)' }}>
                  Be the first to join this quest.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {participants.slice(0, 6).map(p => {
                    const badge = trustBadge[p.trust_level] ?? trustBadge.newcomer
                    const initial = p.first_name ? p.first_name.charAt(0).toUpperCase() : '?'
                    return (
                      <div key={p.user_id} className="flex items-center gap-1.5">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0"
                          style={{ background: '#1E3A1A', border: '1.5px solid #C8913A', color: '#C8913A' }}
                        >
                          {initial}
                        </div>
                        <div>
                          <p className="text-[13px] font-medium" style={{ color: '#E8F2E0' }}>
                            {p.first_name || 'Explorer'}
                          </p>
                          <p className="text-[8px]" style={{ color: badge.color }}>
                            {badge.label}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                  {count > 6 && (
                    <div className="flex items-center">
                      <span className="text-[13px]" style={{ color: 'rgba(232,242,224,0.35)' }}>
                        +{count - 6} more
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Safety footer */}
          <div className="mt-4 mb-6 text-center space-y-2">
            <button className="text-[12px] underline" style={{ color: 'rgba(232,242,224,0.25)' }}>
              Report this quest
            </button>
            <p className="text-[13px] leading-relaxed px-4" style={{ color: 'rgba(232,242,224,0.18)' }}>
              Exact location shared after joining &mdash; your location is never shared with others.
            </p>
          </div>
        </div>

        {/* ── Fixed bottom action ── */}
        <div
          className="fixed bottom-0 left-0 right-0 flex justify-center z-50"
          style={{ background: 'linear-gradient(transparent, #0D1A0B 30%)' }}
        >
          <div className="w-full px-4 pb-6 pt-4" style={{ maxWidth: 390 }}>
            {joined ? (
              <button
                onClick={handleLeave}
                disabled={joining}
                className="w-full py-3.5 rounded-[12px] flex items-center justify-center gap-2 text-[13px] font-semibold transition-opacity"
                style={{
                  background: 'rgba(45,90,30,0.3)',
                  border: '0.5px solid rgba(45,90,30,0.5)',
                  color: '#8FBF7A',
                  opacity: joining ? 0.6 : 1,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8FBF7A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Joined
              </button>
            ) : (
              <button
                onClick={handleJoin}
                disabled={joining || (spotsLeft !== null && spotsLeft <= 0)}
                className="w-full py-3.5 rounded-[12px] text-[14px] font-semibold transition-opacity"
                style={{
                  background: '#C8913A',
                  color: '#0D1A0B',
                  opacity: joining || (spotsLeft !== null && spotsLeft <= 0) ? 0.5 : 1,
                  letterSpacing: '0.02em',
                }}
              >
                {joining ? 'Joining...' : (spotsLeft !== null && spotsLeft <= 0) ? 'Quest full' : 'Join quest'}
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Share popup (desktop fallback) */}
      {showShare && (
        <SharePopup
          questId={quest.id}
          questTitle={quest.title}
          questDate={new Date(quest.starts_at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          questLocation={approximateLocation(quest.address)}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  )
}
