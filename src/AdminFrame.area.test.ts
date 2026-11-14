// The admin app's frame and the deployment's own area together: the first run that
// comes before any menu, and signing in again at both moments, in this tab and in a new
// one, with the rule that nothing typed is ever stored.
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import AdminFrame from './AdminFrame.vue'
import type { AdminOptions } from './options'
import { configbyteScreens } from './plugin'
import { adminRoutes } from './routes'
import { useDeployment } from './stores/deployment'

type Reply = { status: number; body: unknown; held?: Promise<unknown> }
interface Call {
  method: string
  url: string
  body: unknown
}

const API = '/api/configbyte/v1'
const AREA = `${API}/deployment`

const options: AdminOptions = {
  product: 'host.product',
  never: 'host.never',
  sections: { orders: { title: 'host.orders', configures: ['orders/setup:import'] } },
  carries: [],
}
const hostWords = { en: { host: { product: 'acme', never: 'never', orders: 'Orders' } }, lv: { host: { product: 'acme', never: 'nekad', orders: 'Pasūtījumi' } } }

const state = (extra: Record<string, unknown> = {}) => ({ mode: 'saas', admin: true, firstRunOwed: false, signInAge: 900, ...extra })

/** The sign-in answer: signed in `ago` seconds before now, unless told another time. */
const me = (extra: Record<string, unknown> = {}, ago = 5) => ({
  subject: 'sub:A',
  name: 'Anna Admin',
  loginMethod: 'webEid',
  loa: 'high',
  tenant: 'W-1',
  signedInAt: new Date(Date.now() - ago * 1000).toISOString(),
  sections: { orders: [] },
  presentation: { displayName: 'Kalns', locale: 'en', personLocale: null, deploymentLocale: 'en' },
  deployment: state(),
  ...extra,
})

const sectionsBody = { sections: [{ section: 'orders', schema: 'orders-config/1', refersTo: [] }] }
const ways = { ways: [{ key: 'webEid', flow: 'card', name: 'eID' }, { key: 'upstream', flow: 'redirect', name: 'Microsoft Entra' }] }
const ok = (body: unknown = {}): Reply => ({ status: 200, body })

const digits = Array.from({ length: 11 }, (_, i) => String((i * 7 + 3) % 10)).join('')
const shownCode = `${digits.slice(0, 6)}-${digits.slice(6)}`

let calls: Call[] = []
let answers: Record<string, Reply[]> = {}

function stub(extra: Record<string, Reply | Reply[]> = {}) {
  calls = []
  const base: Record<string, Reply | Reply[]> = {
    [`GET ${API}/me`]: ok(me()),
    [`GET ${API}/sections`]: ok(sectionsBody),
    [`GET ${API}/login/ways`]: ok(ways),
    [`GET ${AREA}/companies`]: ok({ companies: [] }),
    [`GET ${AREA}/products`]: ok({ products: [{ key: 'basic', displayName: 'Basic', offered: true, needs: [] }] }),
    [`GET ${AREA}/configurations`]: ok({ configurations: [] }),
  }
  answers = Object.fromEntries(Object.entries({ ...base, ...extra }).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]))
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({ method, url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined })
      const queue = answers[`${method} ${url}`] ?? [{ status: 404, body: {} }]
      const reply = queue.length > 1 ? queue.shift()! : queue[0]!
      if (reply.held) await reply.held
      if (reply.status === 0) throw new TypeError('Failed to fetch')

      return { ok: reply.status < 400, status: reply.status, headers: new Headers(), json: async () => reply.body } as unknown as Response
    }),
  )
}

/** A channel between the tabs of the browser: a message posted on one is heard by every other of the same name. */
class FakeChannel {
  static all: FakeChannel[] = []
  static posted: unknown[] = []
  onmessage: ((e: { data: unknown }) => void) | null = null
  constructor(public name: string) {
    FakeChannel.all.push(this)
  }
  postMessage(data: unknown) {
    FakeChannel.posted.push(data)
    for (const other of FakeChannel.all) if (other !== this && other.name === this.name) queueMicrotask(() => other.onmessage?.({ data }))
  }
  close() {
    FakeChannel.all = FakeChannel.all.filter((c) => c !== this)
  }
}

let drawn: VueWrapper[] = []

async function render(at = '/') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: adminRoutes() })
  await router.push(at)
  await router.isReady()
  const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages: structuredClone(hostWords) })
  const wrapper = mount(AdminFrame, {
    attachTo: document.body,
    slots: { mark: '<svg data-mark />' },
    global: { plugins: [pinia, router, i18n, configbyteScreens(i18n, options)] },
  })
  drawn.push(wrapper)
  await settle(wrapper)

  return { wrapper, router, pinia }
}

async function settle(wrapper: { vm: { $nextTick: () => Promise<unknown> } }) {
  for (let pass = 0; pass < 8; pass += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flushPromises()
    await wrapper.vm.$nextTick()
  }
}

type W = VueWrapper
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const writes = () => calls.filter((c) => c.method !== 'GET')
const reads = (url: string) => calls.filter((c) => c.method === 'GET' && c.url === url).length
const arrives = (router: { currentRoute: { value: { path: string } } }, path: string) =>
  vi.waitFor(() => expect(router.currentRoute.value.path).toBe(path), { timeout: 8000 })
const stored = (storage: Storage) => JSON.stringify({ ...storage })
/** After any flow: the tab's storage holds at most the address to return to and the sign-in tab's mark, and nothing typed. */
function onlyWhatIsAllowed() {
  expect(Object.keys(window.sessionStorage).every((k) => ['configbyte.return', 'configbyte.sign-in-tab'].includes(k))).toBe(true)
  expect(window.localStorage.length).toBe(0)
  const kept = stored(window.sessionStorage) + stored(window.localStorage)
  for (const value of ['Kalve Ltd', 'Ilze Bērziņa', 'Hostings Ltd', shownCode, digits, 'Anna Admin', 'Other Person']) expect(kept).not.toContain(value)
}

