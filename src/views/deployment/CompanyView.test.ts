// One company against a stand-in coordinator: what is read when the page opens, the
// products' boxes and their guard, the administrators behind a press, an invitation and
// a removal, the starting configuration while it can still be applied and what
// became of it, and every refusal of the area drawn where it belongs.
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import type { AdminOptions } from '../../options'
import { configbyteScreens } from '../../plugin'
import { adminRoutes } from '../../routes'
import { useDeployment } from '../../stores/deployment'
import { useAdminSession } from '../../stores/session'
import CompanyView from './CompanyView.vue'
import InviteAdministrator from './InviteAdministrator.vue'

type Reply = { status: number; body: unknown }
interface Call {
  method: string
  url: string
  body: unknown
  csrf: string
}

const AREA = '/api/configbyte/v1/deployment'
const C = `${AREA}/companies/c2`

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

const company = (over: Record<string, unknown> = {}) => ({
  id: 'c2',
  name: 'Kalve Ltd',
  status: 'active',
  createdAt: new Date().toISOString(),
  own: false,
  products: ['basic', 'extras'],
  administrators: 2,
  entered: false,
  ...over,
})

const catalogue = () => [
  { key: 'basic', displayName: 'Basic', offered: true, needs: [] },
  { key: 'extras', displayName: 'Extras', offered: true, needs: ['basic'] },
  { key: 'ledger', displayName: 'Ledger', offered: true, needs: ['basic'] },
  { key: 'idle', displayName: 'Idle', offered: false, needs: [] },
]

const admins = () => [
  { userId: 'u1', displayName: 'Ilze Bērziņa', status: 'active', lastSignedInOn: day(0) },
  { userId: 'u2', displayName: 'Jānis Krūmiņš', status: 'invited', lastSignedInOn: null },
]

const files = { configurations: [{ name: 'metal-fabrication' }, { name: 'office-work' }] }

const digits = Array.from({ length: 11 }, (_, i) => String((i * 7 + 3) % 10)).join('')
const shownCode = `${digits.slice(0, 6)}-${digits.slice(6)}`

/** The sign-in answer of the person the page is opened for. */
const identity = (extra: Record<string, unknown> = {}) => ({
  subject: 'sub:A',
  signedInAt: new Date().toISOString(),
  name: 'Anna Admin',
  loginMethod: 'webEid',
  loa: 'high',
  tenant: 'W-1',
  sections: {},
  presentation: { displayName: 'Kalns', locale: 'en', personLocale: null, deploymentLocale: 'en' },
  deployment: { mode: 'saas', admin: true, firstRunOwed: false, signInAge: 900 },
  ...extra,
})

let calls: Call[] = []
let answers: Record<string, Reply[]> = {}

/** The stand-in coordinator: the page's own reads, each repeating its last answer, plus whatever a test says. */
function stub(extra: Record<string, Reply | Reply[]> = {}) {
  calls = []
  const base: Record<string, Reply | Reply[]> = {
    [`GET ${C}`]: { status: 200, body: { company: company() } },
    [`GET ${AREA}/products`]: { status: 200, body: { products: catalogue() } },
    [`GET ${AREA}/configurations`]: { status: 200, body: files },
    [`GET ${C}/administrators`]: { status: 200, body: { administrators: admins() } },
    // Who is signed in, read again before every act and every read of people.
    'GET /api/configbyte/v1/me': { status: 200, body: identity() },
    'GET /api/configbyte/v1/sections': { status: 200, body: { sections: [] } },
  }
  answers = Object.fromEntries(Object.entries({ ...base, ...extra }).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]))
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const headers = (init?.headers ?? {}) as Record<string, string>
      calls.push({ method, url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined, csrf: headers['X-CSRF-Token'] ?? '' })
      const queue = answers[`${method} ${url}`] ?? [{ status: 404, body: {} }]
      const reply = queue.length > 1 ? queue.shift()! : queue[0]!
      if (reply.status === 0) throw new TypeError('Failed to fetch')

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

const options: AdminOptions = {
  product: 'host.product',
  never: 'host.never',
  sections: { orders: { title: 'host.orders', parts: [{ key: 'kinds', word: 'host.kinds' }] } },
  carries: [],
}
const hostWords = {
  en: { host: { product: 'acme', never: 'never', orders: 'Orders', kinds: 'Order kinds' } },
  lv: { host: { product: 'acme', never: 'nekad', orders: 'Pasūtījumi', kinds: 'Pasūtījumu veidi' } },
}

async function render(input: { id?: string; locale?: string; pinia?: ReturnType<typeof createPinia> } = {}) {
  const pinia = input.pinia ?? createPinia()
  setActivePinia(pinia)
  const locale = input.locale ?? 'en'
  const session = useAdminSession()
  session.me = {
    subject: 'sub:A',
    signedInAt: new Date().toISOString(),
    name: 'Anna Admin',
    loginMethod: 'webEid',
    loa: 'high',
    tenant: 'W-1',
    sections: {},
    presentation: { displayName: 'Kalns', locale, personLocale: null, deploymentLocale: locale },
    deployment: { mode: 'saas', admin: true, firstRunOwed: false, signInAge: 900 },
  }
  session.order = ['orders']
  session.resolved = true
  const i18n = createI18n({ legacy: false, locale, fallbackLocale: 'en', messages: structuredClone(hostWords) })
  const router = createRouter({ history: createMemoryHistory(), routes: adminRoutes() })
  await router.push(`/deployment/companies/${input.id ?? 'c2'}`)
  await router.isReady()
  const wrapper = mount(CompanyView, { global: { plugins: [pinia, i18n, router, configbyteScreens(i18n, options)] } })
  await settle(wrapper)

  return { wrapper, router, session, pinia }
}

