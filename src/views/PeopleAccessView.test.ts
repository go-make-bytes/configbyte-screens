// People & access against a stand-in coordinator relaying to a stand-in register:
// who is listed and how, every act's address and body, the words after each act,
// and the refusals worded by the act that was made.
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'

import { localDay } from '../lib/format'
import type { AdminOptions } from '../options'
import { configbyteScreens } from '../plugin'
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
  userType: { id: 't-member', name: 'Member' },
  chartUserType: null,
  lastSignedInOn: null,
  ...over,
})

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
  member({ id: 's1', subjectKey: 'svc:printer', displayName: 'Label printer', kind: 'service' }),
]

const roles = () => [
  {
    id: 'r1',
    name: 'Picker',
    description: '',
    permissions: ['orders/order:view', 'stock/shelf:view', 'orders/order:viewField@price.1', 'other/thing:do', 'orders/order:archive'],
  },
  { id: 'r2', seed: 'worker', name: 'Worker', description: '', permissions: ['orders/order:view'] },
]

const userTypes = () => [
  { id: 't-member', name: 'Member', description: 'Everyone who joins.', permissions: [], members: 1, corporateLoginDefault: false, workspaceDefault: true },
  { id: 't-clerk', name: 'Clerk', description: '', permissions: ['orders/order:create'], members: 1, corporateLoginDefault: true, workspaceDefault: false },
  { id: 't-floor', name: 'Floor', description: '', permissions: [], members: 1, corporateLoginDefault: false, workspaceDefault: false },
  { id: 't-lead', name: 'Lead', description: '', permissions: [], members: 0, corporateLoginDefault: false, workspaceDefault: false },
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
    },
  },
}

const options: AdminOptions = {
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
    fields: async () => [{ permission: 'orders/order:viewField@price.2', name: 'Price', group: 'host.groups.restricted' }],
    guard: (_box, ticks) => (ticks.includes('orders/order:view') ? { key: 'host.guard.every' } : { key: 'host.guard.own' }),
  },
}

let calls: Call[] = []
let answers: Record<string, Reply[]> = {}

function stub(extra: Record<string, Reply | Reply[]> = {}) {
  calls = []
  const base: Record<string, Reply | Reply[]> = {
    [`GET ${T}/access`]: { status: 200, body: { members: members() } },
    [`GET ${T}/roles`]: { status: 200, body: { roles: roles() } },
    [`GET ${T}/user-types`]: { status: 200, body: { userTypes: userTypes() } },
    [`GET ${R}/config`]: { status: 200, body: vocabulary },
    [`GET ${T}/chart/positions`]: { status: 200, body: { included: true, positions: [] } },
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

async function render(over: Partial<AdminOptions> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useAdminSession()
  session.me = {
    subject: 'sub:A',
    name: 'Anna Admin',
    loginMethod: 'an ID card',
    loa: 'high',
    tenant: 'W-1',
    sections: held,
    presentation: { displayName: 'Kalns', locale: 'en' },
  }
  session.order = ['orders', 'stock', 'members']
  session.resolved = true
  const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages: structuredClone(words) })
  const wrapper = mount(PeopleAccessView, { global: { plugins: [pinia, i18n, configbyteScreens(i18n, { ...options, ...over })] } })
  await settle(wrapper)

  return wrapper
}

type W = Awaited<ReturnType<typeof render>>
const button = (wrapper: W, text: string) => wrapper.findAll('button').find((b) => b.text() === text)!
const tabTo = async (wrapper: W, label: string) => {
  await wrapper.findAll('[role="tab"], button').find((b) => b.text() === label)!.trigger('click')
  await settle(wrapper)
}
const writes = () => calls.filter((c) => c.method !== 'GET')