beforeEach(() => {
  document.cookie = 'configbyte_csrf=tok-1'
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.history.replaceState({}, '', '/')
  FakeChannel.all = []
  FakeChannel.posted = []
  vi.stubGlobal('BroadcastChannel', FakeChannel)
})
afterEach(() => {
  for (const wrapper of drawn) wrapper.unmount()
  drawn = []
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('The first run', () => {
  const owed = (mode = 'saas') => ({ [`GET ${API}/me`]: ok(me({ sections: {}, deployment: state({ mode, firstRunOwed: true }) })) })
  const fill = async (wrapper: W, name = 'Hostings Ltd') => wrapper.get('#first-run-name').setValue(name)
  const press = async (wrapper: W) => {
    await wrapper.get('[data-act="first-run"]').trigger('click')
    await settle(wrapper)
  }

  it('is a page in place of everything, with no menu, in the words of a deployment for many companies', async () => {
    stub(owed())
    const { wrapper } = await render()
    expect(wrapper.get('[data-page="first-run"]').attributes('data-mode')).toBe('saas')
    expect(wrapper.get('h1').text()).toBe('The company that runs this deployment')
    expect(wrapper.find('nav').exists()).toBe(false)
    expect(wrapper.find('[data-state="nothing"]').exists()).toBe(false)
    expect(calls.filter((c) => c.url.startsWith(AREA))).toEqual([])
  })

  it('is the same page in the words of a deployment for one company', async () => {
    stub(owed('local'))
    const { wrapper } = await render()
    expect(wrapper.get('[data-page="first-run"]').attributes('data-mode')).toBe('local')
    expect(wrapper.get('h1').text()).toBe('Set up your company')
    expect(wrapper.get('[data-note="lead"]').text()).toContain('This deployment serves one company')
  })

  it('sends the name and the language once, reads who is signed in again, and opens Companies with the line that the company is set up', async () => {
    stub({
      ...owed(),
      // The first answer opens the page, the second is the check before the act, the third is read after it.
      [`GET ${API}/me`]: [ok(me({ sections: {}, deployment: state({ firstRunOwed: true }) })), ok(me({ sections: {}, deployment: state({ firstRunOwed: true }) })), ok(me({ sections: {}, deployment: state() }))],
      [`POST ${AREA}/first-run`]: ok({ company: { id: 'c1', name: 'Hostings Ltd' }, roles: [], missing: [], products: [] }),
      [`GET ${AREA}/companies`]: ok({ companies: [{ id: 'c1', name: 'Hostings Ltd', status: 'active', createdAt: new Date().toISOString(), own: true, products: [], administrators: 1, entered: true }] }),
    })
    const { wrapper, router } = await render()
    await fill(wrapper)
    await press(wrapper)
    expect(writes()).toEqual([{ method: 'POST', url: `${AREA}/first-run`, body: { name: 'Hostings Ltd', language: 'en' } }])
    expect(reads(`${API}/me`)).toBe(3)
    await arrives(router, '/deployment/companies')
    await settle(wrapper)
    expect(wrapper.find('[data-page="first-run"]').exists()).toBe(false)
    expect(wrapper.get('[data-line="first-run"]').text()).toBe('«Hostings Ltd» is set up. Its starting roles are made.')
    expect(wrapper.get('h1').text()).toBe('Companies')
  })

  it('opens the app as for any administrator, with its line and no group, on a deployment for one company', async () => {
    stub({
      [`GET ${API}/me`]: [
        ok(me({ sections: {}, deployment: state({ mode: 'local', admin: false, firstRunOwed: true }) })),
        ok(me({ sections: {}, deployment: state({ mode: 'local', admin: false, firstRunOwed: true }) })),
        ok(me({ sections: { orders: ['orders/setup:import'] }, deployment: state({ mode: 'local', admin: false }) })),
      ],
      [`POST ${AREA}/first-run`]: ok({ company: { id: 'c1', name: 'Kalve Ltd' }, missing: [] }),
    })
    const { wrapper, router } = await render()
    await fill(wrapper, 'Kalve Ltd')
    await press(wrapper)
    expect(router.currentRoute.value.name).toBe('configbyte-export-import')
    expect(wrapper.get('[data-line="first-run"]').text()).toContain('«Kalve Ltd» is set up.')
    expect(wrapper.text()).not.toContain('Deployment admins')
  })

  it.each([
    ['empty', ''],
    ['spaces only', '   '],
  ])('does not send a name that is %s, and says a name is needed', async (_case, name) => {
    stub(owed())
    const { wrapper } = await render()
    await fill(wrapper, name)
    await press(wrapper)
    expect(writes()).toEqual([])
    expect(wrapper.text()).toContain('A name is needed.')
  })

  it('sends a name of 200 characters, and does not send one of 201, saying its limit', async () => {
    stub({ ...owed(), [`POST ${AREA}/first-run`]: ok({ company: { name: 'x' }, missing: [] }) })
    const { wrapper } = await render()
    await fill(wrapper, 'x'.repeat(201))
    await press(wrapper)
    expect(writes()).toEqual([])
    expect(wrapper.text()).toContain('A name is at most 200 characters.')
    await fill(wrapper, 'x'.repeat(200))
    await press(wrapper)
    expect(writes()).toHaveLength(1)
  })

  it('sends the name trimmed', async () => {
    stub({ ...owed(), [`POST ${AREA}/first-run`]: ok({ company: { name: 'x' }, missing: [] }) })
    const { wrapper } = await render()
    await fill(wrapper, '  Hostings Ltd  ')
    await press(wrapper)
    expect((writes()[0]!.body as { name: string }).name).toBe('Hostings Ltd')
  })

  it('says the services are still starting for the code of services not declared, keeps the form, offers to try again and changes nothing else', async () => {
    stub({ ...owed(), [`POST ${AREA}/first-run`]: { status: 409, body: { code: 'err:membership:not_declared', detail: 'the register’s own sentence' } } })
    const { wrapper } = await render()
    await fill(wrapper)
    await press(wrapper)
    expect(wrapper.get('[data-band="starting"]').text()).toContain('The services of this deployment are still starting')
    expect(wrapper.text()).not.toContain('the register’s own sentence')
    expect((wrapper.get('#first-run-name').element as HTMLInputElement).value).toBe('Hostings Ltd')
    expect(wrapper.get('[data-act="first-run"]').text()).toBe('Try again')
    // Only the check before the act: nothing else was read.
    expect(reads(`${API}/me`)).toBe(2)
    expect(wrapper.find('[data-page="first-run"]').exists()).toBe(true)
  })

  it('treats a company already set up as done: who is signed in is read again and the app opens', async () => {
    stub({
      [`GET ${API}/me`]: [
        ok(me({ sections: {}, deployment: state({ firstRunOwed: true }) })),
        ok(me({ sections: {}, deployment: state({ firstRunOwed: true }) })),
        ok(me({ sections: { orders: ['orders/setup:import'] }, deployment: state() })),
      ],
      [`POST ${AREA}/first-run`]: { status: 409, body: { code: 'err:membership:conflict' } },
    })
    const { wrapper } = await render()
    await fill(wrapper)
    await press(wrapper)
    expect(reads(`${API}/me`)).toBe(3)
    expect(wrapper.find('[data-page="first-run"]').exists()).toBe(false)
  })

  it('sends one request for two presses', async () => {
    let release: () => void = () => {}
    const wait = new Promise<void>((resolve) => {
      release = resolve
    })
    stub({ ...owed(), [`POST ${AREA}/first-run`]: { ...ok({ company: { name: 'x' }, missing: [] }), held: wait } })
    const { wrapper } = await render()
    await fill(wrapper)
    await wrapper.get('[data-act="first-run"]').trigger('click')
    await wrapper.get('[data-act="first-run"]').trigger('click')
    await settle(wrapper)
    expect(writes()).toHaveLength(1)
    expect((wrapper.get('[data-act="first-run"]').element as HTMLButtonElement).disabled).toBe(true)
    release()
    await settle(wrapper)
    expect(writes()).toHaveLength(1)
  })

  it('says only the person the deployment names can set it up, keeps the form and draws nothing of the deployment, for a 403', async () => {
    stub({ ...owed(), [`POST ${AREA}/first-run`]: { status: 403, body: { code: 'err:request:forbidden', detail: 'the register’s own sentence' } } })
    const { wrapper } = await render()
    await fill(wrapper)
    await press(wrapper)
    expect(wrapper.get('[data-line="said"]').text()).toBe('Only the person this deployment names can set it up.')
    expect(wrapper.text()).not.toContain('the register’s own sentence')
    expect((wrapper.get('#first-run-name').element as HTMLInputElement).value).toBe('Hostings Ltd')
    expect(wrapper.find('nav').exists()).toBe(false)
    expect(wrapper.find('[data-refusal]').exists()).toBe(false)
  })

  it('puts the line of the old sign-in over the form, kept, for a sign-in too old, and the closing page for one not strong enough', async () => {
    stub({ ...owed(), [`POST ${AREA}/first-run`]: { status: 403, body: { code: 'err:session:signInTooOld' } } })
    const first = await render()
    await fill(first.wrapper)
    await press(first.wrapper)
    expect(first.wrapper.get('[data-refusal="tooOld"]').text()).toContain('no older than 15 minutes')
    expect((first.wrapper.get('#first-run-name').element as HTMLInputElement).value).toBe('Hostings Ltd')
    first.wrapper.unmount()

    stub({ ...owed(), [`POST ${AREA}/first-run`]: { status: 403, body: { code: 'err:session:assuranceTooLow' } } })
    const second = await render()
    await fill(second.wrapper)
    await press(second.wrapper)
    expect(second.wrapper.find('[data-closed="assurance"]').exists()).toBe(true)
  })

  describe.each([['saas'], ['local']])('with a sign-in too old, on a deployment of mode %s, for a person who manages nothing yet', (mode) => {
    const nobody = (ago = 5) => ok(me({ sections: {}, deployment: state({ mode, admin: false, firstRunOwed: true }) }, ago))
    const tooOld = { status: 403, body: { code: 'err:session:signInTooOld' } }

    it('says so, keeps the name typed, offers to sign in again in a new tab, and sends nothing more', async () => {
      stub({ [`GET ${API}/me`]: nobody(), [`POST ${AREA}/first-run`]: tooOld })
      const { wrapper } = await render()
      await fill(wrapper, 'Hostings Ltd')
      await press(wrapper)
      expect(wrapper.get('[data-refusal="tooOld"]').text()).toContain('no older than 15 minutes')
      expect(wrapper.find('[data-act="sign-in-new-tab"]').exists()).toBe(true)
      expect((wrapper.get('#first-run-name').element as HTMLInputElement).value).toBe('Hostings Ltd')
      expect(wrapper.find('[data-page="first-run"]').exists()).toBe(true)
      // Neither the area's refusal of a person who manages nothing, nor a button that comes back saying nothing.
      expect(wrapper.find('[data-refusal="notAdmin"]').exists()).toBe(false)
      await settle(wrapper)
      expect(writes()).toHaveLength(1)
    })

    it('lets the button be pressed again once the same person has signed in again, and sends it once', async () => {
      vi.stubGlobal('open', vi.fn())
      stub({
        [`GET ${API}/me`]: [nobody(), nobody(), nobody(1)],
        [`POST ${AREA}/first-run`]: [tooOld, ok({ company: { name: 'Hostings Ltd' }, missing: [] })],
      })
      const { wrapper } = await render()
      await fill(wrapper, 'Hostings Ltd')
      await press(wrapper)
      await wrapper.get('[data-act="sign-in-new-tab"]').trigger('click')
      window.dispatchEvent(new Event('focus'))
      await settle(wrapper)
      expect(wrapper.find('[data-refusal="tooOld"]').exists()).toBe(false)
      expect(wrapper.get('[data-line="said"]').text()).toBe('You signed in again. Press the button once more.')
      expect(writes()).toHaveLength(1)
      await press(wrapper)
      expect(writes()).toHaveLength(2)
    })

    it('still says a plain refusal as it always has', async () => {
      stub({ [`GET ${API}/me`]: nobody(), [`POST ${AREA}/first-run`]: { status: 403, body: { code: 'err:request:forbidden' } } })
      const { wrapper } = await render()
      await fill(wrapper, 'Hostings Ltd')
      await press(wrapper)
      expect(wrapper.get('[data-line="said"]').text()).toBe('Only the person this deployment names can set it up.')
      expect(wrapper.find('[data-refusal]').exists()).toBe(false)
      expect((wrapper.get('#first-run-name').element as HTMLInputElement).value).toBe('Hostings Ltd')
    })
  })

  it('adds one sentence to the line when some starting roles could not be made, and gives no button to repair them', async () => {
    stub({
      [`GET ${API}/me`]: [ok(me({ sections: {}, deployment: state({ firstRunOwed: true }) })), ok(me({ sections: {}, deployment: state({ firstRunOwed: true }) })), ok(me({ deployment: state() }))],
      [`POST ${AREA}/first-run`]: ok({ company: { id: 'c1', name: 'Hostings Ltd' }, missing: ['worker'] }),
    })
    const { wrapper } = await render()
    await fill(wrapper)
    await press(wrapper)
    await settle(wrapper)
    expect(wrapper.get('[data-line="first-run"]').text()).toBe('«Hostings Ltd» is set up. Its starting roles are made. Some starting roles could not be made yet.')
    expect(wrapper.findAll('button').some((b) => /repair|roles/i.test(b.text()) && !/Sign out/.test(b.text()))).toBe(false)
  })

  it('keeps what was typed nowhere once it was sent', async () => {
    stub({ ...owed(), [`POST ${AREA}/first-run`]: ok({ company: { name: '' }, missing: [] }) })
    const { wrapper, pinia } = await render()
    await fill(wrapper, 'Zeta Ltd')
    await press(wrapper)
    const kept = JSON.stringify(useDeployment(pinia).$state) + stored(window.localStorage) + stored(window.sessionStorage)
    expect(kept).not.toContain('Zeta Ltd')
  })
})

describe('Signing in again › entering the area', () => {
  const T = Date.parse('2026-11-12T10:00:00Z')
  const withAge = (seconds: number | null, ago: number | null) =>
    ok(me({ signedInAt: ago === null ? null : new Date(T - ago * 1000).toISOString(), deployment: state({ signInAge: seconds }) }))

  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(T)
  })

  it.each([
    [899, true],
    [900, true],
    [901, false],
  ])('with an age of 900 seconds, a sign-in %s seconds old opens the area: %s', async (ago, opens) => {
    stub({ [`GET ${API}/me`]: withAge(900, ago) })
    const { wrapper } = await render('/deployment/companies')
    expect(wrapper.find('[data-page="sign-in-again"]').exists()).toBe(!opens)
    expect(reads(`${AREA}/companies`)).toBe(opens ? 1 : 0)
    if (!opens) {
      expect(wrapper.get('h1').text()).toBe('Sign in again to manage the deployment')
      expect(wrapper.get('[data-note="lead"]').text()).toContain('no older than 15 minutes')
      expect(wrapper.get('[data-note="lead"]').text()).toContain('You signed in')
      expect(calls.filter((c) => c.url.startsWith(AREA))).toEqual([])
    }
  })

  it('shows the page when the age is set and the time of the sign-in is not known', async () => {
    stub({ [`GET ${API}/me`]: withAge(900, null) })
    const { wrapper } = await render('/deployment/companies')
    expect(wrapper.find('[data-page="sign-in-again"]').exists()).toBe(true)
    expect(wrapper.get('[data-note="lead"]').text()).toContain('The time of your sign-in is not known.')
    expect(calls.filter((c) => c.url.startsWith(AREA))).toEqual([])
  })

  it('never shows the page when no age is set, however old the sign-in or unknown its time', async () => {
    stub({ [`GET ${API}/me`]: withAge(null, null) })
    const { wrapper } = await render('/deployment/companies')
    expect(wrapper.find('[data-page="sign-in-again"]').exists()).toBe(false)
    expect(reads(`${AREA}/companies`)).toBe(1)
  })

  it('starts a recent sign-in the way the person used, keeps the address in this tab, and sends the browser to the sign-in', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    stub({
      [`GET ${API}/me`]: withAge(900, 5000),
      [`POST ${API}/login/start`]: ok({ authorizeUrl: 'https://auth.example.test/authorize' }),
    })
    const { wrapper } = await render('/deployment/companies')
    await wrapper.get('[data-act="sign-in-again"]').trigger('click')
    await settle(wrapper)
    expect(writes()).toEqual([{ method: 'POST', url: `${API}/login/start`, body: { method: 'webEid', recent: true } }])
    expect(window.sessionStorage.getItem('configbyte.return')).toBe('/deployment/companies')
    expect(assign).toHaveBeenCalledWith('https://auth.example.test/authorize')
  })

  it('offers the ways when the way the person used is not among them, each starting a recent sign-in', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    stub({
      [`GET ${API}/me`]: ok(me({ loginMethod: 'smartId', signedInAt: new Date(T - 5000 * 1000).toISOString() })),
      [`POST ${API}/login/start`]: ok({ authorizeUrl: 'https://auth.example.test/authorize' }),
    })
    const { wrapper } = await render('/deployment/companies')
    expect(wrapper.find('[data-act="sign-in-again"]').exists()).toBe(false)
    expect(wrapper.get('[data-note="ways"]').text()).toContain('is not offered here any more')
    expect(wrapper.findAll('[data-way]').map((b) => b.text())).toEqual(['eID', 'Microsoft Entra'])
    await wrapper.get('[data-way="upstream"]').trigger('click')
    await settle(wrapper)
    expect(writes()).toEqual([{ method: 'POST', url: `${API}/login/start`, body: { method: 'upstream', recent: true } }])
  })
})

