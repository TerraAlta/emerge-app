'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Quest } from '@/types/database'

interface NearbyQuest extends Quest { distance_km: number }
interface Props {
  userId: string
  quests: NearbyQuest[]
  onSelectQuest: (quest: NearbyQuest) => void
}

/* ── Full skill taxonomy from the Emerge soul document ── */
const SKILL_SECTIONS = [
  {
    key: 'land', emoji: '\u{1F33F}', title: 'Land & Nature',
    skills: [
      { key: 'grow',       emoji: '\u{1F331}', label: 'Grow',        questTypes: ['nature', 'food'] },
      { key: 'forage',     emoji: '\u{1F344}', label: 'Forage',      questTypes: ['nature', 'food'] },
      { key: 'compost',    emoji: '\u{267B}\u{FE0F}', label: 'Compost',     questTypes: ['nature'] },
      { key: 'seed-save',  emoji: '\u{1F33E}', label: 'Seed Save',   questTypes: ['nature', 'food'] },
      { key: 'rewild',     emoji: '\u{1F3DE}\u{FE0F}', label: 'Rewild',      questTypes: ['nature'] },
      { key: 'prune',      emoji: '\u{2702}\u{FE0F}', label: 'Prune',       questTypes: ['nature'] },
      { key: 'graft',      emoji: '\u{1F333}', label: 'Graft',       questTypes: ['nature'] },
      { key: 'beekeep',    emoji: '\u{1F41D}', label: 'Beekeep',     questTypes: ['nature', 'food'] },
      { key: 'agroforest', emoji: '\u{1F332}', label: 'Agroforest',  questTypes: ['nature'] },
    ],
  },
  {
    key: 'build', emoji: '\u{1F3D7}\u{FE0F}', title: 'Build',
    skills: [
      { key: 'natural-build', emoji: '\u{1F9F1}', label: 'Natural Build',  questTypes: ['craft'] },
      { key: 'cob-adobe',     emoji: '\u{1FAA8}', label: 'Cob & Adobe',    questTypes: ['craft'] },
      { key: 'straw-bale',    emoji: '\u{1F33E}', label: 'Straw Bale',     questTypes: ['craft'] },
      { key: 'timber-frame',  emoji: '\u{1FAB5}', label: 'Timber Frame',   questTypes: ['craft'] },
      { key: 'design',        emoji: '\u{1F4D0}', label: 'Design',         questTypes: ['craft', 'learning'] },
      { key: 'earthworks',    emoji: '\u{26CF}\u{FE0F}', label: 'Earthworks',    questTypes: ['craft', 'nature'] },
    ],
  },
  {
    key: 'tools', emoji: '\u{26A1}', title: 'Tools & Repair',
    skills: [
      { key: 'repair',      emoji: '\u{1F527}', label: 'Repair',        questTypes: ['craft'] },
      { key: 'make',         emoji: '\u{1F528}', label: 'Make',          questTypes: ['craft'] },
      { key: 'sew-mend',    emoji: '\u{1FAA1}', label: 'Sew & Mend',   questTypes: ['craft'] },
      { key: 'bike-fix',    emoji: '\u{1F6B2}', label: 'Bike Fix',     questTypes: ['craft'] },
      { key: 'electronics', emoji: '\u{1F50C}', label: 'Electronics',  questTypes: ['craft'] },
      { key: 'energy',      emoji: '\u{2600}\u{FE0F}', label: 'Energy Systems', questTypes: ['craft'] },
    ],
  },
  {
    key: 'food', emoji: '\u{1F372}', title: 'Food & Kitchen',
    skills: [
      { key: 'cook',         emoji: '\u{1F373}', label: 'Cook',           questTypes: ['food', 'community'] },
      { key: 'ferment',      emoji: '\u{1FAD9}', label: 'Ferment',       questTypes: ['food'] },
      { key: 'brew-press',   emoji: '\u{1F37A}', label: 'Brew & Press',  questTypes: ['food'] },
      { key: 'bake-bread',   emoji: '\u{1F35E}', label: 'Bake Bread',   questTypes: ['food'] },
      { key: 'preserve',     emoji: '\u{1FAD9}', label: 'Preserve',      questTypes: ['food'] },
      { key: 'wild-food',    emoji: '\u{1F33F}', label: 'Wild Food Cook', questTypes: ['food', 'nature'] },
    ],
  },
  {
    key: 'arts', emoji: '\u{1F3AD}', title: 'Arts & Culture',
    skills: [
      { key: 'sing',        emoji: '\u{1F3B5}', label: 'Sing',         questTypes: ['community'] },
      { key: 'drum',        emoji: '\u{1FA98}', label: 'Drum',         questTypes: ['community'] },
      { key: 'facilitate',  emoji: '\u{1F91D}', label: 'Facilitate',   questTypes: ['community', 'learning'] },
      { key: 'theatre',     emoji: '\u{1F3AD}', label: 'Theatre',      questTypes: ['community'] },
      { key: 'storytelling', emoji: '\u{1F4D6}', label: 'Storytelling', questTypes: ['community', 'learning'] },
      { key: 'dance',       emoji: '\u{1F483}', label: 'Dance',        questTypes: ['community', 'wellness'] },
      { key: 'craft',       emoji: '\u{1F9F6}', label: 'Craft',        questTypes: ['craft'] },
      { key: 'weave',       emoji: '\u{1F9F5}', label: 'Weave',        questTypes: ['craft'] },
      { key: 'draw',        emoji: '\u{1F3A8}', label: 'Draw',         questTypes: ['community'] },
    ],
  },
  {
    key: 'care', emoji: '\u{1F338}', title: 'Care & Wellbeing',
    skills: [
      { key: 'birth-support', emoji: '\u{1F476}', label: 'Birth Support',  questTypes: ['wellness', 'community'] },
      { key: 'postnatal',     emoji: '\u{1F49B}', label: 'Postnatal Care', questTypes: ['wellness', 'community'] },
      { key: 'first-aid',     emoji: '\u{1FA79}', label: 'First Aid',     questTypes: ['wellness'] },
      { key: 'grief-hold',    emoji: '\u{1F49A}', label: 'Grief Hold',    questTypes: ['wellness', 'community'] },
      { key: 'mediate',       emoji: '\u{2696}\u{FE0F}', label: 'Mediate',       questTypes: ['wellness', 'community'] },
    ],
  },
  {
    key: 'restore', emoji: '\u{1F527}', title: 'Restore',
    skills: [
      { key: 'restore-land', emoji: '\u{1F33F}', label: 'Restore',       questTypes: ['nature'] },
      { key: 'habitat-work', emoji: '\u{1F426}', label: 'Habitat Work',  questTypes: ['nature'] },
      { key: 'tree-plant',   emoji: '\u{1F333}', label: 'Tree Plant',    questTypes: ['nature'] },
      { key: 'clean-clear',  emoji: '\u{1F9F9}', label: 'Clean & Clear', questTypes: ['nature', 'community'] },
      { key: 'survey',       emoji: '\u{1F50D}', label: 'Survey',        questTypes: ['nature', 'learning'] },
      { key: 'map-skill',    emoji: '\u{1F5FA}\u{FE0F}', label: 'Map',          questTypes: ['nature', 'learning'] },
    ],
  },
  {
    key: 'organise', emoji: '\u{1F91D}', title: 'Organise',
    skills: [
      { key: 'facilitate-org', emoji: '\u{1F4CB}', label: 'Facilitate',     questTypes: ['community'] },
      { key: 'translate',      emoji: '\u{1F310}', label: 'Translate',      questTypes: ['community'] },
      { key: 'cook-many',      emoji: '\u{1F959}', label: 'Cook for Many',  questTypes: ['food', 'community'] },
      { key: 'host',           emoji: '\u{1F3E0}', label: 'Host',           questTypes: ['community'] },
      { key: 'teach',          emoji: '\u{1F4DA}', label: 'Teach',          questTypes: ['learning'] },
      { key: 'interpret',      emoji: '\u{1F5E3}\u{FE0F}', label: 'Interpret',      questTypes: ['community'] },
    ],
  },
  {
    key: 'movements', emoji: '\u{1F30D}', title: 'Movements & Ideas',
    skills: [
      { key: 'ecocide',        emoji: '\u{2696}\u{FE0F}', label: 'Nature Rights',     questTypes: ['community', 'learning'] },
      { key: 'degrowth',       emoji: '\u{1F331}', label: 'Degrowth',         questTypes: ['community', 'learning'] },
      { key: 'doughnut',       emoji: '\u{1F369}', label: 'Doughnut Econ',    questTypes: ['community', 'learning'] },
      { key: 'circular',       emoji: '\u{267B}\u{FE0F}', label: 'Circular Econ',    questTypes: ['craft', 'community'] },
      { key: 'ecofeminist',    emoji: '\u{1F338}', label: 'Ecofeminism',      questTypes: ['community', 'wellness'] },
      { key: 'activist-art',   emoji: '\u{1F3A8}', label: 'Activist Art',     questTypes: ['community'] },
      { key: 'food-sovereign', emoji: '\u{1F33E}', label: 'Food Sovereignty', questTypes: ['food', 'community'] },
      { key: 'localisation',   emoji: '\u{1F3D8}\u{FE0F}', label: 'Localisation',    questTypes: ['community', 'learning'] },
      { key: 'transition',     emoji: '\u{1F504}', label: 'Transition',       questTypes: ['community'] },
    ],
  },
]

