'use client'

import { useState } from 'react'
import { FLOWER_PETALS, AVAILABILITY_OPTIONS } from '@/lib/flower-petals'

export interface Practitioner {
  id: string
  display_name: string
  tagline: string
  bio: string
  country: string
  region: string
  languages: string[]
  years_experience: number
  pdc_certified: boolean
  advanced_certifications: string
  flower_petals: string[]
  specialties: string[]
  climate_zones_worked: string[]
  project_scales: string[]
  rate_range: string
  availability_status: string
  profile_photo_url: string | null
  portfolio_urls: Array<{ label: string; url: string }> | null
}

const URL_LABELS_DISPLAY: Record<string, string> = {
  website: 'Website',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  other: 'Link',
}

interface Props {
  practitioner: Practitioner
}

export default function PractitionerCard({ practitioner: p }: Props) {
  const [expanded, setExpanded] = useState(false)
  const availability = AVAILABILITY_OPTIONS.find(o => o.key === p.availability_status)
  const initials = p.display_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const petalObjects = p.flower_petals.map(k => FLOWER_PETALS.find(fp => fp.key === k)).filter(Boolean)

  return (
    <div
      className="rounded-2xl p-4 transition-all"
      style={{
        background: 'var(--color-card)',
        border: '0.5px solid var(--color-amber-border)',
      }}
    >
      <div className="flex gap-3 items-start">
        {/* Avatar */}
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-[16px] font-semibold shrink-0"
          style={{ background: 'var(--color-avatar-bg)', border: '1.5px solid var(--color-amber)', color: 'var(--color-amber)' }}
        >
          {p.profile_photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.profile_photo_url} alt={p.display_name} className="w-full h-full rounded-full object-cover" />
          ) : initials}
        </div>

        {/* Header */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-heading text-[17px] font-light leading-tight" style={{ color: 'var(--color-text)' }}>
                {p.display_name}
              </h3>
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                {p.region ? `${p.region}, ` : ''}{p.country}
                {p.years_experience > 0 && ` · ${p.years_experience}y experience`}
              </p>
            </div>
            {availability && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0"
                style={{ background: 'var(--color-pill-bg)', color: availability.color, border: `0.5px solid ${availability.color}` }}
              >
                {availability.label.split(' ')[0]}
              </span>
            )}
          </div>

          {p.tagline && (
            <p className="text-[13px] mt-2 italic" style={{ color: 'var(--color-text)' }}>
              &ldquo;{p.tagline}&rdquo;
            </p>
          )}

          {/* Petals */}
          {petalObjects.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {petalObjects.map(petal => petal && (
                <div
                  key={petal.key}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]"
                  style={{ background: 'var(--color-pill-bg)', color: 'var(--color-text-secondary)' }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: petal.color }}></span>
                  {petal.label.split('&')[0].split(' ')[0]}
                </div>
              ))}
            </div>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            {p.languages.length > 0 && <span>{p.languages.slice(0, 3).join(' · ')}</span>}
            {p.pdc_certified && <span style={{ color: 'var(--color-amber)' }}>PDC certified</span>}
            {p.rate_range && <span>{p.rate_range}</span>}
          </div>
        </div>
      </div>

      {/* Expand */}
      {(p.bio || p.specialties.length > 0) && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full mt-3 text-[12px] text-left"
          style={{ color: 'var(--color-amber)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {expanded ? 'Show less ↑' : 'Read more ↓'}
        </button>
      )}

      {expanded && (
        <div className="mt-3 pt-3 space-y-3" style={{ borderTop: '0.5px solid var(--color-border)' }}>
          {p.bio && (
            <p className="text-[13px] leading-relaxed whitespace-pre-line" style={{ color: 'var(--color-text-secondary)' }}>
              {p.bio}
            </p>
          )}
          {p.specialties.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Specialties</p>
              <div className="flex flex-wrap gap-1.5">
                {p.specialties.map((s, i) => (
                  <span key={i} className="rounded-full px-2.5 py-0.5 text-[11px]" style={{ background: 'var(--color-amber-light)', color: 'var(--color-text)' }}>{s}</span>
                ))}
              </div>
            </div>
          )}
          {p.project_scales.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Works at</p>
              <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                {p.project_scales.join(' · ')}
              </p>
            </div>
          )}
          {p.climate_zones_worked.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Climate zones</p>
              <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                {p.climate_zones_worked.join(' · ')}
              </p>
            </div>
          )}
          {p.advanced_certifications && (
            <div>
              <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Certifications</p>
              <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>{p.advanced_certifications}</p>
            </div>
          )}
          {p.portfolio_urls && p.portfolio_urls.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Links</p>
              <div className="flex flex-wrap gap-1.5">
                {p.portfolio_urls.map((u, i) => (
                  <a
                    key={i}
                    href={u.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full px-2.5 py-1 text-[11px]"
                    style={{ background: 'var(--color-pill-bg)', color: 'var(--color-amber)', border: '0.5px solid var(--color-amber-border)', textDecoration: 'none' }}
                  >
                    {URL_LABELS_DISPLAY[u.label] || u.label || 'Link'} ↗
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
