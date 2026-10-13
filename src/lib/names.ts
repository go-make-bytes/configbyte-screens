// A role's or a user type's name, and its names in other languages.
//
// The register keeps each list readable in every language it keeps names in: no
// two items of one list read alike there, ignoring case. An item reads as its
// name in that language, else as its name as entered. When a Save is refused as
// a clash, these work out from the list already read which item the name
// collides with, and how.

/** Names in other languages: a language's code, and the name in it. */
export type Labels = Record<string, string>

/** An item of a list the register keeps free of look-alikes: a role, or a user type. */
export interface Named {
  /** Empty for an item not made yet. */
  id: string
  name: string
  labels?: Labels
}

/** Another item a name reads like: which one, how that one reads, and in which language. */
export interface Alike {
  other: Named
  reads: string
  language: string
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** An item's own name in a language, if it has one. */
function nameIn(item: Named, language: string): string | undefined {
  const name = item.labels?.[language]

  return typeof name === 'string' && name !== '' ? name : undefined
}

/** Another item of the list already called the item's name as entered, ignoring case. */
export function calledAlike(list: Named[], item: Named): Named | undefined {
  return list.find((other) => other.id !== item.id && same(other.name, item.name))
}

/**
 * Another item of the list that the item would read like in one of the
 * languages. Only a language where one of the two has a name of its own counts:
 * anywhere else both read as their names as entered, which is a plain clash.
 */
export function readsAlike(list: Named[], item: Named, languages: readonly string[]): Alike | null {
  for (const other of list) {
    if (other.id === item.id) continue
    for (const language of languages) {
      const mine = nameIn(item, language)
      const theirs = nameIn(other, language)
      if (mine === undefined && theirs === undefined) continue
      const reads = theirs ?? other.name
      if (same(mine ?? item.name, reads)) return { other, reads, language }
    }
  }

  return null
}
