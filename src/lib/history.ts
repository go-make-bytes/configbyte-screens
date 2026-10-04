// History across the services: each keeps its own history and answers it a page
// at a time, newest first. This screen keeps no copy; it reads each one and lays
// the pages side by side as one list.
//
// Several pages can only be merged up to the oldest line each of them has
// reached: a service with older lines still unread may hold a line newer than
// another service's oldest. So the list shows lines down to that horizon, and
// *Show older* reads the next page of each service that has more.
import type { HistoryLine, LineWords } from '../options'

/** One stream read page by page: one service, with the query that keeps its lines. */
export interface Stream {
  key: string
  section: string
  query: string
  filter: string
  /** The key of the word that names its service on each line. */
  chip: string
  lines: HistoryLine[]
  more: boolean
  /** Why the stream could not be read: `unanswered`, or the reason given. Empty means it was. */
  failed: string
}

/** A line placed in the merged list. */
export interface Placed {
  stream: Stream
  line: HistoryLine
  when: number
}

/** The time a line happened, as a number; a line whose time cannot be read sorts last. */
function whenOf(line: HistoryLine): number {
  const n = Date.parse(line.at)

  return Number.isNaN(n) ? 0 : n
}

/**
 * The lines of the shown streams, newest first, down to the horizon: the newest
 * of the oldest lines read from each stream that has more. A line older than it
 * waits until the stream holding the gap is read further.
 */
export function merge(streams: Stream[]): { lines: Placed[]; more: boolean } {
  const limiting = streams.filter((s) => s.more && s.lines.length > 0)
  const horizon = limiting.length ? Math.max(...limiting.map((s) => whenOf(s.lines[s.lines.length - 1]!))) : -Infinity
  const order = new Map(streams.map((s, i) => [s, i]))
  const lines = streams
    .flatMap((stream) => stream.lines.map((line) => ({ stream, line, when: whenOf(line) })))
    .filter((p) => p.when >= horizon)
    .sort((a, b) => b.when - a.when || order.get(a.stream)! - order.get(b.stream)! || (a.line.id < b.line.id ? 1 : -1))

  return { lines, more: streams.some((s) => s.more) }
}

