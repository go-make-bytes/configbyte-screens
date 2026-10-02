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
import { useAdminSession } from '../stores/session'
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

const FILE = JSON.stringify(
  { gmbConfig: '1.0', exportedAt: '2026-09-20T09:00:00Z', tenant: { id: 'W-1' }, contentHash: 'sha256:c0', sections: { orders: {}, stock: {} } },
  null,
  2,
)

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
      report: report({ kinds: [{ key: 'weight', status: 'refused', reason: 'config_key_conflict', detail: 'kind weight is a number here and a text in the document' }] }),
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

async function render(locale: 'en' | 'lv' = 'en', order = ['orders', 'stock']) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAdminSession().order = order
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/export-import', name: 'export-import', component: ExportImportView },
      { path: '/elsewhere', name: 'elsewhere', component: { template: '<div />' } },
    ],
  })
  await router.push('/export-import')
  await router.isReady()
  const i18n = createI18n({ legacy: false, locale, fallbackLocale: 'en', messages: structuredClone(hostWords) })
  const wrapper = mount({ template: '<router-view />' }, { global: { plugins: [pinia, router, i18n, configbyteScreens(i18n, options)] } })
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
    expect(wrapper.text()).not.toContain('What this document would do')
    expect(calls).toEqual([])
  })

  // The card lists the host's lines, in the host's order, for the sections this
  // deployment runs — a line for a section it does not run is not shown.
  it("lists what the file carries in the host's order, only for the sections this deployment runs", async () => {
    stubCoordinator({ status: 200, body: cleanPreview })
    const { wrapper } = await render()
    expect(wrapper.findAll('li').map((li) => li.text())).toEqual([
      'Order kinds · priorities',
      'Units · stock fields',
      'One setting: the default kind',
    ])
    expect(wrapper.text()).toContain('Not in it, ever: orders, people, files.')

    const without = await render('en', ['orders'])
    expect(without.wrapper.findAll('li').map((li) => li.text())).toEqual(['Order kinds · priorities', 'One setting: the default kind'])
  })

  it("previews the file's own text, and shows what it would do", async () => {
    stubCoordinator({ status: 200, body: cleanPreview })
    const { wrapper } = await render()
    await chooseFile(wrapper)
    const dry = calls.find((c) => c.url === '/api/configbyte/v1/config/import?dryRun=true')
    expect(dry?.method).toBe('POST')
    expect(dry?.body).toBe(FILE)
    const text = wrapper.text()
    expect(text).toContain('What this document would do')
    expect(text).toContain('configuration-2026-09-20.json')
    expect(text).toContain('edited since export')
    expect(text).toContain('rush')
    expect(text).toContain('Order register')
    expect(button(wrapper, 'Apply this document').attributes('disabled')).toBeUndefined()
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
    await chooseFile(wrapper)
    await button(wrapper, 'Apply this document').trigger('click')
    await settle(wrapper)
    const apply = calls.find((c) => c.method === 'POST' && c.url === '/api/configbyte/v1/config/import')
    expect(apply?.body.startsWith(FILE.slice(0, FILE.lastIndexOf('}')).trimEnd())).toBe(true)
    expect(JSON.parse(apply!.body).expect).toEqual({ orders: 'sha256:e0', stock: 'sha256:m0' })
    expect(wrapper.text()).toContain('Applied. The whole document is in force.')
    expect(wrapper.text()).toContain('1 change landed, recorded in the history under your name')
    expect(onApplied).toHaveBeenCalledTimes(1)
    expect(button(wrapper, 'Import another file').exists()).toBe(true)
  })

  it('keeps Apply shut while any item is refused, says the whole document waits, and tells the host nothing', async () => {
    stubCoordinator({ status: 200, body: refusedPreview })
    const { wrapper } = await render()
    await chooseFile(wrapper)
    expect(button(wrapper, 'Apply this document').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('1 item was refused, so this document cannot be applied — none of it.')
    expect(wrapper.text()).toContain('clean — lands only with the rest')
    expect(wrapper.text()).toContain('kind weight is a number here and a text in the document')
    await button(wrapper, 'Apply this document').trigger('click')
    expect(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/config/import'))).toEqual([])
    expect(onApplied).not.toHaveBeenCalled()
  })

  it('says the same thing in Latvian, with the host words in Latvian too', async () => {
    stubCoordinator({ status: 200, body: refusedPreview })
    const { wrapper } = await render('lv')
    await chooseFile(wrapper)
    expect(wrapper.text()).toContain('1 vienums tika atteikts, tāpēc šo dokumentu nevar piemērot')
    expect(wrapper.text()).toContain('Pasūtījumu reģistrs')
    expect(wrapper.text()).toContain('Pasūtījumu veidi · prioritātes')
    expect(button(wrapper, 'Piemērot šo dokumentu').attributes('disabled')).toBeDefined()
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
    await chooseFile(wrapper)
    await button(wrapper, 'Apply this document').trigger('click')
    await settle(wrapper)
    expect(wrapper.text()).toContain('The configuration changed after your preview.')
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
    await chooseFile(wrapper)
    await button(wrapper, 'Apply this document').trigger('click')
    await settle(wrapper)
    const text = wrapper.text()
    expect(text).toContain('Refused at Apply.')
    expect(text).toContain('3 orders of Assembly are open')
    expect(text).toContain('withheld')
    expect(button(wrapper, 'Preview again').exists()).toBe(true)
    expect(onApplied).not.toHaveBeenCalled()
  })

  it('says nothing of the document is in force after a rolled-back Apply, offers only Preview again, and tells the host', async () => {
    stubCoordinator({ status: 200, body: cleanPreview }, { status: 200, body: outcome('rolledBack', 'rolledBack', 'failed') })
    const { wrapper } = await render()
    await chooseFile(wrapper)
    await button(wrapper, 'Apply this document').trigger('click')
    await settle(wrapper)
    expect(wrapper.text()).toContain('Nothing of this document is in force.')
    expect(wrapper.text()).toContain('rolled back')
    expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('Try the Apply again')
    expect(button(wrapper, 'Preview again').exists()).toBe(true)
    expect(onApplied).toHaveBeenCalledTimes(1)
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
    await chooseFile(wrapper)
    await button(wrapper, 'Apply this document').trigger('click')
    await settle(wrapper)
    const text = wrapper.text()
    expect(text).toContain('Only part of this document is in force.')
    expect(text).toContain('applying it completes the document')
    expect(text).toContain('not restored')
    expect(onApplied).toHaveBeenCalledTimes(1)
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
    expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('Apply this document')
  })

  it('says a dropped file of another kind was not taken, and asks nothing', async () => {
    stubCoordinator({ status: 200, body: cleanPreview })
    const { wrapper } = await render()
    await wrapper.get('label').trigger('drop', { dataTransfer: { files: [new File(['x'], 'photo.png', { type: 'image/png' })] } })
    await settle(wrapper)
    expect(wrapper.text()).toContain('That is not a configuration file')
    expect(calls).toEqual([])
  })

  it('downloads the export under the name the coordinator gives it, and says what it was', async () => {
    stubCoordinator({ status: 200, body: cleanPreview }, undefined, {
      status: 200,
      body: { gmbConfig: '1.0', sections: { orders: {}, stock: {} } },
      headers: { 'Content-Disposition': 'attachment; filename="configuration-2026-09-23.json"' },
    })
    const saved = watchDownloads()
    const { wrapper } = await render()
    await button(wrapper, 'Download configuration').trigger('click')
    await settle(wrapper)
    expect(calls.map((c) => [c.method, c.url])).toEqual([['GET', '/api/configbyte/v1/config/export']])
    expect(saved).toEqual(['configuration-2026-09-23.json'])
    expect(wrapper.text()).toContain('configuration-2026-09-23.json')
    expect(wrapper.text()).toContain('2 sections')
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
