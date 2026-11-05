// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { nameProblem } from './assistantName'

describe('an assistant’s name, as the register takes it', () => {
  it('is 1 to 100 characters, counted as characters, not code units', () => {
    expect(nameProblem('')).toBe('assistantNoName')
    expect(nameProblem('a')).toBe('')
    expect(nameProblem('x'.repeat(100))).toBe('')
    expect(nameProblem('x'.repeat(101))).toBe('assistantInvalid')
    // Fifty emoji are fifty characters, a hundred code units.
    expect(nameProblem('😀'.repeat(50))).toBe('')
    expect(nameProblem('ā'.repeat(100))).toBe('')
  })

  it('is on one line: no line feed, carriage return, or line or paragraph separator', () => {
    for (const end of [0x0a, 0x0d, 0x2028, 0x2029]) expect(nameProblem(`Site${String.fromCodePoint(end)}log`)).toBe('assistantInvalid')
    expect(nameProblem('Site log')).toBe('')
  })
})
