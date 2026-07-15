'use client'

/**
 * PetalQuestList — the sequence of quests inside one petal, with a petal
 * progress bar. Quests unlock in order: quest N opens once quest N-1 is done.
 */

import type { QuestPetal } from '@/lib/quest-petals'
import type { Quest } from '@/lib/quest-content'

interface Props {
  petal: QuestPetal
  quests: Quest[]
  completed: Set<string>
  onOpenQuest: (quest: Quest) => void
  onBack: () => void
}

export default function PetalQuestList({ petal, quests, completed, onOpenQuest, onBack }: Props) {
  const doneCount = quests.filter(q => completed.has(q.id)).length
  const pct = quests.length ? Math.round((doneCount / quests.length) * 100) : 0

  return (
    <div className="min-h-screen font-body flex justify-center" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <div className="w-full flex flex-col max-w-[440px]" style={{ minHeight: '100dvh' }}>

        {/* Header */}
        <div className="px-4 sticky top-0 z-20" style={{ background: 'var(--color-bg)', paddingTop: 'calc(18px + var(--sat,0px))', paddingBottom: 10 }}>
          <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] font-medium active:scale-95 transition-transform" style={{ color: 'var(--color-amber)', background: 'none', border: 'none', cursor: 'pointer' }}>
            ← Flower
          </button>
        </div>

        {/* Petal hero */}
        <div className="px-5 pt-2 pb-1">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-[24px] shrink-0" style={{ background: 'var(--color-amber-bg)', border: `1px solid ${petal.color}` }}>
              {petal.icon}
            </div>
            <div>
              <h1 className="font-heading text-[22px] font-light leading-tight" style={{ color: 'var(--color-text)' }}>{petal.label}</h1>
              <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>{petal.description}</p>
            </div>
          </div>
          {quests.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>{doneCount} of {quests.length} quests</span>
                <span className="text-[12px]" style={{ color: 'var(--color-amber)' }}>{pct}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-pill-bg)' }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: petal.color }} />
              </div>
            </>
          )}
        </div>

        {/* Quest list */}
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-10 space-y-2.5">
          {quests.length === 0 ? (
            <div className="rounded-[16px] px-4 py-12 text-center" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)' }}>
              <div className="text-[30px] mb-2">🌱</div>
              <p className="font-heading text-[17px] font-light" style={{ color: 'var(--color-text)' }}>Quests are being planted</p>
              <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-muted)' }}>This domain’s quests are coming soon.</p>
            </div>
          ) : (
            quests.map((quest, i) => {
              const isDone = completed.has(quest.id)
              const prevDone = i === 0 || completed.has(quests[i - 1].id)
              const locked = !isDone && !prevDone
              return (
                <button
                  key={quest.id}
                  disabled={locked}
                  onClick={() => !locked && onOpenQuest(quest)}
                  className="w-full text-left rounded-[16px] px-4 py-3.5 flex items-center gap-3.5 transition-all active:scale-[0.99]"
                  style={{
                    background: 'var(--color-card)',
                    border: isDone ? `0.5px solid ${petal.color}` : '0.5px solid var(--color-border)',
                    opacity: locked ? 0.55 : 1,
                    cursor: locked ? 'default' : 'pointer',
                  }}
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-[15px] font-semibold shrink-0"
                    style={{ background: isDone ? petal.color : 'var(--color-pill-bg)', color: isDone ? '#fff' : 'var(--color-text-secondary)' }}>
                    {isDone ? '✓' : locked ? '🔒' : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium leading-snug" style={{ color: 'var(--color-text)' }}>{quest.title}</div>
                    <div className="text-[12px] mt-0.5 leading-snug" style={{ color: 'var(--color-text-secondary)' }}>
                      {locked ? 'Complete the previous quest to unlock' : quest.description}
                    </div>
                  </div>
                  <div className="text-[11px] font-semibold shrink-0" style={{ color: isDone ? petal.color : 'var(--color-amber)' }}>
                    {isDone ? 'Done' : `+${quest.xpReward}`}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
