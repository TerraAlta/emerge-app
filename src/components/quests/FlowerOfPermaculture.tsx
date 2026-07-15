'use client'

/**
 * The Flower of Permaculture — the animated entry point to the Quests section.
 *
 * A hand-drawn-feeling SVG flower: an Ethics & Principles centre surrounded by
 * 9 petals. Each petal is a tappable zone. Completed petals "bloom" (full
 * colour + a soft amber glow); locked petals are greyed until their
 * prerequisites are done. The whole flower's aura grows with progress.
 *
 * Progress is passed in (mock now, Supabase in Step 3), so this component stays
 * a pure, testable view.
 */

import { useState } from 'react'
import {
  QUEST_PETAL_MAP, ETHICS_KEY, OUTER_PETALS, getPetalProgress, bloomFraction,
  type QuestProgress, type PetalStatus,
} from '@/lib/quest-petals'

const C = 200          // centre x/y in the 400×400 viewBox
const CORE_R = 46      // Ethics centre radius
const MID_R = 112      // radius where a petal's icon sits

// Organic, slightly asymmetric leaf/petal — base near the centre, tip outward.
const PETAL_PATH = 'M0,-54 C 32,-76 42,-130 0,-166 C -38,-126 -30,-72 0,-54 Z'
const PETAL_VEIN = 'M0,-58 Q 5,-112 0,-160'

// Round to 2 decimals so server and client render byte-identical coordinate
// strings (avoids React hydration mismatches from float formatting).
const r2 = (n: number) => Math.round(n * 100) / 100
function pointAt(angleDeg: number, radius: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180
  return [r2(C + radius * Math.sin(a)), r2(C - radius * Math.cos(a))]
}

/** Muted, desaturated version of a colour for locked petals. */
const LOCKED_FILL = 'var(--color-pill-bg)'

interface Props {
  progress: QuestProgress
  selectedKey: string | null
  onSelectPetal: (key: string) => void
}

