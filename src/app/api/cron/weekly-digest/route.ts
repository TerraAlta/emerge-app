import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, isEmailConfigured } from '@/lib/email'
import { buildDigestHtml } from '@/lib/emails/weekly-digest'
import { generateUnsubscribeToken } from '@/lib/unsubscribe-token'

export const maxDuration = 300 // 5 minutes

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isEmailConfigured()) {
    return NextResponse.json({ error: 'Email not configured (GMAIL_USER / GMAIL_APP_PASSWORD missing)' }, { status: 500 })
  }

  const results = { sent: 0, skipped: 0, failed: 0, errors: [] as string[] }

  // 1. Get all opted-in users with saved locations
  const { data: users, error: usersError } = await supabase
    .from('profiles')
    .select('id, first_name, email_digest_enabled, email_digest_radius_km, saved_lat, saved_lng, saved_city')
    .eq('email_digest_enabled', true)
    .not('saved_lat', 'is', null)
    .not('saved_lng', 'is', null)

  if (usersError || !users?.length) {
    return NextResponse.json({ ...results, note: 'No eligible users', error: usersError?.message })
  }

  for (const user of users) {
    try {
      // 2. Check idempotency — skip if already sent in last 24h
      const { data: recentSend } = await supabase
        .from('email_digest_log')
        .select('id')
        .eq('user_id', user.id)
        .gte('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1)

      if (recentSend && recentSend.length > 0) {
        results.skipped++
        continue
      }

      // 3. Get user's email from auth.users
      const { data: authData } = await supabase.auth.admin.getUserById(user.id)
      const email = authData?.user?.email
      if (!email) {
        results.skipped++
        continue
      }

      // 4. Get nearby quests for next 7 days
      const radiusKm = user.email_digest_radius_km ?? 25
      const { data: quests } = await supabase.rpc('nearby_quests', {
        user_lat: user.saved_lat,
        user_lng: user.saved_lng,
        radius_km: radiusKm,
      })

      // Filter to next 7 days only
      const nextWeek = new Date()
      nextWeek.setDate(nextWeek.getDate() + 7)
      const weekQuests = (quests ?? [])
        .filter((q: any) => new Date(q.starts_at) <= nextWeek)
        .slice(0, 5)

      // 5. Skip sending if no quests (avoid empty emails)
      if (weekQuests.length === 0) {
        results.skipped++
        continue
      }

      // 6. Build email
      const token = generateUnsubscribeToken(user.id)
      const unsubscribeUrl = `https://emerge.terralta.org/api/unsubscribe?uid=${user.id}&token=${token}`

      const html = buildDigestHtml({
        firstName: user.first_name || 'Explorer',
        city: user.saved_city || 'your area',
        quests: weekQuests.map((q: any) => ({
          title: q.title,
          category: q.category,
          starts_at: q.starts_at,
          address: q.address,
          distance_km: q.distance_km,
          source_name: q.source_name || 'Emerge',
          source_url: q.source_url,
        })),
        unsubscribeUrl,
      })

      // 7. Send via Gmail SMTP
      const sendResult = await sendEmail({
        to: email,
        subject: `${weekQuests.length} quest${weekQuests.length > 1 ? 's' : ''} near ${user.saved_city || 'you'} this week`,
        html,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      })

      if (!sendResult.ok) {
        results.failed++
        results.errors.push(`${email}: ${sendResult.error}`)
        await supabase.from('email_digest_log').insert({
          user_id: user.id, quest_count: weekQuests.length, status: `error: ${sendResult.error}`,
        })
        continue
      }

      // 8. Log success
      await supabase.from('email_digest_log').insert({
        user_id: user.id, quest_count: weekQuests.length, status: 'sent',
      })
      results.sent++
    } catch (err) {
      results.failed++
      results.errors.push(`${user.id}: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  return NextResponse.json(results)
}
