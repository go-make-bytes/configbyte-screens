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

  // The globe marks the language everyone here has with it, beside the names each language gives itself.
  it('carries the word that marks the language everyone here has', () => {
    const word = (tree: Tree) => Object.fromEntries(leaves(tree))['configbyte.language.everyoneHere']
    expect([word(en as Tree), word(lv as Tree)]).toEqual(['everyone here', 'visiem šeit'])
  })

  // The sentence for a deployment that cannot add people says so in plain words: it never names the
  // register, which a person has never heard of.
  it('says an invitation refused for a deployment that cannot add people without the retired word, in both languages', () => {
    const key = 'configbyte.people.refused.inviteUnavailable'
    const english = Object.fromEntries(leaves(en as Tree))[key]
    const latvian = Object.fromEntries(leaves(lv as Tree))[key]
    expect(english).toBeTruthy()
    expect(latvian).toBeTruthy()
    expect(english).not.toMatch(/register/i)
    expect(latvian).not.toMatch(/reģistr/i)
  })

  it('keeps every placeholder a word carries in both languages', () => {
    // A plural repeats its placeholder once per form, so each is counted once.
    const holes = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort()
    const lvWords = Object.fromEntries(leaves(lv as Tree))
    const differ = leaves(en as Tree).filter(([k, v]) => JSON.stringify(holes(v)) !== JSON.stringify(holes(lvWords[k] ?? '')))
    expect(differ.map(([k]) => k)).toEqual([])
  })
})
