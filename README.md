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
| Came back unfinished | a sign-in returns with `?error=` and a marker | why, in plain words: cancelled, not a member of this workspace (and to ask its administrator for an invitation), took too long, could not be matched, the identity provider failed, or could not be completed |
| Signed in | the person holds a scope the host marks as configuring a section this deployment runs: a setup box, or the administrator's | the frame: the deployment's name, the entries in their groups, the screen opened, and at the foot of the menu the language globe above who is signed in, with the way's own name |
| Language not kept | a language picked at the globe, and `PUT /me/language` gets no answer or a refusal | the language last kept back, and a sentence under the globe saying so |
| Nothing to configure | signed in, and no such scope is held | a plain sentence saying so, a link to everyday work, and signing out |
| Signed out, just now | after *Sign out*, back on the sign-in page | that the person is signed out of this app, and that a company sign-in stays signed in on the computer |
| Sign-out failed | `POST /logout` gets no answer or a refusal | a sentence saying so; the person stays signed in |
| Sign-in ended | signed in, and a read is answered `401` (a screen's, the download, or the host's own, which tells the session) | the sign-in page in place of the whole frame, saying *Your sign-in has ended. Sign in again.*, once, however many reads were out |
| Not answering | `GET /me` gets no answer, `502`, `503` or `504`, or any failure other than not being signed in; or nobody is signed in and `GET /login/ways` fails the same way | a sentence saying nothing was changed, and *Try again*, which asks both again. Someone signed in works on without the ways, missing only the way's name beside their own |
| Not open from here | the coordinator answers `403 err:configbyte:networkNotAllowed`, or a sign-in comes back with `?error=network` | in the sign-in page's place: a sentence saying the address answers only inside the networks the organisation set, the language menu, no sign-in, and a link to everyday work when the refusal carries its address (`Link: <…>; rel="related"`) |
| Sign-in not strong enough | a sign-in comes back with `?error=assurance` | in the sign-in page's place: a sentence saying so, every way the deployment offers, and *Back* to the sign-in |

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

**The deployment's own group comes last, and is shown by the sign-in answer alone.** `GET /me` carries `deployment`
(`mode`, `admin`, `firstRunOwed`, `signInAge`) and `signedInAt`. The group *Deployment*, with *Companies* and
*Deployment admins*, is shown exactly when `admin` is true and `mode` is `saas`; it never depends on what else the
person configures. A person shown the group who configures nothing else sees only the group, and the app's first
address opens *Companies*; *Nothing here for you to configure* is said only to a person who configures nothing and is
not shown the group. A `deployment` that is `null` (the role register could not be read) draws no group and says
nothing about it. Every address of the area is judged by the coordinator, so a person who types one without the right
reads the refusal as a line, never data.

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
- **How people sign in, and notes.** Under each name the list says what names the person: their email, or *personal
  code · LV* and the code masked (one bullet for each character it has, never more than sixteen), or *no sign-in
  behind them*; the first words of the note follow, cut with an ellipsis. When the register could not read how people
  sign in, the list says so once above it and draws no way. An open person starts with the same: their email, or
  their personal code with its country, masked, and **Show personal code**, which asks the register for it and shows
  it until **Hide**, until another person opens or the panel closes; the screen keeps it nowhere else, and says that
  the access audit service records each showing. A code the register will not show, because the showing could not be
  recorded or because there is none, is not shown, and the reason is said in words; a person invited and not yet
  signed in has the code masked and no **Show personal code**. Names, emails and notes are each drawn isolated,
  deciding their own direction. Under it, a **Note** an
  administrator writes about the person (up to 1,000 characters, line breaks kept), saved with **Save note**.
  **Invite a person**, at the top right of Users, takes a name and a personal code with the country that issued it
  (Latvia, Estonia or Lithuania), the code in the kit's identity-code field; the person's row then reads *invited,
  not signed in yet* until their first card sign-in.
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

