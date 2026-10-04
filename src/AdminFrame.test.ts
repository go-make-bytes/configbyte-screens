// The admin app's frame, against a stand-in coordinator: signed out, an
// administrator, someone who configures nothing here, and a coordinator that is
// not answering — and which entries the sidebar offers in each.
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import AdminFrame from './AdminFrame.vue'
import type { AdminOptions } from './options'
import { configbyteScreens } from './plugin'
import { adminRoutes } from './routes'

type Reply = { status: number; body: unknown } | 'unanswered'

interface Call {
  method: string
  url: string
  body: string
  csrf: string
}

const hostWords = {
  en: { host: { product: 'acme', never: 'Not in it, ever: orders.', orders: 'Order register', rota: 'Staff rotas', shelves: 'Shelves', org: 'Org chart', storage: 'Storage', carries: { kinds: 'Order kinds' } } },
  lv: { host: { product: 'acme', never: 'Tajā nekad nav pasūtījumu.', orders: 'Pasūtījumu reģistrs', rota: 'Maiņas', shelves: 'Plaukti', org: 'Shēma', storage: 'Glabāšana', carries: { kinds: 'Pasūtījumu veidi' } } },
}

const baseOptions: AdminOptions = {
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
let options: AdminOptions = baseOptions

const me = (sections: Record<string, string[]>, locale = 'en') => ({
  subject: 'sub:01ARZ3NDEKTSV4RRFFQ69G5FAV',
  name: 'Anna Example',
  loginMethod: 'an ID card',
  loa: 'high',
  tenant: 'W-1',
  sections,
  presentation: { displayName: 'Kalns', locale },
})

const sectionsOf = (...names: string[]) => ({ sections: names.map((section) => ({ section, schema: `${section}-config/1`, refersTo: [] })) })

let calls: Call[] = []
let routes: Record<string, Reply[]> = {}

/** A stand-in coordinator answering each address with its queue of replies, the last one repeating. */
function stubCoordinator(answers: Record<string, Reply | Reply[]>) {
  calls = []
  routes = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]))
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>
      calls.push({ method: init?.method ?? 'GET', url, body: typeof init?.body === 'string' ? init.body : '', csrf: headers['X-CSRF-Token'] ?? '' })
      const queue = routes[url] ?? [{ status: 404, body: {} }]
      const reply = queue.length > 1 ? queue.shift()! : queue[0]!
      if (reply === 'unanswered') throw new TypeError('Failed to fetch')

      return {
        ok: reply.status < 400,
        status: reply.status,
        headers: new Headers(),
        json: async () => reply.body,
      } as unknown as Response
    }),
  )
}

async function settle(wrapper: { vm: { $nextTick: () => Promise<unknown> } }) {
  for (let pass = 0; pass < 6; pass += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()
  }
}

async function render() {
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
  await router.push('/')
  await router.isReady()
  const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages: structuredClone(hostWords) })
  const wrapper = mount(AdminFrame, {
    slots: { mark: '<svg data-mark />' },
    global: { plugins: [pinia, router, i18n, configbyteScreens(i18n, options)] },
  })
  await settle(wrapper)

  return { wrapper, router }
}

// The shell draws the navigation twice, beside the page and along the bottom of a
// narrow screen, so each entry is read once.
const sidebar = (wrapper: ReturnType<typeof mount>) => [...new Set(wrapper.findAll('nav a').map((a) => a.text()))]

