# Changelog

All notable changes to this package are recorded here. It follows [Keep a Changelog](https://keepachangelog.com/),
and the package is consumed as a pinned git tag.

## v0.11.1

Built on `uibyte` `v0.18.0`, unchanged.

### Changed

- When a deployment cannot take an invitation just now, People & access says *"This deployment cannot add people just
  now, so nobody was invited."*, where it said *register*.

## v0.11.0

People & access says how each person signs in, keeps a note about each person, and can invite a person.

Built on `uibyte` `v0.18.0`, unchanged. It needs the membership register to answer what is listed below under
*What the register must answer*; against a register that does not yet, the screens still work, and simply have
nothing to say about how people sign in.

### Added

- **How each person signs in, under their name.** The Users list says what names the person: their email, or
  *personal code · LV* and the code masked (one bullet for each character it has, never more than sixteen), or *no
  sign-in behind them*. When the register could not read it, the list says so once above it and shows none.
- **Showing a personal code.** An open person starts with the same, and an active person who signs in with a card
  has **Show personal code**: pressed, the code is shown with its country until **Hide**, until another person opens or
  the panel closes. It is never kept anywhere but the open panel. The panel says, always, that showing it is recorded
  by the access audit service; a code the register would not show (it could not record the showing, or there is
  none) is not shown, and the reason is said in words. A person invited and not yet signed in has their code drawn
  masked with no way to show it: an invitation is anyone's to send, so their code is shown to nobody.
- **A note about each person.** Written by an administrator under the person's sign-in, up to 1,000 characters with
  line breaks kept, saved with **Save note** (not offered while it is unchanged). The first words follow the name on
  the list. A revoked person has no note: it went with their access, and none is offered to write.
- **Invite a person**, at the top right of Users: a name and a personal code with its country (Latvia first, then
  Estonia and Lithuania), the code in the kit's identity-code field. A name or a code left out is said before
  anything is sent, and so is a code that cannot be used. The invited person's row reads *invited, not signed in yet*.
- **History** says *changed the note on …* and *cleared the note on …*, in both languages.
- Words for all of it in English and Latvian.
- **A person's own words stay apart from the text around them.** A name, an email and a note are each drawn
  isolated, deciding their own direction, so a character that turns text right to left inside one cannot carry the
  words beside it along.

### Changed

- A person invited and not yet signed in reads *invited, not signed in yet* where it read *has not signed in yet*, in
  the list and on the person. The filter that counts them keeps its name.

### What the register must answer

- `GET tenants/{id}/access` answers `{"members": […], "signInRead": true}`. Each member carries `"note"` (text, empty
  when none), and each person `"signIn"`: `{"signsIn": true, "email": "…"}`, or `{"signsIn": true, "country": "LV",
  "length": 11}` for a personal code, or `{"signsIn": false}`; for a person invited and not yet signed in, only
  `{"country": "LV", "length": 11}`, or `{}`. When `signInRead` is `false`, no member carries `signIn`. An answer without `signInRead` is read as `true`.
- `PUT tenants/{id}/users/{user}/note` with `{"note": "…"}`: `200` when saved; `422` when refused; `404` when the
  person is not there.
- `POST tenants/{id}/people` with `{"displayName": "…", "identityCode": "…", "country": "LV"}`: `201` when invited;
  `422` when refused; `409` when the person is already in the workspace; `503` when the deployment cannot register
  people.
- `POST tenants/{id}/users/{user}/identity-code`, answering `{"code": "…", "country": "LV"}`: `404` when there is
  none; `409` for a person not active here; `503` when the showing could not be recorded, in which case nothing is
  shown.
- The register's history may carry `noteChanged` lines with `{"cleared": true|false}`, written under the
  administrator, about the person.

## v0.10.0

History speaks of a workspace's services as services, in the reader's language.

Built on `uibyte` `v0.18.0`, so People & access's tabs take the kit's new look (one underline under the chosen tab, a
strip that scrolls within itself instead of wrapping): move the `uibyte` pin together with this one, then
`npm ls uibyte` reads one copy.

### Added

- **`history.services`** — the host's word for a service, by the key it is a member under (`svc:orders`) or by the
  service key a role names (`orders`). History names the service by it — in its lines, where a run of its lines folds,
  and in the service a role is given in — and by the name the register holds where the host gives none.
- **`history.grants`** — the host's word for what a level of a service's ladder lets its holder do, keyed `group/level`
  (`stock/clerk`). The register's own levels are named by the screens in both languages (*see who is in the
  workspace*, *see the Chart of authority*, *see the workspace's roles*, *report where it uses the roles*, *administer
  the workspace*).

