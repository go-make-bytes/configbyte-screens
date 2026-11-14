// The admin app's frame for a person who is in more than one workspace: the line under the brand,
// the page that asks which to work in, the lines about a workspace that ended or is gone, and the
// notice on a page left behind when the person moved to another workspace in a second tab.
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import AdminFrame from './AdminFrame.vue'
import ChooseWorkspace from './components/ChooseWorkspace.vue'
import { post } from './lib/api'
import { forgetOpenedWorkspace, OTHER_WORKSPACE, whenWorkspaceMoves, workspaceMoved } from './lib/workspace'
import type { AdminOptions } from './options'
import { configbyteScreens } from './plugin'
import { adminRoutes } from './routes'
import { useDeployment } from './stores/deployment'
import { useAdminSession } from './stores/session'

type Reply = { status: number; body: unknown } | 'unanswered'
interface Call {
  method: string
  url: string
  body: unknown
  headers: Record<string, string>
}

const API = '/api/configbyte/v1'
const START = `${API}/login/start`
const NOTICE = `${API}/me/workspace-notice`

const options: AdminOptions = {
  product: 'host.product',
  never: 'host.never',
  sections: { orders: { title: 'host.orders', configures: ['orders/setup:import'] } },
  carries: [],
}
const hostWords = { en: { host: { product: 'acme', never: 'never', orders: 'Orders' } }, lv: { host: { product: 'acme', never: 'nekad', orders: 'Pasūtījumi' } } }

const kalve = { id: 'W-1', name: 'Kalve Ltd' }
const ozols = { id: 'W-2', name: 'Ozols SIA' }

/** The sign-in answer: signed in to Kalve Ltd unless told otherwise. */
const me = (extra: Record<string, unknown> = {}) => ({
  subject: 'sub:A',
  name: 'Anna Example',
  loginMethod: 'webEid',
  loa: 'high',
  tenant: 'W-1',
  workspace: { name: 'Kalve Ltd', entitlements: [] },
  sections: { orders: ['orders/setup:import'] },
  presentation: { displayName: 'Kalns', locale: 'en', personLocale: null, deploymentLocale: 'en' },
  ...extra,
})
/** Signed in to no workspace, in the ones given. */
const meInNone = (workspaces: { id: string; name: string }[], extra: Record<string, unknown> = {}) =>
  me({ tenant: '', workspace: null, sections: {}, workspaces, ...extra })
const two = { workspaces: [kalve, ozols] }

const ok = (body: unknown = {}): Reply => ({ status: 200, body })
const sectionsBody = { sections: [{ section: 'orders', schema: 'orders-config/1', refersTo: [] }] }
const ways = { ways: [{ key: 'webEid', flow: 'card', name: 'eID' }] }
const started: Reply = ok({ authorizeUrl: 'https://id.example.test/go' })
const refused = (status: number, code: string): Reply => ({ status, body: { code, title: 'refused' } })

let calls: Call[] = []
let queues: Record<string, Reply[]> = {}

function stub(extra: Record<string, Reply | Reply[]> = {}) {
  calls = []
  const base: Record<string, Reply | Reply[]> = {
    [`GET ${API}/me`]: ok(me()),
    [`GET ${API}/sections`]: ok(sectionsBody),
    [`GET ${API}/login/ways`]: ok(ways),
  }
  queues = Object.fromEntries(Object.entries({ ...base, ...extra }).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]))
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({ method, url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined, headers: { ...((init?.headers ?? {}) as Record<string, string>) } })
      const queue = queues[`${method} ${url}`] ?? [{ status: 404, body: {} }]
      const reply = queue.length > 1 ? queue.shift()! : queue[0]!
      if (reply === 'unanswered') throw new TypeError('Failed to fetch')

      return { ok: reply.status < 400, status: reply.status, headers: new Headers(), json: async () => reply.body } as unknown as Response
    }),
  )
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
const posts = (url: string) => calls.filter((c) => c.method === 'POST' && c.url === url)
const countOf = (method: string, url: string) => calls.filter((c) => c.method === method && c.url === url).length
const writes = () => calls.filter((c) => c.method !== 'GET')

