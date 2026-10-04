// The boxes a role or a user type can be given, as the services declare them.
//
// Every service tells the membership register which acts it enforces, each with
// its words in English and any other language. A role is offered the ordinary
// acts this workspace has; a user type only those granted across the whole
// workspace. Setting the workspace up is never offered: it comes only with the
// Administrator checkbox, and the register refuses it on a role.
import type { FieldBox } from '../options'

/** One act a service declares, as the register's vocabulary lists it. */
export interface Declared {
  feature: string
  act: string
  description: string
  class: string
  plane: string
  labels?: Record<string, string> | null
  retired?: boolean
}

/** One service in the register's vocabulary. */
export interface DeclaringService {
  key: string
  displayName: string
  permissions: Declared[]
}

/** A box as a screen draws it. */
export interface Box {
  /** The permission as a role holds it. */
  name: string
  label: string
  /** A restricted field's box, which carries the field. */
  field?: FieldBox
  /** A box no role can be given again; shown only on a role that still holds it. */
  retired?: boolean
}

/** A titled run of boxes. */
export interface ShownGroup {
  key: string
  title: string
  boxes: Box[]
}

/** The permission as it travels: `<service>/<feature>:<act>`. */
export function permissionName(service: string, p: Declared): string {
  return `${service}/${p.feature}:${p.act}`
}

/** A declared label in the person's language, then its primary language's, then the description. */
export function labelOf(p: Declared, lang: string): string {
  const labels = p.labels ?? {}
  const primary = lang.toLowerCase().split('-')[0] ?? ''

  return labels[lang] ?? labels[primary] ?? p.description
}

/** The family a field's box belongs to: everything before its `@`. */
export function familyOf(permission: string): string {
  const at = permission.indexOf('@')

  return at < 0 ? permission : permission.slice(0, at)
}

export type BoxUse = 'role' | 'userType'

/**
 * Whether a declared act can be offered for this use at all. A setup act, a
 * family of field boxes as a whole, and an act on the chart's own plane never
 * are; a user type holds only acts granted across the whole workspace.
 */
export function offerable(p: Declared, use: BoxUse): boolean {
  if (p.class !== 'ordinary') return false
  if (use === 'userType') return p.plane === 'tenant'

  return p.plane === 'tenant' || p.plane === 'object'
}

/**
 * The boxes to show, in their groups. `has` is every permission this workspace
 * has (an administrator holds all of them); `holds` what the role or user type
 * holds now, so a retired box it still holds stays in sight.
 */
export function groupBoxes(input: {
  services: DeclaringService[]
  use: BoxUse
  lang: string
  has: Set<string>
  holds: Set<string>
  groups: { title: string; prefixes: string[] }[]
  fields: (FieldBox & { title: string })[]
}): ShownGroup[] {
  const hostGroups: ShownGroup[] = input.groups.map((g, i) => ({ key: `group-${i}`, title: g.title, boxes: [] }))
  const serviceGroups = new Map<string, ShownGroup>()

  for (const service of input.services) {
    for (const p of service.permissions) {
      if (!offerable(p, input.use)) continue
      const name = permissionName(service.key, p)
      if (!input.has.has(name) && !input.holds.has(name)) continue
      if (p.retired && !input.holds.has(name)) continue
      const box: Box = { name, label: labelOf(p, input.lang), ...(p.retired ? { retired: true } : {}) }

      let best = -1
      let bestLength = -1
      input.groups.forEach((g, i) => {
        for (const prefix of g.prefixes) {
          if (name.startsWith(prefix) && prefix.length > bestLength) {
            best = i
            bestLength = prefix.length
          }
        }
      })
      if (best >= 0) {
        hostGroups[best]!.boxes.push(box)
        continue
      }
      let own = serviceGroups.get(service.key)
      if (!own) {
        own = { key: `service-${service.key}`, title: service.displayName || service.key, boxes: [] }
        serviceGroups.set(service.key, own)
      }
      own.boxes.push(box)
    }
  }

  const fieldGroups = new Map<string, ShownGroup>()
  if (input.use === 'role') {
    for (const field of input.fields) {
      let g = fieldGroups.get(field.group)
      if (!g) {
        g = { key: `fields-${field.group}`, title: field.title, boxes: [] }
        fieldGroups.set(field.group, g)
      }
      g.boxes.push({ name: field.permission, label: '', field })
    }
  }

  return [...hostGroups, ...serviceGroups.values(), ...fieldGroups.values()].filter((g) => g.boxes.length > 0)
}

/** The families of field boxes the services declare: a role holds them one field at a time. */
export function fieldFamilies(services: DeclaringService[]): Set<string> {
  return new Set(services.flatMap((s) => s.permissions.filter((p) => p.class === 'perField').map((p) => permissionName(s.key, p))))
}

/**
 * The whole set a role or user type is saved with: the boxes ticked among those
 * shown, and every box it held that the screen did not show — a service's act
 * this screen cannot see must not be taken away by saving. The one exception is a
 * field's box that is not the box of a field restricted now: the field went back
 * to everyone, or was restricted again since, and that box grants nothing any
 * more. It is dropped only when the restricted fields could be read
 * (`fieldBoxes` is not null), so a failed read never takes a live box away.
 */
export function wholeSet(input: {
  shown: Set<string>
  ticked: Set<string>
  held: string[]
  fieldBoxes: string[] | null
  families: Set<string>
}): string[] {
  const kept = input.held.filter((name) => {
    if (input.shown.has(name)) return false
    const dormant =
      input.fieldBoxes !== null && name.includes('@') && input.families.has(familyOf(name)) && !input.fieldBoxes.includes(name)

    return !dormant
  })

  return [...new Set([...[...input.ticked].filter((n) => input.shown.has(n)), ...kept])].sort()
}

/** Whether two sets of boxes hold the same names. */
export function sameSet(a: Iterable<string>, b: Iterable<string>): boolean {
  const x = new Set(a)
  const y = new Set(b)

  return x.size === y.size && [...x].every((n) => y.has(n))
}
