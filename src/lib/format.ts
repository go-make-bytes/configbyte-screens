// The two small things these screens format themselves.

const DAY = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' })

/**
 * An instant as the day it happened on the viewer's own clock, `YYYY-MM-DD`.
 * Slicing the ISO string would answer the day in UTC, which east of Greenwich is
 * yesterday for the first hours of every morning. A value that is not an instant
 * comes back as it was given.
 */
export function localDay(at: string): string {
  const when = new Date(at)
  if (Number.isNaN(when.getTime())) return at
  const f: Record<string, string> = {}
  for (const part of DAY.formatToParts(when)) f[part.type] = part.value

  return `${f.year}-${f.month}-${f.day}`
}

/** A file's size as a person reads it, in decimal units. */
export function fileSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 1000 * 1000) return `${Math.round(bytes / 100) / 10} kB`

  return `${Math.round(bytes / 100_000) / 10} MB`
}

/**
 * How many days ago a day was, against today on the viewer's own clock: 0 for
 * today, 1 for yesterday. Both are calendar days, so the hour never matters. A
 * day that cannot be read answers null.
 */
export function daysAgo(day: string, now: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) return null
  const then = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const today = localDay(now.toISOString()).split('-').map(Number)
  const nowDay = Date.UTC(today[0]!, today[1]! - 1, today[2]!)

  return Math.round((nowDay - then) / 86_400_000)
}
