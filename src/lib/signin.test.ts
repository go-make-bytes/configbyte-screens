import { afterEach, describe, expect, it } from 'vitest'

import { keepLanguage, keptLanguage, languageBeforeSignIn, messageOfMarker, noteSignedOut, takeSignedOut, wayName } from './signin'

afterEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe('what a marker on the address means', () => {
  it.each([
    ['', ''],
    ['cancelled', 'cancelled'],
    ['not_member', 'notMember'],
    ['provider_error', 'providerError'],
    ['missing_code', 'incomplete'],
    ['expired', 'expired'],
    ['bad_state', 'unmatched'],
    ['login_failed', 'failed'],
    ['something new', 'unknown'],
    ['network', ''],
    ['assurance', ''],
  ])('%s reads as %s', (marker, message) => {
    expect(messageOfMarker(marker)).toBe(message)
  })
})

describe('the language before sign-in', () => {
  const carried = ['en', 'lv']

  it('is the one chosen in this browser, first', () => {
    expect(languageBeforeSignIn(carried, 'en', { kept: 'lv', browser: ['en-GB'] })).toBe('lv')
  })

  it('is the browser’s own next, the first the app carries', () => {
    expect(languageBeforeSignIn(carried, 'en', { kept: null, browser: ['de-DE', 'lv-LV', 'en'] })).toBe('lv')
  })

  it('is the deployment’s when neither is carried', () => {
    expect(languageBeforeSignIn(carried, 'lv', { kept: 'de', browser: ['de-DE'] })).toBe('lv')
  })

  it('never answers a language the app does not carry', () => {
    expect(languageBeforeSignIn(carried, 'de', { kept: null, browser: ['fr'] })).toBe('en')
  })

  it('reads the kept choice back from this browser', () => {
    keepLanguage('lv')
    expect(keptLanguage()).toBe('lv')
    expect(languageBeforeSignIn(carried, 'en', { browser: ['en'] })).toBe('lv')
  })
})

describe('the note a sign-out leaves', () => {
  it('is read once, then gone', () => {
    expect(takeSignedOut()).toBe(false)
    noteSignedOut()
    expect(takeSignedOut()).toBe(true)
    expect(takeSignedOut()).toBe(false)
  })
})

it('finds a way’s name by its key, and nothing for a key no longer offered', () => {
  const ways = [{ key: 'webEid', flow: 'card' as const, name: 'eID' }]
  expect(wayName(ways, 'webEid')).toBe('eID')
  expect(wayName(ways, 'upstream')).toBeUndefined()
})
