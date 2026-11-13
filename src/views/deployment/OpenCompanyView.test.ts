// Opening a company against a stand-in coordinator: the form as it opens, the guard
// between the products, what is checked in the browser before anything is sent, what
// each answer becomes on screen, and that nothing typed outlives the form.
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { h } from 'vue'

import type { AdminOptions } from '../../options'
import { configbyteScreens } from '../../plugin'
import { adminRoutes } from '../../routes'
import { useDeployment } from '../../stores/deployment'
import { useAdminSession } from '../../stores/session'
import OpenCompanyForm from './OpenCompanyForm.vue'

type Reply = { status: number; body: unknown; held?: Promise<unknown> }
interface Call {
  method: string
  url: string
  body: unknown
}

const AREA = '/api/configbyte/v1/deployment'

const catalogue = () => [
  { key: 'basic', displayName: 'Basic', offered: true, needs: [] },
  { key: 'extras', displayName: 'Extras', offered: true, needs: ['basic'] },
  { key: 'both', displayName: 'Both', offered: true, needs: ['basic', 'extras'] },
  { key: 'idle', displayName: 'Idle', offered: false, needs: [] },
]
const files = { configurations: [{ name: 'metal-fabrication' }, { name: 'office-work' }] }
const opened = (extra: Record<string, unknown> = {}) => ({
  status: 201,
  body: { company: { id: 'c9', name: 'Kalve Ltd', status: 'active', createdAt: new Date().toISOString(), entered: false }, ...extra },
})

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

function stub(extra: Record<string, Reply | Reply[]> = {}) {
  calls = []
  const base: Record<string, Reply | Reply[]> = {
    [`GET ${AREA}/products`]: { status: 200, body: { products: catalogue() } },
    [`GET ${AREA}/configurations`]: { status: 200, body: files },
    'GET /api/configbyte/v1/me': { status: 200, body: identity() },
    'GET /api/configbyte/v1/sections': { status: 200, body: { sections: [] } },
    [`GET ${AREA}/companies/c9/administrators`]: { status: 200, body: { administrators: [{ userId: 'u1', displayName: 'Invited Person', status: 'invited', lastSignedInOn: null }] } },
    [`GET ${AREA}/companies/c9`]: {
      status: 200,
      body: { company: { id: 'c9', name: 'Kalve Ltd', status: 'active', createdAt: new Date().toISOString(), own: false, products: ['basic'], administrators: 1, entered: false } },
    },
  }
  answers = Object.fromEntries(Object.entries({ ...base, ...extra }).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]))
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({ method, url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined })
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
  session.order = ['orders']
  session.resolved = true
  const i18n = createI18n({ legacy: false, locale, fallbackLocale: 'en', messages: structuredClone(hostWords) })
  const router = createRouter({ history: createMemoryHistory(), routes: adminRoutes() })
  await router.push('/deployment/companies/new')
  await router.isReady()
  const wrapper = mount({ render: () => h(RouterView) }, { attachTo: document.body, global: { plugins: [pinia, i18n, router, configbyteScreens(i18n, options)] } })
  await settle(wrapper)

  return { wrapper, router, session, pinia }
}

type W = Awaited<ReturnType<typeof render>>['wrapper']
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const writes = () => calls.filter((c) => c.method !== 'GET')
const reads = (url: string) => calls.filter((c) => c.method === 'GET' && c.url === url).length
const box = (wrapper: W, key: string) => wrapper.get(`input[data-tick="${key}"]`)
const checked = (wrapper: W, key: string) => (box(wrapper, key).element as HTMLInputElement).checked
const disabled = (wrapper: W, key: string) => (box(wrapper, key).element as HTMLInputElement).disabled
const note = (wrapper: W, key: string) => norm(wrapper.get(`[data-product="${key}"]`).text())
const submit = (wrapper: W) => wrapper.get('[data-act="open"]')
const isOff = (wrapper: W) => (submit(wrapper).element as HTMLButtonElement).disabled
const arrives = (router: { currentRoute: { value: { path: string } } }, path: string) =>
  vi.waitFor(() => expect(router.currentRoute.value.path).toBe(path), { timeout: 8000 })

