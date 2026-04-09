import type { Metadata, Viewport } from 'next'
import { Fraunces, Outfit } from 'next/font/google'
import './globals.css'

const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap' })
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', display: 'swap' })

export const metadata: Metadata = {
  title: 'Emerge — Regenerative Community Quests',
  description: 'Real quests. Real community. Real change. Discover regenerative events near you.',
  manifest: '/manifest.json',
  metadataBase: new URL('https://emerge.terralta.org'),
  openGraph: {
    title: 'Emerge — Regenerative Community Quests',
    description: 'Real quests. Real community. Real change. Discover regenerative events near you.',
    url: 'https://emerge.terralta.org',
    siteName: 'Emerge',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Emerge — Regenerative Community Quests',
        type: 'image/png',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Emerge — Regenerative Community Quests',
    description: 'Real quests. Real community. Real change. Discover regenerative events near you.',
    images: ['/og-image.png'],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Emerge',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
      { url: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.svg',
  },
}

export const viewport: Viewport = {
  themeColor: '#F5F2EC',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${outfit.variable}`}>
      <head>
        {/* PWA meta tags not covered by Next.js metadata API */}
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-startup-image" href="/icons/icon-512.svg" />
      </head>
      <body className="font-body min-h-screen" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>
        {children}
        {/* Theme init + Service Worker registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                var t=localStorage.getItem('emerge-theme')||'light';
                document.documentElement.setAttribute('data-theme',t);
                var m=document.querySelector('meta[name="theme-color"]');
                if(m)m.setAttribute('content',t==='dark'?'#0D1A0B':'#F5F2EC');
              })();
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(
                    function(reg) { console.log('[SW] Registered:', reg.scope) },
                    function(err) { console.log('[SW] Registration failed:', err) }
                  );
                });
              }
            `,
          }}
        />
      </body>
    </html>
  )
}
