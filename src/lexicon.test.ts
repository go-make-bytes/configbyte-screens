// The words for the host's sections, as Export & import and History read them:
// the register is these screens' own section, called what they call it unless
// the host chose another name.
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { useLexicon } from './lexicon'
import type { Lexicon } from './lib/transfer'
import type { AdminOptions } from './options'
import { configbyteScreens } from './plugin'
import { useAdminSession } from './stores/session'

function lexiconFor(options: AdminOptions, locale = 'en') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAdminSession().order = ['orders', 'members']
  const i18n = createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'en',
    messages: { en: { host: { orders: 'Order register', members: 'Who may what', kinds: 'Kinds', priorities: 'Priorities', priority: '{n} priority | {n} priorities' } } },
  })
  let lexicon: Lexicon | undefined
  const Probe = defineComponent({
    setup() {
      const read = useLexicon()

      return () => {
        lexicon = read.value

        return h('div')
      }
    },
  })
  mount(Probe, { global: { plugins: [pinia, i18n, configbyteScreens(i18n, options)] } })

  return lexicon!
}

const titlesFor = (options: AdminOptions, locale = 'en') => lexiconFor(options, locale).titles

const base: AdminOptions = { product: 'host.product', never: 'host.never', sections: { orders: { title: 'host.orders' } }, carries: [], register: 'members' }

describe('the lexicon', () => {
  it('names the register with the screens’ own title when the host gives it none', () => {
    expect(titlesFor(base)).toEqual({ orders: 'Order register', members: 'People & access' })
    expect(titlesFor({ ...base, sections: { ...base.sections, members: { parts: [] } } }).members).toBe('People & access')
    expect(titlesFor(base, 'lv').members).toBe('Cilvēki un piekļuve')
  })

  it('keeps the host’s own name for the register when it gives one', () => {
    expect(titlesFor({ ...base, sections: { ...base.sections, members: { title: 'host.members' } } }).members).toBe('Who may what')
  })

  it('names no register when the host names none', () => {
    expect(titlesFor({ ...base, register: undefined })).toEqual({ orders: 'Order register' })
  })

  // A part's count needs its number, so the lexicon says it when it is asked with one.
  it('carries each part’s count, said with its number, and the area it is taken out of use in', () => {
    const lexicon = lexiconFor({
      ...base,
      sections: {
        orders: {
          title: 'host.orders',
          parts: [
            { key: 'kinds', word: 'host.kinds' },
            { key: 'priorities', word: 'host.priorities', count: 'host.priority', area: 'flow' },
          ],
        },
      },
    })
    const [kinds, priorities] = lexicon.parts.orders!
    expect(kinds).toMatchObject({ key: 'kinds', word: 'Kinds', count: undefined, area: undefined })
    expect(priorities).toMatchObject({ key: 'priorities', word: 'Priorities', area: 'flow' })
    expect([priorities!.count!(1), priorities!.count!(3)]).toEqual(['1 priority', '3 priorities'])
  })

  it('words the register’s three parts itself, with counts, in the reader’s language', () => {
    const en = lexiconFor(base).parts.members!
    expect(en.map((p) => [p.key, p.word, p.count!(1), p.count!(2)])).toEqual([
      ['services', 'Services', '1 service', '2 services'],
      ['roles', 'Role rungs', '1 role rung', '2 role rungs'],
      ['permissions', 'Boxes', '1 box', '2 boxes'],
    ])
    const lv = lexiconFor(base, 'lv').parts.members!
    expect(lv.map((p) => [p.word, p.count!(1), p.count!(2)])).toEqual([
      ['Servisi', '1 serviss', '2 servisi'],
      ['Lomu pakāpes', '1 lomas pakāpe', '2 lomas pakāpes'],
      ['Atļaujas', '1 atļauja', '2 atļaujas'],
    ])
  })

  it('keeps a part of the register the host words itself, and adds only the ones it leaves out', () => {
    const lexicon = lexiconFor({ ...base, sections: { ...base.sections, members: { parts: [{ key: 'roles', word: 'host.priorities' }] } } })
    expect(lexicon.parts.members!.map((p) => [p.key, p.word])).toEqual([
      ['roles', 'Priorities'],
      ['services', 'Services'],
      ['permissions', 'Boxes'],
    ])
  })

  it('words no register part when the host names no register', () => {
    expect(lexiconFor({ ...base, register: undefined }).parts.members).toBeUndefined()
  })
})
