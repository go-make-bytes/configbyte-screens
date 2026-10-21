// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  loginName,
  merge,
  newStream,
  registerWords,
  shortHash,
  transportWords,
  withoutPairedAdministratorLines,
  type Names,
  type Stream,
} from './history'

describe('a hash as a person compares it', () => {
  it('shows the digits of a long hash, first four and last four, without the algorithm in front of them', () => {
    expect(shortHash('sha256:9b1e0000000000000000000000000000000000000000000000000000000f04a')).toBe('9b1e…f04a')
    expect(shortHash('3f2a00000000000007c1')).toBe('3f2a…07c1')
    expect(shortHash('sha256:abc')).toBe('abc')
  })
})

const stream = (key: string, ats: string[], more: boolean): Stream => ({
  ...newStream({ key, section: key, query: '', filter: key }),
  lines: ats.map((at, i) => ({ section: key, id: `${key}-${i}`, at, actor: 'sub:A', kind: 'k', payload: {} })),
  more,
})

describe('merging pages of several histories', () => {
  it('lays every line out newest first when no stream has more', () => {
    const { lines, more } = merge([stream('a', ['2026-10-03T12:00:00Z', '2026-10-01T12:00:00Z'], false), stream('b', ['2026-10-02T12:00:00Z'], false)])
    expect(lines.map((l) => l.line.id)).toEqual(['a-0', 'b-0', 'a-1'])
    expect(more).toBe(false)
  })

  // A stream with more may still hold a line newer than another stream's oldest:
  // nothing older than the oldest line read from it is shown until it is read further.
  it('holds back lines older than what a stream with more has reached', () => {
    const { lines, more } = merge([
      stream('a', ['2026-10-03T12:00:00Z', '2026-10-02T12:00:00Z'], true),
      stream('b', ['2026-10-02T18:00:00Z', '2026-09-20T12:00:00Z'], false),
    ])
    expect(lines.map((l) => l.line.id)).toEqual(['a-0', 'b-0', 'a-1'])
    expect(more).toBe(true)
  })

  it('reads the horizon as the newest of the oldest lines of the streams with more', () => {
    const { lines } = merge([
      stream('a', ['2026-10-03T12:00:00Z', '2026-10-02T12:00:00Z'], true),
      stream('b', ['2026-10-03T08:00:00Z', '2026-09-30T12:00:00Z'], true),
    ])
    expect(lines.map((l) => l.line.id)).toEqual(['a-0', 'b-0', 'a-1'])
  })

  it('orders lines written at the same moment by the order of their streams', () => {
    const { lines } = merge([stream('a', ['2026-10-03T12:00:00+03:00'], false), stream('b', ['2026-10-03T09:00:00Z'], false)])
    expect(lines.map((l) => l.line.id)).toEqual(['a-0', 'b-0'])
  })
})

const names: Names = {
  member: (id) => ({ m1: 'Jānis Ozols', m2: 'Anna Bērziņa' })[id] ?? '',
  role: (id) => ({ r1: 'Meistars' })[id] ?? '',
  type: (id) => ({ t1: 'Birojs' })[id] ?? '',
  position: (id) => ({ p1: 'Ražošanas vadītājs' })[id] ?? '',
  box: (p) => ({ 'orders/order:view': 'See orders', 'orders/order:edit': 'Change orders' })[p] ?? p,
  entitlement: (service) => ({ orders: 'Orders' })[service] ?? '',
  service: (key) => ({ orders: 'Order register' })[key] ?? '',
  grant: (group, level) => ({ 'membership/chart': 'see the Chart of authority' } as Record<string, string>)[`${group}/${level}`] ?? '',
  isService: (id) => id === 'm5',
}
const line = (kind: string, payload: Record<string, unknown>, userId = '') => ({ section: 'members', id: 'e1', at: '2026-10-03T11:40:00Z', actor: 'sub:A', kind, payload, userId })

describe('the lines every owner writes for its own part', () => {
  it('counts what an import changed across the part, and names the file and the part by their hashes', () => {
    const w = transportWords({
      ...line('configApplied', {
        kinds: { added: 1, changed: 2, unchanged: 30, refused: 0 },
        fields: { added: 0, changed: 0, unchanged: 11, refused: 0 },
        partHash: '3f2a00000000000000000000000007c1',
        documentHash: '9b1e0000000000000000000000000f04a',
      }),
    })!
    expect(w.words).toEqual({ key: 'configbyte.history.lines.imported', values: { changed: '3', unchanged: '41' } })
    expect(w.detail).toEqual({ key: 'configbyte.history.lines.fileAndPart', values: { file: '9b1e…f04a', part: '3f2a…07c1' } })
  })

  it('says an import that changed nothing, and an export by its part', () => {
    expect(transportWords(line('configApplied', { kinds: { added: 0, changed: 0, unchanged: 4 } }))!.words.key).toBe('configbyte.history.lines.importedNothing')
    const out = transportWords(line('configExported', { partHash: '51e9000000000000b2d4' }))!
    expect(out.words.key).toBe('configbyte.history.lines.exported')
    expect(out.detail?.values).toEqual({ part: '51e9…b2d4' })
  })
})

