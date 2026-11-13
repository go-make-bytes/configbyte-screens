// Companies against a stand-in coordinator: what is read when it opens, what each row
// says, finding and paging in the browser, the failed states that never say "no
// companies", and the refusals of the area drawn in the page's place.
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import type { AdminOptions } from '../../options'
import { configbyteScreens } from '../../plugin'
import { adminRoutes } from '../../routes'
import { useAdminSession } from '../../stores/session'
import CompaniesView from './CompaniesView.vue'

type Reply = { status: number; body: unknown; held?: Promise<unknown> }
interface Call {
  method: string
  url: string
}

const AREA = '/api/configbyte/v1/deployment'

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

const company = (over: Record<string, unknown>) => ({
  id: 'c0',
  name: 'Company',
  status: 'active',
  createdAt: day(5),
  own: false,
  products: [],
  administrators: 1,
  entered: true,
  ...over,
})

const products = [
  { key: 'basic', displayName: 'Basic', offered: true, needs: [] },
  { key: 'extras', displayName: 'Extras', offered: true, needs: ['basic'] },
]

const nine = () => [
  company({ id: 'c1', name: 'Hostings Ltd', own: true, products: ['basic'], administrators: 2, createdAt: day(9) }),
  company({ id: 'c2', name: 'Metāla Darbi Ltd', products: ['basic', 'extras'], administrators: 2, createdAt: day(8) }),
  company({ id: 'c3', name: 'Būvnieks Plus Ltd', products: ['basic'], createdAt: day(7) }),
  company({ id: 'c4', name: 'Ziemeļu Tērauds Ltd', products: ['basic', 'extras'], administrators: 3, createdAt: day(6) }),
  company({ id: 'c5', name: 'Līnija Ltd', products: ['basic'], createdAt: day(5) }),
  company({ id: 'c6', name: 'Daugavas Loģistika Ltd', products: ['basic'], administrators: 2, createdAt: day(4) }),
  company({ id: 'c7', name: 'Rīgas Metināšana Ltd', products: ['basic'], createdAt: day(3) }),
  company({ id: 'c8', name: 'Kokapstrāde Ltd', products: [], createdAt: day(1) }),
  company({ id: 'c9', name: 'Kalve Ltd', products: ['basic'], createdAt: day(0) }),
]

let calls: Call[] = []
let answers: Record<string, Reply[]> = {}

function stub(extra: Record<string, Reply | Reply[]> = {}, companies: unknown[] = nine()) {
  calls = []
  const base: Record<string, Reply | Reply[]> = {
    [`GET ${AREA}/companies`]: { status: 200, body: { companies } },
    [`GET ${AREA}/products`]: { status: 200, body: { products } },
  }
  answers = Object.fromEntries(Object.entries({ ...base, ...extra }).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]))
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({ method, url })
      const queue = answers[`${method} ${url}`] ?? [{ status: 404, body: {} }]
      const reply = queue.length > 1 ? queue.shift()! : queue[0]!
      if (reply.held) await reply.held
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

const options: AdminOptions = { product: 'host.product', never: 'host.never', sections: {}, carries: [] }
const hostWords = { en: { host: { product: 'acme', never: 'never' } }, lv: { host: { product: 'acme', never: 'nekad' } } }

async function render(locale = 'en') {
  const pinia = createPinia()
  setActivePinia(pinia)
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
  session.resolved = true
  const i18n = createI18n({ legacy: false, locale, fallbackLocale: 'en', messages: structuredClone(hostWords) })
  const router = createRouter({ history: createMemoryHistory(), routes: adminRoutes() })
  await router.push('/deployment/companies')
  await router.isReady()
  const wrapper = mount(CompaniesView, { global: { plugins: [pinia, i18n, router, configbyteScreens(i18n, options)] } })
  await settle(wrapper)

  return { wrapper, router, session }
}

type W = Awaited<ReturnType<typeof render>>['wrapper']
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const rows = (wrapper: W, label = 'Companies') => wrapper.findAll(`ul[aria-label="${label}"] > li`)
/** The page behind an address is loaded the first time it is opened, which can take a moment. */
const arrives = (router: { currentRoute: { value: { path: string } } }, path: string) =>
  vi.waitFor(() => expect(router.currentRoute.value.path).toBe(path), { timeout: 8000 })
