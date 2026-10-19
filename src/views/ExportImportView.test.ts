// Export / Import, driven the way a person drives it, against a stand-in
// coordinator that answers in the coordinator's own shapes, inside a stand-in
// host that hands over its own words.
//
// Two things are asserted every time: what went out on the wire — the file's own
// text for a preview, and that text with the preview's versions for an Apply —
// and what the person is told, in words, because a screen can send the right
// request and still say the wrong thing.
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import type { AdminOptions } from '../options'
import { configbyteScreens } from '../plugin'
import { useAdminSession, type Identity } from '../stores/session'
import { useTransfer } from '../stores/transfer'

import ExportImportView from './ExportImportView.vue'

interface Call {
  method: string
  url: string
  body: string
}

type Reply = { status: number; body: unknown; headers?: Record<string, string> }

const hostWords = {
  en: {
    host: {
      product: 'acme',
      never: 'Not in it, ever: orders, people, files.',
      orders: 'Order register',
      stock: 'Stock modules',
      kinds: 'Order kinds',
      priorities: 'Priorities',
      units: 'Units',
      flow: 'Workflow',
      rotas: 'Staff rotas',
      notice: 'its notice period changes',
      carries: { kinds: 'Order kinds · priorities', units: 'Units · stock fields', staff: 'Staff rotas', settings: 'One setting: the default kind' },
    },
  },
  lv: {
    host: {
      product: 'acme',
      never: 'Tajā nekad nav pasūtījumu, cilvēku, failu.',
      orders: 'Pasūtījumu reģistrs',
      stock: 'Krājumu moduļi',
      kinds: 'Pasūtījumu veidi',
      priorities: 'Prioritātes',
      units: 'Vienības',
      flow: 'Darbplūsma',
      rotas: 'Maiņas',
      notice: 'mainās tā brīdinājuma laiks',
      carries: { kinds: 'Pasūtījumu veidi · prioritātes', units: 'Vienības', staff: 'Maiņas', settings: 'Viens iestatījums' },
    },
  },
}

const onApplied = vi.fn()

const options: AdminOptions = {
  product: 'host.product',
  never: 'host.never',
  sections: {
    orders: { title: 'host.orders', parts: [{ key: 'kinds', word: 'host.kinds' }, { key: 'priorities', word: 'host.priorities' }], configures: ['orders/setup:import'] },
    stock: { title: 'host.stock', parts: [{ key: 'units', word: 'host.units' }], configures: ['stock/setup:import'] },
  },
  carries: [
    { section: 'orders', line: 'host.carries.kinds' },
    { section: 'stock', line: 'host.carries.units' },
    { section: 'staff', line: 'host.carries.staff' },
    { section: 'orders', line: 'host.carries.settings' },
  ],
  onApplied,
}

/** The same host with the membership register, which the screens word themselves. */
const withRegister: AdminOptions = { ...options, register: 'members' }

/** The same host whose parts say where an item is taken out of use, with the screens that are those places. */
const withAreas: AdminOptions = {
  ...options,
  sections: {
    orders: { ...options.sections.orders, parts: [{ key: 'kinds', word: 'host.kinds' }, { key: 'priorities', word: 'host.priorities', area: 'flow' }] },
    stock: { ...options.sections.stock, parts: [{ key: 'units', word: 'host.units', area: 'rotas' }] },
  },
  entries: [
    { key: 'flow', label: 'host.flow', route: 'flow', section: 'orders' },
    { key: 'rotas', label: 'host.rotas', route: 'rotas', section: 'stock' },
  ],
}

const FILE = JSON.stringify(
  { gmbConfig: '1.0', exportedAt: '2026-09-20T09:00:00Z', tenant: { id: 'W-1' }, contentHash: 'sha256:c0', sections: { orders: {}, stock: {} } },
  null,
  2,
)

/** A file that carries the given sections, from the given workspace (none when the id is empty). */
const fileOf = (sections: Record<string, unknown>, tenant = 'W-1') =>
  JSON.stringify({ gmbConfig: '1.0', exportedAt: '2026-09-20T09:00:00Z', ...(tenant ? { tenant: { id: tenant } } : {}), sections }, null, 2)

const report = (items: Record<string, unknown[]>, version = 'sha256:e0') => ({ applied: false, refused: false, version, ...items })

const cleanPreview = {
  dryRun: true,
  outcome: 'previewed',
  documentEdited: true,
  sections: {
    orders: { status: 'previewed', version: 'sha256:e0', report: report({ priorities: [{ key: 'rush', status: 'added' }, { key: 'normal', status: 'unchanged' }] }) },
    stock: { status: 'previewed', version: 'sha256:m0', report: report({ units: [{ key: 'pallet', status: 'added' }] }, 'sha256:m0') },
  },
}

const refusedPreview = {
  dryRun: true,
  outcome: 'refused',
  sections: {
    orders: {
      status: 'refused',
      version: 'sha256:e0',
      report: report({ kinds: [{ key: 'weight', status: 'refused', reason: 'config_key_conflict', detail: 'kind weight is a number here and a text in the file' }] }),
    },
    stock: { status: 'previewed', version: 'sha256:m0', report: report({ units: [{ key: 'pallet', status: 'added' }] }, 'sha256:m0') },
  },
}

const outcome = (o: string, ord: string, stock: string, ordItems: unknown[] = [{ key: 'rush', status: 'added' }]) => ({
  dryRun: false,
  outcome: o,
  sections: {
    orders: { status: ord, version: 'sha256:e1', report: report({ priorities: ordItems }, 'sha256:e1') },
    stock: { status: stock, version: 'sha256:m0', report: report({ units: [{ key: 'pallet', status: 'added' }] }, 'sha256:m0') },
  },
})

/** An answer whose one section carries what its owner said when it refused or failed the call. */
function withProblem<T extends { sections: Record<string, object> }>(answer: T, section: string, problem: Record<string, unknown>): T {
  return { ...answer, sections: { ...answer.sections, [section]: { ...answer.sections[section], problem } } }
}

/** A preview in which the orders' owner failed, and the stock's was clean. */
const failedPreview = (problem?: Record<string, unknown>) => {
  const base = {
    dryRun: true,
    outcome: 'failed',
    sections: {
      orders: { status: 'failed' },
      stock: { status: 'previewed', version: 'sha256:m0', report: report({ units: [{ key: 'pallet', status: 'added' }] }, 'sha256:m0') },
    },
  }

  return problem ? withProblem(base, 'orders', problem) : base
}

