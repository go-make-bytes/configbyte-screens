# configbyte-screens

The shared screens of a deployment's **admin app**: the sign-in page, the frame, **Export & import**, which
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
| Signed in | the person holds a scope the host marks as configuring a section this deployment runs: a setup box, or the administrator's | the frame: the deployment's name, the entries in their groups, the screen opened, and at the foot of the menu the language globe above who is signed in, with the way's own name |
| Language not kept | a language picked at the globe, and `PUT /me/language` gets no answer or a refusal | the language last kept back, and a sentence under the globe saying so |
| Nothing to configure | signed in, and no such scope is held | a plain sentence saying so, a link to everyday work, and signing out |
| Signed out, just now | after *Sign out*, back on the sign-in page | that the person is signed out of this app, and that a company sign-in stays signed in on the computer |
| Sign-out failed | `POST /logout` gets no answer or a refusal | a sentence saying so; the person stays signed in |
| Sign-in ended | signed in, and a read is answered `401` (a screen's, the download, or the host's own, which tells the session) | the sign-in page in place of the whole frame, saying *Your sign-in has ended. Sign in again.*, once, however many reads were out; signing in with the card comes back to the screen that was open |
| Not answering | `GET /me` gets no answer, `502`, `503` or `504`, or any failure other than not being signed in; or nobody is signed in and `GET /login/ways` fails the same way | a sentence saying nothing was changed, and *Try again*, which asks both again. Someone signed in works on without the ways, missing only the way's name beside their own |
| Not open from here | the coordinator answers `403 err:configbyte:networkNotAllowed`, or a sign-in comes back with `?error=network` | in the sign-in page's place: a sentence saying the address answers only inside the networks the organisation set, the language menu, no sign-in, and a link to everyday work when the refusal carries its address (`Link: <…>; rel="related"`) |
| Sign-in not strong enough | a sign-in comes back with `?error=assurance`, or the card's completes with `403 err:session:assuranceTooLow` | in the sign-in page's place: a sentence saying so, every way the deployment offers, and *Back* to the sign-in |

**The language before anyone is signed in** is the one chosen on the page in this browser, kept there; else the
first of the browser's own languages the app carries; else the deployment's (`language` in `GET /login/ways`). Once
someone is signed in, the language `GET /me` answers decides: the person's own, else the deployment's.

**The person's own language is chosen at the globe** at the foot of the menu, above their name — and at the foot of
the menu a phone opens. It names the language the page speaks in itself, and lists every language the app carries,
each in its own name, the deployment's marked *everyone here*. Picking one changes the page at once; the coordinator
then keeps the choice **for the person, on the server** (`PUT /me/language`), so it is the same on every computer they
sign in on, and its answer is what the page goes on with. Picking the language everyone here has is sent by its code
like any other, and the coordinator keeps nothing of the person's own for it. A choice that cannot be kept puts back
the language last kept and says so. The globe keeps nothing in the browser: the sign-in page's choice stays the
browser's, so on a shared computer the next person's sign-in page does not open in this person's language. The
document's `lang` follows the page's language throughout, before sign-in and after.

**An entry shows when two things are true:** its screen was built into this admin app, and the coordinator found
its section's owner when it started (`GET /sections`). What the frame offers is display only: every call is judged by
the service it reaches.

**The sidebar is grouped.** The shared screens open the first group: Export & import, History, and People & access
when the membership register's owner answered. A host screen sits in the group it names, or after the shared screens
when it names none; the host's groups follow in the order their first screen arrives. A screen whose subject the
workspace lacks can be shown locked, marked *not included*, and does not open.

## The screens

**Export & import** carries the whole configuration out as one file and back in. The coordinator judges the file —
each owning service its own part, the coordinator the whole — and the screen only draws what they answer, in words.

- **The Export card** lists what the file carries by area: the host's lines under the name of the section they
  describe, in the coordinator's order, for the sections the deployment runs; then, when the host names the membership
  register and the deployment runs it, the register's own group (the list of services and their boxes). Under them,
  what is never in the file and, with the register, what is not in it yet. After a download the card names the areas
  the file carries, in the same order.
- **The file's chip** says its size, when it was exported, and *from this workspace*; a file from another workspace
  says so on the chip's own line, which a narrow screen never cuts off (a file that names no workspace says neither).
  The workspace's id is never shown.
