// The admin app's frame, against a stand-in coordinator: signed out, an
// administrator, someone who configures nothing here, and a coordinator that is
// not answering — and which entries the sidebar offers in each.
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import AdminFrame from './AdminFrame.vue'
import type { AdminOptions } from './options'
import { configbyteScreens } from './plugin'
import { adminRoutes } from './routes'
import { useAdminSession } from './stores/session'

/** An answer, or none. One that is `held` arrives only when the test lets it go. */
type Reply = { status: number; body: unknown; headers?: Record<string, string>; held?: Promise<unknown> } | 'unanswered'

/** An answer the test lets go of when it chooses, so the page can be read while the call is still out. */
function held(answer: { status: number; body: unknown }): { reply: Reply; release: () => void } {
  let release: () => void = () => {}
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })

  return { reply: { ...answer, held: wait }, release: () => release() }
}

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

const me = (sections: Record<string, string[]>, locale = 'en', loginMethod = 'webEid') => ({
  subject: 'sub:01ARZ3NDEKTSV4RRFFQ69G5FAV',
  name: 'Anna Example',
  loginMethod,
  loa: 'high',
  tenant: 'W-1',
  sections,
  presentation: { displayName: 'Kalns', locale },
})

const sectionsOf = (...names: string[]) => ({ sections: names.map((section) => ({ section, schema: `${section}-config/1`, refersTo: [] })) })

const API = '/api/configbyte/v1'

/** The ways this stand-in deployment offers, by the names people know them by. */
const ways = (extra: Record<string, unknown> = {}): Reply => ({
  status: 200,
  body: {
    ways: [
      { key: 'webEid', flow: 'card', name: 'eID' },
      { key: 'upstream', flow: 'redirect', name: 'Microsoft Entra' },
    ],
    appUrl: 'https://app.example.test/',
    ...extra,
  },
})

const notSignedIn: Reply = { status: 401, body: { code: 'err:configbyte:noSession' } }

let calls: Call[] = []
let routes: Record<string, Reply[]> = {}

/**
 * A stand-in coordinator answering each address with its queue of replies, the
 * last one repeating. It offers the two ways above unless a test says otherwise.
 */
function stubCoordinator(answers: Record<string, Reply | Reply[]>) {
  calls = []
  const all: Record<string, Reply | Reply[]> = { [`${API}/login/ways`]: ways(), ...answers }
  routes = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]))
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>
      calls.push({ method: init?.method ?? 'GET', url, body: typeof init?.body === 'string' ? init.body : '', csrf: headers['X-CSRF-Token'] ?? '' })
      const queue = routes[url] ?? [{ status: 404, body: {} }]
      const reply = queue.length > 1 ? queue.shift()! : queue[0]!
      if (reply === 'unanswered') throw new TypeError('Failed to fetch')
      if (reply.held) await reply.held

      return {
        ok: reply.status < 400,
        status: reply.status,
        headers: new Headers(reply.headers ?? {}),
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

/** Every frame a test drew, taken down after it. */
let drawn: VueWrapper[] = []

/** The frame, drawn against the stand-in coordinator; `attach` puts it in the document, where a menu can take focus. */
async function render({ attach = false } = {}) {
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
    ...(attach ? { attachTo: document.body } : {}),
  })
  drawn.push(wrapper)
  await settle(wrapper)

  return { wrapper, router }
}

// The shell draws the navigation twice, beside the page and along the bottom of a
// narrow screen, so each entry is read once.
const sidebar = (wrapper: ReturnType<typeof mount>) => [...new Set(wrapper.findAll('nav a').map((a) => a.text()))]

/** The sign-in buttons, one per way, by what they say. */
const wayButtons = (wrapper: ReturnType<typeof mount>) => wrapper.findAll('[data-way]').map((b) => b.text())

const click = async (wrapper: ReturnType<typeof mount>, selector: string) => {
  await wrapper.get(selector).trigger('click')
  await settle(wrapper)
}

const clickButton = async (wrapper: ReturnType<typeof mount>, text: string) => {
  await wrapper.findAll('button').find((b) => b.text() === text)!.trigger('click')
  await settle(wrapper)
}

// The card software, as its browser extension puts it on the page. The screens look
// it up once and keep it, so every test answers through this one stand-in.
const card = { authenticate: vi.fn<(nonce: string, options?: { lang?: string }) => Promise<unknown>>() }

