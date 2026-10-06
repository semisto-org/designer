// The relief on the 2D editor map: flow axes and hollows, or a hillshade,
// computed in the browser from the imported grid and laid on the map as an
// image source (the grid is a Mercator rectangle, so it fits exactly).
import type { Map as MapLibreMap, ImageSource } from 'maplibre-gl'
import type { TerrainGridData } from '@/types/relief'
import { imageCorners, type GridMeta } from './grid.ts'
import { analyzeDrainage, decodeGrid } from './hydro.ts'
import { drainageImage } from './overlay.ts'
import { hillshade, shadePixels } from './shade.ts'

export type MapOverlayMode = 'none' | 'flow' | 'shade'

export const RELIEF_OVERLAY_ID = 'relief-overlay'

// Rendered images per grid version and mode: switching back is instant.
const images = new Map<string, string>()
const grids = new Map<string, Promise<Float32Array>>()

function loadHeights(grid: TerrainGridData): Promise<Float32Array> {
  const url = grid.files.grid
  if (!url) return Promise.reject(new Error('grid unavailable'))
  let pending = grids.get(url)
  if (!pending) {
    pending = fetch(url, { credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) throw new Error(`grid: HTTP ${response.status}`)
        return response.arrayBuffer()
      })
      .then((buffer) => decodeGrid(buffer, { cols: grid.cols, rows: grid.rows, zMin: grid.zMin, zUnit: grid.zUnit, nodata: grid.nodata }))
    pending.catch(() => grids.delete(url))
    grids.set(url, pending)
  }
  return pending
}

async function renderImage(grid: TerrainGridData, mode: Exclude<MapOverlayMode, 'none'>): Promise<string> {
  const key = `${grid.files.grid}:${mode}`
  const cached = images.get(key)
  if (cached) return cached
  const heights = await loadHeights(grid)
  // Let the panel paint its "computing" state first.
  await new Promise((resolve) => setTimeout(resolve, 30))
  const meta: GridMeta = { west: grid.west, north: grid.north, step: grid.step, cols: grid.cols, rows: grid.rows, cellSizeM: grid.cellSizeM }
  const canvas = document.createElement('canvas')
  canvas.width = grid.cols
  canvas.height = grid.rows
  const context = canvas.getContext('2d')
  if (!context) throw new Error('no 2D canvas')
  if (mode === 'flow') {
    const drainage = analyzeDrainage(heights, grid.cols, grid.rows, grid.cellSizeM)
    context.putImageData(drainageImage(drainage, meta, { axes: true, hollows: true }), 0, 0)
  } else {
    const pixels = shadePixels(hillshade(heights, grid.cols, grid.rows, grid.cellSizeM))
    const image = new ImageData(grid.cols, grid.rows)
    image.data.set(pixels)
    context.putImageData(image, 0, 0)
  }
  const url = canvas.toDataURL('image/png')
  images.set(key, url)
  return url
}

export function removeReliefOverlay(map: MapLibreMap) {
  if (map.getLayer(RELIEF_OVERLAY_ID)) map.removeLayer(RELIEF_OVERLAY_ID)
  if (map.getSource(RELIEF_OVERLAY_ID)) map.removeSource(RELIEF_OVERLAY_ID)
}

/** Shows the chosen overlay under the map's features (idempotent). */
export async function showReliefOverlay(map: MapLibreMap, grid: TerrainGridData, mode: MapOverlayMode): Promise<void> {
  if (mode === 'none') return removeReliefOverlay(map)
  const url = await renderImage(grid, mode)
  const coordinates = imageCorners(grid)
  const source = map.getSource(RELIEF_OVERLAY_ID) as ImageSource | undefined
  if (source) {
    source.updateImage({ url, coordinates })
  } else {
    map.addSource(RELIEF_OVERLAY_ID, { type: 'image', url, coordinates })
  }
  if (!map.getLayer(RELIEF_OVERLAY_ID)) {
    const before = ['boundary-fill', 'boundary-casing', 'boundary-line', 'features-fill'].find((id) => map.getLayer(id))
    map.addLayer({
      id: RELIEF_OVERLAY_ID,
      type: 'raster',
      source: RELIEF_OVERLAY_ID,
      paint: { 'raster-opacity': 0.9, 'raster-resampling': mode === 'flow' ? 'nearest' : 'linear', 'raster-fade-duration': 0 },
    }, before)
  } else {
    map.setPaintProperty(RELIEF_OVERLAY_ID, 'raster-resampling', mode === 'flow' ? 'nearest' : 'linear')
  }
}