type Shown = Awaited<ReturnType<typeof render>>
type W = Shown['wrapper']
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const button = (wrapper: W, text: string) => wrapper.findAll('button').find((b) => norm(b.text()) === text)!
const reads = (url: string) => calls.filter((c) => c.method === 'GET' && c.url === url).length
const writes = () => calls.filter((c) => c.method !== 'GET')
const box = (wrapper: W, key: string) => wrapper.get(`input[data-tick="${key}"]`)
const checked = (wrapper: W, key: string) => (box(wrapper, key).element as HTMLInputElement).checked
const disabled = (wrapper: W, key: string) => (box(wrapper, key).element as HTMLInputElement).disabled
const note = (wrapper: W, key: string) => norm(wrapper.get(`[data-product="${key}"]`).text())

async function show(wrapper: W) {
  await wrapper.get('[data-act="show-administrators"]').trigger('click')
  await settle(wrapper)
}

beforeEach(() => {
  document.cookie = 'configbyte_csrf=tok-1'
  window.localStorage.clear()
  window.sessionStorage.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('A company › what the page reads', () => {
  it('reads the company, the products and the files’ names for a company nobody has entered, and not its administrators', async () => {
    stub()
    const { wrapper } = await render()
    expect(wrapper.get('h1').text()).toBe('Kalve Ltd')
    expect(reads(C)).toBe(1)
    expect(reads(`${AREA}/products`)).toBe(1)
    expect(reads(`${AREA}/configurations`)).toBe(1)
    expect(reads(`${C}/administrators`)).toBe(0)
  })

  it('reads only the company and the products for a company somebody has entered', async () => {
    stub({ [`GET ${C}`]: { status: 200, body: { company: company({ entered: true }) } } })
    await render()
    expect(reads(C)).toBe(1)
    expect(reads(`${AREA}/products`)).toBe(1)
    expect(reads(`${AREA}/configurations`)).toBe(0)
    expect(reads(`${C}/administrators`)).toBe(0)
  })

  it.each([
    ['says nobody has signed in', { entered: false }, true],
    ['says somebody has', { entered: true }, false],
    ['says nothing of it, as an older register does', {}, false],
  ])('offers a starting configuration only when the company %s', async (_case, member, offers) => {
    const row: Record<string, unknown> = company()
    delete row.entered
    stub({ [`GET ${C}`]: { status: 200, body: { company: { ...row, ...member } } } })
    const { wrapper } = await render()
    const block = wrapper.get('[data-block="starting-configuration"]')
    expect(block.find('[data-act="apply-file"]').exists()).toBe(offers)
    expect(block.find('[data-note="entered"]').exists()).toBe(!offers)
    expect(reads(`${AREA}/configurations`)).toBe(offers ? 1 : 0)
  })

  it('says the day it was opened, and marks the company that runs the deployment, with the same blocks', async () => {
    stub({ [`GET ${C}`]: { status: 200, body: { company: company({ own: true, name: 'Hostings Ltd' }) } } })
    const { wrapper } = await render()
    expect(wrapper.get('header').text()).toContain('opened today')
    expect(wrapper.get('[data-mark="own"]').text()).toBe('runs this deployment')
    for (const block of ['products', 'administrators', 'starting-configuration']) expect(wrapper.find(`[data-block="${block}"]`).exists()).toBe(true)
  })

  it('says there is no such company for an id that is none, with the way back', async () => {
    stub({ [`GET ${AREA}/companies/zzz`]: { status: 404, body: {} } })
    const { wrapper } = await render({ id: 'zzz' })
    expect(wrapper.text()).toContain('There is no such company')
    expect(wrapper.find('[data-block="products"]').exists()).toBe(false)
    expect(wrapper.get('[data-link="companies"]').attributes('href')).toBe('/deployment/companies')
  })

  it.each([
    ['the company', { [`GET ${C}`]: { status: 500, body: {} } }, 'The company could not be read'],
    ['the company, the service not answering', { [`GET ${C}`]: { status: 0, body: {} } }, 'The admin service did not answer'],
  ])('says %s could not be read, with Try again, and never that there is no such company', async (_case, failing, said) => {
    stub(failing)
    const { wrapper } = await render()
    expect(wrapper.get('[data-state="failed"]').text()).toContain(said)
    expect(wrapper.text()).toContain('Try again')
    expect(wrapper.text()).not.toContain('There is no such company')
    expect(writes()).toEqual([])
  })

  it('says the products could not be read in the products’ place, with Try again', async () => {
    stub({ [`GET ${AREA}/products`]: { status: 500, body: {} } })
    const { wrapper } = await render()
    expect(wrapper.get('[data-block="products"]').text()).toContain('The products could not be read')
    expect(wrapper.find('input[data-tick]').exists()).toBe(false)
  })

  it('says where products come from when the deployment offers none', async () => {
    stub({ [`GET ${AREA}/products`]: { status: 200, body: { products: [] } } })
    const { wrapper } = await render()
    expect(wrapper.get('[data-note="no-products"]').text()).toContain('Products come from the services this deployment runs')
  })
})

describe('A company › the products', () => {
  it('draws each box ticked or not as the company has it', async () => {
    stub()
    const { wrapper } = await render()
    expect([checked(wrapper, 'basic'), checked(wrapper, 'extras'), checked(wrapper, 'ledger'), checked(wrapper, 'idle')]).toEqual([true, true, false, false])
  })

  it('says why a box cannot be changed, and frees it once the product it needs is ticked', async () => {
    stub({
      [`GET ${C}`]: [{ status: 200, body: { company: company({ products: [] }) } }, { status: 200, body: { company: company({ products: ['basic'] }) } }],
      [`PUT ${C}/products/basic`]: { status: 200, body: { changed: true } },
    })
    const { wrapper } = await render()
    expect(disabled(wrapper, 'extras')).toBe(true)
    expect(note(wrapper, 'extras')).toContain('Needs Basic. Tick it first.')
    expect(disabled(wrapper, 'basic')).toBe(false)
    expect(note(wrapper, 'idle')).toContain('Its services have not started in this deployment.')
    expect(disabled(wrapper, 'idle')).toBe(true)
    // Ticking the one it needs frees it, and the reason goes.
    await box(wrapper, 'basic').setValue(true)
    await settle(wrapper)
    expect(checked(wrapper, 'basic')).toBe(true)
    expect(disabled(wrapper, 'extras')).toBe(false)
    expect(note(wrapper, 'extras')).not.toContain('Needs')
    expect(disabled(wrapper, 'ledger')).toBe(false)
  })

  it('stops a ticked product being unticked while another ticked one needs it, naming it, and frees it once that one is unticked', async () => {
    stub({
      [`GET ${C}`]: [{ status: 200, body: { company: company() } }, { status: 200, body: { company: company({ products: ['basic'] }) } }],
      [`DELETE ${C}/products/extras`]: { status: 200, body: { changed: true } },
    })
    const { wrapper } = await render()
    expect(disabled(wrapper, 'basic')).toBe(true)
    expect(note(wrapper, 'basic')).toContain('Extras needs it. Untick that first.')
    // The other, which nothing needs, can go.
    expect(disabled(wrapper, 'extras')).toBe(false)
    expect(disabled(wrapper, 'ledger')).toBe(false)
    await box(wrapper, 'extras').setValue(false)
    await settle(wrapper)
    await button(wrapper, 'Take it').trigger('click')
    await settle(wrapper)
    expect(checked(wrapper, 'extras')).toBe(false)
    expect(disabled(wrapper, 'basic')).toBe(false)
    expect(note(wrapper, 'basic')).not.toContain('needs it')
  })

  it('names both products a product needs when neither is ticked, and only the one still missing after one is', async () => {
    const withBoth = [...catalogue(), { key: 'both', displayName: 'Both', offered: true, needs: ['basic', 'extras'] }]
    stub({
      [`GET ${AREA}/products`]: { status: 200, body: { products: withBoth } },
      [`GET ${C}`]: [{ status: 200, body: { company: company({ products: [] }) } }, { status: 200, body: { company: company({ products: ['basic'] }) } }],
      [`PUT ${C}/products/basic`]: { status: 200, body: { changed: true } },
    })
    const { wrapper } = await render()
    expect(note(wrapper, 'both')).toContain('Needs Basic and Extras. Tick them first.')
    await box(wrapper, 'basic').setValue(true)
    await settle(wrapper)
    expect(note(wrapper, 'both')).toContain('Needs Extras. Tick it first.')
    expect(disabled(wrapper, 'both')).toBe(true)
  })

  it('gives a product at once, and reads only the company again', async () => {
    stub({
      [`GET ${C}`]: [{ status: 200, body: { company: company() } }, { status: 200, body: { company: company({ products: ['basic', 'extras', 'ledger'] }) } }],
      [`PUT ${C}/products/ledger`]: { status: 200, body: { changed: true } },
    })
    const { wrapper } = await render()
    await box(wrapper, 'ledger').setValue(true)
    await settle(wrapper)
    expect(writes()).toEqual([{ method: 'PUT', url: `${C}/products/ledger`, body: undefined, csrf: 'tok-1' }])
    expect(reads(C)).toBe(2)
    expect(reads(`${AREA}/products`)).toBe(1)
    expect(reads(`${AREA}/configurations`)).toBe(1)
    expect(checked(wrapper, 'ledger')).toBe(true)
  })

  it('asks first, in place, before taking one, and sends nothing for Keep it', async () => {
    stub()
    const { wrapper } = await render()
    await box(wrapper, 'extras').setValue(false)
    await settle(wrapper)
    expect(wrapper.get('[data-block="products"]').text()).toContain('Take Extras from «Kalve Ltd»?')
    expect(wrapper.get('[data-block="products"]').text()).toContain('Its people can no longer use it.')
    expect(checked(wrapper, 'extras')).toBe(true)
    await button(wrapper, 'Keep it').trigger('click')
    await settle(wrapper)
    expect(writes()).toEqual([])
    expect(wrapper.get('[data-block="products"]').text()).not.toContain('Take Extras')
    expect(checked(wrapper, 'extras')).toBe(true)
  })

  it('takes a product on Take it, and reads only the company again', async () => {
    stub({
      [`GET ${C}`]: [{ status: 200, body: { company: company() } }, { status: 200, body: { company: company({ products: ['basic'] }) } }],
      [`DELETE ${C}/products/extras`]: { status: 200, body: { changed: true } },
    })
    const { wrapper } = await render()
    await box(wrapper, 'extras').setValue(false)
    await settle(wrapper)
    await button(wrapper, 'Take it').trigger('click')
    await settle(wrapper)
    expect(writes()).toEqual([{ method: 'DELETE', url: `${C}/products/extras`, body: undefined, csrf: 'tok-1' }])
    expect(reads(C)).toBe(2)
    expect(reads(`${AREA}/products`)).toBe(1)
    expect(checked(wrapper, 'extras')).toBe(false)
  })

  it('says the reason worked out from the products read again when a tick is refused although the guard allowed it, and leaves the tick as it was', async () => {
    const changed = catalogue().map((p) => (p.key === 'ledger' ? { ...p, needs: ['basic', 'extras'] } : p))
    stub({
      [`GET ${C}`]: { status: 200, body: { company: company({ products: ['basic'] }) } },
      [`GET ${AREA}/products`]: [{ status: 200, body: { products: catalogue() } }, { status: 200, body: { products: changed } }],
      [`PUT ${C}/products/ledger`]: { status: 409, body: { code: 'err:membership:conflict', detail: 'the register’s own sentence' } },
    })
    const { wrapper } = await render()
    await box(wrapper, 'ledger').setValue(true)
    await settle(wrapper)
    expect(wrapper.get('[data-line="said"]').text()).toBe('Ledger was not given: it needs Extras.')
    expect(wrapper.text()).not.toContain('the register’s own sentence')
    expect(reads(`${AREA}/products`)).toBe(2)
    expect(checked(wrapper, 'ledger')).toBe(false)
  })

  it('says a product that is needed when an untick is refused, with the one that needs it', async () => {
    const changed = catalogue().map((p) => (p.key === 'ledger' ? { ...p, needs: ['extras'] } : p))
    stub({
      [`GET ${C}`]: { status: 200, body: { company: company({ products: ['basic', 'extras', 'ledger'] }) } },
      [`GET ${AREA}/products`]: [{ status: 200, body: { products: catalogue() } }, { status: 200, body: { products: changed } }],
      [`DELETE ${C}/products/extras`]: { status: 409, body: { code: 'err:membership:conflict' } },
    })
    const { wrapper } = await render()
    await box(wrapper, 'extras').setValue(false)
    await settle(wrapper)
    await button(wrapper, 'Take it').trigger('click')
    await settle(wrapper)
    expect(wrapper.get('[data-line="said"]').text()).toBe('Extras was not taken: Ledger needs it.')
    expect(checked(wrapper, 'extras')).toBe(true)
  })

  it('reads the page again when a tick answers that the company or product is not there', async () => {
    stub({ [`PUT ${C}/products/ledger`]: { status: 404, body: {} } })
    const { wrapper } = await render()
    await box(wrapper, 'ledger').setValue(true)
    await settle(wrapper)
    expect(reads(C)).toBe(2)
    expect(reads(`${AREA}/products`)).toBe(2)
  })

  it('says the service did not answer, and leaves the tick as it was', async () => {
    stub({ [`PUT ${C}/products/ledger`]: { status: 0, body: {} } })
    const { wrapper } = await render()
    await box(wrapper, 'ledger').setValue(true)
    await settle(wrapper)
    expect(wrapper.get('[data-line="said"]').text()).toContain('The admin service did not answer')
    expect(checked(wrapper, 'ledger')).toBe(false)
  })
})

describe('A company › its administrators', () => {
  it('says how many there are without reading any person, with the press and the line that showing is recorded', async () => {
    stub()
    const { wrapper } = await render()
    expect(wrapper.get('[data-count="administrators"]').text()).toBe('2')
    expect(wrapper.find('[data-list="administrators"]').exists()).toBe(false)
    expect(wrapper.get('[data-block="administrators"] [data-note="recorded"]').text()).toBe('Showing them is recorded by the access audit service.')
    expect(reads(`${C}/administrators`)).toBe(0)
  })

  it('reads them once on the press and says each one’s standing, keeping the line that it is recorded beside them', async () => {
    stub()
    const { wrapper } = await render()
    await show(wrapper)
    expect(reads(`${C}/administrators`)).toBe(1)
    const list = wrapper.findAll('[data-list="administrators"] > li')
    expect(list.map((r) => r.find('b').text())).toEqual(['Ilze Bērziņa', 'Jānis Krūmiņš'])
    expect(norm(list[0]!.text())).toContain('last signed in today')
    expect(norm(list[1]!.text())).toContain('invited, not signed in yet')
    expect(wrapper.find('[data-block="administrators"] [data-note="recorded"]').exists()).toBe(true)
  })

  it('hides the names again, unread, when the page is left and opened again', async () => {
    stub()
    const first = await render()
    await show(first.wrapper)
    expect(first.wrapper.find('[data-list="administrators"]').exists()).toBe(true)
    first.wrapper.unmount()
    expect(useDeployment(first.pinia).administrators).toEqual([])
    const again = await render({ pinia: first.pinia })
    expect(again.wrapper.find('[data-list="administrators"]').exists()).toBe(false)
    expect(again.wrapper.text()).not.toContain('Ilze Bērziņa')
    expect(reads(`${C}/administrators`)).toBe(1)
  })

  it('says the list was not shown, because showing it could not be recorded, with Try again and no name', async () => {
    stub({ [`GET ${C}/administrators`]: [{ status: 503, body: { code: 'err:membership:audit_unavailable' } }, { status: 200, body: { administrators: admins() } }] })
    const { wrapper } = await render()
    await show(wrapper)
    const band = wrapper.get('[data-band="unrecorded"]')
    expect(band.text()).toContain('The list was not shown')
    expect(band.text()).toContain('Showing it could not be recorded')
    expect(wrapper.text()).not.toContain('Ilze Bērziņa')
    await band.get('button').trigger('click')
    await settle(wrapper)
    expect(wrapper.text()).toContain('Ilze Bērziņa')
    expect(reads(`${C}/administrators`)).toBe(2)
  })

  it('does not take any other failure to read them for a list that was not recorded', async () => {
    stub({ [`GET ${C}/administrators`]: { status: 500, body: {} } })
    const { wrapper } = await render()
    await show(wrapper)
    expect(wrapper.find('[data-band="unrecorded"]').exists()).toBe(false)
    expect(wrapper.get('[data-state="administrators-failed"]').text()).toContain('could not be read')
  })

  it('invites one by a name and a personal code, reads the list and the count again, and keeps the code nowhere', async () => {
    stub({
      [`GET ${C}`]: [{ status: 200, body: { company: company() } }, { status: 200, body: { company: company({ administrators: 3 }) } }],
      [`POST ${C}/administrators`]: { status: 201, body: {} },
    })
    const { wrapper, pinia } = await render()
    await show(wrapper)
    await wrapper.get('[data-act="invite-open"]').trigger('click')
    await settle(wrapper)
    await wrapper.get('#company-invite-name').setValue('Ilmārs Tests')
    await wrapper.get('#company-invite-code').setValue(shownCode)
    await wrapper.get('[data-act="invite"]').trigger('click')
    await settle(wrapper)
    expect(writes()).toEqual([{ method: 'POST', url: `${C}/administrators`, body: { displayName: 'Ilmārs Tests', identityCode: shownCode, country: 'LV' }, csrf: 'tok-1' }])
    // The names are not read again by themselves: the list closes, the company is read again, and the press shows them.
    expect(reads(`${C}/administrators`)).toBe(1)
    expect(wrapper.find('[data-list="administrators"]').exists()).toBe(false)
    expect(reads(C)).toBe(2)
    expect(wrapper.get('[data-count="administrators"]').text()).toBe('3')
    expect(wrapper.get('[data-line="said"]').text()).toBe('Invited. They become an administrator at their first sign-in.')
    expect(wrapper.find('[data-block="invite"]').exists()).toBe(false)
    // What was typed is in no store, no storage and no element.
    const everything = JSON.stringify(useDeployment(pinia).$state) + JSON.stringify({ ...window.localStorage }) + JSON.stringify({ ...window.sessionStorage }) + wrapper.html()
    expect(everything).not.toContain('Ilmārs Tests')
    expect(everything).not.toContain(digits)
    await show(wrapper)
    expect(reads(`${C}/administrators`)).toBe(2)
  })

  it.each([
    ['without a name', '', shownCode, 'A name is needed.'],
    ['without a personal code', 'Ilmārs Tests', '', 'A personal code is needed.'],
    ['with a code that cannot be used', 'Ilmārs Tests', '1234', 'a personal code has 11 digits'],
  ])('does not send an invitation %s', async (_case, name, code, said) => {
    stub()
    const { wrapper } = await render()
    await show(wrapper)
    await wrapper.get('[data-act="invite-open"]').trigger('click')
    await settle(wrapper)
    await wrapper.get('#company-invite-name').setValue(name)
    await wrapper.get('#company-invite-code').setValue(code)
    await wrapper.get('[data-act="invite"]').trigger('click')
    await settle(wrapper)
    expect(wrapper.get('[data-note="invite-problem"]').text()).toContain(said)
    expect(writes()).toEqual([])
  })

  it.each([
    [422, 'That name or personal code was not accepted. Check them and try again.'],
    [409, 'The person was not invited. They may already be an administrator of this company, or have lost access to it.'],
    [500, 'The person was not invited. Try again.'],
  ])('says an invitation refused with %s in the screens’ own words, and keeps the form', async (status, said) => {
    stub({ [`POST ${C}/administrators`]: { status, body: { code: 'err:membership:conflict', detail: 'the register’s own sentence' } } })
    const { wrapper } = await render()
    await show(wrapper)
    await wrapper.get('[data-act="invite-open"]').trigger('click')
    await settle(wrapper)
    await wrapper.get('#company-invite-name').setValue('Ilmārs Tests')
    await wrapper.get('#company-invite-code').setValue(shownCode)
    await wrapper.get('[data-act="invite"]').trigger('click')
    await settle(wrapper)
    expect(wrapper.get('[data-line="said"]').text()).toBe(said)
    expect(wrapper.text()).not.toContain('the register’s own sentence')
    expect((wrapper.get('#company-invite-name').element as HTMLInputElement).value).toBe('Ilmārs Tests')
    expect(reads(`${C}/administrators`)).toBe(1)
  })

  it('asks first, in place, before removing one, and sends nothing for Keep', async () => {
    stub()
    const { wrapper } = await render()
    await show(wrapper)
    await wrapper.get('[data-act="remove-u1"]').trigger('click')
    await settle(wrapper)
    expect(wrapper.get('[data-administrator="u1"]').text()).toContain('Remove Ilze Bērziņa as an administrator of «Kalve Ltd»?')
    expect(wrapper.get('[data-administrator="u1"]').text()).toContain('Ilze Bērziņa stays one of the company’s people.')
    await button(wrapper, 'Keep').trigger('click')
    await settle(wrapper)
    expect(writes()).toEqual([])
    expect(wrapper.text()).not.toContain('Remove Ilze Bērziņa as an administrator')
  })

  it('removes one on Remove and reads the list and the count again', async () => {
    stub({
      [`GET ${C}`]: [{ status: 200, body: { company: company() } }, { status: 200, body: { company: company({ administrators: 1 }) } }],
      [`GET ${C}/administrators`]: [{ status: 200, body: { administrators: admins() } }, { status: 200, body: { administrators: [admins()[1]] } }],
      [`DELETE ${C}/administrators/u1`]: { status: 200, body: { changed: true } },
    })
    const { wrapper } = await render()
    await show(wrapper)
    await wrapper.get('[data-act="remove-u1"]').trigger('click')
    await settle(wrapper)
    await button(wrapper, 'Remove').trigger('click')
    await settle(wrapper)
    expect(writes()).toEqual([{ method: 'DELETE', url: `${C}/administrators/u1`, body: undefined, csrf: 'tok-1' }])
    expect(reads(`${C}/administrators`)).toBe(1)
    expect(wrapper.find('[data-list="administrators"]').exists()).toBe(false)
    expect(wrapper.get('[data-count="administrators"]').text()).toBe('1')
    await show(wrapper)
    expect(wrapper.findAll('[data-list="administrators"] > li')).toHaveLength(1)
  })

  it('switches the button off for the only administrator, with the reason under it, and on for both when there are two', async () => {
    stub({ [`GET ${C}/administrators`]: { status: 200, body: { administrators: [admins()[0]] } } })
    const one = await render()
    await show(one.wrapper)
    expect((one.wrapper.get('[data-act="remove-u1"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(one.wrapper.get('[data-note="last-administrator"]').text()).toBe('A company keeps at least one administrator. Invite another first.')
    one.wrapper.unmount()

    stub()
    const two = await render()
    await show(two.wrapper)
    expect((two.wrapper.get('[data-act="remove-u1"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((two.wrapper.get('[data-act="remove-u2"]').element as HTMLButtonElement).disabled).toBe(false)
    expect(two.wrapper.find('[data-note="last-administrator"]').exists()).toBe(false)
  })

  it('says the same reason as a line when a removal is refused although two were drawn, and reads the list again', async () => {
    stub({
      [`GET ${C}/administrators`]: [{ status: 200, body: { administrators: admins() } }, { status: 200, body: { administrators: [admins()[0]] } }],
      [`DELETE ${C}/administrators/u1`]: { status: 409, body: { code: 'err:membership:conflict', detail: 'the register’s own sentence' } },
    })
    const { wrapper } = await render()
    await show(wrapper)
    await wrapper.get('[data-act="remove-u1"]').trigger('click')
    await settle(wrapper)
    await button(wrapper, 'Remove').trigger('click')
    await settle(wrapper)
    expect(wrapper.get('[data-line="said"]').text()).toBe('A company keeps at least one administrator. Invite another first.')
    expect(wrapper.text()).not.toContain('the register’s own sentence')
    // The names close again, to be shown by a press.
    expect(reads(`${C}/administrators`)).toBe(1)
    expect(wrapper.find('[data-list="administrators"]').exists()).toBe(false)
  })
})

describe('A company › its starting configuration', () => {
  const answerOf = (outcome: string, sections: Record<string, unknown> = {}) => ({ status: 200, body: { configuration: { name: 'metal-fabrication', outcome, sections } } })

  it('offers a choice of the prepared files and Apply this file while nobody of the company has signed in', async () => {
    stub()
    const { wrapper } = await render()
    const block = wrapper.get('[data-block="starting-configuration"]')
    expect(block.findAll('option').map((o) => o.text())).toEqual(['metal-fabrication', 'office-work'])
    expect(block.get('[data-act="apply-file"]').text()).toBe('Apply this file')
    expect(block.get('[data-note="only-until"]').text()).toBe('Possible only until somebody of «Kalve Ltd» signs in.')
  })

  it('says where the files come from when none is prepared, and offers no control', async () => {
    stub({ [`GET ${AREA}/configurations`]: { status: 200, body: { configurations: [] } } })
    const { wrapper } = await render()
    const block = wrapper.get('[data-block="starting-configuration"]')
    expect(block.get('[data-note="no-files"]').text()).toContain('Whoever runs it keeps them as files in a folder the admin service reads')
    expect(block.find('select, button').exists()).toBe(false)
  })

  it('says the files could not be read, with Try again, when they could not be', async () => {
    stub({ [`GET ${AREA}/configurations`]: [{ status: 500, body: {} }, { status: 200, body: files }] })
    const { wrapper } = await render()
    const block = wrapper.get('[data-block="starting-configuration"]')
    expect(block.text()).toContain('The starting files could not be read')
    await block.get('button').trigger('click')
    await settle(wrapper)
    expect(wrapper.get('[data-block="starting-configuration"]').findAll('option')).toHaveLength(2)
  })

  it('says the configuration is the company’s own once somebody has signed in, with no control and no file read', async () => {
    stub({ [`GET ${C}`]: { status: 200, body: { company: company({ entered: true }) } } })
    const { wrapper } = await render()
    const block = wrapper.get('[data-block="starting-configuration"]')
    expect(block.get('[data-note="entered"]').text()).toContain('Somebody of «Kalve Ltd» has signed in, so its configuration is theirs now.')
    expect(block.find('select, button').exists()).toBe(false)
    expect(reads(`${AREA}/configurations`)).toBe(0)
  })

  it('sends the file chosen, and draws the band with one line a part when the whole file is in force', async () => {
    stub({
      [`POST ${C}/configuration`]: answerOf('applied', {
        orders: { status: 'applied', report: { kinds: [{ key: 'a', status: 'added' }, { key: 'b', status: 'added' }] } },
      }),
    })
    const { wrapper } = await render()
    await wrapper.get('[data-block="starting-configuration"] select').setValue('office-work')
    await wrapper.get('[data-act="apply-file"]').trigger('click')
    await settle(wrapper)
    expect(writes()).toEqual([{ method: 'POST', url: `${C}/configuration`, body: { startsFrom: 'office-work' }, csrf: 'tok-1' }])
    const band = wrapper.get('[data-block="configuration"]')
    expect(band.attributes('data-outcome')).toBe('applied')
    expect(band.text()).toContain('«metal-fabrication» is applied to «Kalve Ltd».')
    expect(band.get('[data-part="orders"]').text()).toContain('Orders')
    expect(band.get('[data-part="orders"]').text()).toContain('2 changes made')
    expect(reads(C)).toBe(2)
    expect(wrapper.get('[data-note="again"]').text()).toContain('The same file a second time is refused')
  })

  it('never reads a 200 as a success: a refused file is a band of its own, its refused part and the parts held back in words', async () => {
    stub({
      [`POST ${C}/configuration`]: answerOf('refused', {
        orders: { status: 'refused', detail: 'raw sentence of the service', problem: { title: 'raw title of the service' } },
        stock: { status: 'withheld' },
      }),
    })
    const { wrapper } = await render()
    await wrapper.get('[data-act="apply-file"]').trigger('click')
    await settle(wrapper)
    const band = wrapper.get('[data-block="configuration"]')
    expect(band.attributes('data-outcome')).toBe('refused')
    expect(band.attributes('data-band')).toBe('warn')
    expect(band.text()).toContain('«metal-fabrication» was not applied to «Kalve Ltd».')
    expect(band.text()).toContain('one part refused, so the rest was withheld')
    expect(band.get('[data-part="orders"]').text()).toContain('refused')
    expect(band.get('[data-part="stock"]').text()).toContain('withheld')
    expect(band.text()).not.toContain('raw sentence of the service')
    expect(band.text()).not.toContain('raw title of the service')
  })

  it('draws the screens’ own words for a part its owner refused with a 4xx, never the owner’s title or detail', async () => {
    stub({
      [`POST ${C}/configuration`]: answerOf('refused', {
        orders: { status: 'failed', detail: 'OWNER SECTION DETAIL', problem: { status: 422, title: 'OWNER TITLE', detail: 'OWNER DETAIL', code: 'err:owner:thing' } },
      }),
    })
    const { wrapper } = await render()
    await wrapper.get('[data-act="apply-file"]').trigger('click')
    await settle(wrapper)
    const band = wrapper.get('[data-block="configuration"]')
    expect(band.get('[data-part="orders"]').text()).toContain('its service refused this part. Nothing of it was written.')
    for (const text of ['OWNER TITLE', 'OWNER DETAIL', 'OWNER SECTION DETAIL', 'err:owner:thing']) expect(wrapper.text()).not.toContain(text)
  })

  it.each([
    ['failed', 'could not be applied'],
    ['rolledBack', 'it was written, then taken back'],
    ['partial', 'is only partly applied'],
  ])('draws the band of an outcome of %s, with lines only where the answer has parts', async (outcome, said) => {
    stub({ [`POST ${C}/configuration`]: answerOf(outcome) })
    const { wrapper } = await render()
    await wrapper.get('[data-act="apply-file"]').trigger('click')
    await settle(wrapper)
    const band = wrapper.get('[data-block="configuration"]')
    expect(band.attributes('data-outcome')).toBe(outcome)
    expect(band.text()).toContain(said)
    expect(band.find('[data-lines]').exists()).toBe(false)
  })

  it('reads the company again when somebody signed in meanwhile, and the block turns to the sentence that it is theirs', async () => {
    stub({
      [`GET ${C}`]: [{ status: 200, body: { company: company() } }, { status: 200, body: { company: company({ entered: true }) } }],
      [`POST ${C}/configuration`]: { status: 409, body: { code: 'err:membership:conflict', detail: 'the register’s own sentence' } },
    })
    const { wrapper } = await render()
    await wrapper.get('[data-act="apply-file"]').trigger('click')
    await settle(wrapper)
    expect(reads(C)).toBe(2)
    expect(wrapper.find('[data-block="starting-configuration"] [data-note="entered"]').exists()).toBe(true)
    expect(wrapper.find('[data-block="starting-configuration"] select').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('the register’s own sentence')
  })

  it.each([
    [404, 'err:configbyte:unknownConfiguration', '«metal-fabrication» is not a file this deployment keeps any more, so nothing was applied.'],
    [422, 'err:configbyte:badConfiguration', 'is not a configuration this deployment can read'],
  ])('says a file the area cannot use with %s, naming it, and draws no band', async (status, code, said) => {
    stub({ [`POST ${C}/configuration`]: { status, body: { code, detail: 'the service’s own words' } } })
    const { wrapper } = await render()
    await wrapper.get('[data-act="apply-file"]').trigger('click')
    await settle(wrapper)
    expect(wrapper.get('[data-line="said"]').text()).toContain(said)
    expect(wrapper.get('[data-line="said"]').text()).not.toContain('the service’s own words')
    expect(wrapper.find('[data-block="configuration"]').exists()).toBe(false)
  })

  it('turns an answer it cannot read into a failed outcome, never a success', async () => {
    stub({ [`POST ${C}/configuration`]: { status: 200, body: { unexpected: true } } })
    const { wrapper } = await render()
    await wrapper.get('[data-act="apply-file"]').trigger('click')
    await settle(wrapper)
    expect(wrapper.get('[data-block="configuration"]').attributes('data-outcome')).toBe('failed')
  })
})

describe('A company › the refusals of the area', () => {
  it('puts a line over the page, leaving it as it is, when a sign-in is too old in the middle of an act', async () => {
    stub({ [`PUT ${C}/products/ledger`]: { status: 403, body: { code: 'err:session:signInTooOld' } } })
    const { wrapper } = await render()
    await box(wrapper, 'ledger').setValue(true)
    await settle(wrapper)
    expect(wrapper.get('[data-refusal="tooOld"]').text()).toContain('no older than 15 minutes')
    // The page is as it was, nothing was sent again by itself, and no company is dropped.
    expect(wrapper.get('h1').text()).toBe('Kalve Ltd')
    expect(checked(wrapper, 'ledger')).toBe(false)
    expect(writes()).toHaveLength(1)
  })

  it('keeps an invitation’s form as it was when a sign-in is too old', async () => {
    stub({ [`POST ${C}/administrators`]: { status: 403, body: { code: 'err:session:signInTooOld' } } })
    const { wrapper } = await render()
    await show(wrapper)
    await wrapper.get('[data-act="invite-open"]').trigger('click')
    await settle(wrapper)
    await wrapper.get('#company-invite-name').setValue('Ilmārs Tests')
    await wrapper.get('#company-invite-code').setValue(shownCode)
    await wrapper.get('[data-act="invite"]').trigger('click')
    await settle(wrapper)
    expect(wrapper.find('[data-refusal="tooOld"]').exists()).toBe(true)
    expect((wrapper.get('#company-invite-name').element as HTMLInputElement).value).toBe('Ilmārs Tests')
    expect((wrapper.get('#company-invite-code').element as HTMLInputElement).value).not.toBe('')
    expect(writes()).toHaveLength(1)
  })

  it('says a sign-in too old in the page’s place when the page could not even be read', async () => {
    stub({ [`GET ${C}`]: { status: 403, body: { code: 'err:session:signInTooOld' } } })
    const { wrapper } = await render()
    expect(wrapper.find('[data-refusal="tooOld"]').exists()).toBe(true)
    expect(wrapper.find('[data-block="products"]').exists()).toBe(false)
  })

  it('leads a sign-in that is not strong enough to the closing page the app has', async () => {
    stub({ [`PUT ${C}/products/ledger`]: { status: 403, body: { code: 'err:session:assuranceTooLow' } } })
    const { wrapper, session } = await render()
    await box(wrapper, 'ledger').setValue(true)
    await settle(wrapper)
    expect(session.closed).toBe('assurance')
  })

  it('drops the page and says the person is no longer a deployment admin, reading the menu again, on any other refusal', async () => {
    stub({
      [`PUT ${C}/products/ledger`]: { status: 403, body: { code: 'err:request:forbidden', detail: 'the service’s own words' } },
      'GET /api/configbyte/v1/me': { status: 200, body: { ...useAdminSessionBody(), deployment: { mode: 'saas', admin: false, firstRunOwed: false, signInAge: 900 } } },
      'GET /api/configbyte/v1/sections': { status: 200, body: { sections: [] } },
    })
    const { wrapper, session } = await render()
    await box(wrapper, 'ledger').setValue(true)
    await settle(wrapper)
    expect(wrapper.get('[data-refusal="noLonger"]').text()).toContain('You are no longer a deployment admin')
    expect(wrapper.text()).not.toContain('the service’s own words')
    expect(wrapper.find('[data-block="products"]').exists()).toBe(false)
    expect(wrapper.find('[data-block="administrators"]').exists()).toBe(false)
    expect(calls.some((c) => c.url === '/api/configbyte/v1/me')).toBe(true)
    expect(session.managesDeployment).toBe(false)
  })

  it('takes the invitation’s form away with the page when the area refuses the person, so nothing typed in it stays in memory', async () => {
    stub({ [`POST ${C}/administrators`]: { status: 403, body: { code: 'err:request:forbidden' } } })
    const { wrapper } = await render()
    await show(wrapper)
    await wrapper.get('[data-act="invite-open"]').trigger('click')
    await settle(wrapper)
    await wrapper.get('#company-invite-name').setValue('Ilmārs Tests')
    await wrapper.get('#company-invite-code').setValue(shownCode)
    await wrapper.get('[data-act="invite"]').trigger('click')
    await settle(wrapper)
    expect(wrapper.find('[data-refusal]').exists()).toBe(true)
    expect(wrapper.findComponent(InviteAdministrator).exists()).toBe(false)
    expect(wrapper.html()).not.toContain('Ilmārs Tests')
    expect(wrapper.html()).not.toContain(digits)
  })

  it('ignores an answer that arrives after the page was left', async () => {
    let release: () => void = () => {}
    const wait = new Promise<void>((resolve) => {
      release = resolve
    })
    stub()
    const real = globalThis.fetch
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url === `${C}/administrators`) await wait

      return real(url, init)
    })
    const { wrapper, pinia } = await render()
    await wrapper.get('[data-act="show-administrators"]').trigger('click')
    wrapper.unmount()
    release()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(useDeployment(pinia).administrators).toEqual([])
    expect(useDeployment(pinia).administratorsState).toBe('hidden')
  })
})

/** The sign-in answer the stand-in coordinator gives when the menu is read again. */
function useAdminSessionBody() {
  return {
    subject: 'sub:A',
    name: 'Anna Admin',
    loginMethod: 'webEid',
    loa: 'high',
    tenant: 'W-1',
    sections: {},
    presentation: { displayName: 'Kalns', locale: 'en', personLocale: null, deploymentLocale: 'en' },
  }
}

describe('A company › in Latvian', () => {
  it('says the page, its blocks and the guard in Latvian', async () => {
    stub({ [`GET ${C}`]: { status: 200, body: { company: company({ products: [] }) } } })
    const { wrapper } = await render({ locale: 'lv' })
    expect(wrapper.get('[data-block="products"]').text()).toContain('Produkti')
    expect(note(wrapper, 'extras')).toContain('Vajadzīgs Basic. Vispirms atzīmējiet to.')
    expect(wrapper.get('[data-block="administrators"]').text()).toContain('Parādīt administratorus')
    expect(wrapper.get('[data-block="starting-configuration"]').text()).toContain('Piemērot šo failu')
  })
})