- **Assistants** (only when the host sets `assistants`): `/people/assistants`, and `/people/assistants/:id` one open
  beside the list or alone when there is no room. An assistant is one person's own, through which that person's AI app
  works in the workspace for them, as that person and never beyond its own roles. Each row says its name and the day it
  was added, its person, its roles across the workspace, how many AI apps are connected as it (*no app yet*) and when one
  was last used; the removed ones stay behind **Show removed assistants**, dated, so old history keeps a name. With
  none, the empty list holds the one **Add an assistant**; otherwise the head does. Adding asks for a name (1 to 100
  characters on one line, unique among the workspace's assistants) and **For**, one of the workspace's active people;
  the person is chosen then and never changed. The page renames it, shows its person, gives and takes its roles as a
  person's are, lists the apps connected as it (*connected …*, *last used …* or *not used yet*), each with **Sign out**,
  and **Remove**; both are asked first, in place. Remove signs every app connected as it out at the sign-in authority
  first, so they stop at once, then the register removes it; when the authority cannot, it is still removed and the
  words say its apps stop at their next sign-in check. The register reads the list whole (`assistants?whole=true`);
  the apps are the coordinator's `/assistants/{assistant}/connections`. The route names are exported
  (`PEOPLE_ASSISTANTS`, `PEOPLE_ASSISTANT`). History says the assistants' own setup lines: an assistant added for its
  person, renamed, removed, and the role made with the first one; its roles are said as every member's.

Each list is read once a visit, and an act reads again only the list it changed.

**The deployment's own area** is for the people who manage a deployment that serves many companies.

- **Companies** reads the companies and the products once each, together, when it opens. A row is one link to the
  company: its name (marked *runs this deployment* on the company that does), the products it has by their names, how
  many administrators it has, and the day it was opened, in the service's order. *Find a company* (shown when there is
  more than one) and pages of 25 work in the browser. A company with a product the products' read does not hold makes
  the products be read once more, and a key is never drawn. With only the deployment's own company the page says there
  is no customer company yet, and how to open one. A read that fails says so, with *Try again*, never *no companies*.
- **A company** is a page of its own. Its products are boxes that save at once; a product that needs another cannot be
  ticked before it, a ticked product another ticked one needs cannot be unticked, and one whose services have not
  started cannot be ticked, each saying why beside it; taking one is asked first, in place. Its administrators are
  counted with the company, and their names are read only when someone presses *Show the administrators*, because
  showing them is recorded; they are forgotten when the page is left. An administrator is invited with a name and a
  personal code (checked as People & access checks them; the code lives only in its form and the one request) and
  removed after a question asked in place; the last one cannot be removed, and the button says why. After an
  invitation or a removal the names close again and the company is read again for its count: they are shown only by the
  press, every time. While nobody of
  the company has signed in, one of the starting configurations the deployment keeps can be applied, and what became
  of it is a band with a line for each part, read from the answer's own outcome — a refused file arrives in an answer
  that is itself a success. Once somebody has signed in the page says the configuration is theirs now.
- **Open a company** is a page of its own: a name (1 to 200 characters after trimming, sent trimmed), the language its
  starting roles are named in (the person's own to begin with), the products (the same guard as on a company's page,
  worked out in the browser), *Starts from* (*Empty*, or one of the files the deployment keeps; with none prepared it
  says where they come from) and the first administrator by name and personal code. The button is off, and says what it
  waits for, until a name, a person and a code are given, and then reads *Open «name»*. What was typed lives only in
  the form and the one request: not in a store, not in storage, not in an address. A refused opening keeps the form:
  a name taken is said under *Name*, an unknown or unreadable file and services still starting are bands saying nothing
  was opened, anything else is one line. An opening is the company's page with a band that says what became of its
  file, a line per part.
