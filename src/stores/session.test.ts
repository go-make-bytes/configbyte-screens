// What the sign-in answer tells about the deployment, and who the menu shows the
// deployment's own area to: the answer alone, on a deployment that serves many companies.
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAdminSession, type DeploymentState, type Identity } from './session'

const API = '/api/configbyte/v1'

const identity = (extra: Partial<Identity> = {}): Identity => ({
  subject: 'sub:A',
  name: 'Anna Example',
  loginMethod: 'webEid',
  loa: 'high',
  tenant: 'W-1',
  sections: {},
  presentation: { displayName: 'Kalns', locale: 'en', personLocale: null, deploymentLocale: 'en' },
  ...extra,
})

const state = (extra: Partial<DeploymentState> = {}): DeploymentState => ({ mode: 'saas', admin: true, firstRunOwed: false, signInAge: 900, ...extra })

/** The coordinator answering who is signed in with the given body. */
function answerMe(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const found = url === `${API}/me` ? body : url === `${API}/sections` ? { sections: [] } : {}

      return { ok: true, status: 200, headers: new Headers(), json: async () => found } as unknown as Response
    }),
  )
}

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => vi.unstubAllGlobals())

describe('what the sign-in answer says of the deployment', () => {
  it('keeps the time of the sign-in and what the deployment is, as they came', async () => {
    answerMe(identity({ signedInAt: '2026-11-12T09:12:00Z', deployment: state({ firstRunOwed: true, signInAge: 900 }) }))
    const session = useAdminSession()
    await session.resolve()
    expect(session.me?.signedInAt).toBe('2026-11-12T09:12:00Z')
    expect(session.me?.deployment).toEqual({ mode: 'saas', admin: true, firstRunOwed: true, signInAge: 900 })
    expect(session.deployment).toEqual({ mode: 'saas', admin: true, firstRunOwed: true, signInAge: 900 })
  })

  it('keeps a time that is not known, and an age that is not asked for, as null', async () => {
    answerMe(identity({ signedInAt: null, deployment: state({ signInAge: null }) }))
    const session = useAdminSession()
    await session.resolve()
    expect(session.me?.signedInAt).toBeNull()
    expect(session.deployment?.signInAge).toBeNull()
  })

  it('reads a deployment the register could not say as none', async () => {
    answerMe(identity({ deployment: null }))
    const session = useAdminSession()
    await session.resolve()
    expect(session.deployment).toBeNull()
    expect(session.managesDeployment).toBe(false)
  })

  it('reads an answer that says nothing of it, as an older coordinator gives, as none', async () => {
    answerMe(identity())
    const session = useAdminSession()
    await session.resolve()
    expect(session.deployment).toBeNull()
    expect(session.managesDeployment).toBe(false)
  })
})

describe('reading who is signed in again, for a comparison', () => {
  it('asks the network every time, never a cached answer', async () => {
    const fetched = vi.fn(async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => identity() }) as unknown as Response)
    vi.stubGlobal('fetch', fetched)
    const session = useAdminSession()
    session.me = identity()
    await session.reread()
    const [url, init] = fetched.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API}/me`)
    expect(init.cache).toBe('no-store')
  })

  it('keeps the deployment part it holds when the same person’s answer has none, and takes the new one when it has', async () => {
    const session = useAdminSession()
    session.me = identity({ deployment: state() })
    answerMe(identity({ deployment: null }))
    expect(await session.reread()).toBe('same')
    expect(session.me?.deployment).toEqual(state())
    answerMe(identity({ deployment: state({ admin: false }) }))
    expect(await session.reread()).toBe('same')
    expect(session.me?.deployment?.admin).toBe(false)
  })

  it('says another person, and holds nothing of them, for a different subject, and likewise when nobody is signed in', async () => {
    const session = useAdminSession()
    const held = identity({ deployment: state() })
    session.me = held
    answerMe(identity({ subject: 'sub:B', deployment: null }))
    expect(await session.reread()).toBe('other')
    expect(session.me?.subject).toBe(held.subject)
    expect(session.me?.deployment).toEqual(state())
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, headers: new Headers(), json: async () => ({ code: 'err:configbyte:noSession' }) }) as unknown as Response))
    expect(await session.reread()).toBe('other')
  })
})

describe('who the deployment’s own area is shown to', () => {
  it.each([
    ['a deployment admin on a deployment for many companies', state({ mode: 'saas', admin: true }), true],
    ['somebody who is not one, on the same', state({ mode: 'saas', admin: false }), false],
    ['nobody on a deployment for one company, admin or not', state({ mode: 'local', admin: false }), false],
    ['nobody on a deployment for one company, even an admin', state({ mode: 'local', admin: true }), false],
    ['nobody on a mode it does not know', state({ mode: 'other', admin: true }), false],
  ])('%s', (_case, deployment, shown) => {
    const session = useAdminSession()
    session.me = identity({ deployment })
    expect(session.managesDeployment).toBe(shown)
  })

  it('shows it to nobody before anybody is signed in', () => {
    expect(useAdminSession().managesDeployment).toBe(false)
  })

  it('does not depend on what the person configures', () => {
    const session = useAdminSession()
    session.me = identity({ deployment: state(), sections: { orders: ['orders/setup:import'] } })
    expect(session.managesDeployment).toBe(true)
    session.me = identity({ deployment: state(), sections: {} })
    expect(session.managesDeployment).toBe(true)
  })
})
