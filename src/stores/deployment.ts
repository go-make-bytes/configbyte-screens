// The deployment's own area: the companies it serves, the products it offers, and
// one company with its products, its administrators and its starting configuration.
//
// Every call goes to the coordinator's own area, which judges the sign-in and the
// person before it asks the membership register to judge the act. What is held here
// is only what the area answered: a list of companies, a company, the products, the
// names of a company's administrators once somebody asked to see them, and the last
// line said. Nothing a person typed is held here — an invitation's name and personal
// code go out in their one request and are not kept.
//
// A page reads what it shows once when it opens; an act reads again only what it
// changed. The names of a company's administrators are read only when somebody
// presses to see them, because showing them is recorded, and they are forgotten when
// the page is left.
import { defineStore } from 'pinia'

import { API_ROOT, ApiError, del, get, isAssuranceTooLow, isSignInTooOld, post, put, segment } from '../lib/api'
import { isLater } from '../lib/again'
import {
  administratorOf,
  companyOf,
  configurationOf,
  deploymentAdminOf,
  hasUnknownProduct,
  productOf,
  rowsOf,
  whyNot,
  type Administrator,
  type Company,
  type Configuration,
  type DeploymentAdmin,
  type Product,
} from '../lib/deployment'
import { useAdminSession } from './session'

const AREA = `${API_ROOT}/deployment`

/** The codes of the two conflicts that have a reason of their own. */
const NAME_TAKEN = 'err:membership:name_taken'
const NOT_DECLARED = 'err:membership:not_declared'

/** What a form to open a company sends; the browser holds it only in the form and in this one request. */
export interface NewCompany {
  name: string
  language: string
  products: string[]
  /** The name of a starting configuration, or empty for none. */
  startsFrom: string
  administrator: { displayName: string; identityCode: string; country: string }
}

/** What an opening left for the page of the company it opened: what became of its file, never anything typed. */
export interface Landed {
  id: string
  /** The file asked for, when one was; empty when the company starts with nothing set up. */
  file: string
  configuration: Configuration | null
}

/** The code of the refusal that says showing a list of people could not be recorded. */
const AUDIT_UNAVAILABLE = 'err:membership:audit_unavailable'
/** The codes of the refusals that name a starting configuration the area cannot use. */
const UNKNOWN_CONFIGURATION = 'err:configbyte:unknownConfiguration'
const BAD_CONFIGURATION = 'err:configbyte:badConfiguration'

/** Where a read stands. */
export type ReadState = 'idle' | 'loading' | 'ready' | 'failed'

/**
 * Why the area refused the person, when it refused them as a whole: the sign-in is
 * older than the area accepts, the person manages nothing here, or they did a moment
 * ago, while a page was drawn.
 */
export type Refusal = '' | 'tooOld' | 'notAdmin' | 'noLonger'

/** How a failed call is told: the coordinator itself did not answer, or something else went wrong. */
export type Failure = '' | 'unanswered' | 'other'

/** A sentence about what the last act did, as a key of the screens' words and what it counts or names. */
export interface Said {
  kind: 'done' | 'refused'
  key: string
  values?: Record<string, unknown>
}

/** What a refusal or failure means to the area, once the effects it has on the session are done. */
type Met = 'closed' | 'tooOld' | 'notAdmin' | 'unanswered' | 'other'

function unanswered(e: unknown): boolean {
  if (e instanceof ApiError) return e.status === 502 || e.status === 503 || e.status === 504

  return e instanceof TypeError
}

/** The company an answer carries under `company`, when it carries one. */
function companyIn(body: unknown): Company | null {
  return body && typeof body === 'object' ? companyOf((body as Record<string, unknown>).company) : null
}

/** A starting configuration's name, as a row of the list of them carries it. */
function fileNameOf(raw: unknown): string | null {
  const name = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).name : undefined

  return typeof name === 'string' && name !== '' ? name : null
}

/** Whether a met failure ended the call as a whole, so nothing more is said about the act. */
const ended = (met: Met) => met === 'closed' || met === 'tooOld' || met === 'notAdmin'

