import { createHmac } from 'crypto'

const SECRET = process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || 'emerge-unsub-default'

/** Generate a deterministic unsubscribe token for a user */
export function generateUnsubscribeToken(userId: string): string {
  return createHmac('sha256', SECRET).update(userId).digest('hex').slice(0, 32)
}

/** Verify the unsubscribe token matches the user ID */
export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  return token === generateUnsubscribeToken(userId)
}
