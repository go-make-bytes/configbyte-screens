# Changelog

All notable changes to this package are recorded here. It follows [Keep a Changelog](https://keepachangelog.com/),
and the package is consumed as a pinned git tag.

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
- **A link to everyday work**, where the deployment names its address: on the sign-in page and on *Nothing here for
  you to configure*.
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
