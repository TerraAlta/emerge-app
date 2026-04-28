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
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null)
  const [authGate, setAuthGate] = useState<null | 'practitioner' | 'land' | 'vision'>(null)

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
      if (!data.user) { setIsSignedIn(false); setHasOwnProfile(false); return }
      setIsSignedIn(true)
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

  // Door click handlers — gate behind auth for non-signed-in users
  function openPractitionerDoor() {
    if (isSignedIn === false) { setAuthGate('practitioner'); return }
    router.push(hasOwnProfile ? '/guild/pitch/mine' : '/guild/join')
  }
  function openLandDoor() {
    if (isSignedIn === false) { setAuthGate('land'); return }
    router.push('/guild/project/new')
  }
  function openVisionDoor() {
    if (isSignedIn === false) { setAuthGate('vision'); return }
    router.push('/guild/pitch/new')
  }

  const gateCopy: Record<NonNullable<typeof authGate>, { title: string; body: string }> = {
    practitioner: {
      title: 'Create an account to join the Guild',
      body: 'Practitioner profiles are tied to your Emerge account so you can edit them, get matched, and stay in touch.',
    },
    land: {
      title: 'Create an account to start a project',
      body: 'Your scoping doc and matched practitioners live in your account so you can come back and check progress.',
    },
    vision: {
      title: 'Create an account to publish a pitch',
      body: 'Pitches are tied to your account so you can edit, receive matches, and reach out.',
    },
  }

  return (
    <div className="min-h-screen font-body flex justify-center" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full relative flex flex-col mx-auto max-w-[640px] xl:max-w-[1200px]" style={{ minHeight: '100dvh' }}>

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

          {/* CTAs — three doors */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6 mb-2 relative z-10 max-w-[720px] mx-auto">
            {/* Door 1 — practitioner */}
            <button
              onClick={openPractitionerDoor}
              className="flex-1 rounded-2xl p-4 text-left transition-all active:scale-[0.99]"
              style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)', cursor: 'pointer', minHeight: 120 }}
            >
              <p className="text-[11px] uppercase mb-1" style={{ color: 'var(--color-amber)', letterSpacing: '0.1em' }}>
                Free
              </p>
              <p className="font-heading text-[15px] font-medium mb-1" style={{ color: 'var(--color-text)' }}>
                I'm a <em style={{ color: 'var(--color-amber)' }}>practitioner</em>
              </p>
              <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                {hasOwnProfile ? '✓ Your profile is submitted' : 'Offer your craft to regenerative projects. Free listing, no bidding, no commission.'}
              </p>
            </button>

            {/* Door 2 — client / scoping */}
            <button
              onClick={openLandDoor}
              className="flex-1 rounded-2xl p-4 text-left transition-all active:scale-[0.99]"
              style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)', cursor: 'pointer', minHeight: 120 }}
            >
              <p className="text-[11px] uppercase mb-1" style={{ color: 'var(--color-amber)', letterSpacing: '0.1em' }}>
                Free
              </p>
              <p className="font-heading text-[15px] font-medium mb-1" style={{ color: 'var(--color-text)' }}>
                I have <em style={{ color: 'var(--color-amber)' }}>land</em>, help me plan
              </p>
              <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                Receive a scoping doc with practitioners from the Guild. The network is small today — expect a few matches, not many.
              </p>
            </button>

            {/* Door 3 — pitch */}
            <button
              onClick={openVisionDoor}
              className="flex-1 rounded-2xl p-4 text-left transition-all active:scale-[0.99]"
              style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)', cursor: 'pointer', minHeight: 120 }}
            >
              <p className="text-[11px] uppercase mb-1" style={{ color: 'var(--color-amber)', letterSpacing: '0.1em' }}>
                Free
              </p>
              <p className="font-heading text-[15px] font-medium mb-1" style={{ color: 'var(--color-text)' }}>
                I have a <em style={{ color: 'var(--color-amber)' }}>vision</em>, find my people
              </p>
              <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                Publish a pitch. Get matched to practitioners and other pitchers.
              </p>
            </button>
          </div>

          {/* Browse pitches link */}
          <div className="flex justify-center mt-1 relative z-10">
            <button
              onClick={() => router.push('/guild/pitches')}
              className="text-[12px] underline"
              style={{ color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Or browse pitches being born →
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

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(p => (
              <PractitionerCard key={p.id} practitioner={p} />
            ))}
          </div>
        </div>
      </div>

      {/* Auth gate popup — for non-signed-in users clicking a Guild door */}
      {authGate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-5"
          style={{ background: 'rgba(0, 0, 0, 0.5)' }}
          onClick={() => setAuthGate(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="rounded-2xl p-6 w-full max-w-[400px]"
            style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)' }}
          >
            <p className="text-[11px] uppercase tracking-[0.2em] mb-2" style={{ color: 'var(--color-amber)' }}>
              One step first
            </p>
            <h3 className="font-heading text-[20px] font-light leading-tight mb-3" style={{ color: 'var(--color-text)' }}>
              {gateCopy[authGate].title}
            </h3>
            <p className="text-[13px] leading-relaxed mb-5" style={{ color: 'var(--color-text-secondary)' }}>
              {gateCopy[authGate].body}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => router.push('/?auth=signup')}
                className="rounded-xl py-3 text-[14px] font-medium"
                style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)', border: 'none', cursor: 'pointer' }}
              >
                Create an account
              </button>
              <button
                onClick={() => router.push('/?auth=signin')}
                className="rounded-xl py-3 text-[13px]"
                style={{ background: 'transparent', color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border)', cursor: 'pointer' }}
              >
                I already have one — sign in
              </button>
              <button
                onClick={() => setAuthGate(null)}
                className="text-[12px] mt-1"
                style={{ background: 'none', color: 'var(--color-text-muted)', border: 'none', cursor: 'pointer' }}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
