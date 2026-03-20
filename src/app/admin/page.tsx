'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

/* ── Types ── */
type TabKey = 'analytics' | 'pipeline'

interface Stats {
  totalUsers: number | null
  totalQuests: number | null
  questsJoined: number | null
  userPostedQuests: number | null
}

interface CityCount {
  location_name: string
  count: number
}

interface RecentSignup {
  first_name: string
  created_at: string
}

interface PopularQuest {
  id: string
  title: string
  participant_count: number
}

interface PipelineSource {
  source_name: string
  quest_count: number
  last_event_date: string | null
  status: 'active' | 'stale' | 'none'
}

/* ── Seedling Logo ── */
function SeedlingIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <circle cx="18" cy="22" r="10" fill="rgba(200,145,58,0.15)" stroke="rgba(200,145,58,0.3)" strokeWidth="0.8" />
      <path d="M18 22 Q14 16 13 10 Q16 14 18 12 Q20 14 23 10 Q22 16 18 22Z" fill="#C8913A" opacity="0.9" />
      <path d="M18 22 L18 30" stroke="rgba(200,145,58,0.5)" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="18" cy="22" r="2" fill="#C8913A" />
    </svg>
  )
}

/* ── Stat Card ── */
function StatCard({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div
      className="rounded-[12px] px-4 py-3 flex-1 min-w-[140px]"
      style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.12)' }}
    >
      <div className="text-[22px] font-semibold font-heading" style={{ color: '#C8913A' }}>
        {value === null ? '\u2014' : value}
      </div>
      <div className="text-[10px] mt-0.5 uppercase" style={{ color: 'rgba(232,242,224,0.4)', letterSpacing: '0.08em' }}>
        {label}
      </div>
    </div>
  )
}

/* ── Section Header ── */
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-[9px] uppercase px-1 mb-2"
      style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.1em' }}
    >
      {children}
    </h2>
  )
}

/* ── Status Dot ── */
function StatusDot({ status }: { status: 'active' | 'stale' | 'none' }) {
  const colors = {
    active: '#4ADE80',
    stale: '#FACC15',
    none: '#EF4444',
  }
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ background: colors[status] }}
      title={status === 'active' ? 'Active (future events)' : status === 'stale' ? 'Stale (only past events)' : 'No events'}
    />
  )
}

/* ── Format date helper ── */
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/* ══════════════════════════════════════════════════════════════════
   Analytics Tab
   ══════════════════════════════════════════════════════════════════ */
