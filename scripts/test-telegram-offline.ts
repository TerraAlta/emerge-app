/**
 * Offline test for Telegram event extraction.
 * Tests the HTML parsing with sample channel HTML.
 * Run: npx tsx scripts/test-telegram-offline.ts
 */
import { VERIFIED_CHANNELS, CANDIDATE_GROUPS } from '../src/pipeline/sources/telegram-channels'

// Sample Telegram channel HTML mimicking t.me/s/<handle> structure
const SAMPLE_HTML = `
<div class="tgme_channel_info">
  <span class="tgme_channel_info_counter">392 subscribers</span>
</div>

<div class="tgme_widget_message_wrap">
  <div class="tgme_widget_message_bubble">
    <div class="tgme_widget_message_text js-message_text" dir="auto">
      🌱 SPRING PLANTING WORKSHOP - Community Food Forest<br/>
      📅 April 5, 2026 at 10:00am<br/>
      📍 Hackney Marshes Community Garden, London<br/>
      Come learn about food forest guilds and plant fruit trees with us!<br/>
      Free, all welcome. Bring gloves.<br/>
      #permaculture #foodforest #volunteer
    </div>
    <div class="tgme_widget_message_date"><time datetime="2026-03-15T14:30:00+00:00"></time></div>
  </div>
</div>

<div class="tgme_widget_message_wrap">
  <div class="tgme_widget_message_bubble">
    <div class="tgme_widget_message_text js-message_text" dir="auto">
      Great article about soil biology and mycorrhizal networks.
      The science of regenerative farming keeps getting stronger.
    </div>
    <div class="tgme_widget_message_date"><time datetime="2026-03-14T09:00:00+00:00"></time></div>
  </div>
</div>

<div class="tgme_widget_message_wrap">
  <div class="tgme_widget_message_bubble">
    <div class="tgme_widget_message_text js-message_text" dir="auto">
      🔧 REPAIR CAFÉ — Saturday March 29, 2026<br/>
      Bring your broken electronics, clothes, bikes.<br/>
      📍 Community Hall, 45 Green Lane, Bristol<br/>
      💰 Free — donations welcome<br/>
      Expert volunteer repairers on hand.
    </div>
    <div class="tgme_widget_message_date"><time datetime="2026-03-13T16:00:00+00:00"></time></div>
  </div>
</div>

<div class="tgme_widget_message_wrap">
  <div class="tgme_widget_message_bubble">
    <div class="tgme_widget_message_text js-message_text" dir="auto">
      🌾 HARVEST FESTIVAL — September 20, 2026<br/>
      Join us for apple pressing, seed swaps, and community feast.<br/>
      📍 Oxford Community Orchard, Headington<br/>
      All ages welcome. Bring a dish to share.
    </div>
    <div class="tgme_widget_message_date"><time datetime="2026-03-12T11:00:00+00:00"></time></div>
  </div>
</div>

<div class="tgme_widget_message_wrap">
  <div class="tgme_widget_message_bubble">
    <div class="tgme_widget_message_text js-message_text" dir="auto">
      Just beautiful morning light on the polytunnel today.
      Seeds are sprouting. Spring is here. 🌿
    </div>
    <div class="tgme_widget_message_date"><time datetime="2026-03-11T08:30:00+00:00"></time></div>
  </div>
</div>

<div class="tgme_widget_message_wrap">
  <div class="tgme_widget_message_bubble">
    <div class="tgme_widget_message_text js-message_text" dir="auto">
      🥾 FORAGING WALK — learn wild garlic, nettles, sorrel<br/>
      When: 2026-04-12 09:00<br/>
      Where: Epping Forest car park, London E4<br/>
      Cost: £5 suggested donation<br/>
      Led by @wildplantjenny — 15 years experience
    </div>
    <div class="tgme_widget_message_date"><time datetime="2026-03-10T19:00:00+00:00"></time></div>
  </div>
</div>

<div class="tgme_widget_message_wrap">
  <div class="tgme_widget_message_bubble">
    <div class="tgme_widget_message_text js-message_text" dir="auto">
      🇩🇪 PERMAKULTUR KURS — Einführung in die Permakultur<br/>
      📅 15. Mai 2026, 10:00 Uhr<br/>
      📍 Prinzessinnengarten, Berlin<br/>
      Kostenlos — Anmeldung erforderlich<br/>
      Ein Tag voller praktischer Übungen im Garten.
    </div>
    <div class="tgme_widget_message_date"><time datetime="2026-03-09T12:00:00+00:00"></time></div>
  </div>
</div>
`

// Simulate the extraction logic from telegram.ts
import { stripHtml, hashStr } from '../src/pipeline/sources/utils'

