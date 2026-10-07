/** @type {import('next').NextConfig} */
const nextConfig = {
  // Basic hardening headers (2026-10-06 audit). Deliberately not a full
  // Content-Security-Policy yet — maps, tiles and fonts load from several
  // hosts and a strict CSP needs testing first.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // No embedding Emerge in other sites' frames (clickjacking).
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
