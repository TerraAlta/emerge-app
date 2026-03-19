/**
 * Generate PWA icons as SVG files that browsers will accept.
 * For production, convert these to PNG with sharp or canvas.
 * Run: npx tsx scripts/generate-icons.ts
 */
import { writeFileSync } from 'fs'
import { join } from 'path'

const ICONS_DIR = join(__dirname, '..', 'public', 'icons')

function makeSvg(size: number, maskable: boolean): string {
  const pad = maskable ? size * 0.1 : 0 // maskable needs 10% safe zone
  const center = size / 2
  const iconSize = size - pad * 2

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <!-- Background -->
  <rect width="${size}" height="${size}" fill="#0D1A0B" ${maskable ? '' : 'rx="' + size * 0.18 + '"'}/>

  <!-- Subtle radial glow -->
  <defs>
    <radialGradient id="glow" cx="50%" cy="55%" r="40%">
      <stop offset="0%" stop-color="rgba(200,145,58,0.15)"/>
      <stop offset="100%" stop-color="transparent"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#glow)" ${maskable ? '' : 'rx="' + size * 0.18 + '"'}/>

  <!-- Seedling icon -->
  <g transform="translate(${center}, ${center * 0.85}) scale(${iconSize / 120})">
    <!-- Outer glow ring -->
    <circle cx="0" cy="0" r="28" fill="none" stroke="rgba(200,145,58,0.2)" stroke-width="1.5"/>

    <!-- Leaf shape -->
    <path d="M0 0 Q-12 -18 -15 -36 Q-6 -24 0 -30 Q6 -24 15 -36 Q12 -18 0 0Z"
          fill="#C8913A" opacity="0.9"/>

    <!-- Stem -->
    <line x1="0" y1="0" x2="0" y2="24" stroke="rgba(200,145,58,0.5)" stroke-width="2.5" stroke-linecap="round"/>

    <!-- Center seed -->
    <circle cx="0" cy="0" r="5" fill="#C8913A"/>
  </g>

  <!-- "emerge" text -->
  <text
    x="${center}" y="${center * 1.55}"
    text-anchor="middle"
    font-family="Georgia, 'Times New Roman', serif"
    font-size="${size * 0.1}"
    font-weight="300"
    letter-spacing="${size * 0.003}"
    fill="#E8F2E0"
  >em<tspan fill="#C8913A">e</tspan>rge</text>
</svg>`
}

// Generate all 4 icon variants
const variants = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-192-maskable.png', size: 192, maskable: true },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-512-maskable.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180, maskable: false },
]

for (const v of variants) {
  const svg = makeSvg(v.size, v.maskable)
  // Save as SVG (browsers accept SVG icons too)
  const svgName = v.name.replace('.png', '.svg')
  writeFileSync(join(ICONS_DIR, svgName), svg)
  console.log(`  Created ${svgName} (${v.size}x${v.size}${v.maskable ? ' maskable' : ''})`)
}

console.log('\nDone. For production PNGs, run through sharp or Squoosh.')
