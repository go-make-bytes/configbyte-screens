// History against a stand-in coordinator relaying to three stand-in owners, inside
// a memory-history router: what the address opens with and is written back as,
// which streams are read and when, who a line begins with, every key said in
// words, the services' lines folded, one act drawn once, and a service that
// does not answer named by its area.
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import type { AdminOptions } from '../options'
import { configbyteScreens } from '../plugin'
import { useAdminSession } from '../stores/session'
import HistoryView from './HistoryView.vue'

type Reply = { status: number; body: unknown }

const S = '/api/configbyte/v1/sections'
const T = `${S}/members/tenants/W-1`

const words = {
  en: {
    host: {
      product: 'acme',
      never: 'never',
      orders: 'Orders',
      stock: 'Stock',
      filters: { config: 'Configuration', shelves: 'Shelves' },
      lines: { renamed: 'renamed the kind to «{name}»' },
      entitled: { orders: 'Orders' },
      box: { edit: 'change orders' },
    },
  },
  lv: {
    host: {
      filters: { config: 'Konfigurācija', shelves: 'Plaukti' },
    },
  },
}

const options: AdminOptions = {
  product: 'host.product',
  never: 'host.never',
  sections: { orders: { title: 'host.orders' }, stock: { title: 'host.stock' } },
  carries: [],
  register: 'members',
  history: {
    filters: [
      { key: 'config', word: 'host.filters.config' },
      { key: 'shelves', word: 'host.filters.shelves' },
    ],
    sources: [
      { section: 'orders', query: 'family=setup', filter: 'config' },
      { section: 'stock', query: 'family=setup', filter: 'config' },
      { section: 'stock', query: 'family=shelves', filter: 'shelves' },
    ],
    describe: (l) => (l.kind === 'kindRenamed' ? { key: 'host.lines.renamed', values: { name: String(l.payload.label) } } : null),
    entitlements: { orders: 'host.entitled.orders' },
    boxes: { 'orders/order:edit': 'host.box.edit' },
  },
}

const member = (id: string, subjectKey: string, displayName: string, kind = 'person', status = 'active') => ({
  id,
  subjectKey,
  displayName,
  kind,
  status,
  administrator: false,
  arrival: false,
  tenantRoles: [],
  userType: null,
  chartUserType: null,
  lastSignedInOn: null,
})

const people = {
  members: [
    member('m1', 'sub:L', 'Laura Zariņa'),
    member('m2', 'sub:J', 'Jānis Ozols'),
    member('m3', 'sub:A', 'Anna Bērziņa', 'person', 'revoked'),
    member('m5', 'svc:orders', 'Order register', 'service'),
    member('m6', 'svc:stock', 'Stock modules', 'service'),
  ],
}

const ev = (id: string, at: string, actor: string, kind: string, payload: Record<string, unknown> = {}, userId = '') => ({ id, at, actor, userId, kind, payload })
const none = { status: 200, body: { items: [], more: false } }
const noneRegister = { status: 200, body: { events: [], more: false } }

let calls: string[] = []
let answers: Record<string, Reply[]> = {}

/** Every history read also answered when it carries the person asked for. */
function forEachPerson(base: Record<string, Reply | Reply[]>) {
  const out = { ...base }
  for (const [url, reply] of Object.entries(base)) {
    if (!url.includes('/history')) continue
    for (const actor of ['sub%3AJ', 'sub%3AL', 'operator']) out[`${url}${url.includes('?') ? '&' : '?'}actor=${actor}`] = reply
  }

  return out
}

