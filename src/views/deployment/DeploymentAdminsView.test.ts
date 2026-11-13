// The deployment admins against a stand-in coordinator: the recorded read that opening
// the page is, adding by personal code alone, removing after a question, the last admin
// who has signed in, and a person removing themselves.
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
import AddDeploymentAdmin from './AddDeploymentAdmin.vue'
import DeploymentAdminsView from './DeploymentAdminsView.vue'

type Reply = { status: number; body: unknown }
interface Call {
  method: string
  url: string
  body: unknown
}

const AREA = '/api/configbyte/v1/deployment'
const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
const at = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

const admins = () => [
  { userId: 'u1', displayName: 'Anna Admin', status: 'active', lastSignedInOn: day(0), addedFrom: 'settings', addedAt: at(1) },
  { userId: 'u2', displayName: 'Marta Liepa', status: 'active', lastSignedInOn: day(1), addedFrom: 'screen', addedAt: at(7) },
  { userId: 'u3', displayName: 'Toms Vītols', status: 'invited', lastSignedInOn: null, addedFrom: 'screen', addedAt: at(0) },
]

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
    [`GET ${AREA}/admins`]: { status: 200, body: { admins: admins() } },
    // Who is signed in, read again before every act and every read of people.
    'GET /api/configbyte/v1/me': { status: 200, body: identity() },
    'GET /api/configbyte/v1/sections': { status: 200, body: { sections: [] } },
  }
  answers = Object.fromEntries(Object.entries({ ...base, ...extra }).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]))
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({ method, url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined })
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
  await router.push('/deployment/admins')
  await router.isReady()
  const wrapper = mount(DeploymentAdminsView, { attachTo: document.body, global: { plugins: [pinia, i18n, router, configbyteScreens(i18n, options)] } })
  await settle(wrapper)

  return { wrapper, router, session, pinia }
}

type W = Awaited<ReturnType<typeof render>>['wrapper']
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const writes = () => calls.filter((c) => c.method !== 'GET')
const reads = () => calls.filter((c) => c.method === 'GET' && c.url === `${AREA}/admins`).length
const rows = (wrapper: W) => wrapper.findAll('[data-list="deployment-admins"] > li')
const button = (wrapper: W, text: string) => wrapper.findAll('button').find((b) => norm(b.text()) === text)!
/** The Remove of the question asked in place under a row: the last button of that name in the row, after its own. */
const confirmRemove = (wrapper: W, id: string) =>
  wrapper
    .get(`[data-admin="${id}"]`)
    .findAll('button')
    .filter((b) => norm(b.text()) === 'Remove')
    .pop()!
const off = (wrapper: W, id: string) => (wrapper.get(`[data-act="remove-${id}"]`).element as HTMLButtonElement).disabled

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

describe('Deployment admins › the page', () => {
  it('is one recorded read, says so, and says each person’s name, you, when they last signed in or that they are invited, and how they were added', async () => {
    stub()
    const { wrapper } = await render()
    expect(reads()).toBe(1)
    expect(wrapper.get('h1').text()).toBe('Deployment admins')
    expect(wrapper.get('[data-note="recorded"]').text()).toBe('Opening this list is recorded by the access audit service.')
    expect(norm(wrapper.get('header').text())).toContain('3 people may open companies')
    const list = rows(wrapper)
    expect(list.map((r) => r.find('b').text())).toEqual(['Anna Admin', 'Marta Liepa', 'Toms Vītols'])
    // No row is marked as the person looking: a name is typed by whoever added the person, and says nothing of who is who.
    expect(wrapper.find('[data-mark="you"]').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/\byou\b/i)
    expect(norm(list[0]!.text())).toContain('last signed in today')
    // How each was added, and the day.
    expect(norm(list[0]!.text())).toContain('from the deployment’s settings · yesterday')
    expect(norm(list[1]!.text())).toMatch(/on this screen · \d{1,2} \p{L}+/u)
    expect(norm(list[2]!.text())).toContain('on this screen · today')
    expect(norm(list[2]!.text())).toContain('invited, not signed in yet')
  })

  it('says the page was not shown, because showing it could not be recorded, with Try again and no name', async () => {
    stub({ [`GET ${AREA}/admins`]: [{ status: 503, body: { code: 'err:membership:audit_unavailable' } }, { status: 200, body: { admins: admins() } }] })
    const { wrapper } = await render()
    expect(wrapper.get('[data-band="unrecorded"]').text()).toContain('The list was not shown')
    expect(wrapper.get('[data-band="unrecorded"]').text()).toContain('Showing it could not be recorded')
    expect(wrapper.text()).not.toContain('Marta Liepa')
    await wrapper.get('[data-band="unrecorded"] button').trigger('click')
    await settle(wrapper)
    expect(wrapper.text()).toContain('Marta Liepa')
    expect(reads()).toBe(2)
  })

  it('says another failure to read as failed, with Try again, and never as an empty list', async () => {
    stub({ [`GET ${AREA}/admins`]: { status: 500, body: {} } })
    const { wrapper } = await render()
    expect(wrapper.get('[data-state="failed"]').text()).toContain('The deployment admins could not be read')
    expect(wrapper.find('[data-list="deployment-admins"]').exists()).toBe(false)
  })
})

