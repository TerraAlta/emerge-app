'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const STORAGE_KEY = 'emerge_onboarding_seen'
const INSTALL_KEY = 'emerge_install_tip_seen'

/** Global trigger — any component can dispatch this event to re-open the welcome card. */
export const OPEN_WELCOME_EVENT = 'emerge:open-welcome'
export function openWelcomeCard() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OPEN_WELCOME_EVENT))
  }
}

function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as any).standalone === true
}

function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

export default function OnboardingSplash() {
  const router = useRouter()
  const [visible, setVisible] = useState(false)
  const [showInstallTip, setShowInstallTip] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true)
    } else if (!localStorage.getItem(INSTALL_KEY) && !isStandalone()) {
      setShowInstallTip(true)
    }

    // Listen for re-opens (from the ? button or anywhere else)
    const handler = () => setVisible(true)
    window.addEventListener(OPEN_WELCOME_EVENT, handler)
    return () => window.removeEventListener(OPEN_WELCOME_EVENT, handler)
  }, [])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
    if (!isStandalone() && !localStorage.getItem(INSTALL_KEY)) {
      setShowInstallTip(true)
    }
  }

  function dismissInstall() {
    localStorage.setItem(INSTALL_KEY, '1')
    setShowInstallTip(false)
  }

  return (
    <>
      {/* Welcome / What-is-Emerge modal */}
      {visible && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center px-4 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={dismiss}
        >
          <div
            className="rounded-2xl p-6 max-w-md w-full my-6 max-h-[92vh] overflow-y-auto"
            style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)' }}
            onClick={e => e.stopPropagation()}
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--color-amber)' }}>
              What is Emerge
            </p>

            <h2 className="font-heading text-[26px] font-light leading-tight mb-3" style={{ color: 'var(--color-text)' }}>
              A free app for people who want to <em style={{ color: 'var(--color-amber)' }}>do</em> regenerative work <br />— not just read about it.
            </h2>

            <p className="text-[12px] leading-relaxed mb-5" style={{ color: 'var(--color-text-secondary)' }}>
              Three doors into the same community:
            </p>

            <div className="space-y-3 mb-5">
              {[
                {
                  icon: '🌿',
                  title: 'Events',
                  body: 'Real regenerative events in your area — repair cafés, seed swaps, food forests, work parties. Curated from 220+ networks. Only things you can show up to.',
                },
                {
                  icon: '📰',
                  title: 'News',
                  body: 'The regenerative story of the week. Curated across all 7 petals of the permaculture flower — from soil to governance, from Lisbon farmers to Mozambican cooperatives. No greenwashing, no doom.',
                },
                {
                  icon: '🌼',
                  title: 'Guild',
                  body: 'A living network. Find verified practitioners, commission a free scoping if you have land, publish a free pitch if you have a vision and need your seven people.',
                },
              ].map((d, i) => (
                <div key={i} className="flex gap-3">
                  <span className="flex-none text-[18px] mt-0.5">{d.icon}</span>
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold mb-0.5" style={{ color: 'var(--color-text)' }}>
                      {d.title}
                    </p>
                    <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                      {d.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="my-4" style={{ borderTop: '0.5px solid var(--color-border)' }} />

            <p className="text-[11px] uppercase tracking-widest mb-2" style={{ color: 'var(--color-amber)' }}>
              Built on the permaculture flower
            </p>
            <p className="text-[11.5px] leading-relaxed mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              Everything we curate — events, news, practitioners — is sorted across the seven petals of{' '}
              <a
                href="https://permacultureprinciples.com/flower/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--color-amber)', textDecoration: 'underline' }}
              >
                David Holmgren's permaculture flower
              </a>
              : land · building · tools · wellbeing · education · economics · governance. One framework. Applied to everything you see here.
            </p>

            <p className="text-[11px] uppercase tracking-widest mb-2" style={{ color: 'var(--color-amber)' }}>
              Why this exists
            </p>
            <ul className="text-[11.5px] leading-relaxed mb-4 space-y-1 list-none pl-0" style={{ color: 'var(--color-text-secondary)' }}>
              <li>• No ads. No algorithms. No engagement loops.</li>
              <li>• Curated by AI against a soul document, not a click counter.</li>
              <li>• Physical presence over scrolling. Real community over feeds.</li>
            </ul>

            <p className="text-[11px] italic mb-5 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              Our compass: Vandana Shiva, Helena Norberg-Hodge, Kate Raworth, Polly Higgins, David Holmgren, Elaine Ingham, Charles Eisenstein, Satish Kumar, Joanna Macy, Fritjof Capra, E.F. Schumacher, Robin Wall Kimmerer.
            </p>

            <button
              onClick={dismiss}
              className="w-full py-3 rounded-full text-[13px] font-semibold text-white transition-opacity active:opacity-80"
              style={{ background: 'var(--color-amber)' }}
            >
              Start exploring →
            </button>
          </div>
        </div>
      )}

      {/* Add to Homescreen tip — shows after onboarding dismisses */}
      {showInstallTip && (
        <div
          className="fixed bottom-0 left-0 right-0 z-[9998] flex justify-center"
          style={{ padding: 'calc(16px + var(--sab, 0px)) 16px 16px' }}
        >
          <div
            className="rounded-2xl px-5 py-4 max-w-sm w-full"
            style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)', boxShadow: '0 -4px 24px rgba(0,0,0,0.12)' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--color-text)' }}>
                  Add Emerge to your homescreen
                </p>
                <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  {isIOS()
                    ? 'Tap the share button ⬆ in Safari, then "Add to Home Screen".'
                    : 'Tap the menu ⋮ in your browser, then "Add to Home Screen" or "Install app".'}
                </p>
              </div>
              <button
                onClick={dismissInstall}
                className="text-[18px] shrink-0 mt-0.5"
                style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
                aria-label="Dismiss"
              >
                &times;
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
