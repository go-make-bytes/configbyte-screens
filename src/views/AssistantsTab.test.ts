// People & access › Assistants against a stand-in coordinator: the register's
// list of the assistants whole, relayed, and the apps connected as each, which
// the coordinator reads from the sign-in authority. What the tab and an
// assistant's page show, every act's address and body, the words after each act,
// what is asked first, and what is never sent.
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import type { AdminOptions } from '../options'
import { configbyteScreens } from '../plugin'
import { adminRoutes } from '../routes'
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
const C = '/api/configbyte/v1/assistants'
const key = (n: string) => `svc:assistant-01J00000000000000000000${n}`
const apps = (n: string) => `${C}/${encodeURIComponent(key(n))}/connections`

const now = new Date().toISOString()
const longAgo = '2026-10-30T09:20:00Z'

const person = (id: string, displayName: string, over: Record<string, unknown> = {}) => ({
  id,
  subjectKey: `sub:${id}`,
  displayName,
  kind: 'person',
  status: 'active',
  administrator: false,
  arrival: false,
  tenantRoles: [{ id: 'r-worker', name: 'Worker' }],
  userType: { id: 't-member', name: 'Member' },
  chartUserType: null,
  lastSignedInOn: null,
  note: '',
  ...over,
})
const machine = (id: string, displayName: string, subjectKey: string, over: Record<string, unknown> = {}) => ({
  ...person(id, displayName, over),
  subjectKey,
  kind: 'service',
  tenantRoles: [{ id: 'r-asst', name: 'Assistant' }],
  ...over,
})

const members = () => [
  person('m-gatis', 'Gatis Beikerts', { administrator: true }),
  person('m-anna', 'Anna Kalniņa'),
  person('m-juris', 'Juris Ozols'),
  person('m-maris', 'Māris Bērziņš'),
  person('m-laura', 'Laura Vītola', { status: 'invited' }),
  person('m-toms', 'Toms Gone', { status: 'revoked' }),
  machine('s-printer', 'Label printer', 'svc:printer', { tenantRoles: [] }),
  machine('a1', 'Assistant 1', key('A1')),
  machine('a2', 'Assistant 2', key('A2')),
  machine('a3', 'Assistant 3', key('A3')),
  machine('a4', 'Assistant 4', key('A4')),
  machine('a0', 'Test assistant', key('A0'), { status: 'revoked' }),
]

const of = (id: string, displayName: string) => ({ id, subjectKey: `sub:${id}`, displayName })
const assistant = (id: string, n: string, name: string, who: ReturnType<typeof of>, over: Record<string, unknown> = {}) => ({
  id,
  subjectKey: key(n),
  name,
  status: 'active',
  person: who,
  addedAt: longAgo,
  removedAt: null,
  ...over,
})
const assistants = () => [
  assistant('a1', 'A1', 'Assistant 1', of('m-anna', 'Anna Kalniņa')),
  assistant('a2', 'A2', 'Assistant 2', of('m-gatis', 'Gatis Beikerts')),
  assistant('a3', 'A3', 'Assistant 3', of('m-juris', 'Juris Ozols')),
  assistant('a4', 'A4', 'Assistant 4', of('m-anna', 'Anna Kalniņa'), { addedAt: now }),
  assistant('a0', 'A0', 'Test assistant', of('m-maris', 'Māris Bērziņš'), { status: 'revoked', removedAt: '2026-11-02T16:30:00Z' }),
]

const roles = () => [
  { id: 'r-asst', seed: 'assistant', name: 'Assistant', description: '', permissions: [] },
  { id: 'r-guest', seed: 'guest', name: 'Guest', description: '', permissions: [] },
  { id: 'r-worker', seed: 'worker', name: 'Worker', description: '', permissions: [] },
]

const connection = (id: string, connectedAt: string, lastUsed: string | null) => ({ id, app: 'Claude Code', connectedAt, lastUsed })

let calls: Call[] = []
let answers: Record<string, Reply[]> = {}

