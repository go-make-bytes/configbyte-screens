// People & access against a stand-in coordinator relaying to a stand-in register,
// inside a memory-history router: what each address opens, how the Users list
// counts, filters and pages, every act's address and body, the words after each
// act, the refusals worded by the act that was made, and which lists an act reads
// again.
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import { ApiError } from '../lib/api'
import { localDay } from '../lib/format'
import type { AdminOptions, RoleSetting } from '../options'
import { configbyteScreens } from '../plugin'
import { adminRoutes } from '../routes'
import { usePeople } from '../stores/people'
import { useAdminSession } from '../stores/session'
import PeopleAccessView from './PeopleAccessView.vue'

type Reply = { status: number; body: unknown }
interface Call {
  method: string
  url: string
  body: unknown
  csrf: string
}

const R = '/api/configbyte/v1/sections/members'
const T = `${R}/tenants/W-1`

function dayAgo(n: number): string {
  return localDay(new Date(Date.now() - n * 86_400_000).toISOString())
}

const member = (over: Record<string, unknown>) => ({
  kind: 'person',
  status: 'active',
  administrator: false,
  arrival: false,
  serviceRoles: [],
  tenantRoles: [],
  userType: { id: 't-member', name: 'Member', labels: { lv: 'Dalībnieks' } },
  chartUserType: null,
  lastSignedInOn: null,
  ...over,
})

/** One of every kind of person, and a service. */
const members = () => [
  member({ id: 'm1', subjectKey: 'sub:A', displayName: 'Anna Admin', administrator: true, userType: { id: 't-clerk', name: 'Clerk' }, lastSignedInOn: dayAgo(0) }),
  member({ id: 'm2', subjectKey: 'sub:J', displayName: 'Jānis New', arrival: true, lastSignedInOn: dayAgo(1) }),
  member({ id: 'm3', subjectKey: 'sub:I', displayName: 'Ilze Invited', status: 'invited' }),
  member({
    id: 'm4',
    subjectKey: 'sub:K',
    displayName: 'Kārlis Picker',
    tenantRoles: [{ id: 'r1', name: 'Picker' }],
    userType: { id: 't-floor', name: 'Floor' },
    chartUserType: { id: 't-lead', name: 'Lead' },
    lastSignedInOn: dayAgo(41),
  }),
  member({ id: 'm5', subjectKey: 'sub:T', displayName: 'Toms Gone', status: 'revoked' }),
  member({ id: 'm6', subjectKey: 'sub:B', displayName: 'Anna Bērziņa', tenantRoles: [{ id: 'r2', name: 'Worker' }], lastSignedInOn: dayAgo(3) }),
  member({ id: 's1', subjectKey: 'svc:printer', displayName: 'Label printer', kind: 'service' }),
]

/** More people, each holding a role, so none is an arrival. */
const crowd = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    member({ id: `x${i}`, subjectKey: `sub:x${i}`, displayName: `Extra ${String(i).padStart(2, '0')}`, tenantRoles: [{ id: 'r2', name: 'Worker' }], lastSignedInOn: dayAgo(1) }),
  )

/** More people who hold nothing across the workspace. */
const arrivals = (n: number) =>
  Array.from({ length: n }, (_, i) => member({ id: `a${i}`, subjectKey: `sub:a${i}`, displayName: `Arrival ${i + 1}`, arrival: true, lastSignedInOn: dayAgo(2) }))

const roles = () => [
  {
    id: 'r1',
    name: 'Picker',
    description: '',
    permissions: ['orders/order:view', 'stock/shelf:view', 'orders/order:viewField@price.1', 'other/thing:do', 'orders/order:archive'],
  },
  { id: 'r2', seed: 'worker', name: 'Worker', labels: { lv: 'Strādnieks' }, description: 'Does the work', permissions: ['orders/order:view'] },
  // A role made in Latvian, with its English name.
  { id: 'r3', name: 'Noliktavas pārzinis', labels: { en: 'Storekeeper' }, description: 'Keeps the stock', permissions: [] },
]

// Each carries the count the register still sends beside it; nothing here reads it.
const userTypes = () => [
  { id: 't-member', name: 'Member', labels: { lv: 'Dalībnieks' }, description: 'Everyone who joins.', permissions: [], members: 99, corporateLoginDefault: false, workspaceDefault: true },
  { id: 't-clerk', name: 'Clerk', description: '', permissions: ['orders/order:create'], members: 77, corporateLoginDefault: true, workspaceDefault: false },
  { id: 't-floor', name: 'Floor', description: '', permissions: [], members: 0, corporateLoginDefault: false, workspaceDefault: false },
  { id: 't-lead', name: 'Lead', description: '', permissions: [], members: 5, corporateLoginDefault: false, workspaceDefault: false },
]

const positions = () => [
  { id: 'pos1', name: 'Lead position', userTypeId: 't-lead', people: [{ userId: 'm4' }] },
  { id: 'pos2', name: 'Counter', userTypeId: '', people: [{ userId: 'm1' }] },
]

const vocabulary = {
  schema: 'members-config/1',
  services: [
    {
      key: 'orders',
      displayName: 'Order service',
      permissions: [
        { feature: 'order', act: 'view', description: 'See orders', class: 'ordinary', plane: 'object', labels: { lv: 'Redzēt pasūtījumus' } },
        { feature: 'order', act: 'create', description: 'Register an order', class: 'ordinary', plane: 'tenant' },
        { feature: 'order/note', act: 'add', description: 'Add a note to an order', class: 'ordinary', plane: 'object' },
        { feature: 'setup/kinds', act: 'manage', description: 'Define order kinds', class: 'tenantConfiguration', plane: 'tenant' },
        { feature: 'order', act: 'viewField', description: 'See a restricted order field', class: 'perField', plane: 'object' },
        { feature: 'order', act: 'archive', description: 'Archive an order', class: 'ordinary', plane: 'object', retired: true },
      ],
    },
    { key: 'stock', displayName: 'Stock service', permissions: [{ feature: 'shelf', act: 'view', description: 'See shelves', class: 'ordinary', plane: 'object' }] },
    { key: 'oversight', displayName: 'Oversight', permissions: [{ feature: 'order', act: 'view', description: 'See what those below see', class: 'ordinary', plane: 'chart' }] },
  ],
}

const held = {
  orders: ['orders/order:view', 'orders/order:create', 'orders/order/note:add', 'orders/setup/kinds:manage', 'orders/order:viewField'],
  stock: ['stock/shelf:view'],
  oversight: ['oversight/order:view'],
  members: ['membership:admin'],
}

const words = {
  en: {
    host: {
      product: 'acme',
      never: 'never',
      groups: { orders: 'Orders', notes: 'Notes', restricted: 'Restricted fields' },
      guard: { every: 'Everyone with this role will see every «{field}».', own: 'Everyone with this role will see their own «{field}».' },
      setting: {
        word: 'The creator becomes its',
        note: 'Whoever makes one is placed with this role.',
        saved: 'Saved: the creator becomes its «{role}».',
        holds: 'The creator becomes its «{role}». Choose another role for the creator first.',
        refused: '«{role}» could not be chosen: the host does not know it yet.',
      },
    },
  },
}

let calls: Call[] = []
let answers: Record<string, Reply[]> = {}

function stub(extra: Record<string, Reply | Reply[]> = {}, people: unknown[] = members()) {
  calls = []
  const base: Record<string, Reply | Reply[]> = {
    [`GET ${T}/access`]: { status: 200, body: { members: people } },
    [`GET ${T}/roles`]: { status: 200, body: { roles: roles() } },
    [`GET ${T}/user-types`]: { status: 200, body: { userTypes: userTypes() } },
    [`GET ${R}/config`]: { status: 200, body: vocabulary },
    [`GET ${T}/chart/positions`]: { status: 200, body: { included: true, positions: positions() } },
  }
  answers = Object.fromEntries(Object.entries({ ...base, ...extra }).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]))
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const headers = (init?.headers ?? {}) as Record<string, string>
      calls.push({ method, url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined, csrf: headers['X-CSRF-Token'] ?? '' })
      const queue = answers[`${method} ${url}`] ?? [{ status: 404, body: { code: 'err:test:noSuchRoute' } }]
      const reply = queue.length > 1 ? queue.shift()! : queue[0]!

      return { ok: reply.status < 400, status: reply.status, headers: new Headers(), json: async () => reply.body } as unknown as Response
    }),
  )
}

