'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import dynamic from 'next/dynamic'
import { useAuth } from '@/hooks/useAuth'
import { formatDate, proximityPill, filterQuests, groupQuests, daysUntil } from '@/lib/dateUtils'
import { useNearbyQuests } from '@/hooks/useNearbyQuests'
import { toggleTheme, getTheme } from '@/lib/theme'
import type { Theme } from '@/lib/theme'
import AuthScreen from '@/components/AuthScreen'
import QuestDetail from '@/components/QuestDetail'
import PostQuest from '@/components/PostQuest'
import SkillsScreen from '@/components/SkillsScreen'
import DigestSettings from '@/components/DigestSettings'
import TrustScreen from '@/components/TrustScreen'
import OnboardingSplash from '@/components/OnboardingSplash'
import SubmitEvent from '@/components/SubmitEvent'
import ConnectLuma from '@/components/ConnectLuma'

const QuestMap = dynamic(() => import('@/components/QuestMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center" style={{ background: 'var(--color-card)' }}>
      <span className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>Loading map...</span>
    </div>
  ),
})

const MapScreen = dynamic(() => import('@/components/MapScreen'), {
  ssr: false,
  loading: () => (
    <div className="h-screen w-full flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
      <span className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>Loading map...</span>
    </div>
  ),
})

