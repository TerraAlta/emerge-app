import type { MetadataRoute } from 'next'
import { getAppUrl } from '@/lib/app-url'

// The public entry points. Individual events/pitches open inside the app
// (?quest=… and /guild/pitch/…) and change weekly, so they're not listed.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getAppUrl()
  const now = new Date()
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/quests`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/guild`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/guild/pitches`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ]
}
