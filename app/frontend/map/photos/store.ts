import { useSyncExternalStore } from 'react'
import { api } from '@/lib/api'
import { photoDate } from '@/map/photos/format'
import type { MapPhotoData, PhotoAlbumData, PhotoLimits, PhotosResponse } from '@/types/soil_photos'

/**
 * Photos of the open map, shared by the « Photos » panel, the markers on the
 * map, the lightbox and the inspector section (they live in different parts
 * of the editor and cannot share React state). One map is open at a time.
 */
export type PhotosState = {
  mapId: number | null
  photos: MapPhotoData[]
  albums: PhotoAlbumData[]
  limits: PhotoLimits
  loaded: boolean
  loading: boolean
  error: string | null
  /** Photo shown in the lightbox. */
  openId: number | null
  /** Photos of the group opened from the map: the lightbox moves through these only. */
  group: number[] | null
  /** Photo waiting for a click on the map to be placed. */
  placingId: number | null
  /** The two photos of the before/after slider. */
  compare: { beforeId: number; afterId: number } | null
  showOnMap: boolean
  /** Bumped on every change: lets other lists (inspector) refresh. */
  version: number
}

const DEFAULT_LIMITS: PhotoLimits = {
  maxBytes: 25 * 1024 * 1024,
  videoMaxBytes: 1024 * 1024 * 1024,
  contentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence',
    'video/mp4', 'video/quicktime', 'video/webm'],
  videoTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
}

/** For a file input: the accepted types, plus the HEIC and MOV extensions (some systems give those files no type). */
export const photoAccept = (contentTypes: string[]) => [...contentTypes, '.heic', '.heif', '.mov', '.mp4'].join(',')

let state: PhotosState = {
  mapId: null, photos: [], albums: [], limits: DEFAULT_LIMITS, loaded: false, loading: false, error: null,
  openId: null, group: null, placingId: null, compare: null, showOnMap: readShowOnMap(), version: 0,
}
const listeners = new Set<() => void>()

function readShowOnMap(): boolean {
  try {
    return window.localStorage.getItem('designer.photos.showOnMap') !== 'false'
  } catch {
    return true
  }
}

function set(patch: Partial<PhotosState>) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePhotos(): PhotosState {
  return useSyncExternalStore(subscribe, () => state)
}

export function getPhotosState(): PhotosState {
  return state
}

const byDate = (a: MapPhotoData, b: MapPhotoData) =>
  photoDate(b).getTime() - photoDate(a).getTime() || b.id - a.id

export const photoActions = {
  /** Loads the photos of a map (once; `force` reloads). */
  async load(mapId: number, force = false) {
    if (state.mapId === mapId && (state.loaded || state.loading) && !force) return
    if (state.mapId !== mapId) {
      set({ mapId, photos: [], albums: [], loaded: false, openId: null, group: null, placingId: null, compare: null })
    }
    set({ loading: true, error: null })
    try {
      const data = await api<PhotosResponse>(`/maps/${mapId}/photos`)
      if (state.mapId !== mapId) return
      set({ photos: data.photos, albums: data.albums, limits: data.limits, loaded: true, loading: false })
    } catch (error) {
      set({ loading: false, error: (error as Error).message })
    }
  },

  upsert(photo: MapPhotoData) {
    const others = state.photos.filter((p) => p.id !== photo.id)
    set({ photos: [...others, photo].sort(byDate), version: state.version + 1 })
    photoActions.refreshAlbumCounts()
  },

  remove(id: number) {
    set({
      photos: state.photos.filter((p) => p.id !== id), version: state.version + 1,
      openId: state.openId === id ? null : state.openId,
      group: state.group?.filter((other) => other !== id) ?? null,
      compare: state.compare && (state.compare.beforeId === id || state.compare.afterId === id) ? null : state.compare,
    })
    photoActions.refreshAlbumCounts()
  },

  setAlbums(albums: PhotoAlbumData[]) {
    set({ albums })
    photoActions.refreshAlbumCounts()
  },

  refreshAlbumCounts() {
    const counts = new Map<number, number>()
    state.photos.forEach((p) => p.albumId && counts.set(p.albumId, (counts.get(p.albumId) ?? 0) + 1))
    set({ albums: state.albums.map((a) => ({ ...a, photosCount: counts.get(a.id) ?? 0 })) })
  },

  /** Opens one photo; moving within the open group keeps it, anything else leaves it. */
  open(id: number | null) {
    set({ openId: id, group: id != null && state.group?.includes(id) ? state.group : null })
  },

  /** Opens the photos of a group from the map, in the order of the photo list. */
  openGroup(ids: number[]) {
    const group = state.photos.filter((p) => ids.includes(p.id)).map((p) => p.id)
    if (group.length > 0) set({ openId: group[0], group })
  },

  startPlacing(id: number) {
    set({ placingId: id, openId: null, group: null })
  },

  cancelPlacing() {
    set({ placingId: null })
  },

  openCompare(beforeId: number, afterId: number) {
    set({ compare: { beforeId, afterId }, openId: null, group: null })
  },

  closeCompare() {
    set({ compare: null })
  },

  setShowOnMap(value: boolean) {
    try {
      window.localStorage.setItem('designer.photos.showOnMap', String(value))
    } catch {
      // Private mode: the choice just does not persist.
    }
    set({ showOnMap: value })
  },
}
