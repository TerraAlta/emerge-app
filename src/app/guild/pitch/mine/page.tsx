'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { FLOWER_PETALS } from '@/lib/flower-petals'

export default function MyPitchesWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}><p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>Loading...</p></div>}>
      <MyPitchesPage />
    </Suspense>
  )
}

interface MyPitch {
  id: string
  title: string
  one_line_vision: string
  status: string
  stage: string
  published_at: string | null
  last_confirmed_active_at: string | null
  expires_at: string | null
  flower_petals: string[]
}

interface Match {
  id: string
  matched_type: 'practitioner' | 'pitch'
  matched_id: string
  reasoning: string
  score: number
  seen_by_pitcher: boolean
  _resolved?: { title?: string; display_name?: string; country?: string; tagline?: string }
}

const STAGE_LABELS: Record<string, string> = {
  idea: 'Idea', gathering_people: 'Gathering', has_core_group: 'Core group',
  seeking_land: 'Seeking land', has_land: 'Has land',
}
const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', published: 'Live', paused: 'Paused', expired: 'Expired',
  closed_success: 'Closed (success)', closed_abandoned: 'Closed (abandoned)',
}

function MyPitchesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [userId, setUserId] = useState<string | null>(null)
  const [pitches, setPitches] = useState<MyPitch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activePitchId, setActivePitchId] = useState<string | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [watcherCount, setWatcherCount] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)

  const flashConfirmed = searchParams.get('confirmed')
  const flashReactivated = searchParams.get('reactivated')

  useEffect(() => {
    async function load() {
      const { data: u } = await supabase.auth.getUser()
      if (!u.user) { router.push('/?auth=signin'); return }
      setUserId(u.user.id)

      const { data: ps, error: pErr } = await supabase
        .from('guild_pitches')
        .select('id, title, one_line_vision, status, stage, published_at, last_confirmed_active_at, expires_at, flower_petals')
        .eq('user_id', u.user.id)
        .order('created_at', { ascending: false })
      if (pErr) { setError(pErr.message); setLoading(false); return }

      setPitches((ps as MyPitch[]) || [])
      if (ps && ps.length > 0) setActivePitchId(ps[0].id)

      // Watcher counts for each pitch
      const counts: Record<string, number> = {}
      for (const p of (ps || [])) {
        const { count } = await supabase
          .from('guild_pitch_watchlist')
          .select('id', { count: 'exact', head: true })
          .eq('pitch_id', p.id)
        counts[p.id] = count || 0
      }
      setWatcherCount(counts)
      setLoading(false)
    }
    load()
  }, [router])

  useEffect(() => {
    async function loadMatches() {
      if (!activePitchId) { setMatches([]); return }
      const { data } = await supabase
        .from('guild_pitch_matches')
        .select('id, matched_type, matched_id, reasoning, score, seen_by_pitcher')
        .eq('pitch_id', activePitchId)
        .order('score', { ascending: false })
      const rows = (data as Match[]) || []

      // Resolve practitioner display_names + pitch titles in one pass
      const practIds = rows.filter(r => r.matched_type === 'practitioner').map(r => r.matched_id)
      const pitchIds = rows.filter(r => r.matched_type === 'pitch').map(r => r.matched_id)
      const [{ data: practs }, { data: otherPitches }] = await Promise.all([
        practIds.length > 0
          ? supabase.from('guild_practitioners').select('id, display_name, tagline, country').in('id', practIds)
          : Promise.resolve({ data: [] as any[] }),
        pitchIds.length > 0
          ? supabase.from('guild_pitches').select('id, title, country').in('id', pitchIds)
          : Promise.resolve({ data: [] as any[] }),
      ])
      const pMap = new Map<string, any>((practs || []).map((p: any) => [p.id, p]))
      const pitchMap = new Map<string, any>((otherPitches || []).map((p: any) => [p.id, p]))
      const resolved = rows.map(r => ({
        ...r,
        _resolved: r.matched_type === 'practitioner'
          ? pMap.get(r.matched_id)
          : pitchMap.get(r.matched_id),
      }))
      setMatches(resolved)
    }
    loadMatches()
  }, [activePitchId])

  async function confirmActive(pitchId: string) {
    setBusy(true)
    await fetch(`/api/guild/pitch/${pitchId}/confirm-active`, { method: 'POST' })
    setPitches(p => p.map(x => x.id === pitchId
      ? { ...x, last_confirmed_active_at: new Date().toISOString() } : x))
    setBusy(false)
  }

  async function reactivate(pitchId: string) {
    setBusy(true)
    await fetch(`/api/guild/pitch/${pitchId}/reactivate`, { method: 'POST' })
    window.location.reload()
  }

  async function setStatus(pitchId: string, status: string) {
    setBusy(true)
    await supabase.from('guild_pitches').update({ status, updated_at: new Date().toISOString() }).eq('id', pitchId)
    setPitches(p => p.map(x => x.id === pitchId ? { ...x, status } : x))
    setBusy(false)
  }

  async function markMatchSeen(matchId: string) {
    await supabase.from('guild_pitch_matches').update({ seen_by_pitcher: true }).eq('id', matchId)
    setMatches(m => m.map(x => x.id === matchId ? { ...x, seen_by_pitcher: true } : x))
  }

  const active = pitches.find(p => p.id === activePitchId)
  const daysSinceConfirm = active?.last_confirmed_active_at
    ? Math.floor((Date.now() - new Date(active.last_confirmed_active_at).getTime()) / 86_400_000)
    : 0
  const needsCheckIn = active && active.status === 'published' && daysSinceConfirm > 120

  return (
    <div className="min-h-screen font-body flex justify-center" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full" style={{ maxWidth: 720, padding: '24px 20px 60px' }}>

        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push('/guild')}
            className="text-[13px]"
            style={{ color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ← The Guild
          </button>
        </div>

        {(flashConfirmed || flashReactivated) && (
          <div className="rounded-xl p-3 mb-4" style={{ background: 'var(--color-amber-light)', border: '0.5px solid var(--color-amber-border)' }}>
            <p className="text-[13px]" style={{ color: 'var(--color-text)' }}>
              {flashConfirmed ? '✓ Confirmed active — thanks for the check-in.' : '✓ Pitch reactivated — live again for 6 months.'}
            </p>
          </div>
        )}

        <h1 className="font-heading text-[28px] font-light leading-tight mb-5" style={{ color: 'var(--color-text)' }}>
          My <em style={{ color: 'var(--color-amber)' }}>pitches</em>
        </h1>

        {loading && <p className="text-[13px] text-center py-10" style={{ color: 'var(--color-text-muted)' }}>Loading...</p>}
        {error && <p className="text-[13px] text-center py-10" style={{ color: 'var(--color-error)' }}>{error}</p>}

        {!loading && pitches.length === 0 && (
          <div className="text-center py-12">
            <p className="text-[13px] mb-4" style={{ color: 'var(--color-text-secondary)' }}>
              No pitches yet. Free to publish, always.
            </p>
            <button
              onClick={() => router.push('/guild/pitch/new')}
              className="rounded-full px-6 py-3 text-[13px] font-semibold"
              style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)', border: 'none', cursor: 'pointer' }}
            >
              Start your pitch
            </button>
          </div>
        )}

        {pitches.length > 1 && (
          <div className="flex gap-1.5 mb-4 overflow-x-auto pill-scroll">
            {pitches.map(p => (
              <button
                key={p.id}
                onClick={() => setActivePitchId(p.id)}
                className="rounded-full px-3 py-1.5 text-[12px] whitespace-nowrap shrink-0"
                style={{
                  background: activePitchId === p.id ? 'var(--color-amber)' : 'var(--color-pill-bg)',
                  color: activePitchId === p.id ? 'var(--color-pill-active-text)' : 'var(--color-text-secondary)',
                  border: '0.5px solid var(--color-amber-border)',
                }}
              >{p.title || '(untitled)'}</button>
            ))}
          </div>
        )}

        {active && (
          <>
            {/* Pitch summary card */}
            <div className="rounded-2xl p-5 mb-5" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)' }}>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ background: active.status === 'published' ? 'var(--color-amber-light)' : 'var(--color-pill-bg)', color: active.status === 'published' ? 'var(--color-amber)' : 'var(--color-text-muted)' }}>
                  {STATUS_LABELS[active.status]}
                </span>
                <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  Stage: {STAGE_LABELS[active.stage]}
                </span>
                {active.expires_at && active.status === 'published' && (
                  <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    · Expires {new Date(active.expires_at).toLocaleDateString()}
                  </span>
                )}
              </div>
              <h2 className="font-heading text-[20px] font-medium mb-1" style={{ color: 'var(--color-text)' }}>
                {active.title || '(untitled)'}
              </h2>
              <p className="text-[13px] italic mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                {active.one_line_vision}
              </p>

              {needsCheckIn && (
                <div className="rounded-lg p-3 mb-3" style={{ background: '#fff3cd', color: '#8a6d0b', fontSize: 12 }}>
                  ⏳ It's been {daysSinceConfirm} days since you confirmed this pitch is still active.
                  <button
                    onClick={() => confirmActive(active.id)}
                    disabled={busy}
                    className="ml-2 underline"
                    style={{ background: 'none', border: 'none', color: '#8a6d0b', cursor: 'pointer' }}
                  >Confirm now</button>
                </div>
              )}

              {active.status === 'expired' && (
                <div className="rounded-lg p-3 mb-3" style={{ background: '#f8d7da', color: '#842029', fontSize: 12 }}>
                  This pitch expired. Reactivate to publish it again for another 6 months.
                  <button
                    onClick={() => reactivate(active.id)}
                    disabled={busy}
                    className="ml-2 underline font-semibold"
                    style={{ background: 'none', border: 'none', color: '#842029', cursor: 'pointer' }}
                  >Reactivate</button>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => router.push(`/guild/pitch/${active.id}`)}
                  className="rounded-full px-4 py-2 text-[12px]"
                  style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)', border: 'none', cursor: 'pointer' }}
                >View public page</button>
                {active.status === 'published' && (
                  <button
                    onClick={() => setStatus(active.id, 'paused')}
                    disabled={busy}
                    className="rounded-full px-4 py-2 text-[12px]"
                    style={{ background: 'var(--color-pill-bg)', color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border)', cursor: 'pointer' }}
                  >Pause</button>
                )}
                {active.status === 'paused' && (
                  <button
                    onClick={() => setStatus(active.id, 'published')}
                    disabled={busy}
                    className="rounded-full px-4 py-2 text-[12px]"
                    style={{ background: 'var(--color-pill-bg)', color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border)', cursor: 'pointer' }}
                  >Resume</button>
                )}
                {active.status === 'published' && (
                  <>
                    <button
                      onClick={() => setStatus(active.id, 'closed_success')}
                      disabled={busy}
                      className="rounded-full px-4 py-2 text-[12px]"
                      style={{ background: 'var(--color-pill-bg)', color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border)', cursor: 'pointer' }}
                    >Close (success)</button>
                    <button
                      onClick={() => setStatus(active.id, 'closed_abandoned')}
                      disabled={busy}
                      className="rounded-full px-4 py-2 text-[12px]"
                      style={{ background: 'var(--color-pill-bg)', color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border)', cursor: 'pointer' }}
                    >Close (abandoned)</button>
                  </>
                )}
              </div>
            </div>

            {/* Watchers count */}
            <div className="rounded-xl p-3 mb-5 flex items-center justify-between"
              style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)' }}>
              <p className="text-[13px]" style={{ color: 'var(--color-text)' }}>
                👁 <strong>{watcherCount[active.id] || 0}</strong> {watcherCount[active.id] === 1 ? 'person is' : 'people are'} watching this pitch
              </p>
            </div>

            {/* Matches */}
            <h3 className="font-heading text-[18px] font-light mb-3" style={{ color: 'var(--color-text)' }}>
              Matches <em style={{ color: 'var(--color-amber)' }}>suggested</em>
            </h3>
            {matches.length === 0 && (
              <p className="text-[12px] py-4" style={{ color: 'var(--color-text-muted)' }}>
                No matches yet. They land here after the pitch is published — may take a minute.
              </p>
            )}
            <div className="space-y-2">
              {matches.map(m => {
                const name = m._resolved?.display_name || m._resolved?.title || '(unknown)'
                const country = m._resolved?.country
                const tagline = m._resolved?.tagline
                const matchHref = m.matched_type === 'practitioner'
                  ? `/guild#p-${m.matched_id}`  // practitioner directory anchor
                  : `/guild/pitch/${m.matched_id}`
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      if (!m.seen_by_pitcher) markMatchSeen(m.id)
                      router.push(matchHref)
                    }}
                    className="w-full text-left rounded-xl p-3 transition-all active:scale-[0.99]"
                    style={{
                      background: 'var(--color-card)',
                      border: `0.5px solid ${m.seen_by_pitcher ? 'var(--color-border)' : 'var(--color-amber-border)'}`,
                      cursor: 'pointer',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[10px] uppercase font-semibold tracking-wider"
                        style={{ color: m.matched_type === 'practitioner' ? 'var(--color-amber)' : 'var(--color-text-secondary)' }}>
                        {m.matched_type === 'practitioner' ? '⚙ Practitioner' : '🌱 Pitch'}
                      </span>
                      <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                        · match {Math.round(m.score * 100)}%
                      </span>
                      {country && <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>· {country}</span>}
                      {!m.seen_by_pitcher && (
                        <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase"
                          style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)' }}>new</span>
                      )}
                    </div>
                    <p className="text-[14px] font-medium" style={{ color: 'var(--color-text)' }}>
                      {name}
                    </p>
                    {tagline && <p className="text-[12px] italic" style={{ color: 'var(--color-text-secondary)' }}>{tagline}</p>}
                    {m.reasoning && (
                      <p className="text-[12px] mt-2 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                        {m.reasoning}
                      </p>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
