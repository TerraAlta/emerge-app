import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PractitionerCard, { type Practitioner } from '@/components/PractitionerCard'

const full: Practitioner = {
  id: 'p1', display_name: 'João Conceição', tagline: 'Água é vida', bio: 'Bio', country: 'Portugal', region: 'Sintra',
  languages: ['Português', 'English'], years_experience: 12, pdc_certified: true, advanced_certifications: '',
  flower_petals: ['land-nature'], specialties: ['Keyline'], climate_zones_worked: ['Mediterranean'],
  project_scales: ['Farm'], rate_range: '', availability_status: 'available',
  profile_photo_url: null, portfolio_urls: null,
}

describe('PractitionerCard', () => {
  it('renders a full profile with Portuguese characters', () => {
    render(<PractitionerCard practitioner={full} />)
    expect(screen.getByText('João Conceição')).toBeInTheDocument()
    expect(screen.getByText('JC')).toBeInTheDocument()
  })

  it('does not crash when list fields are null (half-finished or hand-edited rows)', () => {
    const sparse = { ...full, flower_petals: null, languages: null, specialties: null,
      project_scales: null, climate_zones_worked: null } as unknown as Practitioner
    render(<PractitionerCard practitioner={sparse} />)
    expect(screen.getByText('João Conceição')).toBeInTheDocument()
  })

  it('does not crash on an empty or missing display name', () => {
    render(<PractitionerCard practitioner={{ ...full, display_name: null } as unknown as Practitioner} />)
    expect(screen.getByText(/Sintra, Portugal/)).toBeInTheDocument()
  })

  it('falls back to initials when the photo URL is broken', () => {
    const { container } = render(<PractitionerCard practitioner={{ ...full, profile_photo_url: 'https://x.test/gone.jpg' }} />)
    const img = container.querySelector('img')!
    fireEvent.error(img)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('JC')).toBeInTheDocument()
  })
})
