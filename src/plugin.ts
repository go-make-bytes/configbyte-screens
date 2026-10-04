// Installing the shared screens into a host application: the host's options are
// provided to every screen, and the screens' own words, in both languages, are
// merged into the host's translator under `configbyte` — then the host's
// replacements for any of them, so its own terms win.
import type { App, Plugin } from 'vue'

import en from './locales/en.json'
import lv from './locales/lv.json'
import { ADMIN_OPTIONS, type AdminOptions } from './options'

/** The languages these screens carry their own words in. */
export const messages = { en, lv }

/** The one thing these screens need of the host's translator: a way to add their words. */
export interface HostTranslator {
  global: { mergeLocaleMessage(locale: string, message: Record<string, unknown>): void }
}

export function configbyteScreens(i18n: HostTranslator, options: AdminOptions): Plugin {
  return {
    install(app: App) {
      for (const [lang, words] of Object.entries(messages)) i18n.global.mergeLocaleMessage(lang, words)
      for (const [lang, words] of Object.entries(options.words ?? {})) {
        i18n.global.mergeLocaleMessage(lang, { configbyte: words })
      }
      app.provide(ADMIN_OPTIONS, options)
    },
  }
}