async function fill(wrapper: W, input: { name?: string; person?: string; code?: string } = {}) {
  await wrapper.get('#open-name').setValue(input.name ?? 'Kalve Ltd')
  await wrapper.get('#open-person').setValue(input.person ?? 'Ilze Bērziņa')
  await wrapper.get('#open-code').setValue(input.code ?? shownCode)
}

async function press(wrapper: W) {
  await submit(wrapper).trigger('click')
  await settle(wrapper)
}

const typed = ['Ilze Bērziņa', shownCode, digits]
const stored = (storage: Storage) => JSON.stringify({ ...storage })

beforeEach(() => {
  document.cookie = 'configbyte_csrf=tok-1'
  window.localStorage.clear()
  window.sessionStorage.clear()
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Open a company › the form as it opens', () => {
  it('reads the products and the files’ names once, and draws the fields in order, the name first and focused', async () => {
    stub()
    const { wrapper } = await render()
    expect(reads(`${AREA}/products`)).toBe(1)
    expect(reads(`${AREA}/configurations`)).toBe(1)
    const labels = wrapper.findAll('[data-form="open-company"] > div > div').map((r) => norm(r.text()).split(' ')[0])
    expect(labels).toEqual(['Name', 'Language', 'Products', 'Starts', 'First'])
    expect(document.activeElement?.id).toBe('open-name')
  })

  it('leaves the products unticked, Starts from on Empty, and the language on the person’s own', async () => {
    stub()
    const { wrapper } = await render()
    expect(['basic', 'extras', 'both', 'idle'].map((k) => checked(wrapper, k))).toEqual([false, false, false, false])
    expect((wrapper.get('#open-starts-from').element as HTMLSelectElement).value).toBe('')
    expect(wrapper.get('[role="radio"][aria-checked="true"]').text()).toContain('English')
  })

  it('opens on the person’s own language when it is Latvian', async () => {
    stub()
    const { wrapper } = await render('lv')
    expect(wrapper.get('[role="radio"][aria-checked="true"]').text()).toContain('Latviešu')
    expect(wrapper.text()).toContain('Atvērt uzņēmumu')
  })

  it('has a button that is off and says what it waits for, until a name, a person and a code are given', async () => {
    stub()
    const { wrapper } = await render()
    expect(isOff(wrapper)).toBe(true)
    expect(wrapper.get('[data-note="waits"]').text()).toBe('It waits for a name and the first administrator.')
    expect(submit(wrapper).text()).toBe('Open the company')
    await wrapper.get('#open-name').setValue('Kalve Ltd')
    expect(isOff(wrapper)).toBe(true)
    await wrapper.get('#open-person').setValue('Ilze Bērziņa')
    expect(isOff(wrapper)).toBe(true)
    await wrapper.get('#open-code').setValue(shownCode)
    expect(isOff(wrapper)).toBe(false)
    expect(submit(wrapper).text()).toBe('Open «Kalve Ltd»')
    expect(wrapper.find('[data-note="waits"]').exists()).toBe(false)
  })
})

