// When a person last signed in, in the words the lists and the person's own panel share.
import { useI18n } from 'vue-i18n'

import { daysAgo } from '../../lib/format'
import type { Member } from '../../stores/people'

export function useLast() {
  const { t } = useI18n()

  /** *today*, *yesterday*, *{n} days ago*; a dash when they never signed in. */
  return function lastSignedIn(m: Member): string {
    if (!m.lastSignedInOn) return '—'
    const n = daysAgo(m.lastSignedInOn)
    if (n === null) return '—'
    if (n <= 0) return t('configbyte.people.users.last.today')
    if (n === 1) return t('configbyte.people.users.last.yesterday')

    return t('configbyte.people.users.last.days', { n }, n)
  }
}
