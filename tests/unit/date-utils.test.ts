import { describe, it, expect, vi, afterEach } from 'vitest'
import { groupEvents, filterEvents, formatDate } from '@/lib/dateUtils'

describe('feed date grouping', () => {
  afterEach(() => vi.useRealTimers())

  it('an event that started yesterday and is still running is grouped with Today, not Later', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-18T12:00:00'))
    const ongoing = { starts_at: '2026-10-17T09:00:00+01:00', ends_at: '2026-10-19T18:00:00+01:00' }
    const groups = groupEvents([ongoing])
    expect(groups[0].label).toBe('Today')
  })

  it('Today and This week filters keep events that are still running', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-18T12:00:00'))
    const ongoing = { starts_at: '2026-10-16T10:00:00+01:00' }
    expect(filterEvents([ongoing], 'today')).toHaveLength(1)
    expect(filterEvents([ongoing], 'week')).toHaveLength(1)
  })

  it('date-only events show their own calendar day', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-18T12:00:00'))
    expect(formatDate('2026-10-25T00:00:00Z')).toMatch(/25 Oct/)
  })
})