/** The line under the brand, as the menu beside the page draws it. */
const scope = (wrapper: W) => wrapper.get('aside [data-scope]')
/** The workspaces the opened line lists, as read: the words, and the one marked as the current. */
const listed = () =>
  [...document.body.querySelectorAll('[role^="menuitem"]')].map((el) => [norm((el.textContent ?? '').replace('✓', '')), el.getAttribute('aria-checked')])
async function openScope(wrapper: W) {
  const button = scope(wrapper).get('button')
  ;(button.element as HTMLElement).focus()
  await button.trigger('keydown', { key: 'Enter' })
  await flushPromises()
}
const items = () => [...document.body.querySelectorAll<HTMLElement>('[role^="menuitem"]')]
/** What a browser holds that could carry a workspace's id or name: nothing may. */
function storageHoldsNoWorkspace() {
  const everything = JSON.stringify({ ...window.localStorage, ...window.sessionStorage })
  expect(everything).not.toMatch(/W-1|W-2|Kalve|Ozols/)
}

let assign = vi.fn()
let reload = vi.fn()

beforeEach(() => {
  document.cookie = 'configbyte_csrf=tok-1'
  window.history.replaceState({}, '', '/')
  forgetOpenedWorkspace()
  assign = vi.fn()
  reload = vi.fn()
  vi.stubGlobal('location', { ...window.location, assign, reload })
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

describe('the line under the brand', () => {
  it('names the one workspace as plain words with nothing to press, and leaves the footer as it is', async () => {
    stub({ [`GET ${API}/me`]: ok(me({ workspace: null })) })
    const without = await render()
    expect(without.wrapper.find('aside [data-scope]').exists()).toBe(false)
    const footerWithout = without.wrapper.get('aside .border-t.border-console-line').html()
    without.wrapper.unmount()

    stub()
    const { wrapper } = await render()
    expect(scope(wrapper).text()).toBe('Kalve Ltd')
    expect(scope(wrapper).attributes('aria-label')).toBe('Workspace')
    expect(scope(wrapper).find('button').exists()).toBe(false)
    expect(wrapper.get('aside .border-t.border-console-line').html()).toBe(footerWithout)
  })

  it('is a button wearing the current workspace for a person in two, and opened it heads and lists both with the current one marked', async () => {
    stub({ [`GET ${API}/me`]: ok(me(two)) })
    const { wrapper } = await render()
    expect(scope(wrapper).get('button').text()).toContain('Kalve Ltd')
    await openScope(wrapper)
    expect(document.body.querySelector('[role="menu"]')?.textContent).toContain('Workspace')
    expect(listed()).toEqual([
      ['Kalve Ltd', 'true'],
      ['Ozols SIA', 'false'],
    ])
  })

  it('keeps the brand the deployment’s name with one workspace and with two', async () => {
    stub()
    const one = await render()
    expect(one.wrapper.get('aside').text()).toContain('Kalns')
    one.wrapper.unmount()
    stub({ [`GET ${API}/me`]: ok(me(two)) })
    const many = await render()
    expect(many.wrapper.get('aside').text()).toContain('Kalns')
    expect(document.title).toBe('Kalns — admin')
  })

  it('starts one sign-in for the other workspace, sends the browser to the answered address, and a second choice while it is under way posts nothing', async () => {
    stub({ [`GET ${API}/me`]: ok(me(two)), [`POST ${START}`]: started })
    const { wrapper } = await render()
    await openScope(wrapper)
    items()[1]!.click()
    await settle(wrapper)
    expect(posts(START)).toHaveLength(1)
    expect(posts(START)[0]!.body).toEqual({ method: 'webEid', workspace: 'W-2' })
    expect(assign).toHaveBeenCalledWith('https://id.example.test/go')
    expect(useAdminSession().switchingTo).toBe('W-2')
    await useAdminSession().switchTo('W-2')
    await openScope(wrapper)
    items()[1]!.click()
    await settle(wrapper)
    expect(posts(START)).toHaveLength(1)
    storageHoldsNoWorkspace()
  })

  it.each([
    ['refused', refused(500, 'err:request:failed')],
    ['not answered', 'unanswered' as Reply],
  ])('goes nowhere when the start is %s, says the sign-in could not start, and frees the list', async (_case, reply) => {
    stub({ [`GET ${API}/me`]: ok(me(two)), [`POST ${START}`]: reply })
    const { wrapper } = await render()
    expect(wrapper.find('[data-line="workspace-start-failed"]').exists()).toBe(false)
    await openScope(wrapper)
    items()[1]!.click()
    await settle(wrapper)
    expect(assign).not.toHaveBeenCalled()
    expect(useAdminSession().message).toBe('failed')
    expect(useAdminSession().switchingTo).toBe('')
    // Said to the person, in the words the sign-in page has for it, as a refusal.
    const line = wrapper.get('[data-line="workspace-start-failed"]')
    expect(line.text()).toBe('The sign-in could not be completed. Try again.')
    expect(line.attributes('data-outcome')).toBe('refused')
    // The list can be used again, and the line goes when the next start begins.
    stub({ [`GET ${API}/me`]: ok(me(two)), [`POST ${START}`]: started })
    await openScope(wrapper)
    items()[1]!.click()
    await settle(wrapper)
    expect(posts(START)).toHaveLength(1)
    expect(assign).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-line="workspace-start-failed"]').exists()).toBe(false)
  })

  it('draws the line in the menu a phone opens too', async () => {
    stub({ [`GET ${API}/me`]: ok(me(two)) })
    const { wrapper } = await render()
    await wrapper.get('button[aria-label="Open menu"]').trigger('click')
    await settle(wrapper)
    const inDrawer = document.body.querySelector('[role="dialog"] [data-scope="W-1"]')
    expect(inDrawer?.textContent).toContain('Kalve Ltd')
  })

  it('draws it with its list for a person who configures nothing in the workspace they are in', async () => {
    stub({ [`GET ${API}/me`]: ok(me({ ...two, sections: {} })) })
    const { wrapper } = await render()
    expect(wrapper.find('[data-state="nothing"]').exists()).toBe(true)
    expect(scope(wrapper).get('button').text()).toContain('Kalve Ltd')
    await openScope(wrapper)
    expect(listed().map(([name]) => name)).toEqual(['Kalve Ltd', 'Ozols SIA'])
  })

  it('draws the deployment’s own group only where the answer says the person manages the deployment', async () => {
    const group = (admin: boolean) => ({ deployment: { mode: 'saas', admin, firstRunOwed: false, signInAge: 900 } })
    stub({ [`GET ${API}/me`]: ok(me({ ...two, ...group(false) })) })
    const customer = await render()
    const links = (wrapper: W) => [...new Set(wrapper.findAll('nav a').map((a) => a.text()))]
    expect(links(customer.wrapper)).toContain('Export & import')
    expect(links(customer.wrapper)).not.toContain('Companies')
    expect(links(customer.wrapper)).not.toContain('Deployment admins')
    customer.wrapper.unmount()
    stub({ [`GET ${API}/me`]: ok(me({ ...two, ...group(true) })), [`GET ${API}/deployment/companies`]: ok({ companies: [] }) })
    const own = await render()
    expect(links(own.wrapper)).toEqual(expect.arrayContaining(['Export & import', 'Companies', 'Deployment admins']))
  })
})

describe('the page that asks which workspace to work in', () => {
  const choose = (wrapper: W) => wrapper.get('[data-page="choose-workspace"]')

  it('is drawn for a person in two who is signed in to none, with neither the shell nor the first run', async () => {
    stub({ [`GET ${API}/me`]: ok(meInNone([kalve, ozols])) })
    const { wrapper } = await render()
    const page = choose(wrapper)
    expect(page.get('h1').text()).toBe('Choose a workspace')
    expect(page.text()).toContain('You are in more than one. You can switch later from the workspace’s name at the top.')
    expect(page.findAll('[data-choice]').map((r) => r.text())).toEqual(['Kalve Ltd', 'Ozols SIA'])
    expect(page.get('ul').attributes('aria-label')).toBe('Your workspaces')
    expect(page.findAll('button').some((b) => b.text() === 'Sign out')).toBe(true)
    expect(wrapper.find('aside').exists()).toBe(false)
    expect(wrapper.find('[data-page="first-run"]').exists()).toBe(false)
    expect(wrapper.find('[data-mark]').exists()).toBe(true)
  })

  it('starts the sign-in for the row pressed, and marks the rows as under way', async () => {
    stub({ [`GET ${API}/me`]: ok(meInNone([kalve, ozols])), [`POST ${START}`]: started })
    const { wrapper } = await render()
    await wrapper.get('[data-choice="W-2"]').trigger('click')
    await settle(wrapper)
    expect(posts(START)).toHaveLength(1)
    expect(posts(START)[0]!.body).toEqual({ method: 'webEid', workspace: 'W-2' })
    expect(wrapper.get('[data-choice="W-2"]').attributes('aria-busy')).toBe('true')
    expect(wrapper.get('[data-choice="W-1"]').attributes('aria-disabled')).toBe('true')
    await wrapper.get('[data-choice="W-1"]').trigger('click')
    await settle(wrapper)
    expect(posts(START)).toHaveLength(1)
    storageHoldsNoWorkspace()
  })

  it('says a refused start on the page to choose as the line above the rows, in place of the ended line, and not before the press', async () => {
    stub({ [`GET ${API}/me`]: ok(meInNone([kalve, ozols], { workspaceEnded: 'Vecais SIA' })), [`POST ${START}`]: refused(500, 'err:request:failed'), [`DELETE ${NOTICE}`]: { status: 204, body: undefined } })
    const { wrapper } = await render()
    const line = () => wrapper.find('[data-page="choose-workspace"] [data-line="workspace"]')
    expect(line().text()).toBe('Your access to Vecais SIA has ended.')
    await wrapper.get('[data-choice="W-2"]').trigger('click')
    await settle(wrapper)
    expect(assign).not.toHaveBeenCalled()
    expect(line().text()).toBe('The sign-in could not be completed. Try again.')
    expect(line().attributes('data-outcome')).toBe('refused')
    // Before any press with no ended line there is no line at all.
    wrapper.unmount()
    stub({ [`GET ${API}/me`]: ok(meInNone([kalve, ozols])) })
    const plain = await render()
    expect(plain.wrapper.find('[data-page="choose-workspace"] [data-line="workspace"]').exists()).toBe(false)
  })

  it('draws the app’s tag beside the name on the page to choose when one is given, and none when not', async () => {
    stub({ [`GET ${API}/me`]: ok(meInNone([kalve, ozols])) })
    const { wrapper } = await render()
    const page = wrapper.get('[data-page="choose-workspace"]')
    expect(page.get('span.font-mono').text()).toBe('admin')
    const rows = [{ key: 'a', label: 'A' }]
    const words = { title: 't', lead: 'l', listLabel: 'x', signOutLabel: 's', product: 'acme', rows }
    const withTag = mount(ChooseWorkspace, { props: { ...words, tag: 'admin' } })
    const without = mount(ChooseWorkspace, { props: words })
    expect(withTag.find('span.font-mono').text()).toBe('admin')
    expect(without.find('span.font-mono').exists()).toBe(false)
  })

  it('is today’s page that nothing here is theirs when there is no workspace and no list', async () => {
    stub({ [`GET ${API}/me`]: ok(me({ tenant: '', workspace: null, sections: {} })) })
    const { wrapper } = await render()
    expect(wrapper.find('[data-page="choose-workspace"]').exists()).toBe(false)
    expect(wrapper.find('[data-state="nothing"]').exists()).toBe(true)
    expect(wrapper.find('[data-scope]').exists()).toBe(false)
  })

  it('speaks Latvian, with no English word of the new keys on it', async () => {
    stub({ [`GET ${API}/me`]: ok(meInNone([kalve, ozols], { presentation: { displayName: 'Kalns', locale: 'lv', personLocale: null, deploymentLocale: 'lv' } })) })
    const { wrapper } = await render()
    const page = choose(wrapper)
    expect(page.get('h1').text()).toBe('Izvēlieties darbvietu')
    expect(page.text()).toContain('Jūs esat vairākās darbvietās. Vēlāk varat pārslēgties, nospiežot darbvietas nosaukumu augšā.')
    expect(page.get('ul').attributes('aria-label')).toBe('Jūsu darbvietas')
    expect(page.findAll('button').some((b) => b.text() === 'Iziet')).toBe(true)
    for (const english of ['Choose a workspace', 'You are in more than one', 'Your workspaces', 'Sign out']) expect(page.text()).not.toContain(english)
  })

  it('comes before the first run when the first run is owed and the person is in none', async () => {
    const deployment = { mode: 'saas', admin: true, firstRunOwed: true, signInAge: 900 }
    stub({ [`GET ${API}/me`]: ok(meInNone([kalve, ozols], { deployment })) })
    const { wrapper } = await render()
    expect(wrapper.find('[data-page="choose-workspace"]').exists()).toBe(true)
    expect(wrapper.find('[data-page="first-run"]').exists()).toBe(false)
  })
})

describe('the lines about a workspace', () => {
  it('says a chosen workspace the person is no longer in as a refusal, tells the coordinator once, and keeps the line after it answers', async () => {
    stub({ [`GET ${API}/me`]: ok(me({ ...two, workspaceGone: 'Vecais SIA' })), [`DELETE ${NOTICE}`]: { status: 204, body: undefined } })
    const { wrapper } = await render()
    const line = wrapper.get('[data-line="workspace-gone"]')
    expect(line.text()).toBe('You are no longer in Vecais SIA, so you stay in Kalve Ltd.')
    expect(line.attributes('data-outcome')).toBe('refused')
    expect(countOf('DELETE', NOTICE)).toBe(1)
    expect(useAdminSession().me?.workspaceGone).toBeUndefined()
    expect(wrapper.find('[data-line="workspace-gone"]').exists()).toBe(true)
    storageHoldsNoWorkspace()
  })

  it('starts the sign-in for the one workspace left, with no press, when the access to the last one ended', async () => {
    stub({ [`GET ${API}/me`]: ok(meInNone([ozols], { workspaceEnded: 'Kalve Ltd' })), [`POST ${START}`]: started })
    const { wrapper } = await render()
    expect(posts(START)).toHaveLength(1)
    expect(posts(START)[0]!.body).toEqual({ method: 'webEid', workspace: 'W-2' })
    expect(assign).toHaveBeenCalledWith('https://id.example.test/go')
    expect(wrapper.get('[data-choice="W-2"]').attributes('aria-busy')).toBe('true')
    storageHoldsNoWorkspace()
  })

  it('says an access that ended as a line that is not a refusal, with both names, and tells the coordinator once', async () => {
    stub({ [`GET ${API}/me`]: ok(me({ ...two, workspaceEnded: 'Vecais SIA' })), [`DELETE ${NOTICE}`]: { status: 204, body: undefined } })
    const { wrapper } = await render()
    const line = wrapper.get('[data-line="workspace-ended"]')
    expect(line.text()).toBe('Your access to Vecais SIA has ended. You are now working in Kalve Ltd.')
    expect(line.attributes('data-outcome')).toBe('done')
    expect(countOf('DELETE', NOTICE)).toBe(1)
  })

  it('puts the line above the rows of the page to choose when there are two, and tells the coordinator once', async () => {
    stub({ [`GET ${API}/me`]: ok(meInNone([kalve, ozols], { workspaceEnded: 'Vecais SIA' })), [`DELETE ${NOTICE}`]: { status: 204, body: undefined } })
    const { wrapper } = await render()
    const line = wrapper.get('[data-page="choose-workspace"] [data-line="workspace"]')
    expect(line.text()).toBe('Your access to Vecais SIA has ended.')
    const rows = wrapper.get('[data-page="choose-workspace"] ul')
    expect(line.element.compareDocumentPosition(rows.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(countOf('DELETE', NOTICE)).toBe(1)
    expect(posts(START)).toHaveLength(0)
  })

  it('does not start again when the page loads in the same state after its own attempt came back, and keeps its one row and the line', async () => {
    // The address is set on the real location, then the stand-in is built from it.
    vi.unstubAllGlobals()
    window.history.replaceState({}, '', '/?error=cancelled')
    vi.stubGlobal('location', { ...window.location, assign, reload })
    stub({ [`GET ${API}/me`]: ok(meInNone([ozols], { workspaceEnded: 'Kalve Ltd' })), [`DELETE ${NOTICE}`]: { status: 204, body: undefined } })
    const { wrapper } = await render()
    expect(posts(START)).toHaveLength(0)
    const page = wrapper.get('[data-page="choose-workspace"]')
    expect(page.findAll('[data-choice]').map((r) => r.text())).toEqual(['Ozols SIA'])
    expect(page.get('[data-line="workspace"]').text()).toBe('Your access to Kalve Ltd has ended.')
  })

  it('shows the line all the same when telling the coordinator fails, and the store still holds the name', async () => {
    stub({ [`GET ${API}/me`]: ok(me({ ...two, workspaceEnded: 'Vecais SIA' })), [`DELETE ${NOTICE}`]: refused(500, 'err:request:failed') })
    const { wrapper } = await render()
    expect(wrapper.get('[data-line="workspace-ended"]').text()).toContain('Your access to Vecais SIA has ended.')
    expect(countOf('DELETE', NOTICE)).toBe(1)
    expect(useAdminSession().me?.workspaceEnded).toBe('Vecais SIA')
  })
})

describe('a page left behind in another workspace', () => {
  const moved = refused(409, OTHER_WORKSPACE)
  const hold = () => document.body.querySelector('[data-hold]')

  it('holds the page with a notice naming both workspaces, reloads from its button once, and the refused call still fails for its caller', async () => {
    stub({ [`GET ${API}/me`]: [ok(me(two)), ok(me({ ...two, tenant: 'W-2', workspace: { name: 'Ozols SIA', entitlements: [] } }))], [`POST /api/act`]: moved })
    const { wrapper } = await render()
    expect(hold()).toBeNull()
    const outcome = await post('/api/act', {}).catch((e: unknown) => e)
    await settle(wrapper)
    expect(outcome).toMatchObject({ status: 409, code: OTHER_WORKSPACE })
    expect(hold()?.textContent).toContain('This tab was opened for Kalve Ltd. You are now working in Ozols SIA, so nothing was done here.')
    expect(reload).not.toHaveBeenCalled()
    ;(hold()?.querySelector('button') as HTMLElement).click()
    await settle(wrapper)
    expect(reload).toHaveBeenCalledTimes(1)
    storageHoldsNoWorkspace()
  })

  it('loads the page again at once, with no notice, when the answer now names none', async () => {
    stub({ [`GET ${API}/me`]: [ok(me(two)), ok(meInNone([kalve, ozols]))], [`POST /api/act`]: moved })
    const { wrapper } = await render()
    await post('/api/act', {}).catch(() => undefined)
    await settle(wrapper)
    expect(hold()).toBeNull()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the answer names the page’s own workspace', async () => {
    stub({ [`GET ${API}/me`]: ok(me(two)), [`POST /api/act`]: moved })
    const { wrapper } = await render()
    await post('/api/act', {}).catch(() => undefined)
    await settle(wrapper)
    expect(hold()).toBeNull()
    expect(reload).not.toHaveBeenCalled()
    expect(countOf('GET', `${API}/me`)).toBe(2)
  })

  it.each([
    ['a 409 with another code', refused(409, 'err:request:conflict')],
    ['a 403 with that code', refused(403, OTHER_WORKSPACE)],
  ])('does not hold the page for %s, nor read the answer again', async (_case, reply) => {
    stub({ [`GET ${API}/me`]: ok(me(two)), [`POST /api/act`]: reply })
    const { wrapper } = await render()
    const outcome = await post('/api/act', {}).catch((e: unknown) => e)
    await settle(wrapper)
    expect(outcome).toMatchObject({ status: (reply as { status: number }).status })
    expect(hold()).toBeNull()
    expect(reload).not.toHaveBeenCalled()
    expect(countOf('GET', `${API}/me`)).toBe(1)
  })

  it('reads the answer once and opens one notice for two calls refused at the same moment', async () => {
    stub({ [`GET ${API}/me`]: [ok(me(two)), ok(me({ ...two, tenant: 'W-2', workspace: { name: 'Ozols SIA', entitlements: [] } }))], [`POST /api/act`]: moved })
    const { wrapper } = await render()
    await Promise.all([post('/api/act', {}).catch(() => undefined), post('/api/act', {}).catch(() => undefined)])
    await settle(wrapper)
    expect(countOf('GET', `${API}/me`)).toBe(2)
    expect(document.body.querySelectorAll('[data-hold]')).toHaveLength(1)
  })
})

describe('after a sign-in in another tab', () => {
  const area = { deployment: { mode: 'saas', admin: true, firstRunOwed: false, signInAge: 900 } }

  it('goes on for the same person in the same workspace, and drops everything and loads again, sending nothing, for the same person in another', async () => {
    stub({
      [`GET ${API}/me`]: [ok(me({ ...two, ...area })), ok(me({ ...two, ...area }))],
      [`GET ${API}/deployment/companies`]: ok({ companies: [] }),
    })
    const { pinia } = await render('/deployment/companies')
    setActivePinia(pinia)
    await useDeployment().afterOtherTab()
    expect(reload).not.toHaveBeenCalled()

    stub({
      [`GET ${API}/me`]: [ok(me({ ...two, ...area })), ok(me({ ...two, ...area, tenant: 'W-2', workspace: { name: 'Ozols SIA', entitlements: [] } }))],
      [`GET ${API}/deployment/companies`]: ok({ companies: [] }),
    })
    const again = await render('/deployment/companies')
    setActivePinia(again.pinia)
    await useDeployment().afterOtherTab()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(writes()).toEqual([])
    storageHoldsNoWorkspace()
  })
})

describe('a host reporting its own refused calls', () => {
  const nowInOzols = () => me({ ...two, tenant: 'W-2', workspace: { name: 'Ozols SIA', entitlements: [] } })

  it('opens the notice in the frame when the refusal is reported from outside', async () => {
    stub({ [`GET ${API}/me`]: [ok(me(two)), ok(nowInOzols())] })
    const { wrapper } = await render()
    expect(document.body.querySelector('[data-hold]')).toBeNull()
    workspaceMoved()
    await settle(wrapper)
    expect(document.body.querySelector('[data-hold]')?.textContent).toContain('You are now working in Ozols SIA')
  })

  it('still tells the frame after a host adds a listener of its own', async () => {
    stub({ [`GET ${API}/me`]: [ok(me(two)), ok(nowInOzols())] })
    const { wrapper } = await render()
    const host = vi.fn()
    const stop = whenWorkspaceMoves(host)
    workspaceMoved()
    await settle(wrapper)
    stop()
    expect(host).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('[data-hold]')).not.toBeNull()
  })

  it('takes the frame’s listener off when the frame is taken down', async () => {
    stub({ [`GET ${API}/me`]: [ok(me(two)), ok(nowInOzols())] })
    const { wrapper } = await render()
    wrapper.unmount()
    workspaceMoved()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(countOf('GET', `${API}/me`)).toBe(1)
  })
})

describe('a first read of who is signed in that names the other workspace', () => {
  const other = refused(409, OTHER_WORKSPACE)

  it('reads once more and starts the sign-in for the one workspace left, never drawing the not-answering page', async () => {
    stub({ [`GET ${API}/me`]: [other, ok(meInNone([ozols], { workspaceEnded: 'Kalve Ltd' }))], [`POST ${START}`]: started })
    const { wrapper } = await render()
    expect(countOf('GET', `${API}/me`)).toBe(2)
    expect(posts(START)).toHaveLength(1)
    expect(posts(START)[0]!.body).toEqual({ method: 'webEid', workspace: 'W-2' })
    expect(wrapper.find('[data-state="unreachable"]').exists()).toBe(false)
    expect(useAdminSession().unreachable).toBe(false)
  })

  it('goes on with the page to choose and the ended line when two workspaces are left', async () => {
    stub({ [`GET ${API}/me`]: [other, ok(meInNone([kalve, ozols], { workspaceEnded: 'Vecais SIA' }))], [`DELETE ${NOTICE}`]: { status: 204, body: undefined } })
    const { wrapper } = await render()
    expect(countOf('GET', `${API}/me`)).toBe(2)
    expect(wrapper.find('[data-state="unreachable"]').exists()).toBe(false)
    expect(wrapper.get('[data-page="choose-workspace"] [data-line="workspace"]').text()).toBe('Your access to Vecais SIA has ended.')
  })

  it('says the coordinator is not answering when it is refused both times, after exactly two reads', async () => {
    stub({ [`GET ${API}/me`]: other })
    const { wrapper } = await render()
    expect(countOf('GET', `${API}/me`)).toBe(2)
    expect(wrapper.find('[data-state="unreachable"]').exists()).toBe(true)
  })
})

describe('the new lines in Latvian', () => {
  const latvian = { presentation: { displayName: 'Kalns', locale: 'lv', personLocale: null, deploymentLocale: 'lv' } }

  it('says the ended line over the page in Latvian', async () => {
    stub({ [`GET ${API}/me`]: ok(me({ ...two, ...latvian, workspaceEnded: 'Vecais SIA' })), [`DELETE ${NOTICE}`]: { status: 204, body: undefined } })
    const { wrapper } = await render()
    expect(wrapper.get('[data-line="workspace-ended"]').text()).toBe('Jūsu piekļuve darbvietai Vecais SIA ir beigusies. Tagad jūs strādājat darbvietā Kalve Ltd.')
  })

  it('says the gone line over the page in Latvian', async () => {
    stub({ [`GET ${API}/me`]: ok(me({ ...two, ...latvian, workspaceGone: 'Vecais SIA' })), [`DELETE ${NOTICE}`]: { status: 204, body: undefined } })
    const { wrapper } = await render()
    expect(wrapper.get('[data-line="workspace-gone"]').text()).toBe('Jūs vairs neesat darbvietā Vecais SIA, tāpēc paliekat darbvietā Kalve Ltd.')
  })

  it('says the notice on a page left behind in Latvian, with its button', async () => {
    const nowInOzols = me({ ...two, ...latvian, tenant: 'W-2', workspace: { name: 'Ozols SIA', entitlements: [] } })
    stub({ [`GET ${API}/me`]: [ok(me({ ...two, ...latvian })), ok(nowInOzols)] })
    const { wrapper } = await render()
    workspaceMoved()
    await settle(wrapper)
    const notice = document.body.querySelector('[data-hold]')
    expect(norm(notice?.textContent ?? '')).toContain(
      'Šī cilne tika atvērta darbvietai Kalve Ltd. Tagad jūs strādājat darbvietā Ozols SIA, tāpēc šeit nekas netika izdarīts.',
    )
    expect(norm(notice?.querySelector('button')?.textContent ?? '')).toBe('Pārlādēt')
  })

  it('says the line above the rows of the page to choose in Latvian', async () => {
    stub({ [`GET ${API}/me`]: ok(meInNone([kalve, ozols], { ...latvian, workspaceEnded: 'Vecais SIA' })), [`DELETE ${NOTICE}`]: { status: 204, body: undefined } })
    const { wrapper } = await render()
    expect(wrapper.get('[data-page="choose-workspace"] [data-line="workspace"]').text()).toBe('Jūsu piekļuve darbvietai Vecais SIA ir beigusies.')
  })
})
