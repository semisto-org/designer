import SparkMD5 from 'spark-md5'
import { api, ApiError } from '@/lib/api'
import type { AerialImport } from '@/types/drone'

// Sends a drone view's file to the map, in parts: a GeoTIFF of a large
// estate weighs gigabytes, more than one request may carry. Each part is
// read once, hashed (Content-MD5, checked by the server) and added to the
// whole file's MD5, given at the end; up to PARALLEL parts travel at once,
// and a part that fails is sent again on its own.

const PARALLEL = 3
const RETRIES = 5

export type UploadProgress = { sent: number; total: number }

type Created = { aerialView: AerialImport; upload: { partsUrl: string; partSize: number; partCount: number } }

export class UploadAborted extends Error {}

function base64(binary: string): string {
  return btoa(binary)
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new UploadAborted())
    }, { once: true })
  })

async function sendPart(url: string, data: ArrayBuffer, md5: string, signal?: AbortSignal) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'PUT',
        body: data,
        signal,
        headers: { 'Content-Type': 'application/octet-stream', 'Content-MD5': md5 },
      })
      if (response.ok) return
      // A wrong size or an unknown upload will not get better by trying again.
      if (response.status < 500 && response.status !== 429) {
        throw new ApiError(response.status, await response.json().catch(() => ({})))
      }
    } catch (error) {
      if (signal?.aborted) throw new UploadAborted()
      if (error instanceof ApiError || attempt >= RETRIES) throw error
    }
    if (attempt >= RETRIES) throw new ApiError(503, {})
    await wait(1000 * 2 ** attempt, signal)
  }
}

/**
 * Sends a file announced to the server in parts (its parts URL, part size
 * and count) and resolves the whole file's MD5, in base64, for the call
 * that completes it. Also used for the files of a drone mission.
 */
export async function sendInParts(
  file: File,
  { partsUrl, partSize, partCount }: { partsUrl: string; partSize: number; partCount: number },
  { onProgress, signal }: { onProgress?: (p: UploadProgress) => void; signal?: AbortSignal } = {},
): Promise<string> {
  const whole = new SparkMD5.ArrayBuffer()
  const inFlight = new Set<Promise<void>>()
  let sent = 0
  onProgress?.({ sent, total: file.size })

  for (let number = 1; number <= partCount; number++) {
    if (signal?.aborted) throw new UploadAborted()
    const data = await file.slice((number - 1) * partSize, Math.min(number * partSize, file.size)).arrayBuffer()
    whole.append(data)
    const md5 = base64(SparkMD5.ArrayBuffer.hash(data, true))
    const part = sendPart(`${partsUrl}/${number}`, data, md5, signal).then(() => {
      sent += data.byteLength
      onProgress?.({ sent, total: file.size })
    })
    inFlight.add(part)
    part.finally(() => inFlight.delete(part)).catch(() => {})
    if (inFlight.size >= PARALLEL) await Promise.race(inFlight)
  }
  await Promise.all(inFlight)
  return base64(whole.end(true))
}

/**
 * Announces the file, sends it and asks for the view to be prepared.
 * Resolves the import (status "processing"); `onCreated` gets it as soon
 * as the server knows it, so the panel can list it while it travels.
 * `missionId`: the pilot of a drone mission delivers it on the client's map.
 */
export async function uploadAerialView(
  mapId: number,
  file: File,
  meta: { name: string; capturedOn: string; product?: string },
  { onCreated, onProgress, signal, missionId }: { onCreated?: (view: AerialImport) => void; onProgress?: (p: UploadProgress) => void; signal?: AbortSignal; missionId?: number } = {},
): Promise<AerialImport> {
  const query = missionId ? `?drone_mission_id=${missionId}` : ''
  const created = await api<Created>(`/maps/${mapId}/aerial_views${query}`, {
    method: 'POST',
    body: { aerial_view: { name: meta.name, captured_on: meta.capturedOn, ...(meta.product ? { product: meta.product } : {}) }, file: { filename: file.name, byte_size: file.size } },
    signal,
  })
  onCreated?.(created.aerialView)
  const checksum = await sendInParts(file, created.upload, { onProgress, signal })
  const done = await api<{ aerialView: AerialImport }>(`/maps/${mapId}/aerial_views/${created.aerialView.id}/complete${query}`, {
    method: 'POST',
    body: { checksum },
    signal,
  })
  return done.aerialView
}
