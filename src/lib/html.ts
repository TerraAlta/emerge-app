/**
 * Escape text for HTML email bodies. Use on anything a user or a scraped site
 * wrote (names, titles, visions, taglines): unescaped, markup in those fields
 * renders inside an email sent from the Terra Alta address.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
