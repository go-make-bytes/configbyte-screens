# configbyte-screens

The shared screens of a deployment's **admin app**: the sign-in page, the frame, **Export / Import**, which
carries a workspace's configuration out as one file and back in, **History**, every change a person made to the
workspace's setup across its services, and **People & access**, who is in the workspace and what each person holds,
with its roles and its user types. They are Vue 3 screens that a product's own
single-page application builds into a second app of its own, served at its own address and talking to one backend
only: the configuration coordinator, [configbyte](https://github.com/go-make-bytes/configbyte).

The screens name no product. The host application hands over its name, what its configuration's sections and parts
are called, the lines its Export card lists, and its own admin screens; these screens draw them.

## What a person sees

| State | When | What is shown |
|---|---|---|
| Signed out | the coordinator answers `401` to `GET /me` | the sign-in page: one button per way the deployment offers (`GET /login/ways`), each by its own name, a sentence saying what each does, the language menu, and a link to everyday work when the deployment names its address |
| Waiting for the card | an ID-card way was chosen | that way's button says so, and every way is held until the card answers |
| No card software | the card software or its browser extension is not on this computer | what to install, with a link, above the buttons |
| Came back unfinished | a sign-in returns with `?error=` and a marker | why, in plain words: cancelled, not a member of this workspace (and to ask its administrator for an invitation), took too long, could not be matched, the identity provider failed, or could not be completed |
| Not a member | the card's sign-in completes with `403 err:membership:notMember` | the same sentence as a sign-in that came back not a member |
| Signed in | the person holds a scope the host marks as configuring a section this deployment runs: a setup box, or the administrator's | the frame: the deployment's name, the entries in their groups, the screen opened, and who is signed in with the way's own name |
| Nothing to configure | signed in, and no such scope is held | a plain sentence saying so, a link to everyday work, and signing out |
| Signed out, just now | after *Sign out*, back on the sign-in page | that the person is signed out of this app, and that a company sign-in stays signed in on the computer |
| Sign-out failed | `POST /logout` gets no answer or a refusal | a sentence saying so; the person stays signed in |
| Sign-in ended | signed in, and a read is answered `401` (a screen's, the download, or the host's own, which tells the session) | the sign-in page in place of the whole frame, saying *Your sign-in has ended. Sign in again.*, once, however many reads were out; signing in with the card comes back to the screen that was open |
| Not answering | `GET /me` gets no answer, `502`, `503` or `504`, or any failure other than not being signed in; or nobody is signed in and `GET /login/ways` fails the same way | a sentence saying nothing was changed, and *Try again*, which asks both again. Someone signed in works on without the ways, missing only the way's name beside their own |
| Not open from here | the coordinator answers `403 err:configbyte:networkNotAllowed`, or a sign-in comes back with `?error=network` | in the sign-in page's place: a sentence saying the address answers only inside the networks the organisation set, the language menu, no sign-in, and a link to everyday work when the refusal carries its address (`Link: <…>; rel="related"`) |
| Sign-in not strong enough | a sign-in comes back with `?error=assurance`, or the card's completes with `403 err:session:assuranceTooLow` | in the sign-in page's place: a sentence saying so, every way the deployment offers, and *Back* to the sign-in |

**The language before anyone is signed in** is the one chosen on the page in this browser, kept there; else the
first of the browser's own languages the app carries; else the deployment's (`language` in `GET /login/ways`). Once
someone is signed in, the deployment's language from `GET /me` decides.

**An entry shows when two things are true:** its screen was built into this admin app, and the coordinator found
its section's owner when it started (`GET /sections`). What the frame offers is display only: every call is judged by
the service it reaches.

**The sidebar is grouped.** The shared screens open the first group: Export / Import, History, and People & access
when the membership register's owner answered. A host screen sits in the group it names, or after the shared screens
when it names none; the host's groups follow in the order their first screen arrives. A screen whose subject the
workspace lacks can be shown locked, marked *not included*, and does not open.

## The screens

**History** is one list, newest first, of every change a person made to the workspace's setup, whichever way it was
made: a screen, an import, this app. Each service keeps its own history; the screen reads the membership register's
and each stream the host names, a page at a time, each with its own place, and keeps no copy. Pages are laid side by
side only as far as every stream has been read, since a stream with older lines unread may still hold a line newer
than another stream's oldest; *Show older* reads the next page of each stream that has more. The register's lines,
and the lines every owner writes for an export and an import of its part (with the part's and the file's hash), are
worded by the screens; the host words its own services' lines, and a line nobody words shows its kind. People are
named from the register's list. A filter per stream the host names, one for the register, and a person filter over
what has been read; a service that does not answer is named in a sentence above the list.

**People & access** reads and writes the membership register, in three tabs:

- **Users**: the people by what they hold, the ones who signed in and were given nothing yet, and one person open
  beside the list, with their user type, their roles across the workspace, the Administrator checkbox and taking away
  all access (after a confirm). The day each last signed in. Machines that act in the workspace are listed apart and
  are not changed here; people who lost access show on request.
- **Roles**: one role at a time, its boxes in the groups the host names and the rest under their service's own name,
  each in the words the service declares. Setting the workspace up is never offered: it comes only with the
  Administrator checkbox. A restricted field brings a box of its own, listed by the host; what ticking it hands out is
  said before Save. Save writes the role's whole set: the boxes shown as ticked, and every box the role holds that the
  screen does not show, except a field's box from an earlier restriction, which grants nothing any more (dropped only
  when the restricted fields could be read).
