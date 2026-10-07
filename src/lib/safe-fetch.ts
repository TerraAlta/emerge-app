/**
 * fetch() for URLs that users paste in (event submissions, Guild prep links).
 *
 * Checking the hostname text isn't enough (2026-10-07 audit): `[::1]`,
 * `0.0.0.0`, decimal/hex IPs, names whose DNS points at private ranges, and
 * public URLs that redirect inward all slipped past the old pattern lists. So:
 *   - resolve the hostname and reject if ANY address is private/loopback/
 *     link-local/unspecified/CGNAT/multicast (IPv4 and IPv6, incl. mapped);
 *   - follow redirects by hand (max 3), re-checking every hop.
 * Node runtime only (uses dns).
 */
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const MAX_REDIRECTS = 3

export class BlockedUrlError extends Error {}

function ipv4Blocked(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||      // CGNAT
    (a === 169 && b === 254) ||                // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224                                   // multicast / reserved
  )
}

function ipv6Blocked(ip: string): boolean {
  const v = ip.toLowerCase()
  if (v === '::' || v === '::1') return true
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return ipv4Blocked(mapped[1])
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v)  // unique-local, link-local, multicast
}

export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip)
  if (kind === 4) return ipv4Blocked(ip)
  if (kind === 6) return ipv6Blocked(ip)
  return true
}

async function assertPublic(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedUrlError('Only http(s) URLs are allowed')
  }
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new BlockedUrlError('Private/local URLs are not allowed')
  }
  let addresses: string[]
  try {
    addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map(a => a.address)
  } catch {
    throw new BlockedUrlError('Could not resolve host')
  }
  if (!addresses.length || addresses.some(isBlockedIp)) {
    throw new BlockedUrlError('Private/local URLs are not allowed')
  }
}

/** Like fetch(), but refuses private destinations at every redirect hop. */
export async function safeFetch(rawUrl: string, init: RequestInit = {}): Promise<Response> {
  let url: URL
  try { url = new URL(rawUrl) } catch { throw new BlockedUrlError('Invalid URL') }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url)
    const res = await fetch(url.toString(), { ...init, redirect: 'manual' })
    const location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url)
      continue
    }
    return res
  }
  throw new BlockedUrlError('Too many redirects')
}