describe('Signing in again › the return', () => {
  it('opens the kept address, which is one of the app’s own, and removes what was kept', async () => {
    window.sessionStorage.setItem('configbyte.return', '/deployment/companies/c1')
    stub({
      [`GET ${AREA}/companies/c1`]: ok({ company: { id: 'c1', name: 'Kalve Ltd', status: 'active', createdAt: new Date().toISOString(), own: false, products: [], administrators: 1, entered: true } }),
    })
    const { router } = await render('/')
    await arrives(router, '/deployment/companies/c1')
    expect(window.sessionStorage.getItem('configbyte.return')).toBeNull()
    onlyWhatIsAllowed()
  })

  it.each([
    ['another site’s address', 'https://evil.example.test/x'],
    ['an address that leaves the site by its slashes', '//evil.example.test/x'],
    ['an address the app has no route for', '/nowhere/at/all/zz'],
    ['text that is no address', 'javascript:alert(1)'],
  ])('ignores a kept value that is %s, opens the companies, and removes it', async (_case, kept) => {
    window.sessionStorage.setItem('configbyte.return', kept)
    stub()
    const { router } = await render('/')
    await arrives(router, '/deployment/companies')
    expect(window.sessionStorage.getItem('configbyte.return')).toBeNull()
  })

  it('does not go anywhere when the sign-in came back unfinished, but still removes what was kept', async () => {
    window.sessionStorage.setItem('configbyte.return', '/deployment/companies')
    window.history.replaceState({}, '', '/?error=cancelled')
    stub({ [`GET ${API}/me`]: ok(me({ sections: { orders: ['orders/setup:import'] } })) })
    const { router, wrapper } = await render('/')
    expect(window.sessionStorage.getItem('configbyte.return')).toBeNull()
    expect(router.currentRoute.value.name).toBe('configbyte-export-import')
    expect(wrapper.text()).toContain('Export & import')
  })
})

