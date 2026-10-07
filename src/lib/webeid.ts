// Signing in with an ID card.
//
// This is the only cryptography that happens in the browser, and it is not ours:
// the card does it, driven by the person's own card software through its browser
// extension. Nothing here reads a certificate, checks a chain or holds a key — a
// nonce goes to the card and its signed answer comes back, opaque, to be handed
// to the coordinator exactly as it arrived.
//
// The library is served from the host application's own origin, never a CDN: it is
// the code that talks to someone's identity card, and where it comes from is part
// of what makes that safe.

interface CardSoftware {
  authenticate(challengeNonce: string, options?: { lang?: string }): Promise<unknown>
}

// A non-literal path, so the bundler leaves it as a runtime fetch rather than
// trying to resolve a file that is copied in as-is.
const LIBRARY_PATH = '/web-eid.js'

let loaded: CardSoftware | null = null

declare global {
  interface Window {
    webeid?: CardSoftware
  }
}

/** Raised when the card, its software, or the person's answer to the PIN prompt
 *  does not produce a signed token. The code is the library's own. */
export class CardError extends Error {
  constructor(
    readonly code: string | null,
    message: string,
  ) {
    super(message)
    this.name = 'CardError'
  }
}

async function cardSoftware(): Promise<CardSoftware> {
  if (loaded) return loaded

  if (typeof window.webeid?.authenticate === 'function') {
    loaded = window.webeid

    return loaded
  }

  // A library that cannot be fetched is the same, to the person, as one that is not
  // there: the card software is not available in this browser.
  let mod: Record<string, unknown>
  try {
    mod = (await import(/* @vite-ignore */ LIBRARY_PATH)) as Record<string, unknown>
  } catch {
    throw new CardError(null, 'the card software is not available in this browser')
  }
  const candidate = (
    typeof mod.authenticate === 'function' ? mod : (mod.default as Record<string, unknown> | undefined)
  ) as CardSoftware | undefined

  if (!candidate || typeof candidate.authenticate !== 'function') {
    throw new CardError(null, 'the card software is not available in this browser')
  }
  loaded = candidate

  return candidate
}

/**
 * The card library's own codes for "there is nothing here to talk to": the browser
 * extension is not installed, or the application it drives is not.
 *
 * Deliberately just these two. The library also reports a version that is too old,
 * and a native application that was there and failed — both mean the software IS
 * installed, so telling that person to install it sends them somewhere they have
 * already been.
 */
const NOT_INSTALLED = new Set(['ERR_WEBEID_EXTENSION_UNAVAILABLE', 'ERR_WEBEID_NATIVE_UNAVAILABLE'])

/**
 * True when the failure means "the card software is not installed" rather than
 * "something went wrong". The two need different words: one is a thing to go and
 * do, the other is a thing to try again.
 *
 * It matches whole codes from the card library's own namespace, never words inside
 * them. Codes are not one set: the card library has its own, and so does
 * the coordinator, and a test that reads across both will eventually find a word it
 * recognises in a sentence that was not talking to it. That is not hypothetical —
 * a server saying a dependency was *unavailable* was read here as the extension
 * being unavailable, so a person whose card had just worked was sent to reinstall
 * software they were already running.
 */
export function isCardSoftwareMissing(err: unknown): boolean {
  // Our own signal, raised when the library never loaded: there is no code to read
  // because there was nothing there to produce one.
  if (err instanceof CardError && err.code === null) return true

  const code = (err as { code?: unknown })?.code

  return typeof code === 'string' && NOT_INSTALLED.has(code)
}

/** Where to get the card software. */
export const CARD_SOFTWARE_URL = 'https://www.id.ee/en/article/install-id-software/'

/** Sign the challenge with the card. The answer is opaque and travels verbatim. */
export async function signChallenge(nonce: string, lang: string): Promise<unknown> {
  const software = await cardSoftware()

  return software.authenticate(nonce, { lang })
}