let calls: Call[] = []

/** Every file the screen handed the browser to save, by the name it was saved under. */
function watchDownloads(): string[] {
  const saved: string[] = []
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:stand-in') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push(this.download)
  })

  return saved
}

/** A stand-in coordinator: the dry run answers `preview`, the Apply answers `apply`. */
function stubCoordinator(preview: Reply, apply?: Reply, exportReply?: Reply) {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({ method, url, body: typeof init?.body === 'string' ? init.body : '' })
      let reply: Reply = { status: 404, body: {} }
      if (url.endsWith('/config/import?dryRun=true')) reply = preview
      else if (url.endsWith('/config/import')) reply = apply ?? { status: 500, body: {} }
      else if (url.endsWith('/config/export')) reply = exportReply ?? { status: 500, body: {} }
      const text = JSON.stringify(reply.body)

      return {
        ok: reply.status < 400,
        status: reply.status,
        headers: new Headers(reply.headers ?? {}),
        json: async () => reply.body,
        text: async () => text,
        blob: async () => Object.assign(new Blob([text], { type: 'application/json' }), { text: async () => text }),
      } as unknown as Response
    }),
  )
}

async function render(locale: 'en' | 'lv' = 'en', order = ['orders', 'stock'], host: AdminOptions = options, me: Partial<Identity> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useAdminSession()
  session.order = order
  session.me = {
    subject: 'sub:L',
    name: 'Laura Zariņa',
    loginMethod: 'an ID card',
    loa: 'high',
    tenant: 'W-1',
    workspace: { name: 'Go Make Bytes', entitlements: [] },
    sections: {},
    presentation: { displayName: 'Kalns', locale, personLocale: null, deploymentLocale: 'en' },
    ...me,
  }
  const blank = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/export-import', name: 'export-import', component: ExportImportView },
      { path: '/elsewhere', name: 'elsewhere', component: blank },
      { path: '/history', name: 'configbyte-history', component: blank },
      { path: '/flow', name: 'flow', component: blank },
      { path: '/rotas', name: 'rotas', component: blank },
    ],
  })
  await router.push('/export-import')
  await router.isReady()
  const i18n = createI18n({ legacy: false, locale, fallbackLocale: 'en', messages: structuredClone(hostWords) })
  const wrapper = mount({ template: '<router-view />' }, { global: { plugins: [pinia, router, i18n, configbyteScreens(i18n, host)] } })
  await settle(wrapper)

  return { wrapper, router }
}

async function settle(wrapper: { vm: { $nextTick: () => Promise<unknown> } }) {
  for (let pass = 0; pass < 4; pass += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()
  }
}

async function chooseFile(wrapper: ReturnType<typeof mount>, text = FILE, name = 'configuration-2026-09-20.json') {
  // jsdom's File cannot read itself back; a browser's can, so the stand-in does.
  const file = Object.assign(new File([text], name, { type: 'application/json' }), { text: async () => text })
  const input = wrapper.get('input[type="file"]').element as HTMLInputElement
  Object.defineProperty(input, 'files', { configurable: true, get: () => [file] })
  input.dispatchEvent(new Event('change'))
  await settle(wrapper)
}

const button = (wrapper: ReturnType<typeof mount>, words: string) => {
  const found = wrapper.findAll('button').find((b) => b.text() === words)
  if (!found) throw new Error(`no button "${words}" in: ${wrapper.findAll('button').map((b) => b.text()).join(' | ')}`)

  return found
}

/** Choose a file, then Apply the preview. */
async function chooseAndApply(wrapper: ReturnType<typeof mount>, text = FILE) {
  await chooseFile(wrapper, text)
  await button(wrapper, 'Apply this file').trigger('click')
  await settle(wrapper)
}

/**
 * The rows of the preview's list as their cells read, the part first when the list
 * has one. A row drawn by name reads "name key": the two are drawn apart.
 */
const cells = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('tbody tr').map((tr) =>
    tr.findAll('td').map((td) => (td.find('span.font-semibold').exists() ? td.findAll('span').map((s) => s.text()).join(' ') : td.text())),
  )
/** The name each row of the list is drawn by, empty for a row drawn by its key alone. */
const names = (wrapper: ReturnType<typeof mount>) => wrapper.findAll('tbody tr').map((tr) => (tr.find('span.font-semibold').exists() ? tr.get('span.font-semibold').text() : ''))
/** What the Apply's result lines say, one per section. */
const resultLines = (wrapper: ReturnType<typeof mount>) => wrapper.findAll('[data-outcome] [data-lines] li').map((li) => li.text().replace(/\s+/g, ' '))
const carry = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('[data-carry]').map((g) => [g.attributes('data-carry'), g.get('b').text(), g.findAll('li').map((li) => li.text())])

