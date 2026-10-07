// Who is signed in to the admin app, what each section's owner will judge them
// by, and the sections this deployment has, in the order an import writes them —
// all from the coordinator. The browser holds only its opaque cookie.
import { defineStore } from 'pinia'

import { API_ROOT, ApiError, get, post } from '../lib/api'
import { messageOfMarker, noteSignedOut, type SignInMessage, type SignInWay } from '../lib/signin'
import { isCardSoftwareMissing, signChallenge } from '../lib/webeid'

export interface Identity {
  /** The person, as the owners name them in their history. */
  subject: string
  name: string
  loginMethod: string
  loa: string
  tenant: string
  /** Every section of this deployment, with the person's scopes under its owner's keys. */
  sections: Record<string, string[]>
  presentation: {
    displayName: string
    locale: string
  }
}

interface SectionLine {
  section: string
}

interface LoginStart {
  authorizeUrl: string
}

/** What the card is asked to sign, and the handle the completion is found by. */
interface CardChallenge {
  nonce: string
  state: string
}

interface Logout {
  next?: string
}

/** What the sign-in page reads before anyone is signed in. */
interface LoginWays {
  ways: SignInWay[]
  /** Where the everyday app is, when the deployment names it. */
  appUrl?: string
  /** The deployment's language. */
  language?: string
}

/** The authority's answer for a person it knows who is not a member here. */
const NOT_MEMBER = 'err:membership:notMember'

/**
 * Why the admin app is closed to this person before anyone is signed in: the
 * request came from outside the networks the deployment allows, or the sign-in
 * was weaker than the deployment asks for.
 */
export type Closed = '' | 'network' | 'assurance'

/** The coordinator's code for a request from outside the allowed networks. */
const NETWORK_NOT_ALLOWED = 'err:configbyte:networkNotAllowed'
/** The coordinator's code for a sign-in below the deployment's minimum. */
const ASSURANCE_TOO_LOW = 'err:session:assuranceTooLow'

/** The closed state a refusal names, if it names one. */
function closedBy(e: unknown): Closed {
  if (!(e instanceof ApiError) || e.status !== 403) return ''
  if (e.code === NETWORK_NOT_ALLOWED) return 'network'
  if (e.code === ASSURANCE_TOO_LOW) return 'assurance'

  return ''
}

/**
 * Whether a failure means the coordinator itself did not answer: the request never
 * arrived, or the web server in front of it answered for it. Anything else is the
 * coordinator speaking, and is read as what it says.
 */
function unanswered(e: unknown): boolean {
  if (e instanceof ApiError) return e.status === 502 || e.status === 503 || e.status === 504

  return e instanceof TypeError
}

