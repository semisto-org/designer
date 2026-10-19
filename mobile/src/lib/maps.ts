// Maps on the phone: the list and each map's bundle are cached on disk, so
// the app opens on the terrain without network; « Télécharger » also keeps
// the base map's tiles for the terrain (MapLibre offline pack).
import { OfflineManager, TransformRequestManager, type OfflinePackStatus } from '@maplibre/maplibre-react-native'
import { accessToken } from './auth'
import { api } from './api'
import { API_URL } from './config'
import { expandBbox } from './geo'
import { readJson, removeFile, writeJson } from './storage'
import type { AerialView, MapBundle, MapSummary } from './types'

export function styleUrl(mapId: number, { base, drone }: { base?: string; drone?: number | null } = {}): string {
  const query = [base ? `base=${encodeURIComponent(base)}` : null, drone ? `drone=${drone}` : null].filter(Boolean).join('&')
  return `${API_URL}/api/v1/maps/${mapId}/style${query ? `?${query}` : ''}`
}

/**
 * MapLibre fetches the style and tiles itself: it needs the token too. The
 * session calls this every few minutes, so the token MapLibre holds is
 * always valid for a quarter of an hour, even on a map left open.
 */
let headerId: string | null = null
export const MAP_TOKEN_MARGIN_MS = 15 * 60_000
export async function authorizeMapRequests(): Promise<void> {
  const token = await accessToken({ minValidityMs: MAP_TOKEN_MARGIN_MS })
  if (headerId) TransformRequestManager.removeHeader(headerId)
  headerId = token ? TransformRequestManager.addHeader({ match: `${API_URL}/api/`, name: 'Authorization', value: `Bearer ${token}` }) : null
}

export function cachedMaps(): MapSummary[] {
  return readJson<MapSummary[]>('maps.json') ?? []
}

export async function fetchMaps(): Promise<MapSummary[]> {
  const { maps } = await api<{ maps: MapSummary[] }>('GET', '/api/v1/maps')
  writeJson('maps.json', maps)
  return maps
}

export function cachedBundle(mapId: number): MapBundle | null {
  return readJson<MapBundle>(`map-${mapId}.json`)
}

export async function fetchBundle(mapId: number): Promise<MapBundle> {
  const bundle = await api<MapBundle>('GET', `/api/v1/maps/${mapId}`)
  writeJson(`map-${mapId}.json`, bundle)
  return bundle
}

// --- Offline tiles -------------------------------------------------------

const packId = (mapId: number) => `map-${mapId}`
const MIN_ZOOM = 12
const MAX_ZOOM = 19
const MARGIN_M = 150

// A whole farm at zoom 19 is far more than MapLibre's default (6000 tiles).
const TILE_COUNT_LIMIT = 100_000
let tileLimitSet = false

/** 'paused': a download stopped before the end (app closed, network lost); it has to be started again. */
export type DownloadState = { state: 'none' | 'active' | 'paused' | 'complete' | 'error'; percentage: number; bytes: number }

export async function downloadState(mapId: number): Promise<DownloadState> {
  const packs = await OfflineManager.getPacks()
  const pack = packs.find((p) => p.id === packId(mapId) || (p.metadata?.mapId === mapId && p.metadata?.aerialViewId == null))
  if (!pack) return { state: 'none', percentage: 0, bytes: 0 }
  // Read back later, an unfinished pack no longer downloads.
  return fromStatus(await pack.status(), 'paused')
}

function fromStatus(status: OfflinePackStatus, unfinished: 'active' | 'paused' = 'active'): DownloadState {
  return {
    state: status.state === 'complete' ? 'complete' : status.state === 'inactive' ? unfinished : 'active',
    percentage: Math.round(status.percentage),
    bytes: status.completedResourceSize,
  }
}

