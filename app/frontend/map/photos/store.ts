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
  /** Photo waiting for a click on the map to be placed. */
  placingId: number | null
  /** The two photos of the before/after slider. */
  compare: { beforeId: number; afterId: number } | null
  showOnMap: boolean
  /** Bumped on every change: lets other lists (inspector) refresh. */
  version: number
}

const DEFAULT_LIMITS: PhotoLimits = { maxBytes: 25 * 1024 * 1024, contentTypes: ['image/jpeg', 'image/png', 'image/webp'] }

let state: PhotosState = {
  mapId: null, photos: [], albums: [], limits: DEFAULT_LIMITS, loaded: false, loading: false, error: null,
  openId: null, placingId: null, compare: null, showOnMap: readShowOnMap(), version: 0,
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
      set({ mapId, photos: [], albums: [], loaded: false, openId: null, placingId: null, compare: null })
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

  open(id: number | null) {
    set({ openId: id })
  },

  startPlacing(id: number) {
    set({ placingId: id, openId: null })
  },

  cancelPlacing() {
    set({ placingId: null })
  },

  openCompare(beforeId: number, afterId: number) {
    set({ compare: { beforeId, afterId }, openId: null })
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
