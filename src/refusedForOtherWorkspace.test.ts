// A call refused because the page was opened for another workspace than the one the session is in
// now is answered by the page's notice alone: nothing a page draws changes because of it. The same
// views still draw every other refusal as they did.
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import { configbyteScreens } from './plugin'
import { adminRoutes } from './routes'
import type { AdminOptions } from './options'
import { useHistory } from './stores/history'
import { useDeployment } from './stores/deployment'
import { usePeople } from './stores/people'
import { useAdminSession } from './stores/session'
import { useTransfer } from './stores/transfer'
import { forgetOpenedWorkspace, OTHER_WORKSPACE, whenWorkspaceMoves } from './lib/workspace'
import PeopleAccessView from './views/PeopleAccessView.vue'
import SignInAgainPage from './views/deployment/SignInAgainPage.vue'

type Reply = { status: number; body: unknown }

const API = '/api/configbyte/v1'
const R = `${API}/sections/members`
const T = `${R}/tenants/W-1`
const AREA = `${API}/deployment`

const moved: Reply = { status: 409, body: { code: OTHER_WORKSPACE, title: 'This page was opened for another workspace.' } }
const plain409: Reply = { status: 409, body: { code: 'err:request:conflict', title: 'Conflict' } }
const ok = (body: unknown = {}): Reply => ({ status: 200, body })

const identity = {
  subject: 'sub:A',
  signedInAt: new Date().toISOString(),
  name: 'Anna Admin',
  loginMethod: 'webEid',
  loa: 'high',
  tenant: 'W-1',
  sections: { members: ['membership:admin'] },
  presentation: { displayName: 'Kalns', locale: 'en', personLocale: null, deploymentLocale: 'en' },
  deployment: { mode: 'saas', admin: true, firstRunOwed: false, signInAge: 900 },
}

const person = (over: Record<string, unknown>) => ({
  kind: 'person',
  status: 'active',
  administrator: false,
  arrival: false,
  serviceRoles: [],
  tenantRoles: [],
  userType: { id: 't-member', name: 'Member' },
  chartUserType: null,
  lastSignedInOn: null,
  ...over,
})

const members = () => [person({ id: 'm1', subjectKey: 'sub:A', displayName: 'Anna Admin', administrator: true }), person({ id: 'm2', subjectKey: 'sub:J', displayName: 'Jānis New', arrival: true })]

/** What every call is answered with; a rule returns undefined to let the call fall to the base answers. */
let rule: (method: string, url: string) => Reply | undefined = () => undefined
let seen: { method: string; url: string; headers: Record<string, string> }[] = []

const base = (method: string, url: string): Reply => {
  const key = `${method} ${url}`
  const answers: Record<string, Reply> = {
    [`GET ${API}/me`]: ok(identity),
    [`GET ${T}/access`]: ok({ members: members() }),
    [`GET ${T}/roles`]: ok({ roles: [{ id: 'r1', name: 'Picker', description: '', permissions: [] }] }),
    [`GET ${T}/user-types`]: ok({ userTypes: [{ id: 't-member', name: 'Member', description: '', permissions: [], corporateLoginDefault: false, workspaceDefault: true }] }),
    [`GET ${R}/config`]: ok({ schema: 'members-config/1', services: [] }),
    [`GET ${AREA}/companies`]: ok({ companies: [{ id: 'c1', name: 'Kalve Ltd', status: 'active', createdAt: new Date().toISOString(), own: false, products: [], administrators: 1, entered: true }] }),
    [`GET ${AREA}/products`]: ok({ products: [] }),
  }

  return answers[key] ?? { status: 404, body: { code: 'err:test:noSuchRoute' } }
}

function stub(next: typeof rule) {
  rule = next
  seen = []
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      seen.push({ method, url, headers: { ...((init?.headers ?? {}) as Record<string, string>) } })
      const reply = rule(method, url) ?? base(method, url)

      return { ok: reply.status < 400, status: reply.status, headers: new Headers(), json: async () => reply.body } as unknown as Response
    }),
  )
}

