import type { FeatureCollection, LineString } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { api } from '@/lib/api'
import { PLAN_COLORS } from '@/map/plants/strataColors'
import { toLngLat, type GridMeta } from '@/relief/grid'
import { loadHeights } from '@/relief/mapOverlay'
import { boxBlur } from '@/relief/station'
import type { ReliefOverview, TerrainGridData } from '@/types/relief'
import { contourInterval, gridContours, thinGrid } from './contours'

export const CONTOURS_SOURCE = 'drawn-contours'
export const CONTOUR_LINE_LAYER = 'drawn-contours-line'
export const CONTOUR_LABEL_LAYER = 'drawn-contours-label'

export type Contours = FeatureCollection<LineString, { level: number; master: boolean; label: string }>

/** Contours per grid version: switching the view off and on is instant. */
const cache = new Map<string, Promise<Contours | null>>()

/** The map's imported relief, or null when there is none yet (or no right to it). */
async function terrainGrid(mapId: number): Promise<TerrainGridData | null> {
  try {
    const overview = await api<ReliefOverview>(`/maps/${mapId}/terrain`)
    return overview.available && overview.terrain?.status === 'ready' ? overview.terrainGrid : null
  } catch {
    return null
  }
}

const MAX_SIDE = 320
const SMOOTHING_M = 3

/**
 * The contour lines of the map's own relief, as GeoJSON: every line in a
 * fine ink, every fifth darker with its altitude written along it. Null
 * when the map has no relief imported: the base plan then goes without.
 */
export async function loadContours(mapId: number): Promise<Contours | null> {
  // Asked each time the view is shown: a relief imported or redone since
  // brings its own lines, an unchanged one comes from the cache.
  const grid = await terrainGrid(mapId)
  if (!grid?.files.grid) return null
  const key = `${mapId}:${grid.version}`
  let pending = cache.get(key)
  if (!pending) {
    pending = (async () => {
      const raw = await loadHeights(grid)
      // Let the editor paint first: tracing takes a moment on a large relief.
      await new Promise((resolve) => setTimeout(resolve, 50))
      const thin = thinGrid(raw, grid.cols, grid.rows, MAX_SIDE)
      const cellM = grid.cellSizeM * thin.step
      const heights = boxBlur(thin.heights, thin.cols, thin.rows, Math.max(1, Math.round(SMOOTHING_M / cellM)))
      // The box blur spreads no data at the grid's edges: put the holes back.
      for (let i = 0; i < heights.length; i++) if (Number.isNaN(thin.heights[i])) heights[i] = Number.NaN
      let min = Infinity
      let max = -Infinity
      for (const z of heights) {
        if (Number.isNaN(z)) continue
        min = Math.min(min, z)
        max = Math.max(max, z)
      }
      const interval = contourInterval(max - min)
      const meta: GridMeta = { west: grid.west, north: grid.north, step: grid.step, cols: grid.cols, rows: grid.rows, cellSizeM: grid.cellSizeM }
      const offset = (thin.step - 1) / 2
      const features = gridContours(heights, thin.cols, thin.rows, interval).map((line) => ({
        type: 'Feature' as const,
        properties: { level: line.level, master: line.master, label: `${formatLevel(line.level)} m` },
        geometry: {
          type: 'LineString' as const,
          coordinates: line.points.map(([c, r]) => toLngLat(meta, { x: (c * thin.step + offset) * grid.cellSizeM, y: (r * thin.step + offset) * grid.cellSizeM })),
        },
      }))
      return { type: 'FeatureCollection' as const, features }
    })().catch(() => null)
    pending.then((result) => { if (!result) cache.delete(key) })
    cache.set(key, pending)
  }
  return pending
}

function formatLevel(level: number): string {
  return String(Number(level.toFixed(2))).replace('.', ',')
}

/**
 * Lays the contour lines just above the paper, under the sketches and the
 * plan. Idempotent; hides them while the drawn view is off.
 */
export function installContours(map: MapLibreMap, data: Contours | null, on: boolean, before: string | undefined) {
  const visibility = on && data ? 'visible' : 'none'
  if (!map.getSource(CONTOURS_SOURCE)) {
    if (!data) return
    map.addSource(CONTOURS_SOURCE, { type: 'geojson', data })
  } else if (data) {
    const source = map.getSource(CONTOURS_SOURCE) as GeoJSONSource & { _drawnData?: unknown }
    if (source._drawnData !== data) {
      source.setData(data)
      source._drawnData = data
    }
  }
  if (!map.getLayer(CONTOUR_LINE_LAYER)) {
    map.addLayer({
      id: CONTOUR_LINE_LAYER,
      type: 'line',
      source: CONTOURS_SOURCE,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': PLAN_COLORS.ink,
        'line-width': ['case', ['get', 'master'], 1, 0.5],
        'line-opacity': ['case', ['get', 'master'], 0.55, 0.3],
      },
    }, before)
    map.addLayer({
      id: CONTOUR_LABEL_LAYER,
      type: 'symbol',
      source: CONTOURS_SOURCE,
      minzoom: 16,
      filter: ['==', ['get', 'master'], true],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 320,
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-keep-upright': true,
      },
      paint: { 'text-color': PLAN_COLORS.ink, 'text-halo-color': PLAN_COLORS.paper, 'text-halo-width': 2, 'text-opacity': 0.8 },
    }, before)
  } else if (before) {
    const order = map.getLayersOrder()
    if (order.indexOf(CONTOUR_LABEL_LAYER) > order.indexOf(before)) {
      map.moveLayer(CONTOUR_LINE_LAYER, before)
      map.moveLayer(CONTOUR_LABEL_LAYER, before)
    }
  }
  for (const id of [CONTOUR_LINE_LAYER, CONTOUR_LABEL_LAYER]) {
    if (map.getLayoutProperty(id, 'visibility') !== visibility) map.setLayoutProperty(id, 'visibility', visibility)
  }
}
