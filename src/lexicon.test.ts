// The words for the host's sections, as Export & import and History read them:
// the register is these screens' own section, called what they call it unless
// the host chose another name.
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { useLexicon } from './lexicon'
import type { AdminOptions } from './options'
import { configbyteScreens } from './plugin'
import { useAdminSession } from './stores/session'

function titlesFor(options: AdminOptions, locale = 'en') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAdminSession().order = ['orders', 'members']
  const i18n = createI18n({ legacy: false, locale, fallbackLocale: 'en', messages: { en: { host: { orders: 'Order register', members: 'Who may what' } } } })
  let titles: Record<string, string> = {}
  const Probe = defineComponent({
    setup() {
      const lexicon = useLexicon()

      return () => {
        titles = lexicon.value.titles

        return h('div')
      }
    },
  })
  mount(Probe, { global: { plugins: [pinia, i18n, configbyteScreens(i18n, options)] } })

  return titles
}

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
})
