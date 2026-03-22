import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyUnsubscribeToken } from '@/lib/unsubscribe-token'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('uid')
  const token = searchParams.get('token')

  if (!userId || !token) {
    return new NextResponse(page('Invalid unsubscribe link.', false), {
      status: 400, headers: { 'Content-Type': 'text/html' },
    })
  }

  if (!verifyUnsubscribeToken(userId, token)) {
    return new NextResponse(page('Invalid or expired unsubscribe link.', false), {
      status: 403, headers: { 'Content-Type': 'text/html' },
    })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ email_digest_enabled: false })
    .eq('id', userId)

  if (error) {
    return new NextResponse(page('Something went wrong. Please try again.', false), {
      status: 500, headers: { 'Content-Type': 'text/html' },
    })
  }

  return new NextResponse(page("You've been unsubscribed from Emerge quest digests.", true), {
    headers: { 'Content-Type': 'text/html' },
  })
}

function page(message: string, success: boolean): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Emerge — Unsubscribe</title></head>
<body style="margin:0;padding:0;background:#0D1A0B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
<div style="text-align:center;padding:40px 24px;max-width:360px;">
  <p style="font-size:28px;font-weight:300;color:#E8F2E0;font-style:italic;margin:0 0 16px;">em<span style="color:#C8913A;">e</span>rge</p>
  <p style="font-size:14px;color:${success ? '#E8F2E0' : '#D4785A'};margin:0 0 20px;">${message}</p>
  ${success ? '<p style="font-size:12px;margin:0;"><a href="https://emerge.terralta.org" style="color:#C8913A;text-decoration:none;">Back to Emerge &rarr;</a></p>' : ''}
</div></body></html>`
}