const reads = (part: string) => calls.filter((c) => c.method === 'GET' && c.url === `${AREA}/${part}`).length

beforeEach(() => {
  document.cookie = 'configbyte_csrf=tok-1'
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Companies › the list', () => {
  it('reads the companies and the products once each, and says each row’s name, mark, products, administrators and day, in the service’s order', async () => {
    stub()
    const { wrapper } = await render()
    expect(reads('companies')).toBe(1)
    expect(reads('products')).toBe(1)
    expect(wrapper.get('h1').text()).toBe('Companies')
    expect(norm(wrapper.get('header').text())).toContain('9 companies on this deployment')
    const list = rows(wrapper)
    expect(list).toHaveLength(9)
    expect(list.map((r) => r.find('b').text())).toEqual(nine().map((c) => c.name))
    const own = list[0]!
    expect(own.text()).toContain('runs this deployment')
    expect(list.slice(1).some((r) => r.text().includes('runs this deployment'))).toBe(false)
    expect(norm(list[1]!.text())).toContain('Basic')
    expect(norm(list[1]!.text())).toContain('Extras')
    expect(norm(list[1]!.text())).toContain('2 administrators')
    expect(norm(list[2]!.text())).toContain('1 administrator')
    expect(list[8]!.text()).toContain('today')
    expect(list[7]!.text()).toContain('yesterday')
  })

  it('says "no product yet" in the row of a company with none', async () => {
    stub()
    const { wrapper } = await render()
    expect(rows(wrapper)[7]!.find('[data-note="no-product"]').text()).toBe('no product yet')
    expect(rows(wrapper)[0]!.find('[data-note="no-product"]').exists()).toBe(false)
  })

  it('opens the company’s address when a row is pressed, and offers no act in a row', async () => {
    stub()
    const { wrapper, router } = await render()
    expect(rows(wrapper)[1]!.find('a').attributes('href')).toBe('/deployment/companies/c2')
    expect(rows(wrapper).every((r) => r.findAll('button, input').length === 0)).toBe(true)
    await rows(wrapper)[1]!.get('a').trigger('click')
    await arrives(router, '/deployment/companies/c2')
  })

  it('offers to open a company only once the list is ready: not while it is read, and not when it failed', async () => {
    let release: () => void = () => {}
    const wait = new Promise<void>((resolve) => {
      release = resolve
    })
    stub({ [`GET ${AREA}/companies`]: { status: 200, body: { companies: nine() }, held: wait } })
    const pending = await render()
    expect(pending.wrapper.find('[data-act="open-company"]').exists()).toBe(false)
    release()
    await settle(pending.wrapper)
    expect(pending.wrapper.find('[data-act="open-company"]').exists()).toBe(true)
    pending.wrapper.unmount()

    stub({ [`GET ${AREA}/companies`]: { status: 500, body: {} } })
    const failed = await render()
    expect(failed.wrapper.find('[data-act="open-company"]').exists()).toBe(false)
  })

  it('offers to open a company from the page’s head', async () => {
    stub()
    const { wrapper, router } = await render()
    await wrapper.get('[data-act="open-company"]').trigger('click')
    await arrives(router, '/deployment/companies/new')
  })
})

describe('Companies › a name a row has but the products’ read lacks', () => {
  it('draws no key, and reads the products once more', async () => {
    stub(
      {
        [`GET ${AREA}/products`]: [
          { status: 200, body: { products: [products[0]] } },
          { status: 200, body: { products: [products[0]] } },
        ],
      },
      [company({ id: 'c1', name: 'Hostings Ltd', own: true }), company({ id: 'c2', name: 'Kalve Ltd', products: ['basic', 'extras', 'unheard'] })],
    )
    const { wrapper } = await render()
    expect(reads('products')).toBe(2)
    const text = norm(rows(wrapper)[1]!.text())
    expect(text).toContain('Basic')
    expect(text).not.toContain('extras')
    expect(text).not.toContain('unheard')
  })

  it('reads the products once more, and no more, when the second read holds the product', async () => {
    stub(
      {
        [`GET ${AREA}/products`]: [
          { status: 200, body: { products: [products[0]] } },
          { status: 200, body: { products } },
        ],
      },
      [company({ id: 'c1', name: 'Hostings Ltd', own: true }), company({ id: 'c2', name: 'Kalve Ltd', products: ['basic', 'extras'] })],
    )
    const { wrapper } = await render()
    expect(reads('products')).toBe(2)
    expect(norm(rows(wrapper)[1]!.text())).toContain('Extras')
  })
})

