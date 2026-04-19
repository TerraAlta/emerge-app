'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { FLOWER_PETALS, PROJECT_SCALES } from '@/lib/flower-petals'
import PractitionerCard, { type Practitioner } from '@/components/PractitionerCard'

export default function GuildPage() {
  const router = useRouter()
  const [practitioners, setPractitioners] = useState<Practitioner[]>([])
  const [loading, setLoading] = useState(true)
  const [hasOwnProfile, setHasOwnProfile] = useState<boolean | null>(null)

  // Filters
  const [filterCountry, setFilterCountry] = useState('')
  const [filterLanguage, setFilterLanguage] = useState('')
  const [filterPetal, setFilterPetal] = useState('')
  const [filterScale, setFilterScale] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    // Fetch verified practitioners
    supabase
      .from('guild_practitioners')
      .select('*')
      .eq('verified', true)
      .neq('availability_status', 'unavailable')
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        setPractitioners((data as Practitioner[]) || [])
        setLoading(false)
      })

    // Check if current user has a profile
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { setHasOwnProfile(false); return }
      supabase
        .from('guild_practitioners')
        .select('id')
        .eq('user_id', data.user.id)
        .maybeSingle()
        .then(({ data: p }) => setHasOwnProfile(!!p))
    })
  }, [])

  // Derive filter options from loaded data
  const countries = useMemo(() => {
    return Array.from(new Set(practitioners.map(p => p.country).filter(Boolean))).sort()
  }, [practitioners])

  const languages = useMemo(() => {
    const all = new Set<string>()
    practitioners.forEach(p => (p.languages || []).forEach(l => all.add(l)))
    return Array.from(all).sort()
  }, [practitioners])

  // Filter logic
  const filtered = useMemo(() => {
    return practitioners.filter(p => {
      if (filterCountry && p.country !== filterCountry) return false
      if (filterLanguage && !(p.languages || []).includes(filterLanguage)) return false
      if (filterPetal && !(p.flower_petals || []).includes(filterPetal)) return false
      if (filterScale && !(p.project_scales || []).includes(filterScale)) return false
      return true
    })
  }, [practitioners, filterCountry, filterLanguage, filterPetal, filterScale])

  function clearFilters() {
    setFilterCountry(''); setFilterLanguage(''); setFilterPetal(''); setFilterScale('')
  }

  const activeFilterCount = [filterCountry, filterLanguage, filterPetal, filterScale].filter(Boolean).length

  return (
    <div className="min-h-screen font-body flex justify-center" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full relative flex flex-col" style={{ maxWidth: 640, minHeight: '100dvh' }}>

        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-4 shrink-0">
          <button
            onClick={() => router.push('/')}
            className="text-[13px]"
            style={{ color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ← Emerge
          </button>
        </div>

        {/* Hero */}
        <div className="px-5 pb-6 text-center relative overflow-hidden">
          <div
            className="absolute pointer-events-none"
            style={{ bottom: -60, left: '50%', transform: 'translateX(-50%)', width: 340, height: 340, background: 'radial-gradient(circle, var(--color-amber-light) 0%, transparent 70%)' }}
          />
          <h1
            className="font-heading text-[42px] font-light leading-tight mb-2 relative z-10"
            style={{ color: 'var(--color-text)' }}
          >
            The <em style={{ color: 'var(--color-amber)' }}>Guild</em>
          </h1>
          <p
            className="text-[12px] uppercase tracking-[0.2em] mb-5 relative z-10"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Regenerative practitioners, worldwide
          </p>
          <p
            className="text-[14px] leading-relaxed max-w-md mx-auto relative z-10"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            A network of designers, builders, facilitators, healers, economists
            and governance workers across the full permaculture flower. Free
            listing, always. No bidding, no commission.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap gap-2 justify-center mt-5 relative z-10">
            {hasOwnProfile === false && (
              <button
                onClick={() => router.push('/guild/join')}
                className="rounded-full px-6 py-3 text-[13px] font-semibold"
                style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)', border: 'none', cursor: 'pointer' }}
              >
                Join the Guild
              </button>
            )}
            {hasOwnProfile === true && (
              <span className="text-[12px] self-center" style={{ color: 'var(--color-amber)' }}>
                ✓ Your profile is submitted
              </span>
            )}
            <button
              onClick={() => router.push('/guild/project/new')}
              className="rounded-full px-6 py-3 text-[13px] font-semibold"
              style={{
                background: 'transparent',
                color: 'var(--color-amber)',
                border: '0.5px solid var(--color-amber)',
                cursor: 'pointer',
              }}
            >
              Commission a scoping
            </button>
          </div>
        </div>

        {/* Directory header */}
        <div className="px-5 pt-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading text-[18px] font-light" style={{ color: 'var(--color-text)' }}>
              {filtered.length} practitioner{filtered.length !== 1 ? 's' : ''}
            </h2>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="rounded-full px-3 py-1.5 text-[11px]"
              style={{
                background: activeFilterCount > 0 ? 'var(--color-amber-light)' : 'var(--color-pill-bg)',
                color: activeFilterCount > 0 ? 'var(--color-amber)' : 'var(--color-text-secondary)',
                border: '0.5px solid var(--color-amber-border)',
                cursor: 'pointer',
              }}
            >
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
          </div>

          {/* Filters panel */}
          {showFilters && (
            <div
              className="rounded-xl p-3 mb-4 space-y-3"
              style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)' }}
            >
              <div>
                <label className="text-[10px] uppercase tracking-widest block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  Country
                </label>
                <select
                  value={filterCountry}
                  onChange={e => setFilterCountry(e.target.value)}
                  className="w-full rounded-lg px-2 py-1.5 text-[12px]"
                  style={{ background: 'var(--color-pill-bg)', border: '0.5px solid var(--color-amber-border)', color: 'var(--color-text)' }}
                >
                  <option value="">All countries</option>
                  {countries.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  Language
                </label>
                <select
                  value={filterLanguage}
                  onChange={e => setFilterLanguage(e.target.value)}
                  className="w-full rounded-lg px-2 py-1.5 text-[12px]"
                  style={{ background: 'var(--color-pill-bg)', border: '0.5px solid var(--color-amber-border)', color: 'var(--color-text)' }}
                >
                  <option value="">All languages</option>
                  {languages.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  Petal
                </label>
                <div className="flex flex-wrap gap-1">
                  {FLOWER_PETALS.map(petal => (
                    <button
                      key={petal.key}
                      onClick={() => setFilterPetal(filterPetal === petal.key ? '' : petal.key)}
                      className="rounded-full px-2.5 py-1 text-[10px] flex items-center gap-1"
                      style={{
                        background: filterPetal === petal.key ? 'var(--color-amber-light)' : 'var(--color-pill-bg)',
                        color: filterPetal === petal.key ? 'var(--color-text)' : 'var(--color-text-secondary)',
                        border: `0.5px solid ${filterPetal === petal.key ? petal.color : 'var(--color-amber-border)'}`,
                        cursor: 'pointer',
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: petal.color }}></span>
                      {petal.label.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  Project scale
                </label>
                <select
                  value={filterScale}
                  onChange={e => setFilterScale(e.target.value)}
                  className="w-full rounded-lg px-2 py-1.5 text-[12px]"
                  style={{ background: 'var(--color-pill-bg)', border: '0.5px solid var(--color-amber-border)', color: 'var(--color-text)' }}
                >
                  <option value="">Any scale</option>
                  {PROJECT_SCALES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="text-[11px] underline"
                  style={{ color: 'var(--color-amber)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* Directory list */}
        <div className="flex-1 px-5 pb-10">
          {loading && (
            <p className="text-center py-10 text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
              Loading practitioners...
            </p>
          )}

          {!loading && filtered.length === 0 && practitioners.length === 0 && (
            <div
              className="rounded-2xl p-6 text-center"
              style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)' }}
            >
              <p className="text-[14px] mb-3" style={{ color: 'var(--color-text)' }}>
                The Guild is just beginning.
              </p>
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                No practitioners verified yet. Be the first — join and help seed this network.
              </p>
            </div>
          )}

          {!loading && filtered.length === 0 && practitioners.length > 0 && (
            <div className="text-center py-10">
              <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                No practitioners match these filters.
              </p>
              <button
                onClick={clearFilters}
                className="mt-2 text-[12px] underline"
                style={{ color: 'var(--color-amber)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Clear filters
              </button>
            </div>
          )}

          <div className="space-y-3">
            {filtered.map(p => (
              <PractitionerCard key={p.id} practitioner={p} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
