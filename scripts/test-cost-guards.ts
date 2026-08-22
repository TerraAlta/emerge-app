import { costTracker, CostCapExceeded, DAILY_CRON_CAP_USD, NEWS_CRON_CAP_USD } from '../src/pipeline/cost-cap'
import { isPotentiallyRelevant } from '../src/pipeline/pre-filter'

let pass = 0, fail = 0
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}`) }
}

console.log('caps:', { DAILY_CRON_CAP_USD, NEWS_CRON_CAP_USD })

// 1. reset zeroes counters and applies the new cap
costTracker.reset(NEWS_CRON_CAP_USD)
check('reset zeroes spend', costTracker.totalUsd === 0 && costTracker.calls === 0)
check('reset applies cap', costTracker.capUsd === NEWS_CRON_CAP_USD)

// 2. normal usage accumulates without throwing
costTracker.recordHaiku({ input_tokens: 1000, output_tokens: 150, cache_read_input_tokens: 2000 })
check('records a call', costTracker.calls === 1 && costTracker.totalUsd > 0)
const afterOne = costTracker.totalUsd

// 3. the cap actually throws
let threw = false
try {
  for (let i = 0; i < 100_000; i++) {
    costTracker.recordHaiku({ input_tokens: 10_000, output_tokens: 2_000 })
  }
} catch (e) { threw = e instanceof CostCapExceeded }
check('throws CostCapExceeded past budget', threw)
check('stopped near the cap, not far past it', costTracker.totalUsd < NEWS_CRON_CAP_USD * 1.1)

// 4. THE serverless bug: a second run must start clean
costTracker.reset(DAILY_CRON_CAP_USD)
check('reset recovers a tripped tracker', costTracker.totalUsd === 0)
let threwAgain = false
try { costTracker.recordHaiku({ input_tokens: 1000, output_tokens: 150 }) }
catch { threwAgain = true }
check('warm instance can score again after reset', !threwAgain)

// 5. pre-filter really does gate bulk junk
const junk = [
  { title: 'Blockchain Startup Pitch Night', description: 'crypto NFT venture capital' },
  { title: 'Luxury Yacht Networking Mixer', description: '' },
  { title: 'Milano Fashion Aperitivo', description: 'drinks and music' },
]
const keep = [
  { title: 'LA MAGIA DEL COMPOST', description: 'come creare fertilita dai tuoi scarti' },
  { title: 'Repair Café Greenbizz', description: 'bring your broken things' },
  { title: 'Orto comunitario: giornata aperta', description: '' },
]
check('drops irrelevant events', junk.every(e => !isPotentiallyRelevant(e)))
check('keeps aligned events (incl. Italian)', keep.every(e => isPotentiallyRelevant(e)))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