describe('Open a company › the products’ guard', () => {
  it('says a product needing another cannot be ticked before it, and frees it once that one is ticked', async () => {
    stub()
    const { wrapper } = await render()
    expect(disabled(wrapper, 'extras')).toBe(true)
    expect(note(wrapper, 'extras')).toContain('Needs Basic. Tick it first.')
    await box(wrapper, 'basic').setValue(true)
    await settle(wrapper)
    expect(disabled(wrapper, 'extras')).toBe(false)
    expect(note(wrapper, 'extras')).not.toContain('Needs')
  })

  it('stops a ticked product being unticked while another ticked one needs it, and frees it once that one is unticked', async () => {
    stub()
    const { wrapper } = await render()
    await box(wrapper, 'basic').setValue(true)
    await box(wrapper, 'extras').setValue(true)
    await settle(wrapper)
    expect(disabled(wrapper, 'basic')).toBe(true)
    expect(note(wrapper, 'basic')).toContain('Extras needs it. Untick that first.')
    await box(wrapper, 'extras').setValue(false)
    await settle(wrapper)
    expect(disabled(wrapper, 'basic')).toBe(false)
  })

  it('names the one still missing for a product that needs two, and both when both are', async () => {
    stub()
    const { wrapper } = await render()
    expect(note(wrapper, 'both')).toContain('Needs Basic and Extras. Tick them first.')
    await box(wrapper, 'basic').setValue(true)
    await settle(wrapper)
    expect(note(wrapper, 'both')).toContain('Needs Extras. Tick it first.')
  })

  it('draws a product the deployment does not offer unticked and not changeable, saying why', async () => {
    stub()
    const { wrapper } = await render()
    expect(checked(wrapper, 'idle')).toBe(false)
    expect(disabled(wrapper, 'idle')).toBe(true)
    expect(note(wrapper, 'idle')).toContain('Its services have not started in this deployment.')
  })
})

describe('Open a company › Starts from', () => {
  it('holds Empty alone when no file is prepared, and says where the files come from', async () => {
    stub({ [`GET ${AREA}/configurations`]: { status: 200, body: { configurations: [] } } })
    const { wrapper } = await render()
    expect(wrapper.get('#open-starts-from').findAll('option').map((o) => o.text())).toEqual(['Empty'])
    expect(wrapper.get('[data-note="files"]').text()).toContain('Whoever runs it keeps them as files in a folder the admin service reads')
  })

  it('sends no startsFrom for Empty, and the file’s name for a file', async () => {
    stub({ [`POST ${AREA}/companies`]: [opened(), opened({ configuration: { name: 'office-work', outcome: 'applied', sections: {} } })] })
    const first = await render()
    await fill(first.wrapper)
    await press(first.wrapper)
    expect(writes()[0]!.body).not.toHaveProperty('startsFrom')
    first.wrapper.unmount()

    const second = await render()
    await fill(second.wrapper)
    await second.wrapper.get('#open-starts-from').setValue('office-work')
    await press(second.wrapper)
    expect(writes()[1]!.body).toMatchObject({ startsFrom: 'office-work' })
  })
})

describe('Open a company › what is checked before anything is sent', () => {
  it.each([
    ['a letter in the code', 'LV', '1234a678901', 'digits'],
    ['ten digits', 'LV', '1234567890', 'has 11 digits'],
    ['the wrong length for its country', 'LT', '1234567890', 'has 11 digits'],
  ])('does not send %s, and says so in the invitation form’s words', async (_case, country, code, said) => {
    stub()
    const { wrapper } = await render()
    await fill(wrapper, { code })
    await wrapper.get('[data-open="code"] select').setValue(country)
    await press(wrapper)
    expect(wrapper.get('[data-note="person-problem"]').text()).toContain(said)
    expect(writes()).toEqual([])
  })

  it('does not send a name of 201 characters, and says its limit; 200 is sent', async () => {
    stub({ [`POST ${AREA}/companies`]: opened() })
    const { wrapper } = await render()
    await fill(wrapper, { name: 'x'.repeat(201) })
    await press(wrapper)
    expect(wrapper.text()).toContain('A name is at most 200 characters.')
    expect(writes()).toEqual([])
    await wrapper.get('#open-name').setValue('x'.repeat(200))
    await press(wrapper)
    expect(writes()).toHaveLength(1)
  })

  it('sends the name trimmed, with the products, the language and the administrator', async () => {
    stub({ [`POST ${AREA}/companies`]: opened() })
    const { wrapper } = await render()
    await box(wrapper, 'basic').setValue(true)
    await box(wrapper, 'extras').setValue(true)
    await fill(wrapper, { name: '  Kalve Ltd  ' })
    await press(wrapper)
    expect(writes()).toEqual([
      {
        method: 'POST',
        url: `${AREA}/companies`,
        body: {
          name: 'Kalve Ltd',
          language: 'en',
          products: ['basic', 'extras'],
          administrator: { displayName: 'Ilze Bērziņa', identityCode: shownCode, country: 'LV' },
        },
      },
    ])
  })
})

