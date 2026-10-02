# Changelog

All notable changes to this package are recorded here. It follows [Keep a Changelog](https://keepachangelog.com/),
and the package is consumed as a pinned git tag.

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