beforeEach(() => {
  document.cookie = 'configbyte_csrf=tok-1'
  document.documentElement.lang = ''
  window.history.replaceState({}, '', '/')
  options = baseOptions
  card.authenticate = vi.fn(async () => ({ signature: 'sig' }))
  Object.assign(window, { webeid: card })
})
afterEach(() => {
  for (const wrapper of drawn) wrapper.unmount()
  drawn = []
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe('the admin app, signed out', () => {
  it('asks the person to sign in to the admin app, one button per way by its exact name, with a way to everyday work', async () => {
    stubCoordinator({ [`${API}/me`]: notSignedIn })
    const { wrapper } = await render()
    expect(wrapper.get('h1').text()).toBe('Sign in to the admin app')
    expect(wrapper.text()).toContain('This is the admin app, where the workspace is set up. Everyday work stays in acme at its usual address.')
    expect(wayButtons(wrapper)).toEqual(['eID', 'Microsoft Entra'])
    expect(wrapper.get('a[href="https://app.example.test/"]').text()).toBe('Open acme →')
    // Reading, nothing more: no sign-in starts until a person chooses a way.
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`GET ${API}/me`, `GET ${API}/login/ways`])
  })

  it.each([
    ['expired', 'That sign-in took too long and has expired. Start a fresh one.'],
    ['not_member', 'This account is not a member of this workspace. Ask its administrator to invite you, then sign in again.'],
  ])('says why a sign-in that came back marked %s did not finish', async (marker, words) => {
    window.history.replaceState({}, '', `/?error=${marker}`)
    stubCoordinator({ [`${API}/me`]: notSignedIn })
    const { wrapper } = await render()
    expect(wrapper.get('[role="alert"]').text()).toBe(words)
  })

  // The card's answer is opaque here and travels exactly as the card software produced it.
  it('signs in with the card: the challenge out, the signed answer back verbatim, then reads who is signed in', async () => {
    const signed = { unverifiedCertificate: 'MII…', algorithm: 'ES384', signature: 'sig', format: 'web-eid:1.0' }
    card.authenticate = vi.fn(async () => signed)
    stubCoordinator({
      [`${API}/me`]: [notSignedIn, { status: 200, body: me({ orders: ['orders/setup:import'] }) }],
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders') },
      [`${API}/login/webeid/start`]: { status: 200, body: { nonce: 'n-1', state: 's-1' } },
      [`${API}/login/webeid/complete`]: { status: 200, body: {} },
    })
    const { wrapper } = await render()
    await click(wrapper, '[data-way="webEid"]')
    expect(card.authenticate).toHaveBeenCalledWith('n-1', { lang: 'en' })
    const complete = calls.find((c) => c.url.endsWith('/login/webeid/complete'))!
    expect(JSON.parse(complete.body)).toEqual({ state: 's-1', authToken: signed })
    expect(complete.csrf).toBe('tok-1')
    expect(wrapper.text()).toContain('Anna Example')
  })

  // The authority knows the person and refuses them here: something they can act on,
  // said on the page, never as their card or their computer being at fault.
  it('tells a person the card lane turns away as not a member what to do, on the sign-in page', async () => {
    stubCoordinator({
      [`${API}/me`]: notSignedIn,
      [`${API}/login/webeid/start`]: { status: 200, body: { nonce: 'n-1', state: 's-1' } },
      [`${API}/login/webeid/complete`]: { status: 403, body: { code: 'err:membership:notMember' } },
    })
    const { wrapper } = await render()
    await click(wrapper, '[data-way="webEid"]')
    expect(wrapper.get('[role="alert"]').text()).toBe(
      'This account is not a member of this workspace. Ask its administrator to invite you, then sign in again.',
    )
    expect(wayButtons(wrapper)).toEqual(['eID', 'Microsoft Entra'])
  })

  // Missing software is a step to take; anything else the card says is worth trying again.
  it('says the card software is missing as a step to take, with where to get it', async () => {
    card.authenticate = vi.fn(async () => {
      throw Object.assign(new Error('extension unavailable'), { code: 'ERR_WEBEID_EXTENSION_UNAVAILABLE' })
    })
    stubCoordinator({
      [`${API}/me`]: notSignedIn,
      [`${API}/login/webeid/start`]: { status: 200, body: { nonce: 'n-1', state: 's-1' } },
    })
    const { wrapper } = await render()
    await click(wrapper, '[data-way="webEid"]')
    expect(wrapper.get('[data-said="softwareMissing"]').text()).toContain('The card software is not running')
    expect(wrapper.find('[data-said="cardFailed"]').exists()).toBe(false)
    expect(wayButtons(wrapper)).toEqual(['eID', 'Microsoft Entra'])
  })

  it('says a card that did not answer as something to try again', async () => {
    card.authenticate = vi.fn(async () => {
      throw Object.assign(new Error('user cancelled'), { code: 'ERR_WEBEID_USER_CANCELLED' })
    })
    stubCoordinator({
      [`${API}/me`]: notSignedIn,
      [`${API}/login/webeid/start`]: { status: 200, body: { nonce: 'n-1', state: 's-1' } },
    })
    const { wrapper } = await render()
    await click(wrapper, '[data-way="webEid"]')
    expect(wrapper.get('[role="alert"]').text()).toBe('That did not complete. Check the card is in the reader and try again.')
    expect(wrapper.find('[data-said="softwareMissing"]').exists()).toBe(false)
  })

  it('says a sign-in that could not even start, rather than nothing', async () => {
    stubCoordinator({ [`${API}/me`]: notSignedIn, [`${API}/login/start`]: { status: 500, body: {} } })
    const { wrapper } = await render()
    await click(wrapper, '[data-way="upstream"]')
    const start = calls.find((c) => c.url.endsWith('/login/start'))!
    expect(start.method).toBe('POST')
    expect(start.csrf).toBe('tok-1')
    expect(wrapper.get('[role="alert"]').text()).toBe('The sign-in could not be completed. Try again.')
  })

  it('says the sign-out on the page it comes back to, once', async () => {
    window.sessionStorage.setItem('sign-in.signed-out', '1')
    stubCoordinator({ [`${API}/me`]: notSignedIn })
    const { wrapper } = await render()
    expect(wrapper.get('[role="status"]').text()).toBe(
      'You are signed out of the admin app. If you used your company’s own sign-in, it stays signed in on this computer: on a shared computer, sign out of it too.',
    )
    expect(window.sessionStorage.getItem('sign-in.signed-out')).toBeNull()
  })
})

