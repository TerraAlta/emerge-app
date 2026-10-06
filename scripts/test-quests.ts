/**
 * Checks for the Quests learning section (the Flower of Permaculture).
 * Read-only: loads the real curriculum with the public anon key, exactly as a
 * visitor's browser does, then exercises the unlock / XP / bloom logic.
 *
 *   npx tsx scripts/test-quests.ts
 *
 * Costs nothing. Run after adding quests, changing petal prerequisites, or
 * touching quest-progress.ts / quest-petals.ts.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
for (const l of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) { const i=l.indexOf('='); if (i>0 && !l.startsWith('#')) process.env[l.slice(0,i).trim()] ??= l.slice(i+1).trim() }
import { createClient } from '@supabase/supabase-js'
import { deriveProgress, totalXp, questsForPetalIn } from '../src/lib/quest-progress'
import { QUEST_PETALS, bloomFraction } from '../src/lib/quest-petals'
import { QUEST_CONTENT } from '../src/lib/quest-content'
import { FLOWER_PETALS as PETALS } from '../src/lib/flower-petals'

let pass = 0, fail = 0
const ok = (name: string, cond: boolean, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${extra ? ' — ' + extra : ''}`) }

async function main() {
  // Load the real curriculum the way the app does (anon key, same as a visitor)
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [{ data: qs }, { data: cs }] = await Promise.all([
    sb.from('learning_quests').select('*'), sb.from('quest_cards').select('*'),
  ])
  ok('anon visitor can load quests + cards', !!qs?.length && !!cs?.length, `${qs?.length} quests, ${cs?.length} cards`)
  const all = (qs ?? []).map((q: any) => ({ id: q.id, petalKey: q.petal_id, title: q.title, description: q.description, orderIndex: q.order_index, xpReward: q.xp_reward, cards: [] }))

  // Flower consistency with the Guild
  const guildKeys = new Set((PETALS as any[]).map(p => p.key ?? p.id))
  const outer = QUEST_PETALS.filter(p => p.angle !== null).map(p => p.key)
  ok('7 outer petals', outer.length === 7)
  ok('petal keys match Guild flower-petals.ts', outer.every(k => guildKeys.has(k)), outer.filter(k => !guildKeys.has(k)).join(','))
  ok('every petal has at least one quest', QUEST_PETALS.every(p => questsForPetalIn(all, p.key).length > 0))
  ok('every prerequisite points at a real petal', QUEST_PETALS.every(p => p.requires.every(r => QUEST_PETALS.some(x => x.key === r))))

  // Fresh user
  let prog = deriveProgress(new Set(), all)
  ok('fresh user: only Foundations open', QUEST_PETALS.every(p => prog[p.key].status === (p.key === 'ethics' ? 'available' : 'locked')),
     QUEST_PETALS.map(p => `${p.short}:${prog[p.key].status}`).join(' '))
  ok('fresh user: 0 XP, 0 bloom', totalXp(new Set(), all) === 0 && bloomFraction(prog) === 0)

  // Partial Foundations
  const eth = questsForPetalIn(all, 'ethics')
  prog = deriveProgress(new Set([eth[0].id]), all)
  ok('1 Foundations quest: still only centre open', prog['land-nature'].status === 'locked' && prog.ethics.status === 'available')
  ok('1 Foundations quest: progress fraction', Math.abs(prog.ethics.pct - 1 / eth.length) < 1e-9)

  // Foundations done
  const done = new Set(eth.map(q => q.id))
  prog = deriveProgress(done, all)
  const firstRing = QUEST_PETALS.filter(p => p.requires.length === 1 && p.requires[0] === 'ethics').map(p => p.key)
  ok('Foundations done: centre completed', prog.ethics.status === 'completed')
  ok('Foundations done: first-ring petals open', firstRing.every(k => prog[k].status === 'available'), firstRing.join(','))
  ok('Foundations done: Tools + Governance still locked', prog['tools-materials'].status === 'locked' && prog['governance-community'].status === 'locked')

  // Chains
  for (const [parent, child] of [['building-technology', 'tools-materials'], ['finance-economics', 'governance-community']]) {
    const s = new Set([...done, ...questsForPetalIn(all, parent).map(q => q.id)])
    ok(`${parent} done → ${child} opens`, deriveProgress(s, all)[child].status === 'available')
  }

  // Everything
  const every = new Set(all.map(q => q.id))
  prog = deriveProgress(every, all)
  ok('all done: full bloom', bloomFraction(prog) === 1)
  ok('all done: XP = sum of rewards', totalXp(every, all) === all.reduce((s, q) => s + q.xpReward, 0), `${totalXp(every, all)} XP`)

  // Stale/unknown ids don't break anything
  ok('unknown completed ids ignored', totalXp(new Set(['nope']), all) === 0)

  // Offline fallback (used if Supabase is down)
  ok('offline fallback content exists', QUEST_CONTENT.length > 0, `${QUEST_CONTENT.length} quests`)
  const fbProg = deriveProgress(new Set(), QUEST_CONTENT)
  ok('offline fallback: Foundations open (not a dead end)', fbProg.ethics.status === 'available' && questsForPetalIn(QUEST_CONTENT, 'ethics').length > 0)

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
main()