function stub(extra: Record<string, Reply | Reply[]> = {}, base: { members?: unknown[]; assistants?: unknown[]; roles?: unknown[] } = {}) {
  calls = []
  const all: Record<string, Reply | Reply[]> = {
    [`GET ${T}/access`]: { status: 200, body: { members: base.members ?? members() } },
    [`GET ${T}/roles`]: { status: 200, body: { roles: base.roles ?? roles() } },
    [`GET ${T}/user-types`]: { status: 200, body: { userTypes: [] } },
    [`GET ${R}/config`]: { status: 200, body: { services: [] } },
    [`GET ${T}/assistants?whole=true`]: { status: 200, body: { items: base.assistants ?? assistants() } },
    [`GET ${apps('A1')}`]: { status: 200, body: { connections: [connection('c2', now, null), connection('c1', longAgo, now)] } },
    [`GET ${apps('A2')}`]: { status: 200, body: { connections: [connection('c3', longAgo, now)] } },
    [`GET ${apps('A3')}`]: { status: 200, body: { connections: [connection('c4', longAgo, longAgo)] } },
    [`GET ${apps('A4')}`]: { status: 200, body: { connections: [] } },
  }
  answers = Object.fromEntries(Object.entries({ ...all, ...extra }).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]))
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
  for (let pass = 0; pass < 10; pass += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()
  }
}

const options = (over: Partial<AdminOptions> = {}): AdminOptions => ({
  product: 'host.product',
  never: 'host.never',
  sections: {},
  carries: [],
  register: 'members',
  assistants: true,
  ...over,
})

async function render(input: { url?: string; locale?: string; options?: AdminOptions } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useAdminSession()
  session.me = {
    subject: 'sub:m-gatis',
    name: 'Gatis Beikerts',
    loginMethod: 'an ID card',
    loa: 'high',
    tenant: 'W-1',
    sections: { members: ['membership:admin'] },
    presentation: { displayName: 'Kalnu Metāls', locale: 'en', personLocale: null, deploymentLocale: 'en' },
  }
  session.order = ['members']
  session.resolved = true
  const i18n = createI18n({ legacy: false, locale: input.locale ?? 'en', fallbackLocale: 'en', messages: {} })
  const router = createRouter({ history: createMemoryHistory(), routes: adminRoutes() })
  await router.push(input.url ?? '/people/assistants')
  await router.isReady()
  const wrapper = mount(PeopleAccessView, { global: { plugins: [pinia, i18n, router, configbyteScreens(i18n, input.options ?? options())] } })
  await settle(wrapper)

  return { wrapper, router }
}

type Shown = Awaited<ReturnType<typeof render>>
type W = Shown['wrapper']
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const button = (wrapper: W, text: string) => wrapper.findAll('button').find((b) => norm(b.text()) === text)
const rows = (wrapper: W) => wrapper.findAll('ul[aria-label="Assistants"] > li')
const rowOf = (wrapper: W, name: string) => rows(wrapper).find((r) => r.text().includes(name))!
const tabs = (wrapper: W) => wrapper.findAll('[role="tab"]').map((t) => norm(t.text()))
const writes = () => calls.filter((c) => c.method !== 'GET')
const said = (wrapper: W) => norm(wrapper.get('[data-said]').text())

