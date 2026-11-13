// The deployment area's reading of what it was answered: the guard between the
// products' boxes, the narrowing of the companies, and the lines of a starting
// configuration's outcome.
import { foldForFind } from 'uibyte'
import { describe, expect, it } from 'vitest'

import {
  administratorOf,
  companyOf,
  configurationOf,
  hasUnknownProduct,
  namesOf,
  narrow,
  partLines,
  productOf,
  rowsOf,
  ticksOf,
  whyNot,
  type Product,
} from './deployment'
import type { Lexicon } from './transfer'

const product = (key: string, name: string, needs: string[] = [], offered = true): Product => ({ key, displayName: name, offered, needs })
const catalogue = [
  product('basic', 'Basic'),
  product('extras', 'Extras', ['basic']),
  product('both', 'Both', ['basic', 'extras']),
  product('idle', 'Idle', [], false),
]

describe('the boxes of the products', () => {
  it('lets a product with nothing in the way be ticked or unticked', () => {
    const ticks = ticksOf(catalogue, [])
    expect(ticks.find((t) => t.key === 'basic')).toMatchObject({ on: false, lock: '', names: [] })
  })

  it('stops a product being ticked before the one it needs, naming it', () => {
    expect(ticksOf(catalogue, []).find((t) => t.key === 'extras')).toMatchObject({ on: false, lock: 'needs', names: ['Basic'] })
    expect(ticksOf(catalogue, ['basic']).find((t) => t.key === 'extras')).toMatchObject({ lock: '' })
  })

  it('names both of two products still to be ticked, and only the one still missing', () => {
    expect(ticksOf(catalogue, []).find((t) => t.key === 'both')).toMatchObject({ lock: 'needs', names: ['Basic', 'Extras'] })
    expect(ticksOf(catalogue, ['basic']).find((t) => t.key === 'both')).toMatchObject({ lock: 'needs', names: ['Extras'] })
    expect(ticksOf(catalogue, ['basic', 'extras']).find((t) => t.key === 'both')).toMatchObject({ lock: '' })
  })

  it('stops a ticked product being unticked while another ticked one needs it, naming that one', () => {
    expect(ticksOf(catalogue, ['basic', 'extras']).find((t) => t.key === 'basic')).toMatchObject({ on: true, lock: 'neededBy', names: ['Extras'] })
    expect(ticksOf(catalogue, ['basic']).find((t) => t.key === 'basic')).toMatchObject({ on: true, lock: '' })
  })

  it('cannot tick a product whose services have not started, and says that is why', () => {
    expect(ticksOf(catalogue, []).find((t) => t.key === 'idle')).toMatchObject({ on: false, lock: 'unoffered' })
  })

  it('works out what stops a change from the products as they are now, and nothing when nothing does', () => {
    expect(whyNot(catalogue, [], 'extras')).toMatchObject({ lock: 'needs' })
    expect(whyNot(catalogue, ['basic', 'extras'], 'basic')).toMatchObject({ lock: 'neededBy' })
    expect(whyNot(catalogue, ['basic'], 'extras')).toBeNull()
    expect(whyNot(catalogue, [], 'missing')).toBeNull()
  })
})