describe('Open a company › what each answer becomes', () => {
  it('opens the company’s page with the line that it is opened, for an opening without a file', async () => {
    stub({ [`POST ${AREA}/companies`]: opened() })
    const { wrapper, router } = await render()
    await fill(wrapper)
    await press(wrapper)
    await arrives(router, '/deployment/companies/c9')
    await settle(wrapper)
    expect(wrapper.get('[data-band="opened"]').text()).toContain('«Kalve Ltd» is opened.')
    expect(wrapper.get('[data-band="opened"]').text()).toContain('It starts with nothing set up.')
    // The person is said to be invited, and shown so once the names are asked for.
    expect(wrapper.get('[data-band="opened"]').text()).toContain('The administrator is invited.')
    await wrapper.get('[data-act="show-administrators"]').trigger('click')
    await settle(wrapper)
    expect(norm(wrapper.get('[data-administrator="u1"]').text())).toContain('invited, not signed in yet')
  })

  it('draws the screens’ own words for a part its owner refused, and never the owner’s title or detail, on the opening’s outcome', async () => {
    stub({
      [`POST ${AREA}/companies`]: opened({
        configuration: {
          name: 'metal-fabrication',
          outcome: 'refused',
          sections: { orders: { status: 'failed', detail: 'OWNER SECTION DETAIL', problem: { status: 422, title: 'OWNER TITLE', detail: 'OWNER DETAIL' } }, stock: { status: 'withheld' } },
        },
      }),
    })
    const { wrapper, router } = await render()
    await fill(wrapper)
    await wrapper.get('#open-starts-from').setValue('metal-fabrication')
    await press(wrapper)
    await arrives(router, '/deployment/companies/c9')
    await settle(wrapper)
    expect(wrapper.get('[data-part="orders"]').text()).toContain('its service refused this part')
    for (const text of ['OWNER TITLE', 'OWNER DETAIL', 'OWNER SECTION DETAIL']) expect(wrapper.text()).not.toContain(text)
  })

  it('opens the company’s page with a band of one line a part when the whole file is in force', async () => {
    stub({
      [`POST ${AREA}/companies`]: opened({
        configuration: { name: 'metal-fabrication', outcome: 'applied', sections: { orders: { status: 'applied', report: { kinds: [{ key: 'a', status: 'added' }, { key: 'b', status: 'added' }] } } } },
      }),
    })
    const { wrapper, router } = await render()
    await fill(wrapper)
    await wrapper.get('#open-starts-from').setValue('metal-fabrication')
    await press(wrapper)
    await arrives(router, '/deployment/companies/c9')
    await settle(wrapper)
    const band = wrapper.get('[data-block="configuration"]')
    expect(band.attributes('data-outcome')).toBe('applied')
    expect(band.text()).toContain('«Kalve Ltd» is opened, and starts from «metal-fabrication».')
    expect(band.get('[data-part="orders"]').text()).toContain('2 changes made')
  })

  it('says a refused file as opened but not applied, the refused part in words and the others withheld, never a service’s own reason', async () => {
    stub({
      [`POST ${AREA}/companies`]: opened({
        configuration: {
          name: 'metal-fabrication',
          outcome: 'refused',
          sections: { orders: { status: 'refused', detail: 'raw sentence of the service', problem: { title: 'raw title of the service' } }, stock: { status: 'withheld' } },
        },
      }),
    })
    const { wrapper, router } = await render()
    await fill(wrapper)
    await wrapper.get('#open-starts-from').setValue('metal-fabrication')
    await press(wrapper)
    await arrives(router, '/deployment/companies/c9')
    await settle(wrapper)
    const band = wrapper.get('[data-block="configuration"]')
    expect(band.text()).toContain('«Kalve Ltd» is opened, but its configuration was not applied.')
    expect(band.get('[data-part="orders"]').text()).toContain('refused')
    expect(band.get('[data-part="stock"]').text()).toContain('withheld')
    expect(band.text()).not.toContain('raw sentence of the service')
    expect(band.text()).not.toContain('raw title of the service')
    // The block below offers another file.
    expect(wrapper.find('[data-act="apply-file"]').exists()).toBe(true)
  })

  it.each([
    ['failed', 'could not be applied'],
    ['rolledBack', 'but its configuration was not applied'],
    ['partial', 'only partly applied'],
  ])('opens the company with the band of an outcome of %s, lines only where there are parts', async (outcome, said) => {
    stub({ [`POST ${AREA}/companies`]: opened({ configuration: { name: 'metal-fabrication', outcome, sections: {} } }) })
    const { wrapper, router } = await render()
    await fill(wrapper)
    await wrapper.get('#open-starts-from').setValue('metal-fabrication')
    await press(wrapper)
    await arrives(router, '/deployment/companies/c9')
    await settle(wrapper)
    const band = wrapper.get('[data-block="configuration"]')
    expect(band.attributes('data-outcome')).toBe(outcome)
    expect(band.text()).toContain(said)
    expect(band.find('[data-lines]').exists()).toBe(false)
  })

  it('reads a file that was asked for and an answer that says nothing of it as a failed one, never a success', async () => {
    stub({ [`POST ${AREA}/companies`]: opened() })
    const { wrapper, router } = await render()
    await fill(wrapper)
    await wrapper.get('#open-starts-from').setValue('metal-fabrication')
    await press(wrapper)
    await arrives(router, '/deployment/companies/c9')
    await settle(wrapper)
    expect(wrapper.get('[data-block="configuration"]').attributes('data-outcome')).toBe('failed')
  })

  it.each([
    [404, 'err:configbyte:unknownConfiguration', 'is not a file this deployment keeps any more, so nothing was opened'],
    [422, 'err:configbyte:badConfiguration', 'is not a configuration this deployment can read, so nothing was opened'],
  ])('says nothing was opened, naming the file, for %s, and keeps the form whole', async (status, code, said) => {
    stub({ [`POST ${AREA}/companies`]: { status, body: { code, detail: 'the service’s own words' } } })
    const { wrapper, router } = await render()
    await box(wrapper, 'basic').setValue(true)
    await fill(wrapper)
    await wrapper.get('#open-starts-from').setValue('metal-fabrication')
    await press(wrapper)
    const band = wrapper.get('[data-band="not-opened"]')
    expect(band.text()).toContain('Nothing was opened.')
    expect(band.text()).toContain('«metal-fabrication»')
    expect(band.text()).toContain(said)
    expect(band.text()).not.toContain('the service’s own words')
    expect(router.currentRoute.value.path).toBe('/deployment/companies/new')
    expect((wrapper.get('#open-name').element as HTMLInputElement).value).toBe('Kalve Ltd')
    expect((wrapper.get('#open-person').element as HTMLInputElement).value).toBe('Ilze Bērziņa')
    expect(checked(wrapper, 'basic')).toBe(true)
    expect((wrapper.get('#open-starts-from').element as HTMLSelectElement).value).toBe('metal-fabrication')
  })

  it('says a name taken under Name, keeps the form, and marks nothing else', async () => {
    stub({ [`POST ${AREA}/companies`]: { status: 409, body: { code: 'err:membership:name_taken', detail: 'the register’s own sentence' } } })
    const { wrapper, router } = await render()
    await fill(wrapper)
    await press(wrapper)
    expect(wrapper.text()).toContain('A company of this name is already here. A company’s name is used once.')
    expect(wrapper.text()).not.toContain('the register’s own sentence')
    expect(wrapper.find('[data-band="not-opened"]').exists()).toBe(false)
    expect(wrapper.find('[data-line="said"]').exists()).toBe(false)
    expect(router.currentRoute.value.path).toBe('/deployment/companies/new')
    expect((wrapper.get('#open-name').element as HTMLInputElement).value).toBe('Kalve Ltd')
  })

  it('says the services are still starting when they have not declared themselves, and keeps the form', async () => {
    stub({ [`POST ${AREA}/companies`]: { status: 409, body: { code: 'err:membership:not_declared' } } })
    const { wrapper } = await render()
    await fill(wrapper)
    await press(wrapper)
    expect(wrapper.get('[data-band="not-opened"]').text()).toContain('The services of this deployment are still starting')
    expect((wrapper.get('#open-name').element as HTMLInputElement).value).toBe('Kalve Ltd')
  })

  it.each([
    [409, 'err:membership:conflict', 'The company was not opened. Nothing was written.'],
    [422, 'err:membership:invalid', 'The company was not opened. That name or personal code was not accepted. Check them and try again.'],
  ])('says one line that the company was not opened for any other %s', async (status, code, said) => {
    stub({ [`POST ${AREA}/companies`]: { status, body: { code, detail: 'the register’s own sentence' } } })
    const { wrapper } = await render()
    await fill(wrapper)
    await press(wrapper)
    const line = norm(wrapper.get('[data-line="said"]').text())
    expect(line).toContain(status === 422 ? 'The company was not opened.' : said)
    if (status === 422) expect(line).toContain('That name or personal code was not accepted.')
    expect(wrapper.text()).not.toContain('the register’s own sentence')
  })

  it('says the admin service did not answer, and keeps the form', async () => {
    stub({ [`POST ${AREA}/companies`]: { status: 0, body: {} } })
    const { wrapper } = await render()
    await fill(wrapper)
    await press(wrapper)
    expect(wrapper.get('[data-line="said"]').text()).toContain('The admin service did not answer')
    expect((wrapper.get('#open-name').element as HTMLInputElement).value).toBe('Kalve Ltd')
  })

  it('drops the form, says the person is no longer a deployment admin, and reads the menu again, for any other 403', async () => {
    stub({
      [`POST ${AREA}/companies`]: { status: 403, body: { code: 'err:request:forbidden', detail: 'the service’s own words' } },
      'GET /api/configbyte/v1/me': [{ status: 200, body: identity() }, { status: 200, body: identity({ deployment: { mode: 'saas', admin: false, firstRunOwed: false, signInAge: 900 } }) }],
    })
    const { wrapper } = await render()
    await fill(wrapper)
    await press(wrapper)
    expect(wrapper.get('[data-refusal="noLonger"]').text()).toContain('You are no longer a deployment admin')
    expect(wrapper.find('[data-form="open-company"]').exists()).toBe(false)
    // The form's component is taken away, so what was typed in it is not left in memory.
    expect(wrapper.findComponent(OpenCompanyForm).exists()).toBe(false)
    expect(calls.some((c) => c.url === '/api/configbyte/v1/me')).toBe(true)
  })

  it('sends one request for two presses of Open', async () => {
    let release: () => void = () => {}
    const wait = new Promise<void>((resolve) => {
      release = resolve
    })
    stub({ [`POST ${AREA}/companies`]: { ...opened(), held: wait } })
    const { wrapper } = await render()
    await fill(wrapper)
    await submit(wrapper).trigger('click')
    await submit(wrapper).trigger('click')
    await settle(wrapper)
    expect(writes()).toHaveLength(1)
    expect(isOff(wrapper)).toBe(true)
    release()
    await settle(wrapper)
    expect(writes()).toHaveLength(1)
  })

  it('goes to Companies on Cancel, and sends nothing', async () => {
    stub()
    const { wrapper, router } = await render()
    await fill(wrapper)
    await wrapper.get('[data-act="cancel"]').trigger('click')
    await arrives(router, '/deployment/companies')
    expect(writes()).toEqual([])
  })
})

