# configbyte-screens

The shared screens of a deployment's **admin app**: the sign-in page, the frame, and **Export / Import**, which
carries a workspace's configuration out as one file and back in. They are Vue 3 screens that a product's own
single-page application builds into a second app of its own, served at its own address and talking to one backend
only: the configuration coordinator, [configbyte](https://github.com/go-make-bytes/configbyte).

The screens name no product. The host application hands over its name, what its configuration's sections and parts
are called, the lines its Export card lists, and its own admin screens; these screens draw them.

## What a person sees

| State | When | What is shown |
|---|---|---|
| Signed out | the coordinator answers `401` to `GET /me` | the sign-in page: an ID card, or the provider's own sign-in page |
| Signed in | the person holds a scope the host marks as configuring a section this deployment runs | the frame: the deployment's name, the entries, and the screen opened |
| Nothing to configure | signed in, and no such scope is held | a plain sentence saying so, and signing out |
| Not answering | `GET /me` gets no answer, or `502`, `503` or `504` | a sentence saying nothing was changed, and *Try again* |

**An entry shows when two things are true:** its screen was built into this admin app, and the coordinator found
its section's owner when it started (`GET /sections`). Export / Import is always the first entry. What the frame
offers is display only: every call is judged by the service it reaches.

## Using it

Pin a tag, and the same `uibyte` tag the screens are built on:

```json
"configbyte-screens": "github:go-make-bytes/configbyte-screens#v0.1.0",
"uibyte": "github:gmb-lib/uibyte#v0.8.0"
```

The package ships source, like `uibyte`, so the host's build compiles it. Keep Vite's dependency optimiser away from
both, and point Tailwind at both:

```ts
// vite.config.ts
optimizeDeps: { exclude: ['uibyte', 'configbyte-screens'] },
```

```css
@import "tailwindcss";
@import "uibyte/theme.css";
@source "../node_modules/uibyte/src";
@source "../node_modules/configbyte-screens/src";
```

Peers the host provides: Vue 3, Vue Router 4, Pinia 2 and vue-i18n 11 (Composition API).

The admin app's entry, in the host:

```ts
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import { createRouter, createWebHistory } from 'vue-router'
import { adminRoutes, configbyteScreens } from 'configbyte-screens'

import AdminApp from './AdminApp.vue' // renders <AdminFrame> with the host's mark in its `mark` slot
import en from './locales/en.json'
import lv from './locales/lv.json'

const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages: { en, lv } })
const router = createRouter({ history: createWebHistory(), routes: [...adminRoutes()] })

createApp(AdminApp)
  .use(createPinia())
  .use(router)
  .use(i18n)
  .use(
    configbyteScreens(i18n, {
      product: 'admin.product',
      never: 'admin.export.never',
      sections: {
        orders: {
          title: 'admin.sections.orders',
          parts: [{ key: 'kinds', word: 'admin.parts.kinds' }],
          configures: ['orders/setup:import'],
        },
      },
      carries: [{ section: 'orders', line: 'admin.export.kinds' }],
    }),
  )
  .mount('#app')
```

```vue
<!-- AdminApp.vue -->
<script setup lang="ts">
import { AdminFrame } from 'configbyte-screens'
</script>

<template>
  <AdminFrame>
    <template #mark="{ size }"><svg :width="size" :height="size" viewBox="0 0 24 24">…</svg></template>
  </AdminFrame>
</template>
```

### What the host hands over

Every text is a **message key in the host's own translator**, so it reads in the person's language.

| Option | Meaning |
|---|---|
| `product` | the product's name, on the sign-in page and wherever the deployment's own name is not yet known |
| `sections` | per section name: its `title`, its `parts` in the host's order with their words, and the scopes that mark a person who may `configure` it |
| `carries` | the Export card's lines, in order, each naming the section it describes; a line shows only when the deployment runs that section |
| `never` | the Export card's last line: what the file never carries |
| `entries` | the host's own admin screens: a label, the route it opens, and the section whose owner serves it |
| `onApplied` | called after an import that may have changed something (`applied`, `partial`, `rolledBack`), so the host re-reads what it shows |

A section the host does not describe keeps the name it arrived with, and so does a part.

### Words

The screens carry their own words in **English and Latvian**, merged into the host's translator under `configbyte.*`
when the plugin is installed. The frame switches to the language the deployment names (`presentation.locale` in
`GET /me`) when it carries that language.

### The ID card

Signing in with a card loads the card software's browser library from the host's own origin, at `/web-eid.js`. The
host serves that file; it is never fetched from elsewhere.

## What it calls

Everything goes to the coordinator, same-origin, under `/api/configbyte/v1`, with its session cookie. Every
`POST` echoes the anti-forgery token from the `configbyte_csrf` cookie in `X-CSRF-Token`.

| Method | Path | For |
|---|---|---|
| `GET` | `/me` | who is signed in, the deployment's name and language, the person's scopes per section |
| `GET` | `/sections` | the deployment's sections, in the order an import writes them |
| `POST` | `/login/start` | the redirect sign-in; answers where to send the browser |
| `POST` | `/login/webeid/start` · `/login/webeid/complete` | the ID card: a challenge out, the card's signed answer back, unchanged |
| `POST` | `/logout` | ends the session; answers where to go next |
| `GET` | `/config/export` | the whole configuration as one file |
| `POST` | `/config/import?dryRun=true` · `/config/import` | what a file would do, then applying exactly that |

An Apply sends the file's own text with the versions its preview answered added as its last member, so what lands is
exactly what the person read, or nothing.

## Developing

You need Node at the version in [.nvmrc](.nvmrc).

```sh
npm ci
npm run gate      # typecheck, tests, the library build
```

`src/hygiene.test.ts` fails the build on a product's name or vocabulary in the source, and on references a reader of
this repository cannot follow. `src/locales.test.ts` fails it on a word missing from either language.

## Licence

MIT — see [LICENSE](LICENSE).
