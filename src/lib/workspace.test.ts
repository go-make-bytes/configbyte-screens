// The workspace a page was opened for: named by every call but the ones that ask where the
// person is, never changed by a later answer, kept in memory only, and told to the page
// when the coordinator refuses a call for naming another workspace than the session's.
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_ROOT, ApiError, del, get, post, postText, put, read } from './api'
import { useAdminSession } from '../stores/session'
import { forgetOpenedWorkspace, isOtherWorkspace, OTHER_WORKSPACE, whenWorkspaceMoves, workspaceHeaders, workspaceMoved, workspaceOpenedFor } from './workspace'

interface Seen {
  method: string
  url: string
  headers: Record<string, string>
}

let seen: Seen[] = []

const meFor = (tenant: string, name = 'Kalve Ltd') => ({
  subject: 'sub:A',
  name: 'Anna Example',
  loginMethod: 'webEid',
  loa: 'high',
  tenant,
  workspace: { name, entitlements: [] },
  sections: {},
  presentation: { displayName: 'Kalns', locale: 'en', personLocale: null, deploymentLocale: 'en' },
})

/** A coordinator that answers each call with `reply` and remembers what it was sent. */
function stub(replies: Record<string, { status: number; body: unknown }[] | { status: number; body: unknown }> = {}) {
  seen = []
  const queues = Object.fromEntries(Object.entries(replies).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      seen.push({ method, url, headers: { ...((init?.headers ?? {}) as Record<string, string>) } })
      const queue = queues[`${method} ${url}`] ?? [{ status: 200, body: {} }]
      const reply = queue.length > 1 ? queue.shift()! : queue[0]!

      return { ok: reply.status < 400, status: reply.status, headers: new Headers(), json: async () => reply.body } as unknown as Response
    }),
  )
}

const named = (s: Seen) => s.headers['Workspace-Id']

beforeEach(() => {
  setActivePinia(createPinia())
  forgetOpenedWorkspace()
})
const stops: (() => void)[] = []
/** A listener that is taken off when the test is over. */
function listen(listener: () => void): () => void {
  const stop = whenWorkspaceMoves(listener)
  stops.push(stop)

  return stop
}
afterEach(() => {
  vi.unstubAllGlobals()
  for (const stop of stops.splice(0)) stop()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe('the workspace a page was opened for', () => {
  it('is named by a read and by a write after the sign-in answer named it, and a later answer naming another does not change it', async () => {
    stub({ [`GET ${API_ROOT}/me`]: [{ status: 200, body: meFor('X') }, { status: 200, body: meFor('Y') }], [`GET ${API_ROOT}/sections`]: { status: 200, body: { sections: [] } } })
    const session = useAdminSession()
    await session.resolve()
    await get('/api/read-something')
    await post('/api/write-something', {})
    expect(seen.filter((s) => s.url.endsWith('-something')).map(named)).toEqual(['X', 'X'])

    // The sign-in answer is read again and now names Y: the page was opened for X and goes on naming X.
    await session.resolve()
    expect(session.me?.tenant).toBe('Y')
    await put('/api/more', {})
    await del('/api/more')
    expect(seen.filter((s) => s.url === '/api/more').map(named)).toEqual(['X', 'X'])
    expect(workspaceOpenedFor()?.id).toBe('X')
  })

  it('the sign-in start, from a person who is signed in or not, names no workspace', async () => {
    stub({ [`GET ${API_ROOT}/me`]: { status: 200, body: meFor('X') }, [`GET ${API_ROOT}/sections`]: { status: 200, body: { sections: [] } } })
    const session = useAdminSession()
    await session.resolve()
    vi.stubGlobal('location', { ...window.location, assign: vi.fn() })
    seen = []
    stub({ [`POST ${API_ROOT}/login/start`]: { status: 200, body: { authorizeUrl: 'https://id.example.test/go' } } })
    await session.login('webEid')
    await session.switchTo('Z')
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([`POST ${API_ROOT}/login/start`, `POST ${API_ROOT}/login/start`])
    expect(seen.map(named)).toEqual([undefined, undefined])
  })

  it('a second read of who is signed in, after the page was opened for a workspace, names none, and the sections read after it still names it', async () => {
    stub({ [`GET ${API_ROOT}/me`]: { status: 200, body: meFor('X') }, [`GET ${API_ROOT}/sections`]: { status: 200, body: { sections: [] } } })
    const session = useAdminSession()
    await session.resolve()
    seen = []
    await session.resolve()
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([`GET ${API_ROOT}/me`, `GET ${API_ROOT}/sections`])
    expect(named(seen[0]!)).toBeUndefined()
    expect(named(seen[1]!)).toBe('X')
  })

  it('the other calls that ask where the person is, each read in turn, carry none', async () => {
    stub({ [`GET ${API_ROOT}/me`]: { status: 200, body: meFor('X') }, [`GET ${API_ROOT}/sections`]: { status: 200, body: { sections: [] } } })
    const session = useAdminSession()
    await session.resolve()
    seen = []
    await session.readWays()
    await session.reread()
    await session.readCurrent()
    await session.noteShown()
    await session.logout()
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      `GET ${API_ROOT}/login/ways`,
      `GET ${API_ROOT}/me`,
      `GET ${API_ROOT}/me`,
      `DELETE ${API_ROOT}/me/workspace-notice`,
      `POST ${API_ROOT}/logout`,
    ])
    expect(seen.map(named)).toEqual([undefined, undefined, undefined, undefined, undefined])
  })

  it('is named by the text upload', async () => {
    stub({ [`GET ${API_ROOT}/me`]: { status: 200, body: meFor('X') }, [`GET ${API_ROOT}/sections`]: { status: 200, body: { sections: [] } } })
    await useAdminSession().resolve()
    await postText('/api/upload', '{}')
    expect(seen.filter((s) => s.url === '/api/upload').map(named)).toEqual(['X'])
    expect(workspaceHeaders()).toEqual({ 'Workspace-Id': 'X' })
  })

  it('is named by a raw read of a file too, and by none while no workspace is known', async () => {
    stub({ [`GET ${API_ROOT}/me`]: { status: 200, body: meFor('') }, [`GET ${API_ROOT}/sections`]: { status: 200, body: { sections: [] } } })
    await useAdminSession().resolve()
    expect(workspaceHeaders()).toEqual({})
    await read('/api/file')
    expect(seen.filter((s) => s.url === '/api/file').map(named)).toEqual([undefined])
    forgetOpenedWorkspace()
    stub({ [`GET ${API_ROOT}/me`]: { status: 200, body: meFor('X') }, [`GET ${API_ROOT}/sections`]: { status: 200, body: { sections: [] } } })
    await useAdminSession().resolve()
    await read('/api/file')
    expect(seen.filter((s) => s.url === '/api/file').map(named)).toEqual(['X'])
  })

  it('keeps nothing of it in any browser storage', async () => {
    stub({ [`GET ${API_ROOT}/me`]: { status: 200, body: meFor('X', 'Kalve Ltd') }, [`GET ${API_ROOT}/sections`]: { status: 200, body: { sections: [] } } })
    await useAdminSession().resolve()
    await post('/api/x', {})
    expect(JSON.stringify({ ...window.localStorage, ...window.sessionStorage })).not.toMatch(/X|Kalve/)
    expect(window.localStorage.length + window.sessionStorage.length).toBe(0)
  })
})

