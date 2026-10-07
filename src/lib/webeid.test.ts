// Signing in with an ID card: what the page is told when the card software is not
// there to ask, and that its answer otherwise travels untouched.
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  delete (window as { webeid?: unknown }).webeid
  vi.resetModules()
})

// The card software is looked up once per page, so each case starts from a fresh copy.
const fresh = () => import('./webeid')

describe('the card software', () => {
  it('is missing when its library cannot be fetched — never a failure of the service', async () => {
    const { signChallenge, isCardSoftwareMissing } = await fresh()
    const failure = await signChallenge('n-1', 'en').then(
      () => null,
      (e: unknown) => e,
    )
    expect(failure).not.toBeInstanceOf(TypeError)
    expect(isCardSoftwareMissing(failure)).toBe(true)
  })

  it('hands the challenge to the card and its answer back exactly as given', async () => {
    const answer = { signature: 'sig', format: 'web-eid:1.0' }
    const authenticate = vi.fn(async () => answer)
    Object.assign(window, { webeid: { authenticate } })
    const { signChallenge } = await fresh()
    expect(await signChallenge('n-1', 'lv')).toBe(answer)
    expect(authenticate).toHaveBeenCalledWith('n-1', { lang: 'lv' })
  })

  it.each([
    ['the browser extension is not installed', 'ERR_WEBEID_EXTENSION_UNAVAILABLE', true],
    ['the application it drives is not installed', 'ERR_WEBEID_NATIVE_UNAVAILABLE', true],
    ['the person cancelled the PIN', 'ERR_WEBEID_USER_CANCELLED', false],
    ['a service said a dependency was unavailable', 'err:upstream:unavailable', false],
  ])('when %s (%s), reads it as missing software: %s', async (_case, code, missing) => {
    const { isCardSoftwareMissing } = await fresh()
    expect(isCardSoftwareMissing(Object.assign(new Error(code), { code }))).toBe(missing)
  })
})
