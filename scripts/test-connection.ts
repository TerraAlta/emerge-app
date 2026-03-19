import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Parse .env.local manually (avoids dotenv version quirks)
const envPath = resolve(process.cwd(), '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIndex = trimmed.indexOf('=')
  if (eqIndex === -1) continue
  const key = trimmed.slice(0, eqIndex)
  const val = trimmed.slice(eqIndex + 1)
  if (!process.env[key]) process.env[key] = val
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anthropicKey = process.env.ANTHROPIC_API_KEY

console.log('\n🔍 Checking environment variables...\n')

const checks = [
  { name: 'NEXT_PUBLIC_SUPABASE_URL', value: url },
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: key },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', value: serviceKey },
  { name: 'ANTHROPIC_API_KEY', value: anthropicKey },
]

let allPresent = true
for (const { name, value } of checks) {
  if (!value || value.includes('your-')) {
    console.log(`  ❌ ${name} — not set`)
    allPresent = false
  } else {
    console.log(`  ✅ ${name} — ${value.slice(0, 12)}...`)
  }
}

if (!allPresent) {
  console.log('\n⚠️  Fill in .env.local with your actual keys before continuing.\n')
  process.exit(1)
}

// Test Supabase connection
console.log('\n🔌 Testing Supabase connection...\n')

const supabase = createClient(url!, key!)

async function testConnection() {
  // Simple query to check connectivity
  const { data, error } = await supabase.from('quests').select('id').limit(1)

  if (error) {
    if (error.message.includes('does not exist') || error.code === '42P01') {
      console.log('  ⚠️  Connection works, but "quests" table not found.')
      console.log('  → Run supabase/schema.sql in the Supabase SQL Editor first.\n')
    } else {
      console.log(`  ❌ Supabase error: ${error.message}\n`)
    }
    return
  }

  console.log(`  ✅ Connected! Found ${data.length} quest(s) in the table.`)

  // Test the nearby_quests function
  const { error: rpcError } = await supabase.rpc('nearby_quests', {
    user_lat: 39.5,
    user_lng: -8.0,
    radius_km: 50,
  })

  if (rpcError) {
    console.log(`  ⚠️  nearby_quests function not found — schema may need to be run.`)
  } else {
    console.log(`  ✅ nearby_quests() RPC working.`)
  }

  console.log('\n🎉 All good! Emerge is ready to go.\n')
}

testConnection()
