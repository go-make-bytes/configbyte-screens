// The admin app's menu and the deployment's own area in it: who is shown the group,
// where the app opens for a person who configures nothing else, and what a person who
// is not shown the group meets when they type the area's addresses by hand.
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import AdminFrame from './AdminFrame.vue'
import type { AdminOptions } from './options'
import { configbyteScreens } from './plugin'
import { adminRoutes } from './routes'

type Reply = { status: number; body: unknown }
interface Call {
  method: string
  url: string
}

const API = '/api/configbyte/v1'
const AREA = `${API}/deployment`

const hostWords = {
  en: { host: { product: 'acme', never: 'Not in it.', orders: 'Order register', rota: 'Staff rotas', shelves: 'Shelves', carries: { kinds: 'Order kinds' } } },
  lv: { host: { product: 'acme', never: 'Tajā nav.', orders: 'Pasūtījumu reģistrs', rota: 'Maiņas', shelves: 'Plaukti', carries: { kinds: 'Pasūtījumu veidi' } } },
}

const options: AdminOptions = {
  product: 'host.product',
  never: 'host.never',
  sections: {
    orders: { title: 'host.orders', configures: ['orders/setup:import'] },
    stock: { configures: ['stock/setup:import'] },
  },
  carries: [{ section: 'orders', line: 'host.carries.kinds' }],
  entries: [
    { key: 'rota', label: 'host.rota', route: 'rota', section: 'orders' },
    { key: 'shelves', label: 'host.shelves', route: 'shelves', section: 'stock' },
  ],
}

const deployment = (extra: Record<string, unknown> = {}) => ({ mode: 'saas', admin: true, firstRunOwed: false, signInAge: 900, ...extra })

const me = (sections: Record<string, string[]>, extra: Record<string, unknown> = {}) => ({
  subject: 'sub:01ARZ3NDEKTSV4RRFFQ69G5FAV',
  name: 'Anna Example',
  loginMethod: 'webEid',
  loa: 'high',
  tenant: 'W-1',
  signedInAt: new Date().toISOString(),
  sections,
  presentation: { displayName: 'Kalns', locale: 'en' },
  ...extra,
})

const sectionsOf = (...names: string[]) => ({ sections: names.map((section) => ({ section, schema: `${section}-config/1`, refersTo: [] })) })

let calls: Call[] = []

/** A stand-in coordinator answering each address with one reply; an address it was not told is not found. */
function stub(answers: Record<string, Reply>) {
  calls = []
  const all: Record<string, Reply> = {
    [`${API}/login/ways`]: { status: 200, body: { ways: [{ key: 'webEid', flow: 'card', name: 'eID' }] } },
    [`${AREA}/companies`]: { status: 200, body: { companies: [] } },
    [`${AREA}/products`]: { status: 200, body: { products: [] } },
    ...answers,
  }
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', url })
      const reply = all[url] ?? { status: 404, body: {} }

      return { ok: reply.status < 400, status: reply.status, headers: new Headers(), json: async () => reply.body } as unknown as Response
    }),
  )
}

let drawn: VueWrapper[] = []

async function render(at = '/') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      ...adminRoutes(),
      { path: '/rota', name: 'rota', component: { template: '<p>the rota screen</p>' } },
      { path: '/shelves', name: 'shelves', component: { template: '<p>the shelves screen</p>' } },
    ],
  })
  await router.push(at)
  await router.isReady()
  const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages: structuredClone(hostWords) })
  const wrapper = mount(AdminFrame, {
    slots: { mark: '<svg data-mark />' },
    global: { plugins: [pinia, router, i18n, configbyteScreens(i18n, options)] },
  })
  drawn.push(wrapper)
  for (let pass = 0; pass < 8; pass += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flushPromises()
  }

  return { wrapper, router }
}

const sidebar = (wrapper: VueWrapper) => [...new Set(wrapper.findAll('nav a').map((a) => a.text()))]
const area = ['Companies', 'Deployment admins']
/** What the menu holds for a person who configures something, on a deployment that runs both sections. */
const workspace = ['Export & import', 'History', 'Staff rotas', 'Shelves']