function stub(extra: Record<string, Reply | Reply[]> = {}) {
  calls = []
  const base: Record<string, Reply | Reply[]> = {
    [`${T}/access`]: { status: 200, body: people },
    [`${T}/roles`]: { status: 200, body: { roles: [] } },
    [`${T}/user-types`]: { status: 200, body: { userTypes: [] } },
    [`${S}/members/config`]: {
      status: 200,
      body: {
        services: [
          { key: 'orders', displayName: 'Order register', permissions: [{ feature: 'order', act: 'view', description: 'See orders', class: 'ordinary', plane: 'tenant' }] },
          { key: 'stock', displayName: 'Stock modules', permissions: [] },
        ],
      },
    },
    [`${T}/chart/positions`]: { status: 200, body: { positions: [] } },
    [`${S}/members/history`]: {
      status: 200,
      body: { events: [ev('e2', '2026-10-03T11:40:00Z', 'sub:L', 'tenantRoleGranted', { roleId: 'r1', name: 'Meistars' }, 'm2'), ev('e1', '2026-10-03T11:02:00Z', 'svc:idp', 'directoryAdmitted', {}, 'm2')], more: false },
    },
    [`${S}/orders/history?family=setup`]: {
      status: 200,
      body: {
        items: [
          ev('o2', '2026-10-03T14:12:00Z', 'sub:L', 'configApplied', { kinds: { added: 1, changed: 2, unchanged: 41 }, partHash: '3f2a00000000000007c1', documentHash: '9b1e0000000000000f04a' }),
          ev('o1', '2026-10-02T16:05:00Z', 'sub:L', 'kindRenamed', { label: 'Steidzami' }),
        ],
        more: false,
      },
    },
    [`${S}/stock/history?family=setup`]: { status: 200, body: { items: [ev('s1', '2026-10-02T15:00:00Z', 'sub:J', 'mysteryKind')], more: false } },
    [`${S}/stock/history?family=shelves`]: none,
  }
  answers = Object.fromEntries(Object.entries({ ...forEachPerson(base), ...extra }).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]))
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      calls.push(url)
      const queue = answers[url] ?? [{ status: 404, body: {} }]
      const reply = queue.length > 1 ? queue.shift()! : queue[0]!

      return { ok: reply.status < 400, status: reply.status, headers: new Headers(), json: async () => reply.body } as unknown as Response
    }),
  )
}

/** Only the register's own events, the host's three streams empty. */
const registerOnly = (events: unknown[]): Record<string, Reply> => ({
  [`${S}/members/history`]: { status: 200, body: { events, more: false } },
  [`${S}/orders/history?family=setup`]: none,
  [`${S}/stock/history?family=setup`]: none,
})

async function settle(wrapper: { vm: { $nextTick: () => Promise<unknown> } }) {
  for (let pass = 0; pass < 8; pass += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()
  }
}

async function render(input: { locale?: string; url?: string; options?: AdminOptions; pinia?: ReturnType<typeof createPinia>; tenant?: string } = {}) {
  const pinia = input.pinia ?? createPinia()
  setActivePinia(pinia)
  const session = useAdminSession()
  session.me = {
    subject: 'sub:L',
    name: 'Laura Zariņa',
    loginMethod: 'an ID card',
    loa: 'high',
    tenant: input.tenant ?? 'W-1',
    sections: { members: ['membership:admin'] },
    presentation: { displayName: 'Kalns', locale: 'en', personLocale: null, deploymentLocale: 'en' },
  }
  session.order = ['orders', 'stock', 'members']
  const i18n = createI18n({ legacy: false, locale: input.locale ?? 'en', fallbackLocale: 'en', messages: structuredClone(words) })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/history', component: { render: () => null } }] })
  await router.push(input.url ?? '/history')
  await router.isReady()
  const wrapper = mount(HistoryView, { global: { plugins: [pinia, i18n, router, configbyteScreens(i18n, input.options ?? options)] } })
  await settle(wrapper)

  return { wrapper, router, pinia }
}

