'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Tiny dismissable banner that announces new features to returning users.
 * - Config-driven below: add a new entry when you ship something.
 * - Shown only AFTER onboarding is complete (new visitors see onboarding, not this).
 * - Auto-hides after 60 days from `announcedAt` even if never dismissed
 *   (so the app doesn't permanently wear last-quarter's news).
 * - Per-feature localStorage flag: emerge_whatsnew_<id>_seen
 */

interface Announcement {
  id: string
  icon?: string
  title: string
  ctaLabel?: string
  ctaHref?: string
  /** ISO date — used to age-out the banner automatically. */
  announcedAt: string
}

const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'guild-pitch-2026-04',
    icon: '🌱',
    title: 'New in the Guild: publish a free pitch and find your seven people',
    ctaLabel: 'Read more',
    ctaHref: '/guild',
    announcedAt: '2026-04-22',
  },
  {
    id: 'news-tab-2026-04',
    icon: '📰',
    title: 'News tab is live — the regenerative world across 7 petals',
    ctaLabel: 'See it',
    ctaHref: '/?tab=news',
    announcedAt: '2026-04-21',
  },
]

const MAX_AGE_DAYS = 60
const ONBOARDING_KEY = 'emerge_onboarding_seen'

export default function WhatsNewRibbon() {
  const router = useRouter()
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)

  useEffect(() => {
    // Don't nag first-time users — they're getting the onboarding card
    const onboarded = typeof window !== 'undefined' && localStorage.getItem(ONBOARDING_KEY)
    if (!onboarded) return

    // Pick the newest undismissed, non-stale announcement
    const now = Date.now()
    const eligible = ANNOUNCEMENTS
      .filter(a => {
        const seen = localStorage.getItem(`emerge_whatsnew_${a.id}_seen`)
        if (seen) return false
        const age = (now - new Date(a.announcedAt).getTime()) / 86_400_000
        return age <= MAX_AGE_DAYS
      })
      .sort((a, b) => new Date(b.announcedAt).getTime() - new Date(a.announcedAt).getTime())

    if (eligible.length > 0) setAnnouncement(eligible[0])
  }, [])

  function dismiss() {
    if (!announcement) return
    localStorage.setItem(`emerge_whatsnew_${announcement.id}_seen`, '1')
    setAnnouncement(null)
  }

  function handleCta() {
    if (!announcement?.ctaHref) return
    // Mark seen before navigating (don't nag again)
    localStorage.setItem(`emerge_whatsnew_${announcement.id}_seen`, '1')
    if (announcement.ctaHref.startsWith('/')) {
      router.push(announcement.ctaHref)
    } else {
      window.open(announcement.ctaHref, '_blank', 'noopener')
    }
  }

  if (!announcement) return null

  return (
    <div
      className="mx-auto w-full max-w-[640px] px-4 pt-1 pb-2"
    >
      <div
        className="flex items-center gap-2 rounded-full px-3 py-2"
        style={{ background: 'var(--color-amber-light)', border: '0.5px solid var(--color-amber-border)' }}
      >
        {announcement.icon && (
          <span className="text-[14px] shrink-0">{announcement.icon}</span>
        )}
        <span className="text-[11.5px] flex-1 leading-snug" style={{ color: 'var(--color-text)' }}>
          <span className="font-semibold" style={{ color: 'var(--color-amber)' }}>New · </span>
          {announcement.title}
        </span>
        {announcement.ctaLabel && announcement.ctaHref && (
          <button
            onClick={handleCta}
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold shrink-0"
            style={{
              background: 'var(--color-amber)',
              color: 'var(--color-pill-active-text)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {announcement.ctaLabel}
          </button>
        )}
        <button
          onClick={dismiss}
          className="text-[14px] shrink-0"
          style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}
