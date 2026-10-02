// The configuration document as the screen reads the coordinator's answer. Built
// from the answer's real shape — one outcome per document, each section's status,
// the owner's report verbatim — because what goes wrong here is the screen reading
// an answer as something it is not.
import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'

import { messages } from '../plugin'
import {
  aboutDocument,
  canApply,
  counts,
  downloadName,
  expectFrom,
  orderedSections,
  previewGroups,
  refusedGroups,
  reportItems,
  resultLines,
  standing,
  withExpect,
  type ImportAnswer,
  type Lexicon,
  type Say,
} from './transfer'

const i18n = createI18n({ legacy: false, locale: 'en', messages })
const t = i18n.global.t as unknown as (k: string, n?: Record<string, unknown>, p?: number) => string
const say: Say = (key, named, plural) => (plural === undefined ? t(key, named ?? {}) : t(key, named ?? {}, plural))

// A host with two sections of its own, as the coordinator orders them, and words for both.
const lex: Lexicon = {
  order: ['orders', 'stock', 'people'],
  titles: { orders: 'Order register', stock: 'Stock modules' },
  parts: {
    orders: [
      { key: 'kinds', word: 'Order kinds' },
      { key: 'priorities', word: 'Priorities' },
      { key: 'fields', word: 'Custom fields' },
      { key: 'settings', word: 'Settings' },
    ],
    stock: [
      { key: 'units', word: 'Units' },
      { key: 'fields', word: 'Stock fields' },
    ],
  },
}

function orders(items: Record<string, unknown[]>, extra: Record<string, unknown> = {}) {
  return { applied: false, refused: false, version: 'sha256:e0', ...items, ...extra }
}

function answer(outcome: ImportAnswer['outcome'], sections: ImportAnswer['sections'], dryRun = true): ImportAnswer {
  return { dryRun, outcome, sections }
}

const cleanPreview = (): ImportAnswer =>
  answer('previewed', {
    stock: {
      status: 'previewed',
      version: 'sha256:m0',
      report: { version: 'sha256:m0', units: [{ key: 'pallet', status: 'added' }], fields: [{ key: 'mass', status: 'unchanged' }] },
    },
    orders: {
      status: 'previewed',
      version: 'sha256:e0',
      report: orders({
        priorities: [
          { key: 'rush', status: 'added' },
          { key: 'normal', status: 'unchanged' },
        ],
        settings: [{ key: 'defaultKind', status: 'changed' }],
        kinds: [{ key: 'assembly', status: 'changed', detail: 'position' }],
        fields: [{ key: 'finish', status: 'unchanged' }],
      }),
    },
  })

describe('the sections of an answer', () => {
  it('puts the sections in the order the coordinator writes them, then any it does not know', () => {
    const a = answer('previewed', {
      zeta: { status: 'skipped' },
      people: { status: 'previewed' },
      stock: { status: 'previewed' },
      orders: { status: 'previewed' },
      another: { status: 'skipped' },
    })
    expect(orderedSections(a, lex).map(([n]) => n)).toEqual(['orders', 'stock', 'people', 'another', 'zeta'])
  })

  // A report is a JSON object; its key order carries nothing, so the host
  // supplies its screens' order — and a part it does not know is kept.
  it("lists a report's items in the host's order, and keeps a part it does not know, after them", () => {
    const parts = reportItems(
      'orders',
      {
        status: 'previewed',
        report: orders({ zeta: [{ key: 'z', status: 'added' }], settings: [{ key: 's', status: 'added' }], kinds: [{ key: 't', status: 'added' }] }),
      },
      lex,
    ).map((i) => i.part)
    expect(parts).toEqual(['kinds', 'settings', 'zeta'])
  })

  it('reads only the lists in a report, never its own verdict fields', () => {
    expect(reportItems('orders', { status: 'previewed', report: orders({ priorities: [] }) }, lex)).toEqual([])
  })
})