describe('the admin app, the language before sign-in', () => {
  it('speaks the language this browser chose before, and keeps a new choice', async () => {
    window.localStorage.setItem('sign-in.language', 'lv')
    stubCoordinator({ [`${API}/me`]: notSignedIn })
    const { wrapper } = await render()
    expect(wrapper.get('h1').text()).toBe('Pieslēgšanās administrēšanas lietotnei')
    wrapper.findComponent({ name: 'LanguageMenu' }).vm.$emit('update:modelValue', 'en')
    await settle(wrapper)
    expect(wrapper.get('h1').text()).toBe('Sign in to the admin app')
    expect(window.localStorage.getItem('sign-in.language')).toBe('en')
  })

  it("speaks the browser's own language next", async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['lv-LV', 'en'])
    stubCoordinator({ [`${API}/me`]: notSignedIn, [`${API}/login/ways`]: ways({ language: 'en' }) })
    const { wrapper } = await render()
    expect(wrapper.get('h1').text()).toBe('Pieslēgšanās administrēšanas lietotnei')
  })

  it("speaks the deployment's language when the browser's own is not carried", async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['de-DE'])
    stubCoordinator({ [`${API}/me`]: notSignedIn, [`${API}/login/ways`]: ways({ language: 'lv' }) })
    const { wrapper } = await render()
    expect(wrapper.get('h1').text()).toBe('Pieslēgšanās administrēšanas lietotnei')
  })
})

