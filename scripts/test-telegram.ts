/**
 * Test Telegram source — scrape public channels and show results.
 * Run: npx tsx scripts/test-telegram.ts
 */
import 'dotenv/config'
import { telegram } from '../src/pipeline/sources/telegram'
import { TELEGRAM_CHANNELS } from '../src/pipeline/sources/telegram-channels'

async function main() {
  console.log(`\n📡 TELEGRAM SOURCE TEST`)
  console.log(`═══════════════════════════════════════`)
  console.log(`Configured channels: ${TELEGRAM_CHANNELS.length}`)
  console.log(`Countries: ${[...new Set(TELEGRAM_CHANNELS.map(c => c.country))].join(', ')}`)
  console.log(`Bot token: ${process.env.TELEGRAM_BOT_TOKEN ? '✅ set' : '❌ not set'}\n`)

  // Test with London coords
  const events = await telegram.fetch({
    lat: 51.5074,
    lng: -0.1278,
    radiusKm: 50,
  })

  console.log(`\n📊 RESULTS`)
  console.log(`───────────────────────────────────────`)
  console.log(`Total events extracted: ${events.length}`)

  if (events.length === 0) {
    console.log(`\n⚠️  No events found. This is normal if:`)
    console.log(`   - Channel handles don't exist yet (need verification)`)
    console.log(`   - Channels have no recent event posts with future dates`)
    console.log(`   - t.me/s/ previews are blocked for some channels\n`)

    // Show which channels were reachable
    console.log(`\n🔍 CHANNEL REACHABILITY TEST`)
    console.log(`───────────────────────────────────────`)
    const sample = TELEGRAM_CHANNELS.slice(0, 5)
    for (const ch of sample) {
      try {
        const res = await fetch(`https://t.me/s/${ch.handle}`, {
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': 'Mozilla/5.0' },
        })
        const html = await res.text()
        const hasMessages = html.includes('tgme_widget_message')
        const msgCount = (html.match(/tgme_widget_message_wrap/g) || []).length
        console.log(`  ${res.ok ? '✅' : '❌'} @${ch.handle} — ${res.status} — ${msgCount} messages visible — ${hasMessages ? 'PUBLIC' : 'PRIVATE/EMPTY'}`)
      } catch (e) {
        console.log(`  ❌ @${ch.handle} — ${(e as Error).message}`)
      }
    }
  } else {
    // Show events grouped by channel
    const bySource = new Map<string, typeof events>()
    for (const e of events) {
      const key = e.source_url || 'bot'
      if (!bySource.has(key)) bySource.set(key, [])
      bySource.get(key)!.push(e)
    }

    for (const [source, sourceEvents] of bySource) {
      console.log(`\n  📢 ${source} (${sourceEvents.length} events)`)
      for (const e of sourceEvents.slice(0, 3)) {
        console.log(`    • ${e.title.slice(0, 80)}`)
        console.log(`      📅 ${e.starts_at} | 📍 ${e.location_name} | 💰 ${e.cost}`)
      }
      if (sourceEvents.length > 3) {
        console.log(`    ... and ${sourceEvents.length - 3} more`)
      }
    }
  }

  // Test bot separately if token exists
  if (process.env.TELEGRAM_BOT_TOKEN) {
    console.log(`\n\n🤖 BOT POLLING TEST`)
    console.log(`───────────────────────────────────────`)
    try {
      const meRes = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`)
      const me = await meRes.json() as { ok: boolean; result?: { username: string; first_name: string } }
      if (me.ok && me.result) {
        console.log(`  Bot: @${me.result.username} (${me.result.first_name})`)
        console.log(`  Status: ✅ Token valid`)
        console.log(`  Add this bot to your community channels to receive /quest commands`)
      } else {
        console.log(`  ❌ Token invalid`)
      }
    } catch (e) {
      console.log(`  ❌ Connection failed: ${(e as Error).message}`)
    }
  }

  console.log(`\n═══════════════════════════════════════`)
  console.log(`Done.\n`)
}

main().catch(console.error)