describe('Signing in again › in the middle of an act', () => {
  const filled = async (wrapper: W) => {
    await wrapper.get('#open-name').setValue('Kalve Ltd')
    await wrapper.get('#open-person').setValue('Ilze Bērziņa')
    await wrapper.get('#open-code').setValue(shownCode)
  }
  const press = async (wrapper: W) => {
    await wrapper.get('[data-act="open"]').trigger('click')
    await settle(wrapper)
  }
  const tooOld = { status: 403, body: { code: 'err:session:signInTooOld' } }
  /** The page opens on the first answer, the act is checked on the second; the later ones are what the server says after. */
  const later = (extra: Record<string, unknown> = {}) => ok(me(extra, 1))
  // Built when a test asks, never when the file loads: in a long run the file's load is seconds behind the test.
  const recentMe = () => later()

  async function stuck(extra: Record<string, Reply | Reply[]> = {}) {
    stub({ [`POST ${AREA}/companies`]: tooOld, ...extra })
    const open = vi.fn()
    vi.stubGlobal('open', open)
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload, assign: vi.fn() })
    const shown = await render('/deployment/companies/new')
    await filled(shown.wrapper)
    await press(shown.wrapper)

    return { ...shown, open, reload }
  }

  it('leaves the page as it is and puts a line over it, with every field as it was and nothing sent again by itself', async () => {
    const { wrapper } = await stuck()
    expect(wrapper.get('[data-refusal="tooOld"]').text()).toContain('no older than 15 minutes')
    expect((wrapper.get('#open-name').element as HTMLInputElement).value).toBe('Kalve Ltd')
    expect((wrapper.get('#open-person').element as HTMLInputElement).value).toBe('Ilze Bērziņa')
    expect((wrapper.get('#open-code').element as HTMLInputElement).value).not.toBe('')
    await settle(wrapper)
    expect(writes()).toHaveLength(1)
  })

  it('opens the sign-in tab, at an address of its own, without a reference back, on the press', async () => {
    const { wrapper, open } = await stuck()
    await wrapper.get('[data-act="sign-in-new-tab"]').trigger('click')
    expect(open).toHaveBeenCalledWith('/deployment/sign-in-again', '_blank', 'noopener')
  })

  it('answers a sign-in not strong enough with the closing page the app has', async () => {
    stub({ [`POST ${AREA}/companies`]: { status: 403, body: { code: 'err:session:assuranceTooLow' } } })
    const { wrapper } = await render('/deployment/companies/new')
    await filled(wrapper)
    await press(wrapper)
    expect(wrapper.find('[data-closed="assurance"]').exists()).toBe(true)
  })

  it('reads who is signed in again when the page is looked at again, says the sign-in is recent, and sends the act once when it is pressed again', async () => {
    const { wrapper } = await stuck({
      [`GET ${API}/me`]: [ok(me()), ok(me()), recentMe()],
      [`POST ${AREA}/companies`]: [tooOld, { status: 201, body: { company: { id: 'c9', name: 'Kalve Ltd', status: 'active', createdAt: new Date().toISOString(), entered: false } } }],
    })
    await wrapper.get('[data-act="sign-in-new-tab"]').trigger('click')
    window.dispatchEvent(new Event('focus'))
    // Wait for the read this test expects, never a fixed time: a loaded machine answers later.
    await vi.waitFor(() => expect(reads(`${API}/me`)).toBe(3), { timeout: 8000 })
    await settle(wrapper)
    expect(reads(`${API}/me`)).toBe(3)
    expect(wrapper.find('[data-refusal="tooOld"]').exists()).toBe(false)
    expect(wrapper.get('[data-line="said"]').text()).toBe('You signed in again. Press the button once more.')
    expect(writes()).toHaveLength(1)
    await press(wrapper)
    expect(writes()).toHaveLength(2)
  })

  it('is told by the sign-in tab, in this browser, and reads who is signed in again', async () => {
    const { wrapper } = await stuck({ [`GET ${API}/me`]: [ok(me()), ok(me()), recentMe()] })
    await wrapper.get('[data-act="sign-in-new-tab"]').trigger('click')
    new FakeChannel('configbyte-sign-in').postMessage('signed-in')
    // Wait for the read this test expects, never a fixed time: a loaded machine answers later.
    await vi.waitFor(() => expect(reads(`${API}/me`)).toBe(3), { timeout: 8000 })
    await settle(wrapper)
    expect(reads(`${API}/me`)).toBe(3)
    expect(wrapper.get('[data-line="said"]').text()).toContain('You signed in again.')
  })

  it('keeps its line when the sign-in answer says the sign-in is still old', async () => {
    const { wrapper } = await stuck({ [`GET ${API}/me`]: [ok(me()), ok(me()), ok(me({}, 5000))] })
    await wrapper.get('[data-act="sign-in-new-tab"]').trigger('click')
    window.dispatchEvent(new Event('focus'))
    await settle(wrapper)
    expect(wrapper.find('[data-refusal="tooOld"]').exists()).toBe(true)
    expect(wrapper.find('[data-line="said"]').exists()).toBe(false)
  })

  it('drops everything and loads the app again, sending nothing, when a different person signed in in the new tab', async () => {
    const { wrapper, reload, pinia } = await stuck({ [`GET ${API}/me`]: [ok(me()), ok(me()), ok(me({ subject: 'sub:B', name: 'Other Person' }))] })
    await wrapper.get('[data-act="sign-in-new-tab"]').trigger('click')
    window.dispatchEvent(new Event('focus'))
    await settle(wrapper)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(writes()).toHaveLength(1)
    expect(JSON.stringify(useDeployment(pinia).$state)).not.toContain('Kalve Ltd')
    onlyWhatIsAllowed()
  })

  it('never sends the form as another person, even when it is pressed before the page has looked again', async () => {
    const { wrapper, reload } = await stuck({ [`GET ${API}/me`]: [ok(me()), ok(me()), ok(me({ subject: 'sub:B', name: 'Other Person' }))] })
    await wrapper.get('[data-act="sign-in-new-tab"]').trigger('click')
    await press(wrapper)
    expect(writes()).toHaveLength(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('holds in the tab’s storage nothing a person typed, whatever was done', async () => {
    const { wrapper, pinia } = await stuck({ [`GET ${API}/me`]: [ok(me()), ok(me()), recentMe()] })
    await wrapper.get('[data-act="sign-in-new-tab"]').trigger('click')
    window.dispatchEvent(new Event('focus'))
    await settle(wrapper)
    const kept = stored(window.localStorage) + stored(window.sessionStorage) + JSON.stringify(useDeployment(pinia).$state)
    for (const value of ['Kalve Ltd', 'Ilze Bērziņa', shownCode, digits]) expect(kept).not.toContain(value)
    expect(Object.keys(window.sessionStorage).every((k) => ['configbyte.return', 'configbyte.sign-in-tab'].includes(k))).toBe(true)
    expect(window.localStorage.length).toBe(0)
  })
})

describe('Signing in again › the new tab', () => {
  it('opened at its own address, marks itself, starts the same recent sign-in at once, and draws no menu and no call of the area', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    stub({ [`POST ${API}/login/start`]: ok({ authorizeUrl: 'https://auth.example.test/authorize' }) })
    const { wrapper } = await render('/deployment/sign-in-again')
    expect(writes()).toEqual([{ method: 'POST', url: `${API}/login/start`, body: { method: 'webEid', recent: true } }])
    expect(assign).toHaveBeenCalledWith('https://auth.example.test/authorize')
    expect(window.sessionStorage.getItem('configbyte.sign-in-tab')).toBe('1')
    expect(wrapper.find('nav').exists()).toBe(false)
    expect(calls.filter((c) => c.url.startsWith(AREA))).toEqual([])
  })

  it('offers the ways when the way used is not among them', async () => {
    stub({ [`GET ${API}/me`]: ok(me({ loginMethod: 'smartId' })) })
    const { wrapper } = await render('/deployment/sign-in-again')
    expect(wrapper.findAll('[data-way]').map((b) => b.text())).toEqual(['eID', 'Microsoft Entra'])
    expect(writes()).toEqual([])
  })

  it('says it is signed in again and the tab can be closed, and nothing else, when it comes back, telling the other tabs', async () => {
    window.sessionStorage.setItem('configbyte.sign-in-tab', '1')
    stub()
    const other = new FakeChannel('configbyte-sign-in')
    const heard = vi.fn()
    other.onmessage = heard
    const { wrapper } = await render('/')
    expect(wrapper.get('[data-page="sign-in-tab"]').attributes('data-state')).toBe('done')
    expect(wrapper.get('h1').text()).toBe('You are signed in again')
    expect(wrapper.text()).toContain('Close this tab')
    expect(wrapper.find('nav').exists()).toBe(false)
    expect(calls.filter((c) => c.url.startsWith(AREA))).toEqual([])
    await settle(wrapper)
    expect(heard).toHaveBeenCalledTimes(1)
    // It has said it is signed in again, so the mark that made it a sign-in tab is gone.
    expect(window.sessionStorage.getItem('configbyte.sign-in-tab')).toBeNull()
    onlyWhatIsAllowed()
  })

  it('shows the sign-in page’s own words when the sign-in was cancelled there, and tells nobody', async () => {
    window.sessionStorage.setItem('configbyte.sign-in-tab', '1')
    window.history.replaceState({}, '', '/?error=cancelled')
    stub()
    const { wrapper } = await render('/')
    expect(wrapper.text()).toContain('The sign-in was cancelled')
    expect(wrapper.find('[data-page="sign-in-tab"]').exists()).toBe(false)
    expect(FakeChannel.posted).toEqual([])
    onlyWhatIsAllowed()
  })
})

