/**
 * Shared date utilities for consistent timezone-aware date display.
 * ALL date comparisons use local midnight, never raw UTC diffs.
 */

/** Days until an event, using local midnight for both dates */
export function daysUntil(iso: string): number {
  const now = new Date()
  const localToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const eventDate = new Date(iso)
  const localEvent = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate())
  return Math.round((localEvent.getTime() - localToday.getTime()) / (1000 * 60 * 60 * 24))
}

/** Check if event time is effectively "no time captured" (midnight UTC or local) */
function isMidnight(d: Date, iso?: string): boolean {
  // Check UTC midnight — pipeline events stored as date-only default to T00:00:00Z
  if (iso && (iso.endsWith('T00:00:00+00:00') || iso.endsWith('T00:00:00Z') || iso.endsWith('T00:00:00.000Z') || /T00:00:\d{2}(\.\d+)?\+00:00$/.test(iso))) {
    return true
  }
  // Also treat local midnight as no time
  return d.getHours() === 0 && d.getMinutes() === 0
}

/** Format time string, or return null if midnight (no time captured) */
function formatTime(d: Date, iso?: string): string | null {
  if (isMidnight(d, iso)) return null
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/**
 * Format a date for quest cards: "Today 2:30 PM" / "Tomorrow" / "Sat 28 Mar"
 * Handles midnight gracefully (shows "time TBC" or omits time).
 */
export function formatDate(iso: string): string {
  const d = new Date(iso)
  const days = daysUntil(iso)
  const time = formatTime(d, iso)

  if (days === 0) return time ? `Today ${time}` : 'Today'
  if (days === 1) return time ? `Tomorrow ${time}` : 'Tomorrow'
  const dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  return time ? `${dateStr} ${time}` : dateStr
}

/**
 * Format a date for quest detail page: "Today at 2:30 PM" / "Saturday, Mar 28 at 3:00 PM"
 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const days = daysUntil(iso)
  const time = formatTime(d, iso)

  let dayStr: string
  if (days === 0) dayStr = 'Today'
  else if (days === 1) dayStr = 'Tomorrow'
  else dayStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  return time ? `${dayStr} at ${time}` : `${dayStr} · time TBC`
}

/**
 * Proximity pill for quest cards.
 * Returns null for events 30+ days away.
 */
export function proximityPill(iso: string): { text: string; bg: string; color: string } | null {
  const d = daysUntil(iso)
  if (d === 0) return { text: 'Today', bg: '#FFF3E0', color: '#BF360C' }
  if (d === 1) return { text: 'Tomorrow', bg: '#FFF8E1', color: '#A0522D' }
  if (d >= 2 && d <= 6) return { text: `In ${d} days`, bg: 'rgba(232,242,224,0.06)', color: 'rgba(232,242,224,0.45)' }
  if (d >= 7 && d <= 13) return { text: 'Next week', bg: 'rgba(232,242,224,0.06)', color: 'rgba(232,242,224,0.45)' }
  if (d >= 14 && d <= 29) {
    const w = Math.floor(d / 7)
    return { text: `In ${w} week${w > 1 ? 's' : ''}`, bg: 'rgba(232,242,224,0.06)', color: 'rgba(232,242,224,0.45)' }
  }
  return null
}

/**
 * Filter quests by time window.
 */
export function filterQuests<T extends { starts_at: string }>(quests: T[], filter: 'today' | 'week' | 'all'): T[] {
  if (filter === 'today') return quests.filter(q => daysUntil(q.starts_at) === 0)
  if (filter === 'week') return quests.filter(q => { const d = daysUntil(q.starts_at); return d >= 0 && d <= 7 })
  return quests
}

/**
 * Group quests by time proximity for section dividers.
 */
export function groupQuests<T extends { starts_at: string }>(quests: T[]): { label: string; quests: T[] }[] {
  const groups: { label: string; quests: T[] }[] = []
  const today: T[] = [], week: T[] = [], month: T[] = [], later: T[] = []
  for (const q of quests) {
    const d = daysUntil(q.starts_at)
    if (d === 0) today.push(q)
    else if (d >= 1 && d <= 7) week.push(q)
    else if (d >= 8 && d <= 30) month.push(q)
    else later.push(q)
  }
  if (today.length) groups.push({ label: 'Today', quests: today })
  if (week.length) groups.push({ label: 'This week', quests: week })
  if (month.length) groups.push({ label: 'This month', quests: month })
  if (later.length) groups.push({ label: 'Later', quests: later })
  return groups
}
