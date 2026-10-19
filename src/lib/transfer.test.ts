// The configuration file as the screen reads the coordinator's answer. Built
// from the answer's real shape — one outcome per file, each section's status,
// the owner's report verbatim — because what goes wrong here is the screen reading
// an answer as something it is not.
import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'

import type { TransferRow } from '../options'
import { messages } from '../plugin'
import {
  aboutDocument,
  canApply,
  counts,
  downloadName,
  expectFrom,
  failedStop,
  listOf,
  namedSections,
  orderedSections,
  previewGroups,
  refusedGroups,
  reportItems,
  resultLines,
  rollback,
  sectionsOf,
  standing,
  withExpect,
  type Context,
  type ImportAnswer,
  type Lexicon,
  type Problem,
  type Say,
} from './transfer'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: { ...messages.en, host: { warn: 'its notice period changes', look: 'its look changes' } }, lv: { ...messages.lv } },
})
const t = i18n.global.t as unknown as (k: string, n?: Record<string, unknown>, p?: number) => string
const say: Say = (key, named, plural) => (plural === undefined ? t(key, named ?? {}) : t(key, named ?? {}, plural))

// A host with two sections of its own, as the coordinator orders them, and words for both.
const lex: Lexicon = {
  order: ['orders', 'stock', 'people'],
  titles: { orders: 'Order register', stock: 'Stock modules' },
  parts: {
    orders: [
      { key: 'kinds', word: 'Order kinds' },
      { key: 'priorities', word: 'Priorities', count: (n) => (n === 1 ? '1 priority' : `${n} priorities`), area: 'workflow' },
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

const ctxFor = (file: Record<string, Record<string, unknown>>, over: Partial<Context> = {}): Context => ({ file, lang: 'en', ...over })

/** The rows of one section of a preview, as the list draws them. */
const rowsOf = (a: ImportAnswer, name: string, ctx: Context) => previewGroups(a, lex, say, ctx).find((g) => g.key === name)!.rows

/** A preview whose one section carries the given items under one part. */
const previewOf = (section: string, part: string, items: unknown[]): ImportAnswer =>
  answer('previewed', { [section]: { status: 'previewed', report: orders({ [part]: items }) } })

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

  it('names the sections a file carries in the coordinator’s order, the ones it does not know after, sorted', () => {
    expect(namedSections(['zeta', 'stock', 'alpha', 'orders'], lex)).toBe('Order register, Stock modules, alpha, zeta')
    expect(namedSections([], lex)).toBe('')
  })

  it('joins names the way the language does, and as a plain list where it cannot', () => {
    expect(listOf(['Orders', 'Stock'], 'en')).toBe('Orders and Stock')
    expect(listOf(['Orders'], 'en')).toBe('Orders')
    expect(listOf(['Orders', 'Stock'], 'not a language tag')).toBe('Orders, Stock')
  })
})

describe('the preview, as the list draws it', () => {
  it('calls each section by its name, the clean ones clean, and folds what does not change', () => {
    const [ord, stock] = previewGroups(cleanPreview(), lex, say)
    expect(ord).toMatchObject({ key: 'orders', title: 'Order register', badge: 'clean', badgeStatus: 'ontrack' })
    expect(stock).toMatchObject({ title: 'Stock modules', badge: 'clean' })
    expect(ord!.rows.filter((r) => r.folded).map((r) => r.key)).toEqual(['normal', 'finish'])
    expect(ord!.summary).toBe('3 changes')
    expect(stock!.summary).toBe('1 change')
  })

  // The fold says what it holds by part, in the part's own count where the host
  // gave one and in the part's word with the number where it did not.
  it('counts what is folded by part: the part’s own count, else its word with the number', () => {
    const [ord, stock] = previewGroups(cleanPreview(), lex, say)
    expect(ord!.foldedLabel).toBe('2 unchanged: 1 priority, Custom fields 1')
    expect(stock!.foldedLabel).toBe('1 unchanged: Stock fields 1')
    const many = previewOf('orders', 'priorities', [
      { key: 'a', status: 'unchanged' },
      { key: 'b', status: 'unchanged' },
      { key: 'c', status: 'unchanged' },
    ])
    expect(previewGroups(many, lex, say)[0]!.foldedLabel).toBe('3 unchanged: 3 priorities')
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

  it('shows a refused item marked, in words that say what to do, and the clean section beside it as waiting', () => {
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
    expect(ord!.rows[0]).toMatchObject({
      key: 'weight',
      status: 'late',
      statusLabel: 'refused',
      marked: true,
      detail: 'It already means something else here, and what an item is never changes. Add a new one with the meaning you want, and take this one out of use.',
    })
    expect(stock).toMatchObject({ badge: 'clean — lands only with the rest', badgeStatus: 'idle' })
    expect(canApply(p)).toBe(false)
  })

  // A refusal is not a change, and an item a file may not set is neither: each is counted on its own.
  it('counts a group’s changes apart from what it refused and what it does not take, and says when nothing changes', () => {
    const p = answer('refused', {
      orders: {
        status: 'refused',
        report: orders(
          {
            fields: [
              { key: 'weight', status: 'refused', reason: 'config_key_conflict' },
              { key: 'finish', status: 'changed', detail: 'label' },
              { key: 'mass', status: 'unchanged' },
            ],
            kinds: [{ key: 'assembly', status: 'skipped', reason: 'config_deployment_owned' }],
          },
          { refused: true },
        ),
      },
      stock: { status: 'previewed', report: { units: [{ key: 'pallet', status: 'unchanged' }] } },
    })
    const [ord, stock] = previewGroups(p, lex, say)
    expect(ord!.summary).toBe('1 change · 1 refused · 1 not taken')
    expect(stock!.summary).toBe('no changes')
    const lvT = createI18n({ legacy: false, locale: 'lv', messages: { lv: messages.lv } }).global.t as unknown as typeof t
    const sayLv: Say = (key, named, plural) => (plural === undefined ? lvT(key, named ?? {}) : lvT(key, named ?? {}, plural))
    expect(previewGroups(p, lex, sayLv)[1]!.summary).toBe('nav izmaiņu')
  })

  it('says why a section has no rows: an owner that did not answer, or a section nobody here owns', () => {
    const p = answer('failed', {
      orders: { status: 'failed' },
      zeta: { status: 'skipped', detail: 'no service in this deployment owns this section' },
    })
    const [ord, other] = previewGroups(p, lex, say)
    expect(ord).toMatchObject({ badge: 'failed', rows: [] })
    expect(ord!.note).toBe('Order register did not answer, so its part of the file could not be judged.')
    expect(other).toMatchObject({ title: 'zeta', badge: 'skipped' })
    expect(other!.note).toContain('not applied here')
  })

  it('counts what the whole file adds, changes, leaves, has refused and does not take', () => {
    expect(counts(cleanPreview())).toEqual({ added: 2, changed: 2, unchanged: 3, refused: 0, skipped: 0 })
  })
})

// The answer carries keys; the person chose a file that carries the names. A row
// is drawn by name when the file has one, by the key alone when it has none.
describe('items by their names from the file', () => {
  const file = {
    orders: {
      kinds: [{ key: 'assembly', label: 'Assembly', labels: { lv: 'Montāža' }, status: 'retired' }],
      priorities: [{ number: 7, label: 'Rush', labels: { lv: '' } }],
      fields: [{ key: 'finish', name: 'Finish' }, { key: 'plain', displayName: 'Plain display' }],
      links: [{ entityKind: 'order', number: 1, label: 'Order link' }],
    },
  }
  const answerOf = () =>
    answer('previewed', {
      orders: {
        status: 'previewed',
        report: orders({
          kinds: [{ key: 'assembly', status: 'unchanged' }],
          priorities: [{ key: '7', status: 'unchanged' }],
          fields: [
            { key: 'finish', status: 'unchanged' },
            { key: 'plain', status: 'unchanged' },
            { key: 'missing', status: 'unchanged' },
          ],
          links: [{ key: 'order/1', status: 'unchanged' }],
        }),
      },
    })

  it('names an item by its key, by its number, and by what the host’s own finder says', () => {
    const find: NonNullable<Context['transfer']>['find'] = (_s, _p, key, list) =>
      (list as { entityKind: string; number: number }[]).find((i) => `${i.entityKind}/${i.number}` === key) as Record<string, unknown> | undefined
    const rows = rowsOf(answerOf(), 'orders', ctxFor(file, { transfer: { find } }))
    expect(rows.map((r) => [r.key, r.label])).toEqual([
      ['assembly', '«Assembly»'],
      ['7', '«Rush»'],
      ['finish', '«Finish»'],
      ['plain', '«Plain display»'],
      ['missing', undefined],
      ['order/1', '«Order link»'],
    ])
    // Without the host's finder the same key finds nothing, and the row keeps only its key.
    expect(rowsOf(answerOf(), 'orders', ctxFor(file)).find((r) => r.key === 'order/1')!.label).toBeUndefined()
  })

  it('names an item in the language the screen speaks when the file has its name in it, else by its label', () => {
    const rows = rowsOf(answerOf(), 'orders', ctxFor(file, { lang: 'lv' }))
    expect(rows[0]!.label).toBe('«Montāža»')
    // An empty name in a language is not a name.
    expect(rows[1]!.label).toBe('«Rush»')
  })

  it('draws a row of a file that has no such section by its key alone', () => {
    const rows = rowsOf(answerOf(), 'orders', ctxFor({}))
    expect(rows.every((r) => r.label === undefined)).toBe(true)
    expect(rows.map((r) => r.key)).toContain('assembly')
  })

  it('reads the file’s sections from its text, and none from a file it cannot read', () => {
    expect(sectionsOf(JSON.stringify({ sections: { orders: { a: 1 }, odd: 3, list: [] } }))).toEqual({ orders: { a: 1 } })
    expect(sectionsOf('not json')).toEqual({})
    expect(sectionsOf('{}')).toEqual({})
  })

  // A hand-edited file may hold anything where a key or a number belongs; the service may still report the row.
  it('names nothing from a value that is not a word or a number, and never fails on one', () => {
    const odd = sectionsOf(
      '{"sections":{"orders":{' +
        '"kinds":[{"key":{"toString":0},"label":"Broken key"},{"key":"assembly","label":"Assembly"}],' +
        '"priorities":[{"number":{"toString":0},"label":"Broken number"},{"number":7,"key":{"toString":0},"label":"Rush"}]}}}',
    )
    const p = answer('previewed', {
      orders: {
        status: 'previewed',
        report: orders({ kinds: [{ key: 'assembly', status: 'changed', detail: 'label' }], priorities: [{ key: '7', status: 'added' }] }),
      },
    })
    let rows: ReturnType<typeof rowsOf> = []
    expect(() => (rows = rowsOf(p, 'orders', ctxFor(odd)))).not.toThrow()
    expect(rows.map((r) => r.label)).toEqual(['«Assembly»', '«Rush»'])
  })

  it('hands the host’s finder only the file’s items, never what is not one', () => {
    const seen: unknown[][] = []
    const find: NonNullable<Context['transfer']>['find'] = (_s, _p, _k, list) => {
      seen.push(list)
      return undefined
    }
    const file = sectionsOf('{"sections":{"orders":{"links":[null,3,"x",{"entityKind":"order","number":1}]}}}')
    rowsOf(previewOf('orders', 'links', [{ key: 'order/1', status: 'unchanged' }]), 'orders', ctxFor(file, { transfer: { find } }))
    expect(seen).toEqual([[{ entityKind: 'order', number: 1 }]])
  })

  // A section nobody here owns comes back under the name the file gave it, so a
  // name every object inherits is read as nothing more than a name.
  it('reads sections a file calls __proto__ or constructor as sections of that name, and finds nothing through them', () => {
    const text = '{"sections":{"__proto__":{"orders":{"kinds":[{"key":"assembly","label":"From the odd section"}]}},"constructor":{}}}'
    const sections = sectionsOf(text)
    expect(Object.keys(sections).sort()).toEqual(['__proto__', 'constructor'])
    expect(Object.getPrototypeOf(sections)).toBeNull()

    const odd = JSON.parse(
      '{"dryRun":true,"outcome":"previewed","sections":{' +
        '"orders":{"status":"previewed","report":{"kinds":[{"key":"assembly","status":"refused","reason":"constructor"}]}},' +
        '"constructor":{"status":"skipped"},"__proto__":{"status":"skipped"}}}',
    ) as ImportAnswer
    const groups = previewGroups(odd, lex, say, ctxFor(sections))
    expect(groups.map((g) => g.title)).toEqual(['Order register', '__proto__', 'constructor'])
    // The file has no section `orders` of its own, so the row is not named from the odd one.
    const row = groups[0]!.rows[0]!
    expect(row.label).toBeUndefined()
    // A reason named like an inherited member is an unknown reason, said with the service's words.
    expect(row.detail).toBe(say('configbyte.transfer.refusal.other', { said: 'constructor' }))
    expect(counts(odd)).toEqual({ added: 0, changed: 0, unchanged: 0, refused: 1, skipped: 0 })
  })

  // The host may word any row itself; what it leaves out keeps the screens' words.
  it('gives the host the row, the file’s item and its section, and takes its words for what it gives', () => {
    const seen: TransferRow[] = []
    const worded = (row: TransferRow) => {
      seen.push(row)

      return row.key === 'rush' ? { name: 'Rush order', change: 'raised', part: 'Urgency', area: 'flow' } : null
    }
    const a = previewOf('orders', 'priorities', [
      { key: 'rush', status: 'changed', detail: 'label' },
      { key: 'normal', status: 'added' },
    ])
    const sections = { orders: { priorities: [{ key: 'rush', label: 'Rush' }, { key: 'normal', label: 'Normal' }] } }
    const rows = rowsOf(a, 'orders', ctxFor(sections, { lang: 'lv', transfer: { describe: worded } }))
    expect(rows[0]).toMatchObject({ key: 'rush', label: 'Rush order', detail: 'raised', part: 'Urgency' })
    expect(rows[1]).toMatchObject({ key: 'normal', label: '«Normal»', detail: 'new in the file', part: 'Priorities' })
    expect(seen[0]).toMatchObject({ section: 'orders', part: 'priorities', key: 'rush', status: 'changed', detail: 'label', lang: 'lv' })
    expect(seen[0]!.item).toEqual({ key: 'rush', label: 'Rush' })
    expect(seen[0]!.file).toEqual(sections.orders)
  })

  describe('the register’s own parts', () => {
    const register = {
      services: [
        {
          key: 'orders',
          displayName: 'Order service',
          roles: [
            { group: 'orders', level: 'clerk', description: '' },
            { group: 'orders', level: 'lead', description: 'Leads the floor' },
          ],
          permissions: [
            { feature: 'setup/kinds', act: 'manage', labels: { lv: 'Noteikt veidus' }, description: 'Define kinds' },
            { feature: 'order', act: 'view', description: 'See orders' },
          ],
        },
      ],
    }
    const members = () =>
      answer('previewed', {
        members: {
          status: 'previewed',
          report: orders({
            services: [{ key: 'orders', status: 'unchanged' }],
            roles: [
              { key: 'orders orders:clerk', status: 'unchanged' },
              { key: 'orders orders:lead', status: 'unchanged' },
            ],
            permissions: [
              { key: 'orders/setup/kinds:manage', status: 'unchanged' },
              { key: 'orders/order:view', status: 'unchanged' },
              { key: 'orders/order:gone', status: 'unchanged' },
            ],
          }),
        },
      })

    it('names a service, a role rung and a box from the register’s own shape', () => {
      const rows = rowsOf(members(), 'members', ctxFor({ members: register }, { register: 'members' }))
      // The register's parts come in the order the report lists them when the host names none.
      expect(rows.map((r) => [r.key, r.label])).toEqual([
        ['orders/setup/kinds:manage', '«Define kinds»'],
        ['orders/order:view', '«See orders»'],
        ['orders/order:gone', undefined],
        ['orders orders:clerk', '«orders clerk» of Order service'],
        ['orders orders:lead', '«Leads the floor»'],
        ['orders', '«Order service»'],
      ])
    })

    it('says a box by its name in the language the screen speaks when the file has one', () => {
      const rows = rowsOf(members(), 'members', ctxFor({ members: register }, { register: 'members', lang: 'lv' }))
      expect(rows.find((r) => r.key === 'orders/setup/kinds:manage')!.label).toBe('«Noteikt veidus»')
    })

    it('does not read a section as the register unless the host says it is one', () => {
      // Its roles and boxes sit inside its services, where an ordinary section keeps nothing.
      const rows = rowsOf(members(), 'members', ctxFor({ members: register }))
      expect(rows.filter((r) => r.key !== 'orders').every((r) => r.label === undefined)).toBe(true)
    })
  })
})

describe('what happens to an item, in words', () => {
  const sections = { orders: { kinds: [{ key: 'retiring', status: 'retired' }, { key: 'back', status: 'active' }, { key: 'odd', status: 'strange' }] } }
  const changed = (key: string, detail: string, ctx: Context = ctxFor(sections)) =>
    rowsOf(previewOf('orders', 'kinds', [{ key, status: 'changed', detail }]), 'orders', ctx)[0]!.detail

  it('says a new item is new in the file, and leaves an unchanged one with no words', () => {
    const rows = rowsOf(previewOf('orders', 'kinds', [{ key: 'n', status: 'added' }, { key: 'u', status: 'unchanged' }]), 'orders', ctxFor({}))
    expect(rows.map((r) => r.detail)).toEqual(['new in the file', ''])
  })

  it('says each changed member in words, once, in the order the service named them', () => {
    expect(changed('x', 'label, name')).toBe('its name changes')
    expect(changed('x', 'labels')).toBe('its names in other languages change')
    expect(changed('x', 'description, label')).toBe('its description changes, its name changes')
  })

  it('reads a change of status from the file’s item: taken out of use, or restored', () => {
    expect(changed('retiring', 'status')).toBe('taken out of use')
    expect(changed('back', 'status')).toBe('restored')
    // A status the screens do not know, or an item the file lacks, is only said to change.
    expect(changed('odd', 'status')).toBe('whether it is in use changes')
    expect(changed('absent', 'status')).toBe('whether it is in use changes')
    expect(changed('retiring', 'label, status')).toBe('its name changes, taken out of use')
  })

  it('takes the host’s words for a member it names, and says anything else about it only once', () => {
    const ctx = ctxFor(sections, { transfer: { members: { warnDays: 'host.warn', look: 'host.look' } } })
    expect(changed('x', 'warnDays', ctx)).toBe('its notice period changes')
    expect(changed('x', 'warnDays, look', ctx)).toBe('its notice period changes, its look changes')
    expect(changed('x', 'structure, values, warnDays', ctx)).toBe('something else about it changes, its notice period changes')
    // Without the host's words a member it would have named is just something else.
    expect(changed('x', 'warnDays')).toBe('something else about it changes')
    expect(changed('x', 'position')).toBe('something else about it changes')
  })

  it.each([
    ['config_key_conflict', 'It already means something else here, and what an item is never changes. Add a new one with the meaning you want, and take this one out of use.'],
    ['config_unknown_reference', 'It names something this workspace does not have, or has taken out of use. Name one that is in use, or add it in the file too.'],
    ['config_in_use', 'It is still in use here, so the file cannot take it away. Move what uses it first, then drop the file again.'],
    ['config_number_taken', 'Its number already belongs to something else here. Give it a number of its own in the file.'],
    ['config_bad_document', 'It is out of shape in the file: kind is not text'],
    ['config_something_new', 'Refused: kind is not text'],
  ])('words a refusal for %s', (reason, sentence) => {
    const rows = rowsOf(previewOf('orders', 'kinds', [{ key: 'k', status: 'refused', reason, detail: 'kind is not text' }]), 'orders', ctxFor({}))
    expect(rows[0]).toMatchObject({ detail: sentence, marked: true, status: 'late' })
    // The service's own sentence is only ever shown where the screens have no words for the reason.
    expect(rows[0]!.detail?.includes('kind is not text')).toBe(reason === 'config_bad_document' || reason === 'config_something_new')
  })

  it('says a skipped item is not taken, in the deployment’s words when its list is the reason', () => {
    const a = previewOf('orders', 'kinds', [
      { key: 'owned', status: 'skipped', reason: 'config_deployment_owned', detail: 'the list belongs to the deployment' },
      { key: 'other', status: 'skipped', reason: 'config_else', detail: 'not for files' },
    ])
    const rows = rowsOf(a, 'orders', ctxFor({}))
    expect(rows.map((r) => [r.status, r.statusLabel, r.detail])).toEqual([
      ['idle', 'not taken', "This deployment's list says otherwise; only whoever runs the deployment changes it."],
      ['idle', 'not taken', 'Not taken from a file: not for files'],
    ])
    expect(rows.every((r) => !r.marked && !r.folded)).toBe(true)
    expect(counts(a)).toMatchObject({ skipped: 2, refused: 0 })
  })
})

// The workspace's own name and login are not the file's to set. The answer lists
// them as skipped items; they are never rows and never counted, and one sentence
// says what the file named and what stays.
describe('a file that names the workspace', () => {
  const owned = (keys: string[]) =>
    answer('previewed', {
      members: {
        status: 'previewed',
        report: orders({
          services: [{ key: 'orders', status: 'unchanged' }],
          workspace: keys.map((key) => ({ key, status: 'skipped', reason: 'config_workspace_owned', detail: 'the workspace owns it' })),
        }),
      },
    })
  const file = (name?: string) => ({ members: { services: [], tenant: { directory: { issuer: 'https://login.example' }, ...(name ? { displayName: name } : {}) } } })
  const note = (keys: string[], name?: string, mine?: string) =>
    previewGroups(owned(keys), lex, say, ctxFor(file(name), { register: 'members', mine }))[0]!.note

  it('draws neither as a row, and counts neither', () => {
    const a = owned(['displayName', 'directory'])
    expect(rowsOf(a, 'members', ctxFor({}, { register: 'members' })).map((r) => r.key)).toEqual(['orders'])
    expect(counts(a)).toEqual({ added: 0, changed: 0, unchanged: 1, refused: 0, skipped: 0 })
    expect(resultLines({ ...a, dryRun: false, outcome: 'applied', sections: { members: { ...a.sections.members!, status: 'applied' } } }, lex, say)[0]!.sentence).toBe(
      'nothing in it changes this part',
    )
  })

  it.each([
    [['displayName', 'directory'], 'Kalnu Metāls', 'This file names the workspace «Kalnu Metāls» and a corporate login.'],
    [['displayName'], 'Kalnu Metāls', 'This file names the workspace «Kalnu Metāls».'],
    [['directory'], 'Kalnu Metāls', 'This file names a corporate login.'],
    [['displayName'], undefined, 'This file names a workspace.'],
    [['displayName', 'directory'], undefined, 'This file names a workspace and a corporate login.'],
  ])('says which of the two a file named (%j, file name %s)', (keys, name, first) => {
    expect(note(keys, name, 'Go Make Bytes')).toBe(`${first} Neither is taken from a file: this workspace keeps «Go Make Bytes» and its own corporate login.`)
  })

  it('says the workspace keeps its own name when it could not be read', () => {
    expect(note(['displayName', 'directory'], 'Kalnu Metāls')).toBe(
      'This file names the workspace «Kalnu Metāls» and a corporate login. Neither is taken from a file: this workspace keeps its own name and its own corporate login.',
    )
  })

  it('says nothing for a register whose file named neither, nor for a section that is not the register', () => {
    const quiet = answer('previewed', { members: { status: 'previewed', report: orders({ services: [{ key: 'orders', status: 'unchanged' }] }) } })
    expect(previewGroups(quiet, lex, say, ctxFor({}, { register: 'members' }))[0]!.note).toBeUndefined()
    expect(previewGroups(owned(['directory']), lex, say, ctxFor(file()))[0]!.note).toBeUndefined()
  })
})

describe('an area that refuses or does not answer', () => {
  const failed = (problem?: Problem) =>
    answer('failed', { orders: { status: 'failed', ...(problem ? { problem } : {}) }, stock: { status: 'previewed' } })
  const note = (problem?: Problem) => previewGroups(failed(problem), lex, say)[0]!

  it('names the area and its reason when its owner refused for want of a box', () => {
    const g = note({ title: 'Forbidden', status: 403, code: 'err:request:forbidden' })
    expect(g).toMatchObject({ badge: 'refused', badgeStatus: 'late' })
    expect(g.note).toBe('Order register refused this file: you do not hold the box that imports it')
  })

  it.each([
    [{ title: 'Unprocessable', status: 422, detail: 'kinds must be a list', code: 'err:config:x' }, 'its part of the file is out of shape (kinds must be a list)'],
    [{ title: 'Bad', status: 400, detail: 'kinds must be a list', code: 'err:config:config_bad_document' }, 'its part of the file is out of shape (kinds must be a list)'],
    [{ title: 'Unprocessable', status: 422, code: 'err:config:x' }, 'its part of the file is out of shape'],
    [{ title: 'Conflict', status: 409, detail: 'a newer version is held', code: 'err:x' }, 'Conflict (a newer version is held)'],
    [{ title: 'Too large', status: 413 }, 'Too large'],
  ])('says why an owner refused with %j', (problem, reason) => {
    expect(note(problem).note).toBe(`Order register refused this file: ${reason}`)
    expect(note(problem).badge).toBe('refused')
  })

  it.each([
    ['an owner that answered an error of its own', { title: 'Broken', status: 500, code: 'err:x' }],
    ['an owner that could not be reached', { status: 502, code: 'err:upstream:unavailable' }],
    ['an owner with no word about it', undefined],
  ])('says %s did not answer, naming the area', (_what, problem) => {
    const g = note(problem)
    expect(g).toMatchObject({ badge: 'failed', badgeStatus: 'late' })
    expect(g.note).toBe('Order register did not answer, so its part of the file could not be judged.')
  })

  it('stops a preview with the areas that refused, else with the areas that did not answer', () => {
    const both = answer('failed', {
      orders: { status: 'failed', problem: { title: 'Forbidden', status: 403 } },
      stock: { status: 'failed', problem: { status: 502, code: 'err:upstream:unavailable' } },
    })
    expect(failedStop(both, lex, say, 'en')).toBe('Order register refused this file, so none of it can be applied. Change what the reason says, then drop the file again.')
    const down = answer('failed', {
      orders: { status: 'failed', problem: { status: 502, code: 'err:upstream:unavailable' } },
      stock: { status: 'failed' },
      people: { status: 'previewed' },
    })
    expect(failedStop(down, lex, say, 'en')).toBe('Order register and Stock modules did not answer, so this file could not be judged. Nothing was written. Preview again in a moment.')
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

  it('adds them to an empty file without a stray comma', () => {
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

  it('says what landed in each section, counting only what changed, and which line a way to History belongs on', () => {
    const lines = resultLines(applied('applied', 'applied', 'applied'), lex, say)
    expect(lines[0]).toMatchObject({ title: 'Order register', word: 'applied', sentence: '2 changes landed, recorded in History under your name', landed: true })
    expect(lines[1]).toMatchObject({ sentence: 'nothing in it changes this part', landed: false })
  })

  it('tells a restored section from a withheld one from one that could not write', () => {
    const rolled = resultLines(applied('rolledBack', 'rolledBack', 'failed'), lex, say)
    expect(rolled.map((l) => [l.word, l.role])).toEqual([
      ['rolled back', 'blocked'],
      ['could not write', 'late'],
    ])
    const first = resultLines(applied('failed', 'failed', 'withheld'), lex, say)
    expect(first[1]).toMatchObject({ word: 'withheld', sentence: 'clean, not applied because another part did not land' })
    expect(rolled.every((l) => !l.landed)).toBe(true)
  })

  it('says a restored section kept what the file added, and one that added nothing was restored whole', () => {
    const kept = resultLines(applied('rolledBack', 'rolledBack', 'rolledBack'), lex, say)
    expect(kept[0]!.sentence).toBe('restored: every change is back as it was, except what the file added')
    expect(kept[1]!.sentence).toBe('restored to what it held before this import')
  })

  it('says a part that could not write: its service did not answer, or it refused', () => {
    const a = (problem?: Problem) =>
      answer('rolledBack', { orders: { status: 'failed', ...(problem ? { problem } : {}) }, stock: { status: 'rolledBack' } }, false)
    for (const problem of [{ status: 502, code: 'err:upstream:unavailable' }, { status: 500 }, undefined]) {
      expect(resultLines(a(problem), lex, say)[0]).toMatchObject({
        word: 'could not write',
        sentence: 'its service did not answer. Nothing of this part was written.',
      })
    }
    expect(resultLines(a({ title: 'Forbidden', status: 403 }), lex, say)[0]!.sentence).toBe(
      'it refused its part: you do not hold the box that imports it. Nothing of this part was written.',
    )
    expect(resultLines(a({ title: 'Conflict', status: 409, detail: 'older version' }), lex, say)[0]!.sentence).toBe(
      'it refused its part: Conflict (older version). Nothing of this part was written.',
    )
  })

  // In a partial file the coordinator still calls the unrestored section
  // applied; that is the one section a person must not read as fine.
  it('reads a section still "applied" in a partial file as not restored', () => {
    const a = applied('partial', 'applied', 'failed')
    expect(standing(a.sections.orders!, a, say)).toEqual({ word: 'not restored', role: 'late' })
    expect(resultLines(a, lex, say)[0]).toMatchObject({ landed: false })
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

// A restore takes back changes but never an addition: an apply never removes, so
// what the file added is still there after a roll back, and the person is told.
describe('a rolled-back Apply', () => {
  const back = (sections: ImportAnswer['sections']) => answer('rolledBack', sections, false)
  const file = {
    orders: { priorities: [{ key: 'rush', label: 'Rush' }] },
    stock: { units: [{ key: 'pallet', name: 'Pallet' }] },
  }
  const written = (items: unknown[], part = 'priorities') => ({ status: 'rolledBack' as const, report: orders({ [part]: items }) })

  it('says what stayed, by part and name, once for each area where it is taken out of use', () => {
    const a = back({
      orders: written([{ key: 'rush', status: 'added' }, { key: 'normal', status: 'unchanged' }]),
      stock: written([{ key: 'pallet', status: 'added' }, { key: 'crate', status: 'added' }], 'units'),
      people: { status: 'failed', problem: { status: 502, code: 'err:upstream:unavailable' } },
    })
    const worded = (row: TransferRow) => (row.key === 'pallet' ? { area: 'flow' } : null)
    const r = rollback(a, lex, say, ctxFor(file, { transfer: { describe: worded } }))
    expect(r.head).toBe('Rolled back, except what it added.')
    expect(r.rest).toBe('people could not write its part after Order register and Stock modules had written theirs, so they were restored to what they held before.')
    expect(r.keptLead).toBe('A restore never removes, so what the file added is still here:')
    // A name the file lacks falls back to the key.
    expect(r.kept).toEqual(['Priorities: «Rush»', 'Units: «Pallet»', 'Units: crate'])
    expect(r.areas).toEqual(['workflow', 'flow'])
  })

  it('says it in the singular when one section had written its own', () => {
    const a = back({ orders: written([{ key: 'rush', status: 'added' }]), stock: { status: 'failed' } })
    expect(rollback(a, lex, say, ctxFor(file)).rest).toBe(
      'Stock modules could not write its part after Order register had written its own, so it was restored to what it held before.',
    )
  })

  it('says nothing is in force, and lists nothing, when the file added nothing', () => {
    const a = back({ orders: written([{ key: 'normal', status: 'unchanged' }, { key: 'high', status: 'changed' }]), stock: { status: 'failed' } })
    expect(rollback(a, lex, say, ctxFor(file))).toMatchObject({ head: 'Nothing of this file is in force.', keptLead: '', kept: [], areas: [] })
  })

  it('knows no area for what the host and the part name none for', () => {
    const a = back({ stock: written([{ key: 'pallet', status: 'added' }], 'units'), orders: { status: 'failed' } })
    expect(rollback(a, lex, say, ctxFor(file)).areas).toEqual([])
  })
})

describe('what a file says about itself', () => {
  it('reads when and where it was exported, and which sections it carries', () => {
    const text = JSON.stringify({ gmbConfig: '1.0', exportedAt: '2026-09-20T10:00:00Z', tenant: { id: 'W-1' }, sections: { a: {}, b: {} } })
    expect(aboutDocument(text)).toEqual({ exportedAt: '2026-09-20T10:00:00Z', workspace: 'W-1', sectionKeys: ['a', 'b'] })
  })

  it('says nothing about a file it cannot read, rather than failing', () => {
    expect(aboutDocument('not json')).toEqual({ exportedAt: '', workspace: '', sectionKeys: [] })
  })

  it("takes a download's name from the coordinator's header", () => {
    expect(downloadName('attachment; filename="configuration-2026-09-23.json"', 'x.json')).toBe('configuration-2026-09-23.json')
    expect(downloadName('', 'x.json')).toBe('x.json')
  })
})