beforeEach(() => {
  calls = []
  onApplied.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Export / Import', () => {
  it('opens on the two cards and nothing else — no file chosen, nothing asked yet', async () => {
    stubCoordinator({ status: 200, body: cleanPreview })
    const { wrapper } = await render()
    expect(wrapper.text()).toContain('Your whole configuration as one file')
    expect(wrapper.text()).toContain('Drop a file here, or click to choose one')
    expect(wrapper.text()).toContain('configuration-….json')
    expect(wrapper.text()).not.toContain('What this file would do')
    expect(calls).toEqual([])
  })

  it('is called Export & import', async () => {
    stubCoordinator({ status: 200, body: cleanPreview })
    expect((await render()).wrapper.get('h1').text()).toBe('Export & import')
    expect((await render('lv')).wrapper.get('h1').text()).toBe('Eksports un imports')
  })

  // The card lists the host's lines under the name of the area they describe, in
  // the coordinator's order and not the host's, for the sections this deployment
  // runs — a line for a section it does not run is not shown.
  it('lists what the file carries by area, in the coordinator’s order, only for the sections this deployment runs', async () => {
    stubCoordinator({ status: 200, body: cleanPreview })
    const { wrapper } = await render('en', ['stock', 'orders'])
    expect(carry(wrapper)).toEqual([
      ['stock', 'Stock modules', ['Units · stock fields']],
      ['orders', 'Order register', ['Order kinds · priorities', 'One setting: the default kind']],
    ])
    expect(wrapper.get('[data-never]').text()).toBe('Not in it, ever: orders, people, files.')
    expect(wrapper.text()).not.toContain('Staff rotas')

    const without = await render('en', ['orders'])
    expect(carry(without.wrapper)).toEqual([['orders', 'Order register', ['Order kinds · priorities', 'One setting: the default kind']]])
  })

  it('gives the register its own group, and says what is not in the file today, only when the deployment runs it', async () => {
    stubCoordinator({ status: 200, body: cleanPreview })
    const { wrapper } = await render('en', ['orders', 'stock', 'members'], withRegister)
    expect(carry(wrapper).map((g) => g[0])).toEqual(['orders', 'stock', 'members'])
    expect(carry(wrapper)[2]).toEqual(['members', 'People & access', ['The list of services and their boxes this deployment runs on']])
    expect(wrapper.get('[data-not-today]').text()).toBe('Not in it today: roles, user types, the chart of authority.')
    // The line that says what is never in it comes first, and the one for today after it.
    const text = wrapper.text()
    expect(text.indexOf('Not in it, ever')).toBeLessThan(text.indexOf('Not in it today'))

    // Neither is drawn without a register, nor where the deployment does not run it.
    for (const [host, order] of [
      [options, ['orders', 'stock', 'members']],
      [withRegister, ['orders', 'stock']],
    ] as const) {
      const plain = await render('en', [...order], host)
      expect(carry(plain.wrapper).map((g) => g[0])).toEqual(['orders', 'stock'])
      expect(plain.wrapper.find('[data-not-today]').exists()).toBe(false)
      expect(plain.wrapper.text()).not.toContain('their boxes')
    }
  })

  it('says the register’s line in Latvian, in the screens’ own words for a service and a box', async () => {
    stubCoordinator({ status: 200, body: cleanPreview })
    const { wrapper } = await render('lv', ['orders', 'stock', 'members'], withRegister)
    expect(carry(wrapper)[2]).toEqual(['members', 'Cilvēki un piekļuve', ['Servisu un to atļauju saraksts, ar ko darbojas šis izvietojums']])
    expect(wrapper.get('[data-not-today]').text()).toBe('Šobrīd tajā nav: lomu, lietotāju veidu, pilnvaru shēmas.')
  })

  it("previews the file's own text, and shows what it would do", async () => {
    stubCoordinator({ status: 200, body: cleanPreview })
    const { wrapper } = await render()
    await chooseFile(wrapper)
    const dry = calls.find((c) => c.url === '/api/configbyte/v1/config/import?dryRun=true')
    expect(dry?.method).toBe('POST')
    expect(dry?.body).toBe(FILE)
    const text = wrapper.text()
    expect(text).toContain('What this file would do')
    expect(text).toContain('configuration-2026-09-20.json')
    expect(text).toContain('edited since export')
    expect(text).toContain('rush')
    expect(text).toContain('Order register')
    expect(text).not.toContain('not taken')
    expect(button(wrapper, 'Apply this file').attributes('disabled')).toBeUndefined()
  })

  // The version does its job on the wire and is never on screen.
  it('shows the version nowhere, although the preview answered two', async () => {
    stubCoordinator({ status: 200, body: cleanPreview })
    const { wrapper } = await render()
    await chooseFile(wrapper)
    expect(wrapper.html()).not.toContain('sha256:')
  })

  it("applies the same text with the preview's versions, says it landed, and tells the host", async () => {
    stubCoordinator({ status: 200, body: cleanPreview }, { status: 200, body: outcome('applied', 'applied', 'applied') })
    const { wrapper } = await render()
    await chooseAndApply(wrapper)
    const apply = calls.find((c) => c.method === 'POST' && c.url === '/api/configbyte/v1/config/import')
    expect(apply?.body.startsWith(FILE.slice(0, FILE.lastIndexOf('}')).trimEnd())).toBe(true)
    expect(JSON.parse(apply!.body).expect).toEqual({ orders: 'sha256:e0', stock: 'sha256:m0' })
    expect(wrapper.text()).toContain('Applied. The whole file is in force.')
    expect(wrapper.text()).toContain('1 change landed, recorded in History under your name')
    expect(onApplied).toHaveBeenCalledTimes(1)
    expect(button(wrapper, 'Import another file').exists()).toBe(true)
  })

  it('keeps Apply shut while any item is refused, says the whole file waits, and tells the host nothing', async () => {
    stubCoordinator({ status: 200, body: refusedPreview })
    const { wrapper } = await render()
    await chooseFile(wrapper)
    expect(button(wrapper, 'Apply this file').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('1 item was refused, so this file cannot be applied — none of it.')
    expect(wrapper.text()).toContain('clean — lands only with the rest')
    // The refusal is said in words that tell what to do, not in the service's own sentence.
    expect(wrapper.text()).toContain('It already means something else here')
    expect(wrapper.text()).not.toContain('kind weight is a number here')
    await button(wrapper, 'Apply this file').trigger('click')
    expect(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/config/import'))).toEqual([])
    expect(onApplied).not.toHaveBeenCalled()
  })

  it('says the same thing in Latvian, with the host words in Latvian too', async () => {
    stubCoordinator({ status: 200, body: refusedPreview })
    const { wrapper } = await render('lv')
    await chooseFile(wrapper)
    expect(wrapper.text()).toContain('1 vienums tika atteikts, tāpēc šo failu nevar piemērot')
    expect(wrapper.text()).toContain('Pasūtījumu reģistrs')
    expect(wrapper.text()).toContain('Pasūtījumu veidi · prioritātes')
    expect(button(wrapper, 'Piemērot šo failu').attributes('disabled')).toBeDefined()
  })

  // Latvian counts agree with their number — one is singular, two is not — which
  // only shows when both numbers are on screen.
  it('agrees a count with its number in Latvian', async () => {
    stubCoordinator({ status: 200, body: cleanPreview })
    const { wrapper } = await render('lv')
    await chooseFile(wrapper)
    const text = wrapper.text()
    expect(text).toContain('2 pievienoti')
    expect(text).toContain('1 nemainīts')
    expect(text).not.toContain('1 nemainīti')
  })

  it.each([
    [412, 'err:config:versionMoved'],
    [428, 'err:config:versionRequired'],
  ])('reads a %i as "preview again", and previews the same file again when asked', async (status, code) => {
    stubCoordinator({ status: 200, body: cleanPreview }, { status, body: { code, status, detail: 'nothing was written' } })
    const { wrapper } = await render()
    await chooseAndApply(wrapper)
    expect(wrapper.text()).toContain('The configuration changed after your preview.')
    expect(wrapper.text()).toContain('Preview again to see what this file would do now')
    expect(wrapper.find('[data-stale]').exists()).toBe(true)
    expect(onApplied).not.toHaveBeenCalled()
    const before = calls.filter((c) => c.url.endsWith('?dryRun=true')).length
    await button(wrapper, 'Preview again').trigger('click')
    await settle(wrapper)
    const dry = calls.filter((c) => c.url.endsWith('?dryRun=true'))
    expect(dry.length).toBe(before + 1)
    expect(dry[dry.length - 1]!.body).toBe(FILE)
    expect(wrapper.text()).not.toContain('The configuration changed after your preview.')
  })

  it('shows what an Apply refused, and withholds the clean section beside it', async () => {
    const refusedAtApply = outcome('refused', 'refused', 'withheld', [
      { key: 'assembly', status: 'refused', reason: 'config_in_use', detail: '3 orders of Assembly are open; move them on the screen first' },
    ])
    stubCoordinator({ status: 200, body: cleanPreview }, { status: 200, body: refusedAtApply })
    const { wrapper } = await render()
    await chooseAndApply(wrapper)
    const text = wrapper.text()
    expect(text).toContain('Refused at Apply.')
    expect(text).toContain('It is still in use here, so the file cannot take it away.')
    expect(text).toContain('withheld')
    expect(button(wrapper, 'Preview again').exists()).toBe(true)
    expect(onApplied).not.toHaveBeenCalled()
  })

  // A partial import leads forward — preview again to finish it — with the state
  // in force downloadable beside it.
  it('leads a partial import forward, and offers the configuration as it is now', async () => {
    stubCoordinator(
      { status: 200, body: cleanPreview },
      { status: 200, body: outcome('partial', 'applied', 'failed') },
      { status: 200, body: { gmbConfig: '1.0', sections: { orders: {} } }, headers: { 'Content-Disposition': 'attachment; filename="configuration-2026-09-23.json"' } },
    )
    const saved = watchDownloads()
    const { wrapper } = await render()
    await chooseAndApply(wrapper)
    const text = wrapper.text()
    expect(text).toContain('Only part of this file is in force.')
    expect(text).toContain('applying it completes the file')
    expect(text).toContain('not restored')
    expect(onApplied).toHaveBeenCalledTimes(1)
    expect(wrapper.find('a[data-link="history"]').exists()).toBe(false)
    await button(wrapper, 'Download the configuration as it is now').trigger('click')
    await settle(wrapper)
    expect(calls.some((c) => c.url === '/api/configbyte/v1/config/export')).toBe(true)
    expect(saved).toEqual(['configuration-2026-09-23.json'])
  })

  it('refuses a file that is not a configuration document, in its own words, and writes nothing', async () => {
    stubCoordinator({ status: 422, body: { code: 'err:config:badDocument', detail: 'the document is not valid JSON' } })
    const { wrapper } = await render()
    await chooseFile(wrapper, 'not json', 'notes.json')
    expect(wrapper.text()).toContain('This file cannot be read as a configuration document. Nothing was written.')
    expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('Apply this file')
  })

  it('says a dropped file of another kind was not taken, and asks nothing', async () => {
    stubCoordinator({ status: 200, body: cleanPreview })
    const { wrapper } = await render()
    await wrapper.get('label').trigger('drop', { dataTransfer: { files: [new File(['x'], 'photo.png', { type: 'image/png' })] } })
    await settle(wrapper)
    expect(wrapper.text()).toContain('That is not a configuration file')
    expect(calls).toEqual([])
  })

  it('downloads the export under the name the coordinator gives it, and names the areas it carries in the coordinator’s order', async () => {
    stubCoordinator({ status: 200, body: cleanPreview }, undefined, {
      status: 200,
      body: { gmbConfig: '1.0', sections: { orders: {}, stock: {} } },
      headers: { 'Content-Disposition': 'attachment; filename="configuration-2026-09-23.json"' },
    })
    const saved = watchDownloads()
    const { wrapper } = await render('en', ['stock', 'orders'])
    await button(wrapper, 'Download configuration').trigger('click')
    await settle(wrapper)
    expect(calls.map((c) => [c.method, c.url])).toEqual([['GET', '/api/configbyte/v1/config/export']])
    expect(saved).toEqual(['configuration-2026-09-23.json'])
    const said = wrapper.get('[role="status"]').text().replace(/\s+/g, ' ')
    expect(said).toMatch(/^configuration-2026-09-23\.json\s*·\s*[\d.]+ k?B\s*·\s*Stock modules, Order register$/)
  })

  it('names an area the coordinator does not order after the ones it does, sorted, and by the name it arrived with', async () => {
    stubCoordinator({ status: 200, body: cleanPreview }, undefined, {
      status: 200,
      body: { gmbConfig: '1.0', sections: { zeta: {}, orders: {}, alpha: {} } },
      headers: { 'Content-Disposition': 'attachment; filename="c.json"' },
    })
    watchDownloads()
    const { wrapper } = await render()
    await button(wrapper, 'Download configuration').trigger('click')
    await settle(wrapper)
    expect(wrapper.get('[role="status"]').text()).toContain('Order register, alpha, zeta')
  })

  it('forgets the file and its versions when the person leaves the screen', async () => {
    stubCoordinator({ status: 200, body: cleanPreview })
    const { wrapper, router } = await render()
    await chooseFile(wrapper)
    expect(useTransfer().fileText).toBe(FILE)
    await router.push('/elsewhere')
    await settle(wrapper)
    expect(useTransfer().fileText).toBe('')
    expect(useTransfer().preview).toBeNull()
  })
})

describe('Export / Import › where the file came from', () => {
  it('says a file from this workspace is, and gives no id', async () => {
    stubCoordinator({ status: 200, body: cleanPreview })
    const { wrapper } = await render()
    await chooseFile(wrapper, fileOf({ orders: {} }, 'W-1'))
    expect(wrapper.text()).toContain('from this workspace')
    expect(wrapper.text()).toContain('exported 2026-09-20')
    expect(wrapper.text()).not.toContain('W-1')
  })

  it('says a file from another workspace is, and gives no id', async () => {
    stubCoordinator({ status: 200, body: cleanPreview })
    const { wrapper } = await render()
    await chooseFile(wrapper, fileOf({ orders: {} }, 'W-9'))
    expect(wrapper.text()).toContain('from another workspace')
    expect(wrapper.text()).not.toContain('from this workspace')
    expect(wrapper.text()).not.toContain('W-9')
  })

  // The facts under the name are one line a narrow screen cuts off; the chip's badge is a line of its own.
  it('says a file is from another workspace on the chip’s own line, and that it was edited among the facts', async () => {
    stubCoordinator({ status: 200, body: cleanPreview })
    const { wrapper } = await render()
    await chooseFile(wrapper, fileOf({ orders: {} }, 'W-9'))
    const lines = wrapper.findAll('span.block').map((s) => s.text().replace(/\s+/g, ' '))
    expect(lines).toContain('from another workspace')
    expect(lines.some((l) => l.includes('edited since export') && l.includes('exported 2026-09-20'))).toBe(true)
    // From this workspace, the badge says it was edited, as before.
    await chooseFile(wrapper, fileOf({ orders: {} }, 'W-1'))
    const again = wrapper.findAll('span.block').map((s) => s.text().replace(/\s+/g, ' '))
    expect(again).toContain('edited since export')
    expect(again.some((l) => l.includes('from this workspace') && l.includes('exported 2026-09-20'))).toBe(true)
  })

  it('says nothing of it when the file names no workspace', async () => {
    stubCoordinator({ status: 200, body: cleanPreview })
    const { wrapper } = await render()
    await chooseFile(wrapper, fileOf({ orders: {} }, ''))
    expect(wrapper.text()).toContain('exported 2026-09-20')
    expect(wrapper.text()).not.toContain('from this workspace')
    expect(wrapper.text()).not.toContain('from another workspace')
  })

  it('says it in Latvian', async () => {
    stubCoordinator({ status: 200, body: cleanPreview })
    const { wrapper } = await render('lv')
    await chooseFile(wrapper, fileOf({ orders: {} }, 'W-9'))
    expect(wrapper.text()).toContain('no citas darbvietas')
    await chooseFile(wrapper, fileOf({ orders: {} }, 'W-1'))
    expect(wrapper.text()).toContain('no šīs darbvietas')
  })
})

describe('Export / Import › items by their names from the file, changes in words', () => {
  const items = {
    orders: {
      kinds: [{ key: 'assembly', label: 'Assembly', status: 'retired' }],
      priorities: [{ number: 7, label: 'Rush', labels: { lv: 'Steidzami' } }],
      links: [{ entityKind: 'order', number: 1, label: 'Order link' }],
    },
  }
  const preview = {
    dryRun: true,
    outcome: 'previewed',
    sections: {
      orders: {
        status: 'previewed',
        version: 'sha256:e0',
        report: report({
          kinds: [{ key: 'assembly', status: 'changed', detail: 'label, status' }],
          priorities: [{ key: '7', status: 'added' }, { key: 'normal', status: 'unchanged' }],
          links: [{ key: 'order/1', status: 'changed', detail: 'noticeDays' }],
        }),
      },
    },
  }
  const host: AdminOptions = {
    ...options,
    transfer: {
      find: (_section, part, key, list) => (part === 'links' ? (list as Record<string, unknown>[]).find((i) => `${String(i.entityKind)}/${String(i.number)}` === key) : undefined),
      members: { noticeDays: 'host.notice' },
    },
  }

  it('draws a row by the name the file gives it, found by its key, its number and the host’s own way, and says the change in words', async () => {
    stubCoordinator({ status: 200, body: preview })
    const { wrapper } = await render('en', ['orders', 'stock'], host)
    await chooseFile(wrapper, fileOf(items))
    expect(names(wrapper)).toEqual(['«Assembly»', '«Rush»', '«Order link»'])
    expect(cells(wrapper)).toEqual([
      ['Order kinds', '«Assembly» assembly', 'changed', 'its name changes, taken out of use'],
      ['Priorities', '«Rush» 7', 'added', 'new in the file'],
      ['links', '«Order link» order/1', 'changed', 'its notice period changes'],
    ])
    // What does not change stays folded, counted in the part's own words.
    expect(wrapper.text()).toContain('1 unchanged: Priorities 1')
    // The column holds the items by name, so it is headed as the items, not as their keys.
    expect(wrapper.findAll('thead th').map((th) => th.text())).toEqual(['part', 'item', 'what happens', 'why / what moves'])
  })

  it('names a row in the language the screen speaks', async () => {
    stubCoordinator({ status: 200, body: preview })
    const { wrapper } = await render('lv', ['orders', 'stock'], host)
    await chooseFile(wrapper, fileOf(items))
    expect(names(wrapper)).toEqual(['«Assembly»', '«Steidzami»', '«Order link»'])
    expect(cells(wrapper)[2]![3]).toBe('mainās tā brīdinājuma laiks')
  })

  it('draws a row by its key alone when the file has no name for it', async () => {
    stubCoordinator({ status: 200, body: preview })
    const { wrapper } = await render()
    await chooseFile(wrapper, fileOf({ orders: {} }))
    expect(names(wrapper)).toEqual(['', '', ''])
    expect(cells(wrapper)[0]![1]).toBe('assembly')
  })

  it('takes the host’s words for a row it describes and keeps the screens’ own for the rest', async () => {
    stubCoordinator({ status: 200, body: preview })
    const described: AdminOptions = {
      ...host,
      transfer: { ...host.transfer, describe: (row) => (row.key === '7' ? { name: 'Rush order', change: 'a new urgency', part: 'Urgency' } : null) },
    }
    const { wrapper } = await render('en', ['orders', 'stock'], described)
    await chooseFile(wrapper, fileOf(items))
    expect(cells(wrapper)[1]).toEqual(['Urgency', 'Rush order 7', 'added', 'a new urgency'])
    expect(cells(wrapper)[0]![3]).toBe('its name changes, taken out of use')
  })

  it('says a skipped item is not taken, tallies it only when there is one, and words the deployment’s own list', async () => {
    const skipping = {
      dryRun: true,
      outcome: 'previewed',
      sections: {
        orders: {
          status: 'previewed',
          version: 'sha256:e0',
          report: report({
            kinds: [{ key: 'assembly', status: 'skipped', reason: 'config_deployment_owned', detail: 'belongs to the deployment' }],
            priorities: [{ key: 'rush', status: 'added' }],
          }),
        },
      },
    }
    stubCoordinator({ status: 200, body: skipping })
    const { wrapper } = await render()
    await chooseFile(wrapper)
    expect(cells(wrapper)[0]).toEqual([
      'Order kinds',
      'assembly',
      'not taken',
      "This deployment's list says otherwise; only whoever runs the deployment changes it.",
    ])
    expect(wrapper.text()).toContain('1 not taken')
    expect(button(wrapper, 'Apply this file').attributes('disabled')).toBeUndefined()
  })
})

describe('Export / Import › the register’s own parts', () => {
  const register = {
    services: [
      {
        key: 'orders',
        displayName: 'Order service',
        roles: [{ group: 'orders', level: 'clerk', description: '' }],
        permissions: [{ feature: 'order', act: 'view', labels: { lv: 'Redzēt pasūtījumus' }, description: 'See orders' }],
      },
    ],
  }
  const members = {
    dryRun: true,
    outcome: 'previewed',
    sections: {
      members: {
        status: 'previewed',
        version: 'sha256:r0',
        report: report(
          {
            services: [{ key: 'orders', status: 'unchanged' }, { key: 'stock', status: 'unchanged' }],
            roles: [{ key: 'orders orders:clerk', status: 'added' }],
            permissions: [{ key: 'orders/order:view', status: 'changed', detail: 'description' }],
          },
          'sha256:r0',
        ),
      },
    },
  }
  const order = ['orders', 'stock', 'members']

  it('names a role rung and a box from the file, in the screens’ own words, and counts what is folded by part', async () => {
    stubCoordinator({ status: 200, body: members })
    const { wrapper } = await render('en', order, withRegister)
    await chooseFile(wrapper, fileOf({ members: register }))
    expect(wrapper.text()).toContain('People & access')
    expect(cells(wrapper)).toEqual([
      ['Role rungs', '«orders clerk» of Order service orders orders:clerk', 'added', 'new in the file'],
      ['Boxes', '«See orders» orders/order:view', 'changed', 'its description changes'],
    ])
    expect(wrapper.text()).toContain('2 unchanged: 2 services')
  })

  it('says it in Latvian: the part words, the box by its Latvian name, the count by its number', async () => {
    stubCoordinator({ status: 200, body: members })
    const { wrapper } = await render('lv', order, withRegister)
    await chooseFile(wrapper, fileOf({ members: register }))
    expect(wrapper.text()).toContain('Cilvēki un piekļuve')
    expect(cells(wrapper).map((c) => [c[0], c[1]])).toEqual([
      ['Lomu pakāpes', '«orders clerk» — Order service orders orders:clerk'],
      ['Atļaujas', '«Redzēt pasūtījumus» orders/order:view'],
    ])
    expect(wrapper.text()).toContain('2 nemainīti: 2 servisi')
  })
})

describe('Export / Import › a file that names the workspace', () => {
  const owned = {
    dryRun: true,
    outcome: 'previewed',
    sections: {
      members: {
        status: 'previewed',
        version: 'sha256:r0',
        report: report(
          {
            services: [{ key: 'orders', status: 'unchanged' }],
            workspace: [
              { key: 'displayName', status: 'skipped', reason: 'config_workspace_owned', detail: 'the workspace owns it' },
              { key: 'directory', status: 'skipped', reason: 'config_workspace_owned', detail: 'the workspace owns it' },
            ],
          },
          'sha256:r0',
        ),
      },
    },
  }
  const old = fileOf({ members: { services: [], tenant: { displayName: 'Kalnu Metāls', directory: { issuer: 'https://login.example' } } } })
  const order = ['orders', 'stock', 'members']

  it('says what the file names and what the workspace keeps, and draws neither as a row nor counts them', async () => {
    stubCoordinator({ status: 200, body: owned })
    const { wrapper } = await render('en', order, withRegister)
    await chooseFile(wrapper, old)
    expect(wrapper.text().replace(/\s+/g, ' ')).toContain(
      'This file names the workspace «Kalnu Metāls» and a corporate login. Neither is taken from a file: this workspace keeps «Go Make Bytes» and its own corporate login.',
    )
    expect(cells(wrapper)).toEqual([])
    expect(wrapper.text()).not.toContain('displayName')
    expect(wrapper.text()).not.toContain('not taken')
    expect(wrapper.text()).toContain('1 unchanged')
    expect(button(wrapper, 'Apply this file').exists()).toBe(true)
  })

  it('says the workspace keeps its own name when the workspace could not be read', async () => {
    stubCoordinator({ status: 200, body: owned })
    const { wrapper } = await render('en', order, withRegister, { workspace: null })
    await chooseFile(wrapper, old)
    expect(wrapper.text().replace(/\s+/g, ' ')).toContain(
      'Neither is taken from a file: this workspace keeps its own name and its own corporate login.',
    )
  })

  it('says it in Latvian', async () => {
    stubCoordinator({ status: 200, body: owned })
    const { wrapper } = await render('lv', order, withRegister)
    await chooseFile(wrapper, old)
    expect(wrapper.text().replace(/\s+/g, ' ')).toContain(
      'Šis fails min darbvietu «Kalnu Metāls» un uzņēmuma pieteikšanos. Neviens no tiem netiek ņemts no faila: šī darbvieta patur «Go Make Bytes» un savu uzņēmuma pieteikšanos.',
    )
  })
})

describe('Export / Import › an area that refuses or does not answer', () => {
  it.each([
    [{ title: 'Forbidden', status: 403, code: 'err:request:forbidden' }, 'Order register refused this file: you do not hold the box that imports it'],
    [
      { title: 'Unprocessable', status: 422, detail: 'kinds must be a list', code: 'err:config:config_bad_document' },
      'Order register refused this file: its part of the file is out of shape (kinds must be a list)',
    ],
    [{ title: 'Conflict', status: 409, detail: 'a newer version is held', code: 'err:x' }, 'Order register refused this file: Conflict (a newer version is held)'],
  ])('names the area and its reason when its owner refused (%j), and stops the preview with it', async (problem, note) => {
    stubCoordinator({ status: 200, body: failedPreview(problem) })
    const { wrapper } = await render()
    await chooseFile(wrapper)
    expect(wrapper.text()).toContain(note)
    expect(wrapper.text()).toContain('refused')
    expect(wrapper.text()).not.toContain('did not answer')
    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Order register refused this file, so none of it can be applied. Change what the reason says, then drop the file again.',
    )
    expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('Apply this file')
  })

  it.each([
    ['unreachable', { status: 502, code: 'err:upstream:unavailable' }],
    ['failing itself', { title: 'Broken', status: 500, code: 'err:x' }],
    ['silent', undefined],
  ])('says the area did not answer when its owner was %s', async (_how, problem) => {
    stubCoordinator({ status: 200, body: failedPreview(problem) })
    const { wrapper } = await render()
    await chooseFile(wrapper)
    expect(wrapper.text()).toContain('Order register did not answer, so its part of the file could not be judged.')
    expect(wrapper.text()).not.toContain('refused')
    expect(wrapper.get('[role="alert"]').text()).toBe('Order register did not answer, so this file could not be judged. Nothing was written. Preview again in a moment.')
    expect(button(wrapper, 'Preview again').exists()).toBe(true)
  })

  it('says it in Latvian', async () => {
    stubCoordinator({ status: 200, body: failedPreview({ title: 'Forbidden', status: 403 }) })
    const { wrapper } = await render('lv')
    await chooseFile(wrapper)
    expect(wrapper.text()).toContain('Pasūtījumu reģistrs atteica šo failu: jums nav atļaujas, kas ļauj to importēt')
    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Pasūtījumu reģistrs atteica šo failu, tāpēc nevienu tā daļu nevar piemērot. Mainiet to, ko norāda iemesls, un nometiet failu vēlreiz.',
    )
  })

  it('says at Apply that a part could not write: its service did not answer, or it refused', async () => {
    const down = withProblem(outcome('failed', 'failed', 'withheld'), 'orders', { status: 502, code: 'err:upstream:unavailable' })
    stubCoordinator({ status: 200, body: cleanPreview }, { status: 200, body: down })
    const first = await render()
    await chooseAndApply(first.wrapper)
    expect(first.wrapper.text()).toContain('could not write')
    expect(resultLines(first.wrapper)[0]).toContain('its service did not answer. Nothing of this part was written.')

    const refused = withProblem(outcome('failed', 'failed', 'withheld'), 'orders', { title: 'Forbidden', status: 403 })
    stubCoordinator({ status: 200, body: cleanPreview }, { status: 200, body: refused })
    const second = await render()
    await chooseAndApply(second.wrapper)
    expect(resultLines(second.wrapper)[0]).toContain('could not write')
    expect(resultLines(second.wrapper)[0]).toContain('it refused its part: you do not hold the box that imports it. Nothing of this part was written.')
  })
})

