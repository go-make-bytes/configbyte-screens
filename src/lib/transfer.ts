// The configuration file, as this screen reads the coordinator's answer about it.
//
// Nothing here judges a file. Each owning service judges its own part and answers
// a report; the coordinator answers one outcome for the whole file. What this
// file does is turn that answer into what a person reads — which groups and rows
// the list shows, what each part and item is called and what happens to it, how
// each area stands, and which versions an Apply has to carry back. The screens'
// own words come through `say`; what an area and its parts are called comes from
// the host, through a lexicon, because these screens serve every product and name
// none. Items are named from the file the person chose, which the answer itself
// does not carry.
import type { DiffGroup, DiffRow, StatusRole } from 'uibyte'

import type { TransferOptions, TransferRow } from '../options'

/** A translator, shaped like vue-i18n's `t` with named values and an optional count. */
export type Say = (key: string, named?: Record<string, unknown>, plural?: number) => string

/** One item of an owner's report: a key, what happens to it, and why when refused. */
export interface ReportItem {
  key: string
  status: string
  reason?: string
  detail?: string
}

/** A service's own account of why it refused or failed a call, verbatim. */
export interface Problem {
  type?: string
  title?: string
  status?: number
  detail?: string
  code?: string
}

/** One section's standing in an answer, as the coordinator reports it. */
export interface SectionResult {
  status: 'previewed' | 'applied' | 'refused' | 'withheld' | 'rolledBack' | 'skipped' | 'failed'
  /** The owner's version as the answer leaves the section — what an Apply names. */
  version?: string
  /** The owning service's report, verbatim. */
  report?: Record<string, unknown>
  /** Why a section was skipped, or what a restore did to it (the coordinator's words). */
  detail?: string
  /** What the owning service said when it refused or failed the call itself. */
  problem?: Problem
}

/** The whole file's outcome — one per file. */
export type Outcome = 'previewed' | 'refused' | 'failed' | 'applied' | 'rolledBack' | 'partial'

export interface ImportAnswer {
  dryRun: boolean
  outcome: Outcome
  /** Present only when the file carries a hash to compare with. Never a gate. */
  documentEdited?: boolean
  sections: Record<string, SectionResult>
}

/** What the host calls its sections and their parts, already translated. */
export interface Lexicon {
  /** The sections in the order an import writes them, as the coordinator answered it. */
  order: string[]
  /** A section's name for a person. A section missing here keeps the name it arrived with. */
  titles: Record<string, string>
  /** Each section's parts in the order the host's screens show them, each with its word. */
  parts: Record<
    string,
    {
      key: string
      word: string
      /** The part's count in words, given its number. */
      count?: (n: number) => string
      /** The host entry where this part's items are taken out of use. */
      area?: string
    }[]
  >
}

/** What rows are worded from, beside the answer itself: the file, the language, the host's words. */
export interface Context {
  /** The file's sections by name, as the file carries them. */
  file: Record<string, Record<string, unknown>>
  /** The language the screen speaks. */
  lang: string
  /** The section of the membership register, whose shape these screens know. */
  register?: string
  transfer?: TransferOptions
  /** This workspace's own name, when it could be read. */
  mine?: string
}

const NONE: Context = { file: {}, lang: 'en' }

const ITEM_ROLE: Record<string, StatusRole> = {
  added: 'ontrack',
  changed: 'blocked',
  unchanged: 'idle',
  refused: 'late',
  skipped: 'idle',
}

/** The reason of an item that is about the workspace's own name or login, which a file never sets. */
const WORKSPACE_OWNED = 'config_workspace_owned'

/** The reasons whose words the screens have, by the key of their sentence. */
const REFUSAL: Record<string, string> = {
  config_key_conflict: 'keyConflict',
  config_unknown_reference: 'unknownReference',
  config_in_use: 'inUse',
  config_number_taken: 'numberTaken',
}

const words = (key: string) => `configbyte.transfer.${key}`

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): string => (typeof v === 'string' && v.trim() !== '' ? v : '')

/**
 * A value of the file as a key: a word or a number, and nothing else. A
 * hand-edited file may hold an object where a key belongs — one whose own
 * `toString` is not a function cannot even be turned into text — and the
 * service may still report the row, so such a value names nothing.
 */