- **The preview** is one group per area, a row for each item the file would add, change, refuse or not take. A row is
  drawn by the name the file gives the item, with its key after it; what the file does to it is said in words (*new in
  the file*, *its name changes*, *taken out of use*), and a refusal in words that say what to do about it. Items found
  by their `key`, else their `number`; a host finds the others with `transfer.find`. The membership register's
  services, role rungs and boxes are named from its own shape. What stays as it is folds into one line that counts
  by part (*14 unchanged: 2 priorities, 5 stages*).
- **An area that refuses** is named with its reason (*refused this file: you do not hold the box that imports it*)
  and told apart from one that did not answer. Either stops the preview, and Apply stays shut.
- **After an Apply that landed**, the first area whose changes landed ends with a link to History at the person who
  applied it (`/history?who=<their key>`).
- **A rolled-back Apply** says what the restore could not take back — an apply never removes, so what the file added
  is still there — lists it by part and name, and, where the host says where each part's items are taken out of use
  (`PartWord.area`, or `transfer.describe`), links to those screens.
- **A file that names the workspace** (its name or its corporate login) is not taken from: the register's area says
  what the file named and what the workspace keeps, and neither is drawn as a row or counted.

**History** is one list, newest first, of every change a person made to the workspace's setup, whichever way it was
made: a screen, an import, this app. Each service keeps its own history; the screen reads the membership register's
and each stream the host names, a page at a time, each with its own place, and keeps no copy. Pages are laid side by
side only as far as every stream has been read, since a stream with older lines unread may still hold a line newer
than another stream's oldest; *Show older* reads the next page of each stream that has more.

- **The address holds what is shown.** `show` is the ticked areas' keys, comma-separated, absent when every area is
  ticked (a `show` naming none of the areas on screen means all of them); `who` is a member's id, a person's key
  (`sub:…`, the way the services name them — what another screen links with), or `operator`, absent for everyone (a
  person the people list does not hold means everyone, and the address is rewritten without it; a key is kept as it
  was given).
  The screen reads both on open and whenever the query changes, and writes them back with `router.replace`, so a
  link, a refresh and *Back* keep them. The register's own area has the key `people`: `/history?show=people`.
  The last ticked area stays ticked, since an address cannot say none.
- **Only a ticked area is read**, and ticking one reads its first page then; unticking keeps what was read. A host
  source may be `locked`: it is never read, and an area whose sources are all locked has no tick.
- **Who** lists everyone, then the workspace's people by name (every status), then whoever runs the deployment.
  Choosing one restarts every ticked stream with `actor=` the person's key (or `operator`), so an old act is found
  however many lines came since. A line is shown only when it begins with the chosen one: the register also answers the
  deployment's acts on a person, which begin with *Whoever runs the deployment* and show under that choice instead.
- **A line begins with** the member's name; an actor that is not a typed key (`sub:…`, `svc:…`) reads as *Whoever runs
  the deployment*; a typed key the list does not hold reads as *Someone not in the list*. A key is never printed.