// Flatten all skills for lookup
const ALL_SKILLS = SKILL_SECTIONS.flatMap(s => s.skills)

export default function SkillsScreen({ userId, quests, onSelectQuest }: Props) {
  const [userSkills, setUserSkills] = useState<string[]>([])
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('profiles')
        .select('skills')
        .eq('id', userId)
        .single()
      if (data?.skills && Array.isArray(data.skills)) {
        setUserSkills(data.skills as string[])
      }
    }
    load()
  }, [userId])

  const toggleSkill = useCallback(async (skill: string) => {
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
        const sk = ALL_SKILLS.find(s => s.key === selectedSkill)
        return sk ? (sk.questTypes as readonly string[]).includes(q.category) : false
      })
    : []

  return (
    <div className="font-body" style={{ background: '#0D1A0B' }}>
      <div className="w-full">

        {/* ── Intro / Invitation ── */}
        <div className="px-4 pb-2" style={{ paddingTop: 'calc(20px + var(--sat, 0px))' }}>
          <h1 className="font-heading text-[20px] font-light" style={{ color: '#E8F2E0' }}>
            Your <em style={{ color: '#C8913A' }}>Skills</em>
          </h1>
          <p className="font-heading text-[13px] italic mt-1" style={{ color: '#C8913A' }}>
            What can you offer? What do you want to learn?
          </p>
          <p className="text-[11px] mt-2.5 leading-[1.6]" style={{ color: 'rgba(232,242,224,0.55)' }}>
            Skills you add shape the quests Emerge shows you — and tell the community what you bring.
          </p>
          <p className="text-[11px] mt-1 leading-[1.6]" style={{ color: 'rgba(232,242,224,0.45)' }}>
            Every quest is a chance to teach what you know, or learn what you don&apos;t.
          </p>

          {/* Explanation pills */}
          <div className="flex gap-2 mt-3 mb-1">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[9px]"
              style={{ background: 'rgba(200,145,58,0.10)', border: '0.5px solid rgba(200,145,58,0.25)', color: '#C8913A' }}
            >
              🎁 Skills you have — help others
            </span>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[9px]"
              style={{ background: 'rgba(45,90,30,0.25)', border: '0.5px solid rgba(45,90,30,0.5)', color: '#8CB87A' }}
            >
              🌱 Skills you want — find quests
            </span>
          </div>
        </div>

        {/* ── Your skills summary (if any added) ── */}
        {userSkills.length > 0 && (
          <div className="px-4 pt-2 pb-3">
            <div className="text-[9px] uppercase mb-2" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.1em' }}>
              {userSkills.length} skill{userSkills.length !== 1 ? 's' : ''} added
            </div>
            <div className="flex flex-wrap gap-1.5">
              {userSkills.map(sk => {
                const skill = ALL_SKILLS.find(s => s.key === sk)
                if (!skill) return null
                return (
                  <span
                    key={sk}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium cursor-pointer active:scale-95 transition-transform"
                    style={{ background: 'rgba(200,145,58,0.15)', border: '0.5px solid rgba(200,145,58,0.35)', color: '#C8913A' }}
                    onClick={() => setSelectedSkill(selectedSkill === sk ? null : sk)}
                  >
                    {skill.emoji} {skill.label}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Skill sections ── */}
        {SKILL_SECTIONS.map(section => (
          <div key={section.key} className="mb-1">
            {/* Section header */}
            <div className="px-4 pt-3 pb-2">
              <span className="text-[9px] font-semibold uppercase" style={{ color: '#C8913A', letterSpacing: '0.1em' }}>
                {section.emoji} {section.title}
              </span>
            </div>

            {/* Skill cards — 3 per row */}
            <div className="grid grid-cols-3 gap-2 px-3 pb-2">
              {section.skills.map(skill => {
                const isOwned = userSkills.includes(skill.key)
                const isSelected = selectedSkill === skill.key
                return (
                  <div
                    key={skill.key}
                    className="rounded-[12px] px-2 py-2.5 text-center cursor-pointer active:scale-[0.96] transition-all"
                    onClick={() => setSelectedSkill(isSelected ? null : skill.key)}
                    style={{
                      background: isSelected
                        ? 'rgba(200,145,58,0.15)'
                        : isOwned
                          ? 'rgba(200,145,58,0.06)'
                          : '#162814',
                      border: isSelected
                        ? '1px solid rgba(200,145,58,0.5)'
                        : isOwned
                          ? '0.5px solid rgba(200,145,58,0.25)'
                          : '0.5px solid rgba(200,145,58,0.08)',
                      opacity: isOwned || isSelected ? 1 : 0.6,
                    }}
                  >
                    <div className="text-[20px] mb-0.5">{skill.emoji}</div>
                    <div
                      className="text-[9px] font-medium leading-tight"
                      style={{ color: isSelected || isOwned ? '#C8913A' : '#E8F2E0' }}
                    >
                      {skill.label}
                    </div>
                    {/* Add/check button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleSkill(skill.key) }}
                      className="mt-1.5 text-[7px] uppercase font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        background: isOwned ? 'rgba(200,145,58,0.2)' : 'rgba(232,242,224,0.06)',
                        color: isOwned ? '#C8913A' : 'rgba(232,242,224,0.3)',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {isOwned ? '✓ Added' : '+ Add'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* ── Filtered quests for selected skill ── */}
        {selectedSkill && (
          <div className="px-3 pt-2 pb-4">
            <div className="px-1 pb-2 text-[9px] uppercase" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.1em' }}>
              {ALL_SKILLS.find(s => s.key === selectedSkill)?.label} quests ({filteredQuests.length})
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
                      {ALL_SKILLS.find(s => s.key === selectedSkill)?.emoji}{' '}
                      {ALL_SKILLS.find(s => s.key === selectedSkill)?.label}
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
