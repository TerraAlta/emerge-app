'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
import NewsScreen from '@/components/NewsScreen'
import DigestSettings from '@/components/DigestSettings'
// import TrustScreen from '@/components/TrustScreen' // Removed — revisit when user base grows
import OnboardingSplash, { openWelcomeCard } from '@/components/OnboardingSplash'
import WhatsNewRibbon from '@/components/WhatsNewRibbon'
import SubmitEvent from '@/components/SubmitEvent'
import ConnectLuma from '@/components/ConnectLuma'
import SupportTicketButton from '@/components/SupportTicketButton'

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

/**
 * Top-level doors — three primary sections of the app.
 * Guild is a separate router route (/guild), so it's not a TabKey.
 */
type TabKey = 'quests' | 'news'
/** Sub-views inside the Quests door. List is the default. */
type QuestView = 'list' | 'map' | 'skills'

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center font-body" style={{ background: 'var(--color-bg)' }}>
        <span className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>Loading...</span>
      </div>
    }>
      <HomeInner />
    </Suspense>
  )
}

function HomeInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, profile, loading: authLoading, signIn, signUp, signOut } = useAuth()
  const [selectedQuest, setSelectedQuest] = useState<any>(null)
  const [showAuthFromDetail, setShowAuthFromDetail] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [showPostQuest, setShowPostQuest] = useState(false)
  const [showSubmitEvent, setShowSubmitEvent] = useState(false)
  const [showConnectLuma, setShowConnectLuma] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('quests')
  const [questView, setQuestView] = useState<QuestView>('list')

  // Open the auth screen when redirected here with ?auth=signin|signup
  // (e.g. from a Guild sub-page that requires an account).
  useEffect(() => {
    const auth = searchParams?.get('auth')
    if (auth === 'signin' || auth === 'signup') {
      setAuthMode(auth === 'signup' ? 'signup' : 'login')
      setShowAuthFromDetail(true)
      router.replace('/')
    }
  }, [searchParams, router])

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

  // Explicit auth request — triggered by actions that need a user
  if (showAuthFromDetail) {
    return (
      <AuthScreen
        defaultMode={authMode}
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

  // Anon users can BROWSE. They only hit the auth wall when they try to
  // do something that requires an account (post, join, connect, etc.).
  const isAnon = !user

  // Connect Luma screen — signed-in only
  if (showConnectLuma) {
    if (isAnon) { setShowAuthFromDetail(true); setShowConnectLuma(false); return null }
    return <ConnectLuma userId={user!.id} onBack={() => setShowConnectLuma(false)} />
  }

  // Post quest screen — signed-in only
  if (showPostQuest || showSubmitEvent) {
    if (isAnon) {
      setShowAuthFromDetail(true)
      setShowPostQuest(false)
      setShowSubmitEvent(false)
      return null
    }
    return (
      <PostQuest
        userId={user!.id}
        onBack={() => { setShowPostQuest(false); setShowSubmitEvent(false) }}
        onSuccess={() => { setShowPostQuest(false); setShowSubmitEvent(false) }}
      />
    )
  }

  // Quest detail — viewable by anyone; Join button triggers onNeedAuth
  if (selectedQuest) {
    return (
      <QuestDetail
        quest={selectedQuest}
        userId={user?.id ?? ''}
        onBack={() => setSelectedQuest(null)}
        onNeedAuth={() => setShowAuthFromDetail(true)}
      />
    )
  }

  return (
    <QuestBoard
      profile={profile}
      userId={user?.id ?? ''}
      isAnon={isAnon}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      questView={questView}
      setQuestView={setQuestView}
      onSignOut={signOut}
      onSignIn={() => setShowAuthFromDetail(true)}
      onSelectQuest={setSelectedQuest}
      onPostQuest={() => {
        if (isAnon) { setShowAuthFromDetail(true); return }
        setShowPostQuest(true)
      }}
      onConnectLuma={() => {
        if (isAnon) { setShowAuthFromDetail(true); return }
        setShowConnectLuma(true)
      }}
    />
  )
}

/* ── Quest View Sub-Nav — List / Map / Skills toggle + Post CTA ── */
function QuestViewNav({
  questView,
  setQuestView,
  onPostQuest,
}: {
  questView: QuestView
  setQuestView: (v: QuestView) => void
  onPostQuest: () => void
}) {
  const views: { key: QuestView; label: string; icon: string }[] = [
    { key: 'list',   label: 'List',   icon: '\u{1F33F}' },
    { key: 'map',    label: 'Map',    icon: '\u{1F5FA}\uFE0F' },
    { key: 'skills', label: 'Skills', icon: '\u{1F331}' },
  ]
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b"
      style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex flex-wrap gap-1.5">
        {views.map(v => {
          const isActive = questView === v.key
          return (
            <button
              key={v.key}
              onClick={() => setQuestView(v.key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all"
              style={{
                background: isActive ? 'var(--color-amber-light)' : 'var(--color-pill-bg)',
                color: isActive ? 'var(--color-amber)' : 'var(--color-text-secondary)',
                border: isActive ? '0.5px solid var(--color-amber-border)' : '0.5px solid transparent',
              }}
            >
              <span className="text-[13px]">{v.icon}</span> {v.label}
            </button>
          )
        })}
      </div>
      <button
        onClick={onPostQuest}
        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold active:scale-95 transition-transform"
        style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)', border: 'none' }}
        aria-label="Post quest"
      >
        <span className="text-[14px]">+</span> Post a quest
      </button>
    </div>
  )
}

/* ── Top Nav — three primary doors, no horizontal scroll ── */
function TopNav({
  activeTab,
  onTabChange,
}: {
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
}) {
  const router = useRouter()
  const tabs: { key: TabKey | 'guild'; label: string; icon: string }[] = [
    { key: 'quests', label: 'Quests', icon: '\u{1F33F}' },
    { key: 'news',   label: 'News',   icon: '\u{1F4F0}' },
    { key: 'guild',  label: 'Guild',  icon: '\u{1F33C}' },
  ]

  return (
    <div className="flex items-center justify-center gap-2 px-4 py-2">
      {tabs.map(tab => {
        if (tab.key === 'guild') {
          return (
            <button
              key="guild"
              onClick={() => router.push('/guild')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium transition-all"
              style={{
                background: 'var(--color-pill-bg)',
                color: 'var(--color-text-secondary)',
                border: '0.5px solid transparent',
              }}
              aria-label="Guild"
            >
              <span className="text-[14px]">{tab.icon}</span> {tab.label}
            </button>
          )
        }
        const isActive = activeTab === tab.key
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key as TabKey)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium transition-all"
            style={{
              background: isActive ? 'var(--color-amber-light)' : 'var(--color-pill-bg)',
              color: isActive ? 'var(--color-amber)' : 'var(--color-text-secondary)',
              border: isActive ? '0.5px solid var(--color-amber-border)' : '0.5px solid transparent',
            }}
            aria-label={tab.label}
          >
            <span className="text-[14px]">{tab.icon}</span> {tab.label}
          </button>
        )
      })}
    </div>
  )
}