describe('Companies › only the deployment’s own company', () => {
  it('says there is no customer company yet, with the way to open one, and offers no search', async () => {
    stub({}, [company({ id: 'c1', name: 'Hostings Ltd', own: true, products: ['basic'] })])
    const { wrapper, router } = await render()
    expect(wrapper.find('[data-filter="find"]').exists()).toBe(false)
    const block = wrapper.get('[data-block="no-customer"]')
    expect(block.text()).toContain('No customer company yet')
    await block.get('[data-link="open-company"]').trigger('click')
    await arrives(router, '/deployment/companies/new')
  })

  it('does not say it once a customer company is here', async () => {
    stub()
    const { wrapper } = await render()
    expect(wrapper.find('[data-block="no-customer"]').exists()).toBe(false)
    expect(wrapper.find('[data-filter="find"]').exists()).toBe(true)
  })
})

describe('Companies › finding a company', () => {
  it.each(['metāla', 'METĀLA'])('narrows to the company by its name, whatever the letters’ case: %s', async (text) => {
    stub()
    const { wrapper } = await render()
    await wrapper.get('[data-filter="find"]').setValue(text)
    await settle(wrapper)
    expect(rows(wrapper).map((r) => r.find('b').text())).toEqual(['Metāla Darbi Ltd'])
  })

  it('says none matches, and goes back to all of them', async () => {
    stub()
    const { wrapper } = await render()
    await wrapper.get('[data-filter="find"]').setValue('zzzz')
    await settle(wrapper)
    expect(rows(wrapper)).toHaveLength(0)
    expect(wrapper.get('[data-note="no-match"]').text()).toContain('No company has that name.')
    await wrapper.get('[data-note="no-match"] button').trigger('click')
    await settle(wrapper)
    expect(rows(wrapper)).toHaveLength(9)
  })
})

describe('Companies › pages', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => company({ id: `x${i}`, name: `Firm ${String(i).padStart(2, '0')} Ltd`, own: i === 0 }))

  it('keeps 25 companies on one page', async () => {
    stub({}, many(25))
    const { wrapper } = await render()
    expect(rows(wrapper)).toHaveLength(25)
    expect(wrapper.find('nav[aria-label="Pages"]').exists()).toBe(false)
  })

  it('makes two pages of 25 and 1 of 26', async () => {
    stub({}, many(26))
    const { wrapper } = await render()
    expect(rows(wrapper)).toHaveLength(25)
    expect(norm(wrapper.get('nav[aria-label="Pages"] > span').text())).toBe('1–25 of 26')
    await wrapper.get('nav[aria-label="Pages"] button[aria-label="Next page"]').trigger('click')
    await settle(wrapper)
    expect(rows(wrapper)).toHaveLength(1)
    expect(norm(wrapper.get('nav[aria-label="Pages"] > span').text())).toBe('26–26 of 26')
  })
})

