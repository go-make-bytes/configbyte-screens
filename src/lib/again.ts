// Signing in again for the deployment's own area, and what a browser tab may keep for it.
//
// A tab's session storage holds two things and nothing else: the address to come back
// to after a sign-in that left the app (an address of the app, never data), and the
// mark that this tab is a sign-in tab. Nothing typed, no name, no personal code, no
// company and no answer of the area is ever written to any storage.

const RETURN_KEY = 'configbyte.return'
const TAB_KEY = 'configbyte.sign-in-tab'

/** The name of the channel a sign-in tab uses to tell the tabs of this browser that it signed in. */
export const SIGN_IN_CHANNEL = 'configbyte-sign-in'

/** Keep the address to open when a sign-in that left the app comes back. */
export function keepReturn(address: string): void {
  try {
    window.sessionStorage.setItem(RETURN_KEY, address)
  } catch {
    // Without it the app opens where it opens.
  }
}

/** The kept address, removed as it is read; null when none was kept. */
export function takeReturn(): string | null {
  try {
    const kept = window.sessionStorage.getItem(RETURN_KEY)
    window.sessionStorage.removeItem(RETURN_KEY)

    return kept
  } catch {
    return null
  }
}

/** Mark this tab as a sign-in tab. */
export function markSignInTab(): void {
  try {
    window.sessionStorage.setItem(TAB_KEY, '1')
  } catch {
    // Without it the tab cannot tell, after the sign-in, what it is for.
  }
}

/** Take the mark off this tab, once it has said it is signed in again. */
export function clearSignInTab(): void {
  try {
    window.sessionStorage.removeItem(TAB_KEY)
  } catch {
    // The mark goes with the tab.
  }
}

/**
 * Whether one sign-in time is later than another, as the server told both: never decided
 * from the browser's clock. A time that cannot be read is never later; any readable time is
 * later than one that cannot be.
 */
export function isLater(newer: string | null | undefined, older: string | null | undefined): boolean {
  const a = newer ? Date.parse(newer) : Number.NaN
  if (Number.isNaN(a)) return false
  const b = older ? Date.parse(older) : Number.NaN

  return Number.isNaN(b) || a > b
}

/** Whether this tab is a sign-in tab. */
export function isSignInTab(): boolean {
  try {
    return window.sessionStorage.getItem(TAB_KEY) === '1'
  } catch {
    return false
  }
}

/** A place the app can open: one of its own addresses, never another site's. */
export interface Resolver {
  resolve(address: string): { matched: unknown[] }
}

/**
 * The kept address if it is one of the app's own, checked against its routes; null for
 * anything else, so a value planted in storage never takes a person anywhere.
 */
export function ownAddress(router: Resolver, kept: string | null): string | null {
  if (!kept || !kept.startsWith('/') || kept.startsWith('//') || kept.includes('\\')) return null
  try {
    return router.resolve(kept).matched.length > 0 ? kept : null
  } catch {
    return null
  }
}

/**
 * Whether a sign-in made at `signedAt` is still recent enough for an area that asks
 * for one no older than `age` seconds. An area that names no age takes any; a sign-in
 * whose time is not known is too old. A sign-in exactly as old as the age is still recent.
 */
export function isRecent(signedAt: string | null | undefined, age: number | null | undefined, now: number = Date.now()): boolean {
  if (age === null || age === undefined) return true
  if (!signedAt) return false
  const at = Date.parse(signedAt)
  if (Number.isNaN(at)) return false

  return (now - at) / 1000 <= age
}