/* ── Footer Disclaimer + Coverage (collapsible) ── */
function FooterDisclaimer() {
  const [openDisclaimer, setOpenDisclaimer] = useState(false)
  const [openCoverage, setOpenCoverage] = useState(false)

  const coverage = [
    { flag: '\u{1F1EC}\u{1F1E7}', name: 'United Kingdom', cities: 'London, Oxford, Bristol, Edinburgh, Brighton, Manchester, Glasgow, Cardiff, Belfast' },
    { flag: '\u{1F1FA}\u{1F1F8}', name: 'United States', cities: 'New York, Portland, San Francisco, Austin, Boulder, Asheville, Detroit' },
    { flag: '\u{1F1E8}\u{1F1E6}', name: 'Canada', cities: 'Vancouver, Toronto, Montreal, Victoria, Ottawa' },
    { flag: '\u{1F1E9}\u{1F1EA}', name: 'Germany', cities: 'Berlin, Munich, Hamburg, Freiburg, Leipzig, Cologne' },
    { flag: '\u{1F1F3}\u{1F1F1}', name: 'Netherlands', cities: 'Amsterdam, Rotterdam, Utrecht, The Hague' },
    { flag: '\u{1F1EE}\u{1F1EA}', name: 'Ireland', cities: 'Dublin, Cork, Galway, Limerick' },
    { flag: '\u{1F1EB}\u{1F1F7}', name: 'France', cities: 'Paris, Lyon, Marseille, Toulouse, Nantes' },
    { flag: '\u{1F1F5}\u{1F1F9}', name: 'Portugal', cities: 'Lisbon, Porto, Sintra, Cascais, Algarve' },
    { flag: '\u{1F1EE}\u{1F1F9}', name: 'Italy', cities: 'Rome, Milan, Florence, Bologna, Turin' },
    { flag: '\u{1F1EA}\u{1F1F8}', name: 'Spain', cities: 'Barcelona, Madrid, Valencia, Seville' },
    { flag: '\u{1F1E7}\u{1F1EA}', name: 'Belgium', cities: 'Brussels, Ghent, Antwerp' },
    { flag: '\u{1F1E8}\u{1F1ED}', name: 'Switzerland', cities: 'Zurich, Basel, Geneva, Bern' },
    { flag: '\u{1F1E6}\u{1F1F9}', name: 'Austria', cities: 'Vienna, Graz, Salzburg' },
    { flag: '\u{1F1E9}\u{1F1F0}', name: 'Denmark', cities: 'Copenhagen, Aarhus' },
    { flag: '\u{1F1EB}\u{1F1EE}', name: 'Finland', cities: 'Helsinki, Tampere' },
    { flag: '\u{1F1F8}\u{1F1EA}', name: 'Sweden', cities: 'Stockholm, Gothenburg, Malm\u00F6' },
    { flag: '\u{1F1EE}\u{1F1F8}', name: 'Iceland', cities: 'Reykjav\u00EDk' },
    { flag: '\u{1F1F2}\u{1F1F9}', name: 'Malta', cities: 'Valletta' },
    { flag: '\u{1F1F1}\u{1F1FA}', name: 'Luxembourg', cities: 'Luxembourg City' },
    { flag: '\u{1F1F8}\u{1F1EE}', name: 'Slovenia', cities: 'Ljubljana' },
    { flag: '\u{1F1F7}\u{1F1F8}', name: 'Serbia', cities: 'Belgrade, Novi Sad' },
    { flag: '\u{1F1ED}\u{1F1FA}', name: 'Hungary', cities: 'Budapest' },
  ]

  const donateUrl = process.env.NEXT_PUBLIC_DONATE_URL

  return (
    <div className="px-4 pt-5 pb-4">
      {donateUrl && (
        <div className="mx-auto max-w-[420px] mb-5 rounded-[14px] px-4 py-4 text-center"
          style={{ background: 'var(--color-amber-bg)', border: '0.5px solid var(--color-amber-border)' }}>
          <p className="font-heading text-[15px] font-light leading-snug" style={{ color: 'var(--color-text)' }}>
            Emerge is <em style={{ color: 'var(--color-amber)' }}>free</em>. Always.
          </p>
          <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            No ads. No algorithms. No paid placement. Built by one person, kept alive by people who believe community and nature heal the same wound.
          </p>
          <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            If Emerge helped you find something real, a small gift keeps the seeds being planted.
          </p>
          <a
            href={donateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-3 rounded-full px-4 py-2 text-[12px] font-semibold active:scale-95 transition-transform"
            style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)', textDecoration: 'none' }}
          >
            Support Emerge
          </a>
        </div>
      )}
      <div className="text-center">
        <p className="text-[8px]" style={{ color: 'var(--color-text-muted)' }}>
          Created by Pedro Valdjiu · <a href="https://terralta.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-amber-border)', textDecoration: 'underline' }}>terralta.org</a>
          {' '}&copy; {new Date().getFullYear()}
        </p>
        <div className="flex items-center justify-center gap-3 mt-1.5">
          <button
            onClick={() => { setOpenCoverage(!openCoverage); setOpenDisclaimer(false) }}
            className="text-[8px]"
            style={{ color: 'var(--color-text-faint)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {openCoverage ? 'Hide coverage' : 'Where we\u2019re active'}
          </button>
          <span className="text-[8px]" style={{ color: 'var(--color-text-faint)' }}>&middot;</span>
          <button
            onClick={() => { setOpenDisclaimer(!openDisclaimer); setOpenCoverage(false) }}
            className="text-[8px]"
            style={{ color: 'var(--color-text-faint)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {openDisclaimer ? 'Hide disclaimer' : 'Disclaimer & privacy'}
          </button>
        </div>
      </div>

      {openCoverage && (
        <div className="mt-3 rounded-[10px] px-3 py-3" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-pill-bg)' }}>
          <p className="text-[11px] font-medium mb-1" style={{ color: 'var(--color-amber)' }}>
            Active in 23 countries &middot; 220+ cities
          </p>
          <p className="text-[10px] mb-3 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            We source regenerative community events from local networks, Eventbrite, and partner organisations. Coverage is growing every week.
          </p>
          <div className="space-y-2">
            {coverage.map(c => (
              <div key={c.name}>
                <p className="text-[11px] font-medium" style={{ color: 'var(--color-text)' }}>
                  {c.flag} {c.name}
                </p>
                <p className="text-[9px] ml-5" style={{ color: 'var(--color-text-muted)' }}>
                  {c.cities}
                </p>
              </div>
            ))}
          </div>
          <p className="text-[9px] mt-3 italic" style={{ color: 'var(--color-text-muted)' }}>
            Don&apos;t see your city? Post the first quest and help your community emerge.
          </p>
        </div>
      )}

      {openDisclaimer && (
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
  isAnon,
  activeTab,
  onTabChange,
  questView,
  setQuestView,
  onSignOut,
  onSignIn,
  onSelectQuest,
  onPostQuest,
  onConnectLuma,
}: {
  profile: { first_name: string; last_name: string } | null
  userId: string
  isAnon: boolean
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  questView: QuestView
  setQuestView: (v: QuestView) => void
  onSignOut: () => void
  onSignIn: () => void
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
      let results: Array<{ lat: number; lng: number; name: string; detail: string; cc: string }> = (data.features || [])
        // Drop OSM administrative boundaries (county/district/state/country
        // polygons). Their centroids are the geometric middle of the whole
        // region — often dozens of km from the actual city. Users typing
        // 'Lisbon' want the city, not the Lisbon district centroid up in
        // Loures.
        .filter((f: any) => f?.properties?.osm_value !== 'administrative')
        .map((f: any) => {
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

  // ── App Shell: mobile-first container, widens on desktop for list/grid views ──
  return (
    <div className="min-h-screen font-body flex justify-center" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full relative flex flex-col max-w-[390px] lg:max-w-[1120px]" style={{ minHeight: '100dvh' }}>

        {/* Hero — always visible, stays narrow even on desktop */}
        <div className="relative overflow-hidden rounded-b-[24px] shrink-0 mx-auto w-full max-w-[640px]" style={{ background: 'var(--color-bg)', padding: 'calc(36px + var(--sat, 0px)) 24px 20px' }}>
          <div className="absolute pointer-events-none" style={{ bottom: -60, left: '50%', transform: 'translateX(-50%)', width: 340, height: 340, background: 'radial-gradient(circle, var(--color-amber-light) 0%, transparent 70%)' }} />
          <div className="flex items-center justify-center gap-2.5 relative z-10">
            <SeedlingIcon size={44} />
            <span className="font-heading text-[38px] font-light tracking-tight leading-none" style={{ color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
              em<span style={{ color: 'var(--color-amber)' }}>e</span>rge
            </span>
          </div>
          <p className="text-center mt-3 relative z-10 px-4" style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            Events near you · News worth reading · People building real things
          </p>
        </div>

        {/* What's new ribbon — only shows after onboarding is complete and an announcement is pending */}
        <WhatsNewRibbon />

        {/* Top navigation — 3 primary doors, always visible, centered on desktop */}
        <div className="shrink-0 sticky top-0 z-40" style={{ background: 'var(--color-bg)' }}>
          <div className="mx-auto w-full max-w-[640px]">
            <TopNav activeTab={activeTab} onTabChange={onTabChange} />
          </div>
        </div>

        {/* Tab content area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {activeTab === 'news' && <NewsScreen />}
          {activeTab === 'quests' && questView === 'map' && (
            <div>
              <QuestViewNav questView={questView} setQuestView={setQuestView} onPostQuest={onPostQuest} />
              <MapScreen quests={quests} userLocation={location} onSelectQuest={onSelectQuest} />
            </div>
          )}
          {activeTab === 'quests' && questView === 'skills' && (
            <div>
              <QuestViewNav questView={questView} setQuestView={setQuestView} onPostQuest={onPostQuest} />
              <SkillsScreen userId={userId} quests={quests} onSelectQuest={onSelectQuest} />
            </div>
          )}
          {activeTab === 'quests' && questView === 'list' && (<div>
            <QuestViewNav questView={questView} setQuestView={setQuestView} onPostQuest={onPostQuest} />

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

          {/* What is Emerge? + Theme toggle + Avatar */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => openWelcomeCard()}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold shrink-0 active:scale-90 transition-transform"
              style={{ background: 'var(--color-amber-bg)', border: '0.5px solid var(--color-amber-border)', color: 'var(--color-amber)' }}
              aria-label="What is Emerge?"
              title="What is Emerge?"
            >
              ?
            </button>
            <button
              onClick={() => setThemeState(toggleTheme())}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[14px] shrink-0 active:scale-90 transition-transform"
              style={{ background: 'var(--color-amber-bg)', border: '0.5px solid var(--color-amber-border)' }}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19'}
            </button>
          {isAnon ? (
            <button
              onClick={onSignIn}
              className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold shrink-0"
              style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)', border: 'none', cursor: 'pointer' }}
            >
              Sign in
            </button>
          ) : (
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
          )}
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
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

        </div> {/* end tab content */}

      </div>
      <OnboardingSplash />
      <SupportTicketButton />
    </div>
  )
}
