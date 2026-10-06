/**
 * Only let http(s) and mailto links through to an href.
 *
 * User-supplied links (practitioner portfolio, pitch contact and reference
 * links) were rendered as-is, so a `javascript:` URL ran code on
 * emerge.terralta.org when clicked (2026-10-06 audit). React 18 only warns.
 * Bare domains ("mysite.com") get https:// so they don't become relative links.
 */
export function safeHref(raw: string | null | undefined, opts: { allowMailto?: boolean } = {}): string | null {
  if (!raw) return null
  let s = String(raw).trim()
  if (!s) return null
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    // No scheme: treat as a web address if it looks like one.
    if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(s)) s = `https://${s}`
    else return null
  }
  try {
    const u = new URL(s)
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString()
    if (opts.allowMailto && u.protocol === 'mailto:') return u.toString()
  } catch {
    /* not a URL */
  }
  return null
}
