import { describe, it, expect } from 'vitest'
import { asList } from '@/lib/as-list'

describe('asList (AI-written list fields)', () => {
  it('passes arrays through, wraps a sentence, drops empties', () => {
    expect(asList(['a', 'b'])).toEqual(['a', 'b'])
    expect(asList('Observe and interact')).toEqual(['Observe and interact'])
    expect(asList('  ')).toEqual([])
    expect(asList(null)).toEqual([])
    expect(asList({ x: 1 })).toEqual([])
  })
})
