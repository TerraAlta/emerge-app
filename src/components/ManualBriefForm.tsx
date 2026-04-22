'use client'

import { useState } from 'react'
import { FLOWER_PETALS } from '@/lib/flower-petals'

export interface ManualBriefDraft {
  project_name?: string
  tagline?: string
  country?: string
  region?: string
  land_size_ha?: number | null
  climate_zone?: string
  project_scale?: string
  project_type?: string
  site_context?: string
  vision?: string
  stakeholders?: string
  timeline?: string
  constraints?: string[]
  values?: string[]
  help_sought?: string[]
  suggested_petals?: string[]
  languages?: string[]
}

interface Props {
  initial: ManualBriefDraft
  onSubmit: (draft: ManualBriefDraft) => void
  onBack: () => void
}

export default function ManualBriefForm({ initial, onSubmit, onBack }: Props) {
  const [v, setV] = useState<ManualBriefDraft>({ ...initial })
  const [saving, setSaving] = useState(false)

  function set<K extends keyof ManualBriefDraft>(key: K, val: ManualBriefDraft[K]) {
    setV(prev => ({ ...prev, [key]: val }))
  }
  function togglePetal(key: string) {
    const current = v.suggested_petals || []
    set('suggested_petals', current.includes(key) ? current.filter(p => p !== key) : [...current, key])
  }
  function addToList(key: 'constraints' | 'values' | 'help_sought', item: string) {
    const t = item.trim()
    if (!t) return
    const list = (v[key] || []) as string[]
    if (list.includes(t)) return
    set(key, [...list, t])
  }
  function removeFromList(key: 'constraints' | 'values' | 'help_sought', item: string) {
    const list = (v[key] || []) as string[]
    set(key, list.filter(x => x !== item))
  }

  const input = { background: 'var(--color-pill-bg)', border: '0.5px solid var(--color-amber-border)', color: 'var(--color-text)', outline: 'none' }
  const Label = ({ children }: { children: React.ReactNode }) => (
    <label className="text-[12px] mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>{children}</label>
  )

  function Tags({ k, placeholder }: { k: 'constraints' | 'values' | 'help_sought'; placeholder: string }) {
    const list = (v[k] || []) as string[]
    return (
      <>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {list.map(x => (
            <div key={x} className="rounded-full px-3 py-1 text-[12px] flex items-center gap-1.5"
              style={{ background: 'var(--color-amber-light)', border: '0.5px solid var(--color-amber-border)', color: 'var(--color-text)' }}>
              {x}
              <button type="button" onClick={() => removeFromList(k, x)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>×</button>
            </div>
          ))}
        </div>
        <input
          placeholder={placeholder}
          onKeyDown={e => {
            if ((e.key === 'Enter' || e.key === ',') && e.currentTarget.value.trim()) {
              e.preventDefault()
              addToList(k, e.currentTarget.value.replace(/,/g, ''))
              e.currentTarget.value = ''
            }
          }}
          className="w-full rounded-lg px-3 py-2 text-[13px]"
          style={input}
        />
      </>
    )
  }

  async function submit() {
    setSaving(true)
    await onSubmit(v)
    setSaving(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-[12px]"
          style={{ color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>
          ← Back
        </button>
      </div>
      <div>
        <h2 className="font-heading text-[22px] font-light mb-1" style={{ color: 'var(--color-text)' }}>
          Your project <em style={{ color: 'var(--color-amber)' }}>brief</em>
        </h2>
        <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
          Fill what you can. Everything editable — and you can always come back to refine before paying.
        </p>
      </div>

      <div>
        <Label>Project name</Label>
        <input value={v.project_name || ''} onChange={e => set('project_name', e.target.value)}
          className="w-full rounded-lg px-3 py-2.5 text-[15px]" style={input} />
      </div>

      <div>
        <Label>One-line tagline</Label>
        <input value={v.tagline || ''} onChange={e => set('tagline', e.target.value)}
          placeholder="e.g. Restoring a 5ha Alentejo quinta as a food forest"
          className="w-full rounded-lg px-3 py-2.5 text-[14px]" style={input} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Country</Label>
          <input value={v.country || ''} onChange={e => set('country', e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-[13px]" style={input} />
        </div>
        <div>
          <Label>Region (optional)</Label>
          <input value={v.region || ''} onChange={e => set('region', e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-[13px]" style={input} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Land size (ha, optional)</Label>
          <input type="number" step="0.1" value={v.land_size_ha ?? ''}
            onChange={e => set('land_size_ha', e.target.value === '' ? null : parseFloat(e.target.value))}
            className="w-full rounded-lg px-3 py-2.5 text-[13px]" style={input} />
        </div>
        <div>
          <Label>Climate zone (e.g. Mediterranean)</Label>
          <input value={v.climate_zone || ''} onChange={e => set('climate_zone', e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-[13px]" style={input} />
        </div>
      </div>

      <div>
        <Label>Site context — what the land is like right now (2-3 paragraphs)</Label>
        <textarea value={v.site_context || ''} onChange={e => set('site_context', e.target.value)}
          rows={5} className="w-full rounded-lg px-3 py-2.5 text-[13px] leading-relaxed"
          style={{ ...input, resize: 'vertical' }} />
      </div>

      <div>
        <Label>Your vision — what you imagine it becoming (2-4 paragraphs)</Label>
        <textarea value={v.vision || ''} onChange={e => set('vision', e.target.value)}
          rows={7} className="w-full rounded-lg px-3 py-2.5 text-[13px] leading-relaxed"
          style={{ ...input, resize: 'vertical' }} />
      </div>

      <div>
        <Label>Stakeholders — who is involved?</Label>
        <textarea value={v.stakeholders || ''} onChange={e => set('stakeholders', e.target.value)}
          rows={3} className="w-full rounded-lg px-3 py-2.5 text-[13px]"
          style={{ ...input, resize: 'vertical' }} />
      </div>

      <div>
        <Label>Timeline (e.g. "2 years", "starting spring 2026")</Label>
        <input value={v.timeline || ''} onChange={e => set('timeline', e.target.value)}
          className="w-full rounded-lg px-3 py-2.5 text-[13px]" style={input} />
      </div>

      <div>
        <Label>Values that matter to you</Label>
        <Tags k="values" placeholder="e.g. food sovereignty, intergenerational land, decolonial design — press Enter" />
      </div>

      <div>
        <Label>Known constraints (budget, legal, water, access, etc.)</Label>
        <Tags k="constraints" placeholder="e.g. limited water, zoning restrictions, €50k cap — press Enter" />
      </div>

      <div>
        <Label>What kind of help are you seeking?</Label>
        <Tags k="help_sought" placeholder="e.g. water design, governance facilitation, soil assessment — press Enter" />
      </div>

      <div>
        <Label>Permaculture petals this project touches</Label>
        <div className="flex flex-wrap gap-1.5">
          {FLOWER_PETALS.map(p => {
            const on = (v.suggested_petals || []).includes(p.key)
            return (
              <button key={p.key} onClick={() => togglePetal(p.key)} type="button"
                className="rounded-full px-3 py-1.5 text-[11px] flex items-center gap-1.5"
                style={{
                  background: on ? `${p.color}20` : 'var(--color-pill-bg)',
                  color: on ? p.color : 'var(--color-text-secondary)',
                  border: on ? `0.5px solid ${p.color}` : '0.5px solid var(--color-amber-border)',
                  cursor: 'pointer',
                }}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                {p.label.replace(' Stewardship', '')}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <Label>Languages you're comfortable working in (comma-separated)</Label>
        <input
          value={(v.languages || []).join(', ')}
          onChange={e => set('languages', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
          placeholder="English, Portuguese"
          className="w-full rounded-lg px-3 py-2.5 text-[13px]"
          style={input}
        />
      </div>

      <button
        onClick={submit}
        disabled={saving || !(v.project_name || '').trim()}
        className="w-full py-3 rounded-full text-[14px] font-semibold"
        style={{
          background: 'var(--color-amber)', color: 'var(--color-pill-active-text)', border: 'none',
          cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.5 : 1,
        }}
      >
        {saving ? 'Saving...' : 'Continue to preview →'}
      </button>
    </div>
  )
}
