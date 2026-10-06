/**
 * Server-side: who is calling? Reads the Supabase session token from the
 * Authorization header (or the sb-access-token cookie) and returns the
 * verified user id, or null.
 *
 * Use this instead of trusting a `userId` sent in the request body — the
 * 2026-10-06 audit found the Guild AI, submit-event and connect-luma routes
 * accepting any userId, which let anyone use them anonymously and made the
 * Guild spend log fail silently (bogus ids violate its foreign key).
 */
import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

export async function getRequestUserId(request: NextRequest): Promise<string | null> {
  const token =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    request.cookies.get('sb-access-token')?.value
  if (!token) return null
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data, error } = await client.auth.getUser(token)
  if (error) return null
  return data?.user?.id ?? null
}

/** True if `table` has a row with this id owned by `userId` (service-role read). */
export async function ownsRow(table: string, id: string, ownerColumn: string, userId: string): Promise<boolean> {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await admin.from(table).select(ownerColumn).eq('id', id).maybeSingle()
  return !!data && (data as any)[ownerColumn] === userId
}

/** Rough cap on what we send to the AI: transcript + prep context, in characters (~4 chars/token). */
export const MAX_AI_INPUT_CHARS = 100_000

export function aiInputTooLarge(transcript: unknown, extra?: unknown): boolean {
  const size = JSON.stringify(transcript ?? '').length + String(extra ?? '').length
  return size > MAX_AI_INPUT_CHARS
}
