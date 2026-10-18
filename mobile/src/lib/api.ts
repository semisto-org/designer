// Calls to the server with the app's bearer token. The server answers the
// app's own endpoints (/api/v1/…) and the map editor's JSON endpoints
// (/maps/:id/features…), the same ones the website uses.
import { accessToken } from './auth'
import { API_URL } from './config'

export class ApiError extends Error {
  constructor(public status: number, public body: Record<string, unknown> | null, message?: string) {
    super(message ?? (typeof body?.message === 'string' ? body.message : `HTTP ${status}`))
  }

  /** No answer at all (offline, timeout): worth retrying later. */
  get offline() { return this.status === 0 }
}

export type UploadFile = { uri: string; name: string; type: string }
type Body = Record<string, unknown> | FormData | undefined

type Options = { timeoutMs?: number; idempotencyKey?: string }

async function send(method: string, path: string, body: Body, token: string | null, { timeoutMs, idempotencyKey }: Options): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? (body instanceof FormData ? 120_000 : 20_000))
  try {
    return await fetch(`${API_URL}${path}`, { method, headers, body: payload, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * timeoutMs: how long to wait for the answer (a video upload needs far longer).
 * idempotencyKey: the server answers a second send of the same key with the
 * first answer instead of doing it twice (outbox retries).
 */
export async function api<T = unknown>(method: string, path: string, body?: Body, options: Options = {}): Promise<T> {
  let response: Response
  try {
    response = await send(method, path, body, await accessToken(), options)
    if (response.status === 401) {
      // Never resend without a token: a refused refresh stays a 401.
      const token = await accessToken({ force: true })
      if (token) response = await send(method, path, body, token, options)
    }
  } catch (error) {
    // Kept for « Envois »: a timeout, or what the phone said about the network.
    const cause = error instanceof Error ? (error.name === 'AbortError' ? 'timeout' : error.message) : 'offline'
    throw new ApiError(0, null, cause)
  }
  if (response.status === 204) return undefined as T
  const text = await response.text()
  let json: Record<string, unknown> | null = null
  try { json = text ? JSON.parse(text) : null } catch { json = null }
  if (!response.ok) throw new ApiError(response.status, json)
  return json as T
}

/** Multipart form with nested Rails keys: form('photo', { image: file, lat: 50.3 }). */
export function form(root: string, fields: Record<string, string | number | UploadFile | null | undefined>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue
    // React Native's FormData takes { uri, name, type } for files.
    data.append(`${root}[${key}]`, (typeof value === 'object' ? value : String(value)) as unknown as Blob)
  }
  return data
}
