'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  userId: string
  profile: { first_name: string; last_name: string } | null
}

const TRUST_LEVELS: Array<{ key: string; label: string; emoji: string; color: string; desc: string; unlock?: string }> = [
  { key: 'newcomer',    label: 'Newcomer',    emoji: '🌱', color: 'rgba(232,242,224,0.3)', desc: "You've arrived. Start by joining a quest near you." },
  { key: 'participant', label: 'Participant',  emoji: '🌿', color: '#4A7C59', desc: 'Attend 3 quests in the real world.', unlock: 'Unlocks: see who else is joining quests' },
  { key: 'contributor', label: 'Contributor',  emoji: '🌳', color: '#C8913A', desc: 'Attend 10 quests, or post 3 quests that others join.', unlock: 'Unlocks: listed as a skill sharer on quests you join' },
  { key: 'steward',     label: 'Steward',      emoji: '🏡', color: '#E8C068', desc: 'Endorsed by 5 or more community members.', unlock: 'Unlocks: your quests are auto-approved, you can flag events for review' },
]

const GROW_TIPS = [
  { action: 'Join a quest', desc: 'Find something near you and show up.' },
  { action: 'Come back', desc: 'The community grows through regulars, not tourists.' },
  { action: 'Post a quest', desc: 'Create something for others to join. If they show up, it counts.' },
  { action: 'Earn an endorsement', desc: 'When someone you\'ve quested with vouches for you, it means something.' },
]

interface TrustStats {
  quests_attended: number
  quests_posted_with_joiners: number
  endorsements_received: number
  trust_level: string
}

interface Endorsement {
  id: string
  from_name: string
  created_at: string
  message: string | null
}