type Shown = Awaited<ReturnType<typeof render>>['wrapper']
const lines = (wrapper: Shown) => wrapper.findAll('li').map((l) => l.text().replace(/\s+/g, ' '))
const reads = () => calls.filter((c) => c.includes('/history'))
const query = (r: Awaited<ReturnType<typeof render>>['router']) => r.currentRoute.value.query

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('History', () => {
  it('lays every service’s lines out as one list, newest first, under the day each happened, the area at the end of each line', async () => {
    stub()
    const { wrapper } = await render()
    const out = lines(wrapper)
    expect(out).toHaveLength(5)
    expect(out[0]).toContain('Laura Zariņa imported a configuration file: 3 changed, 41 unchanged')
    expect(out[0]).toContain('file 9b1e…f04a · this part 3f2a…07c1')
    expect(out[0]).toMatch(/Configuration$/)
    expect(out[1]).toContain('Laura Zariņa gave Jānis Ozols the role «Meistars»')
    expect(out[1]).toMatch(/People & access$/)
    // A line about someone arriving is about the person who arrived.
    expect(out[2]).toContain('Jānis Ozols joined through the corporate login')
    expect(out[3]).toContain('Laura Zariņa renamed the kind to «Steidzami»')
    // A kind nobody words is said in words, never dropped and never printed as it is.
    expect(out[4]).toContain('Jānis Ozols changed something this list has no words for yet')
    expect(out.join(' ')).not.toContain('mysteryKind')
    expect(wrapper.findAll('[role="heading"][aria-level="2"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-block="filters"] label').map((l) => l.text().replace('✓', '').split('\n')[0]!.trim()).slice(0, 3)).toEqual([
      'Configuration',
      'People & access',
      'Shelves',
    ])
  })

  it('opens from `show` in the address and reads only the area it names', async () => {
    stub()
    const { wrapper } = await render({ url: '/history?show=people' })
    expect(reads()).toEqual([`${S}/members/history`])
    expect(lines(wrapper)).toHaveLength(2)
    expect((wrapper.get('[data-filter="people"]').element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.get('[data-filter="config"]').element as HTMLInputElement).checked).toBe(false)
  })

  it('reads every area when the address names none of the areas on screen', async () => {
    stub()
    const { wrapper } = await render({ url: '/history?show=nothing,here' })
    expect(reads()).toHaveLength(4)
    expect(lines(wrapper)).toHaveLength(5)
  })

  it('opens from `who` and asks every ticked service for that person’s lines, showing the lines that begin with them', async () => {
    stub()
    const { wrapper } = await render({ url: '/history?who=m2' })
    expect(reads().sort()).toEqual(
      [
        `${S}/members/history?actor=sub%3AJ`,
        `${S}/orders/history?family=setup&actor=sub%3AJ`,
        `${S}/stock/history?family=setup&actor=sub%3AJ`,
        `${S}/stock/history?family=shelves&actor=sub%3AJ`,
      ].sort(),
    )
    // The register also answers a line Laura wrote about him and a configuration file she imported: they begin with her.
    const out = lines(wrapper)
    expect(out).toHaveLength(2)
    expect(out.every((l) => l.includes('Jānis Ozols'))).toBe(true)
  })

  // A link from elsewhere names a person the way the services do, by the key they
  // attribute work to; the screen finds the member by it and leaves the address as given.
  it('opens from a person’s key as well, finds the member by it, and keeps the address as it was given', async () => {
    stub()
    const { wrapper, router } = await render({ url: '/history?who=sub:J' })
    expect(reads().sort()).toEqual(
      [
        `${S}/members/history?actor=sub%3AJ`,
        `${S}/orders/history?family=setup&actor=sub%3AJ`,
        `${S}/stock/history?family=setup&actor=sub%3AJ`,
        `${S}/stock/history?family=shelves&actor=sub%3AJ`,
      ].sort(),
    )
    const out = lines(wrapper)
    expect(out).toHaveLength(2)
    expect(out.every((l) => l.includes('Jānis Ozols'))).toBe(true)
    expect(query(router).who).toBe('sub:J')
    // The choice shows the member the key belongs to.
    expect((wrapper.get('[data-filter="who"]').element as HTMLSelectElement).value).toBe('m2')
    expect(wrapper.findAll('[data-filter="who"] option').find((o) => (o.element as HTMLOptionElement).selected)?.text()).toBe('Jānis Ozols')
  })

  it('takes a key the list does not hold to mean everyone, as an id it does not hold does', async () => {
    stub()
    const { router } = await render({ url: '/history?who=sub:ZZ' })
    expect(query(router).who).toBeUndefined()
    expect(reads().every((c) => !c.includes('actor='))).toBe(true)
  })

  it('writes what is ticked back to the address, and reads an area when it is ticked, not before', async () => {
    stub()
    const { wrapper, router } = await render({ url: '/history?show=people' })
    expect(reads()).not.toContain(`${S}/stock/history?family=shelves`)
    await wrapper.get('[data-filter="shelves"]').setValue(true)
    await settle(wrapper)
    expect(query(router).show).toBe('people,shelves')
    expect(reads()).toContain(`${S}/stock/history?family=shelves`)
    expect(reads().filter((c) => c.startsWith(`${S}/orders/`))).toEqual([])
    // Every area ticked is the address with no `show`.
    await wrapper.get('[data-filter="config"]').setValue(true)
    await settle(wrapper)
    expect(query(router).show).toBeUndefined()
    expect(reads().filter((c) => c.startsWith(`${S}/orders/`))).toHaveLength(1)
  })

  it('keeps one area ticked, since an address cannot say none', async () => {
    stub()
    const { wrapper } = await render({ url: '/history?show=people' })
    expect((wrapper.get('[data-filter="people"]').element as HTMLInputElement).disabled).toBe(true)
  })

  it('lists everyone, then every person in the workspace by name whatever their status, then whoever runs the deployment', async () => {
    stub()
    const { wrapper } = await render()
    expect(wrapper.findAll('[data-filter="who"] option').map((o) => o.text())).toEqual([
      'Everyone',
      'Anna Bērziņa',
      'Jānis Ozols',
      'Laura Zariņa',
      'Whoever runs the deployment',
    ])
  })

  it('asks every ticked service for the deployment’s lines when it is chosen, and writes it to the address', async () => {
    stub({
      [`${S}/members/history?actor=operator`]: { status: 200, body: { events: [ev('d1', '2026-10-03T10:00:00Z', 'demo-seed', 'tenantCreated', { name: 'Kalns' }), ev('d2', '2026-10-03T09:59:00Z', 'sub:L', 'tenantRoleGranted', { name: 'Meistars' }, 'm1')], more: false } },
    })
    const { wrapper, router } = await render()
    await wrapper.get('[data-filter="who"]').setValue('operator')
    await settle(wrapper)
    expect(query(router).who).toBe('operator')
    expect(reads()).toContain(`${S}/members/history?actor=operator`)
    expect(reads()).toContain(`${S}/orders/history?family=setup&actor=operator`)
    expect(reads()).toContain(`${S}/stock/history?family=shelves&actor=operator`)
    // Only the line that begins with the deployment; a line begun by a person is not its.
    expect(lines(wrapper)).toHaveLength(1)
    expect(lines(wrapper)[0]).toContain('Whoever runs the deployment opened the workspace «Kalns»')
  })

  it('narrows by area and by person from the screen, and says when nothing matches', async () => {
    stub()
    const { wrapper } = await render()
    await wrapper.get('[data-filter="config"]').setValue(false)
    await settle(wrapper)
    expect(lines(wrapper)).toHaveLength(2)
    await wrapper.get('[data-filter="who"]').setValue('m1')
    await settle(wrapper)
    expect(lines(wrapper)).toHaveLength(1)
    await wrapper.get('[data-filter="people"]').setValue(false)
    await settle(wrapper)
    expect(wrapper.get('[data-state="empty"]').text()).toBe('No change matches these filters.')
  })

  it('takes a person the list does not hold to mean everyone, and rewrites the address without them', async () => {
    stub()
    const { wrapper, router } = await render({ url: '/history?who=nobody' })
    expect(query(router).who).toBeUndefined()
    expect(reads().every((c) => !c.includes('actor='))).toBe(true)
    expect(lines(wrapper)).toHaveLength(5)
  })

  it('says every key in words: the deployment, what the workspace was given, a service’s role, the login and the chart’s boxes', async () => {
    stub(
      registerOnly([
        ev('k10', '2026-10-03T10:10:00Z', 'demo-seed', 'chartPositionPermissionsSet', { positionId: 'p1', name: 'CEO', from: [], permissions: ['shelves/shelf:count'] }),
        ev('k9', '2026-10-03T10:09:00Z', 'sub:ZZ', 'userRevoked', {}, 'm2'),
        ev('k8', '2026-10-03T10:08:00Z', 'claude-for-gatis', 'directoryAttached', { issuer: 'https://login.microsoftonline.com/3c1d/v2.0' }),
        ev('k7', '2026-10-03T10:07:00Z', 'demo-seed', 'chartPositionPermissionsSet', { positionId: 'p1', name: 'CEO', from: ['orders/order:view'], permissions: ['orders/order:view', 'orders/order:edit'] }),
        ev('k6', '2026-10-03T10:06:00Z', 'demo-seed', 'chartPositionPermissionsSet', { positionId: 'p1', name: 'CEO', from: [], permissions: ['orders/order:view'] }),
        ev('k5', '2026-10-03T10:05:00Z', 'demo-seed', 'roleGranted', { service: 'stock', group: 'stock', level: 'clerk' }, 'm2'),
        ev('k4', '2026-10-03T10:04:00Z', 'demo-seed', 'roleGranted', { service: 'members', group: 'membership', level: 'chart' }, 'm2'),
        ev('k3', '2026-10-03T10:03:00Z', 'demo-seed', 'tenantEntitled', { service: 'mystery', feature: '' }),
        ev('k2', '2026-10-03T10:02:00Z', 'demo-seed', 'tenantEntitled', { service: 'stock', feature: '' }),
        ev('k1', '2026-10-03T10:01:00Z', 'demo-seed', 'tenantEntitled', { service: 'orders', feature: '' }),
      ]),
    )
    const { wrapper } = await render()
    const all = lines(wrapper)
    // A box no service declares any more is said as one, never as the permission it travels as.
    expect(all[0]).toContain('changed what «CEO» sees below: added a box no service declares now')
    expect(all.join(' ')).not.toContain('shelves/shelf:count')
    const out = all.slice(1)
    expect(out[0]).toContain('Someone not in the list took all access from Jānis Ozols')
    expect(out[1]).toContain('Whoever runs the deployment attached the corporate login Microsoft')
    // The address sits under the line, without its scheme.
    expect(out[1]).toContain('login.microsoftonline.com/3c1d/v2.0')
    expect(out[1]).not.toContain('https://')
    expect(out[2]).toContain('Whoever runs the deployment changed what «CEO» sees below: added change orders')
    expect(out[3]).toContain('changed what «CEO» sees below: added See orders')
    expect(out[4]).toContain('Whoever runs the deployment gave Jānis Ozols «stock · clerk» in Stock modules')
    expect(out[5]).toContain('Whoever runs the deployment gave Jānis Ozols «see the Chart of authority» in People & access')
    expect(out[6]).toContain('Whoever runs the deployment gave the workspace something this list cannot name')
    expect(out[7]).toContain('Whoever runs the deployment gave the workspace Stock modules')
    expect(out[8]).toContain('Whoever runs the deployment gave the workspace Orders')
    expect(out.join(' ')).not.toMatch(/demo-seed|claude-for-gatis|sub:ZZ|«»/)
  })

  it('draws a run of the services’ lines as one line that opens and closes', async () => {
    stub(
      registerOnly([
        ev('f6', '2026-10-03T10:06:00Z', 'sub:L', 'tenantRoleDefined', { name: 'Newest' }),
        ev('f5', '2026-10-03T10:05:00Z', 'operator', 'userInvited', {}, 'm5'),
        ev('f4', '2026-10-03T10:04:00Z', 'svc:orders', 'claimAttached', {}, 'm5'),
        ev('f3', '2026-10-03T10:03:00Z', 'operator', 'userInvited', {}, 'm6'),
        ev('f2', '2026-10-03T10:02:00Z', 'svc:stock', 'claimAttached', {}, 'm6'),
        ev('f1', '2026-10-03T10:01:00Z', 'sub:L', 'tenantRoleDefined', { name: 'Oldest' }),
      ]),
    )
    const { wrapper } = await render()
    expect(lines(wrapper)).toHaveLength(3)
    expect(lines(wrapper)[1]).toContain('4 lines about the 2 services this workspace runs on: Order register, Stock modules')
    expect(lines(wrapper)[1]).toContain('Show them')
    await wrapper.get('[data-act="fold"]').trigger('click')
    expect(lines(wrapper)).toHaveLength(7)
    expect(lines(wrapper)[1]).toContain('Hide them')
    expect(lines(wrapper)[2]).toContain('Whoever runs the deployment invited Order register')
    await wrapper.get('[data-act="fold"]').trigger('click')
    expect(lines(wrapper)).toHaveLength(3)
  })

  it('says one service when the run is about one, and draws a lone service line as a line', async () => {
    stub(
      registerOnly([
        ev('g4', '2026-10-03T10:04:00Z', 'sub:L', 'tenantRoleDefined', { name: 'Newest' }),
        ev('g3', '2026-10-03T10:03:00Z', 'operator', 'userInvited', {}, 'm5'),
        ev('g2', '2026-10-03T10:02:00Z', 'svc:orders', 'claimAttached', {}, 'm5'),
        ev('g1', '2026-10-02T10:01:00Z', 'operator', 'userInvited', {}, 'm6'),
      ]),
    )
    const { wrapper } = await render()
    const out = lines(wrapper)
    expect(out).toHaveLength(3)
    expect(out[1]).toContain('2 lines about a service this workspace runs on: Order register')
    // The lone one is on another day, so it is not part of the run.
    expect(out[2]).toContain('Whoever runs the deployment invited Stock modules')
  })

  it('draws the deployment making someone an administrator, and undoing it, as one line each', async () => {
    const admin = { service: 'members', group: 'membership', level: 'admin' }
    stub(
      registerOnly([
        ev('a4', '2026-10-03T12:00:00Z', 'operator', 'roleRevoked', admin, 'm2'),
        ev('a3', '2026-10-03T12:00:00Z', 'operator', 'administratorUnsetByOperator', {}, 'm2'),
        ev('a2', '2026-10-03T11:00:00Z', 'operator', 'roleGranted', admin, 'm2'),
        ev('a1', '2026-10-03T11:00:00Z', 'operator', 'administratorSetByOperator', {}, 'm2'),
      ]),
    )
    const { wrapper } = await render()
    const out = lines(wrapper)
    expect(out).toHaveLength(2)
    expect(out[0]).toContain('Whoever runs the deployment made Jānis Ozols no longer an administrator')
    expect(out[1]).toContain('Whoever runs the deployment made Jānis Ozols an administrator')
  })

  it('says a service that does not answer by its area, once, and a refusal by the words it came with', async () => {
    stub({
      [`${S}/orders/history?family=setup`]: { status: 503, body: {} },
      [`${S}/stock/history?family=setup`]: { status: 503, body: {} },
      [`${S}/stock/history?family=shelves`]: { status: 403, body: { title: 'Not yours to read' } },
    })
    const { wrapper } = await render()
    expect(wrapper.findAll('[data-note="missing"]').map((n) => n.text())).toEqual([
      'Configuration is not answering, so its changes are missing from this list.',
      'Could not read the changes in Shelves (Not yours to read), so they are missing from this list.',
    ])
    expect(lines(wrapper)).toHaveLength(2)
  })

  it('says a refusal that came with no words by its status, never its code', async () => {
    stub({ [`${S}/stock/history?family=shelves`]: { status: 500, body: { code: 'internal_failure' } } })
    const { wrapper } = await render()
    expect(wrapper.get('[data-note="missing"]').text()).toBe('Could not read the changes in Shelves (the service failed), so they are missing from this list.')
  })

  it('says it in Latvian, with the area in the host’s Latvian word', async () => {
    stub({ [`${S}/orders/history?family=setup`]: { status: 503, body: {} } })
    const { wrapper } = await render({ locale: 'lv' })
    expect(wrapper.get('[data-note="missing"]').text()).toBe('Joma «Konfigurācija» neatbild, tāpēc tās izmaiņu šajā sarakstā nav.')
  })

  it('never reads a source its host says is locked, and offers no tick for an area with none left', async () => {
    stub()
    const locked: AdminOptions = {
      ...options,
      history: { ...options.history!, sources: options.history!.sources.map((s) => (s.filter === 'shelves' ? { ...s, locked: () => true } : s)) },
    }
    const { wrapper } = await render({ options: locked })
    expect(reads().some((c) => c.includes('family=shelves'))).toBe(false)
    expect(wrapper.find('[data-filter="shelves"]').exists()).toBe(false)
    expect(wrapper.find('[data-filter="config"]').exists()).toBe(true)
  })

  it('tells the host which areas it opens with, and again when one is ticked on', async () => {
    stub()
    const prepare = vi.fn()
    const { wrapper } = await render({ url: '/history?show=people', options: { ...options, history: { ...options.history!, prepare } } })
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(prepare).toHaveBeenLastCalledWith(['people'])
    await wrapper.get('[data-filter="shelves"]').setValue(true)
    await settle(wrapper)
    expect(prepare).toHaveBeenCalledTimes(2)
    expect(prepare).toHaveBeenLastCalledWith(['shelves'])
  })

  it('holds back what another service may still precede, and reads older lines with each service’s own place', async () => {
    stub({
      [`${S}/members/history`]: { status: 200, body: { events: [ev('e2', '2026-10-03T11:40:00Z', 'sub:L', 'tenantRoleGranted', { name: 'Meistars' }, 'm2')], more: true } },
      [`${S}/members/history?before=e2`]: { status: 200, body: { events: [ev('e1', '2026-10-03T11:02:00Z', 'svc:idp', 'directoryAdmitted', {}, 'm2')], more: false } },
    })
    const { wrapper } = await render()
    const older = () => wrapper.findAll('button').find((b) => b.text() === 'Show older')
    // Nothing older than the register's oldest line read so far is shown yet.
    expect(lines(wrapper)).toHaveLength(2)
    expect(wrapper.text()).toContain('Showing the newest 2.')
    await older()!.trigger('click')
    await settle(wrapper)
    expect(calls).toContain(`${S}/members/history?before=e2`)
    expect(calls.filter((c) => c.startsWith(`${S}/orders/history`))).toHaveLength(1)
    expect(lines(wrapper)).toHaveLength(5)
    expect(older()).toBeUndefined()
  })

  // A line whose name stayed records a change of the names in other languages alone.
  it.each([
    [
      'en',
      [
        'Laura Zariņa changed the names of the role «Meistars» in other languages',
        'Laura Zariņa renamed the role «Meistars» to «Vecākais meistars»',
        'Laura Zariņa changed the names of the position «Ražošanas vadītājs» in other languages',
        'Laura Zariņa renamed the position «Cehs» to «Ražošanas vadītājs»',
      ],
    ],
    [
      'lv',
      [
        'Laura Zariņa mainīja lomas «Meistars» nosaukumus citās valodās',
        'Laura Zariņa pārdēvēja lomu «Meistars» par «Vecākais meistars»',
        'Laura Zariņa mainīja amata «Ražošanas vadītājs» nosaukumus citās valodās',
        'Laura Zariņa pārdēvēja amatu «Cehs» par «Ražošanas vadītājs»',
      ],
    ],
  ])('in %s, says a change of names in other languages, never a rename to the same name', async (locale, said) => {
    stub(
      registerOnly([
        ev('e4', '2026-10-03T11:40:00Z', 'sub:L', 'tenantRoleRenamed', { roleId: 'r1', from: 'Meistars', to: 'Meistars', labels: { en: 'Foreman' } }),
        ev('e3', '2026-10-03T11:30:00Z', 'sub:L', 'tenantRoleRenamed', { roleId: 'r1', from: 'Meistars', to: 'Vecākais meistars', labels: { en: 'Foreman' } }),
        ev('e2', '2026-10-03T11:20:00Z', 'sub:L', 'chartPositionRenamed', { positionId: 'p1', name: 'Ražošanas vadītājs', from: 'Ražošanas vadītājs', labels: { en: 'Head of production' } }),
        ev('e1', '2026-10-03T11:10:00Z', 'sub:L', 'chartPositionRenamed', { positionId: 'p1', name: 'Ražošanas vadītājs', from: 'Cehs', labels: {} }),
      ]),
    )
    const { wrapper } = await render({ locale })
    const out = lines(wrapper)
    expect(out).toHaveLength(4)
    said.forEach((s, i) => expect(out[i]).toContain(s))
  })

  it('reads the people again for another workspace signed in without the page loading again', async () => {
    const W2 = `${S}/members/tenants/W-2`
    stub({
      [`${W2}/access`]: { status: 200, body: { members: [member('m9', 'sub:Z', 'Zane Muižniece')] } },
      [`${W2}/roles`]: { status: 200, body: { roles: [] } },
      [`${W2}/user-types`]: { status: 200, body: { userTypes: [] } },
      [`${W2}/chart/positions`]: { status: 200, body: { positions: [] } },
    })
    const first = await render()
    first.wrapper.unmount()
    const { wrapper } = await render({ pinia: first.pinia, tenant: 'W-2' })
    expect(calls).toContain(`${W2}/access`)
    expect(wrapper.findAll('[data-filter="who"] option').map((o) => o.text())).toEqual(['Everyone', 'Zane Muižniece', 'Whoever runs the deployment'])
  })

  it('takes a key a line carries as data, never as something every object has', async () => {
    stub(
      registerOnly([
        ev('p2', '2026-10-03T10:02:00Z', 'demo-seed', 'tenantEntitled', { service: '__proto__', feature: '' }),
        ev('p1', '2026-10-03T10:01:00Z', 'demo-seed', 'chartPositionPermissionsSet', { positionId: 'p1', name: 'CEO', from: [], permissions: ['constructor'] }),
      ]),
    )
    const { wrapper } = await render({ url: '/history?show=people' })
    const out = lines(wrapper)
    expect(out[0]).toContain('Whoever runs the deployment gave the workspace something this list cannot name')
    expect(out[1]).toContain('changed what «CEO» sees below: added a box no service declares now')
  })

  it('says an answer that was not a refusal as a failure, never with what the browser said about it', async () => {
    stub({ [`${S}/members/history`]: { status: 200, body: { events: [], more: false } } })
    const fetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    const real = fetch.getMockImplementation()!
    fetch.mockImplementation(async (url: string) =>
      url === `${S}/members/history`
        ? ({ ok: true, status: 200, headers: new Headers(), json: async () => { throw new SyntaxError('Unexpected token \'<\', "<!doctype "') } } as unknown as Response)
        : real(url),
    )
    const { wrapper } = await render({ url: '/history?show=people' })
    const said = wrapper.get('[data-note="missing"]').text()
    expect(said).toContain('the service failed')
    expect(said).not.toMatch(/SyntaxError|doctype/)
  })

  it('says nothing has changed yet when no service has a line', async () => {
    stub({ [`${S}/members/history`]: noneRegister, [`${S}/orders/history?family=setup`]: none, [`${S}/stock/history?family=setup`]: none })
    const { wrapper } = await render()
    expect(wrapper.get('[data-state="empty"]').text()).toBe('Nothing has changed yet.')
  })
})

