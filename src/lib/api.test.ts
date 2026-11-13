// Reading where a refusal points instead, from the Link header it carries; and a read
// answered "not signed in", the sign-in ending, which whoever listens is told of —
// not a refusal, not a failure, not a change. And the anti-forgery token a change
// echoes: the coordinator's own __Host- cookie, never a copy another host planted.
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ApiError,
  ASSURANCE_TOO_LOW,
  csrfFrom,
  del,
  get,
  isAssuranceTooLow,
  isSignInTooOld,
  post,
  postText,
  put,
  read,
  relatedLink,
  SIGN_IN_TOO_OLD,
  whenSignInEnds,
} from './api'

function answer(status: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => ({ code: 'err:x' }) }) as unknown as Response),
  )
}

function listen() {
  const ended = vi.fn()
  whenSignInEnds(ended)

  return ended
}

afterEach(() => {
  vi.unstubAllGlobals()
  whenSignInEnds(() => {})
})

describe('a read', () => {
  it('answered "not signed in" tells whoever listens, and still fails as it did', async () => {
    const ended = listen()
    answer(401)

    await expect(get('/x')).rejects.toMatchObject({ status: 401, code: 'err:x' })
    expect(ended).toHaveBeenCalledTimes(1)
  })

  it('of a file answered "not signed in" tells whoever listens, and hands the answer back', async () => {
    const ended = listen()
    answer(401)

    expect((await read('/x')).status).toBe(401)
    expect(ended).toHaveBeenCalledTimes(1)
  })

  it.each([200, 403, 404, 500, 502])('answered %i tells nobody', async (status) => {
    const ended = listen()
    answer(status)

    await get('/x').catch(() => undefined)
    expect(ended).not.toHaveBeenCalled()
  })

  it('that never arrives tells nobody', async () => {
    const ended = listen()
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))

    await expect(get('/x')).rejects.toBeInstanceOf(TypeError)
    expect(ended).not.toHaveBeenCalled()
  })
})

// A change refused that way is said in the form that made it, where what was typed still is.
describe('a change answered "not signed in"', () => {
  it.each([
    ['a new thing', () => post('/x', {})],
    ['a replacement', () => put('/x', {})],
    ['a removal', () => del('/x')],
    ["a file's words", () => postText('/x', '{}')],
  ])('tells nobody when it is %s', async (_case, call) => {
    const ended = listen()
    answer(401)

    await expect(call()).rejects.toMatchObject({ status: 401 })
    expect(ended).not.toHaveBeenCalled()
  })
})

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

describe('the refusals of the deployment’s area', () => {
  it('knows a sign-in too old as a named refusal, keeping the shape of the error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 403, headers: new Headers(), json: async () => ({ code: SIGN_IN_TOO_OLD, title: 'sign in again' }) }) as unknown as Response),
    )
    const refused = await get('/x').catch((e: unknown) => e)
    expect(refused).toBeInstanceOf(ApiError)
    expect(refused).toMatchObject({ status: 403, code: 'err:session:signInTooOld', message: 'sign in again', related: '' })
    expect(isSignInTooOld(refused)).toBe(true)
    expect(isAssuranceTooLow(refused)).toBe(false)
  })

  it('knows a sign-in that is not the strongest as a named refusal of its own', () => {
    const refused = new ApiError(403, ASSURANCE_TOO_LOW, 'stronger')
    expect(isAssuranceTooLow(refused)).toBe(true)
    expect(isSignInTooOld(refused)).toBe(false)
  })

  it.each([
    ['the same code with another status', new ApiError(401, SIGN_IN_TOO_OLD, '')],
    ['another code', new ApiError(403, 'err:request:forbidden', '')],
    ['something that is not an error of the client', new Error(SIGN_IN_TOO_OLD)],
  ])('does not take %s for a sign-in too old', (_case, e) => {
    expect(isSignInTooOld(e)).toBe(false)
  })
})

describe('the anti-forgery token a change echoes', () => {
  it.each([
    ['over https, the __Host- cookie beside a planted plain one listed first', 'configbyte_csrf=planted; __Host-configbyte_csrf=own', true, 'own'],
    ['over https, only a planted plain one', 'configbyte_csrf=planted', true, ''],
    ['over https, only a planted __Secure- one', '__Secure-configbyte_csrf=planted', true, ''],
    ['over https, a miscapitalised __Host- one', '__host-configbyte_csrf=planted', true, ''],
    ['over plain http, the plain one a development edge sets', 'configbyte_csrf=tok', false, 'tok'],
    ['over plain http, the __Host- one before the plain', 'configbyte_csrf=planted; __Host-configbyte_csrf=own', false, 'own'],
    ['over https, a planted name led by a no-break space, listed first', '\u00a0__Host-configbyte_csrf=planted; __Host-configbyte_csrf=own', true, 'own'],
    ['over https, only a planted name led by a no-break space', '\u00a0__Host-configbyte_csrf=planted', true, ''],
    ['no cookie', '', true, ''],
  ])('%s', (_case, cookies, secure, want) => {
    expect(csrfFrom(cookies, secure)).toBe(want)
  })
})
