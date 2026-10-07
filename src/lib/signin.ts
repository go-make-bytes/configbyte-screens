// What the sign-in page needs to know that is not drawing: the ways a deployment
// offers, what a marker on the address means, the language before anyone is
// signed in, and the one note a sign-out leaves for the page it returns to.
//
// Shared by every app that uses the sign-in page, so each reads them the same way.

/** How a sign-in is started: on the page with the card software, or through the authority. */
export type SignInFlow = 'card' | 'redirect'

/** One way a deployment offers to sign in: its key, how it is started, and its exact name. */
export interface SignInWay {
  key: string
  flow: SignInFlow
  /** Shown exactly as given — a name people know the way by, never translated. */
  name: string
}

/** What the page says above the buttons, if anything. */
export type SignInMessage =
  | ''
  | 'cancelled'
  | 'notMember'
  | 'providerError'
  | 'incomplete'
  | 'expired'
  | 'unmatched'
  | 'failed'
  | 'unknown'
  | 'cardFailed'
  | 'signedOut'
  | 'ended'
  | 'noWays'

/** The markers a sign-in can come back with, and what the page says for each. */
const MARKERS: Record<string, SignInMessage> = {
  cancelled: 'cancelled',
  not_member: 'notMember',
  provider_error: 'providerError',
  missing_code: 'incomplete',
  expired: 'expired',
  bad_state: 'unmatched',
  login_failed: 'failed',
}

/**
 * What a marker on the address means to the page. A sign-in that came back
 * unfinished arrives with one, because the browser went to the authority and had
 * to land somewhere. The markers that close the app — the network, the
 * strength — are not messages: they replace the page. A marker this page does not
 * know still says the sign-in did not complete, rather than nothing.
 */
export function messageOfMarker(marker: string): SignInMessage {
  if (marker === '' || marker === 'network' || marker === 'assurance') return ''

  return MARKERS[marker] ?? 'unknown'
}

/** The name of the way a person signed in with, if the deployment still offers it. */
export function wayName(ways: SignInWay[], key: string): string | undefined {
  return ways.find((w) => w.key === key)?.name
}

const LANGUAGE_KEY = 'sign-in.language'
const SIGNED_OUT_KEY = 'sign-in.signed-out'

/** The language this browser was set to on the sign-in page, if it was. */
export function keptLanguage(): string | null {
  try {
    return window.localStorage.getItem(LANGUAGE_KEY)
  } catch {
    return null
  }
}

/** Keep a language chosen on the sign-in page for this browser, until a person has one of their own. */
export function keepLanguage(code: string): void {
  try {
    window.localStorage.setItem(LANGUAGE_KEY, code)
  } catch {
    // A browser that keeps nothing still shows the chosen language now.
  }
}

/**
 * The language before anyone is signed in: the one chosen in this browser, else
 * the first of the browser's own the app carries, else the deployment's. After
 * sign-in the workspace's language decides, and that is the host's to apply.
 */
export function languageBeforeSignIn(
  carried: readonly string[],
  deployment: string,
  from: { kept?: string | null; browser?: readonly string[] } = {},
): string {
  const kept = from.kept === undefined ? keptLanguage() : from.kept
  if (kept && carried.includes(kept)) return kept

  const browser = from.browser ?? (typeof navigator === 'undefined' ? [] : navigator.languages ?? [])
  for (const tag of browser) {
    const base = tag.toLowerCase().split('-')[0] ?? ''
    if (carried.includes(base)) return base
  }

  return carried.includes(deployment) ? deployment : (carried[0] ?? deployment)
}

/**
 * Leave a note that this browser has just signed out. A sign-out ends at the
 * authority and comes back, so the page it returns to reads the note to say what
 * happened — once, and only in this tab.
 */
export function noteSignedOut(): void {
  try {
    window.sessionStorage.setItem(SIGNED_OUT_KEY, '1')
  } catch {
    // Without it the page simply says nothing about the sign-out.
  }
}

/** Whether this tab has just signed out; reading the note removes it. */
export function takeSignedOut(): boolean {
  try {
    const was = window.sessionStorage.getItem(SIGNED_OUT_KEY) === '1'
    window.sessionStorage.removeItem(SIGNED_OUT_KEY)

    return was
  } catch {
    return false
  }
}