describe('the membership register’s lines', () => {
  it('names the person a role went to, and the role by the name it had then', () => {
    expect(registerWords(line('tenantRoleGranted', { roleId: 'r9', name: 'Meistars' }, 'm1'), names)).toEqual({
      who: { actor: 'sub:A' },
      words: { key: 'configbyte.history.lines.roleGranted', values: { person: 'Jānis Ozols', role: 'Meistars' } },
    })
  })

  it('reads the administrator’s box as the checkbox, not as a service role', () => {
    const w = registerWords(line('roleGranted', { service: 'members', group: 'membership', level: 'admin' }, 'm2'), names)!
    expect(w.words).toEqual({ key: 'configbyte.history.lines.administratorOn', values: { person: 'Anna Bērziņa' } })
  })

  it('puts a line about someone arriving under the person who arrived', () => {
    expect(registerWords(line('directoryAdmitted', { subjectKey: 'sub:J' }, 'm1'), names)!.who).toEqual({ member: 'm1' })
  })

  it('looks a user type and a position up by id, and the boxes of a role by their words', () => {
    expect(registerWords(line('userTypeAssigned', { userTypeId: 't1', source: 'administrator' }, 'm1'), names)!.words.values).toEqual({
      person: 'Jānis Ozols',
      type: 'Birojs',
    })
    expect(registerWords(line('chartPersonPlaced', { positionId: 'p1', from: '' }, 'm2'), names)!.words.values).toEqual({
      person: 'Anna Bērziņa',
      position: 'Ražošanas vadītājs',
    })
    expect(registerWords(line('tenantRoleReconfigured', { roleId: 'r1', name: 'HR', added: ['orders/order:view'], removed: [] }), names)!.words).toEqual({
      key: 'configbyte.history.lines.roleTicksAdded',
      values: { role: 'HR', added: 'See orders', removed: '' },
    })
  })

  // A role's and a position's names in other languages change on the same line as
  // a rename; a line whose name stayed is a change of those names alone.
  it('reads a role whose name stayed as a change of its names in other languages, never a rename to itself', () => {
    expect(registerWords(line('tenantRoleRenamed', { roleId: 'r1', from: 'Meistars', to: 'Meistars', labels: { en: 'Foreman' } }), names)!.words).toEqual({
      key: 'configbyte.history.lines.roleNamesChanged',
      values: { role: 'Meistars' },
    })
  })

  it('keeps a role renamed a rename, whether or not the line carries other names', () => {
    const renamed = { key: 'configbyte.history.lines.roleRenamed', values: { from: 'Meistars', to: 'Vecākais meistars' } }
    expect(registerWords(line('tenantRoleRenamed', { roleId: 'r1', from: 'Meistars', to: 'Vecākais meistars', labels: { en: 'Senior foreman' } }), names)!.words).toEqual(renamed)
    expect(registerWords(line('tenantRoleRenamed', { roleId: 'r1', from: 'Meistars', to: 'Vecākais meistars' }), names)!.words).toEqual(renamed)
    // A change of letter case is a rename too.
    expect(registerWords(line('tenantRoleRenamed', { roleId: 'r1', from: 'meistars', to: 'Meistars', labels: {} }), names)!.words.key).toBe('configbyte.history.lines.roleRenamed')
  })

  it('reads a position whose name stayed as a change of its names in other languages, and a renamed one as renamed', () => {
    expect(registerWords(line('chartPositionRenamed', { positionId: 'p1', name: 'Ražošanas vadītājs', from: 'Ražošanas vadītājs', labels: { en: 'Head of production' } }), names)!.words).toEqual({
      key: 'configbyte.history.lines.positionNamesChanged',
      values: { position: 'Ražošanas vadītājs' },
    })
    expect(registerWords(line('chartPositionRenamed', { positionId: 'p1', name: 'Ražošanas vadītājs', from: 'Cehs' }), names)!.words).toEqual({
      key: 'configbyte.history.lines.positionRenamed',
      values: { from: 'Cehs', position: 'Ražošanas vadītājs' },
    })
  })

  it('says a service was connected to the workspace where a person accepted the invitation', () => {
    expect(registerWords(line('claimAttached', {}, 'm5'), names)!.words.key).toBe('configbyte.history.lines.serviceConnected')
    expect(registerWords(line('claimAttached', {}, 'm1'), names)!.words.key).toBe('configbyte.history.lines.claimAttached')
  })

  it('answers nothing for a kind it does not know', () => {
    expect(registerWords(line('somethingNew', {}), names)).toBeNull()
  })

  it('says a service’s role in words where they are known, else as its group and level, in the service it names, or in another one', () => {
    expect(registerWords(line('roleGranted', { service: 'orders', group: 'orders', level: 'clerk' }, 'm1'), names)!.words).toEqual({
      key: 'configbyte.history.lines.serviceRoleGranted',
      values: { person: 'Jānis Ozols', what: 'orders · clerk', service: 'Order register' },
    })
    expect(registerWords(line('roleGranted', { service: 'orders', group: 'membership', level: 'chart' }, 'm1'), names)!.words.values).toEqual({
      person: 'Jānis Ozols',
      what: 'see the Chart of authority',
      service: 'Order register',
    })
    expect(registerWords(line('roleRevoked', { service: 'unlisted', group: 'orders', level: 'clerk' }, 'm1'), names)!.words.key).toBe(
      'configbyte.history.lines.serviceRoleRevokedElsewhere',
    )
  })

  it('names what the workspace was given, or says it cannot, and never prints the key', () => {
    expect(registerWords(line('tenantEntitled', { service: 'orders', feature: '' }), names)!.words).toEqual({
      key: 'configbyte.history.lines.entitled',
      values: { what: 'Orders' },
    })
    expect(registerWords(line('tenantEntitlementRevoked', { service: 'unlisted', feature: 'x' }), names)!.words.key).toBe(
      'configbyte.history.lines.entitlementRevokedUnnamed',
    )
  })

  it('names a corporate login a person knows, and puts its address under the line without the scheme', () => {
    const w = registerWords(line('directoryAttached', { issuer: 'https://login.microsoftonline.com/3c1d/v2.0' }), names)!
    expect(w.words).toEqual({ key: 'configbyte.history.lines.directoryAttachedNamed', values: { name: 'Microsoft' } })
    expect(w.detail).toEqual({ key: 'configbyte.history.lines.address', values: { address: 'login.microsoftonline.com/3c1d/v2.0' } })
    const other = registerWords(line('directoryDetached', { issuer: 'https://idp.example.org/realm' }), names)!
    expect(other.words.key).toBe('configbyte.history.lines.directoryDetached')
    expect(other.detail?.values).toEqual({ address: 'idp.example.org/realm' })
    expect(loginName('https://accounts.google.com')).toBe('Google')
    expect(loginName('not an address')).toBe('')
  })

  it('says what a position sees from the boxes before and after, and keeps the plain line when it cannot', () => {
    const sees = (p: Record<string, unknown>) => registerWords(line('chartPositionPermissionsSet', { name: 'CEO', ...p }), names)!.words
    expect(sees({ from: [], permissions: ['orders/order:view'] })).toMatchObject({ key: 'configbyte.history.lines.positionSeesAdded', values: { boxes: 'See orders' } })
    expect(sees({ from: ['orders/order:view'], permissions: [] })).toMatchObject({ key: 'configbyte.history.lines.positionSeesRemoved', values: { boxes: 'See orders' } })
    expect(sees({ from: ['orders/order:view'], permissions: ['orders/order:edit'] })).toMatchObject({
      key: 'configbyte.history.lines.positionSeesBoth',
      values: { added: 'Change orders', removed: 'See orders' },
    })
    expect(sees({ permissions: ['orders/order:view'] }).key).toBe('configbyte.history.lines.positionSees')
  })
})

