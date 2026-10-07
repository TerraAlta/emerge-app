import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Claim the right to send one admin notification of `kind` about `refId`.
 * Returns false if one was already sent within `withinHours` — so a route
 * called in a loop sends at most one email per window instead of flooding
 * the inbox and the Gmail daily quota. Fails open (sends) only if the log
 * table can't be read, since missing a real review request is worse.
 */
export async function claimNotification(
  supabase: SupabaseClient,
  kind: string,
  refId: string,
  withinHours = 24,
): Promise<boolean> {
  const since = new Date(Date.now() - withinHours * 3600_000).toISOString()
  const { data, error } = await supabase
    .from('guild_admin_notifications')
    .select('sent_at')
    .eq('kind', kind)
    .eq('ref_id', refId)
    .gte('sent_at', since)
    .limit(1)
  if (error) { console.warn('[notify-once] check failed:', error.message); return true }
  if (data?.length) return false
  await supabase
    .from('guild_admin_notifications')
    .upsert({ kind, ref_id: refId, sent_at: new Date().toISOString() }, { onConflict: 'kind,ref_id' })
  return true
}