describe('Deployment admins › adding', () => {
  async function open(wrapper: W) {
    await wrapper.get('[data-act="add-open"]').trigger('click')
    await settle(wrapper)
  }

  it('adds by personal code and country alone, and reads the list again', async () => {
    stub({ [`POST ${AREA}/admins`]: { status: 201, body: {} } })
    const { wrapper } = await render()
    await open(wrapper)
    expect(wrapper.find('#admin-name').exists()).toBe(false)
    await wrapper.get('#admin-code').setValue(shownCode)
    await wrapper.get('[data-act="add"]').trigger('click')
    await settle(wrapper)
    expect(writes()).toEqual([{ method: 'POST', url: `${AREA}/admins`, body: { identityCode: shownCode, country: 'LV' } }])
    expect(reads()).toBe(2)
    expect(wrapper.get('[data-line="said"]').text()).toContain('Added.')
    expect(wrapper.find('[data-block="add-admin"]').exists()).toBe(false)
  })

  it('says nobody of the deployment’s own company has the code, under the field, for a 404, and adds nothing', async () => {
    stub({ [`POST ${AREA}/admins`]: { status: 404, body: {} } })
    const { wrapper } = await render()
    await open(wrapper)
    await wrapper.get('#admin-code').setValue(shownCode)
    await wrapper.get('[data-act="add"]').trigger('click')
    await settle(wrapper)
    expect(wrapper.get('[data-note="admin-problem"]').text()).toContain('Nobody of the company that runs this deployment has this personal code. Invite them in People & access first.')
    expect(reads()).toBe(1)
    expect(rows(wrapper)).toHaveLength(3)
  })

  it('says one line that the person was not added for a 409, never the register’s sentence', async () => {
    stub({ [`POST ${AREA}/admins`]: { status: 409, body: { code: 'err:membership:conflict', detail: 'the register’s own sentence' } } })
    const { wrapper } = await render()
    await open(wrapper)
    await wrapper.get('#admin-code').setValue(shownCode)
    await wrapper.get('[data-act="add"]').trigger('click')
    await settle(wrapper)
    expect(wrapper.get('[data-line="said"]').text()).toBe('The person was not added as a deployment admin.')
    expect(wrapper.text()).not.toContain('the register’s own sentence')
  })

  it.each([
    ['a letter', 'abc45678901'],
    ['too few digits', '1234'],
  ])('does not send a code that fails the browser’s check: %s', async (_case, code) => {
    stub()
    const { wrapper } = await render()
    await open(wrapper)
    await wrapper.get('#admin-code').setValue(code)
    await wrapper.get('[data-act="add"]').trigger('click')
    await settle(wrapper)
    expect(writes()).toEqual([])
    expect(wrapper.find('[data-note="admin-problem"]').exists()).toBe(true)
  })

  it('keeps the code in the form alone: in no store and no storage once it is sent', async () => {
    stub({ [`POST ${AREA}/admins`]: { status: 201, body: {} } })
    const { wrapper, pinia } = await render()
    await open(wrapper)
    await wrapper.get('#admin-code').setValue(shownCode)
    await wrapper.get('[data-act="add"]').trigger('click')
    await settle(wrapper)
    const kept = JSON.stringify(useDeployment(pinia).$state) + JSON.stringify({ ...window.localStorage }) + JSON.stringify({ ...window.sessionStorage }) + wrapper.html()
    expect(kept).not.toContain(shownCode)
    expect(kept).not.toContain(digits)
  })
})

