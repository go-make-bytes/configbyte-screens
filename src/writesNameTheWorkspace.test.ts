// @vitest-environment node
// Every way these screens send a request, read off the source: the API client is the only place that
// does, and each of its calls that changes something names the workspace the page was opened for.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('.', import.meta.url))

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)

    return /\.(ts|vue)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : []
  })
}

const files = sources(SRC).map((path) => ({ name: relative(SRC, path), text: readFileSync(path, 'utf8') }))

describe('every way a request is sent', () => {
  it('only the API client calls fetch, and nothing uses another way to send', () => {
    expect(files.filter((f) => /\bfetch\(/.test(f.text)).map((f) => f.name)).toEqual(['lib/api.ts'])
    for (const way of ['XMLHttpRequest', 'sendBeacon', 'axios', 'WebSocket', 'EventSource']) {
      expect(files.filter((f) => f.text.includes(way)).map((f) => `${way}: ${f.name}`)).toEqual([])
    }
  })

  it('a form of these screens is answered by script and never submitted by the browser', () => {
    for (const f of files) {
      for (const form of f.text.match(/<form\b[^>]*>/g) ?? []) {
        expect({ file: f.name, form: /@submit\.prevent/.test(form) && !/\baction=/.test(form) }).toEqual({ file: f.name, form: true })
      }
    }
  })

  it('each fetch of the API client that is not a read names the workspace, unless the call asked for none', () => {
    const api = files.find((f) => f.name === 'lib/api.ts')!.text
    // Reads, posts, puts and deletes, and the text upload: five calls in all.
    expect(api.match(/\bfetch\(/g)?.length).toBe(5)
    // The shared request builder of post, put and del names the workspace unless the call is unscoped.
    const send = api.slice(api.indexOf('function send('), api.indexOf('export async function post<'))
    expect(send).toMatch(/options\.unscoped \? \{\} : workspaceHeaders\(\)/)
    // The text upload names it always.
    const upload = api.slice(api.indexOf('export async function postText'))
    expect(upload).toMatch(/\.\.\.workspaceHeaders\(\)/)
  })
})
