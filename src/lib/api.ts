// The one place these screens talk to the network: the configuration coordinator,
// always same-origin, always with its session cookie. State-changing requests
// echo the anti-forgery token the coordinator minted into its readable cookie.

import { isOtherWorkspace, workspaceHeaders, workspaceMoved } from './workspace'

export const API_ROOT = '/api/configbyte/v1'

/**
 * What a call may ask of the client beyond its address and body. `unscoped` marks a call
 * that asks where the person is, which never names the workspace the page was opened for.
 */
export interface CallOptions {
  unscoped?: boolean
}

const CSRF_COOKIE = 'configbyte_csrf'
const CSRF_HEADER = 'X-CSRF-Token'

function cookie(cookies: string, name: string): string | null {
  // A page's cookies are joined by "; ", and only that space is dropped: trim() would also drop the Unicode
  // spaces a browser keeps in a name, and a name that starts with one is not prefixed, so any host could set it.
  for (const part of cookies.split('; ')) {
    const [key, ...rest] = part.split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }

  return null
}

/**
 * The anti-forgery token in a page's cookies. The coordinator sets every cookie Secure
 * and so names this one `__Host-`, which only its own host can set; on an https page
 * only that name is read, so a copy another host planted under the plain name is never
 * echoed in its place. A page over plain http, where a development edge may use the
 * plain name, falls back to it.
 */
export function csrfFrom(cookies: string, secure: boolean): string {
  const own = cookie(cookies, `__Host-${CSRF_COOKIE}`)
  if (own !== null) return own
  if (secure) return ''

  return cookie(cookies, CSRF_COOKIE) ?? ''
}

function csrfToken(): string {
  return csrfFrom(document.cookie, location.protocol === 'https:')
}

/** The coordinator's code for a sign-in below the strength a part of the app asks for. */
export const ASSURANCE_TOO_LOW = 'err:session:assuranceTooLow'
/** The coordinator's code for a sign-in that is strong enough but older than a part of the app accepts. */
export const SIGN_IN_TOO_OLD = 'err:session:signInTooOld'

/** A refused or failed call, carrying the stable code the coordinator answered with. */
export class ApiError extends Error {
  status: number
  code: string
  /** Where the refusal points instead, when it carries a related link. */
  related: string

  constructor(status: number, code: string, message: string, related = '') {
    super(message)
    this.status = status
    this.code = code
    this.related = related
  }
}

/** Whether a failure is the refusal that carries this status and code. */
export function isRefusal(e: unknown, status: number, code: string): e is ApiError {
  return e instanceof ApiError && e.status === status && e.code === code
}

/** Whether a failure says the sign-in is too old for the part of the app that was asked. */
export function isSignInTooOld(e: unknown): e is ApiError {
  return isRefusal(e, 403, SIGN_IN_TOO_OLD)
}

/** Whether a failure says the sign-in is not the strongest kind the part of the app that was asked requires. */
export function isAssuranceTooLow(e: unknown): e is ApiError {
  return isRefusal(e, 403, ASSURANCE_TOO_LOW)
}

/** The address a `Link` header names as related (`<…>; rel="related"`), if it names one. */
export function relatedLink(header: string | null): string {
  for (const part of (header ?? '').split(',')) {
    const link = /^\s*<([^>]*)>(.*)$/.exec(part)
    if (link && /;\s*rel="?related"?\s*(;|$)/i.test(link[2] ?? '')) return link[1] ?? ''
  }

  return ''
}

/**
 * The refusal a response carries: its code, and the words meant for a person. A call refused for naming
 * another workspace than the session's tells the page so, once, here: every refusal is read through this.
 */
export async function refusalOf(resp: Response): Promise<ApiError> {
  let code = ''
  let detail = ''
  try {
    const body = await resp.json()
    code = body.code ?? ''
    // The title is the message meant for a person; a detail only reaches us
    // when its emitter marked it safe to show.
    detail = body.detail ?? body.title ?? ''
  } catch {
    // A non-JSON body: the status alone carries the signal.
  }

  const refused = new ApiError(resp.status, code, detail || `HTTP ${resp.status}`, relatedLink(resp.headers.get('Link')))
  if (isOtherWorkspace(refused)) workspaceMoved()

  return refused
}

async function handle<T>(resp: Response): Promise<T> {
  if (!resp.ok) throw await refusalOf(resp)
  // An act that answers nothing has nothing to read.
  if (resp.status === 204) return undefined as T

  return (await resp.json()) as T
}

/** Who is told when a read finds the person no longer signed in. */
let signInEnded: () => void = () => {}

/**
 * Be told when a read is answered "not signed in". Every screen reads through
 * here, so the sign-in ending is noticed once, by whoever listens, instead of by
 * each screen that happened to be reading when it ended. Only a read: a change
 * refused that way stays in the form that made it, where what was typed still is.
 */
export function whenSignInEnds(listener: () => void): void {
  signInEnded = listener
}

/** A read, answered as it came — after telling whoever listens if it says nobody is signed in any more. */
export async function read(path: string, extra: Pick<RequestInit, 'cache'> & CallOptions = {}): Promise<Response> {
  const { unscoped, ...fetchOptions } = extra
  const headers = unscoped ? {} : workspaceHeaders()
  const resp = await fetch(path, { credentials: 'same-origin', ...fetchOptions, ...(Object.keys(headers).length ? { headers } : {}) })
  if (resp.status === 401) signInEnded()

  return resp
}

/** A read answered as a value. `extra` asks something of the fetch itself, such as `cache: 'no-store'`. */
export async function get<T>(path: string, extra: Pick<RequestInit, 'cache'> & CallOptions = {}): Promise<T> {
  return handle<T>(await read(path, extra))
}

/**
 * The address of a call to a section's owner, relayed by the coordinator under
 * the section's name. The path is passed as given; an id in it is escaped by
 * the caller with `segment`.
 */
export function relay(section: string, path: string): string {
  return `${API_ROOT}/sections/${encodeURIComponent(section)}/${path}`
}

/** One segment of a relayed path: an id, escaped so it stays one segment. */
export function segment(value: string): string {
  return encodeURIComponent(value)
}

function send(method: string, body?: unknown, options: CallOptions = {}): RequestInit {
  return {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: csrfToken(), ...(options.unscoped ? {} : workspaceHeaders()) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }
}

export async function post<T>(path: string, body?: unknown, options: CallOptions = {}): Promise<T> {
  return handle<T>(await fetch(path, send('POST', body, options)))
}

export async function put<T>(path: string, body?: unknown, options: CallOptions = {}): Promise<T> {
  return handle<T>(await fetch(path, send('PUT', body, options)))
}

export async function del<T>(path: string, options: CallOptions = {}): Promise<T> {
  return handle<T>(await fetch(path, send('DELETE', undefined, options)))
}

/**
 * A document sent exactly as it was given: a person's file, byte for byte. A
 * parse and re-serialise could round a large number or drop a repeated key, and
 * what is judged must be what is sent.
 */
export async function postText<T>(path: string, text: string): Promise<T> {
  return handle<T>(
    await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: csrfToken(), ...workspaceHeaders() },
      body: text,
    }),
  )
}
