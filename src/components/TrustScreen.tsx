'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  userId: string
  profile: { first_name: string; last_name: string } | null
}

const TRUST_LEVELS = [
  { key: 'newcomer',     label: 'Newcomer',     threshold: 0,   color: 'rgba(232,242,224,0.3)' },
  { key: 'participant',  label: 'Participant',   threshold: 3,   color: '#4A7C59' },
  { key: 'contributor',  label: 'Contributor',   threshold: 10,  color: '#C8913A' },
  { key: 'steward',      label: 'Steward',       threshold: 25,  color: '#E8C068' },
] as const

const LEVEL_UP_TIPS = [
  { action: 'Join quests',           desc: 'Sign up and show up to community events' },
  { action: 'Complete quests',       desc: 'Follow through and mark quests as done' },
  { action: 'Get endorsements',      desc: 'Other members vouch for your contributions' },
  { action: 'Post quests',           desc: 'Create opportunities for others to participate' },
]

interface TrustStats {
  quests_joined: number
  quests_completed: number
  endorsements_received: number
}

interface Endorsement {
  id: string
  from_name: string
  created_at: string
  message: string | null
}

export default function TrustScreen({ userId, profile }: Props) {
  const [stats, setStats] = useState<TrustStats>({ quests_joined: 0, quests_completed: 0, endorsements_received: 0 })
  const [endorsements, setEndorsements] = useState<Endorsement[]>([])

  useEffect(() => {
    async function loadTrustData() {
      // Fetch quest participation stats
      const { count: joinedCount } = await supabase
        .from('quest_participants')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)

      const { count: completedCount } = await supabase
        .from('quest_participants')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'completed')

      // Fetch endorsements
      const { data: endorsementData } = await supabase
        .from('endorsements')
        .select('id, message, created_at, from_user:profiles!endorsements_from_user_id_fkey(first_name, last_name)')
        .eq('to_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10)

      const endorsementCount = endorsementData?.length ?? 0

      setStats({
        quests_joined: joinedCount ?? 0,
        quests_completed: completedCount ?? 0,
        endorsements_received: endorsementCount,
      })

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

  // Calculate trust score and current level
  const trustScore = stats.quests_joined + (stats.quests_completed * 2) + (stats.endorsements_received * 3)
  const currentLevel = [...TRUST_LEVELS].reverse().find(l => trustScore >= l.threshold) ?? TRUST_LEVELS[0]
  const currentLevelIndex = TRUST_LEVELS.findIndex(l => l.key === currentLevel.key)
  const nextLevel = TRUST_LEVELS[currentLevelIndex + 1] ?? null
  const progressToNext = nextLevel
    ? Math.min(1, (trustScore - currentLevel.threshold) / (nextLevel.threshold - currentLevel.threshold))
    : 1

  const displayName = profile?.first_name ?? 'Explorer'

  return (
    <div className="min-h-screen font-body" style={{ background: '#0D1A0B' }}>
      <div className="w-full" style={{ maxWidth: 390, margin: '0 auto' }}>

        {/* Header */}
        <div className="px-4 pt-5 pb-4">
          <h1 className="font-heading text-[20px] font-light" style={{ color: '#E8F2E0' }}>
            Trust <em style={{ color: '#C8913A' }}>Journey</em>
          </h1>
          <p className="text-[10px] mt-0.5" style={{ color: 'rgba(232,242,224,0.4)' }}>
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
              <span className="text-[24px]">
                {currentLevel.key === 'newcomer' && '\u{1F331}'}
                {currentLevel.key === 'participant' && '\u{1F33F}'}
                {currentLevel.key === 'contributor' && '\u{1F333}'}
                {currentLevel.key === 'steward' && '\u{1F3D5}\u{FE0F}'}
              </span>
            </div>
            <div className="font-heading text-[18px] font-light" style={{ color: currentLevel.color }}>
              {currentLevel.label}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: 'rgba(232,242,224,0.45)' }}>
              {displayName}&apos;s trust level
            </div>
          </div>

          {/* Progress bar */}
          {nextLevel && (
            <div className="mt-3">
              <div className="flex justify-between mb-1">
                <span className="text-[9px]" style={{ color: currentLevel.color }}>{currentLevel.label}</span>
                <span className="text-[9px]" style={{ color: 'rgba(232,242,224,0.3)' }}>{nextLevel.label}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(232,242,224,0.06)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressToNext * 100}%`, background: currentLevel.color }}
                />
              </div>
              <div className="text-[9px] mt-1 text-center" style={{ color: 'rgba(232,242,224,0.3)' }}>
                {trustScore} / {nextLevel.threshold} points to next level
              </div>
            </div>
          )}
          {!nextLevel && (
            <div className="text-[10px] text-center mt-1" style={{ color: 'rgba(232,242,224,0.35)' }}>
              Highest trust level reached
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="flex gap-2 px-3 mb-4">
          {[
            { val: stats.quests_joined.toString(), label: 'Joined', sub: '+1 pt each' },
            { val: stats.quests_completed.toString(), label: 'Completed', sub: '+2 pts each' },
            { val: stats.endorsements_received.toString(), label: 'Endorsed', sub: '+3 pts each' },
          ].map(stat => (
            <div key={stat.label} className="flex-1 rounded-[10px] px-2.5 py-2.5 text-center" style={{ background: '#162814' }}>
              <div className="text-[16px] font-semibold" style={{ color: '#C8913A' }}>{stat.val}</div>
              <div className="text-[9px] mt-0.5 font-medium" style={{ color: '#E8F2E0' }}>{stat.label}</div>
              <div className="text-[8px] mt-0.5" style={{ color: 'rgba(232,242,224,0.25)' }}>{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Trust level ladder */}
        <div className="px-4 pb-2 text-[9px] uppercase" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.1em' }}>
          Trust levels
        </div>
        <div className="mx-3 mb-4 rounded-[14px] overflow-hidden" style={{ border: '0.5px solid rgba(200,145,58,0.12)' }}>
          {TRUST_LEVELS.map((level, i) => {
            const isCurrent = level.key === currentLevel.key
            const isUnlocked = trustScore >= level.threshold
            return (
              <div
                key={level.key}
                className="flex items-center gap-3 px-3.5 py-2.5"
                style={{
                  background: isCurrent ? 'rgba(200,145,58,0.08)' : '#162814',
                  borderBottom: i < TRUST_LEVELS.length - 1 ? '0.5px solid rgba(232,242,224,0.04)' : 'none',
                }}
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] shrink-0"
                  style={{ background: isUnlocked ? `${level.color}25` : 'rgba(232,242,224,0.04)', border: isCurrent ? `1.5px solid ${level.color}` : '1px solid transparent' }}
                >
                  {isUnlocked ? '\u2713' : '\u{1F512}'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium" style={{ color: isUnlocked ? level.color : 'rgba(232,242,224,0.25)' }}>
                    {level.label}
                  </div>
                  <div className="text-[9px]" style={{ color: 'rgba(232,242,224,0.25)' }}>
                    {level.threshold === 0 ? 'Starting level' : `${level.threshold} points needed`}
                  </div>
                </div>
                {isCurrent && (
                  <span className="text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded-full shrink-0" style={{ background: '#C8913A', color: '#0D1A0B', letterSpacing: '0.04em' }}>
                    Current
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* How to level up */}
        <div className="px-4 pb-2 text-[9px] uppercase" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.1em' }}>
          How to grow your trust
        </div>
        <div className="px-3 space-y-1.5 mb-4">
          {LEVEL_UP_TIPS.map(tip => (
            <div key={tip.action} className="rounded-[10px] px-3 py-2.5" style={{ background: '#162814' }}>
              <div className="text-[11px] font-medium" style={{ color: '#E8F2E0' }}>{tip.action}</div>
              <div className="text-[9px] mt-0.5" style={{ color: 'rgba(232,242,224,0.35)' }}>{tip.desc}</div>
            </div>
          ))}
        </div>

        {/* Recent endorsements */}
        <div className="px-4 pb-2 text-[9px] uppercase" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.1em' }}>
          Recent endorsements
        </div>
        <div className="px-3 pb-24">
          {endorsements.length === 0 ? (
            <div className="rounded-[14px] px-4 py-8 text-center" style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.12)' }}>
              <p className="text-[22px] mb-2">{'\u{1F331}'}</p>
              <p className="font-heading text-[13px]" style={{ color: '#E8F2E0' }}>No endorsements yet</p>
              <p className="text-[10px] mt-1" style={{ color: 'rgba(232,242,224,0.3)' }}>
                Join quests and contribute — endorsements will come.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {endorsements.map(e => (
                <div key={e.id} className="rounded-[10px] px-3 py-2.5" style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.12)' }}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold shrink-0"
                      style={{ background: '#1E3A1A', border: '1px solid #2D5A1E', color: '#4A7C59' }}
                    >
                      {e.from_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium" style={{ color: '#E8F2E0' }}>{e.from_name}</div>
                      {e.message && (
                        <div className="text-[9px] mt-0.5 truncate" style={{ color: 'rgba(232,242,224,0.4)' }}>
                          &quot;{e.message}&quot;
                        </div>
                      )}
                    </div>
                    <div className="text-[8px] shrink-0" style={{ color: 'rgba(232,242,224,0.2)' }}>
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