describe('The deployment admin who stops being one', () => {
  it('is moved off the area’s pages to what the app opens for them now, when the group leaves the menu', async () => {
    stub({
      [`GET ${API}/me`]: [
        ok(me({ sections: { orders: ['orders/setup:import'] } })),
        ok(me({ sections: { orders: ['orders/setup:import'] } })),
        ok(me({ sections: { orders: ['orders/setup:import'] } })),
        ok(me({ sections: { orders: ['orders/setup:import'] }, deployment: state({ admin: false }) })),
      ],
      [`GET ${AREA}/admins`]: ok({ admins: [{ userId: 'u1', displayName: 'Anna Admin', status: 'active', lastSignedInOn: null, addedFrom: 'settings', addedAt: '' }, { userId: 'u2', displayName: 'Marta', status: 'active', lastSignedInOn: null, addedFrom: 'screen', addedAt: '' }] }),
      [`DELETE ${AREA}/admins/u1`]: ok({ changed: true }),
    })
    const { wrapper, router } = await render('/deployment/admins')
    await wrapper.get('[data-act="remove-u1"]').trigger('click')
    await settle(wrapper)
    const confirm = wrapper.get('[data-admin="u1"]').findAll('button').filter((b) => norm(b.text()) === 'Remove').pop()!
    await confirm.trigger('click')
    await arrives(router, '/export-import')
    expect(wrapper.text()).not.toContain('Deployment admins')
  })
})

