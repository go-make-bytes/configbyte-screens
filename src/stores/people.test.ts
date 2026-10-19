// A Save refused because the name is taken, said from the lists the store already
// holds: a name another item already has as entered, or a name another item
// already reads as in one of the languages the register keeps names in.
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { usePeople, type Role, type UserType } from './people'

const role = (id: string, name: string, labels?: Record<string, string>): Role => ({ id, name, description: '', permissions: [], ...(labels ? { labels } : {}) })
const type = (id: string, name: string, labels?: Record<string, string>): UserType => ({
  id,
  name,
  description: '',
  permissions: [],
  corporateLoginDefault: false,
  workspaceDefault: false,
  ...(labels ? { labels } : {}),
})

/** Every change is refused as a clash; every read answers an empty list. */
function refuseEveryChange() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const change = (init?.method ?? 'GET') !== 'GET'
      const body = change ? { code: 'err:membership:conflict', detail: 'a role reading the same in lv already exists in the tenant: Manager' } : {}

      return { ok: !change, status: change ? 409 : 200, headers: new Headers(), json: async () => body } as unknown as Response
    }),
  )
}

function store(roles: Role[], userTypes: UserType[] = []) {
  setActivePinia(createPinia())
  const people = usePeople()
  people.section = 'members'
  people.tenant = 'W-1'
  people.roles = roles
  people.userTypes = userTypes
  people.loaded = true

  return people
}

const newRole = (name: string) => ({ id: '', name, was: '', description: '', wasDescription: '', permissions: [], changed: false })
const edited = (id: string, name: string, was: string) => ({ id, name, was, description: '', wasDescription: '', permissions: [], changed: false })

beforeEach(refuseEveryChange)
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('a role’s name refused as taken', () => {
  it('says the plain sentence when another role is already called that, whatever its other names', async () => {
    const people = store([role('r1', 'Manager', { lv: 'Vadītājs' }), role('r2', 'Worker', { lv: 'Strādnieks' })])
    await people.saveRole(newRole('worker'))
    expect(people.said).toEqual({ kind: 'refused', key: 'roleNameTaken', values: { name: 'worker' } })

    // The name is also how another role reads in English: the same name is said first.
    const both = store([role('r1', 'Worker', { en: 'Hand' }), role('r2', 'Darbinieks', { en: 'Worker' })])
    await both.saveRole(newRole('Worker'))
    expect(both.said?.key).toBe('roleNameTaken')
  })

  it('names the other role and the language when the name is how that role reads there', async () => {
    const people = store([role('r1', 'Manager', { lv: 'Vadītājs' }), role('r2', 'Worker')])
    await people.saveRole(newRole('Vadītājs'))
    expect(people.said).toEqual({ kind: 'refused', key: 'roleReadsAlike', values: { name: 'Vadītājs', other: 'Manager', reads: 'Vadītājs' }, language: 'lv' })
  })

  it('reads two names alike whatever their case, and quotes the other role as it reads', async () => {
    const people = store([role('r1', 'Manager', { lv: 'Vadītājs' })])
    await people.saveRole(newRole('VADĪTĀJS'))
    expect(people.said).toMatchObject({ key: 'roleReadsAlike', values: { other: 'Manager', reads: 'Vadītājs' }, language: 'lv' })
  })

  it('reads a renamed role by its own other names, and never against itself', async () => {
    // Renamed to what it already reads as in Latvian: nothing else reads that way.
    const own = store([role('r1', 'Worker', { lv: 'Strādnieks' }), role('r2', 'Manager', { lv: 'Vadītājs' })])
    await own.saveRole(edited('r1', 'Strādnieks', 'Worker'))
    expect(own.said?.key).toBe('roleNameTaken')

    // Its own Latvian name stays, so only its name as entered is compared in English.
    const kept = store([role('r1', 'Packer', { lv: 'Pakotājs' }), role('r2', 'Worker', { lv: 'Strādnieks' })])
    await kept.saveRole(edited('r1', 'Strādnieks', 'Packer'))
    expect(kept.said?.key).toBe('roleNameTaken')
  })

  it('keeps the plain sentence when the roles were never read', async () => {
    const people = store([])
    people.loaded = false
    await people.saveRole(newRole('Vadītājs'))
    expect(people.said).toEqual({ kind: 'refused', key: 'roleNameTaken', values: { name: 'Vadītājs' } })
  })

  it('keeps the plain sentence for a register that answers no other names', async () => {
    const people = store([role('r1', 'Manager'), role('r2', 'Worker')])
    await people.saveRole(newRole('Vadītājs'))
    expect(people.said).toEqual({ kind: 'refused', key: 'roleNameTaken', values: { name: 'Vadītājs' } })
  })

  it('keeps the plain sentence for a language these screens have no word for', async () => {
    const people = store([role('r1', 'Manager', { xx: 'Vadītājs' })])
    await people.saveRole(newRole('Vadītājs'))
    expect(people.said?.key).toBe('roleNameTaken')
  })
})

describe('a user type’s name refused as taken', () => {
  it('says the plain sentence when another user type is already called that', async () => {
    const people = store([], [type('t1', 'Member', { lv: 'Dalībnieks' })])
    await people.saveUserType({ id: '', name: 'member', was: '', description: '', permissions: [] })
    expect(people.said).toEqual({ kind: 'refused', key: 'typeNameTaken', values: { name: 'member' } })
  })

  it('names the other user type and the language when the name is how that type reads there', async () => {
    const people = store([role('r1', 'Dalībnieks')], [type('t1', 'Member', { lv: 'Dalībnieks' }), type('t2', 'Office')])
    await people.saveUserType({ id: '', name: 'Dalībnieks', was: '', description: '', permissions: [] })
    expect(people.said).toEqual({ kind: 'refused', key: 'typeReadsAlike', values: { name: 'Dalībnieks', other: 'Member', reads: 'Dalībnieks' }, language: 'lv' })
  })

  it('reads an edited user type by its own other names, never against itself', async () => {
    const people = store([], [type('t1', 'Office', { en: 'Office', lv: 'Birojs' }), type('t2', 'Member', { lv: 'Dalībnieks' })])
    await people.saveUserType({ id: 't1', name: 'Birojs', was: 'Office', description: '', permissions: [] })
    expect(people.said?.key).toBe('typeNameTaken')
  })
})
