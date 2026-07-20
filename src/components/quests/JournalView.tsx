'use client'

/**
 * JournalView — a personal regenerative diary. Surfaces every reflection and
 * field-note the user has written across their quests, so they can watch their
 * own thinking grow over time.
 */

export interface JournalEntry {
  key: string
  kind: 'reflection' | 'action'
  prompt: string
  text: string
  questTitle: string
  petalLabel: string
  petalColor: string
  petalIcon: string
}

export default function JournalView({ entries, onBack }: { entries: JournalEntry[]; onBack: () => void }) {
  return (
    <div className="min-h-screen font-body flex justify-center" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <div className="w-full flex flex-col max-w-[440px]" style={{ minHeight: '100dvh' }}>

        {/* Header */}
        <div className="px-4 sticky top-0 z-20" style={{ background: 'var(--color-bg)', paddingTop: 'calc(18px + var(--sat,0px))', paddingBottom: 10 }}>
          <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] font-medium active:scale-95 transition-transform" style={{ color: 'var(--color-amber)', background: 'none', border: 'none', cursor: 'pointer' }}>
            ← Flower
          </button>
        </div>

        <div className="px-5 pt-2 pb-3">
          <h1 className="font-heading text-[24px] font-light leading-tight" style={{ color: 'var(--color-text)' }}>
            Your <em style={{ color: 'var(--color-amber)' }}>journal</em>
          </h1>
          <p className="text-[13px] mt-1 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            Everything you&apos;ve written along the way — just for you.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-10 space-y-3">
          {entries.length === 0 ? (
            <div className="rounded-[16px] px-4 py-12 text-center" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)' }}>
              <div className="text-[30px] mb-2">📔</div>
              <p className="font-heading text-[17px] font-light" style={{ color: 'var(--color-text)' }}>Nothing here yet</p>
              <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                As you answer reflection and action cards, your notes gather here.
              </p>
            </div>
          ) : (
            entries.map(e => (
              <div key={e.key} className="rounded-[16px] px-4 py-4" style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-border)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-[13px] shrink-0" style={{ background: 'var(--color-amber-bg)', border: `0.5px solid ${e.petalColor}` }}>
                    {e.petalIcon}
                  </span>
                  <span className="text-[11px] font-medium" style={{ color: e.petalColor }}>{e.petalLabel}</span>
                  <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>· {e.questTitle}</span>
                  {e.kind === 'action' && (
                    <span className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded-full ml-auto" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)', letterSpacing: '0.05em' }}>Action</span>
                  )}
                </div>
                <p className="text-[12px] italic mb-1.5 leading-snug" style={{ color: 'var(--color-text-secondary)' }}>{e.prompt}</p>
                <p className="text-[14px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text)' }}>{e.text}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
