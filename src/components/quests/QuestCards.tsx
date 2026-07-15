'use client'

/**
 * The three interactive learning-card types for a Quest.
 * Each card manages its own interaction and reports completion upward so the
 * QuestPlayer can gate the "Continue" button.
 */

import { useState } from 'react'
import type {
  ConceptContent, ChallengeContent, ReflectionContent, MultipleChoice, ArrangeChallenge,
} from '@/lib/quest-content'

const cardShell = 'rounded-[18px] px-5 py-6'
const cardStyle: React.CSSProperties = {
  background: 'var(--color-card)',
  border: '0.5px solid var(--color-border)',
}

/* ── CONCEPT ─────────────────────────────────────────────────────────────── */
export function ConceptCard({ content }: { content: ConceptContent }) {
  return (
    <div className={cardShell} style={cardStyle}>
      {content.icon && (
        <div className="w-14 h-14 rounded-full flex items-center justify-center text-[30px] mb-4"
          style={{ background: 'var(--color-amber-bg)', border: '0.5px solid var(--color-amber-border)' }}>
          {content.icon}
        </div>
      )}
      <h3 className="font-heading text-[20px] font-light leading-snug mb-3" style={{ color: 'var(--color-text)' }}>
        {content.heading}
      </h3>
      <p className="text-[14px] leading-relaxed mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        {content.body}
      </p>
      <div className="rounded-[12px] px-4 py-3 flex items-start gap-2.5"
        style={{ background: 'var(--color-amber-bg)', border: '0.5px solid var(--color-amber-border)' }}>
        <span className="text-[15px] leading-none mt-0.5">🌱</span>
        <div>
          <div className="text-[10px] uppercase font-semibold mb-0.5" style={{ color: 'var(--color-amber)', letterSpacing: '0.08em' }}>Key idea</div>
          <p className="text-[13px] leading-snug font-medium" style={{ color: 'var(--color-text)' }}>{content.keyIdea}</p>
        </div>
      </div>
    </div>
  )
}

/* ── CHALLENGE ───────────────────────────────────────────────────────────── */
export function ChallengeCard({ content, onResult }: { content: ChallengeContent; onResult: (correct: boolean) => void }) {
  if (content.kind === 'multiple-choice') return <MultipleChoiceCard content={content} onResult={onResult} />
  return <ArrangeCard content={content} onResult={onResult} />
}

