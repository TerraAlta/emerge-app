'use client'

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'emerge_onboarding_seen'

export default function OnboardingSplash() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true)
    }
  }, [])

  if (!visible) return null

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.65)' }}
    >
      <div className="rounded-2xl p-6 max-w-sm w-full" style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.12)' }}>
        {/* Eyebrow */}
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#C8913A' }}>
          Welcome to Emerge
        </p>

        {/* Headline */}
        <h2 className="font-heading text-3xl font-light italic leading-tight mb-5" style={{ color: '#E8F2E0' }}>
          Not every event.<br />
          The right ones.
        </h2>

        {/* Steps */}
        <div className="space-y-3.5 mb-5">
          {[
            '300+ networks, continuously scraped \u2014 repair caf\u00e9s, seed swaps, food forests, permaculture, Transition Towns, Forum Theatre, community orchards, solidarity CSAs, clothing swaps, composting workshops',
            'AI filters each event \u2014 only passes what\u2019s hands-on, local and regenerative. No talks about sustainability. No corporate wellness.',
            'You see real quests \u2014 walking distance, cycling distance, or as wide as your region. Sourced from the actual networks running them.',
          ].map((text, i) => (
            <div key={i} className="flex gap-3">
              <span
                className="flex-none w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white mt-0.5"
                style={{ background: '#C8913A' }}
              >
                {i + 1}
              </span>
              <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(232,242,224,0.7)' }}>
                {text}
              </p>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="mb-4" style={{ borderTop: '0.5px solid rgba(200,145,58,0.12)' }} />

        {/* Note */}
        <p className="text-[11px] italic mb-5" style={{ color: 'rgba(232,242,224,0.4)' }}>
          No chat, no profiles. The best conversations happen face to face.
        </p>

        {/* CTA */}
        <button
          onClick={dismiss}
          className="w-full py-3 rounded-full text-[13px] font-semibold text-white transition-opacity active:opacity-80"
          style={{ background: '#C8913A' }}
        >
          Show me what&apos;s nearby &rarr;
        </button>
      </div>
    </div>
  )
}
