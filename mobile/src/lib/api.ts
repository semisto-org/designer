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

async function send(method: string, path: string, body: Body, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), body instanceof FormData ? 120_000 : 20_000)
  try {
    return await fetch(`${API_URL}${path}`, { method, headers, body: payload, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function api<T = unknown>(method: string, path: string, body?: Body): Promise<T> {
  let response: Response
  try {
    response = await send(method, path, body, await accessToken())
    if (response.status === 401) response = await send(method, path, body, await accessToken({ force: true }))
  } catch {
    throw new ApiError(0, null, 'offline')
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