export default function TrustScreen({ userId, profile }: Props) {
  const [stats, setStats] = useState<TrustStats>({ quests_attended: 0, quests_posted_with_joiners: 0, endorsements_received: 0, trust_level: 'newcomer' })
  const [endorsements, setEndorsements] = useState<Endorsement[]>([])

  useEffect(() => {
    async function loadTrustData() {
      // Fetch profile stats
      const { data: profileData } = await supabase
        .from('profiles')
        .select('quests_attended, quests_posted_with_joiners, endorsements_received, trust_level')
        .eq('id', userId)
        .single()

      if (profileData) {
        setStats({
          quests_attended: profileData.quests_attended ?? 0,
          quests_posted_with_joiners: profileData.quests_posted_with_joiners ?? 0,
          endorsements_received: profileData.endorsements_received ?? 0,
          trust_level: profileData.trust_level ?? 'newcomer',
        })
      }

      // Fetch endorsements
      const { data: endorsementData } = await supabase
        .from('endorsements')
        .select('id, message, created_at, from_user:profiles!endorsements_from_user_id_fkey(first_name, last_name)')
        .eq('to_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10)

      if (endorsementData) {
        setEndorsements(endorsementData.map((e: any) => ({
          id: e.id,
          from_name: e.from_user?.first_name
            ? `${e.from_user.first_name} ${(e.from_user.last_name ?? '').charAt(0)}.`
            : 'Community member',
          created_at: e.created_at,
          message: e.message,
        })))
      }
    }

    loadTrustData()
  }, [userId])

  const currentLevel = TRUST_LEVELS.find(l => l.key === stats.trust_level) ?? TRUST_LEVELS[0]
  const currentLevelIndex = TRUST_LEVELS.findIndex(l => l.key === stats.trust_level)
  const nextLevel = TRUST_LEVELS[currentLevelIndex + 1] ?? null

  // Progress calculation — milestone-based, not points
  let progressFraction = 1
  let progressLabel = ''
  if (nextLevel) {
    if (nextLevel.key === 'participant') {
      progressFraction = Math.min(1, stats.quests_attended / 3)
      progressLabel = `${stats.quests_attended} of 3 quests attended`
    } else if (nextLevel.key === 'contributor') {
      const attendPath = stats.quests_attended / 10
      const postPath = stats.quests_posted_with_joiners / 3
      if (attendPath >= postPath) {
        progressFraction = Math.min(1, attendPath)
        progressLabel = `${stats.quests_attended} of 10 quests attended`
      } else {
        progressFraction = Math.min(1, postPath)
        progressLabel = `${stats.quests_posted_with_joiners} of 3 quests posted with joiners`
      }
    } else if (nextLevel.key === 'steward') {
      progressFraction = Math.min(1, stats.endorsements_received / 5)
      progressLabel = `${stats.endorsements_received} of 5 endorsements received`
    }
  }

  const displayName = profile?.first_name ?? 'Explorer'

  return (
    <div className="font-body" style={{ background: '#0D1A0B' }}>
      <div className="w-full">

        {/* Header */}
        <div className="px-4 pb-4" style={{ paddingTop: 'calc(20px + var(--sat, 0px))' }}>
          <h1 className="font-heading text-[20px] font-light" style={{ color: '#E8F2E0' }}>
            Trust <em style={{ color: '#C8913A' }}>Journey</em>
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'rgba(232,242,224,0.4)' }}>
            Your path through the community
          </p>
        </div>

        {/* Trust level card */}
        <div className="mx-3 mb-3 rounded-[16px] p-4" style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.2)' }}>
          <div className="text-center mb-3">
            <div
              className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-2"
              style={{ background: `${currentLevel.color}20`, border: `2px solid ${currentLevel.color}` }}
            >
              <span className="text-[24px]">{currentLevel.emoji}</span>
            </div>
            <div className="font-heading text-[18px] font-light" style={{ color: currentLevel.color }}>
              {currentLevel.label}
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: 'rgba(232,242,224,0.45)' }}>
              {displayName}&apos;s trust level
            </div>
          </div>

          {/* Progress bar */}
          {nextLevel && (
            <div className="mt-3">
              <div className="flex justify-between mb-1">
                <span className="text-[11px]" style={{ color: currentLevel.color }}>{currentLevel.label}</span>
                <span className="text-[11px]" style={{ color: 'rgba(232,242,224,0.3)' }}>{nextLevel.label}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(232,242,224,0.06)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressFraction * 100}%`, background: currentLevel.color }}
                />
              </div>
              <div className="text-[11px] mt-1 text-center" style={{ color: 'rgba(232,242,224,0.3)' }}>
                {progressLabel}
              </div>
              {nextLevel.key === 'contributor' && (
                <div className="text-[10px] mt-0.5 text-center" style={{ color: 'rgba(200,145,58,0.4)' }}>
                  Either path unlocks Contributor
                </div>
              )}
            </div>
          )}
          {!nextLevel && (
            <div className="text-[12px] text-center mt-1" style={{ color: 'rgba(232,242,224,0.35)' }}>
              Highest trust level reached
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="flex gap-2 px-3 mb-4">
          {[
            { val: stats.quests_attended.toString(), label: 'Attended', sub: 'quests attended' },
            { val: stats.quests_posted_with_joiners.toString(), label: 'Posted', sub: 'quests posted' },
            { val: stats.endorsements_received.toString(), label: 'Endorsed', sub: 'endorsements' },
          ].map(stat => (
            <div key={stat.label} className="flex-1 rounded-[10px] px-2.5 py-2.5 text-center" style={{ background: '#162814' }}>
              <div className="text-[16px] font-semibold" style={{ color: '#C8913A' }}>{stat.val}</div>
              <div className="text-[12px] mt-0.5 font-medium" style={{ color: '#E8F2E0' }}>{stat.label}</div>
              <div className="text-[9px] mt-0.5" style={{ color: 'rgba(232,242,224,0.25)' }}>{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Trust level ladder */}
        <div className="px-4 pb-2 text-[11px] uppercase" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.1em' }}>
          Trust levels
        </div>
        <div className="mx-3 mb-4 rounded-[14px] overflow-hidden" style={{ border: '0.5px solid rgba(200,145,58,0.12)' }}>
          {TRUST_LEVELS.map((level, i) => {
            const isCurrent = level.key === currentLevel.key
            const isUnlocked = TRUST_LEVELS.findIndex(l => l.key === level.key) <= currentLevelIndex
            return (
              <div
                key={level.key}
                className="flex items-start gap-3 px-3.5 py-2.5"
                style={{
                  background: isCurrent ? 'rgba(200,145,58,0.08)' : '#162814',
                  borderBottom: i < TRUST_LEVELS.length - 1 ? '0.5px solid rgba(232,242,224,0.04)' : 'none',
                }}
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] shrink-0 mt-0.5"
                  style={{ background: isUnlocked ? `${level.color}25` : 'rgba(232,242,224,0.04)', border: isCurrent ? `1.5px solid ${level.color}` : '1px solid transparent' }}
                >
                  {level.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium" style={{ color: isUnlocked ? level.color : 'rgba(232,242,224,0.25)' }}>
                    {level.label}
                  </div>
                  <div className="text-[11px]" style={{ color: 'rgba(232,242,224,0.35)' }}>
                    {level.desc}
                  </div>
                  {level.unlock && (
                    <div className="text-[10px] mt-0.5 italic" style={{ color: 'rgba(200,145,58,0.4)' }}>
                      {level.unlock}
                    </div>
                  )}
                </div>
                {isCurrent && (
                  <span className="text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded-full shrink-0 mt-0.5" style={{ background: '#C8913A', color: '#0D1A0B', letterSpacing: '0.04em' }}>
                    You are here
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* How to grow your trust */}
        <div className="px-4 pb-2 text-[11px] uppercase" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.1em' }}>
          How to grow your trust
        </div>
        <div className="px-3 space-y-1.5 mb-4">
          {GROW_TIPS.map(tip => (
            <div key={tip.action} className="rounded-[10px] px-3 py-2.5" style={{ background: '#162814' }}>
              <div className="text-[13px] font-medium" style={{ color: '#E8F2E0' }}>{tip.action}</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'rgba(232,242,224,0.35)' }}>{tip.desc}</div>
            </div>
          ))}
        </div>

        {/* Recent endorsements */}
        <div className="px-4 pb-2 text-[11px] uppercase" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.1em' }}>
          Recent endorsements
        </div>
        <div className="px-3 pb-24">
          {endorsements.length === 0 ? (
            <div className="rounded-[14px] px-4 py-8 text-center" style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.12)' }}>
              <p className="text-[22px] mb-2">🌱</p>
              <p className="font-heading text-[13px]" style={{ color: '#E8F2E0' }}>No endorsements yet</p>
              <p className="text-[11px] mt-1" style={{ color: 'rgba(232,242,224,0.3)' }}>
                Join quests and contribute — endorsements will come.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {endorsements.map(e => (
                <div key={e.id} className="rounded-[10px] px-3 py-2.5" style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.12)' }}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
                      style={{ background: '#1E3A1A', border: '1px solid #2D5A1E', color: '#4A7C59' }}
                    >
                      {e.from_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium" style={{ color: '#E8F2E0' }}>{e.from_name}</div>
                      {e.message && (
                        <div className="text-[11px] mt-0.5 truncate" style={{ color: 'rgba(232,242,224,0.4)' }}>
                          &quot;{e.message}&quot;
                        </div>
                      )}
                    </div>
                    <div className="text-[9px] shrink-0" style={{ color: 'rgba(232,242,224,0.2)' }}>
                      {new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
