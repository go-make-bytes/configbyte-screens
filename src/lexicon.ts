// The host's words for its sections, translated in the person's language, with
// the coordinator's order beside them.
import { computed, type ComputedRef } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Lexicon } from './lib/transfer'
import { useAdminOptions } from './options'
import { useAdminSession } from './stores/session'

/** The parts of the membership register's section, which these screens word themselves. */
const REGISTER_PARTS = ['services', 'roles', 'permissions']

export function useLexicon(): ComputedRef<Lexicon> {
  const { t } = useI18n()
  const options = useAdminOptions()
  const session = useAdminSession()

  return computed(() => {
    const titles: Lexicon['titles'] = {}
    const parts: Lexicon['parts'] = {}
    for (const [name, words] of Object.entries(options.sections)) {
      if (words.title) titles[name] = t(words.title)
      parts[name] = (words.parts ?? []).map((p) => ({
        key: p.key,
        word: t(p.word),
        // A count needs its number, so it is said when the number is known.
        count: p.count ? (n: number) => t(p.count as string, { n }, n) : undefined,
        area: p.area,
      }))
    }
    if (options.register) {
      // The register is these screens' own section: it is called what they call it
      // unless the host chose another name, and its parts are worded the same way.
      if (!titles[options.register]) titles[options.register] = t('configbyte.people.title')
      const given = parts[options.register] ?? []
      const own = REGISTER_PARTS.filter((key) => !given.some((p) => p.key === key)).map((key) => ({
        key,
        word: t(`configbyte.transfer.part.${key}`),
        count: (n: number) => t(`configbyte.transfer.count.${key}`, { n }, n),
        area: undefined,
      }))
      parts[options.register] = [...given, ...own]
    }

    return { order: session.order, titles, parts }
  })
}