- **Deployment admins** is one recorded read, said on the page. A person of the deployment's own company is added by
  personal code and country alone; removing one is asked first, in place, with one question naming the person on the
  row (no row is marked as the person looking: a name says nothing of who is who). After any removal who is signed in
  is read again: a person who no longer manages the deployment is moved off the area and the group leaves the menu;
  otherwise the list is read again. The last admin who has signed in keeps the button, off, with the reason.
- **The first run** is shown in place of everything, before the menu, in both kinds of deployment, to the person the
  deployment names (`deployment.firstRunOwed`): the company's name and language, `POST /deployment/first-run`. Services
  still starting keep the form and offer *Try again*; a company already set up is taken as done; when it is done who is
  signed in is read again, and a deployment for many companies opens on *Companies*, one for one company opens as for
  any administrator, each with a line that the company is set up. A sign-in too old for it (the person manages nothing
  yet, so the area's rule for such a person does not apply) is always the line that asks to sign in again in a new tab,
  with what was typed kept; once the same person has signed in again, by the server's answer, the button can be pressed
  again. Any other refusal of the person keeps the form with a line that only the person the deployment names can set it up.
- **A form is never sent as another person.** The sign-in is shared by every tab of a browser, so when a page of the
  area opens it pins the person it was opened for (the subject of the sign-in answer). Before every act, and before
  every read of people (showing a company's administrators, opening the deployment admins), the page reads the sign-in
  answer again from the server and compares: a different person, or nobody, sends nothing, drops everything the area
  and the form hold, and loads the app again. Every tab with an area page open reads it again, and compares, when the
  window is looked at again and when another tab says it signed in. A page left while the answer was out sends nothing.
  That read always asks the network (`cache: 'no-store'`). No list of people in the area is read again without that
  comparison having just been made, so after an addition or a removal of a deployment admin the list is read again only
  for the same person; if after a removal the person no longer manages the deployment the page says the area's refusal
  or the frame leaves it, never *loading* for good. When the answer for the same person comes back with its deployment
  part missing (the register could not be read just then), the held part is kept and nothing is left or lost; a
  different person, or nobody, still drops everything. The forms that open a company and add a deployment admin are
  components of their own that the page takes away when the area refuses the person as a whole.
- **Signing in again, in two moments.** Entering the area, when the browser's clock says the sign-in is older than
  `deployment.signInAge` seconds (or its time is not known), shows a page that says so and asks nothing of the area. The
  clock is only a first guess: it is never made twice in a row (a person who has just come back from a sign-in that
  asked for a recent one is not judged again, so a clock that runs ahead cannot loop), never again for a sign-in time
  once the server has accepted a call of the area for it, never for a person who is not shown the area (the area's own
  call is made and its refusal drawn: the coordinator checks the age before the right, so such a person is told the
  sign-in is too old by every address, and that is drawn as *you do not manage this deployment*, not as a sign-in to
  renew), and the server's answer decides; its button starts a sign-in that is
  recent (`POST /login/start` with `recent: true`, the way the person used; the ways are offered when that way is not
  among them), keeps the address being opened in this tab's session storage, and opens it when the sign-in comes back
  if it is one of the app's own routes (anything else kept is dropped and *Companies* opens). In the middle of an act, a
  `403 err:session:signInTooOld` puts a line over the page, which stays as it is, with *Sign in again, in a new tab*.
  The new tab is the app at `/deployment/sign-in-again`: it marks itself as a sign-in tab, starts the same recent
  sign-in at once, and when it comes back says *you are signed in again, close this tab* and nothing else, telling the
  other tabs of the browser. The first tab reads who is signed in again when it is looked at again or told by the other
  tab, and trusts only the answer it reads itself: the same person with a sign-in time later than the one the page held
  when the line appeared says so and lets the act be pressed again (the browser's clock decides nothing here); a
  different person drops everything the page holds and loads the app again. A sign-in that fails or is cancelled in the
  new tab shows the sign-in page's own words there, and the first tab keeps its line. The new tab takes its mark off
  once it has said it is signed in again. An address the sign-in start answers is followed only if it begins with
  `https://` or `http://`; anything else is told as a sign-in that did not start.
- **What a tab keeps.** Its session storage holds the address to return to and the mark that the tab is a sign-in tab,
  and nothing else. No name, personal code, company, product or answer of the area is written to any storage, log line
  or address.
- **Refusals.** A sign-in that is not the strongest (`err:session:assuranceTooLow`) leads to the closing page the app
  already has; any other `403` drops the page, says the person is no longer a deployment admin and reads who is signed
  in again. No sentence of a service is drawn as it came: a part of a starting file that its owner refused is said in
  these screens' own words, never the owner's title or detail. When the area refuses the person as a whole, the form
  that opens a company is taken away, so nothing typed in it stays in memory. A company's answer that does not say whether somebody of it has
  signed in (`entered`) is read as *somebody has*: only an explicit `false` offers a starting configuration.

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
"configbyte-screens": "github:go-make-bytes/configbyte-screens#v0.15.2",
"uibyte": "github:gmb-lib/uibyte#v0.19.0"
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
| `assistants` | `true` when the deployment has assistants (each one person's own, through which they connect an AI app): People & access then has an *Assistants* tab; absent or `false`, none |
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

### The deployment's own area in the host

The routes of `adminRoutes()` include the area's, so the host's router carries them. A host that serves its admin
pages from a list of addresses (a server that answers only the pages it knows) adds these: `/deployment/companies`,
`/deployment/companies/new`, `/deployment/companies/{id}`, `/deployment/admins` and the sign-in tab's own address,
`/deployment/sign-in-again`. Their route names are exported: `DEPLOYMENT_COMPANIES`, `DEPLOYMENT_COMPANY_NEW`,
`DEPLOYMENT_COMPANY`, `DEPLOYMENT_ADMINS`, `DEPLOYMENT_SIGN_IN_TAB`. The sign-in tab is opened from the app itself, so
a host that serves its admin pages from a list must carry that address too, or the new tab finds nothing. The first
run needs no address: it is drawn in place of everything wherever the app is. The area names no product: the products'
names arrive in the answers. It needs no option.

### Workspaces

A person can be in several workspaces and is signed in to one at a time, in every tab of the browser. A host that
moves to this release gets, with no option to set:

- **The line under the brand**, in the menu beside the page and in the one a phone opens: the name of the workspace
  the person is in. For a person in one it is plain words with nothing to press; for a person in several it is a
  button that lists them, the current one marked, and choosing another starts a sign-in for it (`POST /login/start`
  with `workspace`, and the way the person signed in with as `method`) and sends the browser to the address answered.
  The deployment's name stays the brand.
- **The page to choose**, drawn in place of everything after the sign-in pages, before the first run, for a person who
  is signed in, in at least one workspace, and in none right now (`tenant` is empty and `workspaces` lists some).
- **A notice on a page left behind.** Every call a page makes names the workspace the page was opened for in the
  `Workspace-Id` header. When the coordinator refuses a call for naming another workspace than the session's (`409`
  `err:session:otherWorkspace`), the frame reads the sign-in answer once more: if the person now works in another
  workspace, a notice that cannot be closed names both and offers *Reload*; if in none, the page loads again at once.
  The refused call still fails for whoever made it. The workspace the page was opened for is kept in memory only, for the life of the page.
- **Two lines over the page**, each said once and then reported to the coordinator (`DELETE /me/workspace-notice`): the
  person's access to a workspace has ended (`workspaceEnded`), and a workspace they chose is gone (`workspaceGone`).
  With one workspace left and none current, the sign-in for it starts by itself, once per page load.
- **People & access** words the refusal of ending the access of the deployment's last administrator (`409`
  `err:membership:last_deployment_admin`) in a sentence of its own.

`ChooseWorkspace` is exported so a host can show the same page in its own sign-in look. It knows no store and makes no
call; the host passes the rows and every word, and runs what is chosen:

```vue
<ChooseWorkspace
  :rows="[{ key: 'w-1', label: 'First company' }, { key: 'w-2', label: 'Second company' }]"
  :busy="startedFor"
  :product="t('app.product')"
  :title="t('app.choose.title')"
  :lead="t('app.choose.lead')"
  :list-label="t('app.choose.list')"
  :sign-out-label="t('app.signOut')"
  :line="{ outcome: 'done', text: t('app.choose.ended') }"
  @choose="(key) => startSignIn(key)"
  @sign-out="signOut"
>
  <template #mark="{ size }"><svg :width="size" :height="size">…</svg></template>
</ChooseWorkspace>
```

A host's own calls name the workspace through the module `workspaceHeaders()`, which answers `{ 'Workspace-Id': id }`,
or `{}` while the page was opened for none; `isOtherWorkspace(error)` recognises the refusal above and
`whenWorkspaceMoves(listener)` adds a listener that is told when a call was refused that way, and answers a function
that removes it. `workspaceOpenedFor()` answers the workspace's id and name. `openedFor(id, name?)` sets it, once per
page load (a second call changes nothing, an empty id sets nothing); the session store that reads the first sign-in
answer naming a workspace calls it, as this package's own store does, so a host with a store of its own calls it there.
`forgetOpenedWorkspace()` clears it, for a host's own tests. A host that makes its own calls adds
`workspaceHeaders()` to them and, on a refusal that `isOtherWorkspace` recognises (it accepts any value with
`status` 409 and that `code`, so the host's own error type does), calls `workspaceMoved()`: every listener is told,
the frame's among them, and the frame holds the page as above. A host may add its own listener without taking the
frame's.

```ts
import { isOtherWorkspace, workspaceHeaders, workspaceMoved } from 'configbyte-screens'

const resp = await fetch('/api/configbyte/v1/sections/orders/things', { credentials: 'same-origin', headers: workspaceHeaders() })
if (!resp.ok && isOtherWorkspace({ status: resp.status, code: (await resp.json()).code })) workspaceMoved()
```

The words are the keys `configbyte.workspace.choose.title`, `.choose.lead`, `.choose.list`, `.tab`, `.reload`,
`.gone`, `.ended` and `.endedChoose`, and `configbyte.people.refused.lastDeploymentAdmin`, in English and Latvian; a
host's own words for them are handed in like any other.

**What the coordinator must answer for them** (the configuration coordinator's release that lists a person's
workspaces): `GET /me` carries `workspaces` (`{ id, name }` for each workspace the person is in; left out for a person
in one), `workspaceEnded` and `workspaceGone` (a workspace's name each; left out when there is none), and `tenant` is
the empty string while the session is in none; `POST /login/start` takes an optional `workspace`; a call naming
another workspace than the session's in `Workspace-Id` is refused `409` `err:session:otherWorkspace`, and one without
the header is served; `DELETE /me/workspace-notice` clears both names (`204`); and ending a person's access can be
refused `409` `err:membership:last_deployment_admin`.

### Words

The screens carry their own words in **English and Latvian**, merged into the host's translator under `configbyte.*`
when the plugin is installed, then the host's `words` over them. The frame switches to the language `GET /me` answers
(`presentation.locale`: the person's own, else the deployment's) when it carries that language.

### The ID card

Every way is started the same way: `POST /login/start` naming it, and the browser sent to the authority. The
authority reads the card on its own sign-in page, with the card software there, and says there when the card or its
software is not answering. These screens never read the card, and the host serves no card library for them.

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
| `ways` | `{ key, flow: 'card' \| 'redirect', name }` per way, drawn in order, each button carrying `name` exactly; `flow` says what kind of way it is (the person's ID card, or an authority's own sign-in page), which picks the sentence saying what choosing it does |
| `languages`, `language` | the language menu's choices, each in its own name, and the one in use |
| `message` | what to say above the buttons: `cancelled`, `notMember`, `providerError`, `incomplete`, `expired`, `unmatched`, `failed`, `unknown`, `signedOut` (with `signed-out-of` naming the app), `ended` |
| `offers`, `explain` | whether a way in is offered at all, and whether the sentence under the buttons says what each does |

What goes with it: `messageOfMarker` turns a `?error=` marker into the message; `languageBeforeSignIn`,
`keepLanguage` and `keptLanguage` settle the language before sign-in as above; `noteSignedOut` and `takeSignedOut`
carry the signed-out sentence across a sign-out that ends at the authority; `wayName` finds a way's name by its key.

## What it calls

Everything goes to the coordinator, same-origin, under `/api/configbyte/v1`, with its session cookie. Every
`POST`, `PUT` and `DELETE` echoes the anti-forgery token from the coordinator's `__Host-configbyte_csrf` cookie in
`X-CSRF-Token`; on an https page only that name is read, so a copy another host planted under the plain name is
never echoed. A page over plain http falls back to `configbyte_csrf` (a development coordinator). Needs configbyte
with the `__Host-` cookies.

| Method | Path | For |
|---|---|---|
| `GET` | `/login/ways` | before anyone is signed in: the ways to sign in, the everyday app's address, the deployment's language |
| `GET` | `/me` | who is signed in, the workspace they are in and the ones they could be in, the deployment's name, the person's scopes per section, and in `presentation` the language to speak (`locale`), the person's own (`personLocale`, `null` when none) and the deployment's (`deploymentLocale`) |
| `PUT` | `/me/language` | keeps the language picked at the globe for the person: `{"language": "lv"}`, answered with the three members above |
| `GET` | `/sections` | the deployment's sections, in the order an import writes them |
| `POST` | `/login/start` | a sign-in by any way, the card too, `{"method": "<the way's key>"}`, and for another workspace `{"workspace": "<its id>"}`; answers where to send the browser |
| `DELETE` | `/me/workspace-notice` | tells the coordinator the line about a workspace that ended or is gone was shown |
| `POST` | `/logout` | ends the session; answers where to go next |
| `GET` | `/config/export` | the whole configuration as one file |
| `POST` | `/config/import?dryRun=true` · `/config/import` | what a file would do, then applying exactly that |
| any | `/sections/{section}/{path}` | relayed to that section's owner: People & access calls the register's `tenants/{id}/access`, `…/roles`, `…/user-types`, `…/corporate-login-default`, `…/administrators/{user}`, `…/chart/positions`, `…/assistants?whole=true`, `…/assistants`, `…/assistants/{user}/name`, `users/{user}`, `…/users/{user}/note`, `…/users/{user}/identity-code`, `…/people` and `config`; History calls `history` on the register and on each stream's owner |
| `GET` · `DELETE` | `/assistants/{assistant}/connections` · `DELETE …/connections/{id}` | with `assistants`: the AI apps connected as one assistant, all of them signed out (before its removal), or one |

The deployment's own area calls the coordinator's own routes below `/deployment` (never the relay): `GET`
`/companies` · `/companies/{id}` · `/companies/{id}/administrators` · `/products` · `/configurations` · `/admins`, `POST`
`/companies` · `/companies/{id}/administrators` · `/companies/{id}/configuration` · `/admins` · `/first-run`, `PUT` and
`DELETE` `/companies/{id}/products/{key}`, and `DELETE` `/companies/{id}/administrators/{user}` · `/admins/{user}`.
`POST /login/start` also takes `recent: true`, and `GET /me` carries `signedInAt` and `deployment`. Needs a role
register whose company rows say whether somebody of the company has signed in (`entered`) and which answers a name
taken as `409 err:membership:name_taken` and services not yet declared as `409 err:membership:not_declared`.

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