describe('Export / Import › after an Apply that landed', () => {
  it('leads to History at the person on the first line that changed something, and nowhere else', async () => {
    stubCoordinator({ status: 200, body: cleanPreview }, { status: 200, body: outcome('applied', 'applied', 'applied') })
    const { wrapper, router } = await render()
    await chooseAndApply(wrapper)
    const links = wrapper.findAll('a[data-link="history"]')
    expect(links).toHaveLength(1)
    expect(links[0]!.text()).toBe('See them in History →')
    expect(resultLines(wrapper)[0]).toContain('See them in History →')
    expect(resultLines(wrapper)[1]).not.toContain('See them in History')
    await links[0]!.trigger('click')
    await settle(wrapper)
    expect(router.currentRoute.value.name).toBe('configbyte-history')
    expect(router.currentRoute.value.query).toEqual({ who: 'sub:L' })
  })

  it('puts it on a later line when the first changed nothing, and nowhere when nothing changed', async () => {
    const quiet = outcome('applied', 'applied', 'applied', [{ key: 'normal', status: 'unchanged' }])
    stubCoordinator({ status: 200, body: cleanPreview }, { status: 200, body: quiet })
    const { wrapper } = await render()
    await chooseAndApply(wrapper)
    expect(resultLines(wrapper)[0]).not.toContain('See them in History')
    expect(resultLines(wrapper)[1]).toContain('See them in History →')

    const nothing = {
      dryRun: false,
      outcome: 'applied',
      sections: { orders: { status: 'applied', report: report({ priorities: [{ key: 'normal', status: 'unchanged' }] }) } },
    }
    stubCoordinator({ status: 200, body: cleanPreview }, { status: 200, body: nothing })
    const second = await render()
    await chooseAndApply(second.wrapper)
    expect(second.wrapper.find('a[data-link="history"]').exists()).toBe(false)
  })

  it('says it in Latvian', async () => {
    stubCoordinator({ status: 200, body: cleanPreview }, { status: 200, body: outcome('applied', 'applied', 'applied') })
    const { wrapper } = await render('lv')
    await chooseFile(wrapper)
    await button(wrapper, 'Piemērot šo failu').trigger('click')
    await settle(wrapper)
    expect(wrapper.get('a[data-link="history"]').text()).toBe('Skatīt tās vēsturē →')
    expect(wrapper.text()).toContain('1 izmaiņa piemērota un ierakstīta vēsturē ar jūsu vārdu')
  })
})

