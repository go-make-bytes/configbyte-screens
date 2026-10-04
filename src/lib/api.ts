// The one place these screens talk to the network: the configuration coordinator,
// always same-origin, always with its session cookie. State-changing requests
// echo the anti-forgery token the coordinator minted into its readable cookie.

export const API_ROOT = '/api/configbyte/v1'

const CSRF_COOKIE = 'configbyte_csrf'
const CSRF_HEADER = 'X-CSRF-Token'

function csrfToken(): string {
  for (const part of document.cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === CSRF_COOKIE) return decodeURIComponent(rest.join('='))
  }

  return ''
}

/** A refused or failed call, carrying the stable code the coordinator answered with. */
export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** The refusal a response carries: its code, and the words meant for a person. */
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

  return new ApiError(resp.status, code, detail || `HTTP ${resp.status}`)
}

async function handle<T>(resp: Response): Promise<T> {
  if (!resp.ok) throw await refusalOf(resp)
  // An act that answers nothing has nothing to read.
  if (resp.status === 204) return undefined as T

  return (await resp.json()) as T
}

export async function get<T>(path: string): Promise<T> {
  return handle<T>(await fetch(path, { credentials: 'same-origin' }))
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

function send(method: string, body?: unknown): RequestInit {
  return {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: csrfToken() },
    body: body === undefined ? undefined : JSON.stringify(body),
  }
}

export async function post<T>(path: string, body?: unknown): Promise<T> {
  return handle<T>(await fetch(path, send('POST', body)))
}

export async function put<T>(path: string, body?: unknown): Promise<T> {
  return handle<T>(await fetch(path, send('PUT', body)))
}

export async function del<T>(path: string): Promise<T> {
  return handle<T>(await fetch(path, send('DELETE')))
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
      headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: csrfToken() },
      body: text,
    }),
  )
}