beforeEach(() => {
  document.cookie = 'configbyte_csrf=tok-1'
  window.history.replaceState({}, '', '/')
  window.sessionStorage.clear()
})
afterEach(() => {
  for (const wrapper of drawn) wrapper.unmount()
  drawn = []
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the menu of the deployment’s own area', () => {
  it('adds the group last, after everything the person configures in their own company', async () => {
    stub({
      [`${API}/me`]: { status: 200, body: me({ orders: ['orders/setup:import'], stock: [] }, { deployment: deployment() }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders', 'stock') },
    })
    const { wrapper, router } = await render()
    expect(sidebar(wrapper)).toEqual([...workspace, ...area])
    const text = wrapper.text()
    expect(text.indexOf('Deployment')).toBeGreaterThan(text.indexOf('Shelves'))
    // The app opens where it always did.
    expect(router.currentRoute.value.name).toBe('configbyte-export-import')
  })

  it('shows only the group to a deployment admin who configures nothing, and opens on Companies, without the line that nothing is theirs', async () => {
    stub({
      [`${API}/me`]: { status: 200, body: me({ orders: [], stock: [] }, { deployment: deployment() }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders', 'stock') },
      [`${AREA}/companies`]: { status: 200, body: { companies: [{ id: 'c1', name: 'Hostings Ltd', status: 'active', createdAt: '2026-11-01T10:00:00Z', own: true, products: [], administrators: 1, entered: true }] } },
    })
    const { wrapper, router } = await render()
    // The page behind the address is loaded the first time it is opened.
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('configbyte-deployment-companies'), { timeout: 8000 })
    await flushPromises()
    expect(sidebar(wrapper)).toEqual(area)
    expect(wrapper.find('[data-state="nothing"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Nothing here for you to configure')
    expect(wrapper.get('h1').text()).toBe('Companies')
    // The shared screens' first entry is never drawn on the way.
    expect(wrapper.text()).not.toContain('Your whole configuration as one file')
  })

  it('opens every other address as it is asked, also for a person shown only the group', async () => {
    stub({
      [`${API}/me`]: { status: 200, body: me({ orders: [], stock: [] }, { deployment: deployment() }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders', 'stock') },
    })
    const { router } = await render('/history')
    expect(router.currentRoute.value.name).toBe('configbyte-history')
  })

  it('shows no group to a company’s administrator, and the menu is as it was', async () => {
    stub({
      [`${API}/me`]: { status: 200, body: me({ orders: ['orders/setup:import'], stock: [] }, { deployment: deployment({ admin: false }) }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders', 'stock') },
    })
    const { wrapper } = await render()
    expect(sidebar(wrapper)).toEqual(workspace)
  })

  it('tells a person who configures nothing and is not a deployment admin that nothing here is theirs', async () => {
    stub({
      [`${API}/me`]: { status: 200, body: me({ orders: ['orders:read'], stock: [] }, { deployment: deployment({ admin: false }) }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders', 'stock') },
    })
    const { wrapper } = await render()
    expect(wrapper.find('[data-state="nothing"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Nothing here for you to configure')
    expect(sidebar(wrapper)).toEqual([])
  })

  it.each([
    ['a deployment for one company, not an admin', deployment({ mode: 'local', admin: false })],
    ['a deployment for one company, an admin', deployment({ mode: 'local', admin: true })],
  ])('shows no group on %s', async (_case, state) => {
    stub({
      [`${API}/me`]: { status: 200, body: me({ orders: ['orders/setup:import'], stock: [] }, { deployment: state }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders', 'stock') },
    })
    const { wrapper } = await render()
    expect(sidebar(wrapper)).toEqual(workspace)
    expect(wrapper.text()).not.toContain('Deployment admins')
  })

  it('draws no group and says nothing of it when the deployment could not be read, the rest of the menu as it was', async () => {
    stub({
      [`${API}/me`]: { status: 200, body: me({ orders: ['orders/setup:import'], stock: [] }, { deployment: null }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders', 'stock') },
    })
    const { wrapper } = await render()
    expect(sidebar(wrapper)).toEqual(workspace)
    expect(wrapper.text()).not.toContain('Deployment')
  })

  it('draws no group, and says nothing is theirs, for a person who configures nothing on a deployment that could not be read', async () => {
    stub({
      [`${API}/me`]: { status: 200, body: me({ orders: [], stock: [] }, { deployment: null }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders', 'stock') },
    })
    const { wrapper } = await render()
    expect(wrapper.find('[data-state="nothing"]').exists()).toBe(true)
    expect(sidebar(wrapper)).toEqual([])
  })

  it('adds the group and nothing else to a deployment admin who holds one setup scope of one section', async () => {
    stub({
      [`${API}/me`]: { status: 200, body: me({ orders: [], stock: ['stock/setup:import'] }, { deployment: deployment() }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders', 'stock') },
    })
    const { wrapper } = await render()
    // Exactly what holding that scope shows without the group, and then the group.
    const withGroup = sidebar(wrapper)
    expect(withGroup).toEqual([...workspace, ...area])

    drawn.pop()!.unmount()
    stub({
      [`${API}/me`]: { status: 200, body: me({ orders: [], stock: ['stock/setup:import'] }, { deployment: deployment({ admin: false }) }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders', 'stock') },
    })
    const without = await render()
    expect(sidebar(without.wrapper)).toEqual(workspace)
    expect(withGroup.slice(0, workspace.length)).toEqual(sidebar(without.wrapper))
  })

  it('does not widen the menu for a person who holds a scope of a section this deployment does not run', async () => {
    stub({
      [`${API}/me`]: { status: 200, body: me({ orders: [], stock: ['stock/setup:import'] }, { deployment: deployment({ admin: false }) }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders') },
    })
    const { wrapper } = await render()
    expect(wrapper.find('[data-state="nothing"]').exists()).toBe(true)
    expect(sidebar(wrapper)).toEqual([])
  })
})

describe('the area’s addresses typed by a person who is not shown the group', () => {
  // The coordinator judges the sign-in's age before the right, so to a person who manages nothing here, with a sign-in
  // older than the area asks for, every address answers that the sign-in is too old, not a plain refusal.
  const refuse = { status: 403, body: { code: 'err:session:signInTooOld', title: 'a sentence of the service' } }
  const plain = { status: 403, body: { code: 'err:request:forbidden', title: 'a sentence of the service' } }

  it('says the area is not theirs for a plain refusal too', async () => {
    stub({
      [`${API}/me`]: { status: 200, body: me({ orders: ['orders/setup:import'], stock: [] }, { deployment: deployment({ admin: false }) }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders', 'stock') },
      [`${AREA}/companies`]: plain,
      [`${AREA}/products`]: plain,
    })
    const { wrapper } = await render('/deployment/companies')
    expect(wrapper.find('[data-refusal="notAdmin"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('a sentence of the service')
  })

  it.each([
    ['the companies', '/deployment/companies'],
    ['one company', '/deployment/companies/c1'],
    ['opening a company', '/deployment/companies/new'],
    ['the deployment admins', '/deployment/admins'],
  ])('says the area is not theirs for %s, never asking them to sign in again, and draws no list, name or form', async (_case, address) => {
    stub({
      [`${API}/me`]: { status: 200, body: me({ orders: ['orders/setup:import'], stock: [] }, { deployment: deployment({ admin: false }) }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders', 'stock') },
      [`${AREA}/companies`]: refuse,
      [`${AREA}/companies/c1`]: refuse,
      [`${AREA}/products`]: refuse,
      [`${AREA}/configurations`]: refuse,
      [`${AREA}/admins`]: refuse,
    })
    const { wrapper } = await render(address)
    expect(wrapper.find('[data-refusal="notAdmin"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('You are not a deployment admin')
    expect(wrapper.text()).not.toContain('a sentence of the service')
    // No sign-in page, no word that anything could not be read, and no button to sign in again.
    expect(wrapper.find('[data-page="sign-in-again"]').exists()).toBe(false)
    expect(wrapper.find('[data-act="sign-in-again"], [data-act="sign-in-new-tab"]').exists()).toBe(false)
    expect(wrapper.find('[data-state="failed"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('could not be read')
    expect(wrapper.find('[data-block="administrators"]').exists()).toBe(false)
    expect(wrapper.find('[data-block="products"]').exists()).toBe(false)
    expect(wrapper.find('ul[aria-label="Companies"]').exists()).toBe(false)
    expect(wrapper.find('form, input[type="text"], input[type="checkbox"]').exists()).toBe(false)
    // Nothing was sent that changes anything.
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([])
  })

  it('draws no list, name or form at the sign-in tab’s address, and calls nothing of the area: it only starts the person’s own sign-in', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    stub({
      [`${API}/me`]: { status: 200, body: me({ orders: ['orders/setup:import'], stock: [] }, { deployment: deployment({ admin: false }) }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders', 'stock') },
      [`${API}/login/start`]: { status: 200, body: { authorizeUrl: 'https://auth.example.test/authorize' } },
    })
    const { wrapper } = await render('/deployment/sign-in-again')
    expect(wrapper.find('form, input, ul').exists()).toBe(false)
    expect(calls.filter((c) => c.url.startsWith(AREA))).toEqual([])
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.url)).toEqual([`${API}/login/start`])
  })
})
