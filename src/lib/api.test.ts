// Reading where a refusal points instead, from the Link header it carries; and a read
// answered "not signed in", the sign-in ending, which whoever listens is told of —
// not a refusal, not a failure, not a change.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { del, get, post, postText, put, read, relatedLink, whenSignInEnds } from './api'

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
