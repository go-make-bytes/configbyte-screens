// A field's box is named by whatever the host calls the field — a word or a
// number — and the generation after it. The screen never reads past the `@`: it
// matches a field's box whole, so a field restricted again (a new generation)
// takes the old box out of use whatever the field is called, and two fields whose
// names share a beginning are never taken for one another.
import { describe, expect, it } from 'vitest'

import { familyOf, wholeSet } from './boxes'

const FAMILY = 'orders/order:viewField'
const families = new Set([FAMILY])

describe('a field box named by a number', () => {
  it('belongs to its family, as one named by a word does', () => {
    expect(familyOf(`${FAMILY}@12.2`)).toBe(FAMILY)
    expect(familyOf(`${FAMILY}@price.2`)).toBe(FAMILY)
  })

  it('is dropped on save once the field is restricted again, and only that one', () => {
    const live = [`${FAMILY}@12.2`, `${FAMILY}@3.1`]
    const shown = new Set(['orders/order:view', ...live])
    const saved = wholeSet({
      shown,
      ticked: new Set(['orders/order:view', `${FAMILY}@3.1`]),
      held: ['orders/order:view', `${FAMILY}@12.1`, `${FAMILY}@3.1`],
      fieldBoxes: live,
      families,
    })
    expect(saved).toEqual(['orders/order:view', `${FAMILY}@3.1`])
  })

  it('is matched whole: field 1 is not field 12, nor field 12 field 1', () => {
    // Field 1 went back to everyone while field 12 is restricted: field 1's old
    // box grants nothing and goes; field 12's stays ticked.
    expect(
      wholeSet({
        shown: new Set([`${FAMILY}@12.1`]),
        ticked: new Set([`${FAMILY}@12.1`]),
        held: [`${FAMILY}@1.1`, `${FAMILY}@12.1`],
        fieldBoxes: [`${FAMILY}@12.1`],
        families,
      }),
    ).toEqual([`${FAMILY}@12.1`])
    // And the other way round.
    expect(
      wholeSet({
        shown: new Set([`${FAMILY}@1.1`]),
        ticked: new Set([`${FAMILY}@1.1`]),
        held: [`${FAMILY}@1.1`, `${FAMILY}@12.1`],
        fieldBoxes: [`${FAMILY}@1.1`],
        families,
      }),
    ).toEqual([`${FAMILY}@1.1`])
  })

  it('keeps every field box when the restricted fields could not be read', () => {
    const saved = wholeSet({
      shown: new Set(['orders/order:view']),
      ticked: new Set(['orders/order:view']),
      held: ['orders/order:view', `${FAMILY}@12.1`],
      fieldBoxes: null,
      families,
    })
    expect(saved).toEqual(['orders/order:view', `${FAMILY}@12.1`])
  })
})