describe('A form is never sent as another person', () => {
  const other = () => ok(me({ subject: 'sub:B', name: 'Other Person' }))
  const created = { status: 201, body: { company: { id: 'c9', name: 'Kalve Ltd', status: 'active', createdAt: new Date().toISOString(), entered: false } } }
  const fillOpen = async (wrapper: W) => {
    await wrapper.get('#open-name').setValue('Kalve Ltd')
    await wrapper.get('#open-person').setValue('Ilze Bērziņa')
    await wrapper.get('#open-code').setValue(shownCode)
  }
  const pressOpen = async (wrapper: W) => {
    await wrapper.get('[data-act="open"]').trigger('click')
    await settle(wrapper)
  }

  it('sends nothing when another tab changed the person, though this tab never opened a sign-in tab', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload, assign: vi.fn() })
    stub({ [`GET ${API}/me`]: [ok(me()), other()], [`POST ${AREA}/companies`]: created })
    const { wrapper } = await render('/deployment/companies/new')
    await fillOpen(wrapper)
    await pressOpen(wrapper)
    expect(writes()).toEqual([])
    expect(reload).toHaveBeenCalledTimes(1)
    onlyWhatIsAllowed()
  })

  it('sends nothing when nobody is signed in any more', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload, assign: vi.fn() })
    stub({ [`GET ${API}/me`]: [ok(me()), { status: 401, body: { code: 'err:configbyte:noSession' } }], [`POST ${AREA}/companies`]: created })
    const { wrapper } = await render('/deployment/companies/new')
    await fillOpen(wrapper)
    await pressOpen(wrapper)
    expect(writes()).toEqual([])
    expect(reload).toHaveBeenCalledTimes(1)
  })

  const company1 = (extra: Record<string, unknown> = {}) =>
    ok({ company: { id: 'c1', name: 'Kalve Ltd', status: 'active', createdAt: new Date().toISOString(), own: false, products: ['basic'], administrators: 2, entered: false, ...extra } })
  const catalogue = ok({
    products: [
      { key: 'basic', displayName: 'Basic', offered: true, needs: [] },
      { key: 'ledger', displayName: 'Ledger', offered: true, needs: ['basic'] },
    ],
  })
  const peopleOf = ok({
    administrators: [
      { userId: 'u1', displayName: 'Ilze', status: 'active', lastSignedInOn: null },
      { userId: 'u2', displayName: 'Jānis', status: 'active', lastSignedInOn: null },
    ],
  })
  const deploymentAdmins = ok({
    admins: [
      { userId: 'a1', displayName: 'Anna', status: 'active', lastSignedInOn: null, addedFrom: 'settings', addedAt: '' },
      { userId: 'a2', displayName: 'Marta', status: 'active', lastSignedInOn: null, addedFrom: 'screen', addedAt: '' },
    ],
  })

  // Each act of the area, made once with a page opened for one person and a sign-in answer that says another: the
  // sign-in answer is read first, and nothing is sent. `reads` is how many answers the page itself takes first.
  const acts: [string, string, Record<string, Reply | Reply[]>, number, (w: W) => Promise<void>][] = [
    [
      'a tick',
      '/deployment/companies/c1',
      { [`GET ${AREA}/companies/c1`]: company1(), [`GET ${AREA}/products`]: catalogue, [`PUT ${AREA}/companies/c1/products/ledger`]: ok({ changed: true }) },
      0,
      async (w) => {
        await w.get('input[data-tick="ledger"]').setValue(true)
      },
    ],
    [
      'an untick',
      '/deployment/companies/c1',
      { [`GET ${AREA}/companies/c1`]: company1({ products: ['basic', 'ledger'] }), [`GET ${AREA}/products`]: catalogue, [`DELETE ${AREA}/companies/c1/products/ledger`]: ok({ changed: true }) },
      0,
      async (w) => {
        await w.get('input[data-tick="ledger"]').setValue(false)
        await settle(w)
        await w.findAll('button').find((b) => norm(b.text()) === 'Take it')!.trigger('click')
      },
    ],
    [
      'an invitation',
      '/deployment/companies/c1',
      { [`GET ${AREA}/companies/c1`]: company1(), [`GET ${AREA}/products`]: catalogue, [`GET ${AREA}/companies/c1/administrators`]: peopleOf, [`POST ${AREA}/companies/c1/administrators`]: ok({}) },
      1,
      async (w) => {
        await w.get('[data-act="show-administrators"]').trigger('click')
        await settle(w)
        await w.get('[data-act="invite-open"]').trigger('click')
        await settle(w)
        await w.get('#company-invite-name').setValue('Ilmārs Tests')
        await w.get('#company-invite-code').setValue(shownCode)
        await w.get('[data-act="invite"]').trigger('click')
      },
    ],
    [
      'a removal of an administrator',
      '/deployment/companies/c1',
      { [`GET ${AREA}/companies/c1`]: company1(), [`GET ${AREA}/products`]: catalogue, [`GET ${AREA}/companies/c1/administrators`]: peopleOf, [`DELETE ${AREA}/companies/c1/administrators/u1`]: ok({}) },
      1,
      async (w) => {
        await w.get('[data-act="show-administrators"]').trigger('click')
        await settle(w)
        await w.get('[data-act="remove-u1"]').trigger('click')
        await settle(w)
        await w.get('[data-administrator="u1"]').findAll('button').filter((b) => norm(b.text()) === 'Remove').pop()!.trigger('click')
      },
    ],
    [
      'applying a file',
      '/deployment/companies/c1',
      {
        [`GET ${AREA}/companies/c1`]: company1(),
        [`GET ${AREA}/products`]: catalogue,
        [`GET ${AREA}/configurations`]: ok({ configurations: [{ name: 'metal-fabrication' }] }),
        [`POST ${AREA}/companies/c1/configuration`]: ok({ configuration: { name: 'metal-fabrication', outcome: 'applied', sections: {} } }),
      },
      0,
      async (w) => {
        await w.get('[data-act="apply-file"]').trigger('click')
      },
    ],
    ['opening a company', '/deployment/companies/new', { [`POST ${AREA}/companies`]: created }, 0, async (w) => {
      await fillOpen(w)
      await w.get('[data-act="open"]').trigger('click')
    }],
    [
      'adding a deployment admin',
      '/deployment/admins',
      { [`GET ${AREA}/admins`]: deploymentAdmins, [`POST ${AREA}/admins`]: ok({}) },
      1,
      async (w) => {
        await w.get('[data-act="add-open"]').trigger('click')
        await settle(w)
        await w.get('#admin-code').setValue(shownCode)
        await w.get('[data-act="add"]').trigger('click')
      },
    ],
    [
      'removing a deployment admin',
      '/deployment/admins',
      { [`GET ${AREA}/admins`]: deploymentAdmins, [`DELETE ${AREA}/admins/a2`]: ok({}) },
      1,
      async (w) => {
        await w.get('[data-act="remove-a2"]').trigger('click')
        await settle(w)
        await w.get('[data-admin="a2"]').findAll('button').filter((b) => norm(b.text()) === 'Remove').pop()!.trigger('click')
      },
    ],
  ]

  it.each(acts)('reads the sign-in answer first for %s, and sends nothing when the person differs', async (_case, address, answers, before, act) => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload, assign: vi.fn() })
    // The page opens on the first answer, takes `before` more, and the answer for the act says another person.
    stub({ ...answers, [`GET ${API}/me`]: [ok(me()), ...Array.from({ length: before }, () => ok(me())), other()] })
    const { wrapper } = await render(address)
    const readsBefore = reads(`${API}/me`)
    await act(wrapper)
    await settle(wrapper)
    expect(reads(`${API}/me`)).toBeGreaterThan(readsBefore)
    expect(writes()).toEqual([])
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reads the sign-in answer first for the first run, and sends nothing when the person differs', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload, assign: vi.fn() })
    stub({
      [`GET ${API}/me`]: [ok(me({ sections: {}, deployment: state({ firstRunOwed: true }) })), other()],
      [`POST ${AREA}/first-run`]: ok({ company: { name: 'x' }, missing: [] }),
    })
    const { wrapper } = await render()
    await wrapper.get('#first-run-name').setValue('Hostings Ltd')
    await wrapper.get('[data-act="first-run"]').trigger('click')
    await settle(wrapper)
    expect(reads(`${API}/me`)).toBe(2)
    expect(writes()).toEqual([])
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reads who is signed in before showing the names of a company’s administrators, and never reads them for another person', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload, assign: vi.fn() })
    stub({
      [`GET ${API}/me`]: [ok(me()), other()],
      [`GET ${AREA}/companies/c1`]: ok({ company: { id: 'c1', name: 'Kalve Ltd', status: 'active', createdAt: new Date().toISOString(), own: false, products: ['basic'], administrators: 1, entered: false } }),
      [`PUT ${AREA}/companies/c1/products/basic`]: ok({ changed: true }),
      [`GET ${AREA}/companies/c1/administrators`]: ok({ administrators: [{ userId: 'u1', displayName: 'Ilze', status: 'active', lastSignedInOn: null }] }),
    })
    const { wrapper } = await render('/deployment/companies/c1')
    // Showing the names of a company's administrators is a recorded read of people, and is checked like an act.
    await wrapper.get('[data-act="show-administrators"]').trigger('click')
    await settle(wrapper)
    expect(reads(`${AREA}/companies/c1/administrators`)).toBe(0)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not read the deployment admins for another person: the page opened for one, the answer says another', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload, assign: vi.fn() })
    stub({ [`GET ${API}/me`]: [ok(me()), other()], [`GET ${AREA}/admins`]: ok({ admins: [] }) })
    await render('/deployment/admins')
    expect(reads(`${AREA}/admins`)).toBe(0)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('drops the page when the window is looked at again and somebody else is signed in, with no sign-in tab opened from it', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload, assign: vi.fn() })
    stub({ [`GET ${API}/me`]: [ok(me()), other()] })
    const { wrapper, pinia } = await render('/deployment/companies/new')
    await fillOpen(wrapper)
    window.dispatchEvent(new Event('focus'))
    await settle(wrapper)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(useDeployment(pinia).$state)).not.toContain('Kalve Ltd')
  })

  it('does the same on the other tab’s hint, in every tab with an area page open', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload, assign: vi.fn() })
    stub({ [`GET ${API}/me`]: [ok(me()), ok(me()), other()], [`POST ${AREA}/companies`]: created })
    const first = await render('/deployment/companies/new')
    const second = await render('/deployment/companies/new')
    await fillOpen(first.wrapper)
    await fillOpen(second.wrapper)
    new FakeChannel('configbyte-sign-in').postMessage('signed-in')
    await settle(first.wrapper)
    await settle(second.wrapper)
    expect(reload).toHaveBeenCalledTimes(2)
    // Neither form can now be sent as the other person.
    expect(writes()).toEqual([])
    onlyWhatIsAllowed()
  })

  it('sends one form and not the other when only one tab’s person is still the one it was opened for', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload, assign: vi.fn() })
    stub({ [`GET ${API}/me`]: [ok(me()), ok(me()), ok(me()), other()], [`POST ${AREA}/companies`]: created })
    const first = await render('/deployment/companies/new')
    const second = await render('/deployment/companies/new')
    await fillOpen(first.wrapper)
    await fillOpen(second.wrapper)
    await pressOpen(first.wrapper)
    await pressOpen(second.wrapper)
    expect(writes()).toHaveLength(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('ignores a sign-in answer that arrives after the page was left, and sends nothing', async () => {
    let release: () => void = () => {}
    const wait = new Promise<void>((resolve) => {
      release = resolve
    })
    stub({ [`GET ${API}/me`]: [ok(me()), { ...ok(me()), held: wait }], [`POST ${AREA}/companies`]: created })
    const { wrapper, router } = await render('/deployment/companies/new')
    await fillOpen(wrapper)
    await wrapper.get('[data-act="open"]').trigger('click')
    await router.push('/deployment/companies')
    await settle(wrapper)
    release()
    await settle(wrapper)
    expect(writes()).toEqual([])
  })

  it('decides “you signed in again” from the server’s answer alone, the same person and a later time, whatever the browser’s clock says', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload, assign: vi.fn(), })
    vi.stubGlobal('open', vi.fn())
    stub({
      [`GET ${API}/me`]: [ok(me()), ok(me()), ok(me({}, 1))],
      [`POST ${AREA}/companies`]: { status: 403, body: { code: 'err:session:signInTooOld' } },
    })
    const { wrapper } = await render('/deployment/companies/new')
    await fillOpen(wrapper)
    await pressOpen(wrapper)
    expect(wrapper.find('[data-refusal="tooOld"]').exists()).toBe(true)
    // The browser's clock is ten hours ahead: by it, no sign-in is recent. The server's later time is what counts.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10 * 3600 * 1000)
    window.dispatchEvent(new Event('focus'))
    await settle(wrapper)
    expect(wrapper.find('[data-refusal="tooOld"]').exists()).toBe(false)
    expect(wrapper.get('[data-line="said"]').text()).toBe('You signed in again. Press the button once more.')
  })

  it('does not say it when the same person’s sign-in time is not later than the one held, though the clock says it is recent', async () => {
    vi.stubGlobal('location', { ...window.location, reload: vi.fn(), assign: vi.fn() })
    stub({
      [`GET ${API}/me`]: [ok(me({}, 600)), ok(me({}, 600)), ok(me({}, 600))],
      [`POST ${AREA}/companies`]: { status: 403, body: { code: 'err:session:signInTooOld' } },
    })
    const { wrapper } = await render('/deployment/companies/new')
    await fillOpen(wrapper)
    await pressOpen(wrapper)
    window.dispatchEvent(new Event('focus'))
    await settle(wrapper)
    expect(wrapper.find('[data-refusal="tooOld"]').exists()).toBe(true)
  })
})

