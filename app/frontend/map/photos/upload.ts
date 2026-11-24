import { useSyncExternalStore } from 'react'
import { reportUploadFailure } from '@/documents/uploadFailure'
import { sendInParts } from '@/drone/upload'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { trackWrite, writeOutcome } from '@/lib/saveStatus'
import { readPhotoMeta } from '@/map/photos/exif'
import { formatMegabytes } from '@/map/photos/format'
import { getPhotosState, photoActions } from '@/map/photos/store'
import type { MapPhotoData, PhotoLocationSource, PhotoMeta, PhotoSource } from '@/types/soil_photos'

export type UploadStatus = 'pending' | 'uploading' | 'done' | 'duplicate' | 'error'

export type UploadItem = {
  key: string
  name: string
  previewUrl: string
  /** A video: previewed with a <video> element. */
  video: boolean
  status: UploadStatus
  /** 0-100 while uploading. */
  progress: number
  message: string | null
  photo: MapPhotoData | null
}

export type UploadOptions = {
  source?: PhotoSource
  albumId?: number | null
  featureId?: number | null
  /** Taken at this soil sampling point. */
  soilSampleId?: number | null
  /** Called with the saved photo, even if the screen that sent it is gone. */
  onDone?: (photo: MapPhotoData) => void
  /** Used when the photo has no GPS of its own (a click on the map, the feature's position). */
  fallbackPosition?: { lng: number; lat: number } | null
  /** Ask the phone for its position when the photo has none (camera button). */
  useDevicePosition?: boolean
  /** Left for the AI to read the wild plants in it (« Sol » panel). */
  bioindicatorStatus?: 'to_analyze'
  /** Delivered by the pilot of this drone mission, from the mission's page. */
  droneMissionId?: number
}

const CONCURRENCY = 3
/**
 * A video heavier than this travels in parts (Maps::PhotoUploadsController):
 * one long request is cut by the proxies in front of the app well before a
 * few hundred MB arrive from a modest connection.
 */
const PARTS_ABOVE = 8 * 1024 * 1024
/** How often, and how long, to ask whether the parts became a photo. */
const PREPARE_POLL_MS = 2000
const PREPARE_WAIT_MS = 10 * 60 * 1000
const EXTENSIONS = /\.(jpe?g|png|webp|heic|heif|mp4|mov|webm)$/i
const VIDEO_EXTENSIONS = /\.(mp4|mov|webm)$/i
const NO_META: PhotoMeta = { lng: null, lat: null, heading: null, takenAt: null }

type Job = { item: UploadItem; file: File; mapId: number; options: UploadOptions }

let items: UploadItem[] = []
const jobs = new Map<string, Job>()
const waiting: string[] = []
let running = 0
let counter = 0
const listeners = new Set<() => void>()

function emit(next: UploadItem[]) {
  items = next
  listeners.forEach((listener) => listener())
}

function patch(key: string, changes: Partial<UploadItem>) {
  emit(items.map((item) => (item.key === key ? { ...item, ...changes } : item)))
  const job = jobs.get(key)
  if (job) job.item = { ...job.item, ...changes }
}

export function useUploads(): UploadItem[] {
  return useSyncExternalStore((listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, () => items)
}

function acceptedType(file: File, types: string[]): boolean {
  return file.type ? types.includes(file.type) : EXTENSIONS.test(file.name)
}

/** A video file (by its type, or its extension when the system gives none). */
export function isVideoFile(file: File): boolean {
  return file.type ? file.type.startsWith('video/') : VIDEO_EXTENSIONS.test(file.name)
}

/** A French reason this file cannot be sent, or null. Same rules as the server. */
export function rejectionFor(file: File): string | null {
  const { limits } = getPhotosState()
  if (!acceptedType(file, limits.contentTypes)) {
    return t('soil_photos.errors.not_a_media', { name: file.name, types: t('soil_photos.errors.media_types_label') })
  }
  const video = isVideoFile(file)
  const max = video ? limits.videoMaxBytes : limits.maxBytes
  if (file.size > max) {
    const key = video ? 'soil_photos.errors.video_too_large' : 'soil_photos.errors.too_large'
    return t(key, { name: file.name, size: formatMegabytes(file.size), max: formatMegabytes(max) })
  }
  return null
}

/** The phone's position now, or null (no permission, no fix within 8 s). */
export function devicePosition(): Promise<{ lng: number; lat: number } | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lng: position.coords.longitude, lat: position.coords.latitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    )
  })
}

function csrfToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? ''
}

/** What to tell the person when the server answers `status` without a message of its own. */
function statusMessage(status: number): string {
  if (status === 401) return t('soil_photos.errors.signed_out')
  if (status === 413) return t('soil_photos.errors.too_heavy_for_server')
  if (status === 502 || status === 503 || status === 504) return t('soil_photos.errors.server_cut', { status })
  if (status >= 400) return t('soil_photos.errors.server_refused', { status })
  return t('soil_photos.errors.upload_failed')
}

/** The message of an error met while sending in parts. */
function partsErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return typeof error.data.message === 'string' ? error.data.message : statusMessage(error.status)
  return t('soil_photos.errors.connection_lost')
}

type PartsState = { status: 'processing' | 'done' | 'failed'; photo?: MapPhotoData; message?: string }

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Sends a large video in parts, then waits while the server puts them
 * together and makes the photo. Resolves like `send` does.
 */
async function sendVideoInParts(
  mapId: number, file: File, fields: Record<string, string>, query: string, onProgress: (percent: number) => void,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const base = `/maps/${mapId}/photo_uploads`
  const endpoint = `${base}${query}`
  // Counted by the header's « Enregistré » from the announce to the last part.
  const finish = trackWrite()
  try {
    const { upload } = await api<{ upload: { id: number; partsUrl: string; partSize: number; partCount: number } }>(endpoint, {
      method: 'POST',
      body: { file: { filename: file.name, byte_size: file.size, content_type: file.type || 'video/mp4' } },
    })
    // The last few percent are for putting the parts together.
    const checksum = await sendInParts(file, upload, { onProgress: ({ sent, total }) => onProgress(Math.round((sent / total) * 95)) })
    let state = await api<PartsState>(`${base}/${upload.id}/complete`, { method: 'POST', body: { checksum, photo: fields } })
    const deadline = Date.now() + PREPARE_WAIT_MS
    while (state.status === 'processing') {
      if (Date.now() > deadline) {
        finish('ok')
        return { status: 202, body: { message: t('soil_photos.errors.still_preparing') } }
      }
      await pause(PREPARE_POLL_MS)
      state = await api<PartsState>(`${base}/${upload.id}`)
    }
    finish(state.status === 'done' ? 'ok' : 'rejected')
    if (state.status === 'done' && state.photo) return { status: 201, body: state.photo as unknown as Record<string, unknown> }
    return { status: 422, body: { message: state.message ?? t('soil_photos.errors.upload_failed') } }
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 0
    finish(error instanceof ApiError && status < 500 ? 'rejected' : 'lost')
    if (!(error instanceof ApiError && typeof error.data.message === 'string')) {
      reportUploadFailure({ endpoint, file, status, reason: status ? 'refused' : 'network', what: 'photo' })
    }
    throw new Error(partsErrorMessage(error))
  }
}

/** POST with upload progress (fetch has none): a phone on 4G needs to see it move. */
function send(url: string, form: FormData, onProgress: (percent: number) => void): Promise<{ status: number; body: Record<string, unknown> }> {
  // Counted by the header's « Enregistré »: a photo still on its way is not saved yet.
  const finish = trackWrite()
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.setRequestHeader('X-CSRF-Token', csrfToken())
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100))
    xhr.onerror = () => {
      finish('lost')
      reportUploadFailure({ endpoint: url, file: form.get('photo[image]') as File, status: 0, reason: 'network', what: 'photo' })
      reject(new Error(t('soil_photos.errors.connection_lost')))
    }
    xhr.ontimeout = xhr.onerror
    xhr.onload = () => {
      let body: Record<string, unknown> = {}
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        // Not JSON (proxy error page): handled below through the status.
      }
      finish(writeOutcome(xhr.status))
      if (xhr.status >= 400 && typeof body.message !== 'string') {
        reportUploadFailure({ endpoint: url, file: form.get('photo[image]') as File, status: xhr.status, reason: 'refused', what: 'photo' })
      }
      resolve({ status: xhr.status, body })
    }
    xhr.send(form)
  })
}

