// Who is signed in to the admin app, what each section's owner will judge them
// by, and the sections this deployment has, in the order an import writes them —
// all from the coordinator. The browser holds only its opaque cookie.
import { defineStore } from 'pinia'

import { API_ROOT, ApiError, get, post } from '../lib/api'
import { signChallenge } from '../lib/webeid'

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
        if (unanswered(e)) this.unreachable = true
        else if (!(e instanceof ApiError) || e.status !== 401) throw e
      } finally {
        this.resolved = true
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

      await post(`${API_ROOT}/login/webeid/complete`, { state: challenge.state, authToken })
      await this.resolve()
    },

    async logout() {
      const out = await post<Logout>(`${API_ROOT}/logout`)
      this.me = null
      this.order = []
      if (out.next) window.location.assign(out.next)
    },
  },
})
