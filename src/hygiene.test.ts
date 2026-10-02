// @vitest-environment node
// Reads the source tree off disk, so it runs in node.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// These screens are shared by every product's admin app, and they stay shareable
// only while they know nothing about any one product: its name, its sections and
// its words all arrive from the host. Both rules below are checked here so they
// hold for anyone, including someone who has never read a word of our conventions.

const SRC = fileURLToPath(new URL('.', import.meta.url))
const SELF = 'hygiene.test.ts'

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      sourceFiles(path, out)
    } else if (/\.(ts|vue|css|json)$/.test(entry) && entry !== SELF) {
      out.push(path)
    }
  }
  return out
}

const files = sourceFiles(SRC)

/** Every line of every source file, tagged with where it came from. */
const lines = files.flatMap((path) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .map((text, i) => ({ where: `${path.slice(SRC.length)}:${i + 1}`, text })),
)

const offenders = (pattern: RegExp): string[] =>
  lines.filter((l) => pattern.test(l.text)).map((l) => `${l.where} — ${l.text.trim()}`)

describe('source hygiene', () => {
  it('scans a source tree that is actually there', () => {
    // Guards the guard: a broken walk would make every check below pass silently.
    expect(files.length).toBeGreaterThan(10)
  })

  // A product's name or noun in a name, a word or a comment means a screen was
  // never shared — it is one product's screen living in the wrong repo.
  it('names no product that uses these screens, and none of their vocabulary', () => {
    const product = /\b(flowbyte|ferrowise|signbyte|rolebyte|estimating|workforce|projects?|tasks?|envelope)\b/i
    expect(offenders(product)).toEqual([])
  })

  // The link between code and the decision behind it belongs in a record of its
  // own, never in a comment a stranger cannot resolve.
  it('refers to no document, decision or rule that a reader cannot see', () => {
    const internal = /\b(ADR[- ]?\d|CONVENTIONS|WORKSPACE\.md|INDEX\.md)\b|§|\b(feat|task|spec|bug):/i
    expect(offenders(internal)).toEqual([])
  })
})