function MultipleChoiceCard({ content, onResult }: { content: MultipleChoice; onResult: (c: boolean) => void }) {
  const [picked, setPicked] = useState<string | null>(null)
  const answered = picked !== null
  const correct = picked === content.answerId

  return (
    <div className={cardShell} style={cardStyle}>
      <div className="text-[10px] uppercase font-semibold mb-2" style={{ color: 'var(--color-amber)', letterSpacing: '0.08em' }}>Challenge</div>
      <h3 className="font-heading text-[18px] font-light leading-snug mb-4" style={{ color: 'var(--color-text)' }}>
        {content.prompt}
      </h3>
      <div className="space-y-2">
        {content.choices.map(ch => {
          const isPicked = picked === ch.id
          const isAnswer = ch.id === content.answerId
          let bg = 'var(--color-pill-bg)'
          let border = '0.5px solid var(--color-border)'
          let color = 'var(--color-text)'
          if (answered && isAnswer) { bg = 'var(--color-success-bg)'; border = '1px solid var(--color-success)'; color = 'var(--color-text)' }
          else if (answered && isPicked && !isAnswer) { bg = 'rgba(192,80,64,0.1)'; border = '1px solid var(--color-error)' }
          return (
            <button
              key={ch.id}
              disabled={answered}
              onClick={() => { setPicked(ch.id); onResult(ch.id === content.answerId) }}
              className="w-full text-left rounded-[12px] px-4 py-3 text-[14px] flex items-center justify-between transition-all active:scale-[0.99]"
              style={{ background: bg, border, color }}
            >
              <span>{ch.label}</span>
              {answered && isAnswer && <span className="text-[15px]">✓</span>}
              {answered && isPicked && !isAnswer && <span className="text-[15px]">✕</span>}
            </button>
          )
        })}
      </div>
      {answered && (
        <div className="mt-4 rounded-[12px] px-4 py-3" style={{ background: correct ? 'var(--color-success-bg)' : 'var(--color-amber-bg)', border: `0.5px solid ${correct ? 'var(--color-success)' : 'var(--color-amber-border)'}` }}>
          <p className="text-[13px] font-medium mb-1" style={{ color: correct ? 'var(--color-success)' : 'var(--color-amber)' }}>
            {correct ? 'Exactly right.' : 'Not quite — here’s why.'}
          </p>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{content.explanation}</p>
        </div>
      )}
    </div>
  )
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function ArrangeCard({ content, onResult }: { content: ArrangeChallenge; onResult: (c: boolean) => void }) {
  // Runs client-only (player mounts on interaction), so a random shuffle is safe.
  const [pool, setPool] = useState<string[]>(() => {
    const ids = content.items.map(i => i.id)
    let s = shuffle(ids)
    // Avoid handing the user the already-correct order.
    if (s.join() === ids.join() && ids.length > 1) s = [...s].reverse()
    return s
  })
  const [placed, setPlaced] = useState<string[]>([])
  const [checked, setChecked] = useState<null | boolean>(null)
  const label = (id: string) => content.items.find(i => i.id === id)?.label ?? id
  const correctOrder = content.items.map(i => i.id)

  function place(id: string) {
    if (checked !== null) return
    setPool(p => p.filter(x => x !== id))
    setPlaced(p => [...p, id])
  }
  function unplace(id: string) {
    if (checked !== null) return
    setPlaced(p => p.filter(x => x !== id))
    setPool(p => [...p, id])
  }
  function check() {
    const ok = placed.join() === correctOrder.join()
    setChecked(ok)
    onResult(ok)
  }
  function retry() {
    setPool(shuffle(content.items.map(i => i.id)))
    setPlaced([])
    setChecked(null)
  }

  return (
    <div className={cardShell} style={cardStyle}>
      <div className="text-[10px] uppercase font-semibold mb-2" style={{ color: 'var(--color-amber)', letterSpacing: '0.08em' }}>Challenge · arrange</div>
      <h3 className="font-heading text-[18px] font-light leading-snug mb-3" style={{ color: 'var(--color-text)' }}>
        {content.prompt}
      </h3>

      {/* Placed sequence */}
      <div className="flex items-center justify-between text-[10px] mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
        <span>{content.fromLabel ?? 'First'}</span>
        <span>{content.toLabel ?? 'Last'}</span>
      </div>
      <div className="rounded-[12px] px-3 py-3 mb-3 space-y-2 min-h-[56px]" style={{ background: 'var(--color-bg)', border: '0.5px dashed var(--color-amber-border)' }}>
        {placed.length === 0 && (
          <p className="text-[12px] text-center py-2" style={{ color: 'var(--color-text-muted)' }}>Tap the pieces below, in order.</p>
        )}
        {placed.map((id, i) => {
          const wrong = checked === false && correctOrder[i] !== id
          return (
            <button key={id} onClick={() => unplace(id)} disabled={checked !== null}
              className="w-full flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px] text-left transition-all"
              style={{ background: 'var(--color-card)', border: `0.5px solid ${wrong ? 'var(--color-error)' : 'var(--color-amber-border)'}`, color: 'var(--color-text)' }}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0" style={{ background: 'var(--color-amber-light)', color: 'var(--color-amber)' }}>{i + 1}</span>
              <span>{label(id)}</span>
            </button>
          )
        })}
      </div>

      {/* Pool */}
      {pool.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {pool.map(id => (
            <button key={id} onClick={() => place(id)}
              className="rounded-full px-3.5 py-2 text-[13px] active:scale-95 transition-transform"
              style={{ background: 'var(--color-pill-bg)', border: '0.5px solid var(--color-border)', color: 'var(--color-text)' }}>
              {label(id)}
            </button>
          ))}
        </div>
      )}

      {checked === null && pool.length === 0 && (
        <button onClick={check} className="w-full py-3 rounded-[12px] text-[14px] font-semibold" style={{ background: 'var(--color-amber)', color: 'var(--color-pill-active-text)' }}>
          Check order
        </button>
      )}

      {checked !== null && (
        <div className="rounded-[12px] px-4 py-3" style={{ background: checked ? 'var(--color-success-bg)' : 'var(--color-amber-bg)', border: `0.5px solid ${checked ? 'var(--color-success)' : 'var(--color-amber-border)'}` }}>
          <p className="text-[13px] font-medium mb-1" style={{ color: checked ? 'var(--color-success)' : 'var(--color-amber)' }}>
            {checked ? 'Nicely ordered.' : 'Not quite — here’s the flow.'}
          </p>
          <p className="text-[13px] leading-relaxed mb-2" style={{ color: 'var(--color-text-secondary)' }}>{content.explanation}</p>
          {!checked && (
            <button onClick={retry} className="text-[13px] font-medium" style={{ color: 'var(--color-amber)' }}>Try again →</button>
          )}
        </div>
      )}
    </div>
  )
}

/* ── REFLECTION ──────────────────────────────────────────────────────────── */
export function ReflectionCard({ content, value, onChange }: { content: ReflectionContent; value: string; onChange: (t: string) => void }) {
  return (
    <div className={cardShell} style={cardStyle}>
      <div className="text-[10px] uppercase font-semibold mb-2" style={{ color: 'var(--color-amber)', letterSpacing: '0.08em' }}>Reflection · saved to your journal</div>
      <h3 className="font-heading text-[18px] font-light leading-snug mb-4" style={{ color: 'var(--color-text)' }}>
        {content.prompt}
      </h3>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={content.placeholder ?? 'Write freely…'}
        rows={6}
        className="w-full rounded-[12px] px-3.5 py-3 text-[14px] outline-none resize-none"
        style={{ background: 'var(--color-bg)', border: '0.5px solid var(--color-amber-border)', color: 'var(--color-text)', fontFamily: 'var(--font-outfit), sans-serif' }}
      />
      <p className="text-[11px] mt-2" style={{ color: 'var(--color-text-muted)' }}>No right answer — this is just for you.</p>
    </div>
  )
}
