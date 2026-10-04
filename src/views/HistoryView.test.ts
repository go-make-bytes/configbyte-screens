// History against a stand-in coordinator relaying to three stand-in owners: one
// list newest first, the names the register keeps, the host's own sentences, the
// filters, a service that does not answer, and reading older lines page by page.
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'

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
      chips: { orders: 'orders', stock: 'stock' },
      lines: { renamed: 'renamed the kind to «{name}»' },
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
      { section: 'orders', query: 'family=setup', filter: 'config', chip: 'host.chips.orders' },
      { section: 'stock', query: 'family=setup', filter: 'config', chip: 'host.chips.stock' },
      { section: 'stock', query: 'family=shelves', filter: 'shelves', chip: 'host.chips.stock' },
    ],
    describe: (l) => (l.kind === 'kindRenamed' ? { key: 'host.lines.renamed', values: { name: String(l.payload.label) } } : null),
  },
}

const people = {
  members: [
    { id: 'm1', subjectKey: 'sub:L', displayName: 'Laura Zariņa', kind: 'person', status: 'active', administrator: true, arrival: false, tenantRoles: [], userType: null, chartUserType: null, lastSignedInOn: null },
    { id: 'm2', subjectKey: 'sub:J', displayName: 'Jānis Ozols', kind: 'person', status: 'active', administrator: false, arrival: false, tenantRoles: [], userType: null, chartUserType: null, lastSignedInOn: null },
  ],
}

const ev = (id: string, at: string, actor: string, kind: string, payload: Record<string, unknown> = {}, userId = '') => ({ id, at, actor, userId, kind, payload })

let calls: string[] = []
let answers: Record<string, Reply[]> = {}

function stub(extra: Record<string, Reply | Reply[]> = {}) {
  calls = []
  const base: Record<string, Reply | Reply[]> = {
    [`${T}/access`]: { status: 200, body: people },
    [`${T}/roles`]: { status: 200, body: { roles: [] } },
    [`${T}/user-types`]: { status: 200, body: { userTypes: [] } },
    [`${S}/members/config`]: { status: 200, body: { services: [] } },
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
    [`${S}/stock/history?family=shelves`]: { status: 200, body: { items: [], more: false } },
  }
  answers = Object.fromEntries(Object.entries({ ...base, ...extra }).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]))
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

async function settle(wrapper: { vm: { $nextTick: () => Promise<unknown> } }) {
  for (let pass = 0; pass < 8; pass += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()
  }
}

async function render() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useAdminSession()
  session.me = {
    subject: 'sub:L',
    name: 'Laura Zariņa',
    loginMethod: 'an ID card',
    loa: 'high',
    tenant: 'W-1',
    sections: { members: ['membership:admin'] },
    presentation: { displayName: 'Kalns', locale: 'en' },
  }
  session.order = ['orders', 'stock', 'members']
  const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages: structuredClone(words) })
  const wrapper = mount(HistoryView, { global: { plugins: [pinia, i18n, configbyteScreens(i18n, options)] } })
  await settle(wrapper)

  return wrapper
}

const lines = (wrapper: Awaited<ReturnType<typeof render>>) => wrapper.findAll('[data-line]').map((l) => l.text().replace(/\s+/g, ' '))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('History', () => {
  it('lays every service’s lines out as one list, newest first, under the day each happened', async () => {
    stub()
    const wrapper = await render()
    const out = lines(wrapper)
    expect(out).toHaveLength(5)
    expect(out[0]).toContain('Laura Zariņa imported a configuration file: 3 changed, 41 unchanged')
    expect(out[0]).toContain('file 9b1e…f04a · this part 3f2a…07c1')
    expect(out[0]).toMatch(/orders$/)
    expect(out[1]).toContain('Laura Zariņa gave Jānis Ozols the role «Meistars»')
    expect(out[1]).toMatch(/people$/)
    // A line about someone arriving is about the person who arrived.
    expect(out[2]).toContain('Jānis Ozols joined through the corporate login')
    expect(out[3]).toContain('Laura Zariņa renamed the kind to «Steidzami»')
    // A kind nobody words is shown as it is, never dropped.
    expect(out[4]).toContain('Jānis Ozols mysteryKind')
    expect(wrapper.findAll('h2')).toHaveLength(2)
    expect(wrapper.findAll('[data-block="filters"] label').map((l) => l.text().split('\n')[0]!.trim()).slice(0, 3)).toEqual([
      'Configuration',
      'People & access',
      'Shelves',
    ])
  })

  it('narrows by filter and by person, and says when nothing matches', async () => {
    stub()
    const wrapper = await render()
    await wrapper.get('[data-filter="config"]').setValue(false)
    await settle(wrapper)
    expect(lines(wrapper)).toHaveLength(2)
    await wrapper.get('[data-filter="who"]').setValue('sub:L')
    await settle(wrapper)
    expect(lines(wrapper)).toHaveLength(1)
    await wrapper.get(`[data-filter="${'configbyte-people'}"]`).setValue(false)
    await settle(wrapper)
    expect(wrapper.get('[data-state="empty"]').text()).toBe('No change matches these filters.')
  })

  it('says which service is not answering, and shows what the others answered', async () => {
    stub({ [`${S}/stock/history?family=setup`]: { status: 503, body: {} } })
    const wrapper = await render()
    expect(wrapper.get('[data-note="missing"]').text()).toBe('Stock is not answering, so its changes are missing from this list.')
    expect(lines(wrapper)).toHaveLength(4)
  })

  it('holds back what another service may still precede, and reads older lines with each service’s own place', async () => {
    stub({
      [`${S}/members/history`]: { status: 200, body: { events: [ev('e2', '2026-10-03T11:40:00Z', 'sub:L', 'tenantRoleGranted', { name: 'Meistars' }, 'm2')], more: true } },
      [`${S}/members/history?before=e2`]: { status: 200, body: { events: [ev('e1', '2026-10-03T11:02:00Z', 'svc:idp', 'directoryAdmitted', {}, 'm2')], more: false } },
    })
    const wrapper = await render()
    // Nothing older than the register's oldest line read so far is shown yet.
    expect(lines(wrapper)).toHaveLength(2)
    expect(wrapper.text()).toContain('Showing the newest 2.')
    await wrapper.get('[data-act="older"]').trigger('click')
    await settle(wrapper)
    expect(calls).toContain(`${S}/members/history?before=e2`)
    expect(calls.filter((c) => c.startsWith(`${S}/orders/history`))).toHaveLength(1)
    expect(lines(wrapper)).toHaveLength(5)
    expect(wrapper.find('[data-act="older"]').exists()).toBe(false)
  })

  it('says nothing has changed yet when no service has a line', async () => {
    stub({
      [`${S}/members/history`]: { status: 200, body: { events: [], more: false } },
      [`${S}/orders/history?family=setup`]: { status: 200, body: { items: [], more: false } },
      [`${S}/stock/history?family=setup`]: { status: 200, body: { items: [], more: false } },
    })
    const wrapper = await render()
    expect(wrapper.get('[data-state="empty"]').text()).toBe('Nothing has changed yet.')
  })
})
