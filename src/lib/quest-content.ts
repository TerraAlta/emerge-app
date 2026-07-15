/**
 * Quest content model + local seed content.
 *
 * The shapes here mirror the Step 3 Supabase schema so it's a drop-in swap:
 *   quests(id, petal_id, title, description, order_index, xp_reward)
 *   quest_cards(id, quest_id, card_type, content jsonb, order_index)
 *
 * For now the content lives here (the Water petal is authored per the brief);
 * Step 4 migrates this same content into a Supabase seed.
 */

export type CardType = 'concept' | 'challenge' | 'reflection'

/** CONCEPT — a short illustrated explanation with one key idea. */
export interface ConceptContent {
  icon?: string
  heading: string
  body: string
  keyIdea: string
}

export interface Choice { id: string; label: string }

/** CHALLENGE — multiple choice. */
export interface MultipleChoice {
  kind: 'multiple-choice'
  prompt: string
  choices: Choice[]
  answerId: string
  explanation: string
}

/** CHALLENGE — tap-to-arrange into the correct order. `items` are in the
 *  correct order; the UI shuffles them for the user to rebuild. */
export interface ArrangeChallenge {
  kind: 'arrange'
  prompt: string
  items: Choice[]
  fromLabel?: string
  toLabel?: string
  explanation: string
}

export type ChallengeContent = MultipleChoice | ArrangeChallenge

/** REFLECTION — an open prompt saved to the user's journal (no right answer). */
export interface ReflectionContent {
  prompt: string
  placeholder?: string
}

export type CardContent = ConceptContent | ChallengeContent | ReflectionContent

export interface QuestCard {
  id: string
  type: CardType
  orderIndex: number
  content: CardContent
}

export interface Quest {
  id: string
  petalKey: string
  title: string
  description: string
  orderIndex: number
  xpReward: number
  cards: QuestCard[]
}

// ── Seed content ─────────────────────────────────────────────────────────────

export const QUEST_CONTENT: Quest[] = [
  {
    id: 'water-1',
    petalKey: 'water',
    title: 'Water as Teacher',
    description: 'Before you move a single drop, learn to watch it.',
    orderIndex: 0,
    xpReward: 50,
    cards: [
      {
        id: 'water-1-c1', type: 'concept', orderIndex: 0,
        content: {
          icon: '💧',
          heading: 'Water always finds the path of least resistance',
          body: 'Water never fights the land — it reads it. Given any slope it will slide, pool, seep and carve along the lines of least resistance, revealing the shape of the ground better than any map. In permaculture the first move is never to dig; it is to watch where water already wants to go.',
          keyIdea: 'Observe before you intervene.',
        },
      },
      {
        id: 'water-1-c2', type: 'challenge', orderIndex: 1,
        content: {
          kind: 'multiple-choice',
          prompt: 'On a gentle slope, which action harvests rainwater most effectively?',
          choices: [
            { id: 'swale', label: 'Dig a swale on contour' },
            { id: 'bed', label: 'Build a raised bed' },
            { id: 'channel', label: 'Pour a concrete channel' },
            { id: 'pipe', label: 'Lay an irrigation pipe' },
          ],
          answerId: 'swale',
          explanation: 'A swale — a shallow ditch dug level along the contour — catches runoff and lets it soak slowly into the hillside, recharging the soil instead of rushing it away.',
        },
      },
      {
        id: 'water-1-c3', type: 'reflection', orderIndex: 2,
        content: {
          prompt: 'Where does water move on your land or local area after rain? Picture the last downpour and follow it.',
          placeholder: 'After heavy rain, the water in my area tends to…',
        },
      },
    ],
  },
  {
    id: 'water-2',
    petalKey: 'water',
    title: 'Reading the Landscape',
    description: 'Find the invisible lines the water already follows.',
    orderIndex: 1,
    xpReward: 50,
    cards: [
      {
        id: 'water-2-c1', type: 'concept', orderIndex: 0,
        content: {
          icon: '🗺️',
          heading: 'Keyline design & contour mapping',
          body: 'Every landscape has a hidden geometry: ridgelines that shed water and valleys that gather it, joined by the "keypoint" where a slope changes pitch. Keyline design maps these contours and places earthworks along them, spreading water outward from the wet valleys toward the dry ridges.',
          keyIdea: 'Water follows contour — design with the land’s own lines.',
        },
      },
      {
        id: 'water-2-c2', type: 'challenge', orderIndex: 1,
        content: {
          kind: 'arrange',
          prompt: 'Order these features as water meets them, from ridge to valley.',
          fromLabel: 'Ridge (top)',
          toLabel: 'Valley (bottom)',
          items: [
            { id: 'ridgeline', label: 'Ridgeline' },
            { id: 'keypoint', label: 'Keypoint' },
            { id: 'swale', label: 'Contour swale' },
            { id: 'dam', label: 'Valley dam' },
          ],
          explanation: 'Water starts high on the ridgeline, gathers speed to the keypoint where the slope eases, is slowed and spread by a contour swale, and finally collects behind a dam in the valley.',
        },
      },
      {
        id: 'water-2-c3', type: 'reflection', orderIndex: 2,
        content: {
          prompt: 'Sketch or describe the water flows you observed this week — where it gathered, where it ran dry.',
          placeholder: 'This week I noticed water…',
        },
      },
    ],
  },
]

export function questsForPetal(petalKey: string): Quest[] {
  return QUEST_CONTENT
    .filter(q => q.petalKey === petalKey)
    .sort((a, b) => a.orderIndex - b.orderIndex)
}

export function getQuest(questId: string): Quest | undefined {
  return QUEST_CONTENT.find(q => q.id === questId)
}
