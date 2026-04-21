/**
 * Single source of truth for the admin allowlist.
 *
 * Reads NEXT_PUBLIC_ADMIN_EMAILS (comma-separated) with a hardcoded fallback
 * so deploys without the env var still have at least one working admin.
 * Emails are lowercased + trimmed; compare with isAdminEmail().
 */

const FALLBACK_ADMIN_EMAILS = [
  'samuraicut@gmail.com',
  'terraalta.sintra@gmail.com',
  'valdjiu@protonmail.com',
]

export const ADMIN_EMAILS: string[] = (
  process.env.NEXT_PUBLIC_ADMIN_EMAILS?.split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean) ?? FALLBACK_ADMIN_EMAILS.map(e => e.toLowerCase())
)

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.trim().toLowerCase())
}
