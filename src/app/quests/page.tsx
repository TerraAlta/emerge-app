'use client'

/**
 * Quests — the gamified permaculture learning section.
 *
 * Entry point: the Flower of Permaculture. Tapping a petal opens that domain's
 * quests (Step 2). Progress is mock for now; Step 3 wires Supabase
 * `user_quest_progress` + total XP.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import FlowerOfPermaculture from '@/components/quests/FlowerOfPermaculture'
import {
  QUEST_PETALS, QUEST_PETAL_MAP, MOCK_PROGRESS, getPetalProgress, bloomFraction,
} from '@/lib/quest-petals'

export default function QuestsPage() {
  const router = useRouter()

  // PLACEHOLDER — replaced by Supabase user_quest_progress in Step 3.
  const progress = MOCK_PROGRESS

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [zoomed, setZoomed] = useState(false)

  const bloomed = useMemo(
    () => QUEST_PETALS.filter(p => getPetalProgress(progress, p.key).status === 'completed').length,
    [progress],
  )
  const bloomPct = Math.round(bloomFraction(progress) * 100)
  const selected = selectedKey ? QUEST_PETAL_MAP[selectedKey] : null
  const selectedStatus = selectedKey ? getPetalProgress(progress, selectedKey).status : null

  return (
    <div className="min-h-screen font-body flex justify-center" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <div className="w-full relative flex flex-col max-w-[440px]" style={{ minHeight: '100dvh' }}>

        {/* Top bar */}
        <div className="flex items-center justify-between px-4 sticky top-0 z-30" style={{ background: 'var(--color-bg)', paddingTop: 'calc(18px + var(--sat, 0px))', paddingBottom: 10 }}>
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 text-[13px] font-medium active:scale-95 transition-transform"
            style={{ color: 'var(--color-amber)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ← Emerge
          </button>
          <button
            onClick={() => setZoomed(z => !z)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[14px] active:scale-90 transition-transform"
            style={{ background: 'var(--color-amber-bg)', border: '0.5px solid var(--color-amber-border)', color: 'var(--color-amber)' }}
            aria-label={zoomed ? 'Zoom out' : 'Zoom in'}
            title={zoomed ? 'Zoom out' : 'Zoom in'}
          >
            {zoomed ? '−' : '+'}
          </button>
        </div>

        {/* Title */}
        <div className="px-5 pt-2 pb-1 text-center">
          <h1 className="font-heading text-[26px] font-light leading-tight" style={{ color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
            The <em style={{ color: 'var(--color-amber)' }}>Flower</em> of Permaculture
          </h1>
          <p className="text-[13px] mt-1.5 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            Ten living domains. Tend one and it blooms. Grow the whole flower.
          </p>
        </div>

        {/* Progress strip */}
        <div className="px-5 pt-3 pb-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>
              🌸 {bloomed} of {QUEST_PETALS.length} bloomed
            </span>
            <span className="text-[12px]" style={{ color: 'var(--color-amber)' }}>{bloomPct}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-pill-bg)' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${bloomPct}%`, background: 'linear-gradient(90deg, var(--color-amber), #E6B85E)' }} />
          </div>
        </div>

        {/* Flower — scrollable when zoomed on small screens */}
        <div className="flex-1 overflow-auto px-3 pt-2 pb-40" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div style={{ width: zoomed ? '165%' : '100%', margin: '0 auto', transition: 'width 260ms ease' }}>
            <FlowerOfPermaculture
              progress={progress}
              selectedKey={selectedKey}
              onSelectPetal={key => setSelectedKey(prev => (prev === key ? null : key))}
            />
          </div>
        </div>

        {/* Selected-petal panel (bottom sheet) */}
        {selected && (
          <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center">
            <div className="w-full max-w-[440px] rounded-t-[22px] px-5 pt-4 pb-8"
              style={{ background: 'var(--color-card)', borderTop: '0.5px solid var(--color-amber-border)', boxShadow: '0 -10px 30px rgba(0,0,0,0.10)' }}>
              <div className="flex justify-center mb-3">
                <div className="w-9 h-1 rounded-full" style={{ background: 'var(--color-border)' }} />
              </div>
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-[22px] shrink-0"
                  style={{ background: 'var(--color-amber-bg)', border: `1px solid ${selected.color}` }}>
                  {selectedStatus === 'locked' ? '🔒' : selected.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-heading text-[18px] font-light leading-tight" style={{ color: 'var(--color-text)' }}>
                      {selected.label}
                    </h2>
                  </div>
                  <p className="text-[13px] mt-1 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                    {selected.description}
                  </p>
                </div>
                <button onClick={() => setSelectedKey(null)} className="text-[18px] leading-none opacity-40 active:opacity-70" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text)' }} aria-label="Close">×</button>
              </div>

              <div className="mt-4">
                {selectedStatus === 'locked' ? (
                  <div className="rounded-[12px] px-3.5 py-3 text-center" style={{ background: 'var(--color-pill-bg)' }}>
                    <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                      🔒 Complete <strong>{(selected.requires.map(r => QUEST_PETAL_MAP[r]?.short).filter(Boolean).join(', ')) || 'earlier petals'}</strong> to unlock this domain.
                    </p>
                  </div>
                ) : (
                  <button
                    className="w-full py-3.5 rounded-[12px] text-[14px] font-semibold active:scale-[0.98] transition-transform"
                    style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)', border: 'none' }}
                    onClick={() => {
                      // Step 2 wires the petal → quest sequence view.
                      alert(`"${selected.label}" quests are coming in the next step.`)
                    }}
                  >
                    {selectedStatus === 'completed' ? 'Revisit quests' : 'Begin quests'} →
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