/* ── Seedling SVG icon ── */
function SeedlingIcon({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <circle cx="18" cy="22" r="10" fill="var(--color-amber-light)" stroke="var(--color-amber-border)" strokeWidth="0.8" />
      <path d="M18 22 Q14 16 13 10 Q16 14 18 12 Q20 14 23 10 Q22 16 18 22Z" fill="var(--color-amber)" opacity="0.9" />
      <path d="M18 22 L18 30" stroke="var(--color-amber-border)" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="18" cy="22" r="2" fill="var(--color-amber)" />
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

// Date utilities imported from shared module — see lib/dateUtils.ts

const typeEmoji: Record<string, string> = {
  nature: '\u{1F33F}', food: '\u{1F33F}', craft: '\u{1F3D7}\u{FE0F}',
  community: '\u{1F3B5}', wellness: '\u{2728}', learning: '\u{1F4D6}',
  feast: '\u{1F372}', play: '\u{1F3B6}', make: '\u{1F3A8}',
}
const typeLabel: Record<string, string> = {
  nature: 'Forage', food: 'Harvest', craft: 'Build',
  community: 'Gather', wellness: 'Wellness', learning: 'Learn',
  feast: 'Feast', play: 'Play', make: 'Make',
}


const SOURCE_DISPLAY: Record<string, string> = {
  'redeconvergir.pt': 'Rede Convergir',
  'gaia.org.pt': 'GAIA Portugal',
  'repaircafe.org': 'Repair Caf\u00e9 Network',
  'transitionnetwork.org': 'Transition Network',
  'permaculture.org.uk': 'Permaculture Association',
  'findhorn.org': 'Findhorn Foundation',
  'communitylandscotland.org.uk': 'Community Land Scotland',
  'landvernd.is': 'Landvernd',
  'slowfood.com': 'Slow Food',
  'greenpeace.org': 'Greenpeace',
  'umanotera.si': 'Umanotera',
  'allevents.in': 'AllEvents',
}

function displaySourceName(sourceName: string, sourceUrl?: string | null): string {
  // Pipeline source names like "meetup-cities", "eventbrite-cities", "local-networks"
  if (sourceName === 'meetup-cities') return 'Meetup'
  if (sourceName === 'eventbrite-cities') return 'Eventbrite'
  if (sourceName === 'eventbrite-cultural') return 'Eventbrite'
  if (sourceName === 'allevents-cultural') return 'AllEvents'
  if (sourceName === 'local-networks' && sourceUrl) {
    try {
      const host = new URL(sourceUrl).hostname.replace(/^www\./, '')
      if (SOURCE_DISPLAY[host]) return SOURCE_DISPLAY[host]
      // Check partial domain matches
      for (const [domain, name] of Object.entries(SOURCE_DISPLAY)) {
        if (host.endsWith(domain)) return name
      }
      return host
    } catch { /* fall through */ }
  }
  // Fallback: clean up the source name
  return sourceName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

type TabKey = 'quests' | 'map' | 'skills' | 'trust'

export default function Home() {
  const { user, profile, loading: authLoading, signIn, signUp, signOut } = useAuth()
  const [selectedQuest, setSelectedQuest] = useState<any>(null)
  const [showAuthFromDetail, setShowAuthFromDetail] = useState(false)
  const [showPostQuest, setShowPostQuest] = useState(false)
  const [showSubmitEvent, setShowSubmitEvent] = useState(false)
  const [showConnectLuma, setShowConnectLuma] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('quests')

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-body" style={{ background: 'var(--color-bg)' }}>
        <div className="flex items-center gap-2.5">
          <SeedlingIcon size={28} />
          <span className="font-heading text-[28px] font-light" style={{ color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
            em<span style={{ color: 'var(--color-amber)' }}>e</span>rge
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

  // Connect Luma screen
  if (showConnectLuma) {
    return <ConnectLuma userId={user.id} onBack={() => setShowConnectLuma(false)} />
  }

  // Post quest screen (merged — includes URL paste mode)
  if (showPostQuest || showSubmitEvent) {
    return (
      <PostQuest
        userId={user.id}
        onBack={() => { setShowPostQuest(false); setShowSubmitEvent(false) }}
        onSuccess={() => { setShowPostQuest(false); setShowSubmitEvent(false) }}
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
      onConnectLuma={() => setShowConnectLuma(true)}
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
    <div className="shrink-0 z-50" style={{ background: 'var(--color-bg)', borderTop: '0.5px solid var(--color-pill-bg)' }}>
      <div className="flex justify-around items-center px-2 pt-3" style={{ paddingBottom: 'calc(6px + var(--sab, 0px))' }}>
        {tabs.map(tab => {
          if (tab.key === 'post') {
            return (
              <div key="post" className="flex flex-col items-center gap-1 cursor-pointer -mt-5" onClick={onPostQuest} role="button" aria-label="Post quest">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-xl font-light"
                  style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)', boxShadow: '0 2px 12px var(--color-amber-border)' }}
                >
                  +
                </div>
                <span className="text-[8px]" style={{ color: 'var(--color-amber)', letterSpacing: '0.04em' }}>Add</span>
              </div>
            )
          }
          const isActive = activeTab === tab.key
          return (
            <div
              key={tab.key}
              className="flex flex-col items-center gap-1 cursor-pointer"
              onClick={() => onTabChange(tab.key as TabKey)}
              role="button"
              aria-label={tab.label}
            >
              <span
                className="text-[15px]"
                style={{ color: isActive ? 'var(--color-amber)' : 'var(--color-text)', opacity: isActive ? 1 : 0.3 }}
              >
                {tab.icon}
              </span>
              <span
                className="text-[8px]"
                style={{ color: isActive ? 'var(--color-amber)' : 'var(--color-text-muted)', letterSpacing: '0.04em' }}
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

/* ── Footer Disclaimer (collapsible) ── */
function FooterDisclaimer() {
  const [open, setOpen] = useState(false)
  return (
    <div className="px-4 pt-5 pb-4">
      <div className="text-center">
        <p className="text-[8px]" style={{ color: 'var(--color-text-muted)' }}>
          Created by Pedro Valdjiu · <a href="https://terralta.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-amber-border)', textDecoration: 'underline' }}>terralta.org</a>
          {' '}&copy; {new Date().getFullYear()}
        </p>
        <button
          onClick={() => setOpen(!open)}
          className="text-[8px] mt-1"
          style={{ color: 'var(--color-text-faint)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
        >
          {open ? 'Hide disclaimer' : 'Disclaimer & privacy'}
        </button>
      </div>
      {open && (
        <div className="mt-2 rounded-[10px] px-3 py-3" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-pill-bg)' }}>
          <p className="text-[8px] leading-[1.7]" style={{ color: 'var(--color-text-muted)' }}>
            Emerge is a community platform that aggregates publicly available event information from third-party sources.
            We do not organise, host, or endorse any events listed. Event details are provided as-is and may change without notice.
            Always verify details directly with organisers. Attend at your own risk.
            Emerge is not liable for any loss, injury, or damages arising from attendance at listed events.
          </p>
          <p className="text-[8px] mt-1.5 leading-[1.7]" style={{ color: 'var(--color-text-muted)' }}>
            Your location data is used only to show nearby quests and is never shared with other users or third parties.
            We store only the minimum data needed to operate your account.
          </p>
        </div>
      )}
    </div>
  )
}

const COUNTRY_NAMES: Record<string, string> = {
  PT: 'Portugal', GB: 'United Kingdom', DE: 'Germany', FR: 'France', ES: 'Spain',
  IT: 'Italy', NL: 'Netherlands', BE: 'Belgium', AT: 'Austria', CH: 'Switzerland',
  IE: 'Ireland', DK: 'Denmark', FI: 'Finland', SE: 'Sweden', NO: 'Norway',
  IS: 'Iceland', MT: 'Malta', LU: 'Luxembourg', SI: 'Slovenia', RS: 'Serbia',
  HU: 'Hungary', CA: 'Canada', US: 'United States',
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
  onConnectLuma,
}: {
  profile: { first_name: string; last_name: string } | null
  userId: string
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  onSignOut: () => void
  onSelectQuest: (quest: any) => void
  onPostQuest: () => void
  onConnectLuma: () => void
}) {
  const [showMap, setShowMap] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [theme, setThemeState] = useState<Theme>(() => typeof window !== 'undefined' ? getTheme() : 'light')
  const [radiusKm, setRadiusKm] = useState<number | 'national'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('emerge-radius')
      if (saved === 'national') return 'national'
      return saved ? parseInt(saved, 10) : 25
    }
    return 25
  })
  const [keywordSearch, setKeywordSearch] = useState('')
  const [showRadiusPicker, setShowRadiusPicker] = useState(false)
  const [attendedCount, setAttendedCount] = useState(0)
  const { quests, loading, error, location, locationName, locationDenied, locationLoading, countryCode, setManualLocation } = useNearbyQuests({ radiusKm, searchKeyword: keywordSearch || null })

  // Fetch quests attended count
  useEffect(() => {
    async function fetchAttended() {
      const { count } = await supabase
        .from('quest_participants')
        .select('quest_id, quests!inner(starts_at)', { count: 'exact', head: true })
        .eq('user_id', userId)
        .lt('quests.starts_at', new Date().toISOString())
      setAttendedCount(count ?? 0)
    }
    fetchAttended()
  }, [userId])
  const [timeFilter, setTimeFilter] = useState<'today' | 'week' | 'all'>('all')
  const [citySearch, setCitySearch] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{ lat: number; lng: number; name: string; detail: string; cc: string }>>([])
  const [searching, setSearching] = useState(false)
  const [showCitySearch, setShowCitySearch] = useState(false)

  // City search via Nominatim — with dedup, country sort, full labels
  const [citySearchError, setCitySearchError] = useState('')
  const handleCitySearch = async () => {
    if (!citySearch.trim()) return
    setSearching(true)
    setCitySearchError('')
    try {
      // Use Photon (Komoot) — OSM-based, no rate limits, no CORS issues
      const res = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(citySearch)}&limit=8&lang=en`
      )
      if (!res.ok) throw new Error(`Search failed (${res.status})`)
      const data = await res.json()
      let results: Array<{ lat: number; lng: number; name: string; detail: string; cc: string }> = (data.features || []).map((f: any) => {
        const p = f.properties || {}
        const coords = f.geometry?.coordinates || [0, 0]
        const city = p.city || p.name || p.locality || 'Unknown'
        const region = p.state || p.county || ''
        const country = p.country || ''
        const cc = (p.countrycode || '').toUpperCase()
        return {
          lat: coords[1],
          lng: coords[0],
          name: city,
          detail: [region, country].filter(Boolean).join(', '),
          cc,
        }
      })
      // Dedup: remove results within 10km of each other
      const deduped: typeof results = []
      for (const r of results) {
        const tooClose = deduped.some(d => {
          const dlat = (d.lat - r.lat) * 111
          const dlng = (d.lng - r.lng) * 111 * Math.cos(r.lat * Math.PI / 180)
          return Math.sqrt(dlat * dlat + dlng * dlng) < 10
        })
        if (!tooClose) deduped.push(r)
      }
      // Sort: user's country first
      deduped.sort((a, b) => {
        const aMatch = a.cc === countryCode ? 1 : 0
        const bMatch = b.cc === countryCode ? 1 : 0
        return bMatch - aMatch
      })
      const final = deduped.slice(0, 4)
      setSearchResults(final)
      if (final.length === 0) setCitySearchError('No results found. Try a different name.')
    } catch {
      setSearchResults([])
      setCitySearchError('Search unavailable. Please try again.')
    }
    setSearching(false)
  }

  const closestDist = useMemo(() => {
    if (quests.length === 0) return null
    return Math.min(...quests.map(q => q.distance_km))
  }, [quests])

  const initials = profile?.first_name ? profile.first_name.charAt(0).toUpperCase() : '?'
  const displayName = profile?.first_name || 'Explorer'

  // ── App Shell: all tabs inside 390px container with persistent bottom nav ──
  return (
    <div className="min-h-screen font-body flex justify-center" style={{ background: 'var(--color-bg)' }}>
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
        <div className="relative overflow-hidden rounded-b-[24px]" style={{ background: 'var(--color-bg)', padding: 'calc(36px + var(--sat, 0px)) 24px 28px' }}>
          <div className="absolute pointer-events-none" style={{ bottom: -60, left: '50%', transform: 'translateX(-50%)', width: 340, height: 340, background: 'radial-gradient(circle, var(--color-amber-light) 0%, transparent 70%)' }} />
          <div className="flex items-center justify-center gap-2.5 relative z-10">
            <SeedlingIcon size={34} />
            <span className="font-heading text-[38px] font-light tracking-tight leading-none" style={{ color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
              em<span style={{ color: 'var(--color-amber)' }}>e</span>rge
            </span>
          </div>
          <p className="text-center mt-3 relative z-10" style={{ fontSize: 13, color: 'var(--color-text-secondary)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Real quests · Real community · Real change
          </p>
        </div>

        {/* Header row */}
        <div className="flex items-center justify-between px-4 pt-5 pb-1">
          <div>
            <p className="text-[12px] uppercase mb-0.5" style={{ color: 'var(--color-text-secondary)', letterSpacing: '0.08em' }}>
              {getTimeGreeting()}
            </p>
            <h1 className="font-heading text-[20px] font-light leading-tight" style={{ color: 'var(--color-text)' }}>
              Quests <em className="text-emerge-dawn">near you</em>
            </h1>
          </div>

          {/* Theme toggle + Avatar */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setThemeState(toggleTheme())}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[14px] shrink-0 active:scale-90 transition-transform"
              style={{ background: 'var(--color-amber-bg)', border: '0.5px solid var(--color-amber-border)' }}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19'}
            </button>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold shrink-0"
              style={{ background: 'var(--color-avatar-bg)', border: '1.5px solid var(--color-amber)', color: 'var(--color-amber)' }}
            >
              {initials}
            </button>
            {showMenu && (
              <div className="absolute right-0 top-10 rounded-[10px] py-2 px-1 z-50 min-w-[140px]" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)' }}>
                <div className="px-3 py-1.5 mb-1" style={{ borderBottom: '0.5px solid var(--color-pill-bg)' }}>
                  <p className="text-[13px] font-medium" style={{ color: 'var(--color-text)' }}>{displayName}</p>
                  <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>Signed in</p>
                </div>
                <button
                  onClick={() => { setShowMenu(false); setShowSettings(true) }}
                  className="w-full text-left px-3 py-1.5 rounded-md text-[13px]"
                  style={{ color: 'var(--color-text)' }}
                >
                  Settings
                </button>
                <button
                  onClick={() => { setShowMenu(false); onSignOut() }}
                  className="w-full text-left px-3 py-1.5 rounded-md text-[13px]"
                  style={{ color: 'var(--color-error)' }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
          </div>
        </div>
        {showMenu && <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />}
        {showSettings && <DigestSettings userId={userId} onClose={() => setShowSettings(false)} />}

        {/* Location indicator */}
        <div className="px-4 pb-1">
          {locationLoading ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>Locating you...</span>
            </div>
          ) : (locationDenied || showCitySearch) ? (
            <div className="rounded-[12px] px-3.5 py-3" style={{ background: 'var(--color-amber-bg)', border: '0.5px solid var(--color-amber-border)' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[13px] font-medium" style={{ color: 'var(--color-amber)' }}>
                  {locationDenied ? 'Where are you?' : 'Change location'}
                </p>
                {!locationDenied && (
                  <button onClick={() => setShowCitySearch(false)} className="text-[12px]" style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                )}
              </div>
              {locationDenied && (
                <p className="text-[12px] mb-2.5" style={{ color: 'var(--color-text-secondary)' }}>
                  Location access was denied. Search for your city to see nearby quests.
                </p>
              )}
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={citySearch}
                  onChange={e => { setCitySearch(e.target.value); setSearchResults([]) }}
                  onKeyDown={e => e.key === 'Enter' && handleCitySearch()}
                  placeholder="e.g. Lisbon, Berlin, London..."
                  className="flex-1 rounded-[8px] px-2.5 py-2 text-[12px] outline-none"
                  style={{ background: 'var(--color-bg)', border: '0.5px solid var(--color-amber-border)', color: 'var(--color-text)' }}
                />
                <button
                  onClick={handleCitySearch}
                  disabled={searching}
                  className="rounded-[8px] px-3 py-2 text-[13px] font-medium"
                  style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)' }}
                >
                  {searching ? '...' : 'Search'}
                </button>
              </div>
              {citySearchError && (
                <p className="text-[11px] mt-2 px-1" style={{ color: 'var(--color-error)' }}>{citySearchError}</p>
              )}
              {searchResults.length > 0 && (
                <div className="mt-2 space-y-1">
                  {searchResults.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setManualLocation(r.lat, r.lng, r.name)
                        setCitySearch('')
                        setSearchResults([])
                        setShowCitySearch(false)
                      }}
                      className="w-full text-left rounded-[8px] px-2.5 py-2"
                      style={{ background: 'var(--color-card)', color: 'var(--color-text)', border: '0.5px solid var(--color-border)' }}
                    >
                      <div className="text-[13px] font-medium">{r.name}</div>
                      {r.detail && <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{r.detail}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowCitySearch(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full active:scale-95 transition-transform"
              style={{ background: 'var(--color-amber-bg)', border: '0.5px solid var(--color-amber-border)', cursor: 'pointer' }}
            >
              <span style={{ color: 'var(--color-amber)', fontSize: 12 }}>{'\u25C9'}</span>
              <span className="text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>
                {locationName || 'Your location'}
              </span>
              <span className="text-[12px]" style={{ color: 'var(--color-amber)' }}>change</span>
            </button>
          )}
        </div>

        {/* Pulse pills */}
        <div className="flex gap-2 px-4 pt-3 pb-4">
          {[
            { val: quests.length.toString(), label: 'Quests nearby' },
            { val: closestDist !== null ? `${closestDist.toFixed(1)}km` : '\u2014', label: 'Closest quest' },
            { val: attendedCount.toString(), label: 'Quests attended' },
          ].map(pill => (
            <div key={pill.label} className="flex-1 rounded-[10px] px-2.5 py-2" style={{ background: 'var(--color-card)' }}>
              <div className="text-[14px] font-semibold" style={{ color: 'var(--color-amber)' }}>{pill.val}</div>
              <div className="text-[13px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{pill.label}</div>
            </div>
          ))}
        </div>

        {/* Filter strip + radius picker */}
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              {([
                { key: 'today' as const, label: 'Today' },
                { key: 'week' as const, label: 'This week' },
                { key: 'all' as const, label: 'All upcoming' },
              ]).map(f => (
                <button
                  key={f.key}
                  onClick={() => setTimeFilter(f.key)}
                  className="text-[13px] px-2.5 py-1 rounded-full transition-all"
                  style={{
                    background: timeFilter === f.key ? 'var(--color-amber-light)' : 'var(--color-pill-bg)',
                    border: timeFilter === f.key ? '0.5px solid var(--color-amber-border)' : '0.5px solid var(--color-pill-bg)',
                    color: timeFilter === f.key ? 'var(--color-amber)' : 'var(--color-text-secondary)',
                    letterSpacing: '0.03em',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowRadiusPicker(!showRadiusPicker)}
              className="text-[13px] px-2 py-0.5 rounded-full active:scale-95 transition-transform"
              style={{
                background: showRadiusPicker ? 'var(--color-amber-light)' : 'var(--color-pill-bg)',
                border: '0.5px solid var(--color-amber-border)',
                color: 'var(--color-amber)',
                letterSpacing: '0.03em',
              }}
            >
              {radiusKm === 'national' ? '🌍 National' : `within ${radiusKm}km`}
            </button>
          </div>
          {showRadiusPicker && (
            <div className="flex gap-1.5 mt-2">
              {([
                { km: 2 as number | 'national',  label: 'walking' },
                { km: 10 as number | 'national', label: 'cycling' },
                { km: 25 as number | 'national', label: 'driving' },
                { km: 50 as number | 'national', label: 'regional' },
                { km: 'national' as number | 'national', label: 'national' },
              ]).map(preset => {
                const isActive = radiusKm === preset.km
                const isNational = preset.km === 'national'
                return (
                  <button
                    key={String(preset.km)}
                    onClick={() => {
                      setRadiusKm(preset.km)
                      localStorage.setItem('emerge-radius', String(preset.km))
                      setShowRadiusPicker(false)
                    }}
                    className="flex-1 rounded-[10px] py-2 text-center active:scale-95 transition-all"
                    style={{
                      background: isActive
                        ? isNational ? 'var(--color-amber)' : 'var(--color-amber-light)'
                        : isNational ? 'var(--color-amber-bg)' : 'var(--color-card)',
                      border: isActive
                        ? '1px solid var(--color-amber-border)'
                        : isNational ? '0.5px solid var(--color-amber-border)' : '0.5px solid var(--color-border)',
                    }}
                  >
                    <div className="text-[12px] font-semibold" style={{ color: isActive && isNational ? 'var(--color-pill-active-text)' : isActive || isNational ? 'var(--color-amber)' : 'var(--color-text)' }}>
                      {isNational ? '🌍' : `${preset.km}km`}
                    </div>
                    <div className="text-[8px] mt-0.5" style={{ color: isActive && isNational ? 'var(--color-pill-active-text)' : isActive ? 'var(--color-amber)' : 'var(--color-text-muted)' }}>
                      {preset.label}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Keyword search input */}
        <div className="px-4 pb-3">
          <input
            type="text"
            placeholder="Search quests... (permaculture, repair, yoga, etc.)"
            value={keywordSearch}
            onChange={(e) => setKeywordSearch(e.target.value)}
            className="w-full rounded-[10px] px-3 py-2 text-[13px] outline-none transition-all"
            style={{
              background: 'var(--color-amber-bg)',
              border: keywordSearch ? '0.5px solid var(--color-amber-border)' : '0.5px solid var(--color-amber-border)',
              color: 'var(--color-text)',
            }}
          />
        </div>

        {/* National mode label */}
        {radiusKm === 'national' && countryCode && (
          <div className="px-4 pb-2">
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              Showing all quests in {COUNTRY_NAMES[countryCode] ?? countryCode} — sorted by date and distance
            </p>
          </div>
        )}
        {radiusKm === 'national' && !countryCode && (
          <div className="px-4 pb-2">
            <p className="text-[11px]" style={{ color: 'var(--color-amber)' }}>
              Set your location to enable national mode
            </p>
          </div>
        )}

        {/* Quest cards */}
        <div className="px-3 space-y-2">
          {loading && [1, 2, 3].map(i => (
            <div key={i} className="rounded-[14px] p-3 animate-pulse" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)' }}>
              <div className="h-2.5 rounded w-14 mb-2" style={{ background: 'var(--color-border)' }} />
              <div className="h-3.5 rounded w-3/4 mb-2" style={{ background: 'var(--color-pill-bg)' }} />
              <div className="h-2.5 rounded w-1/2" style={{ background: 'var(--color-pill-bg)' }} />
            </div>
          ))}

          {!loading && (() => {
            const filtered = filterQuests(quests, timeFilter)

            // Empty states
            if (filtered.length === 0) {
              if (timeFilter === 'today' && quests.length > 0) {
                return (
                  <div className="rounded-[14px] px-4 py-10 text-center" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)' }}>
                    <p className="font-heading text-base" style={{ color: 'var(--color-text)' }}>Nothing today</p>
                    <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      There {quests.length === 1 ? 'is 1 quest' : `are ${quests.length} quests`} coming up near you.
                    </p>
                    <button
                      onClick={() => setTimeFilter('all')}
                      className="mt-3 text-[13px] font-medium"
                      style={{ color: 'var(--color-amber)' }}
                    >
                      Show all upcoming &rarr;
                    </button>
                  </div>
                )
              }
              if (timeFilter === 'week' && quests.length > 0) {
                return (
                  <div className="rounded-[14px] px-4 py-10 text-center" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)' }}>
                    <p className="font-heading text-base" style={{ color: 'var(--color-text)' }}>Nothing this week</p>
                    <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      There {quests.length === 1 ? 'is 1 quest' : `are ${quests.length} quests`} coming up near you.
                    </p>
                    <button
                      onClick={() => setTimeFilter('all')}
                      className="mt-3 text-[13px] font-medium"
                      style={{ color: 'var(--color-amber)' }}
                    >
                      Show all upcoming &rarr;
                    </button>
                  </div>
                )
              }
              return (
                <div className="rounded-[14px] px-4 py-10 text-center" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)' }}>
                  <p className="font-heading text-base" style={{ color: 'var(--color-text)' }}>No quests near you yet.</p>
                  <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-muted)' }}>Check back soon — or add your own.</p>
                  <button
                    onClick={onPostQuest}
                    className="mt-3 text-[13px] font-medium"
                    style={{ color: 'var(--color-amber)' }}
                  >
                    Add a quest &rarr;
                  </button>
                </div>
              )
            }

            // Grouped view for "All upcoming"
            const groups = timeFilter === 'all' ? groupQuests(filtered) : [{ label: '', quests: filtered }]

            return groups.map((group, gi) => (
              <div key={gi}>
                {group.label && (
                  <div className="text-[11px] uppercase pt-2 pb-1.5 px-0.5" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.1em' }}>
                    {group.label}
                  </div>
                )}
                <div className="space-y-2">
                  {group.quests.map((quest, i) => {
                    const isFirst = gi === 0 && i === 0
                    const pill = proximityPill(quest.starts_at)
                    return (
                      <div
                        key={quest.id}
                        className="rounded-[14px] px-3.5 py-3 cursor-pointer active:scale-[0.98] transition-transform"
                        onClick={() => onSelectQuest(quest)}
                        style={{
                          background: isFirst ? 'var(--color-amber-bg)' : 'var(--color-card)',
                          border: isFirst ? '0.5px solid var(--color-amber-border)' : '0.5px solid var(--color-border)',
                        }}
                      >
                        {isFirst && (
                          <span className="inline-block text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded-full mb-1.5" style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)', letterSpacing: '0.05em' }}>
                            Closest to you
                          </span>
                        )}
                        <div className="text-[13px] font-medium uppercase mb-1" style={{ color: 'var(--color-amber)', letterSpacing: '0.08em' }}>
                          {typeEmoji[quest.category] ?? ''} {typeLabel[quest.category] ?? quest.category}
                        </div>
                        <div className="text-[13px] font-medium leading-snug mb-1" style={{ color: 'var(--color-text)' }}>
                          {quest.title}
                        </div>
                        <div className="text-[12px] flex items-center gap-1.5 flex-wrap" style={{ color: 'var(--color-text-secondary)' }}>
                          {pill && (
                            <span className="inline-block text-[8px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: pill.bg, color: pill.color, border: pill.bg.startsWith('rgba') ? '0.5px solid var(--color-pill-bg)' : 'none' }}>
                              {pill.text}
                            </span>
                          )}
                          {formatDate(quest.starts_at)} · {quest.distance_km.toFixed(1)}km
                        </div>
                        {quest.source_name && quest.source_name !== 'manual' && (
                          <div className="flex items-center gap-1.5 mt-2 pt-2" style={{ borderTop: '0.5px solid var(--color-pill-bg)' }}>
                            <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: 'var(--color-amber)' }} />
                            <span className="text-[12px] font-medium" style={{ color: 'var(--color-amber)' }}>
                              via {displaySourceName(quest.source_name, quest.source_url)}
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          })()}
        </div>

        {/* Living map */}
        <div className="px-4 pt-4 pb-2 text-[11px] uppercase" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.1em' }}>
          Living map
        </div>
        {!showMap ? (
          <div
            className="mx-3 mb-2 rounded-[14px] h-[65px] relative overflow-hidden flex items-center justify-center cursor-pointer"
            style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-pill-bg)' }}
            onClick={() => setShowMap(true)}
          >
            {quests.slice(0, 5).map((q, i) => (
              <div key={q.id} className="absolute rounded-full" style={{ width: i === 0 ? 7 : 5, height: i === 0 ? 7 : 5, background: i === 0 ? 'var(--color-amber)' : 'var(--color-success)', top: `${18 + (i * 13) % 32}px`, left: `${40 + (i * 53) % 180}px` }} />
            ))}
            {quests.length > 0 && (
              <div className="absolute rounded-full" style={{ width: 16, height: 16, border: '1.5px solid var(--color-amber-border)', top: 14, left: 36 }} />
            )}
            <span className="text-[12px] relative z-10" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.06em' }}>Open full map</span>
          </div>
        ) : (
          <div className="mx-3 mb-2 rounded-[14px] h-[180px] overflow-hidden" style={{ border: '0.5px solid var(--color-pill-bg)' }}>
            <QuestMap quests={quests} userLocation={location} />
          </div>
        )}

        {/* Footer / Disclaimer (collapsible) */}
        <FooterDisclaimer />

          </div>)}
        </div>

        {/* Persistent bottom nav — always visible, inside the 390px container */}
        <BottomNav activeTab={activeTab} onTabChange={onTabChange} onPostQuest={onPostQuest} />

      </div>
      <OnboardingSplash />
    </div>
  )
}
