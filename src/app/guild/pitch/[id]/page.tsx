'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { FLOWER_PETALS } from '@/lib/flower-petals'

function ShareSection({ url, title, oneLineVision }: { url: string; title: string; oneLineVision: string }) {
  const [copied, setCopied] = useState(false)
  const [canNativeShare, setCanNativeShare] = useState(false)

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function')
  }, [])

  // Pre-filled invite text. Two versions because WhatsApp + Email need the URL
  // inside the text body, while Telegram + Web Share API append the URL themselves
  // (so including it in the text would duplicate it).
  const inviteWithoutUrl = oneLineVision
    ? `${title}\n\n"${oneLineVision}"\n\nI'm sharing my pitch on Emerge — a network for people building real regenerative projects. If this resonates with you, or someone you know, read more.`
    : `${title}\n\nI'm sharing my pitch on Emerge — a network for people building real regenerative projects. If this resonates with you, or someone you know, read more.`
  const inviteWithUrl = `${inviteWithoutUrl}\n${url}`
  const emailSubject = `A pitch on Emerge — ${title}`

  const waUrl = `https://wa.me/?text=${encodeURIComponent(inviteWithUrl)}`
  const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(inviteWithoutUrl)}`
  const mailUrl = `mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(inviteWithUrl)}`

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API can fail in insecure contexts — fall back to prompt
      window.prompt('Copy this link', url)
    }
  }

  async function nativeShare() {
    try {
      await (navigator as any).share({ title, text: inviteWithoutUrl, url })
    } catch {
      // User cancelled — silent
    }
  }

  const btn = {
    background: 'var(--color-card)',
    border: '0.5px solid var(--color-amber-border)',
    color: 'var(--color-text)',
    cursor: 'pointer',
  } as const

  return (
    <div className="mb-6">
      <h2 className="text-[11px] uppercase mb-2" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.12em' }}>
        Share this pitch
      </h2>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={copyLink}
          className="rounded-full px-4 py-2 text-[12px] font-semibold transition-all"
          style={{
            background: copied ? 'var(--color-amber)' : 'var(--color-amber)',
            color: 'var(--color-pill-active-text)',
            border: 'none',
            cursor: 'pointer',
            opacity: copied ? 0.85 : 1,
          }}
          aria-live="polite"
        >
          {copied ? '✓ Link copied' : 'Copy link'}
        </button>

        {canNativeShare && (
          <button
            onClick={nativeShare}
            className="rounded-full px-4 py-2 text-[12px]"
            style={btn}
          >
            Share…
          </button>
        )}

        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full px-4 py-2 text-[12px] no-underline"
          style={btn}
        >
          WhatsApp
        </a>
        <a
          href={tgUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full px-4 py-2 text-[12px] no-underline"
          style={btn}
        >
          Telegram
        </a>
        <a
          href={mailUrl}
          className="rounded-full px-4 py-2 text-[12px] no-underline"
          style={btn}
        >
          Email
        </a>
      </div>
    </div>
  )
}

interface Pitch {
  id: string
  user_id: string
  title: string
  one_line_vision: string
  vision_long: string
  stage: string
  commitment_level: string
  country: string
  region: string
  target_region_flexibility: string
  flower_petals: string[]
  roles_sought: string[]
  offering: string
  seed_capital_range: string
  language: string
  status: string
  contact_method: 'email' | 'external_link'
  contact_value: string
  hero_image_url: string | null
  prep_context_urls: string[] | null
  published_at: string | null
  last_confirmed_active_at: string | null
  expires_at: string | null
}

const STAGE_LABELS: Record<string, string> = {
  idea: 'Idea',
  gathering_people: 'Gathering people',
  has_core_group: 'Has core group',
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

function StageProgressBar({ stage }: { stage: string }) {
  const currentIdx = STAGE_ORDER.indexOf(stage)
  return (
    <div className="flex items-center gap-0">
      {STAGE_ORDER.map((s, i) => {
        const reached = i <= currentIdx
        const isCurrent = i === currentIdx
        return (
          <div key={s} className="flex items-center" style={{ flex: i === STAGE_ORDER.length - 1 ? 0 : 1 }}>
            <div
              className="rounded-full flex items-center justify-center text-[10px] font-semibold"
              style={{
                width: isCurrent ? 28 : 20,
                height: isCurrent ? 28 : 20,
                background: reached ? 'var(--color-amber)' : 'var(--color-pill-bg)',
                color: reached ? 'var(--color-pill-active-text)' : 'var(--color-text-muted)',
                border: isCurrent ? '1.5px solid var(--color-amber-border)' : 'none',
              }}
            >
              {i + 1}
            </div>
            {i < STAGE_ORDER.length - 1 && (
              <div style={{ flex: 1, height: 2, background: i < currentIdx ? 'var(--color-amber)' : 'var(--color-border)' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function PitchPublicPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string
  const [pitch, setPitch] = useState<Pitch | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [watching, setWatching] = useState(false)
  const [watchLoading, setWatchLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: u } = await supabase.auth.getUser()
      setUserId(u.user?.id ?? null)

      const { data, error: dbErr } = await supabase
        .from('guild_pitches')
        .select('*')
        .eq('id', id)
        .single()
      if (dbErr || !data) {
        setError('Pitch not found or no longer public.')
        setLoading(false)
        return
      }
      setPitch(data as Pitch)

      if (u.user?.id) {
        const { data: w } = await supabase
          .from('guild_pitch_watchlist')
          .select('id').eq('pitch_id', id).eq('user_id', u.user.id).maybeSingle()
        setWatching(!!w)
      }
      setLoading(false)
    }
    load()
  }, [id])

  async function toggleWatch() {
    if (!userId || !pitch) return
    setWatchLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined
    if (watching) {
      await fetch(`/api/guild/pitch/${pitch.id}/watch`, { method: 'DELETE', headers })
      setWatching(false)
    } else {
      await fetch(`/api/guild/pitch/${pitch.id}/watch`, { method: 'POST', headers })
      setWatching(true)
    }
    setWatchLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>Loading pitch...</p>
      </div>
    )
  }
  if (error || !pitch) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>{error || 'Not found'}</p>
      </div>
    )
  }

  const daysSinceConfirm = pitch.last_confirmed_active_at
    ? Math.floor((Date.now() - new Date(pitch.last_confirmed_active_at).getTime()) / 86_400_000)
    : 0
  const stale = daysSinceConfirm > 120

  const contactHref = pitch.contact_method === 'email'
    ? `mailto:${pitch.contact_value}?subject=About your Guild pitch: ${encodeURIComponent(pitch.title)}`
    : pitch.contact_value

  return (
    <div className="min-h-screen font-body flex justify-center" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full" style={{ maxWidth: 720, padding: '24px 20px 60px' }}>

        <div className="flex items-center justify-between gap-3 mb-6">
          <button
            onClick={() => router.push('/guild/pitches')}
            className="text-[13px]"
            style={{ color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ← All pitches
          </button>
          {userId && pitch.user_id === userId && (
            <button
              onClick={() => router.push(`/guild/pitch/new?resume=${pitch.id}`)}
              className="rounded-full px-4 py-2 text-[12px] font-semibold"
              style={{
                background: 'var(--color-amber)',
                color: 'var(--color-pill-active-text)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Edit your pitch
            </button>
          )}
        </div>

        {pitch.hero_image_url && (
          <div className="w-full rounded-2xl overflow-hidden mb-5" style={{ aspectRatio: '16/9', background: 'var(--color-pill-bg)' }}>
            <img src={pitch.hero_image_url} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        <h1 className="font-heading text-[32px] font-light leading-tight mb-2" style={{ color: 'var(--color-text)' }}>
          {pitch.title}
        </h1>
        <p className="font-heading text-[17px] italic leading-relaxed mb-5" style={{ color: 'var(--color-amber)' }}>
          {pitch.one_line_vision}
        </p>

        {pitch.status === 'published' && typeof window !== 'undefined' && (
          <ShareSection
            url={window.location.href.split('?')[0].split('#')[0]}
            title={pitch.title}
            oneLineVision={pitch.one_line_vision}
          />
        )}

        {/* Stage + commitment */}
        <div className="rounded-2xl p-4 mb-5" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)' }}>
          <p className="text-[10px] uppercase mb-2" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.1em' }}>
            Stage — {STAGE_LABELS[pitch.stage]}
          </p>
          <StageProgressBar stage={pitch.stage} />
          <div className="flex gap-2 mt-3 flex-wrap">
            <span className="rounded-full px-3 py-1 text-[11px]" style={{ background: 'var(--color-amber-light)', color: 'var(--color-amber)', border: '0.5px solid var(--color-amber-border)' }}>
              {COMMITMENT_LABELS[pitch.commitment_level]}
            </span>
            {pitch.country && (
              <span className="rounded-full px-3 py-1 text-[11px]" style={{ background: 'var(--color-pill-bg)', color: 'var(--color-text-secondary)' }}>
                📍 {pitch.region ? `${pitch.region}, ${pitch.country}` : pitch.country}
              </span>
            )}
            {pitch.language && pitch.language !== 'en' && (
              <span className="rounded-full px-3 py-1 text-[11px]" style={{ background: 'var(--color-pill-bg)', color: 'var(--color-text-secondary)' }}>
                🗣 {pitch.language.toUpperCase()}
              </span>
            )}
            {stale && (
              <span className="rounded-full px-3 py-1 text-[11px]" style={{ background: '#fff3cd', color: '#8a6d0b' }}>
                ⏳ Check-in due soon
              </span>
            )}
          </div>
        </div>

        {/* Vision */}
        {pitch.vision_long && (
          <div className="mb-6">
            <h2 className="text-[11px] uppercase mb-2" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.12em' }}>
              Vision
            </h2>
            <div className="text-[14px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text)' }}>
              {pitch.vision_long}
            </div>
          </div>
        )}

        {/* Petals */}
        {pitch.flower_petals.length > 0 && (
          <div className="mb-6">
            <h2 className="text-[11px] uppercase mb-2" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.12em' }}>
              Petals of the flower
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {pitch.flower_petals.map(k => {
                const p = FLOWER_PETALS.find(x => x.key === k)
                if (!p) return null
                return (
                  <span key={k} className="rounded-full px-3 py-1.5 text-[11px] flex items-center gap-1.5"
                    style={{ background: `${p.color}20`, color: p.color, border: `0.5px solid ${p.color}40` }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                    {p.label}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Inspiration & references — links the founder shared during intake */}
        {pitch.prep_context_urls && pitch.prep_context_urls.length > 0 && (
          <div className="mb-6">
            <h2 className="text-[11px] uppercase mb-2" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.12em' }}>
              Inspiration & references
            </h2>
            <ul className="space-y-1.5">
              {pitch.prep_context_urls.map((url, i) => {
                let host = url
                try { host = new URL(url).hostname.replace(/^www\./, '') } catch {}
                return (
                  <li key={i}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] underline break-all"
                      style={{ color: 'var(--color-amber)' }}
                    >
                      {host}
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Roles sought */}
        {pitch.roles_sought.length > 0 && (
          <div className="mb-6">
            <h2 className="text-[11px] uppercase mb-2" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.12em' }}>
              Looking for
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {pitch.roles_sought.map(r => (
                <span key={r} className="rounded-full px-3 py-1.5 text-[12px]"
                  style={{ background: 'var(--color-card)', color: 'var(--color-text)', border: '0.5px solid var(--color-amber-border)' }}>
                  {r}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Offering + seed capital */}
        {(pitch.offering || pitch.seed_capital_range) && (
          <div className="mb-6 rounded-2xl p-4" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)' }}>
            {pitch.offering && (
              <>
                <h2 className="text-[11px] uppercase mb-2" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.12em' }}>
                  What the founder brings
                </h2>
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap mb-3" style={{ color: 'var(--color-text)' }}>
                  {pitch.offering}
                </p>
              </>
            )}
            {pitch.seed_capital_range && (
              <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                💰 Seed capital: <strong style={{ color: 'var(--color-text)' }}>{pitch.seed_capital_range}</strong>
              </p>
            )}
          </div>
        )}

        {/* Target region flexibility */}
        {pitch.target_region_flexibility && (
          <div className="mb-6">
            <h2 className="text-[11px] uppercase mb-1" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.12em' }}>
              Geographic flexibility
            </h2>
            <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
              {pitch.target_region_flexibility}
            </p>
          </div>
        )}

        {/* CTAs */}
        <div className="flex flex-col gap-2 pt-4">
          {pitch.contact_value && (
            <a
              href={contactHref}
              target={pitch.contact_method === 'external_link' ? '_blank' : undefined}
              rel="noopener noreferrer"
              className="w-full py-3.5 rounded-full text-[14px] font-semibold text-center"
              style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)', border: 'none', textDecoration: 'none' }}
            >
              {pitch.contact_method === 'email' ? 'Reach out by email' : 'Visit the founder\'s link'}
            </a>
          )}
          <button
            onClick={toggleWatch}
            disabled={!userId || watchLoading}
            className="w-full py-3 rounded-full text-[13px]"
            style={{
              background: 'transparent',
              color: watching ? 'var(--color-amber)' : 'var(--color-text-secondary)',
              border: '0.5px solid var(--color-border)',
              cursor: userId ? 'pointer' : 'not-allowed',
              opacity: !userId ? 0.5 : 1,
            }}
          >
            {!userId ? 'Sign in to watch this pitch' : watching ? '👁 Watching' : '👁 Watch for updates'}
          </button>
        </div>

        {pitch.last_confirmed_active_at && (
          <p className="text-[11px] text-center mt-4" style={{ color: 'var(--color-text-muted)' }}>
            Last confirmed active: {new Date(pitch.last_confirmed_active_at).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  )
}
