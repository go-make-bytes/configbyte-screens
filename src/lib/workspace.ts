// The workspace a page was opened for.
//
// A person may belong to several workspaces and be signed in to one at a time, in
// every tab of the browser. A page that stayed open while the person moved to
// another workspace in a second tab must not go on acting in the new one under the
// old one's words, so every call a page makes names the workspace the page was
// opened for, and the coordinator refuses a call that names another.
//
// The value is held in memory for the life of the page, never in a browser storage:
// loading the page again is what lets it change.

/** The header that names the workspace a call is meant for. */
export const WORKSPACE_HEADER = 'Workspace-Id'

/** The coordinator's code for a call that names another workspace than the one the session is in. */
export const OTHER_WORKSPACE = 'err:session:otherWorkspace'

interface Opened {
  id: string
  name: string
}

let opened: Opened | null = null
const listeners = new Set<() => void>()

/**
 * Remember the workspace the page was opened for. Only the first one counts: it is
 * set the first time the sign-in answer names a workspace and never changes after.
 */
export function openedFor(id: string, name = ''): void {
  if (!opened && id) opened = { id, name }
}

/** The workspace the page was opened for, with its name; null while none is known. */
export function workspaceOpenedFor(): Readonly<Opened> | null {
  return opened
}

/** Forget the workspace the page was opened for, as loading the page again does. For a host's own tests: a page load starts with none. */
export function forgetOpenedWorkspace(): void {
  opened = null
}

/** The header every call carries, or nothing while the page was opened for no workspace. */
export function workspaceHeaders(): Record<string, string> {
  return opened ? { [WORKSPACE_HEADER]: opened.id } : {}
}

/**
 * Whether a thrown value is the coordinator's refusal of a call that named another workspace than the
 * session's: anything carrying status 409 and that code, so a host's own error type is recognised too.
 */
export function isOtherWorkspace(e: unknown): e is { status: 409; code: typeof OTHER_WORKSPACE } {
  if (typeof e !== 'object' || e === null) return false
  const found = e as { status?: unknown; code?: unknown }

  return found.status === 409 && found.code === OTHER_WORKSPACE
}

/**
 * Be told when a call was refused for naming another workspace than the session's.
 * Every call goes through the client, so the page is told once, by whoever listens,
 * instead of by each screen whose call was refused. Any number may listen; the answer
 * is a function that removes this listener.
 */
export function whenWorkspaceMoves(listener: () => void): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

/** Tell every listener a call was refused that way: the client does, and so does a host whose own client meets the refusal. */
export function workspaceMoved(): void {
  for (const listener of [...listeners]) listener()
}