/** Counts the pages opened, so an answer that arrives after the page was left or another opened changes nothing. */
let visit = 0

export const useDeployment = defineStore('configbyte-deployment', {
  state: () => ({
    /** The companies, with the state of the read that brought them. */
    companies: [] as Company[],
    companiesState: 'idle' as ReadState,
    companiesFailure: '' as Failure,
    /** The products, with the state of the read that brought them. */
    products: [] as Product[],
    productsState: 'idle' as ReadState,
    productsFailure: '' as Failure,

    /** One company open, and the state of the read that brought it. */
    company: null as Company | null,
    companyState: 'idle' as ReadState | 'missing',
    companyFailure: '' as Failure,

    /** The names of the starting configurations this deployment keeps, once read. */
    configurations: [] as string[],
    configurationsState: 'idle' as ReadState,
    /** What became of the last file applied to the company open. */
    configuration: null as Configuration | null,

    /** The company's administrators: hidden until somebody presses to see them. */
    administrators: [] as Administrator[],
    administratorsState: 'hidden' as 'hidden' | 'loading' | 'shown' | 'unrecorded' | 'failed',

    /** What the last opening left for the company's page, until that page takes it. */
    landed: null as Landed | null,
    /** The sentence of the first run just done, kept until the next page change: the company's name as the register answered. */
    firstRun: null as { name: string; missing: boolean } | null,
    /** The name of a company the register refused as taken, so the form can say so under *Name*. */
    nameTaken: false,

    /** The people who manage the deployment, with the state of the recorded read that brought them. */
    deploymentAdmins: [] as DeploymentAdmin[],
    deploymentAdminsState: 'idle' as 'idle' | 'loading' | 'ready' | 'unrecorded' | 'failed',
    /** Nobody of the deployment's own company has the personal code that was just added. */
    nobodyByCode: false,

    /** The person a page of the area was opened for, by the subject of the sign-in answer it was opened under. */
    pinned: '',
    /** The time of the sign-in the page held when it was told the sign-in was too old. */
    tooOldFrom: '',

    /** The area refused the person as a whole: their sign-in is too old, or they manage nothing here. */
    refusal: '' as Refusal,
    /** The last act's sentence. */
    said: null as Said | null,
    /** What is on its way, so a second press waits: empty, `tick:<key>`, `administrators`, `invite`, `remove` or `apply`. */
    busy: '',
  }),
  getters: {
    /** Whether the companies and the products are both read. */
    listReady: (state): boolean => state.companiesState === 'ready' && state.productsState === 'ready',
  },
  actions: {
    /** Tell what a failed call means to the area, doing what it asks of the session. */
    meet(e: unknown): Met {
      if (isAssuranceTooLow(e)) {
        useAdminSession().closeFor(e)

        return 'closed'
      }
      if (isSignInTooOld(e)) {
        // The coordinator judges the sign-in's age before the right, so a person who manages nothing here is told
        // their sign-in is too old by every address of the area. The held sign-in answer says whether they are one
        // who could use a newer one; when it does not, this is the area refusing them, not a sign-in to renew.
        if (!useAdminSession().managesDeployment) return this.refuseWhole(false)
        this.refusal = 'tooOld'
        this.tooOldFrom = useAdminSession().me?.signedInAt ?? ''

        return 'tooOld'
      }
      if (e instanceof ApiError && e.status === 403) return this.refuseWhole(true)

      return unanswered(e) ? 'unanswered' : 'other'
    },

    /**
     * The area refuses the person as a whole: nothing of it is kept. A page that was already drawn says they no
     * longer manage the deployment; a page that never was says they do not. `again` reads the menu again.
     */
    refuseWhole(again: boolean): Met {
      const drawn =
        this.companiesState === 'ready' || this.companyState === 'ready' || this.productsState === 'ready' || this.deploymentAdminsState === 'ready'
      this.reset()
      this.refusal = drawn ? 'noLonger' : 'notAdmin'
      if (again) void useAdminSession().resolve()

      return 'notAdmin'
    },

    /** The server has accepted a call of the area for the sign-in time held: the clock guesses no more for it. */
    accept() {
      const session = useAdminSession()
      session.areaAcceptedFor = session.me?.signedInAt ?? ''
    },

    /** The failure a call's error is told as, after what it asks of the session has been done. */
    failureOf(e: unknown): Failure {
      return this.meet(e) === 'unanswered' ? 'unanswered' : 'other'
    },

    /** Forget everything of the area; the next page starts clean. */
    reset() {
      visit += 1
      this.companies = []
      this.companiesState = 'idle'
      this.companiesFailure = ''
      this.products = []
      this.productsState = 'idle'
      this.productsFailure = ''
      this.company = null
      this.companyState = 'idle'
      this.companyFailure = ''
      this.configurations = []
      this.configurationsState = 'idle'
      this.configuration = null
      this.administrators = []
      this.administratorsState = 'hidden'
      this.deploymentAdmins = []
      this.deploymentAdminsState = 'idle'
      this.nameTaken = false
      this.nobodyByCode = false
      this.refusal = ''
      this.said = null
      this.busy = ''
    },

    /**
     * Pin the person a page was opened for: the subject of the sign-in answer held as it opens.
     * Every act, and every read of people, compares what the server says now with this.
     */
    pin() {
      this.pinned = useAdminSession().me?.subject ?? ''
    },

    /** Read the companies and the products once each, together; the products again, once, if a company has one they lack. */
    async openList() {
      this.reset()
      this.pin()
      const mine = visit
      this.companiesState = 'loading'
      this.productsState = 'loading'
      const [companies, products] = await Promise.allSettled([get<unknown>(`${AREA}/companies`), get<unknown>(`${AREA}/products`)])
      if (mine !== visit) return

      if (companies.status === 'fulfilled') {
        this.companies = rowsOf(companies.value, 'companies', companyOf)
        this.companiesState = 'ready'
        this.accept()
      } else {
        this.companiesState = 'failed'
        this.companiesFailure = this.failureOf(companies.reason)
      }
      if (mine !== visit) return
      if (products.status === 'fulfilled') {
        this.products = rowsOf(products.value, 'products', productOf)
        this.productsState = 'ready'
      } else {
        this.productsState = 'failed'
        this.productsFailure = this.failureOf(products.reason)
      }
      if (mine !== visit) return

      // A company with a product the first read of the products did not hold: ask once more, since one was added meanwhile.
      if (this.listReady && this.companies.some((c) => hasUnknownProduct(c, this.products))) await this.readProducts(mine)
    },

    /** Read the products alone, for the page that opened at `mine`. */
    async readProducts(mine: number) {
      try {
        const body = await get<unknown>(`${AREA}/products`)
        if (mine !== visit) return
        this.products = rowsOf(body, 'products', productOf)
        this.productsState = 'ready'
        this.productsFailure = ''
      } catch (e) {
        if (mine !== visit) return
        this.productsState = 'failed'
        this.productsFailure = this.failureOf(e)
      }
    },

    /** Open one company: it and the products, together, then the files a starting configuration may come from while it can still be applied. */
    async openCompany(id: string) {
      this.reset()
      this.pin()
      const mine = visit
      this.companyState = 'loading'
      this.productsState = 'loading'
      const [company, products] = await Promise.allSettled([get<unknown>(`${AREA}/companies/${segment(id)}`), get<unknown>(`${AREA}/products`)])
      if (mine !== visit) return

      if (company.status === 'fulfilled') {
        const read = companyIn(company.value)
        this.company = read
        if (read) this.accept()
        this.companyState = read ? 'ready' : 'failed'
        if (!read) this.companyFailure = 'other'
      } else if (company.reason instanceof ApiError && company.reason.status === 404) {
        this.companyState = 'missing'
      } else {
        this.companyState = 'failed'
        this.companyFailure = this.failureOf(company.reason)
      }
      if (mine !== visit) return
      if (products.status === 'fulfilled') {
        this.products = rowsOf(products.value, 'products', productOf)
        this.productsState = 'ready'
      } else {
        this.productsState = 'failed'
        this.productsFailure = this.failureOf(products.reason)
      }
      if (mine !== visit) return

      if (this.company && !this.company.entered) await this.readConfigurations(mine)
    },

    /** Read the names of the starting configurations. */
    async readConfigurations(mine = visit) {
      this.configurationsState = 'loading'
      try {
        const body = await get<unknown>(`${AREA}/configurations`)
        if (mine !== visit) return
        this.configurations = rowsOf(body, 'configurations', fileNameOf)
        this.configurationsState = 'ready'
      } catch (e) {
        if (mine !== visit) return
        this.configurationsState = 'failed'
        this.meet(e)
      }
    },

    /** Read the company alone again, after an act that changed it. A company that is gone is told as gone. */
    async refreshCompany(id: string) {
      const mine = visit
      try {
        const body = await get<unknown>(`${AREA}/companies/${segment(id)}`)
        if (mine !== visit) return
        const read = companyIn(body)
        if (read) this.company = read
      } catch (e) {
        if (mine !== visit) return
        if (e instanceof ApiError && e.status === 404) {
          this.company = null
          this.companyState = 'missing'

          return
        }
        this.meet(e)
      }
    },

    /** Give a company a product, or take it away. Only the company is read again. */
    async setProduct(id: string, key: string, on: boolean) {
      if (!(await this.begin(`tick:${key}`))) return
      const mine = visit
      const path = `${AREA}/companies/${segment(id)}/products/${segment(key)}`
      try {
        if (on) await put(path)
        else await del(path)
        if (mine !== visit) return
        await this.refreshCompany(id)
      } catch (e) {
        if (mine === visit) await this.tickRefused(id, key, on, e)
      } finally {
        if (mine === visit) this.busy = ''
      }
    },

    /** What a refused tick says: the page is read again for a company that is gone, the reason is worked out for a conflict. */
    async tickRefused(id: string, key: string, on: boolean, e: unknown) {
      const met = this.meet(e)
      if (ended(met)) return
      if (e instanceof ApiError && e.status === 404) {
        await this.openCompany(id)

        return
      }
      if (e instanceof ApiError && e.status === 409) {
        const mine = visit
        await this.readProducts(mine)
        if (mine !== visit) return
        const why = whyNot(this.products, this.company?.products ?? [], key)
        const product = this.products.find((p) => p.key === key)?.displayName ?? ''
        if (on && why?.lock === 'unoffered') this.said = { kind: 'refused', key: 'tickUnoffered', values: { product } }
        else if (on && why?.lock === 'needs') this.said = { kind: 'refused', key: 'tickNeeds', values: { product, needs: why.names.join(', ') } }
        else if (!on && why?.lock === 'neededBy') this.said = { kind: 'refused', key: 'tickNeededBy', values: { product, by: why.names.join(', ') } }
        else this.said = { kind: 'refused', key: 'tickChanged', values: { product } }

        return
      }
      this.said = { kind: 'refused', key: met === 'unanswered' ? 'unanswered' : 'tickFailed' }
    },

    /** Read the names of a company's administrators. Showing them is recorded, and said so on the page. */
    async showAdministrators(id: string) {
      // A read of people is checked like an act: it is never made for another person.
      if (!(await this.begin('administrators'))) return
      const mine = visit
      this.administratorsState = 'loading'
      try {
        const body = await get<unknown>(`${AREA}/companies/${segment(id)}/administrators`)
        if (mine !== visit) return
        this.administrators = rowsOf(body, 'administrators', administratorOf)
        this.administratorsState = 'shown'
      } catch (e) {
        if (mine !== visit) return
        if (e instanceof ApiError && e.code === AUDIT_UNAVAILABLE) {
          this.administratorsState = 'unrecorded'

          return
        }
        this.administratorsState = 'failed'
        this.meet(e)
      } finally {
        if (mine === visit) this.busy = ''
      }
    },

    /**
     * After an act on the administrators the names are hidden again, not read again by
     * themselves: showing them is recorded, and is the person's press. The company is read
     * again, so its count is right.
     */
    async closeAdministrators(id: string) {
      this.administrators = []
      this.administratorsState = 'hidden'
      await this.refreshCompany(id)
    },

    /**
     * Invite a person to administer the company: a name and a personal code with its
     * country. They go out in this one request and are kept nowhere. Answers whether it
     * was done, so the form that held them can let them go.
     */
    async invite(id: string, input: { displayName: string; identityCode: string; country: string }): Promise<boolean> {
      if (!(await this.begin('invite'))) return false
      const mine = visit
      try {
        await post(`${AREA}/companies/${segment(id)}/administrators`, input)
        if (mine !== visit) return true
        this.said = { kind: 'done', key: 'invited' }
        await this.closeAdministrators(id)

        return true
      } catch (e) {
        if (mine !== visit) return false
        const met = this.meet(e)
        if (ended(met)) return false
        if (met === 'unanswered') this.said = { kind: 'refused', key: 'unanswered' }
        else if (e instanceof ApiError && e.status === 422) this.said = { kind: 'refused', key: 'inviteInvalid' }
        else if (e instanceof ApiError && e.status === 409) this.said = { kind: 'refused', key: 'inviteConflict' }
        else this.said = { kind: 'refused', key: 'inviteFailed' }

        return false
      } finally {
        if (mine === visit) this.busy = ''
      }
    },

    /** Take a person's administrator rung away; they stay one of the company's people. */
    async removeAdministrator(id: string, userId: string) {
      if (!(await this.begin('remove'))) return
      const mine = visit
      try {
        await del(`${AREA}/companies/${segment(id)}/administrators/${segment(userId)}`)
        if (mine !== visit) return
        this.said = { kind: 'done', key: 'removed' }
        await this.closeAdministrators(id)
      } catch (e) {
        if (mine !== visit) return
        const met = this.meet(e)
        if (ended(met)) return
        if (e instanceof ApiError && e.status === 409) this.said = { kind: 'refused', key: 'lastAdministrator' }
        else if (e instanceof ApiError && e.status === 404) this.said = { kind: 'refused', key: 'administratorGone' }
        else this.said = { kind: 'refused', key: met === 'unanswered' ? 'unanswered' : 'removeFailed' }
        await this.closeAdministrators(id)
      } finally {
        if (mine === visit) this.busy = ''
      }
    },

    /** Start the company from one of the files this deployment keeps. What became of it is the answer, whatever its status. */
    async applyConfiguration(id: string, file: string) {
      if (!(await this.begin('apply'))) return
      const mine = visit
      this.configuration = null
      this.landed = null
      try {
        const body = await post<unknown>(`${AREA}/companies/${segment(id)}/configuration`, { startsFrom: file })
        if (mine !== visit) return
        const sent = body && typeof body === 'object' ? configurationOf((body as Record<string, unknown>).configuration) : null
        // An answer the screens cannot read is not a success.
        this.configuration = sent ? { ...sent, name: sent.name || file } : { name: file, outcome: 'failed', sections: {} }
        await this.refreshCompany(id)
      } catch (e) {
        if (mine !== visit) return
        const met = this.meet(e)
        if (ended(met)) return
        if (e instanceof ApiError && e.status === 404 && e.code === UNKNOWN_CONFIGURATION) this.said = { kind: 'refused', key: 'fileUnknown', values: { file } }
        else if (e instanceof ApiError && e.status === 422 && e.code === BAD_CONFIGURATION) this.said = { kind: 'refused', key: 'fileBad', values: { file } }
        else if (e instanceof ApiError && e.status === 409) await this.refreshCompany(id)
        else this.said = { kind: 'refused', key: met === 'unanswered' ? 'unanswered' : 'applyFailed' }
      } finally {
        if (mine === visit) this.busy = ''
      }
    },

    /**
     * Start an act, or a read of people: nothing else is on its way, and the person signed in
     * now, as the server says, is the one the page was opened for. The sign-in is shared by
     * every tab of this browser, so another tab may have changed the person since this page
     * opened; a different person (or nobody) drops the page and nothing is sent. A page left
     * while the answer was out sends nothing either.
     */
    async begin(what: string): Promise<boolean> {
      if (this.busy) return false
      this.busy = what
      this.said = null
      const at = visit
      const ok = await this.guardPerson()
      if (at !== visit) return false
      if (!ok) {
        this.busy = ''

        return false
      }

      return true
    },

    /** Whether it is still the person the page was opened for; false sends nothing, and says why when it can. */
    async guardPerson(): Promise<boolean> {
      const verdict = await this.lookAgain()
      if (verdict === 'failed') {
        this.said = { kind: 'refused', key: 'unanswered' }

        return false
      }

      return verdict === 'same'
    },

    /**
     * Ask the server who is signed in, trusting only that answer. A different person, or
     * nobody, drops everything held and loads the app again. The same person, whose sign-in
     * is later than the one the page held when it was told the sign-in was too old, takes the
     * line about the old sign-in away and says so; the browser's clock decides nothing here.
     */
    async lookAgain(): Promise<'same' | 'other' | 'failed'> {
      const session = useAdminSession()
      const verdict = await session.reread(this.pinned)
      if (verdict === 'other') {
        this.dropPage()
      } else if (verdict === 'same' && this.refusal === 'tooOld' && isLater(session.me?.signedInAt, this.tooOldFrom)) {
        this.refusal = ''
        this.tooOldFrom = ''
        this.said = { kind: 'done', key: 'signedInAgain' }
      }

      return verdict
    },

    /** The page is looked at again, or the sign-in tab says it signed in: read who is signed in. */
    async afterOtherTab() {
      await this.lookAgain()
    },

    /** Drop everything held, and load the app again as whoever is signed in now. */
    dropPage() {
      this.reset()
      this.landed = null
      this.firstRun = null
      this.pinned = ''
      this.tooOldFrom = ''
      window.location.reload()
    },

    /** Open the sign-in tab, with no reference back to this one. */
    openSignInTab(address: string) {
      window.open(address, '_blank', 'noopener')
    },

    /** Read what opening a company offers: the products, and the names of the starting files. */
    async openForm() {
      this.reset()
      this.pin()
      const mine = visit
      this.productsState = 'loading'
      this.configurationsState = 'loading'
      const [products, files] = await Promise.allSettled([get<unknown>(`${AREA}/products`), get<unknown>(`${AREA}/configurations`)])
      if (mine !== visit) return
      if (products.status === 'fulfilled') {
        this.products = rowsOf(products.value, 'products', productOf)
        this.productsState = 'ready'
        this.accept()
      } else {
        this.productsState = 'failed'
        this.productsFailure = this.failureOf(products.reason)
      }
      if (mine !== visit) return
      if (files.status === 'fulfilled') {
        this.configurations = rowsOf(files.value, 'configurations', fileNameOf)
        this.configurationsState = 'ready'
      } else {
        this.configurationsState = 'failed'
        this.failureOf(files.reason)
      }
    },

    /**
     * Open a company. What was typed goes out in this one request and is kept nowhere.
     * Answers the new company's id when it was opened, else empty, with the reason in
     * `said` (or `nameTaken`) and the form left as it was.
     */
    async openNew(input: NewCompany): Promise<string> {
      if (!(await this.begin('open'))) return ''
      const mine = visit
      this.nameTaken = false
      this.landed = null
      const body: Record<string, unknown> = {
        name: input.name,
        language: input.language,
        products: input.products,
        administrator: input.administrator,
      }
      if (input.startsFrom) body.startsFrom = input.startsFrom
      try {
        const answer = await post<unknown>(`${AREA}/companies`, body)
        if (mine !== visit) return ''
        const opened = answer && typeof answer === 'object' ? companyIn(answer) : null
        const sent = answer && typeof answer === 'object' ? configurationOf((answer as Record<string, unknown>).configuration) : null
        // A file that was asked for and an answer that says nothing readable of it is not a success.
        const configuration = input.startsFrom ? (sent ? { ...sent, name: sent.name || input.startsFrom } : { name: input.startsFrom, outcome: 'failed' as const, sections: {} }) : null
        this.landed = { id: opened?.id ?? '', file: input.startsFrom, configuration }

        return opened?.id ?? ''
      } catch (e) {
        if (mine !== visit) return ''
        const met = this.meet(e)
        if (ended(met)) return ''
        const file = input.startsFrom
        if (e instanceof ApiError && e.status === 404 && e.code === UNKNOWN_CONFIGURATION) this.said = { kind: 'refused', key: 'openFileUnknown', values: { file } }
        else if (e instanceof ApiError && e.status === 422 && e.code === BAD_CONFIGURATION) this.said = { kind: 'refused', key: 'openFileBad', values: { file } }
        else if (e instanceof ApiError && e.status === 409 && e.code === NAME_TAKEN) this.nameTaken = true
        else if (e instanceof ApiError && e.status === 409 && e.code === NOT_DECLARED) this.said = { kind: 'refused', key: 'openStarting' }
        else if (met === 'unanswered') this.said = { kind: 'refused', key: 'unanswered' }
        else if (e instanceof ApiError && e.status === 422) this.said = { kind: 'refused', key: 'openRefusedPerson' }
        else this.said = { kind: 'refused', key: 'openFailed' }

        return ''
      } finally {
        if (mine === visit) this.busy = ''
      }
    },

    /** What an opening left for this company's page; read once, so only the page it was meant for draws it. */
    takeLanded(id: string): Landed | null {
      const landed = this.landed
      if (!landed || landed.id !== id) return null
      this.landed = null

      return landed
    },

    /**
     * Name the deployment's own company: the one act of the first run, which a person with
     * no permission yet may make. The sign-in answer is read again when it is done, so the
     * app opens. Answers whether it was done.
     */
    async runFirst(name: string, language: string): Promise<boolean> {
      if (!(await this.begin('first-run'))) return false
      const mine = visit
      const session = useAdminSession()
      try {
        const answer = await post<unknown>(`${AREA}/first-run`, { name, language })
        const company = answer && typeof answer === 'object' ? (answer as Record<string, unknown>).company : undefined
        const missing = answer && typeof answer === 'object' ? (answer as Record<string, unknown>).missing : undefined
        this.firstRun = {
          name: company && typeof company === 'object' && typeof (company as Record<string, unknown>).name === 'string' ? ((company as Record<string, unknown>).name as string) : '',
          missing: Array.isArray(missing) && missing.length > 0,
        }
        await session.resolve()

        return true
      } catch (e) {
        if (mine !== visit) return false
        if (isSignInTooOld(e)) {
          // The person making the first run manages nothing yet, so the area's rule for such a person does not
          // apply: a sign-in too old is always the line that asks to sign in again, with the form kept.
          this.refusal = 'tooOld'
          this.tooOldFrom = useAdminSession().me?.signedInAt ?? ''
        } else if (isAssuranceTooLow(e)) {
          this.meet(e)
        } else if (e instanceof ApiError && e.status === 409 && e.code === NOT_DECLARED) {
          this.said = { kind: 'refused', key: 'firstRunStarting' }
        } else if (e instanceof ApiError && e.status === 409) {
          // Already set up, by a slow first press or another tab: it is done.
          await session.resolve()

          return true
        } else if (e instanceof ApiError && e.status === 403) {
          this.said = { kind: 'refused', key: 'firstRunNotNamed' }
        } else {
          this.said = { kind: 'refused', key: unanswered(e) ? 'unanswered' : 'firstRunFailed' }
        }

        return false
      } finally {
        if (mine === visit) this.busy = ''
      }
    },

    /** Read the people who manage the deployment. Opening the page is the recorded read. */
    async openDeploymentAdmins() {
      this.reset()
      this.pin()
      const mine = visit
      this.deploymentAdminsState = 'loading'
      // The read of people is checked first, inside: it is never made for another person.
      await this.readDeploymentAdmins(mine)
    },

    /** The recorded read of the deployment admins, for the page opened at `mine`. */
    async readDeploymentAdmins(mine: number, checked = false) {
      // A list of people is never read without the comparison with the pinned person having just been made.
      if (!checked) {
        const ok = await this.guardPerson()
        if (mine !== visit) return
        if (!ok) {
          this.deploymentAdmins = []
          this.deploymentAdminsState = 'failed'

          return
        }
      }
      try {
        const body = await get<unknown>(`${AREA}/admins`)
        if (mine !== visit) return
        this.deploymentAdmins = rowsOf(body, 'admins', deploymentAdminOf)
        this.deploymentAdminsState = 'ready'
        this.accept()
      } catch (e) {
        if (mine !== visit) return
        this.deploymentAdmins = []
        if (e instanceof ApiError && e.code === AUDIT_UNAVAILABLE) {
          this.deploymentAdminsState = 'unrecorded'

          return
        }
        this.deploymentAdminsState = 'failed'
        this.meet(e)
      }
    },

    /** Add a person of the deployment's own company, by personal code and country alone. Answers whether it was done. */
    async addDeploymentAdmin(input: { identityCode: string; country: string }): Promise<boolean> {
      if (!(await this.begin('add-admin'))) return false
      const mine = visit
      this.nobodyByCode = false
      try {
        await post(`${AREA}/admins`, input)
        if (mine !== visit) return true
        this.said = { kind: 'done', key: 'adminAdded' }
        await this.readDeploymentAdmins(mine)

        return true
      } catch (e) {
        if (mine !== visit) return false
        const met = this.meet(e)
        if (ended(met)) return false
        if (e instanceof ApiError && e.status === 404) this.nobodyByCode = true
        else if (met === 'unanswered') this.said = { kind: 'refused', key: 'unanswered' }
        else if (e instanceof ApiError && e.status === 422) this.said = { kind: 'refused', key: 'adminInvalid' }
        else if (e instanceof ApiError && e.status === 409) this.said = { kind: 'refused', key: 'adminNotAdded' }
        else this.said = { kind: 'refused', key: 'adminAddFailed' }

        return false
      } finally {
        if (mine === visit) this.busy = ''
      }
    },

    /**
     * Take a person off the list of the deployment's admins; they stay a person of the company.
     * Whoever is removed, the sign-in answer is read again afterwards: when the person looking
     * no longer manages the deployment the menu loses its group and the page is left; otherwise
     * the list is read again.
     */
    async removeDeploymentAdmin(userId: string) {
      if (!(await this.begin('remove-admin'))) return
      const mine = visit
      try {
        await del(`${AREA}/admins/${segment(userId)}`)
        if (mine !== visit) return
        // The sign-in answer is read again through the same comparison with the pinned person as an act: another
        // person drops the page, and the recorded list is read again only for the same one.
        const verdict = await this.lookAgain()
        if (mine !== visit) return
        if (verdict === 'failed') {
          this.deploymentAdmins = []
          this.deploymentAdminsState = 'failed'

          return
        }
        if (verdict === 'other') return
        if (!useAdminSession().managesDeployment) {
          // Not a person who manages the deployment now: the area says so in the page's place, never a page that hangs.
          this.refuseWhole(false)

          return
        }
        this.said = { kind: 'done', key: 'adminRemoved' }
        await this.readDeploymentAdmins(mine, true)
      } catch (e) {
        if (mine !== visit) return
        const met = this.meet(e)
        if (ended(met)) return
        this.said = { kind: 'refused', key: met === 'unanswered' ? 'unanswered' : e instanceof ApiError && e.status === 409 ? 'adminRemoveRefused' : 'adminRemoveFailed' }
        await this.readDeploymentAdmins(mine)
      } finally {
        if (mine === visit) this.busy = ''
      }
    },
  },
})