### Changed

- A line giving or taking a service's role says what the level lets it do — *gave Order service «see the Chart of
  authority» in People & access* — and its group and level only where nothing names them.
- A service **was connected to this workspace** where a person *accepted the invitation*.
- The *was given the user type «…», as everyone new is* line is no longer drawn for a service; a person's stays.

## v0.9.0

Export & import says what a file carries, area by area, and what an import would do to each item, in words.

### Added

- **The Export card is by area.** The host's lines sit under the name of the section they describe, in the
  coordinator's order, only for the sections the deployment runs. With `register` set and the register run, the
  register has a group of its own (*the list of services and their boxes this deployment runs on*), and under the
  groups a line says what is not in the file today. After a download the card names the areas the file carries.
- **The file chip says where the file came from**: *from this workspace* among the facts under its name, or *from another
  workspace* on the chip's own line, which a narrow screen never cuts off (*edited since export* then joins the facts);
  nothing when the file names no workspace. The raw workspace id is no longer shown.
- **Items by their names from the file, and changes in words.** A preview row is drawn by the name the file gives the
  item (its `labels` in the language the screen speaks, else `label`, `name`, `displayName`), with its key after it.
  What happens is said in words: *new in the file*, *its name changes*, *taken out of use*, *restored*; a refusal says
  what to do about it. A skipped item is *not taken*, and the tally counts it when there is one. The membership
  register's services, role rungs and boxes are named from its own shape.
- **Host option `transfer`**, for what the screens cannot know, and `PartWord.count` and `PartWord.area`:

  ```ts
  sections: {
    orders: {
      parts: [{ key: 'priorities', word: 'admin.parts.priorities', count: 'admin.counts.priorities', area: 'workflow' }],
    },
  },
  transfer: {
    // a report key that is not the item's `key` or `number`, such as `order/1`; `list` holds the part's items
    // as the file has them, so check a value's type before using it
    find: (section, part, key, list) =>
      list.find((i) => typeof i.entityKind === 'string' && typeof i.number === 'number' && `${i.entityKind}/${i.number}` === key),
    // a changed member the screens have no words for, said as "its … changes"
    members: { noticeDays: 'admin.members.noticeDays' },
    // a row in the host's own words; null keeps the screens' own
    describe: (row) => (row.part === 'links' ? { name: 'A link', change: 'a new link', area: 'workflow' } : null),
  }
  ```

  `count` is a message with `{n}` and plural forms, said when a part's unchanged items fold (*14 unchanged: 2
  priorities, 5 stages*); `area` is the key of the host's entry where the part's items are taken out of use.
  Exported: `TransferOptions`, `TransferRow`, `TransferWords`.
- **An area that refuses is named with its reason**: *{area} refused this file: you do not hold the box that imports
  it*, or its part is out of shape, or the owner's own title; told apart from an area that did not answer, which is
  named too. The stop line under the preview names the areas either way.
- **After an Apply that landed**, the first area whose changes landed ends with *See them in History →*, which opens
  History at the person who applied it.
- **A rolled-back Apply says what stayed.** A restore never removes, so what the file added is still there: it is
  listed by part and name, and when the host names where each part is taken out of use, those screens are linked. A
  part whose service could not write says whether it did not answer or refused, and why.
