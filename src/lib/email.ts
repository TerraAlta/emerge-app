/**
 * Gmail SMTP email helper — replaces Resend across the app.
 *
 * Uses the Terra Alta Gmail account (terraalta.sintra@gmail.com) with an
 * App Password stored in env. No DNS setup required.
 *
 * Env:
 *   GMAIL_USER            — sending address (e.g. terraalta.sintra@gmail.com)
 *   GMAIL_APP_PASSWORD    — 16-char Google App Password (spaces ignored)
 *   EMAIL_FROM (optional) — display name wrapper, e.g. "Emerge Guild <terraalta.sintra@gmail.com>"
 *   EMAIL_REPLY_TO (opt.) — override reply-to (defaults to GMAIL_USER)
 */
import nodemailer, { type Transporter } from 'nodemailer'

let cachedTransporter: Transporter | null = null

function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '')
  if (!user || !pass) {
    throw new Error('Missing GMAIL_USER or GMAIL_APP_PASSWORD env vars')
  }
  cachedTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  })
  return cachedTransporter
}

export interface SendEmailArgs {
  to: string
  subject: string
  html: string
  from?: string
  replyTo?: string
  headers?: Record<string, string>
}

export async function sendEmail({ to, subject, html, from, replyTo, headers }: SendEmailArgs): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  try {
    const user = process.env.GMAIL_USER!
    const effectiveFrom = from || process.env.EMAIL_FROM || `Terra Alta <${user}>`
    const effectiveReplyTo = replyTo || process.env.EMAIL_REPLY_TO || user

    const info = await getTransporter().sendMail({
      from: effectiveFrom,
      to,
      subject,
      html,
      replyTo: effectiveReplyTo,
      headers,
    })
    return { ok: true, messageId: info.messageId }
  } catch (err: any) {
    console.error('[email] send failed:', err?.message || err)
    return { ok: false, error: err?.message || String(err) }
  }
}

/** True if Gmail SMTP is configured; useful to skip send silently in dev. */
export function isEmailConfigured(): boolean {
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)
}