beforeEach(() => {
  document.cookie = 'configbyte_csrf=tok-1'
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('People & access › Assistants: the list', () => {
  it('is a fourth tab with its count of live ones, each row naming its person, roles, apps and when one was last used', async () => {
    stub()
    const { wrapper } = await render()
    expect(tabs(wrapper)).toEqual(['Users 5', 'Roles 3', 'User types 0', 'Assistants 4'])
    expect(rows(wrapper).map((r) => r.get('b').text())).toEqual(['Assistant 1', 'Assistant 2', 'Assistant 3', 'Assistant 4'])
    const one = norm(rowOf(wrapper, 'Assistant 1').text())
    expect(one).toContain('added 30 Oct')
    expect(one).toContain('Anna Kalniņa')
    expect(one).toContain('Assistant')
    expect(one).toContain('2 apps')
    expect(one).toContain('today')
    expect(norm(rowOf(wrapper, 'Assistant 4').text())).toContain('no app yet')
    expect(norm(rowOf(wrapper, 'Assistant 4').text())).toContain('added today')
    expect(norm(rowOf(wrapper, 'Assistant 3').text())).toContain('30 Oct')
    expect(wrapper.get('[data-block="no-key"]').text()).toContain('Nobody holds a key.')
    expect(norm(wrapper.get('[data-note="lead"]').text())).toContain('history names both: Anna Kalniņa ✦ through Assistant 1')
    // The add button sits in the head while there are assistants.
    expect(button(wrapper, 'Add an assistant')).toBeDefined()
    expect(wrapper.findAll('[data-act="assistant-add-open"]')).toHaveLength(1)
    expect(writes()).toEqual([])
  })

  it('keeps the removed ones behind a choice that shows them, dated, with no roles and no apps', async () => {
    stub()
    const { wrapper } = await render()
    expect(rows(wrapper).some((r) => r.text().includes('Test assistant'))).toBe(false)
    const box = wrapper.get('input[data-filter="removed-assistants"]')
    expect(norm(box.element.parentElement!.textContent ?? '')).toBe('Show removed assistants 1')
    await box.setValue(true)
    await settle(wrapper)
    const gone = norm(rowOf(wrapper, 'Test assistant').text())
    expect(gone).toContain('removed 2 Nov')
    expect(gone).toContain('Māris Bērziņš')
    expect(gone).not.toContain('Assistant ')
    expect(gone).not.toContain('app')
    // A removed one's apps are never asked for.
    expect(calls.some((c) => c.url === apps('A0'))).toBe(false)
  })

  it('with none, and none ever, draws the empty list with its one button and nothing else', async () => {
    stub({}, { members: members().filter((m) => !m.subjectKey.startsWith('svc:assistant-')), assistants: [] })
    const { wrapper } = await render()
    expect(tabs(wrapper)).toContain('Assistants 0')
    expect(wrapper.get('[data-block="no-assistant"]').text()).toContain('No assistant yet')
    expect(wrapper.findAll('[data-act="assistant-add-open"]')).toHaveLength(0)
    expect(wrapper.findAll('[data-act="assistant-add-first"]')).toHaveLength(1)
    expect(wrapper.findAll('input[data-filter="removed-assistants"]')).toHaveLength(0)
    expect(rows(wrapper)).toHaveLength(0)
  })

  it('is no tab at all in a deployment without assistants, whose address opens the Users list', async () => {
    stub()
    const { wrapper } = await render({ options: options({ assistants: false }) })
    expect(tabs(wrapper)).toEqual(['Users 5', 'Roles 3', 'User types 0'])
    expect(wrapper.findAll('ul[aria-label="People"] > li').length).toBeGreaterThan(0)
    expect(calls.some((c) => c.url.includes('assistants'))).toBe(false)
  })

  it('says so in words when the assistants cannot be read', async () => {
    stub({ [`GET ${T}/assistants?whole=true`]: { status: 502, body: { code: 'err:upstream:unavailable' } } })
    const { wrapper } = await render()
    expect(wrapper.get('[data-state="assistants-failed"]').text()).toBe('The admin service did not answer, so the assistants could not be read. Try again.')
  })

  it('says it when a member who is not an administrator reaches it', async () => {
    stub({ [`GET ${T}/assistants?whole=true`]: { status: 403, body: { code: 'err:request:forbidden' } } })
    const { wrapper } = await render()
    expect(wrapper.get('[data-state="assistants-failed"]').text()).toContain('You are no longer an administrator of this workspace')
  })

  it('opens the list when the address names an assistant it does not hold', async () => {
    stub()
    const { router } = await render({ url: '/people/assistants/other-workspace' })
    expect(router.currentRoute.value.name).toBe('configbyte-people-assistants')
  })
})

describe('People & access › Assistants: adding one', () => {
  it('adds the first for one person, with the role it brings, and opens it beside the list with what was said', async () => {
    const before = { members: members().filter((m) => !m.subjectKey.startsWith('svc:assistant-')), assistants: [], roles: roles().filter((r) => r.seed !== 'assistant') }
    stub(
      {
        [`POST ${T}/assistants`]: { status: 200, body: { id: 'a9', subjectKey: key('A9'), name: 'Assistant 1', status: 'active', person: of('m-anna', 'Anna Kalniņa'), role: { id: 'r-asst', name: 'Assistant', seed: 'assistant' } } },
        [`GET ${T}/assistants?whole=true`]: [
          { status: 200, body: { items: [] } },
          { status: 200, body: { items: [assistant('a9', 'A9', 'Assistant 1', of('m-anna', 'Anna Kalniņa'), { addedAt: now })] } },
        ],
        [`GET ${T}/access`]: [
          { status: 200, body: { members: before.members } },
          { status: 200, body: { members: [...before.members, machine('a9', 'Assistant 1', key('A9'))] } },
        ],
        [`GET ${T}/roles`]: [
          { status: 200, body: { roles: before.roles } },
          { status: 200, body: { roles: roles() } },
        ],
      },
      before,
    )
    const s = await render()
    await s.wrapper.get('[data-act="assistant-add-first"]').trigger('click')
    await settle(s.wrapper)
    const form = s.wrapper.get('[data-block="assistant-add"]')
    expect((form.get('[data-assistant="name"] input, input[data-assistant="name"]').element as HTMLInputElement).value).toBe('Assistant 1')
    // Only the workspace's active people: no machine, no assistant, nobody removed or not yet signed in.
    expect(form.findAll('[data-assistant="for"] option').map((o) => o.text()).filter((x) => !x.endsWith('…'))).toEqual([
      'Anna Kalniņa',
      'Gatis Beikerts',
      'Juris Ozols',
      'Māris Bērziņš',
    ])
    await form.get('[data-assistant="for"]').setValue('m-anna')
    await s.wrapper.get('[data-act="assistant-add"]').trigger('click')
    await settle(s.wrapper)
    expect(writes()).toEqual([{ method: 'POST', url: `${T}/assistants`, body: { name: 'Assistant 1', person: 'm-anna' }, csrf: 'tok-1' }])
    expect(s.router.currentRoute.value.params.id).toBe('a9')
    expect(said(s.wrapper)).toBe(
      'Assistant 1 was added for Anna Kalniņa, with the role «Assistant», which this workspace now has (on Roles). Anna connects their AI app to it by signing in at the app.',
    )
    expect(s.wrapper.get('[data-panel="assistant"]').text()).toContain('Anna Kalniņa')
    expect(tabs(s.wrapper)).toContain('Assistants 1')
  })

  it('refuses in words, sending nothing, with no name, no person, or a name too long', async () => {
    stub()
    const s = await render()
    await s.wrapper.get('[data-act="assistant-add-open"]').trigger('click')
    await settle(s.wrapper)
    const name = s.wrapper.get('[data-block="assistant-add"] input')
    const problem = () => norm(s.wrapper.get('[data-note="assistant-problem"]').text())

    await name.setValue('   ')
    await s.wrapper.get('[data-act="assistant-add"]').trigger('click')
    await settle(s.wrapper)
    expect(problem()).toBe('An assistant needs a name.')

    await name.setValue('Site log')
    await s.wrapper.get('[data-act="assistant-add"]').trigger('click')
    await settle(s.wrapper)
    expect(problem()).toBe('Choose the person it is for.')

    await s.wrapper.get('[data-assistant="for"]').setValue('m-juris')
    await name.setValue('x'.repeat(101))
    await s.wrapper.get('[data-act="assistant-add"]').trigger('click')
    await settle(s.wrapper)
    expect(problem()).toBe('An assistant’s name is 1 to 100 characters on one line.')

    // A line break never reaches the register: the field is one line (the name rule's own test covers one that would).
    expect(writes()).toEqual([])
  })

  it('sends a name of exactly 100 characters, and says the register’s refusal of a taken name in words', async () => {
    stub({ [`POST ${T}/assistants`]: [{ status: 200, body: { id: 'a7', role: { name: 'Assistant' } } }, { status: 409, body: { code: 'err:membership:conflict' } }] })
    const s = await render()
    await s.wrapper.get('[data-act="assistant-add-open"]').trigger('click')
    await settle(s.wrapper)
    await s.wrapper.get('[data-assistant="for"]').setValue('m-juris')
    await s.wrapper.get('[data-block="assistant-add"] input').setValue('y'.repeat(100))
    await s.wrapper.get('[data-act="assistant-add"]').trigger('click')
    await settle(s.wrapper)
    expect(writes()).toEqual([{ method: 'POST', url: `${T}/assistants`, body: { name: 'y'.repeat(100), person: 'm-juris' }, csrf: 'tok-1' }])

    await s.router.push('/people/assistants')
    await settle(s.wrapper)
    await s.wrapper.get('[data-act="assistant-add-open"]').trigger('click')
    await settle(s.wrapper)
    await s.wrapper.get('[data-assistant="for"]').setValue('m-juris')
    await s.wrapper.get('[data-block="assistant-add"] input').setValue('assistant 2')
    await s.wrapper.get('[data-act="assistant-add"]').trigger('click')
    await settle(s.wrapper)
    expect(said(s.wrapper)).toBe('Another assistant is already called «assistant 2».')
  })
})

describe('People & access › Assistants: one open', () => {
  it('shows its person with the day it was added, and nothing to change the person with', async () => {
    stub()
    const { wrapper } = await render({ url: '/people/assistants/a1' })
    const page = wrapper.get('[data-panel="assistant"]')
    expect(norm(page.get('[data-line="assistant-sub"]').text())).toBe('assistant · Anna Kalniņa’s · 2 apps connected')
    expect(page.findAll('b').map((b) => b.text())).toContain('Anna Kalniņa')
    expect(norm(page.text())).toContain('Anna Kalniņaadded 30 Oct')
    expect(norm(page.text())).toContain('Only Anna can connect an AI app to it. To give an assistant to someone else, add a new one for them.')
    expect(page.findAll('select').map((s) => s.attributes('data-act'))).toEqual(['assistant-give-role'])
  })

  it('renames it once, says so, and sends nothing for the same name; a taken name keeps the old one', async () => {
    stub({ [`PUT ${T}/assistants/a1/name`]: [{ status: 200, body: { changed: true } }, { status: 409, body: { code: 'err:membership:conflict' } }] })
    const s = await render({ url: '/people/assistants/a1' })
    const field = s.wrapper.get('input[data-assistant="rename"], [data-assistant="rename"] input')

    await s.wrapper.get('[data-act="assistant-rename"]').trigger('click')
    await settle(s.wrapper)
    expect(writes()).toEqual([])

    answers[`GET ${T}/assistants?whole=true`] = [{ status: 200, body: { items: assistants().map((a) => (a.id === 'a1' ? { ...a, name: 'Site log' } : a)) } }]
    await field.setValue('Site log')
    await s.wrapper.get('[data-act="assistant-rename"]').trigger('click')
    await settle(s.wrapper)
    expect(writes()).toEqual([{ method: 'PUT', url: `${T}/assistants/a1/name`, body: { name: 'Site log' }, csrf: 'tok-1' }])
    expect(said(s.wrapper)).toBe('Assistant 1 is now called «Site log». Every line it made shows the new name.')
    expect(s.wrapper.get('[data-panel="assistant"] h3').text()).toBe('Site log')

    await field.setValue('Assistant 2')
    await s.wrapper.get('[data-act="assistant-rename"]').trigger('click')
    await settle(s.wrapper)
    expect(said(s.wrapper)).toBe('Another assistant is already called «Assistant 2».')
    expect(s.wrapper.get('[data-panel="assistant"] h3').text()).toBe('Site log')
  })

  it('gives and takes its roles as a person’s, a held one not offered', async () => {
    stub({
      [`POST ${R}/users/a1/roles?tenant=W-1`]: { status: 200, body: {} },
      [`DELETE ${R}/users/a1/roles?roleId=r-asst&tenant=W-1`]: { status: 200, body: {} },
    })
    const s = await render({ url: '/people/assistants/a1' })
    expect(s.wrapper.findAll('[data-act="assistant-give-role"] option').find((o) => o.text() === 'Assistant')!.attributes('disabled')).toBeDefined()
    await s.wrapper.get('[data-act="assistant-give-role"]').setValue('r-guest')
    await settle(s.wrapper)
    expect(said(s.wrapper)).toBe('Assistant 1 now holds «Guest».')
    await s.wrapper.get('[aria-label="Take «Assistant» away"]').trigger('click')
    await settle(s.wrapper)
    expect(writes()).toEqual([
      { method: 'POST', url: `${R}/users/a1/roles?tenant=W-1`, body: { roleId: 'r-guest' }, csrf: 'tok-1' },
      { method: 'DELETE', url: `${R}/users/a1/roles?roleId=r-asst&tenant=W-1`, body: undefined, csrf: 'tok-1' },
    ])
  })

  it('signs one app out only once asked, leaving the other', async () => {
    stub({
      [`DELETE ${apps('A1')}/c1`]: { status: 204, body: undefined },
      [`GET ${apps('A1')}`]: [
        { status: 200, body: { connections: [connection('c2', now, null), connection('c1', longAgo, now)] } },
        { status: 200, body: { connections: [connection('c2', now, null)] } },
      ],
    })
    const s = await render({ url: '/people/assistants/a1' })
    const app = () => s.wrapper.get('[data-app="c1"]')
    expect(norm(app().text())).toContain('connected 30 Oct, ')
    expect(norm(s.wrapper.get('[data-app="c2"]').text())).toContain('not used yet')

    await app().get('[data-act="app-sign-out"]').trigger('click')
    await settle(s.wrapper)
    expect(norm(app().text())).toContain('Sign this Claude Code out?')
    expect(norm(app().text())).toContain('It stops at once, and so does anything it is doing through Assistant 1. Anna can connect it again by signing in at it.')
    await button(s.wrapper, 'Cancel')!.trigger('click')
    await settle(s.wrapper)
    expect(writes()).toEqual([])

    await app().get('[data-act="app-sign-out"]').trigger('click')
    await settle(s.wrapper)
    await button(s.wrapper, 'Sign it out')!.trigger('click')
    await settle(s.wrapper)
    expect(writes()).toEqual([{ method: 'DELETE', url: `${apps('A1')}/c1`, body: undefined, csrf: 'tok-1' }])
    expect(said(s.wrapper)).toMatch(/^The Claude Code connected 30 Oct, \d\d:\d\d was signed out\. It stopped at once\.$/)
    expect(s.wrapper.findAll('[data-app="c1"]')).toHaveLength(0)
    expect(s.wrapper.findAll('[data-app="c2"]')).toHaveLength(1)
  })

  it('says how an app is connected when none is', async () => {
    stub()
    const { wrapper } = await render({ url: '/people/assistants/a4' })
    expect(norm(wrapper.get('[data-note="no-app"]').text())).toBe('No app connected yet. Anna connects one by signing in at it and choosing Assistant 4.')
  })

  it('removes it only once asked: every app signed out first, then the register removes it', async () => {
    stub({
      [`DELETE ${apps('A3')}`]: { status: 204, body: undefined },
      [`DELETE ${R}/users/a3?tenant=W-1`]: { status: 200, body: {} },
      [`GET ${T}/assistants?whole=true`]: [
        { status: 200, body: { items: assistants() } },
        { status: 200, body: { items: assistants().map((a) => (a.id === 'a3' ? { ...a, status: 'revoked', removedAt: now } : a)) } },
      ],
    })
    const s = await render({ url: '/people/assistants/a3' })
    await button(s.wrapper, 'Remove Assistant 3')!.trigger('click')
    await settle(s.wrapper)
    expect(norm(s.wrapper.text())).toContain('Every app connected as it is signed out at once, and Juris can no longer choose it.')
    await button(s.wrapper, 'Cancel')!.trigger('click')
    await settle(s.wrapper)
    expect(writes()).toEqual([])

    await button(s.wrapper, 'Remove Assistant 3')!.trigger('click')
    await settle(s.wrapper)
    await button(s.wrapper, 'Remove it')!.trigger('click')
    await settle(s.wrapper)
    expect(writes().map((c) => `${c.method} ${c.url}`)).toEqual([`DELETE ${apps('A3')}`, `DELETE ${R}/users/a3?tenant=W-1`])
    expect(said(s.wrapper)).toBe('Assistant 3 was removed. Every app connected as it was signed out at once.')
    expect(norm(s.wrapper.get('[data-note="removed"]').text())).toContain('Nobody can use it any more.')
    expect(norm(s.wrapper.get('[data-note="removed"]').text())).toContain('✦ through Assistant 3')
  })

  it('still removes it when the sign-in authority does not answer, and says its apps stop at their next check', async () => {
    stub({
      [`DELETE ${apps('A3')}`]: { status: 502, body: { code: 'err:upstream:unavailable' } },
      [`DELETE ${R}/users/a3?tenant=W-1`]: { status: 200, body: {} },
    })
    const s = await render({ url: '/people/assistants/a3' })
    await button(s.wrapper, 'Remove Assistant 3')!.trigger('click')
    await settle(s.wrapper)
    await button(s.wrapper, 'Remove it')!.trigger('click')
    await settle(s.wrapper)
    expect(writes().map((c) => `${c.method} ${c.url}`)).toEqual([`DELETE ${apps('A3')}`, `DELETE ${R}/users/a3?tenant=W-1`])
    expect(said(s.wrapper)).toBe('Assistant 3 was removed. Its apps could not be signed out just now, so each stops at its next sign-in check, within minutes.')
  })

  it('removes nothing when the sign-in authority refuses the administrator', async () => {
    stub({ [`DELETE ${apps('A3')}`]: { status: 403, body: { code: 'err:connection:forbidden' } } })
    const s = await render({ url: '/people/assistants/a3' })
    await button(s.wrapper, 'Remove Assistant 3')!.trigger('click')
    await settle(s.wrapper)
    await button(s.wrapper, 'Remove it')!.trigger('click')
    await settle(s.wrapper)
    expect(writes().map((c) => `${c.method} ${c.url}`)).toEqual([`DELETE ${apps('A3')}`])
    expect(said(s.wrapper)).toContain('You are no longer an administrator of this workspace')
  })

  it('says its apps could not be read, and keeps the rest of the page', async () => {
    stub({ [`GET ${apps('A2')}`]: { status: 502, body: { code: 'err:upstream:unavailable' } } })
    const { wrapper } = await render({ url: '/people/assistants/a2' })
    expect(wrapper.get('[data-note="apps-unread"]').text()).toBe('Its connected apps could not be read just now.')
    expect(wrapper.findAll('[data-act="assistant-rename"]')).toHaveLength(1)
    expect(norm(rowOf(wrapper, 'Assistant 2').text())).toContain('—')
  })

  it('speaks Latvian', async () => {
    stub()
    const { wrapper } = await render({ url: '/people/assistants/a4', locale: 'lv' })
    expect(tabs(wrapper)).toContain('Asistenti 4')
    expect(norm(wrapper.get('[data-note="no-app"]').text())).toBe('Neviena lietotne vēl nav pievienota. Anna to pievieno, pierakstoties lietotnē un izvēloties Assistant 4.')
  })
})