const scalar = (v: unknown): string | undefined => (typeof v === 'string' || typeof v === 'number' ? String(v) : undefined)

/** Two values of the file joined as "a:b", when both are keys. */
const pair = (a: unknown, b: unknown): string | undefined => {
  const left = scalar(a)
  const right = scalar(b)

  return left === undefined || right === undefined ? undefined : `${left}:${right}`
}

/**
 * A map's own entry for a name. The names looked up here arrive in an answer or in
 * the chosen file — a section nobody owns is reported under the name the file gave
 * it — so a name like `constructor` must find nothing rather than what every
 * object inherits.
 */
export function own<T>(map: Record<string, T> | undefined, name: string): T | undefined {
  return map && Object.prototype.hasOwnProperty.call(map, name) ? map[name] : undefined
}

/** The part of the list formatter these screens use, which the library's typings may not carry. */
type ListFormatCtor = new (lang: string, options: { type: 'conjunction' }) => { formatToParts(items: string[]): { type: string; value: string }[] }
const ListFormat = (Intl as unknown as { ListFormat?: ListFormatCtor }).ListFormat

/**
 * Names joined the way the language joins a list, each piece marked as a name or as
 * the words between; a plain comma list where the language or the formatter is not
 * known.
 */
export function listPieces(items: string[], lang: string): { text: string; item: boolean }[] {
  try {
    if (ListFormat) return new ListFormat(lang, { type: 'conjunction' }).formatToParts(items).map((p) => ({ text: p.value, item: p.type === 'element' }))
  } catch {
    // A language tag the formatter does not accept: the plain list below.
  }

  return items.flatMap((name, i) => [...(i ? [{ text: ', ', item: false }] : []), { text: name, item: true }])
}

export function listOf(items: string[], lang: string): string {
  return listPieces(items, lang)
    .map((p) => p.text)
    .join('')
}

/** The sections of an answer: the ones the coordinator writes, in its order, then the rest. */
export function orderedSections(answer: ImportAnswer, lex: Pick<Lexicon, 'order'>): [string, SectionResult][] {
  const names = Object.keys(answer.sections)
  const known = lex.order.filter((n) => names.includes(n))
  const others = names.filter((n) => !lex.order.includes(n)).sort()

  return [...known, ...others].map((n) => [n, answer.sections[n] as SectionResult])
}

/** A section's name for a person. A section the host does not describe keeps the name it arrived with. */
export function sectionTitle(name: string, lex: Lexicon): string {
  return own(lex.titles, name) || name
}

/** The host's parts of a section, in its order; none for a section it does not describe. */
const partsOf = (lex: Lexicon | undefined, name: string) => own(lex?.parts, name) ?? []

/** Section names as a person reads them, in the coordinator's order, the ones it does not know after, sorted. */
export function namedSections(keys: string[], lex: Lexicon): string {
  const known = lex.order.filter((n) => keys.includes(n))
  const others = keys.filter((n) => !lex.order.includes(n)).sort()

  return [...known, ...others].map((n) => sectionTitle(n, lex)).join(', ')
}

/**
 * Every item a section's report lists, with the part it belongs to. A report is a
 * JSON object whose key order carries nothing, so the host's order is used, and a
 * part the host does not know still appears, after its own.
 */
function walk(name: string, result: SectionResult, lex?: Lexicon): { part: string; item: ReportItem }[] {
  const report = result.report ?? {}
  const lists = Object.keys(report).filter((k) => Array.isArray(report[k]))
  const known = partsOf(lex, name).map((p) => p.key)
  const parts = [...known.filter((p) => lists.includes(p)), ...lists.filter((p) => !known.includes(p)).sort()]
  const out: { part: string; item: ReportItem }[] = []
  for (const part of parts) {
    for (const item of report[part] as ReportItem[]) out.push({ part, item })
  }

  return out
}

/**
 * The items a section's report lists that are rows of the file's own. The two
 * items about the workspace's name and login are not rows: a file never sets them,
 * so they are said in a sentence instead and never counted.
 */
export function reportItems(name: string, result: SectionResult, lex?: Lexicon): { part: string; item: ReportItem }[] {
  return walk(name, result, lex).filter(({ item }) => item.reason !== WORKSPACE_OWNED)
}

