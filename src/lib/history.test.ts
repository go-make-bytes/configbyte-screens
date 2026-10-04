// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { merge, registerWords, transportWords, type Names, type Stream } from './history'

const stream = (key: string, ats: string[], more: boolean): Stream => ({
  key,
  section: key,
  query: '',
  filter: key,
  chip: key,
  lines: ats.map((at, i) => ({ section: key, id: `${key}-${i}`, at, actor: 'sub:A', kind: 'k', payload: {} })),
  more,
  failed: '',
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
  box: (p) => ({ 'orders/order:view': 'See orders' })[p] ?? p,
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

  it('answers nothing for a kind it does not know', () => {
    expect(registerWords(line('somethingNew', {}), names)).toBeNull()
  })
})