/** Every call is refused for another workspace, but the ones that ask who is signed in. */
const everythingMoved = (_method: string, url: string): Reply | undefined => (url === `${API}/me` ? undefined : moved)

async function settle(wrapper: { vm: { $nextTick: () => Promise<unknown> } }) {
  for (let pass = 0; pass < 8; pass += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()
  }
}

const options: AdminOptions = { product: 'host.product', never: 'host.never', sections: {}, carries: [], register: 'members', assistants: true }
const hostWords = { en: { host: { product: 'acme', never: 'never' } } }
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

let told = vi.fn()
const stops: (() => void)[] = []

beforeEach(() => {
  document.cookie = 'configbyte_csrf=tok-1'
  setActivePinia(createPinia())
  forgetOpenedWorkspace()
  told = vi.fn()
  stops.push(whenWorkspaceMoves(told))
})
afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.sessionStorage.clear()
})

function signedIn() {
  const session = useAdminSession()
  session.me = structuredClone(identity) as never
  session.order = ['members']
  session.resolved = true
  session.ways = [{ key: 'webEid', flow: 'code', name: 'eID' } as never]
  session.waysRead = true

  return session
}

async function open(component: unknown, at: string) {
  const pinia = createPinia()
  setActivePinia(pinia)
  signedIn()
  const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages: structuredClone(hostWords) })
  const router = createRouter({ history: createMemoryHistory(), routes: adminRoutes() })
  await router.push(at)
  await router.isReady()
  const wrapper = mount(component as never, { global: { plugins: [pinia, i18n, router, configbyteScreens(i18n, options)] } })
  await settle(wrapper)

  return { wrapper, router, pinia }
}

/** What a page draws for a refusal: an alert, a refused act line, an error state. */
const errorsDrawn = (wrapper: { findAll: (s: string) => unknown[] }) => ({
  alerts: wrapper.findAll('[role="alert"]').length,
  refused: wrapper.findAll('[data-outcome="refused"], [data-said="refused"]').length,
  failed: wrapper.findAll('[data-state$="failed"], [data-state="failed"]').length,
})
const NONE = { alerts: 0, refused: 0, failed: 0 }

