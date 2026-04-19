/**
 * Stripe client — server-side only.
 *
 * Used for: Guild scoping doc checkout (€40), refunds on admin rejection.
 */
import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
    _stripe = new Stripe(key)
  }
  return _stripe
}

export const GUILD_SCOPING_PRICE_EUR = 40
export const GUILD_SCOPING_PRICE_CENTS = GUILD_SCOPING_PRICE_EUR * 100