describe('the admin app, signed in', () => {
  it("opens an administrator on Export / Import, under the deployment's own name, saying the way they signed in by its name", async () => {
    stubCoordinator({
      [`${API}/me`]: { status: 200, body: me({ orders: ['orders/setup:import', 'orders:read'], stock: [] }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders', 'stock') },
    })
    const { wrapper, router } = await render()
    expect(router.currentRoute.value.name).toBe('configbyte-export-import')
    expect(wrapper.text()).toContain('Your whole configuration as one file')
    expect(wrapper.text()).toContain('Kalns')
    expect(wrapper.text()).toContain('admin')
    expect(wrapper.text()).toContain('signed in with eID')
    expect(document.title).toBe('Kalns — admin')
  })

  // A way the deployment no longer offers has no name to show; its code is not one.
  it('says only "signed in" for a way the deployment no longer offers, never its code', async () => {
    stubCoordinator({
      [`${API}/me`]: { status: 200, body: me({ orders: ['orders/setup:import'] }, 'en', 'smartId') },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders') },
    })
    const { wrapper } = await render()
    expect(wrapper.text()).toContain('signed in')
    expect(wrapper.text()).not.toContain('smartId')
  })

  // An entry shows when its screen was built in AND the coordinator found its section's owner.
  it("lists the host's entries only for the sections the coordinator found", async () => {
    stubCoordinator({
      [`${API}/me`]: { status: 200, body: me({ orders: ['orders/setup:import'] }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders') },
    })
    const { wrapper } = await render()
    expect(sidebar(wrapper)).toEqual(['Export & import', 'History', 'Staff rotas'])
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
      [`${API}/me`]: { status: 200, body: me({ orders: [], stock: [], members: ['membership:admin'] }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders', 'stock', 'members') },
    })
    const { wrapper } = await render()
    // Holding the administrator's box alone opens the frame.
    expect(wrapper.find('[data-state="nothing"]').exists()).toBe(false)
    expect(sidebar(wrapper)).toEqual(['Export & import', 'History', 'People & access', 'Org chart', 'Staff rotas', 'Shelves'])
    const text = wrapper.text()
    expect(text.indexOf('Workspace')).toBeLessThan(text.indexOf('Order register'))
    expect(text.indexOf('Order register')).toBeLessThan(text.indexOf('Storage'))
  })

  it('leaves People & access out when the coordinator did not find the register', async () => {
    options = { ...baseOptions, register: 'members' }
    stubCoordinator({
      [`${API}/me`]: { status: 200, body: me({ orders: ['orders/setup:import'] }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders') },
    })
    const { wrapper } = await render()
    expect(sidebar(wrapper)).not.toContain('People & access')
  })

  it('shows an entry the workspace lacks as not included, and does not let it open', async () => {
    options = { ...baseOptions, entries: [{ key: 'rota', label: 'host.rota', route: 'rota', section: 'orders', locked: () => true }] }
    stubCoordinator({
      [`${API}/me`]: { status: 200, body: me({ orders: ['orders/setup:import'] }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders') },
    })
    const { wrapper } = await render()
    expect(wrapper.text()).toContain('not included')
    expect(wrapper.findAll('a').filter((a) => a.attributes('href') === '/rota')).toEqual([])
  })

  it('says a sentence in the words the host gives in its place', async () => {
    options = { ...baseOptions, words: { en: { frame: { nothing: { title: 'Nothing to set up for you' } } } } }
    stubCoordinator({
      [`${API}/me`]: { status: 200, body: me({ orders: ['orders:read'] }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders') },
    })
    const { wrapper } = await render()
    expect(wrapper.text()).toContain('Nothing to set up for you')
    expect(wrapper.text()).not.toContain('Nothing here for you to configure')
  })

  it('tells a colleague who configures nothing here so, rather than showing an empty app', async () => {
    stubCoordinator({
      [`${API}/me`]: { status: 200, body: me({ orders: ['orders:read'], stock: [] }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders', 'stock') },
    })
    const { wrapper } = await render()
    expect(wrapper.find('[data-state="nothing"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Nothing here for you to configure')
    expect(wrapper.text()).toContain('Your everyday work is in acme.')
    expect(wrapper.text()).not.toContain('Your whole configuration as one file')
    expect(sidebar(wrapper)).toEqual([])
    // Signing out stays within reach, and so does everyday work.
    expect(wrapper.findAll('button').map((b) => b.text())).toContain('Sign out')
    expect(wrapper.get('[data-open-app]').attributes('href')).toBe('https://app.example.test/')
    expect(wrapper.get('[data-open-app]').text()).toBe('Open acme →')
  })

  it('does not count a scope for a section this deployment does not run', async () => {
    stubCoordinator({
      [`${API}/me`]: { status: 200, body: me({ orders: [], stock: ['stock/setup:import'] }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders') },
    })
    const { wrapper } = await render()
    expect(wrapper.find('[data-state="nothing"]').exists()).toBe(true)
  })

  it('reads in the language the deployment names', async () => {
    stubCoordinator({
      [`${API}/me`]: { status: 200, body: me({ orders: ['orders/setup:import'] }, 'lv') },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders') },
    })
    const { wrapper } = await render()
    expect(sidebar(wrapper)[0]).toBe('Eksports un imports')
    expect(document.title).toBe('Kalns — administrēšana')
  })

  it('signs out with the anti-forgery token, and says so on the sign-in page', async () => {
    stubCoordinator({
      [`${API}/me`]: { status: 200, body: me({ orders: ['orders/setup:import'] }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders') },
      [`${API}/logout`]: { status: 200, body: {} },
    })
    const { wrapper } = await render()
    await clickButton(wrapper, 'Sign out')
    const out = calls.find((c) => c.url.endsWith('/logout'))!
    expect(out.method).toBe('POST')
    expect(out.csrf).toBe('tok-1')
    expect(wrapper.get('h1').text()).toBe('Sign in to the admin app')
    expect(wrapper.get('[role="status"]').text()).toContain('You are signed out of the admin app.')
  })

  // On a shared computer a silent failure leaves the next person signed in as this one.
  it.each([
    ['the coordinator refuses it', { status: 500, body: {} } as Reply],
    ['the request never arrives', 'unanswered' as Reply],
  ])('says a sign-out that did not complete when %s, and leaves the person where they were', async (_case, reply) => {
    stubCoordinator({
      [`${API}/me`]: { status: 200, body: me({ orders: ['orders/setup:import'] }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders') },
      [`${API}/logout`]: reply,
    })
    const { wrapper } = await render()
    await clickButton(wrapper, 'Sign out')
    expect(wrapper.get('[role="alert"]').text()).toBe('Signing out did not complete. Try again.')
    expect(wrapper.text()).toContain('Anna Example')
    expect(wrapper.find('[data-page="sign-in"]').exists()).toBe(false)
  })
})

// The person's own language: picked at the globe at the foot of the menu, kept for the person by the coordinator
// — the same on every computer — and never in this browser, where the sign-in page keeps a choice of its own.
describe("the admin app, the person's own language", () => {
  const language = `${API}/me/language`
  const cardLane = {
    [`${API}/login/webeid/start`]: { status: 200, body: { nonce: 'n-1', state: 's-1' } } as Reply,
    [`${API}/login/webeid/complete`]: { status: 200, body: {} } as Reply,
  }

  /** Someone who configures the orders, with a language of their own or none, where everyone here reads `deployment`. */
  const speaking = (own: string | null, deployment: string) => ({
    ...me({ orders: ['orders/setup:import'] }),
    presentation: { displayName: 'Kalns', locale: own ?? deployment, personLocale: own, deploymentLocale: deployment },
  })

  /** What the coordinator answers a kept choice with. */
  const kept = (locale: string, own: string | null, deployment: string): Reply => ({
    status: 200,
    body: { locale, personLocale: own, deploymentLocale: deployment },
  })

  function signedIn(own: string | null, deployment: string, answers: Record<string, Reply | Reply[]> = {}) {
    stubCoordinator({
      [`${API}/me`]: { status: 200, body: speaking(own, deployment) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders') },
      ...answers,
    })
  }

  /** The globe in the menu beside the page. */
  const globe = (wrapper: ReturnType<typeof mount>) => wrapper.getComponent({ name: 'LanguageMenu' })

  /** A language picked at the globe. */
  async function pick(wrapper: ReturnType<typeof mount>, code: string) {
    globe(wrapper).vm.$emit('update:modelValue', code)
    await settle(wrapper)
  }

  /** The globe opened from the keyboard, as a person would: its button focused, then Enter. */
  async function open(group: Pick<DOMWrapper<Element>, 'get'>) {
    const button = group.get('button')
    ;(button.element as HTMLElement).focus()
    await button.trigger('keydown', { key: 'Enter' })
    await flushPromises()
  }

  /** The languages the opened globe lists, as read: the words (the check mark aside), and whether each is the one in use. */
  const listed = () =>
    [...document.body.querySelectorAll('[role^="menuitem"]')].map((el) => [
      (el.textContent ?? '').replace('✓', '').replace(/\s+/g, ' ').trim(),
      el.getAttribute('aria-checked'),
    ])

  const presentation = () => useAdminSession().me?.presentation

  it('puts the globe first at the foot of the menu, above the name, naming the language in use in itself', async () => {
    signedIn(null, 'en')
    const { wrapper } = await render({ attach: true })
    const aside = wrapper.get('aside')
    const group = aside.get('[role="group"]')

    expect(group.attributes('aria-label')).toBe('Language')
    expect(group.get('button span[lang]').text()).toBe('English')
    expect(group.element.parentElement?.firstElementChild).toBe(group.element)
    const name = aside.findAll('span').find((s) => s.text() === 'Anna Example')!
    expect(group.element.compareDocumentPosition(name.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Drawn for the dark menu, across its width, its list opening upward.
    expect(group.get('button').classes()).toEqual(expect.arrayContaining(['w-full', 'bg-transparent', 'text-console-text']))
    await open(group)
    expect(document.body.querySelector('[role="menu"]')?.getAttribute('data-side')).toBe('top')
  })

  it("lists every language the app carries in its own name, the deployment's marked in the page's language", async () => {
    signedIn('lv', 'en')
    const { wrapper } = await render({ attach: true })
    const group = wrapper.get('aside [role="group"]')

    expect(group.attributes('aria-label')).toBe('Valoda')
    await open(group)
    expect(listed()).toEqual([
      ['English visiem šeit', 'false'],
      ['Latviešu', 'true'],
    ])
    // The name is said in its own language; the mark, in the page's.
    const english = document.body.querySelector('[role^="menuitem"] [lang]')
    expect([english?.getAttribute('lang'), english?.textContent]).toEqual(['en', 'English'])
  })

  it('draws the same globe at the foot of the menu a phone opens', async () => {
    signedIn(null, 'en')
    const { wrapper } = await render()
    await wrapper.get('button[aria-label="Open menu"]').trigger('click')
    await settle(wrapper)

    expect(wrapper.findAllComponents({ name: 'LanguageMenu' })).toHaveLength(2)
    const group = document.body.querySelector('[role="dialog"] [role="group"]')
    expect(group?.getAttribute('aria-label')).toBe('Language')
    expect(group?.parentElement?.firstElementChild).toBe(group)
  })

  it('changes the page at once, then keeps the choice for the person, taking what the coordinator answers', async () => {
    const put = held({ status: 200, body: { locale: 'lv', personLocale: 'lv', deploymentLocale: 'en' } })
    signedIn(null, 'en', { [language]: put.reply })
    const { wrapper } = await render()

    await pick(wrapper, 'lv')
    // The coordinator has not answered yet, and the page already reads in Latvian.
    expect(sidebar(wrapper)[0]).toBe('Eksports un imports')
    expect(globe(wrapper).props('modelValue')).toBe('lv')
    expect(calls.filter((c) => c.url === language).map((c) => [c.method, JSON.parse(c.body), c.csrf])).toEqual([
      ['PUT', { language: 'lv' }, 'tok-1'],
    ])

    put.release()
    await settle(wrapper)
    expect(presentation()).toEqual({ displayName: 'Kalns', locale: 'lv', personLocale: 'lv', deploymentLocale: 'en' })
    expect(sidebar(wrapper)[0]).toBe('Eksports un imports')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  // The coordinator turns it into a clear; the screens need not know which language that is.
  it("sends the code of the language everyone here has like any other, and takes the answer that clears the person's own", async () => {
    signedIn('lv', 'en', { [language]: kept('en', null, 'en') })
    const { wrapper } = await render({ attach: true })
    await open(wrapper.get('aside [role="group"]'))
    ;(document.body.querySelectorAll('[role^="menuitem"]')[0] as HTMLElement).click()
    await settle(wrapper)

    expect(calls.filter((c) => c.url === language).map((c) => JSON.parse(c.body))).toEqual([{ language: 'en' }])
    expect(presentation()).toMatchObject({ locale: 'en', personLocale: null, deploymentLocale: 'en' })
    expect(sidebar(wrapper)[0]).toBe('Export & import')
  })

  it.each([
    ['refused', { status: 400, body: { code: 'err:request:invalid' } } as Reply],
    ['answered for by the web server', { status: 502, body: '' } as Reply],
    ['not answered', 'unanswered' as Reply],
  ])('puts the language back, and says so, when the choice is %s', async (_case, reply) => {
    signedIn(null, 'en', { [language]: reply })
    const { wrapper } = await render()

    await pick(wrapper, 'lv')
    expect(sidebar(wrapper)[0]).toBe('Export & import')
    expect(globe(wrapper).props('modelValue')).toBe('en')
    expect(presentation()).toMatchObject({ locale: 'en', personLocale: null })
    expect(document.documentElement.lang).toBe('en')
    expect(wrapper.get('[role="alert"]').text()).toBe('Changing the language did not complete. Try again.')
  })

  it('says it in the language put back, and no more once a choice is kept', async () => {
    signedIn('lv', 'en', { [language]: [{ status: 500, body: {} }, kept('en', null, 'en')] })
    const { wrapper } = await render()

    await pick(wrapper, 'en')
    expect(wrapper.get('[role="alert"]').text()).toBe('Valodu nomainīt neizdevās. Mēģiniet vēlreiz.')
    await pick(wrapper, 'en')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(sidebar(wrapper)[0]).toBe('Export & import')
  })

  // The page follows the latest pick; what an earlier one is answered with afterwards changes nothing.
  it('keeps the latest pick when an earlier one is answered after it', async () => {
    const first = held({ status: 200, body: { locale: 'lv', personLocale: 'lv', deploymentLocale: 'en' } })
    signedIn(null, 'en', { [language]: [first.reply, kept('en', null, 'en')] })
    const { wrapper } = await render()

    await pick(wrapper, 'lv')
    await pick(wrapper, 'en')
    first.release()
    await settle(wrapper)
    expect(sidebar(wrapper)[0]).toBe('Export & import')
    expect(presentation()).toMatchObject({ locale: 'en', personLocale: null })
  })

  it('says nothing when an earlier pick fails after a later one was kept', async () => {
    const first = held({ status: 500, body: {} })
    signedIn(null, 'en', { [language]: [first.reply, kept('en', null, 'en')] })
    const { wrapper } = await render()

    await pick(wrapper, 'lv')
    await pick(wrapper, 'en')
    first.release()
    await settle(wrapper)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(sidebar(wrapper)[0]).toBe('Export & import')
  })

  // What a failure puts back is the language last kept, never one only shown while a call was out.
  it('puts back the language last kept when a later pick fails while an earlier one is still out', async () => {
    const first = held({ status: 500, body: {} })
    signedIn(null, 'en', { [language]: [first.reply, { status: 500, body: {} }] })
    const { wrapper } = await render()

    await pick(wrapper, 'lv')
    await pick(wrapper, 'en')
    expect(sidebar(wrapper)[0]).toBe('Export & import')
    expect(wrapper.get('[role="alert"]').text()).toBe('Changing the language did not complete. Try again.')
    first.release()
    await settle(wrapper)
    expect(sidebar(wrapper)[0]).toBe('Export & import')
    expect(presentation()).toMatchObject({ locale: 'en', personLocale: null })
  })

  it('puts back what an earlier pick kept when a later one then fails', async () => {
    const first = held({ status: 200, body: { locale: 'lv', personLocale: 'lv', deploymentLocale: 'en' } })
    const second = held({ status: 500, body: {} })
    signedIn(null, 'en', { [language]: [first.reply, second.reply] })
    const { wrapper } = await render()

    await pick(wrapper, 'lv')
    await pick(wrapper, 'en')
    first.release()
    await settle(wrapper)
    second.release()
    await settle(wrapper)
    expect(sidebar(wrapper)[0]).toBe('Eksports un imports')
    expect(presentation()).toMatchObject({ locale: 'lv', personLocale: 'lv' })
    expect(wrapper.get('[role="alert"]').text()).toBe('Valodu nomainīt neizdevās. Mēģiniet vēlreiz.')
  })

  // A screen reader reads the words in the language the document says it is in.
  it("marks the document with the page's language, and moves it with every change", async () => {
    signedIn(null, 'lv', { [language]: [{ status: 500, body: {} }, kept('en', 'en', 'lv')] })
    const { wrapper } = await render()
    expect(document.documentElement.lang).toBe('lv')

    await pick(wrapper, 'en')
    expect(document.documentElement.lang).toBe('lv')
    await pick(wrapper, 'en')
    expect(document.documentElement.lang).toBe('en')
  })

  it("marks the document with the sign-in page's language too", async () => {
    stubCoordinator({ [`${API}/me`]: notSignedIn })
    const { wrapper } = await render()
    expect(document.documentElement.lang).toBe('en')

    wrapper.findComponent({ name: 'LanguageMenu' }).vm.$emit('update:modelValue', 'lv')
    await settle(wrapper)
    expect(document.documentElement.lang).toBe('lv')
  })

  // On a shared computer the next person's sign-in page must not open in this person's language.
  it("leaves the language this browser keeps for the sign-in page as it was", async () => {
    window.localStorage.setItem('sign-in.language', 'en')
    const write = vi.spyOn(Storage.prototype, 'setItem')
    signedIn(null, 'en', { [language]: kept('lv', 'lv', 'en') })
    const { wrapper } = await render()

    await pick(wrapper, 'lv')
    expect(sidebar(wrapper)[0]).toBe('Eksports un imports')
    expect(window.localStorage.getItem('sign-in.language')).toBe('en')
    expect(write.mock.calls.filter(([key]) => key === 'sign-in.language')).toEqual([])
  })

  // The session it was about is gone; on a shared computer the next sign-in may be someone else's.
  it('drops a failed change once the sign-in has ended', async () => {
    signedIn(null, 'en', { [language]: { status: 500, body: {} }, ...cardLane })
    const { wrapper } = await render()
    await pick(wrapper, 'lv')
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)

    useAdminSession().signInEnded()
    await settle(wrapper)
    await click(wrapper, '[data-way="webEid"]')
    expect(wrapper.text()).toContain('Anna Example')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('says nothing of a change whose failure arrives after the sign-in ended', async () => {
    const put = held({ status: 500, body: {} })
    signedIn(null, 'en', { [language]: put.reply, ...cardLane })
    const { wrapper } = await render()
    await pick(wrapper, 'lv')

    useAdminSession().signInEnded()
    await settle(wrapper)
    put.release()
    await settle(wrapper)
    await click(wrapper, '[data-way="webEid"]')
    expect(wrapper.text()).toContain('Anna Example')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})

// A sign-in that ends while someone works is one page saying so, never a failure on every screen that was
// reading; any other failure stays where it happened.
describe('the admin app, when the sign-in ends', () => {
  const history = `${API}/sections/members/history`
  const ended = 'Your sign-in has ended. Sign in again.'
  const cardLane = {
    [`${API}/login/webeid/start`]: { status: 200, body: { nonce: 'n-1', state: 's-1' } } as Reply,
    [`${API}/login/webeid/complete`]: { status: 200, body: {} } as Reply,
  }

  /** An administrator of a deployment with the membership register, whose History reads its lines. */
  function signedIn(answers: Record<string, Reply | Reply[]> = {}) {
    options = { ...baseOptions, register: 'members' }
    stubCoordinator({
      [`${API}/me`]: { status: 200, body: me({ orders: ['orders/setup:import'], members: ['membership:admin'] }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders', 'members') },
      ...answers,
    })
  }

  async function open(path: string) {
    const rendered = await render()
    await rendered.router.push(path)
    await settle(rendered.wrapper)

    return rendered
  }

  it('turns the whole screen into the sign-in page, saying so once, when a screen reads "not signed in"', async () => {
    signedIn({ [history]: notSignedIn })
    const { wrapper } = await open('/history')

    expect(wrapper.get('h1').text()).toBe('Sign in to the admin app')
    expect(wrapper.findAll('[role="status"]').map((s) => s.text())).toEqual([ended])
    expect(wayButtons(wrapper)).toEqual(['eID', 'Microsoft Entra'])
    expect(sidebar(wrapper)).toEqual([])
    expect(wrapper.text()).not.toContain('Anna Example')
  })

  it('says the same when the configuration download reads "not signed in"', async () => {
    signedIn({ [`${API}/config/export`]: notSignedIn })
    const { wrapper } = await render()

    await clickButton(wrapper, 'Download configuration')

    expect(wrapper.get('[role="status"]').text()).toBe(ended)
    expect(wrapper.text()).not.toContain('could not be downloaded')
  })

  it('says it in Latvian where this browser chose Latvian', async () => {
    window.localStorage.setItem('sign-in.language', 'lv')
    signedIn({ [history]: notSignedIn })
    const { wrapper } = await open('/history')

    expect(wrapper.get('[role="status"]').text()).toBe('Jūsu pieslēgšanās ir beigusies. Pieslēdzieties vēlreiz.')
  })

  it.each([
    ['refused as not allowed', { status: 403, body: { code: 'err:request:forbidden' } } as Reply, 'Could not read the changes in People & access (you may not read them)'],
    ['failing', { status: 500, body: {} } as Reply, 'Could not read the changes in People & access (the service failed)'],
    ['not answered', 'unanswered' as Reply, 'People & access is not answering'],
  ])('keeps a read %s on its own screen, inside the frame', async (_case, reply, said) => {
    signedIn({ [history]: reply })
    const { wrapper } = await open('/history')

    expect(wrapper.text()).toContain(said)
    // Said in words: the refusal's code never reaches the page.
    expect(wrapper.text()).not.toContain('err:')
    expect(wrapper.text()).toContain('Anna Example')
    expect(wrapper.find('[data-page="sign-in"]').exists()).toBe(false)
  })

  // The host's own screens make their own calls, and end the same session when one is answered that way.
  it("ends the same way when the host's own read says so", async () => {
    signedIn()
    const { wrapper } = await render()

    useAdminSession().signInEnded()
    await settle(wrapper)

    expect(wrapper.get('[role="status"]').text()).toBe(ended)
  })

  it('says nothing of an ended sign-in to someone who was not signed in', async () => {
    stubCoordinator({ [`${API}/me`]: notSignedIn })
    const { wrapper } = await render()

    expect(wrapper.get('h1').text()).toBe('Sign in to the admin app')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  // Someone signed in works on without the ways; the page that follows cannot.
  it('reads the ways again for the page when they had not arrived', async () => {
    signedIn({ [`${API}/login/ways`]: [{ status: 500, body: {} }, ways()], [history]: notSignedIn })
    const { wrapper } = await open('/history')

    expect(wayButtons(wrapper)).toEqual(['eID', 'Microsoft Entra'])
    expect(wrapper.get('[role="status"]').text()).toBe(ended)
    expect(wrapper.find('[data-state="unreachable"]').exists()).toBe(false)
  })

  // The address never changed, so a sign-in on the page comes back to the screen that was open.
  it('signs in again with the card and comes back to the screen it left', async () => {
    signedIn({ [history]: [notSignedIn, { status: 200, body: { events: [] } }], ...cardLane })
    const { wrapper, router } = await open('/history')

    await click(wrapper, '[data-way="webEid"]')

    expect(wrapper.text()).toContain('Anna Example')
    expect(router.currentRoute.value.name).toBe('configbyte-history')
    expect(wrapper.text()).not.toContain('Could not read the changes')
  })

  // The session it was about is gone; saying it failed after the next sign-in would be false.
  it('drops a sign-out that did not complete, once the sign-in has ended', async () => {
    signedIn({ [`${API}/logout`]: { status: 500, body: {} }, [history]: [notSignedIn, { status: 200, body: { events: [] } }], ...cardLane })
    const { wrapper, router } = await render()
    await clickButton(wrapper, 'Sign out')
    expect(wrapper.text()).toContain('Signing out did not complete. Try again.')

    await router.push('/history')
    await settle(wrapper)
    await click(wrapper, '[data-way="webEid"]')

    expect(wrapper.text()).toContain('Anna Example')
    expect(wrapper.text()).not.toContain('Signing out did not complete. Try again.')
  })
})

describe('the admin app, when the coordinator is not answering', () => {
  it.each([
    ['the request never arrives', 'unanswered' as Reply],
    ['the web server answers 502 for it', { status: 502, body: '' } as Reply],
    ['the web server answers 504 for it', { status: 504, body: '' } as Reply],
    ['the coordinator fails to say who is signed in', { status: 500, body: {} } as Reply],
  ])('says so and that nothing changed, when %s, and tries again on request', async (_case, first) => {
    stubCoordinator({
      [`${API}/me`]: [first, { status: 200, body: me({ orders: ['orders/setup:import'] }) }],
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders') },
    })
    const { wrapper } = await render()
    expect(wrapper.find('[data-state="unreachable"]').exists()).toBe(true)
    expect(wrapper.find('[data-page="sign-in"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('The admin app is not answering')
    expect(wrapper.text()).toContain('Nothing was changed.')
    expect(wrapper.text()).toContain('acme')
    expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('Sign out')
    await clickButton(wrapper, 'Try again')
    expect(wrapper.find('[data-state="unreachable"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Your whole configuration as one file')
  })

  // Without the ways there is no way in to offer, and an empty list would read as
  // "nothing is set up here".
  it('reads the ways again on Try again when they did not arrive', async () => {
    stubCoordinator({ [`${API}/me`]: notSignedIn, [`${API}/login/ways`]: ['unanswered', ways()] })
    const { wrapper } = await render()
    expect(wrapper.find('[data-state="unreachable"]').exists()).toBe(true)
    await clickButton(wrapper, 'Try again')
    expect(wayButtons(wrapper)).toEqual(['eID', 'Microsoft Entra'])
    expect(wrapper.text()).not.toContain('No way to sign in is set up here')
  })

  // The ways matter only to someone signing in; someone signed in loses only the way's name beside their own.
  it('lets someone signed in work on when only the ways did not arrive', async () => {
    stubCoordinator({
      [`${API}/me`]: { status: 200, body: me({ orders: ['orders/setup:import'] }) },
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders') },
      [`${API}/login/ways`]: { status: 500, body: {} },
    })
    const { wrapper } = await render()

    expect(wrapper.find('[data-state="unreachable"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Your whole configuration as one file')
    expect(wrapper.text()).toContain('Anna Example')
    expect(wrapper.text()).not.toContain('signed in with')
  })

  it('reads a refusal from the coordinator as the coordinator speaking, not as silence', async () => {
    stubCoordinator({ [`${API}/me`]: { status: 401, body: {} } })
    const { wrapper } = await render()
    expect(wrapper.find('[data-state="unreachable"]').exists()).toBe(false)
  })
})

describe('the admin app, closed to this person', () => {
  it('says the app is not open from here when the request comes from outside the allowed networks, and offers no sign-in', async () => {
    const outside: Reply = { status: 403, body: { code: 'err:configbyte:networkNotAllowed' } }
    stubCoordinator({ [`${API}/me`]: outside, [`${API}/login/ways`]: outside })
    const { wrapper } = await render()
    expect(wrapper.find('[data-closed="network"]').exists()).toBe(true)
    expect(wrapper.get('h1').text()).toBe('The admin app is not open from here')
    expect(wrapper.text()).toContain('Your everyday work is in acme at its usual address.')
    // Nothing to choose but the language: no way in, no word about ways.
    expect(wrapper.findAll('button').filter((b) => b.attributes('aria-haspopup') === undefined)).toEqual([])
    expect(wrapper.find('[data-said]').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'LanguageMenu' }).exists()).toBe(true)
    expect(calls.every((c) => c.method === 'GET')).toBe(true)
  })

  // Nothing else answers from outside the networks, so the refusal itself carries
  // the one way on: where everyday work is.
  it('points to everyday work from the page that closes the app, with the address the refusal carries', async () => {
    const outside: Reply = {
      status: 403,
      body: { code: 'err:configbyte:networkNotAllowed' },
      headers: { Link: '<https://app.example.test/>; rel="related"' },
    }
    stubCoordinator({ [`${API}/me`]: outside, [`${API}/login/ways`]: outside })
    const { wrapper } = await render()
    expect(wrapper.find('[data-closed="network"]').exists()).toBe(true)
    expect(wrapper.get('a[href="https://app.example.test/"]').text()).toBe('Open acme →')
  })

  it('links only to a web address, whatever the coordinator names', async () => {
    const outside: Reply = {
      status: 403,
      body: { code: 'err:configbyte:networkNotAllowed' },
      headers: { Link: '<javascript:alert(1)>; rel="related"' },
    }
    stubCoordinator({ [`${API}/me`]: outside, [`${API}/login/ways`]: outside })
    const { wrapper } = await render()
    expect(wrapper.find('[data-closed="network"]').exists()).toBe(true)
    expect(wrapper.findAll('main a')).toEqual([])
  })

  it('speaks the language this browser chose on the page that closes the app', async () => {
    window.localStorage.setItem('sign-in.language', 'lv')
    const outside: Reply = { status: 403, body: { code: 'err:configbyte:networkNotAllowed' } }
    stubCoordinator({ [`${API}/me`]: outside, [`${API}/login/ways`]: outside })
    const { wrapper } = await render()
    expect(wrapper.get('h1').text()).toBe('Administrēšanas lietotne šeit nav pieejama')
  })

  it('says the same when a sign-in comes back marked as from outside the networks', async () => {
    window.history.replaceState({}, '', '/?error=network')
    stubCoordinator({ [`${API}/me`]: notSignedIn })
    const { wrapper } = await render()
    expect(wrapper.find('[data-closed="network"]').exists()).toBe(true)
  })

  // Which ways count as strong is the authority's setting, so every way is offered
  // and the coordinator judges the next attempt as it judged this one.
  it('says a sign-in was not strong enough, offers every way by its name, and goes back to the sign-in without the marker', async () => {
    window.history.replaceState({}, '', '/?error=assurance')
    stubCoordinator({ [`${API}/me`]: notSignedIn })
    const { wrapper } = await render()
    expect(wrapper.find('[data-closed="assurance"]').exists()).toBe(true)
    expect(wrapper.get('h1').text()).toBe('This sign-in is not strong enough here')
    const offered = wrapper.findAll('button').filter((b) => b.attributes('aria-haspopup') === undefined)
    expect(offered.map((b) => b.text())).toEqual(['eID', 'Microsoft Entra', 'Back'])
    // Asking for a stronger sign-in, the page leads nowhere else and explains nothing more.
    expect(wrapper.find('a[href="https://app.example.test/"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('opens your company’s own sign-in page')
    await clickButton(wrapper, 'Back')
    expect(wrapper.get('h1').text()).toBe('Sign in to the admin app')
    expect(window.location.search).toBe('')
  })

  it('signs in afresh from the not-strong-enough page with the way chosen there', async () => {
    window.history.replaceState({}, '', '/?error=assurance')
    stubCoordinator({
      [`${API}/me`]: [notSignedIn, { status: 200, body: me({ orders: ['orders/setup:import'] }) }],
      [`${API}/sections`]: { status: 200, body: sectionsOf('orders') },
      [`${API}/login/webeid/start`]: { status: 200, body: { nonce: 'n-1', state: 's-1' } },
      [`${API}/login/webeid/complete`]: { status: 200, body: {} },
    })
    const { wrapper } = await render()
    await clickButton(wrapper, 'eID')
    expect(card.authenticate).toHaveBeenCalledOnce()
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.url)).toEqual([`${API}/login/webeid/start`, `${API}/login/webeid/complete`])
    expect(window.location.search).toBe('')
    expect(wrapper.text()).toContain('Anna Example')
  })

  it('turns to the same page when the card lane refuses the sign-in for its strength', async () => {
    stubCoordinator({
      [`${API}/me`]: notSignedIn,
      [`${API}/login/webeid/start`]: { status: 200, body: { nonce: 'n-1', state: 's-1' } },
      [`${API}/login/webeid/complete`]: { status: 403, body: { code: 'err:session:assuranceTooLow' } },
    })
    const { wrapper } = await render()
    await click(wrapper, '[data-way="webEid"]')
    expect(wrapper.find('[data-closed="assurance"]').exists()).toBe(true)
    expect(calls.filter((c) => c.url.endsWith('/me'))).toHaveLength(1)
  })
})