describe('one act, one line', () => {
  const at = (id: string, kind: string, payload: Record<string, unknown>, actor = 'operator', when = '2026-10-03T11:58:00Z') => ({
    line: { section: 'members', id, at: when, actor, kind, payload, userId: 'm1' },
  })
  const admin = { service: 'members', group: 'membership', level: 'admin' }

  it('drops the operator’s administrator line beside the role line that says the same', () => {
    const lines = [at('a', 'roleGranted', admin), at('b', 'administratorSetByOperator', {}), at('c', 'administratorUnsetByOperator', {}), at('d', 'roleRevoked', admin)]
    expect(withoutPairedAdministratorLines(lines).map((l) => l.line.id)).toEqual(['a', 'd'])
  })

  it('keeps it when the role line is not there, or is another moment’s, or another actor’s', () => {
    const lonely = at('b', 'administratorSetByOperator', {})
    expect(withoutPairedAdministratorLines([lonely])).toHaveLength(1)
    expect(withoutPairedAdministratorLines([lonely, at('a', 'roleGranted', admin, 'operator', '2026-10-03T11:59:00Z')])).toHaveLength(2)
    expect(withoutPairedAdministratorLines([lonely, at('a', 'roleGranted', admin, 'sub:A')])).toHaveLength(2)
    expect(withoutPairedAdministratorLines([lonely, at('a', 'roleGranted', { service: 'orders', group: 'orders', level: 'clerk' })])).toHaveLength(2)
  })
})

describe('the lines about a person’s note', () => {
  it('says a changed note and a cleared one, by the administrator, naming the person', () => {
    expect(registerWords(line('noteChanged', { cleared: false }, 'm1'), names)).toEqual({
      who: { actor: 'sub:A' },
      words: { key: 'configbyte.history.lines.noteChanged', values: { person: 'Jānis Ozols' } },
    })
    expect(registerWords(line('noteChanged', { cleared: true }, 'm1'), names)).toEqual({
      who: { actor: 'sub:A' },
      words: { key: 'configbyte.history.lines.noteCleared', values: { person: 'Jānis Ozols' } },
    })
  })
})