function AnalyticsTab() {
  const [stats, setStats] = useState<Stats>({ totalUsers: null, totalQuests: null, questsJoined: null, userPostedQuests: null })
  const [cities, setCities] = useState<CityCount[]>([])
  const [signups, setSignups] = useState<RecentSignup[]>([])
  const [popular, setPopular] = useState<PopularQuest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)

      // Total users — profiles may be RLS-restricted, try and fallback
      let totalUsers: number | null = null
      try {
        const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
        totalUsers = count
      } catch { /* RLS blocked */ }

      // Total quests
      const { count: totalQuests } = await supabase.from('quests').select('*', { count: 'exact', head: true })

      // Quests joined
      let questsJoined: number | null = null
      try {
        const { count } = await supabase.from('quest_participants').select('*', { count: 'exact', head: true })
        questsJoined = count
      } catch { /* RLS blocked */ }

      // User-posted quests
      const { count: userPostedQuests } = await supabase
        .from('quests')
        .select('*', { count: 'exact', head: true })
        .eq('source', 'user')

      setStats({
        totalUsers,
        totalQuests: totalQuests ?? null,
        questsJoined,
        userPostedQuests: userPostedQuests ?? null,
      })

      // Most active cities — group by location_name using raw query workaround
      // Since supabase-js doesn't support GROUP BY directly, we fetch all and aggregate client-side
      const { data: questLocations } = await supabase
        .from('quests')
        .select('location_name')
      if (questLocations) {
        const cityMap: Record<string, number> = {}
        for (const q of questLocations) {
          const name = q.location_name || 'Unknown'
          cityMap[name] = (cityMap[name] || 0) + 1
        }
        const sorted = Object.entries(cityMap)
          .map(([location_name, count]) => ({ location_name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)
        setCities(sorted)
      }

      // Recent signups
      try {
        const { data: recentUsers } = await supabase
          .from('profiles')
          .select('first_name, created_at')
          .order('created_at', { ascending: false })
          .limit(5)
        if (recentUsers) setSignups(recentUsers)
      } catch { /* RLS blocked */ }

      // Most popular quests by participant count
      // We fetch quest_participants, count per quest, then fetch quest titles
      try {
        const { data: participants } = await supabase
          .from('quest_participants')
          .select('quest_id')
        if (participants && participants.length > 0) {
          const countMap: Record<string, number> = {}
          for (const p of participants) {
            countMap[p.quest_id] = (countMap[p.quest_id] || 0) + 1
          }
          const topIds = Object.entries(countMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)

          const { data: questTitles } = await supabase
            .from('quests')
            .select('id, title')
            .in('id', topIds.map(([id]) => id))

          if (questTitles) {
            const titleMap: Record<string, string> = {}
            for (const q of questTitles) titleMap[q.id] = q.title
            setPopular(
              topIds.map(([id, count]) => ({
                id,
                title: titleMap[id] || 'Unknown Quest',
                participant_count: count,
              }))
            )
          }
        }
      } catch { /* RLS blocked */ }

      setLoading(false)
    }

    load()
  }, [])

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex gap-3 flex-wrap">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-[12px] h-[68px] flex-1 min-w-[140px]" style={{ background: '#162814' }} />
          ))}
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-[12px] h-[120px]" style={{ background: '#162814' }} />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="flex gap-3 flex-wrap">
        <StatCard label="Total users" value={stats.totalUsers} />
        <StatCard label="Total quests" value={stats.totalQuests} />
        <StatCard label="Quests joined" value={stats.questsJoined} />
        <StatCard label="User-posted" value={stats.userPostedQuests} />
      </div>

      {/* Most active cities */}
      <div>
        <SectionHeader>Most active cities</SectionHeader>
        <div
          className="rounded-[12px] overflow-hidden"
          style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.12)' }}
        >
          {cities.length === 0 ? (
            <div className="px-4 py-6 text-center text-[11px]" style={{ color: 'rgba(232,242,224,0.3)' }}>
              No location data yet
            </div>
          ) : (
            cities.map((city, i) => (
              <div
                key={city.location_name}
                className="flex items-center justify-between px-4 py-2.5"
                style={{ borderBottom: i < cities.length - 1 ? '0.5px solid rgba(232,242,224,0.04)' : 'none' }}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-[10px] font-mono w-5 text-right" style={{ color: 'rgba(232,242,224,0.25)' }}>
                    {i + 1}
                  </span>
                  <span className="text-[12px]" style={{ color: '#E8F2E0' }}>
                    {city.location_name}
                  </span>
                </div>
                <span className="text-[11px] font-semibold" style={{ color: '#C8913A' }}>
                  {city.count}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recent signups */}
      <div>
        <SectionHeader>Recent signups</SectionHeader>
        <div
          className="rounded-[12px] overflow-hidden"
          style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.12)' }}
        >
          {signups.length === 0 ? (
            <div className="px-4 py-6 text-center text-[11px]" style={{ color: 'rgba(232,242,224,0.3)' }}>
              {stats.totalUsers === null ? 'Profiles table restricted by RLS \u2014 needs an RPC function' : 'No signups yet'}
            </div>
          ) : (
            signups.map((u, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-4 py-2.5"
                style={{ borderBottom: i < signups.length - 1 ? '0.5px solid rgba(232,242,224,0.04)' : 'none' }}
              >
                <span className="text-[12px]" style={{ color: '#E8F2E0' }}>
                  {u.first_name || 'Anonymous'}
                </span>
                <span className="text-[10px]" style={{ color: 'rgba(232,242,224,0.35)' }}>
                  {fmtShortDate(u.created_at)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Most popular quests */}
      <div>
        <SectionHeader>Most popular quests</SectionHeader>
        <div
          className="rounded-[12px] overflow-hidden"
          style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.12)' }}
        >
          {popular.length === 0 ? (
            <div className="px-4 py-6 text-center text-[11px]" style={{ color: 'rgba(232,242,224,0.3)' }}>
              {stats.questsJoined === null ? 'Participants table restricted by RLS \u2014 needs an RPC function' : 'No participants yet'}
            </div>
          ) : (
            popular.map((q, i) => (
              <div
                key={q.id}
                className="flex items-center justify-between px-4 py-2.5 gap-3"
                style={{ borderBottom: i < popular.length - 1 ? '0.5px solid rgba(232,242,224,0.04)' : 'none' }}
              >
                <span className="text-[12px] truncate flex-1" style={{ color: '#E8F2E0' }}>
                  {q.title}
                </span>
                <span className="text-[11px] font-semibold shrink-0" style={{ color: '#C8913A' }}>
                  {q.participant_count} joined
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   Pipeline Tab
   ══════════════════════════════════════════════════════════════════ */
function PipelineTab() {
  const [sources, setSources] = useState<PipelineSource[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)

      // Fetch all quests with source_name and starts_at
      const { data: quests } = await supabase
        .from('quests')
        .select('source_name, starts_at')

      if (quests && quests.length > 0) {
        const now = new Date()
        const sourceMap: Record<string, { count: number; lastDate: string | null; hasFuture: boolean }> = {}

        for (const q of quests) {
          const name = q.source_name || 'unknown'
          if (!sourceMap[name]) {
            sourceMap[name] = { count: 0, lastDate: null, hasFuture: false }
          }
          sourceMap[name].count++

          if (q.starts_at) {
            if (!sourceMap[name].lastDate || q.starts_at > sourceMap[name].lastDate!) {
              sourceMap[name].lastDate = q.starts_at
            }
            if (new Date(q.starts_at) > now) {
              sourceMap[name].hasFuture = true
            }
          }
        }

        const sorted = Object.entries(sourceMap)
          .map(([source_name, data]) => ({
            source_name,
            quest_count: data.count,
            last_event_date: data.lastDate,
            status: (data.hasFuture ? 'active' : data.lastDate ? 'stale' : 'none') as PipelineSource['status'],
          }))
          .sort((a, b) => b.quest_count - a.quest_count)

        setSources(sorted)
      }

      setLoading(false)
    }

    load()
  }, [])

  const totalSources = sources.length
  const activeSources = sources.filter(s => s.status === 'active').length
  const staleSources = sources.filter(s => s.status === 'stale').length

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="rounded-[12px] h-[52px]" style={{ background: '#162814' }} />
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="rounded-[12px] h-[48px]" style={{ background: '#162814' }} />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary pills */}
      <div className="flex gap-3">
        <div className="rounded-[12px] px-4 py-2.5 flex-1" style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.12)' }}>
          <div className="text-[18px] font-semibold font-heading" style={{ color: '#C8913A' }}>{totalSources}</div>
          <div className="text-[9px] uppercase" style={{ color: 'rgba(232,242,224,0.4)', letterSpacing: '0.08em' }}>Total sources</div>
        </div>
        <div className="rounded-[12px] px-4 py-2.5 flex-1" style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.12)' }}>
          <div className="text-[18px] font-semibold font-heading" style={{ color: '#4ADE80' }}>{activeSources}</div>
          <div className="text-[9px] uppercase" style={{ color: 'rgba(232,242,224,0.4)', letterSpacing: '0.08em' }}>Active</div>
        </div>
        <div className="rounded-[12px] px-4 py-2.5 flex-1" style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.12)' }}>
          <div className="text-[18px] font-semibold font-heading" style={{ color: '#FACC15' }}>{staleSources}</div>
          <div className="text-[9px] uppercase" style={{ color: 'rgba(232,242,224,0.4)', letterSpacing: '0.08em' }}>Stale</div>
        </div>
      </div>

      {/* Table header */}
      <div
        className="flex items-center gap-3 px-4 py-2 text-[9px] uppercase"
        style={{ color: 'rgba(232,242,224,0.3)', letterSpacing: '0.08em' }}
      >
        <span className="w-3" />
        <span className="flex-1">Source</span>
        <span className="w-14 text-right">Quests</span>
        <span className="w-24 text-right">Last event</span>
      </div>

      {/* Source rows */}
      <div
        className="rounded-[12px] overflow-hidden"
        style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.12)' }}
      >
        {sources.length === 0 ? (
          <div className="px-4 py-8 text-center text-[11px]" style={{ color: 'rgba(232,242,224,0.3)' }}>
            No quest sources found
          </div>
        ) : (
          sources.map((src, i) => (
            <div
              key={src.source_name}
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: i < sources.length - 1 ? '0.5px solid rgba(232,242,224,0.04)' : 'none' }}
            >
              <StatusDot status={src.status} />
              <span className="flex-1 text-[12px] truncate" style={{ color: '#E8F2E0' }}>
                {src.source_name}
              </span>
              <span className="w-14 text-right text-[12px] font-semibold" style={{ color: '#C8913A' }}>
                {src.quest_count}
              </span>
              <span className="w-24 text-right text-[10px]" style={{ color: 'rgba(232,242,224,0.35)' }}>
                {src.last_event_date ? fmtDate(src.last_event_date) : '\u2014'}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-4 px-1 pt-1">
        {[
          { status: 'active' as const, label: 'Future events' },
          { status: 'stale' as const, label: 'Past only' },
          { status: 'none' as const, label: 'No dates' },
        ].map(item => (
          <div key={item.status} className="flex items-center gap-1.5">
            <StatusDot status={item.status} />
            <span className="text-[9px]" style={{ color: 'rgba(232,242,224,0.35)' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   Admin Page
   ══════════════════════════════════════════════════════════════════ */
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'terraalta.sintra@gmail.com'

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('analytics')
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setAuthed(data.user?.email === ADMIN_EMAIL)
    })
  }, [])

  if (authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0D1A0B' }}>
        <div className="text-[11px] animate-pulse" style={{ color: 'rgba(232,242,224,0.3)' }}>Loading…</div>
      </div>
    )
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6" style={{ background: '#0D1A0B' }}>
        <p className="text-[13px] text-center" style={{ color: 'rgba(232,242,224,0.5)' }}>
          Admin access restricted.
        </p>
        <a href="/" className="text-[11px]" style={{ color: '#C8913A', textDecoration: 'underline' }}>
          Back to app
        </a>
      </div>
    )
  }

  return (
    <div className="min-h-screen font-body" style={{ background: '#0D1A0B' }}>
      {/* Header */}
      <div className="px-6 pt-8 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <SeedlingIcon size={22} />
          <span className="font-heading text-[22px] font-light" style={{ color: '#E8F2E0', letterSpacing: '-0.01em' }}>
            em<span style={{ color: '#C8913A' }}>e</span>rge
          </span>
          <span
            className="text-[9px] uppercase px-1.5 py-0.5 rounded-full ml-1"
            style={{ background: 'rgba(200,145,58,0.15)', color: '#C8913A', letterSpacing: '0.06em', border: '0.5px solid rgba(200,145,58,0.25)' }}
          >
            Admin
          </span>
        </div>
        <p className="text-[10px]" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.04em' }}>
          Platform overview &amp; pipeline health
        </p>
      </div>

      {/* Tab toggle */}
      <div className="px-6 pb-5">
        <div
          className="inline-flex rounded-[10px] p-0.5"
          style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.12)' }}
        >
          {(['analytics', 'pipeline'] as const).map(tab => {
            const isActive = activeTab === tab
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-5 py-2 rounded-[8px] text-[11px] font-medium transition-all"
                style={{
                  background: isActive ? 'rgba(200,145,58,0.18)' : 'transparent',
                  color: isActive ? '#C8913A' : 'rgba(232,242,224,0.4)',
                  letterSpacing: '0.04em',
                }}
              >
                {tab === 'analytics' ? 'Analytics' : 'Pipeline'}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 pb-12">
        {activeTab === 'analytics' ? <AnalyticsTab /> : <PipelineTab />}
      </div>

      {/* Footer */}
      <div className="px-6 pb-8 text-center">
        <a
          href="/"
          className="text-[10px] inline-block"
          style={{ color: 'rgba(200,145,58,0.4)', textDecoration: 'underline' }}
        >
          Back to app
        </a>
      </div>
    </div>
  )
}