describe('Companies › a read that fails', () => {
  it.each([
    ['the companies', { [`GET ${AREA}/companies`]: { status: 500, body: {} } }, 'The companies could not be read'],
    ['the products', { [`GET ${AREA}/products`]: { status: 500, body: {} } }, 'The products could not be read'],
  ])('says %s could not be read, with Try again, and never that there are no companies', async (_case, failing, title) => {
    stub(failing)
    const { wrapper } = await render()
    expect(wrapper.get('[data-state="failed"]').text()).toContain(title)
    expect(wrapper.text()).toContain('Try again')
    expect(wrapper.text()).not.toContain('No customer company yet')
    expect(rows(wrapper)).toHaveLength(0)
    // Nothing was sent that changes anything.
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([])
  })

  it('reads both again on Try again', async () => {
    stub({ [`GET ${AREA}/companies`]: [{ status: 500, body: {} }, { status: 200, body: { companies: nine() } }] })
    const { wrapper } = await render()
    await wrapper.get('[data-state="failed"] button').trigger('click')
    await settle(wrapper)
    expect(reads('companies')).toBe(2)
    expect(reads('products')).toBe(2)
    expect(rows(wrapper)).toHaveLength(9)
  })

  it('says the admin service did not answer when it did not', async () => {
    stub({ [`GET ${AREA}/companies`]: { status: 0, body: {} } })
    const { wrapper } = await render()
    expect(wrapper.get('[data-state="failed"]').text()).toContain('The admin service did not answer')
  })
})

describe('Companies › the refusals of the area', () => {
  it('says a person who manages nothing here is not a deployment admin, and draws nothing of the area', async () => {
    stub({
      [`GET ${AREA}/companies`]: { status: 403, body: { code: 'err:request:forbidden', title: 'a sentence of the service' } },
      [`GET ${AREA}/products`]: { status: 403, body: { code: 'err:request:forbidden' } },
    })
    const { wrapper } = await render()
    expect(wrapper.get('[data-refusal="notAdmin"]').text()).toContain('You are not a deployment admin')
    expect(wrapper.text()).not.toContain('a sentence of the service')
    expect(wrapper.find('[data-act="open-company"]').exists()).toBe(false)
    expect(rows(wrapper)).toHaveLength(0)
  })

  it('says a sign-in too old, with the age the deployment asks for, and draws nothing of the area', async () => {
    stub({
      [`GET ${AREA}/companies`]: { status: 403, body: { code: 'err:session:signInTooOld' } },
      [`GET ${AREA}/products`]: { status: 403, body: { code: 'err:session:signInTooOld' } },
    })
    const { wrapper } = await render()
    const said = wrapper.get('[data-refusal="tooOld"]').text()
    expect(said).toContain('Sign in again to manage the deployment')
    expect(said).toContain('no older than 15 minutes')
    expect(rows(wrapper)).toHaveLength(0)
    expect(wrapper.find('[data-state="failed"]').exists()).toBe(false)
  })

  it('leads a sign-in that is not strong enough to the closing page the app has', async () => {
    stub({
      [`GET ${AREA}/companies`]: { status: 403, body: { code: 'err:session:assuranceTooLow' } },
      [`GET ${AREA}/products`]: { status: 403, body: { code: 'err:session:assuranceTooLow' } },
    })
    const { session } = await render()
    expect(session.closed).toBe('assurance')
  })

  it('reads the menu again when the person manages nothing here', async () => {
    stub({
      [`GET ${AREA}/companies`]: { status: 403, body: { code: 'err:request:forbidden' } },
      [`GET ${AREA}/products`]: { status: 403, body: { code: 'err:request:forbidden' } },
      'GET /api/configbyte/v1/me': { status: 200, body: { subject: 'sub:A', name: 'Anna Admin', loginMethod: 'webEid', loa: 'high', tenant: 'W-1', sections: {}, presentation: { displayName: 'Kalns', locale: 'en', personLocale: null, deploymentLocale: 'en' }, deployment: { mode: 'saas', admin: false, firstRunOwed: false, signInAge: 900 } } },
      'GET /api/configbyte/v1/sections': { status: 200, body: { sections: [] } },
    })
    const { session } = await render()
    expect(calls.some((c) => c.url === '/api/configbyte/v1/me')).toBe(true)
    expect(session.managesDeployment).toBe(false)
  })
})

describe('Companies › in Latvian', () => {
  it('says the head, the columns and a row in Latvian', async () => {
    stub()
    const { wrapper } = await render('lv')
    expect(wrapper.get('h1').text()).toBe('Uzņēmumi')
    expect(wrapper.text()).toContain('Atvērt uzņēmumu')
    expect(wrapper.text()).toContain('uztur šo izvietojumu')
    expect(norm(rows(wrapper, 'Uzņēmumi')[1]!.text())).toContain('2 administratori')
  })
})