- **A file that names the workspace** (its name or its corporate login) is said in one sentence in the register's area,
  with what the workspace keeps. Neither is a row or counted.
- **History's `who` also takes a person's key** (`/history?who=sub:…`): the person is the member whose id or key it
  is. The address is kept as it was given.
- **A role that came with the workspace is said to be shipped** when its delete is refused and the roles, read again,
  carry that mark: *came with the workspace and is never deleted. Rename it, or change what it holds.*
- `Identity.workspace`: the workspace's own name and what it was given, `null` when it could not be read.

### Changed

- The screen is called *Export & import* (*Eksports un imports*).
- The words say *file* where they said *document* and *part* where they said *section*, and the fold says what it holds
  by part (*{n} unchanged: {parts}*). New words are in English and Latvian.
- A section whose service refused the file at preview is badged *refused* and one that did not answer *failed*; after
  an Apply a section that did not write is *could not write*.
- After a download the card names the areas the file carries, where it said how many sections it had.
- **The Apply's outcome is drawn first under the file**, above the rows of the preview; the ways on stay last.
- A group's count says its changes apart from what it refused and what it does not take (*4 changes · 1 refused*),
  and *no changes* when nothing changes. The column of items is headed *item*.
- Names that arrive in an answer or in the chosen file — a section nobody owns is reported under the name the file gave
  it — are looked up as names only: a section called `constructor` or `__proto__` is drawn by that name and finds
  nothing it does not hold. A value of the file that is not a word or a number names nothing, and never stops the
  screen; each part of a file is indexed once, so a long file is named in one pass.

### Removed

- The words `export.sections`, `file.workspace`, `summary.unchanged` and `line.failed`.

## v0.8.0

History opens from its address, asks each service for one person's lines, and says names where it printed keys.
People & access has an address for each tab and for each person, role and user type, filters its list of people, and
opens a role and a user type on a page of their own.

Built on `uibyte` `v0.17.0` (People & access draws its user types and roles with the kit's `Chip`): move the
`uibyte` pin together with this one, then `npm ls uibyte` reads one copy.

### Added

- **The address holds History's filters.** `/history?show=people,configuration&who=<member id>`: `show` the ticked
  areas' keys (absent when every area is ticked; one naming none of the areas on screen means all of them), `who` a
  member's id or `operator`. History reads them on open and when the query changes, and writes ticks and *Who* back
  with `router.replace`. `vue-router` is already a peer; the screen now reads the route.
- **Only a ticked area is read**, when it is ticked. A history source may say `locked: () => boolean`: it is never
  read, and an area whose sources are all locked has no tick.
- **Who** lists the workspace's people from the people list, plus *Whoever runs the deployment*, and restarts every
  ticked stream with `actor=` the person's key (or `operator`). A line shows only when it begins with the one chosen.
- **Names where keys were.** An actor that is not a typed key reads as *Whoever runs the deployment*, a typed key the
  list does not hold as *Someone not in the list*; a service's role, a corporate login (named when it is Microsoft or
  Google, its address under the line) and what a position sees (the boxes added and taken away) are said in words.
- **The services' own lines fold** into one line per run, and the operator making someone an administrator is one line.
- **Host options** `history.entitlements`, `history.boxes` (message keys, by service or `service/feature`, and by
  permission) and `history.prepare(areas)`, called with the ticked areas' keys on open and when a tick turns on:

  ```ts
  history: {
    filters, sources, describe,
    entitlements: { orders: 'admin.history.entitled.orders' },
    boxes: { 'orders/order:edit': 'admin.history.boxes.edit' },
    prepare: (areas) => areas.includes('orders') ? readOrderNames() : undefined,
  }
  ```
- `describe` receives a second argument, `names.member(subjectKey)`: a member's name from the list the screens already
  hold (empty when it does not hold them), so a host's sentence names a member without reading the list again.