beforeEach(() => {
  document.cookie = 'configbyte_csrf=tok-1'
  window.history.replaceState({}, '', '/')
  options = baseOptions
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the admin app, signed out', () => {
  it('asks the person to sign in, naming the product the everyday work stays in', async () => {
    stubCoordinator({ '/api/configbyte/v1/me': { status: 401, body: { code: 'err:configbyte:noSession' } } })
    const { wrapper } = await render()
    const text = wrapper.text()
    expect(text).toContain('Configure your workspace')
    expect(text).toContain('This is the admin app. Everyday work stays in acme at its usual address.')
    expect(wrapper.findAll('button').map((b) => b.text())).toEqual(['Sign in with an ID card', 'Sign in with your account'])
    expect(calls.map((c) => c.url)).toEqual(['/api/configbyte/v1/me'])
  })

  it('says why a sign-in that came back unfinished did not finish', async () => {
    window.history.replaceState({}, '', '/?error=expired')
    stubCoordinator({ '/api/configbyte/v1/me': { status: 401, body: {} } })
    const { wrapper } = await render()
    expect(wrapper.get('[role="alert"]').text()).toBe('That sign-in took too long and has expired. Start a fresh one.')
  })

  // The card's answer is opaque here and travels exactly as the card software produced it.
  it('signs in with the card: the challenge out, the signed answer back verbatim, then reads who is signed in', async () => {
    const signed = { unverifiedCertificate: 'MII…', algorithm: 'ES384', signature: 'sig', format: 'web-eid:1.0' }
    const authenticate = vi.fn(async () => signed)
    Object.assign(window, { webeid: { authenticate } })
    stubCoordinator({
      '/api/configbyte/v1/me': [{ status: 401, body: {} }, { status: 200, body: me({ orders: ['orders/setup:import'] }) }],
      '/api/configbyte/v1/sections': { status: 200, body: sectionsOf('orders') },
      '/api/configbyte/v1/login/webeid/start': { status: 200, body: { nonce: 'n-1', state: 's-1' } },
      '/api/configbyte/v1/login/webeid/complete': { status: 200, body: {} },
    })
    const { wrapper } = await render()
    await wrapper.findAll('button').find((b) => b.text() === 'Sign in with an ID card')!.trigger('click')
    await settle(wrapper)
    expect(authenticate).toHaveBeenCalledWith('n-1', { lang: 'en' })
    const complete = calls.find((c) => c.url.endsWith('/login/webeid/complete'))!
    expect(JSON.parse(complete.body)).toEqual({ state: 's-1', authToken: signed })
    expect(complete.csrf).toBe('tok-1')
    expect(wrapper.text()).toContain('Anna Example')
    delete (window as { webeid?: unknown }).webeid
  })
})