async function process(key: string) {
  const job = jobs.get(key)
  if (!job) return
  const { file, mapId, options } = job
  patch(key, { status: 'uploading', progress: 0, message: null })
  try {
    // A video's position and date are read on the server (ffprobe).
    const meta: PhotoMeta = isVideoFile(file) ? NO_META : await readPhotoMeta(file)
    let position = meta.lng != null && meta.lat != null ? { lng: meta.lng, lat: meta.lat } : null
    let locationSource: PhotoLocationSource | null = position ? 'exif' : null
    if (!position && options.useDevicePosition) {
      position = await devicePosition()
      if (position) locationSource = 'device'
    }
    if (!position && options.fallbackPosition) {
      position = options.fallbackPosition
      locationSource = 'map'
    }

    const fields: Record<string, string> = { source: options.source ?? 'web' }
    if (meta.takenAt) fields.taken_at = meta.takenAt
    if (meta.heading != null) fields.heading = String(meta.heading)
    if (position && locationSource) {
      fields.lng = String(position.lng)
      fields.lat = String(position.lat)
      fields.location_source = locationSource
    }
    if (options.albumId) fields.photo_album_id = String(options.albumId)
    if (options.featureId) fields.map_feature_id = String(options.featureId)
    if (options.soilSampleId) fields.soil_sample_id = String(options.soilSampleId)
    if (options.bioindicatorStatus) fields.bioindicator_status = options.bioindicatorStatus

    const query = options.droneMissionId ? `?drone_mission_id=${options.droneMissionId}` : ''
    const onProgress = (progress: number) => patch(key, { progress })
    let result: { status: number; body: Record<string, unknown> }
    if (isVideoFile(file) && file.size > PARTS_ABOVE) {
      result = await sendVideoInParts(mapId, file, fields, query, onProgress)
    } else {
      const form = new FormData()
      form.append('photo[image]', file)
      Object.entries(fields).forEach(([name, value]) => form.append(`photo[${name}]`, value))
      result = await send(`/maps/${mapId}/photos${query}`, form, onProgress)
    }
    const { status, body } = result
    // 200: a photo already on the map, sent again for the AI, comes back marked.
    if (status === 201 || status === 200) {
      const photo = body as unknown as MapPhotoData
      photoActions.upsert(photo)
      patch(key, { status: 'done', progress: 100, photo })
      options.onDone?.(photo)
    } else if (status === 202) {
      // Arrived, still being prepared: it shows up in the photos later.
      patch(key, { status: 'done', progress: 100, message: body.message as string })
    } else {
      const message = typeof body.message === 'string' ? body.message : statusMessage(status)
      patch(key, { status: body.code === 'duplicate' ? 'duplicate' : 'error', message })
    }
  } catch (error) {
    patch(key, { status: 'error', message: (error as Error).message || t('soil_photos.errors.upload_failed') })
  }
}

function pump() {
  while (running < CONCURRENCY && waiting.length > 0) {
    const key = waiting.shift() as string
    running += 1
    process(key).finally(() => {
      running -= 1
      pump()
    })
  }
}

export const uploadActions = {
  /** Queues files for upload; files that cannot be sent are listed with their reason. Returns their keys. */
  add(mapId: number, files: File[], options: UploadOptions = {}): string[] {
    const added: UploadItem[] = files.map((file) => {
      counter += 1
      const reason = rejectionFor(file)
        ?? (options.bioindicatorStatus && isVideoFile(file) ? t('soil_photos.errors.video_bioindicators') : null)
      const item: UploadItem = {
        key: `upload-${counter}`, name: file.name, previewUrl: reason ? '' : URL.createObjectURL(file), video: isVideoFile(file),
        status: reason ? 'error' : 'pending', progress: 0, message: reason, photo: null,
      }
      if (!reason) {
        jobs.set(item.key, { item, file, mapId, options })
        waiting.push(item.key)
      }
      return item
    })
    emit([...items, ...added])
    pump()
    return added.map((item) => item.key)
  },

  retry(key: string) {
    const job = jobs.get(key)
    if (!job) return
    patch(key, { status: 'pending', progress: 0, message: null })
    waiting.push(key)
    pump()
  },

  dismiss(key: string) {
    const item = items.find((i) => i.key === key)
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
    jobs.delete(key)
    const at = waiting.indexOf(key)
    if (at >= 0) waiting.splice(at, 1)
    emit(items.filter((i) => i.key !== key))
  },

  /** Removes everything that is finished (sent, duplicate or failed for good). */
  clearFinished() {
    items.filter((i) => i.status === 'done' || i.status === 'duplicate').forEach((i) => uploadActions.dismiss(i.key))
  },
}