describe('Deployment admins › removing', () => {
  it('asks first, in place, and sends nothing for Keep', async () => {
    stub()
    const { wrapper } = await render()
    await wrapper.get('[data-act="remove-u2"]').trigger('click')
    await settle(wrapper)
    expect(wrapper.get('[data-admin="u2"]').text()).toContain('Remove Marta Liepa as a deployment admin?')
    expect(wrapper.get('[data-admin="u2"]').text()).toContain('Marta Liepa can no longer manage this deployment, and stays a person of the company.')
    await button(wrapper, 'Keep').trigger('click')
    await settle(wrapper)
    expect(writes()).toEqual([])
  })

  it('removes on Remove, and reads the list again', async () => {
    stub({
      [`GET ${AREA}/admins`]: [{ status: 200, body: { admins: admins() } }, { status: 200, body: { admins: [admins()[0], admins()[2]] } }],
      [`DELETE ${AREA}/admins/u2`]: { status: 200, body: { changed: true } },
    })
    const { wrapper } = await render()
    await wrapper.get('[data-act="remove-u2"]').trigger('click')
    await settle(wrapper)
    await confirmRemove(wrapper, 'u2').trigger('click')
    await settle(wrapper)
    expect(writes()).toEqual([{ method: 'DELETE', url: `${AREA}/admins/u2`, body: undefined }])
    expect(reads()).toBe(2)
    expect(rows(wrapper)).toHaveLength(2)
  })

  it('has the button on for both when two have signed in', async () => {
    stub()
    const { wrapper } = await render()
    expect(off(wrapper, 'u1')).toBe(false)
    expect(off(wrapper, 'u2')).toBe(false)
    expect(wrapper.find('[data-note="last-admin"]').exists()).toBe(false)
  })

  it('switches the button off, with its reason, for the only one who has signed in, and leaves an invited one’s on', async () => {
    stub({ [`GET ${AREA}/admins`]: { status: 200, body: { admins: [admins()[0], admins()[2]] } } })
    const { wrapper } = await render()
    expect(off(wrapper, 'u1')).toBe(true)
    expect(wrapper.get('[data-admin="u1"] [data-note="last-admin"]').text()).toBe('The last deployment admin who has signed in cannot be removed.')
    expect(off(wrapper, 'u3')).toBe(false)
  })

  it('says the same as a line when a removal is refused, and reads the list again', async () => {
    stub({
      [`GET ${AREA}/admins`]: [{ status: 200, body: { admins: admins() } }, { status: 200, body: { admins: [admins()[0], admins()[2]] } }],
      [`DELETE ${AREA}/admins/u2`]: { status: 409, body: { code: 'err:membership:conflict', detail: 'the register’s own sentence' } },
    })
    const { wrapper } = await render()
    await wrapper.get('[data-act="remove-u2"]').trigger('click')
    await settle(wrapper)
    await confirmRemove(wrapper, 'u2').trigger('click')
    await settle(wrapper)
    expect(wrapper.get('[data-line="said"]').text()).toContain('was not removed')
    expect(wrapper.text()).not.toContain('the register’s own sentence')
    expect(reads()).toBe(2)
  })

  it.each([['u2'], ['u4']])('asks the same question of two rows with one name, and removing %s removes that row and no other, then reads the list again, never staying on loading', async (id) => {
    const twins = [
      admins()[0],
      { ...admins()[1], userId: 'u2', displayName: 'Marta Liepa' },
      admins()[2],
      { ...admins()[1], userId: 'u4', displayName: 'Marta Liepa' },
    ]
    stub({
      [`GET ${AREA}/admins`]: [{ status: 200, body: { admins: twins } }, { status: 200, body: { admins: twins.filter((a) => a!.userId !== id) } }],
      [`DELETE ${AREA}/admins/${id}`]: { status: 200, body: { changed: true } },
    })
    const { wrapper, session } = await render()
    await wrapper.get(`[data-act="remove-${id}"]`).trigger('click')
    await settle(wrapper)
    expect(wrapper.get(`[data-admin="${id}"]`).text()).toContain('Remove Marta Liepa as a deployment admin?')
    await confirmRemove(wrapper, id).trigger('click')
    await settle(wrapper)
    expect(writes()).toEqual([{ method: 'DELETE', url: `${AREA}/admins/${id}`, body: undefined }])
    // Who is signed in is read again after the removal; the person still manages, so the list is read again.
    expect(session.managesDeployment).toBe(true)
    expect(reads()).toBe(2)
    expect(wrapper.find('[data-state="loading"]').exists()).toBe(false)
    expect(rows(wrapper).map((r) => r.attributes('data-admin'))).toEqual(twins.filter((a) => a!.userId !== id).map((a) => a!.userId))
  })

  it('reads who is signed in again after a removal, and when the person no longer manages the deployment the area is left', async () => {
    stub({
      [`DELETE ${AREA}/admins/u1`]: { status: 200, body: { changed: true } },
      // The page's own recorded read and the act are each checked first; the third answer is the one after the removal.
      'GET /api/configbyte/v1/me': [
        { status: 200, body: identity() },
        { status: 200, body: identity() },
        { status: 200, body: identity({ deployment: { mode: 'saas', admin: false, firstRunOwed: false, signInAge: 900 } }) },
      ],
    })
    const { wrapper, session } = await render()
    expect(session.managesDeployment).toBe(true)
    await wrapper.get('[data-act="remove-u1"]').trigger('click')
    await settle(wrapper)
    // Every removal asks the same question, naming the person on the row.
    expect(wrapper.get('[data-admin="u1"]').text()).toContain('Remove Anna Admin as a deployment admin?')
    await confirmRemove(wrapper, 'u1').trigger('click')
    await settle(wrapper)
    expect(calls.filter((c) => c.url === '/api/configbyte/v1/me')).toHaveLength(3)
    expect(session.managesDeployment).toBe(false)
    expect(reads()).toBe(1)
    // The page says the area's refusal in its place, and does not hang on loading.
    expect(wrapper.find('[data-refusal="noLonger"]').exists()).toBe(true)
    expect(wrapper.find('[data-state="loading"]').exists()).toBe(false)
  })
})

