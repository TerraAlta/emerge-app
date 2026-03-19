import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        emerge: {
          soil: '#0D1A0B',     // background
          forest: '#162814',   // cards, pills
          dawn: '#C8913A',     // accent / amber
          sage: '#E8F2E0',     // primary text
          grove: '#2D5A1E',    // secondary accent
          // aliases
          bg: '#0D1A0B',
          card: '#162814',
          amber: '#C8913A',
        },
      },
      fontFamily: {
        heading: ['var(--font-fraunces)', 'serif'],
        body: ['var(--font-outfit)', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