- **People & access has an address for everything open.** `/people` Users · `/people/users/:id` a person ·
  `/people/roles` · `/people/roles/new` · `/people/roles/:id` · `/people/user-types` · `/people/user-types/new` ·
  `/people/user-types/:id`, all children of the one `/people` route, so the sidebar's entry is marked on each. The
  route names are exported (`PEOPLE_ACCESS`, `PEOPLE_USER`, `PEOPLE_ROLES`, `PEOPLE_ROLE`, `PEOPLE_ROLE_NEW`,
  `PEOPLE_USER_TYPES`, `PEOPLE_USER_TYPE`, `PEOPLE_USER_TYPE_NEW`). An id the lists do not hold opens its list.
- **The head** says *{n} people · {a} administrators · {s} services*, and each tab carries its count.
- **Users.** The band of people who hold nothing across the workspace yet (the first five by name, then *+ n more*);
  counts that are the filters (*Everyone*, *Administrators*, *Nothing across the workspace*, *Has not signed in yet*,
  *Not signed in for 30 days*); filters for user type and role; *Show people who lost access*; *Find a person*, which
  ignores case and the marks over letters; 25 a page. A person opens beside the list, or alone with a way back, from
  their own address, with the chart's note on their user type and a link to History at that person
  (`/history?who=<member id>`). The user type the chart gives is drawn with a dashed border and says so.
- **Roles are a list and a page each.** The list says what each role is for, how many of the boxes it can be given it
  holds, and whether it shipped. A role's page has *What it is for*, which is now read and sent with the name
  (`{ name, description }`, on making a role and on changing one), and counts the changes not saved yet.
- **User types are a list and a page each**, with the chart's positions that give one shown as a flag, and Delete
  inside the page.
- **Host option `roles.settings`**, the host's own choices of a role, listed under the roles. Exported:
  `RoleSetting`, `RoleBoxOptions` and `ApiError` (what a setting's `write` throws when a change is refused):

  ```ts
  roles: {
    groups,
    settings: [{
      key: 'creatorRole',
      word: 'admin.settings.creatorRole.word',
      note: 'admin.settings.creatorRole.note',
      read: async () => currentRoleId(),                       // '' for none
      write: async (roleId) => { await saveRoleId(roleId) },   // throws ApiError when refused
      saved: 'admin.settings.creatorRole.saved',                // given {role}
      holds: 'admin.settings.creatorRole.holds',                // given {role}: said when deleting that role is refused
      refused: 'admin.settings.creatorRole.refused',            // optional, given {role}: said when write throws a 400
    }],
  }
  ```

### Changed

- The register's area key is `people` (it was `configbyte-people`), so `/history?show=people` opens the register alone.
- The area closing each line is the word of its tick, and a service that does not answer is named by its area:
  *{area} is not answering…* and *Could not read the changes in {area} ({reason})…*, with the refusal's words, never its
  code. The words' placeholder is `{area}` (it was `{service}`).
- The register's section is called *People & access* in History and on Export & import whenever the host gives it no
  title.
- The list is drawn with the kit's page header, day list and state block.
- **People & access reads each list once a visit, and an act reads again only what it changed**: a person's acts the
  people; a role's Save the roles (and the people when its name changed); a role's delete the roles; a user type's Save
  the user types (and the people when its name changed); its delete and the corporate login the user types. The
  chart's positions are read when a person or the user types are first shown, the restricted fields when Roles first
  opens.
- **How many people hold a user type is counted from the people already read** (persons whose access is not revoked
  and whose own user type it is), not from the register's count, which includes services.
- The Users lead is the word `configbyte.people.users.lead` (it was `configbyte.people.lead`); the band's heading is
  *Nothing across the workspace yet ({n})* and its line says they may still hold something inside a product. New
  words are in English and Latvian; the Latvian is for a native speaker's read.
- A role's *shipped* and *made* lines, the corporate-login flag and the *New role* and *New user type* buttons are
  worded anew.

### Removed

- `HistorySource.chip` and the `configbyte.history.chips` words: a line's area is its tick's word.
- The *People* column and the *Acts* column of the user types list, with the words `types.columns.people`,
  `types.columns.acts`, `types.edit` and `types.form.edit`; Edit and Delete move into a user type's page.
- `configbyte.people.lead`, now `configbyte.people.users.lead`.

## v0.7.5

Built on `uibyte` `v0.16.0`, so a host that also uses the kit's newer options (a split view sized to its list; a
fold that goes back, keeps matches and draws rows) carries one copy of the kit. Nothing this package draws changes:
the kit's existing pieces draw what they drew before.