describe('the page of People & access, with its read refused for another workspace', () => {
  it('draws no error state and keeps what it showed, and the notice is raised', async () => {
    stub(() => undefined)
    const { wrapper } = await open(PeopleAccessView, '/people')
    expect(wrapper.text()).toContain('Anna Admin')
    stub(everythingMoved)
    await usePeople().open({ section: 'members', tenant: 'W-1' })
    await settle(wrapper)
    expect(errorsDrawn(wrapper)).toEqual(NONE)
    expect(wrapper.text()).toContain('Anna Admin')
    expect(wrapper.text()).toContain('Jānis New')
    expect(told).toHaveBeenCalled()
  })

  it('a page that was loading stays as it was', async () => {
    stub(everythingMoved)
    const { wrapper } = await open(PeopleAccessView, '/people')
    expect(errorsDrawn(wrapper)).toEqual(NONE)
    expect(wrapper.text()).toContain('Reading who is in the workspace')
    expect(told).toHaveBeenCalled()
  })

  it('a real failure of one read is still drawn when another read beside it was refused for another workspace', async () => {
    stub((_method, url) => (url === `${T}/access` ? moved : url === `${T}/roles` ? { status: 500, body: { code: 'err:membership:broken' } } : undefined))
    const { wrapper } = await open(PeopleAccessView, '/people')
    expect(wrapper.find('[data-state="failed"]').exists()).toBe(true)
  })

  it('an administrator tick refused for another workspace is left as it was clicked, and a real refusal turns it back', async () => {
    stub((method, url) => (method === 'PUT' && url === `${T}/administrators/m2` ? moved : undefined))
    const { wrapper } = await open(PeopleAccessView, '/people/users/m2')
    await wrapper.get('[data-act="administrator"]').setValue(true)
    await settle(wrapper)
    expect((wrapper.get('[data-act="administrator"]').element as HTMLInputElement).checked).toBe(true)
    expect(errorsDrawn(wrapper)).toEqual(NONE)

    stub((method, url) => (method === 'PUT' && url === `${T}/administrators/m2` ? { status: 403, body: { code: 'err:membership:notMember' } } : undefined))
    const again = await open(PeopleAccessView, '/people/users/m2')
    await again.wrapper.get('[data-act="administrator"]').setValue(true)
    await settle(again.wrapper)
    expect((again.wrapper.get('[data-act="administrator"]').element as HTMLInputElement).checked).toBe(false)
  })

  it('the other reads of the visit (chart, fields, settings, assistants, connected apps) leave what is drawn as it was', async () => {
    stub(() => undefined)
    const { wrapper } = await open(PeopleAccessView, '/people')
    const people = usePeople()
    stub(everythingMoved)
    const before = JSON.stringify({ p: people.positions, f: people.fields, a: people.assistants, x: people.assistantsFailed, s: people.settings, apps: people.apps })
    people.positionsRead = false
    people.fieldsRead = false
    people.settingsRead = false
    people.assistantsRead = false
    await people.ensurePositions()
    await people.ensureFields(async () => (await fetch(`${T}/fields`).then((r) => (r.ok ? [] : Promise.reject(new Error('refused'))))) as never)
    await people.ensureAssistants()
    await people.readApps({ id: 'a1', subjectKey: 'sub:asst' } as never)
    await people.readSettings([{ key: 'creator', read: async () => Promise.reject(Object.assign(new Error('x'), { status: 409, code: OTHER_WORKSPACE })) } as never])
    expect(people.assistantsFailed).toBe('')
    expect(people.positions).toEqual(JSON.parse(before).p)
    expect(people.apps['sub:asst']).toEqual({ state: 'reading', lines: [] })
    expect(people.settings.creator).toEqual({ state: 'reading', roleId: '' })
    await settle(wrapper)
    expect(errorsDrawn(wrapper)).toEqual(NONE)
  })
})

describe('an act refused for another workspace', () => {
  async function openInvite() {
    const s = await open(PeopleAccessView, '/people')
    await s.wrapper.get('[data-act="invite-open"]').trigger('click')
    await settle(s.wrapper)
    await s.wrapper.get('#invite-name').setValue('Ilmārs Tests')
    await s.wrapper.get('#invite-code').setValue('030708-12348')
    const invite = s.wrapper.findAll('button').find((b) => norm(b.text()) === 'Invite')!
    await invite.trigger('click')
    await settle(s.wrapper)

    return s
  }

  it('the invite form draws no refusal line and keeps what was typed', async () => {
    stub((method, url) => (method === 'POST' && url === `${T}/people` ? moved : undefined))
    const { wrapper } = await openInvite()
    expect(seen.some((c) => c.method === 'POST' && c.url === `${T}/people`)).toBe(true)
    expect(errorsDrawn(wrapper)).toEqual(NONE)
    expect(wrapper.find('[data-note="invite-problem"]').exists()).toBe(false)
    expect((wrapper.get('#invite-name').element as HTMLInputElement).value).toBe('Ilmārs Tests')
    expect(wrapper.find('[data-block="invite"]').exists()).toBe(true)
    expect(told).toHaveBeenCalledTimes(1)
  })

  it('a plain 409 of the same invite still draws the conflict line', async () => {
    stub((method, url) => (method === 'POST' && url === `${T}/people` ? { status: 409, body: { code: 'err:membership:conflict' } } : undefined))
    const { wrapper } = await openInvite()
    expect(wrapper.get('[data-block="invite"] [data-said="refused"]').text()).toBe('A person with that personal code is already in this workspace.')
    expect(told).not.toHaveBeenCalled()
  })
})

