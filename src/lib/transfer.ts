// The configuration document, as this screen reads the coordinator's answer about it.
//
// Nothing here judges a document. Each owning service judges its own section and
// answers a report; the coordinator answers one outcome for the whole document.
// What this file does is turn that answer into what a person reads — which groups
// and rows the list shows, what each section is called and how it stands, and
// which versions an Apply has to carry back. The screens' own words come through
// `say`; what a section and its parts are called comes from the host, through a
// lexicon, because these screens serve every product and name none.
import type { DiffGroup, DiffRow, StatusRole } from 'uibyte'

/** A translator, shaped like vue-i18n's `t` with named values and an optional count. */
export type Say = (key: string, named?: Record<string, unknown>, plural?: number) => string

/** One item of an owner's report: a key, what happens to it, and why when refused. */
export interface ReportItem {
  key: string
  status: string
  reason?: string
  detail?: string
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
}

/** The whole document's outcome — one per document. */
export type Outcome = 'previewed' | 'refused' | 'failed' | 'applied' | 'rolledBack' | 'partial'

export interface ImportAnswer {
  dryRun: boolean
  outcome: Outcome
  /** Present only when the document carries a hash to compare with. Never a gate. */
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
  parts: Record<string, { key: string; word: string }[]>
}

const ITEM_ROLE: Record<string, StatusRole> = {
  added: 'ontrack',
  changed: 'blocked',
  unchanged: 'idle',
  refused: 'late',
}

const words = (key: string) => `configbyte.transfer.${key}`

/** The sections of an answer: the ones the coordinator writes, in its order, then the rest. */
export function orderedSections(answer: ImportAnswer, lex: Pick<Lexicon, 'order'>): [string, SectionResult][] {
  const names = Object.keys(answer.sections)
  const known = lex.order.filter((n) => names.includes(n))
  const others = names.filter((n) => !lex.order.includes(n)).sort()

  return [...known, ...others].map((n) => [n, answer.sections[n] as SectionResult])
}

/** A section's name for a person. A section the host does not describe keeps the name it arrived with. */
export function sectionTitle(name: string, lex: Lexicon): string {
  return lex.titles[name] || name
}

/**
 * Every item a section's report lists, with the part it belongs to. A report is a
 * JSON object whose key order carries nothing, so the host's order is used, and a
 * part the host does not know still appears, after its own.
 */
export function reportItems(name: string, result: SectionResult, lex?: Lexicon): { part: string; item: ReportItem }[] {
  const report = result.report ?? {}
  const lists = Object.keys(report).filter((k) => Array.isArray(report[k]))
  const known = (lex?.parts[name] ?? []).map((p) => p.key)
  const parts = [...known.filter((p) => lists.includes(p)), ...lists.filter((p) => !known.includes(p)).sort()]
  const out: { part: string; item: ReportItem }[] = []
  for (const part of parts) {
    for (const item of report[part] as ReportItem[]) out.push({ part, item })
  }

  return out
}

