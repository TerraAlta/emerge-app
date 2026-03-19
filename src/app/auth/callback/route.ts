import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const token_hash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type')

  const origin = requestUrl.origin

  if (token_hash && type) {
    // Email confirmation via token hash (PKCE flow)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'signup' | 'recovery' | 'invite' | 'email',
    })
    if (error) {
      return NextResponse.redirect(`${origin}?error=auth_callback_error`)
    }
    return NextResponse.redirect(`${origin}?confirmed=true`)
  }

  if (code) {
    // OAuth or magic link code exchange
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(`${origin}?error=auth_callback_error`)
    }
    return NextResponse.redirect(origin)
  }

  // No code or token_hash — just redirect home
  return NextResponse.redirect(origin)
}
