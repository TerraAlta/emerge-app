'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Quest } from '@/types/database'

interface NearbyQuest extends Quest {
  distance_km: number
}

interface Props {
  userId: string
  quests: NearbyQuest[]
  onSelectQuest: (quest: NearbyQuest) => void
}

const SKILL_CATEGORIES = [
  { key: 'grow',     emoji: '\u{1F331}', label: 'Grow',     questTypes: ['nature', 'food'] },
  { key: 'build',    emoji: '\u{1F528}', label: 'Build',    questTypes: ['craft'] },
  { key: 'repair',   emoji: '\u{1F527}', label: 'Repair',   questTypes: ['craft'] },
  { key: 'forage',   emoji: '\u{1F344}', label: 'Forage',   questTypes: ['nature', 'food'] },
  { key: 'ferment',  emoji: '\u{1FAD9}', label: 'Ferment',  questTypes: ['food'] },
  { key: 'weave',    emoji: '\u{1F9F6}', label: 'Weave',    questTypes: ['craft', 'community'] },
  { key: 'cook',     emoji: '\u{1F372}', label: 'Cook',     questTypes: ['food', 'community'] },
  { key: 'restore',  emoji: '\u{1F33F}', label: 'Restore',  questTypes: ['nature', 'wellness'] },
] as const

type SkillKey = typeof SKILL_CATEGORIES[number]['key']

export default function SkillsScreen({ userId, quests, onSelectQuest }: Props) {
  const [userSkills, setUserSkills] = useState<SkillKey[]>([])
  const [selectedSkill, setSelectedSkill] = useState<SkillKey | null>(null)
  const [saving, setSaving] = useState(false)

  // Fetch user skills from profile
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('profiles')
        .select('skills')
        .eq('id', userId)
        .single()
      if (data?.skills && Array.isArray(data.skills)) {
        setUserSkills(data.skills as SkillKey[])
      }
    }
    load()
  }, [userId])

  const toggleSkill = useCallback(async (skill: SkillKey) => {
    setSaving(true)
    const updated = userSkills.includes(skill)
      ? userSkills.filter(s => s !== skill)
      : [...userSkills, skill]
    setUserSkills(updated)
    await supabase
      .from('profiles')
      .update({ skills: updated })
      .eq('id', userId)
    setSaving(false)
  }, [userSkills, userId])

  // Filter quests by selected skill's quest types
  const filteredQuests = selectedSkill
    ? quests.filter(q => {
        const cat = SKILL_CATEGORIES.find(s => s.key === selectedSkill)
        return cat ? (cat.questTypes as readonly string[]).includes(q.category) : false
      })
    : []

  return (
    <div className="min-h-screen font-body" style={{ background: '#0D1A0B' }}>
      <div className="w-full" style={{ maxWidth: 390, margin: '0 auto' }}>

        {/* Header */}
        <div className="px-4 pt-5 pb-3">
          <h1 className="font-heading text-[20px] font-light" style={{ color: '#E8F2E0' }}>
            Your <em style={{ color: '#C8913A' }}>Skills</em>
          </h1>
          <p className="text-[10px] mt-0.5" style={{ color: 'rgba(232,242,224,0.4)' }}>
            Tap to add skills you have. Explore quests by category.
          </p>
        </div>

        {/* Your skills section */}
        {userSkills.length > 0 && (
          <div className="px-4 pb-3">
            <div className="text-[9px] uppercase mb-2" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.1em' }}>
              Skills you have
            </div>
            <div className="flex flex-wrap gap-1.5">
              {userSkills.map(sk => {
                const cat = SKILL_CATEGORIES.find(s => s.key === sk)
                return (
                  <span
                    key={sk}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium"
                    style={{ background: 'rgba(200,145,58,0.15)', border: '0.5px solid rgba(200,145,58,0.35)', color: '#C8913A' }}
                  >
                    {cat?.emoji} {cat?.label}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Skill grid */}
        <div className="px-4 pb-2">
          <div className="text-[9px] uppercase mb-2" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.1em' }}>
            {selectedSkill ? 'Tap another to switch, or tap again to deselect' : 'Browse skill categories'}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 px-3 pb-4">
          {SKILL_CATEGORIES.map(cat => {
            const isOwned = userSkills.includes(cat.key)
            const isSelected = selectedSkill === cat.key
            return (
              <div
                key={cat.key}
                className="rounded-[12px] px-2 py-3 text-center cursor-pointer active:scale-[0.96] transition-transform"
                onClick={() => setSelectedSkill(isSelected ? null : cat.key)}
                style={{
                  background: isSelected ? 'rgba(200,145,58,0.15)' : '#162814',
                  border: isSelected
                    ? '1px solid rgba(200,145,58,0.5)'
                    : '0.5px solid rgba(200,145,58,0.12)',
                }}
              >
                <div className="text-[22px] mb-1">{cat.emoji}</div>
                <div className="text-[10px] font-medium" style={{ color: isSelected ? '#C8913A' : '#E8F2E0' }}>
                  {cat.label}
                </div>
                {/* Add/remove skill button */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleSkill(cat.key) }}
                  className="mt-1.5 text-[8px] uppercase font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: isOwned ? 'rgba(200,145,58,0.2)' : 'rgba(232,242,224,0.06)',
                    color: isOwned ? '#C8913A' : 'rgba(232,242,224,0.35)',
                    letterSpacing: '0.04em',
                  }}
                >
                  {isOwned ? 'Added' : '+ Add'}
                </button>
              </div>
            )
          })}
        </div>

        {/* Filtered quests for selected skill */}
        {selectedSkill && (
          <div className="px-3 pb-24">
            <div className="px-1 pb-2 text-[9px] uppercase" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.1em' }}>
              {SKILL_CATEGORIES.find(s => s.key === selectedSkill)?.label} quests ({filteredQuests.length})
            </div>
            {filteredQuests.length === 0 ? (
              <div className="rounded-[14px] px-4 py-8 text-center" style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.12)' }}>
                <p className="text-[11px]" style={{ color: 'rgba(232,242,224,0.35)' }}>
                  No matching quests nearby right now.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredQuests.map(quest => (
                  <div
                    key={quest.id}
                    className="rounded-[14px] px-3.5 py-3 cursor-pointer active:scale-[0.98] transition-transform"
                    onClick={() => onSelectQuest(quest)}
                    style={{ background: '#162814', border: '0.5px solid rgba(200,145,58,0.12)' }}
                  >
                    <div className="text-[9px] font-medium uppercase mb-1" style={{ color: '#C8913A', letterSpacing: '0.08em' }}>
                      {SKILL_CATEGORIES.find(s => s.key === selectedSkill)?.emoji}{' '}
                      {SKILL_CATEGORIES.find(s => s.key === selectedSkill)?.label}
                    </div>
                    <div className="text-[13px] font-medium leading-snug mb-1" style={{ color: '#E8F2E0' }}>
                      {quest.title}
                    </div>
                    <div className="text-[10px]" style={{ color: 'rgba(232,242,224,0.4)' }}>
                      {quest.distance_km.toFixed(1)} km away
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
