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
    key: 'land', emoji: '🌿', title: 'Land & Nature',
    skills: [
      { key: 'grow', emoji: '🌱', label: 'Grow', questTypes: ['nature', 'food'] },
      { key: 'forage', emoji: '🍄', label: 'Forage', questTypes: ['nature', 'food'] },
      { key: 'compost', emoji: '♻️', label: 'Compost', questTypes: ['nature'] },
      { key: 'seed-save', emoji: '🌾', label: 'Seed Save', questTypes: ['nature', 'food'] },
      { key: 'rewild', emoji: '🏞️', label: 'Rewild', questTypes: ['nature'] },
      { key: 'prune', emoji: '✂️', label: 'Prune', questTypes: ['nature'] },
      { key: 'graft', emoji: '🌳', label: 'Graft', questTypes: ['nature'] },
      { key: 'beekeep', emoji: '🐝', label: 'Beekeep', questTypes: ['nature', 'food'] },
      { key: 'agroforest', emoji: '🌲', label: 'Agroforest', questTypes: ['nature'] },
    ],
  },
  {
    key: 'build', emoji: '🏗️', title: 'Build',
    skills: [
      { key: 'natural-build', emoji: '🧱', label: 'Natural Build', questTypes: ['craft'] },
      { key: 'cob-adobe', emoji: '🪨', label: 'Cob & Adobe', questTypes: ['craft'] },
      { key: 'straw-bale', emoji: '🌾', label: 'Straw Bale', questTypes: ['craft'] },
      { key: 'timber-frame', emoji: '🪵', label: 'Timber Frame', questTypes: ['craft'] },
      { key: 'design', emoji: '📐', label: 'Design', questTypes: ['craft', 'learning'] },
      { key: 'earthworks', emoji: '⛏️', label: 'Earthworks', questTypes: ['craft', 'nature'] },
    ],
  },
  {
    key: 'tools', emoji: '⚡', title: 'Tools & Repair',
    skills: [
      { key: 'repair', emoji: '🔧', label: 'Repair', questTypes: ['craft'] },
      { key: 'make-things', emoji: '🔨', label: 'Make', questTypes: ['craft'] },
      { key: 'sew-mend', emoji: '🪡', label: 'Sew & Mend', questTypes: ['craft'] },
      { key: 'bike-fix', emoji: '🚲', label: 'Bike Fix', questTypes: ['craft'] },
      { key: 'electronics', emoji: '🔌', label: 'Electronics', questTypes: ['craft'] },
      { key: 'energy', emoji: '☀️', label: 'Energy Systems', questTypes: ['craft'] },
    ],
  },
  {
    key: 'food', emoji: '🍲', title: 'Food & Kitchen',
    skills: [
      { key: 'cook', emoji: '🍳', label: 'Cook', questTypes: ['food', 'community', 'feast'] },
      { key: 'ferment', emoji: '🫙', label: 'Ferment', questTypes: ['food'] },
      { key: 'brew-press', emoji: '🍺', label: 'Brew & Press', questTypes: ['food'] },
      { key: 'bake-bread', emoji: '🍞', label: 'Bake Bread', questTypes: ['food'] },
      { key: 'preserve', emoji: '🫙', label: 'Preserve', questTypes: ['food'] },
      { key: 'wild-food', emoji: '🌿', label: 'Wild Food Cook', questTypes: ['food', 'nature'] },
    ],
  },
  {
    key: 'arts', emoji: '🎭', title: 'Arts & Culture',
    skills: [
      { key: 'sing', emoji: '🎵', label: 'Sing', questTypes: ['community', 'play'] },
      { key: 'drum', emoji: '🪘', label: 'Drum', questTypes: ['community', 'play'] },
      { key: 'facilitate', emoji: '🤝', label: 'Facilitate', questTypes: ['community', 'learning'] },
      { key: 'theatre', emoji: '🎭', label: 'Theatre', questTypes: ['community', 'play'] },
      { key: 'storytelling', emoji: '📖', label: 'Storytelling', questTypes: ['community', 'learning'] },
      { key: 'dance', emoji: '💃', label: 'Dance', questTypes: ['community', 'wellness', 'play'] },
      { key: 'craft-art', emoji: '🧶', label: 'Craft', questTypes: ['craft', 'make'] },
      { key: 'weave', emoji: '🧵', label: 'Weave', questTypes: ['craft', 'make'] },
      { key: 'draw', emoji: '🎨', label: 'Draw', questTypes: ['community', 'make'] },
    ],
  },
  {
    key: 'care', emoji: '🌸', title: 'Care & Wellbeing',
    skills: [
      { key: 'birth-support', emoji: '👶', label: 'Birth Support', questTypes: ['wellness', 'community'] },
      { key: 'postnatal', emoji: '💛', label: 'Postnatal Care', questTypes: ['wellness', 'community'] },
      { key: 'first-aid', emoji: '🩹', label: 'First Aid', questTypes: ['wellness'] },
      { key: 'grief-hold', emoji: '💚', label: 'Grief Hold', questTypes: ['wellness', 'community'] },
      { key: 'mediate', emoji: '⚖️', label: 'Mediate', questTypes: ['wellness', 'community'] },
    ],
  },
  {
    key: 'restore', emoji: '🔧', title: 'Restore',
    skills: [
      { key: 'restore-land', emoji: '🌿', label: 'Restore', questTypes: ['nature'] },
      { key: 'habitat-work', emoji: '🐦', label: 'Habitat Work', questTypes: ['nature'] },
      { key: 'tree-plant', emoji: '🌳', label: 'Tree Plant', questTypes: ['nature'] },
      { key: 'clean-clear', emoji: '🧹', label: 'Clean & Clear', questTypes: ['nature', 'community'] },
      { key: 'survey', emoji: '🔍', label: 'Survey', questTypes: ['nature', 'learning'] },
      { key: 'map-skill', emoji: '🗺️', label: 'Map', questTypes: ['nature', 'learning'] },
    ],
  },
  {
    key: 'organise', emoji: '🤝', title: 'Organise',
    skills: [
      { key: 'facilitate-org', emoji: '📋', label: 'Facilitate', questTypes: ['community'] },
      { key: 'translate', emoji: '🌐', label: 'Translate', questTypes: ['community'] },
      { key: 'cook-many', emoji: '🥙', label: 'Cook for Many', questTypes: ['food', 'community', 'feast'] },
      { key: 'host', emoji: '🏠', label: 'Host', questTypes: ['community'] },
      { key: 'teach', emoji: '📚', label: 'Teach', questTypes: ['learning'] },
      { key: 'interpret', emoji: '🗣️', label: 'Interpret', questTypes: ['community'] },
    ],
  },
  {
    key: 'movements', emoji: '🌍', title: 'Movements & Ideas',
    skills: [
      { key: 'ecocide', emoji: '⚖️', label: 'Nature Rights', questTypes: ['community', 'learning'] },
      { key: 'degrowth', emoji: '🌱', label: 'Degrowth', questTypes: ['community', 'learning'] },
      { key: 'doughnut', emoji: '🍩', label: 'Doughnut Econ', questTypes: ['community', 'learning'] },
      { key: 'circular', emoji: '♻️', label: 'Circular Econ', questTypes: ['craft', 'community'] },
      { key: 'ecofeminist', emoji: '🌸', label: 'Ecofeminism', questTypes: ['community', 'wellness'] },
      { key: 'activist-art', emoji: '🎨', label: 'Activist Art', questTypes: ['community', 'make'] },
      { key: 'food-sovereign', emoji: '🌾', label: 'Food Sovereignty', questTypes: ['food', 'community'] },
      { key: 'localisation', emoji: '🏘️', label: 'Localisation', questTypes: ['community', 'learning'] },
      { key: 'transition', emoji: '🔄', label: 'Transition', questTypes: ['community'] },
    ],
  },
]

