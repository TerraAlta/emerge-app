import { describe, it, expect } from 'vitest'
import { mergeExtractedProfile, manualDraftProfile, fallbackAfterFailedExtraction } from '@/lib/practitioner-profile'

const existing = {
  tagline: 'Água é vida', bio: 'Long-standing bio', specialties: ['Keyline'],
  climate_zones_worked: ['Mediterranean'], project_scales: ['Farm'], years_experience: 12,
  pdc_certified: true, advanced_certifications: 'PDC', rate_range: '€50/h',
  profile_photo_url: 'https://cdn.test/me.jpg',
  portfolio_urls: [{ label: 'website', url: 'https://me.test' }],
}

describe('practitioner profile merging (redo-interview paths)', () => {
  it('AI re-extraction keeps the photo and links the AI never returns', () => {
    const extracted = { tagline: 'New tagline', bio: 'New bio', specialties: ['Swales'] }
    const out = mergeExtractedProfile(existing, extracted)
    expect(out.tagline).toBe('New tagline')
    expect(out.profile_photo_url).toBe('https://cdn.test/me.jpg')
    expect(out.portfolio_urls).toEqual(existing.portfolio_urls)
  })

  it('manual path after re-doing prep keeps photo, links and existing fields', () => {
    const out = manualDraftProfile(existing, 'draft from CV')
    expect(out.bio).toBe('Long-standing bio')   // existing bio not clobbered
    expect(out.profile_photo_url).toBe('https://cdn.test/me.jpg')
    expect(out.portfolio_urls).toEqual(existing.portfolio_urls)
  })

  it('manual path for a new practitioner seeds the bio from the CV draft', () => {
    expect(manualDraftProfile(null, 'draft from CV').bio).toBe('draft from CV')
  })

  it('a failed extraction does not wipe a returning practitioner\'s profile', () => {
    expect(fallbackAfterFailedExtraction(existing)).toEqual(existing)
    expect(fallbackAfterFailedExtraction(null).tagline).toBe('')
  })
})