describe('a call refused for naming another workspace', () => {
  const refusal = (status: number, code: string) => ({ status, body: { code, title: 'refused' } })

  it('tells the listener once, and the caller still gets the refusal', async () => {
    const moved = vi.fn()
    listen(moved)
    stub({ 'POST /api/x': refusal(409, OTHER_WORKSPACE) })
    const refused = await post('/api/x', {}).catch((e: unknown) => e)
    expect(refused).toBeInstanceOf(ApiError)
    expect(isOtherWorkspace(refused)).toBe(true)
    expect(moved).toHaveBeenCalledTimes(1)
  })

  it('tells the listener when a raw read is refused that way', async () => {
    const moved = vi.fn()
    listen(moved)
    stub({ 'GET /api/file': refusal(409, OTHER_WORKSPACE) })
    const resp = await read('/api/file')
    expect(resp.status).toBe(409)
    const { refusalOf } = await import('./api')
    await refusalOf(resp)
    expect(moved).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a 409 with another code', 409, 'err:request:conflict'],
    ['a 403 with that code', 403, OTHER_WORKSPACE],
  ])('tells nobody for %s', async (_case, status, code) => {
    const moved = vi.fn()
    listen(moved)
    stub({ 'POST /api/x': refusal(status, code) })
    const refused = await post('/api/x', {}).catch((e: unknown) => e)
    expect(refused).toMatchObject({ status, code })
    expect(isOtherWorkspace(refused)).toBe(false)
    expect(moved).not.toHaveBeenCalled()
  })
})

describe('who listens for a call refused for naming another workspace', () => {
  it('tells every listener, so a host may add its own beside another', () => {
    const first = vi.fn()
    const second = vi.fn()
    listen(first)
    listen(second)
    workspaceMoved()
    expect([first.mock.calls.length, second.mock.calls.length]).toEqual([1, 1])
  })

  it('does not tell a listener that was removed, and tells the others', () => {
    const kept = vi.fn()
    const removed = vi.fn()
    listen(kept)
    const stop = listen(removed)
    stop()
    workspaceMoved()
    expect([kept.mock.calls.length, removed.mock.calls.length]).toEqual([1, 0])
  })

  it('knows the refusal by its status and code on any value, not only this package’s error', () => {
    expect(isOtherWorkspace({ status: 409, code: 'err:session:otherWorkspace' })).toBe(true)
    expect(isOtherWorkspace({ status: 403, code: 'err:session:otherWorkspace' })).toBe(false)
    expect(isOtherWorkspace({ status: 409, code: 'err:request:conflict' })).toBe(false)
    expect(isOtherWorkspace(null)).toBe(false)
    expect(isOtherWorkspace('err:session:otherWorkspace')).toBe(false)
  })
})