describe('the preview, as the list draws it', () => {
  it('calls each section by its name, the clean ones clean, and folds what does not change', () => {
    const [ord, stock] = previewGroups(cleanPreview(), lex, say)
    expect(ord).toMatchObject({ key: 'orders', title: 'Order register', badge: 'clean', badgeStatus: 'ontrack' })
    expect(stock).toMatchObject({ title: 'Stock modules', badge: 'clean' })
    expect(ord!.rows.filter((r) => r.folded).map((r) => r.key)).toEqual(['normal', 'finish'])
    expect(ord!.summary).toBe('3 changes')
    expect(ord!.foldedLabel).toBe('2 unchanged')
    expect(stock!.summary).toBe('1 change')
  })

  // `fields` is two different things in the two sections, and each is called what
  // the host's own screen for it calls it.
  it("names each part by the host's word for it, section by section", () => {
    const [ord, stock] = previewGroups(cleanPreview(), lex, say)
    expect(ord!.rows.map((r) => r.part)).toEqual(['Order kinds', 'Priorities', 'Priorities', 'Custom fields', 'Settings'])
    expect(stock!.rows.map((r) => r.part)).toEqual(['Units', 'Stock fields'])
  })

  it('keeps the name a section and its parts arrived with where the host gives no words', () => {
    const p = answer('previewed', { people: { status: 'previewed', report: { roles: [{ key: 'clerk', status: 'added' }] } } })
    const [people] = previewGroups(p, lex, say)
    expect(people).toMatchObject({ title: 'people' })
    expect(people!.rows[0]!.part).toBe('roles')
  })

  it("shows a refused item marked, with the owner's own sentence, and the clean section beside it as waiting", () => {
    const p = answer('refused', {
      orders: {
        status: 'refused',
        version: 'sha256:e0',
        report: orders(
          { fields: [{ key: 'weight', status: 'refused', reason: 'config_key_conflict', detail: 'field weight is a number here' }] },
          { refused: true },
        ),
      },
      stock: { status: 'previewed', version: 'sha256:m0', report: { units: [{ key: 'pallet', status: 'added' }] } },
    })
    const [ord, stock] = previewGroups(p, lex, say)
    expect(ord!.badge).toBe('refused')
    expect(ord!.rows[0]).toMatchObject({ key: 'weight', status: 'late', statusLabel: 'refused', marked: true, detail: 'field weight is a number here' })
    expect(stock).toMatchObject({ badge: 'clean — lands only with the rest', badgeStatus: 'idle' })
    expect(canApply(p)).toBe(false)
  })

  it('says why a section has no rows: an owner that did not answer, or a section nobody here owns', () => {
    const p = answer('failed', {
      orders: { status: 'failed' },
      zeta: { status: 'skipped', detail: 'no service in this deployment owns this section' },
    })
    const [ord, other] = previewGroups(p, lex, say)
    expect(ord).toMatchObject({ badge: 'failed', rows: [] })
    expect(ord!.note).toContain('did not answer')
    expect(other).toMatchObject({ title: 'zeta', badge: 'skipped' })
    expect(other!.note).toContain('not applied here')
  })

  it('counts what the whole document adds, changes, leaves and has refused', () => {
    expect(counts(cleanPreview())).toEqual({ added: 2, changed: 2, unchanged: 3, refused: 0 })
  })
})

describe('what an Apply may carry', () => {
  // The versions come from the preview the person read, never from the file.
  it("carries back each section's version from the preview, and none for a skipped one", () => {
    const p = cleanPreview()
    p.sections.zeta = { status: 'skipped' }
    expect(expectFrom(p)).toEqual({ orders: 'sha256:e0', stock: 'sha256:m0' })
  })

  it.each([
    ['a clean preview', cleanPreview(), true],
    ['a refused one', answer('refused', { orders: { status: 'refused' } }), false],
    ['one an owner did not answer', answer('failed', { orders: { status: 'failed' } }), false],
    ['one with nothing this workspace owns', answer('previewed', { zeta: { status: 'skipped' } }), false],
  ])('is open for %s: %s', (_case, p, open) => {
    expect(canApply(p)).toBe(open)
  })

  // The Apply sends the very bytes the preview judged, with the versions last —
  // so a hand-written member of the same name can never be the one read.
  it("adds the versions to the file's own text, as its last member, and changes nothing else", () => {
    const file = '{\n  "gmbConfig": "1.0",\n  "expect": {"orders": "from-the-file"},\n  "sections": {"orders": {"n": 12345678901234567890}}\n}\n'
    const sent = withExpect(file, { orders: 'sha256:e0' })
    const cut = file.lastIndexOf('}')
    expect(sent.startsWith(file.slice(0, cut).trimEnd())).toBe(true)
    expect(sent).toContain('12345678901234567890')
    expect(sent.endsWith(',"expect":{"orders":"sha256:e0"}}\n')).toBe(true)
  })

  it('adds them to an empty document without a stray comma', () => {
    expect(withExpect('{ }', { a: 'b' })).toBe('{"expect":{"a":"b"}}')
  })
})

