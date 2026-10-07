// Reading where a refusal points instead, from the Link header it carries.
import { describe, expect, it } from 'vitest'

import { relatedLink } from './api'

describe('the address a refusal names as related', () => {
  it.each([
    ['one related link', '<https://app.example.test/>; rel="related"', 'https://app.example.test/'],
    ['the relation unquoted', '<https://app.example.test/>; rel=related', 'https://app.example.test/'],
    ['among other links', '<https://docs.example.test/>; rel="help", <https://app.example.test/>; rel="related"', 'https://app.example.test/'],
    ['with more parameters after it', '<https://app.example.test/>; rel="related"; title="app"', 'https://app.example.test/'],
    ['only other relations', '<https://docs.example.test/>; rel="help"', ''],
    ['a relation that only starts the same', '<https://app.example.test/>; rel="relatedness"', ''],
    ['no header', null, ''],
  ])('%s', (_case, header, want) => {
    expect(relatedLink(header)).toBe(want)
  })
})
