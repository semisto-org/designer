// Calls to the server with the app's bearer token. The server answers the
// app's own endpoints (/api/v1/…) and the map editor's JSON endpoints
// (/maps/:id/features…), the same ones the website uses.
import { File, UploadType } from 'expo-file-system'
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

/**
 * A form with one file, sent from the disk by the phone itself (streamed,
 * so a 1 GB video never sits in memory). Expo's fetch (SDK 57) refuses
 * React Native's { uri, name, type } form parts: « Unsupported FormDataPart
 * implementation ».
 */
export type Multipart = { fields: Record<string, string>; file: { key: string; uri: string; type: string } | null }

type Body = Record<string, unknown> | FormData | Multipart | undefined

type Options = { timeoutMs?: number; idempotencyKey?: string }

type Answer = { status: number; text: () => Promise<string> }

const isMultipart = (body: Body): body is Multipart => !!body && !(body instanceof FormData) && 'fields' in body && 'file' in body

async function send(method: string, path: string, body: Body, token: string | null, { timeoutMs, idempotencyKey }: Options): Promise<Answer> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? (body instanceof FormData || isMultipart(body) ? 120_000 : 20_000))
  try {
    if (isMultipart(body) && body.file) {
      const result = await new File(body.file.uri).upload(`${API_URL}${path}`, {
        httpMethod: method as 'POST' | 'PUT' | 'PATCH', uploadType: UploadType.MULTIPART, headers,
        fieldName: body.file.key, mimeType: body.file.type, parameters: body.fields,
        sessionType: 'foreground', signal: controller.signal,
      })
      return { status: result.status, text: async () => result.body }
    }
    let payload: BodyInit | undefined
    if (body instanceof FormData) payload = body
    else if (isMultipart(body)) payload = multipartWithoutFile(body)
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      payload = JSON.stringify(body)
    }
    return await fetch(`${API_URL}${path}`, { method, headers, body: payload, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function multipartWithoutFile({ fields }: Multipart): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

/**
 * timeoutMs: how long to wait for the answer (a video upload needs far longer).
 * idempotencyKey: the server answers a second send of the same key with the
 * first answer instead of doing it twice (outbox retries).
 */
export async function api<T = unknown>(method: string, path: string, body?: Body, options: Options = {}): Promise<T> {
  let response: Answer
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
  if (response.status < 200 || response.status >= 300) throw new ApiError(response.status, json)
  return json as T
}

/** Multipart form with nested Rails keys and at most one file: form('photo', { image: file, lat: 50.3 }). */
export function form(root: string, fields: Record<string, string | number | UploadFile | null | undefined>): Multipart {
  const multipart: Multipart = { fields: {}, file: null }
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue
    if (typeof value === 'object') multipart.file = { key: `${root}[${key}]`, uri: value.uri, type: value.type }
    else multipart.fields[`${root}[${key}]`] = String(value)
  }
  return multipart
}

/**
 * Several photos in one form (Pl@ntNet takes up to five), read into memory:
 * Expo's fetch sends a file part only when it can read its bytes.
 */
export function photosForm(key: string, uris: string[], lists: Record<string, string[]> = {}): FormData {
  const data = new FormData()
  uris.forEach((uri) => data.append(key, new File(uri) as unknown as Blob))
  Object.entries(lists).forEach(([name, values]) => values.forEach((value) => data.append(name, value)))
  return data
}