## v0.7.4

Built on `uibyte` `v0.15.0`, so a host that also uses the kit's newer pieces (a text field, a select, a file-pick
button, and their compact size and button look) carries one copy of the kit. Nothing this package draws changes:
the kit's existing pieces draw what they drew before.

## v0.7.3

Built on `uibyte` `v0.13.1`, the kit's fix that keeps the identity-code field from moving the form's button
when the box is left, so a host that uses that field carries one copy of the kit. Nothing this package draws
changes.

## v0.7.2

Built on `uibyte` `v0.13.0`, so a host that also uses the kit's newer pieces (an identity-code field, a segmented
choice) carries one copy of it. Nothing this package draws changes: the kit's existing pieces draw what they drew
before.

## v0.7.1

Built on `uibyte` `v0.12.0`, so a host that also uses the kit's newer pieces carries one copy of it. Nothing this
package draws changes: the kit's existing pieces draw what they drew before.

## v0.7.0

A language of one's own: a globe at the foot of the menu, and the choice kept for the person.

### Added

- **A globe at the foot of the menu, above the person's name**, and at the foot of the menu a phone opens. It names
  the language the page speaks in itself and lists every language the app carries, each in its own name, the
  deployment's marked *everyone here* (*visiem šeit*). Picking one changes the page at once, then keeps the choice for
  the person on the server, through the coordinator, so it is the same on every computer they sign in on:

  ```
  PUT /api/configbyte/v1/me/language   {"language": "lv"}
  → 200 {"locale": "lv", "personLocale": "lv", "deploymentLocale": "en"}
  ```

  The answer is what the page goes on with. Picking the language everyone here has is sent by its code like any
  other, and the coordinator keeps nothing of the person's own for it (`"personLocale": null`). A choice that cannot
  be kept, refused, failing or unanswered, puts back the language last kept and says *Changing the language did not
  complete. Try again.* under the globe. When picks cross, the latest decides what the page shows. A coordinator that does not know this request yet answers no
  `deploymentLocale`, so no language is marked, and refuses the change, so every pick is put back and said.
