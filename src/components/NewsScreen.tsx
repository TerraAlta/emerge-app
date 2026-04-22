'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { FLOWER_PETALS } from '@/lib/flower-petals'

interface NewsItem {
  id: string
  title: string
  summary: string
  source_url: string
  source_name: string
  source_domain: string
  author: string | null
  image_url: string | null
  published_at: string
  petal: string
  ai_score: number
  resonate_count: number
}

type TimeRange = '7d' | '30d' | 'all'

const PETAL_META = Object.fromEntries(
  FLOWER_PETALS.map(p => [p.key, { label: p.label, color: p.color }]),
) as Record<string, { label: string; color: string }>

function formatRelativeDate(iso: string): string {
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function estimateReadingTime(summary: string): string {
  const words = summary.trim().split(/\s+/).length
  const minutes = Math.max(2, Math.round((words * 4) / 250))
  return `${minutes} min read`
}

export default function NewsScreen() {
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedPetal, setSelectedPetal] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRange>('30d')
  const [savedOnly, setSavedOnly] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [myResonates, setMyResonates] = useState<Set<string>>(new Set())
  const [mySaves, setMySaves] = useState<Set<string>>(new Set())

  // Get current user once
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null)
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    // Embed resonate count via PostgREST aggregate. news_saves is not embedded
    // here because we only need it for "saved only" filtering (query below).
    let query = supabase
      .from('news_items')
      .select(`
        id, title, summary, source_url, source_name, source_domain,
        author, image_url, published_at, petal, ai_score,
        news_resonates(count)
      `)
      .gte('ai_score', 50)
      .order('published_at', { ascending: false })
      .limit(60)

    if (timeRange !== 'all') {
      const days = timeRange === '7d' ? 7 : 30
      query = query.gte('published_at', new Date(Date.now() - days * 86_400_000).toISOString())
    }

    const { data, error: dbErr } = await query
    if (dbErr) { setError(dbErr.message); setLoading(false); return }

    // Flatten embedded count: news_resonates comes back as [{count: N}]
    const flat: NewsItem[] = (data ?? []).map((r: any) => ({
      ...r,
      resonate_count: Array.isArray(r.news_resonates) && r.news_resonates[0]
        ? r.news_resonates[0].count : 0,
    }))
    setItems(flat)

    // In parallel, fetch user's own resonates + saves so we can paint
    // filled icons. Only if signed in.
    if (userId && flat.length > 0) {
      const ids = flat.map(n => n.id)
      const [{ data: resData }, { data: saveData }] = await Promise.all([
        supabase.from('news_resonates').select('news_item_id').eq('user_id', userId).in('news_item_id', ids),
        supabase.from('news_saves').select('news_item_id').eq('user_id', userId).in('news_item_id', ids),
      ])
      setMyResonates(new Set((resData ?? []).map((r: any) => r.news_item_id)))
      setMySaves(new Set((saveData ?? []).map((r: any) => r.news_item_id)))
    } else {
      setMyResonates(new Set())
      setMySaves(new Set())
    }

    setLoading(false)
  }, [timeRange, userId])

  useEffect(() => {
    load()
  }, [load])

  // For "Saved only" mode, we override items with the user's saved items regardless of time range
  const loadSavedOnly = useCallback(async () => {
    if (!userId) { setItems([]); return }
    setLoading(true)
    // Get saved news_item_ids + saved_at, newest first
    const { data: saves } = await supabase
      .from('news_saves')
      .select('news_item_id, saved_at')
      .eq('user_id', userId)
      .order('saved_at', { ascending: false })
      .limit(100)
    const ids = (saves ?? []).map((s: any) => s.news_item_id)
    if (ids.length === 0) { setItems([]); setLoading(false); return }
    const { data: news } = await supabase
      .from('news_items')
      .select(`id, title, summary, source_url, source_name, source_domain,
               author, image_url, published_at, petal, ai_score,
               news_resonates(count)`)
      .in('id', ids)
    // Re-order to match saved_at desc
    const order = new Map(ids.map((id, i) => [id, i]))
    const flat: NewsItem[] = (news ?? [])
      .map((r: any) => ({
        ...r,
        resonate_count: Array.isArray(r.news_resonates) && r.news_resonates[0]
          ? r.news_resonates[0].count : 0,
      }))
      .sort((a, b) => (order.get(a.id)! - order.get(b.id)!))
    setItems(flat)
    // Also load user's resonates for these items (saves by definition = all set)
    const { data: resData } = await supabase
      .from('news_resonates').select('news_item_id').eq('user_id', userId).in('news_item_id', ids)
    setMyResonates(new Set((resData ?? []).map((r: any) => r.news_item_id)))
    setMySaves(new Set(ids))
    setLoading(false)
  }, [userId])

  useEffect(() => {
    if (savedOnly) loadSavedOnly()
    else load()
  }, [savedOnly, load, loadSavedOnly])

  const filtered = useMemo(() => {
    if (!selectedPetal) return items
    return items.filter(i => i.petal === selectedPetal)
  }, [items, selectedPetal])

  const petalCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const i of items) counts[i.petal] = (counts[i.petal] || 0) + 1
    return counts
  }, [items])

  /** Optimistic toggle — UI updates immediately, DB in background */
  async function toggleResonate(item: NewsItem) {
    if (!userId) { alert('Sign in to resonate'); return }
    const already = myResonates.has(item.id)
    // Optimistic update
    setMyResonates(prev => {
      const next = new Set(prev)
      if (already) next.delete(item.id); else next.add(item.id)
      return next
    })
    setItems(prev => prev.map(n => n.id === item.id
      ? { ...n, resonate_count: n.resonate_count + (already ? -1 : 1) }
      : n,
    ))
    const { error: err } = already
      ? await supabase.from('news_resonates').delete().eq('news_item_id', item.id).eq('user_id', userId)
      : await supabase.from('news_resonates').insert({ news_item_id: item.id, user_id: userId })
    if (err) {
      // Revert on failure
      setMyResonates(prev => {
        const next = new Set(prev)
        if (already) next.add(item.id); else next.delete(item.id)
        return next
      })
      setItems(prev => prev.map(n => n.id === item.id
        ? { ...n, resonate_count: n.resonate_count + (already ? 1 : -1) }
        : n,
      ))
    }
  }

  async function toggleSave(item: NewsItem) {
    if (!userId) { alert('Sign in to save'); return }
    const already = mySaves.has(item.id)
    setMySaves(prev => {
      const next = new Set(prev)
      if (already) next.delete(item.id); else next.add(item.id)
      return next
    })
    const { error: err } = already
      ? await supabase.from('news_saves').delete().eq('news_item_id', item.id).eq('user_id', userId)
      : await supabase.from('news_saves').insert({ news_item_id: item.id, user_id: userId })
    if (err) {
      setMySaves(prev => {
        const next = new Set(prev)
        if (already) next.add(item.id); else next.delete(item.id)
        return next
      })
    }
    // If in Saved-only mode and we just unsaved, drop it from the list
    if (savedOnly && already) {
      setItems(prev => prev.filter(n => n.id !== item.id))
    }
  }

  async function handleRead(item: NewsItem) {
    try {
      supabase.from('news_clicks').insert({
        news_item_id: item.id, user_id: userId || null,
      }).then(() => {})
    } catch { /* ignore */ }
  }

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="px-4 pt-5 pb-1">
        <p className="text-[12px] uppercase mb-0.5" style={{ color: 'var(--color-text-secondary)', letterSpacing: '0.08em' }}>
          Regenerative world
        </p>
        <h1 className="font-heading text-[20px] font-light leading-tight" style={{ color: 'var(--color-text)' }}>
          News <em style={{ color: 'var(--color-amber)' }}>worth reading</em>
        </h1>
      </div>

      {/* Mode chips: time range + Saved */}
      <div className="flex gap-1.5 px-4 pt-3 pb-2 overflow-x-auto pill-scroll">
        {([{ v: '7d', l: 'This week' }, { v: '30d', l: 'This month' }, { v: 'all', l: 'All' }] as const).map(r => {
          const isActive = !savedOnly && timeRange === r.v
          return (
            <button
              key={r.v}
              onClick={() => { setSavedOnly(false); setTimeRange(r.v) }}
              className="rounded-full px-3 py-1.5 text-[12px] whitespace-nowrap shrink-0 transition-all"
              style={{
                background: isActive ? 'var(--color-amber-light)' : 'var(--color-pill-bg)',
                color: isActive ? 'var(--color-amber)' : 'var(--color-text-secondary)',
                border: isActive ? '0.5px solid var(--color-amber-border)' : '0.5px solid transparent',
              }}
            >
              {r.l}
            </button>
          )
        })}
        {userId && (
          <button
            onClick={() => setSavedOnly(!savedOnly)}
            className="rounded-full px-3 py-1.5 text-[12px] whitespace-nowrap shrink-0 transition-all flex items-center gap-1.5"
            style={{
              background: savedOnly ? 'var(--color-amber-light)' : 'var(--color-pill-bg)',
              color: savedOnly ? 'var(--color-amber)' : 'var(--color-text-secondary)',
              border: savedOnly ? '0.5px solid var(--color-amber-border)' : '0.5px solid transparent',
            }}
          >
            🔖 Saved
          </button>
        )}
      </div>

      {/* Petal filter chips */}
      {!savedOnly && (
        <div className="flex gap-1.5 px-4 pt-1 pb-3 overflow-x-auto pill-scroll">
          <button
            onClick={() => setSelectedPetal(null)}
            className="rounded-full px-3 py-1.5 text-[11px] whitespace-nowrap shrink-0 transition-all"
            style={{
              background: selectedPetal === null ? 'var(--color-text)' : 'var(--color-pill-bg)',
              color: selectedPetal === null ? 'var(--color-bg)' : 'var(--color-text-secondary)',
            }}
          >
            All {items.length > 0 ? `· ${items.length}` : ''}
          </button>
          {FLOWER_PETALS.map(p => {
            const count = petalCounts[p.key] || 0
            if (count === 0) return null
            const isActive = selectedPetal === p.key
            return (
              <button
                key={p.key}
                onClick={() => setSelectedPetal(isActive ? null : p.key)}
                className="rounded-full px-3 py-1.5 text-[11px] whitespace-nowrap shrink-0 transition-all flex items-center gap-1.5"
                style={{
                  background: isActive ? `${p.color}20` : 'var(--color-pill-bg)',
                  color: isActive ? p.color : 'var(--color-text-secondary)',
                  border: isActive ? `0.5px solid ${p.color}` : '0.5px solid transparent',
                }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
                {p.label.replace(' Stewardship', '')} · {count}
              </button>
            )
          })}
        </div>
      )}

      {/* Content */}
      {loading && (
        <div className="text-center py-12" style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
          Reading the news…
        </div>
      )}
      {error && (
        <div className="text-center py-12" style={{ color: 'var(--color-error)', fontSize: 13 }}>
          {error}
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-16 px-6" style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
          {savedOnly
            ? 'Nothing saved yet. Tap the bookmark on any article to save it for later.'
            : items.length === 0
              ? 'No news yet in this time range — the news pipeline runs daily at 07:00 UTC.'
              : `Nothing here for ${PETAL_META[selectedPetal ?? '']?.label || 'this petal'} yet.`}
        </div>
      )}

      {/* News cards */}
      <div className="px-4 pb-8 space-y-3">
        {filtered.map(item => {
          const petalMeta = PETAL_META[item.petal]
          const resonated = myResonates.has(item.id)
          const saved = mySaves.has(item.id)
          return (
            <div
              key={item.id}
              className="rounded-2xl overflow-hidden"
              style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)' }}
            >
              <a
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handleRead(item)}
                className="block"
                style={{ textDecoration: 'none' }}
              >
                {item.image_url && (
                  <div className="w-full" style={{ aspectRatio: '16/9', background: 'var(--color-pill-bg)' }}>
                    <img
                      src={item.image_url}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                  </div>
                )}
                <div className="px-4 pt-4 pb-2">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {petalMeta && (
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                        style={{ background: `${petalMeta.color}20`, color: petalMeta.color }}
                      >
                        {petalMeta.label.replace(' Stewardship', '').replace('Land & Nature', 'Land')}
                      </span>
                    )}
                    <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                      {item.source_name}
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>·</span>
                    <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                      {formatRelativeDate(item.published_at)}
                    </span>
                  </div>

                  <h2 className="font-heading text-[17px] font-medium leading-tight mb-2" style={{ color: 'var(--color-text)' }}>
                    {item.title}
                  </h2>

                  {item.summary && (
                    <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                      {item.summary.length > 200 ? item.summary.slice(0, 200) + '…' : item.summary}
                    </p>
                  )}
                </div>
              </a>

              {/* Action bar */}
              <div className="px-4 pb-3 pt-1 flex items-center gap-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                {/* Resonate */}
                <button
                  onClick={(e) => { e.preventDefault(); toggleResonate(item) }}
                  className="flex items-center gap-1.5 py-2 text-[13px] transition-all active:scale-95"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: resonated ? 'var(--color-amber)' : 'var(--color-text-muted)',
                  }}
                  aria-label={resonated ? 'Unresonate' : 'Resonate'}
                >
                  <span style={{ fontSize: 16 }}>{resonated ? '🌱' : '🌱'}</span>
                  <span style={{ opacity: resonated ? 1 : 0.7 }}>
                    {item.resonate_count > 0 ? item.resonate_count : ''} {resonated ? 'Resonated' : 'Resonate'}
                  </span>
                </button>

                {/* Save */}
                <button
                  onClick={(e) => { e.preventDefault(); toggleSave(item) }}
                  className="flex items-center gap-1.5 py-2 text-[13px] transition-all active:scale-95"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: saved ? 'var(--color-amber)' : 'var(--color-text-muted)',
                  }}
                  aria-label={saved ? 'Unsave' : 'Save for later'}
                >
                  <span style={{ fontSize: 14 }}>{saved ? '🔖' : '🏷️'}</span>
                  <span style={{ opacity: saved ? 1 : 0.7 }}>{saved ? 'Saved' : 'Save'}</span>
                </button>

                <div className="flex-1" />

                <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  {estimateReadingTime(item.summary || item.title)}
                </span>
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handleRead(item)}
                  className="text-[12px] font-medium"
                  style={{ color: 'var(--color-amber)', textDecoration: 'none' }}
                >
                  Read →
                </a>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
