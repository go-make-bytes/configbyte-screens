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