- **`useAdminSession().setLanguage(code)`**, the one place the language is set (`null` clears the person's own), for
  a host that offers the choice elsewhere too.
- **The document's `lang` follows the page's language**, before sign-in and after, so a screen reader reads the words
  in the language they are in.

### Changed

- **`Identity.presentation` carries `personLocale` and `deploymentLocale`** beside `locale`, as `GET /me` answers
  them: the person's own language (`null` when none) and the deployment's. `locale` is the person's own, else the
  deployment's, and is still what the frame speaks.

  ```json
  "presentation": { "displayName": "Kalns", "locale": "lv", "personLocale": "lv", "deploymentLocale": "en" }
  ```

- **Built on `uibyte` `v0.11.1`** (was `v0.10.0`). A host pins the same `uibyte` tag as these screens, so one copy is
  installed: move both pins together, then read the result back with `npm ls uibyte`. The new kit lets a menu open
  upward, sit on the dark menu, span its column and mark an item with a short word; the globe uses all four, and
  nothing else these screens draw changes.

The sign-in page, and the language it keeps in the browser, are unchanged: the globe in the frame never writes that
choice, so on a shared computer the next person's sign-in page does not open in this person's language.

## v0.6.0

Roles, user types and positions may carry names in other languages; the screens read them, and say a clash or a
change of them in plain words.

### Added

- **Names in other languages are read** wherever the membership register answers them: `labels`, a language's code
  and the name in it, beside `name`, on the roles list, the user types list, the chart's positions, and each member's
  roles and user types. The screens still show the name as entered and edit none of these; a Save leaves them as they
  are, and a register that answers no `labels` reads as before.

  ```json
  { "id": "…", "seed": "manager", "name": "Manager", "labels": { "lv": "Vadītājs" }, "description": "…", "permissions": [] }
  ```

- **A name refused because it reads like another's says which one, and in which language.** The register refuses a
  role's or a user type's Save with `409` when another of the same list is already called that name, or already
  reads that way in a language the app speaks. Where the name is how another reads in some language, the screen now
  says so — *«Vadītājs» is how the role «Manager» reads in Latvian.* — working it out from the list it already holds.
  A name another already has as entered, or a list that cannot tell, keeps *Another role is already called «…».* The
  same for user types. In English and Latvian.

### Changed

- **History says a change of a role's or a position's names in other languages as that** — *changed the names of the
  role «Manager» in other languages* — never *renamed the role «Manager» to «Manager»*. The register writes the
  rename line when the name or those names change, so a line whose name stayed (`from` equal to `to` for a role, to
  `name` for a position) is read that way; a real rename reads as before.

## v0.5.0

The same screens, on the newer kit.

### Changed

- **Built on `uibyte` `v0.10.0`** (was `v0.9.0`). A host pins the same `uibyte` tag as these screens, so one copy is
  installed: move both pins together, then read the result back with `npm ls uibyte`. The new kit adds a window for a
  short form over the page, a mark and a closing line on `FindField`'s list, an `OrderableList` row moved by its grip
  alone, and a `Menu` named for what it acts on; all of it is optional, and nothing these screens draw changes.

## v0.4.0

A sign-in that ends while someone works is one page, in place of a failure on every screen that was reading.

### Added

- **When a read is answered `401` while someone is signed in, the whole frame becomes the sign-in page**, saying
  *Your sign-in has ended. Sign in again.*, once, however many reads were out. Every read of these screens counts,
  the configuration download included. A `403` and every other failure stay where they happened; a change answered
  `401` is said in its own form, where what was typed still is. Signing in again with the card comes back to the
  screen that was open.
- **`useAdminSession().signInEnded()`**, for a host whose own screens make their own calls: call it when one of their
  reads is answered `401`, and the same page follows. It does nothing while nobody is signed in.

### Fixed

- **Someone signed in is no longer told *The admin app is not answering* when only the ways to sign in could not be
  read.** They work on, missing only the way's name beside their own; to someone not signed in it is still said, since
  without the ways there is no way in.

## v0.3.0

One sign-in page for every app of a deployment: the ways it offers, by their own names, in the person's language.

### Added

- **`SignInPage`, exported**, so the host's everyday app signs in on the same page as the admin app. It draws and
  calls nothing: the host gives its name, heading, lead, the ways and the languages, and runs the way chosen. With it
  come the helpers that read a `?error=` marker, settle the language before sign-in and carry the signed-out
  sentence across a sign-out, and the ID card's.
- **The ways to sign in come from the deployment** (`GET /login/ways`, which the coordinator must answer): one button
  per way, each carrying the way's own name exactly, in the deployment's order, and a sentence saying what each
  does. A deployment that offers none is told so.
- **A language menu before sign-in.** The page speaks the language chosen on it in this browser, else the browser's
  own, else the deployment's; a choice is kept in this browser.
- **A link to everyday work**, where the deployment names its address: on the sign-in page, on *Nothing here for
  you to configure*, and on the page for an address outside the allowed networks, which takes it from the refusal
  itself (`Link: <…>; rel="related"`) since nothing else answers from there. Only a web address is ever linked.
- **Not a member, said**: a person the sign-in authority knows but who is not a member of the workspace is told to
  ask its administrator for an invitation, whether they came back from the authority or used the card.
- **Signing out says what it did**, including that a company sign-in stays signed in on the computer; a sign-out that
  does not complete is said, and the person stays signed in.
- **The line for an ended sign-in**, *Your sign-in has ended. Sign in again.*, ready for the host to show.

### Changed

- **The sign-in page's heading is *Sign in to the admin app***, and the two pages that close the app (outside the
  allowed networks, a sign-in not strong enough) are drawn in its place, with the language menu. The second offers
  every way the deployment has, not the ID card alone, and *Back*.
