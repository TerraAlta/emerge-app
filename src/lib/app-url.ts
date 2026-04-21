/**
 * Resolves the public base URL for the app, tolerating misconfigured env vars.
 * Strips whitespace, stray quotes, and trailing slashes. Falls back to the
 * production domain if the env var is empty or obviously invalid.
 */
const PROD_FALLBACK = 'https://emerge.terralta.org'

export function getAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL
  if (!raw) return PROD_FALLBACK
  const cleaned = raw
    .trim()
    .replace(/^["']+|["']+$/g, '') // strip wrapping quotes
    .replace(/\s+/g, '')           // strip any stray whitespace inside
    .replace(/\/+$/, '')           // strip trailing slash(es)
  // Must look like a real URL
  if (!/^https?:\/\/[^\s"']+/.test(cleaned)) return PROD_FALLBACK
  return cleaned
}
