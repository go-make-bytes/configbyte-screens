# Changelog

All notable changes to this package are recorded here. It follows [Keep a Changelog](https://keepachangelog.com/),
and the package is consumed as a pinned git tag.

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