- **Who signed in is said with the way's own name** (*signed in with eID*), never the method's code.
- **A failure to say who is signed in is *not answering***, never the sign-in page as if nobody were; *Try again*
  asks for the ways again too. The title is now *The admin app is not answering*.
- **A browser that cannot load the card library** is told the card software is not there, rather than that the
  admin app is not answering.
- Latvian in one voice: formal throughout, *pieslēgšanās* for signing in.
- **Built on `uibyte` `v0.9.0`** (was `v0.8.0`). A host pins the same `uibyte` tag as these screens, so one copy is
  installed: move both pins together, then read the result back with `npm ls uibyte`. The new kit adds a sixth status
  role, `closed`, and no longer means *done* by `ontrack`; nothing these screens draw changes look.

## v0.2.0

The admin app gains History and People & access, its sidebar is grouped, and it says plainly when it is closed to
someone.

### Added

- **History**: one list, newest first, of every change a person made to the workspace's setup, read from the
  membership register and from each service the host names, a page at a time, with nothing kept. A filter per
  stream, a person filter, the day each change happened on, *Show older*, and a sentence naming any service that
  does not answer. The register's lines and every owner's export and import lines are worded here, with the hashes
  that match a file in hand to them; the host words its own services' lines.
- **People & access**, on the membership register: **Users** (the people by what they hold, those signed in and
  given nothing yet, a user type each, roles across the workspace, the Administrator checkbox, taking away all
  access, the day each last signed in), **Roles** (a role's boxes in groups, a restricted field's own box, what a
  ticked field box hands out said before Save, new roles, deleting one) and **User types** (with what the corporate
  login gives). Every refusal in plain words, chosen by the act that was made.
- **Two pages for an admin app closed to someone**: the request came from outside the networks the deployment
  allows, or the sign-in was weaker than it asks for.
- New options for the host: `register`, `roles`, `history` and `words`; and an entry's `group`, `icon` and `locked`.

### Changed

- **The sidebar is grouped**: the shared screens first, then each group the host's screens name.
- **Who sees the frame** is anyone holding a scope the host marks as configuring a section, which is now meant to
  list a section's setup boxes and the administrator's box, not only its import box. A host that keeps listing only
  the import box changes nothing.

## v0.1.0

The first release: the shared screens of a deployment's admin app.

### Added

- **The frame**, on the shared design system's application shell: the deployment's name with the word *admin*
  beside it, the entries this deployment has, who is signed in and signing out. An entry shows when its screen was
  built into the app and the coordinator found its section's owner.
- **The sign-in page**: an ID card, read by the card software on the person's computer, or the provider's own
  sign-in page. A sign-in that came back unfinished says why.
- **Two states with no screen of their own**: someone signed in who configures nothing here is told so plainly, and a
  coordinator that does not answer is reported with *Try again*.
- **Export / Import**: the whole configuration downloaded as one file, and a file previewed, then applied exactly as
  previewed — all of it or none of it — with every outcome said in words.
- The host hands over its product's name, its sections' and parts' words, its Export card's lines and its own admin
  screens, and is told after an import that may have changed something.
- English and Latvian words for everything the screens say.
