/**
 * Full data backup — every table to JSON, on disk, under your control.
 *
 * Why this exists: the Supabase Free plan does not give you downloadable
 * backups. Quests can always be re-scraped, but the Guild tables cannot —
 * `guild_projects`, `guild_scoping_docs` and the Stripe records represent
 * people who actually paid. Those exist nowhere else.
 *
 * Usage:
 *   npx tsx scripts/backup-db.ts
 *
 * Writes to backups/emerge-YYYY-MM-DD-HHMM/ — one .json per table, plus a
 * manifest.json with row counts. The backups/ folder is gitignored: these
 * files contain real names and email addresses and must never be committed.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

// Load .env.local the same way the pipeline scripts do.
const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq === -1) continue
  const key = trimmed.slice(0, eq)
  if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

/**
 * Every table in the public schema. spatial_ref_sys is deliberately excluded:
 * it is 8,500 rows of PostGIS coordinate-system reference data that ships with
 * the extension, not your data.
 *
 * If you add a table, add it here — the script warns about anything it cannot
 * read, so a forgotten table shows up as a loud failure rather than a silent
 * gap in the backup.
 */
const TABLES = [
  // Core app
  'quests', 'profiles', 'quest_participants', 'quest_attendance', 'quest_reports',
  'connected_calendars', 'pipeline_errors', 'email_digest_log',
  // The irreplaceable ones — paid work, real people
  'guild_practitioners', 'guild_practitioner_interviews', 'guild_projects',
  'guild_scoping_docs', 'guild_api_usage', 'guild_pitches',
  'guild_pitch_interviews', 'guild_pitch_matches', 'guild_pitch_watchlist',
  // News feed
  'news_items', 'news_clicks', 'news_resonates', 'news_saves',
  // Learning / quest content
  'learning_quests', 'quest_cards', 'user_quest_progress', 'quest_journal',
  // Misc
  'support_tickets',
]

const PAGE = 1000  // PostgREST caps a single response at 1000 rows

async function dumpTable(name: string): Promise<any[] | null> {
  const rows: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(name)
      .select('*')
      .range(from, from + PAGE - 1)

    if (error) {
      console.error(`  ✗ ${name}: ${error.message}`)
      return null
    }
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE) break
  }
  return rows
}

async function main() {
  const now = new Date()
  const stamp = now.toISOString().slice(0, 16).replace('T', '-').replace(':', '')
  const dir = resolve(process.cwd(), 'backups', `emerge-${stamp}`)
  mkdirSync(dir, { recursive: true })

  console.log(`\n🌱 Backing up Emerge → ${dir}\n`)

  const manifest: Record<string, number | string> = {}
  let totalRows = 0
  let failures = 0

  for (const table of TABLES) {
    const rows = await dumpTable(table)
    if (rows === null) {
      manifest[table] = 'FAILED'
      failures++
      continue
    }
    writeFileSync(resolve(dir, `${table}.json`), JSON.stringify(rows, null, 2))
    manifest[table] = rows.length
    totalRows += rows.length
    console.log(`  ✓ ${table.padEnd(32)} ${rows.length.toLocaleString().padStart(7)} rows`)
  }

  // Auth users live outside the public schema and need the admin API.
  // Without these, the guild_practitioners.user_id links point nowhere.
  try {
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (error) throw error
    writeFileSync(resolve(dir, 'auth_users.json'), JSON.stringify(data.users, null, 2))
    manifest['auth_users'] = data.users.length
    totalRows += data.users.length
    console.log(`  ✓ ${'auth_users'.padEnd(32)} ${data.users.length.toString().padStart(7)} rows`)
  } catch (err: any) {
    console.error(`  ✗ auth_users: ${err.message}`)
    manifest['auth_users'] = 'FAILED'
    failures++
  }

  writeFileSync(
    resolve(dir, 'manifest.json'),
    JSON.stringify({ takenAt: now.toISOString(), totalRows, tables: manifest }, null, 2),
  )

  console.log(`\n${failures === 0 ? '✅' : '⚠️ '} ${totalRows.toLocaleString()} rows across ${TABLES.length + 1} tables`)
  if (failures > 0) {
    console.error(`   ${failures} table(s) FAILED — this backup is incomplete. Check the errors above.`)
    process.exit(1)
  }
  console.log(`   Saved to ${dir}`)
}

main().catch(err => {
  console.error(`\n❌ Backup failed: ${err.message}`)
  process.exit(1)
})
