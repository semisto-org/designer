import { useSyncExternalStore } from 'react'
import { t } from '@/lib/i18n'
import { readPhotoMeta } from '@/map/photos/exif'
import { formatMegabytes } from '@/map/photos/format'
import { getPhotosState, photoActions } from '@/map/photos/store'
import type { MapPhotoData, PhotoLocationSource, PhotoSource } from '@/types/soil_photos'

export type UploadStatus = 'pending' | 'uploading' | 'done' | 'duplicate' | 'error'

export type UploadItem = {
  key: string
  name: string
  previewUrl: string
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
  /** Used when the photo has no GPS of its own (a click on the map, the feature's position). */
  fallbackPosition?: { lng: number; lat: number } | null
  /** Ask the phone for its position when the photo has none (camera button). */
  useDevicePosition?: boolean
  /** Left for the AI to read the wild plants in it (« Sol » panel). */
  bioindicatorStatus?: 'to_analyze'
}

const CONCURRENCY = 3
const EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i

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

/** A French reason this file cannot be sent, or null. Same rules as the server. */
export function rejectionFor(file: File): string | null {
  const { limits } = getPhotosState()
  if (!acceptedType(file, limits.contentTypes)) {
    return t('soil_photos.errors.not_an_image', { name: file.name, types: t('soil_photos.errors.types_label') })
  }
  if (file.size > limits.maxBytes) {
    return t('soil_photos.errors.too_large', { name: file.name, size: formatMegabytes(file.size), max: formatMegabytes(limits.maxBytes) })
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

/** POST with upload progress (fetch has none): a phone on 4G needs to see it move. */
function send(mapId: number, form: FormData, onProgress: (percent: number) => void): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/maps/${mapId}/photos`)
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.setRequestHeader('X-CSRF-Token', csrfToken())
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100))
    xhr.onerror = () => reject(new Error(t('soil_photos.errors.upload_failed')))
    xhr.ontimeout = xhr.onerror
    xhr.onload = () => {
      let body: Record<string, unknown> = {}
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        // Not JSON (proxy error page): handled below through the status.
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
    const meta = await readPhotoMeta(file)
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

    const form = new FormData()
    form.append('photo[image]', file)
    form.append('photo[source]', options.source ?? 'web')
    if (meta.takenAt) form.append('photo[taken_at]', meta.takenAt)
    if (meta.heading != null) form.append('photo[heading]', String(meta.heading))
    if (position && locationSource) {
      form.append('photo[lng]', String(position.lng))
      form.append('photo[lat]', String(position.lat))
      form.append('photo[location_source]', locationSource)
    }
    if (options.albumId) form.append('photo[photo_album_id]', String(options.albumId))
    if (options.featureId) form.append('photo[map_feature_id]', String(options.featureId))
    if (options.bioindicatorStatus) form.append('photo[bioindicator_status]', options.bioindicatorStatus)

    const { status, body } = await send(mapId, form, (progress) => patch(key, { progress }))
    // 200: a photo already on the map, sent again for the AI, comes back marked.
    if (status === 201 || status === 200) {
      const photo = body as unknown as MapPhotoData
      photoActions.upsert(photo)
      patch(key, { status: 'done', progress: 100, photo })
    } else {
      const message = typeof body.message === 'string' ? body.message : t('soil_photos.errors.upload_failed')
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
      const item: UploadItem = {
        key: `upload-${counter}`, name: file.name, previewUrl: reason ? '' : URL.createObjectURL(file),
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
