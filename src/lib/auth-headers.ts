/**
 * Client-side: headers carrying the signed-in user's session token, for API
 * routes that verify the caller (see src/lib/request-user.ts).
 */
import { supabase } from './supabase'

export async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra
}
