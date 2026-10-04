// What the host application tells these screens about itself.
//
// The screens are shared by every product's admin app, so they name no product:
// its name, what each of its sections is called, which lines its Export card
// lists and who it treats as able to configure a section all arrive from the host.
// Every text here is a message key in the host's own translator, so the screens
// read it in whichever language the person has chosen.
import { inject, type InjectionKey } from 'vue'
import type { NavIconName } from 'uibyte'

/** One part of a section, such as a list of kinds, and the key of its word. */
export interface PartWord {
  key: string
  word: string
}

/** How the host describes one section of its configuration. */
export interface SectionWords {
  /** The key of the section's name for a person. Absent: the section keeps its own name. */
  title?: string
  /** Its parts, in the order the host's own screens show them, each with the key of its word. */
  parts?: PartWord[]
  /**
   * The scopes that mark a person who may configure this section: its setup
   * boxes, and the administrator's. Display only: they decide what the frame
   * offers, never what the section's owner allows.
   */
  configures?: string[]
}

/** A screen the host built into its admin app, beside the shared ones. */
export interface AdminEntry {
  key: string
  /** The key of its label. */
  label: string
  /** The route it opens. */
  route: string
  /** The section whose owner serves it: shown only when the coordinator found that owner. */
  section: string
  /**
   * The key of the sidebar group it sits in; groups are listed in the order
   * their first entry arrives. Absent: the shared group, after the shared screens.
   */
  group?: string
  /** Its glyph in the sidebar. Absent: a gear. */
  icon?: NavIconName
  /**
   * Whether this workspace lacks what the screen edits. A locked entry is shown,
   * marked as not included, and does not open.
   */
  locked?: () => boolean
}

/** A group the Roles screen shows boxes in: its word, and the boxes it gathers. */
export interface BoxGroup {
  /** The key of the group's name. */
  word: string
  /**
   * The starts of the permission names it gathers, such as `orders/order:` or
   * `orders/order/`. A box goes to the group with the longest start it matches;
   * a box no group gathers is shown under its service's own name.
   */
  prefixes: string[]
}

/** One box a restricted field brings: held one field at a time, on a role. */
export interface FieldBox {
  /** The permission as a role holds it: `<family>@<field key>.<generation>`. */
  permission: string
  /** The field's name, as the person who restricted it wrote it. */
  name: string
  /** The key of the word of the group it is shown in. */
  group: string
}

/** What a newly ticked box hands out, said before the role is saved. */
export interface GuardWords {
  key: string
  values?: Record<string, string>
}

/** How the Roles screen shows the boxes the services declare. */
export interface RoleBoxOptions {
  /** The groups, in the order the screen lists them. */
  groups?: BoxGroup[]
  /**
   * The boxes of the fields this workspace restricted, read by the host from the
   * services that keep the fields. A field restricted a moment ago is on no role
   * yet, so the register alone cannot list it.
   */
  fields?: () => Promise<FieldBox[]>
  /**
   * What ticking one field's box on a role hands out, given every box the role
   * would then hold; nothing to say is `null`.
   */
  guard?: (box: FieldBox, ticks: string[]) => GuardWords | null
}

/** One stream of a section's history the History screen reads. */
export interface HistorySource {
  section: string
  /** The query that keeps the lines this source stands for, such as `family=setup`. */
  query?: string
  /** The key of the filter that shows or hides it. */
  filter: string
  /** The key of the short word that names its service on each line. */
  chip: string
}

/** The words of one history line, already chosen by the host. */
export interface LineWords {
  key: string
  values?: Record<string, string>
}

/** One line of an owner's history, as the History screen hands it to the host. */
export interface HistoryLine {
  section: string
  id: string
  at: string
  actor: string
  kind: string
  payload: Record<string, unknown>
}

/** How the History screen reads the host's own services. */
export interface HistoryOptions {
  /** The filters beside the shared one, in order: each a key and the key of its word. */
  filters: { key: string; word: string }[]
  /** The streams it reads. The membership register's is the shared screens' own and is not listed. */
  sources: HistorySource[]
  /**
   * The sentence for a line of the host's own services. `null` leaves the line
   * as its kind; the lines every owner writes for an export and an import are
   * worded by the screen itself.
   */
  describe?: (line: HistoryLine) => LineWords | null
}

export interface AdminOptions {
  /** The key of the product's name, as the sign-in page and an unreachable coordinator show it. */
  product: string
  /** The product's sections, by section name. */
  sections: Record<string, SectionWords>
  /**
   * The Export card's lines, in the order the card lists them, each naming the
   * section it describes: a line shows only when this deployment runs that section.
   */
  carries: { section: string; line: string }[]
  /** The key of the Export card's last line: what the file never carries. */
  never: string
  /** The screens the host built in, in the order the sidebar lists them. */
  entries?: AdminEntry[]
  /** Called after an import that may have changed something, so the host can re-read what it shows. */
  onApplied?: () => void
  /**
   * The section of the membership register, whose owner keeps the workspace's
   * people, roles and user types. People & access and the History filter of the
   * same name read it; absent, or not found by the coordinator, neither shows.
   */
  register?: string
  /** How the Roles screen shows boxes. */
  roles?: RoleBoxOptions
  /** How History reads the host's own services. Absent: History shows the register's lines alone. */
  history?: HistoryOptions
  /**
   * Replacements for the screens' own words, per language, in the shape of their
   * word files below `configbyte`: for the sentences that are better said in the
   * host's own terms.
   */
  words?: Record<string, Record<string, unknown>>
}

export const ADMIN_OPTIONS: InjectionKey<AdminOptions> = Symbol('configbyte-screens options')

/** The host's options. A screen mounted without the plugin is a wiring mistake, said loudly. */
export function useAdminOptions(): AdminOptions {
  const options = inject(ADMIN_OPTIONS, null)
  if (!options) throw new Error('configbyte-screens: install the plugin before mounting its screens')

  return options
}