describe('Entering the area is judged by the server, not by the browser’s clock alone', () => {
  const T = Date.parse('2026-11-12T10:00:00Z')
  const at = (secondsAgo: number) => new Date(T - secondsAgo * 1000).toISOString()
  const companies = ok({ companies: [{ id: 'c1', name: 'Hostings Ltd', status: 'active', createdAt: at(99999), own: true, products: [], administrators: 1, entered: true }] })

  it('lets a browser clock one minute behind enter, and shows what the server says: a sign-in too old is told as such, once', async () => {
    // The server says the sign-in is 901 seconds old; this browser thinks it is 841.
    vi.spyOn(Date, 'now').mockReturnValue(T - 60 * 1000)
    stub({
      [`GET ${API}/me`]: ok(me({ signedInAt: at(901) })),
      [`GET ${AREA}/companies`]: { status: 403, body: { code: 'err:session:signInTooOld' } },
      [`GET ${AREA}/products`]: { status: 403, body: { code: 'err:session:signInTooOld' } },
    })
    const { wrapper } = await render('/deployment/companies')
    expect(reads(`${AREA}/companies`)).toBe(1)
    expect(wrapper.find('[data-page="sign-in-again"]').exists()).toBe(true)
  })

  it('does not loop on a clock one minute ahead: the first guess shows the page, and after the sign-in the area’s own call decides', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    // The server's sign-in is 880 seconds old (recent); this browser, a minute ahead, thinks it is 940.
    vi.spyOn(Date, 'now').mockReturnValue(T + 60 * 1000)
    stub({
      [`GET ${API}/me`]: ok(me({ signedInAt: at(880) })),
      [`POST ${API}/login/start`]: ok({ authorizeUrl: 'https://auth.example.test/authorize' }),
      [`GET ${AREA}/companies`]: companies,
    })
    const first = await render('/deployment/companies')
    expect(first.wrapper.find('[data-page="sign-in-again"]').exists()).toBe(true)
    expect(reads(`${AREA}/companies`)).toBe(0)
    await first.wrapper.get('[data-act="sign-in-again"]').trigger('click')
    await settle(first.wrapper)
    expect(window.sessionStorage.getItem('configbyte.return')).toBe('/deployment/companies')
    first.wrapper.unmount()

    // Back from the sign-in: the page opened again, with the same clock, is not pre-judged a second time.
    const back = await render('/')
    await arrives(back.router, '/deployment/companies')
    await settle(back.wrapper)
    expect(back.wrapper.find('[data-page="sign-in-again"]').exists()).toBe(false)
    expect(reads(`${AREA}/companies`)).toBe(1)
    expect(back.wrapper.get('h1').text()).toBe('Companies')
  })

  it('does not pre-judge a person who is not shown the area, whatever the age of their sign-in: the area’s call is made and its refusal drawn', async () => {
    stub({
      [`GET ${API}/me`]: ok(me({ signedInAt: at(99999), sections: { orders: ['orders/setup:import'] }, deployment: state({ admin: false }) })),
      [`GET ${AREA}/companies`]: { status: 403, body: { code: 'err:request:forbidden' } },
      [`GET ${AREA}/products`]: { status: 403, body: { code: 'err:request:forbidden' } },
    })
    vi.spyOn(Date, 'now').mockReturnValue(T)
    const { wrapper } = await render('/deployment/companies')
    expect(wrapper.find('[data-page="sign-in-again"]').exists()).toBe(false)
    expect(reads(`${AREA}/companies`)).toBe(1)
    expect(wrapper.find('[data-refusal="notAdmin"]').exists()).toBe(true)
  })

  it('does not pre-judge a person on a deployment that could not be read', async () => {
    stub({
      [`GET ${API}/me`]: ok(me({ signedInAt: null, sections: { orders: ['orders/setup:import'] }, deployment: null })),
      [`GET ${AREA}/companies`]: { status: 403, body: { code: 'err:request:forbidden' } },
      [`GET ${AREA}/products`]: { status: 403, body: { code: 'err:request:forbidden' } },
    })
    const { wrapper } = await render('/deployment/companies')
    expect(wrapper.find('[data-page="sign-in-again"]').exists()).toBe(false)
    expect(reads(`${AREA}/companies`)).toBe(1)
  })
})