export const useAdminSession = defineStore('configbyte-session', {
  state: () => ({
    me: null as Identity | null,
    /** The deployment's sections, in the order an import writes them. */
    order: [] as string[],
    /** Whether the first answer has arrived, either way. */
    resolved: false,
    /** The coordinator did not answer at all. */
    unreachable: false,
    /** Why the app is closed to this person, if it is. */
    closed: '' as Closed,
    /** The ways this deployment offers to sign in, and whether they have been read. */
    ways: [] as SignInWay[],
    waysRead: false,
    /** Where the everyday app is, and the deployment's language, from the same read. */
    appUrl: '',
    deploymentLanguage: '',
    /** What the sign-in page says, the way being waited on, and whether the card software is missing. */
    message: '' as SignInMessage,
    waitingFor: '',
    softwareMissing: false,
    /** The last sign-out did not complete. */
    signOutFailed: false,
  }),
  getters: {
    /** Whether the person holds any of the scopes, under any section. */
    holdsAny:
      (state) =>
      (scopes: string[]): boolean => {
        if (!state.me) return false
        const held = new Set(Object.values(state.me.sections).flat())

        return scopes.some((s) => held.has(s))
      },
  },
  actions: {
    /** Ask who is signed in, and what this deployment has. A refusal means "not signed in". */
    async resolve() {
      this.unreachable = false
      try {
        const me = await get<Identity>(`${API_ROOT}/me`)
        const lines = await get<{ sections: SectionLine[] }>(`${API_ROOT}/sections`)
        this.me = me
        this.order = lines.sections.map((l) => l.section)
      } catch (e) {
        this.me = null
        this.order = []
        const closed = closedBy(e)
        if (closed) this.closed = closed
        // Anything but "not signed in" means the coordinator could not say who is:
        // the page that says so, never the sign-in page as if nobody were.
        else if (unanswered(e) || !(e instanceof ApiError) || e.status !== 401) this.unreachable = true
      } finally {
        this.resolved = true
      }
    },

    /**
     * Read the ways this deployment offers to sign in, once they have been read
     * successfully. Without them the page cannot offer a way in, so a failure is
     * the coordinator not answering — never an empty list, which would read as
     * "no way is set up here".
     */
    async readWays() {
      if (this.waysRead) return
      try {
        const read = await get<LoginWays>(`${API_ROOT}/login/ways`)
        this.ways = read.ways ?? []
        this.appUrl = read.appUrl ?? ''
        this.deploymentLanguage = read.language ?? ''
        this.waysRead = true
      } catch (e) {
        const closed = closedBy(e)
        if (closed) this.closed = closed
        else this.unreachable = true
      }
    },

    /**
     * Ask the coordinator who is signed in and which ways it offers — on opening,
     * and again when it did not answer.
     */
    async ask() {
      await Promise.all([this.resolve(), this.readWays()])
    },

    /**
     * Sign in the way a person chose. What can go wrong is said on the page: the
     * card software missing, the card or the account refused, not being a member
     * here, or the coordinator not answering — each apart from the others.
     */
    async start(way: SignInWay, lang: string) {
      this.message = ''
      this.softwareMissing = false
      this.waitingFor = way.flow === 'card' ? way.key : ''
      try {
        if (way.flow === 'redirect') await this.login()
        else await this.loginWithCard(lang)
      } catch (e) {
        const closed = closedBy(e)
        if (closed) this.closed = closed
        else if (isCardSoftwareMissing(e)) this.softwareMissing = true
        else if (e instanceof ApiError && e.code === NOT_MEMBER) this.message = 'notMember'
        else if (unanswered(e)) this.unreachable = true
        else this.message = way.flow === 'card' ? 'cardFailed' : 'failed'
      } finally {
        this.waitingFor = ''
      }
    },

    // The redirect sign-in: the coordinator starts it and hands the browser to the
    // authority. These screens never see a secret — the exchange secret and the
    // session key are minted and held on the server.
    async login() {
      const start = await post<LoginStart>(`${API_ROOT}/login/start`)
      window.location.assign(start.authorizeUrl)
    },

    /**
     * Sign in with an ID card, without leaving the page: a challenge out, the card's
     * signed answer back, exchanged for a session. The card's answer is opaque here
     * and is passed on exactly as the card software produced it.
     */
    async loginWithCard(lang: string) {
      const challenge = await post<CardChallenge>(`${API_ROOT}/login/webeid/start`)
      const authToken = await signChallenge(challenge.nonce, lang)

      // Turned away for its strength or its network, no session was made, and the
      // page that says why replaces the sign-in; the caller reads the refusal.
      await post(`${API_ROOT}/login/webeid/complete`, { state: challenge.state, authToken })
      await this.resolve()
    },

    /**
     * Read the marker a sign-in that was turned away came back with: the browser
     * navigated to the authority and back, so the reason arrives on the address.
     */
    readMarker(marker: string) {
      if (marker === 'network' || marker === 'assurance') this.closed = marker
      else this.message = messageOfMarker(marker)
    },

    /** Leave the closed page for the sign-in, dropping the marker that brought it. */
    reopen() {
      this.closed = ''
      window.history.replaceState(window.history.state, '', window.location.pathname)
    },

    /**
     * Sign out here, and at the authority when it asks. A sign-out that does not
     * complete is said — the person may be on a shared computer — and leaves the
     * session as it was.
     */
    async logout() {
      this.signOutFailed = false
      let out: Logout
      try {
        out = await post<Logout>(`${API_ROOT}/logout`)
      } catch {
        this.signOutFailed = true

        return
      }
      this.me = null
      this.order = []
      this.message = 'signedOut'
      if (out.next) {
        noteSignedOut()
        window.location.assign(out.next)
      }
    },
  },
})