describe("an Apply's one outcome", () => {
  const applied = (outcome: ImportAnswer['outcome'], ord: string, stock: string) =>
    answer(
      outcome,
      {
        orders: {
          status: ord as never,
          report: orders({ priorities: [{ key: 'rush', status: 'added' }, { key: 'high', status: 'changed' }, { key: 'normal', status: 'unchanged' }] }),
        },
        stock: { status: stock as never, report: { units: [{ key: 'pallet', status: 'unchanged' }] } },
      },
      false,
    )

  it('says what landed in each section, counting only what changed', () => {
    const lines = resultLines(applied('applied', 'applied', 'applied'), lex, say)
    expect(lines[0]).toMatchObject({ title: 'Order register', word: 'applied', sentence: '2 changes landed, recorded in the history under your name' })
    expect(lines[1]!.sentence).toBe('nothing in it changes this section')
  })

  it('tells a restored section from a withheld one from one that failed', () => {
    const rolled = resultLines(applied('rolledBack', 'rolledBack', 'failed'), lex, say)
    expect(rolled.map((l) => [l.word, l.role])).toEqual([
      ['rolled back', 'blocked'],
      ['failed', 'late'],
    ])
    const first = resultLines(applied('failed', 'failed', 'withheld'), lex, say)
    expect(first[1]).toMatchObject({ word: 'withheld', sentence: 'clean, not applied because another section did not land' })
  })

  // In a partial document the coordinator still calls the unrestored section
  // applied; that is the one section a person must not read as fine.
  it('reads a section still "applied" in a partial document as not restored', () => {
    const a = applied('partial', 'applied', 'failed')
    expect(standing(a.sections.orders!, a, say)).toEqual({ word: 'not restored', role: 'late' })
    expect(resultLines(a, lex, say)[0]!.sentence).toContain('the restore after the failure did not succeed')
  })

  it('shows the rows an Apply refused, and nothing else', () => {
    const a = answer(
      'refused',
      {
        orders: {
          status: 'refused',
          report: orders({
            kinds: [
              { key: 'assembly', status: 'refused', reason: 'config_in_use', detail: '3 orders of Assembly are open' },
              { key: 'welding', status: 'unchanged' },
            ],
          }),
        },
        stock: { status: 'withheld', report: { units: [{ key: 'pallet', status: 'added' }] } },
      },
      false,
    )
    const groups = refusedGroups(a, lex, say)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.rows.map((r) => r.key)).toEqual(['assembly'])
  })
})

describe('what a file says about itself', () => {
  it('reads when and where it was exported, and how many sections it carries', () => {
    const text = JSON.stringify({ gmbConfig: '1.0', exportedAt: '2026-09-20T10:00:00Z', tenant: { id: 'W-1' }, sections: { a: {}, b: {} } })
    expect(aboutDocument(text)).toEqual({ exportedAt: '2026-09-20T10:00:00Z', workspace: 'W-1', sections: 2 })
  })

  it('says nothing about a file it cannot read, rather than failing', () => {
    expect(aboutDocument('not json')).toEqual({ exportedAt: '', workspace: '', sections: 0 })
  })

  it("takes a download's name from the coordinator's header", () => {
    expect(downloadName('attachment; filename="configuration-2026-09-23.json"', 'x.json')).toBe('configuration-2026-09-23.json')
    expect(downloadName('', 'x.json')).toBe('x.json')
  })
})
