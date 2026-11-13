// A personal code that cannot be used, in words a person can act on: the one place
// every form that takes a code says why it was not taken.
import type { IdentityCodeError } from 'uibyte'

/** Latvia first, the choice a form starts on, then the other two Baltic states. */
export const COUNTRIES = ['LV', 'EE', 'LT']

type Translate = (key: string, named?: Record<string, unknown>) => string

/**
 * Why a code cannot be used. `issuer` is the country the code was read as issued by;
 * a country with no name of its own is said by its code.
 */
export function describeCode(t: Translate, te: (key: string) => boolean, error: IdentityCodeError, issuer: string): string {
  const w = (key: string) => `configbyte.people.users.invite.refused.${key}`
  const key = `configbyte.people.users.way.country.${issuer}`
  const named = te(key) ? t(key) : issuer

  switch (error.problem) {
    case 'length':
      return t(w('length'), { country: named, want: error.expected ?? 0, got: error.actual ?? 0 })
    case 'digits':
      return t(w('digits'), { country: named })
    case 'notAPerson':
      return t(w('notAPerson'), { type: error.type ?? '' })
    case 'unknownType':
      return t(w('unknownType'), { type: error.type ?? '' })
    case 'ambiguous':
      return t(w('ambiguous'))
    case 'malformed':
      return t(w('malformed'))
    case 'countryMissing':
      return t(w('countryMissing'))
  }

  return t(w('empty'))
}