describe('the mechanisms that turn a refused call into something drawn', () => {
  it('the people store’s act and its refusal reader say nothing, for every act', async () => {
    stub(() => undefined)
    const people = usePeople()
    await people.open({ section: 'members', tenant: 'W-1' })
    stub(everythingMoved)
    const m = people.members[0]!
    const results = [
      await people.deleteRole({ id: 'r1', name: 'Picker', description: '', permissions: [] }),
      await people.deleteUserType({ id: 't-member', name: 'Member', description: '', permissions: [], corporateLoginDefault: false, workspaceDefault: true } as never),
      await people.saveRole({ id: '', name: 'New', was: '', description: '', wasDescription: '', permissions: [], changed: false }),
      await people.invite({ displayName: 'A B', identityCode: '030708-12348', country: 'LV' }),
      await people.takeAll(m),
      await people.removeAssistant({ id: 'a1', subjectKey: 'sub:asst', name: 'Bot' } as never),
    ]
    expect(results.every((r) => !r)).toBe(true)
    expect(people.said).toBeNull()
    expect(told).toHaveBeenCalled()
  })

  it('showing a personal code refused for another workspace answers “moved”, which the panel draws nothing for', async () => {
    stub(() => undefined)
    const people = usePeople()
    await people.open({ section: 'members', tenant: 'W-1' })
    stub(everythingMoved)
    expect(await people.revealCode(people.members[0]!)).toEqual({ ok: false, why: 'moved' })
  })

  it('the area store’s refusal reader (meet) is answered “moved”, and no act of the area says anything', async () => {
    stub(() => undefined)
    signedIn()
    const area = useDeployment()
    area.pin()
    stub(everythingMoved)
    expect(area.meet(Object.assign(new Error('x'), { status: 409, code: OTHER_WORKSPACE }))).toBe('moved')
    await area.openList()
    expect([area.companiesState, area.productsState]).toEqual(['loading', 'loading'])
    expect([area.companiesFailure, area.productsFailure]).toEqual(['', ''])
    area.company = null
    await area.openCompany('c1')
    expect([area.companyState, area.companyFailure]).toEqual(['loading', ''])
    await area.openForm()
    expect([area.configurationsState, area.productsFailure]).toEqual(['loading', ''])
    await area.showAdministrators('c1')
    expect(area.administratorsState).toBe('loading')
    await area.invite('c1', { displayName: 'A B', identityCode: '030708-12348', country: 'LV' })
    await area.removeAdministrator('c1', 'u1')
    await area.applyConfiguration('c1', 'file')
    await area.setProduct('c1', 'basic', true)
    await area.addDeploymentAdmin({ identityCode: '030708-12348', country: 'LV' })
    await area.removeDeploymentAdmin('u1')
    await area.openNew({ name: 'N', language: 'en', products: [], administrator: { displayName: 'A B', identityCode: '030708-12348', country: 'LV' } } as never)
    await area.openDeploymentAdmins()
    expect(area.said).toBeNull()
    expect(area.deploymentAdminsState).toBe('loading')
    expect(area.nameTaken).toBe(false)
    expect(area.refusal).toBe('')
  })

  it('a read of who is signed in that is refused that way is “moved” and the area says nothing for it', async () => {
    stub(() => undefined)
    const session = signedIn()
    const area = useDeployment()
    area.pin()
    stub(() => moved)
    expect(await session.reread('sub:A')).toBe('moved')
    expect(await area.guardPerson()).toBe(false)
    expect(area.said).toBeNull()
  })

  it('the history store’s page read, the transfer store’s export, preview and apply, and a language pick say nothing', async () => {
    stub(() => undefined)
    const session = signedIn()
    stub(everythingMoved)
    const history = useHistory()
    history.open({ register: 'members', sources: [], actor: '' })
    await history.ensure(() => true)
    expect(history.streams.map((s) => [s.failed, s.reason, s.status, s.lines.length])).toEqual([['', '', 0, 0]])
    const transfer = useTransfer()
    await transfer.exportNow()
    expect(transfer.exportFailed).toBe('')
    transfer.fileText = '{}'
    await transfer.previewNow()
    expect(transfer.stop).toBeNull()
    await session.setLanguage('lv')
    expect(session.languageFailed).toBe(false)
  })
})

