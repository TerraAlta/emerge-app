import { describe, it, expect } from 'vitest'
import { displaySourceName } from '@/lib/source-label'

describe('displaySourceName (setup smoke test)', () => {
  it('never shows internal pipeline names', () => {
    expect(displaySourceName('eventbrite-priority')).toBe('Eventbrite')
    expect(displaySourceName('mobilizon:keskonfai.fr')).toBe('keskonfai.fr')
    expect(displaySourceName('zegg-de')).toBe('Zegg')
  })
})
