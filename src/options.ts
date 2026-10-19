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
  /** The message key of the part's count, with `{n}` and plural forms: "{n} priority | {n} priorities". */
  count?: string
  /** The key of the host's entry (one of `entries`) where this part's items are taken out of use. */
  area?: string
}

/** One row of an import's preview or answer, as a host may word it. */
export interface TransferRow {
  section: string
  part: string
  key: string
  status: string
  reason?: string
  /** The service's words: the members a change touches, or a refusal's sentence. */
  detail?: string
  /** The file's item the row is about, when one was found. */
  item?: Record<string, unknown>
  /** The file's whole section, `{}` when the file has none. */
  file: Record<string, unknown>
  /** The language the screen speaks. */
  lang: string
}

/** A host's words for one row; a member left out keeps the screens' own. */
export interface TransferWords {
  /** The row's name exactly as drawn (the host adds any quotes). */
  name?: string
  /** What happens to it, in words. */
  change?: string
  /** The part's word for this row, when the part's own word is wider than the row. */
  part?: string
  /** The key of the host's entry where this row's item is taken out of use. */
  area?: string
}

/** How an import's rows are named and worded. */
export interface TransferOptions {
  /** Finds a part's item in the file by the report's key, when it is not the item's `key` or `number`. */
  find?: (section: string, part: string, key: string, list: unknown[]) => Record<string, unknown> | undefined
  /** The words for one changed member, by its name: a message key, said as "its … changes". */
  members?: Record<string, string>
  /** A row in the host's own words; `null` keeps the screens' own. */
  describe?: (row: TransferRow) => TransferWords | null
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
  /**
   * The permission as a role holds it: `<family>@<field>.<generation>`, the field
   * as its service names it (`orders/order:viewField@12.2`). Matched whole, never
   * read past the `@`.
   */
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

/**
 * A setting of the host's that names one of the workspace's roles, such as the
 * role someone receives when they make something. The Roles screen lists it
 * under the roles, as a choice among them.
 */
export interface RoleSetting {
  /** Tells it apart from the host's other settings. */
  key: string
  /** The key of its name, drawn before the choice. */
  word: string
  /** The key of a quiet line under it. */
  note?: string
  /** The id of the role chosen now; empty for none. */
  read(): Promise<string>
  /** Choose a role. Throws the screens' `ApiError` when it is refused, so the refusal is said in words. */
  write(roleId: string): Promise<void>
  /** The key of the sentence said once a choice was saved, given `{role}`: the role's name. */
  saved: string
  /**
   * The key of the sentence said when the setting's owner refuses the role chosen
   * (a 400), given `{role}`: the role's name. Absent: the refusal is said in the
   * screens' own words.
   */
  refused?: string
  /**
   * The key of the sentence said when deleting a role is refused because this
   * setting holds it, given `{role}`: the role's name.
   */
  holds: string
}

/** How the Roles screen shows the boxes the services declare. */
export interface RoleBoxOptions {
  /** The settings listed under the roles, each a choice of one of the workspace's roles. */
  settings?: RoleSetting[]
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
  /**
   * Whether this workspace lacks what the source reads. A locked source is never
   * read, and a filter whose sources are all locked is not offered.
   */
  locked?: () => boolean
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
  /** The member the line is about, by the register's id; only the register's lines carry it. */
  userId?: string
}

/** What the History screen already knows, handed to the host's sentences so it reads nothing twice. */
export interface HistoryNames {
  /** A member's name by the key the services attribute work to; empty when the workspace's list does not hold them. */
  member(subjectKey: string): string
}

/** How the History screen reads the host's own services. */
export interface HistoryOptions {
  /**
   * The filters beside the shared one, in order: each a key and the key of its word.
   * A filter is an area of the list: its word names the area on each line, in the
   * ticks, and in the sentence that says the area could not be read. The register's
   * own area has the key `people`.
   */
  filters: { key: string; word: string }[]
  /** The streams it reads. The membership register's is the shared screens' own and is not listed. */
  sources: HistorySource[]
  /**
   * The sentence for a line of the host's own services, given the names the screen
   * already holds. `null` leaves the line to the screen's own words for a change it
   * cannot describe; the lines every owner writes for an export and an import are
   * worded by the screen itself.
   */
  describe?: (line: HistoryLine, names: HistoryNames) => LineWords | null
  /**
   * The host's word for what a workspace was given or lost, by the service
   * (`orders`) or by the service and its feature (`orders/export`): the key of the
   * word, said as the object of the sentence (*gave the workspace {word}*). What it
   * does not name is said by the service's own name in the register, else not named.
   */
  entitlements?: Record<string, string>
  /**
   * The host's word for a box in a line about what a position sees, by the
   * permission as it travels. A box it does not name is said in the register's own label for it.
   */
  boxes?: Record<string, string>
  /**
   * Called with the keys of the areas the list reads, when it opens and again when a
   * tick turns on, before their lines are drawn, so the host can read what its own
   * sentences name. A host that already holds it reads nothing.
   */
  prepare?: (areas: string[]) => void | Promise<void>
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
  /** How an import's rows are named and worded. Absent: the screens' own words. */
  transfer?: TransferOptions
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
