'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { FLOWER_PETALS } from '@/lib/flower-petals'

interface PitchCard {
  id: string
  title: string
  one_line_vision: string
  stage: string
  commitment_level: string
  country: string
  region: string
  language: string
  flower_petals: string[]
  roles_sought: string[]
  published_at: string | null
  hero_image_url: string | null
}

const STAGE_LABELS: Record<string, string> = {
  idea: 'Idea',
  gathering_people: 'Gathering people',
  has_core_group: 'Core group',
  seeking_land: 'Seeking land',
  has_land: 'Has land',
}
const STAGE_ORDER = ['idea', 'gathering_people', 'has_core_group', 'seeking_land', 'has_land']
const COMMITMENT_LABELS: Record<string, string> = {
  exploratory: 'Exploratory',
  part_time: 'Part-time',
  full_time: 'Full-time',
  lifetime: 'Lifetime',
}

type SortKey = 'recent' | 'earliest_stage'

export default function PitchesBrowsePage() {
  const router = useRouter()
  const [pitches, setPitches] = useState<PitchCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedPetal, setSelectedPetal] = useState<string | null>(null)
  const [selectedStage, setSelectedStage] = useState<string | null>(null)
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('recent')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('guild_pitches')
        .select('id, title, one_line_vision, stage, commitment_level, country, region, language, flower_petals, roles_sought, published_at, hero_image_url')
        .eq('status', 'published')
        .gt('expires_at', new Date().toISOString())
        .order('published_at', { ascending: false })
        .limit(100)
      if (error) { setError(error.message); setLoading(false); return }
      setPitches((data as PitchCard[]) || [])
      setLoading(false)
    }
    load()
  }, [])

  const countries = useMemo(() => {
    const s = new Set<string>()
    for (const p of pitches) if (p.country) s.add(p.country)
    return Array.from(s).sort()
  }, [pitches])

  const filtered = useMemo(() => {
    let rows = pitches
    if (selectedPetal) rows = rows.filter(p => p.flower_petals?.includes(selectedPetal))
    if (selectedStage) rows = rows.filter(p => p.stage === selectedStage)
    if (selectedCountry) rows = rows.filter(p => p.country === selectedCountry)
    if (sort === 'earliest_stage') {
      rows = [...rows].sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage))
    }
    return rows
  }, [pitches, selectedPetal, selectedStage, selectedCountry, sort])

  return (
    <div className="min-h-screen font-body flex justify-center" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full mx-auto max-w-[720px] xl:max-w-[1200px]" style={{ padding: '24px 20px 60px' }}>

        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push('/guild')}
            className="text-[13px]"
            style={{ color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ← The Guild
          </button>
        </div>

        <div className="mb-5">
          <h1 className="font-heading text-[28px] font-light leading-tight mb-2" style={{ color: 'var(--color-text)' }}>
            Pitches <em style={{ color: 'var(--color-amber)' }}>being born</em>
          </h1>
          <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
            Projects, communities, and eco-schools looking for people. Free to publish, always.
          </p>
        </div>

        {/* Filter chips */}
        <div className="space-y-2 mb-5">
          <div className="flex flex-wrap gap-1.5">
            {([
              { v: 'recent', l: 'Most recent' },
              { v: 'earliest_stage', l: 'Earliest stage' },
            ] as const).map(s => (
              <button
                key={s.v}
                onClick={() => setSort(s.v)}
                className="rounded-full px-3 py-1.5 text-[12px] whitespace-nowrap shrink-0"
                style={{
                  background: sort === s.v ? 'var(--color-amber-light)' : 'var(--color-pill-bg)',
                  color: sort === s.v ? 'var(--color-amber)' : 'var(--color-text-secondary)',
                  border: sort === s.v ? '0.5px solid var(--color-amber-border)' : '0.5px solid transparent',
                }}
              >{s.l}</button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedStage(null)}
              className="rounded-full px-3 py-1.5 text-[11px] whitespace-nowrap shrink-0"
              style={{
                background: selectedStage === null ? 'var(--color-text)' : 'var(--color-pill-bg)',
                color: selectedStage === null ? 'var(--color-bg)' : 'var(--color-text-secondary)',
              }}
            >All stages</button>
            {STAGE_ORDER.map(s => (
              <button
                key={s}
                onClick={() => setSelectedStage(selectedStage === s ? null : s)}
                className="rounded-full px-3 py-1.5 text-[11px] whitespace-nowrap shrink-0"
                style={{
                  background: selectedStage === s ? 'var(--color-amber)' : 'var(--color-pill-bg)',
                  color: selectedStage === s ? 'var(--color-pill-active-text)' : 'var(--color-text-secondary)',
                  border: '0.5px solid var(--color-amber-border)',
                }}
              >{STAGE_LABELS[s]}</button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedPetal(null)}
              className="rounded-full px-3 py-1.5 text-[11px] whitespace-nowrap shrink-0"
              style={{
                background: selectedPetal === null ? 'var(--color-text)' : 'var(--color-pill-bg)',
                color: selectedPetal === null ? 'var(--color-bg)' : 'var(--color-text-secondary)',
              }}
            >All petals</button>
            {FLOWER_PETALS.map(p => (
              <button
                key={p.key}
                onClick={() => setSelectedPetal(selectedPetal === p.key ? null : p.key)}
                className="rounded-full px-3 py-1.5 text-[11px] whitespace-nowrap shrink-0 flex items-center gap-1.5"
                style={{
                  background: selectedPetal === p.key ? `${p.color}20` : 'var(--color-pill-bg)',
                  color: selectedPetal === p.key ? p.color : 'var(--color-text-secondary)',
                  border: selectedPetal === p.key ? `0.5px solid ${p.color}` : '0.5px solid transparent',
                }}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                {p.label.replace(' Stewardship', '')}
              </button>
            ))}
          </div>

          {countries.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedCountry(null)}
                className="rounded-full px-3 py-1.5 text-[11px] whitespace-nowrap shrink-0"
                style={{
                  background: selectedCountry === null ? 'var(--color-text)' : 'var(--color-pill-bg)',
                  color: selectedCountry === null ? 'var(--color-bg)' : 'var(--color-text-secondary)',
                }}
              >All countries</button>
              {countries.map(c => (
                <button
                  key={c}
                  onClick={() => setSelectedCountry(selectedCountry === c ? null : c)}
                  className="rounded-full px-3 py-1.5 text-[11px] whitespace-nowrap shrink-0"
                  style={{
                    background: selectedCountry === c ? 'var(--color-amber)' : 'var(--color-pill-bg)',
                    color: selectedCountry === c ? 'var(--color-pill-active-text)' : 'var(--color-text-secondary)',
                    border: '0.5px solid var(--color-amber-border)',
                  }}
                >{c}</button>
              ))}
            </div>
          )}
        </div>

        {loading && <p className="text-[13px] text-center py-10" style={{ color: 'var(--color-text-muted)' }}>Loading pitches...</p>}
        {error && <p className="text-[13px] text-center py-10" style={{ color: 'var(--color-error)' }}>{error}</p>}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 px-6" style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
            {pitches.length === 0
              ? 'No live pitches yet. Be the first — your pitch is free to publish.'
              : 'No pitches match those filters.'}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(p => (
            <button
              key={p.id}
              onClick={() => router.push(`/guild/pitch/${p.id}`)}
              className="w-full text-left rounded-2xl overflow-hidden transition-all active:scale-[0.99]"
              style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)', cursor: 'pointer' }}
            >
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                    style={{ background: 'var(--color-amber-light)', color: 'var(--color-amber)' }}>
                    {STAGE_LABELS[p.stage]}
                  </span>
                  {p.country && (
                    <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                      {p.region ? `${p.region}, ${p.country}` : p.country}
                    </span>
                  )}
                  <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    · {COMMITMENT_LABELS[p.commitment_level]}
                  </span>
                </div>
                <h2 className="font-heading text-[18px] font-medium leading-tight mb-2" style={{ color: 'var(--color-text)' }}>
                  {p.title}
                </h2>
                <p className="text-[13px] italic leading-relaxed mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                  {p.one_line_vision}
                </p>
                {p.flower_petals.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {p.flower_petals.slice(0, 4).map(k => {
                      const petal = FLOWER_PETALS.find(x => x.key === k)
                      if (!petal) return null
                      return (
                        <span key={k} className="w-2 h-2 rounded-full" style={{ background: petal.color }} title={petal.label} />
                      )
                    })}
                    {p.roles_sought.slice(0, 2).map(r => (
                      <span key={r} className="rounded-full px-2 py-0.5 text-[10px] ml-1" style={{ background: 'var(--color-pill-bg)', color: 'var(--color-text-secondary)' }}>
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
