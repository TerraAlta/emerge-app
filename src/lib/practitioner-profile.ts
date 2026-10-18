/**
 * How the Guild join/edit flow combines a practitioner's existing profile with
 * new input when they redo the interview (AI or manual).
 *
 * Returning practitioners land on the review step with their saved profile;
 * "redo with AI / add a CV" sends them back through url_prep → fork. Before
 * 2026-10-18 each path REPLACED the profile: the AI extraction never returns
 * a photo or links, the manual draft didn't carry them, and a failed
 * extraction reset everything to blank — so saving afterwards erased their
 * photo, links (and, after a failure, their whole bio).
 */
export interface EditableProfile {
  tagline?: string
  bio?: string
  specialties?: string[]
  climate_zones_worked?: string[]
  project_scales?: string[]
  years_experience?: number
  pdc_certified?: boolean
  advanced_certifications?: string
  rate_range?: string
  profile_photo_url?: string
  portfolio_urls?: Array<{ label: string; url: string }>
}

/** AI re-extraction: new text fields win; photo and links are kept. */
export function mergeExtractedProfile<T extends EditableProfile>(prev: T | null, extracted: EditableProfile): T {
  return {
    ...(prev ?? {}),
    ...extracted,
    profile_photo_url: extracted.profile_photo_url || prev?.profile_photo_url,
    portfolio_urls: extracted.portfolio_urls?.length ? extracted.portfolio_urls : prev?.portfolio_urls,
  } as T
}

/** Manual path: keep everything already there; seed an empty bio from the CV/URL draft. */
export function manualDraftProfile<T extends EditableProfile>(prev: T | null, draftBio: string): T {
  return {
    ...(prev ?? {}),
    tagline: prev?.tagline || '',
    bio: prev?.bio && prev.bio.trim().length > 0 ? prev.bio : draftBio,
    specialties: prev?.specialties || [],
    climate_zones_worked: prev?.climate_zones_worked || [],
    project_scales: prev?.project_scales || [],
  } as T
}

/** Extraction failed: keep what they had; only a brand-new practitioner gets a blank form. */
export function fallbackAfterFailedExtraction<T extends EditableProfile>(prev: T | null): T {
  return (prev ?? { tagline: '', bio: '', specialties: [], climate_zones_worked: [], project_scales: [] }) as T
}
