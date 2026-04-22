'use client'

import { useEffect, useMemo, useState } from 'react'
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
  // ~250 wpm, count words from summary; floor to whole minutes, min 2
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

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange])

  async function load() {
    setLoading(true)
    setError('')
    let query = supabase
      .from('news_items')
      .select('id,title,summary,source_url,source_name,source_domain,author,image_url,published_at,petal,ai_score')
      .gte('ai_score', 50)
      .order('published_at', { ascending: false })
      .limit(60)

    if (timeRange !== 'all') {
      const days = timeRange === '7d' ? 7 : 30
      query = query.gte('published_at', new Date(Date.now() - days * 86_400_000).toISOString())
    }

    const { data, error: dbErr } = await query
    setLoading(false)
    if (dbErr) { setError(dbErr.message); return }
    setItems((data as NewsItem[]) || [])
  }

  const filtered = useMemo(() => {
    if (!selectedPetal) return items
    return items.filter(i => i.petal === selectedPetal)
  }, [items, selectedPetal])

  const petalCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const i of items) counts[i.petal] = (counts[i.petal] || 0) + 1
    return counts
  }, [items])

  async function handleClick(item: NewsItem) {
    // Fire-and-forget click log — no UI delay
    try {
      const { data: user } = await supabase.auth.getUser()
      supabase.from('news_clicks').insert({
        news_item_id: item.id,
        user_id: user?.user?.id || null,
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

      {/* Time range chips */}
      <div className="flex gap-1.5 px-4 pt-3 pb-2 overflow-x-auto pill-scroll">
        {([{ v: '7d', l: 'This week' }, { v: '30d', l: 'This month' }, { v: 'all', l: 'All' }] as const).map(r => {
          const isActive = timeRange === r.v
          return (
            <button
              key={r.v}
              onClick={() => setTimeRange(r.v)}
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
      </div>

      {/* Petal filter chips */}
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
              {p.label.replace(' Stewardship', '').replace(' & ', ' & ')} · {count}
            </button>
          )
        })}
      </div>

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
          {items.length === 0
            ? 'No news yet in this time range — the news pipeline runs daily at 07:00 UTC.'
            : `Nothing here for ${PETAL_META[selectedPetal ?? '']?.label || 'this petal'} yet.`}
        </div>
      )}

      {/* News cards */}
      <div className="px-4 pb-8 space-y-3">
        {filtered.map(item => {
          const petalMeta = PETAL_META[item.petal]
          return (
            <a
              key={item.id}
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleClick(item)}
              className="block rounded-2xl overflow-hidden transition-transform active:scale-[0.99]"
              style={{
                background: 'var(--color-card)',
                border: '0.5px solid var(--color-border)',
                textDecoration: 'none',
              }}
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
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
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

                <div className="flex items-center justify-between mt-3">
                  <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    {estimateReadingTime(item.summary || item.title)}
                  </span>
                  <span className="text-[12px] font-medium" style={{ color: 'var(--color-amber)' }}>
                    Read →
                  </span>
                </div>
              </div>
            </a>
          )
        })}
      </div>
    </div>
  )
}
