/**
 * Delete the signed-in user's account and personal data (GDPR right to
 * erasure). Linked from Settings and /privacy.
 *
 * Most user tables cascade from auth.users, but four reference it with NO
 * ACTION and would block the delete (quests.created_by, email_digest_log,
 * quest_reports, guild_api_usage), and a few use SET NULL and would leave
 * data behind (connected_calendars holds Luma API keys). So we clean those
 * first, remove the user's uploaded files, then delete the auth user.
 *
 * Kept (de-identified): events the user posted stay public with no author;
 * Guild AI cost logs and submissions lose their user link.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRequestUserId } from '@/lib/request-user'

const BUCKETS = ['practitioner-photos', 'pitch-images']

export async function POST(request: NextRequest) {
  const userId = await getRequestUserId(request)
  if (!userId) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 })

  const { confirm } = await request.json().catch(() => ({}))
  if (confirm !== 'DELETE') {
    return NextResponse.json({ error: 'Type DELETE to confirm' }, { status: 400 })
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const step = async (label: string, p: PromiseLike<{ error: any }>) => {
    const { error } = await p
    if (error) throw new Error(`${label}: ${error.message}`)
  }

  try {
    // Data that would block or survive the auth delete.
    await step('calendars', db.from('connected_calendars').delete().eq('user_id', userId))
    await step('digest log', db.from('email_digest_log').delete().eq('user_id', userId))
    await step('reports', db.from('quest_reports').update({ reported_by: null }).eq('reported_by', userId))
    await step('ai usage', db.from('guild_api_usage').update({ user_id: null }).eq('user_id', userId))
    await step('posted events', db.from('quests').update({ created_by: null }).eq('created_by', userId))

    // Uploaded files live under `${userId}/…` in each bucket.
    for (const bucket of BUCKETS) {
      const { data: files } = await db.storage.from(bucket).list(userId, { limit: 1000 })
      if (files?.length) {
        await db.storage.from(bucket).remove(files.map(f => `${userId}/${f.name}`))
      }
    }

    // Cascades: profile, journal, progress, joins, attendance, news saves,
    // Guild practitioner profile, projects, pitches, watchlist.
    const { error } = await db.auth.admin.deleteUser(userId)
    if (error) throw new Error(`auth: ${error.message}`)
  } catch (err: any) {
    console.error('[account-delete]', userId, err?.message)
    return NextResponse.json(
      { error: 'Something went wrong deleting your account. Please email terraalta.sintra@gmail.com and we will do it by hand.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true })
}
