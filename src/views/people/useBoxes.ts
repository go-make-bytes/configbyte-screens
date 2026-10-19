// The boxes a role or a user type can be given, in the groups and words these
// screens show them in. The Roles list, a role's page and a user type's page all
// draw from this, so a count on a list is the count the page then shows.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { groupBoxes, type Box, type ShownGroup } from '../../lib/boxes'
import { useAdminOptions } from '../../options'
import { usePeople, type Role } from '../../stores/people'
import { useAdminSession } from '../../stores/session'

export function useBoxes() {
  const { t, locale } = useI18n()
  const options = useAdminOptions()
  const session = useAdminSession()
  const people = usePeople()

  /** Every permission this workspace has: an administrator holds all of them. */
  const has = computed(() => new Set(Object.values(session.me?.sections ?? {}).flat()))

  /** The boxes a role can be given, in their groups; `holds` keeps a retired box the role still has in sight. */
  function roleGroups(holds: Iterable<string>): ShownGroup[] {
    return groupBoxes({
      services: people.services,
      use: 'role',
      lang: locale.value,
      has: has.value,
      holds: new Set(holds),
      groups: (options.roles?.groups ?? []).map((g) => ({ title: t(g.word), prefixes: g.prefixes })),
      fields: (people.fields ?? []).map((f) => ({ ...f, title: t(f.group) })),
    })
  }

  /** How many of the boxes a role can be given it holds, and how many there are. */
  function roleCounts(role: Pick<Role, 'permissions'>): { n: number; of: number } {
    const shown = new Set(roleGroups(role.permissions).flatMap((g) => g.boxes.map((b) => b.name)))

    return { n: role.permissions.filter((p) => shown.has(p)).length, of: shown.size }
  }

  /** Every box a user type can hold, with its words; `holds` keeps a box it still has in sight. */
  function typeBoxes(holds: string[]): Box[] {
    return groupBoxes({
      services: people.services,
      use: 'userType',
      lang: locale.value,
      has: has.value,
      holds: new Set(holds),
      groups: [],
      fields: [],
    }).flatMap((g) => g.boxes)
  }

  /** The words of the boxes a user type holds. A box nothing declares is said so, never by its name as it travels. */
  function typeWords(permissions: string[]): string[] {
    const words = new Map(typeBoxes(permissions).map((b) => [b.name, b.label]))

    return permissions.map((p) => words.get(p) ?? t('configbyte.people.boxUndeclared'))
  }

  return { has, roleGroups, roleCounts, typeBoxes, typeWords }
}