async function settle(wrapper: { vm: { $nextTick: () => Promise<unknown> } }) {
  for (let pass = 0; pass < 8; pass += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()
  }
}

/** The host's creator setting: what it holds, and what a write does. */
function creator(over: Partial<RoleSetting> = {}): RoleSetting {
  return {
    key: 'creatorRole',
    word: 'host.setting.word',
    note: 'host.setting.note',
    read: vi.fn(async () => 'r2'),
    write: vi.fn(async () => undefined),
    saved: 'host.setting.saved',
    holds: 'host.setting.holds',
    ...over,
  }
}

function hostOptions(setting: RoleSetting[] = []): AdminOptions {
  return {
    product: 'host.product',
    never: 'host.never',
    sections: {},
    carries: [],
    register: 'members',
    roles: {
      groups: [
        { word: 'host.groups.orders', prefixes: ['orders/order:'] },
        { word: 'host.groups.notes', prefixes: ['orders/order/note:'] },
      ],
      fields: vi.fn(async () => [{ permission: 'orders/order:viewField@price.2', name: 'Price', group: 'host.groups.restricted' }]),
      guard: (_box, ticks) => (ticks.includes('orders/order:view') ? { key: 'host.guard.every' } : { key: 'host.guard.own' }),
      settings: setting,
    },
  }
}

async function render(input: { url?: string; locale?: string; options?: AdminOptions; pinia?: ReturnType<typeof createPinia>; tenant?: string } = {}) {
  const pinia = input.pinia ?? createPinia()
  setActivePinia(pinia)
  const session = useAdminSession()
  session.me = {
    subject: 'sub:A',
    name: 'Anna Admin',
    loginMethod: 'an ID card',
    loa: 'high',
    tenant: input.tenant ?? 'W-1',
    sections: held,
    presentation: { displayName: 'Kalns', locale: 'en', personLocale: null, deploymentLocale: 'en' },
  }
  session.order = ['orders', 'stock', 'members']
  session.resolved = true
  const i18n = createI18n({ legacy: false, locale: input.locale ?? 'en', fallbackLocale: 'en', messages: structuredClone(words) })
  const router = createRouter({ history: createMemoryHistory(), routes: adminRoutes() })
  await router.push(input.url ?? '/people')
  await router.isReady()
  const options = input.options ?? hostOptions()
  const wrapper = mount(PeopleAccessView, { global: { plugins: [pinia, i18n, router, configbyteScreens(i18n, options)] } })
  await settle(wrapper)

  return { wrapper, router, options, pinia }
}

type Shown = Awaited<ReturnType<typeof render>>
type W = Shown['wrapper']
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const button = (wrapper: W, text: string) => wrapper.findAll('button').find((b) => norm(b.text()) === text)!
const writes = () => calls.filter((c) => c.method !== 'GET')
// A read by the end of its path: the coordinator's own address holds `/config` too.
const reads = (part: string) => calls.filter((c) => c.method === 'GET' && c.url.split('?')[0]!.endsWith(part)).length
const go = async (s: Shown, path: string) => {
  await s.router.push(path)
  await settle(s.wrapper)
}
const people = (wrapper: W) => wrapper.findAll('ul[aria-label="People"] > li')
const rowOf = (wrapper: W, name: string) => people(wrapper).find((r) => r.text().includes(name))!
/** One of the counts that filter: the strip's buttons are the only ones that say whether they are pressed. */
const chip = (wrapper: W, label: string) => wrapper.findAll('button[aria-pressed]').find((b) => norm(b.text()).startsWith(`${label} `))!
/** One of the radio choices, whose words are drawn twice for its width. */
const choice = (wrapper: W, label: string) => wrapper.findAll('[role="radio"]').find((b) => b.text().startsWith(label))!
const range = (wrapper: W) => norm(wrapper.get('nav[aria-label="Pages"] > span').text())

