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

  return (await resp.json()) as T
}

export async function get<T>(path: string): Promise<T> {
  return handle<T>(await fetch(path, { credentials: 'same-origin' }))
}

export async function post<T>(path: string, body?: unknown): Promise<T> {
  return handle<T>(
    await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: csrfToken() },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )
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
