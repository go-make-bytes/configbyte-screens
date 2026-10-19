// The host's words for its sections, translated in the person's language, with
// the coordinator's order beside them.
import { computed, type ComputedRef } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Lexicon } from './lib/transfer'
import { useAdminOptions } from './options'
import { useAdminSession } from './stores/session'

export function useLexicon(): ComputedRef<Lexicon> {
  const { t } = useI18n()
  const options = useAdminOptions()
  const session = useAdminSession()

  return computed(() => {
    const titles: Lexicon['titles'] = {}
    const parts: Lexicon['parts'] = {}
    for (const [name, words] of Object.entries(options.sections)) {
      if (words.title) titles[name] = t(words.title)
      parts[name] = (words.parts ?? []).map((p) => ({ key: p.key, word: t(p.word) }))
    }
    // The register is these screens' own section: it is called what they call it
    // unless the host chose another name.
    if (options.register && !titles[options.register]) titles[options.register] = t('configbyte.people.title')

    return { order: session.order, titles, parts }
  })
}