describe('the admin app, signed in', () => {
  it("opens an administrator on Export / Import, under the deployment's own name", async () => {
    stubCoordinator({
      '/api/configbyte/v1/me': { status: 200, body: me({ orders: ['orders/setup:import', 'orders:read'], stock: [] }) },
      '/api/configbyte/v1/sections': { status: 200, body: sectionsOf('orders', 'stock') },
    })
    const { wrapper, router } = await render()
    expect(router.currentRoute.value.name).toBe('configbyte-export-import')
    expect(wrapper.text()).toContain('Your whole configuration as one file')
    expect(wrapper.text()).toContain('Kalns')
    expect(wrapper.text()).toContain('admin')
    expect(wrapper.text()).toContain('signed in with an ID card')
    expect(document.title).toBe('Kalns — admin')
  })

  // An entry shows when its screen was built in AND the coordinator found its section's owner.
  it("lists the host's entries only for the sections the coordinator found", async () => {
    stubCoordinator({
      '/api/configbyte/v1/me': { status: 200, body: me({ orders: ['orders/setup:import'] }) },
      '/api/configbyte/v1/sections': { status: 200, body: sectionsOf('orders') },
    })
    const { wrapper } = await render()
    expect(sidebar(wrapper)).toEqual(['Export / Import', 'History', 'Staff rotas'])
  })

  // The shared screens open the first group; a host screen naming a group of its own
  // gets that group, in the order its first entry arrives.
  it('draws the sidebar in groups, People & access only where the membership register answered', async () => {
    options = {
      ...baseOptions,
      register: 'members',
      sections: { ...baseOptions.sections, members: { configures: ['membership:admin'] } },
      entries: [
        { key: 'org', label: 'host.org', route: 'rota', section: 'members' },
        { key: 'rota', label: 'host.rota', route: 'rota', section: 'orders', group: 'host.orders' },
        { key: 'shelves', label: 'host.shelves', route: 'shelves', section: 'stock', group: 'host.storage' },
      ],
    }
    stubCoordinator({
      '/api/configbyte/v1/me': { status: 200, body: me({ orders: [], stock: [], members: ['membership:admin'] }) },
      '/api/configbyte/v1/sections': { status: 200, body: sectionsOf('orders', 'stock', 'members') },
    })
    const { wrapper } = await render()
    // Holding the administrator's box alone opens the frame.
    expect(wrapper.find('[data-state="nothing"]').exists()).toBe(false)
    expect(sidebar(wrapper)).toEqual(['Export / Import', 'History', 'People & access', 'Org chart', 'Staff rotas', 'Shelves'])
    const text = wrapper.text()
    expect(text.indexOf('Workspace')).toBeLessThan(text.indexOf('Order register'))
    expect(text.indexOf('Order register')).toBeLessThan(text.indexOf('Storage'))
  })

  it('leaves People & access out when the coordinator did not find the register', async () => {
    options = { ...baseOptions, register: 'members' }
    stubCoordinator({
      '/api/configbyte/v1/me': { status: 200, body: me({ orders: ['orders/setup:import'] }) },
      '/api/configbyte/v1/sections': { status: 200, body: sectionsOf('orders') },
    })
    const { wrapper } = await render()
    expect(sidebar(wrapper)).not.toContain('People & access')
  })

  it('shows an entry the workspace lacks as not included, and does not let it open', async () => {
    options = { ...baseOptions, entries: [{ key: 'rota', label: 'host.rota', route: 'rota', section: 'orders', locked: () => true }] }
    stubCoordinator({
      '/api/configbyte/v1/me': { status: 200, body: me({ orders: ['orders/setup:import'] }) },
      '/api/configbyte/v1/sections': { status: 200, body: sectionsOf('orders') },
    })
    const { wrapper } = await render()
    expect(wrapper.text()).toContain('not included')
    expect(wrapper.findAll('a').filter((a) => a.attributes('href') === '/rota')).toEqual([])
  })

  it('says a sentence in the words the host gives in its place', async () => {
    options = { ...baseOptions, words: { en: { frame: { nothing: { title: 'Nothing to set up for you' } } } } }
    stubCoordinator({
      '/api/configbyte/v1/me': { status: 200, body: me({ orders: ['orders:read'] }) },
      '/api/configbyte/v1/sections': { status: 200, body: sectionsOf('orders') },
    })
    const { wrapper } = await render()
    expect(wrapper.text()).toContain('Nothing to set up for you')
    expect(wrapper.text()).not.toContain('Nothing here for you to configure')
  })

  it('tells a colleague who configures nothing here so, rather than showing an empty app', async () => {
    stubCoordinator({
      '/api/configbyte/v1/me': { status: 200, body: me({ orders: ['orders:read'], stock: [] }) },
      '/api/configbyte/v1/sections': { status: 200, body: sectionsOf('orders', 'stock') },
    })
    const { wrapper } = await render()
    expect(wrapper.find('[data-state="nothing"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Nothing here for you to configure')
    expect(wrapper.text()).toContain('Your everyday work is in acme.')
    expect(wrapper.text()).not.toContain('Your whole configuration as one file')
    expect(sidebar(wrapper)).toEqual([])
    // Signing out stays within reach.
    expect(wrapper.findAll('button').map((b) => b.text())).toContain('Sign out')
  })

  it('does not count a scope for a section this deployment does not run', async () => {
    stubCoordinator({
      '/api/configbyte/v1/me': { status: 200, body: me({ orders: [], stock: ['stock/setup:import'] }) },
      '/api/configbyte/v1/sections': { status: 200, body: sectionsOf('orders') },
    })
    const { wrapper } = await render()
    expect(wrapper.find('[data-state="nothing"]').exists()).toBe(true)
  })

  it('reads in the language the deployment names', async () => {
    stubCoordinator({
      '/api/configbyte/v1/me': { status: 200, body: me({ orders: ['orders/setup:import'] }, 'lv') },
      '/api/configbyte/v1/sections': { status: 200, body: sectionsOf('orders') },
    })
    const { wrapper } = await render()
    expect(sidebar(wrapper)[0]).toBe('Eksports / Imports')
    expect(document.title).toBe('Kalns — administrēšana')
  })

  it('signs out with the anti-forgery token, and goes where the coordinator says', async () => {
    stubCoordinator({
      '/api/configbyte/v1/me': { status: 200, body: me({ orders: ['orders/setup:import'] }) },
      '/api/configbyte/v1/sections': { status: 200, body: sectionsOf('orders') },
      '/api/configbyte/v1/logout': { status: 200, body: {} },
    })
    const { wrapper } = await render()
    await wrapper.findAll('button').find((b) => b.text() === 'Sign out')!.trigger('click')
    await settle(wrapper)
    const out = calls.find((c) => c.url.endsWith('/logout'))!
    expect(out.method).toBe('POST')
    expect(out.csrf).toBe('tok-1')
    expect(wrapper.text()).toContain('Configure your workspace')
  })
})

describe('the admin app, when the coordinator is not answering', () => {
  it.each([
    ['the request never arrives', 'unanswered' as Reply],
    ['the web server answers 502 for it', { status: 502, body: '' } as Reply],
    ['the web server answers 504 for it', { status: 504, body: '' } as Reply],
  ])('says so and that nothing changed, when %s, and tries again on request', async (_case, first) => {
    stubCoordinator({
      '/api/configbyte/v1/me': [first, { status: 200, body: me({ orders: ['orders/setup:import'] }) }],
      '/api/configbyte/v1/sections': { status: 200, body: sectionsOf('orders') },
    })
    const { wrapper } = await render()
    expect(wrapper.find('[data-state="unreachable"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('The admin service is not answering')
    expect(wrapper.text()).toContain('Nothing was changed.')
    expect(wrapper.text()).toContain('acme')
    expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('Sign out')
    await wrapper.findAll('button').find((b) => b.text() === 'Try again')!.trigger('click')
    await settle(wrapper)
    expect(wrapper.find('[data-state="unreachable"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Your whole configuration as one file')
  })

  it('reads a refusal from the coordinator as the coordinator speaking, not as silence', async () => {
    stubCoordinator({ '/api/configbyte/v1/me': { status: 401, body: {} } })
    const { wrapper } = await render()
    expect(wrapper.find('[data-state="unreachable"]').exists()).toBe(false)
  })
})

describe('the admin app, closed to this person', () => {
  it('says the app is not open from here when the request comes from outside the allowed networks, and offers no sign-in', async () => {
    stubCoordinator({ '/api/configbyte/v1/me': { status: 403, body: { code: 'err:configbyte:networkNotAllowed' } } })
    const { wrapper } = await render()
    expect(wrapper.find('[data-closed="network"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('The admin app is not open from here')
    expect(wrapper.text()).toContain('Your everyday work is in acme at its usual address.')
    expect(wrapper.findAll('button')).toEqual([])
    expect(calls.map((c) => c.url)).toEqual(['/api/configbyte/v1/me'])
  })

  it('says the same when a sign-in comes back marked as from outside the networks', async () => {
    window.history.replaceState({}, '', '/?error=network')
    stubCoordinator({ '/api/configbyte/v1/me': { status: 401, body: {} } })
    const { wrapper } = await render()
    expect(wrapper.find('[data-closed="network"]').exists()).toBe(true)
  })

  it('says a sign-in was not strong enough, offers the card, and goes back to the sign-in without the marker', async () => {
    window.history.replaceState({}, '', '/?error=assurance')
    stubCoordinator({ '/api/configbyte/v1/me': { status: 401, body: {} } })
    const { wrapper } = await render()
    expect(wrapper.text()).toContain('This sign-in is not strong enough here')
    expect(wrapper.findAll('button').map((b) => b.text())).toEqual(['Sign in with an ID card', 'Back'])
    await wrapper.findAll('button').find((b) => b.text() === 'Back')!.trigger('click')
    await settle(wrapper)
    expect(wrapper.text()).toContain('Configure your workspace')
    expect(window.location.search).toBe('')
  })

  it('turns to the same page when the card lane refuses the sign-in for its strength', async () => {
    Object.assign(window, { webeid: { authenticate: vi.fn(async () => ({ signature: 'sig' })) } })
    stubCoordinator({
      '/api/configbyte/v1/me': { status: 401, body: {} },
      '/api/configbyte/v1/login/webeid/start': { status: 200, body: { nonce: 'n-1', state: 's-1' } },
      '/api/configbyte/v1/login/webeid/complete': { status: 403, body: { code: 'err:session:assuranceTooLow' } },
    })
    const { wrapper } = await render()
    await wrapper.findAll('button').find((b) => b.text() === 'Sign in with an ID card')!.trigger('click')
    await settle(wrapper)
    expect(wrapper.find('[data-closed="assurance"]').exists()).toBe(true)
    expect(calls.filter((c) => c.url.endsWith('/me'))).toHaveLength(1)
    delete (window as { webeid?: unknown }).webeid
  })
})