export default function FlowerOfPermaculture({ progress, selectedKey, onSelectPetal }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)
  const bloom = bloomFraction(progress)

  // Aura + centre glow strengthen as more petals bloom.
  const auraR = 150 + bloom * 60
  const auraOpacity = 0.12 + bloom * 0.35

  function fillFor(color: string, status: PetalStatus): string {
    if (status === 'locked') return LOCKED_FILL
    if (status === 'completed') return color
    return color // available — dimmed via opacity below
  }
  function opacityFor(status: PetalStatus): number {
    if (status === 'locked') return 0.4
    if (status === 'completed') return 1
    return 0.62 // available — present but not yet in full bloom
  }

  return (
    <svg
      viewBox="0 0 400 400"
      width="100%"
      role="img"
      aria-label="Flower of Permaculture — tap a petal to open its quests"
      style={{ display: 'block', maxWidth: 460, margin: '0 auto', overflow: 'visible' }}
    >
      <defs>
        <radialGradient id="auraGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--color-amber)" stopOpacity="0.9" />
          <stop offset="60%" stopColor="var(--color-amber)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--color-amber)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="coreGrad" cx="42%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#E6B85E" />
          <stop offset="100%" stopColor="#A9702A" />
        </radialGradient>
        <filter id="petalBloom" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#E8B84B" floodOpacity="0.85" />
        </filter>
      </defs>

      <style>{`
        @keyframes petalIn { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }
        @keyframes bloomPulse { 0%,100% { opacity: 0.0; } 50% { opacity: 0.55; } }
        @keyframes auraBreathe { 0%,100% { opacity: ${auraOpacity}; } 50% { opacity: ${Math.min(0.85, auraOpacity + 0.12)}; } }
        .petal-g { transform-box: view-box; transform-origin: ${C}px ${C}px; animation: petalIn 620ms cubic-bezier(.22,1,.36,1) both; }
        .petal-tap { cursor: pointer; }
        .petal-tap:active { opacity: 0.85; }
        .bloom-overlay { animation: bloomPulse 3.6s ease-in-out infinite; pointer-events: none; }
        .aura { animation: auraBreathe 6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .petal-g, .bloom-overlay, .aura { animation: none !important; }
          .bloom-overlay { opacity: 0.35; }
        }
      `}</style>

      {/* Growing aura behind the flower */}
      <circle className="aura" cx={C} cy={C} r={auraR} fill="url(#auraGrad)" style={{ opacity: auraOpacity }} />

      {/* ── Outer petals ── */}
      {OUTER_PETALS.map((petal, i) => {
        const { status } = getPetalProgress(progress, petal.key)
        const angle = petal.angle as number
        const [ix, iy] = pointAt(angle, MID_R)
        const isSel = selectedKey === petal.key
        const isHov = hovered === petal.key
        // Every petal is tappable — locked ones open a panel explaining how to
        // unlock them rather than being an inert dead tap.
        const clickable = true
        const completed = status === 'completed'

        return (
          <g
            key={petal.key}
            className="petal-g"
            style={{ animationDelay: `${120 + i * 70}ms` }}
          >
            {/* Petal body (rotated around the centre) */}
            <g
              className={clickable ? 'petal-tap' : undefined}
              transform={`translate(${C} ${C}) rotate(${angle})`}
              onClick={clickable ? () => onSelectPetal(petal.key) : undefined}
              onMouseEnter={() => setHovered(petal.key)}
              onMouseLeave={() => setHovered(null)}
              role={clickable ? 'button' : undefined}
              aria-label={`${petal.label} — ${status}`}
              style={{ filter: completed ? 'url(#petalBloom)' : undefined }}
            >
              <path
                d={PETAL_PATH}
                fill={fillFor(petal.color, status)}
                fillOpacity={opacityFor(status)}
                stroke={status === 'locked' ? 'var(--color-border)' : petal.color}
                strokeOpacity={status === 'locked' ? 1 : 0.9}
                strokeWidth={isSel ? 3.5 : 1.5}
                style={{ transition: 'stroke-width 180ms ease, transform 180ms ease', transform: isHov && clickable ? 'scale(1.04)' : 'scale(1)', transformOrigin: '0px -110px' }}
              />
              <path d={PETAL_VEIN} fill="none" stroke="#000" strokeOpacity={status === 'locked' ? 0.05 : 0.12} strokeWidth="1" />
              {completed && (
                <path className="bloom-overlay" d={PETAL_PATH} fill="#F2CB6B" />
              )}
            </g>

            {/* Upright icon at the petal's mid-point */}
            <text
              x={ix} y={iy + 6}
              textAnchor="middle"
              fontSize="21"
              style={{ pointerEvents: 'none', opacity: status === 'locked' ? 0.45 : 1 }}
            >
              {status === 'locked' ? '🔒' : petal.icon}
            </text>
            {/* Completed check badge */}
            {completed && (
              <text x={ix + 15} y={iy - 12} textAnchor="middle" fontSize="13" style={{ pointerEvents: 'none' }}>✓</text>
            )}
          </g>
        )
      })}

      {/* ── Ethics centre ── */}
      {(() => {
        const ethics = QUEST_PETAL_MAP[ETHICS_KEY]
        const { status } = getPetalProgress(progress, ETHICS_KEY)
        const isSel = selectedKey === ETHICS_KEY
        const completed = status === 'completed'
        return (
          <g
            className="petal-tap petal-g"
            style={{ animationDelay: '0ms' }}
            onClick={() => onSelectPetal(ETHICS_KEY)}
            role="button"
            aria-label={`${ethics.label} — ${status}`}
          >
            <circle
              cx={C} cy={C} r={CORE_R + 6}
              fill="none"
              stroke="var(--color-amber)"
              strokeOpacity={isSel ? 0.9 : 0.25}
              strokeWidth={isSel ? 3.5 : 1.5}
            />
            <circle
              cx={C} cy={C} r={CORE_R}
              fill="url(#coreGrad)"
              style={{ filter: completed ? 'url(#petalBloom)' : undefined }}
            />
            <text x={C} y={C - 4} textAnchor="middle" fontSize="26" style={{ pointerEvents: 'none' }}>{ethics.icon}</text>
            <text x={C} y={C + 18} textAnchor="middle" fontSize="10" fontWeight="600" fill="#3A2A10" style={{ pointerEvents: 'none' }}>
              {ethics.short}
            </text>
          </g>
        )
      })()}
    </svg>
  )
}
