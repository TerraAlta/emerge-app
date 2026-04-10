'use client'

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'emerge_onboarding_seen'
const INSTALL_KEY = 'emerge_install_tip_seen'

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
  const [visible, setVisible] = useState(false)
  const [showInstallTip, setShowInstallTip] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true)
    } else if (!localStorage.getItem(INSTALL_KEY) && !isStandalone()) {
      // Show install tip if onboarding done but not installed as PWA
      setShowInstallTip(true)
    }
  }, [])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
    // Show install tip after onboarding if not already installed
    if (!isStandalone()) {
      setShowInstallTip(true)
    }
  }

  function dismissInstall() {
    localStorage.setItem(INSTALL_KEY, '1')
    setShowInstallTip(false)
  }

  return (
    <>
      {/* Onboarding modal */}
      {visible && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.65)' }}
        >
          <div className="rounded-2xl p-6 max-w-sm w-full" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--color-amber)' }}>
              Welcome to Emerge
            </p>

            <h2 className="font-heading text-3xl font-light italic leading-tight mb-5" style={{ color: 'var(--color-text)' }}>
              Not every event.<br />
              The right ones.
            </h2>

            <div className="space-y-3.5 mb-5">
              {[
                '300+ networks, continuously scraped \u2014 repair caf\u00e9s, seed swaps, food forests, permaculture, Transition Towns, Forum Theatre, community orchards, solidarity CSAs, clothing swaps, composting workshops',
                'AI filters each event \u2014 only passes what\u2019s hands-on, local and regenerative. No talks about sustainability. No corporate wellness.',
                'You see real quests \u2014 walking distance, cycling distance, or as wide as your region. Sourced from the actual networks running them.',
              ].map((text, i) => (
                <div key={i} className="flex gap-3">
                  <span
                    className="flex-none w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white mt-0.5"
                    style={{ background: 'var(--color-amber)' }}
                  >
                    {i + 1}
                  </span>
                  <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                    {text}
                  </p>
                </div>
              ))}
            </div>

            <div className="mb-4" style={{ borderTop: '0.5px solid var(--color-border)' }} />

            <p className="text-[11px] italic mb-5" style={{ color: 'var(--color-text-secondary)' }}>
              No chat, no profiles. The best conversations happen face to face.
            </p>

            <button
              onClick={dismiss}
              className="w-full py-3 rounded-full text-[13px] font-semibold text-white transition-opacity active:opacity-80"
              style={{ background: 'var(--color-amber)' }}
            >
              Show me what&apos;s nearby &rarr;
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
                    ? 'Tap the share button \u2B06 in Safari, then "Add to Home Screen".'
                    : 'Tap the menu \u22EE in your browser, then "Add to Home Screen" or "Install app".'}
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