const EVENT_KEYWORDS = /workshop|event|gathering|meeting|harvest|volunteer|circle|walk|festival|course|open day|skill ?share|repair|swap|planting|seed|ferment|compost|forag|pruni|graft|wassail|drum|choir|sing|danc|theatre|playback|birth|doula|kitchen|cook|feast|orchard|gleaning|apple|cider|bioblitz|clean.?up|restor|kurs/i

const DATE_PATTERNS = [
  /(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2})[:.h](\d{2}))?/,
  /(\d{1,2})[./](\d{1,2})[./](\d{4})/,
  /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i,
  /(\d{1,2})\.\s*(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i,
  /(\d{1,2})\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/i,
  /(\d{1,2})\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})/i,
]

const LOCATION_SIGNALS = [
  /📍\s*(.+)/,
  /📌\s*(.+)/,
  /(?:location|where|lieu|ort|lugar|luogo|local|locatie|onde)[:\s]+(.+)/i,
]

function testExtraction() {
  console.log(`\n🧪 TELEGRAM EXTRACTION TEST (OFFLINE)`)
  console.log(`═══════════════════════════════════════`)

  // Step 1: Channel registry
  console.log(`\n📡 Channel Registry:`)
  console.log(`   Verified channels: ${VERIFIED_CHANNELS.length}`)
  console.log(`   Candidate groups:  ${CANDIDATE_GROUPS.length}`)
  console.log(`   Countries: ${[...new Set(VERIFIED_CHANNELS.map(c => c.country))].join(', ')}`)
  console.log(`   Total subscribers: ${VERIFIED_CHANNELS.reduce((s, c) => s + c.subscribers, 0).toLocaleString()}`)

  // Step 2: Extract messages from sample HTML
  const msgPatterns = [
    /class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g,
    /class="js-message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g,
  ]
  const datePattern = /datetime="([^"]+)"/g

  let msgTexts: string[] = []
  for (const pattern of msgPatterns) {
    msgTexts = [...SAMPLE_HTML.matchAll(pattern)].map(m => stripHtml(m[1]).trim())
    if (msgTexts.length > 0) break
  }

  const msgDates = [...SAMPLE_HTML.matchAll(datePattern)].map(m => m[1])

  console.log(`\n📨 Messages extracted: ${msgTexts.length}`)
  console.log(`   Dates found: ${msgDates.length}`)

  // Step 3: Filter for event-like messages
  let eventCount = 0
  let nonEventCount = 0

  for (let i = 0; i < msgTexts.length; i++) {
    const text = msgTexts[i]
    const isEvent = EVENT_KEYWORDS.test(text)

    // Check for future date in text
    let hasDate = false
    for (const dp of DATE_PATTERNS) {
      if (dp.test(text)) { hasDate = true; break }
    }

    // Extract location
    let location = ''
    for (const lp of LOCATION_SIGNALS) {
      const m = text.match(lp)
      if (m) { location = m[1].trim().slice(0, 80); break }
    }

    if (isEvent && hasDate) {
      eventCount++
      const title = text.split('\n')[0].slice(0, 80)
      console.log(`\n  ✅ EVENT #${eventCount}:`)
      console.log(`     Title: ${title}`)
      console.log(`     Location: ${location || 'not found'}`)
      console.log(`     Posted: ${msgDates[i] || 'unknown'}`)
      console.log(`     Has future date: ${hasDate}`)
      console.log(`     Cost: ${text.toLowerCase().includes('free') || text.toLowerCase().includes('kostenlos') ? 'Free' : 'Unknown'}`)
    } else {
      nonEventCount++
      const reason = !isEvent ? 'no event keywords' : 'no future date'
      console.log(`\n  ⏭️  SKIPPED: "${text.slice(0, 60)}..." (${reason})`)
    }
  }

  // Step 4: Summary
  console.log(`\n\n📊 EXTRACTION SUMMARY`)
  console.log(`───────────────────────────────────────`)
  console.log(`  Messages parsed:    ${msgTexts.length}`)
  console.log(`  Events found:       ${eventCount}`)
  console.log(`  Non-events skipped: ${nonEventCount}`)
  console.log(`  Extraction rate:    ${((eventCount / msgTexts.length) * 100).toFixed(0)}%`)

  // Step 5: Verify expected results
  const expected = 5 // workshop, repair cafe, harvest, foraging, permakultur kurs
  const pass = eventCount >= expected
  console.log(`\n  Expected: ≥${expected} events`)
  console.log(`  Result:   ${pass ? '✅ PASS' : '❌ FAIL'} (${eventCount} events)`)

  console.log(`\n═══════════════════════════════════════`)
  console.log(`Done.\n`)
}

testExtraction()
