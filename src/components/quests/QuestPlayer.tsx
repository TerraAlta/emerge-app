'use client'

/**
 * QuestPlayer — steps a user through a Quest's learning cards with a progress
 * bar, gating "Continue" until each card's interaction is satisfied, then a
 * completion screen that awards XP.
 */

import { useState } from 'react'
import type { Quest } from '@/lib/quest-content'
import type { Journal } from '@/lib/quest-progress'
import { ConceptCard, ChallengeCard, ReflectionCard } from '@/components/quests/QuestCards'

interface Props {
  quest: Quest
  petalLabel: string
  petalColor: string
  journal: Journal
  onSaveReflection: (cardId: string, text: string) => void
  onComplete: (quest: Quest) => void
  onExit: () => void
}

export default function QuestPlayer({ quest, petalLabel, petalColor, journal, onSaveReflection, onComplete, onExit }: Props) {
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<Record<string, boolean>>({})
  const [text, setText] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {}
    for (const c of quest.cards) if (c.type === 'reflection') seed[c.id] = journal[c.id] ?? ''
    return seed
  })
  const [done, setDone] = useState(false)

  const card = quest.cards[index]
  const isLast = index === quest.cards.length - 1

  const ready = (() => {
    if (card.type === 'concept') return true
    if (card.type === 'challenge') return results[card.id] !== undefined
    return (text[card.id] ?? '').trim().length > 0
  })()

  function advance() {
    if (!ready) return
    if (isLast) {
      onComplete(quest)
      setDone(true)
    } else {
      setIndex(i => i + 1)
    }
  }

  // ── Completion screen ──
  if (done) {
    return (
      <div className="fixed inset-0 z-50 font-body flex flex-col items-center justify-center px-6 text-center" style={{ background: 'var(--color-bg)' }}>
        <div className="text-[64px] mb-2" style={{ animation: 'questBloom 700ms cubic-bezier(.22,1,.36,1) both' }}>🌸</div>
        <h2 className="font-heading text-[26px] font-light" style={{ color: 'var(--color-text)' }}>Quest complete</h2>
        <p className="text-[14px] mt-1 mb-5" style={{ color: 'var(--color-text-secondary)' }}>{quest.title}</p>
        <div className="rounded-full px-5 py-2 text-[16px] font-semibold mb-8" style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)' }}>
          +{quest.xpReward} XP
        </div>
        <button onClick={onExit} className="w-full max-w-[320px] py-3.5 rounded-[12px] text-[14px] font-semibold" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-amber-border)', color: 'var(--color-text)' }}>
          Back to {petalLabel}
        </button>
        <style>{`@keyframes questBloom { from { opacity:0; transform: scale(0.3) rotate(-20deg);} to { opacity:1; transform: scale(1) rotate(0);} }`}</style>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 font-body flex flex-col" style={{ background: 'var(--color-bg)' }}>
      {/* Header */}
      <div className="px-4 pt-[calc(16px+var(--sat,0px))] pb-3 shrink-0" style={{ background: 'var(--color-bg)' }}>
        <div className="flex items-center gap-3">
          <button onClick={onExit} className="text-[20px] leading-none opacity-50 active:opacity-80" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text)' }} aria-label="Exit quest">×</button>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] truncate" style={{ color: petalColor }}>{petalLabel}</p>
            <p className="text-[14px] font-medium truncate" style={{ color: 'var(--color-text)' }}>{quest.title}</p>
          </div>
        </div>
        {/* Segmented progress bar */}
        <div className="flex gap-1.5 mt-3">
          {quest.cards.map((c, i) => (
            <div key={c.id} className="flex-1 h-1.5 rounded-full transition-all duration-300"
              style={{ background: i <= index ? 'var(--color-amber)' : 'var(--color-pill-bg)' }} />
          ))}
        </div>
        <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>Card {index + 1} of {quest.cards.length}</p>
      </div>

      {/* Card area */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="mx-auto w-full max-w-[440px]">
          {card.type === 'concept' && <ConceptCard content={card.content as any} />}
          {card.type === 'challenge' && (
            <ChallengeCard content={card.content as any} onResult={c => setResults(r => ({ ...r, [card.id]: c }))} />
          )}
          {card.type === 'reflection' && (
            <ReflectionCard
              content={card.content as any}
              value={text[card.id] ?? ''}
              onChange={t => { setText(s => ({ ...s, [card.id]: t })); onSaveReflection(card.id, t) }}
            />
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 pb-[calc(16px+var(--sat,0px))] pt-2 shrink-0" style={{ background: 'var(--color-bg)' }}>
        <div className="mx-auto w-full max-w-[440px]">
          <button
            onClick={advance}
            disabled={!ready}
            className="w-full py-3.5 rounded-[12px] text-[14px] font-semibold transition-opacity"
            style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)', opacity: ready ? 1 : 0.4 }}
          >
            {isLast ? `Complete quest · +${quest.xpReward} XP` : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