describe('The sign-in start', () => {
  it.each([
    ['a script address', 'javascript:alert(1)'],
    ['a data address', 'data:text/html,hello'],
    ['a relative address', '/somewhere'],
    ['no address', ''],
  ])('does not follow %s, and tells the sign-in did not start', async (_case, authorizeUrl) => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    stub({ [`GET ${API}/me`]: ok(me({ signedInAt: new Date(Date.now() - 5000 * 1000).toISOString() })), [`POST ${API}/login/start`]: ok({ authorizeUrl }) })
    const { wrapper } = await render('/deployment/companies')
    await wrapper.get('[data-act="sign-in-again"]').trigger('click')
    await settle(wrapper)
    expect(assign).not.toHaveBeenCalled()
    expect(wrapper.get('[data-note="not-started"]').text()).toContain('could not be completed')
  })

  it('follows an https address, and an http one a development stack gives', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    stub({ [`GET ${API}/me`]: ok(me({ signedInAt: new Date(Date.now() - 5000 * 1000).toISOString() })), [`POST ${API}/login/start`]: ok({ authorizeUrl: 'http://auth.example.test/authorize' }) })
    const { wrapper } = await render('/deployment/companies')
    await wrapper.get('[data-act="sign-in-again"]').trigger('click')
    await settle(wrapper)
    expect(assign).toHaveBeenCalledWith('http://auth.example.test/authorize')
  })
})

describe('After a removal of a deployment admin', () => {
  const list = ok({
    admins: [
      { userId: 'a1', displayName: 'Anna', status: 'active', lastSignedInOn: null, addedFrom: 'settings', addedAt: '' },
      { userId: 'a2', displayName: 'Marta', status: 'active', lastSignedInOn: null, addedFrom: 'screen', addedAt: '' },
    ],
  })
  const removeA2 = async (wrapper: W) => {
    await wrapper.get('[data-act="remove-a2"]').trigger('click')
    await settle(wrapper)
    await wrapper.get('[data-admin="a2"]').findAll('button').filter((b) => norm(b.text()) === 'Remove').pop()!.trigger('click')
    await settle(wrapper)
  }

  it('reads the sign-in answer through the same comparison, and reads the people list again only when it is still the same person', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload, assign: vi.fn() })
    // The frame, the page's own read and the act each take an answer; the one after the removal says another person.
    stub({
      [`GET ${API}/me`]: [ok(me()), ok(me()), ok(me()), ok(me({ subject: 'sub:B', name: 'Other Person' }))],
      [`GET ${AREA}/admins`]: list,
      [`DELETE ${AREA}/admins/a2`]: ok({}),
    })
    const { wrapper } = await render('/deployment/admins')
    await removeA2(wrapper)
    expect(writes()).toHaveLength(1)
    expect(reads(`${AREA}/admins`)).toBe(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('guards every re-read of the list: after an addition too, the people list is not read for another person', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload, assign: vi.fn() })
    stub({
      [`GET ${API}/me`]: [ok(me()), ok(me()), ok(me()), ok(me({ subject: 'sub:B', name: 'Other Person' }))],
      [`GET ${AREA}/admins`]: list,
      [`POST ${AREA}/admins`]: ok({}),
    })
    const { wrapper } = await render('/deployment/admins')
    await wrapper.get('[data-act="add-open"]').trigger('click')
    await settle(wrapper)
    await wrapper.get('#admin-code').setValue(shownCode)
    await wrapper.get('[data-act="add"]').trigger('click')
    await settle(wrapper)
    expect(writes()).toHaveLength(1)
    expect(reads(`${AREA}/admins`)).toBe(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('says the area’s refusal, never loading for good, when the person no longer manages the deployment', async () => {
    stub({
      [`GET ${API}/me`]: [ok(me({ sections: { orders: ['orders/setup:import'] } })), ok(me()), ok(me()), ok(me({ sections: { orders: ['orders/setup:import'] }, deployment: state({ admin: false }) }))],
      [`GET ${AREA}/admins`]: list,
      [`DELETE ${AREA}/admins/a2`]: ok({}),
    })
    const { wrapper, router } = await render('/deployment/admins')
    await removeA2(wrapper)
    await arrives(router, '/export-import')
    expect(wrapper.find('[data-state="loading"]').exists()).toBe(false)
  })

  it('says the area’s refusal and not loading when the held answer never said the person manages anything', async () => {
    stub({
      [`GET ${API}/me`]: ok(me({ sections: { orders: ['orders/setup:import'] }, deployment: null })),
      [`GET ${AREA}/admins`]: list,
      [`DELETE ${AREA}/admins/a2`]: ok({}),
    })
    const { wrapper } = await render('/deployment/admins')
    await removeA2(wrapper)
    expect(wrapper.find('[data-refusal]').exists()).toBe(true)
    expect(wrapper.find('[data-state="loading"]').exists()).toBe(false)
    expect(wrapper.find('[data-list="deployment-admins"]').exists()).toBe(false)
  })
})

describe('The browser’s clock guesses at most once', () => {
  const T = Date.parse('2026-11-12T10:00:00Z')

  it('does not bring the sign-in page back on a second or third page once the server accepted a call for the sign-in time held', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(T)
    stub({
      [`GET ${API}/me`]: ok(me({ signedInAt: new Date(T - 100 * 1000).toISOString() })),
      [`GET ${AREA}/companies`]: ok({ companies: [] }),
      [`GET ${AREA}/admins`]: ok({ admins: [] }),
      [`GET ${AREA}/companies/c1`]: ok({ company: { id: 'c1', name: 'Kalve Ltd', status: 'active', createdAt: new Date().toISOString(), own: false, products: [], administrators: 1, entered: true } }),
    })
    const { wrapper, router } = await render('/deployment/companies')
    expect(reads(`${AREA}/companies`)).toBe(1)
    // The clock now runs two hours ahead: by it, nothing is recent. The server has accepted a call already.
    vi.spyOn(Date, 'now').mockReturnValue(T + 2 * 3600 * 1000)
    await router.push('/deployment/admins')
    await settle(wrapper)
    expect(wrapper.find('[data-page="sign-in-again"]').exists()).toBe(false)
    expect(reads(`${AREA}/admins`)).toBe(1)
    await router.push('/deployment/companies/c1')
    await settle(wrapper)
    expect(wrapper.find('[data-page="sign-in-again"]').exists()).toBe(false)
    expect(reads(`${AREA}/companies/c1`)).toBe(1)
  })

  it('brings the sign-in page back only when the server says the sign-in is too old', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(T)
    stub({
      [`GET ${API}/me`]: ok(me({ signedInAt: new Date(T - 100 * 1000).toISOString() })),
      [`GET ${AREA}/companies`]: ok({ companies: [] }),
      [`GET ${AREA}/admins`]: { status: 403, body: { code: 'err:session:signInTooOld' } },
    })
    const { wrapper, router } = await render('/deployment/companies')
    vi.spyOn(Date, 'now').mockReturnValue(T + 2 * 3600 * 1000)
    await router.push('/deployment/admins')
    await settle(wrapper)
    // The clock alone did not bring the page; the server's own refusal is told, with the way to sign in again.
    expect(wrapper.find('[data-page="sign-in-again"]').exists()).toBe(false)
    expect(wrapper.find('[data-refusal="tooOld"]').exists()).toBe(true)
    expect(reads(`${AREA}/admins`)).toBe(1)
  })
})

describe('A look at the sign-in answer', () => {
  it('keeps the held deployment part when the register could not be read just then for the same person: the area is not left and a form keeps what was typed', async () => {
    stub({ [`GET ${API}/me`]: [ok(me()), ok(me({ deployment: null }))] })
    const { wrapper, router } = await render('/deployment/companies/new')
    await wrapper.get('#open-name').setValue('Kalve Ltd')
    window.dispatchEvent(new Event('focus'))
    await settle(wrapper)
    expect(reads(`${API}/me`)).toBe(2)
    expect(router.currentRoute.value.path).toBe('/deployment/companies/new')
    expect((wrapper.get('#open-name').element as HTMLInputElement).value).toBe('Kalve Ltd')
    expect(wrapper.text()).toContain('Deployment admins')
  })

  it('still drops everything for a different person or nobody', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload, assign: vi.fn() })
    stub({ [`GET ${API}/me`]: [ok(me()), ok(me({ subject: 'sub:B', deployment: null }))] })
    const { wrapper } = await render('/deployment/companies/new')
    window.dispatchEvent(new Event('focus'))
    await settle(wrapper)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
