import { createHmac } from 'crypto'

function getSecret(): string {
  const secret = process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET
  if (!secret) throw new Error('UNSUBSCRIBE_SECRET or CRON_SECRET env var required')
  return secret
}

/** Generate a deterministic unsubscribe token for a user */
export function generateUnsubscribeToken(userId: string): string {
  return createHmac('sha256', getSecret()).update(userId).digest('hex').slice(0, 32)
}

/** Verify the unsubscribe token matches the user ID */
export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  return token === generateUnsubscribeToken(userId)
}
