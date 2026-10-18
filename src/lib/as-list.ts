/**
 * AI-written fields (scoping docs, briefs) are meant to be lists but sometimes
 * come back as a single sentence or null. Calling `.map` on a string crashed
 * the client's project page and the admin review queue. Use this wherever such
 * a field is rendered.
 */
export function asList(v: unknown): any[] {
  if (Array.isArray(v)) return v
  return typeof v === 'string' && v.trim() ? [v] : []
}