- **User types**: each with what it holds, from the boxes granted across the whole workspace only, and how many hold
  it; and what someone arriving through the corporate login gets.

Every act saves at once and says what it did. A refusal is worded by the act that was made and the status that came
back, never by the register's own text.

## Using it

Pin a tag, and the same `uibyte` tag the screens are built on:

```json
"configbyte-screens": "github:go-make-bytes/configbyte-screens#v0.4.0",
"uibyte": "github:gmb-lib/uibyte#v0.9.0"
```

Move both pins together, then read the result back with `npm ls uibyte`: one copy.

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

**A host's own screens** that make their own calls (rather than through these screens) end the same session when one of
their reads is answered `401`: `useAdminSession().signInEnded()`. It does nothing while nobody is signed in. Only a
read: a change refused that way is said in its own form, where what was typed still is. A `403` and every other failure
stay where they happened.

### What the host hands over

Every text is a **message key in the host's own translator**, so it reads in the person's language.

| Option | Meaning |
|---|---|
| `product` | the product's name, on the sign-in page and wherever the deployment's own name is not yet known |
| `sections` | per section name: its `title`, its `parts` in the host's order with their words, and the scopes that mark a person who may `configure` it |
| `carries` | the Export card's lines, in order, each naming the section it describes; a line shows only when the deployment runs that section |
| `never` | the Export card's last line: what the file never carries |
| `entries` | the host's own admin screens: a label, the route it opens, the section whose owner serves it, and optionally the `group` it sits in, its `icon`, and `locked` for a subject the workspace lacks |
| `register` | the section of the membership register; People & access and its History filter show only when the coordinator found it |
| `roles` | how the Roles screen shows boxes: its `groups` (each a word and the starts of the permission names it gathers), the restricted `fields` the host reads from their owners, and the `guard` sentence for a ticked field's box |
| `history` | History's `filters` and `sources` (a section, the query that keeps its lines, its filter and its service's short word), and `describe`, the sentence for a line of the host's own services |
| `words` | replacements for any of the screens' own words, per language, for the sentences better said in the host's own terms |
| `onApplied` | called after an import that may have changed something (`applied`, `partial`, `rolledBack`), so the host re-reads what it shows |

A section the host does not describe keeps the name it arrived with, and so does a part.

### Words