function partWord(name: string, part: string, lex: Lexicon): string {
  return lex.parts[name]?.find((p) => p.key === part)?.word || part
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

/** How many items the document adds, changes, leaves alone and has refused. */
export function counts(answer: ImportAnswer): Record<'added' | 'changed' | 'unchanged' | 'refused', number> {
  const n = { added: 0, changed: 0, unchanged: 0, refused: 0 }
  for (const [name, result] of Object.entries(answer.sections)) {
    for (const { item } of reportItems(name, result)) {
      if (item.status in n) n[item.status as keyof typeof n] += 1
    }
  }

  return n
}

/** Whether a preview can be applied: nothing refused, nothing failed, something to write. */
export function canApply(preview: ImportAnswer): boolean {
  return preview.outcome === 'previewed' && Object.values(preview.sections).some((r) => r.status === 'previewed')
}

/**
 * A section's standing, as a word and a tone. In a preview a clean section beside
 * a refused one is "clean — lands only with the rest": the coordinator answers
 * `previewed` for it, and the screen says what that means here. After an Apply,
 * a section still called applied while the document is partial is the one whose
 * restore failed.
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
      return { word: w('failed'), role: 'late' }
  }
}

function rowsOf(name: string, result: SectionResult, lex: Lexicon, say: Say): DiffRow[] {
  return reportItems(name, result, lex).map(({ part, item }) => ({
    key: item.key || '—',
    part: partWord(name, part, lex),
    status: ITEM_ROLE[item.status] ?? 'idle',
    statusLabel: say(words(`item.${item.status}`)),
    detail: item.detail || item.reason || '',
    folded: item.status === 'unchanged',
    marked: item.status === 'refused',
  }))
}

/** The preview as the diff list draws it: one group per section, the quiet rows folded. */
export function previewGroups(answer: ImportAnswer, lex: Lexicon, say: Say): DiffGroup[] {
  return orderedSections(answer, lex).map(([name, result]) => {
    const rows = rowsOf(name, result, lex, say)
    const moving = rows.filter((r) => !r.folded).length
    const quiet = rows.length - moving
    const { word, role } = standing(result, answer, say)
    let note = ''
    if (result.status === 'failed') note = say(words('note.failed'))
    else if (result.status === 'skipped') note = say(words('note.skipped'))

    return {
      key: name,
      title: sectionTitle(name, lex),
      badge: word,
      badgeStatus: role,
      summary: rows.length ? say(words('summary.changes'), { n: moving }, moving) : undefined,
      foldedLabel: quiet ? say(words('summary.unchanged'), { n: quiet }, quiet) : undefined,
      note: note || undefined,
      rows,
    }
  })
}

/** The rows an Apply refused, and nothing else — what is shown under its answer. */
export function refusedGroups(answer: ImportAnswer, lex: Lexicon, say: Say): DiffGroup[] {
  return orderedSections(answer, lex)
    .map(([name, result]) => ({
      key: name,
      title: sectionTitle(name, lex),
      rows: rowsOf(name, result, lex, say).filter((r) => r.marked),
    }))
    .filter((g) => g.rows.length > 0)
}

/** One line per section in an Apply's answer: its name, its standing, and what that means. */
export function resultLines(
  answer: ImportAnswer,
  lex: Lexicon,
  say: Say,
): { key: string; title: string; word: string; role: StatusRole; sentence: string }[] {
  return orderedSections(answer, lex).map(([name, result]) => {
    const { word, role } = standing(result, answer, say)
    const moving = reportItems(name, result).filter(({ item }) => item.status !== 'unchanged').length
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
        sentence = say(words('line.rolledBack'))
        break
      case 'skipped':
        sentence = say(words('line.skipped'))
        break
      default:
        sentence = say(words('line.failed'))
    }

    return { key: name, title: sectionTitle(name, lex), word, role, sentence }
  })
}

/** What an exported document says about itself — informative only, never checked. */
export function aboutDocument(text: string): { exportedAt: string; workspace: string; sections: number } {
  try {
    const doc = JSON.parse(text) as { exportedAt?: unknown; tenant?: { id?: unknown }; sections?: unknown }
    return {
      exportedAt: typeof doc.exportedAt === 'string' ? doc.exportedAt : '',
      workspace: typeof doc.tenant?.id === 'string' ? doc.tenant.id : '',
      sections: doc.sections && typeof doc.sections === 'object' ? Object.keys(doc.sections).length : 0,
    }
  } catch {
    return { exportedAt: '', workspace: '', sections: 0 }
  }
}

/**
 * The document as an Apply sends it: the file's own text, with the preview's
 * versions added as its last member.
 *
 * Added to the text rather than to a parsed copy, so the Apply sends the very
 * bytes the preview judged — a parse and re-serialise can round a large number or
 * drop a repeated key. And added LAST, so that where a hand-edited file carries a
 * member of the same name, the preview's versions are the ones read.
 */
export function withExpect(text: string, expect: Record<string, string>): string {
  const end = text.lastIndexOf('}')
  if (end < 0) return text
  const head = text.slice(0, end).trimEnd()
  const separator = head.endsWith('{') ? '' : ','

  return `${head}${separator}"expect":${JSON.stringify(expect)}${text.slice(end)}`
}

/** The name a download arrives under, from the coordinator's own header. */
export function downloadName(disposition: string, fallback: string): string {
  const match = /filename="?([^";]+)"?/i.exec(disposition)

  return match?.[1] ?? fallback
}
