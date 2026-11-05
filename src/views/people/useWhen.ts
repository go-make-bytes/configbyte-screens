// When something happened, in the words the assistants' list and page share: the
// day alone, or the day and the time, with today and yesterday said as words.
import { useI18n } from 'vue-i18n'

import { daysAgo, localDay } from '../../lib/format'

/** English is written the British way, day before month, as every other date these screens write. */
const writtenAs = (locale: string) => (locale === 'en' ? 'en-GB' : locale)

export function useWhen() {
  const { t, locale: chosen } = useI18n()
  const locale = { get value() { return writtenAs(chosen.value) } }
  const w = (key: string) => `configbyte.people.assistants.when.${key}`

  /** The day as the reader's language writes it, the year only when it is not this one. */
  function dayWords(at: Date): string {
    const sameYear = at.getFullYear() === new Date().getFullYear()

    return new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }).format(at)
  }

  /** *today*, *yesterday*, or the day; a value that is not an instant is said as it came. */
  function day(at: string): string {
    const when = new Date(at)
    if (Number.isNaN(when.getTime())) return at
    const n = daysAgo(localDay(at))
    if (n === 0) return t(w('today'))
    if (n === 1) return t(w('yesterday'))

    return dayWords(when)
  }

  /** The day and the time on the reader's own clock: *today, 09:30*, *30 Oct, 09:20*. */
  function moment(at: string): string {
    const when = new Date(at)
    if (Number.isNaN(when.getTime())) return at
    const time = new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit', hour12: false }).format(when)

    return t(w('moment'), { day: day(at), time })
  }

  return { day, moment }
}