describe('every view the screens’ routes can mount, with every call refused for another workspace', () => {
  const addresses = (): { path: string; load: () => Promise<{ default: unknown }> }[] => {
    const found: { path: string; load: () => Promise<{ default: unknown }> }[] = []
    for (const route of adminRoutes()) {
      if (typeof route.component === 'function') found.push({ path: route.path.replace(/:\w+/g, 'x1'), load: route.component as never })
      for (const child of route.children ?? []) {
        // A child's place draws nothing: its parent screen draws the place, from the route's name.
        if (typeof route.component === 'function') found.push({ path: `${route.path}/${child.path}`.replace(/:\w+/g, 'x1'), load: route.component as never })
      }
    }

    return found
  }

  it('draws no error state, no alert and no refused line', async () => {
    const list = addresses()
    // Export / Import, History, the four pages of the area and People & access with its eight places.
    expect(list.length).toBeGreaterThanOrEqual(15)
    for (const view of list) {
      stub(everythingMoved)
      const { wrapper } = await open((await view.load()).default, view.path)
      expect({ path: view.path, ...errorsDrawn(wrapper) }).toEqual({ path: view.path, ...NONE })
      wrapper.unmount()
    }
  })

  it('the same views with a plain 409 still draw what they drew: a conflict, the last deployment administrator’s refusal', async () => {
    stub((method, url) => (method === 'POST' && url === `${AREA}/companies/c1/administrators` ? plain409 : undefined))
    signedIn()
    const area = useDeployment()
    area.pin()
    await area.invite('c1', { displayName: 'A B', identityCode: '030708-12348', country: 'LV' })
    expect(area.said).toEqual({ kind: 'refused', key: 'inviteConflict' })
    expect(told).not.toHaveBeenCalled()

    stub((method) => (method !== 'GET' ? { status: 409, body: { code: 'err:membership:last_deployment_admin' } } : undefined))
    const people = usePeople()
    people.section = 'members'
    people.tenant = 'W-1'
    await people.open({ section: 'members', tenant: 'W-1' })
    await people.takeAll(people.members[0]!)
    expect(people.said).toMatchObject({ kind: 'refused', key: 'lastDeploymentAdmin' })
    expect(told).not.toHaveBeenCalled()
  })
})

describe('a refusal with another status', () => {
  it.each([500, 403])('%s on the read of People & access still draws its error state', async (status) => {
    stub((_method, url) => (url === `${T}/access` ? { status, body: { code: 'err:membership:broken' } } : undefined))
    const { wrapper } = await open(PeopleAccessView, '/people')
    expect(wrapper.find('[data-state="failed"]').exists()).toBe(true)
    expect(told).not.toHaveBeenCalled()
  })
})

describe('signing in again keeps no company’s id in the browser’s storage', () => {
  async function again(at: string) {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    stub((method, url) => (method === 'POST' && url === `${API}/login/start` ? ok({ authorizeUrl: 'https://auth.example.test/authorize' }) : undefined))
    const s = await open(SignInAgainPage, at)
    await s.wrapper.get('[data-act="sign-in-again"]').trigger('click')
    await settle(s.wrapper)
    expect(assign).toHaveBeenCalled()

    return s
  }
  const everythingStored = () => JSON.stringify(Object.fromEntries(Object.keys(window.sessionStorage).map((k) => [k, window.sessionStorage.getItem(k)])))

  it('on a company’s page the kept address is the companies’ list and nothing stored holds the id', async () => {
    await again('/deployment/companies/01KCOMPANYIDENTIFIER')
    expect(window.sessionStorage.getItem('configbyte.return')).toBe('/deployment/companies')
    expect(everythingStored()).not.toContain('01KCOMPANYIDENTIFIER')
  })

  it('on a page without parameters the kept address is that page’s, as today', async () => {
    await again('/deployment/companies')
    expect(window.sessionStorage.getItem('configbyte.return')).toBe('/deployment/companies')
    window.sessionStorage.clear()
    await again('/deployment/companies/new')
    expect(window.sessionStorage.getItem('configbyte.return')).toBe('/deployment/companies/new')
  })
})
