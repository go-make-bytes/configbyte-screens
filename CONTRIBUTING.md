# Contributing

Thank you for considering a contribution. Bug reports, fixes and improvements are welcome. For
anything that could be exploited, use the private route in [SECURITY.md](SECURITY.md) — never a
public issue.

For anything larger than a small fix, please open an issue first and describe what you want to
change and why. These screens are built into several products' admin apps at once, so a change that
fights their shape is better redirected before it is written than after.

## Building and testing

The host application owns the toolchain; for working on the package itself you need Node at the
version in [.nvmrc](.nvmrc) and the lockfile's dependencies. The gate a change must pass is the
same one CI runs, and it is one script:

```sh
npm ci
npm run gate      # typecheck && test && build
```

Individually: `npm run typecheck` (`vue-tsc -b`), `npm run test` (`vitest run`), `npm run build`
(`vite build`).

One more thing CI shows on every run, and it is worth looking at:

```sh
npm pack --dry-run
```

That is the file list a consumer actually receives. A stray fixture or a missing entry is visible
there and nowhere else.

## What a change to this package needs

- **`src/hygiene.test.ts` is a guard, not a formality.** It fails the build on a product's name or
  vocabulary, and on references a reader of this repository cannot follow. If it fires, the fix is
  the code, not the test.
- **The screens name no product.** Whatever a product calls something arrives from the host, as a
  message key in the host's translator.
- **Every word in both languages.** `src/locales.test.ts` fails on a word missing from either.
- **Nothing a server answered or a file carried is rendered as markup.** A report's detail, a
  file's name, a refusal's words: all of it is text.
- **The frame is never the lock.** What it offers is display; the service a call reaches decides.
  A change must not make a person believe an action is theirs when the service will refuse it.
- **The screens talk to the coordinator alone**, same-origin, and keep nothing in the browser's
  storage. A document is sent exactly as the person's file holds it.
- **Accessibility is part of the change:** keyboard reachability, focus visibility and an accessible
  name.

## Proposing a change

- Work on a branch and open a pull request against `develop`, the default branch.
- **Sign off every commit.** This project uses the
  [Developer Certificate of Origin](https://developercertificate.org/): by adding a
  `Signed-off-by: Your Name <you@example.org>` line you certify that you wrote the change or
  otherwise have the right to submit it under this project's licence. `git commit -s` adds the line
  for you; the name and address must match the commit author. A pull request whose commits lack it
  fails the DCO check and cannot be merged.
- Keep the change focused: one concern per pull request.
- A change in behaviour comes with a test that fails without it.
- Match the style around you — naming, store shapes, comment density.
- Pull requests also run a dependency review. A new dependency needs a reason the existing ones
  cannot cover.

## Releases

This package is consumed as a **pinned git tag**, not from a registry, so the tag is the release.
Two things follow: the tag and the `version` in `package.json` must agree — CI fails the release if
they do not, because a mismatch makes every consumer's `npm ls` report the wrong version — and a
breaking change needs to be called out in the pull request, since consumers move by editing a pin.

## Licence

This project is licensed under the MIT License (see [LICENSE](LICENSE)). By submitting a
contribution you agree that it is provided under the same licence.