/** The items about the workspace's own name and login that a file carried. */
export function workspaceItems(name: string, result: SectionResult): ReportItem[] {
  return walk(name, result)
    .map(({ item }) => item)
    .filter((item) => item.reason === WORKSPACE_OWNED)
}

function partWord(name: string, part: string, lex: Lexicon): string {
  return partsOf(lex, name).find((p) => p.key === part)?.word || part
}

/**
 * The file's sections, by name; a file that cannot be read has none. Held without
 * a prototype, so a section the file calls `__proto__` is just a section.
 */
export function sectionsOf(fileText: string): Record<string, Record<string, unknown>> {
  try {
    const doc = JSON.parse(fileText) as { sections?: unknown }
    if (!isObject(doc) || !isObject(doc.sections)) return {}
    const out: Record<string, Record<string, unknown>> = Object.create(null)
    for (const [name, section] of Object.entries(doc.sections)) {
      if (isObject(section)) out[name] = section
    }

    return out
  } catch {
    return {}
  }
}

interface Found {
  item?: Record<string, unknown>
  /** The register's service the item belongs to, when it is one of its parts. */
  service?: Record<string, unknown>
}

/** The register's items, by the keys its report uses for them. */
function findInRegister(part: string, key: string, section: Record<string, unknown>): Found {
  const services = Array.isArray(section.services) ? section.services.filter(isObject) : []
  const within = (service: Record<string, unknown> | undefined, list: string, match: (i: Record<string, unknown>) => boolean): Found => {
    const items = service && Array.isArray(service[list]) ? (service[list] as unknown[]).filter(isObject) : []

    return { item: items.find(match), service }
  }
  if (part === 'services') {
    const service = services.find((s) => scalar(s.key) === key)

    return { item: service, service }
  }
  if (part === 'roles') {
    const at = key.indexOf(' ')
    if (at < 0) return {}
    const rung = key.slice(at + 1)

    return within(
      services.find((s) => s.key === key.slice(0, at)),
      'roles',
      (r) => pair(r.group, r.level) === rung,
    )
  }
  if (part === 'permissions') {
    const at = key.indexOf('/')
    if (at < 0) return {}
    const box = key.slice(at + 1)

    return within(
      services.find((s) => s.key === key.slice(0, at)),
      'permissions',
      (p) => pair(p.feature, p.act) === box,
    )
  }

  return {}
}

/** A part of the file, ready to find its items in: its items, and each by its key and by its number. */
interface PartIndex {
  items: Record<string, unknown>[]
  byKey: Map<string, Record<string, unknown>>
  byNumber: Map<string, Record<string, unknown>>
}

function indexPart(list: unknown): PartIndex | undefined {
  if (!Array.isArray(list)) return undefined
  const items = list.filter(isObject)
  const byKey = new Map<string, Record<string, unknown>>()
  const byNumber = new Map<string, Record<string, unknown>>()
  for (const item of items) {
    const key = scalar(item.key)
    if (key !== undefined && !byKey.has(key)) byKey.set(key, item)
    const number = scalar(item.number)
    if (number !== undefined && !byNumber.has(number)) byNumber.set(number, item)
  }

  return { items, byKey, byNumber }
}

/**
 * The file's item a report's item is about: by its key, else its number, else
 * the host's own way, which is handed the part's items only. Each part is
 * indexed once for its section, so naming the rows costs one pass over the file
 * however long its lists are.
 */
function finder(name: string, ctx: Context): (part: string, key: string) => Found {
  const section = own(ctx.file, name) ?? {}
  const parts = new Map<string, PartIndex | undefined>()

  return (part, key) => {
    if (name === ctx.register) return findInRegister(part, key, section)
    if (!parts.has(part)) parts.set(part, indexPart(own(section, part)))
    const index = parts.get(part)
    if (!index) return {}

    return { item: index.byKey.get(key) ?? index.byNumber.get(key) ?? ctx.transfer?.find?.(name, part, key, index.items) }
  }
}

const nameIn = (item: Record<string, unknown>, lang: string): string => (isObject(item.labels) ? text(item.labels[lang]) : '')

