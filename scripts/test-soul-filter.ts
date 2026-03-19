import { readFileSync } from 'fs'
import { resolve } from 'path'

const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIndex = trimmed.indexOf('=')
  if (eqIndex === -1) continue
  if (!process.env[trimmed.slice(0, eqIndex)]) process.env[trimmed.slice(0, eqIndex)] = trimmed.slice(eqIndex + 1)
}

import { scoreQuest } from '../src/pipeline/score-quest'

const testEvents = [
  // ECOCIDE MOVEMENT
  { group: 'ECOCIDE', expect: 'HIGH',
    title: 'Rights of Nature citizen assembly — drafting our river charter',
    description: 'Community assembly to draft a legal charter recognising the rights of the Tejo river. Facilitated by environmental lawyers. Open to all residents. Followed by a riverside celebration with food and music.',
    location: 'Lisbon, Portugal' },
  { group: 'ECOCIDE', expect: 'LOW',
    title: 'Stop Ecocide political fundraiser dinner',
    description: 'Formal dinner with keynote speeches by party politicians. Tickets €150. Dress code: black tie.',
    location: 'Brussels, Belgium' },

  // DEGROWTH
  { group: 'DEGROWTH', expect: 'HIGH',
    title: 'Time bank launch — exchange skills not money',
    description: 'Launch of a neighbourhood time bank. Bring one skill you can teach, learn one from a neighbour. Cooking, languages, bike repair, garden help. Everyone has something to offer. Free, tea and cake provided.',
    location: 'Amsterdam, Netherlands' },
  { group: 'DEGROWTH', expect: 'LOW',
    title: 'International degrowth theory conference',
    description: 'Three-day academic conference with 200 paper presentations on post-growth economics. Registration €280. At university campus lecture halls.',
    location: 'Barcelona, Spain' },

  // DOUGHNUT ECONOMICS
  { group: 'DOUGHNUT', expect: 'HIGH',
    title: 'DEAL local circle — designing our neighbourhood economy',
    description: 'Monthly meetup of the Doughnut Economics Action Lab local circle. Citizens mapping what thriving looks like in our neighbourhood. Identifying gaps between social foundation and ecological ceiling. Bring food to share.',
    location: 'Amsterdam, Netherlands' },
  { group: 'DOUGHNUT', expect: 'LOW',
    title: 'Corporate ESG reporting masterclass',
    description: 'Learn to write sustainability reports that satisfy investor requirements. Hosted by PwC. Registration €500. Lunch included.',
    location: 'London, UK' },

  // CIRCULAR ECONOMY
  { group: 'CIRCULAR', expect: 'HIGH',
    title: 'Community swap party + repair café',
    description: 'Bring clothes, books, tools, electronics you no longer need. Swap with neighbours. Repair station with volunteer fixers. Community composting workshop. Zero waste snacks. Free entry, all welcome.',
    location: 'Berlin, Germany' },
  { group: 'CIRCULAR', expect: 'LOW',
    title: 'Nestlé circular packaging innovation summit',
    description: 'Corporate showcase of new recyclable packaging solutions. Sponsored by major FMCG brands. Conference centre. Registration required.',
    location: 'Geneva, Switzerland' },

  // ECOFEMINIST
  { group: 'ECOFEMINIST', expect: 'HIGH',
    title: 'Women and land — wild foraging and story circle',
    description: 'A morning of guided foraging through the forest, learning to identify medicinal herbs and edible plants. Afternoon: circle sharing stories of our relationship with land. Bring a blanket and something to share. All women and non-binary people welcome.',
    location: 'Sintra, Portugal' },
  { group: 'ECOFEMINIST', expect: 'LOW',
    title: 'Gender and ecology academic symposium',
    description: 'Day-long symposium with 15 academic papers on ecofeminism theory. University auditorium. Attendance limited to registered scholars. €45 registration.',
    location: 'Paris, France' },

  // ACTIVIST ART
  { group: 'ART', expect: 'HIGH',
    title: 'Community mural painting — our river, our story',
    description: 'Collaborative mural painting on the riverside wall. Local artists lead, everyone paints. Depicting the river ecosystem and community stories. Materials provided. Bring your creativity. Free, all ages.',
    location: 'Porto, Portugal' },
  { group: 'ART', expect: 'LOW',
    title: 'Contemporary art gallery opening — corporate collection',
    description: 'Private view of new corporate art collection. Champagne reception. By invitation only.',
    location: 'London, UK' },

  // TRADITIONAL (control group)
  { group: 'TRADITIONAL', expect: 'HIGH',
    title: 'Community food forest planting day',
    description: 'Help us plant 50 fruit trees in the new community food forest. All ages welcome. Tools provided. Shared lunch from the community garden.',
    location: 'Bristol, UK' },
  { group: 'TRADITIONAL', expect: 'LOW',
    title: 'iPhone 19 launch event',
    description: 'Be first to see the new iPhone. DJ, free cocktails, influencer meet-and-greet. Sponsored by Apple.',
    location: 'New York, USA' },
]

async function main() {
  console.log('\n\u{1F331} Emerge Soul Filter Test \u2014 Expanded Movements\n')

  let correct = 0
  let total = testEvents.length

  for (const event of testEvents) {
    try {
      const scored = await scoreQuest({ title: event.title, description: event.description, location: event.location })
      const isHigh = scored.ai_score >= 60
      const expected = event.expect === 'HIGH'
      const pass = isHigh === expected

      if (pass) correct++

      const bar = '\u2588'.repeat(Math.round(scored.ai_score / 5)) + '\u2591'.repeat(20 - Math.round(scored.ai_score / 5))
      const icon = pass ? '\u2705' : '\u274C'

      console.log(`${icon} [${event.group.padEnd(12)}] ${event.expect.padEnd(4)} | ${scored.ai_score}/100 [${bar}] [${scored.category}]`)
      console.log(`   "${event.title.slice(0, 65)}"`)
      console.log(`   ${scored.ai_reasoning}`)
      console.log()
    } catch (err) {
      console.log(`\u26A0\uFE0F  [${event.group}] Error: ${(err as Error).message.slice(0, 60)}`)
      console.log()
    }
  }

  console.log('\u2500'.repeat(65))
  console.log(`\u{1F4CA} ACCURACY: ${correct}/${total} (${Math.round(correct / total * 100)}%)`)
  console.log(`   High-regen events correctly scored high: ${testEvents.filter(e => e.expect === 'HIGH').length} tested`)
  console.log(`   Low-regen events correctly scored low: ${testEvents.filter(e => e.expect === 'LOW').length} tested\n`)
}

main().catch(console.error)