The screens carry their own words in **English and Latvian**, merged into the host's translator under `configbyte.*`
when the plugin is installed, then the host's `words` over them. The frame switches to the language the deployment
names (`presentation.locale` in `GET /me`) when it carries that language.

### The ID card

Signing in with a card loads the card software's browser library from the host's own origin, at `/web-eid.js`. The
host serves that file; it is never fetched from elsewhere. A browser that cannot load it is told the card software
is not there.

### The sign-in page in another app

The admin app's sign-in page is also the one page for the host's own everyday app, so a deployment has one sign-in
look. `SignInPage` draws and asks; it calls nothing. The host gives its name, the heading and lead, the ways it read
from its own backend, the languages it carries, and what to say, and runs the way a person chooses:

```vue
<SignInPage
  :product="t('app.product')"
  :title="t('app.signIn.title')"
  :lead="t('app.signIn.lead')"
  :ways="ways"
  :languages="[{ code: 'en', name: 'English' }, { code: 'lv', name: 'Latviešu' }]"
  :language="locale"
  :message="message"
  :waiting-for="waitingFor"
  :software-missing="softwareMissing"
  @update:language="choose"
  @start="signIn"
>
  <template #mark="{ size }"><svg :width="size" :height="size">…</svg></template>
</SignInPage>
```

| Prop | Meaning |
|---|---|
| `product`, `tag` | the name beside the mark, and an optional tag after it |
| `title`, `lead`, `link` | the heading, the sentence under it, and an optional `{ label, href }` link at its end |
| `ways` | `{ key, flow: 'card' \| 'redirect', name }` per way, drawn in order, each button carrying `name` exactly |
| `languages`, `language` | the language menu's choices, each in its own name, and the one in use |
| `message` | what to say above the buttons: `cancelled`, `notMember`, `providerError`, `incomplete`, `expired`, `unmatched`, `failed`, `unknown`, `cardFailed`, `signedOut` (with `signed-out-of` naming the app), `ended` |
| `waiting-for`, `software-missing` | the way waited on, and whether the card software is missing |
| `offers`, `explain` | whether a way in is offered at all, and whether the sentence under the buttons says what each does |

What goes with it: `messageOfMarker` turns a `?error=` marker into the message; `languageBeforeSignIn`,
`keepLanguage` and `keptLanguage` settle the language before sign-in as above; `noteSignedOut` and `takeSignedOut`
carry the signed-out sentence across a sign-out that ends at the authority; `wayName` finds a way's name by its key;
`signChallenge`, `isCardSoftwareMissing`, `CardError` and `CARD_SOFTWARE_URL` are the ID card.

## What it calls

Everything goes to the coordinator, same-origin, under `/api/configbyte/v1`, with its session cookie. Every
`POST`, `PUT` and `DELETE` echoes the anti-forgery token from the `configbyte_csrf` cookie in `X-CSRF-Token`.

| Method | Path | For |
|---|---|---|
| `GET` | `/login/ways` | before anyone is signed in: the ways to sign in, the everyday app's address, the deployment's language |
| `GET` | `/me` | who is signed in, the deployment's name and language, the person's scopes per section |
| `GET` | `/sections` | the deployment's sections, in the order an import writes them |
| `POST` | `/login/start` | the redirect sign-in; answers where to send the browser |
| `POST` | `/login/webeid/start` · `/login/webeid/complete` | the ID card: a challenge out, the card's signed answer back, unchanged |
| `POST` | `/logout` | ends the session; answers where to go next |
| `GET` | `/config/export` | the whole configuration as one file |
| `POST` | `/config/import?dryRun=true` · `/config/import` | what a file would do, then applying exactly that |
| any | `/sections/{section}/{path}` | relayed to that section's owner: People & access calls the register's `tenants/{id}/access`, `…/roles`, `…/user-types`, `…/corporate-login-default`, `…/administrators/{user}`, `…/chart/positions`, `users/{user}` and `config`; History calls `history` on the register and on each stream's owner |

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