describe('a workspace’s opening, its services in their own words', () => {
  // The lines a workspace's opening writes for a service it runs on, and the same
  // kinds of line for a person, on another day so the services' run stands alone.
  const opening = registerOnly([
    ev('n5', '2026-10-03T10:05:00Z', 'svc:orders', 'claimAttached', { subjectKey: 'svc:orders' }, 'm5'),
    ev('n4', '2026-10-03T10:04:00Z', 'operator', 'roleGranted', { group: 'stock', level: 'clerk', service: 'stock' }, 'm5'),
    ev('n3', '2026-10-03T10:03:00Z', 'operator', 'roleGranted', { group: 'membership', level: 'chart', service: 'members' }, 'm5'),
    ev('n2', '2026-10-03T10:02:00Z', 'operator', 'userTypeAssigned', { source: 'workspaceDefault', userTypeId: 't1', name: 'Member' }, 'm5'),
    ev('n1', '2026-10-03T10:01:00Z', 'operator', 'userInvited', { subjectKey: 'svc:orders', displayName: 'Order register' }, 'm5'),
    ev('p2', '2026-10-02T09:02:00Z', 'sub:J', 'claimAttached', { subjectKey: 'sub:J' }, 'm2'),
    ev('p1', '2026-10-02T09:01:00Z', 'operator', 'userTypeAssigned', { source: 'workspaceDefault', userTypeId: 't1', name: 'Member' }, 'm2'),
  ])
  const named: AdminOptions = {
    ...options,
    history: {
      ...options.history!,
      services: { 'svc:orders': 'host.svc.orders', stock: 'host.stock' },
      grants: { 'stock/clerk': 'host.grant.stockClerk' },
    },
  }
  beforeEach(() => {
    words.en.host = { ...words.en.host, svc: { orders: 'Orders service' }, grant: { stockClerk: 'count the stock' } } as typeof words.en.host
    words.lv.host = { ...words.lv.host, svc: { orders: 'Pasūtījumu serviss' }, stock: 'Krājumi', grant: { stockClerk: 'skaitīt krājumus' } } as typeof words.lv.host
  })

  it('names a service by the host’s word, says it was connected, and draws no newcomer line for it (en)', async () => {
    stub(opening)
    const { wrapper } = await render({ options: named })
    expect(lines(wrapper)[0]).toContain('4 lines about a service this workspace runs on: Orders service')
    await wrapper.get('[data-act="fold"]').trigger('click')
    const out = lines(wrapper).join(' | ')

    expect(out).toContain('Whoever runs the deployment invited Orders service')
    expect(out).toContain('Whoever runs the deployment gave Orders service «see the Chart of authority» in People & access')
    expect(out).toContain('Whoever runs the deployment gave Orders service «count the stock» in Stock')
    expect(out).toContain('Orders service was connected to this workspace')
    expect(out).not.toMatch(/Order register|membership · chart|stock · clerk/)
    // A person's opening keeps a person's words.
    expect(out).toContain('Jānis Ozols accepted the invitation')
    expect(out).toContain('was given the user type «Member», as everyone new is')
    expect(out.match(/as everyone new is/g)).toHaveLength(1)
  })

  it('says the same in Latvian', async () => {
    stub(opening)
    const { wrapper } = await render({ locale: 'lv', options: named })
    await wrapper.get('[data-act="fold"]').trigger('click')
    const out = lines(wrapper).join(' | ')

    expect(out).toContain('Pasūtījumu serviss tika pievienots šai darbvietai')
    expect(out).toContain('«redzēt Pilnvaru shēmu» servisā Cilvēki un piekļuve')
    expect(out).toContain('«skaitīt krājumus» servisā Krājumi')
    expect(out).not.toMatch(/Order register|membership · chart|stock · clerk|pieņēma uzaicinājumu.*Pasūtījumu/)
  })

  it('keeps a service’s own name and the grant’s keys where the host names neither', async () => {
    stub(opening)
    const { wrapper } = await render()
    await wrapper.get('[data-act="fold"]').trigger('click')
    const out = lines(wrapper).join(' | ')

    expect(out).toContain('Order register was connected to this workspace')
    expect(out).toContain('«see the Chart of authority» in People & access')
    expect(out).toContain('«stock · clerk» in Stock modules')
  })
})

describe('History › notes on people', () => {
  const written = registerOnly([
    ev('n2', '2026-10-03T10:02:00Z', 'sub:L', 'noteChanged', { cleared: true }, 'm2'),
    ev('n1', '2026-10-03T10:01:00Z', 'sub:L', 'noteChanged', { cleared: false }, 'm2'),
  ])

  it('says a note changed, and a note cleared, under the administrator, about the person', async () => {
    stub(written)
    const { wrapper } = await render()
    const out = lines(wrapper)
    expect(out).toHaveLength(2)
    expect(out[0]).toContain('Laura Zariņa cleared the note on Jānis Ozols')
    expect(out[1]).toContain('Laura Zariņa changed the note on Jānis Ozols')
    expect(out.join(' ')).not.toContain('has no words for yet')
  })

  it('says both in Latvian', async () => {
    stub(written)
    const { wrapper } = await render({ locale: 'lv' })
    const out = lines(wrapper)
    expect(out[0]).toContain('notīrīja piezīmi par Jānis Ozols')
    expect(out[1]).toContain('mainīja piezīmi par Jānis Ozols')
  })
})
