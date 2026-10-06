/**
 * Signed tokens for one-click links in pitch lifecycle emails
 * (confirm-active, reactivate). Uses HMAC with the unsubscribe/internal
 * secret so we don't introduce a new secret.
 */
import crypto from 'crypto'

function secret(): string {
  const s = process.env.UNSUBSCRIBE_SECRET || process.env.INTERNAL_TRIGGER_KEY
  // An empty secret would make every link token forgeable.
  if (!s) throw new Error('pitch-links: UNSUBSCRIBE_SECRET is not set')
  return s
}

export function signConfirmToken(pitchId: string): string {
  return crypto.createHmac('sha256', secret()).update(pitchId).digest('hex').slice(0, 32)
}

export function signReactivateToken(pitchId: string): string {
  return crypto.createHmac('sha256', secret()).update(`reactivate:${pitchId}`).digest('hex').slice(0, 32)
}