describe('Deployment admins › the form that adds one', () => {
  it('is taken away when the area refuses the person as a whole, so a code typed in it cannot come back after another try', async () => {
    stub({
      [`POST ${AREA}/admins`]: { status: 403, body: { code: 'err:request:forbidden' } },
      'GET /api/configbyte/v1/me': [{ status: 200, body: identity() }, { status: 200, body: identity() }, { status: 200, body: identity({ deployment: { mode: 'saas', admin: false, firstRunOwed: false, signInAge: 900 } }) }, { status: 200, body: identity() }],
    })
    const { wrapper, pinia } = await render()
    await wrapper.get('[data-act="add-open"]').trigger('click')
    await settle(wrapper)
    await wrapper.get('#admin-code').setValue(shownCode)
    await wrapper.get('[data-act="add"]').trigger('click')
    await settle(wrapper)
    expect(wrapper.findComponent(AddDeploymentAdmin).exists()).toBe(false)
    expect(wrapper.html()).not.toContain(digits)
    // Another try: the page opened again for whoever is signed in now. The form is not there, and empty when asked for.
    answers[`POST ${AREA}/admins`] = [{ status: 201, body: {} }]
    await useDeployment(pinia).openDeploymentAdmins()
    await settle(wrapper)
    expect(wrapper.find('[data-block="add-admin"]').exists()).toBe(false)
    expect(writes()).toHaveLength(1)
    await wrapper.get('[data-act="add-open"]').trigger('click')
    await settle(wrapper)
    expect((wrapper.get('#admin-code').element as HTMLInputElement).value).toBe('')
    expect(writes()).toHaveLength(1)
  })
})

describe('Deployment admins › in Latvian', () => {
  it('says the head, the audit line and a row in Latvian', async () => {
    stub()
    const { wrapper } = await render('lv')
    expect(wrapper.get('h1').text()).toBe('Izvietojuma administratori')
    expect(wrapper.get('[data-note="recorded"]').text()).toContain('reģistrē piekļuves audita serviss')
    expect(wrapper.get('[data-admin="u2"]').text()).toContain('šajā ekrānā')
  })
})