describe('Open a company › nothing typed outlives the form', () => {
  it('is in no store, no storage and no element after Cancel', async () => {
    stub()
    const { wrapper, router, pinia } = await render()
    await fill(wrapper, { name: 'Zeta Ltd' })
    await wrapper.get('[data-act="cancel"]').trigger('click')
    await arrives(router, '/deployment/companies')
    await settle(wrapper)
    const everything = JSON.stringify(useDeployment(pinia).$state) + stored(window.localStorage) + stored(window.sessionStorage) + document.body.innerHTML
    for (const value of [...typed, 'Zeta Ltd']) expect(everything).not.toContain(value)
  })

  it('is not left in the store or any storage once the opening is sent, whatever the answer', async () => {
    stub({ [`POST ${AREA}/companies`]: opened() })
    const { wrapper, router, pinia } = await render()
    await fill(wrapper, { name: 'Zeta Ltd' })
    await press(wrapper)
    await arrives(router, '/deployment/companies/c9')
    await settle(wrapper)
    const kept = JSON.stringify(useDeployment(pinia).$state) + stored(window.localStorage) + stored(window.sessionStorage) + document.body.innerHTML
    for (const value of [...typed, 'Zeta Ltd']) expect(kept).not.toContain(value)
  })

  it('is in the store at no moment of an opening, not even between the answer and the company’s page taking what it left', async () => {
    stub({ [`POST ${AREA}/companies`]: opened() })
    const { wrapper, router, pinia } = await render()
    const seen: string[] = []
    useDeployment(pinia).$subscribe((_mutation, now) => seen.push(JSON.stringify(now)), { flush: 'sync' })
    await fill(wrapper, { name: 'Zeta Ltd' })
    await press(wrapper)
    await arrives(router, '/deployment/companies/c9')
    await settle(wrapper)
    expect(seen.length).toBeGreaterThan(3)
    for (const snapshot of seen) for (const value of [...typed, 'Zeta Ltd']) expect(snapshot).not.toContain(value)
  })

  it('is not left behind when an opening is refused and the form is then left', async () => {
    stub({ [`POST ${AREA}/companies`]: { status: 409, body: { code: 'err:membership:name_taken' } } })
    const { wrapper, router, pinia } = await render()
    await fill(wrapper, { name: 'Zeta Ltd' })
    await press(wrapper)
    await wrapper.get('[data-act="cancel"]').trigger('click')
    await arrives(router, '/deployment/companies')
    await settle(wrapper)
    const kept = JSON.stringify(useDeployment(pinia).$state) + stored(window.localStorage) + stored(window.sessionStorage) + document.body.innerHTML
    for (const value of [...typed, 'Zeta Ltd']) expect(kept).not.toContain(value)
  })
})

describe('Open a company › a read that fails', () => {
  it('says what a company can have could not be read, with Try again, and no form', async () => {
    stub({ [`GET ${AREA}/products`]: [{ status: 500, body: {} }, { status: 200, body: { products: catalogue() } }] })
    const { wrapper } = await render()
    expect(wrapper.get('[data-state="failed"]').text()).toContain('could not be read')
    expect(wrapper.find('[data-form="open-company"]').exists()).toBe(false)
    await wrapper.get('[data-state="failed"] button').trigger('click')
    await settle(wrapper)
    expect(wrapper.find('[data-form="open-company"]').exists()).toBe(true)
  })
})
