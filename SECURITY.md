# Security policy

These are the shared screens of a deployment's admin app: sign-in, the frame, and carrying a workspace's
configuration out as one file and back in. They talk to one service, the configuration coordinator, and hold no
token and no secret: the browser keeps only the coordinator's session cookie. Every call is judged by the service it
reaches, so these screens are never where a permission is enforced — but they decide how a server's and a file's
words are rendered, and what a person is told happened.

Please report security problems privately. Do not open a public issue, pull request or discussion
for anything that could be exploited before a fix exists.

## How to report

Use **[private vulnerability reporting](https://github.com/go-make-bytes/configbyte-screens/security/advisories/new)**
on this repository. The report stays visible only to you and the maintainers until an advisory is
published, and it gives us one place to discuss and co-ordinate a fix with you.

Please include, as far as you can establish it:

- what the problem is, and what an attacker gains from it;
- the smallest set of steps that reproduces it — which screen, which answer, which file — and
  against which version or tag;
- whether it needs a particular host configuration;
- whether you have told anyone else, and whether a disclosure date already binds you.

## What happens next

- We acknowledge a report within **five working days**.
- We tell you whether we can reproduce it, and what we think its severity is, as soon as we know.
- We keep you updated while a fix is prepared, and we agree a disclosure date with you. Our default
  is to publish an advisory once a fix is available, and in any case within **90 days** of the
  report — earlier if the problem is already public or being exploited.
- We credit you in the advisory unless you would rather stay anonymous.

There is no bug-bounty programme. We are grateful anyway, and we say so publicly.

## What we consider most serious

- Any path where something a server answered, or a person's file carried, reaches the page as markup rather than
  text.
- A screen telling a person that something was applied, or that nothing was, when the coordinator's answer says
  otherwise — a person acts on what the screen says.
- A document sent other than exactly as the person's file holds it, or applied without the versions its preview
  answered.
- A request leaving these screens for anywhere but the coordinator on the same origin, a state-changing request
  without the anti-forgery token, or anything kept in the browser's storage.
- The ID card's library loaded from anywhere but the host's own origin, or the card's signed answer changed on its
  way to the coordinator.
- A build or packaging change that ships more than the documented file list, or that lets a postinstall or similar
  script run in a consumer's install.

Denial of service is not a meaningful class here. Reports about outdated dependencies are welcome
where you can show the vulnerable path is actually reachable in a consumer's build.

## Scope

This policy covers the code in this repository. It does not cover Vue, Vite, Tailwind CSS or the design system
(report those to their maintainers), the coordinator, or the applications that build these screens in.
Authorization and data access belong to the services each call reaches — a screen displaying something it was
answered is not a finding against this repository unless the *display* is the defect.

## Supported versions

Security fixes land on the most recent release. Older tags are not patched; if you are pinned to
one, the fix is to move forward. This package is pre-1.0 and consumed as a pinned git tag: the API
may change between minor versions, and a security fix may arrive alongside such a change.