describe('what an answer is read as', () => {
  it('reads a company, and leaves out a row that is not one', () => {
    const rows = rowsOf(
      {
        companies: [
          { id: 'c1', name: 'Kalve', status: 'active', createdAt: '2026-11-01T10:00:00Z', own: true, products: ['basic'], administrators: 2, entered: true },
          { name: 'no id' },
          'nonsense',
        ],
      },
      'companies',
      companyOf,
    )
    expect(rows).toEqual([{ id: 'c1', name: 'Kalve', status: 'active', createdAt: '2026-11-01T10:00:00Z', own: true, products: ['basic'], administrators: 2, entered: true }])
  })

  it.each([
    ['says somebody has signed in', { entered: true }, true],
    ['says nobody has', { entered: false }, false],
    ['says nothing of it, as an older register does', {}, true],
  ])('reads a company that %s', (_case, member, entered) => {
    expect(companyOf({ id: 'c1', name: 'Kalve', ...member })?.entered).toBe(entered)
  })

  it('reads an answer that is not a list as an empty one', () => {
    expect(rowsOf(null, 'companies', companyOf)).toEqual([])
    expect(rowsOf({ companies: 'x' }, 'companies', companyOf)).toEqual([])
  })

  it('reads a product and an administrator', () => {
    expect(productOf({ key: 'basic', displayName: 'Basic', offered: false, needs: ['x'] })).toEqual({ key: 'basic', displayName: 'Basic', offered: false, needs: ['x'] })
    expect(productOf({ displayName: 'no key' })).toBeNull()
    expect(administratorOf({ userId: 'u1', displayName: 'Ilze', status: 'invited', lastSignedInOn: null })).toEqual({
      userId: 'u1',
      displayName: 'Ilze',
      status: 'invited',
      lastSignedInOn: null,
    })
  })

  it('names only the products the products’ read holds, and knows when one is missing', () => {
    const company = companyOf({ id: 'c1', name: 'K', products: ['basic', 'unheard'] })!
    expect(namesOf(company.products, catalogue)).toEqual(['Basic'])
    expect(hasUnknownProduct(company, catalogue)).toBe(true)
    expect(hasUnknownProduct({ ...company, products: ['basic'] }, catalogue)).toBe(false)
  })
})

describe('finding a company', () => {
  const companies = ['Metāla Darbi', 'Kalve', 'Būvnieks'].map((name, i) => companyOf({ id: `c${i}`, name })!)

  it.each(['metāla', 'METĀLA', 'darbi'])('narrows by the name whatever the letters’ case: %s', (needle) => {
    expect(narrow(companies, needle, foldForFind).map((c) => c.name)).toEqual(['Metāla Darbi'])
  })

  it('shows none for a text that matches none, and every company for no text', () => {
    expect(narrow(companies, 'zzz', foldForFind)).toEqual([])
    expect(narrow(companies, '  ', foldForFind)).toHaveLength(3)
  })
})

describe('what became of a starting configuration', () => {
  const lexicon: Lexicon = { order: ['kinds', 'stages'], titles: { kinds: 'Kinds', stages: 'Stages' }, parts: {} }
  const say = (key: string, named?: Record<string, unknown>) => `${key}${named ? JSON.stringify(named) : ''}`

  it('reads the outcome from the answer’s own word, and drops one it does not know', () => {
    expect(configurationOf({ name: 'f', outcome: 'refused', sections: {} })).toEqual({ name: 'f', outcome: 'refused', sections: {} })
    expect(configurationOf({ name: 'f', outcome: 'previewed' })).toBeNull()
    expect(configurationOf(null)).toBeNull()
  })

  it('says one line for each part, and counts the changes of a part that landed', () => {
    const configuration = configurationOf({
      name: 'f',
      outcome: 'applied',
      sections: { kinds: { status: 'applied', report: { items: [{ key: 'a', status: 'added' }, { key: 'b', status: 'unchanged' }] } }, stages: { status: 'applied' } },
    })!
    const lines = partLines(configuration, lexicon, (key, named, plural) => say(key, { ...named, plural }))
    expect(lines.map((l) => l.key)).toEqual(['kinds', 'stages'])
    expect(lines[0]!.sentence).toContain('configbyte.deployment.configuration.changes')
    expect(lines[0]!.sentence).toContain('"n":1')
  })

  it('says a refused part and the parts held back for it, never a service’s own sentence', () => {
    const configuration = configurationOf({
      name: 'f',
      outcome: 'refused',
      sections: { kinds: { status: 'refused', detail: 'raw service sentence' }, stages: { status: 'withheld' } },
    })!
    const lines = partLines(configuration, lexicon, say)
    expect(lines.map((l) => [l.key, l.role])).toEqual([
      ['kinds', 'late'],
      ['stages', 'idle'],
    ])
    expect(JSON.stringify(lines)).not.toContain('raw service sentence')
  })
})