/** A long hash cut to what a person compares by eye. */
export function shortHash(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 4)}…${hash.slice(-4)}` : hash
}

/** The names a register line needs, looked up from the register's own lists. */
export interface Names {
  /** A member by the register's id. */
  member(id: string): string
  role(id: string): string
  type(id: string): string
  position(id: string): string
  /** A box's words, by the permission as it travels. */
  box(permission: string): string
}

/** A line as the screen draws it: whose act, the sentence, and what to show beneath. */
export interface Worded {
  /** Who the line is about first: the person who acted, or the member it happened to. */
  who: { member?: string; actor?: string }
  words: LineWords
  detail?: LineWords
}

const W = 'configbyte.history.lines'

const asText = (v: unknown) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v))
const asList = (v: unknown) => (Array.isArray(v) ? v.map(asText) : [])

/**
 * The two lines every owner writes for its own part: an import that wrote it,
 * and an export that read it out. The file itself is named by its hash, which
 * is how a file in hand is matched to its lines.
 */
export function transportWords(line: HistoryLine): Worded | null {
  const p = line.payload ?? {}
  if (line.kind === 'configExported') {
    return { who: { actor: line.actor }, words: { key: `${W}.exported` }, ...(p.partHash ? { detail: { key: `${W}.part`, values: { part: shortHash(asText(p.partHash)) } } } : {}) }
  }
  if (line.kind !== 'configApplied') return null
  let changed = 0
  let unchanged = 0
  for (const value of Object.values(p)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const c = value as Record<string, unknown>
    changed += Number(c.added ?? 0) + Number(c.changed ?? 0)
    unchanged += Number(c.unchanged ?? 0)
  }
  const words: LineWords = changed
    ? { key: `${W}.imported`, values: { changed: String(changed), unchanged: String(unchanged) } }
    : { key: `${W}.importedNothing` }
  const file = asText(p.documentHash)
  const part = asText(p.partHash)
  const detail: LineWords | undefined =
    file && part
      ? { key: `${W}.fileAndPart`, values: { file: shortHash(file), part: shortHash(part) } }
      : part
        ? { key: `${W}.part`, values: { part: shortHash(part) } }
        : undefined

  return { who: { actor: line.actor }, words, ...(detail ? { detail } : {}) }
}

/** Whether a service role is the administrator's own box. */
const isAdministrator = (p: Record<string, unknown>) => p.group === 'membership' && p.level === 'admin'

/**
 * A line of the membership register in words. Lines the register writes when
 * someone arrives are about the person who arrived; every other line is about
 * the person who acted. A kind this screen does not know answers null.
 */
export function registerWords(line: HistoryLine & { userId?: string }, names: Names): Worded | null {
  const transport = transportWords(line)
  if (transport) return transport

  const p = line.payload ?? {}
  const member = asText(line.userId)
  const person = member ? names.member(member) : ''
  const by = (key: string, values: Record<string, string> = {}): Worded => ({ who: { actor: line.actor }, words: { key: `${W}.${key}`, values } })
  const about = (key: string, values: Record<string, string> = {}): Worded => ({ who: { member }, words: { key: `${W}.${key}`, values } })
  const role = asText(p.name) || names.role(asText(p.roleId))
  const type = names.type(asText(p.userTypeId)) || asText(p.name)
  const position = asText(p.name) || names.position(asText(p.positionId))

  switch (line.kind) {
    case 'tenantCreated':
      return by('tenantCreated', { name: asText(p.name) })
    case 'tenantRenamed':
      return by('tenantRenamed', { from: asText(p.from), to: asText(p.to) })
    case 'userInvited':
      return by('userInvited', { person: person || asText(p.displayName) })
    case 'claimAttached':
      return about('claimAttached')
    case 'directoryAdmitted':
      return about('directoryAdmitted')
    case 'userRevoked':
      return by('userRevoked', { person })
    case 'roleGranted':
      return isAdministrator(p)
        ? by('administratorOn', { person })
        : by('serviceRoleGranted', { person, role: `${asText(p.group)}:${asText(p.level)}`, service: asText(p.service) })
    case 'roleRevoked':
      return isAdministrator(p)
        ? by('administratorOff', { person })
        : by('serviceRoleRevoked', { person, role: `${asText(p.group)}:${asText(p.level)}`, service: asText(p.service) })
    case 'administratorSetByOperator':
      return about('administratorByOperator')
    case 'administratorUnsetByOperator':
      return about('administratorOffByOperator')
    case 'administratorSeeded':
      return about('administratorSeeded')
    case 'tenantRoleDefined':
      return by('roleDefined', { role })
    case 'tenantRoleSeeded':
      return by('roleSeeded', { role })
    case 'tenantRoleRenamed':
      return by('roleRenamed', { from: asText(p.from), to: asText(p.to) })
    case 'tenantRoleDescribed':
      return by('roleDescribed', { role })
    case 'tenantRoleDeleted':
      return by('roleDeleted', { role })
    case 'tenantRoleGranted':
      return by('roleGranted', { person, role })
    case 'tenantRoleRevoked':
      return by('roleRevoked', { person, role })
    case 'tenantRoleReconfigured': {
      const added = asList(p.added).map((b) => names.box(b))
      const removed = asList(p.removed).map((b) => names.box(b))
      const key = added.length && removed.length ? 'roleTicksBoth' : added.length ? 'roleTicksAdded' : 'roleTicksRemoved'

      return by(key, { role, added: added.join(', '), removed: removed.join(', ') })
    }
    case 'userTypeDefined':
      return by('typeDefined', { type: asText(p.name) || type })
    case 'userTypeChanged':
      return by('typeChanged', { type: asText(p.name) || type })
    case 'userTypeDeleted':
      return by(type ? 'typeDeleted' : 'typeDeletedUnnamed', { type })
    case 'userTypeAssigned':
      if (p.source === 'workspaceDefault') return about('typeByDefault', { type })
      if (p.source === 'corporateLoginDefault') return about('typeByCorporateLogin', { type })

      return by('typeAssigned', { person, type })
    case 'defaultUserTypeSet':
      return by('typeIsDefault', { type })
    case 'corporateLoginDefaultSet':
      return asText(p.userTypeId) ? by('corporateLoginSet', { type }) : by('corporateLoginCleared')
    case 'chartPositionAdded':
      return by('positionAdded', { position })
    case 'chartPositionRenamed':
      return by('positionRenamed', { from: asText(p.from), position })
    case 'chartPositionMoved':
      return by('positionMoved', { position })
    case 'chartPositionRemoved':
      return by(position ? 'positionRemoved' : 'positionRemovedUnnamed', { position })
    case 'chartPositionPermissionsSet':
      return by('positionSees', { position })
    case 'chartPositionUserTypeSet':
      return asText(p.userTypeId) ? by('positionGivesType', { position, type }) : by('positionGivesNoType', { position })
    case 'chartPersonPlaced':
      return by('personPlaced', { person, position: names.position(asText(p.positionId)) })
    case 'chartPersonRemoved':
      return by('personUnplaced', { person, position: names.position(asText(p.positionId)) })
    case 'directoryAttached':
      return by('directoryAttached', { issuer: asText(p.issuer) })
    case 'directoryDetached':
      return by('directoryDetached', { issuer: asText(p.issuer) })
    case 'tenantEntitled':
      return by('entitled', { what: asText(p.feature) || asText(p.service) })
    case 'tenantEntitlementRevoked':
      return by('entitlementRevoked', { what: asText(p.feature) || asText(p.service) })
    default:
      return null
  }
}

/**
 * Names the register's lines carry by id only, learnt from the lines themselves:
 * a user type or a position that was deleted is named only in the lines written
 * before it went.
 */
export function namesFromLines(lines: HistoryLine[]): { types: Map<string, string>; positions: Map<string, string> } {
  const types = new Map<string, string>()
  const positions = new Map<string, string>()
  for (const line of lines) {
    const p = line.payload ?? {}
    if ((line.kind === 'userTypeDefined' || line.kind === 'userTypeChanged') && p.userTypeId && p.name && !types.has(asText(p.userTypeId))) {
      types.set(asText(p.userTypeId), asText(p.name))
    }
    if ((line.kind === 'chartPositionAdded' || line.kind === 'chartPositionRenamed') && p.positionId && p.name && !positions.has(asText(p.positionId))) {
      positions.set(asText(p.positionId), asText(p.name))
    }
  }

  return { types, positions }
}
