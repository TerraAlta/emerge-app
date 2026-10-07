/**
 * True only for a request carrying the real CRON_SECRET. If the env var is
 * ever missing, `Bearer ${undefined}` would match a request sending
 * "Bearer undefined" — so an unset secret rejects everything instead.
 */
export function isCronAuthorized(authorizationHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET
  return !!secret && authorizationHeader === `Bearer ${secret}`
}
