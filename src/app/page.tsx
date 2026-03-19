'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useAuth } from '@/hooks/useAuth'
import { useNearbyQuests } from '@/hooks/useNearbyQuests'
import AuthScreen from '@/components/AuthScreen'
import QuestDetail from '@/components/QuestDetail'
import PostQuest from '@/components/PostQuest'
import SkillsScreen from '@/components/SkillsScreen'
import TrustScreen from '@/components/TrustScreen'

const QuestMap = dynamic(() => import('@/components/QuestMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center" style={{ background: '#162814' }}>
      <span className="text-[11px]" style={{ color: 'rgba(232,242,224,0.3)' }}>Loading map...</span>
    </div>
  ),
})

const MapScreen = dynamic(() => import('@/components/MapScreen'), {
  ssr: false,
  loading: () => (
    <div className="h-screen w-full flex items-center justify-center" style={{ background: '#0D1A0B' }}>
      <span className="text-[11px]" style={{ color: 'rgba(232,242,224,0.3)' }}>Loading map...</span>
    </div>
  ),
})

/* ── Seedling SVG icon ── */
function SeedlingIcon({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <circle cx="18" cy="22" r="10" fill="rgba(200,145,58,0.15)" stroke="rgba(200,145,58,0.3)" strokeWidth="0.8" />
      <path d="M18 22 Q14 16 13 10 Q16 14 18 12 Q20 14 23 10 Q22 16 18 22Z" fill="#C8913A" opacity="0.9" />
      <path d="M18 22 L18 30" stroke="rgba(200,145,58,0.5)" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="18" cy="22" r="2" fill="#C8913A" />
    </svg>
  )
}

function getTimeGreeting() {
  const h = new Date().getHours()
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long' })
  if (h < 12) return `${day} morning`
  if (h < 17) return `${day} afternoon`
  return `${day} evening`
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 1000)
  if (diff > 0 && diff < 24) return `Today ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  if (diff > 0 && diff < 48) return `Tomorrow ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const typeEmoji: Record<string, string> = {
  nature: '\u{1F33F}', food: '\u{1F33F}', craft: '\u{1F3D7}\u{FE0F}',
  community: '\u{1F3B5}', wellness: '\u{2728}', learning: '\u{1F4D6}',
}
const typeLabel: Record<string, string> = {
  nature: 'Forage', food: 'Harvest', craft: 'Build',
  community: 'Gather', wellness: 'Wellness', learning: 'Learn',
}

type TabKey = 'quests' | 'map' | 'skills' | 'trust'

export default function Home() {
  const { user, profile, loading: authLoading, signIn, signUp, signOut } = useAuth()
  const [selectedQuest, setSelectedQuest] = useState<any>(null)
  const [showAuthFromDetail, setShowAuthFromDetail] = useState(false)
  const [showPostQuest, setShowPostQuest] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('quests')

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-body" style={{ background: '#0D1A0B' }}>
        <div className="flex items-center gap-2.5">
          <SeedlingIcon size={28} />
          <span className="font-heading text-[28px] font-light" style={{ color: '#E8F2E0', letterSpacing: '-0.01em' }}>
            em<span style={{ color: '#C8913A' }}>e</span>rge
          </span>
        </div>
      </div>
    )
  }

  // Auth prompted from quest detail "Join" button
  if (showAuthFromDetail || !user) {
    return (
      <AuthScreen
        onSignIn={async (email, pw) => {
          const data = await signIn(email, pw)
          setShowAuthFromDetail(false)
          return data
        }}
        onSignUp={async (email, pw, name) => {
          const data = await signUp(email, pw, name)
          setShowAuthFromDetail(false)
          return data
        }}
      />
    )
  }

  // Post quest screen
  if (showPostQuest) {
    return (
      <PostQuest
        userId={user.id}
        onBack={() => setShowPostQuest(false)}
        onSuccess={() => setShowPostQuest(false)}
      />
    )
  }

  // Quest detail screen
  if (selectedQuest) {
    return (
      <QuestDetail
        quest={selectedQuest}
        userId={user.id}
        onBack={() => setSelectedQuest(null)}
        onNeedAuth={() => setShowAuthFromDetail(true)}
      />
    )
  }

  return (
    <QuestBoard
      profile={profile}
      userId={user.id}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onSignOut={signOut}
      onSelectQuest={setSelectedQuest}
      onPostQuest={() => setShowPostQuest(true)}
    />
  )
}

