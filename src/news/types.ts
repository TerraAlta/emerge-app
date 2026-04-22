/**
 * Normalized news item shape returned by all news source fetchers.
 * Maps cleanly to public.news_items in Supabase.
 */
export interface RawNewsItem {
  source_url: string
  source_name: string
  source_domain: string
  title: string
  summary: string
  content?: string | null
  author?: string | null
  image_url?: string | null
  published_at: string   // ISO 8601
  language?: string      // ISO 639-1, defaults to 'en'
}

export interface NewsSourceFetcher {
  /** kebab-case identifier, used in logs + diagnostics */
  name: string
  /** Default petal key (overridden by AI scoring if it disagrees). */
  defaultPetal: FlowerPetalKey
  /** Fetch recent items. Should be idempotent and cheap. */
  fetch(): Promise<RawNewsItem[]>
}

/**
 * Must match the keys in src/lib/flower-petals.ts. Duplicated here as a
 * type so the news pipeline doesn't pull React-land imports.
 */
export type FlowerPetalKey =
  | 'land-nature'
  | 'building-technology'
  | 'tools-materials'
  | 'health-wellbeing'
  | 'education-culture'
  | 'finance-economics'
  | 'governance-community'

export const PETAL_KEYS: readonly FlowerPetalKey[] = [
  'land-nature',
  'building-technology',
  'tools-materials',
  'health-wellbeing',
  'education-culture',
  'finance-economics',
  'governance-community',
] as const
