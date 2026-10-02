// @vitest-environment node
import { describe, expect, it } from 'vitest'

import en from './locales/en.json'
import lv from './locales/lv.json'

type Tree = { [key: string]: string | Tree }

function leaves(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([k, v]) => (typeof v === 'string' ? [[prefix + k, v] as [string, string]] : leaves(v, `${prefix}${k}.`)))
}

// A word missing in one language reads as its key on screen, which nothing else catches.
describe('the words these screens carry', () => {
  it('says every word in both languages', () => {
    const a = leaves(en as Tree).map(([k]) => k)
    const b = leaves(lv as Tree).map(([k]) => k)
    expect(a.filter((k) => !b.includes(k))).toEqual([])
    expect(b.filter((k) => !a.includes(k))).toEqual([])
  })

  it('leaves no word empty', () => {
    expect([...leaves(en as Tree), ...leaves(lv as Tree)].filter(([, v]) => v.trim() === '').map(([k]) => k)).toEqual([])
  })

  it('keeps every placeholder a word carries in both languages', () => {
    // A plural repeats its placeholder once per form, so each is counted once.
    const holes = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort()
    const lvWords = Object.fromEntries(leaves(lv as Tree))
    const differ = leaves(en as Tree).filter(([k, v]) => JSON.stringify(holes(v)) !== JSON.stringify(holes(lvWords[k] ?? '')))
    expect(differ.map(([k]) => k)).toEqual([])
  })
})