/** An item's name as the file gives it, drawn in quotes; empty when it has none. */
function nameOf(name: string, part: string, found: Found, ctx: Context, say: Say): string {
  const item = found.item
  if (!item) return ''
  const quoted = (value: string) => (value ? say(words('item.named'), { name: value }) : '')
  if (name === ctx.register && part === 'roles') {
    const said = text(item.description)
    if (said) return quoted(said)

    return say(words('item.rung'), {
      group: scalar(item.group) ?? '',
      level: scalar(item.level) ?? '',
      service: text(found.service?.displayName) || text(found.service?.key),
    })
  }
  if (name === ctx.register && part === 'permissions') return quoted(nameIn(item, ctx.lang) || text(item.description))

  return quoted(nameIn(item, ctx.lang) || text(item.label) || text(item.name) || text(item.displayName))
}

/** What a changed item's members come to, in words: each said once. */
function changeOf(row: TransferRow, say: Say, members: Record<string, string> | undefined): string {
  const said: string[] = []
  const add = (sentence: string) => {
    if (sentence && !said.includes(sentence)) said.push(sentence)
  }
  const named = (member: string) => (members && Object.prototype.hasOwnProperty.call(members, member) ? members[member] : undefined)
  const changed = (row.detail ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
  for (const member of changed) {
    const own = named(member)
    if (member === 'label' || member === 'name') add(say(words('change.name')))
    else if (member === 'labels') add(say(words('change.labels')))
    else if (member === 'description') add(say(words('change.description')))
    else if (member === 'status') {
      const now = row.item?.status
      add(say(words(now === 'retired' ? 'change.retired' : now === 'active' ? 'change.restored' : 'change.status')))
    } else if (own) add(say(own))
    else add(say(words('change.other')))
  }
  if (!said.length) add(say(words('change.other')))

  return said.join(', ')
}

/** What happens to an item, in words, when the host does not say. */
function ownChange(row: TransferRow, say: Say, members: Record<string, string> | undefined): string {
  const said = row.detail || row.reason || ''
  switch (row.status) {
    case 'added':
      return say(words('change.added'))
    case 'changed':
      return changeOf(row, say, members)
    case 'refused': {
      const known = row.reason ? own(REFUSAL, row.reason) : undefined
      if (known) return say(words(`refusal.${known}`))
      if (row.reason === 'config_bad_document') return say(words('refusal.badDocument'), { said }).trim()

      return say(words('refusal.other'), { said }).trim()
    }
    case 'skipped':
      return row.reason === 'config_deployment_owned' ? say(words('skip.deploymentOwned')) : say(words('skip.other'), { said }).trim()
    default:
      return ''
  }
}

interface Built {
  row: DiffRow
  /** The part's key, as the report names it. */
  part: string
  status: string
  /** The host entry where this item is taken out of use, when one is known. */
  area?: string
}

function build(name: string, result: SectionResult, lex: Lexicon, say: Say, ctx: Context): Built[] {
  const find = finder(name, ctx)

  return reportItems(name, result, lex).map(({ part, item }) => {
    const found = find(part, item.key)
    const base: TransferRow = {
      section: name,
      part,
      key: item.key,
      status: item.status,
      reason: item.reason,
      detail: item.detail,
      item: found.item,
      file: own(ctx.file, name) ?? {},
      lang: ctx.lang,
    }
    const host = ctx.transfer?.describe?.(base) ?? null
    const label = host?.name !== undefined ? host.name : nameOf(name, part, found, ctx, say)
    const change = host?.change !== undefined ? host.change : ownChange(base, say, ctx.transfer?.members)

    return {
      row: {
        key: item.key || '—',
        label: label || undefined,
        part: host?.part ?? partWord(name, part, lex),
        status: own(ITEM_ROLE, item.status) ?? 'idle',
        statusLabel: say(words(`item.${item.status}`)),
        detail: change,
        folded: item.status === 'unchanged',
        marked: item.status === 'refused',
      },
      part,
      status: item.status,
      area: host?.area ?? partsOf(lex, name).find((p) => p.key === part)?.area,
    }
  })
}

/**
 * The versions an Apply carries back: the ones the dry run answered, per section.
 * They come from the preview the person read — never from the file, which carries
 * none, and could not carry a useful one from another workspace.
 */
export function expectFrom(preview: ImportAnswer): Record<string, string> {
  const expect: Record<string, string> = {}
  for (const [name, result] of Object.entries(preview.sections)) {
    if (result.version) expect[name] = result.version
  }

  return expect
}

/** How many items the file adds, changes, leaves alone, has refused and does not take. */
export function counts(answer: ImportAnswer): Record<'added' | 'changed' | 'unchanged' | 'refused' | 'skipped', number> {
  const n = { added: 0, changed: 0, unchanged: 0, refused: 0, skipped: 0 }
  for (const [name, result] of Object.entries(answer.sections)) {
    for (const { item } of reportItems(name, result)) {
      if (Object.prototype.hasOwnProperty.call(n, item.status)) n[item.status as keyof typeof n] += 1
    }
  }

  return n
}

/** Whether a preview can be applied: nothing refused, nothing failed, something to write. */
export function canApply(preview: ImportAnswer): boolean {
  return preview.outcome === 'previewed' && Object.values(preview.sections).some((r) => r.status === 'previewed')
}

/** Whether a section failed because its owner refused the call itself, rather than not answering. */
function refusedByOwner(result: SectionResult): boolean {
  const status = result.problem?.status

  return result.status === 'failed' && typeof status === 'number' && status > 0 && status < 500
}

/** An owner's refusal in words: what a person can do about it, or what it said. */
function reasonOf(problem: Problem | undefined, say: Say): string {
  if (!problem) return ''
  if (problem.status === 403) return say(words('reason.noBox'))
  if (problem.status === 422 || (problem.code ?? '').endsWith('config_bad_document')) {
    return problem.detail ? say(words('reason.outOfShape'), { said: problem.detail }) : say(words('reason.outOfShapePlain'))
  }
  const title = problem.title || problem.detail || problem.code || ''

  return problem.title && problem.detail ? `${title} (${problem.detail})` : title
}

/**
 * A section's standing, as a word and a tone. In a preview a clean section beside
 * a refused one is "clean — lands only with the rest": the coordinator answers
 * `previewed` for it, and the screen says what that means here. After an Apply,
 * a section still called applied while the file is partial is the one whose
 * restore failed. A section whose owner refused the call is called refused, and
 * one that did not answer is called failed; after an Apply either is "could not
 * write".
 */
export function standing(result: SectionResult, answer: ImportAnswer, say: Say): { word: string; role: StatusRole } {
  const w = (k: string) => say(words(`badge.${k}`))
  switch (result.status) {
    case 'previewed':
      return answer.outcome === 'previewed'
        ? { word: w('clean'), role: 'ontrack' }
        : { word: w('lands'), role: 'idle' }
    case 'applied':
      return answer.outcome === 'partial'
        ? { word: w('notRestored'), role: 'late' }
        : { word: w('applied'), role: 'ontrack' }
    case 'refused':
      return { word: w('refused'), role: 'late' }
    case 'withheld':
      return { word: w('withheld'), role: 'idle' }
    case 'rolledBack':
      return { word: w('rolledBack'), role: 'blocked' }
    case 'skipped':
      return { word: w('skipped'), role: 'idle' }
    default:
      if (!answer.dryRun) return { word: w('notWritten'), role: 'late' }

      return { word: refusedByOwner(result) ? w('refused') : w('failed'), role: 'late' }
  }
}

/** The sentence about the workspace's own name and login, when the file carried them. */
function workspaceNote(name: string, result: SectionResult, say: Say, ctx: Context): string {
  const items = workspaceItems(name, result)
  if (!items.length) return ''
  const keys = items.map((i) => i.key)
  const tenant = own(ctx.file, name)?.tenant
  const file = isObject(tenant) ? text(tenant.displayName) : ''
  const named = keys.includes('displayName')
  const login = keys.includes('directory')
  let first: string
  if (named && login) first = file ? say(words('workspace.both'), { file }) : say(words('workspace.bothUnnamed'))
  else if (named) first = file ? say(words('workspace.name'), { file }) : say(words('workspace.unnamed'))
  else if (login) first = say(words('workspace.login'))
  else first = say(words('workspace.unnamed'))
  const second = ctx.mine ? say(words('workspace.kept'), { mine: ctx.mine }) : say(words('workspace.keptUnnamed'))

  return `${first} ${second}`
}

/** What each part leaves unchanged, in the part's own count: "2 priorities, 5 stages". */
function unchangedBy(name: string, built: Built[], lex: Lexicon): string {
  const per = new Map<string, number>()
  for (const b of built) if (b.row.folded) per.set(b.part, (per.get(b.part) ?? 0) + 1)

  return [...per]
    .map(([part, n]) => {
      const known = partsOf(lex, name).find((p) => p.key === part)

      return known?.count ? known.count(n) : `${partWord(name, part, lex)} ${n}`
    })
    .join(', ')
}

/** The preview as the diff list draws it: one group per section, the quiet rows folded. */
export function previewGroups(answer: ImportAnswer, lex: Lexicon, say: Say, ctx: Context = NONE): DiffGroup[] {
  return orderedSections(answer, lex).map(([name, result]) => {
    const built = build(name, result, lex, say, ctx)
    const rows = built.map((b) => b.row)
    const quiet = rows.filter((r) => r.folded).length
    // A refusal is not a change, and neither is an item a file may not set: each is counted on its own.
    const many = (status: string) => built.filter((b) => b.status === status).length
    const changes = many('added') + many('changed')
    const summary = [
      changes ? say(words('summary.changes'), { n: changes }, changes) : say(words('summary.none')),
      many('refused') ? say(words('tally.refused'), { n: many('refused') }, many('refused')) : '',
      many('skipped') ? say(words('tally.skipped'), { n: many('skipped') }, many('skipped')) : '',
    ]
      .filter(Boolean)
      .join(' · ')
    const { word, role } = standing(result, answer, say)
    const title = sectionTitle(name, lex)
    const notes: string[] = []
    if (result.status === 'failed') {
      notes.push(
        refusedByOwner(result)
          ? say(words('note.refusedArea'), { area: title, reason: reasonOf(result.problem, say) })
          : say(words('note.failed'), { area: title }),
      )
    } else if (result.status === 'skipped') notes.push(say(words('note.skipped')))
    if (name === ctx.register) {
      const owned = workspaceNote(name, result, say, ctx)
      if (owned) notes.push(owned)
    }

    return {
      key: name,
      title,
      badge: word,
      badgeStatus: role,
      summary: rows.length ? summary : undefined,
      foldedLabel: quiet ? say(words('summary.unchangedBy'), { n: quiet, parts: unchangedBy(name, built, lex) }, quiet) : undefined,
      note: notes.join(' ') || undefined,
      rows,
    }
  })
}

/** The rows an Apply refused, and nothing else — what is shown under its answer. */
export function refusedGroups(answer: ImportAnswer, lex: Lexicon, say: Say, ctx: Context = NONE): DiffGroup[] {
  return orderedSections(answer, lex)
    .map(([name, result]) => ({
      key: name,
      title: sectionTitle(name, lex),
      rows: build(name, result, lex, say, ctx)
        .map((b) => b.row)
        .filter((r) => r.marked),
    }))
    .filter((g) => g.rows.length > 0)
}

/**
 * What stops a preview whose outcome is `failed`: the areas whose owners refused
 * the file, when any did, else the ones that did not answer.
 */
export function failedStop(answer: ImportAnswer, lex: Lexicon, say: Say, lang: string): string {
  const failed = orderedSections(answer, lex).filter(([, r]) => r.status === 'failed')
  const refusing = failed.filter(([, r]) => refusedByOwner(r))
  const titles = (list: typeof failed) => listOf(list.map(([n]) => sectionTitle(n, lex)), lang)
  if (refusing.length) return say(words('stop.refusedArea'), { areas: titles(refusing) })

  return say(words('stop.failed'), { areas: titles(failed) })
}

/** One line per section in an Apply's answer: its name, its standing, and what that means. */
export function resultLines(
  answer: ImportAnswer,
  lex: Lexicon,
  say: Say,
): { key: string; title: string; word: string; role: StatusRole; sentence: string; landed: boolean }[] {
  return orderedSections(answer, lex).map(([name, result]) => {
    const { word, role } = standing(result, answer, say)
    const items = reportItems(name, result)
    const moving = items.filter(({ item }) => item.status !== 'unchanged').length
    let sentence: string
    switch (result.status) {
      case 'applied':
        sentence =
          answer.outcome === 'partial'
            ? say(words('line.notRestored'))
            : moving
              ? say(words('line.applied'), { n: moving }, moving)
              : say(words('line.appliedNothing'))
        break
      case 'withheld':
        sentence = say(words('line.withheld'))
        break
      case 'refused':
        sentence = say(words('line.refused'))
        break
      case 'rolledBack':
        sentence = items.some(({ item }) => item.status === 'added') ? say(words('line.rolledBackKept')) : say(words('line.rolledBack'))
        break
      case 'skipped':
        sentence = say(words('line.skipped'))
        break
      default:
        sentence = refusedByOwner(result)
          ? say(words('line.refusedPart'), { reason: reasonOf(result.problem, say) })
          : say(words('line.notWritten'))
    }

    return { key: name, title: sectionTitle(name, lex), word, role, sentence, landed: result.status === 'applied' && answer.outcome !== 'partial' && moving > 0 }
  })
}

/** What a rolled-back Apply says: how it ended, and what the restore could not take back. */
export interface Rollback {
  head: string
  rest: string
  /** Said before the list of what stayed; empty when the file added nothing. */
  keptLead: string
  /** What the file added and a restore left, one per item: "Part: «Name»". */
  kept: string[]
  /** The host entries where what stayed is taken out of use, each once. */
  areas: string[]
}

export function rollback(answer: ImportAnswer, lex: Lexicon, say: Say, ctx: Context = NONE): Rollback {
  const sections = orderedSections(answer, lex)
  const back = sections.filter(([, r]) => r.status === 'rolledBack')
  const failed = sections.filter(([, r]) => r.status === 'failed' || r.status === 'refused')
  const kept: string[] = []
  const areas: string[] = []
  for (const [name, result] of back) {
    for (const b of build(name, result, lex, say, ctx)) {
      if (b.status !== 'added') continue
      kept.push(`${b.row.part ?? b.part}: ${b.row.label || b.row.key}`)
      if (b.area && !areas.includes(b.area)) areas.push(b.area)
    }
  }
  const titles = (list: typeof back) => listOf(list.map(([n]) => sectionTitle(n, lex)), ctx.lang)

  return {
    head: say(words(kept.length ? 'outcome.rolledBack.head' : 'outcome.rolledBack.headNone')),
    rest: say(words('outcome.rolledBack.rest'), { failed: titles(failed), written: titles(back) }, back.length),
    keptLead: kept.length ? say(words('outcome.rolledBack.kept')) : '',
    kept,
    areas,
  }
}

/** What an exported file says about itself — informative only, never checked. */
export function aboutDocument(fileText: string): { exportedAt: string; workspace: string; sectionKeys: string[] } {
  try {
    const doc = JSON.parse(fileText) as { exportedAt?: unknown; tenant?: { id?: unknown }; sections?: unknown }

    return {
      exportedAt: typeof doc.exportedAt === 'string' ? doc.exportedAt : '',
      workspace: typeof doc.tenant?.id === 'string' ? doc.tenant.id : '',
      sectionKeys: isObject(doc.sections) ? Object.keys(doc.sections) : [],
    }
  } catch {
    return { exportedAt: '', workspace: '', sectionKeys: [] }
  }
}

/**
 * The file as an Apply sends it: the file's own text, with the preview's
 * versions added as its last member.
 *
 * Added to the text rather than to a parsed copy, so the Apply sends the very
 * bytes the preview judged — a parse and re-serialise can round a large number or
 * drop a repeated key. And added LAST, so that where a hand-edited file carries a
 * member of the same name, the preview's versions are the ones read.
 */
export function withExpect(fileText: string, expect: Record<string, string>): string {
  const end = fileText.lastIndexOf('}')
  if (end < 0) return fileText
  const head = fileText.slice(0, end).trimEnd()
  const separator = head.endsWith('{') ? '' : ','

  return `${head}${separator}"expect":${JSON.stringify(expect)}${fileText.slice(end)}`
}

/** The name a download arrives under, from the coordinator's own header. */
export function downloadName(disposition: string, fallback: string): string {
  const match = /filename="?([^";]+)"?/i.exec(disposition)

  return match?.[1] ?? fallback
}