beforeEach(() => {
  document.cookie = 'configbyte_csrf=tok-1'
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('People & access › Users', () => {
  it('lists the people by what they hold, the arrivals first, machines apart, and who lost access only on request', async () => {
    stub()
    const wrapper = await render()
    expect(wrapper.get('[data-block="arrivals"]').text()).toContain('Signed in, given nothing yet (1)')
    expect(wrapper.get('[data-block="arrivals"]').text()).toContain('Jānis New')
    const rows = wrapper.findAll('tbody tr').map((r) => r.text())
    expect(rows).toHaveLength(4)
    expect(rows[0]).toContain('Anna Admin')
    expect(rows[0]).toContain('Administrator')
    expect(rows[0]).toContain('today')
    expect(rows[1]).toContain('yesterday')
    expect(rows[2]).toContain('has not signed in yet')
    // The user type in force is the chart position's while the person sits in one.
    expect(rows[3]).toContain('Lead')
    expect(rows[3]).toContain('Picker')
    expect(rows[3]).toContain('41 days ago')
    expect(wrapper.text()).not.toContain('Toms Gone')
    expect(wrapper.get('[data-block="machines"]').text()).toContain('Label printer')
    expect(wrapper.find('[data-person="s1"]').exists()).toBe(false)

    await wrapper.get('input[type="checkbox"]').setValue(true)
    await settle(wrapper)
    expect(wrapper.get('[data-person="m5"]').text()).toContain('no access any more')
  })

  it('reads the register through the coordinator only', async () => {
    stub()
    await render()
    expect(calls.every((c) => c.url.startsWith(`${R}/`))).toBe(true)
  })

  it('gives a person a user type at once, and says so', async () => {
    stub({ [`PUT ${T}/users/m2/user-type`]: { status: 200, body: {} } })
    const wrapper = await render()
    await wrapper.get('[data-act="user-type"]').setValue('t-clerk')
    await settle(wrapper)
    expect(writes()).toEqual([{ method: 'PUT', url: `${T}/users/m2/user-type`, body: { userTypeId: 't-clerk' }, csrf: 'tok-1' }])
    expect(wrapper.get('[data-said="said"]').text()).toBe("Jānis New's user type is now «Clerk».")
  })

  it('gives a role and takes one away, each in its own act', async () => {
    stub({
      [`POST ${R}/users/m2/roles?tenant=W-1`]: { status: 200, body: {} },
      [`DELETE ${R}/users/m4/roles?roleId=r1&tenant=W-1`]: { status: 200, body: {} },
    })
    const wrapper = await render()
    await wrapper.get('[data-act="give-role"]').setValue('r1')
    await settle(wrapper)
    expect(writes()[0]).toEqual({ method: 'POST', url: `${R}/users/m2/roles?tenant=W-1`, body: { roleId: 'r1' }, csrf: 'tok-1' })
    expect(wrapper.get('[data-said="said"]').text()).toBe('Jānis New now holds «Picker».')

    await wrapper.get('[data-person="m4"]').trigger('click')
    await settle(wrapper)
    await wrapper.get('button[aria-label="Take «Picker» away"]').trigger('click')
    await settle(wrapper)
    expect(writes()[1]).toMatchObject({ method: 'DELETE', url: `${R}/users/m4/roles?roleId=r1&tenant=W-1` })
    expect(wrapper.get('[data-said="said"]').text()).toBe('«Picker» was taken from Kārlis Picker.')
    // The chart position's type is said beside the person's own.
    expect(wrapper.get('[data-note="chart-type"]').text()).toContain('«Lead»')
  })

  it('says the last administrator cannot be unticked, and leaves the box ticked', async () => {
    stub({ [`DELETE ${T}/administrators/m1`]: { status: 409, body: { code: 'err:request:conflict', detail: 'the register said so' } } })
    const wrapper = await render()
    await wrapper.get('[data-person="m1"]').trigger('click')
    await settle(wrapper)
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
    const wrapper = await render()
    await wrapper.get('[data-act="administrator"]').setValue(true)
    await settle(wrapper)
    expect(wrapper.get('[data-said="refused"]').text()).toBe(
      'You are no longer an administrator of this workspace, so nothing was changed. Sign in again to see what is yours.',
    )
  })

  it('takes away all access only after it is confirmed', async () => {
    stub({ [`DELETE ${R}/users/m4?tenant=W-1`]: { status: 200, body: {} } })
    const wrapper = await render()
    await wrapper.get('[data-person="m4"]').trigger('click')
    await settle(wrapper)
    await button(wrapper, 'Take away all access').trigger('click')
    await settle(wrapper)
    expect(writes()).toEqual([])
    expect(wrapper.text()).toContain('Kārlis Picker can no longer sign in to this workspace')
    await wrapper.get('[data-act="take-all"]').trigger('click')
    await settle(wrapper)
    expect(writes()).toEqual([{ method: 'DELETE', url: `${R}/users/m4?tenant=W-1`, body: undefined, csrf: 'tok-1' }])
    expect(wrapper.get('[data-said="said"]').text()).toBe('Kārlis Picker has no access any more.')
  })

  it('gathers the same people by access', async () => {
    stub()
    const wrapper = await render()
    await button(wrapper, 'By access').trigger('click')
    await settle(wrapper)
    const text = wrapper.get('[data-view="access"]').text()
    expect(text).toContain('Picker role · 1')
    expect(text).toContain('Kārlis Picker')
    expect(text).toContain('Lead user type · 1')
    // A user type says what it holds in the words its service declares.
    expect(text).toContain('Clerk user type · 1 · Register an order')
    expect(text).toContain('Floor user type · 0 · holds nothing')
  })

  it('says so when the register cannot be read', async () => {
    stub({ [`GET ${T}/access`]: { status: 403, body: { code: 'err:membership:notMember' } } })
    const wrapper = await render()
    expect(wrapper.get('[data-state="failed"]').text()).toContain('err:membership:notMember')
  })
})

describe('People & access › Roles', () => {
  it('shows a role’s boxes in the host’s groups, the rest under its service, never a setup or chart box', async () => {
    stub()
    const wrapper = await render()
    await tabTo(wrapper, 'Roles')
    const titles = wrapper.findAll('details summary').map((s) => s.text().split('\n')[0]!.trim())
    expect(titles.map((x) => x.replace(/\s+\d+ of \d+ ticked$/, ''))).toEqual(['Orders', 'Notes', 'Stock service', 'Restricted fields'])
    expect(wrapper.find('[data-box="orders/setup/kinds:manage"]').exists()).toBe(false)
    expect(wrapper.find('[data-box="oversight/order:view"]').exists()).toBe(false)
    expect(wrapper.find('[data-box="orders/order:viewField"]').exists()).toBe(false)
    expect(wrapper.get('[data-box="orders/order:viewField@price.2"]').text()).toContain('See «Price»')
    // A retired box stays in sight on the role that still holds it.
    expect(wrapper.get('[data-box="orders/order:archive"]').text()).toContain('no longer given')
    expect(wrapper.text()).toContain("Setting up the workspace is never a role's: it comes only with the Administrator checkbox.")
  })

  it('says what a field box hands out before Save, by what else the role holds', async () => {
    stub()
    const wrapper = await render()
    await tabTo(wrapper, 'Roles')
    await button(wrapper, 'Worker').trigger('click')
    await settle(wrapper)
    expect(wrapper.find('[data-guard]').exists()).toBe(false)
    await wrapper.get('[data-box="orders/order:viewField@price.2"] input').setValue(true)
    await settle(wrapper)
    expect(wrapper.get('[data-guard]').text()).toBe('Everyone with this role will see every «Price».')
    await wrapper.get('[data-box="orders/order:view"] input').setValue(false)
    await settle(wrapper)
    expect(wrapper.get('[data-guard]').text()).toBe('Everyone with this role will see their own «Price».')
  })

  it('saves the whole set: what it shows as ticked, what it does not show kept, an old field box dropped', async () => {
    stub({ [`PUT ${T}/roles/r1/permissions`]: { status: 200, body: {} } })
    const wrapper = await render()
    await tabTo(wrapper, 'Roles')
    await wrapper.get('[data-box="stock/shelf:view"] input').setValue(false)
    await settle(wrapper)
    await wrapper.get('[data-act="save-role"]').trigger('click')
    await settle(wrapper)
    expect(writes()).toEqual([
      { method: 'PUT', url: `${T}/roles/r1/permissions`, body: { permissions: ['orders/order:archive', 'orders/order:view', 'other/thing:do'] }, csrf: 'tok-1' },
    ])
    expect(wrapper.get('[data-said="said"]').text()).toBe('The role was saved.')
  })

  it('keeps every field box it cannot judge when the restricted fields could not be read', async () => {
    stub({ [`PUT ${T}/roles/r1/permissions`]: { status: 200, body: {} } })
    const wrapper = await render({ roles: { ...options.roles, fields: async () => Promise.reject(new Error('down')) } })
    await tabTo(wrapper, 'Roles')
    expect(wrapper.find('[data-note="fields-unread"]').exists()).toBe(true)
    await wrapper.get('[data-box="stock/shelf:view"] input').setValue(false)
    await settle(wrapper)
    await wrapper.get('[data-act="save-role"]').trigger('click')
    await settle(wrapper)
    expect((writes()[0]!.body as { permissions: string[] }).permissions).toContain('orders/order:viewField@price.1')
  })

  it('makes a new role, then gives it its boxes', async () => {
    stub({
      [`POST ${T}/roles`]: { status: 200, body: { id: 'r9', name: 'Packer' } },
      [`PUT ${T}/roles/r9/permissions`]: { status: 200, body: {} },
    })
    const wrapper = await render()
    await tabTo(wrapper, 'Roles')
    await wrapper.get('[data-act="new-role"]').trigger('click')
    await settle(wrapper)
    await wrapper.get('#role-name').setValue('Packer')
    await wrapper.get('[data-box="orders/order:view"] input').setValue(true)
    await settle(wrapper)
    await wrapper.get('[data-act="save-role"]').trigger('click')
    await settle(wrapper)
    expect(writes().map((c) => [c.method, c.url, c.body])).toEqual([
      ['POST', `${T}/roles`, { name: 'Packer' }],
      ['PUT', `${T}/roles/r9/permissions`, { permissions: ['orders/order:view'] }],
    ])
  })

  it('words a taken name, a held role and a shipped role by the act', async () => {
    stub({
      [`PUT ${T}/roles/r1`]: { status: 409, body: { code: 'err:request:conflict' } },
      [`DELETE ${T}/roles/r1`]: { status: 409, body: { code: 'err:request:conflict' } },
    })
    const wrapper = await render()
    await tabTo(wrapper, 'Roles')
    await wrapper.get('#role-name').setValue('Worker')
    await wrapper.get('[data-act="save-role"]').trigger('click')
    await settle(wrapper)
    expect(wrapper.get('[data-said="refused"]').text()).toBe('Another role is already called «Worker».')
    await wrapper.get('[data-act="delete-role"]').trigger('click')
    await settle(wrapper)
    expect(wrapper.get('[data-said="refused"]').text()).toBe('«Picker» is held by 1 person. Take it from them first.')
    await button(wrapper, 'Worker').trigger('click')
    await settle(wrapper)
    expect(wrapper.find('[data-act="delete-role"]').exists()).toBe(false)
  })
})

describe('People & access › User types', () => {
  it('lists each type with what it holds, how many hold it and which one newcomers get', async () => {
    stub()
    const wrapper = await render()
    await tabTo(wrapper, 'User types')
    expect(wrapper.get('[data-type="t-member"]').text()).toContain('new people get this')
    expect(wrapper.get('[data-type="t-clerk"]').text()).toContain('the corporate login gives this')
    expect(wrapper.get('[data-type="t-clerk"]').text()).toContain('Register an order')
  })

  it.each([
    ['t-member', 'New people get «Member». Choose another first.'],
    ['t-clerk', 'People arriving through your corporate login get «Clerk». Choose another first.'],
    ['t-floor', '«Floor» is held by 1 person. Give them another user type first.'],
    ['t-lead', 'A position in the chart of authority gives «Lead». Change that position first.'],
  ])('says why %s cannot be deleted', async (id, said) => {
    stub({ [`DELETE ${T}/user-types/${id}`]: { status: 409, body: { code: 'err:request:conflict' } } })
    const wrapper = await render()
    await tabTo(wrapper, 'User types')
    await wrapper.get(`[data-act="delete-type-${id}"]`).trigger('click')
    await settle(wrapper)
    expect(wrapper.get('[data-said="refused"]').text()).toBe(said)
  })

  it('adds a user type holding workspace-wide boxes only', async () => {
    stub({ [`POST ${T}/user-types`]: { status: 200, body: { id: 't-new' } } })
    const wrapper = await render()
    await tabTo(wrapper, 'User types')
    await wrapper.get('[data-act="add-type"]').trigger('click')
    await settle(wrapper)
    const offered = wrapper.findAll('[data-type-form] [data-box]').map((b) => b.attributes('data-box'))
    expect(offered).toEqual(['orders/order:create'])
    await wrapper.get('[data-type-form] input').setValue('Office')
    await wrapper.get('[data-box="orders/order:create"] input').setValue(true)
    await settle(wrapper)
    await wrapper.get('[data-act="save-type"]').trigger('click')
    await settle(wrapper)
    expect(writes()).toEqual([
      { method: 'POST', url: `${T}/user-types`, body: { name: 'Office', description: '', permissions: ['orders/order:create'] }, csrf: 'tok-1' },
    ])
  })

  it('sets what the corporate login gives', async () => {
    stub({ [`PUT ${T}/corporate-login-default`]: { status: 200, body: {} } })
    const wrapper = await render()
    await tabTo(wrapper, 'User types')
    await wrapper.get('#corporate-login').setValue('t-floor')
    await settle(wrapper)
    expect(writes()).toEqual([{ method: 'PUT', url: `${T}/corporate-login-default`, body: { userTypeId: 't-floor' }, csrf: 'tok-1' }])
  })
})