- **Names, not keys.** What the workspace was given or lost is the host's word (`entitlements`), else its service's name
  in the register's list, else *something this list cannot name*. A service's role says what it lets the holder do —
  the host's word for the group and level (`grants`, keyed `group/level`), the screens' own for the register's levels
  (*see who is in the workspace*, *see the Chart of authority*, …), else its group and level — and the service by name
  (the register by the screens' own *People & access*). A corporate login is named when it is one a person knows
  (Microsoft, Google), with its address under the line. What a position sees says the boxes added and taken away, in
  the host's word for each (`boxes`), else the register's label.
- **A service is named and spoken of as a service.** A member that is a service, and a service a role is given in, take
  the host's word for it where it gives one (`services`, keyed by the member's key `svc:…` or by the service's key),
  else the name the register holds. A service *was connected to this workspace* rather than accepting an invitation,
  and the user type every arrival receives is not drawn for a service.
- **The services' own lines fold.** Two or more lines in a row on one day about a member that is a service are drawn
  as one, *{n} lines about the {m} services this workspace runs on*, opened with *Show them*. A lone one is a line.
  When the operator makes someone an administrator the register writes two lines; one is drawn.
- **The area** each line belongs to closes the line in the word of its tick. A service that does not answer is named
  by its area, once, with the words of the refusal when it gave any, never its code.

The register's lines, and the lines every owner writes for an export and an import of its part (with the part's and
the file's hash), are worded by the screens; the host words its own services' lines, and a line nobody words shows its
kind. A role's or a position's rename line whose name stayed records a change of its names in other languages alone,
and is said that way, never as a rename to the same name. The screen's root is a size container, and the day list
folds the area under the sentence when it is narrow.

**People & access** reads and writes the membership register, in three tabs, each its own address: `/people` (Users),
`/people/roles` and `/people/user-types`, and inside them `/people/users/:id` a person open, `/people/roles/:id` and
`/people/roles/new` a role, `/people/user-types/:id` and `/people/user-types/new` a user type. The tabs carry a count,
and the head says how many people, administrators and services there are, all from the lists already read. A link, a
refresh and *Back* keep what is open; an id the lists do not hold opens the list it belongs to. The route names are
exported (`PEOPLE_ACCESS`, `PEOPLE_USER`, `PEOPLE_ROLES`, `PEOPLE_ROLE`, `PEOPLE_ROLE_NEW`, `PEOPLE_USER_TYPES`,
`PEOPLE_USER_TYPE`, `PEOPLE_USER_TYPE_NEW`); all are children of the one `/people` route, so the sidebar's entry stays
marked on every one of them.

- **Users**: the people by name, with their user type, their roles across the workspace, whether they are an
  administrator and the day each last signed in; machines that act in the workspace are named apart and are not
  changed here. Above the list, a band of the people who hold nothing across the workspace yet (no role, no box on
  their user type, no position in the chart): the first five by name, each opening that person, then *+ n more*, which
  turns on the filter for them. The counts are the filters (*Everyone*, *Administrators*, *Nothing across the
  workspace*, *Has not signed in yet*, *Not signed in for 30 days*), each counting the people it shows, with a filter
  for user type (the one in force) and one for role, a *Show people who lost access* toggle, *Find a person* (matching
  ignores case and the marks over letters), and *People* or *By access*, which gathers the same people under the
  Administrator checkbox, each role and each user type. The list goes 25 to a page. A person opens beside the list, or
  alone with a way back when there is no room: their user type, with what the chart of authority says of it, their
  roles across the workspace, the Administrator checkbox, a link to History at that person, and taking away all access
  (after a question asked in place). Every act saves at once and says what it did.
- **Roles**: a list, each row opening the role's page: what it is for, how many of the boxes it can be given it holds,
  and whether it shipped or was made here. The role's page has its name and what it is for (both are sent), and its
  boxes in the groups the host names and the rest under their service's own name, each in the words the service
  declares; a count of the changes not saved yet; **Save**, **Cancel** and, for a role made here, **Delete**
  (a role that came with the workspace is never deleted: a page opened from a list read without that mark that meets
  the register's refusal reads the roles again and says the role is shipped). Setting
  the workspace up is never offered: it comes only with the Administrator checkbox. A restricted field brings a box of
  its own, listed by the host; what ticking it hands out is said before Save. Save writes the role's whole set: the
  boxes shown as ticked, and every box the role holds that the screen does not show, except a field's box from an
  earlier restriction, which grants nothing any more (dropped only when the restricted fields could be read). The
  host's own settings that name a role (`roles.settings`, below) are listed under the roles.
- **User types**: a list, each row opening the user type's page: what it holds, from the boxes granted across the whole
  workspace only, and its flags: the one new people get, the one the corporate login gives, and the chart's positions
  that give it. Below the list, what someone arriving through the corporate login gets. A user type's page has its
  name, what it is for and what it holds, **Save**, **Cancel** and **Delete** (not on the one new people get). How
  many people hold a user type is never shown: a delete is refused by the register with the reason.

Each list is read once a visit, and an act reads again only the list it changed.

Roles, user types and positions are shown by their names as entered. The names in other languages the register may
keep beside them (`labels`: a language's code and the name in it) are read but not edited here, and a Save leaves
them as they are; a register that keeps none reads the same.

Every act saves at once and says what it did. A refusal is worded by the act that was made and the status that came
back, never by the register's own text. A role's or a user type's name the register refuses as taken (`409`) is
said one of two ways, worked out from the list the screen holds: another is already called that, or another already
reads that way in one of the languages these screens carry words for — then the sentence names that one and the
language. When the list cannot tell, the first.

## Using it

Pin a tag, and the same `uibyte` tag the screens are built on:

```json
"configbyte-screens": "github:go-make-bytes/configbyte-screens#v0.10.0",
"uibyte": "github:gmb-lib/uibyte#v0.18.0"
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

**A host that offers the language elsewhere too** sets it the way the globe does, so both always show the same:
`useAdminSession().setLanguage(code)`, or `null` to clear the person's own.

**A host whose History sentences name members** takes them from the list these screens already hold: `describe`
receives, beside the line, `names.member(subjectKey)` — the member's name, or empty when the workspace's list does not
hold them — so the workspace's people are read once, not once per screen. The list itself is not exported: everything
the package exports reaches every app that imports it, the everyday app included.

### What the host hands over

Every text is a **message key in the host's own translator**, so it reads in the person's language.

| Option | Meaning |
|---|---|
| `product` | the product's name, on the sign-in page and wherever the deployment's own name is not yet known |
| `sections` | per section name: its `title`, its `parts` in the host's order with their words (each may also carry a `count`, a message with `{n}` and plural forms, said when the part's unchanged items are folded, and an `area`, the key of the host's entry where the part's items are taken out of use), and the scopes that mark a person who may `configure` it |
| `carries` | the Export card's lines, in order, each naming the section it describes; a line shows only when the deployment runs that section |
| `never` | the Export card's last line: what the file never carries |
| `entries` | the host's own admin screens: a label, the route it opens, the section whose owner serves it, and optionally the `group` it sits in, its `icon`, and `locked` for a subject the workspace lacks |
| `register` | the section of the membership register; People & access and its History filter show only when the coordinator found it |
| `roles` | how the Roles screen shows boxes: its `groups` (each a word and the starts of the permission names it gathers), the restricted `fields` the host reads from their owners, the `guard` sentence for a ticked field's box, and `settings`, the host's own choices of a role, listed under the roles |
| `history` | History: its `filters` (each an area: a key and the key of its word) and `sources` (a section, the query that keeps its lines, its filter, and optionally `locked`); `describe`, the sentence for a line of the host's own services; `entitlements` and `boxes`, the host's words (message keys) for what a workspace was given, by service or `service/feature`, and for a box a position sees, by permission; and `prepare(areas)`, called with the ticked areas' keys when History opens and when a tick turns on, so the host can read what its sentences name |
| `transfer` | how an import's rows are named and worded: `find`, which finds an item in the file when a report's key is not the item's `key` or `number` (it is handed the part's items as the file has them, so it checks a value's type before using it); `members`, a message for each changed member the screens have no words for (said as *its … changes*); and `describe`, a row in the host's own words (its name, what happens to it, its part, the entry where it is taken out of use), or `null` to keep the screens' own |
| `words` | replacements for any of the screens' own words, per language, for the sentences better said in the host's own terms |
| `onApplied` | called after an import that may have changed something (`applied`, `partial`, `rolledBack`), so the host re-reads what it shows |

A section the host does not describe keeps the name it arrived with, and so does a part.

**A setting that names a role** is `roles.settings`: each lists under the roles as its word and a choice among the
workspace's roles, read when Roles opens (once a visit) and written at once when a role is chosen. `word`, `note`,
`saved` and `holds` are keys in the host's translator; `saved` and `holds` are given `{role}`, the role's name. `read`
answers the id of the role chosen now (empty for none). `write` throws the screens' `ApiError` when the change is
refused, and the refusal is said in words. `holds` is said when deleting a role is refused because a setting holds it.
`refused` is optional: the key of the sentence said when the setting's owner refuses the role chosen (a `400`), given
`{role}`; without it that refusal is said in the screens' own words.

```ts
import { ApiError, type RoleSetting } from 'configbyte-screens'

const creatorRole: RoleSetting = {
  key: 'creatorRole',
  word: 'admin.settings.creatorRole.word',
  note: 'admin.settings.creatorRole.note',
  read: async () => (await readSetting()).roleId,
  write: async (roleId) => {
    const res = await saveSetting({ roleId })
    if (!res.ok) throw new ApiError(res.status, res.code, res.message)
  },
  saved: 'admin.settings.creatorRole.saved', // "Saved: whoever makes one is placed as «{role}»."
  holds: 'admin.settings.creatorRole.holds', // "Whoever makes one is placed as «{role}». Choose another role first."
  refused: 'admin.settings.creatorRole.refused', // optional, a 400 from write: "«{role}» could not be chosen: …"
}

// configbyteScreens(i18n, { …, roles: { groups, settings: [creatorRole] } })
```

### Words

The screens carry their own words in **English and Latvian**, merged into the host's translator under `configbyte.*`
when the plugin is installed, then the host's `words` over them. The frame switches to the language `GET /me` answers
(`presentation.locale`: the person's own, else the deployment's) when it carries that language.

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
| `GET` | `/me` | who is signed in, the deployment's name, the person's scopes per section, and in `presentation` the language to speak (`locale`), the person's own (`personLocale`, `null` when none) and the deployment's (`deploymentLocale`) |
| `PUT` | `/me/language` | keeps the language picked at the globe for the person: `{"language": "lv"}`, answered with the three members above |
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