/* ── Bottom Nav ── */
function BottomNav({
  activeTab,
  onTabChange,
  onPostQuest,
}: {
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  onPostQuest: () => void
}) {
  const tabs: { key: TabKey | 'post'; icon: string; label: string }[] = [
    { key: 'quests', icon: '\u25C8', label: 'Quests' },
    { key: 'map',    icon: '\u25C9', label: 'Map' },
    { key: 'post',   icon: '+',      label: 'Post' },
    { key: 'skills', icon: '\u25CE', label: 'Skills' },
    { key: 'trust',  icon: '\u25CB', label: 'Trust' },
  ]

  return (
    <div className="shrink-0 z-50" style={{ background: '#0D1A0B', borderTop: '0.5px solid rgba(232,242,224,0.06)' }}>
      <div className="flex justify-around items-center px-2 pt-3 pb-6">
        {tabs.map(tab => {
          if (tab.key === 'post') {
            return (
              <div key="post" className="flex flex-col items-center gap-1 cursor-pointer -mt-5" onClick={onPostQuest}>
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-xl font-light"
                  style={{ background: '#C8913A', color: '#0D1A0B', boxShadow: '0 2px 12px rgba(200,145,58,0.35)' }}
                >
                  +
                </div>
                <span className="text-[8px]" style={{ color: '#C8913A', letterSpacing: '0.04em' }}>Post</span>
              </div>
            )
          }
          const isActive = activeTab === tab.key
          return (
            <div
              key={tab.key}
              className="flex flex-col items-center gap-1 cursor-pointer"
              onClick={() => onTabChange(tab.key as TabKey)}
            >
              <span
                className="text-[15px]"
                style={{ color: isActive ? '#C8913A' : '#E8F2E0', opacity: isActive ? 1 : 0.3 }}
              >
                {tab.icon}
              </span>
              <span
                className="text-[8px]"
                style={{ color: isActive ? '#C8913A' : 'rgba(232,242,224,0.25)', letterSpacing: '0.04em' }}
              >
                {tab.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Quest Board ── */
function QuestBoard({
  profile,
  userId,
  activeTab,
  onTabChange,
  onSignOut,
  onSelectQuest,
  onPostQuest,
}: {
  profile: { first_name: string; last_name: string } | null
  userId: string
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  onSignOut: () => void
  onSelectQuest: (quest: any) => void
  onPostQuest: () => void
}) {
  const [showMap, setShowMap] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [radiusKm, setRadiusKm] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('emerge-radius')
      return saved ? parseInt(saved, 10) : 25
    }
    return 25
  })
  const [showRadiusPicker, setShowRadiusPicker] = useState(false)
  const { quests, loading, error, location } = useNearbyQuests({ radiusKm })

  const closestDist = useMemo(() => {
    if (quests.length === 0) return null
    return Math.min(...quests.map(q => q.distance_km))
  }, [quests])

  const initials = profile?.first_name ? profile.first_name.charAt(0).toUpperCase() : '?'
  const displayName = profile?.first_name || 'Explorer'

  // ── App Shell: all tabs inside 390px container with persistent bottom nav ──
  return (
    <div className="min-h-screen font-body flex justify-center" style={{ background: '#0D1A0B' }}>
      <div className="w-full relative flex flex-col" style={{ maxWidth: 390, minHeight: '100dvh' }}>

        {/* Tab content area — fills available space above nav */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ paddingBottom: 72 }}>
          {activeTab === 'map' && (
            <MapScreen quests={quests} userLocation={location} onSelectQuest={onSelectQuest} />
          )}
          {activeTab === 'skills' && (
            <SkillsScreen userId={userId} quests={quests} onSelectQuest={onSelectQuest} />
          )}
          {activeTab === 'trust' && (
            <TrustScreen userId={userId} profile={profile} />
          )}
          {activeTab === 'quests' && (<div>

        {/* Hero */}
        <div className="relative overflow-hidden rounded-b-[24px]" style={{ background: '#0D1A0B', padding: '36px 24px 28px' }}>
          <div className="absolute pointer-events-none" style={{ bottom: -60, left: '50%', transform: 'translateX(-50%)', width: 340, height: 340, background: 'radial-gradient(circle, rgba(200,145,58,0.16) 0%, transparent 70%)' }} />
          <div className="flex items-center justify-center gap-2.5 relative z-10">
            <SeedlingIcon size={34} />
            <span className="font-heading text-[38px] font-light tracking-tight leading-none" style={{ color: '#E8F2E0', letterSpacing: '-0.01em' }}>
              em<span style={{ color: '#C8913A' }}>e</span>rge
            </span>
          </div>
          <p className="text-center mt-3 relative z-10" style={{ fontSize: 11, color: 'rgba(232,242,224,0.45)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Real quests · Real community · Real change
          </p>
        </div>

        {/* Header row */}
        <div className="flex items-center justify-between px-4 pt-5 pb-1">
          <div>
            <p className="text-[10px] uppercase mb-0.5" style={{ color: 'rgba(232,242,224,0.45)', letterSpacing: '0.08em' }}>
              {getTimeGreeting()}
            </p>
            <h1 className="font-heading text-[20px] font-light leading-tight" style={{ color: '#E8F2E0' }}>
              What will you <em className="text-emerge-dawn">do today?</em>
            </h1>
          </div>

          {/* Avatar */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
              style={{ background: '#1E3A1A', border: '1.5px solid #C8913A', color: '#C8913A' }}
            >
              {initials}
            </button>
            {showMenu && (
              <div className="absolute right-0 top-10 rounded-[10px] py-2 px-1 z-50 min-w-[140px]" style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.25)' }}>
                <div className="px-3 py-1.5 mb-1" style={{ borderBottom: '0.5px solid rgba(232,242,224,0.06)' }}>
                  <p className="text-[11px] font-medium" style={{ color: '#E8F2E0' }}>{displayName}</p>
                  <p className="text-[9px]" style={{ color: 'rgba(232,242,224,0.35)' }}>Signed in</p>
                </div>
                <button
                  onClick={() => { setShowMenu(false); onSignOut() }}
                  className="w-full text-left px-3 py-1.5 rounded-md text-[11px]"
                  style={{ color: '#D4785A' }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
        {showMenu && <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />}

        {/* Pulse pills */}
        <div className="flex gap-2 px-4 pt-3 pb-4">
          {[
            { val: quests.length.toString(), label: 'Quests nearby' },
            { val: closestDist !== null ? `${closestDist.toFixed(1)}km` : '\u2014', label: 'Closest quest' },
            { val: quests.reduce((s, q) => s + q.ai_score, 0).toString(), label: 'Regen score' },
          ].map(pill => (
            <div key={pill.label} className="flex-1 rounded-[10px] px-2.5 py-2" style={{ background: '#162814' }}>
              <div className="text-[14px] font-semibold" style={{ color: '#C8913A' }}>{pill.val}</div>
              <div className="text-[9px] mt-0.5" style={{ color: 'rgba(232,242,224,0.4)' }}>{pill.label}</div>
            </div>
          ))}
        </div>

        {/* Section label + radius picker */}
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.1em' }}>
              Open quests near you
            </span>
            <button
              onClick={() => setShowRadiusPicker(!showRadiusPicker)}
              className="text-[9px] px-2 py-0.5 rounded-full active:scale-95 transition-transform"
              style={{
                background: showRadiusPicker ? 'rgba(200,145,58,0.15)' : 'rgba(232,242,224,0.06)',
                border: '0.5px solid rgba(200,145,58,0.25)',
                color: '#C8913A',
                letterSpacing: '0.03em',
              }}
            >
              within {radiusKm}km
            </button>
          </div>
          {showRadiusPicker && (
            <div className="flex gap-1.5 mt-2">
              {([
                { km: 2,  label: 'walking' },
                { km: 10, label: 'cycling' },
                { km: 25, label: 'driving' },
                { km: 50, label: 'regional' },
              ] as const).map(preset => {
                const isActive = radiusKm === preset.km
                return (
                  <button
                    key={preset.km}
                    onClick={() => {
                      setRadiusKm(preset.km)
                      localStorage.setItem('emerge-radius', String(preset.km))
                      setShowRadiusPicker(false)
                    }}
                    className="flex-1 rounded-[10px] py-2 text-center active:scale-95 transition-all"
                    style={{
                      background: isActive ? 'rgba(200,145,58,0.18)' : '#162814',
                      border: isActive ? '1px solid rgba(200,145,58,0.5)' : '0.5px solid rgba(200,145,58,0.1)',
                    }}
                  >
                    <div className="text-[12px] font-semibold" style={{ color: isActive ? '#C8913A' : '#E8F2E0' }}>
                      {preset.km}km
                    </div>
                    <div className="text-[8px] mt-0.5" style={{ color: isActive ? 'rgba(200,145,58,0.7)' : 'rgba(232,242,224,0.3)' }}>
                      {preset.label}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Quest cards */}
        <div className="px-3 space-y-2">
          {loading && [1, 2, 3].map(i => (
            <div key={i} className="rounded-[14px] p-3 animate-pulse" style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.12)' }}>
              <div className="h-2.5 rounded w-14 mb-2" style={{ background: 'rgba(200,145,58,0.12)' }} />
              <div className="h-3.5 rounded w-3/4 mb-2" style={{ background: 'rgba(232,242,224,0.06)' }} />
              <div className="h-2.5 rounded w-1/2" style={{ background: 'rgba(232,242,224,0.04)' }} />
            </div>
          ))}

          {!loading && quests.map((quest, i) => {
            const isUrgent = i === 0
            return (
              <div
                key={quest.id}
                className="rounded-[14px] px-3.5 py-3 cursor-pointer active:scale-[0.98] transition-transform"
                onClick={() => onSelectQuest(quest)}
                style={{
                  background: isUrgent ? 'rgba(200,145,58,0.10)' : '#162814',
                  border: isUrgent ? '0.5px solid rgba(200,145,58,0.35)' : '0.5px solid rgba(200,145,58,0.12)',
                }}
              >
                {isUrgent && (
                  <span className="inline-block text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded-full mb-1.5" style={{ background: '#C8913A', color: '#0D1A0B', letterSpacing: '0.05em' }}>
                    Closest to you
                  </span>
                )}
                <div className="text-[9px] font-medium uppercase mb-1" style={{ color: '#C8913A', letterSpacing: '0.08em' }}>
                  {typeEmoji[quest.category] ?? ''} {typeLabel[quest.category] ?? quest.category}
                </div>
                <div className="text-[13px] font-medium leading-snug mb-1" style={{ color: '#E8F2E0' }}>
                  {quest.title}
                </div>
                <div className="text-[10px]" style={{ color: 'rgba(232,242,224,0.4)' }}>
                  {formatDate(quest.starts_at)} · {quest.distance_km.toFixed(1)}km
                  {quest.source_name !== 'manual' && ` · via ${quest.source_name}`}
                </div>
              </div>
            )
          })}

          {!loading && !error && quests.length === 0 && (
            <div className="rounded-[14px] px-4 py-10 text-center" style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.12)' }}>
              <p className="font-heading text-base" style={{ color: '#E8F2E0' }}>No quests nearby... yet.</p>
              <p className="text-[11px] mt-1" style={{ color: 'rgba(232,242,224,0.35)' }}>Something real is waiting to emerge.</p>
            </div>
          )}
        </div>

        {/* Living map */}
        <div className="px-4 pt-4 pb-2 text-[9px] uppercase" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.1em' }}>
          Living map
        </div>
        {!showMap ? (
          <div
            className="mx-3 mb-2 rounded-[14px] h-[65px] relative overflow-hidden flex items-center justify-center cursor-pointer"
            style={{ background: '#162814', border: '0.5px solid rgba(232,242,224,0.06)' }}
            onClick={() => setShowMap(true)}
          >
            {quests.slice(0, 5).map((q, i) => (
              <div key={q.id} className="absolute rounded-full" style={{ width: i === 0 ? 7 : 5, height: i === 0 ? 7 : 5, background: i === 0 ? '#C8913A' : '#2D5A1E', top: `${18 + (i * 13) % 32}px`, left: `${40 + (i * 53) % 180}px` }} />
            ))}
            {quests.length > 0 && (
              <div className="absolute rounded-full" style={{ width: 16, height: 16, border: '1.5px solid rgba(200,145,58,0.35)', top: 14, left: 36 }} />
            )}
            <span className="text-[10px] relative z-10" style={{ color: 'rgba(232,242,224,0.25)', letterSpacing: '0.06em' }}>Open full map</span>
          </div>
        ) : (
          <div className="mx-3 mb-2 rounded-[14px] h-[180px] overflow-hidden" style={{ border: '0.5px solid rgba(232,242,224,0.06)' }}>
            <QuestMap quests={quests} userLocation={location} />
          </div>
        )}

        {/* Footer / Disclaimer */}
        <div className="px-4 pt-6 pb-4">
          <div className="rounded-[12px] px-4 py-4" style={{ background: 'rgba(22,40,20,0.5)', border: '0.5px solid rgba(232,242,224,0.04)' }}>
            <p className="text-[9px] leading-[1.7]" style={{ color: 'rgba(232,242,224,0.25)' }}>
              Emerge is a community platform that aggregates publicly available event information from third-party sources.
              We do not organise, host, or endorse any events listed. Event details are provided as-is and may change without notice.
              Always verify event details directly with organisers before attending. Attend all events at your own risk.
              Emerge is not liable for any loss, injury, or damages arising from attendance at listed events.
            </p>
            <p className="text-[9px] mt-2 leading-[1.7]" style={{ color: 'rgba(232,242,224,0.25)' }}>
              Your location data is used only to show nearby quests and is never shared with other users or third parties.
              We store only the minimum data needed to operate your account.
            </p>
            <div className="mt-3 pt-3" style={{ borderTop: '0.5px solid rgba(232,242,224,0.06)' }}>
              <p className="text-[9px]" style={{ color: 'rgba(232,242,224,0.2)' }}>
                Created by Pedro Valdjiu · <a href="https://terralta.org" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(200,145,58,0.4)', textDecoration: 'underline' }}>terralta.org</a>
              </p>
              <p className="text-[8px] mt-1" style={{ color: 'rgba(232,242,224,0.15)' }}>
                &copy; {new Date().getFullYear()} Emerge. All rights reserved.
              </p>
            </div>
          </div>
        </div>

          </div>)}
        </div>

        {/* Persistent bottom nav — always visible, inside the 390px container */}
        <BottomNav activeTab={activeTab} onTabChange={onTabChange} onPostQuest={onPostQuest} />

      </div>
    </div>
  )
}
