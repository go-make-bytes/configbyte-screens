// The deployment's own area, as these screens read it: the companies a deployment
// serves, the products it offers, and what became of a company's starting
// configuration. Everything here is a plain function of what was read, so a screen
// and its tests say the same thing.
import { orderedSections, reportItems, resultLines, type ImportAnswer, type Lexicon, type Outcome, type Say, type SectionResult } from './transfer'

/** A company of the deployment, as the register answers it. */
export interface Company {
  id: string
  name: string
  status: string
  /** When it was opened, as an instant. */
  createdAt: string
  /** Whether it is the company that runs the deployment. */
  own: boolean
  /** The keys of the products it has. */
  products: string[]
  /** How many administrators it has; their names are read apart. */
  administrators: number
  /** Whether somebody of the company has signed in. */
  entered: boolean
}

/** A product the deployment sells, and what it needs. */
export interface Product {
  key: string
  displayName: string
  /** Whether the services that make it run have started in this deployment. */
  offered: boolean
  /** The keys of the products that must be ticked with it. */
  needs: string[]
}

/** One administrator of a company, as the recorded read answers them. */
export interface Administrator {
  userId: string
  displayName: string
  status: string
  /** The day they last signed in; null when they never did. */
  lastSignedInOn: string | null
}

/** One person who manages the deployment, as the recorded read answers them. */
export interface DeploymentAdmin {
  userId: string
  displayName: string
  status: string
  lastSignedInOn: string | null
  /** Whether they were named in the deployment's settings (`settings`) or added on a screen (`screen`). */
  addedFrom: string
  /** When they were added, as an instant. */
  addedAt: string
}

/** What became of a company's starting configuration. */
export interface Configuration {
  name: string
  outcome: Outcome
  sections: Record<string, SectionResult>
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): string => (typeof v === 'string' ? v : '')
const texts = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** A company as the register answered it; a row that is not an object with an id is none. */
export function companyOf(raw: unknown): Company | null {
  if (!isObject(raw) || !text(raw.id)) return null

  return {
    id: text(raw.id),
    name: text(raw.name),
    status: text(raw.status),
    createdAt: text(raw.createdAt),
    own: raw.own === true,
    products: texts(raw.products),
    administrators: typeof raw.administrators === 'number' ? raw.administrators : 0,
    // Only an explicit false says nobody has signed in; a register that says nothing is taken as entered.
    entered: raw.entered !== false,
  }
}

/** A product as the register answered it; a row without a key is none. */
export function productOf(raw: unknown): Product | null {
  if (!isObject(raw) || !text(raw.key)) return null

  return { key: text(raw.key), displayName: text(raw.displayName), offered: raw.offered !== false, needs: texts(raw.needs) }
}

/** An administrator as a recorded read answers them. */
export function administratorOf(raw: unknown): Administrator | null {
  if (!isObject(raw) || !text(raw.userId)) return null
  const last = text(raw.lastSignedInOn)

  return { userId: text(raw.userId), displayName: text(raw.displayName), status: text(raw.status), lastSignedInOn: last || null }
}

/** A deployment admin as a recorded read answers them. */
export function deploymentAdminOf(raw: unknown): DeploymentAdmin | null {
  const base = administratorOf(raw)
  if (!base || !isObject(raw)) return null

  return { ...base, addedFrom: text(raw.addedFrom), addedAt: text(raw.addedAt) }
}

/** A list of whatever an answer holds under a member, each read by `read`; what cannot be read is left out. */
export function rowsOf<T>(body: unknown, member: string, read: (raw: unknown) => T | null): T[] {
  const rows = isObject(body) && Array.isArray(body[member]) ? (body[member] as unknown[]) : []

  return rows.map(read).filter((row): row is T => row !== null)
}

/** The names of the products a company has, in the products' own words; a key the products do not hold is never drawn. */
export function namesOf(keys: string[], products: Product[]): string[] {
  return keys.map((k) => products.find((p) => p.key === k)?.displayName ?? '').filter((n) => n !== '')
}

/** Whether a company has a product the products read does not hold. */
export function hasUnknownProduct(company: Company, products: Product[]): boolean {
  return company.products.some((k) => !products.some((p) => p.key === k))
}

/** Why a product's box cannot be changed now. */
export type Lock = '' | 'unoffered' | 'needs' | 'neededBy'

