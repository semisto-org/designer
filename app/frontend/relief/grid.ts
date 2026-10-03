// Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)
//
// The relief grid and the map: EPSG:3857 grid ↔ WGS84, in metres on the
// ground (x east from the first column, y SOUTH from the first row). No
// import.

import type { Geometry, Position } from 'geojson'

const EARTH_RADIUS = 6378137

/** What the browser needs to place the grid (see MapTerrain#as_grid). */
export type GridMeta = {
  west: number
  north: number
  step: number
  cols: number
  rows: number
  cellSizeM: number
}

export function toMercator(lng: number, lat: number): [number, number] {
  return [EARTH_RADIUS * (lng * Math.PI) / 180, EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))]
}

export function fromMercator(x: number, y: number): [number, number] {
  const lng = (x / EARTH_RADIUS) * 180 / Math.PI
  const lat = (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) * 180 / Math.PI
  return [lng, lat]
}

/** Ground metres on the grid of a WGS84 position. */
export function toGrid(meta: GridMeta, [lng, lat]: Position): { x: number; y: number } {
  const [mx, my] = toMercator(lng, lat)
  return { x: ((mx - meta.west) / meta.step) * meta.cellSizeM, y: ((meta.north - my) / meta.step) * meta.cellSizeM }
}

export function toLngLat(meta: GridMeta, { x, y }: { x: number; y: number }): [number, number] {
  const mx = meta.west + (x / meta.cellSizeM) * meta.step
  const my = meta.north - (y / meta.cellSizeM) * meta.step
  const [lng, lat] = fromMercator(mx, my)
  return [Number(lng.toFixed(7)), Number(lat.toFixed(7))]
}

/**
 * Corners of the grid's cell area (cell centres ± half a cell) as MapLibre
 * image-source coordinates: top-left, top-right, bottom-right, bottom-left.
 * The grid is a Mercator rectangle, so an image source lies on it exactly.
 */
export function imageCorners(meta: GridMeta): [[number, number], [number, number], [number, number], [number, number]] {
  const half = meta.step / 2
  const west = meta.west - half
  const east = meta.west + (meta.cols - 1) * meta.step + half
  const north = meta.north + half
  const south = meta.north - (meta.rows - 1) * meta.step - half
  return [fromMercator(west, north), fromMercator(east, north), fromMercator(east, south), fromMercator(west, south)]
}

/** Every ring of a (multi)polygon, in grid metres. */
export function polygonRings(meta: GridMeta, geometry: Geometry | null | undefined): Array<Array<{ x: number; y: number }>> {
  if (!geometry) return []
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates : []
  return polygons.flatMap((polygon) => polygon.map((ring) => ring.map((p) => toGrid(meta, p))))
}

/**
 * Cells (at `factor` × the grid's cell) whose centre lies inside a
 * (multi)polygon, by even-odd scanlines. `null` geometry → every cell.
 */
export function polygonMask(meta: GridMeta, geometry: Geometry | null | undefined, factor = 1): Uint8Array {
  const cols = Math.floor(meta.cols / factor)
  const rows = Math.floor(meta.rows / factor)
  const mask = new Uint8Array(cols * rows)
  const rings = polygonRings(meta, geometry)
  if (!rings.length) return mask.fill(1)
  const size = meta.cellSizeM * factor
  // A block's centre, in grid metres: (c + 0.5) · size − half a fine cell.
  const offset = size / 2 - meta.cellSizeM / 2
  for (let r = 0; r < rows; r++) {
    const y = r * size + offset
    const xs: number[] = []
    for (const ring of rings) {
      for (let k = 0; k < ring.length - 1; k++) {
        const a = ring[k]
        const b = ring[k + 1]
        if (a.y === b.y) continue
        if (y >= Math.min(a.y, b.y) && y < Math.max(a.y, b.y)) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y))
      }
    }
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const first = Math.max(0, Math.ceil((xs[k] - offset) / size))
      const last = Math.min(cols - 1, Math.floor((xs[k + 1] - offset) / size))
      for (let c = first; c <= last; c++) mask[r * cols + c] = 1
    }
  }
  return mask
}