beforeEach(() => {
  document.cookie = 'configbyte_csrf=tok-1'
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('People & access › the address and the head', () => {
  it('says the workspace, the title once, the counts from the reads already made, and a count on each tab', async () => {
    stub()
    const { wrapper } = await render()
    expect(wrapper.get('h1').text()).toBe('People & access')
    expect(wrapper.text()).toContain('Workspace')
    // Five people hold access, one of them an administrator, and one service acts here.
    expect(norm(wrapper.get('header').text())).toContain('5 people · 1 administrator · 1 service')
    expect(wrapper.findAll('[role="tab"]').map((t) => norm(t.text()))).toEqual(['Users 5', 'Roles 3', 'User types 4'])
  })

  it('opens each tab at its own address, and marks the tab while one of its items is open', async () => {
    stub()
    const s = await render()
    await s.wrapper.get('[role="tab"]:nth-child(2)').trigger('click')
    await settle(s.wrapper)
    expect(s.router.currentRoute.value.path).toBe('/people/roles')
    await s.wrapper.get('[role="tab"]:nth-child(3)').trigger('click')
    await settle(s.wrapper)
    expect(s.router.currentRoute.value.path).toBe('/people/user-types')
    await go(s, '/people/roles/r1')
    expect(s.wrapper.get('[role="tab"][aria-selected="true"]').text()).toContain('Roles')
    await go(s, '/people/user-types/t-clerk')
    expect(s.wrapper.get('[role="tab"][aria-selected="true"]').text()).toContain('User types')
  })

  it('opens the list an address belongs to when it names something the lists do not hold', async () => {
    stub()
    const s = await render({ url: '/people/users/nobody' })
    expect(s.router.currentRoute.value.path).toBe('/people')
    await go(s, '/people/roles/zzz')
    expect(s.router.currentRoute.value.path).toBe('/people/roles')
    await go(s, '/people/user-types/zzz')
    expect(s.router.currentRoute.value.path).toBe('/people/user-types')
  })

  it('reads the register through the coordinator only, each list once, the chart and the fields when first needed', async () => {
    stub()
    const s = await render()
    expect(calls.every((c) => c.url.startsWith(`${R}/`))).toBe(true)
    expect([reads('/access'), reads('/roles'), reads('/user-types'), reads('/config'), reads('/chart/positions')]).toEqual([1, 1, 1, 1, 0])
    await go(s, '/people/users/m4')
    await go(s, '/people/users/m1')
    expect(reads('/chart/positions')).toBe(1)
    expect(s.options.roles?.fields).not.toHaveBeenCalled()
    await go(s, '/people/roles')
    await go(s, '/people/roles/r1')
    await go(s, '/people/user-types')
    expect(s.options.roles?.fields).toHaveBeenCalledTimes(1)
    expect([reads('/access'), reads('/roles'), reads('/user-types'), reads('/chart/positions')]).toEqual([1, 1, 1, 1])
  })

  it.each([
    [403, { code: 'err:membership:notMember' }, 'You are no longer an administrator of this workspace, so nothing was changed. Sign in again to see what is yours.'],
    [503, { code: 'err:upstream:down' }, 'The admin service did not answer, so the people of this workspace could not be read. Try again.'],
    [500, { code: 'err:membership:broken', title: 'The register is being moved' }, 'The people of this workspace could not be read: The register is being moved'],
    [500, {}, 'The people of this workspace could not be read. Try again.'],
  ])('says so in words when the register cannot be read (%s)', async (status, body, said) => {
    stub({ [`GET ${T}/access`]: { status, body } })
    const { wrapper } = await render()
    const shown = wrapper.get('[data-state="failed"]').text()
    expect(shown).toBe(said)
    expect(wrapper.text()).not.toContain('err:')
    expect(wrapper.text()).not.toContain('HTTP')
  })

  it('says a read that never reached the register as the service not answering', async () => {
    stub()
    ;(globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      throw new TypeError('Failed to fetch')
    })
    const { wrapper } = await render()
    expect(wrapper.get('[data-state="failed"]').text()).toBe('The admin service did not answer, so the people of this workspace could not be read. Try again.')
    expect(wrapper.text()).not.toContain('Failed to fetch')
  })

  it.each([
    ['/people/roles/r1', 'Roles', '/people/roles'],
    ['/people/roles/new', 'Roles', '/people/roles'],
    ['/people/users/m4', 'Users', '/people'],
    ['/people/user-types/t-clerk', 'User types', '/people/user-types'],
    ['/people/user-types/new', 'User types', '/people/user-types'],
  ])('goes to the tab’s list when the chosen tab is pressed on an item page (%s)', async (from, tabName, to) => {
    stub()
    const s = await render({ url: from })
    expect(s.router.currentRoute.value.path).toBe(from)
    const tab = s.wrapper.findAll('[role="tab"]').find((t) => norm(t.text()).startsWith(tabName))!
    expect(tab.attributes('aria-selected')).toBe('true')
    await tab.trigger('click')
    await settle(s.wrapper)
    expect(s.router.currentRoute.value.path).toBe(to)
  })

  it('shows nothing of the workspace before while another one is read, and drops a late answer for it', async () => {
    const W2 = `${R}/tenants/W-2`
    const two = member({ id: 'm9', subjectKey: 'sub:Z', displayName: 'Zane Muižniece', tenantRoles: [{ id: 'r9', name: 'Packer' }] })
    stub({
      [`GET ${W2}/access`]: { status: 200, body: { members: [two] } },
      [`GET ${W2}/roles`]: { status: 200, body: { roles: [] } },
      [`GET ${W2}/user-types`]: { status: 200, body: { userTypes: [] } },
    })
    const first = await render()
    expect(first.wrapper.text()).toContain('Anna Admin')
    first.wrapper.unmount()

    // Workspace 2's reads are held while the screen opens on it.
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const fetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    const real = fetch.getMockImplementation()!
    fetch.mockImplementation((url: string, init?: RequestInit) => (url.startsWith(W2) ? gate.then(() => real(url, init)) : real(url, init)))
    const { wrapper } = await render({ pinia: first.pinia, tenant: 'W-2' })
    expect(wrapper.text()).not.toContain('Anna Admin')
    expect(wrapper.text()).not.toContain('Kārlis Picker')
    expect(wrapper.text()).not.toContain('5 people')
    expect(wrapper.text()).toContain('Reading who is in the workspace…')
    expect(wrapper.findAll('[role="tab"]').map((t) => norm(t.text()))).toEqual(['Users', 'Roles', 'User types'])
    release()
    await settle(wrapper)
    expect(wrapper.text()).toContain('Zane Muižniece')
    expect(wrapper.text()).not.toContain('Anna Admin')
    expect(wrapper.findAll('[role="tab"]').map((t) => norm(t.text()))).toEqual(['Users 1', 'Roles 0', 'User types 0'])

    // And an answer for workspace 1 that arrives after workspace 2 was opened is not shown.
    stub({
      [`GET ${W2}/access`]: { status: 200, body: { members: [two] } },
      [`GET ${W2}/roles`]: { status: 200, body: { roles: [] } },
      [`GET ${W2}/user-types`]: { status: 200, body: { userTypes: [] } },
    })
    wrapper.unmount()
    let late!: () => void
    const slow = new Promise<void>((resolve) => {
      late = resolve
    })
    const next = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    const base = next.getMockImplementation()!
    next.mockImplementation((url: string, init?: RequestInit) => (url.startsWith(T) ? slow.then(() => base(url, init)) : base(url, init)))
    const third = await render({ pinia: first.pinia, tenant: 'W-1' })
    const store = usePeople()
    await store.open({ section: 'members', tenant: 'W-2' })
    late()
    await settle(third.wrapper)
    expect(store.members.map((m) => m.displayName)).toEqual(['Zane Muižniece'])
    expect(store.roles).toEqual([])
    expect(third.wrapper.text()).toContain('Zane Muižniece')
    expect(third.wrapper.text()).not.toContain('Anna Admin')
  })
})

describe('People & access › Users', () => {
  it('shows a dash for a last sign-in day that cannot be read, never the value', async () => {
    stub(undefined, [member({ id: 'm1', subjectKey: 'sub:A', displayName: 'Anna Admin', administrator: true, lastSignedInOn: 'last tuesday-ish' })])
    const { wrapper } = await render()
    const row = norm(people(wrapper)[0]!.text())
    expect(row).toContain('—')
    expect(row).not.toContain('tuesday')
  })

  it('lists the people by name with what they hold, machines apart, and who lost access only on request', async () => {
    stub()
    const { wrapper } = await render()
    const rows = people(wrapper).map((r) => norm(r.text()))
    expect(rows).toHaveLength(5)
    expect(rows[0]).toContain('Anna Admin')
    expect(rows[0]).toContain('✓ Administrator')
    expect(rows[0]).toContain('today')
    expect(rows[1]).toContain('Anna Bērziņa')
    expect(rows[1]).toContain('3 days ago')
    expect(rows[2]).toContain('Ilze Invited')
    expect(rows[2]).toContain('has not signed in yet')
    expect(rows[3]).toContain('Jānis New')
    expect(rows[3]).toContain('yesterday')
    // The user type in force is the chart position's while the person sits in one.
    expect(rows[4]).toContain('Lead')
    expect(rows[4]).toContain('Picker')
    expect(rows[4]).toContain('41 days ago')
    expect(rows[4]).toContain('41 days away')
    expect(wrapper.text()).not.toContain('Toms Gone')
    expect(wrapper.get('[data-block="machines"]').text()).toContain('Label printer')
    expect(wrapper.text()).toContain('Show people who lost access')

    await wrapper.get('input[data-filter="lost"]').setValue(true)
    await settle(wrapper)
    expect(rowOf(wrapper, 'Toms Gone').text()).toContain('no access any more')
  })

  it('has no person open on arrival, and a row opens one at its own address, beside the list', async () => {
    stub()
    const s = await render()
    expect(s.wrapper.find('[data-panel]').exists()).toBe(false)
    await rowOf(s.wrapper, 'Kārlis Picker').get('a').trigger('click')
    await settle(s.wrapper)
    expect(s.router.currentRoute.value.path).toBe('/people/users/m4')
    expect(s.wrapper.get('[data-panel]').text()).toContain('Kārlis Picker')
    // The list stays, with the open person marked.
    expect(people(s.wrapper)).toHaveLength(5)
    expect(['true', 'page']).toContain(rowOf(s.wrapper, 'Kārlis Picker').get('a').attributes('aria-current'))
  })

  it('opens a person from their address, and the way back from a person alone is the list', async () => {
    stub()
    const s = await render({ url: '/people/users/m2' })
    expect(s.wrapper.get('[data-panel]').text()).toContain('Jānis New')
    const back = s.wrapper.findAll('button').find((b) => norm(b.text()) === '‹Users')!
    await back.trigger('click')
    await settle(s.wrapper)
    expect(s.router.currentRoute.value.path).toBe('/people')
    expect(s.wrapper.find('[data-panel]').exists()).toBe(false)
  })

  it('counts each filter by the people it shows, with and without those who lost access', async () => {
    stub()
    const { wrapper } = await render()
    const shown = async (label: string) => {
      await chip(wrapper, label).trigger('click')
      await settle(wrapper)

      return [Number(norm(chip(wrapper, label).text()).split(' ').pop()), people(wrapper).length]
    }
    for (const withLost of [false, true]) {
      await wrapper.get('input[data-filter="lost"]').setValue(withLost)
      await settle(wrapper)
      for (const label of ['Everyone', 'Administrators', 'Nothing across the workspace', 'Has not signed in yet', 'Not signed in for 30 days']) {
        const [count, rows] = await shown(label)
        expect(count, `${label} (lost access shown: ${withLost})`).toBe(rows)
      }
    }
    // Spelled out for the fixture: everyone, administrators, nothing, not signed in, away.
    await wrapper.get('input[data-filter="lost"]').setValue(false)
    await settle(wrapper)
    expect(['Everyone', 'Administrators', 'Nothing across the workspace', 'Has not signed in yet', 'Not signed in for 30 days'].map((l) => norm(chip(wrapper, l).text()))).toEqual([
      'Everyone 5',
      'Administrators 1',
      'Nothing across the workspace 1',
      'Has not signed in yet 1',
      'Not signed in for 30 days 1',
    ])
  })

  it('draws no raw value in a cell: an empty administrator or user type stays empty', async () => {
    stub()
    const { wrapper } = await render()
    const row = (name: string) => people(wrapper).find((r) => norm(r.get('b').text()) === name)!
    expect(row('Anna Admin').get('[data-administrator]').text()).toBe('✓ Administrator')
    for (const name of ['Anna Bērziņa', 'Jānis New', 'Ilze Invited']) {
      expect(row(name).get('[data-administrator]').text()).toBe('')
      expect(row(name).text()).not.toMatch(/\bfalse\b|\btrue\b|\bnull\b|\[object Object\]/)
    }
  })

  it('narrows by user type, by role and by name together, and finds a folded name', async () => {
    stub()
    const { wrapper } = await render()
    await wrapper.get('input[data-filter="find"]').setValue('berzina')
    await settle(wrapper)
    expect(people(wrapper).map((r) => norm(r.get('b').text()))).toEqual(['Anna Bērziņa'])
    await wrapper.get('input[data-filter="find"]').setValue('anna')
    await settle(wrapper)
    expect(people(wrapper)).toHaveLength(2)
    await wrapper.get('select[data-filter="role"]').setValue('r2')
    await settle(wrapper)
    expect(people(wrapper)).toHaveLength(1)
    await wrapper.get('select[data-filter="user-type"]').setValue('t-clerk')
    await settle(wrapper)
    expect(wrapper.get('[data-note="no-match"]').text()).toContain('Nobody matches.')
    // The user type matched is the one in force: the chart's.
    await button(wrapper, 'Show everyone').trigger('click')
    await settle(wrapper)
    await wrapper.get('select[data-filter="user-type"]').setValue('t-lead')
    await settle(wrapper)
    expect(people(wrapper).map((r) => r.text())).toHaveLength(1)
    expect(people(wrapper)[0]!.text()).toContain('Kārlis Picker')
  })

  it('goes 25 to a page, says where it is, and goes back to the first page when the filter changes', async () => {
    stub({}, [...members(), ...crowd(30)])
    const { wrapper } = await render()
    expect(people(wrapper)).toHaveLength(25)
    expect(range(wrapper)).toBe('1–25 of 35')
    await wrapper.get('button[aria-label="Next page"]').trigger('click')
    await settle(wrapper)
    expect(people(wrapper)).toHaveLength(10)
    expect(range(wrapper)).toBe('26–35 of 35')
    await wrapper.get('input[data-filter="find"]').setValue('extra')
    await settle(wrapper)
    expect(range(wrapper)).toBe('1–25 of 30')
  })

  it('turns the list to the page of the person opened', async () => {
    stub({}, [...members(), ...crowd(30)])
    const s = await render({ url: '/people/users/m4' })
    // Kārlis sorts after every Extra, so he is on the second page.
    expect(range(s.wrapper)).toBe('26–35 of 35')
  })

  it('names the first five who hold nothing, then turns on the count for the rest', async () => {
    stub({}, [...members(), ...arrivals(7)])
    const s = await render()
    const band = s.wrapper.get('[data-block="arrivals"]')
    expect(band.get('h3').text()).toBe('Nothing across the workspace yet (8)')
    expect(band.text()).toContain('They hold no role, no user type box and no position in the chart.')
    // By name, each with when they last signed in.
    const named = band.findAll('button').filter((b) => b.attributes('data-act') !== 'band-more')
    expect(named.map((b) => norm(b.text()))).toEqual(['Arrival 1 2 days ago', 'Arrival 2 2 days ago', 'Arrival 3 2 days ago', 'Arrival 4 2 days ago', 'Arrival 5 2 days ago'])
    expect(norm(band.get('[data-act="band-more"]').text())).toBe('+ 3 more')
    await band.get('[data-act="band-more"]').trigger('click')
    await settle(s.wrapper)
    expect(chip(s.wrapper, 'Nothing across the workspace').attributes('aria-pressed')).toBe('true')
    expect(people(s.wrapper)).toHaveLength(8)
    // A name in the band opens that person.
    await named[0]!.trigger('click')
    await settle(s.wrapper)
    expect(s.router.currentRoute.value.path).toBe('/people/users/a0')
  })

  it('has no band when nobody holds nothing', async () => {
    stub({}, crowd(2))
    const { wrapper } = await render()
    expect(wrapper.find('[data-block="arrivals"]').exists()).toBe(false)
  })

  it('draws the user type the chart gives apart, with its note', async () => {
    stub()
    const { wrapper } = await render()
    const given = rowOf(wrapper, 'Kārlis Picker').get('[title="given by their position in the chart"]')
    expect(given.text()).toContain('Lead')
    expect(given.classes()).toContain('border-dashed')
    expect(given.text()).toContain('given by their position in the chart')
    // One the person holds themselves is drawn plain.
    expect(rowOf(wrapper, 'Anna Admin').find('[title]').exists()).toBe(false)
  })

  it('links to History at the person, and says what the chart says of their user type', async () => {
    stub()
    const s = await render({ url: '/people/users/m4' })
    expect(s.wrapper.get('[data-panel] a[data-link="history"]').attributes('href')).toBe('/history?who=m4')
    expect(s.wrapper.get('[data-panel] a[data-link="history"]').text()).toBe('See what Kārlis did, in History →')
    expect(s.wrapper.get('[data-note="chart-type"]').text()).toBe(
      'Their position «Lead position» in the chart of authority gives «Lead», which is the one in force while they sit there. «Floor», set here, applies again when they leave it.',
    )
    await go(s, '/people/users/m1')
    expect(s.wrapper.get('[data-note="chart-type"]').text()).toBe(
      'In the chart of authority: «Counter», which gives no user type, so the one set here is in force.',
    )
    // A person who lost access keeps their history.
    await s.wrapper.get('input[data-filter="lost"]').setValue(true)
    await go(s, '/people/users/m5')
    expect(s.wrapper.get('[data-panel]').text()).toContain('Their history stays. Giving access back is a new invitation.')
    expect(s.wrapper.get('[data-panel] a[data-link="history"]').attributes('href')).toBe('/history?who=m5')
  })

  it('gives a person a user type at once, says so, and reads only the people again', async () => {
    stub({ [`PUT ${T}/users/m2/user-type`]: { status: 200, body: {} } })
    const s = await render({ url: '/people/users/m2' })
    await s.wrapper.get('[data-act="user-type"]').setValue('t-clerk')
    await settle(s.wrapper)
    expect(writes()).toEqual([{ method: 'PUT', url: `${T}/users/m2/user-type`, body: { userTypeId: 't-clerk' }, csrf: 'tok-1' }])
    expect(s.wrapper.get('[data-said="said"]').text()).toBe("Jānis New's user type is now «Clerk».")
    expect([reads('/access'), reads('/roles'), reads('/user-types')]).toEqual([2, 1, 1])
  })

  it('gives a role and takes one away, each in its own act', async () => {
    stub({
      [`POST ${R}/users/m2/roles?tenant=W-1`]: { status: 200, body: {} },
      [`DELETE ${R}/users/m4/roles?roleId=r1&tenant=W-1`]: { status: 200, body: {} },
    })
    const s = await render({ url: '/people/users/m2' })
    // A role already held is shown, and cannot be chosen again.
    await s.wrapper.get('[data-act="give-role"]').setValue('r1')
    await settle(s.wrapper)
    expect(writes()[0]).toEqual({ method: 'POST', url: `${R}/users/m2/roles?tenant=W-1`, body: { roleId: 'r1' }, csrf: 'tok-1' })
    expect(s.wrapper.get('[data-said="said"]').text()).toBe('Jānis New now holds «Picker».')

    await go(s, '/people/users/m4')
    expect(s.wrapper.findAll('[data-act="give-role"] option').find((o) => o.text() === 'Picker')!.attributes('disabled')).toBeDefined()
    await s.wrapper.get('button[aria-label="Take «Picker» away"]').trigger('click')
    await settle(s.wrapper)
    expect(writes()[1]).toMatchObject({ method: 'DELETE', url: `${R}/users/m4/roles?roleId=r1&tenant=W-1` })
    expect(s.wrapper.get('[data-said="said"]').text()).toBe('«Picker» was taken from Kārlis Picker.')
  })

  it('says the last administrator cannot be unticked, and leaves the box ticked', async () => {
    stub({ [`DELETE ${T}/administrators/m1`]: { status: 409, body: { code: 'err:request:conflict', detail: 'the register said so' } } })
    const { wrapper } = await render({ url: '/people/users/m1' })
    const box = wrapper.get('[data-act="administrator"]')
    await box.setValue(false)
    await settle(wrapper)
    expect(wrapper.get('[data-said="refused"]').text()).toBe(
      "Anna Admin is this workspace's last administrator. Make someone else an administrator first.",
    )
    expect((box.element as HTMLInputElement).checked).toBe(true)
  })

  it('says nothing was changed when the person stopped being an administrator meanwhile', async () => {
    stub({ [`PUT ${T}/administrators/m2`]: { status: 403, body: { code: 'err:membership:notMember' } } })
    const { wrapper } = await render({ url: '/people/users/m2' })
    await wrapper.get('[data-act="administrator"]').setValue(true)
    await settle(wrapper)
    expect(wrapper.get('[data-said="refused"]').text()).toBe(
      'You are no longer an administrator of this workspace, so nothing was changed. Sign in again to see what is yours.',
    )
  })

  it('takes away all access only after it is asked, in place', async () => {
    stub({ [`DELETE ${R}/users/m4?tenant=W-1`]: { status: 200, body: {} } })
    const { wrapper } = await render({ url: '/people/users/m4' })
    await button(wrapper, 'Take away all access').trigger('click')
    await settle(wrapper)
    expect(writes()).toEqual([])
    expect(wrapper.get('[role="group"]:not([aria-label])').text()).toContain('Kārlis Picker can no longer sign in to this workspace')
    await button(wrapper, 'Take it away').trigger('click')
    await settle(wrapper)
    expect(writes()).toEqual([{ method: 'DELETE', url: `${R}/users/m4?tenant=W-1`, body: undefined, csrf: 'tok-1' }])
    expect(wrapper.get('[data-said="said"]').text()).toBe('Kārlis Picker has no access any more.')
    expect([reads('/access'), reads('/roles'), reads('/user-types')]).toEqual([2, 1, 1])
  })

  it('gathers the same people by access, naming the first five of a long list', async () => {
    stub({}, [...members(), ...arrivals(8)])
    const { wrapper } = await render()
    await choice(wrapper, 'By access').trigger('click')
    await settle(wrapper)
    const text = norm(wrapper.get('[data-view="access"]').text())
    expect(text).toContain('Picker role · 1')
    expect(text).toContain('Kārlis Picker')
    expect(text).toContain('Lead user type · 1')
    // A user type says what it holds in the words its service declares.
    expect(text).toContain('Clerk user type · 1 · Register an order')
    expect(text).toContain('Floor user type · 0 · holds nothing')
    // Member: Jānis, Ilze, Anna Bērziņa and eight arrivals; five are named.
    expect(text).toContain('Member user type · 11')
    expect(text).toContain('+ 6 more')
    expect(wrapper.find('[data-panel]').exists()).toBe(false)
  })
})

describe('People & access › Roles', () => {
  it('lists each role with what it is for, its boxes of those it can be given, and whether it shipped', async () => {
    stub()
    const s = await render({ url: '/people/roles' })
    const rows = s.wrapper.findAll('ul[aria-label="Roles"] > li').map((r) => r.text())
    expect(rows).toHaveLength(3)
    for (const [row, pieces] of [
      [rows[0]!, ['Picker', 'no description yet', '3 of 6 boxes', 'made here']],
      [rows[1]!, ['Worker', 'Does the work', '1 of 5 boxes', 'shipped']],
      [rows[2]!, ['Noliktavas pārzinis', 'Keeps the stock', '0 of 5 boxes', 'made here']],
    ] as [string, string[]][]) {
      for (const piece of pieces) expect(row).toContain(piece)
    }
    expect(s.wrapper.get('a[data-act="new-role"]').attributes('href')).toBe('/people/roles/new')
    expect(s.wrapper.text()).toContain("Setting up the workspace is never a role's: it comes only with the Administrator checkbox.")
    expect(s.wrapper.get('ul[aria-label="Roles"] a[href="/people/roles/r2"]').text()).toContain('Worker')
  })

  it('shows a role’s boxes in the host’s groups, the rest under its service, never a setup or chart box', async () => {
    stub()
    const { wrapper } = await render({ url: '/people/roles/r1' })
    const titles = wrapper.findAll('details > summary > span').map((s) => s.text())
    expect(titles).toEqual(['Orders', 'Notes', 'Stock service', 'Restricted fields'])
    expect(wrapper.find('[data-box="orders/setup/kinds:manage"]').exists()).toBe(false)
    expect(wrapper.find('[data-box="oversight/order:view"]').exists()).toBe(false)
    expect(wrapper.find('[data-box="orders/order:viewField"]').exists()).toBe(false)
    expect(wrapper.get('[data-box="orders/order:viewField@price.2"]').text()).toContain('See «Price»')
    // A retired box stays in sight on the role that still holds it.
    expect(wrapper.get('[data-box="orders/order:archive"]').text()).toContain('no longer given')
    expect(wrapper.get('details').text()).toContain('2 of 3 ticked')
    expect(wrapper.text()).toContain("Setting up the workspace is never a role's: it comes only with the Administrator checkbox.")
  })

  it('is a page of its own: its name, what it says it is, how many boxes, a way back to the list', async () => {
    stub()
    const s = await render({ url: '/people/roles/r2' })
    expect(s.wrapper.get('h2').text()).toBe('Worker')
    expect(norm(s.wrapper.text())).toContain('Shipped with every workspace: rename it and change its boxes; it cannot be deleted · 1 of 5 boxes')
    expect((s.wrapper.get('#role-for').element as HTMLInputElement).value).toBe('Does the work')
    expect(s.wrapper.get('a[href="/people/roles"]').text()).toContain('Roles')
    await go(s, '/people/roles/r1')
    expect(norm(s.wrapper.text())).toContain('Made in this workspace · 3 of 6 boxes')
  })

  it('offers Delete on a role made here, never on a shipped one, and Save and Cancel only to what changed', async () => {
    stub()
    const s = await render({ url: '/people/roles/r2' })
    expect(s.wrapper.find('[data-act="delete-role"]').exists()).toBe(false)
    expect(s.wrapper.get('[data-act="save-role"]').attributes('disabled')).toBeDefined()
    expect(s.wrapper.get('[data-act="cancel-role"]').attributes('disabled')).toBeDefined()
    await s.wrapper.get('#role-for').setValue('Does more')
    expect(s.wrapper.get('[data-act="save-role"]').attributes('disabled')).toBeUndefined()
    expect(s.wrapper.get('[data-act="cancel-role"]').attributes('disabled')).toBeUndefined()
    await s.wrapper.get('[data-act="cancel-role"]').trigger('click')
    await settle(s.wrapper)
    expect((s.wrapper.get('#role-for').element as HTMLInputElement).value).toBe('Does the work')
    await go(s, '/people/roles/r1')
    expect(s.wrapper.find('[data-act="delete-role"]').exists()).toBe(true)
  })

  it('counts what is not saved yet: each box, and the name with what it is for', async () => {
    stub()
    const { wrapper } = await render({ url: '/people/roles/r2' })
    expect(wrapper.find('[data-note="unsaved"]').exists()).toBe(false)
    await wrapper.get('[data-box="orders/order:create"] input').setValue(true)
    await settle(wrapper)
    expect(norm(wrapper.get('[data-note="unsaved"]').text())).toBe('● 1 change not saved yet. Nothing changes for anyone until you press Save.')
    await wrapper.get('#role-name').setValue('Hand')
    await wrapper.get('#role-for').setValue('Does more')
    await settle(wrapper)
    expect(norm(wrapper.get('[data-note="unsaved"]').text())).toContain('● 2 changes not saved yet.')
  })

  it('says what a field box hands out before Save, by what else the role holds', async () => {
    stub()
    const { wrapper } = await render({ url: '/people/roles/r2' })
    expect(wrapper.find('[data-guard]').exists()).toBe(false)
    await wrapper.get('[data-box="orders/order:viewField@price.2"] input').setValue(true)
    await settle(wrapper)
    expect(wrapper.get('[data-guard]').text()).toBe('Everyone with this role will see every «Price».')
    await wrapper.get('[data-box="orders/order:view"] input').setValue(false)
    await settle(wrapper)
    expect(wrapper.get('[data-guard]').text()).toBe('Everyone with this role will see their own «Price».')
  })

  it('saves the whole set, what it is for with it: what is shown as ticked, what is not shown kept, an old field box dropped', async () => {
    stub({ [`PUT ${T}/roles/r1/permissions`]: { status: 200, body: {} } })
    const { wrapper } = await render({ url: '/people/roles/r1' })
    await wrapper.get('[data-box="stock/shelf:view"] input').setValue(false)
    await settle(wrapper)
    await wrapper.get('[data-act="save-role"]').trigger('click')
    await settle(wrapper)
    expect(writes()).toEqual([
      { method: 'PUT', url: `${T}/roles/r1/permissions`, body: { permissions: ['orders/order:archive', 'orders/order:view', 'other/thing:do'] }, csrf: 'tok-1' },
    ])
    expect(wrapper.get('[data-said="said"]').text()).toBe('The role was saved.')
    // Only the roles are read again: the name did not change.
    expect([reads('/access'), reads('/roles'), reads('/user-types')]).toEqual([1, 2, 1])
  })

  it('sends what it is for with the name when either changes, and reads the people again only when the name did', async () => {
    stub({ [`PUT ${T}/roles/r2`]: { status: 200, body: {} } })
    const { wrapper } = await render({ url: '/people/roles/r2' })
    await wrapper.get('#role-for').setValue('Does more')
    await wrapper.get('[data-act="save-role"]').trigger('click')
    await settle(wrapper)
    expect(writes()).toEqual([{ method: 'PUT', url: `${T}/roles/r2`, body: { name: 'Worker', description: 'Does more' }, csrf: 'tok-1' }])
    expect([reads('/access'), reads('/roles')]).toEqual([1, 2])

    await wrapper.get('#role-name').setValue('Hand')
    await wrapper.get('[data-act="save-role"]').trigger('click')
    await settle(wrapper)
    expect(writes()[1]).toEqual({ method: 'PUT', url: `${T}/roles/r2`, body: { name: 'Hand', description: 'Does more' }, csrf: 'tok-1' })
    expect([reads('/access'), reads('/roles')]).toEqual([2, 3])
  })

  it('keeps every field box it cannot judge when the restricted fields could not be read', async () => {
    stub({ [`PUT ${T}/roles/r1/permissions`]: { status: 200, body: {} } })
    const options = hostOptions()
    options.roles!.fields = async () => Promise.reject(new Error('down'))
    const { wrapper } = await render({ url: '/people/roles/r1', options })
    expect(wrapper.find('[data-note="fields-unread"]').exists()).toBe(true)
    await wrapper.get('[data-box="stock/shelf:view"] input').setValue(false)
    await settle(wrapper)
    await wrapper.get('[data-act="save-role"]').trigger('click')
    await settle(wrapper)
    expect((writes()[0]!.body as { permissions: string[] }).permissions).toContain('orders/order:viewField@price.1')
  })

  it('makes a new role with what it is for, gives it its boxes, and opens its page', async () => {
    const made = { id: 'r9', name: 'Packer', description: 'Packs parcels', permissions: ['orders/order:view'] }
    stub({
      // The list read once more after the act holds the new role.
      [`GET ${T}/roles`]: [
        { status: 200, body: { roles: roles() } },
        { status: 200, body: { roles: [...roles(), made] } },
      ],
      [`POST ${T}/roles`]: { status: 200, body: { id: 'r9', name: 'Packer' } },
      [`PUT ${T}/roles/r9/permissions`]: { status: 200, body: {} },
    })
    const s = await render({ url: '/people/roles/new' })
    expect(s.wrapper.get('h2').text()).toBe('New role')
    expect(s.wrapper.find('[data-act="delete-role"]').exists()).toBe(false)
    await s.wrapper.get('#role-name').setValue('Packer')
    await s.wrapper.get('#role-for').setValue('Packs parcels')
    await s.wrapper.get('[data-box="orders/order:view"] input').setValue(true)
    await settle(s.wrapper)
    await s.wrapper.get('[data-act="save-role"]').trigger('click')
    await settle(s.wrapper)
    expect(writes().map((c) => [c.method, c.url, c.body])).toEqual([
      ['POST', `${T}/roles`, { name: 'Packer', description: 'Packs parcels' }],
      ['PUT', `${T}/roles/r9/permissions`, { permissions: ['orders/order:view'] }],
    ])
    expect(s.router.currentRoute.value.path).toBe('/people/roles/r9')
    expect(s.wrapper.get('[data-said="said"]').text()).toBe('The role was saved.')
  })

  it('words a taken name, a held role and a role a service keeps by the act', async () => {
    stub({
      [`PUT ${T}/roles/r1`]: { status: 409, body: { code: 'err:request:conflict' } },
      [`DELETE ${T}/roles/r1`]: { status: 409, body: { code: 'err:request:conflict' } },
      [`DELETE ${T}/roles/r3`]: { status: 409, body: { code: 'err:request:conflict' } },
    })
    const s = await render({ url: '/people/roles/r1' })
    await s.wrapper.get('#role-name').setValue('Worker')
    await s.wrapper.get('[data-act="save-role"]').trigger('click')
    await settle(s.wrapper)
    expect(s.wrapper.get('[data-said="refused"]').text()).toBe('Another role is already called «Worker».')
    await s.wrapper.get('[data-act="delete-role"]').trigger('click')
    await settle(s.wrapper)
    expect(s.wrapper.get('[data-said="refused"]').text()).toBe('«Picker» is held by 1 person. Take it from them first.')
    await go(s, '/people/roles/r3')
    await s.wrapper.get('[data-act="delete-role"]').trigger('click')
    await settle(s.wrapper)
    expect(s.wrapper.get('[data-said="refused"]').text()).toBe('«Noliktavas pārzinis» is still placed by a service on things it keeps. Move those places to another role first.')
  })

  it('says a refused delete in the setting’s own sentence when a setting holds the role', async () => {
    stub({ [`DELETE ${T}/roles/r3`]: { status: 409, body: { code: 'err:request:conflict' } } })
    const options = hostOptions([creator({ read: vi.fn(async () => 'r3') })])
    const s = await render({ url: '/people/roles/r3', options })
    await s.wrapper.get('[data-act="delete-role"]').trigger('click')
    await settle(s.wrapper)
    expect(s.wrapper.get('[data-said="refused"]').text()).toBe('The creator becomes its «Noliktavas pārzinis». Choose another role for the creator first.')
  })

  it('deletes a role and goes back to the list, which says so', async () => {
    stub({ [`DELETE ${T}/roles/r3`]: { status: 200, body: {} } })
    const s = await render({ url: '/people/roles/r3' })
    await s.wrapper.get('[data-act="delete-role"]').trigger('click')
    await settle(s.wrapper)
    expect(s.router.currentRoute.value.path).toBe('/people/roles')
    expect(s.wrapper.get('[data-said="said"]').text()).toBe('The role was deleted.')
    expect([reads('/access'), reads('/roles')]).toEqual([1, 2])
  })

  // The register refuses a name that would read like another role's in a language
  // the app speaks; the sentence names that role and the language, in the reader's.
  it.each([
    ['en', 'Strādnieks', '«Strādnieks» is how the role «Worker» reads in Latvian.'],
    ['lv', 'Strādnieks', 'Loma «Worker» latviski jau saucas «Strādnieks».'],
    ['en', 'Storekeeper', '«Storekeeper» is how the role «Noliktavas pārzinis» reads in English.'],
    ['lv', 'Storekeeper', 'Loma «Noliktavas pārzinis» angliski jau saucas «Storekeeper».'],
  ])('in %s, names the role that «%s» already reads as', async (locale, name, said) => {
    stub({ [`POST ${T}/roles`]: { status: 409, body: { code: 'err:membership:conflict' } } })
    const { wrapper } = await render({ url: '/people/roles/new', locale })
    await wrapper.get('#role-name').setValue(name)
    await wrapper.get('[data-act="save-role"]').trigger('click')
    await settle(wrapper)
    expect(writes().map((c) => [c.method, c.url, c.body])).toEqual([['POST', `${T}/roles`, { name, description: '' }]])
    expect(wrapper.get('[data-said="refused"]').text()).toBe(said)
  })
})

describe('People & access › the host’s settings on Roles', () => {
  it('reads each setting when Roles opens, once, and draws its word and note with the role it holds', async () => {
    stub()
    const setting = creator()
    const s = await render({ url: '/people/roles', options: hostOptions([setting]) })
    const card = s.wrapper.get('[data-setting="creatorRole"]')
    expect(card.text()).toContain('The creator becomes its')
    expect(card.text()).toContain('Whoever makes one is placed with this role.')
    expect((card.get('select').element as HTMLSelectElement).value).toBe('r2')
    expect(card.findAll('option').map((o) => o.text())).toContain('Noliktavas pārzinis')
    await go(s, '/people/roles/r1')
    await go(s, '/people/roles')
    expect(setting.read).toHaveBeenCalledTimes(1)
  })

  it('writes the choice at once, says the host’s sentence, and reads nothing else', async () => {
    stub()
    const setting = creator()
    const s = await render({ url: '/people/roles', options: hostOptions([setting]) })
    await s.wrapper.get('[data-setting="creatorRole"] select').setValue('r3')
    await settle(s.wrapper)
    expect(setting.write).toHaveBeenCalledWith('r3')
    expect(s.wrapper.get('[data-setting="creatorRole"] [data-said="said"]').text()).toBe('Saved: the creator becomes its «Noliktavas pārzinis».')
    expect(writes()).toEqual([])
    expect([reads('/access'), reads('/roles'), reads('/user-types')]).toEqual([1, 1, 1])
  })

  it.each([
    [new ApiError(403, 'err:membership:notMember', 'no'), 'You are no longer an administrator of this workspace, so nothing was changed. Sign in again to see what is yours.'],
    [new ApiError(503, '', 'down'), 'The admin service did not answer, so nothing was changed. Try again.'],
    [new ApiError(409, 'err:request:conflict', 'That role is gone.'), 'That was not done: That role is gone.'],
    [new SyntaxError('Unexpected token < in JSON'), 'That was not done: the answer could not be read. Try again.'],
  ])('says a refused change in words', async (refusal, said) => {
    stub()
    const setting = creator({ write: vi.fn(async () => Promise.reject(refusal)) })
    const s = await render({ url: '/people/roles', options: hostOptions([setting]) })
    await s.wrapper.get('[data-setting="creatorRole"] select').setValue('r3')
    await settle(s.wrapper)
    expect(s.wrapper.get('[data-setting="creatorRole"] [data-said="refused"]').text()).toBe(said)
    // The choice stays on what the setting still holds.
    expect((s.wrapper.get('[data-setting="creatorRole"] select').element as HTMLSelectElement).value).toBe('r2')
  })

  it('says the host’s own sentence, with the role’s name, when the setting’s owner refuses the role', async () => {
    stub()
    const setting = creator({ refused: 'host.setting.refused', write: vi.fn(async () => Promise.reject(new ApiError(400, 'err:request:invalid', 'unknown role'))) })
    const s = await render({ url: '/people/roles', options: hostOptions([setting]) })
    await s.wrapper.get('[data-setting="creatorRole"] select').setValue('r3')
    await settle(s.wrapper)
    expect(s.wrapper.get('[data-setting="creatorRole"] [data-said="refused"]').text()).toBe('«Noliktavas pārzinis» could not be chosen: the host does not know it yet.')
  })

  it('says a setting that could not be read, and offers no choice', async () => {
    stub()
    const setting = creator({ read: vi.fn(async () => Promise.reject(new Error('down'))) })
    const { wrapper } = await render({ url: '/people/roles', options: hostOptions([setting]) })
    expect(wrapper.get('[data-note="setting-unread"]').text()).toBe('This could not be read just now, so it cannot be changed here.')
    expect(wrapper.find('[data-setting="creatorRole"] select').exists()).toBe(false)
  })

  it('draws no setting when the host gives none', async () => {
    stub()
    const { wrapper } = await render({ url: '/people/roles' })
    expect(wrapper.find('[data-setting]').exists()).toBe(false)
  })
})

describe('People & access › User types', () => {
  it('says a box no service declares in words, never by its name as it travels', async () => {
    const types = userTypes()
    types[2]!.permissions = ['ghost/thing:do']
    stub({ [`GET ${T}/user-types`]: { status: 200, body: { userTypes: types } } })
    const { wrapper } = await render({ url: '/people/user-types' })
    const row = wrapper.findAll('ul[aria-label="User types"] > li')[2]!.text()
    expect(row).toContain('a box no service declares')
    expect(wrapper.text()).not.toContain('ghost/thing:do')
  })

  it('lists each user type with what it holds and its flags, and no column of how many hold it', async () => {
    stub()
    const { wrapper } = await render({ url: '/people/user-types' })
    const rows = wrapper.findAll('ul[aria-label="User types"] > li').map((r) => r.text())
    expect(rows).toHaveLength(4)
    for (const [row, pieces] of [
      [rows[0]!, ['Member', 'Everyone who joins.', 'nothing', 'new people get this']],
      [rows[1]!, ['Clerk', 'Register an order', 'your corporate login gives this']],
      [rows[2]!, ['Floor', 'nothing']],
      [rows[3]!, ['Lead', 'nothing', 'the chart gives it: Lead position']],
    ] as [string, string[]][]) {
      for (const piece of pieces) expect(row).toContain(piece)
    }
    expect(rows[2]).not.toContain('the chart gives it')
    const card = wrapper.get('ul[aria-label="User types"]').element.parentElement!.textContent!
    expect(card).toContain('What it holds')
    expect(card).not.toContain('People')
    // The count the register sends beside each is shown nowhere.
    expect(wrapper.text()).not.toContain('77')
    expect(wrapper.text()).not.toContain('99')
    expect(wrapper.get('a[data-act="add-type"]').attributes('href')).toBe('/people/user-types/new')
    expect(wrapper.get('ul[aria-label="User types"] a[href="/people/user-types/t-clerk"]').text()).toContain('Clerk')
  })

  it('opens a user type as a page of its own, with the chart’s positions that give it', async () => {
    stub()
    const { wrapper } = await render({ url: '/people/user-types/t-lead' })
    expect(wrapper.get('h2').text()).toBe('Lead')
    expect(wrapper.get('[data-note="chart-gives"]').text()).toBe('The chart of authority gives it through: Lead position')
    expect(wrapper.get('a[href="/people/user-types"]').text()).toContain('User types')
  })

  it('has Delete inside the page, never on the workspace’s default and never on a new one', async () => {
    stub()
    const s = await render({ url: '/people/user-types/t-clerk' })
    expect(s.wrapper.find('[data-act="delete-type"]').exists()).toBe(true)
    await go(s, '/people/user-types/t-member')
    expect(s.wrapper.find('[data-act="delete-type"]').exists()).toBe(false)
    expect(s.wrapper.get('[data-note="default"]').text()).toBe('New people get this, on every way in, so it stays: it cannot be deleted.')
    await go(s, '/people/user-types/new')
    expect(s.wrapper.get('h2').text()).toBe('New user type')
    expect(s.wrapper.find('[data-act="delete-type"]').exists()).toBe(false)
  })

  // How many hold a user type is counted from the people read, never from the register's own count.
  it.each([
    ['t-clerk', 'People arriving through your corporate login get «Clerk». Choose another first.'],
    ['t-floor', '«Floor» is held by 1 person. Give them another user type first.'],
    ['t-lead', 'A position in the chart of authority gives «Lead». Change that position first.'],
  ])('says why %s cannot be deleted', async (id, said) => {
    stub({ [`DELETE ${T}/user-types/${id}`]: { status: 409, body: { code: 'err:request:conflict' } } })
    const s = await render({ url: `/people/user-types/${id}` })
    await s.wrapper.get('[data-act="delete-type"]').trigger('click')
    await settle(s.wrapper)
    expect(s.wrapper.get('[data-said="refused"]').text()).toBe(said)
    expect(s.router.currentRoute.value.path).toBe(`/people/user-types/${id}`)
  })

  it('deletes a user type, goes back to the list, and reads only the user types again', async () => {
    stub({ [`DELETE ${T}/user-types/t-lead`]: { status: 200, body: {} } })
    const s = await render({ url: '/people/user-types/t-lead' })
    await s.wrapper.get('[data-act="delete-type"]').trigger('click')
    await settle(s.wrapper)
    expect(writes()).toEqual([{ method: 'DELETE', url: `${T}/user-types/t-lead`, body: undefined, csrf: 'tok-1' }])
    expect(s.router.currentRoute.value.path).toBe('/people/user-types')
    expect(s.wrapper.get('[data-said="said"]').text()).toBe('The user type was deleted.')
    expect([reads('/access'), reads('/roles'), reads('/user-types')]).toEqual([1, 1, 2])
  })

  it.each([
    ['en', '«Dalībnieks» is how the user type «Member» reads in Latvian.'],
    ['lv', 'Lietotāja veids «Member» latviski jau saucas «Dalībnieks».'],
  ])('in %s, names the user type a refused name already reads as', async (locale, said) => {
    stub({ [`POST ${T}/user-types`]: { status: 409, body: { code: 'err:membership:conflict' } } })
    const { wrapper } = await render({ url: '/people/user-types/new', locale })
    await wrapper.get('#type-name').setValue('Dalībnieks')
    await wrapper.get('[data-act="save-type"]').trigger('click')
    await settle(wrapper)
    expect(wrapper.get('[data-said="refused"]').text()).toBe(said)
  })

  it('adds a user type holding workspace-wide boxes only, and opens its page', async () => {
    const made = { id: 't-new', name: 'Office', description: '', permissions: ['orders/order:create'], corporateLoginDefault: false, workspaceDefault: false }
    stub({
      [`GET ${T}/user-types`]: [
        { status: 200, body: { userTypes: userTypes() } },
        { status: 200, body: { userTypes: [...userTypes(), made] } },
      ],
      [`POST ${T}/user-types`]: { status: 200, body: { id: 't-new' } },
    })
    const s = await render({ url: '/people/user-types/new' })
    expect(s.wrapper.findAll('[data-box]').map((b) => b.attributes('data-box'))).toEqual(['orders/order:create'])
    await s.wrapper.get('#type-name').setValue('Office')
    await s.wrapper.get('[data-box="orders/order:create"] input').setValue(true)
    await settle(s.wrapper)
    await s.wrapper.get('[data-act="save-type"]').trigger('click')
    await settle(s.wrapper)
    expect(writes()).toEqual([
      { method: 'POST', url: `${T}/user-types`, body: { name: 'Office', description: '', permissions: ['orders/order:create'] }, csrf: 'tok-1' },
    ])
    expect(s.router.currentRoute.value.path).toBe('/people/user-types/t-new')
    expect(s.wrapper.get('[data-said="said"]').text()).toBe('The user type was saved.')
    expect([reads('/access'), reads('/user-types')]).toEqual([1, 2])
  })

  it('changes a user type, and reads the people again only when its name changed', async () => {
    stub({ [`PUT ${T}/user-types/t-floor`]: { status: 200, body: {} } })
    const { wrapper } = await render({ url: '/people/user-types/t-floor' })
    await wrapper.get('#type-for').setValue('People on the floor')
    await wrapper.get('[data-act="save-type"]').trigger('click')
    await settle(wrapper)
    expect(writes()[0]).toMatchObject({ method: 'PUT', url: `${T}/user-types/t-floor`, body: { name: 'Floor', description: 'People on the floor', permissions: [] } })
    expect([reads('/access'), reads('/user-types')]).toEqual([1, 2])
    await wrapper.get('#type-name').setValue('Shop floor')
    await wrapper.get('[data-act="save-type"]').trigger('click')
    await settle(wrapper)
    expect([reads('/access'), reads('/user-types')]).toEqual([2, 3])
  })

  it('sets what the corporate login gives, and reads only the user types again', async () => {
    stub({ [`PUT ${T}/corporate-login-default`]: { status: 200, body: {} } })
    const { wrapper } = await render({ url: '/people/user-types' })
    await wrapper.get('#corporate-login').setValue('t-floor')
    await settle(wrapper)
    expect(writes()).toEqual([{ method: 'PUT', url: `${T}/corporate-login-default`, body: { userTypeId: 't-floor' }, csrf: 'tok-1' }])
    expect(wrapper.get('[data-said="said"]').text()).toBe('Saved: people arriving through the corporate login get this from now on.')
    expect([reads('/access'), reads('/roles'), reads('/user-types')]).toEqual([1, 1, 2])
  })
})

describe('People & access › the words', () => {
  // Each place with something only it draws, so a place that drew nothing cannot pass for one with every word.
  const places: Record<string, string> = {
    '/people': 'input[data-filter="find"]',
    '/people/users/m4': '[data-link="history"]',
    '/people/roles': '[data-setting]',
    '/people/roles/r1': '[data-act="save-role"]',
    '/people/user-types': '[data-block="corporate"]',
    '/people/user-types/t-clerk': '[data-type-form]',
  }

  // A word missing in a language reads as its key on screen.
  it.each(Object.keys(places).flatMap((p) => ['en', 'lv'].map((l) => [l, p])))('in %s, %s says every word', async (locale, url) => {
    stub()
    const { wrapper } = await render({ url, locale, options: hostOptions([creator()]) })
    expect(wrapper.find(places[url]!).exists()).toBe(true)
    expect(wrapper.text()).not.toContain('configbyte.')
  })

  it('says the head, the filters and a role’s page in Latvian', async () => {
    stub()
    const s = await render({ locale: 'lv' })
    expect(norm(s.wrapper.get('header').text())).toContain('5 cilvēki · 1 administrators · 1 serviss')
    expect(chip(s.wrapper, 'Visi')).toBeDefined()
    expect(s.wrapper.get('input[data-filter="find"]').attributes('placeholder')).toBe('Meklēt cilvēku')
    await go(s, '/people/roles/r1')
    expect(s.wrapper.text()).toContain('Kam tā paredzēta')
    await go(s, '/people/user-types/new')
    expect(s.wrapper.get('h2').text()).toBe('Jauns lietotāja veids')
  })
})