const ALL_SKILLS = SKILL_SECTIONS.flatMap(s => s.skills)

type SkillState = 'have' | 'want'

export default function SkillsScreen({ userId, quests, onSelectQuest }: Props) {
  const [skillsHave, setSkillsHave] = useState<string[]>([])
  const [skillsWant, setSkillsWant] = useState<string[]>([])
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)
  const [tappedSkill, setTappedSkill] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('profiles')
        .select('skills_have, skills_want')
        .eq('id', userId)
        .single()
      if (data?.skills_have && Array.isArray(data.skills_have)) setSkillsHave(data.skills_have)
      if (data?.skills_want && Array.isArray(data.skills_want)) setSkillsWant(data.skills_want)
    }
    load()
  }, [userId])

  const setSkillState = useCallback(async (skill: string, state: SkillState | null) => {
    let newHave = skillsHave.filter(s => s !== skill)
    let newWant = skillsWant.filter(s => s !== skill)

    if (state === 'have') newHave.push(skill)
    if (state === 'want') newWant.push(skill)

    setSkillsHave(newHave)
    setSkillsWant(newWant)
    setTappedSkill(null)

    await supabase
      .from('profiles')
      .update({ skills_have: newHave, skills_want: newWant })
      .eq('id', userId)
  }, [skillsHave, skillsWant, userId])

  const totalSkills = skillsHave.length + skillsWant.length

  // Filter quests by selected skill
  const filteredQuests = selectedSkill
    ? quests.filter(q => {
        const sk = ALL_SKILLS.find(s => s.key === selectedSkill)
        return sk ? (sk.questTypes as readonly string[]).includes(q.category) : false
      })
    : []

  return (
    <div className="font-body" style={{ background: '#0D1A0B' }}>
      <div className="w-full">

        {/* Intro */}
        <div className="px-4 pb-2" style={{ paddingTop: 'calc(20px + var(--sat, 0px))' }}>
          <h1 className="font-heading text-[20px] font-light" style={{ color: '#E8F2E0' }}>
            Your <em style={{ color: '#C8913A' }}>Skills</em>
          </h1>
          <p className="font-heading text-[13px] italic mt-1" style={{ color: '#C8913A' }}>
            What can you offer? What do you want to learn?
          </p>
          <p className="text-[11px] mt-2.5 leading-[1.6]" style={{ color: 'rgba(232,242,224,0.55)' }}>
            Tap any skill, then choose: <strong style={{ color: '#C8913A' }}>I have this</strong> or <strong style={{ color: '#8CB87A' }}>I want to learn</strong>.
          </p>
          <p className="text-[11px] mt-1 leading-[1.6]" style={{ color: 'rgba(232,242,224,0.4)' }}>
            People joining the same quest can see your skills. Organisers can plan better.
          </p>

          {/* Legend pills */}
          <div className="flex gap-2 mt-3 mb-1">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[9px]"
              style={{ background: 'rgba(200,145,58,0.10)', border: '0.5px solid rgba(200,145,58,0.25)', color: '#C8913A' }}
            >
              I have this
            </span>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[9px]"
              style={{ background: 'rgba(45,90,30,0.25)', border: '0.5px solid rgba(45,90,30,0.5)', color: '#8CB87A' }}
            >
              I want to learn
            </span>
          </div>
        </div>

        {/* Your skills summary */}
        {totalSkills > 0 && (
          <div className="px-4 pt-2 pb-3">
            <div className="text-[9px] uppercase mb-2" style={{ color: 'rgba(232,242,224,0.35)', letterSpacing: '0.1em' }}>
              {totalSkills} skill{totalSkills !== 1 ? 's' : ''} added
            </div>
            <div className="flex flex-wrap gap-1.5">
              {skillsHave.map(sk => {
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
              {skillsWant.map(sk => {
                const skill = ALL_SKILLS.find(s => s.key === sk)
                if (!skill) return null
                return (
                  <span
                    key={sk}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium cursor-pointer active:scale-95 transition-transform"
                    style={{ background: 'rgba(45,90,30,0.2)', border: '0.5px solid rgba(45,90,30,0.4)', color: '#8CB87A' }}
                    onClick={() => setSelectedSkill(selectedSkill === sk ? null : sk)}
                  >
                    {skill.emoji} {skill.label}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Skill sections */}
        {SKILL_SECTIONS.map(section => (
          <div key={section.key} className="mb-1">
            <div className="px-4 pt-3 pb-2">
              <span className="text-[9px] font-semibold uppercase" style={{ color: '#C8913A', letterSpacing: '0.1em' }}>
                {section.emoji} {section.title}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 px-3 pb-2">
              {section.skills.map(skill => {
                const isHave = skillsHave.includes(skill.key)
                const isWant = skillsWant.includes(skill.key)
                const isSelected = selectedSkill === skill.key
                const isTapped = tappedSkill === skill.key

                return (
                  <div key={skill.key} className="relative">
                    <div
                      className="rounded-[12px] px-2 py-2.5 text-center cursor-pointer active:scale-[0.96] transition-all"
                      onClick={() => {
                        if (isHave || isWant) {
                          // Already set — tap toggles off
                          setSkillState(skill.key, null)
                        } else {
                          // Not set — show have/want picker
                          setTappedSkill(isTapped ? null : skill.key)
                        }
                      }}
                      style={{
                        background: isSelected
                          ? 'rgba(200,145,58,0.15)'
                          : isHave
                            ? 'rgba(200,145,58,0.08)'
                            : isWant
                              ? 'rgba(45,90,30,0.15)'
                              : '#162814',
                        border: isSelected
                          ? '1px solid rgba(200,145,58,0.5)'
                          : isHave
                            ? '0.5px solid rgba(200,145,58,0.3)'
                            : isWant
                              ? '0.5px solid rgba(45,90,30,0.4)'
                              : '0.5px solid rgba(200,145,58,0.08)',
                        opacity: isHave || isWant || isSelected || isTapped ? 1 : 0.6,
                      }}
                    >
                      <div className="text-[20px] mb-0.5">{skill.emoji}</div>
                      <div
                        className="text-[9px] font-medium leading-tight"
                        style={{ color: isHave ? '#C8913A' : isWant ? '#8CB87A' : '#E8F2E0' }}
                      >
                        {skill.label}
                      </div>
                      {/* State indicator */}
                      {isHave && (
                        <div className="mt-1 text-[7px] uppercase font-semibold px-2 py-0.5 rounded-full inline-block"
                          style={{ background: 'rgba(200,145,58,0.2)', color: '#C8913A', letterSpacing: '0.04em' }}>
                          I have
                        </div>
                      )}
                      {isWant && (
                        <div className="mt-1 text-[7px] uppercase font-semibold px-2 py-0.5 rounded-full inline-block"
                          style={{ background: 'rgba(45,90,30,0.3)', color: '#8CB87A', letterSpacing: '0.04em' }}>
                          Want
                        </div>
                      )}
                      {!isHave && !isWant && (
                        <div className="mt-1 text-[7px] uppercase font-semibold px-2 py-0.5 rounded-full inline-block"
                          style={{ background: 'rgba(232,242,224,0.06)', color: 'rgba(232,242,224,0.3)', letterSpacing: '0.04em' }}>
                          + Add
                        </div>
                      )}
                    </div>

                    {/* Have/Want picker popup */}
                    {isTapped && (
                      <div
                        className="absolute -bottom-1 left-1/2 -translate-x-1/2 translate-y-full z-20 flex gap-1 p-1.5 rounded-[10px]"
                        style={{ background: 'rgba(10,20,10,0.97)', border: '0.5px solid rgba(200,145,58,0.3)', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); setSkillState(skill.key, 'have') }}
                          className="px-3 py-1.5 rounded-full text-[9px] font-semibold whitespace-nowrap"
                          style={{ background: 'rgba(200,145,58,0.15)', color: '#C8913A', border: '0.5px solid rgba(200,145,58,0.3)' }}
                        >
                          I have this
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSkillState(skill.key, 'want') }}
                          className="px-3 py-1.5 rounded-full text-[9px] font-semibold whitespace-nowrap"
                          style={{ background: 'rgba(45,90,30,0.2)', color: '#8CB87A', border: '0.5px solid rgba(45,90,30,0.4)' }}
                        >
                          Want to learn
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* Filtered quests for selected skill */}
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
