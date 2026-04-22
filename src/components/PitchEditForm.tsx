'use client'

import { FLOWER_PETALS } from '@/lib/flower-petals'

export interface PitchDraft {
  title: string
  one_line_vision: string
  vision_long: string
  stage: string
  commitment_level: string
  country: string
  region: string
  target_region_flexibility: string
  flower_petals: string[]
  roles_sought: string[]
  offering: string
  seed_capital_range: string
  language: string
  contact_method: 'email' | 'external_link'
  contact_value: string
}

interface Props {
  value: PitchDraft
  onChange: (next: PitchDraft) => void
  disabled?: boolean
}

const STAGES = [
  { key: 'idea', label: 'Idea' },
  { key: 'gathering_people', label: 'Gathering people' },
  { key: 'has_core_group', label: 'Has core group' },
  { key: 'seeking_land', label: 'Seeking land' },
  { key: 'has_land', label: 'Has land' },
]

const COMMITMENTS = [
  { key: 'exploratory', label: 'Exploratory' },
  { key: 'part_time', label: 'Part-time' },
  { key: 'full_time', label: 'Full-time' },
  { key: 'lifetime', label: 'Lifetime commitment' },
]

export default function PitchEditForm({ value, onChange, disabled }: Props) {
  function update<K extends keyof PitchDraft>(key: K, v: PitchDraft[K]) {
    onChange({ ...value, [key]: v })
  }

  function togglePetal(key: string) {
    const next = value.flower_petals.includes(key)
      ? value.flower_petals.filter(p => p !== key)
      : [...value.flower_petals, key]
    update('flower_petals', next)
  }

  function addRole(role: string) {
    const t = role.trim()
    if (!t || value.roles_sought.includes(t)) return
    update('roles_sought', [...value.roles_sought, t])
  }
  function removeRole(r: string) {
    update('roles_sought', value.roles_sought.filter(x => x !== r))
  }

  const input = {
    background: 'var(--color-pill-bg)',
    border: '0.5px solid var(--color-amber-border)',
    color: 'var(--color-text)',
    outline: 'none',
  }
  const Label = ({ children }: { children: React.ReactNode }) => (
    <label className="text-[12px] mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>{children}</label>
  )

  return (
    <div className="space-y-5">
      <div>
        <Label>Title</Label>
        <input
          value={value.title}
          onChange={e => update('title', e.target.value)}
          placeholder="e.g. Alentejo Healing Forest"
          maxLength={80}
          className="w-full rounded-lg px-3 py-2.5 text-[15px]"
          style={input}
          disabled={disabled}
        />
      </div>

      <div>
        <Label>One-line vision — specific enough that some people read it and say "not for me"</Label>
        <input
          value={value.one_line_vision}
          onChange={e => update('one_line_vision', e.target.value)}
          placeholder="e.g. Rebuilding a traditional Alentejo quinta as a women-led healing forest, 2 hectares, 5-year arc"
          maxLength={200}
          className="w-full rounded-lg px-3 py-2.5 text-[14px]"
          style={input}
          disabled={disabled}
        />
      </div>

      <div>
        <Label>Long vision (2-4 paragraphs)</Label>
        <textarea
          value={value.vision_long}
          onChange={e => update('vision_long', e.target.value)}
          rows={8}
          maxLength={2000}
          className="w-full rounded-lg px-3 py-2.5 text-[13px] leading-relaxed"
          style={{ ...input, resize: 'vertical' }}
          disabled={disabled}
        />
      </div>

      <div>
        <Label>Stage</Label>
        <div className="flex flex-wrap gap-1.5">
          {STAGES.map(s => (
            <button
              key={s.key}
              onClick={() => update('stage', s.key)}
              disabled={disabled}
              type="button"
              className="rounded-full px-3 py-1.5 text-[12px]"
              style={{
                background: value.stage === s.key ? 'var(--color-amber)' : 'var(--color-pill-bg)',
                color: value.stage === s.key ? 'var(--color-pill-active-text)' : 'var(--color-text-secondary)',
                border: '0.5px solid var(--color-amber-border)',
                cursor: 'pointer',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>Commitment level asked of people who join</Label>
        <div className="flex flex-wrap gap-1.5">
          {COMMITMENTS.map(c => (
            <button
              key={c.key}
              onClick={() => update('commitment_level', c.key)}
              disabled={disabled}
              type="button"
              className="rounded-full px-3 py-1.5 text-[12px]"
              style={{
                background: value.commitment_level === c.key ? 'var(--color-amber)' : 'var(--color-pill-bg)',
                color: value.commitment_level === c.key ? 'var(--color-pill-active-text)' : 'var(--color-text-secondary)',
                border: '0.5px solid var(--color-amber-border)',
                cursor: 'pointer',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Country</Label>
          <input
            value={value.country}
            onChange={e => update('country', e.target.value)}
            placeholder="e.g. Portugal"
            className="w-full rounded-lg px-3 py-2.5 text-[13px]"
            style={input}
            disabled={disabled}
          />
        </div>
        <div>
          <Label>Region (optional)</Label>
          <input
            value={value.region}
            onChange={e => update('region', e.target.value)}
            placeholder="e.g. Alentejo"
            className="w-full rounded-lg px-3 py-2.5 text-[13px]"
            style={input}
            disabled={disabled}
          />
        </div>
      </div>

      <div>
        <Label>Geographic flexibility (free text)</Label>
        <input
          value={value.target_region_flexibility}
          onChange={e => update('target_region_flexibility', e.target.value)}
          placeholder='e.g. "anywhere in Iberia" or "must be within 50km of Lisbon"'
          className="w-full rounded-lg px-3 py-2.5 text-[13px]"
          style={input}
          disabled={disabled}
        />
      </div>

      <div>
        <Label>Permaculture petals this project touches</Label>
        <div className="flex flex-wrap gap-1.5">
          {FLOWER_PETALS.map(p => {
            const on = value.flower_petals.includes(p.key)
            return (
              <button
                key={p.key}
                onClick={() => togglePetal(p.key)}
                disabled={disabled}
                type="button"
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
        <Label>Roles you are looking for (comma or Enter to add)</Label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.roles_sought.map(r => (
            <div key={r} className="rounded-full px-3 py-1 text-[12px] flex items-center gap-1.5"
              style={{ background: 'var(--color-amber-light)', border: '0.5px solid var(--color-amber-border)', color: 'var(--color-text)' }}>
              {r}
              <button onClick={() => removeRole(r)} type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>×</button>
            </div>
          ))}
        </div>
        <input
          placeholder="e.g. water designer, sociocracy facilitator, co-founder with capital"
          onKeyDown={e => {
            if ((e.key === 'Enter' || e.key === ',') && e.currentTarget.value.trim()) {
              e.preventDefault()
              addRole(e.currentTarget.value.replace(/,/g, ''))
              e.currentTarget.value = ''
            }
          }}
          className="w-full rounded-lg px-3 py-2 text-[13px]"
          style={input}
          disabled={disabled}
        />
      </div>

      <div>
        <Label>What YOU bring — skills, capital, land, time, network</Label>
        <textarea
          value={value.offering}
          onChange={e => update('offering', e.target.value)}
          rows={4}
          maxLength={1000}
          className="w-full rounded-lg px-3 py-2.5 text-[13px] leading-relaxed"
          style={{ ...input, resize: 'vertical' }}
          disabled={disabled}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Seed capital range (optional)</Label>
          <input
            value={value.seed_capital_range}
            onChange={e => update('seed_capital_range', e.target.value)}
            placeholder="e.g. €15-25k pooled"
            className="w-full rounded-lg px-3 py-2.5 text-[13px]"
            style={input}
            disabled={disabled}
          />
        </div>
        <div>
          <Label>Language of the pitch</Label>
          <input
            value={value.language}
            onChange={e => update('language', e.target.value.toLowerCase().slice(0, 5))}
            placeholder="en"
            className="w-full rounded-lg px-3 py-2.5 text-[13px]"
            style={input}
            disabled={disabled}
          />
        </div>
      </div>

      <div>
        <Label>How people should reach you</Label>
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => update('contact_method', 'email')}
            type="button"
            disabled={disabled}
            className="rounded-full px-3 py-1.5 text-[12px]"
            style={{
              background: value.contact_method === 'email' ? 'var(--color-amber)' : 'var(--color-pill-bg)',
              color: value.contact_method === 'email' ? 'var(--color-pill-active-text)' : 'var(--color-text-secondary)',
              border: '0.5px solid var(--color-amber-border)',
              cursor: 'pointer',
            }}
          >Email</button>
          <button
            onClick={() => update('contact_method', 'external_link')}
            type="button"
            disabled={disabled}
            className="rounded-full px-3 py-1.5 text-[12px]"
            style={{
              background: value.contact_method === 'external_link' ? 'var(--color-amber)' : 'var(--color-pill-bg)',
              color: value.contact_method === 'external_link' ? 'var(--color-pill-active-text)' : 'var(--color-text-secondary)',
              border: '0.5px solid var(--color-amber-border)',
              cursor: 'pointer',
            }}
          >External link</button>
        </div>
        <input
          value={value.contact_value}
          onChange={e => update('contact_value', e.target.value)}
          placeholder={value.contact_method === 'email' ? 'you@example.com' : 'https://...'}
          className="w-full rounded-lg px-3 py-2.5 text-[13px]"
          style={input}
          disabled={disabled}
        />
      </div>
    </div>
  )
}