/** Downloads the bundle and the base map tiles around the terrain. */
export async function downloadMap(map: MapSummary, onProgress: (state: DownloadState) => void): Promise<void> {
  await fetchBundle(map.id)
  if (!map.bbox) return onProgress({ state: 'complete', percentage: 100, bytes: 0 })
  await authorizeMapRequests()
  if (!tileLimitSet) {
    OfflineManager.setTileCountLimit(TILE_COUNT_LIMIT)
    tileLimitSet = true
  }
  await removeDownload(map.id, { keepBundle: true })
  await new Promise<void>((resolve, reject) => {
    OfflineManager.createPack(
      { mapStyle: styleUrl(map.id), bounds: expandBbox(map.bbox!, MARGIN_M), minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, metadata: { mapId: map.id, name: map.name } },
      (_pack, status) => {
        const state = fromStatus(status)
        onProgress(state)
        if (state.state === 'complete') resolve()
      },
      (_pack, error) => {
        onProgress({ state: 'error', percentage: 0, bytes: 0 })
        reject(new Error(error.message))
      },
    ).catch(reject)
  })
}

/** Removes the map's download; downloading it again keeps its drone views. */
export async function removeDownload(mapId: number, { keepBundle = false } = {}): Promise<void> {
  const packs = await OfflineManager.getPacks()
  const ours = (p: { id: string; metadata?: Record<string, unknown> }) =>
    p.id === packId(mapId) || (p.metadata?.mapId === mapId && (!keepBundle || p.metadata?.aerialViewId == null))
  for (const pack of packs.filter(ours)) {
    await OfflineManager.deletePack(pack.id)
  }
  if (!keepBundle) removeFile(`map-${mapId}.json`)
}

// --- Drone views offline --------------------------------------------------

// MapLibre names packs itself: a drone view's pack is found by its metadata.
const isAerialPack = (mapId: number, viewId: number) => (p: { metadata?: Record<string, unknown> }) =>
  p.metadata?.mapId === mapId && p.metadata?.aerialViewId === viewId
// A drone view is sharp to a few centimetres: its own zooms, at most 22.
const AERIAL_MIN_ZOOM = 15
const AERIAL_MAX_ZOOM = 22

export async function aerialDownloadState(mapId: number, viewId: number): Promise<DownloadState> {
  const packs = await OfflineManager.getPacks()
  const pack = packs.find(isAerialPack(mapId, viewId))
  if (!pack) return { state: 'none', percentage: 0, bytes: 0 }
  return fromStatus(await pack.status(), 'paused')
}

/** Keeps one drone view of the map on the phone: its tiles over the view's area (or the terrain's). */
export async function downloadAerialView(map: MapSummary, view: AerialView, onProgress: (state: DownloadState) => void): Promise<void> {
  const area = view.bounds ? [view.bounds.west, view.bounds.south, view.bounds.east, view.bounds.north] as [number, number, number, number] : map.bbox
  if (!area) return onProgress({ state: 'complete', percentage: 100, bytes: 0 })
  await authorizeMapRequests()
  if (!tileLimitSet) {
    OfflineManager.setTileCountLimit(TILE_COUNT_LIMIT)
    tileLimitSet = true
  }
  await removeAerialDownload(map.id, view.id)
  const minZoom = Math.max(AERIAL_MIN_ZOOM, view.minZoom ?? AERIAL_MIN_ZOOM)
  const maxZoom = Math.min(AERIAL_MAX_ZOOM, Math.max(minZoom, view.maxZoom ?? 21))
  await new Promise<void>((resolve, reject) => {
    OfflineManager.createPack(
      {
        mapStyle: styleUrl(map.id, { drone: view.id }), bounds: expandBbox(area, 20), minZoom, maxZoom,
        metadata: { mapId: map.id, aerialViewId: view.id, name: view.name },
      },
      (_pack, status) => {
        const state = fromStatus(status)
        onProgress(state)
        if (state.state === 'complete') resolve()
      },
      (_pack, error) => {
        onProgress({ state: 'error', percentage: 0, bytes: 0 })
        reject(new Error(error.message))
      },
    ).catch(reject)
  })
}

export async function removeAerialDownload(mapId: number, viewId: number): Promise<void> {
  const packs = await OfflineManager.getPacks()
  for (const pack of packs.filter(isAerialPack(mapId, viewId))) await OfflineManager.deletePack(pack.id)
}
