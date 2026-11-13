// Signing in again: how recent a sign-in must be, which kept address is the app's own,
// and what a tab's session storage is allowed to hold.
import { afterEach, describe, expect, it } from 'vitest'

import { isRecent, isSignInTab, keepReturn, markSignInTab, ownAddress, takeReturn } from './again'

const NOW = Date.parse('2026-11-12T10:00:00Z')
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString()

afterEach(() => window.sessionStorage.clear())

describe('how recent a sign-in must be', () => {
  it.each([
    [899, true],
    [900, true],
    [901, false],
    [0, true],
  ])('a sign-in %s seconds old, against an age of 900: %s', (seconds, recent) => {
    expect(isRecent(ago(seconds), 900, NOW)).toBe(recent)
  })

  it('takes any sign-in when no age is asked for, whatever its time', () => {
    expect(isRecent(ago(99999), null, NOW)).toBe(true)
    expect(isRecent(null, null, NOW)).toBe(true)
    expect(isRecent(undefined, undefined, NOW)).toBe(true)
  })

  it.each([[null], [undefined], [''], ['not a time']])('takes a sign-in whose time is %j as too old when an age is asked for', (time) => {
    expect(isRecent(time, 900, NOW)).toBe(false)
  })
})

describe('the kept address', () => {
  const router = { resolve: (a: string) => ({ matched: a.startsWith('/deployment/') ? [{}] : [] }) }

  it.each([
    ['one of the app’s own', '/deployment/companies/c1', '/deployment/companies/c1'],
    ['null', null, null],
    ['empty', '', null],
    ['without a route', '/nowhere', null],
    ['another site’s', 'https://evil.example.test/deployment/x', null],
    ['protocol-relative', '//evil.example.test/deployment/x', null],
    ['with a backslash', '/\\evil.example.test/deployment/x', null],
    ['a script', 'javascript:alert(1)', null],
  ])('%s', (_case, kept, want) => {
    expect(ownAddress(router, kept)).toBe(want)
  })

  it('is null when resolving it throws', () => {
    expect(
      ownAddress(
        {
          resolve: () => {
            throw new Error('no')
          },
        },
        '/deployment/x',
      ),
    ).toBeNull()
  })
})

describe('what a tab keeps', () => {
  it('keeps an address until it is read, and removes it as it is read', () => {
    keepReturn('/deployment/companies')
    expect(takeReturn()).toBe('/deployment/companies')
    expect(takeReturn()).toBeNull()
  })

  it('marks a sign-in tab with one value, and holds nothing else', () => {
    expect(isSignInTab()).toBe(false)
    markSignInTab()
    expect(isSignInTab()).toBe(true)
    expect(Object.keys(window.sessionStorage)).toEqual(['configbyte.sign-in-tab'])
  })
})