/** One product's box: whether it is ticked, and why it cannot be changed, with the names that reason names. */
export interface Tick {
  key: string
  name: string
  on: boolean
  lock: Lock
  /** For `needs`: the products still to tick first. For `neededBy`: the ticked products that need this one. */
  names: string[]
}

/**
 * Every product's box, given what is ticked. A product that needs another cannot
 * be ticked before it; a ticked product another ticked one needs cannot be
 * unticked; a product the deployment does not offer cannot be ticked at all.
 */
export function ticksOf(products: Product[], ticked: string[]): Tick[] {
  const on = (key: string) => ticked.includes(key)
  const nameOf = (key: string) => products.find((p) => p.key === key)?.displayName ?? ''

  return products.map((p) => {
    const ticks = on(p.key)
    const missing = p.needs.filter((n) => !on(n))
    const users = products.filter((q) => on(q.key) && q.needs.includes(p.key))
    const base = { key: p.key, name: p.displayName, on: ticks }
    if (!ticks && !p.offered) return { ...base, lock: 'unoffered' as const, names: [] }
    if (!ticks && missing.length) return { ...base, lock: 'needs' as const, names: missing.map(nameOf).filter((n) => n !== '') }
    if (ticks && users.length) return { ...base, lock: 'neededBy' as const, names: users.map((q) => q.displayName) }

    return { ...base, lock: '' as const, names: [] }
  })
}

/** What cannot be done to one product's box, given the products as they are now; empty when nothing stops it. */
export function whyNot(products: Product[], ticked: string[], key: string): Tick | null {
  const tick = ticksOf(products, ticked).find((t) => t.key === key)

  return tick && tick.lock ? tick : null
}

/** Companies narrowed by a typed name, whatever the letters' case or marks. */
export function narrow(companies: Company[], needle: string, fold: (s: string) => string): Company[] {
  const wanted = fold(needle)

  return wanted ? companies.filter((c) => fold(c.name).includes(wanted)) : companies
}

/** An answer to opening or starting a company from a file, as the import's own functions read it. */
export function answerOf(configuration: Configuration): ImportAnswer {
  return { dryRun: false, outcome: configuration.outcome, sections: configuration.sections }
}

/** The configuration an answer carries, when it carries one the screens can read. */
export function configurationOf(raw: unknown): Configuration | null {
  if (!isObject(raw)) return null
  const outcome = text(raw.outcome) as Outcome
  if (!['applied', 'refused', 'failed', 'rolledBack', 'partial'].includes(outcome)) return null
  const sections: Record<string, SectionResult> = {}
  if (isObject(raw.sections)) {
    for (const [key, value] of Object.entries(raw.sections)) {
      if (isObject(value) && typeof value.status === 'string') sections[key] = value as unknown as SectionResult
    }
  }

  return { name: text(raw.name), outcome, sections }
}

/** One part's line in the band: its name, how it stands, and what that means. */
export interface PartLine {
  key: string
  title: string
  word: string
  role: 'ontrack' | 'blocked' | 'late' | 'idle'
  sentence: string
}

/**
 * The lines under a configuration's band, one per part the answer holds, in the
 * import's own words for how a part stands. A part that landed says how many
 * changes it made; no sentence of a service is drawn as it came.
 */
export function partLines(configuration: Configuration, lexicon: Lexicon, say: Say): PartLine[] {
  const answer = answerOf(configuration)
  const base = resultLines(answer, lexicon, say)
  const by = new Map(orderedSections(answer, lexicon).map(([name, result]) => [name, result]))

  return base.map((line) => {
    const result = by.get(line.key)
    let sentence = line.sentence
    // A part its owner refused with a 4xx is said in these screens' own words: the owner's title and detail are
    // its own, and are never drawn in this area.
    const status = result?.problem?.status
    if (result && result.status === 'failed' && typeof status === 'number' && status > 0 && status < 500) {
      sentence = say('configbyte.deployment.configuration.partRefused')
    } else if (result && result.status === 'applied' && configuration.outcome === 'applied') {
      const moving = reportItems(line.key, result).filter(({ item }) => item.status !== 'unchanged').length
      sentence = moving ? say('configbyte.deployment.configuration.changes', { n: moving }, moving) : line.sentence
    }

    return { key: line.key, title: line.title, word: line.word, role: line.role as PartLine['role'], sentence }
  })
}
