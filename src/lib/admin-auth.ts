/**
 * Server-side admin auth check.
 *
 * Returns the admin user if the request carries a valid Supabase session
 * whose email is in the admin allowlist. Returns null otherwise.
 */
import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { isAdminEmail } from './admin-emails'

export async function requireAdmin(request: NextRequest): Promise<{ userId: string; email: string } | null> {
  const token =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    request.cookies.get('sb-access-token')?.value

  if (!token) return null

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data, error } = await client.auth.getUser(token)
  if (error || !data?.user?.email) return null

  if (!isAdminEmail(data.user.email)) return null

  return { userId: data.user.id, email: data.user.email }
}
