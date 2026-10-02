// What the host application tells these screens about itself.
//
// The screens are shared by every product's admin app, so they name no product:
// its name, what each of its sections is called, which lines its Export card
// lists and who it treats as able to configure a section all arrive from the host.
// Every text here is a message key in the host's own translator, so the screens
// read it in whichever language the person has chosen.
import { inject, type InjectionKey } from 'vue'

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
   * The scopes that mark a person who may configure this section. Display only:
   * they decide what the frame offers, never what the section's owner allows.
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
}

export const ADMIN_OPTIONS: InjectionKey<AdminOptions> = Symbol('configbyte-screens options')

/** The host's options. A screen mounted without the plugin is a wiring mistake, said loudly. */
export function useAdminOptions(): AdminOptions {
  const options = inject(ADMIN_OPTIONS, null)
  if (!options) throw new Error('configbyte-screens: install the plugin before mounting its screens')

  return options
}
