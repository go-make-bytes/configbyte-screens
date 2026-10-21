// How the Users list reads the people it was given: which of the counts a person
// belongs to, which user type is in force, and how long ago they last signed in.
// Everything here works from the one read of the people, so a count and the rows
// its filter shows can never disagree.
import type { Member } from '../stores/people'
import { daysAgo } from './format'

/** The counts that filter the list. */
export type Show = 'everyone' | 'administrators' | 'nothing' | 'invited' | 'away'

export const SHOWS: Show[] = ['everyone', 'administrators', 'nothing', 'invited', 'away']

/** How many days without signing in make someone *away*. */
export const AWAY_DAYS = 30

/** How many people a page of the list holds. */
export const PAGE_SIZE = 25

/** The most characters a masked personal code is drawn with, however long the code is. */
export const MASK_MAX = 16

/** The most characters a note about a person may have. */
export const NOTE_MAX = 1000

/** How many characters of a personal note a row of the list shows before it is cut. */
export const NOTE_PREVIEW = 34

/** A personal code as it is drawn before it is shown: one bullet for each character, never more than sixteen. */
export const maskOf = (length: number | undefined): string => '•'.repeat(Math.min(Math.max(length ?? 0, 0), MASK_MAX))

/** What names a person: their email, their personal code and its country, or the lack of any way to sign in. */
export type Way = { kind: 'email'; email: string } | { kind: 'code'; country: string; mask: string } | { kind: 'none' }

/** How the person signs in, as the register read it; null when it did not say, or says only that they do. */
export function wayOf(m: Member): Way | null {
  const s = m.signIn
  if (!s) return null
  if (s.email) return { kind: 'email', email: s.email }
  if (s.country) return { kind: 'code', country: s.country, mask: maskOf(s.length) }
  if (s.signsIn === false) return { kind: 'none' }

  return null
}

/** The first words of a note, on one line, cut with an ellipsis when it runs long. */
export function noteStart(note: string): string {
  const line = note.replace(/\s+/g, ' ').trim()

  return line.length > NOTE_PREVIEW ? `${line.slice(0, NOTE_PREVIEW)}…` : line
}

/** The user type in force: the chart position's while the person sits in one, else their own. */
export const typeInForce = (m: Member) => m.chartUserType ?? m.userType

/** Days since the person last signed in; null when they never did or the day cannot be read. */
export function daysAway(m: Member, now?: Date): number | null {
  return m.lastSignedInOn ? daysAgo(m.lastSignedInOn, now) : null
}

/** Whether the person has not signed in for a month or more. */
export function isAway(m: Member, now?: Date): boolean {
  const n = daysAway(m, now)

  return m.status === 'active' && n !== null && n >= AWAY_DAYS
}

/** Whether a person belongs to a count. Someone who lost access belongs to *Everyone* alone. */
export function belongs(show: Show, m: Member, now?: Date): boolean {
  switch (show) {
    case 'everyone':
      return true
    case 'administrators':
      return m.administrator && m.status !== 'revoked'
    case 'nothing':
      return m.arrival && m.status === 'active'
    case 'invited':
      return m.status === 'invited'
    case 'away':
      return isAway(m, now)
  }
}

/** Each count: the people it shows, those who lost access left out unless they are shown. */
export function counts(people: Member[], withLost: boolean, now?: Date): Record<Show, number> {
  const visible = people.filter((m) => withLost || m.status !== 'revoked')

  return Object.fromEntries(SHOWS.map((s) => [s, visible.filter((m) => belongs(s, m, now)).length])) as Record<Show, number>
}