describe('Export / Import › rolled back, except what it added', () => {
  const sections = { orders: { priorities: [{ key: 'rush', label: 'Rush' }], kinds: [] }, stock: { units: [{ key: 'pallet', name: 'Pallet' }] } }
  const file = fileOf(sections)

  it('says what stayed, lists it, and links to where it is taken out of use', async () => {
    stubCoordinator({ status: 200, body: cleanPreview }, { status: 200, body: outcome('rolledBack', 'rolledBack', 'failed') })
    const { wrapper, router } = await render('en', ['orders', 'stock'], withAreas)
    await chooseAndApply(wrapper, file)
    const box = wrapper.get('[data-outcome]').text().replace(/\s+/g, ' ')
    expect(box).toContain('Rolled back, except what it added.')
    expect(box).toContain('Stock modules could not write its part after Order register had written its own, so it was restored to what it held before.')
    expect(box).toContain('A restore never removes, so what the file added is still here:')
    expect(wrapper.findAll('[data-kept] li').map((li) => li.text())).toEqual(['Priorities: «Rush»'])
    const sentence = wrapper.get('[data-out-of-use]')
    // One item stayed, so it is "it".
    expect(sentence.text().replace(/\s+/g, ' ')).toBe('In use nowhere yet. Take it out of use in Workflow if you do not want it.')
    expect(sentence.findAll('a').map((a) => [a.text(), a.attributes('href')])).toEqual([['Workflow', '/flow']])
    await sentence.get('a').trigger('click')
    await settle(wrapper)
    expect(router.currentRoute.value.name).toBe('flow')
  })

  it('names each area once, joined as the language joins them, when what stayed is in several', async () => {
    const written = outcome('rolledBack', 'rolledBack', 'rolledBack')
    const both = { ...written, sections: { ...written.sections, people: { status: 'failed' } } }
    stubCoordinator({ status: 200, body: cleanPreview }, { status: 200, body: both })
    const { wrapper } = await render('en', ['orders', 'stock'], withAreas)
    await chooseAndApply(wrapper, file)
    expect(wrapper.findAll('[data-kept] li').map((li) => li.text())).toEqual(['Priorities: «Rush»', 'Units: «Pallet»'])
    expect(wrapper.get('[data-out-of-use]').text().replace(/\s+/g, ' ')).toBe('In use nowhere yet. Take them out of use in Workflow and Staff rotas if you do not want them.')
    expect(wrapper.get('[data-outcome]').text()).toContain(
      'people could not write its part after Order register and Stock modules had written theirs, so they were restored to what they held before.',
    )
  })

  it('takes the area a host names for a row before the part’s own', async () => {
    stubCoordinator({ status: 200, body: cleanPreview }, { status: 200, body: outcome('rolledBack', 'rolledBack', 'failed') })
    const host: AdminOptions = { ...withAreas, transfer: { describe: (row) => (row.key === 'rush' ? { area: 'rotas' } : null) } }
    const { wrapper } = await render('en', ['orders', 'stock'], host)
    await chooseAndApply(wrapper, file)
    expect(wrapper.get('[data-out-of-use]').findAll('a').map((a) => a.attributes('href'))).toEqual(['/rotas'])
  })

  // What happened is read before the rows the preview drew, as the outcome comes first under the file.
  it('draws the outcome above the preview’s rows', async () => {
    stubCoordinator({ status: 200, body: cleanPreview }, { status: 200, body: outcome('rolledBack', 'rolledBack', 'failed') })
    const { wrapper } = await render('en', ['orders', 'stock'], withAreas)
    await chooseAndApply(wrapper, file)
    const box = wrapper.get('[data-outcome]').element
    const firstGroup = wrapper.get('section[aria-labelledby]').element
    expect(box.compareDocumentPosition(firstGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // The ways on stay last.
    const again = button(wrapper, 'Preview again').element
    expect(firstGroup.compareDocumentPosition(again) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('lists what stayed but links nowhere when no area is known', async () => {
    stubCoordinator({ status: 200, body: cleanPreview }, { status: 200, body: outcome('rolledBack', 'rolledBack', 'failed') })
    const { wrapper } = await render()
    await chooseAndApply(wrapper, file)
    expect(wrapper.findAll('[data-kept] li').map((li) => li.text())).toEqual(['Priorities: «Rush»'])
    expect(wrapper.find('[data-out-of-use]').exists()).toBe(false)
  })

  it('says each part’s standing: restored except what the file added, restored whole, could not write', async () => {
    const mixed = outcome('rolledBack', 'rolledBack', 'rolledBack', [{ key: 'rush', status: 'added' }])
    mixed.sections.stock.report = report({ units: [{ key: 'pallet', status: 'unchanged' }] }, 'sha256:m0')
    stubCoordinator({ status: 200, body: cleanPreview }, { status: 200, body: mixed })
    const { wrapper } = await render()
    await chooseAndApply(wrapper, file)
    expect(resultLines(wrapper)[0]).toContain('restored: every change is back as it was, except what the file added')
    expect(resultLines(wrapper)[1]).toContain('restored to what it held before this import')

    stubCoordinator({ status: 200, body: cleanPreview }, { status: 200, body: outcome('rolledBack', 'rolledBack', 'failed') })
    const second = await render()
    await chooseAndApply(second.wrapper, file)
    expect(resultLines(second.wrapper)[1]).toContain('could not write')
    expect(resultLines(second.wrapper)[1]).toContain('its service did not answer. Nothing of this part was written.')
  })

  it('says nothing of this file is in force, and lists nothing, when the file added nothing', async () => {
    const nothing = outcome('rolledBack', 'rolledBack', 'failed', [{ key: 'normal', status: 'unchanged' }, { key: 'high', status: 'changed' }])
    nothing.sections.stock.report = report({ units: [{ key: 'pallet', status: 'unchanged' }] }, 'sha256:m0')
    stubCoordinator({ status: 200, body: cleanPreview }, { status: 200, body: nothing })
    const { wrapper } = await render('en', ['orders', 'stock'], withAreas)
    await chooseAndApply(wrapper, file)
    const box = wrapper.get('[data-outcome]').text()
    expect(box).toContain('Nothing of this file is in force.')
    expect(box).not.toContain('Rolled back, except what it added.')
    expect(wrapper.find('[data-kept]').exists()).toBe(false)
    expect(wrapper.find('[data-out-of-use]').exists()).toBe(false)
    expect(button(wrapper, 'Preview again').exists()).toBe(true)
    expect(onApplied).toHaveBeenCalledTimes(1)
  })

  it('says it in Latvian', async () => {
    stubCoordinator({ status: 200, body: cleanPreview }, { status: 200, body: outcome('rolledBack', 'rolledBack', 'failed') })
    const { wrapper } = await render('lv', ['orders', 'stock'], withAreas)
    await chooseFile(wrapper, file)
    await button(wrapper, 'Piemērot šo failu').trigger('click')
    await settle(wrapper)
    const box = wrapper.get('[data-outcome]').text().replace(/\s+/g, ' ')
    expect(box).toContain('Atsaukts, izņemot to, ko fails pievienoja.')
    expect(box).toContain('Daļu Krājumu moduļi neizdevās ierakstīt pēc tam, kad daļa Pasūtījumu reģistrs jau bija ierakstīta')
    expect(wrapper.get('[data-out-of-use]').text().replace(/\s+/g, ' ')).toBe(
      'Nekur vēl netiek izmantots. Ja to nevēlaties, izņemiet to no lietošanas šeit: Darbplūsma.',
    )
  })
})
